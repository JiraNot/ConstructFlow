import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDirectManipulationCommands, optimisticManipulationProject, resizeOrientedRectangle } from '../src/directManipulation.mjs'
import { getEditableRoofRidge, getRoofSeams } from '@constructflow/roof-engine'

const object = (id, object_type, module_data, extra = {}) => ({
  id, object_type, status: 'active', host_refs: [], level_refs: [], module_data,
  ...extra,
})

test('rotated corner resize keeps the opposite corner anchored', () => {
  const center = [1000, 1000], size = [400, 200], rotation = 90
  const result = resizeOrientedRectangle(center, size, rotation, 0, [1300, 800])
  assert.deepEqual(result.size_mm, [400, 400])
  const toWorld = (c, local) => {
    const angle = rotation * Math.PI / 180
    return [c[0] + local[0] * Math.cos(angle) - local[1] * Math.sin(angle), c[1] + local[0] * Math.sin(angle) + local[1] * Math.cos(angle)]
  }
  const originalAnchor = toWorld(center, [size[0] / 2, size[1] / 2])
  const nextAnchor = toWorld(result.center_mm, [result.size_mm[0] / 2, result.size_mm[1] / 2])
  assert.ok(Math.hypot(originalAnchor[0] - nextAnchor[0], originalAnchor[1] - nextAnchor[1]) < 1e-8)
})

test('stair grips update parametric width and run while retaining instance properties', () => {
  const project = { objects: {
    stair: object('stair', 'architecture.stair', { start_point_mm: [0, 0, 0], width_mm: 1000, rotation_deg: 0, stair_type: 'straight', num_risers: 11, tread_depth_mm: 250, total_rise_mm: 3000 }),
  } }
  const width = buildDirectManipulationCommands(project, { id: 'stair', kind: 'stair-width', startWorldMm: [0, 0], startScreenPx: [0, 0] }, [0, 1250])
  assert.equal(width[0].name, 'UpdateStair')
  assert.equal(width[0].input.width_mm, 1250)
  assert.equal(width[0].input.num_risers, 11)

  const run = buildDirectManipulationCommands(project, { id: 'stair', kind: 'stair-run', startWorldMm: [0, 0], startScreenPx: [0, 0] }, [3000, 0])
  assert.equal(run[0].input.tread_depth_mm, 300)
  assert.equal(run[0].input.total_rise_mm, 3000)
})

test('pipe route bend grip edits only the selected intermediate plan node', () => {
  const route = {
    nodes_mm: [[0, 0, -300], [2000, 0, -320], [4000, 0, -340]],
    system: 'waste', start_node_id: undefined, end_node_id: undefined,
  }
  const project = { objects: { pipe: object('pipe', 'drainage.pipe_route', route) } }
  const commands = buildDirectManipulationCommands(project, {
    id: 'pipe', kind: 'pipe-node', endpointIndex: 1,
    pipeRouteData: route, startWorldMm: [2000, 0], startScreenPx: [0, 0],
  }, [2200, 400])
  assert.equal(commands.length, 1)
  assert.equal(commands[0].name, 'EditPipeRoute')
  assert.deepEqual(commands[0].input.nodes_mm, [[0, 0, -300], [2200, 400, -320], [4000, 0, -340]])
})

test('wall preview moves hosted openings from the original baseline and includes dependents', () => {
  const project = { objects: {
    wall: object('wall', 'architecture.wall', { start_point_mm: [0, 0, 0], end_point_mm: [4000, 0, 0], thickness_mm: 100, length_mm: 4000 }),
    door: object('door', 'door_window.door', { wall_id: 'wall', location_mm: [1000, 0, 0], offset_along_wall_mm: 1000, width_mm: 900, height_mm: 2100 }),
  } }
  const commands = buildDirectManipulationCommands(project, { id: 'wall', kind: 'wall', startWorldMm: [200, 0], startScreenPx: [0, 0] }, [700, 300])
  assert.deepEqual(commands, [{ name: 'MoveWall', input: { object_id: 'wall', delta_mm: [500, 300] } }])
  const candidate = optimisticManipulationProject(project, commands)
  assert.deepEqual(candidate.objects.wall.module_data.start_point_mm, [500, 300, 0])
  assert.deepEqual(candidate.objects.wall.module_data.end_point_mm, [4500, 300, 0])
  assert.deepEqual(candidate.objects.door.module_data.location_mm, [1500, 300, 0])
  assert.deepEqual(project.objects.wall.module_data.start_point_mm, [0, 0, 0], 'preview must leave the committed model untouched')
})

test('group translation does not move a hosted opening twice', () => {
  const project = { objects: {
    wall: object('wall', 'architecture.wall', { start_point_mm: [0, 0, 0], end_point_mm: [4000, 0, 0], thickness_mm: 100, length_mm: 4000 }),
    door: object('door', 'door_window.door', { wall_id: 'wall', location_mm: [1200, 0, 0], offset_along_wall_mm: 1200, width_mm: 900, height_mm: 2100 }),
  } }
  const commands = buildDirectManipulationCommands(project, { id: 'wall', kind: 'group-move', objectIds: ['wall', 'door'], startWorldMm: [0, 0], startScreenPx: [0, 0] }, [300, 0])
  assert.equal(commands.length, 1)
  assert.equal(commands[0].name, 'MoveWall')
  const candidate = optimisticManipulationProject(project, commands)
  assert.equal(candidate.objects.door.module_data.location_mm[0], 1500)
})

test('opening preview preserves its wall host and rejects nothing until the command validator runs', () => {
  const project = { objects: {
    wall: object('wall', 'architecture.wall', { start_point_mm: [0, 0, 0], end_point_mm: [4000, 0, 0], thickness_mm: 100, length_mm: 4000 }),
    window: object('window', 'door_window.window', { wall_id: 'wall', location_mm: [1500, 0, 0], offset_along_wall_mm: 1500, width_mm: 1200, height_mm: 1200, sill_height_mm: 900 }),
  } }
  const commands = buildDirectManipulationCommands(project, { id: 'window', kind: 'opening-edge', endpointIndex: 1, startWorldMm: [2100, 0], startScreenPx: [0, 0], hostStartMm: [0, 0], hostEndMm: [4000, 0], openingCenterOffsetMm: 1500, openingWidthMm: 1200 }, [2500, 0], { openingResize: { width_mm: 1600, offset_along_wall_mm: 1700 } })
  const candidate = optimisticManipulationProject(project, commands)
  assert.equal(candidate.objects.window.module_data.wall_id, 'wall')
  assert.equal(candidate.objects.window.module_data.width_mm, 1600)
  assert.deepEqual(candidate.objects.window.module_data.location_mm, [1700, 0, 0])
})

test('slab edge and drainage grips preview type-safe geometry edits from the original model', () => {
  const boundary = [[0, 0], [4000, 0], [4000, 3000], [0, 3000]]
  const voids = [[[1500, 1000], [2500, 1000], [2500, 2000], [1500, 2000]]]
  const project = { objects: {
    slab: object('slab', 'structure.slab', { boundary_mm: boundary, voids_mm: voids, slope_ratio: 0.01, drain_direction_deg: 0, thickness_mm: 150 }),
  } }
  const edge = buildDirectManipulationCommands(project, {
    id: 'slab', kind: 'slab-edge', endpointIndex: 0,
    startWorldMm: [2000, 0], startScreenPx: [0, 0], boundaryPointsMm: boundary,
    edgeStartMm: [2000, 0], edgeNormalMm: [0, 1],
  }, [2000, 400])
  assert.equal(edge[0].name, 'UpdateSlab')
  const movedEdge = optimisticManipulationProject(project, edge).objects.slab.module_data
  assert.deepEqual(movedEdge.boundary_mm, [[0, 400], [4000, 400], [4000, 3000], [0, 3000]])
  assert.deepEqual(movedEdge.voids_mm, voids, 'edge changes retain the slab opening for domain validation')

  const slope = buildDirectManipulationCommands(project, {
    id: 'slab', kind: 'slab-slope', startWorldMm: [2000, 1500], startScreenPx: [0, 0], edgeStartMm: [2000, 1500],
  }, [2000, 2500])
  const changedSlope = optimisticManipulationProject(project, slope).objects.slab.module_data
  assert.equal(slope[0].name, 'UpdateSlab')
  assert.equal(changedSlope.drain_direction_deg, 90)
  assert.equal(project.objects.slab.module_data.drain_direction_deg, 0, 'preview leaves the source project untouched')
})

test('roof ridge grip updates the opposing gable pitches while retaining the existing peak datum', () => {
  const project = { objects: {
    roof: object('roof', 'roof.system', {
      boundary_mm: [[0, 0], [10000, 0], [10000, 8000], [0, 8000]],
      edges: [
        { defines_slope: true, slope_deg: 25 }, { defines_slope: false, slope_deg: 0 },
        { defines_slope: true, slope_deg: 25 }, { defines_slope: false, slope_deg: 0 },
      ],
      elevation_mm: 3500, thickness_mm: 30, material: 'metal_sheet',
    }),
  } }
  const before = getEditableRoofRidge(project.objects.roof.module_data)
  const commands = buildDirectManipulationCommands(project, { id: 'roof', kind: 'roof-ridge', startWorldMm: [5000, 4000], startScreenPx: [0, 0] }, [5000, 3000])
  const candidate = optimisticManipulationProject(project, commands)
  const after = getEditableRoofRidge(candidate.objects.roof.module_data)
  assert.equal(commands[0].name, 'UpdateRoof')
  assert.ok(Math.abs(after.grip_mm[1] - 3000) < 1e-6)
  assert.ok(Math.abs(after.rise_mm - before.rise_mm) < 1e-6)
})

test('hip ridge and valley seam grips create roof ghost candidates by changing their supporting pitches', () => {
  const hipData = {
    boundary_mm: [[0, 0], [10000, 0], [10000, 8000], [0, 8000]],
    edges: Array(4).fill({ defines_slope: true, slope_deg: 25 }),
    elevation_mm: 2800, thickness_mm: 30, material: 'metal_sheet',
  }
  const hipProject = { objects: { roof: object('roof', 'roof.system', hipData) } }
  const ridge = getEditableRoofRidge(hipData)
  assert.ok(ridge)
  const ridgeCommands = buildDirectManipulationCommands(hipProject, {
    id: 'roof', kind: 'roof-ridge', startWorldMm: ridge.grip_mm, startScreenPx: [0, 0],
  }, [5000, 3500])
  const movedHip = getEditableRoofRidge(optimisticManipulationProject(hipProject, ridgeCommands).objects.roof.module_data)
  assert.ok(movedHip)
  assert.ok(Math.abs(movedHip.grip_mm[1] - 3500) < 1e-6)

  const valleyData = {
    boundary_mm: [[0, 0], [6000, 0], [6000, 3000], [3000, 3000], [3000, 5000], [0, 5000]],
    edges: Array(6).fill({ defines_slope: true, slope_deg: 25 }),
    elevation_mm: 2800, thickness_mm: 30, material: 'metal_sheet',
  }
  const valley = getRoofSeams(valleyData).find((seam) => seam.kind === 'valley')
  assert.ok(valley)
  const valleyProject = { objects: { roof: object('roof', 'roof.system', valleyData) } }
  const valleyCommands = buildDirectManipulationCommands(valleyProject, {
    id: 'roof', kind: 'roof-seam', roofSeamEdgeIndices: valley.edge_indices,
    startWorldMm: valley.grip_mm, startScreenPx: [0, 0],
  }, [valley.grip_mm[0] - 100, valley.grip_mm[1] - 100])
  assert.equal(valleyCommands[0]?.name, 'UpdateRoof')
  const valleyGhost = optimisticManipulationProject(valleyProject, valleyCommands).objects.roof.module_data
  assert.deepEqual(valleyGhost.boundary_mm, valleyData.boundary_mm)
  assert.notDeepEqual(valleyGhost.edges, valleyData.edges)
})

test('body movement builds a family-aware command for each supported plan object family', () => {
  const point = [100, 200]
  const cases = [
    ['wall', 'architecture.wall', { start_point_mm: [0, 0, 0], end_point_mm: [4000, 0, 0], thickness_mm: 100 }, 'MoveWall'],
    ['column', 'structure.column', { location_mm: [0, 0, 0], section_mm: [200, 200] }, 'MoveColumn'],
    ['foundation', 'structure.foundation', { center_mm: [0, 0, -300], size_mm: [800, 800, 300] }, 'MoveFoundation'],
    ['beam', 'structure.beam', { start_point_mm: [0, 0, 0], end_point_mm: [3000, 0, 0], section_mm: [200, 400] }, 'UpdateBeamEndpoints'],
    ['grid', 'structure.grid', { start_point_mm: [0, 0], end_point_mm: [0, 4000], orientation: 'vertical', position_mm: 0, extent_mm: [0, 4000] }, 'ModifyGrid'],
    ['separator', 'architecture.room_separator', { start_point_mm: [0, 0], end_point_mm: [4000, 0] }, 'UpdateRoomSeparator'],
    ['slab', 'structure.slab', { boundary_mm: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]], voids_mm: [] }, 'UpdateSlab'],
    ['floor', 'architecture.floor', { boundary_mm: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]], voids_mm: [] }, 'UpdateArchitecturalFloor'],
    ['ceiling', 'architecture.ceiling', { boundary_mm: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]], voids_mm: [] }, 'UpdateCeiling'],
    ['roof', 'roof.system', { boundary_mm: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]] }, 'UpdateRoof'],
    ['room', 'architecture.room', { boundary_mm: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]] }, 'UpdateRoom'],
    ['stair', 'architecture.stair', { start_point_mm: [0, 0, 0], width_mm: 1000, rotation_deg: 0 }, 'UpdateStair'],
    ['fixture', 'electrical.fixture', { location_mm: [0, 0, 2400] }, 'UpdateElectricalFixture'],
    ['cabinet', 'interior.cabinet_run', { location_mm: [0, 0, 0], width_mm: 1200, depth_mm: 600, rotation_deg: 0 }, 'UpdateCabinetRun'],
    ['moulding', 'decorative.moulding_run', { path_mm: [[0, 0, 2700], [4000, 0, 2700]] }, 'UpdateMouldingRun'],
    ['drainage', 'drainage.pipe_route', { nodes_mm: [[0, 0, 0], [4000, 0, -40]] }, 'EditPipeRoute'],
    ['plumbing', 'plumbing.pipe_route', { nodes_mm: [[0, 0, 0], [4000, 0, 0]] }, 'EditPipeRoute'],
    ['manhole', 'drainage.manhole', { location_mm: [0, 0, 0] }, 'UpdateManhole'],
    ['septic', 'drainage.septic_tank', { location_mm: [0, 0, 0] }, 'UpdateSepticTank'],
    ['pump', 'plumbing.pump_bypass', { location_mm: [0, 0, 0] }, 'UpdatePumpBypass'],
    ['led', 'lighting.led_run', { path_mm: [[0, 0, 2700], [4000, 0, 2700]] }, 'UpdateLEDRun'],
    ['bathroom', 'architecture.bathroom', { boundary_mm: [[0, 0], [2000, 0], [2000, 2000], [0, 2000]], drain_mm: [1000, 1000] }, 'UpdateBathroom'],
  ]

  for (const [id, type, data, expectedCommand] of cases) {
    const project = { objects: { [id]: object(id, type, data) } }
    const commands = buildDirectManipulationCommands(project, { id, kind: 'object-move', startWorldMm: [0, 0], startScreenPx: [0, 0] }, point)
    assert.equal(commands.length, 1, `${type} should produce one move/update command`)
    assert.equal(commands[0].name, expectedCommand, `${type} should use its family-aware edit command`)
    const candidate = optimisticManipulationProject(project, commands)
    assert.ok(candidate.objects[id], `${type} should remain present in the ghost candidate`)
    assert.notDeepEqual(candidate.objects[id].module_data, data, `${type} should preview changed family geometry`)
  }
})
