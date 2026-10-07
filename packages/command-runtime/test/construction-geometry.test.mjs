import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyProjectDocument } from "@constructflow/project-model";
import { CommandBus } from "../dist/index.js";
import {
  constructionOutputs,
  generateProjectCutList,
} from "@constructflow/domain-providers";
import {
  sweepMoulding,
  decodeMoulding,
} from "@constructflow/decorative-engine";
const empty = () => createEmptyProjectDocument(crypto.randomUUID());
const run = (p, name, input) => {
  const r = CommandBus.execute(p, name, input);
  assert.equal(r.result.status, "success", JSON.stringify(r.result));
  return r.updatedProject;
};
test("Phase 3: continuous closed sweep miters use the supplied profile; reversals reject", () => {
  const p = empty(),
    d = {
      mark: "M1",
      path_mm: [
        [0, 0, 0],
        [4000, 0, 0],
        [4000, 2500, 0],
        [0, 2500, 0],
      ],
      profile_mm: [
        [0, 0],
        [15, 0],
        [15, 80],
        [0, 80],
      ],
      closed: true,
      miter_limit: 4,
      material: "wood",
    };
  const mesh = sweepMoulding(decodeMoulding(d, p)),
    points = mesh.flat();
  assert.ok(
    points.some(
      (v) => Math.abs(v[0] - 15) < 1e-8 && Math.abs(v[1] - 15) < 1e-8,
    ),
  );
  assert.equal(Math.max(...points.map((v) => v[2])), 80);
  assert.throws(
    () =>
      sweepMoulding(
        decodeMoulding(
          {
            ...d,
            closed: false,
            path_mm: [
              [0, 0, 0],
              [1000, 0, 0],
              [0, 0, 0],
            ],
          },
          p,
        ),
      ),
    /reversal|reverse/i,
  );
});
test("Phase 3: vertical planar architrave sweep preserves profile depth and corners", () => {
  const p = empty();
  const d = decodeMoulding({
    mark: "D1-ARCH",
    path_mm: [[0, 0, 0], [0, 0, 2100], [900, 0, 2100], [900, 0, 0]],
    profile_mm: [[0, 0], [18, 0], [18, 70], [0, 70]],
    closed: true,
    miter_limit: 4,
    material: "painted wood",
  }, p);
  const mesh = sweepMoulding(d);
  assert.ok(mesh.length > 0);
  const points = mesh.flat();
  assert.ok(points.some(v => Math.abs(v[1] - 70) < 1e-8));
  assert.ok(Math.max(...points.map(v => v[2])) >= 2100);
  assert.ok(points.every(v => Math.abs(v[1]) <= 70 + 1e-8));
});
test("Phase 3: decorative area subtracts an opening intersection and regenerates on host edit", () => {
  let p = run(empty(), "CreateWall", {
      mark: "W1",
      start_point_mm: [0, 0, 0],
      end_point_mm: [4000, 0, 0],
      height_mm: 2800,
      thickness_mm: 100,
      material: "brick",
    }),
    wall = Object.values(p.objects)[0];
  p = run(p, "CreateDoor", {
    mark: "D1",
    wall_id: wall.id,
    location_mm: [2000, 0, 0],
    offset_along_wall_mm: 2000,
    width_mm: 800,
    height_mm: 2000,
    handing: "left_in",
  });
  p = run(p, "SetPanelLayout", {
    mark: "P1",
    host_id: wall.id,
    rows: 1,
    columns: 1,
    margin_mm: 100,
    gap_mm: 0,
    depth_mm: 18,
    material: "mdf",
  });
  let out = constructionOutputs(p).find(
    (o) => o.family === "decorative.panel_layout",
  );
  assert.ok(Math.abs(out.quantities[0].quantity - 8.36) < 1e-8);
  const x0 = Math.min(...out.meshes.flat().map((v) => v[0]));
  p = run(p, "MoveWall", { object_id: wall.id, delta_mm: [1000, 500] });
  out = constructionOutputs(p).find(
    (o) => o.family === "decorative.panel_layout",
  );
  assert.equal(Math.min(...out.meshes.flat().map((v) => v[0])), x0 + 1000);
});
test("Phase 4: configured bathroom membrane area and tile grid trace the sloping surface", () => {
  const p = run(empty(), "CreateBathroom", {
      mark: "BATH",
      boundary_mm: [
        [0, 0],
        [2000, 0],
        [2000, 1500],
        [0, 1500],
      ],
      elevation_mm: 0,
      drop_mm: 75,
      slope_ratio: 0.02,
      drain_mm: [1500, 1000],
      waterproof_upstand_mm: 300,
      wet_wall_height_mm: 1800,
      wet_wall_length_mm: 3500,
      tile_mm: [300, 300],
      toilet_rough_in_mm: 305,
    }),
    out = constructionOutputs(p)[0];
  assert.equal(out.quantities[0].quantity, 3);
  assert.ok(Math.abs(out.quantities[1].quantity - 10.35) < 1e-8);
  assert.equal(out.schedule.Drain_IL_m, -0.075);
  assert.ok(out.paths.length > 8);
  assert.ok(out.meshes.flat().some((v) => v[2] > 1700));
});
test("Phase 5: complete drawer carcass parts retain UUIDs after micro-material change", () => {
  const d = {
    mark: "CB1",
    location_mm: [0, 0, 0],
    width_mm: 2400,
    height_mm: 850,
    depth_mm: 600,
    board_mm: 18,
    back_mm: 9,
    plinth_mm: 100,
    rotation_deg: 0,
    modules_mm: [800, 800, 800],
    shelves: 1,
    drawers: 1,
    front: "solid",
    carcass_material: "melamine",
    front_material: "laminate",
    back_material: "plywood",
    countertop_material: "quartz",
    countertop_mm: 20,
  };
  let p = run(empty(), "CreateCabinetRun", d),
    parts = generateProjectCutList(p),
    id = parts[0].object_id;
  assert.ok(parts.some((v) => v.name.startsWith("Drawer left")));
  assert.ok(parts.some((v) => v.name === "Toe kick"));
  assert.ok(parts.every((v) => v.size_mm.every((n) => n > 0)));
  const ids = parts.map((v) => v.id).sort();
  p = run(p, "UpdateCabinetRun", { id, front_material: "oak" });
  parts = generateProjectCutList(p);
  assert.deepEqual(parts.map((v) => v.id).sort(), ids);
  assert.ok(
    parts
      .filter((v) => v.name.startsWith("Drawer front"))
      .every((v) => v.material === "oak"),
  );
  assert.equal(
    CommandBus.execute(p, "UpdateCabinetRun", {
      id,
      modules_mm: [400, 400, 400],
    }).result.status,
    "failed",
  );
});
test("Phase 1/2: beam catalog reinforcement cascade updates BBS and invalid updates rollback", () => {
  let p = run(empty(), "CreateBeam", {
      mark: "B1",
      start_point_mm: [0, 0, 0],
      end_point_mm: [4000, 0, 0],
      section_mm: [200, 400],
      material: "reinforced_concrete",
    }),
    host = Object.values(p.objects)[0],
    bar = {
      grade: "SD40",
      diameter_mm: 12,
      cover_mm: 30,
      count: 2,
      bend_radius_mm: 24,
      hook_angle_deg: 0,
      hook_extension_mm: 0,
      lap_mm: 0,
      legs_mm: [],
      spacing_zones: [],
    };
  p = run(p, "ConfigureBeamReinforcement", {
    host_id: host.id,
    reinforcement: {
      top: bar,
      bottom: bar,
      stirrups: {
        ...bar,
        grade: "SR24",
        diameter_mm: 6,
        bend_radius_mm: 12,
        hook_angle_deg: 135,
        hook_extension_mm: 60,
        spacing_zones: [{ start_mm: 0, end_mm: 3940, spacing_mm: 150 }],
      },
    },
  });
  const type = p.types.find(
      (t) => t.object_type === "structure.beam" && t.name === "B1",
    ),
    before = constructionOutputs(p).find((o) => o.mark === "B1-top")
      .quantities[0].quantity;
  p = run(p, "UpdateStructuralTypeDimensions", {
    type_id_or_name: type.id,
    parameters: {
      rebar_type: {
        top: { ...bar, diameter_mm: 16, count: 3 },
        bottom: bar,
        stirrups: {
          ...bar,
          grade: "SR24",
          diameter_mm: 6,
          bend_radius_mm: 12,
          hook_angle_deg: 135,
          hook_extension_mm: 60,
          spacing_zones: [{ start_mm: 0, end_mm: 3940, spacing_mm: 150 }],
        },
      },
    },
  });
  assert.ok(
    constructionOutputs(p).find((o) => o.mark === "B1-top").quantities[0]
      .quantity > before,
  );
  const r = CommandBus.execute(p, "UpdateStructuralTypeDimensions", {
    type_id_or_name: type.id,
    parameters: { section_mm: [50, 400] },
  });
  assert.equal(r.result.status, "failed");
  assert.strictEqual(r.updatedProject, p);
});

test("Phase 1/2: catalog-owned bars fit different spans and retain deterministic IDs on replay", () => {
  let p = empty();
  const initial = p;
  for (const length of [4000, 2500])
    p = run(p, "CreateBeam", {
      mark: "B1",
      start_point_mm: [0, 0, 3000],
      end_point_mm: [length, 0, 3000],
      section_mm: [200, 400],
      material: "reinforced_concrete",
    });
  const type = p.types.find(
      (t) => t.object_type === "structure.beam" && t.name === "B1",
    ),
    bar = {
      grade: "SD40",
      diameter_mm: 12,
      cover_mm: 30,
      count: 2,
      bend_radius_mm: 24,
      hook_angle_deg: 0,
      hook_extension_mm: 0,
      lap_mm: 0,
      legs_mm: [],
      spacing_zones: [],
    };
  const input = {
    type_id_or_name: type.id,
    parameters: {
      rebar_type: {
        top: bar,
        bottom: bar,
        stirrups: {
          ...bar,
          grade: "SR24",
          diameter_mm: 6,
          bend_radius_mm: 12,
          hook_angle_deg: 135,
          hook_extension_mm: 60,
          spacing_zones: [{ start_ratio: 0, end_ratio: 1, spacing_mm: 150 }],
        },
      },
    },
  };
  const before = p;
  p = run(p, "UpdateStructuralTypeDimensions", input);
  const bars = Object.values(p.objects).filter(
    (o) => o.object_type === "structure.rebar_set",
  );
  assert.equal(bars.length, 6);
  assert.deepEqual(
    bars.map((o) => o.id).sort(),
    Object.values(run(before, "UpdateStructuralTypeDimensions", input).objects)
      .filter((o) => o.object_type === "structure.rebar_set")
      .map((o) => o.id)
      .sort(),
  );
  const stirrups = bars.filter((o) => o.module_data.role === "stirrups");
  assert.deepEqual(
    stirrups
      .map((o) => o.module_data.spacing_zones[0].end_mm)
      .sort((a, b) => a - b),
    [2440, 3940],
  );
  assert.ok(
    constructionOutputs(p)
      .filter((o) => o.family === "structure.rebar_set")
      .every((o) => o.quantities[0].quantity > 0),
  );
  const host = Object.values(p.objects).find(
    (o) => o.object_type === "structure.beam",
  );
  p = run(p, "UpdateObjectPhase", {
    object_id: host.id,
    created_phase: "existing",
    removed_phase: "demolition",
  });
  assert.ok(
    Object.values(p.objects)
      .filter(
        (o) =>
          o.object_type === "structure.rebar_set" &&
          o.module_data.host_id === host.id,
      )
      .every(
        (o) =>
          o.created_phase === "existing" && o.removed_phase === "demolition",
      ),
  );
  const bad = CommandBus.execute(p, "UpdateStructuralTypeDimensions", {
    ...input,
    parameters: {
      rebar_type: {
        ...input.parameters.rebar_type,
        stirrups: {
          ...input.parameters.rebar_type.stirrups,
          spacing_zones: [{ start_ratio: 0, end_ratio: 2, spacing_mm: 150 }],
        },
      },
    },
  });
  assert.equal(bad.result.status, "failed");
  assert.strictEqual(bad.updatedProject, p);
});
