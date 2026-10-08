import assert from 'node:assert/strict'
import test from 'node:test'
import { createEmptyProjectDocument } from '@constructflow/project-model'
import { CommandBus } from '../dist/index.js'

const execute = (project, name, input) => {
  const result = CommandBus.execute(project, name, input)
  assert.equal(result.result.status, 'success', JSON.stringify(result.result))
  return result.updatedProject
}

test('W1 creation and catalog edits preserve the masonry/plaster assembly atomically', () => {
  const project = createEmptyProjectDocument(crypto.randomUUID())
  const type = project.types.find(candidate => candidate.object_type === 'architecture.wall' && candidate.name === 'W1')
  const created = execute(project, 'CreateWall', {
    id: crypto.randomUUID(), type_id: type.id, mark: 'W1', level_id: project.project.active_level_id,
    placement_reference: 'left_face',
    start_point_mm: [0, -60, 0], end_point_mm: [4000, -60, 0], thickness_mm: 100,
  })
  const wall = Object.values(created.objects).find(object => object.object_type === 'architecture.wall')
  assert.equal(wall.module_data.thickness_mm, 120)
  assert.equal(wall.module_data.masonry_thickness_mm, 100)
  assert.equal(wall.module_data.plaster_inside_thickness_mm, 10)
  assert.equal(wall.module_data.plaster_outside_thickness_mm, 10)
  assert.equal(wall.module_data.start_point_mm[1] + wall.module_data.thickness_mm / 2, 0)
  const withDoor = execute(created, 'CreateDoor', {
    id: crypto.randomUUID(), mark: 'D1', wall_id: wall.id, location_mm: [2000, -60, 1000],
    offset_along_wall_mm: 2000, width_mm: 800, height_mm: 2000, level_id: project.project.active_level_id,
  })
  const door = Object.values(withDoor.objects).find(object => object.object_type === 'door_window.door')

  const updated = execute(withDoor, 'UpdateStructuralTypeDimensions', {
    type_id_or_name: type.id,
    object_type: 'architecture.wall',
    parameters: {
      thickness_mm: 130,
      masonry_thickness_mm: 100,
      plaster_inside_thickness_mm: 15,
      plaster_outside_thickness_mm: 15,
      plaster_inside_material: 'cement_plaster',
      plaster_outside_material: 'cement_plaster',
    },
  })
  const cascadedWall = updated.objects[wall.id]
  assert.equal(cascadedWall.module_data.thickness_mm, 130)
  assert.equal(cascadedWall.module_data.plaster_inside_thickness_mm, 15)
  assert.equal(cascadedWall.module_data.plaster_outside_thickness_mm, 15)
  assert.equal(cascadedWall.module_data.start_point_mm[1], -65)
  assert.equal(cascadedWall.module_data.end_point_mm[1], -65)
  assert.equal(cascadedWall.module_data.start_point_mm[1] + cascadedWall.module_data.thickness_mm / 2, 0)
  assert.equal(updated.objects[door.id].module_data.location_mm[1], -65)
})

test('direct wall dimension edits keep the selected placement face fixed', () => {
  const project = createEmptyProjectDocument(crypto.randomUUID())
  const type = project.types.find(candidate => candidate.object_type === 'architecture.wall' && candidate.name === 'W1')
  const created = execute(project, 'CreateWall', {
    id: crypto.randomUUID(), type_id: type.id, mark: 'W1', level_id: project.project.active_level_id,
    placement_reference: 'right_face',
    start_point_mm: [0, 60, 0], end_point_mm: [4000, 60, 0], thickness_mm: 100,
  })
  const wall = Object.values(created.objects).find(object => object.object_type === 'architecture.wall')
  const withDoor = execute(created, 'CreateDoor', {
    id: crypto.randomUUID(), mark: 'D1', wall_id: wall.id, location_mm: [2000, 60, 1000],
    offset_along_wall_mm: 2000, width_mm: 800, height_mm: 2000, level_id: project.project.active_level_id,
  })
  const door = Object.values(withDoor.objects).find(object => object.object_type === 'door_window.door')
  const updated = execute(withDoor, 'UpdateWallDimensions', { object_id: wall.id, thickness_mm: 100 })
  const adjustedWall = updated.objects[wall.id]
  assert.equal(adjustedWall.module_data.start_point_mm[1], 50)
  assert.equal(adjustedWall.module_data.end_point_mm[1], 50)
  assert.equal(adjustedWall.module_data.start_point_mm[1] - adjustedWall.module_data.thickness_mm / 2, 0)
  assert.equal(updated.objects[door.id].module_data.location_mm[1], 50)
})
