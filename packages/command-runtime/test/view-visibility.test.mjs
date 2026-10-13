import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyProjectDocument, deserializeProject, serializeProject } from '@constructflow/project-model'
import { ProjectCommandSession } from '../dist/index.js'

test('SetViewVisibility persists by view and level, survives save/reopen, and participates in undo/redo', () => {
  const project = createEmptyProjectDocument('VISIBILITY', 'Visibility')
  const levelId = project.project.active_level_id
  const wallId = crypto.randomUUID()
  const session = new ProjectCommandSession(project)
  const created = session.execute([{ name: 'CreateWall', input: {
    id: wallId, mark: 'W1', level_id: levelId, start_point_mm: [0, 0], end_point_mm: [4000, 0],
    thickness_mm: 100, height_mm: 2800,
  } }])
  assert.equal(created.status, 'success', JSON.stringify(created.errors))

  const hidden = session.execute([{ name: 'SetViewVisibility', input: {
    scope_id: `plan:${levelId}`, hidden_object_ids: [wallId],
  } }])
  assert.equal(hidden.status, 'success', JSON.stringify(hidden.errors))
  assert.deepEqual(hidden.updatedProject.view_settings.hidden_object_ids_by_scope[`plan:${levelId}`], [wallId])
  assert.deepEqual(
    deserializeProject(serializeProject(hidden.updatedProject)).view_settings,
    hidden.updatedProject.view_settings,
  )
  assert.equal(session.undo().view_settings, undefined)
  assert.deepEqual(session.redo().view_settings.hidden_object_ids_by_scope[`plan:${levelId}`], [wallId])

  const cleared = session.execute([{ name: 'SetViewVisibility', input: {
    scope_id: `plan:${levelId}`, hidden_object_ids: [],
  } }])
  assert.equal(cleared.status, 'success')
  assert.equal(cleared.updatedProject.view_settings, undefined)
  assert.deepEqual(session.undo().view_settings.hidden_object_ids_by_scope[`plan:${levelId}`], [wallId])
})

test('SetViewVisibility rejects unknown view/level scopes and unknown object IDs atomically', () => {
  const project = createEmptyProjectDocument('VISIBILITY-INVALID', 'Visibility')
  const session = new ProjectCommandSession(project)
  for (const input of [
    { scope_id: `unknown:${project.project.active_level_id}`, hidden_object_ids: [] },
    { scope_id: `plan:missing-level`, hidden_object_ids: [] },
    { scope_id: `plan:${project.project.active_level_id}`, hidden_object_ids: ['missing-object'] },
  ]) {
    const result = session.execute([{ name: 'SetViewVisibility', input }])
    assert.notEqual(result.status, 'success')
    assert.equal(session.project.view_settings, undefined)
  }
})

test('deleting an object removes its view visibility references in the same undoable transaction', () => {
  const project = createEmptyProjectDocument('VISIBILITY-DELETE', 'Visibility')
  const levelId = project.project.active_level_id
  const wallId = crypto.randomUUID()
  const session = new ProjectCommandSession(project)
  assert.equal(session.execute([{ name: 'CreateWall', input: {
    id: wallId, mark: 'W1', level_id: levelId, start_point_mm: [0, 0], end_point_mm: [4000, 0],
    thickness_mm: 100, height_mm: 2800,
  } }]).status, 'success')
  assert.equal(session.execute([{ name: 'SetViewVisibility', input: {
    scope_id: `plan:${levelId}`, hidden_object_ids: [wallId],
  } }]).status, 'success')

  const deleted = session.execute([{ name: 'DeleteObject', input: { object_id: wallId } }])
  assert.equal(deleted.status, 'success', JSON.stringify(deleted.errors))
  assert.equal(deleted.updatedProject.view_settings, undefined)
  assert.deepEqual(session.undo().view_settings.hidden_object_ids_by_scope[`plan:${levelId}`], [wallId])
})
