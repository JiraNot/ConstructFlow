import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyProjectDocument } from '@constructflow/project-model'
import { CommandBus, ProjectCommandSession } from '../dist/index.js'

test('DuplicateObjects clones selected hosted openings with new IDs, preserved hosts and model-space offset', () => {
  const project = createEmptyProjectDocument(crypto.randomUUID())
  const levelId = project.project.active_level_id
  const wallId = crypto.randomUUID(), windowId = crypto.randomUUID()
  let created = CommandBus.executeBatch(project, [
    { name: 'CreateWall', input: { id: wallId, mark: 'W1', level_id: levelId, start_point_mm: [0, 0], end_point_mm: [4000, 0], thickness_mm: 100, height_mm: 2800 } },
    { name: 'CreateWindow', input: { id: windowId, mark: 'W1', wall_id: wallId, level_id: levelId, location_mm: [1200, 0], offset_along_wall_mm: 1200, width_mm: 1200, height_mm: 1000, sill_height_mm: 900 } },
  ])
  assert.equal(created.status, 'success')

  const wallCopyId = crypto.randomUUID(), windowCopyId = crypto.randomUUID()
  const duplicated = CommandBus.execute(created.updatedProject, 'DuplicateObjects', {
    object_ids: [wallId, windowId], delta_x_mm: 500, delta_y_mm: 0,
    id_map: { [wallId]: wallCopyId, [windowId]: windowCopyId },
  })
  assert.equal(duplicated.result.status, 'success')
  assert.deepEqual(duplicated.updatedProject.objects[wallCopyId].module_data.start_point_mm, [500, 0, 0])
  assert.equal(duplicated.updatedProject.objects[windowCopyId].module_data.wall_id, wallCopyId)
  assert.equal(duplicated.updatedProject.objects[windowCopyId].module_data.offset_along_wall_mm, 1200)
  assert.equal(duplicated.emittedEnvelope.input.id_map[windowId], windowCopyId)
})

test('DuplicateObjects is one undoable batch and leaves a hosted opening on its original wall when copied alone', () => {
  const project = createEmptyProjectDocument(crypto.randomUUID())
  const wallId = crypto.randomUUID(), windowId = crypto.randomUUID()
  const created = CommandBus.executeBatch(project, [
    { name: 'CreateWall', input: { id: wallId, mark: 'W1', level_id: project.project.active_level_id, start_point_mm: [0, 0], end_point_mm: [4000, 0], thickness_mm: 100, height_mm: 2800 } },
    { name: 'CreateWindow', input: { id: windowId, mark: 'W1', wall_id: wallId, level_id: project.project.active_level_id, location_mm: [1200, 0], offset_along_wall_mm: 1200, width_mm: 1200, height_mm: 1000, sill_height_mm: 900 } },
  ])
  assert.equal(created.status, 'success')
  const session = new ProjectCommandSession(created.updatedProject)
  const windowCopyId = crypto.randomUUID()
  const pasted = session.execute([{ name: 'DuplicateObjects', input: {
    object_ids: [windowId], delta_x_mm: 500, delta_y_mm: 0, id_map: { [windowId]: windowCopyId },
  } }])
  assert.equal(pasted.status, 'success')
  const copy = pasted.updatedProject.objects[windowCopyId]
  assert.equal(copy.module_data.wall_id, wallId)
  assert.equal(copy.module_data.offset_along_wall_mm, 1700)
  assert.equal(copy.module_data.location_mm[0], 1700)
  assert.equal(Object.hasOwn(session.undo().objects, windowCopyId), false)
  assert.equal(Object.hasOwn(session.redo().objects, windowCopyId), true)
})
