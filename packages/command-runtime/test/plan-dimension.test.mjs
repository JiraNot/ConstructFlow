import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyProjectDocument, serializeProject, deserializeProject } from '@constructflow/project-model'
import { CommandBus, ProjectCommandSession } from '../dist/index.js'

test('dimensions create, edit and delete through atomic history and survive save/reopen', () => {
  const project = createEmptyProjectDocument(crypto.randomUUID())
  const dimension = { id: crypto.randomUUID(), level_id: project.project.active_level_id, created_phase: 'new_construction', start_mm: [0, 0], end_mm: [3000, 4000], offset_mm: 500 }
  const session = new ProjectCommandSession(project)
  assert.equal(session.execute([{ name: 'SavePlanDimension', input: { dimension } }]).status, 'success')
  assert.deepEqual(deserializeProject(serializeProject(session.project)).drawing_settings.plan_dimensions, [dimension])
  assert.equal(session.undo().drawing_settings?.plan_dimensions, undefined)
  assert.deepEqual(session.redo().drawing_settings.plan_dimensions, [dimension])
  const edited = { ...dimension, end_mm: [6000, 8000], offset_mm: -750 }
  assert.equal(session.execute([{ name: 'SavePlanDimension', input: { dimension: edited } }]).status, 'success')
  assert.deepEqual(session.undo().drawing_settings.plan_dimensions, [dimension])
  assert.deepEqual(session.redo().drawing_settings.plan_dimensions, [edited])
  assert.equal(session.execute([{ name: 'DeletePlanDimension', input: { dimension_id: dimension.id } }]).status, 'success')
  assert.deepEqual(session.project.drawing_settings.plan_dimensions, [])
  assert.deepEqual(session.undo().drawing_settings.plan_dimensions, [edited])
})

test('malformed or missing-level dimensions reject without changing the document', () => {
  const project = createEmptyProjectDocument(crypto.randomUUID())
  const dimension = { id: crypto.randomUUID(), level_id: project.project.active_level_id, created_phase: 'existing', start_mm: [0, 0], end_mm: [3000, 0], offset_mm: 500 }
  for (const changes of [{ id: 'not-uuid' }, { level_id: 'missing' }, { end_mm: [0, 0] }, { created_phase: 'unknown' }, { offset_mm: NaN }]) {
    const response = CommandBus.execute(project, 'SavePlanDimension', { dimension: { ...dimension, ...changes } })
    assert.notEqual(response.result.status, 'success')
    assert.deepEqual(response.updatedProject, project)
  }
})
