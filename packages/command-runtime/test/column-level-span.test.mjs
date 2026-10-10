import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyProjectDocument, resolveBeamBaseElevation, resolveColumnVerticalExtent } from '@constructflow/project-model'
import { ProjectCommandSession, CommandBus } from '../dist/index.js'

test('a column uses one base-to-eaves span, follows level edits and supports undo/redo', () => {
  const columnId = '00000000-0000-4000-8000-000000000001'
  const project = createEmptyProjectDocument('COLUMN-LEVEL-SPAN')
  project.levels = [
    { id: 'GF', name: 'Ground', elevation_mm: 0, storey_index: 0, height_mm: 400 },
    { id: 'L1', name: 'First Floor', elevation_mm: 400, storey_index: 1, height_mm: 3000 },
    { id: 'EAVE', name: 'ระดับอเส', elevation_mm: 3400, storey_index: 2, height_mm: 2000 },
  ]
  project.project.active_level_id = 'GF'
  const session = new ProjectCommandSession(project)
  const created = session.execute([{ name: 'CreateColumn', input: {
    id: columnId, mark: 'C1', location_mm: [1000, 2000, 0], section_mm: [200, 200],
    base_level_id: 'GF', top_level_id: 'EAVE',
  } }])
  assert.equal(created.status, 'success', JSON.stringify(created.errors))
  let column = created.updatedProject.objects[columnId]
  assert.deepEqual(column.level_refs, [{ role: 'base_level', level_id: 'GF' }, { role: 'top_level', level_id: 'EAVE' }])
  assert.deepEqual(resolveColumnVerticalExtent(created.updatedProject, column), {
    base_elevation_mm: 0, top_elevation_mm: 3400, height_mm: 3400, base_offset_mm: 0, top_offset_mm: 0,
  })

  const constrained = session.execute([{ name: 'UpdateColumnVerticalReference', input: {
    object_id: column.id, top_level_id: 'L1', base_offset_mm: 100, top_offset_mm: -50,
  } }])
  assert.equal(constrained.status, 'success', JSON.stringify(constrained.errors))
  column = constrained.updatedProject.objects[columnId]
  assert.equal(resolveColumnVerticalExtent(constrained.updatedProject, column).height_mm, 250)
  assert.deepEqual(column.level_refs.at(-1), { role: 'top_level', level_id: 'L1' })

  const raised = session.execute([{ name: 'UpdateLevel', input: { id: 'L1', elevation_mm: 500 } }])
  assert.equal(raised.status, 'success', JSON.stringify(raised.errors))
  assert.equal(resolveColumnVerticalExtent(raised.updatedProject, raised.updatedProject.objects[columnId]).top_elevation_mm, 450)
  const undone = session.undo()
  assert.equal(resolveColumnVerticalExtent(undone, undone.objects[columnId]).top_elevation_mm, 350)
  const redone = session.redo()
  assert.equal(resolveColumnVerticalExtent(redone, redone.objects[columnId]).top_elevation_mm, 450)

  const rejected = CommandBus.execute(raised.updatedProject, 'UpdateColumnVerticalReference', {
    object_id: column.id, base_level_id: 'GF', top_level_id: 'GF', base_offset_mm: 0, top_offset_mm: 0,
  })
  assert.equal(rejected.result.status, 'rejected')
  assert.match(rejected.result.errors[0], /positive height/)
  assert.deepEqual(rejected.updatedProject, raised.updatedProject)
})

test('beams use a level datum and signed embed offset instead of a hard-coded world zero', () => {
  const project = createEmptyProjectDocument('BEAM-LEVEL')
  project.levels = [
    { id: 'GF', name: 'Ground Floor', elevation_mm: 0, storey_index: 0, height_mm: 3000 },
    { id: 'L1', name: 'First Floor', elevation_mm: 3000, storey_index: 1, height_mm: 3000 },
  ]
  project.project.active_level_id = 'GF'
  const session = new ProjectCommandSession(project)
  const created = session.execute([{ name: 'CreateBeam', input: {
    id: '00000000-0000-4000-8000-000000000002', mark: 'B1',
    start_point_mm: [0, 0], end_point_mm: [4000, 0], section_mm: [200, 400],
    level_id: 'GF', base_offset_mm: -200,
  } }])
  assert.equal(created.status, 'success', JSON.stringify(created.errors))
  const beam = Object.values(created.updatedProject.objects).find(object => object.object_type === 'structure.beam')
  assert.equal(beam.module_data.start_point_mm[2], -200)
  assert.equal(beam.module_data.end_point_mm[2], -200)
  assert.equal(resolveBeamBaseElevation(created.updatedProject, beam), -200)
  const raised = session.execute([{ name: 'UpdateLevel', input: { id: 'GF', elevation_mm: 100 } }])
  assert.equal(raised.status, 'success', JSON.stringify(raised.errors))
  assert.equal(resolveBeamBaseElevation(raised.updatedProject, raised.updatedProject.objects[beam.id]), -100)
  const repositioned = session.execute([{ name: 'UpdateBeamVerticalReference', input: { object_id: beam.id, level_id: 'L1', base_offset_mm: -400 } }])
  assert.equal(repositioned.status, 'success', JSON.stringify(repositioned.errors))
  assert.equal(resolveBeamBaseElevation(repositioned.updatedProject, repositioned.updatedProject.objects[beam.id]), 2600)
})

test('deleting a column cascades to hosted foundations and rebar, and detaches connected beam endpoints cleanly', () => {
  const project = createEmptyProjectDocument('COLUMN-DELETE-TEST')
  const session = new ProjectCommandSession(project)

  const c1Id = '00000000-0000-4000-8000-000000000010'
  const c2Id = '00000000-0000-4000-8000-000000000020'
  const fId = '00000000-0000-4000-8000-000000000030'
  const bId = '00000000-0000-4000-8000-000000000040'

  session.execute([
    { name: 'CreateColumn', input: { id: c1Id, mark: 'C1', location_mm: [0, 0, 0], section_mm: [200, 200] } },
    { name: 'CreateColumn', input: { id: c2Id, mark: 'C1', location_mm: [4000, 0, 0], section_mm: [200, 200] } },
    { name: 'CreateFoundation', input: { id: fId, supported_column_id: c1Id, mark: 'F1' } },
    { name: 'CreateBeam', input: { id: bId, mark: 'B1', start_point_mm: [0, 0, 0], end_point_mm: [4000, 0, 0], start_column_id: c1Id, end_column_id: c2Id } },
  ])

  // Verify setup
  assert.ok(session.project.objects[c1Id])
  assert.ok(session.project.objects[fId])
  assert.ok(session.project.objects[bId])
  assert.equal(session.project.objects[bId].module_data.start_column_id, c1Id)
  assert.ok(session.project.objects[bId].host_refs.includes(c1Id))

  // Delete column C1
  const delRes = session.execute([{ name: 'DeleteObject', input: { object_id: c1Id } }])
  assert.equal(delRes.status, 'success', JSON.stringify(delRes.errors))

  // C1 and hosted foundation F1 must be deleted
  assert.equal(session.project.objects[c1Id], undefined)
  assert.equal(session.project.objects[fId], undefined)

  // Beam B1 must survive with start_column_id detached
  const beam = session.project.objects[bId]
  assert.ok(beam)
  assert.equal(beam.module_data.start_column_id, undefined)
  assert.equal(beam.module_data.end_column_id, c2Id)
  assert.equal(beam.host_refs.includes(c1Id), false)
  assert.equal(beam.host_refs.includes(c2Id), true)

  // Undo restores column, foundation, and beam host
  const undone = session.undo()
  assert.ok(undone.objects[c1Id])
  assert.ok(undone.objects[fId])
  assert.equal(undone.objects[bId].module_data.start_column_id, c1Id)
  assert.ok(undone.objects[bId].host_refs.includes(c1Id))

  // Redo re-applies clean deletion
  const redone = session.redo()
  assert.equal(redone.objects[c1Id], undefined)
  assert.equal(redone.objects[fId], undefined)
  assert.equal(redone.objects[bId].module_data.start_column_id, undefined)
})
