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
test("slab edge edits reject a footprint that would leave a floor opening outside", () => {
  const id = crypto.randomUUID();
  const created = execute(empty(), "CreateSlab", {
    ...slab,
    id,
    voids_mm: [[[1500, 900], [2500, 900], [2500, 1900], [1500, 1900]]],
  });
  const data = created.objects[id].module_data;
  const boundary_mm = [[0, 1500], [4000, 1500], [4000, 2500], [0, 2500]];
  const rejected = CommandBus.execute(created, "UpdateSlab", { ...data, id, boundary_mm });
  assert.equal(rejected.result.status, "failed", JSON.stringify(rejected.result));
  assert.match(rejected.result.errors.join(" "), /opening|void|strictly inside/i);
  assert.deepEqual(rejected.updatedProject, created, "a rejected grip edit must leave committed geometry unchanged");
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
test("Phase 3: flat, shed, gable and hip analytic areas; concave roofs work and self-intersections reject", () => {
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
  const concave = CommandBus.execute(empty(), "GenerateRoof", {
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
  assert.equal(concave.result.status, "success");
  assert.ok(constructionOutputs(concave.updatedProject).find(output => output.object_id === concave.result.created_object_ids[0]).meshes.length > 0);
  const selfIntersecting = CommandBus.execute(empty(), "GenerateRoof", {
    ...d,
    boundary_mm: [[0, 0], [4000, 0], [0, 4000], [4000, 4000], [0, 2000]],
    edges: Array(5).fill({ defines_slope: true, slope_deg: 30 }),
  });
  assert.equal(selfIntersecting.result.status, "failed");
  assert.match(selfIntersecting.result.errors[0], /self-intersects/i);
});
test("Plan authoring commands create editable roof, MEP, cabinet and moulding objects", () => {
  let p = empty();
  const boundary_mm = [[0, 0], [4000, 0], [4000, 2500], [0, 2500]];
  const roofId = crypto.randomUUID();
  p = execute(p, "GenerateRoof", {
    id: roofId, mark: "R1", created_phase: "new_construction", elevation_mm: 2800,
    thickness_mm: 30, material: "metal_sheet", boundary_mm, voids_mm: [],
    edges: boundary_mm.map(() => ({ defines_slope: true, slope_deg: 25 })),
  });
  assert.equal(p.objects[roofId].object_type, "roof.system");
  assert.equal(p.objects[roofId].created_phase, "new_construction");
  p = execute(p, "UpdateRoof", { ...p.objects[roofId].module_data, id: roofId, thickness_mm: 40 });
  assert.equal(p.objects[roofId].module_data.thickness_mm, 40);

  const pipeId = crypto.randomUUID();
  p = execute(p, "CreatePipeRoute", {
    id: pipeId, mark: "WST1", system: "waste", nodes_mm: [[0, 0, -300], [4000, 0, -340]],
    diameter_mm: 100, start_invert_mm: -300, end_invert_mm: -340, minimum_slope_ratio: 0.01, material: "PVC",
    start_node_id: "", end_node_id: "",
  });
  assert.equal(p.objects[pipeId].object_type, "drainage.pipe_route");
  assert.equal(p.objects[pipeId].module_data.start_node_id, undefined);
  p = execute(p, "EditPipeRoute", { ...p.objects[pipeId].module_data, id: pipeId, diameter_mm: 125 });
  assert.equal(p.objects[pipeId].module_data.diameter_mm, 125);

  const fixtureId = crypto.randomUUID();
  p = execute(p, "PlaceElectricalFixture", {
    id: fixtureId, mark: "L1", location_mm: [1000, 1000, 2700], kind: "light", watts: 12,
    controlled_ids: [], switch_ways: 1, grounded: false,
  });
  assert.equal(p.objects[fixtureId].object_type, "electrical.fixture");
  p = execute(p, "UpdateElectricalFixture", { ...p.objects[fixtureId].module_data, id: fixtureId, watts: 18 });
  assert.equal(p.objects[fixtureId].module_data.watts, 18);

  const cabinetId = crypto.randomUUID();
  p = execute(p, "CreateCabinetRun", {
    id: cabinetId, mark: "CB1", location_mm: [0, 0, 0], width_mm: 1800, height_mm: 850, depth_mm: 600,
    board_mm: 18, back_mm: 6, plinth_mm: 100, rotation_deg: 0, modules_mm: [1800], shelves: 2,
    drawers: 0, front: "solid", carcass_material: "plywood", front_material: "laminate",
    back_material: "plywood", countertop_material: "quartz", countertop_mm: 30,
  });
  p = execute(p, "UpdateCabinetRun", { ...p.objects[cabinetId].module_data, id: cabinetId, width_mm: 2400, modules_mm: [2400] });
  assert.equal(p.objects[cabinetId].module_data.width_mm, 2400);
  const cabinetAnchor = [...p.objects[cabinetId].module_data.location_mm];
  p = execute(p, "UpdateCabinetRun", { ...p.objects[cabinetId].module_data, id: cabinetId, rotation_deg: 90 });
  assert.equal(p.objects[cabinetId].id, cabinetId);
  assert.deepEqual(p.objects[cabinetId].module_data.location_mm, cabinetAnchor);
  assert.equal(p.objects[cabinetId].module_data.width_mm, 2400);
  const cabinetPlan = constructionOutputs(p).find(output => output.object_id === cabinetId);
  assert.ok(cabinetPlan.paths.length >= 3);
  assert.ok(Math.abs(cabinetPlan.paths[0][0][0] - (cabinetAnchor[0] + 18)) < 1e-8);
  assert.ok(Math.abs(cabinetPlan.paths[0][1][0] - (cabinetAnchor[0] + 18)) < 1e-8);
  assert.ok(Math.abs(cabinetPlan.paths[0][1][1] - (cabinetAnchor[1] + 2400)) < 1e-8);

  const mouldingId = crypto.randomUUID();
  p = execute(p, "CreateMouldingRun", {
    id: mouldingId, mark: "SK1", path_mm: [[0, 0, 2700], [4000, 0, 2700]],
    profile_mm: [[0, 0], [15, 0], [15, 80], [0, 80]], closed: false, miter_limit: 4, material: "painted_wood",
  });
  assert.equal(p.objects[mouldingId].object_type, "decorative.moulding_run");
  p = execute(p, "UpdateMouldingRun", { ...p.objects[mouldingId].module_data, id: mouldingId, material: "MDF" });
  assert.equal(p.objects[mouldingId].module_data.material, "MDF");

  const outputs = constructionOutputs(p);
  for (const id of [roofId, pipeId, fixtureId, cabinetId, mouldingId]) assert.ok(outputs.some(output => output.object_id === id));
});

test("Electrical circuit assignment updates fixture and circuit in one validated command", () => {
  let p = empty();
  const panelId = crypto.randomUUID();
  p = execute(p, "PlaceElectricalFixture", {
    id: panelId, mark: "DB1", location_mm: [0, 0, 1800], kind: "panel", watts: 0,
    controlled_ids: [], switch_ways: 1, grounded: true,
  });
  const firstCircuitId = crypto.randomUUID();
  const secondCircuitId = crypto.randomUUID();
  const circuit = (id, mark) => ({
    id, mark, panel_id: panelId, device_ids: [], voltage: 230,
    breaker_a: 16, allowable_current_a: 20, cable_mm2: 2.5,
  });
  p = execute(p, "CreateCircuit", circuit(firstCircuitId, "CKT1"));
  p = execute(p, "CreateCircuit", circuit(secondCircuitId, "CKT2"));
  const lightId = crypto.randomUUID();
  p = execute(p, "PlaceElectricalFixture", {
    id: lightId, mark: "L1", location_mm: [1000, 1000, 2700], kind: "light", watts: 120,
    controlled_ids: [], switch_ways: 1, grounded: false,
  });
  const switchId = crypto.randomUUID();
  p = execute(p, "PlaceElectricalFixture", {
    id: switchId, mark: "S1", location_mm: [1000, 1000, 1200], kind: "switch", watts: 0,
    controlled_ids: [], switch_ways: 1, grounded: false,
  });
  p = execute(p, "UpdateElectricalFixture", {
    ...p.objects[switchId].module_data, id: switchId, controlled_ids: [lightId],
  });
  assert.deepEqual(p.objects[switchId].module_data.controlled_ids, [lightId]);
  const outletId = crypto.randomUUID();
  p = execute(p, "PlaceElectricalFixture", {
    id: outletId, mark: "O1", location_mm: [2000, 1000, 300], kind: "outlet", watts: 0,
    controlled_ids: [], switch_ways: 1, grounded: true,
  });
  const invalidSwitchLink = CommandBus.execute(p, "UpdateElectricalFixture", {
    ...p.objects[switchId].module_data, id: switchId, controlled_ids: [outletId],
  });
  assert.equal(invalidSwitchLink.result.status, "failed");
  assert.match(invalidSwitchLink.result.errors[0], /must be a light/i);
  assert.deepEqual(invalidSwitchLink.updatedProject.objects[switchId].module_data.controlled_ids, [lightId]);

  const assignmentSession = new ProjectCommandSession(p);
  const firstAssignment = assignmentSession.execute([{
    name: "AssignFixtureToCircuit", input: { fixture_id: lightId, circuit_id: firstCircuitId },
  }]);
  assert.equal(firstAssignment.status, "success", JSON.stringify(firstAssignment.errors));
  p = firstAssignment.updatedProject;
  assert.equal(p.objects[lightId].module_data.circuit_id, firstCircuitId);
  assert.deepEqual(p.objects[firstCircuitId].module_data.device_ids, [lightId]);
  const undoneAssignment = assignmentSession.undo();
  assert.equal(undoneAssignment.objects[lightId].module_data.circuit_id, undefined);
  assert.deepEqual(undoneAssignment.objects[firstCircuitId].module_data.device_ids, []);
  p = assignmentSession.redo();
  assert.equal(p.objects[lightId].module_data.circuit_id, firstCircuitId);
  assert.deepEqual(p.objects[firstCircuitId].module_data.device_ids, [lightId]);

  p = execute(p, "AssignFixtureToCircuit", { fixture_id: lightId, circuit_id: secondCircuitId });
  assert.equal(p.objects[lightId].module_data.circuit_id, secondCircuitId);
  assert.deepEqual(p.objects[firstCircuitId].module_data.device_ids, []);
  assert.deepEqual(p.objects[secondCircuitId].module_data.device_ids, [lightId]);

  p = execute(p, "AssignFixtureToCircuit", { fixture_id: lightId, circuit_id: null });
  assert.equal(p.objects[lightId].module_data.circuit_id, undefined);
  assert.deepEqual(p.objects[secondCircuitId].module_data.device_ids, []);

  const panelAssignment = CommandBus.execute(p, "AssignFixtureToCircuit", { fixture_id: panelId, circuit_id: firstCircuitId });
  assert.equal(panelAssignment.result.status, "failed");
  assert.match(panelAssignment.result.errors[0], /panel/i);
});

test("Electrical phase balancing is stored in one undoable circuit update transaction", () => {
  let p = empty();
  const panelId = crypto.randomUUID();
  p = execute(p, "PlaceElectricalFixture", {
    id: panelId, mark: "DB1", location_mm: [0, 0, 1800], kind: "panel", watts: 0,
    controlled_ids: [], switch_ways: 1, grounded: true,
  });
  const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  for (const [index, id] of ids.entries()) p = execute(p, "CreateCircuit", {
    id, mark: `CKT${index + 1}`, panel_id: panelId, device_ids: [], voltage: 230,
    breaker_a: 16, allowable_current_a: 20, cable_mm2: 2.5,
  });
  const session = new ProjectCommandSession(p);
  const phases = ["Phase A", "Phase B", "Phase C"];
  const result = session.execute(ids.map((id, index) => ({
    name: "UpdateCircuit",
    input: { ...p.objects[id].module_data, id, phase_assignment: phases[index] },
  })));
  assert.equal(result.status, "success", JSON.stringify(result.errors));
  ids.forEach((id, index) => assert.equal(result.updatedProject.objects[id].module_data.phase_assignment, phases[index]));
  const undone = session.undo();
  ids.forEach(id => assert.equal(undone.objects[id].module_data.phase_assignment, undefined));
  const redone = session.redo();
  ids.forEach((id, index) => assert.equal(redone.objects[id].module_data.phase_assignment, phases[index]));
  assert.deepEqual(deserializeProject(serializeProject(redone)), redone);
});

test("Electrical circuit assignment rolls back when connected load exceeds the breaker", () => {
  let p = empty();
  const panelId = crypto.randomUUID();
  p = execute(p, "PlaceElectricalFixture", {
    id: panelId, mark: "DB1", location_mm: [0, 0, 1800], kind: "panel", watts: 0,
    controlled_ids: [], switch_ways: 1, grounded: true,
  });
  const circuitId = crypto.randomUUID();
  p = execute(p, "CreateCircuit", {
    id: circuitId, mark: "CKT1", panel_id: panelId, device_ids: [], voltage: 230,
    breaker_a: 16, allowable_current_a: 20, cable_mm2: 2.5,
  });
  const heaterId = crypto.randomUUID();
  p = execute(p, "PlaceElectricalFixture", {
    id: heaterId, mark: "WH1", location_mm: [1000, 1000, 1200], kind: "outlet", watts: 5000,
    controlled_ids: [], switch_ways: 1, grounded: true,
  });

  const result = CommandBus.execute(p, "AssignFixtureToCircuit", { fixture_id: heaterId, circuit_id: circuitId });
  assert.equal(result.result.status, "failed");
  assert.match(result.result.errors[0], /connected load/i);
  assert.deepEqual(result.updatedProject.objects[circuitId].module_data.device_ids, []);
  assert.equal(result.updatedProject.objects[heaterId].module_data.circuit_id, undefined);
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
  const pumpBypassId = crypto.randomUUID();
  const waterPipeId = crypto.randomUUID();
  let p = execute(empty(), "CreatePumpBypass", {
    id: pumpBypassId, mark: "PB1", location_mm: [1000, 2000, 2200],
    span_mm: 2000, diameter_mm: 25, mode: "pump",
    valve_states: { inlet: true, outlet: true, bypass: false },
  });
  p = execute(p, "CreatePipeRoute", {
    id: waterPipeId, mark: "CW1", system: "cold_water",
    nodes_mm: [[900, 2000, 2200], [4000, 2000, 2200]],
    start_node_id: pumpBypassId, diameter_mm: 20, material: "PPR",
  });
  assert.deepEqual(p.objects[waterPipeId].module_data.nodes_mm[0], [1000, 2000, 2200]);
  assert.deepEqual(p.objects[waterPipeId].host_refs, [pumpBypassId]);
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
      subviews: [{ scale_denominator: 50, center_mm: [1200, 800] }],
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

test("sheet layout templates persist reusable viewport settings and batch-apply with one undo", () => {
  const session = new ProjectCommandSession(empty());
  const template = {
    id: "layout-house",
    name: "บ้านสองชั้น",
    viewports: {
      "A-02": { scale_denominator: 50, level_id: session.project.levels[0].id, center_mm: [5000, 3000] },
      "S-02": { scale_denominator: 50, level_id: session.project.levels[0].id, crop_bounds_mm: [0, 0, 12000, 9000] },
      "A-05": { scale_denominator: 100, view_layout: ["north", "rcp", "west", "section_x", "section_y", "isometric"], paper_frame_mm: [12, 18, 170, 110], subviews: [{ scale_denominator: 50, paper_frame_mm: [210, 18, 190, 110] }, { scale_denominator: 25 }, { scale_denominator: 100 }, { scale_denominator: 200 }, { scale_denominator: 500 }] },
    },
  };
  const saved = session.execute([{ name: "SaveSheetLayoutTemplate", input: { template } }]);
  assert.equal(saved.status, "success");
  assert.deepEqual(deserializeProject(serializeProject(saved.updatedProject)).drawing_settings.layout_templates, [template]);
  const applied = session.execute(Object.entries(template.viewports).map(([sheet_id, viewport]) => ({
    name: "UpdateSheetViewport", input: { sheet_id, viewport },
  })));
  assert.equal(applied.status, "success");
  assert.equal(applied.updatedProject.drawing_settings.viewports["A-02"].scale_denominator, 50);
  assert.deepEqual(applied.updatedProject.drawing_settings.viewports["A-05"].view_layout, ["north", "rcp", "west", "section_x", "section_y", "isometric"]);
  assert.deepEqual(applied.updatedProject.drawing_settings.viewports["A-05"].subviews, [{ scale_denominator: 50, paper_frame_mm: [210, 18, 190, 110] }, { scale_denominator: 25 }, { scale_denominator: 100 }, { scale_denominator: 200 }, { scale_denominator: 500 }]);
  assert.deepEqual(applied.updatedProject.drawing_settings.viewports["A-05"].paper_frame_mm, [12, 18, 170, 110]);
  assert.deepEqual(session.undo().drawing_settings.viewports, {});
  const redone = session.redo();
  assert.deepEqual(redone.drawing_settings.viewports["S-02"].crop_bounds_mm, [0, 0, 12000, 9000]);
  assert.deepEqual(redone.drawing_settings.viewports["A-05"].paper_frame_mm, [12, 18, 170, 110]);
  assert.equal(session.execute([{ name: "SaveSheetLayoutTemplate", input: { template: { ...template, id: "duplicate", name: "บ้านสองชั้น" } } }]).status, "failed");
  assert.equal(session.execute([{ name: "DeleteSheetLayoutTemplate", input: { template_id: template.id } }]).status, "success");
  assert.equal(session.undo().drawing_settings.layout_templates[0].id, template.id);
});

test('site survey observations retain measured versus assumed provenance through save and undo', () => {
  const session = new ProjectCommandSession(empty());
  const survey = {
    id: 'survey-lot-9', name: 'Lot 9', source_file: 'lot9.csv', coordinate_system: 'local-grid-01', imported_at: '2026-10-14T00:00:00.000Z',
    points: [
      { id: 'P1', name: 'North west', x_mm: 0, y_mm: 0, elevation_mm: 1200, source_status: 'measured', source_reference: 'Station A · field book 12' },
      { id: 'P2', name: 'North east', x_mm: 10000, y_mm: 0, elevation_mm: 1220, source_status: 'measured', source_reference: 'Station B · field book 12' },
      { id: 'P3', name: 'South east', x_mm: 10000, y_mm: 8000, source_status: 'assumed', source_reference: 'Deed sketch estimate' },
    ],
    boundaries: [{ id: 'LOT-9', name: 'Parcel', point_ids: ['P1', 'P2', 'P3'] }],
  };
  const saved = session.execute([{ name: 'UpdateSiteSurvey', input: { survey } }]);
  assert.equal(saved.status, 'success');
  assert.deepEqual(deserializeProject(serializeProject(saved.updatedProject)).site_survey, survey);
  assert.equal(saved.updatedProject.site_survey.points.filter(point => point.source_status === 'measured').length, 2);
  assert.equal(saved.updatedProject.site_survey.points.filter(point => point.source_status === 'assumed').length, 1);
  assert.equal(session.undo().site_survey, undefined);
  assert.deepEqual(session.redo().site_survey, survey);
  const invalid = { ...survey, points: survey.points.map(point => point.id === 'P3' ? { ...point, source_reference: '' } : point) };
  assert.equal(session.execute([{ name: 'UpdateSiteSurvey', input: { survey: invalid } }]).status, 'failed');
  assert.deepEqual(session.project.site_survey, survey);
});

test('model objects keep traceable survey and underlay sources through undo, redo, and serialization', () => {
  const project = empty();
  project.underlays = { 'plan:level-ground': { data_url: 'data:image/svg+xml;base64,PHN2Zy8+', origin_mm: [0, 0], scale_mm_per_px: 1, rotation_deg: 0, opacity: 1, visible: true } };
  const session = new ProjectCommandSession(project);
  const wallId = crypto.randomUUID();
  const created = session.execute([{ name: 'CreateWall', input: { id: wallId, mark: 'W1', start_point_mm: [0, 0], end_point_mm: [4000, 0], thickness_mm: 100, height_mm: 2800 } }]);
  assert.equal(created.status, 'success');
  const survey = {
    id: 'survey-lot-9', name: 'Lot 9', source_file: 'lot9.csv', coordinate_system: 'local-grid-01', imported_at: '2026-10-14T00:00:00.000Z',
    points: [
      { id: 'P1', name: 'North west', x_mm: 0, y_mm: 0, source_status: 'measured', source_reference: 'Station A · field book 12' },
      { id: 'P2', name: 'North east', x_mm: 10000, y_mm: 0, source_status: 'assumed', source_reference: 'Deed sketch estimate' },
      { id: 'P3', name: 'South east', x_mm: 10000, y_mm: 8000, source_status: 'measured', source_reference: 'Station C · field book 12' },
    ],
    boundaries: [{ id: 'LOT-9', name: 'Parcel', point_ids: ['P1', 'P2', 'P3'] }],
  };
  assert.equal(session.execute([{ name: 'UpdateSiteSurvey', input: { survey } }]).status, 'success');
  const source_refs = [
    { kind: 'site_survey_point', source_id: 'P1' },
    { kind: 'site_survey_boundary', source_id: 'LOT-9' },
    { kind: 'underlay', source_id: 'plan:level-ground' },
    { kind: 'drawing_page', source_id: 'customer-plan.pdf#3', label: 'customer-plan.pdf', page_number: 3, evidence: 'Exterior wall', confidence: 'medium' },
  ];
  assert.equal(session.execute([{ name: 'UpdateObjectSourceReferences', input: { object_ids: [wallId], source_refs } }]).status, 'success');
  assert.deepEqual(session.project.objects[wallId].source_refs, source_refs);
  assert.deepEqual(deserializeProject(serializeProject(session.project)).objects[wallId].source_refs, source_refs);
  assert.equal(session.undo().objects[wallId].source_refs, undefined);
  assert.deepEqual(session.redo().objects[wallId].source_refs, source_refs);
  const invalid = session.execute([{ name: 'UpdateObjectSourceReferences', input: { object_ids: [wallId], source_refs: [{ kind: 'site_survey_point', source_id: 'MISSING' }] } }]);
  assert.equal(invalid.status, 'failed');
  assert.deepEqual(session.project.objects[wallId].source_refs, source_refs);
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
