import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createEmptyProjectDocument, deserializeProject } from "@constructflow/project-model";
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
  const set = compilePermitDrawingSet(p, { viewports: {
    "A-02": { scale_denominator: 100, level_id: "L3" },
    "A-03": { scale_denominator: 100, level_id: "L2" },
  } });
  assert.deepEqual(set.sheets.find(s => s.id === "A-02").source_object_ids, ["wall-l3"]);
  assert.deepEqual(set.sheets.find(s => s.id === "A-03").source_object_ids, ["wall-l2"]);
});

test("A-10 compiles modeled ceiling boundaries, openings, labels and grids for the selected level", () => {
  const p = createEmptyProjectDocument("RCP-PROOF");
  p.levels = [{ id: "GF", name: "Ground", elevation_mm: 0, storey_index: 0, height_mm: 3000 }];
  p.project.active_level_id = "GF";
  p.objects["ceiling-gf"] = {
    id: "ceiling-gf", object_type: "architecture.ceiling", owner_module: "constructflow.architecture",
    schema_version: 1, created_phase: "new_construction", removed_phase: null, status: "active",
    level_refs: [{ role: "base_level", level_id: "GF" }], host_refs: [], connector_refs: [], relationships: [],
    module_data: {
      mark: "CL1", level_id: "GF", boundary_mm: [[0, 0], [3600, 0], [3600, 3000], [0, 3000]],
      voids_mm: [[[1500, 1200], [2100, 1200], [2100, 1800], [1500, 1800]]],
      elevation_mm: 2700, elevation_offset_mm: 0, thickness_mm: 9, grid_mm: [600, 600], follows_room_boundary: true,
    },
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  };
  const sheet = compilePermitDrawingSet(p).sheets.find(item => item.id === "A-10");
  assert.ok(sheet);
  assert.ok(sheet.source_object_ids.includes("ceiling-gf"));
  assert.ok(sheet.primitives.some(item => item.kind === "text" && item.text.includes("CL1")));
  assert.ok(sheet.primitives.some(item => item.kind === "text" && item.text.includes("RCP · ขอบเขตฝ้า")));
  assert.ok(sheet.primitives.some(item => item.kind === "path" && item.color === "#7c3aed" && item.closed));
  assert.ok(!sheet.warnings.some(warning => warning.includes("no modeled ceiling objects")));
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
