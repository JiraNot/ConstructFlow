import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyProjectDocument, isGridObject } from '@constructflow/project-model'
import { CommandBus } from '../dist/index.js'

const empty = () => createEmptyProjectDocument(crypto.randomUUID())

test('grid systems create multiple measured lines and update the set while preserving member IDs', () => {
  const created = CommandBus.execute(empty(), 'CreateGridSystem', {
    id: crypto.randomUUID(), orientation: 'horizontal', origin_mm: 2500, spacing_mm: 3600, count: 3, first_tag: '1',
  })
  assert.equal(created.result.status, 'success', created.result.errors?.join('; '))
  let members = Object.values(created.updatedProject.objects).filter(isGridObject)
  assert.deepEqual(members.map(line => line.module_data.position_mm), [2500, 6100, 9700])
  assert.deepEqual(members.map(line => line.module_data.tag), ['1', '2', '3'])
  const replayedCreation = CommandBus.execute(empty(), created.emittedEnvelope.name, created.emittedEnvelope.input)
  assert.deepEqual(Object.keys(replayedCreation.updatedProject.objects).sort(), Object.keys(created.updatedProject.objects).sort())
  const originalIds = members.map(line => line.id)
  const systemId = members[0].module_data.system_id

  const updated = CommandBus.execute(created.updatedProject, 'UpdateGridSystem', {
    system_id: systemId, origin_mm: 3000, spacing_mm: 4200, count: 4, first_tag: 'A',
  })
  assert.equal(updated.result.status, 'success', updated.result.errors?.join('; '))
  members = Object.values(updated.updatedProject.objects).filter(isGridObject).sort((a, b) => a.module_data.system_index - b.module_data.system_index)
  assert.equal(members.length, 4)
  assert.deepEqual(members.map(line => line.module_data.position_mm), [3000, 7200, 11400, 15600])
  assert.deepEqual(members.map(line => line.module_data.tag), ['A', 'B', 'C', 'D'])
  assert.deepEqual(members.slice(0, 3).map(line => line.id), originalIds)
  const replayedUpdate = CommandBus.execute(created.updatedProject, updated.emittedEnvelope.name, updated.emittedEnvelope.input)
  assert.deepEqual(Object.keys(replayedUpdate.updatedProject.objects).sort(), Object.keys(updated.updatedProject.objects).sort())

  const reduced = CommandBus.execute(updated.updatedProject, 'UpdateGridSystem', {
    system_id: systemId, origin_mm: 3000, spacing_mm: 4200, count: 2, first_tag: 'A',
  })
  assert.equal(reduced.result.status, 'success')
  assert.equal(Object.values(reduced.updatedProject.objects).filter(isGridObject).length, 2)
  assert.equal(reduced.result.deleted_object_ids.length, 2)
})

test('grid systems reject invalid spacing and line counts without creating partial objects', () => {
  const project = empty()
  const result = CommandBus.execute(project, 'CreateGridSystem', {
    id: crypto.randomUUID(), orientation: 'vertical', origin_mm: 0, spacing_mm: 0, count: 3, first_tag: 'A',
  })
  assert.equal(result.result.status, 'rejected')
  assert.equal(Object.keys(result.updatedProject.objects).length, 0)
})
