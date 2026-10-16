import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyProjectDocument, serializeProject, deserializeProject } from '@constructflow/project-model'
import { CommandBus, ProjectCommandSession } from '@constructflow/command-runtime'
import { buildDirectManipulationCommands } from '../src/directManipulation.mjs'

test('dragging a system member changes its bay spacing with UUIDs, metadata and history preserved', () => {
  const created = CommandBus.execute(createEmptyProjectDocument(crypto.randomUUID()), 'CreateGridSystem', {
    id: crypto.randomUUID(), orientation: 'vertical', origin_mm: 0, spacing_mm: 3000, count: 3, first_tag: 'A',
  })
  const members = Object.values(created.updatedProject.objects)
  const ids = members.map(member => member.id)
  const gesture = { id: ids[1], kind: 'grid', startWorldMm: [3000, 800], startScreenPx: [0, 0], gridStartMm: [3000, -10000], gridEndMm: [3000, 15000] }
  const commands = buildDirectManipulationCommands(created.updatedProject, gesture, [3500, 2700])
  assert.deepEqual(commands, [{ name: 'ModifyGrid', input: { object_id: ids[1], position_mm: 3500 } }])
  const session = new ProjectCommandSession(created.updatedProject)
  assert.equal(session.execute(commands).status, 'success')
  const positions = p => ids.map(id => p.objects[id].module_data.position_mm)
  assert.deepEqual(positions(session.project), [0, 3500, 6000])
  for (const member of Object.values(session.project.objects)) assert.deepEqual(member.module_data.system_positions_mm, [0, 3500, 6000])
  assert.deepEqual(Object.keys(session.project.objects), ids)
  assert.deepEqual(positions(session.undo()), [0, 3000, 6000])
  assert.deepEqual(positions(session.redo()), [0, 3500, 6000])
  const reopened = deserializeProject(serializeProject(session.project))
  assert.deepEqual(positions(reopened), [0, 3500, 6000])
  const invalid = buildDirectManipulationCommands(session.project, gesture, [7000, 800])
  const before = session.project
  assert.notEqual(session.execute(invalid).status, 'success')
  assert.deepEqual(session.project, before)
})
