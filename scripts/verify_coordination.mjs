// Pillar 6 Acceptance — Exact Clash + Dependency Coordination
//
// Drives the whole chain on a real extension project created through the CommandBus:
//   1. dependency graph + cascade/demolish impact
//   2. exact narrow-phase contact between a new water route and an existing beam
//   3. versioned rule provenance and per-project overrides
//   4. overlay planning used by the plan/elevation canvases
//   5. atomic undo/redo across mutation + settings commands
//
// Run: npm run verify:coordination

import assert from "node:assert/strict";
import { CommandBus, ProjectCommandSession } from "../packages/command-runtime/dist/index.js";
import {
  analyzeDependencyImpact,
  buildDependencyGraph,
  cascadeDeletionSet,
  serializeProject,
} from "../packages/project-model/dist/index.js";
import { analyzeProjectSpatialBounds } from "../packages/clash-engine/dist/index.js";
import {
  runCoordination,
  THAI_COORDINATION_RULES_V1,
} from "../packages/clash-engine/dist/index.js";
import { createKitchenProofProject } from "../packages/extension-engine/dist/index.js";
import { planCoordinationOverlay } from "../apps/plan-editor/src/coordinationOverlayPlan.mjs";

let checks = 0;
const check = (label, condition, detail = "") => {
  checks += 1;
  assert.ok(condition, `${label}${detail ? ` — ${detail}` : ""}`);
};
const close = (label, actual, expected, tolerance) =>
  check(
    label,
    Math.abs(actual - expected) <= tolerance,
    `expected ${expected} ± ${tolerance}, got ${actual}`,
  );

// ---------------------------------------------------------------- 1. real project seed
const seed = createKitchenProofProject();
assert.equal(seed.status, "success", JSON.stringify(seed.errors));
let project = seed.updatedProject;
const beam = Object.values(project.objects).find(
  (object) => object.object_type === "structure.beam",
);
const hostWall = Object.values(project.objects).find(
  (object) =>
    object.object_type === "architecture.wall" &&
    Object.values(project.objects).some(
      (opening) =>
        (opening.object_type === "door_window.door" ||
          opening.object_type === "door_window.window") &&
        opening.module_data.wall_id === object.id,
    ),
);
check("seed contains a beam", Boolean(beam));
check("seed contains a wall with a hosted opening", Boolean(hostWall));

// ---------------------------------------------------------------- 2. dependency graph
const graph = buildDependencyGraph(project);
check("graph indexes every object", graph.summary.object_count === Object.keys(project.objects).length);
check("graph records hosted_on edges", (graph.summary.by_kind.hosted_on ?? 0) > 0);
check("graph records level references", (graph.summary.by_kind.references_level ?? 0) > 0);
check("graph has no dangling references", graph.warnings.length === 0, graph.warnings.join(" | "));

const hostedOpeningIds = Object.values(project.objects)
  .filter(
    (object) =>
      (object.object_type === "door_window.door" || object.object_type === "door_window.window") &&
      object.module_data.wall_id === hostWall.id,
  )
  .map((object) => object.id);
const deleteImpact = analyzeDependencyImpact(graph, [hostWall.id], "delete");
check(
  "deleting a wall cascades to its hosted openings",
  hostedOpeningIds.every((id) =>
    deleteImpact.entries.some(
      (entry) => entry.object_id === id && entry.disposition === "cascade_delete",
    ),
  ),
  JSON.stringify(deleteImpact.summary),
);
const cascadeSet = cascadeDeletionSet(graph, [hostWall.id]);
check(
  "cascade deletion set contains the wall and its openings",
  cascadeSet.includes(hostWall.id) && hostedOpeningIds.every((id) => cascadeSet.includes(id)),
);
const demolishImpact = analyzeDependencyImpact(graph, [hostWall.id], "demolish");
check(
  "demolishing a wall keeps its openings but flags re-hosting",
  hostedOpeningIds.every((id) =>
    demolishImpact.entries.some(
      (entry) => entry.object_id === id && entry.disposition === "needs_rehost",
    ),
  ),
);

// ---------------------------------------------------------------- 3. route a new pipe across the existing beam (via CommandBus)
const [bx1, by1] = beam.module_data.start_point_mm;
const [bx2, by2] = beam.module_data.end_point_mm;
const axisLength = Math.hypot(bx2 - bx1, by2 - by1);
const axis = [(bx2 - bx1) / axisLength, (by2 - by1) / axisLength];
const normal = [-axis[1], axis[0]];
const mid = [(bx1 + bx2) / 2, (by1 + by2) / 2];
const depth = beam.module_data.section_mm[1];
const level = project.levels.find((candidate) => candidate.id === beam.module_data.level_id);
const beamBase = (level?.elevation_mm ?? 0) + (beam.module_data.base_offset_mm ?? 0);
const routeZ = beamBase + depth / 2; // exactly mid-depth: the route runs through the beam's core
// The route crosses the beam perpendicularly through its mid-span, at mid depth: it must be
// reported as a hard clash, not merely overlap in an axis-aligned envelope.
const acrossNormal = (s) => [mid[0] + normal[0] * s, mid[1] + normal[1] * s];
const alongAxis = (t) => [mid[0] + axis[0] * t, mid[1] + axis[1] * t];
// Smart Object identity is a persistent RFC-4122 UUID, never a hand-typed label.
const pipeId = crypto.randomUUID();
const lightId = crypto.randomUUID();
const placed = CommandBus.executeBatch(project, [
  {
    name: "CreatePipeRoute",
    input: {
      id: pipeId,
      level_id: beam.module_data.level_id,
      created_phase: "new_construction",
      mark: "CW-1",
      system: "cold_water",
      diameter_mm: 100,
      material: "PPR",
      nodes_mm: [[...acrossNormal(-600), routeZ], [...acrossNormal(600), routeZ]],
    },
  },
  {
    name: "PlaceElectricalFixture",
    input: {
      id: lightId,
      level_id: beam.module_data.level_id,
      created_phase: "new_construction",
      mark: "L-1",
      kind: "light",
      location_mm: [...alongAxis(600), routeZ],
      watts: 9,
      controlled_ids: [],
      switch_ways: 1,
      grounded: true,
    },
  },
]);
assert.equal(placed.status, "success", JSON.stringify(placed.errors));
project = placed.updatedProject;
check("commands created the route and luminaire", Boolean(project.objects[pipeId] && project.objects[lightId]));
const bounds = analyzeProjectSpatialBounds(project);
const pipeBounds = bounds.objects.find((entry) => entry.object_id === pipeId).bounds;
const beamBounds = bounds.objects.find((entry) => entry.object_id === beam.id).bounds;
check(
  "the new route really passes through the beam envelope",
  [0, 1, 2].every((axisIndex) => pipeBounds.max[axisIndex] >= beamBounds.min[axisIndex] && pipeBounds.min[axisIndex] <= beamBounds.max[axisIndex]),
  JSON.stringify({ pipeBounds, beamBounds }),
);

// ---------------------------------------------------------------- 4. exact coordination
const report = runCoordination(project, { now: "2026-10-11T00:00:00.000Z" });
const again = runCoordination(project, { now: "2026-10-11T00:00:00.000Z" });
assert.deepEqual(report, again, "coordination must be deterministic");
check("rule set provenance is reported", report.rule_set.id === THAI_COORDINATION_RULES_V1.id && report.rule_set.version >= 1);
check("dataset notes are surfaced", report.notes.some((note) => note.includes(report.rule_set.id)));

const pipeBeam = report.findings.find(
  (finding) => finding.rule_id === "CF-CL-MEP-STR-001" && finding.objects.some((o) => o.object_id === pipeId),
);
check("the new route is reported against the structural beam", Boolean(pipeBeam));
check("the finding is a hard clash", pipeBeam.severity === "hard");
check("exact geometry was used", pipeBeam.interaction.method === "gjk_epa");
check("penetration is a positive millimetre depth", pipeBeam.interaction.penetration_mm > 0, JSON.stringify(pipeBeam.interaction));
check(
  "penetration bracket contains the reported depth",
  pipeBeam.interaction.penetration_range_mm[0] <= pipeBeam.interaction.penetration_mm + 1e-6 &&
    pipeBeam.interaction.penetration_range_mm[1] >= pipeBeam.interaction.penetration_mm - 1e-6,
);
const expectedShift = Math.ceil((pipeBeam.interaction.penetration_mm + 25 + 5) / 5) * 5;
check(
  "the suggested shift is the penetration plus rule margin and slack, rounded to the 5 mm step",
  pipeBeam.suggestion.recommended_mm === expectedShift,
  `expected ${expectedShift}, got ${pipeBeam.suggestion.recommended_mm}`,
);
check("the fix is an exact translation vector", pipeBeam.suggestion.exactness === "exact" && Array.isArray(pipeBeam.suggestion.delta_mm));
check("the fix names a millimetre move in Thai", /(ยกขึ้น|ลดลง|เลื่อน|ขยับ)/.test(pipeBeam.suggestion.phrase_th), pipeBeam.suggestion.phrase_th);
check("the finding cites its standard", typeof pipeBeam.source.standard === "string" && pipeBeam.source.standard.length > 0);
check("the finding carries highlight markers", pipeBeam.highlight.some((marker) => marker.kind === "box" && marker.tone === "impact"));
check("a witness point is reported", Array.isArray(pipeBeam.witness_point_mm));

const lightFinding = report.findings.find(
  (finding) => finding.objects.some((object) => object.object_id === lightId),
);
check("the buried luminaire is reported", Boolean(lightFinding), report.findings.map((f) => f.rule_id).join(","));
check("the luminaire finding suggests a buildable axis shift", lightFinding.suggestion.recommended_mm !== null);
check("engineer review is requested where teardown is involved", pipeBeam.requires_engineer_review === true);
check(
  "phase context is reported for renovation work",
  ["sequential", "same_phase", "existing_vs_new", "mixed"].includes(pipeBeam.phase_context.coexistence),
);

// ---------------------------------------------------------------- 5. per-project override + atomic undo
const session = new ProjectCommandSession(project);
const before = session.project;
const overrideRun = session.execute([
  {
    name: "UpdateCoordinationSettings",
    input: {
      settings: {
        rule_set_id: report.rule_set.id,
        rule_set_version: report.rule_set.version,
        construction_slack_mm: 20,
        overrides: [{ rule_id: "CF-CL-MEP-STR-001", required_clearance_mm: 260, note: "เว้นระยะห่างจากคานเพิ่ม" }],
      },
    },
  },
]);
assert.equal(overrideRun.status, "success", JSON.stringify(overrideRun.errors));
check("the override is stored on the project", overrideRun.updatedProject.coordination_settings?.overrides?.length === 1);
const overriddenReport = runCoordination(overrideRun.updatedProject);
const overridden = overriddenReport.findings.find((finding) => finding.rule_id === "CF-CL-MEP-STR-001");
check("the overridden requirement is applied", overridden.requirement_th.includes("ปรับตามโครงการ: 260"));
check("the applied override is listed in provenance", overriddenReport.rule_set.applied_overrides.includes("CF-CL-MEP-STR-001"));
const invalid = CommandBus.execute(overrideRun.updatedProject, "UpdateCoordinationSettings", {
  settings: { overrides: [{ rule_id: "not-a-rule", required_clearance_mm: 10 }] },
});
check("malformed overrides are rejected", invalid.result.status !== "success", JSON.stringify(invalid.result.errors));

const undoneSettings = session.undo();
check("undo restores the previous rule set", undoneSettings.coordination_settings === undefined);
check("undo restores the document byte-for-byte", serializeProject(undoneSettings) === serializeProject(before));

const deleteRun = session.execute([{ name: "DeleteObject", input: { object_id: hostWall.id } }]);
assert.equal(deleteRun.status, "success", JSON.stringify(deleteRun.errors));
const deleteResult = deleteRun.results[0];
check(
  "delete cascades through the graph",
  hostedOpeningIds.every((id) => deleteResult.deleted_object_ids.includes(id)),
  JSON.stringify(deleteResult.deleted_object_ids),
);
check("the delete result reports its dependency impact", deleteResult.dependency_impact?.action === "delete");
check(
  "the delete impact lists the cascade it performed",
  deleteResult.dependency_impact.entries.some((entry) => entry.disposition === "cascade_delete"),
);
const redone = session.redo();
check("redo restores the cascade deterministically", !redone.objects[hostWall.id] && hostedOpeningIds.every((id) => !redone.objects[id]));
const revertedDelete = session.undo();
check("undo restores the cascaded objects", Boolean(revertedDelete.objects[hostWall.id] && hostedOpeningIds.every((id) => revertedDelete.objects[id])));

const phaseRun = CommandBus.execute(project, "UpdateObjectPhase", {
  object_id: hostWall.id,
  removed_phase: "demolition",
});
assert.equal(phaseRun.result.status, "success", JSON.stringify(phaseRun.result.errors));
check(
  "demolition flags the hosted dependents instead of deleting them",
  phaseRun.result.dependency_impact?.entries.some(
    (entry) => entry.disposition === "needs_rehost" && hostedOpeningIds.includes(entry.object_id),
  ),
);

// ---------------------------------------------------------------- 6. overlay planning (plan + elevation canvases)
const zoom = 0.05;
const project2d = (point) => [point[0] * zoom + 100, point[1] * zoom + 50];
const elevation = (point) => [point[0] * zoom + 100, 400 - (point[2] - beamBase) * zoom];
const planPrimitives = planCoordinationOverlay(report.findings, { project: project2d, severities: ["hard"] });
const rects = planPrimitives.filter((primitive) => primitive.kind === "rect");
check("hard findings produce outlined subjects plus a filled impact box", rects.filter((r) => r.tone === "impact").length >= 1);
check("non-hard severities are filtered out", planPrimitives.every((primitive) => primitive.severity === "hard"));
const measure = planPrimitives.find((primitive) => primitive.kind === "measure");
check("a measured dimension tag is produced", Boolean(measure) && /mm/.test(measure.text), measure?.text);
const badge = planPrimitives.find((primitive) => primitive.kind === "badge");
check("the badge names the rule and the fix", badge.lines[0].includes("CF-CL-") && badge.lines[1].length > 0, JSON.stringify(badge.lines));
const focused = planCoordinationOverlay(report.findings, { project: planPrimitives.length ? elevation : elevation, objectIds: [pipeId] });
check(
  "focus mode keeps only findings that touch the chosen object",
  focused.length > 0 && focused.every((primitive) => primitive.kind !== "badge" || primitive.lines[0].includes("CF-CL-")),
);
const elevationRects = focused.filter((primitive) => primitive.kind === "rect");
check("elevation projection yields screen-space rects too", elevationRects.every((rect) => Number.isFinite(rect.x) && Number.isFinite(rect.y)));
check("an empty finding list plans an empty overlay", planCoordinationOverlay([], { project: project2d }).length === 0);

// ---------------------------------------------------------------- summary
console.log(
  [
    "",
    "Pillar 6 acceptance — Exact Clash + Dependency Coordination",
    "-----------------------------------------------------------",
    `objects: ${graph.summary.object_count} · graph edges: ${graph.summary.edge_count} (hosted_on ${graph.summary.by_kind.hosted_on ?? 0})`,
    `proxies: ${report.summary.proxies_built} · narrow-phased pairs: ${report.summary.pairs_narrow_phased}/${report.summary.pairs_broad_phased}`,
    `findings: ${report.summary.findings} (hard ${report.summary.by_severity.hard}, clearance ${report.summary.by_severity.clearance})`,
    `pipe vs beam: penetration ${pipeBeam.interaction.penetration_mm.toFixed(1)} mm → ${pipeBeam.suggestion.phrase_th}`,
    `luminaire: ${lightFinding ? lightFinding.suggestion.phrase_th : "(none)"}`,
    `rule set: ${report.rule_set.id} v${report.rule_set.version} rev ${report.rule_set.revision} effective ${report.rule_set.effective_date}`,
    `checks passed: ${checks}`,
    "",
  ].join("\n"),
);
