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
    removed_phase: "demolition",
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
  assert.ok(result.ifcContent.includes("PhaseRemoved"));
  assert.ok(result.ifcContent.includes("PhaseDisplay"));
  assert.ok(result.ifcContent.includes("Existing"));
  assert.ok(result.ifcContent.includes("Demolition"));
  assert.ok(result.ifcContent.includes("New_Construction"));
});

test("bim-adapter: escapes user-provided STEP strings without splitting entity records", () => {
  const project = createEmptyProjectDocument("IFC-ESCAPING", "Owner's house\nPhase 2");
  project.levels = [{ id: "level-1", name: "Owner's Level\nTwo", elevation_mm: 0, storey_index: 0, height_mm: 3000 }];
  project.objects.beam = {
    id: "beam-1", object_type: "structure.beam", created_phase: "new_construction",
    level_refs: [], relationships: [],
    module_data: {
      start_point_mm: [0, 0, 3000], end_point_mm: [4000, 0, 3000],
      section_mm: [200, 400], span_mm: 4000, mark: "Owner's beam\nB1",
    },
  };

  const { ifcContent } = exportProjectToIfc(project, { authorName: "O'Brien\nEngineer" });
  const entityLines = ifcContent.split(/\r?\n/).filter(line => line.startsWith("#"));
  assert.ok(entityLines.every(line => !line.includes("\r") && !line.includes("\n")));
  assert.ok(ifcContent.includes("Owner''s house\\X0A\\Phase 2"));
  assert.ok(ifcContent.includes("Owner''s Level\\X0A\\Two"));
  assert.ok(ifcContent.includes("Owner''s beam\\X0A\\B1"));
  assert.ok(ifcContent.includes("O''Brien\\X0A\\Engineer"));
  assert.match(ifcContent, /IFCBEAM\('[^']+'[^\n]*'Owner''s beam\\X0A\\B1'/);
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
  const removedWall = serializeRevitTransfer({
    ...project,
    objects: {
      ...project.objects,
      "wall-1": { ...project.objects["wall-1"], created_phase: "existing", removed_phase: "demolition" },
    },
  }).elements.walls[0];
  assert.equal(removedWall.phase, "Demolition");
  assert.equal(removedWall.created_phase, "Existing");
  assert.equal(removedWall.removed_phase, "Demolition");
});

test("bim-adapter: preserves hosted opening UUIDs and resolves offsets along angled host walls", () => {
  const project = createEmptyProjectDocument("REVIT-HOSTED-OPENING");
  project.objects.wall = {
    id: "wall-uuid", object_type: "architecture.wall", created_phase: "existing",
    level_refs: [], relationships: [],
    module_data: { start_point_mm: [1000, 2000, 300], end_point_mm: [5000, 5000, 300], thickness_mm: 100, height_mm: 2800 },
  };
  project.objects.window = {
    id: "window-uuid", object_type: "door_window.window", created_phase: "new_construction",
    level_refs: [], relationships: [],
    module_data: { wall_id: "wall-uuid", offset_along_wall_mm: 2500, width_mm: 1200, height_mm: 1100, sill_height_mm: 900 },
  };
  project.objects.door = {
    id: "door-uuid", object_type: "door_window.door", created_phase: "new_construction",
    level_refs: [], relationships: [],
    module_data: { wall_id: "wall-uuid", location_mm: [2000, 2750, 300], width_mm: 900, height_mm: 2100 },
  };

  const openings = serializeRevitTransfer(project).elements.openings;
  const window = openings.find(opening => opening.cf_uuid === "window-uuid");
  const door = openings.find(opening => opening.cf_uuid === "door-uuid");
  assert.equal(door.category, "Door");
  assert.equal(door.host_wall_uuid, "wall-uuid");
  assert.equal(window.cf_uuid, "window-uuid");
  assert.equal(window.host_wall_uuid, "wall-uuid");
  assert.equal(window.category, "Window");
  assert.deepEqual(window.location_on_host_mm, [3000, 3500, 1200]);
  const ifc = exportProjectToIfc(project).ifcContent;
  assert.ok(ifc.includes("=IFCDOOR("), "canonical door family exports as IFC Door");
  assert.ok(ifc.includes("=IFCWINDOW("), "canonical window family exports as IFC Window");
});
