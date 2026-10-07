import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { deserializeProject } from '../../project-model/dist/index.js'
import { CommandBus, ProjectCommandSession } from '../dist/index.js'

const fixture = await readFile(new URL('../../../examples/kitchen-extension-proof.cfproj', import.meta.url), 'utf8')
const project = deserializeProject(fixture)

function movedLocation(opening, wall, offset) {
  const [startX, startY] = wall.module_data.start_point_mm
  const [endX, endY] = wall.module_data.end_point_mm
  const length = Math.hypot(endX - startX, endY - startY)
  return [startX + (endX - startX) * offset / length, startY + (endY - startY) * offset / length, opening.module_data.location_mm[2]]
}

test('S2: MoveOpening preserves hosted door/window UUIDs and updates wall-relative coordinates', () => {
  const openings = Object.values(project.objects).filter(object =>
    object.object_type === 'door_window.door' || object.object_type === 'door_window.window'
  )
  assert.equal(openings.length, 2)
  const commands = openings.map(opening => ({
    name: 'MoveOpening',
    input: { object_id: opening.id, offset_along_wall_mm: opening.module_data.offset_along_wall_mm + 200 },
  }))
  const session = new ProjectCommandSession(project)
  const result = session.execute(commands)

  assert.equal(result.status, 'success')
  const updated = result.updatedProject
  for (const opening of openings) {
    const after = updated.objects[opening.id]
    const wall = updated.objects[opening.module_data.wall_id]
    const nextOffset = opening.module_data.offset_along_wall_mm + 200
    assert.equal(after.id, opening.id)
    assert.equal(after.module_data.wall_id, opening.module_data.wall_id)
    assert.deepEqual(after.host_refs, opening.host_refs)
    assert.equal(after.module_data.offset_along_wall_mm, nextOffset)
    assert.deepEqual(after.module_data.location_mm, movedLocation(opening, wall, nextOffset))
  }

  assert.deepEqual(session.undo(), project)
  assert.deepEqual(session.redo(), updated)
})

test('S2: MoveOpening rejects host-boundary overflow and rolls back an atomic batch', () => {
  const door = Object.values(project.objects).find(object => object.object_type === 'door_window.door')
  const validOffset = door.module_data.offset_along_wall_mm + 100
  const invalidOffset = 100000
  const result = CommandBus.executeBatch(project, [
    { name: 'MoveOpening', input: { object_id: door.id, offset_along_wall_mm: validOffset } },
    { name: 'MoveOpening', input: { object_id: door.id, offset_along_wall_mm: invalidOffset } },
  ])

  assert.equal(result.status, 'rejected')
  assert.equal(result.failed_command_index, 1)
  assert.deepEqual(result.updatedProject, project)
  assert.deepEqual(result.emittedEnvelopes, [])
  assert.equal(result.results[1].errors[0].includes('does not fit within host wall'), true)
})
