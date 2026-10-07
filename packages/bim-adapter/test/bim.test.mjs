import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyProjectDocument } from "@constructflow/project-model";
import {
  exportProjectToIfc,
  uuidToIfcGuid,
  serializeRevitTransfer,
} from "../dist/index.js";

test("bim-adapter: converts RFC-4122 UUID to 22-character buildingSMART IFC GUID", () => {
  const uuid = "e8c56789-1234-5678-abcd-ef0123456789";
  const ifcGuid = uuidToIfcGuid(uuid);
  assert.equal(ifcGuid.length, 22);
  // Valid IFC GUID characters only
  assert.ok(/^[0-9A-Za-z_$]{22}$/.test(ifcGuid));
});

test("bim-adapter: generates valid OpenBIM IFC 4.3 ADD2 STEP file", () => {
  const project = createEmptyProjectDocument("BIM-TEST", "วิลล่าริมทะเล 2 ชั้น");

  project.objects["col-1"] = {
    id: "col-1",
    object_type: "structure.column",
    created_phase: "new_construction",
    level_refs: [],
    relationships: [],
    module_data: {
      location_mm: [2000, 3000, 0],
      section_mm: [200, 200],
      height_mm: 3000,
      mark: "C1",
    },
  };

  project.objects["beam-1"] = {
    id: "beam-1",
    object_type: "structure.beam",
    created_phase: "new_construction",
    level_refs: [],
    relationships: [],
    module_data: {
      start_point_mm: [0, 0, 3000],
      end_point_mm: [4000, 0, 3000],
      section_mm: [200, 400],
      span_mm: 4000,
      mark: "B1",
    },
  };

  project.objects["wall-exst"] = {
    id: "wall-exst",
    object_type: "arch.wall",
    created_phase: "existing",
    level_refs: [],
    relationships: [],
    module_data: {
      start_point_mm: [0, 0, 0],
      end_point_mm: [4000, 0, 0],
      thickness_mm: 100,
      height_mm: 2800,
      mark: "W1",
    },
  };

  project.objects["wall-demo"] = {
    id: "wall-demo",
    object_type: "arch.wall",
    created_phase: "demolition",
    level_refs: [],
    relationships: [],
    module_data: {
      start_point_mm: [0, 0, 0],
      end_point_mm: [0, 3000, 0],
      thickness_mm: 100,
      height_mm: 2800,
      mark: "W2",
    },
  };

  const result = exportProjectToIfc(project, {
    projectName: "วิลล่าริมทะเล",
    authorName: "สมชาย วิศวกร",
  });

  assert.ok(result.byteLength > 1000);
  assert.ok(result.ifcContent.includes("ISO-10303-21;"));
  assert.ok(result.ifcContent.includes("IFC4X3_ADD2"));
  assert.ok(result.ifcContent.includes("IFCPROJECT"));
  assert.ok(result.ifcContent.includes("IFCSITE"));
  assert.ok(result.ifcContent.includes("IFCBUILDING"));
  assert.ok(result.ifcContent.includes("IFCBUILDINGSTOREY"));

  // Check element classes
  assert.ok(result.ifcContent.includes("IFCCOLUMN"));
  assert.ok(result.ifcContent.includes("IFCBEAM"));
  assert.ok(result.ifcContent.includes("IFCWALL"));

  // Check SI unit is Metre
  assert.ok(result.ifcContent.includes("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)"));

  // Check Renovation Phasing Pset
  assert.ok(result.ifcContent.includes("Pset_ConstructionPhase"));
  assert.ok(result.ifcContent.includes("PhaseCreated"));
  assert.ok(result.ifcContent.includes("Existing"));
  assert.ok(result.ifcContent.includes("Demolition"));
  assert.ok(result.ifcContent.includes("New_Construction"));
});

test("bim-adapter: generates Revit direct transfer JSON format", () => {
  const project = createEmptyProjectDocument("REVIT-TEST", "บ้านสองชั้น");

  project.objects["col-1"] = {
    id: "col-1",
    object_type: "structure.column",
    created_phase: "new_construction",
    level_refs: [],
    relationships: [],
    module_data: {
      location_mm: [2000, 3000, 0],
      section_mm: [200, 200],
      height_mm: 3000,
      mark: "C1",
    },
  };

  project.objects["wall-1"] = {
    id: "wall-1",
    object_type: "arch.wall",
    created_phase: "new_construction",
    level_refs: [],
    relationships: [],
    module_data: {
      start_point_mm: [0, 0, 0],
      end_point_mm: [4000, 0, 0],
      thickness_mm: 100,
      height_mm: 2800,
    },
  };

  const revitDoc = serializeRevitTransfer(project);
  assert.equal(revitDoc.schema_version, "constructflow.revit_transfer.v1");
  assert.equal(revitDoc.project.units, "mm");
  assert.equal(revitDoc.elements.columns.length, 1);
  assert.equal(revitDoc.elements.walls.length, 1);
  assert.equal(revitDoc.elements.walls[0].cf_uuid, "wall-1");
  assert.equal(revitDoc.elements.walls[0].phase, "New Construction");
});
