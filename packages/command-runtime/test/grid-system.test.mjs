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

test('grid systems preserve unequal bay spacings and can be edited by explicit positions', () => {
  const project = empty()
  const created = CommandBus.execute(project, 'CreateGridSystem', {
    id: crypto.randomUUID(), orientation: 'vertical', origin_mm: 1000, spacing_mm: 4000,
    count: 4, positions_mm: [1000, 5000, 8500, 13500], first_tag: 'A',
  })
  assert.equal(created.result.status, 'success', created.result.errors?.join('; '))
  let members = Object.values(created.updatedProject.objects).filter(isGridObject).sort((a, b) => a.module_data.system_index - b.module_data.system_index)
  assert.deepEqual(members.map(line => line.module_data.position_mm), [1000, 5000, 8500, 13500])
  assert.deepEqual(members[0].module_data.system_positions_mm, [1000, 5000, 8500, 13500])

  const edited = CommandBus.execute(created.updatedProject, 'UpdateGridSystem', {
    system_id: members[0].module_data.system_id,
    positions_mm: [1200, 4600, 9100], first_tag: 'B',
  })
  assert.equal(edited.result.status, 'success', edited.result.errors?.join('; '))
  members = Object.values(edited.updatedProject.objects).filter(isGridObject).sort((a, b) => a.module_data.system_index - b.module_data.system_index)
  assert.deepEqual(members.map(line => line.module_data.position_mm), [1200, 4600, 9100])
  assert.deepEqual(members.map(line => line.module_data.tag), ['B', 'C', 'D'])
})

test('individually drawn reference grids retain angled endpoints', () => {
  const created = CommandBus.execute(empty(), 'CreateGrid', {
    id: crypto.randomUUID(), tag: 'A1', orientation: 'vertical', position_mm: 2000,
    start_point_mm: [1000, 0], end_point_mm: [3000, 4000], extent_mm: [0, 4000],
  })
  assert.equal(created.result.status, 'success')
  const grid = Object.values(created.updatedProject.objects).find(isGridObject)
  assert.deepEqual(grid.module_data.start_point_mm, [1000, 0])
  assert.deepEqual(grid.module_data.end_point_mm, [3000, 4000])
})

test('individual reference grids can move, rotate, hide bubbles, and switch automatic sequencing', () => {
  const created = CommandBus.execute(empty(), 'CreateGrid', {
    id: crypto.randomUUID(), tag: 'A', orientation: 'vertical', position_mm: 0,
    start_point_mm: [0, 0], end_point_mm: [0, 3000], extent_mm: [0, 3000],
  })
  assert.equal(created.result.status, 'success')
  const id = created.result.created_object_ids[0]
  const moved = CommandBus.execute(created.updatedProject, 'ModifyGrid', {
    object_id: id, start_point_mm: [1000, 500], end_point_mm: [2000, 3500], bubble_visible: false, sequence_style: 'numeric',
  })
  assert.equal(moved.result.status, 'success', moved.result.errors?.join('; '))
  const grid = moved.updatedProject.objects[id]
  assert.deepEqual(grid.module_data.start_point_mm, [1000, 500])
  assert.deepEqual(grid.module_data.end_point_mm, [2000, 3500])
  assert.equal(grid.module_data.bubble_visible, false)
  assert.equal(grid.module_data.sequence_style, 'numeric')
  const replayed = CommandBus.execute(created.updatedProject, moved.emittedEnvelope.name, moved.emittedEnvelope.input)
  assert.deepEqual(replayed.updatedProject.objects[id].module_data, grid.module_data)
  const manual = CommandBus.execute(moved.updatedProject, 'UpdateGridTag', { object_id: id, tag: 'AX' })
  assert.equal(manual.updatedProject.objects[id].module_data.auto_tag, false)
  const member = CommandBus.execute(manual.updatedProject, 'CreateGridSystem', { id: crypto.randomUUID(), orientation: 'vertical', origin_mm: 0, spacing_mm: 2000, count: 2, first_tag: 'A' })
  const systemGrid = Object.values(member.updatedProject.objects).find(object => object.module_data.system_id)
  const rejected = CommandBus.execute(member.updatedProject, 'ModifyGrid', { object_id: systemGrid.id, bubble_visible: false })
  assert.equal(rejected.result.status, 'rejected')
})
