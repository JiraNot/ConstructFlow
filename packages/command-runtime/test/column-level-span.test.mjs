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
