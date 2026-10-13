import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyProjectDocument } from '@constructflow/project-model'
import { CommandBus, ProjectCommandSession } from '../dist/index.js'

test('independent foundation move changes its plan location in one undoable transaction', () => {
  const project = createEmptyProjectDocument(crypto.randomUUID())
  const foundationId = crypto.randomUUID()
  const created = CommandBus.execute(project, 'CreateFoundation', {
    id: foundationId, mark: 'F1', level_id: project.project.active_level_id,
    foundation_type: 'spread_footing', center_mm: [0, 0, -300], size_mm: [800, 800, 300],
    top_elevation_mm: 0, material: 'reinforced_concrete',
  })
  assert.equal(created.result.status, 'success')
  const session = new ProjectCommandSession(created.updatedProject)
  const before = session.project
  const moved = session.execute([{ name: 'MoveFoundation', input: { object_id: foundationId, center_mm: [1250, -500, -300] } }])
  assert.equal(moved.status, 'success')
  assert.deepEqual(session.project.objects[foundationId].module_data.center_mm, [1250, -500, -300])
  assert.deepEqual(session.undo(), before)
})

test('a foundation hosted on a column cannot be moved independently', () => {
  const project = createEmptyProjectDocument(crypto.randomUUID())
  const columnId = crypto.randomUUID(), foundationId = crypto.randomUUID(), levelId = project.project.active_level_id
  const created = CommandBus.executeBatch(project, [
    { name: 'CreateColumn', input: { id: columnId, mark: 'C1', level_id: levelId, location_mm: [0, 0, 0], section_mm: [200, 200] } },
    { name: 'CreateFoundation', input: { id: foundationId, mark: 'F1', level_id: levelId, supported_column_id: columnId, foundation_type: 'spread_footing', size_mm: [800, 800, 300], top_elevation_mm: 0, material: 'reinforced_concrete' } },
  ])
  assert.equal(created.status, 'success')
  const moved = CommandBus.execute(created.updatedProject, 'MoveFoundation', { object_id: foundationId, center_mm: [500, 0, 0] })
  assert.equal(moved.result.status, 'rejected')
  assert.match(moved.result.errors[0], /moves with its column/)
  assert.deepEqual(moved.updatedProject.objects[foundationId].module_data.center_mm, [0, 0, 0])
})
