import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyProjectDocument, serializeProject, deserializeProject } from '@constructflow/project-model'
import { CommandBus, ProjectCommandSession } from '../dist/index.js'

const document = () => createEmptyProjectDocument(crypto.randomUUID())
const column = (id = crypto.randomUUID()) => ({
  name: 'CreateColumn', input: { id, mark: 'C1', location_mm: [0, 0, 0], section_mm: [200, 200] },
})

test('AC-STAND-001: execute a human/AI/sync command without browser or SketchUp', () => {
  for (const actor of ['human', 'ai', 'sync']) {
    const original = document()
    const cmd = column()
    const result = CommandBus.execute(original, cmd.name, cmd.input, actor)
    assert.equal(result.result.status, 'success')
    assert.equal(result.emittedEnvelope.actor.kind, actor)
    assert.equal(Object.keys(original.objects).length, 0)
    assert.equal(result.updatedProject.objects[cmd.input.id].created_phase, 'new_construction')
    assert.match(result.result.command_id, /^[0-9a-f-]{36}$/)
  }
})

test('AC-STAND-002: rollback a batch on rejection and publish no partial envelopes', () => {
  const original = document()
  const snapshot = serializeProject(original)
  const result = CommandBus.executeBatch(original, [column(), { name: 'MoveColumn', input: { object_id: 'missing', location_mm: [1, 2] } }])
  assert.equal(result.status, 'rejected')
  assert.equal(result.failed_command_index, 1)
  assert.strictEqual(result.updatedProject, original)
  assert.deepEqual(result.emittedEnvelopes, [])
  assert.equal(serializeProject(original), snapshot)
})

test('AC-STAND-002: exception after an earlier success rolls the entire batch back', () => {
  const original = document()
  const result = CommandBus.executeBatch(original, [column(), { name: 'CreateColumn', input: {} }])
  assert.equal(result.status, 'failed')
  assert.strictEqual(result.updatedProject, original)
  assert.deepEqual(result.emittedEnvelopes, [])
})

test('AC-STAND-003: batch history undo/redo preserves objects, relationships and IDs', () => {
  const session = new ProjectCommandSession(document())
  const cmd = column()
  const result = session.execute([cmd, { name: 'CreateFoundation', input: { supported_column_id: cmd.input.id } }])
  assert.equal(result.status, 'success')
  const committed = session.project
  assert.equal(Object.keys(committed.objects).length, 2)
  assert.ok(committed.relationships.length > 0)
  assert.ok(result.emittedEnvelopes.every(e => e.transaction_id === result.transaction_id))
  assert.equal(Object.keys(session.undo().objects).length, 0)
  assert.deepEqual(session.redo(), committed)
  assert.equal(serializeProject(deserializeProject(serializeProject(session.project))), serializeProject(committed))
})

test('AC-STAND-003: rejection leaves undo/redo stacks intact; new edit clears redo', () => {
  const session = new ProjectCommandSession(document())
  session.execute([column()])
  session.undo()
  assert.equal(session.canRedo, true)
  session.execute([{ name: 'Unknown', input: {} }])
  assert.equal(session.canRedo, true)
  session.execute([column()])
  assert.equal(session.canRedo, false)
  assert.equal(session.canUndo, true)
})

test('AC-STAND-003: callers cannot mutate session history via returned snapshots', () => {
  const session = new ProjectCommandSession(document())
  const cmd = column()
  const result = session.execute([cmd])
  result.updatedProject.objects[cmd.input.id].module_data.section_mm[0] = 999
  const snapshot = session.project
  snapshot.objects[cmd.input.id].module_data.section_mm[0] = 888
  session.undo()
  assert.equal(session.redo().objects[cmd.input.id].module_data.section_mm[0], 200)
})

test('AC-STAND-004: input arrays and catalog defaults are isolated from command outputs', () => {
  const original = document()
  const cmd = column()
  const response = CommandBus.execute(original, cmd.name, cmd.input)
  response.updatedProject.objects[cmd.input.id].module_data.section_mm[0] = 777
  response.updatedProject.types[0].parameters.section_mm[0] = 888
  assert.equal(cmd.input.section_mm[0], 200)
  assert.equal(original.types[0].parameters.section_mm[0], 200)
})

test('AC-STAND-004: invalid phases and duplicate object IDs are rejected', () => {
  const original = document()
  const cmd = column()
  for (const key of ['phase', 'created_phase', 'removed_phase']) {
    assert.equal(CommandBus.execute(original, cmd.name, { ...cmd.input, [key]: 'future' }).result.status, 'rejected')
  }
  const created = CommandBus.execute(original, cmd.name, cmd.input)
  assert.equal(CommandBus.execute(created.updatedProject, cmd.name, cmd.input).result.status, 'rejected')
  const changed = CommandBus.execute(created.updatedProject, 'UpdateObjectPhase', { object_id: cmd.input.id, created_phase: 'existing', removed_phase: null })
  assert.equal(changed.updatedProject.objects[cmd.input.id].created_phase, 'existing')
})

test('AC-STAND-005: catalog cascade is scoped by object family even when W1 marks overlap', () => {
  const original = document()
  const wallId = crypto.randomUUID()
  const windowId = crypto.randomUUID()
  const created = CommandBus.executeBatch(original, [
    { name: 'CreateWall', input: { id: wallId, mark: 'W1', start_point_mm: [0, 0, 0], end_point_mm: [4000, 0, 0], thickness_mm: 100 } },
    { name: 'CreateWindow', input: { id: windowId, wall_id: wallId, mark: 'W1', location_mm: [2000, 0, 0], offset_along_wall_mm: 2000, width_mm: 1200 } },
  ])
  assert.equal(created.status, 'success')
  const result = CommandBus.execute(created.updatedProject, 'UpdateStructuralTypeDimensions', { type_id_or_name: 'W1', object_type: 'door_window.window', width_mm: 1800, height_mm: 1500 })
  assert.equal(result.result.status, 'success')
  assert.deepEqual(result.result.affected_object_ids, [windowId])
  assert.equal(result.updatedProject.objects[windowId].module_data.height_mm, 1500)
  assert.equal(result.updatedProject.objects[wallId].module_data.height_mm, 2800)
  assert.equal(created.updatedProject.objects[windowId].module_data.height_mm, 1200)
  const session = new ProjectCommandSession(result.updatedProject)
  const deleted = session.execute([{ name: 'DeleteObject', input: { object_id: wallId } }])
  assert.equal(deleted.status, 'success')
  assert.equal(Object.keys(session.project.objects).length, 0)
  assert.deepEqual(session.project.relationships, [])
  assert.deepEqual(session.undo(), result.updatedProject)
})

test('AC-STAND-002: explicit missing foundation host rejects the batch', () => {
  const original = document()
  const result = CommandBus.executeBatch(original, [column(), { name: 'CreateFoundation', input: { supported_column_id: crypto.randomUUID() } }])
  assert.equal(result.status, 'rejected')
  assert.strictEqual(result.updatedProject, original)
})
