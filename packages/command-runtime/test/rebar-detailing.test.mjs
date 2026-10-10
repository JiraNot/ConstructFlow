import test from "node:test";
import assert from "node:assert/strict";
import {
  createEmptyProjectDocument,
  serializeProject,
  deserializeProject,
} from "@constructflow/project-model";
import { CommandBus, ProjectCommandSession } from "../dist/index.js";
import { calculateBBS } from "@constructflow/structure-engine";
import { constructionOutputs } from "@constructflow/domain-providers";

const empty = () => createEmptyProjectDocument(crypto.randomUUID());
const run = (p, name, input) => {
  const r = CommandBus.execute(p, name, input);
  assert.equal(r.result.status, "success", JSON.stringify(r.result));
  return r.updatedProject;
};

test("Footing & Column BBS detailing: ConfigureColumnReinforcement and ConfigureFoundationReinforcement", () => {
  let p = empty();
  const levelId = p.levels[0].id;
  const colId = crypto.randomUUID();
  const fndId = crypto.randomUUID();

  // 1. Create a column (200x200 mm, height 3000 mm)
  p = run(p, "CreateColumn", {
    id: colId,
    mark: "C1",
    location_mm: [1000, 1000, 0],
    section_mm: [200, 200],
    base_level_id: levelId,
    base_elevation_mm: 0,
    top_elevation_mm: 3000,
    material: "reinforced_concrete",
  });

  // 2. Configure Column Reinforcement: 4-DB16 main bars and RB6 seismic ties
  p = run(p, "ConfigureColumnReinforcement", {
    host_id: colId,
    reinforcement: {
      main: {
        mode: "longitudinal",
        grade: "SD40",
        diameter_mm: 16,
        cover_mm: 30,
        count: 4,
        bend_radius_mm: 32,
        hook_angle_deg: 0,
        hook_extension_mm: 0,
        lap_mm: 640, // 40 * db
        legs_mm: [],
        spacing_zones: [],
      },
      ties: {
        mode: "stirrups",
        grade: "SR24",
        diameter_mm: 6,
        cover_mm: 25,
        count: 1,
        bend_radius_mm: 12,
        hook_angle_deg: 135,
        hook_extension_mm: 75,
        lap_mm: 0,
        legs_mm: [],
        spacing_zones: [
          { start_mm: 0, end_mm: 500, spacing_mm: 100 },
          { start_mm: 500, end_mm: 2500, spacing_mm: 200 },
          { start_mm: 2500, end_mm: 2950, spacing_mm: 100 },
        ],
      },
    },
  });

  const colBars = Object.values(p.objects).filter(
    (o) =>
      o.object_type === "structure.rebar_set" &&
      o.module_data.host_id === colId,
  );
  assert.equal(colBars.length, 2);

  const mainBarObj = colBars.find((o) => o.module_data.role === "main");
  assert.ok(mainBarObj);
  const mainBBS = calculateBBS(p, mainBarObj);
  assert.equal(mainBBS.count, 4);
  // Cut length = height (3000) - 2 * cover (60) + lap (640) = 3580 mm
  assert.equal(mainBBS.cut_length_mm, 3580);
  assert.ok(mainBBS.mass_kg > 0);

  const tiesObj = colBars.find((o) => o.module_data.role === "ties");
  assert.ok(tiesObj);
  const tiesBBS = calculateBBS(p, tiesObj);
  assert.ok(tiesBBS.count >= 20); // dense spacing at ends + intermediate
  assert.ok(tiesBBS.mass_kg > 0);

  // Check 3D paths for column main bars (4 corner locations)
  const outputs = constructionOutputs(p);
  const mainOut = outputs.find((o) => o.object_id === mainBarObj.id);
  assert.equal(mainOut.paths.length, 4);
  // All 4 paths should run vertically from z=30 to z=2970
  for (const path of mainOut.paths) {
    assert.equal(path.length, 2);
    assert.equal(path[0][2], 30);
    assert.equal(path[1][2], 2970);
  }

  // 3. Create a foundation (1000x1000x350 mm spread footing)
  p = run(p, "CreateFoundation", {
    id: fndId,
    mark: "F1",
    center_mm: [1000, 1000, 0],
    size_mm: [1000, 1000, 350],
    foundation_type: "spread_footing",
    supported_column_id: colId,
    level_id: levelId,
    material: "reinforced_concrete",
  });

  // 4. Configure Foundation Reinforcement: bottom_x (5-DB12) and bottom_y (5-DB12) with 90° hooks
  p = run(p, "ConfigureFoundationReinforcement", {
    host_id: fndId,
    reinforcement: {
      bottom_x: {
        mode: "longitudinal",
        grade: "SD40",
        diameter_mm: 12,
        cover_mm: 50,
        count: 5,
        bend_radius_mm: 24,
        hook_angle_deg: 90,
        hook_extension_mm: 144, // 12 * db
        lap_mm: 0,
        legs_mm: [],
        spacing_zones: [],
      },
      bottom_y: {
        mode: "longitudinal",
        grade: "SD40",
        diameter_mm: 12,
        cover_mm: 50,
        count: 5,
        bend_radius_mm: 24,
        hook_angle_deg: 90,
        hook_extension_mm: 144,
        lap_mm: 0,
        legs_mm: [],
        spacing_zones: [],
      },
    },
  });

  const fndBars = Object.values(p.objects).filter(
    (o) =>
      o.object_type === "structure.rebar_set" &&
      o.module_data.host_id === fndId,
  );
  assert.equal(fndBars.length, 2);

  const fndXObj = fndBars.find((o) => o.module_data.role === "bottom_x");
  assert.ok(fndXObj);
  const fndXBBS = calculateBBS(p, fndXObj);
  assert.equal(fndXBBS.count, 5);
  // Cut length = span (1000) - 2 * cover (100) + 2 * (arc + 144)
  // arc for 90 deg = 24 * 90 * pi / 180 = 37.699 mm
  // hook = 2 * (37.699 + 144) = 363.398 mm
  // cut_length = 900 + 363.398 = ~1263.4 mm
  assert.ok(fndXBBS.cut_length_mm > 1200 && fndXBBS.cut_length_mm < 1300);
  assert.ok(fndXBBS.mass_kg > 0);

  // Check 3D paths for foundation bottom bars (5 paths each, placed horizontally)
  const fndOutputs = constructionOutputs(p);
  const fndXOut = fndOutputs.find((o) => o.object_id === fndXObj.id);
  assert.equal(fndXOut.paths.length, 5);
  // Bars should run parallel to X axis (x values differ between endpoints, y is constant per bar)
  for (const path of fndXOut.paths) {
    assert.equal(path.length, 2);
    assert.ok(path[0][0] !== path[1][0]);
    assert.equal(path[0][1], path[1][1]);
  }

  // 5. Test serialization & roundtrip
  const json = serializeProject(p);
  const roundtripped = deserializeProject(json);
  assert.equal(
    Object.keys(roundtripped.objects).length,
    Object.keys(p.objects).length,
  );
});

test("Pillar 2: 7.00m beam 25x60cm with top/bottom extra, side skin rebars, and middle support", () => {
  let p = empty();
  const levelId = p.levels[0].id;
  const col1Id = crypto.randomUUID();
  const midColId = crypto.randomUUID();
  const col2Id = crypto.randomUUID();
  const beamId = crypto.randomUUID();

  // Create columns
  p = run(p, "CreateColumn", {
    id: col1Id,
    mark: "C1",
    location_mm: [0, 0, 0],
    section_mm: [250, 250],
    base_level_id: levelId,
    base_elevation_mm: 0,
    top_elevation_mm: 3500,
  });
  p = run(p, "CreateColumn", {
    id: midColId,
    mark: "C2",
    location_mm: [3500, 0, 0],
    section_mm: [250, 250],
    base_level_id: levelId,
    base_elevation_mm: 0,
    top_elevation_mm: 3500,
  });
  p = run(p, "CreateColumn", {
    id: col2Id,
    mark: "C1",
    location_mm: [7000, 0, 0],
    section_mm: [250, 250],
    base_level_id: levelId,
    base_elevation_mm: 0,
    top_elevation_mm: 3500,
  });

  // Create 7.00m beam with 250x600 section and middle support
  p = run(p, "CreateBeam", {
    id: beamId,
    mark: "B1",
    start_point_mm: [0, 0, 3500],
    end_point_mm: [7000, 0, 3500],
    section_mm: [250, 600],
    level_id: levelId,
    start_column_id: col1Id,
    middle_support_column_id: midColId,
    end_column_id: col2Id,
    material: "reinforced_concrete",
  });

  const beam = p.objects[beamId];
  assert.ok(beam);
  assert.equal(beam.module_data.span_mm, 7000);
  assert.equal(beam.module_data.beam_system, "continuous");
  assert.equal(beam.module_data.skin_rebar_required, true);

  // Configure beam reinforcement including side_skin, top_extra_left, top_extra_mid, top_extra_right, bottom_extra
  p = run(p, "ConfigureBeamReinforcement", {
    host_id: beamId,
    reinforcement: {
      top: {
        mode: "longitudinal",
        grade: "SD40",
        diameter_mm: 20,
        cover_mm: 40,
        count: 2,
        bend_radius_mm: 40,
        hook_angle_deg: 90,
        hook_extension_mm: 240,
        lap_mm: 800,
        legs_mm: [],
        spacing_zones: [],
      },
      top_extra_left: {
        mode: "longitudinal",
        grade: "SD40",
        diameter_mm: 16,
        cover_mm: 40,
        count: 2,
        bend_radius_mm: 32,
        hook_angle_deg: 90,
        hook_extension_mm: 192,
        lap_mm: 0,
        legs_mm: [],
        spacing_zones: [],
      },
      top_extra_mid: {
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
      top_extra_right: {
        mode: "longitudinal",
        grade: "SD40",
        diameter_mm: 16,
        cover_mm: 40,
        count: 2,
        bend_radius_mm: 32,
        hook_angle_deg: 90,
        hook_extension_mm: 192,
        lap_mm: 0,
        legs_mm: [],
        spacing_zones: [],
      },
      bottom: {
        mode: "longitudinal",
        grade: "SD40",
        diameter_mm: 20,
        cover_mm: 40,
        count: 2,
        bend_radius_mm: 40,
        hook_angle_deg: 90,
        hook_extension_mm: 240,
        lap_mm: 800,
        legs_mm: [],
        spacing_zones: [],
      },
      bottom_extra: {
        mode: "longitudinal",
        grade: "SD40",
        diameter_mm: 20,
        cover_mm: 40,
        count: 2,
        bend_radius_mm: 0,
        hook_angle_deg: 0,
        hook_extension_mm: 0,
        lap_mm: 0,
        legs_mm: [],
        spacing_zones: [],
      },
      side_skin: {
        mode: "longitudinal",
        grade: "SD40",
        diameter_mm: 12,
        cover_mm: 40,
        count: 2,
        bend_radius_mm: 0,
        hook_angle_deg: 0,
        hook_extension_mm: 0,
        lap_mm: 0,
        legs_mm: [],
        spacing_zones: [],
      },
      stirrups: {
        mode: "stirrups",
        grade: "SR24",
        diameter_mm: 6,
        cover_mm: 35,
        count: 1,
        bend_radius_mm: 12,
        hook_angle_deg: 135,
        hook_extension_mm: 75,
        lap_mm: 0,
        legs_mm: [],
        spacing_zones: [
          { start_mm: 0, end_mm: 1750, spacing_mm: 100 },
          { start_mm: 1750, end_mm: 5250, spacing_mm: 200 },
          { start_mm: 5250, end_mm: 6920, spacing_mm: 100 },
        ],
      },
    },
  });

  const beamBars = Object.values(p.objects).filter(
    (o) => o.object_type === "structure.rebar_set" && o.module_data.host_id === beamId,
  );
  assert.equal(beamBars.length, 8);

  // Check side_skin BBS and cut length (runs full beam length)
  const skinBar = beamBars.find((o) => o.module_data.role === "side_skin");
  assert.ok(skinBar);
  const skinBBS = calculateBBS(p, skinBar);
  assert.equal(skinBBS.count, 2);
  assert.equal(skinBBS.cut_length_mm, 7000 - 80); // 7000 - 2 * 40 cover = 6920 mm
  assert.ok(skinBBS.mass_kg > 0);

  // Check top_extra_left cut length (~L/3)
  const topExtraLeft = beamBars.find((o) => o.module_data.role === "top_extra_left");
  assert.ok(topExtraLeft);
  const topExtraBBS = calculateBBS(p, topExtraLeft);
  assert.ok(topExtraBBS.cut_length_mm > 2300 && topExtraBBS.cut_length_mm < 3000);

  // Check 3D paths
  const outputs = constructionOutputs(p);
  const skinOut = outputs.find((o) => o.object_id === skinBar.id);
  assert.ok(skinOut);
  assert.equal(skinOut.paths.length, 2);
  // Bars should run along length (x changes from ~40 to ~6960)
  assert.ok(Math.abs(skinOut.paths[0][1][0] - skinOut.paths[0][0][0]) > 6000);
});

test("Pillar 2: Cantilever beam with top tension steel and eccentric footing with strap beam", () => {
  let p = empty();
  const levelId = p.levels[0].id;
  const colId = crypto.randomUUID();
  const fndId = crypto.randomUUID();
  const cantBeamId = crypto.randomUUID();
  const strapBeamId = crypto.randomUUID();

  // Create column
  p = run(p, "CreateColumn", {
    id: colId,
    mark: "C1",
    location_mm: [1000, 1000, 0],
    section_mm: [200, 200],
    base_level_id: levelId,
    base_elevation_mm: 0,
    top_elevation_mm: 3000,
  });

  // Create Cantilever Beam (2.00m)
  p = run(p, "CreateBeam", {
    id: cantBeamId,
    mark: "CB1",
    start_point_mm: [1000, 1000, 3000],
    end_point_mm: [3000, 1000, 3000],
    section_mm: [200, 400],
    level_id: levelId,
    start_column_id: colId,
    beam_system: "cantilever",
    material: "reinforced_concrete",
  });

  const cantBeam = p.objects[cantBeamId];
  assert.ok(cantBeam);
  assert.equal(cantBeam.module_data.beam_system, "cantilever");

  // Create Strap Beam for eccentric footing
  p = run(p, "CreateBeam", {
    id: strapBeamId,
    mark: "ST-B1",
    start_point_mm: [1000, 1000, 0],
    end_point_mm: [1000, 4000, 0],
    section_mm: [250, 400],
    level_id: levelId,
    material: "reinforced_concrete",
  });

  // Create Eccentric Footing (ฐานรากตีนเป็ดชิดเขต) connected to Strap Beam
  p = run(p, "CreateFoundation", {
    id: fndId,
    mark: "F-ECC",
    foundation_type: "eccentric_footing",
    center_mm: [1000, 1000, -300],
    size_mm: [1000, 1000, 350],
    eccentric_offset_mm: [200, 0],
    strap_beam_id: strapBeamId,
    supported_column_id: colId,
    level_id: levelId,
    material: "reinforced_concrete",
  });

  const fnd = p.objects[fndId];
  assert.ok(fnd);
  assert.equal(fnd.module_data.foundation_type, "eccentric_footing");
  assert.deepEqual(fnd.module_data.eccentric_offset_mm, [200, 0]);
  assert.equal(fnd.module_data.strap_beam_id, strapBeamId);

  // Check relationship connection
  const strapRel = p.relationships.find(
    (r) => r.source_id === fndId && r.target_id === strapBeamId && r.role === "strap_beam_connection",
  );
  assert.ok(strapRel);
});
