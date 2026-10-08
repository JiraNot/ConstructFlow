import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { deserializeProject } from '../../project-model/dist/index.js'
import { buildProjectRepresentations3D, getPlanVisibleObjects } from '../dist/index.js'

const fixture = deserializeProject(await readFile(new URL('../../../examples/kitchen-extension-proof.cfproj', import.meta.url), 'utf8'))

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
