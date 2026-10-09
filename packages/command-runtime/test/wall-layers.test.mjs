import assert from 'node:assert/strict'
import test from 'node:test'
import { createEmptyProjectDocument } from '@constructflow/project-model'
import { CommandBus } from '../dist/index.js'

const execute = (project, name, input) => {
  const result = CommandBus.execute(project, name, input)
  assert.equal(result.result.status, 'success', JSON.stringify(result.result))
  return result.updatedProject
}

const setTenMillimetrePlaster = type => {
  type.parameters = {
    ...type.parameters,
    thickness_mm: 120,
    masonry_thickness_mm: 100,
    plaster_inside_thickness_mm: 10,
    plaster_outside_thickness_mm: 10,
  }
}

test('W1 creation and catalog edits preserve the masonry/plaster assembly atomically', () => {
  const project = createEmptyProjectDocument(crypto.randomUUID())
  const type = project.types.find(candidate => candidate.object_type === 'architecture.wall' && candidate.name === 'AAC 100 mm')
  setTenMillimetrePlaster(type)
  const created = execute(project, 'CreateWall', {
    id: crypto.randomUUID(), type_id: type.id, mark: 'W1', level_id: project.project.active_level_id,
    placement_reference: 'left_face',
    start_point_mm: [0, -60, 0], end_point_mm: [4000, -60, 0], thickness_mm: 100,
  })
  const wall = Object.values(created.objects).find(object => object.object_type === 'architecture.wall')
  assert.equal(wall.module_data.mark, 'W1')
  assert.equal(wall.module_data.type_id, type.id)
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
  const type = project.types.find(candidate => candidate.object_type === 'architecture.wall' && candidate.name === 'AAC 100 mm')
  setTenMillimetrePlaster(type)
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

test('a wall joined to an existing wall can inherit its complete storey constraint', () => {
  const project = createEmptyProjectDocument(crypto.randomUUID())
  project.levels = [
    { id: 'GF', name: 'Ground Floor', elevation_mm: 0, storey_index: 0, height_mm: 400 },
    { id: 'FF', name: 'First Floor', elevation_mm: 400, storey_index: 1, height_mm: 3000 },
    { id: 'EAVE', name: 'Eave', elevation_mm: 3400, storey_index: 2, height_mm: 2000 },
  ]
  project.project.active_level_id = 'GF'
  const hostId = crypto.randomUUID()
  const hostProject = execute(project, 'CreateWall', {
    id: hostId, mark: 'W1', level_id: 'GF', top_level_id: 'EAVE',
    base_offset_mm: -150, top_offset_mm: -100,
    start_point_mm: [0, 0, 0], end_point_mm: [4000, 0, 0], thickness_mm: 100,
  })
  const joinedId = crypto.randomUUID()
  const joinedProject = execute(hostProject, 'CreateWall', {
    id: joinedId, mark: 'W1', level_id: 'GF', inherit_joined_wall_constraint: true,
    start_point_mm: [2000, 0, 0], end_point_mm: [2000, 3000, 0], thickness_mm: 100,
  })
  const host = joinedProject.objects[hostId].module_data
  const joined = joinedProject.objects[joinedId].module_data
  assert.deepEqual(
    { level_id: joined.level_id, top_level_id: joined.top_level_id, base_offset_mm: joined.base_offset_mm, top_offset_mm: joined.top_offset_mm, height_mm: joined.height_mm },
    { level_id: host.level_id, top_level_id: host.top_level_id, base_offset_mm: host.base_offset_mm, top_offset_mm: host.top_offset_mm, height_mm: host.height_mm },
  )
  assert.ok(joinedProject.objects[joinedId].level_refs.some(reference => reference.role === 'top_level' && reference.level_id === 'EAVE'))

  const unattachedId = crypto.randomUUID()
  const unattachedProject = execute(joinedProject, 'CreateWall', {
    id: unattachedId, mark: 'W1', level_id: 'GF', inherit_joined_wall_constraint: true,
    start_point_mm: [10000, 0, 0], end_point_mm: [12000, 0, 0], thickness_mm: 100,
  })
  assert.equal(unattachedProject.objects[unattachedId].module_data.top_level_id, 'FF', 'unattached walls default to the next storey datum')
  assert.equal(unattachedProject.objects[unattachedId].module_data.height_mm, 400)
})
