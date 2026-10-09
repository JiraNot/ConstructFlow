import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyProjectDocument } from '@constructflow/project-model'
import { CommandBus } from '../dist/index.js'

test('wall endpoint edits update its length and keep hosted opening on the same parametric location', () => {
  const project = createEmptyProjectDocument(crypto.randomUUID())
  const wallId = crypto.randomUUID(), windowId = crypto.randomUUID(), levelId = project.project.active_level_id
  const created = CommandBus.executeBatch(project, [
    { name: 'CreateWall', input: { id: wallId, mark: 'W1', level_id: levelId, start_point_mm: [0, 0], end_point_mm: [4000, 0], thickness_mm: 100, height_mm: 2800 } },
    { name: 'CreateWindow', input: { id: windowId, mark: 'W1', wall_id: wallId, level_id: levelId, location_mm: [1200, 0], offset_along_wall_mm: 1200, width_mm: 1000, height_mm: 1000, sill_height_mm: 900 } },
  ])
  assert.equal(created.status, 'success')
  const updated = CommandBus.execute(created.updatedProject, 'UpdateWallEndpoints', {
    object_id: wallId, start_point_mm: [100, 0], end_point_mm: [4000, 0],
  })
  assert.equal(updated.result.status, 'success')
  assert.equal(updated.updatedProject.objects[wallId].module_data.length_mm, 3900)
  assert.equal(updated.updatedProject.objects[windowId].module_data.location_mm[0], 1300)
})

test('beam endpoint edits recompute span and detach a moved endpoint from its old column', () => {
  const project = createEmptyProjectDocument(crypto.randomUUID())
  const levelId = project.project.active_level_id, startColumnId = crypto.randomUUID(), endColumnId = crypto.randomUUID(), beamId = crypto.randomUUID()
  const created = CommandBus.executeBatch(project, [
    { name: 'CreateColumn', input: { id: startColumnId, mark: 'C1', level_id: levelId, location_mm: [0, 0, 0], section_mm: [200, 200] } },
    { name: 'CreateColumn', input: { id: endColumnId, mark: 'C1', level_id: levelId, location_mm: [4000, 0, 0], section_mm: [200, 200] } },
    { name: 'CreateBeam', input: { id: beamId, mark: 'B1', level_id: levelId, start_point_mm: [0, 0, 0], end_point_mm: [4000, 0, 0], start_column_id: startColumnId, end_column_id: endColumnId } },
  ])
  assert.equal(created.status, 'success')
  const updated = CommandBus.execute(created.updatedProject, 'UpdateBeamEndpoints', {
    object_id: beamId, start_point_mm: [0, 0], end_point_mm: [3500, 500], start_column_id: startColumnId, end_column_id: null,
  })
  assert.equal(updated.result.status, 'success')
  assert.equal(updated.updatedProject.objects[beamId].module_data.span_mm, Math.round(Math.hypot(3500, 500)))
  assert.equal(updated.updatedProject.objects[beamId].module_data.end_column_id, undefined)
})
