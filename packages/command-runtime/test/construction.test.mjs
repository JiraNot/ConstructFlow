import test from "node:test";
import assert from "node:assert/strict";
import {
  createEmptyProjectDocument,
  serializeProject,
  deserializeProject,
} from "@constructflow/project-model";
import { CommandBus, ProjectCommandSession } from "../dist/index.js";
import { solveRoof } from "@constructflow/roof-engine";
import { calculateBBS } from "@constructflow/structure-engine";
import { constructionOutputs } from "@constructflow/domain-providers";
const empty = () => createEmptyProjectDocument(crypto.randomUUID());
const execute = (p, name, input) => {
  const r = CommandBus.execute(p, name, input);
  assert.equal(r.result.status, "success", JSON.stringify(r.result));
  return r.updatedProject;
};
const slab = {
  mark: "GS",
  boundary_mm: [
    [0, 0],
    [4000, 0],
    [4000, 2500],
    [0, 2500],
  ],
  elevation_mm: 0,
  thickness_mm: 120,
  topping_mm: 0,
  slab_system: "slab_on_ground",
  material: "concrete",
};
test("Phase 1: slab catalog cascade, UUID roundtrip and atomic undo/redo", () => {
  const p = empty(),
    type = p.types.find(
      (t) => t.object_type === "structure.slab" && t.name === "GS",
    ),
    id = crypto.randomUUID(),
    session = new ProjectCommandSession(p);
  const r = session.execute([
    { name: "CreateSlab", input: { ...slab, id, type_id: type.id } },
    {
      name: "UpdateStructuralTypeDimensions",
      input: {
        type_id_or_name: type.id,
        object_type: "structure.slab",
        parameters: { thickness_mm: 180 },
      },
    },
  ]);
  assert.equal(r.status, "success", JSON.stringify(r.errors));
  assert.equal(r.updatedProject.objects[id].module_data.thickness_mm, 180);
  assert.equal(
    constructionOutputs(r.updatedProject)[0].quantities[0].quantity,
    1.8,
  );
  assert.deepEqual(
    deserializeProject(serializeProject(r.updatedProject)),
    r.updatedProject,
  );
  assert.equal(Object.keys(session.undo().objects).length, 0);
  assert.equal(session.redo().objects[id].module_data.thickness_mm, 180);
  const corrupt = structuredClone(r.updatedProject);
  corrupt.objects[id].module_data.thickness_mm = -1;
  assert.throws(() => deserializeProject(JSON.stringify(corrupt)), /thickness/);
});
test("Phase 2: explicit BBS reference mass, stirrup end deduplication and drop", () => {
  let p = execute(empty(), "CreateBeam", {
      mark: "B1",
      start_point_mm: [0, 0, 0],
      end_point_mm: [4000, 0, 0],
      section_mm: [200, 400],
      material: "concrete",
    }),
    host = Object.values(p.objects).find(
      (o) => o.object_type === "structure.beam",
    );
  const d = {
    mark: "R1",
    host_id: host.id,
    mode: "longitudinal",
    grade: "SD40",
    diameter_mm: 16,
    cover_mm: 25,
    count: 2,
    bend_radius_mm: 32,
    hook_angle_deg: 0,
    hook_extension_mm: 0,
    lap_mm: 640,
    legs_mm: [],
    spacing_zones: [],
  };
  p = execute(p, "AssignRebarSet", d);
  let o = Object.values(p.objects).find(
      (o) => o.object_type === "structure.rebar_set",
    ),
    bbs = calculateBBS(p, o);
  assert.equal(bbs.cut_length_mm, 4590);
  assert.ok(
    Math.abs(bbs.mass_kg - ((9.18 * Math.PI * 0.016 ** 2) / 4) * 7850) < 1e-9,
  );
  p = execute(p, "ModifyRebarSet", {
    ...d,
    id: o.id,
    mode: "stirrups",
    diameter_mm: 6,
    bend_radius_mm: 12,
    spacing_zones: [
      { start_mm: 0, end_mm: 1000, spacing_mm: 100 },
      { start_mm: 1000, end_mm: 3950, spacing_mm: 200 },
    ],
  });
  assert.equal(calculateBBS(p, p.objects[o.id]).count, 26);
  const invalid = CommandBus.execute(p, "ModifyRebarSet", {
    id: o.id,
    cover_mm: 100,
  });
  assert.equal(invalid.result.status, "failed");
  assert.strictEqual(invalid.updatedProject, p);
  p = execute(p, "SetBeamDrop", { id: host.id, drop_mm: 75 });
  assert.equal(p.objects[host.id].module_data.drop_mm, 75);
  const out = constructionOutputs(p).find((v) => v.object_id === o.id);
  assert.equal(out.paths.length, 26);
  assert.ok(out.paths.flat().every((v) => v[2] >= -75 && v[2] <= 325));
});
test("Phase 3: flat, shed, gable and hip analytic areas; unsupported polygons reject", () => {
  const d = {
    ...slab,
    thickness_mm: 30,
    edges: [0, 1, 2, 3].map(() => ({ defines_slope: true, slope_deg: 30 })),
  };
  const hip = solveRoof(d);
  assert.equal(hip.length, 4);
  assert.ok(
    Math.abs(
      hip.reduce((s, v) => s + v.area_m2, 0) - 10 / Math.cos(Math.PI / 6),
    ) < 1e-8,
  );
  const gable = solveRoof({
    ...d,
    edges: d.edges.map((v, i) => ({ ...v, defines_slope: i === 0 || i === 2 })),
  });
  assert.equal(gable.length, 2);
  assert.equal(
    solveRoof({
      ...d,
      edges: d.edges.map((v) => ({ ...v, defines_slope: false })),
    }).reduce((s, v) => s + v.area_m2, 0),
    10,
  );
  const bad = CommandBus.execute(empty(), "GenerateRoof", {
    ...d,
    boundary_mm: [
      [0, 0],
      [4000, 0],
      [2000, 1000],
      [4000, 2500],
      [0, 2500],
    ],
    edges: Array(5).fill({ defines_slope: true, slope_deg: 30 }),
  });
  assert.equal(bad.result.status, "failed");
  assert.match(bad.result.errors[0], /convex/i);
});
test("Phase 4: manhole IL propagation, unknown state and invalid network rollback", () => {
  let p = empty(),
    a = crypto.randomUUID(),
    b = crypto.randomUUID();
  p = execute(p, "PlaceManhole", {
    id: a,
    mark: "MH1",
    location_mm: [0, 0, 0],
    size_mm: [400, 500, 600],
    invert_mm: -300,
    system: "waste",
  });
  p = execute(p, "PlaceManhole", {
    id: b,
    mark: "MH2",
    location_mm: [4000, 0, 0],
    size_mm: [400, 500, 600],
    invert_mm: -400,
    system: "waste",
  });
  p = execute(p, "CreatePipeRoute", {
    mark: "P1",
    system: "waste",
    nodes_mm: [
      [0, 0, 0],
      [4000, 0, 0],
    ],
    start_node_id: a,
    end_node_id: b,
    diameter_mm: 50,
    start_invert_mm: null,
    end_invert_mm: null,
    minimum_slope_ratio: 0.01,
    material: "PVC",
  });
  const pipe = Object.values(p.objects).find(
    (o) => o.object_type === "drainage.pipe_route",
  );
  assert.equal(pipe.module_data.nodes_mm[1][2], -400);
  const invalid = CommandBus.execute(p, "UpdateManhole", {
    id: b,
    invert_mm: -290,
  });
  assert.equal(invalid.result.status, "failed");
  assert.strictEqual(invalid.updatedProject, p);
  p = execute(p, "UpdateManhole", { id: b, invert_mm: null });
  assert.equal(p.objects[pipe.id].module_data.end_invert_mm, null);
  assert.match(
    constructionOutputs(p)
      .find((o) => o.object_id === pipe.id)
      .warnings.join(","),
    /Verify On Site/,
  );
});
test("Phase 4: pump bypass contradictory states and PE capacity reject", () => {
  const r = CommandBus.execute(empty(), "CreatePumpBypass", {
    mark: "P1",
    location_mm: [0, 0, 0],
    span_mm: 2000,
    diameter_mm: 25,
    mode: "pump",
    valve_states: { inlet: true, outlet: true, bypass: true },
  });
  assert.equal(r.result.status, "failed");
  const septic = CommandBus.execute(empty(), "CreateSepticTank", {
    mark: "ST",
    location_mm: [0, 0, 0],
    people: 5,
    litres_per_person: 200,
    reserve_ratio: 0.2,
    capacity_litres: 1000,
    rule_source: "fixture rule",
  });
  assert.equal(septic.result.status, "failed");
});
test("Phase 5: LED driver capacity, finite outputs and universal phasing", () => {
  const d = {
    mark: "LED1",
    path_mm: [
      [0, 0, 0],
      [2400, 0, 0],
    ],
    watts_per_m: 9.6,
    voltage: 24,
    driver_watts: 40,
    derating_ratio: 0.8,
    material: "profile",
  };
  let p = execute(empty(), "CreateLEDRun", { ...d, created_phase: "existing" }),
    out = constructionOutputs(p)[0];
  assert.equal(out.phase, "existing");
  assert.equal(out.quantities[0].quantity, 2.4);
  assert.ok(Math.abs(out.schedule.Required_driver_W - 28.8) < 1e-8);
  const r = CommandBus.execute(p, "UpdateLEDRun", {
    id: out.object_id,
    driver_watts: 20,
  });
  assert.equal(r.result.status, "failed");
  assert.strictEqual(r.updatedProject, p);
});

test('wall and beam creation persist their placement reference', () => {
  let project = execute(empty(), 'CreateWall', {
    mark: 'W1', start_point_mm: [0, 0, 0], end_point_mm: [4000, 0, 0], placement_reference: 'left_face',
  })
  const wall = Object.values(project.objects).find(object => object.object_type === 'architecture.wall')
  assert.equal(wall.module_data.placement_reference, 'left_face')

  project = execute(project, 'CreateBeam', {
    mark: 'B1', start_point_mm: [0, 0, 0], end_point_mm: [4000, 0, 0], placement_reference: 'right_face',
  })
  const beam = Object.values(project.objects).find(object => object.object_type === 'structure.beam')
  assert.equal(beam.module_data.placement_reference, 'right_face')
})

test("Phase 6: saved viewport scale/crop persist and participate in atomic undo/redo", () => {
  const session = new ProjectCommandSession(empty()),
    viewport = {
      scale_denominator: 25,
      center_mm: [2000, 1000],
      crop_bounds_mm: [0, 0, 4000, 2000],
    };
  const r = session.execute([
    { name: "UpdateSheetViewport", input: { sheet_id: "A-09", viewport } },
  ]);
  assert.equal(r.status, "success");
  assert.deepEqual(
    deserializeProject(serializeProject(r.updatedProject)).drawing_settings
      .viewports["A-09"],
    viewport,
  );
  assert.equal(session.undo().drawing_settings, undefined);
  assert.deepEqual(session.redo().drawing_settings.viewports["A-09"], viewport);
  const before = session.project;
  assert.equal(
    session.execute([
      {
        name: "UpdateSheetViewport",
        input: { sheet_id: "A-09", viewport: { scale_denominator: 13 } },
      },
    ]).status,
    "failed",
  );
  assert.deepEqual(session.project, before);
});

test("Phase 4: cyclic unknown-IL gravity network rejects atomically", () => {
  let p = empty();
  const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  for (const [i, id] of ids.entries())
    p = execute(p, "PlaceManhole", {
      id,
      mark: "MH" + i,
      location_mm: [
        [0, 0, 0],
        [3000, 0, 0],
        [3000, 3000, 0],
      ][i],
      size_mm: [400, 500, 600],
      invert_mm: null,
      system: "waste",
    });
  const route = (a, b) => ({
    mark: "P",
    system: "waste",
    nodes_mm: [
      [0, 0, 0],
      [4000, 0, 0],
    ],
    start_node_id: a,
    end_node_id: b,
    diameter_mm: 50,
    start_invert_mm: null,
    end_invert_mm: null,
    minimum_slope_ratio: 0.01,
    material: "PVC",
  });
  p = execute(p, "CreatePipeRoute", route(ids[0], ids[1]));
  p = execute(p, "CreatePipeRoute", route(ids[1], ids[2]));
  const r = CommandBus.execute(p, "CreatePipeRoute", route(ids[2], ids[0]));
  assert.equal(r.result.status, "failed");
  assert.match(r.result.errors[0], /cycle/);
  assert.strictEqual(r.updatedProject, p);
});
