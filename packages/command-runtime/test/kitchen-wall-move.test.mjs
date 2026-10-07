import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { deserializeProject } from '../../project-model/dist/index.js'
import { ProjectCommandSession } from '../dist/index.js'

const fixtureUrl = new URL('../../../examples/kitchen-extension-proof.cfproj', import.meta.url)
const fixture = deserializeProject(await readFile(fixtureUrl, 'utf8'))
const openingForWall = (project, kind) => Object.values(project.objects).find(object => object.object_type === kind)
const wallForOpening = (project, opening) => project.objects[opening.module_data.wall_id]

test('S2: moving kitchen walls keeps hosted openings together and one Undo restores the model', () => {
  const session = new ProjectCommandSession(fixture)
  const original = session.project
  const originalDoor = openingForWall(original, 'door_window.door')
  const originalWindow = openingForWall(original, 'door_window.window')
  const originalDoorWall = wallForOpening(original, originalDoor)
  const originalWindowWall = wallForOpening(original, originalWindow)
  const doorDelta = [250, -100]
  const windowDelta = [-100, 50]

  const result = session.execute([
    { name: 'MoveWall', input: { object_id: originalDoorWall.id, delta_mm: doorDelta } },
    { name: 'MoveWall', input: { object_id: originalWindowWall.id, delta_mm: windowDelta } },
  ])

  assert.equal(result.status, 'success')
  assert.equal(result.results.length, 2)
  assert.equal(result.emittedEnvelopes.length, 2)
  assert.deepEqual(result.results[0].affected_object_ids, [originalDoorWall.id, originalDoor.id])
  assert.deepEqual(result.results[1].affected_object_ids, [originalWindowWall.id, originalWindow.id])

  const moved = session.project
  const movedDoor = moved.objects[originalDoor.id]
  const movedDoorWall = moved.objects[originalDoorWall.id]
  const movedWindow = moved.objects[originalWindow.id]
  const movedWindowWall = moved.objects[originalWindowWall.id]
  assert.deepEqual(movedDoorWall.module_data.start_point_mm, [originalDoorWall.module_data.start_point_mm[0] + doorDelta[0], originalDoorWall.module_data.start_point_mm[1] + doorDelta[1], 0])
  assert.deepEqual(movedDoorWall.module_data.end_point_mm, [originalDoorWall.module_data.end_point_mm[0] + doorDelta[0], originalDoorWall.module_data.end_point_mm[1] + doorDelta[1], 0])
  assert.deepEqual(movedDoor.module_data.location_mm, [originalDoor.module_data.location_mm[0] + doorDelta[0], originalDoor.module_data.location_mm[1] + doorDelta[1], 0])
  assert.equal(movedDoor.module_data.wall_id, originalDoor.module_data.wall_id)
  assert.deepEqual(movedDoor.host_refs, originalDoor.host_refs)
  assert.equal(movedDoor.module_data.offset_along_wall_mm, originalDoor.module_data.offset_along_wall_mm)
  assert.deepEqual(movedWindowWall.module_data.start_point_mm, [originalWindowWall.module_data.start_point_mm[0] + windowDelta[0], originalWindowWall.module_data.start_point_mm[1] + windowDelta[1], 0])
  assert.deepEqual(movedWindow.module_data.location_mm, [originalWindow.module_data.location_mm[0] + windowDelta[0], originalWindow.module_data.location_mm[1] + windowDelta[1], 0])
  assert.equal(movedWindow.module_data.wall_id, originalWindow.module_data.wall_id)
  assert.deepEqual(movedWindow.host_refs, originalWindow.host_refs)
  assert.equal(movedWindow.module_data.offset_along_wall_mm, originalWindow.module_data.offset_along_wall_mm)

  assert.deepEqual(session.undo(), original)
  assert.deepEqual(session.redo(), moved)
})

test('S2: a rejected second wall move rolls back all earlier geometry and envelopes', () => {
  const session = new ProjectCommandSession(fixture)
  const original = session.project
  const door = openingForWall(original, 'door_window.door')
  const window = openingForWall(original, 'door_window.window')

  const result = session.execute([
    { name: 'MoveWall', input: { object_id: door.module_data.wall_id, delta_mm: [100, 0] } },
    { name: 'MoveWall', input: { object_id: window.module_data.wall_id, delta_mm: [Number.NaN, 0] } },
  ])

  assert.equal(result.status, 'rejected')
  assert.deepEqual(result.emittedEnvelopes, [])
  assert.deepEqual(session.project, original)
  assert.equal(session.canUndo, false)
})
