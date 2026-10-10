import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createEmptyProjectDocument,
  deserializeProject,
  resolveArchitectureSurfaceElevation,
  resolveBeamBaseElevation,
  resolveColumnVerticalExtent,
  resolveSlabElevation,
  resolveWallVerticalExtent,
} from "@constructflow/project-model";
import {
  compilePermitDrawingSet,
  compilePermitPdf,
} from "../dist/index.js";
import { isWallFacadeForElevation, resolveElevationWallPhaseStyle } from "@constructflow/representation-engine";
import { clippedStaggeredPlankSegments } from "@constructflow/geometry-kernel";
import { PDFDocument } from "pdf-lib";

test("A-02 compiles the shared staggered wood-floor pattern with its void clipped out", () => {
  const project = createEmptyProjectDocument("WOOD-FLOOR-PATTERN");
  project.levels = [{ id: "GF", name: "Ground", elevation_mm: 0, storey_index: 0, height_mm: 3000 }];
  project.project.active_level_id = "GF";
  const boundary = [[0, 0], [4000, 0], [4000, 2000], [0, 2000]];
  const voids = [[[1000, 500], [1500, 500], [1500, 900], [1000, 900]]];
  const spacing = [1200, 200];
  const origin = [0, 0];
  project.objects.floor = {
    id: "floor", object_type: "architecture.floor", owner_module: "constructflow.architecture", schema_version: 1,
    created_phase: "new_construction", removed_phase: null, status: "active",
    level_refs: [{ role: "base_level", level_id: "GF" }], host_refs: [], connector_refs: [], relationships: [],
    module_data: { mark: "AF1", level_id: "GF", elevation_reference: "level", elevation_mm: 0, elevation_offset_mm: 0,
      boundary_mm: boundary, voids_mm: voids, thickness_mm: 50, finish_layers: [{ mark: "Timber", material: "engineered_wood", thickness_mm: 15 }],
      finish_pattern_mm: spacing, finish_pattern_origin_mm: origin, finish_pattern_rotation_deg: 0 },
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  };
  const sheet = compilePermitDrawingSet(project, { viewports: { "A-02": { scale_denominator: 50 } } }).sheets.find(item => item.id === "A-02");
  const actual = sheet.primitives.filter(item => item.kind === "path" && item.width === 0.1 && item.color === "#cbd5e1" && item.points.length === 2);
  const generated = clippedStaggeredPlankSegments(boundary, spacing[0], spacing[1], voids, origin, 0);
  assert.ok(actual.length > 0, "the architectural plan includes timber seams and staggered end joints");
  const mapped = ([x, y]) => [205.5 + x / 50, 109 - y / 50];
  const signature = points => JSON.stringify(points.map(([x, y]) => [Number(x.toFixed(5)), Number(y.toFixed(5))]).sort((a, b) => a[0] - b[0] || a[1] - b[1]));
  const expectedSignatures = generated.map(([a, b]) => signature([mapped(a), mapped(b)]));
  const actualSignatures = actual.map(item => signature(item.points));
  const counts = values => values.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map());
  assert.deepEqual(counts(actualSignatures), counts(expectedSignatures), "the permit vectors use the shared rotated/staggered geometry, clipped at the void");
});

test("A-07 cuts architectural floor section bands around modeled voids at the resolved level", () => {
  const project = createEmptyProjectDocument("SECTION-FLOOR-VOID");
  project.levels = [{ id: "L2", name: "Level 2", elevation_mm: 3000, storey_index: 1, height_mm: 3000 }];
  project.project.active_level_id = "L2";
  project.objects.floor = {
    id: "floor", object_type: "architecture.floor", owner_module: "constructflow.architecture", schema_version: 1,
    created_phase: "new_construction", removed_phase: null, status: "active",
    level_refs: [{ role: "base_level", level_id: "L2" }], host_refs: [], connector_refs: [], relationships: [],
    module_data: {
      mark: "AF1", level_id: "L2", elevation_reference: "level", elevation_mm: 3200, elevation_offset_mm: 200,
      boundary_mm: [[0, 0], [4000, 0], [4000, 4000], [0, 4000]],
      voids_mm: [[[1500, 1500], [2500, 1500], [2500, 2500], [1500, 2500]]],
      thickness_mm: 60, finish_layers: [{ mark: "Tile", material: "porcelain_tile", thickness_mm: 10 }],
    },
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  };

  const sheet = compilePermitDrawingSet(project, { viewports: { "A-07": { scale_denominator: 100, section_cut_mm: 2000 } } }).sheets.find(item => item.id === "A-07");
  const bands = sheet.primitives.filter(item => item.kind === "path" && item.closed && item.width === 0.25 && item.color === "#334155" && item.fill === "#e3e8ed");
  assert.equal(bands.length, 4, "both orthogonal section panels split the floor band into the two runs around the void");
  assert.ok(sheet.source_object_ids.includes("floor"), "the section sheet retains the architectural floor as a source object");
  assert.ok(!sheet.warnings.some(warning => warning.includes("surface level/elevation reference is invalid")));
  const bandWidths = bands.map(band => Math.max(...band.points.map(point => point[0])) - Math.min(...band.points.map(point => point[0])));
  assert.ok(bandWidths.every(width => width > 0 && width < 80), "each of the four floor runs is shorter than its full section panel because the void cuts through it");
});

test("house demo keeps the existing grade datum and places its two finished floors and eaves correctly", () => {
  const house = deserializeProject(readFileSync(new URL("../../../examples/constructflow-house-demo.cfproj", import.meta.url), "utf8"));
  const levels = Object.fromEntries(house.levels.map(level => [level.id, level.elevation_mm]));
  assert.deepEqual({ floor1: levels.GF, floor2: levels.L1, eaves: levels.RF }, { floor1: 400, floor2: 3300, eaves: 6500 });

  const floors = Object.values(house.objects).filter(object => object.object_type === "architecture.floor");
  assert.equal(floors.filter(floor => floor.module_data.level_id === "GF").length, 4);
  assert.equal(floors.filter(floor => floor.module_data.level_id === "L1").length, 4);
  assert.ok(floors.filter(floor => floor.module_data.level_id === "GF").every(floor => resolveArchitectureSurfaceElevation(house, floor) === 400));
  assert.ok(floors.filter(floor => floor.module_data.level_id === "L1").every(floor => resolveArchitectureSurfaceElevation(house, floor) === 3300));

  const slabs = Object.values(house.objects).filter(object => object.object_type === "structure.slab");
  assert.deepEqual(slabs.map(slab => resolveSlabElevation(house, slab)), [280, 3180]);
  const walls = Object.values(house.objects).filter(object => object.object_type === "architecture.wall");
  const firstFloorWalls = walls.filter(wall => wall.module_data.level_id === "GF");
  const secondFloorWalls = walls.filter(wall => wall.module_data.level_id === "L1");
  assert.ok(firstFloorWalls.every(wall => resolveWallVerticalExtent(house, wall)?.top_elevation_mm === 3100));
  assert.ok(secondFloorWalls.every(wall => resolveWallVerticalExtent(house, wall)?.top_elevation_mm === 6300));

  const columns = Object.values(house.objects).filter(object => object.object_type === "structure.column");
  assert.ok(columns.every(column => {
    const extent = resolveColumnVerticalExtent(house, column);
    return extent?.base_elevation_mm === 0 && extent.top_elevation_mm === 6500;
  }));
  const upperBeams = Object.values(house.objects).filter(object => object.object_type === "structure.beam" && object.module_data.level_id === "L1");
  assert.ok(upperBeams.length > 0 && upperBeams.every(beam => resolveBeamBaseElevation(house, beam) === 6500));
  const stair = Object.values(house.objects).find(object => object.object_type === "architecture.stair");
  assert.equal(stair.module_data.start_point_mm[2], 400, "the stair starts at the raised first-floor datum");
  assert.equal(stair.module_data.total_rise_mm, 2900, "the stair rises from +0.400 to +3.300");
  const cabinet = Object.values(house.objects).find(object => object.object_type === "interior.cabinet_run");
  assert.equal(cabinet.module_data.location_mm[2], 400, "built-in cabinetry sits on the raised finished floor");

  const groundPlan = compilePermitDrawingSet(house).sheets.find(sheet => sheet.id === "A-02");
  const planLabels = groundPlan.primitives.filter(item => item.kind === "text").map(item => item.text);
  assert.ok(planLabels.includes("4.00 m") && planLabels.includes("5.00 m"), "A-02 adds grid-to-grid dimension strings from the model grid positions");
  assert.ok(planLabels.includes("W1 1.40×1.20 m"), "A-02 adds a width-by-height dimension string for a hosted window");
  assert.ok(planLabels.includes("8.20 m") && planLabels.includes("10.20 m"), "A-02 adds overall dimensions from the current exterior model bounds");
  const noGrid = structuredClone(house);
  for (const object of Object.values(noGrid.objects)) if (object.object_type === "structure.grid") delete noGrid.objects[object.id];
  const columnPlanLabels = compilePermitDrawingSet(noGrid).sheets.find(sheet => sheet.id === "A-02").primitives.filter(item => item.kind === "text").map(item => item.text);
  assert.ok(columnPlanLabels.includes("4.00 m") && columnPlanLabels.includes("5.00 m"), "column centerlines provide dimension chains when no grid system is modeled");
  const gridAndColumnLabels = compilePermitDrawingSet(house).sheets.find(sheet => sheet.id === "A-02").primitives.filter(item => item.kind === "text").map(item => item.text);
  assert.ok(gridAndColumnLabels.filter(label => label === "4.00 m" || label === "5.00 m").length >= 4, "column rows retain explicit dimension chains when grids are also present");
});

test("A-02 persists locked dimension placement while keeping opening values model-derived, including angled hosts", () => {
  const house = deserializeProject(readFileSync(new URL("../../../examples/constructflow-house-demo.cfproj", import.meta.url), "utf8"));
  const opening = Object.values(house.objects).find(object => object.object_type === "door_window.window" && object.module_data.level_id === "GF");
  assert.ok(opening);
  const id = `opening:${opening.id}:width`;
  const viewport = { scale_denominator: 100, dimension_overrides: { [id]: { offset_mm: [7, -4], locked: true } } };
  const moved = compilePermitDrawingSet(house, { viewports: { "A-02": viewport } }).sheets.find(sheet => sheet.id === "A-02");
  const label = moved.primitives.find(item => item.kind === "text" && item.text.startsWith(`${opening.module_data.mark} `));
  assert.ok(label, "the hosted opening still gets a dimension label");
  const base = compilePermitDrawingSet(house).sheets.find(sheet => sheet.id === "A-02");
  const baseLabel = base.primitives.find(item => item.kind === "text" && item.text === label.text);
  assert.ok(baseLabel);
  assert.deepEqual(label.at.map((value, index) => Number((value - baseLabel.at[index]).toFixed(5))), [7, -4]);
  assert.match(label.text, /1\.40×1\.20 m/, "the printed value continues to come from current opening parameters");

  const host = house.objects[opening.module_data.wall_id];
  host.module_data.start_point_mm = [1000, 1000, 400];
  host.module_data.end_point_mm = [7000, 5000, 400];
  host.module_data.length_mm = Math.hypot(6000, 4000);
  const angled = compilePermitDrawingSet(house).sheets.find(sheet => sheet.id === "A-02");
  assert.ok(angled.primitives.some(item => item.kind === "text" && item.text.startsWith(`${opening.module_data.mark} 1.40×1.20 m`)), "angled hosted walls receive the same associative opening dimension");
});

test("A-05 and A-06 use a legible residential default scale while preserving explicit viewport scales", async () => {
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
    assert.ok(!labels.some((label) => label.includes("review required")), `${sheetId} must not print a generic internal review note`);
    assert.ok(!elevation.warnings.some((warning) => warning.includes("Projected vector edges")), `${sheetId} keeps view-quality review separate from project warnings`);
    assert.ok(!labels.includes("XZ") && !labels.includes("YZ"), `${sheetId} must not expose projection-axis codes as view labels`);
    assert.ok(labels.includes(sheetId === "A-05" ? "NORTH / ทิศเหนือ" : "SOUTH / ทิศใต้"));
    assert.ok(labels.includes(sheetId === "A-05" ? "EAST / ทิศตะวันออก" : "WEST / ทิศตะวันตก"));
  }
  const northElevation = fitted.sheets.find((sheet) => sheet.id === "A-05");
  const middleColumnHeadTicks = northElevation.primitives.filter((item) =>
    item.kind === "path" && !item.fill && item.points.length === 2 &&
    item.points.every((point) => point[0] >= 250 && point[0] <= 357 && point[1] >= 90.5 && point[1] <= 91.5) &&
    Math.abs(item.points[1][1] - item.points[0][1]) < 1e-6 &&
    item.points.every((point) => point[0] >= 300 && point[0] <= 305) &&
    Math.abs(Math.hypot(item.points[1][0] - item.points[0][0], item.points[1][1] - item.points[0][1]) - 2) < 1e-6,
  );
  assert.equal(middleColumnHeadTicks.length, 0, "the upper column cap at the wall join must be covered when it lies on the opaque wall-top boundary");
  assert.ok(northElevation.primitives.some((item) => item.kind === "text" && item.text === "W2"), "visible hosted windows need elevation marks");
  assert.ok(northElevation.primitives.some((item) => item.kind === "path" && item.closed && item.fill === "#ffffff" && item.width === 0.35), "visible hosted windows need a drawn frame and glass outline");
  assert.equal(fitted.sheets.find((sheet) => sheet.id === "A-10").scale, "1:100", "A-10 should fit the house plan and RCP views");
  for (const sheetId of ["A-02", "A-03", "A-05", "A-06", "A-10"]) {
    const sheet = fitted.sheets.find((candidate) => candidate.id === sheetId);
    assert.ok(!sheet.warnings.some((warning) => warning.startsWith("Viewport clips model")), `${sheetId} should fit the full house-demo geometry at its compiled scale`);
  }
  const pdfBytes = await compilePermitPdf(fitted, readFileSync(new URL("../assets/Sarabun-Regular.ttf", import.meta.url)));
  const pdf = await PDFDocument.load(pdfBytes);
  assert.equal(pdf.getPageCount(), 22, "the house demo adds independent sheets for its remaining storeys");
  assert.match(pdf.getTitle(), /22-sheet draft$/, "PDF metadata should report the actual compiled sheet count");
  assert.equal(fitted.sheets.find((sheet) => sheet.id === "A-10").primitives.find((item) => item.kind === "text" && item.at[0] === 372 && item.at[1] === 282)?.text, "10 / 22");
  assert.equal(fitted.sheets.at(-1).primitives.find((item) => item.kind === "text" && item.at[0] === 372 && item.at[1] === 282)?.text, "22 / 22");
});

test("S-06 blocks an approved issue set when beam BBS source sets are absent", () => {
  const project = deserializeProject(readFileSync(new URL("../../../examples/constructflow-house-demo.cfproj", import.meta.url), "utf8"));
  project.legal_metadata = {
    deed_no: "TEST-1",
    land_no: "1",
    survey_page: "1",
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
      front_m: 3,
      rear_m: 2,
      left_m: 2,
      right_m: 2,
      min_opening_setback_m: 2,
      min_blind_setback_m: 0.5,
    },
    zoning: {
      zone_code: "ย.4-12",
      far_limit: 3,
      osr_min_percent: 10,
      permeable_open_space_ratio_percent: 50,
    },
    signatories: {
      owner_name: "นายสมชาย เจริญสุข",
      architect_name: "นายสถาปัตย์ มั่นคง",
      architect_license_no: "ส-สถ. 1",
      structural_engineer_name: "นายวิศวกร ปลอดภัย",
      structural_engineer_license_no: "วส. 1",
      issue_approved: true,
    },
  };
  const set = compilePermitDrawingSet(project);
  const s06 = set.sheets.find((sheet) => sheet.id === "S-06");
  assert.equal(s06.status, "missing_data");
  assert.ok(s06.warnings.some((warning) => warning.includes("BBS reinforcement is incomplete for 24 of 24 modeled beams")));
  assert.equal(set.issue_ready, false);
});

test("S-06 requires top, bottom, and stirrup sets on each beam, not any unrelated rebar set", () => {
  const project = deserializeProject(readFileSync(new URL("../../../examples/constructflow-house-demo.cfproj", import.meta.url), "utf8"));
  const beam = Object.values(project.objects).find((object) => object.object_type === "structure.beam");
  assert.ok(beam);
  const d = beam.module_data;
  const rebarId = crypto.randomUUID();
  project.objects[rebarId] = {
    id: rebarId,
    object_type: "structure.rebar_set",
    owner_module: "constructflow.structure",
    schema_version: 1,
    created_phase: beam.created_phase,
    removed_phase: null,
    level_refs: [{ role: "host_level", level_id: d.level_id }],
    host_refs: [beam.id],
    connector_refs: [],
    status: "active",
    module_data: {
      host_id: beam.id,
      level_id: d.level_id,
      mark: `${d.mark}-top`,
      role: "top",
      mode: "longitudinal",
      grade: "SD40",
      diameter_mm: 16,
      cover_mm: 40,
      count: 2,
      bend_radius_mm: 0,
      hook_angle_deg: 0,
      hook_extension_mm: 0,
      lap_mm: 0,
      legs_mm: [],
      spacing_zones: [],
    },
  };
  const set = compilePermitDrawingSet(project);
  const s06 = set.sheets.find((sheet) => sheet.id === "S-06");
  assert.ok(s06.warnings.some((warning) => warning.includes("BBS reinforcement is incomplete for 24 of 24 modeled beams")));
  assert.equal(s06.status, "missing_data");
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

test("A-10 plan marks and RCP ceiling labels avoid collisions and grid overdraw on the house demo", () => {
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
  const fixtureMarks = labels.filter(({ text }) => ["SW1", "LED1"].includes(text));
  const modelLineBoxes = sheet.primitives
    .filter((item) => item.kind === "path" && item.width >= 0.25)
    .flatMap((item) => item.points.slice(1).map((point, index) => {
      const previous = item.points[index], clearance = item.width / 2;
      return [
        Math.min(previous[0], point[0]) - clearance,
        Math.min(previous[1], point[1]) - clearance,
        Math.max(previous[0], point[0]) + clearance,
        Math.max(previous[1], point[1]) + clearance,
      ];
    }));
  assert.deepEqual(fixtureMarks.map(({ text }) => text).sort(), ["LED1", "SW1"], "both lower-plan electrical tags remain present");
  for (const label of fixtureMarks) {
    assert.ok(!modelLineBoxes.some(([left, top, right, bottom]) =>
      label.box[0] < right && label.box[2] > left && label.box[1] < bottom && label.box[3] > top,
    ), `${label.text} must not cover a plotted model line`);
  }

  const ceilingLabels = sheet.primitives
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.kind === "text" && item.text.startsWith("CL1:"));
  assert.equal(ceilingLabels.length, 4, "each of the four house-demo ceilings gets a level/material label");
  const ceilingLabelBoxes = ceilingLabels.map(({ item }) => ({
    text: item.text,
    box: [item.at[0] - 0.8, item.at[1] - item.size - 0.4, item.at[0] + Number(item.max_width) + 0.8, item.at[1] + 0.4],
  }));
  for (let left = 0; left < ceilingLabelBoxes.length; left++) for (let right = left + 1; right < ceilingLabelBoxes.length; right++) {
    const a = ceilingLabelBoxes[left].box, b = ceilingLabelBoxes[right].box;
    assert.ok(!(a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]), `${ceilingLabelBoxes[left].text} labels must not overlap`);
  }
  const ceilingGridIndices = sheet.primitives
    .map((item, index) => item.kind === "path" && item.width === 0.12 && item.color === "#94a3b8" && !item.dash?.length ? index : -1)
    .filter(index => index >= 0);
  const ceilingLabelMaskIndices = ceilingLabels.map(({ index }) => sheet.primitives
    .slice(0, index)
    .map((item, itemIndex) => item.kind === "path" && item.closed && item.fill === "#ffffff" && !item.dash ? itemIndex : -1)
    .filter(itemIndex => itemIndex >= 0)
    .at(-1));
  assert.ok(ceilingGridIndices.length > 0 && ceilingLabelMaskIndices.every(Number.isInteger));
  assert.ok(Math.max(...ceilingGridIndices) < Math.min(...ceilingLabelMaskIndices), "all ceiling labels and white knockouts render after every RCP grid line");
});

test("A-02 wall-face and object marks do not collide on the house demo", () => {
  const project = deserializeProject(readFileSync(new URL("../../../examples/constructflow-house-demo.cfproj", import.meta.url), "utf8"));
  const drawingSet = compilePermitDrawingSet(project);
  const sheet = drawingSet.sheets.find((item) => item.id === "A-02");
  const upperPlan = drawingSet.sheets.find((item) => item.id === "A-03");
  for (const plan of [sheet, upperPlan])
    assert.ok(!plan.warnings.some((warning) => warning.startsWith(`${plan.id}: could not place `)), `${plan.id} places every object mark clear of unrelated model geometry`);
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
  assert.ok(!sheet.primitives.some((item) => item.kind === "path" && item.width === 0.45), "the stair cut is one light diagonal line, not a heavy double slash");
  assert.ok(sheet.primitives.some((item) => item.kind === "text" && item.text === "UP"), "the ground plan indicates the stair ascends");
  assert.ok(!sheet.primitives.some((item) => item.kind === "text" && item.text === "DN"));
  assert.ok(upperPlan.primitives.some((item) => item.kind === "text" && item.text === "DN"), "the upper plan indicates the stair descends and reverses its arrow");
  assert.ok(!upperPlan.primitives.some((item) => item.kind === "text" && item.text === "UP"));
  const floorGridIndices = sheet.primitives
    .map((item, index) => item.kind === "path" && item.color === "#cbd5e1" && item.width === 0.1 && !item.dash ? index : -1)
    .filter(index => index >= 0);
  const stairMarkIndex = sheet.primitives.findIndex(item => item.kind === "text" && item.text === "ST1");
  assert.ok(floorGridIndices.length > 0 && stairMarkIndex >= 0);
  assert.ok(Math.max(...floorGridIndices) < stairMarkIndex, "architectural floor tile courses render below stair linework and its mark");
  for (let left = 0; left < labels.length; left++) for (let right = left + 1; right < labels.length; right++) {
    const a = labels[left].box, b = labels[right].box;
    const overlaps = a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
    assert.ok(!overlaps, `${labels[left].text} and ${labels[right].text} overlap on A-02`);
  }
});

test("A-07 section object marks are deduplicated and collision packed on the house demo", () => {
  const project = deserializeProject(readFileSync(new URL("../../../examples/constructflow-house-demo.cfproj", import.meta.url), "utf8"));
  const sheet = compilePermitDrawingSet(project).sheets.find((item) => item.id === "A-07");
  const modeledSurfaces = Object.values(project.objects).filter(object => object.object_type === "architecture.floor" || object.object_type === "architecture.ceiling");
  const sectionSurfaceBands = sheet.primitives.filter(item => item.kind === "path" && item.closed && item.width === 0.25 && item.color === "#334155" && item.fill === "#e3e8ed");
  assert.equal(sectionSurfaceBands.length, modeledSurfaces.length, "both A-07 panels cut every house-demo architectural floor and ceiling at the resolved level");
  assert.ok(modeledSurfaces.every(surface => sheet.source_object_ids.includes(surface.id)), "the A-07 sheet tracks each sectioned architectural surface as a source object");
  assert.ok(!sheet.warnings.some(warning => warning.includes("surface level/elevation reference is invalid in section")));
  const marks = new Set(Object.values(project.objects).map((object) => String(object.module_data.mark ?? object.object_type)));
  const labels = sheet.primitives
    .filter((item) => item.kind === "text" && marks.has(item.text) && item.at[0] >= 18 && item.at[0] < 393 && item.at[1] >= 40 && item.at[1] < 178)
    .map((item) => ({
      text: item.text,
      box: [item.at[0], item.at[1] - 2.8, item.at[0] + Number(item.max_width ?? item.text.length * 1.35), item.at[1] + 1.2],
    }));
  assert.ok(labels.length > 20, "both section views retain their object marks");
  for (let left = 0; left < labels.length; left++) for (let right = left + 1; right < labels.length; right++) {
    const a = labels[left].box, b = labels[right].box;
    assert.ok(!(a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]), `${labels[left].text} and ${labels[right].text} overlap on A-07`);
  }
  assert.ok(!sheet.warnings.some((warning) => warning.startsWith("A-07: could not place section mark")), "every visible section mark receives a clear location");
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

test("A-02 and A-03 flag open room loops and omit their stale area labels", () => {
  const project = deserializeProject(readFileSync(new URL("../../../examples/constructflow-house-demo.cfproj", import.meta.url), "utf8"));
  const rooms = Object.values(project.objects).filter((object) => object.object_type === "architecture.room");
  const groundRoom = rooms.find((room) => room.module_data.name === "Living / Dining");
  const upperRoom = rooms.find((room) => room.module_data.name === "Primary Bedroom");
  assert.ok(groundRoom && upperRoom);
  groundRoom.module_data.boundary_status = "unclosed";
  groundRoom.module_data.area_mm2 = 12_345_678;
  upperRoom.module_data.boundary_status = "unclosed";
  upperRoom.module_data.area_mm2 = 23_456_789;

  const set = compilePermitDrawingSet(project);
  for (const [sheetId, name, staleArea, mark] of [
    ["A-02", "Living / Dining", "12.35 m²", String(groundRoom.module_data.mark)],
    ["A-03", "Primary Bedroom", "23.46 m²", String(upperRoom.module_data.mark)],
  ]) {
    const sheet = set.sheets.find((item) => item.id === sheetId);
    const tags = sheet.primitives.filter((item) => item.kind === "text").map((item) => item.text);
    const roomTag = sheet.primitives.find((item) => item.kind === "text" && item.text.includes(name));
    assert.ok(roomTag?.text.includes("วงผนังเปิด"), `${sheetId} marks ${name} as open`);
    assert.equal(roomTag.color, "#b91c1c", `${sheetId} uses the review color for the stale room`);
    assert.ok(!tags.includes(staleArea), `${sheetId} does not present the stale ${staleArea} as current`);
    assert.ok(tags.includes("20.00 m²"), `${sheetId} keeps current area labels on closed rooms`);
    assert.ok(sheet.warnings.some((warning) => warning.includes(`${mark}: wall loop no longer closes`)));
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
        const labelLeft = label.at[0], labelRight = labelLeft + Number(label.max_width ?? 0);
        const labelTop = label.at[1] - 1.2, labelBottom = label.at[1] + 1.2;
        const horizontalGap = Math.max(left - labelRight, labelLeft - right, 0);
        const verticalGap = Math.max(top - labelBottom, labelTop - bottom, 0);
        return horizontalGap <= 12 && verticalGap <= 12;
      });
      assert.ok(hasNearbyMark, `${sheetId} each window frame needs a nearby mark`);
    }
    for (const label of labels) {
      for (const [left, top, right, bottom] of windowFrames) {
        const labelLeft = label.at[0], labelRight = labelLeft + Number(label.max_width ?? 0);
        const labelTop = label.at[1] - 1.2, labelBottom = label.at[1] + 1.2;
        assert.ok(
          labelLeft >= right - 0.25 || labelRight <= left + 0.25 || labelTop >= bottom - 0.25 || labelBottom <= top + 0.25,
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

test("elevation datum labels sit below their lines clear of ground hatch", () => {
  const project = deserializeProject(readFileSync(new URL("../../../examples/constructflow-house-demo.cfproj", import.meta.url), "utf8"));
  const set = compilePermitDrawingSet(project);
  for (const sheetId of ["A-05", "A-06"]) {
    const sheet = set.sheets.find((item) => item.id === sheetId);
    const datums = sheet.primitives.filter((item) => item.kind === "path" && item.color === "#94a3b8" && item.width === 0.18 && item.dash?.length && item.points.length === 2 && Math.abs(item.points[0][1] - item.points[1][1]) < 1e-6);
    const labels = sheet.primitives.filter((item) => item.kind === "text" && /^\+?\d+\.\d{2} (Ground Floor|First Floor|Roof Level)$/.test(item.text));
    assert.equal(labels.length, datums.length, `${sheetId} has one named label for every storey datum`);
    for (const label of labels) {
      const datum = datums.find((item) => label.at[0] >= item.points[0][0] && label.at[0] <= item.points[1][0] && Math.abs(label.at[1] - item.points[0][1]) < 10);
      assert.ok(datum, `${sheetId} ${label.text} maps to a storey datum`);
      assert.ok(label.at[1] <= datum.points[0][1] - 3.5, `${sheetId} ${label.text} clears its datum line`);
    }
    const groundLabel = sheet.primitives.find((item) => item.kind === "text" && item.text.startsWith("±0.000 GL"));
    assert.ok(groundLabel, `${sheetId} keeps the existing ground datum label`);
    const groundLine = sheet.primitives.find((item) => item.kind === "path" && item.color === "#0f172a" && item.width === 0.7 && item.points.length === 2 && Math.abs(item.points[0][1] - item.points[1][1]) < 1e-6);
    assert.ok(groundLine && groundLabel.at[1] <= groundLine.points[0][1] - 4.5, `${sheetId} ground label clears the diagonal ground hatch`);
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
    && object.module_data.start_point_mm?.[1] === -50
    && object.module_data.end_point_mm?.[1] === -50);
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

test("Pillar 2: S-05 and S-06 compile detailed structural cards (3-section detailing, cantilever, and eccentric footing)", () => {
  const p = createEmptyProjectDocument("STRUCT-DETAIL", "ทดสอบแบบขยายโครงสร้าง S-05 และ S-06");
  const levelId = p.levels[0].id;
  const colId = "col-1";
  const fndId = "fnd-ecc";
  const beamId = "beam-7m";
  const cantId = "beam-cant";

  p.objects[colId] = {
    id: colId,
    object_type: "structure.column",
    created_phase: "new_construction",
    level_refs: [{ role: "base_level", level_id: levelId }],
    host_refs: [],
    module_data: {
      mark: "C1",
      location_mm: [1000, 1000, 0],
      section_mm: [250, 250],
      base_level_id: levelId,
      base_elevation_mm: 0,
      top_elevation_mm: 3500,
    },
  };

  p.objects[fndId] = {
    id: fndId,
    object_type: "structure.foundation",
    created_phase: "new_construction",
    level_refs: [],
    host_refs: [colId],
    module_data: {
      mark: "F-ECC",
      foundation_type: "eccentric_footing",
      center_mm: [1000, 1000, -300],
      size_mm: [1000, 1000, 350],
      eccentric_offset_mm: [200, 0],
      supported_column_id: colId,
      material: "reinforced_concrete",
    },
  };

  p.objects[beamId] = {
    id: beamId,
    object_type: "structure.beam",
    created_phase: "new_construction",
    level_refs: [{ role: "base_level", level_id: levelId }],
    host_refs: [colId],
    module_data: {
      mark: "B1",
      start_point_mm: [0, 0, 3500],
      end_point_mm: [7000, 0, 3500],
      section_mm: [250, 600],
      span_mm: 7000,
      level_id: levelId,
      beam_system: "continuous",
      skin_rebar_required: true,
      material: "reinforced_concrete",
    },
  };

  p.objects[cantId] = {
    id: cantId,
    object_type: "structure.beam",
    created_phase: "new_construction",
    level_refs: [{ role: "base_level", level_id: levelId }],
    host_refs: [colId],
    module_data: {
      mark: "CB1",
      start_point_mm: [1000, 1000, 3500],
      end_point_mm: [3000, 1000, 3500],
      section_mm: [200, 400],
      span_mm: 2000,
      level_id: levelId,
      beam_system: "cantilever",
      material: "reinforced_concrete",
    },
  };

  const set = compilePermitDrawingSet(p);
  const s05 = set.sheets.find((sheet) => sheet.id === "S-05");
  assert.ok(s05, "Sheet S-05 exists");
  const s05Texts = s05.primitives.filter((pr) => pr.kind === "text").map((pr) => pr.text);
  assert.ok(s05Texts.some((t) => t.includes("แบบขยายฐานรากและเสา")), "S-05 includes footing & column card header");
  assert.ok(s05Texts.some((t) => t.includes("ฐานรากตีนเป็ดชิดเขต")), "S-05 includes eccentric footing detailing");
  assert.ok(s05Texts.some((t) => t.includes("คานดึงรั้ง (Strap Beam)")), "S-05 includes strap beam specification");

  const s06 = set.sheets.find((sheet) => sheet.id === "S-06");
  assert.ok(s06, "Sheet S-06 exists");
  const s06Texts = s06.primitives.filter((pr) => pr.kind === "text").map((pr) => pr.text);
  assert.ok(s06Texts.some((t) => t.includes("แบบขยายคานและไดอะแกรมการเสริมเหล็ก 3 ตอน")), "S-06 includes 3-section schedule header");
  assert.ok(s06Texts.some((t) => t.includes("คาน B1 (250 × 600 mm)")), "S-06 includes 25x60cm beam card");
  assert.ok(s06Texts.some((t) => t.includes("รูปตัด 1-1")), "S-06 includes Section 1-1");
  assert.ok(s06Texts.some((t) => t.includes("รูปตัด 2-2")), "S-06 includes Section 2-2");
  assert.ok(s06Texts.some((t) => t.includes("รูปตัด 3-3")), "S-06 includes Section 3-3");
  assert.ok(s06Texts.some((t) => t.includes("เหล็กข้างคาน 2-DB12")), "S-06 includes side skin rebar text for 25x60 beam");
});
