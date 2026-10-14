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

test('continuous beam endpoint edits keep the middle support in references and undo history', () => {
  let project = createEmptyProjectDocument(crypto.randomUUID())
  const levelId = project.project.active_level_id
  const columnIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]
  for (const [index, x] of [0, 4000, 8000].entries()) {
    const result = CommandBus.execute(project, 'CreateColumn', {
      id: columnIds[index], mark: `C${index + 1}`, level_id: levelId,
      location_mm: [x, 0, 0], section_mm: [200, 200],
    })
    assert.equal(result.result.status, 'success')
    project = result.updatedProject
  }
  const beamId = crypto.randomUUID()
  const created = CommandBus.execute(project, 'CreateBeam', {
    id: beamId, mark: 'B1', level_id: levelId,
    start_point_mm: [0, 0, 0], end_point_mm: [8000, 0, 0],
    start_column_id: columnIds[0], middle_support_column_id: columnIds[1], end_column_id: columnIds[2],
    beam_system: 'continuous', continuity_type: 'interior_span',
  })
  assert.equal(created.result.status, 'success')
  const session = new ProjectCommandSession(created.updatedProject)
  const continuous = session.project
  const detached = session.execute([{ name: 'UpdateBeamEndpoints', input: {
    object_id: beamId, start_point_mm: [0, 0], end_point_mm: [8000, 0],
    start_column_id: columnIds[0], middle_support_column_id: null, end_column_id: columnIds[2],
    beam_system: 'simple', continuity_type: 'simple_span',
  } }])
  assert.equal(detached.status, 'success')
  assert.equal(session.project.objects[beamId].module_data.middle_support_column_id, undefined)
  assert.deepEqual(session.project.objects[beamId].host_refs, [columnIds[0], columnIds[2]])
  assert.deepEqual(session.undo(), continuous)
  assert.deepEqual(session.project.objects[beamId].host_refs, columnIds)
  assert.equal(session.project.relationships.filter(rel => rel.source_id === beamId && rel.role === 'beam_column_connection').length, 3)
  assert.deepEqual(session.redo(), detached.updatedProject)
  assert.deepEqual(session.project.objects[beamId].host_refs, [columnIds[0], columnIds[2]])
  const deletedSupport = CommandBus.execute(session.project, 'DeleteObject', { object_id: columnIds[1] })
  assert.equal(deletedSupport.result.status, 'success')
  assert.equal(deletedSupport.updatedProject.objects[beamId].module_data.middle_support_column_id, undefined)
  assert.ok(!deletedSupport.updatedProject.objects[beamId].host_refs.includes(columnIds[1]))
  assert.ok(!deletedSupport.updatedProject.relationships.some(rel => rel.source_id === beamId && rel.target_id === columnIds[1]))
})
