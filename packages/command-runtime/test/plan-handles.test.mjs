import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyProjectDocument } from '@constructflow/project-model'
import { CommandBus, ProjectCommandSession } from '../dist/index.js'

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

test('wall stretches keep hosted opening offsets from the edited start and reject a cut that would clip one', () => {
  const project = createEmptyProjectDocument(crypto.randomUUID())
  const wallId = crypto.randomUUID(), windowId = crypto.randomUUID(), levelId = project.project.active_level_id
  const created = CommandBus.executeBatch(project, [
    { name: 'CreateWall', input: { id: wallId, mark: 'W1', level_id: levelId, start_point_mm: [0, 0], end_point_mm: [2000, 0], thickness_mm: 100, height_mm: 2800 } },
    { name: 'CreateWindow', input: { id: windowId, mark: 'W1', wall_id: wallId, level_id: levelId, location_mm: [1000, 0], offset_along_wall_mm: 1000, width_mm: 800, height_mm: 1000, sill_height_mm: 900 } },
  ])
  assert.equal(created.status, 'success')

  const extendEnd = CommandBus.execute(created.updatedProject, 'UpdateWallEndpoints', {
    object_id: wallId, start_point_mm: [0, 0], end_point_mm: [3000, 0],
  })
  assert.equal(extendEnd.result.status, 'success')
  assert.deepEqual(extendEnd.updatedProject.objects[windowId].module_data.location_mm.slice(0, 2), [1000, 0])
  assert.equal(extendEnd.updatedProject.objects[windowId].module_data.offset_along_wall_mm, 1000)

  const stretchStart = CommandBus.execute(extendEnd.updatedProject, 'UpdateWallEndpoints', {
    object_id: wallId, start_point_mm: [-500, 0], end_point_mm: [3000, 0],
  })
  assert.equal(stretchStart.result.status, 'success')
  assert.deepEqual(stretchStart.updatedProject.objects[windowId].module_data.location_mm.slice(0, 2), [500, 0])
  assert.equal(stretchStart.updatedProject.objects[windowId].module_data.offset_along_wall_mm, 1000)

  const clipped = CommandBus.execute(stretchStart.updatedProject, 'UpdateWallEndpoints', {
    object_id: wallId, start_point_mm: [2600, 0], end_point_mm: [3000, 0],
  })
  assert.notEqual(clipped.result.status, 'success')
  assert.equal(clipped.updatedProject, stretchStart.updatedProject)
  assert.equal(clipped.updatedProject.objects[wallId].module_data.length_mm, 3500)
})

test('diagonal wall endpoint edits place hosted openings at their exact physical offset', () => {
  const project = createEmptyProjectDocument(crypto.randomUUID())
  const wallId = crypto.randomUUID(), windowId = crypto.randomUUID(), levelId = project.project.active_level_id
  const created = CommandBus.executeBatch(project, [
    { name: 'CreateWall', input: { id: wallId, mark: 'W1', level_id: levelId, start_point_mm: [0, 0], end_point_mm: [4000, 3001], thickness_mm: 100, height_mm: 2800 } },
    { name: 'CreateWindow', input: { id: windowId, mark: 'W1', wall_id: wallId, level_id: levelId, location_mm: [960, 720.24], offset_along_wall_mm: 1200, width_mm: 1000, height_mm: 1000, sill_height_mm: 900 } },
  ])
  assert.equal(created.status, 'success')
  const updated = CommandBus.execute(created.updatedProject, 'UpdateWallEndpoints', {
    object_id: wallId, start_point_mm: [100, 200], end_point_mm: [4000, 3001],
  })
  assert.equal(updated.result.status, 'success')
  const opening = updated.updatedProject.objects[windowId].module_data
  const wall = updated.updatedProject.objects[wallId].module_data
  const distanceFromStart = Math.hypot(opening.location_mm[0] - wall.start_point_mm[0], opening.location_mm[1] - wall.start_point_mm[1])
  assert.ok(Math.abs(distanceFromStart - opening.offset_along_wall_mm) < 1e-9)
})

test('one Undo restores both a stretched host wall and its reconciled opening', () => {
  const project = createEmptyProjectDocument(crypto.randomUUID())
  const wallId = crypto.randomUUID(), windowId = crypto.randomUUID(), levelId = project.project.active_level_id
  const created = CommandBus.executeBatch(project, [
    { name: 'CreateWall', input: { id: wallId, mark: 'W1', level_id: levelId, start_point_mm: [0, 0], end_point_mm: [3000, 0], thickness_mm: 100, height_mm: 2800 } },
    { name: 'CreateWindow', input: { id: windowId, mark: 'W1', wall_id: wallId, level_id: levelId, location_mm: [1000, 0], offset_along_wall_mm: 1000, width_mm: 800, height_mm: 1000, sill_height_mm: 900 } },
  ])
  assert.equal(created.status, 'success')
  const session = new ProjectCommandSession(created.updatedProject)
  const beforeEdit = session.project
  const stretched = session.execute([{ name: 'UpdateWallEndpoints', input: {
    object_id: wallId, start_point_mm: [100, 0], end_point_mm: [3500, 0],
  } }])
  assert.equal(stretched.status, 'success')
  assert.deepEqual(stretched.results[0].affected_object_ids.slice(0, 2), [wallId, windowId])
  assert.deepEqual(session.project.objects[windowId].module_data.location_mm.slice(0, 2), [1100, 0])
  assert.deepEqual(session.undo(), beforeEdit)
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
