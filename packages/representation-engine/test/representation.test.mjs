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
