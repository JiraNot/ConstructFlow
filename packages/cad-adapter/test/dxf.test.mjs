import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyProjectDocument } from "@constructflow/project-model";
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

  // 4. Verify genuine ACAD_TABLE entity is emitted
  assert.ok(result.dxfContent.includes("TABLE\n  5"));
  assert.ok(result.dxfContent.includes("AcDbTable"));
  assert.ok(result.dxfContent.includes("DOOR & WINDOW SCHEDULE"));
  assert.ok(result.dxfContent.includes("BAR BENDING SCHEDULE (BBS)"));

  // 5. Verify batch plot script
  assert.ok(result.publishScriptContent.includes("-PLOT"));
  assert.ok(result.publishScriptContent.includes("A-01_Site_Plan"));
  assert.ok(result.publishScriptContent.includes("E-02_Power_Panel"));
  assert.ok(result.publishScriptContent.includes("ISO_full_bleed_A3"));
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
  project.objects.door = object("door", "door_window.door", {
    wall_id: "wall", mark: "D1", offset_along_wall_mm: 1500, width_mm: 900,
    handing: "left_in",
  });
  project.objects.window = object("window", "door_window.window", {
    wall_id: "wall", mark: "W1", offset_along_wall_mm: 3700, width_mm: 1200, panel_count: 2,
  });
  project.objects.slab = object("slab", "structure.slab", {
    boundary_mm: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]],
    voids_mm: [[[1500, 1000], [2500, 1000], [2500, 2000], [1500, 2000]]],
    thickness_mm: 120, topping_mm: 0, mark: "S1", level_id: "GF",
  });
  const dxf = exportProjectToDxf(project).dxfContent;
  assert.ok(dxf.includes("W2") && dxf.includes("W1"));
  assert.ok(dxf.includes("D1"));
  assert.ok((dxf.match(/LWPOLYLINE/g) ?? []).length >= 3, "door leaf and both slab rings are vector outlines");
});
