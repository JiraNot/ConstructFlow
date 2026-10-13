import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyProjectDocument } from '@constructflow/project-model'
import { CommandBus, ProjectCommandSession } from '@constructflow/command-runtime'

test('joining compatible touching walls keeps the first UUID and one Undo restores both objects', () => {
  const project = createEmptyProjectDocument(crypto.randomUUID())
  const levelId = project.project.active_level_id
  const retainedId = crypto.randomUUID(), removedId = crypto.randomUUID()
  const created = CommandBus.executeBatch(project, [
    { name: 'CreateWall', input: { id: retainedId, mark: 'W1', level_id: levelId, start_point_mm: [0, 0], end_point_mm: [4000, 0], thickness_mm: 100, height_mm: 2800 } },
    { name: 'CreateWall', input: { id: removedId, mark: 'W1', level_id: levelId, start_point_mm: [4000, 0], end_point_mm: [8000, 0], thickness_mm: 100, height_mm: 2800 } },
  ])
  assert.equal(created.status, 'success')

  const session = new ProjectCommandSession(created.updatedProject)
  const beforeJoin = session.project
  const joined = session.execute([
    { name: 'UpdateWallEndpoints', input: { object_id: retainedId, start_point_mm: [0, 0], end_point_mm: [8000, 0] } },
    { name: 'DeleteObject', input: { object_id: removedId } },
  ])
  assert.equal(joined.status, 'success')
  assert.ok(session.project.objects[retainedId])
  assert.equal(session.project.objects[retainedId].module_data.length_mm, 8000)
  assert.equal(session.project.objects[removedId], undefined)

  const undone = session.undo()
  assert.deepEqual(undone, beforeJoin)
  assert.ok(undone.objects[retainedId])
  assert.ok(undone.objects[removedId])
  const redone = session.redo()
  assert.ok(redone.objects[retainedId])
  assert.equal(redone.objects[removedId], undefined)
})
