import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyProjectDocument } from "@constructflow/project-model";
import { compilePermitDrawingSet } from "@constructflow/sheet-engine";
import {
  exportProjectToDxf,
  LAYOUT_DEFS,
  CAD_STANDARD_LAYERS,
  resolveCadLayer,
} from "../dist/index.js";

test("cad-adapter: generates compliant AutoCAD R2018 DXF with 20 PaperSpace layouts", () => {
  const project = createEmptyProjectDocument("CAD-TEST", "บ้านพักอาศัย 2 ชั้น");

  // Add sample smart objects across disciplines
  project.objects["col-1"] = {
    id: "col-1",
    object_type: "structure.column",
    created_phase: "new_construction",
    level_refs: [],
    relationships: [],
    module_data: {
      location_mm: [2000, 3000, 0],
      section_mm: [200, 200],
      mark: "C1",
    },
  };

  project.objects["wall-1"] = {
    id: "wall-1",
    object_type: "arch.wall",
    created_phase: "existing",
    level_refs: [],
    relationships: [],
    module_data: {
      start_point_mm: [0, 0, 0],
      end_point_mm: [4000, 0, 0],
      thickness_mm: 100,
    },
  };

  project.objects["wall-2"] = {
    id: "wall-2",
    object_type: "arch.wall",
    created_phase: "demolition",
    level_refs: [],
    relationships: [],
    module_data: {
      start_point_mm: [0, 0, 0],
      end_point_mm: [0, 3000, 0],
      thickness_mm: 100,
    },
  };

  const result = exportProjectToDxf(project, {
    projectName: "บ้านพักอาศัยคุณสมชาย",
    architectName: "นายช่างใหญ่ สถาปัตย์",
    engineerLicense: "วส. 12345",
  });

  assert.ok(result.dxfContent.length > 5000);
  assert.equal(result.layoutsCount, 20);

  // 1. Verify Header section
  assert.ok(result.dxfContent.includes("$ACADVER\n  1\nAC1032"));
  assert.ok(result.dxfContent.includes("$INSUNITS\n 70\n4")); // Millimeters

  // 2. Verify all 20 layout definitions are present
  for (const layout of LAYOUT_DEFS) {
    assert.ok(
      result.dxfContent.includes(layout.name),
      `DXF missing layout: ${layout.name}`,
    );
    assert.ok(
      result.dxfContent.includes(layout.id),
      `DXF missing sheet ID: ${layout.id}`,
    );
  }

  // 3. Verify standard layers exist
  assert.ok(result.dxfContent.includes("S-COLN-NEWW"));
  assert.ok(result.dxfContent.includes("A-WALL-EXST"));
  assert.ok(result.dxfContent.includes("A-WALL-DEMO"));
  assert.ok(result.dxfContent.includes("ANNO-TTLB"));

  // 4. PaperSpace must contain the compiled page vectors, not a generic
  // top-plan viewport repeated on every sheet.
  assert.ok(result.dxfContent.includes("A-VIEW"));
  assert.ok(result.dxfContent.includes("410\nA-05_Elevations_NE"));
  assert.ok(result.dxfContent.includes("410\nA-06_Elevations_SW"));
  assert.equal((result.dxfContent.match(/\nVIEWPORT\n/g) ?? []).length, 0,
    "compiled vector sheets must not overlay a generic modelspace plan viewport");

  // 5. Verify batch plot script
  assert.ok(result.publishScriptContent.includes("-PLOT"));
  assert.ok(result.publishScriptContent.includes("A-01_Site_Plan"));
  assert.ok(result.publishScriptContent.includes("E-02_Power_Panel"));
  assert.ok(result.publishScriptContent.includes("ISO_full_bleed_A3"));
});

test("DXF elevation layouts contain the same facade vectors as the PDF sheet compiler", async () => {
  const { compilePermitDrawingSet } = await import("@constructflow/sheet-engine");
  const project = createEmptyProjectDocument("CAD-ELEVATION-PARITY", "Elevation parity");
  project.levels = [
    { id: "GF", name: "Ground", elevation_mm: 0, storey_index: 1, height_mm: 3000 },
    { id: "L1", name: "First Floor", elevation_mm: 3000, storey_index: 2, height_mm: 3000 },
  ];
  project.objects.facade = {
    id: "facade", object_type: "architecture.wall", created_phase: "new_construction",
    level_refs: [{ level_id: "GF", role: "base_level" }, { level_id: "L1", role: "top_level" }],
    host_refs: [], connector_refs: [], relationships: [], status: "active",
    module_data: { start_point_mm: [0, 5000, 0], end_point_mm: [4000, 5000, 0], thickness_mm: 100,
      height_mm: 3000, base_level_id: "GF", top_level_id: "L1", inside_finish_mark: "W1", outside_finish_mark: "W2", mark: "AAC" },
  };
  project.objects.demoFacade = {
    id: "demoFacade", object_type: "architecture.wall", created_phase: "demolition",
    level_refs: [{ level_id: "GF", role: "base_level" }, { level_id: "L1", role: "top_level" }],
    host_refs: [], connector_refs: [], relationships: [], status: "active",
    module_data: { start_point_mm: [6000, 5000, 0], end_point_mm: [8000, 5000, 0], thickness_mm: 100,
      height_mm: 3000, base_level_id: "GF", top_level_id: "L1", mark: "DEMO" },
  };
  const set = compilePermitDrawingSet(project);
  const a05 = set.sheets.find(sheet => sheet.id === "A-05");
  assert.ok(a05 && a05.primitives.some(primitive => primitive.kind === "path"));
  const dxf = exportProjectToDxf(project).dxfContent;
  const records = [];
  const pairs = dxf.split(/\r?\n/);
  for (let index = 0; index + 1 < pairs.length;) {
    if (pairs[index].trim() !== "0") { index += 2; continue; }
    const type = pairs[index + 1].trim();
    index += 2;
    const fields = new Map();
    while (index + 1 < pairs.length && pairs[index].trim() !== "0") {
      const key = pairs[index].trim();
      const value = pairs[index + 1].trim();
      if (!fields.has(key)) fields.set(key, []);
      fields.get(key).push(value);
      index += 2;
    }
    records.push({ type, fields });
  }
  const a05Entities = records.filter(record => record.fields.get("410")?.includes("A-05_Elevations_NE"));
  assert.ok(a05Entities.length >= a05.primitives.length,
    `A-05 should contain the compiled sheet primitives (DXF entities ${a05Entities.length}, source primitives ${a05.primitives.length})`);
  assert.ok(a05Entities.some(record => record.type === "TEXT"), "A-05 retains level and facade annotations");
  assert.ok(a05Entities.some(record => record.type === "LWPOLYLINE"), "A-05 contains projected wall/roof edges");
  assert.ok(a05Entities.some(record => record.fields.get("6")?.includes("DASHED2")), "demolition facade linework retains a dashed linetype");
  assert.ok(!a05Entities.some(record => record.type === "VIEWPORT"), "A-05 is not a top-down plan viewport");
});

test("cad-adapter: layer resolver correctly assigns AIA/วสท. phase layers", () => {
  const colNew = resolveCadLayer("structure.column", "new_construction");
  assert.equal(colNew.name, "S-COLN-NEWW");
  assert.equal(colNew.colorNumber, 4);

  const colExst = resolveCadLayer("structure.column", "existing");
  assert.equal(colExst.name, "S-COLN-EXST");
  assert.equal(colExst.colorNumber, 8);

  const wallDemo = resolveCadLayer("arch.wall", "demolition");
  assert.equal(wallDemo.name, "A-WALL-DEMO");
  assert.equal(wallDemo.colorNumber, 10);
  assert.equal(wallDemo.lineType, "DASHED2");
});

test("DXF exports hosted openings, both wall finish marks, and floor cutout rings", () => {
  const project = createEmptyProjectDocument("CAD-VERTICAL-PLAN");
  project.levels = [{ id: "GF", name: "Ground", elevation_mm: 0, storey_index: 0, height_mm: 3000 }];
  const object = (id, object_type, module_data) => ({
    id, object_type, created_phase: "new_construction", removed_phase: null,
    owner_module: "constructflow.architecture", schema_version: 1, status: "active",
    level_refs: [], host_refs: [], connector_refs: [], relationships: [],
    module_data, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  });
  project.objects.wall = object("wall", "architecture.wall", {
    start_point_mm: [0, 0, 0], end_point_mm: [5000, 0, 0], thickness_mm: 100,
    mark: "W1", inside_finish_mark: "W2", outside_finish_mark: "W1",
  });
  project.objects.existingWall = { ...object("existingWall", "architecture.wall", {
    start_point_mm: [0, 5000, 0], end_point_mm: [4000, 5000, 0], thickness_mm: 150, mark: "W0",
  }), created_phase: "existing" };
  project.objects.door = object("door", "door_window.door", {
    wall_id: "wall", mark: "D1", offset_along_wall_mm: 1500, width_mm: 900,
    handing: "left_in",
  });
  project.objects.window = object("window", "door_window.window", {
    wall_id: "wall", mark: "W1", offset_along_wall_mm: 3700, width_mm: 1200, panel_count: 2,
  });
  project.types.push({
    id: "catalog-wall-type", object_type: "architecture.wall", name: "Catalog Wall",
    parameters: { inside_finish_mark: "IF-CAT", outside_finish_mark: "OF-CAT" },
  });
  project.objects.catalogWall = object("catalogWall", "architecture.wall", {
    start_point_mm: [0, 6000, 0], end_point_mm: [3000, 6000, 0], thickness_mm: 100,
    mark: "Catalog Wall", type_id: "catalog-wall-type",
  });
  project.objects.slab = object("slab", "structure.slab", {
    boundary_mm: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]],
    voids_mm: [[[1500, 1000], [2500, 1000], [2500, 2000], [1500, 2000]]],
    thickness_mm: 120, topping_mm: 0, mark: "S1", level_id: "GF", elevation_mm: 0,
    slab_system: "slab_on_ground", material: "reinforced_concrete",
  });
  project.objects.archFloor = object("archFloor", "architecture.floor", {
    boundary_mm: [[0,0],[4000,0],[4000,3000],[0,3000]],
    voids_mm: [[[1000,1000],[2000,1000],[2000,2000],[1000,2000]]], mark: "AF1", level_id: "GF",
    finish_layers: [{ material: "porcelain_tile", thickness_mm: 10 }], finish_pattern_mm: [1000, 1000],
  });
  project.objects.room = object("room", "architecture.room", {
    boundary_mm: [[0,0],[4000,0],[4000,3000],[0,3000]], area_mm2: 12000000,
    mark: "R1", number: "1", name: "ห้องนั่งเล่น",
  });
  const dxf = exportProjectToDxf(project).dxfContent;
  const a02 = compilePermitDrawingSet(project).sheets.find(sheet => sheet.id === "A-02");
  const tileLineCount = a02.primitives.filter(primitive => primitive.kind === "path" && primitive.color === "#9aa6b4").length;
  assert.ok(tileLineCount > 0, "A-02 compiles tile finish as clipped vector paths");
  assert.ok(dxf.includes("W2") && dxf.includes("W1"));
  assert.ok(dxf.includes("SOLID\n  5"), "existing walls use a plot-background-aware solid poche");
  assert.ok(dxf.includes(" 62\n7\n100\nAcDbTrace"), "existing wall poche uses color 7 for black/white background contrast");
  const newWallEntities = dxf.match(/  0\nLINE\n  5\n[^\n]+\n100\nAcDbEntity\n  8\nA-WALL-NEWW/g) ?? [];
  assert.ok(newWallEntities.length > 20, "new walls include model-space masonry hatch lines in addition to outlines");
  assert.ok(dxf.includes("D1"));
  assert.ok(dxf.includes("IF-CAT") && dxf.includes("OF-CAT"), "DXF wall-face tags resolve inside/outside marks from the assigned catalog type");
  assert.ok((dxf.match(/LWPOLYLINE/g) ?? []).length >= 5, "door leaf, structural slab rings and architectural floor rings are vector outlines");
  const records = [];
  const pairs = dxf.split(/\r?\n/);
  for (let index = 0; index + 1 < pairs.length;) {
    if (pairs[index].trim() !== "0") { index += 2; continue; }
    const type = pairs[index + 1].trim(); index += 2; const fields = new Map();
    while (index + 1 < pairs.length && pairs[index].trim() !== "0") { const key = pairs[index].trim(), value = pairs[index + 1].trim(); if (!fields.has(key)) fields.set(key, []); fields.get(key).push(value); index += 2; }
    records.push({ type, fields });
  }
  const a02ViewLines = records.filter(record => record.type === "LWPOLYLINE" && record.fields.get("410")?.includes("A-02_Ground_Plan") && record.fields.get("8")?.includes("A-VIEW"));
  assert.ok(a02ViewLines.length >= tileLineCount, `DXF A-02 PaperSpace should contain the ${tileLineCount} compiled tile paths (found ${a02ViewLines.length} view lines)`);
  assert.ok(dxf.includes("ห้องนั่งเล่น") && dxf.includes("12.00 m2"), "room annotation and area are exported as DXF text");
});
