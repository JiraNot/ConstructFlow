import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createEmptyProjectDocument, deserializeProject } from "@constructflow/project-model";
import { clippedGridSegments } from "@constructflow/geometry-kernel";
import {
  compilePermitDrawingSet,
  compilePermitPdf,
  PERMIT_INDEX,
} from "../dist/index.js";
import { PDFDocument, PDFName } from "pdf-lib";
test("Phase 6: deterministic 20-sheet index and explicit missing data; valid A3 and embedded Thai font", async () => {
  const p = createEmptyProjectDocument(
      "PDF-PROOF",
      "ทดสอบ ก่อสร้าง ถั่ว ปั๊มน้ำ",
    ),
    set = compilePermitDrawingSet(p);
  assert.deepEqual(set, compilePermitDrawingSet(p));
  assert.equal(set.sheets.length, 20);
  assert.deepEqual(
    set.sheets.map((s) => s.id),
    PERMIT_INDEX.map((v) => v[0]),
  );
  assert.equal(set.issue_ready, false);
  assert.ok(set.sheets.every((s) => s.status === "missing_data"));
  const bytes = await compilePermitPdf(
      set,
      readFileSync(new URL("../assets/Sarabun-Regular.ttf", import.meta.url)),
    ),
    pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 20);
  for (const page of pdf.getPages()) {
    assert.ok(Math.abs(page.getWidth() - (420 * 72) / 25.4) < 1e-8);
    assert.ok(Math.abs(page.getHeight() - (297 * 72) / 25.4) < 1e-8);
    const fonts = page.node.Resources().lookup(PDFName.of("Font"));
    assert.ok(fonts.keys().length > 0);
    const font = fonts.lookup(fonts.keys()[0]);
    assert.equal(font.get(PDFName.of("Subtype")).toString(), "/Type0");
    assert.ok(font.has(PDFName.of("ToUnicode")));
  }
});
test("Phase 6: crop and scale inputs reject malformed ranges", () => {
  const p = createEmptyProjectDocument("PDF-PROOF");
  assert.throws(
    () =>
      compilePermitDrawingSet(p, {
        viewports: { "A-02": { scale_denominator: 13 } },
      }),
    /scale/,
  );
  assert.throws(
    () =>
      compilePermitDrawingSet(p, {
        viewports: {
          "A-02": { scale_denominator: 100, crop_bounds_mm: [10, 0, 0, 10] },
        },
      }),
    /crop/,
  );
});

test("Phase 6: saved sheet settings control the compiler and invalid coordinate lengths reject", () => {
  const p = createEmptyProjectDocument("PDF-PROOF");
  p.drawing_settings = {
    viewports: {
      "A-09": {
        scale_denominator: 20,
        center_mm: [1000, 1000],
        crop_bounds_mm: [0, 0, 2000, 2000],
      },
    },
    revision: "R2",
    author: "Thai Designer",
  };
  const set = compilePermitDrawingSet(p),
    sheet = set.sheets.find((s) => s.id === "A-09");
  assert.equal(sheet.scale, "1:20");
  assert.deepEqual(sheet.viewport.center_mm, [1000, 1000]);
  assert.ok(
    sheet.primitives.some(
      (p) => p.kind === "text" && p.text.includes("Revision R2"),
    ),
  );
  assert.throws(
    () =>
      compilePermitDrawingSet(p, {
        viewports: { "A-09": { scale_denominator: 25, center_mm: [1] } },
      }),
    /center_mm/,
  );
});

test("A-02 and A-03 can each select any story without showing a wall on its top-level plan", () => {
  const p = createEmptyProjectDocument("LEVEL-PLAN-PROOF");
  p.levels = [
    { id: "GF", name: "Ground", elevation_mm: 0, storey_index: 0, height_mm: 3000 },
    { id: "L2", name: "Level 2", elevation_mm: 3000, storey_index: 1, height_mm: 3000 },
    { id: "L3", name: "Level 3", elevation_mm: 6000, storey_index: 2, height_mm: 3000 },
  ];
  for (const [id, levelId] of [["wall-gf", "GF"], ["wall-l2", "L2"], ["wall-l3", "L3"]]) {
    p.objects[id] = {
      id, object_type: "architecture.wall", owner_module: "constructflow.architecture",
      schema_version: 1, created_phase: "new_construction", removed_phase: null,
      status: "active", level_refs: [{ role: "base_level", level_id: levelId }, ...(levelId === "GF" ? [{ role: "top_level", level_id: "L2" }] : [])],
      host_refs: [], connector_refs: [], relationships: [],
      module_data: { start_point_mm: [0, 0, 0], end_point_mm: [3000, 0, 0], thickness_mm: 100, height_mm: 3000, level_id: levelId, ...(levelId === "GF" ? { top_level_id: "L2" } : {}) },
      created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    };
  }
  const auxiliary = (id, object_type, module_data, levelId = "GF") => ({
    id, object_type, owner_module: object_type.startsWith("structure.") ? "constructflow.structure" : "constructflow.architecture",
    schema_version: 1, created_phase: "new_construction", removed_phase: null, status: "active",
    level_refs: [{ role: "base_level", level_id: levelId }], host_refs: [], connector_refs: [], relationships: [],
    module_data, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  });
  p.objects["foundation-gf"] = auxiliary("foundation-gf", "structure.foundation", {
    center_mm: [0, 0, 0], size_mm: [800, 800, 300], level_id: "GF",
  });
  p.objects["bathroom-gf"] = auxiliary("bathroom-gf", "architecture.bathroom", {
    level_id: "GF", boundary_mm: [[0, 0], [1000, 0], [1000, 1000], [0, 1000]], drain_mm: [500, 500],
    elevation_mm: 0, drop_mm: 0, slope_ratio: 0.02, waterproof_upstand_mm: 300,
    wet_wall_height_mm: 1800, wet_wall_length_mm: 1000, tile_mm: [300, 300], toilet_rough_in_mm: 305,
  });
  const set = compilePermitDrawingSet(p, { viewports: {
    "A-02": { scale_denominator: 100, level_id: "L3" },
    "A-03": { scale_denominator: 100, level_id: "L2" },
  } });
  assert.deepEqual(set.sheets.find(s => s.id === "A-02").source_object_ids, ["wall-l3"]);
  assert.deepEqual(set.sheets.find(s => s.id === "A-03").source_object_ids, ["wall-l2"]);
  const architecturalPlan = compilePermitDrawingSet(p, { viewports: { "A-02": { scale_denominator: 100, level_id: "GF" } } });
  assert.ok(!architecturalPlan.sheets.find(s => s.id === "A-02").source_object_ids.some(id => ["foundation-gf", "bathroom-gf"].includes(id)), "the architectural plan leaves footing and bathroom-detail geometry to their dedicated views");
  assert.ok(architecturalPlan.sheets.find(s => s.id === "S-01").source_object_ids.includes("foundation-gf"), "structural footing geometry remains on its structural sheet");
});

test("A-02/A-03 isolate architectural floor patterns and surface sources by selected storey", () => {
  const p = createEmptyProjectDocument("LEVEL-SURFACE-PLAN-PROOF");
  p.levels = [
    { id: "GF", name: "Ground", elevation_mm: 0, storey_index: 0, height_mm: 3000 },
    { id: "L2", name: "Level 2", elevation_mm: 3000, storey_index: 1, height_mm: 3000 },
  ];
  p.project.active_level_id = "GF";
  const addSurface = (id, object_type, level_id, elevation_mm, module_data) => {
    p.objects[id] = {
      id, object_type, owner_module: "constructflow.architecture", schema_version: 1,
      created_phase: "new_construction", removed_phase: null, status: "active",
      level_refs: [{ role: "base_level", level_id }], host_refs: [], connector_refs: [], relationships: [],
      module_data: { mark: id, level_id, elevation_reference: "level", elevation_mm, elevation_offset_mm: 0,
        boundary_mm: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]], thickness_mm: object_type === "architecture.floor" ? 50 : 12,
        voids_mm: [], ...module_data },
      created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    };
  };
  addSurface("floor-gf", "architecture.floor", "GF", 0, {
    finish_layers: [{ mark: "Ground Tile", material: "porcelain_tile", thickness_mm: 10, quantity_unit: "m2" }], finish_pattern_mm: [1000, 1000],
  });
  addSurface("floor-l2", "architecture.floor", "L2", 3000, {
    finish_layers: [{ mark: "Upper Tile", material: "ceramic_tile", thickness_mm: 8, quantity_unit: "m2" }], finish_pattern_mm: [500, 600],
  });
  addSurface("ceiling-gf", "architecture.ceiling", "GF", 2600, { material: "gypsum_board", grid_mm: [600, 600] });
  addSurface("ceiling-l2", "architecture.ceiling", "L2", 5600, { material: "fiber_cement_board", grid_mm: [300, 600] });

  const set = compilePermitDrawingSet(p, { viewports: {
    "A-02": { scale_denominator: 100, level_id: "GF" },
    "A-03": { scale_denominator: 100, level_id: "L2" },
  } });
  const ground = set.sheets.find(sheet => sheet.id === "A-02");
  const upper = set.sheets.find(sheet => sheet.id === "A-03");
  assert.deepEqual(ground.source_object_ids, ["floor-gf", "ceiling-gf"]);
  assert.deepEqual(upper.source_object_ids, ["floor-l2", "ceiling-l2"]);
  const floorGridCount = sheet => sheet.primitives.filter(item => item.kind === "path" && item.width === 0.1 && item.color === "#cbd5e1").length;
  for (const sheet of [ground, upper]) {
    assert.ok(floorGridCount(sheet) > 0, `${sheet.id} contains the selected floor's tile grid`);
  }
  assert.ok(floorGridCount(upper) > floorGridCount(ground), "the tighter upper-floor tile spacing produces more compiled tile lines");
});

test("A-05/A-06 keep higher elevations toward the top in top-down sheet coordinates", () => {
  const p = createEmptyProjectDocument("ELEVATION-PAPER-AXIS-PROOF");
  p.levels = [
    { id: "GF", name: "Ground Floor", elevation_mm: 0, storey_index: 0, height_mm: 3000 },
    { id: "L1", name: "First Floor", elevation_mm: 3000, storey_index: 1, height_mm: 3000 },
    { id: "RF", name: "Roof Level", elevation_mm: 6000, storey_index: 2, height_mm: 500 },
  ];
  p.objects.wall = {
    id: "wall", object_type: "architecture.wall", owner_module: "constructflow.architecture",
    schema_version: 1, created_phase: "new_construction", removed_phase: null, status: "active",
    level_refs: [{ role: "base_level", level_id: "GF" }, { role: "top_level", level_id: "L1" }],
    host_refs: [], connector_refs: [], relationships: [],
    module_data: { start_point_mm: [0, 0, 0], end_point_mm: [4000, 0, 0], thickness_mm: 100, height_mm: 3000, base_level_id: "GF", top_level_id: "L1" },
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  };

  const viewports = {
    "A-05": { scale_denominator: 100, center_mm: [2000, 3000] },
    "A-06": { scale_denominator: 100, center_mm: [2000, 3000] },
  };
  const sheets = compilePermitDrawingSet(p, { viewports }).sheets.filter(sheet => sheet.id === "A-05" || sheet.id === "A-06");
  for (const sheet of sheets) {
    const getDatumY = (name) => sheet.primitives.find(primitive => primitive.kind === "text" && primitive.text.includes(name))?.at[1];
    const groundY = getDatumY("Ground Floor");
    const firstY = getDatumY("First Floor");
    const roofY = getDatumY("Roof Level");
    assert.ok(Number.isFinite(groundY) && Number.isFinite(firstY) && Number.isFinite(roofY), `${sheet.id} includes all three level labels`);
    assert.ok(groundY > firstY && firstY > roofY, `${sheet.id} maps increasing model elevation toward the top edge of the sheet`);
  }
});

test("new masonry plan hatch matches sheet output, stops at hosted openings, and is absent from existing walls", () => {
  const makeProject = (withOpening, newWallPhase = "new_construction", wallAssembly = {}) => {
    const p = createEmptyProjectDocument("PLAN-WALL-HATCH-PROOF");
    const levelId = p.levels[0]?.id ?? "GF";
    p.levels = [{ id: levelId, name: "Ground", elevation_mm: 0, storey_index: 0, height_mm: 3000 }];
    p.project.active_level_id = levelId;
    const object = (id, object_type, module_data, phase = "new_construction") => ({
      id, object_type, owner_module: "constructflow.architecture", schema_version: 1,
      created_phase: phase, removed_phase: null, status: "active",
      level_refs: [{ role: "base_level", level_id: levelId }], host_refs: [], connector_refs: [], relationships: [],
      module_data, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    });
    p.objects.wall = object("wall", "architecture.wall", {
      start_point_mm: [0, 0, 0], end_point_mm: [4000, 0, 0], thickness_mm: 100,
      height_mm: 3000, level_id: levelId, mark: "AAC 100 mm", inside_finish_mark: "W2", outside_finish_mark: "W1",
      ...wallAssembly,
    }, newWallPhase);
    p.objects.oldWall = object("oldWall", "architecture.wall", {
      start_point_mm: [0, 3000, 0], end_point_mm: [4000, 3000, 0], thickness_mm: 100,
      height_mm: 3000, level_id: levelId, mark: "W0",
    }, "existing");
    if (withOpening) p.objects.window = object("window", "door_window.window", {
      wall_id: "wall", offset_along_wall_mm: 2000, width_mm: 1000, height_mm: 1200,
      sill_height_mm: 900, level_id: levelId, mark: "W1",
    });
    return p;
  };
  const compiled = (project, viewport) => compilePermitDrawingSet(project, {
    viewports: viewport ? { "A-02": viewport } : undefined,
  }).sheets.find((sheet) => sheet.id === "A-02");
  const hatchPaths = (project, viewport, color = "#9aa6b4") => compiled(project, viewport).primitives
    .filter((primitive) => primitive.kind === "path" && primitive.color === color && primitive.width === 0.15);

  const withoutOpening = hatchPaths(makeProject(false), { scale_denominator: 100 });
  const withOpening = hatchPaths(makeProject(true));
  const existingOnly = hatchPaths(makeProject(false, "existing"));
  const demolition = hatchPaths(makeProject(true, "demolition"), undefined, "#ef4444");
  const boardWall = hatchPaths(makeProject(false, "new_construction", { material: "steel_stud", wall_system: "steel_frame_board" }));
  assert.ok(withoutOpening.length > 20, "new masonry exports vector hatch strokes on the plan sheet");
  assert.ok(withOpening.length > 0 && withOpening.length < withoutOpening.length, "a hosted opening removes hatch lines from its wall span");
  assert.ok(withOpening.every((primitive) => primitive.points.length === 2), "hatch is emitted as editable clipped vector segments");
  assert.equal(existingOnly.length, 0, "existing walls do not receive new-construction masonry hatch");
  assert.ok(demolition.length > 0 && demolition.length < withoutOpening.length, "demolition walls receive red strike-through hatch, clipped at hosted openings");
  assert.equal(boardWall.length, 0, "new steel-frame board walls do not receive masonry hatch");
  assert.equal(compiled(makeProject(false)).scale, "1:25", "a compact plan enlarges to the largest standard scale that retains a small view margin");
  assert.equal(compiled(makeProject(false), { scale_denominator: 100 }).scale, "1:100", "an explicit viewport scale remains authoritative");
  const planTexts = compiled(makeProject(false)).primitives.filter((primitive) => primitive.kind === "text").map((primitive) => primitive.text);
  assert.ok(planTexts.includes("W1") && planTexts.includes("W2"), "plan labels each physical wall face with its own finish mark");
  assert.ok(!planTexts.includes("AAC 100 mm"), "the assembly preset name is not mistaken for a face finish mark");
});

test("A-10 compiles modeled ceiling boundaries, openings, labels and grids for the selected level", () => {
  const p = createEmptyProjectDocument("RCP-PROOF");
  p.levels = [
    { id: "GF", name: "Ground", elevation_mm: 0, storey_index: 0, height_mm: 3000 },
    { id: "L2", name: "Level 2", elevation_mm: 3000, storey_index: 1, height_mm: 3000 },
  ];
  p.project.active_level_id = "GF";
  p.objects["ceiling-gf"] = {
    id: "ceiling-gf", object_type: "architecture.ceiling", owner_module: "constructflow.architecture",
    schema_version: 1, created_phase: "new_construction", removed_phase: null, status: "active",
    level_refs: [{ role: "base_level", level_id: "GF" }], host_refs: [], connector_refs: [], relationships: [],
    module_data: {
      mark: "CL1", level_id: "GF", boundary_mm: [[0, 0], [3600, 0], [3600, 3000], [0, 3000]],
      voids_mm: [[[1500, 1200], [2100, 1200], [2100, 1800], [1500, 1800]]],
      elevation_mm: 2700, elevation_reference: "level", elevation_offset_mm: 2700, thickness_mm: 9, grid_mm: [600, 600], follows_room_boundary: true, room_boundary_status: "unclosed",
    },
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  };
  p.objects["ceiling-l2"] = {
    ...structuredClone(p.objects["ceiling-gf"]),
    id: "ceiling-l2",
    level_refs: [{ role: "base_level", level_id: "L2" }],
    module_data: { ...structuredClone(p.objects["ceiling-gf"].module_data), level_id: "L2", mark: "CL2" },
  };
  const viewport = { scale_denominator: 50, level_id: "GF", center_mm: [1800, 1500] };
  const sheet = compilePermitDrawingSet(p, { viewports: { "A-10": viewport } }).sheets.find(item => item.id === "A-10");
  assert.ok(sheet);
  assert.ok(sheet.title.includes("Ground"), "the printed A-10 title identifies its selected level");
  assert.ok(sheet.source_object_ids.includes("ceiling-gf"));
  const ceilingLabelIndex = sheet.primitives.findIndex(item => item.kind === "text" && item.text.includes("CL1"));
  assert.ok(ceilingLabelIndex >= 0);
  assert.ok(sheet.primitives.some(item => item.kind === "text" && item.text.includes("RCP · ขอบเขตฝ้า")));
  assert.ok(sheet.primitives.some(item => item.kind === "path" && item.color === "#0f172a" && item.closed && item.fill === "#e3e8ed"));
  assert.ok(sheet.primitives.some(item => item.kind === "path" && item.color === "#0f172a" && item.closed && item.fill === "#ffffff" && item.dash?.join(",") === "2,1"), "ceiling voids must be knocked out of the RCP fill while retaining a dashed opening outline");
  const ceilingLabel = sheet.primitives[ceilingLabelIndex];
  const ceilingLabelMask = sheet.primitives.slice(0, ceilingLabelIndex).reverse().find(item => item.kind === "path" && item.closed && item.fill === "#ffffff" && !item.dash);
  assert.ok(ceilingLabelMask, "RCP ceiling labels receive a white knockout behind the grid");
  const maskBounds = [Math.min(...ceilingLabelMask.points.map(point => point[0])), Math.min(...ceilingLabelMask.points.map(point => point[1])), Math.max(...ceilingLabelMask.points.map(point => point[0])), Math.max(...ceilingLabelMask.points.map(point => point[1]))];
  assert.ok(ceilingLabel.at[0] >= maskBounds[0] && ceilingLabel.at[0] <= maskBounds[2] && ceilingLabel.at[1] >= maskBounds[1] && ceilingLabel.at[1] <= maskBounds[3], "the label text stays inside its knockout");
  const ceilingVoid = sheet.primitives.find(item => item.kind === "path" && item.closed && item.fill === "#ffffff" && item.dash?.join(",") === "2,1");
  const voidBounds = [Math.min(...ceilingVoid.points.map(point => point[0])), Math.min(...ceilingVoid.points.map(point => point[1])), Math.max(...ceilingVoid.points.map(point => point[0])), Math.max(...ceilingVoid.points.map(point => point[1]))];
  assert.ok(maskBounds[2] <= voidBounds[0] || maskBounds[0] >= voidBounds[2] || maskBounds[3] <= voidBounds[1] || maskBounds[1] >= voidBounds[3], "the ceiling label knockout must not cover an opening");
  assert.ok(!sheet.warnings.some(warning => warning.includes("no clear RCP label area")));
  const paperGrid = sheet.primitives
    .filter(item => item.kind === "path" && item.color === "#94a3b8" && item.width === 0.12 && !item.dash?.length)
    .map(item => item.points);
  const expectedGrid = clippedGridSegments(
    p.objects["ceiling-gf"].module_data.boundary_mm,
    600,
    600,
    p.objects["ceiling-gf"].module_data.voids_mm,
  ).map(([a, b]) => [
    [303 + (a[0] - 1800) / 50, 109 - (a[1] - 1500) / 50],
    [303 + (b[0] - 1800) / 50, 109 - (b[1] - 1500) / 50],
  ]);
  assert.deepEqual(paperGrid, expectedGrid, "A-10 RCP grid vectors must match the shared Canvas geometry, including stops around voids");
  assert.ok(!sheet.primitives.some(item => item.kind === "text" && item.text.includes("+0.000 m")), "RCP plan must not add vertical floor datums over the ceiling grid");
  assert.ok(!sheet.warnings.some(warning => warning.includes("no modeled ceiling objects")));
  assert.ok(sheet.warnings.some(warning => warning.includes("source room boundary is open")));
  assert.deepEqual(sheet.source_object_ids, ["ceiling-gf"]);

  const upperSheet = compilePermitDrawingSet(p, { viewports: { "A-10": { scale_denominator: 50, level_id: "L2" } } }).sheets.find(item => item.id === "A-10");
  assert.ok(upperSheet.title.includes("Level 2"), "the upper-storey RCP title identifies its selected level");
  assert.deepEqual(upperSheet.source_object_ids, ["ceiling-l2"]);
  assert.ok(upperSheet.primitives.some(item => item.kind === "text" && item.text.includes("CL2")));
  assert.ok(upperSheet.primitives.some(item => item.kind === "text" && item.text.includes("+5.700 m")));
  assert.ok(!upperSheet.primitives.some(item => item.kind === "text" && item.text.includes("CL1")));

  const demolitionProject = structuredClone(p);
  demolitionProject.objects["ceiling-gf"].removed_phase = "demolition";
  const demolitionSheet = compilePermitDrawingSet(demolitionProject, { viewports: { "A-10": viewport } }).sheets.find(item => item.id === "A-10");
  assert.ok(demolitionSheet.source_object_ids.includes("ceiling-gf"), "demolition ceilings remain visible in the RCP");
  assert.ok(demolitionSheet.primitives.some(item => item.kind === "path" && item.closed && item.color === "#ef4444" && item.fill === "#fee2e2" && item.dash?.join(",") === "2,1"));
  assert.ok(demolitionSheet.primitives.some(item => item.kind === "path" && item.color === "#ef4444" && item.width === 0.12 && item.dash?.join(",") === "6,3"), "demolition RCP grids use the shared red dashed phase style");
  assert.ok(demolitionSheet.primitives.some(item => item.kind === "path" && item.color === "#ef4444" && item.width === 0.15), "demolition ceiling hatch exports as editable PDF/DXF vector strokes");

  const existingProject = structuredClone(p);
  existingProject.objects["ceiling-gf"].created_phase = "existing";
  const existingSheet = compilePermitDrawingSet(existingProject, { viewports: { "A-10": viewport } }).sheets.find(item => item.id === "A-10");
  assert.ok(existingSheet.primitives.some(item => item.kind === "path" && item.closed && item.color === "#94a3b8" && item.fill === "#ffffff"), "existing ceilings use the muted existing phase palette");
  assert.ok(existingSheet.primitives.some(item => item.kind === "path" && item.color === "#cbd5e1" && item.width === 0.12 && !item.dash?.length), "existing RCP grids use the lighter shared existing phase style");
  p.levels.find(level => level.id === "L2").elevation_mm = 3200;
  const raisedUpper = compilePermitDrawingSet(p, { viewports: { "A-10": { scale_denominator: 50, level_id: "L2" } } }).sheets.find(item => item.id === "A-10");
  assert.ok(raisedUpper.primitives.some(item => item.kind === "text" && item.text.includes("+5.900 m")), "RCP label follows the revised datum while retaining its 2700 mm offset");
});

test("drawing set generates independent architectural and framing sheets for every unrepresented level", () => {
  const p = createEmptyProjectDocument("AUTO-LEVEL-SHEETS");
  p.levels = [
    { id: "GF", name: "Ground", elevation_mm: 0, storey_index: 1, height_mm: 3000 },
    { id: "L2", name: "Second Floor", elevation_mm: 3000, storey_index: 2, height_mm: 3000 },
    { id: "L3", name: "Third Floor", elevation_mm: 6000, storey_index: 3, height_mm: 3000 },
  ];
  for (const [id, levelId] of [["wall-gf", "GF"], ["wall-l2", "L2"], ["wall-l3", "L3"]]) {
    p.objects[id] = {
      id, object_type: "architecture.wall", owner_module: "constructflow.architecture",
      schema_version: 1, created_phase: "new_construction", removed_phase: null,
      status: "active", level_refs: [{ role: "base_level", level_id: levelId }],
      host_refs: [], connector_refs: [], relationships: [],
      module_data: { start_point_mm: [0, 0, 0], end_point_mm: [3000, 0, 0], thickness_mm: 100, height_mm: 3000, level_id: levelId },
      created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    };
  }
  const set = compilePermitDrawingSet(p, { viewports: {
    "A-02-L3": { scale_denominator: 50 },
  } });
  const byId = (id) => set.sheets.find((sheet) => sheet.id === id);

  assert.equal(set.sheets.length, 22);
  assert.deepEqual(byId("A-02").source_object_ids, ["wall-gf"]);
  assert.deepEqual(byId("A-03").source_object_ids, ["wall-l2"]);
  assert.deepEqual(byId("A-02-L3").source_object_ids, ["wall-l3"]);
  assert.equal(byId("A-02-L3").viewport.level_id, "L3");
  assert.equal(byId("A-02-L3").scale, "1:50");
  assert.equal(byId("S-02-L3").viewport.level_id, "L3");
  assert.ok(byId("A-02-L3").svg.includes("Third Floor"));
});

test("opening 2D overrides are stored per sheet and retain real-mm anchored lines", () => {
  const p = createEmptyProjectDocument("OPENING-VIEW-OVERRIDE");
  const override = {
    hide_generated_details: true,
    hide_generated_elevation: true,
    lines: [{
      id: "sash-edge",
      start: { x_anchor: "left", x_offset_mm: 50, y_mm: -25 },
      end: { x_anchor: "right", x_offset_mm: -50, y_mm: -25 },
    }],
    elevation_lines: [{
      id: "head-frame",
      start: { x_anchor: "left", x_offset_mm: 50, y_anchor: "top", y_mm: -50 },
      end: { x_anchor: "right", x_offset_mm: -50, y_anchor: "top", y_mm: -50 },
    }],
  };
  p.drawing_settings = { viewports: {
    "A-02": { scale_denominator: 100, opening_overrides: { "opening-uuid": override } },
    "A-03": { scale_denominator: 100 },
    "A-05": { scale_denominator: 100, opening_overrides: { "opening-uuid": { elevation_lines: override.elevation_lines } } },
  } };
  const set = compilePermitDrawingSet(p);
  assert.deepEqual(set.sheets.find((s) => s.id === "A-02").viewport.opening_overrides["opening-uuid"], override);
  assert.equal(set.sheets.find((s) => s.id === "A-03").viewport.opening_overrides, undefined);
  assert.deepEqual(set.sheets.find((s) => s.id === "A-05").viewport.opening_overrides["opening-uuid"].elevation_lines, override.elevation_lines);
  assert.throws(() => compilePermitDrawingSet(p, { viewports: {
    "A-02": { scale_denominator: 100, opening_overrides: { "opening-uuid": { ...override, lines: "invalid" } } },
  } }), /plan_symbol_lines/);
});

test("opening front elevation override replaces projected details and follows opening bounds", () => {
  const project = deserializeProject(readFileSync(new URL("../../../examples/kitchen-extension-proof.cfproj", import.meta.url), "utf8"));
  const opening = Object.values(project.objects).find((o) => o.object_type === "door_window.window");
  assert.ok(opening);
  const line = { id: "elevation-sill", start: { x_anchor: "left", x_offset_mm: 50, y_anchor: "bottom", y_mm: 50 }, end: { x_anchor: "right", x_offset_mm: -50, y_anchor: "bottom", y_mm: 50 } };
  const baseline = compilePermitDrawingSet(project).sheets.find((s) => s.id === "A-05");
  project.drawing_settings = { viewports: { "A-05": { scale_denominator: 100, opening_overrides: { [opening.id]: { hide_generated_elevation: true, elevation_lines: [line] } } } } };
  const adjusted = compilePermitDrawingSet(project).sheets.find((s) => s.id === "A-05");
  assert.ok(adjusted.primitives.filter((p) => p.kind === "path").length >= baseline.primitives.filter((p) => p.kind === "path").length);
  assert.equal(adjusted.viewport.opening_overrides[opening.id].elevation_lines[0].id, "elevation-sill");
  const hasProjectedSillLine = adjusted.primitives.some((p) => p.kind === "path" && p.width === 0.25 && p.points.length === 2 && Math.abs(Math.hypot(p.points[1][0] - p.points[0][0], p.points[1][1] - p.points[0][1]) - 11) < 0.02);
  assert.ok(hasProjectedSillLine, "anchored 50 mm insets should leave a 1100 mm line at 1:100");
});

test("Track 2: Permit Package evaluates legal metadata, deed boundaries, setbacks, and issue_ready", () => {
  const p = createEmptyProjectDocument("PERMIT-LEGAL", "บ้านพักอาศัยโมเดิร์น 2 ชั้น");

  p.legal_metadata = {
    deed_no: "45678",
    land_no: "123",
    survey_page: "9988",
    subdistrict: "ลาดยาว",
    district: "จตุจักร",
    province: "กรุงเทพมหานคร",
    rai: 0,
    ngan: 1,
    sq_wa: 50,
    total_area_sqm: 600,
    boundary_pegs: [
      { peg_no: "1", coordinate_m: [0, 0] },
      { peg_no: "2", coordinate_m: [20, 0] },
      { peg_no: "3", coordinate_m: [20, 30] },
      { peg_no: "4", coordinate_m: [0, 30] },
    ],
    setbacks: {
      front_m: 3.0,
      rear_m: 2.0,
      left_m: 2.0,
      right_m: 2.0,
      min_opening_setback_m: 2.0,
      min_blind_setback_m: 0.5,
    },
    zoning: {
      zone_code: "ย.4-12",
      far_limit: 3.0,
      osr_min_percent: 10.0,
      permeable_open_space_ratio_percent: 50.0,
    },
    signatories: {
      owner_name: "นายสมชาย เจริญสุข",
      architect_name: "นายสถาปัตย์ มั่นคง",
      architect_license_no: "ส-สถ. 9876",
      structural_engineer_name: "นายวิศวกร ปลอดภัย",
      structural_engineer_license_no: "วส. 5432",
      issue_approved: true,
    },
  };

  const set = compilePermitDrawingSet(p);
  const a01 = set.sheets.find((s) => s.id === "A-01");
  assert.ok(a01);
  assert.equal(a01.status, "issued");
  assert.ok(!a01.warnings.some((w) => w.includes("Deed boundary")));

  // Verify A-01 contains Deed Table text and Peg text
  assert.ok(a01.primitives.some((pr) => pr.kind === "text" && pr.text.includes("45678")));
  assert.ok(a01.primitives.some((pr) => pr.kind === "text" && pr.text.includes("หลักเขต 1")));
  assert.ok(a01.primitives.some((pr) => pr.kind === "text" && pr.text.includes("ส-สถ. 9876")));
  assert.ok(a01.primitives.some((pr) => pr.kind === "text" && pr.text.includes("PERMIT ISSUE SET")));
});
