import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createEmptyProjectDocument,
  deserializeProject,
} from "@constructflow/project-model";
import {
  compilePermitDrawingSet,
  compilePermitPdf,
} from "../dist/index.js";
import { isWallFacadeForElevation, resolveElevationWallPhaseStyle } from "@constructflow/representation-engine";
import { PDFDocument } from "pdf-lib";

test("A-05 and A-06 use a legible residential default scale while preserving explicit viewport scales", () => {
  const p = createEmptyProjectDocument("ELEVATION-SCALE", "ทดสอบสเกลรูปด้าน");
  const defaults = compilePermitDrawingSet(p);
  assert.equal(defaults.sheets.find((sheet) => sheet.id === "A-05").scale, "1:50");
  assert.equal(defaults.sheets.find((sheet) => sheet.id === "A-06").scale, "1:50");

  const overridden = compilePermitDrawingSet(p, {
    viewports: {
      "A-05": { scale_denominator: 100 },
      "A-06": { scale_denominator: 100 },
      "A-10": { scale_denominator: 50 },
    },
  });
  assert.equal(overridden.sheets.find((sheet) => sheet.id === "A-05").scale, "1:100");
  assert.equal(overridden.sheets.find((sheet) => sheet.id === "A-06").scale, "1:100");
  assert.equal(overridden.sheets.find((sheet) => sheet.id === "A-10").scale, "1:50");

  const house = deserializeProject(readFileSync(new URL("../../../examples/constructflow-house-demo.cfproj", import.meta.url), "utf8"));
  const fitted = compilePermitDrawingSet(house);
  for (const sheetId of ["A-05", "A-06"])
    assert.equal(fitted.sheets.find((sheet) => sheet.id === sheetId).scale, "1:100", `${sheetId} should auto-fit a multi-storey house`);
  for (const sheetId of ["A-02", "A-03", "A-04", "A-05", "A-06", "A-07", "A-09", "A-10"]) {
    const viewSheet = fitted.sheets.find((sheet) => sheet.id === sheetId);
    assert.ok(!viewSheet.warnings.some((warning) => warning.startsWith("Schedule overflow:")), `${sheetId} must not inherit a model-schedule overflow warning`);
    assert.ok(!viewSheet.primitives.some((item) => item.kind === "text" && item.text === "Parameter"), `${sheetId} must not draw the generic model schedule over its view`);
  }
  for (const sheetId of ["A-05", "A-06"]) {
    const elevation = fitted.sheets.find((sheet) => sheet.id === sheetId);
    assert.ok(!elevation.primitives.some((item) => item.kind === "text" && item.text.includes("DB1")), `${sheetId} must not show an interior cabinet through the facade`);
    const labels = elevation.primitives.filter((item) => item.kind === "text").map((item) => item.text);
    assert.ok(!labels.includes("XZ") && !labels.includes("YZ"), `${sheetId} must not expose projection-axis codes as view labels`);
    assert.ok(labels.includes(sheetId === "A-05" ? "NORTH / ทิศเหนือ" : "SOUTH / ทิศใต้"));
    assert.ok(labels.includes(sheetId === "A-05" ? "EAST / ทิศตะวันออก" : "WEST / ทิศตะวันตก"));
  }
  const northElevation = fitted.sheets.find((sheet) => sheet.id === "A-05");
  assert.ok(northElevation.primitives.some((item) => item.kind === "text" && item.text === "W2"), "visible hosted windows need elevation marks");
  assert.ok(northElevation.primitives.some((item) => item.kind === "path" && item.closed && item.fill === "#ffffff" && item.width === 0.35), "visible hosted windows need a drawn frame and glass outline");
  assert.equal(fitted.sheets.find((sheet) => sheet.id === "A-10").scale, "1:100", "A-10 should fit the house plan and RCP views");
});

test("elevation wall faces preserve the shared phase palette in the compiled vectors", () => {
  const project = deserializeProject(readFileSync(new URL("../../../examples/constructflow-house-demo.cfproj", import.meta.url), "utf8"));
  const facadeWalls = Object.values(project.objects).filter((object) =>
    object.object_type === "architecture.wall" && isWallFacadeForElevation(object, "north"),
  );
  assert.ok(facadeWalls.length >= 3, "fixture needs enough north facade wall segments for phase coverage");
  facadeWalls[0].created_phase = "existing";
  facadeWalls[1].created_phase = "demolition";
  facadeWalls[2].created_phase = "new_construction";

  const elevation = compilePermitDrawingSet(project).sheets.find((sheet) => sheet.id === "A-05");
  const pathFills = new Set(elevation.primitives.filter((primitive) => primitive.kind === "path" && primitive.closed).map((primitive) => primitive.fill));
  for (const phase of ["existing", "demolition", "new_construction"]) {
    const style = resolveElevationWallPhaseStyle(phase);
    assert.ok(pathFills.has(style.fill), `${phase} wall faces must use their shared phase fill`);

    const isolated = createEmptyProjectDocument(`ELEVATION-${phase}`, `${phase} wall`);
    isolated.objects.wall = {
      id: "wall", object_type: "architecture.wall", created_phase: phase, level_refs: [], host_refs: [],
      module_data: { mark: "W1", level_id: "L1", start_point_mm: [0, 0, 0], end_point_mm: [4000, 0, 0], thickness_mm: 150, height_mm: 2800 },
    };
    const isolatedPaths = compilePermitDrawingSet(isolated).sheets.find((sheet) => sheet.id === "A-05").primitives
      .filter((primitive) => primitive.kind === "path" && !primitive.fill);
    assert.ok(isolatedPaths.some((primitive) => primitive.color === style.stroke), `${phase} wall outline must use its shared phase stroke`);
    if (style.dash.length)
      assert.ok(isolatedPaths.some((primitive) => primitive.color === style.stroke && primitive.dash?.join(",") === "2,1"), "demolition outline must retain the plot-scale dash pattern");
  }
});

test("A-10 plan object marks use model-centered anchors and do not overlap on the house demo", () => {
  const project = deserializeProject(readFileSync(new URL("../../../examples/constructflow-house-demo.cfproj", import.meta.url), "utf8"));
  const sheet = compilePermitDrawingSet(project).sheets.find((item) => item.id === "A-10");
  const markSet = new Set(Object.values(project.objects)
    .filter((object) => ["architecture.wall", "architecture.room", "architecture.floor", "architecture.ceiling", "door_window.door", "door_window.window", "electrical.fixture", "electrical.led_run", "interior.cabinet_run"].includes(object.object_type))
    .filter((object) => !object.module_data.level_id || object.module_data.level_id === project.project.active_level_id)
    .map((object) => String(object.module_data.mark ?? object.object_type)));
  const labels = sheet.primitives
    .filter((item) => item.kind === "text" && item.at[0] >= 18 && item.at[0] < 198 && markSet.has(item.text))
    .map((item) => ({ text: item.text, box: [item.at[0], item.at[1] - 1.6, item.at[0] + Math.min(25, Math.max(5, item.text.length * 1.25)), item.at[1] + 1.6] }));

  assert.ok(labels.length > 10, "the ground-floor drawing keeps its object marks");
  assert.ok(!sheet.warnings.some((warning) => warning.includes("could not place") && warning.includes("A-10")), "all demo object marks fit in the plan view");
  for (let left = 0; left < labels.length; left++) for (let right = left + 1; right < labels.length; right++) {
    const a = labels[left].box, b = labels[right].box;
    const overlaps = a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
    assert.ok(!overlaps, `${labels[left].text} and ${labels[right].text} overlap on A-10`);
  }
});

test("A-02 wall-face and object marks do not collide on the house demo", () => {
  const project = deserializeProject(readFileSync(new URL("../../../examples/constructflow-house-demo.cfproj", import.meta.url), "utf8"));
  const drawingSet = compilePermitDrawingSet(project);
  const sheet = drawingSet.sheets.find((item) => item.id === "A-02");
  const upperPlan = drawingSet.sheets.find((item) => item.id === "A-03");
  const demoStair = Object.values(project.objects).find((object) => object.object_type === "architecture.stair");
  assert.equal(demoStair.module_data.stair_type, "u_shape", "the demo stair follows the U-shaped modeled stairwell void");
  const markSet = new Set(Object.values(project.objects)
    .filter((object) => ["architecture.wall", "structure.column", "structure.beam", "structure.slab", "door_window.door", "door_window.window", "architecture.stair"].includes(object.object_type))
    .filter((object) => !object.module_data.level_id || object.module_data.level_id === project.project.active_level_id)
    .map((object) => String(object.module_data.mark ?? object.object_type)));
  const labels = sheet.primitives
    .filter((item) => item.kind === "text" && item.at[0] >= 140 && item.at[0] < 260 && item.at[1] >= 45 && item.at[1] < 165 && markSet.has(item.text))
    .map((item) => ({
      text: item.text,
      box: [item.at[0], item.at[1] - (item.text === "W1" || item.text === "W2" ? 2.2 : 1.6), item.at[0] + Number(item.max_width ?? Math.max(5, item.text.length * 1.25)), item.at[1] + 1],
    }));

  assert.ok(labels.length > 25, "A-02 keeps wall-face and structural object marks");
  assert.ok(!sheet.warnings.some((warning) => warning.includes("could not place wall-face marks")), "all house-demo wall-face marks fit when the full solid run is considered");
  assert.ok(!sheet.warnings.some((warning) => warning.includes("could not place stair")), "the stair tag and cut annotation fit outside the stair footprint");
  assert.ok(sheet.primitives.some((item) => item.kind === "text" && item.text === "แนวตัดบันได 1FL"), "the stair cut callout remains present outside its footprint");
  assert.ok(sheet.primitives.some((item) => item.kind === "text" && item.text === "UP"), "the ground plan indicates the stair ascends");
  assert.ok(!sheet.primitives.some((item) => item.kind === "text" && item.text === "DN"));
  assert.ok(upperPlan.primitives.some((item) => item.kind === "text" && item.text === "DN"), "the upper plan indicates the stair descends and reverses its arrow");
  assert.ok(!upperPlan.primitives.some((item) => item.kind === "text" && item.text === "UP"));
  for (let left = 0; left < labels.length; left++) for (let right = left + 1; right < labels.length; right++) {
    const a = labels[left].box, b = labels[right].box;
    const overlaps = a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
    assert.ok(!overlaps, `${labels[left].text} and ${labels[right].text} overlap on A-02`);
  }
});

test("A-02 and A-03 print room name, number, and model area inside each selected-level boundary", () => {
  const project = deserializeProject(readFileSync(new URL("../../../examples/constructflow-house-demo.cfproj", import.meta.url), "utf8"));
  const set = compilePermitDrawingSet(project);
  for (const [sheetId, expectedRooms] of [["A-02", ["Living / Dining", "Kitchen", "Bath / Guest", "Bedroom 1"]], ["A-03", ["Living / Dining", "Kitchen", "Bedroom 2", "Primary Bedroom"]]]) {
    const sheet = set.sheets.find((item) => item.id === sheetId);
    assert.ok(sheet, `${sheetId} compiles`);
    const labels = sheet.primitives.filter((item) => item.kind === "text").map((item) => item.text);
    for (const name of expectedRooms) assert.ok(labels.some((label) => label.includes(name)), `${sheetId} should label ${name}`);
    assert.ok(labels.includes("20.00 m²"), `${sheetId} room tags include model area in square meters`);
    assert.ok(!sheet.warnings.some((warning) => warning.includes("could not place room tag")), `${sheetId} places all room tags inside the view`);
  }
});

test("A-03 retains an interior room tag when a concave room centroid falls outside the room", () => {
  const project = deserializeProject(readFileSync(new URL("../../../examples/constructflow-house-demo.cfproj", import.meta.url), "utf8"));
  const room = Object.values(project.objects).find((object) => object.object_type === "architecture.room" && object.module_data.name === "Primary Bedroom");
  assert.ok(room);
  // L-shaped footprint: its area centroid lies in the missing upper-right notch.
  room.module_data.boundary_mm = [[4000, 5000], [8000, 5000], [8000, 5800], [4900, 5800], [4900, 10000], [4000, 10000]];
  room.module_data.area_mm2 = 4000 * 800 + 900 * 4200;

  const sheet = compilePermitDrawingSet(project).sheets.find((item) => item.id === "A-03");
  assert.ok(sheet);
  assert.ok(sheet.primitives.some((item) => item.kind === "text" && item.text.includes("Primary Bedroom")), "the concave room still gets its name tag");
  assert.ok(sheet.primitives.some((item) => item.kind === "text" && item.text === `${(room.module_data.area_mm2 / 1e6).toFixed(2)} m²`), "the tag retains the model area");
  assert.ok(!sheet.warnings.some((warning) => warning.includes("could not place room tag")), "the compiler finds an interior placement on the concave footprint");
});

test("elevation opening marks stay outside glazing and are not duplicated in the opening mesh", () => {
  const project = deserializeProject(readFileSync(new URL("../../../examples/constructflow-house-demo.cfproj", import.meta.url), "utf8"));
  const windowMarks = new Set(Object.values(project.objects)
    .filter((object) => object.object_type === "door_window.window")
    .map((object) => String(object.module_data.mark ?? "")));
  for (const sheetId of ["A-05", "A-06"]) {
    const sheet = compilePermitDrawingSet(project).sheets.find((item) => item.id === sheetId);
    const windowFrames = sheet.primitives
      .filter((item) => item.kind === "path" && item.closed && item.fill === "#ffffff" && item.points.length === 4)
      .map((item) => {
        const xs = item.points.map((point) => point[0]), ys = item.points.map((point) => point[1]);
        return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      })
      .filter(([left, top, right, bottom]) => right - left >= 10 && right - left <= 35 && bottom - top >= 5 && bottom - top <= 35);
    const labels = sheet.primitives.filter((item) => item.kind === "text" && windowMarks.has(item.text));
    assert.ok(windowFrames.length, `${sheetId} should contain projected window frames`);
    for (const [left, top, right, bottom] of windowFrames) {
      const hasNearbyMark = labels.some((label) => {
        const centerX = label.at[0] + Number(label.width ?? 0) / 2;
        return centerX >= left - 12 && centerX <= right + 12 &&
          ((label.at[1] >= top - 12 && label.at[1] <= top) || (label.at[1] >= bottom && label.at[1] <= bottom + 12));
      });
      assert.ok(hasNearbyMark, `${sheetId} each window frame needs a nearby mark`);
    }
    for (const label of labels) {
      for (const [left, top, right, bottom] of windowFrames) {
        assert.ok(
          label.at[0] < left - 0.25 || label.at[0] > right + 0.25 || label.at[1] < top - 0.25 || label.at[1] > bottom + 0.25,
          `${sheetId} ${label.text} opening mark at ${label.at.join(",")} must not be printed inside window frame ${[left, top, right, bottom].join(",")}`,
        );
      }
    }
  }
});

test("elevation wall and opening tags avoid horizontal level datums", () => {
  const project = deserializeProject(readFileSync(new URL("../../../examples/constructflow-house-demo.cfproj", import.meta.url), "utf8"));
  const marks = new Set(Object.values(project.objects)
    .filter((object) => object.object_type === "architecture.wall" || object.object_type === "door_window.door" || object.object_type === "door_window.window")
    .map((object) => String(object.module_data.mark ?? "")));
  const set = compilePermitDrawingSet(project);
  for (const sheetId of ["A-05", "A-06"]) {
    const sheet = set.sheets.find((item) => item.id === sheetId);
    const datums = sheet.primitives.filter((item) => item.kind === "path" && item.color === "#94a3b8" && item.width === 0.18 && item.dash?.length && item.points.length === 2 && Math.abs(item.points[0][1] - item.points[1][1]) < 1e-6);
    const labels = sheet.primitives.filter((item) => item.kind === "text" && marks.has(item.text));
    assert.ok(datums.length >= 6, `${sheetId} includes the two-view storey datums`);
    for (const label of labels) for (const datum of datums) {
      if (label.at[0] < datum.points[0][0] || label.at[0] > datum.points[1][0]) continue;
      assert.ok(Math.abs(label.at[1] - datum.points[0][1]) >= 3.25, `${sheetId} ${label.text} must clear the level datum at y=${datum.points[0][1]}`);
    }
  }
});

test("finished elevations omit footing geometry below grade", () => {
  const withFooting = deserializeProject(readFileSync(new URL("../../../examples/kitchen-extension-proof.cfproj", import.meta.url), "utf8"));
  const withoutFooting = structuredClone(withFooting);
  for (const [id, object] of Object.entries(withoutFooting.objects))
    if (object.object_type === "structure.foundation") delete withoutFooting.objects[id];
  for (const sheetId of ["A-05", "A-06"]) {
    const base = compilePermitDrawingSet(withoutFooting).sheets.find((sheet) => sheet.id === sheetId);
    const added = compilePermitDrawingSet(withFooting).sheets.find((sheet) => sheet.id === sheetId);
    assert.deepEqual(added.primitives, base.primitives, `${sheetId} should not project buried footing geometry`);
  }
});

test("elevation wall finish tags follow the visible face and omit end-on wall tags", () => {
  const project = deserializeProject(readFileSync(new URL("../../../examples/constructflow-house-demo.cfproj", import.meta.url), "utf8"));
  const wall = Object.values(project.objects).find((object) => object.object_type === "architecture.wall"
    && object.module_data.level_id === "GF"
    && object.module_data.start_point_mm?.[1] === 0
    && object.module_data.end_point_mm?.[1] === 0);
  assert.ok(wall, "the demo has a ground-level north facade wall");
  project.objects = { [wall.id]: wall };
  wall.module_data.interior_side = "left";
  wall.module_data.type_id = "elevation-wall-face-type";
  project.types = [{ id: "elevation-wall-face-type", object_type: "architecture.wall", name: "Wall finish", parameters: {
    inside_finish_mark: "INSIDE-FACE", outside_finish_mark: "OUTSIDE-FACE",
  } }];

  const north = compilePermitDrawingSet(project).sheets.find((sheet) => sheet.id === "A-05");
  const south = compilePermitDrawingSet(project).sheets.find((sheet) => sheet.id === "A-06");
  const marks = (sheet) => sheet.primitives.filter((item) => item.kind === "text" && ["INSIDE-FACE", "OUTSIDE-FACE"].includes(item.text)).map((item) => item.text);

  assert.deepEqual(marks(north), ["OUTSIDE-FACE"], "north elevation should show the exterior face of the ground-level wall");
  assert.deepEqual(marks(south), ["INSIDE-FACE"], "south elevation should show its opposite, interior face");

  wall.module_data.instance_overrides = { outside_finish_mark: "CUSTOM-OUTSIDE" };
  const overriddenNorth = compilePermitDrawingSet(project).sheets.find((sheet) => sheet.id === "A-05");
  assert.ok(overriddenNorth.primitives.some((item) => item.kind === "text" && item.text === "CUSTOM-OUTSIDE"), "an instance override takes precedence over the catalog wall face mark");
});

test("coplanar duplicate facade walls do not double-stroke elevation edges", () => {
  const project = createEmptyProjectDocument("ELEVATION-JOIN-LINES", "Facade join linework");
  project.objects["wall-a"] = {
    id: "wall-a", object_type: "architecture.wall", created_phase: "new_construction", level_refs: [], host_refs: [],
    module_data: { mark: "W1", start_point_mm: [0, 0, 0], end_point_mm: [4000, 0, 0], thickness_mm: 150, height_mm: 3000 },
  };
  const signature = (p) => compilePermitDrawingSet(p).sheets.find(sheet => sheet.id === "A-05").primitives
    .filter(primitive => primitive.kind === "path" && !primitive.fill && primitive.points?.length === 2)
    .map(({ points, width, color, stroke }) => JSON.stringify({ points, width, color, stroke }))
    .sort();
  const singleWallEdges = signature(project);

  project.objects["wall-b"] = { ...structuredClone(project.objects["wall-a"]), id: "wall-b" };
  assert.deepEqual(signature(project), singleWallEdges, "a coincident duplicate wall should not add darker duplicate CAD edges");
});

test("F04: drawTable handles overflow with multi-column auto-balance and header repetition", () => {
  const p = createEmptyProjectDocument("OVERFLOW-TEST", "อาคารทดสอบตารางล้น");

  // Add 40 door/window smart objects to populate schedule sheet A-08 (> 27 rows)
  for (let i = 1; i <= 40; i++) {
    const objId = `dw-${i}`;
    p.objects[objId] = {
      id: objId,
      object_type: i % 2 === 0 ? "door_window.swing_door" : "door_window.sliding_window",
      created_phase: "new_construction",
      level_refs: [],
      module_data: {
        mark: i % 2 === 0 ? `D${i}` : `W${i}`,
        type_id: i % 2 === 0 ? "D1" : "W1",
        width_mm: 900,
        height_mm: 2000,
      },
    };
  }

  const set = compilePermitDrawingSet(p);
  const a08 = set.sheets.find((s) => s.id === "A-08");
  assert.ok(a08, "Sheet A-08 should exist");

  // Verify that multi-column layout was created
  // Column 2 should have repeated header with "(ต่อ)"
  const textPrimitives = a08.primitives.filter((pr) => pr.kind === "text");
  const hasContinuationHeader = textPrimitives.some((t) => t.text.includes("(ต่อ)"));
  assert.ok(
    hasContinuationHeader,
    "Sheet A-08 should contain repeated table header with '(ต่อ)' in column 2",
  );

  // Verify headers have styled background fill
  const pathPrimitives = a08.primitives.filter((pr) => pr.kind === "path");
  const hasHeaderFills = pathPrimitives.some((p) => p.fill === "#f1f5f9");
  assert.ok(hasHeaderFills, "Table headers should have #f1f5f9 fill");

  // With 40 rows across 2 columns, it should NOT overflow onto secondary sheet yet
  assert.ok(
    !a08.warnings.some((w) => w.includes("Schedule overflow")),
    "40 rows should fit cleanly across 2 side-by-side columns without overflow warning",
  );
});

test("F04: drawTable handles extreme overflow (>70 rows) with continuation banner and warning", () => {
  const p = createEmptyProjectDocument("MASSIVE-TABLE", "อาคารทดสอบตารางยาวมาก");

  // Add 80 objects to exceed 2-column sheet capacity
  for (let i = 1; i <= 80; i++) {
    const objId = `col-${i}`;
    p.objects[objId] = {
      id: objId,
      object_type: "structure.column",
      created_phase: "new_construction",
      level_refs: [],
      module_data: {
        mark: `C${i}`,
        size_mm: [200, 200],
      },
    };
  }

  const set = compilePermitDrawingSet(p);
  const s05 = set.sheets.find((s) => s.id === "S-05");
  assert.ok(s05);

  // Check for continuation banner or secondary sheet warning
  const hasOverflowWarning = s05.warnings.some((w) => w.includes("Schedule overflow"));
  assert.ok(hasOverflowWarning, "Extreme table (>70 rows) should emit schedule overflow warning");

  const hasContinuationText = s05.primitives.some(
    (pr) => pr.kind === "text" && pr.text.includes("ตารางมีต่อในเอกสารแนบ"),
  );
  assert.ok(hasContinuationText, "Should render continuation banner on the sheet");
});

test("F04: Hidden-line solver and depth occlusion on elevations and section cuts", async () => {
  const p = createEmptyProjectDocument("HLS-TEST", "ทดสอบ Hidden-line solver");

  // Add front exterior wall at Y = 0 (foreground)
  p.objects["wall-front"] = {
    id: "wall-front",
    object_type: "architecture.wall",
    created_phase: "new_construction",
    level_refs: [],
    module_data: {
      mark: "W-FRONT",
      start_point_mm: [0, 0, 0],
      end_point_mm: [6000, 0, 0],
      thickness_mm: 150,
      height_mm: 3000,
    },
  };

  // Add interior column behind front wall at Y = 2000 (background)
  p.objects["col-interior"] = {
    id: "col-interior",
    object_type: "structure.column",
    created_phase: "new_construction",
    level_refs: [],
    module_data: {
      mark: "C-INT",
      location_mm: [3000, 2000, 0],
      section_mm: [200, 200],
      base_elevation_mm: 0,
      top_elevation_mm: 3000,
    },
  };

  p.objects["footing-interior"] = {
    id: "footing-interior",
    object_type: "structure.foundation",
    created_phase: "new_construction",
    level_refs: [],
    host_refs: [],
    module_data: {
      mark: "F-INT",
      center_mm: [3000, 2000, -200],
      size_mm: [800, 800, 400],
    },
  };

  const set = compilePermitDrawingSet(p);
  const a05 = set.sheets.find((s) => s.id === "A-05");
  assert.ok(a05, "Sheet A-05 (Elevation) should exist");

  // Check that front-facing surfaces have opaque surface masks with fill: "#ffffff"
  const paths = a05.primitives.filter((pr) => pr.kind === "path");
  const hasSurfaceMasks = paths.some((pr) => pr.fill === "#ffffff");
  assert.ok(hasSurfaceMasks, "Elevations should include opaque surface masks (fill: #ffffff)");
  assert.ok(
    paths.filter((pr) => pr.fill === "#ffffff").every((pr) => pr.width === 0),
    "Opaque elevation masks must not stroke mesh triangle seams across facades",
  );
  const elevationText = a05.primitives.filter((pr) => pr.kind === "text").map((pr) => pr.text);
  assert.ok(!elevationText.includes("C-INT"), "Finished elevations should not show tags for covered columns");
  assert.ok(!elevationText.includes("F-INT"), "Finished elevations should not show footing tags");
  assert.ok(
    paths.some((pr) => pr.fill === "#ffffff" && pr.closed && pr.points.length === 4 && Math.abs(Math.max(...pr.points.map((pt) => pt[0])) - Math.min(...pr.points.map((pt) => pt[0])) - 180) < 1e-6),
    "Building elevations should mask below-grade geometry before drawing the earth hatch",
  );

  const withFacadeColumn = structuredClone(p);
  withFacadeColumn.objects["col-facade"] = {
    id: "col-facade",
    object_type: "structure.column",
    created_phase: "new_construction",
    level_refs: [],
    module_data: { mark: "C-FACADE", location_mm: [3000, 0, 0], section_mm: [200, 200], base_elevation_mm: 0, top_elevation_mm: 3000 },
  };
  const withFacade = compilePermitDrawingSet(withFacadeColumn).sheets.find((sheet) => sheet.id === "A-05");
  const throughFacadeColumnEdges = withFacade.primitives.filter((primitive) =>
    primitive.kind === "path" && !primitive.fill && primitive.points.length === 2 &&
    primitive.points.every(([x]) => x >= 105 && x <= 111) &&
    Math.abs(primitive.points[1][1] - primitive.points[0][1]) > 20,
  );
  assert.equal(throughFacadeColumnEdges.length, 0, "a column covered by the exterior wall finish must not draw through the facade");

  // Check section sheet A-07
  const a07 = set.sheets.find((s) => s.id === "A-07");
  assert.ok(a07, "Sheet A-07 (Sections) should exist");

  // Verify that SVG string contains valid fill attributes
  assert.ok(a05.svg.includes('fill="#ffffff"'), "SVG should render fill attributes for surface masks");

  // Verify full PDF compilation succeeds with filled paths
  const fontBytes = readFileSync(new URL("../assets/Sarabun-Regular.ttf", import.meta.url));
  const pdfBytes = await compilePermitPdf(set, fontBytes);
  const pdf = await PDFDocument.load(pdfBytes);
  assert.equal(pdf.getPageCount(), 20, "20-page permit PDF should compile successfully");
});
