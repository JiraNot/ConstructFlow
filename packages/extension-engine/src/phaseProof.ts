import type { ProjectDocument } from "@constructflow/project-model";
import type { CommandRequest } from "@constructflow/command-schema";

/** An explicit review fixture, not a construction design recommendation. */
export function planPhaseProof(project: ProjectDocument): CommandRequest[] {
  const level_id = project.project.active_level_id,
    commands: CommandRequest[] = [];
  const add = (name: string, input: Record<string, unknown>) => {
    const id = crypto.randomUUID();
    commands.push({
      name,
      input: { level_id, ...input, id, created_phase: "new_construction" },
    });
    return id;
  };
  const beam = Object.values(project.objects).find(
      (o) => o.object_type === "structure.beam",
    ),
    wall = Object.values(project.objects).find(
      (o) =>
        o.object_type === "architecture.wall" &&
        o.created_phase === "new_construction",
    );
  const boundary_mm: [
    [number, number],
    [number, number],
    [number, number],
    [number, number],
  ] = [
    [0, 0],
    [4000, 0],
    [4000, 2500],
    [0, 2500],
  ];
  const type = project.types.find(
    (t) => t.object_type === "structure.slab" && t.name === "GS",
  );
  add("CreateSlab", {
    mark: "GS",
    type_id: type?.id,
    boundary_mm,
    elevation_mm: 0,
    thickness_mm: 120,
    topping_mm: 0,
    slab_system: "slab_on_ground",
    material: "reinforced_concrete",
    slope_ratio: 0,
  });
  add("GenerateRoof", {
    mark: "R1",
    boundary_mm,
    elevation_mm: 3000,
    edges: boundary_mm.map(() => ({ defines_slope: true, slope_deg: 20 })),
    thickness_mm: 30,
    material: "metal_sheet",
  });
  for (let i = 0; i < boundary_mm.length; i++) {
    const a = boundary_mm[i],
      b = boundary_mm[(i + 1) % boundary_mm.length];
    add("CreateBeam", {
      mark: "RB1",
      start_point_mm: [...a, 3000],
      end_point_mm: [...b, 3000],
      section_mm: [150, 300],
      material: "reinforced_concrete",
      level_id:
        project.levels.find((l) => l.elevation_mm === 3000)?.id ?? level_id,
    });
  }
  if (beam) {
    const d = beam.module_data as Record<string, unknown>,
      a = d.start_point_mm as number[],
      b = d.end_point_mm as number[],
      clear = Math.hypot(...b.map((v, i) => v - a[i])) - 60;
    const bar = {
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
    commands.push({
      name: "ConfigureBeamReinforcement",
      input: {
        host_id: beam.id,
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
            spacing_zones: [{ start_mm: 0, end_mm: clear, spacing_mm: 150 }],
          },
        },
      },
    });
    commands.push({ name: "SetBeamDrop", input: { id: beam.id, drop_mm: 50 } });
  }
  add("CreateMouldingRun", {
    mark: "SK1",
    path_mm: [
      [0, 0, 80],
      [4000, 0, 80],
      [4000, 2500, 80],
      [0, 2500, 80],
    ],
    profile_mm: [
      [0, 0],
      [15, 0],
      [15, 80],
      [0, 80],
    ],
    closed: true,
    miter_limit: 4,
    material: "painted_wood",
  });
  if (wall)
    add("SetPanelLayout", {
      mark: "PN1",
      host_id: wall.id,
      rows: 2,
      columns: 3,
      margin_mm: 100,
      gap_mm: 50,
      depth_mm: 18,
      material: "painted_mdf",
    });
  const start = add("PlaceManhole", {
    mark: "MH1",
    location_mm: [4500, 0, 0],
    size_mm: [400, 500, 600],
    invert_mm: -300,
    system: "waste",
  });
  const end = add("PlaceManhole", {
    mark: "MH2",
    location_mm: [4500, 4000, 0],
    size_mm: [400, 500, 700],
    invert_mm: -400,
    system: "waste",
  });
  add("CreatePipeRoute", {
    mark: "WP1",
    system: "waste",
    nodes_mm: [
      [4500, 0, -300],
      [4500, 4000, -400],
    ],
    start_node_id: start,
    end_node_id: end,
    start_invert_mm: -300,
    end_invert_mm: -400,
    minimum_slope_ratio: 0.01,
    diameter_mm: 50,
    material: "PVC",
  });
  add("CreatePumpBypass", {
    mark: "PUMP1",
    location_mm: [5000, 0, 0],
    span_mm: 2000,
    diameter_mm: 25,
    mode: "pump",
    valve_states: { inlet: true, outlet: true, bypass: false },
  });
  add("CreateBathroom", {
    mark: "BATH1",
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
  });
  const cabinet = add("CreateCabinetRun", {
    mark: "CB1",
    location_mm: [200, 200, 0],
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
  });
  add("CreateLEDRun", {
    mark: "LED1",
    host_id: cabinet,
    path_mm: [
      [200, 200, 800],
      [2600, 200, 800],
    ],
    watts_per_m: 9.6,
    voltage: 24,
    driver_watts: 40,
    derating_ratio: 0.8,
    material: "aluminium_profile_diffuser",
  });
  const panel = add("PlaceElectricalFixture", {
    mark: "DB1",
    kind: "panel",
    location_mm: [0, 0, 1500],
    watts: 0,
    grounded: true,
    controlled_ids: [],
    switch_ways: 1,
  });
  const light = add("PlaceElectricalFixture", {
    mark: "L1",
    kind: "light",
    location_mm: [2000, 1200, 2700],
    watts: 18,
    grounded: true,
    controlled_ids: [],
    switch_ways: 1,
  });
  const outlet = add("PlaceElectricalFixture", {
    mark: "SO1",
    kind: "outlet",
    location_mm: [1000, 0, 1100],
    watts: 1000,
    grounded: true,
    controlled_ids: [],
    switch_ways: 1,
  });
  add("PlaceElectricalFixture", {
    mark: "SW1",
    kind: "switch",
    location_mm: [0, 800, 1200],
    watts: 0,
    grounded: true,
    controlled_ids: [light],
    switch_ways: 1,
  });
  add("CreateCircuit", {
    mark: "CKT1",
    panel_id: panel,
    device_ids: [light, outlet],
    voltage: 230,
    breaker_a: 16,
    cable_mm2: 2.5,
    allowable_current_a: 20,
  });
  return commands;
}
