import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyProjectDocument, deserializeProject, serializeProject } from '@constructflow/project-model'
import { ProjectCommandSession } from '../dist/index.js'

test('view templates persist, apply as project data, and participate in undo/redo', () => {
  const project = createEmptyProjectDocument('VIEW-TEMPLATE', 'View template')
  const levelId = project.project.active_level_id
  const wallId = crypto.randomUUID()
  const session = new ProjectCommandSession(project)
  assert.equal(session.execute([{ name: 'CreateWall', input: {
    id: wallId, mark: 'W1', level_id: levelId, start_point_mm: [0, 0], end_point_mm: [4000, 0],
    thickness_mm: 100, height_mm: 2800,
  } }]).status, 'success')

  const template = { id: crypto.randomUUID(), name: 'Presentation', view_id: 'plan', level_id: levelId, hidden_object_ids: [wallId] }
  const saved = session.execute([{ name: 'SaveViewTemplate', input: { template } }])
  assert.equal(saved.status, 'success', JSON.stringify(saved.errors))
  assert.deepEqual(saved.updatedProject.view_settings.view_templates, [template])
  assert.deepEqual(deserializeProject(serializeProject(saved.updatedProject)).view_settings, saved.updatedProject.view_settings)
  assert.equal(session.undo().view_settings, undefined)
  assert.deepEqual(session.redo().view_settings.view_templates, [template])

  const removed = session.execute([{ name: 'DeleteViewTemplate', input: { template_id: template.id } }])
  assert.equal(removed.status, 'success')
  assert.equal(removed.updatedProject.view_settings, undefined)
  assert.deepEqual(session.undo().view_settings.view_templates, [template])
})

test('view templates reject duplicate names, unknown scopes, and unknown object IDs atomically', () => {
  const project = createEmptyProjectDocument('VIEW-TEMPLATE-INVALID', 'View template')
  const session = new ProjectCommandSession(project)
  const template = { id: crypto.randomUUID(), name: 'Plans', view_id: 'plan', level_id: project.project.active_level_id, hidden_object_ids: [] }
  assert.equal(session.execute([{ name: 'SaveViewTemplate', input: { template } }]).status, 'success')
  for (const invalid of [
    { ...template, id: crypto.randomUUID(), name: 'plans' },
    { ...template, id: crypto.randomUUID(), view_id: 'unknown' },
    { ...template, id: crypto.randomUUID(), level_id: 'missing' },
    { ...template, id: crypto.randomUUID(), hidden_object_ids: ['missing-object'] },
  ]) {
    const rejected = session.execute([{ name: 'SaveViewTemplate', input: { template: invalid } }])
    assert.notEqual(rejected.status, 'success')
    assert.deepEqual(session.project.view_settings.view_templates, [template])
  }
})

test('deleting an object removes its UUID from saved view templates in the same undoable transaction', () => {
  const project = createEmptyProjectDocument('VIEW-TEMPLATE-DELETE', 'View template')
  const levelId = project.project.active_level_id
  const wallId = crypto.randomUUID()
  const templateId = crypto.randomUUID()
  const session = new ProjectCommandSession(project)
  assert.equal(session.execute([{ name: 'CreateWall', input: {
    id: wallId, mark: 'W1', level_id: levelId, start_point_mm: [0, 0], end_point_mm: [4000, 0],
    thickness_mm: 100, height_mm: 2800,
  } }]).status, 'success')
  assert.equal(session.execute([{ name: 'SaveViewTemplate', input: { template: {
    id: templateId, name: 'Plans', view_id: 'plan', level_id: levelId, hidden_object_ids: [wallId],
  } } }]).status, 'success')

  const deleted = session.execute([{ name: 'DeleteObject', input: { object_id: wallId } }])
  assert.equal(deleted.status, 'success')
  assert.deepEqual(deleted.updatedProject.view_settings.view_templates[0].hidden_object_ids, [])
  assert.deepEqual(session.undo().view_settings.view_templates[0].hidden_object_ids, [wallId])
})
