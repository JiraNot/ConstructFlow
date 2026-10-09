import assert from 'node:assert/strict'
import test from 'node:test'
import { createEmptyProjectDocument, deserializeProject, serializeProject } from '@constructflow/project-model'
import { CommandBus, ProjectCommandSession } from '../dist/index.js'

const run = (project, name, input) => {
  const result = CommandBus.execute(project, name, input)
  assert.equal(result.result.status, 'success', JSON.stringify(result.result))
  return result.updatedProject
}

test('door and window instance parameters override, inherit, reset, roundtrip and undo/redo', () => {
  let project = createEmptyProjectDocument(crypto.randomUUID())
  const doorTypeId = crypto.randomUUID(), windowTypeId = crypto.randomUUID()
  project = run(project, 'DefineStructuralType', { id: doorTypeId, object_type: 'door_window.door', name: 'D-TEST', parameters: {
    width_mm: 900, height_mm: 2000, opening_operation: 'hinged', frame_depth_mm: 100, frame_face_width_mm: 50,
    sash_face_width_mm: 45, door_leaf_thickness_mm: 40, door_leaf_style: 'flush', frame_material: 'timber',
  } })
  project = run(project, 'DefineStructuralType', { id: windowTypeId, object_type: 'door_window.window', name: 'W-TEST', parameters: {
    width_mm: 1200, height_mm: 1200, sill_height_mm: 900, opening_operation: 'sliding', frame_depth_mm: 100,
    frame_face_width_mm: 50, sash_face_width_mm: 45, panel_count: 2, panel_layout: ['sliding', 'sliding'], panel_width_ratios: [0.5, 0.5],
  } })
  const wallId = crypto.randomUUID()
  project = run(project, 'CreateWall', { id: wallId, mark: 'W1', start_point_mm: [0, 0, 0], end_point_mm: [6000, 0, 0], thickness_mm: 120, height_mm: 2800, level_id: project.levels[0].id })
  const doorId = crypto.randomUUID(), windowId = crypto.randomUUID()
  project = run(project, 'CreateDoor', { id: doorId, mark: 'D-TEST', type_id: doorTypeId, wall_id: wallId, location_mm: [2000, 0, 0], offset_along_wall_mm: 2000, width_mm: 900, height_mm: 2000, level_id: project.levels[0].id })
  project = run(project, 'CreateWindow', { id: windowId, mark: 'W-TEST', type_id: windowTypeId, wall_id: wallId, location_mm: [4500, 0, 0], offset_along_wall_mm: 4500, width_mm: 1200, height_mm: 1200, sill_height_mm: 900, level_id: project.levels[0].id })

  project = run(project, 'UpdateWindowDimensions', { object_id: windowId, width_mm: 1200, sill_height_mm: 1100 })
  assert.equal(project.objects[windowId].module_data.instance_overrides.sill_height_mm, 1100, 'vertical Inspector edits are tracked as instance overrides')
  project = run(project, 'UpdateOpeningInstanceParameters', { object_id: windowId, parameters: { sill_height_mm: null } })
  assert.equal(project.objects[windowId].module_data.sill_height_mm, 900, 'reset restores the window type sill')
  assert.equal(project.objects[windowId].module_data.instance_overrides.sill_height_mm, undefined)

  const session = new ProjectCommandSession(project)
  const edited = session.execute([{ name: 'UpdateOpeningInstanceParameters', input: { object_id: doorId, parameters: {
    width_mm: 1000, sash_face_width_mm: 60, door_leaf_style: 'raised_4_panel',
  } } }])
  assert.equal(edited.status, 'success', JSON.stringify(edited))
  assert.equal(edited.updatedProject.objects[doorId].module_data.width_mm, 1000)
  assert.equal(edited.updatedProject.objects[doorId].module_data.instance_overrides.sash_face_width_mm, 60)
  assert.equal(edited.updatedProject.objects[doorId].module_data.instance_overrides.door_leaf_style, 'raised_4_panel')
  assert.equal(edited.updatedProject.objects[doorId].module_data.instance_overrides.width_mm, 1000)

  const typeEdit = session.execute([{ name: 'UpdateStructuralTypeDimensions', input: { type_id_or_name: doorTypeId, object_type: 'door_window.door', parameters: {
    width_mm: 950, sash_face_width_mm: 55, door_leaf_style: 'flush',
  } } }])
  assert.equal(typeEdit.status, 'success', JSON.stringify(typeEdit))
  let next = typeEdit.updatedProject
  assert.equal(next.objects[doorId].module_data.width_mm, 1000, 'instance width remains overridden')
  assert.equal(next.objects[doorId].module_data.sash_face_width_mm, 60, 'instance sash width remains overridden')
  assert.equal(next.objects[doorId].module_data.door_leaf_style, 'raised_4_panel', 'instance leaf style remains overridden')

  const reset = session.execute([{ name: 'UpdateOpeningInstanceParameters', input: { object_id: doorId, parameters: {
    width_mm: null, sash_face_width_mm: null, door_leaf_style: null,
  } } }])
  assert.equal(reset.status, 'success', JSON.stringify(reset))
  next = reset.updatedProject
  assert.equal(next.objects[doorId].module_data.width_mm, 950)
  assert.equal(next.objects[doorId].module_data.sash_face_width_mm, 55)
  assert.equal(next.objects[doorId].module_data.door_leaf_style, 'flush')
  assert.deepEqual(next.objects[doorId].module_data.instance_overrides, {})
  assert.equal(session.undo().objects[doorId].module_data.width_mm, 1000)
  assert.equal(session.redo().objects[doorId].module_data.width_mm, 950)

  next = run(next, 'UpdateOpeningInstanceParameters', { object_id: windowId, parameters: {
    sill_height_mm: 1000, panel_width_ratios: [0.4, 0.6], frame_face_width_mm: 55,
  } })
  assert.equal(next.objects[windowId].module_data.sill_height_mm, 1000)
  assert.deepEqual(next.objects[windowId].module_data.instance_overrides.panel_width_ratios, [0.4, 0.6])
  assert.deepEqual(next.objects[windowId].module_data.instance_overrides.frame_face_width_mm, 55)

  const reopened = deserializeProject(serializeProject(next))
  assert.deepEqual(reopened.objects[windowId].module_data.instance_overrides, next.objects[windowId].module_data.instance_overrides)
  assert.deepEqual(reopened.objects[doorId].module_data.instance_overrides, {})
})

test('opening instance parameter edits reject host overflow, bad values and unsupported fields atomically', () => {
  let project = createEmptyProjectDocument(crypto.randomUUID())
  const typeId = crypto.randomUUID(), wallId = crypto.randomUUID(), doorId = crypto.randomUUID()
  project = run(project, 'DefineStructuralType', { id: typeId, object_type: 'door_window.door', name: 'D-TEST', parameters: { width_mm: 900, height_mm: 2000, frame_face_width_mm: 50 } })
  project = run(project, 'CreateWall', { id: wallId, mark: 'W1', start_point_mm: [0, 0, 0], end_point_mm: [3000, 0, 0], thickness_mm: 120, height_mm: 2800, level_id: project.levels[0].id })
  project = run(project, 'CreateDoor', { id: doorId, mark: 'D-TEST', type_id: typeId, wall_id: wallId, location_mm: [1500, 0, 0], offset_along_wall_mm: 1500, width_mm: 900, height_mm: 2000, level_id: project.levels[0].id })
  for (const parameters of [
    { width_mm: 4000 },
    { frame_face_width_mm: -1 },
    { wall_id: 'other' },
    { panel_width_ratios: [1, 1] },
  ]) {
    const result = CommandBus.execute(project, 'UpdateOpeningInstanceParameters', { object_id: doorId, parameters })
    assert.notEqual(result.result.status, 'success', JSON.stringify(parameters))
    assert.deepEqual(result.updatedProject, project, 'invalid instance edits leave the project untouched')
  }
})
