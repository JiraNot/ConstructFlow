import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createEmptyProjectDocument, deserializeProject } from '../../project-model/dist/index.js'
import { buildProjectRepresentations3D, getElevationVisibleOpeningIds, getElevationVisibleWallIds, getOpeningElevationLinework, getPlanViewProject, getPlanVisibleObjects, getRepresentationTriangles, isWallFacadeForElevation, resolveElevationWallPhaseStyle } from '../dist/index.js'

const fixture = deserializeProject(await readFile(new URL('../../../examples/kitchen-extension-proof.cfproj', import.meta.url), 'utf8'))

test('elevation wall phase palette is shared and distinguishes existing, new and demolition work', () => {
  assert.deepEqual(resolveElevationWallPhaseStyle('existing'), { fill: '#ffffff', stroke: '#64748b', dash: [] })
  assert.deepEqual(resolveElevationWallPhaseStyle('new_construction'), { fill: '#e3e8ed', stroke: '#334155', dash: [] })
  assert.deepEqual(resolveElevationWallPhaseStyle('demolition'), { fill: '#fee2e2', stroke: '#ef4444', dash: [6, 3] })
})

test('3D representations are deterministic and keep phase and supported interactions', () => {
  const first = buildProjectRepresentations3D(fixture)
  const second = buildProjectRepresentations3D(fixture)

  assert.deepEqual(first, second)
  assert.deepEqual(first.objects.map(object => object.object_id), [...first.objects.map(object => object.object_id)].sort())
  assert.equal(first.objects.length, 18)
  assert.deepEqual(first.warnings, [])

  const column = first.objects.find(object => object.object_type === 'structure.column')
  assert.equal(column.display_phase, 'new_construction')
  assert.equal(column.shape.kind, 'box')
  assert.deepEqual(column.shape.size_mm, [200, 200, 3000])
  assert.deepEqual(column.interaction, { kind: 'column' })

  const foundation = first.objects.find(object => object.object_type === 'structure.foundation')
  assert.equal(foundation.interaction.kind, 'supported_foundation')
  assert.ok(first.objects.some(object => object.display_phase === 'existing'))
})

test('wall geometry contains catalog-resolved door and window cutouts', () => {
  const result = buildProjectRepresentations3D(fixture)
  const openings = Object.values(fixture.objects).filter(object => object.object_type.startsWith('door_window.'))
  for (const openingInstance of openings) {
    const wall = result.objects.find(object => object.object_id === openingInstance.module_data.wall_id && object.shape.kind === 'wall_extrusion')
    assert.ok(wall)
    assert.ok(wall.shape.cutouts.some(cutout => cutout.object_id === openingInstance.id))
  }

  const doorInstance = openings.find(object => object.object_type === 'door_window.door')
  const wall = result.objects.find(object => object.object_id === doorInstance.module_data.wall_id)
  const opening = result.objects.find(object => object.object_type === 'door_window.door')
  assert.equal(opening.interaction.kind, 'hosted_opening')
  assert.equal(opening.interaction.width_mm, 900)
  assert.equal(opening.interaction.host_wall_id, wall.object_id)
  assert.equal(opening.shape.kind, 'opening')
  assert.equal(opening.shape.opening_type, 'door')
  assert.equal(opening.shape.operation, 'hinged')
  assert.ok(opening.shape.frame_depth_mm > 0)

  const window = openings.find(object => object.object_type === 'door_window.window')
  const windowRepresentation = result.objects.find(object => object.object_id === window.id)
  assert.equal(windowRepresentation.shape.kind, 'opening')
  assert.equal(windowRepresentation.shape.opening_type, 'window')
  assert.equal(windowRepresentation.shape.operation, 'sliding')
  assert.ok(windowRepresentation.shape.glazing_transmission > 0)
})

test('shared elevation mesh expansion returns world-space structural edges and keeps hosted openings as voids', () => {
  const result = buildProjectRepresentations3D(fixture)
  const column = result.objects.find(object => object.object_type === 'structure.column')
  const columnTriangles = getRepresentationTriangles(column)
  assert.equal(columnTriangles.length, 12)
  const columnPoints = columnTriangles.flat()
  assert.equal(Math.min(...columnPoints.map(point => point[0])), column.position_mm[0] - 100)
  assert.equal(Math.max(...columnPoints.map(point => point[2])), column.position_mm[2] + 1500)

  const door = result.objects.find(object => object.object_type === 'door_window.door')
  assert.deepEqual(getRepresentationTriangles(door), [])
  const wall = result.objects.find(object => object.object_id === door.interaction.host_wall_id)
  const wallTriangles = getRepresentationTriangles(wall)
  assert.ok(wallTriangles.length > 12)
  assert.ok(wallTriangles.every(triangle => triangle.every(point => point.every(Number.isFinite))))
})

test('3D column spans exactly to its selected upper datum, including storeys shorter than 3 m', () => {
  const project = structuredClone(fixture)
  project.levels = [
    { id: 'GF', name: 'Ground', elevation_mm: 0, storey_index: 0, height_mm: 400 },
    { id: 'L1', name: 'First Floor', elevation_mm: 400, storey_index: 1, height_mm: 3000 },
    { id: 'EAVE', name: 'Eaves', elevation_mm: 3400, storey_index: 2, height_mm: 2000 },
  ]
  const column = Object.values(project.objects).find(object => object.object_type === 'structure.column')
  column.module_data.base_level_id = 'GF'
  column.module_data.top_level_id = 'EAVE'
  column.module_data.base_offset_mm = 0
  column.module_data.top_offset_mm = 0
  const representation = buildProjectRepresentations3D(project).objects.find(object => object.object_id === column.id)
  assert.equal(representation.shape.size_mm[2], 3400)
  assert.equal(representation.position_mm[2], 1700)
})

test('beam representation follows its level and embed offset even when legacy point Z is stale', () => {
  const project = structuredClone(fixture)
  project.levels = [
    { id: 'GF', name: 'Ground Floor', elevation_mm: 0, storey_index: 0, height_mm: 3000 },
    { id: 'L1', name: 'First Floor', elevation_mm: 3000, storey_index: 1, height_mm: 3000 },
  ]
  const beam = Object.values(project.objects).find(object => object.object_type === 'structure.beam')
  beam.module_data.level_id = 'GF'
  beam.module_data.base_offset_mm = -200
  beam.module_data.start_point_mm[2] = 9000
  beam.module_data.end_point_mm[2] = 9000
  const representation = buildProjectRepresentations3D(project).objects.find(object => object.object_id === beam.id)
  assert.equal(representation.position_mm[2], 0)
})

test('opening representations preserve upper transom and glazing muntin layouts', () => {
  const project = structuredClone(fixture)
  const door = Object.values(project.objects).find(object => object.object_type === 'door_window.door')
  const window = Object.values(project.objects).find(object => object.object_type === 'door_window.window')
  const doorType = project.types.find(type => type.id === door.module_data.type_id)
  const windowType = project.types.find(type => type.id === window.module_data.type_id)
  doorType.parameters = { ...doorType.parameters, transom_height_mm: 420, muntin_columns: 3, panel_count: 2, panel_layout: ['hinged', 'fixed'] }
  windowType.parameters = { ...windowType.parameters, bottom_light_height_mm: 220, muntin_rows: 2, muntin_columns: 2, panel_count: 2, panel_layout: ['sliding', 'fixed'], panel_width_ratios: [0.65, 0.35] }

  const result = buildProjectRepresentations3D(project)
  const doorShape = result.objects.find(object => object.object_id === door.id).shape
  const windowShape = result.objects.find(object => object.object_id === window.id).shape
  assert.equal(doorShape.transom_height_mm, 420)
  assert.equal(doorShape.muntin_columns, 3)
  assert.deepEqual(doorShape.panel_layout, ['hinged', 'fixed'])
  assert.equal(windowShape.muntin_rows, 2)
  assert.equal(windowShape.muntin_columns, 2)
  assert.equal(windowShape.bottom_light_height_mm, 220)
  assert.deepEqual(windowShape.panel_layout, ['sliding', 'fixed'])
  assert.deepEqual(windowShape.panel_width_ratios, [0.65, 0.35])
})

test('opening frame and sash face widths resolve from the same catalog parameters as plan types', () => {
  const project = structuredClone(fixture)
  const door = Object.values(project.objects).find(object => object.object_type === 'door_window.door')
  const window = Object.values(project.objects).find(object => object.object_type === 'door_window.window')
  const doorType = project.types.find(type => type.id === door.module_data.type_id)
  const windowType = project.types.find(type => type.id === window.module_data.type_id)
  doorType.parameters = { ...doorType.parameters, frame_face_width_mm: 50, sash_face_width_mm: 45, door_leaf_thickness_mm: 42 }
  windowType.parameters = { ...windowType.parameters, frame_face_width_mm: 60, sash_face_width_mm: 42 }

  const result = buildProjectRepresentations3D(project)
  const doorShape = result.objects.find(object => object.object_id === door.id).shape
  const windowShape = result.objects.find(object => object.object_id === window.id).shape
  assert.equal(doorShape.frame_face_width_mm, 50)
  assert.equal(doorShape.sash_face_width_mm, 45)
  assert.equal(doorShape.door_leaf_thickness_mm, 42)
  assert.equal(windowShape.frame_face_width_mm, 60)
  assert.equal(windowShape.sash_face_width_mm, 42)
})

test('front-elevation opening linework uses catalog frame widths and asymmetric panel ratios without plan-only diagonals', () => {
  const project = JSON.parse(JSON.stringify(fixture))
  const window = Object.values(project.objects).find(object => object.object_type === 'door_window.window')
  assert.ok(window)
  window.module_data.width_mm = 2100
  window.module_data.height_mm = 1400
  window.module_data.frame_face_width_mm = 50
  window.module_data.panel_count = 2
  window.module_data.panel_width_ratios = [0.35, 0.65]
  window.module_data.muntin_rows = 2
  window.module_data.muntin_columns = 2
  const representation = buildProjectRepresentations3D(project).objects.find(object => object.object_id === window.id)
  assert.equal(representation.shape.kind, 'opening')
  const paths = getOpeningElevationLinework(representation.shape)
  assert.ok(paths.some(path => path.closed && path.fill === '#ffffff' && path.points_mm[0][0] === 0 && path.points_mm[2][0] === 2100))
  assert.ok(paths.some(path => !path.closed && path.points_mm[0][0] === 735 && path.points_mm[1][0] === 735), 'the meeting stile follows the 35/65 panel layout')
  assert.ok(paths.every(path => path.points_mm.length !== 2 || path.points_mm[0][0] === path.points_mm[1][0] || path.points_mm[0][1] === path.points_mm[1][1]), 'front elevation contains no diagonal X symbol')
  assert.ok(paths.some(path => path.closed && path.points_mm[0][0] === 50 && path.points_mm[0][1] === 50), 'the real 50 mm frame face sets the inner frame edge')
})

test('layered wall representations keep masonry core and both plaster faces distinct', () => {
  const project = structuredClone(fixture)
  const wall = Object.values(project.objects).find(object => object.object_type === 'architecture.wall')
  const type = project.types.find(candidate => candidate.id === wall.module_data.type_id)
  type.parameters = {
    ...type.parameters,
    thickness_mm: 120,
    masonry_thickness_mm: 100,
    plaster_inside_thickness_mm: 10,
    plaster_outside_thickness_mm: 10,
    plaster_inside_material: 'cement_plaster',
    plaster_outside_material: 'cement_plaster',
  }
  wall.module_data = {
    ...wall.module_data,
    thickness_mm: 120,
    masonry_thickness_mm: 100,
    plaster_inside_thickness_mm: 10,
    plaster_outside_thickness_mm: 10,
  }

  const representation = buildProjectRepresentations3D(project).objects.find(object => object.object_id === wall.id)
  assert.deepEqual(representation.shape.layers.map(layer => layer.role), ['masonry', 'plaster_inside', 'plaster_outside'])
  assert.deepEqual(representation.shape.layers.map(layer => layer.thickness_mm), [100, 10, 10])
  assert.deepEqual(representation.shape.layers.map(layer => layer.offset_mm), [0, 55, -55])
  assert.equal(representation.shape.thickness_mm, 120)

  type.parameters = { ...type.parameters, plaster_inside_thickness_mm: 5, plaster_outside_thickness_mm: 15 }
  wall.module_data = { ...wall.module_data, plaster_inside_thickness_mm: 5, plaster_outside_thickness_mm: 15 }
  const asymmetric = buildProjectRepresentations3D(project).objects.find(object => object.object_id === wall.id)
  assert.deepEqual(asymmetric.shape.layers.map(layer => layer.offset_mm), [5, 57.5, -52.5])
})

test('3D representations can be restricted to the active plan floor', () => {
  const project = structuredClone(fixture)
  project.project.active_level_id = 'L2'
  const visibleIds = new Set(getPlanVisibleObjects(project).map(object => object.id))
  const all = buildProjectRepresentations3D(project)
  const active = buildProjectRepresentations3D(project, { visibleObjectIds: visibleIds })

  assert.ok(active.objects.length < all.objects.length)
  assert.ok(active.objects.every(object => visibleIds.has(object.object_id)))
  assert.ok(active.objects.every(object => object.object_type !== 'architecture.wall' && !object.object_type.startsWith('door_window.')))
})

test('invalid hosted opening is reported and omitted from representation and wall cutouts', () => {
  const project = structuredClone(fixture)
  const opening = Object.values(project.objects).find(object => object.object_type === 'door_window.door')
  opening.module_data.instance_overrides = { ...(opening.module_data.instance_overrides ?? {}), width_mm: -1 }

  const result = buildProjectRepresentations3D(project)
  const wallId = opening.module_data.wall_id
  const wall = result.objects.find(object => object.object_id === wallId && object.shape.kind === 'wall_extrusion')

  assert.ok(result.warnings.some(warning => warning.includes(`${opening.id}: hosted opening dimensions are invalid`)))
  assert.equal(result.objects.some(object => object.object_id === opening.id), false)
  assert.equal(wall.shape.cutouts.length, 0)
})

test('plan visibility filters objects by active level while showing spanning columns on both floors', () => {
  const ground = getPlanVisibleObjects(fixture)
  assert.equal(ground.filter(object => object.object_type === 'structure.column').length, 4)
  assert.equal(ground.filter(object => object.object_type === 'structure.foundation').length, 4)
  assert.equal(ground.filter(object => object.object_type === 'structure.beam').length, 0)
  assert.equal(ground.filter(object => object.object_type === 'architecture.wall').length, 4)
  assert.equal(ground.filter(object => object.object_type.startsWith('door_window.')).length, 2)

  const firstFloorProject = structuredClone(fixture)
  firstFloorProject.project.active_level_id = 'L2'
  const firstFloor = getPlanVisibleObjects(firstFloorProject)
  assert.equal(firstFloor.filter(object => object.object_type === 'structure.column').length, 4)
  assert.equal(firstFloor.filter(object => object.object_type === 'structure.foundation').length, 0)
  assert.equal(firstFloor.filter(object => object.object_type === 'structure.beam').length, 4)
  assert.equal(firstFloor.filter(object => object.object_type === 'architecture.wall').length, 0)
  assert.equal(firstFloor.filter(object => object.object_type.startsWith('door_window.')).length, 0)
})

test('plan visibility keeps room and ceiling representations on their own active storey', () => {
  const project = structuredClone(fixture)
  const template = Object.values(project.objects).find(object => object.object_type === 'architecture.wall')
  for (const [id, object_type, level_id] of [
    ['room-ground', 'architecture.room', project.levels[0].id],
    ['room-upper', 'architecture.room', project.levels[1].id],
    ['floor-ground', 'architecture.floor', project.levels[0].id],
    ['floor-upper', 'architecture.floor', project.levels[1].id],
    ['ceiling-ground', 'architecture.ceiling', project.levels[0].id],
    ['ceiling-upper', 'architecture.ceiling', project.levels[1].id],
  ]) {
    project.objects[id] = { ...structuredClone(template), id, object_type, module_data: { level_id, boundary_mm: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]] } }
  }
  const ground = new Set(getPlanVisibleObjects(project).map(object => object.id))
  const groundPlan = new Set(Object.keys(getPlanViewProject(project).objects))
  assert.ok(ground.has('room-ground'))
  assert.ok(ground.has('floor-ground'))
  assert.ok(ground.has('ceiling-ground'))
  assert.equal(ground.has('room-upper'), false)
  assert.equal(ground.has('floor-upper'), false)
  assert.equal(ground.has('ceiling-upper'), false)
  assert.ok(groundPlan.has('floor-ground'))
  assert.equal(groundPlan.has('floor-upper'), false, 'the rendered plan project must not append semantic floors from another storey')

  project.project.active_level_id = project.levels[1].id
  const upper = new Set(getPlanVisibleObjects(project).map(object => object.id))
  const upperPlan = new Set(Object.keys(getPlanViewProject(project).objects))
  assert.ok(upper.has('room-upper'))
  assert.ok(upper.has('floor-upper'))
  assert.ok(upper.has('ceiling-upper'))
  assert.equal(upper.has('room-ground'), false)
  assert.equal(upper.has('floor-ground'), false)
  assert.equal(upper.has('ceiling-ground'), false)
  assert.ok(upperPlan.has('floor-upper'))
  assert.equal(upperPlan.has('floor-ground'), false, 'switching storeys must remove semantic floors from the previous level')
})

test('elevation projection hides rear openings behind solid facades but passes aligned openings through', () => {
  const project = createEmptyProjectDocument('ELEVATION-OPENINGS', 'Elevation openings')
  const wall = (id, y) => ({
    id, object_type: 'architecture.wall', created_phase: 'new_construction', level_refs: [], host_refs: [],
    module_data: { mark: id, start_point_mm: [0, y, 0], end_point_mm: [4000, y, 0], thickness_mm: 150, height_mm: 3000 },
  })
  const opening = (id, wallId, y) => ({
    id, object_type: 'door_window.window', created_phase: 'new_construction', level_refs: [], host_refs: [],
    module_data: { mark: id, wall_id: wallId, location_mm: [2000, y, 0], width_mm: 1000, height_mm: 1200, sill_height_mm: 900 },
  })
  project.objects['north-facade'] = wall('north-facade', 5000)
  project.objects['south-facade'] = wall('south-facade', 0)
  project.objects['rear-window'] = opening('rear-window', 'south-facade', 0)

  assert.equal(getElevationVisibleOpeningIds(project, 'north').has('rear-window'), false)
  assert.equal(getElevationVisibleOpeningIds(project, 'south').has('rear-window'), true)

  project.objects['front-window'] = opening('front-window', 'north-facade', 5000)
  assert.equal(getElevationVisibleOpeningIds(project, 'north').has('rear-window'), true)
  assert.equal(getElevationVisibleOpeningIds(project, 'north').has('front-window'), true)
})

test('elevation projection suppresses fully covered rear walls but retains stepped facade portions', () => {
  const project = createEmptyProjectDocument('ELEVATION-WALL-OCCLUSION', 'Elevation wall occlusion')
  const wall = (id, start, end) => ({
    id, object_type: 'architecture.wall', created_phase: 'new_construction', level_refs: [], host_refs: [],
    module_data: { mark: id, start_point_mm: start, end_point_mm: end, thickness_mm: 150, height_mm: 3000 },
  })
  project.objects['north-front'] = wall('north-front', [0, 5000, 0], [4000, 5000, 0])
  project.objects['south-rear'] = wall('south-rear', [0, 0, 0], [4000, 0, 0])

  assert.deepEqual([...getElevationVisibleWallIds(project, 'north')], ['north-front'])
  assert.deepEqual([...getElevationVisibleWallIds(project, 'south')], ['south-rear'])

  project.objects['north-front'] = wall('north-front', [0, 5000, 0], [2000, 5000, 0])
  assert.deepEqual(new Set(getElevationVisibleWallIds(project, 'north')), new Set(['north-front', 'south-rear']),
    'a farther wall must remain when part of its projected facade is exposed')
})

test('orthographic elevations include only walls whose long axis forms that facade', () => {
  const project = createEmptyProjectDocument('ELEVATION-FACADES', 'Elevation facade directions')
  const wall = (id, start, end) => ({
    id, object_type: 'architecture.wall', created_phase: 'new_construction', level_refs: [], host_refs: [],
    module_data: { mark: id, start_point_mm: start, end_point_mm: end, thickness_mm: 150, height_mm: 3000 },
  })
  const northWall = wall('north-wall', [0, 0, 0], [4000, 0, 0])
  const eastWall = wall('east-wall', [4000, 0, 0], [4000, 3000, 0])
  const diagonalWall = wall('diagonal-wall', [0, 0, 0], [4000, 4000, 0])

  assert.equal(isWallFacadeForElevation(northWall, 'north'), true)
  assert.equal(isWallFacadeForElevation(northWall, 'east'), false)
  assert.equal(isWallFacadeForElevation(eastWall, 'east'), true)
  assert.equal(isWallFacadeForElevation(eastWall, 'south'), false)
  assert.equal(isWallFacadeForElevation(diagonalWall, 'north'), true, 'ties consistently resolve to the X-axis facade')

  project.objects[northWall.id] = northWall
  project.objects[eastWall.id] = eastWall
  project.objects['side-window'] = {
    id: 'side-window', object_type: 'door_window.window', created_phase: 'new_construction', level_refs: [], host_refs: [],
    module_data: { mark: 'W-SIDE', wall_id: eastWall.id, location_mm: [4000, 1500, 0], width_mm: 1000, height_mm: 1200, sill_height_mm: 900 },
  }
  assert.equal(getElevationVisibleOpeningIds(project, 'north').has('side-window'), false)
  assert.equal(getElevationVisibleOpeningIds(project, 'east').has('side-window'), true)
})
