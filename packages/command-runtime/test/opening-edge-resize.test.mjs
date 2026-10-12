import assert from 'node:assert/strict'
import test from 'node:test'
import { createEmptyProjectDocument, deserializeProject, serializeProject } from '@constructflow/project-model'
import { CommandBus, ProjectCommandSession } from '../dist/index.js'
import { resizeOpeningFromEdge } from '../../snapping-engine/dist/index.js'

function fixture(family, start = [0, 0, 0], end = [6000, 0, 0], offset = 550) {
  let project = createEmptyProjectDocument(crypto.randomUUID())
  const wallId = crypto.randomUUID(), id = crypto.randomUUID()
  const run = (name, input) => {
    const result = CommandBus.execute(project, name, input)
    assert.equal(result.result.status, 'success', JSON.stringify(result.result))
    project = result.updatedProject
  }
  run('CreateWall', { id: wallId, mark: 'W1', start_point_mm: start, end_point_mm: end, thickness_mm: 120, height_mm: 3000, level_id: project.levels[0].id })
  const ratio = offset / Math.hypot(end[0] - start[0], end[1] - start[1])
  run(family === 'door' ? 'CreateDoor' : 'CreateWindow', {
    id, mark: family === 'door' ? 'D1' : 'W1', wall_id: wallId,
    location_mm: [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio, 0],
    offset_along_wall_mm: offset, width_mm: 900, height_mm: family === 'door' ? 2000 : 1200,
    sill_height_mm: family === 'door' ? 0 : 900, level_id: project.levels[0].id,
  })
  return { project, id, wallId }
}

for (const family of ['door', 'window']) {
  const command = family === 'door' ? 'UpdateDoorDimensions' : 'UpdateWindowDimensions'
  test(`${family} stretches atomically near a wall end and undo/redo restores both width and placement`, () => {
    const { project, id, wallId } = fixture(family)
    const original = project.objects[id]
    const resized = resizeOpeningFromEdge(1500, 1, 550, 900, 6000)
    assert.deepEqual(resized, { width_mm: 1400, offset_along_wall_mm: 800 })
    const session = new ProjectCommandSession(project)
    const result = session.execute([{ name: command, input: { object_id: id, ...resized } }])
    assert.equal(result.status, 'success', JSON.stringify(result))
    const next = result.updatedProject.objects[id]
    assert.equal(next.id, original.id)
    assert.equal(next.created_phase, original.created_phase)
    assert.equal(next.module_data.wall_id, wallId)
    assert.equal(next.module_data.offset_along_wall_mm - next.module_data.width_mm / 2, 100)
    assert.deepEqual(next.module_data.location_mm, [800, 0, 0])
    assert.equal(next.module_data.height_mm, original.module_data.height_mm)
    assert.equal(next.module_data.sill_height_mm, original.module_data.sill_height_mm)
    assert.equal(next.module_data.handing, original.module_data.handing)
    assert.equal(next.module_data.instance_overrides.width_mm, 1400)
    assert.deepEqual(session.undo().objects[id].module_data, original.module_data)
    assert.deepEqual(session.redo().objects[id].module_data, next.module_data)
    assert.deepEqual(deserializeProject(serializeProject(result.updatedProject)).objects[id].module_data, JSON.parse(JSON.stringify(next.module_data)))
  })

  test(`${family} left-jamb stretch follows a reversed diagonal host and retains the right jamb`, () => {
    const { project, id } = fixture(family, [4000, 5000, 0], [400, 200, 0], 2000)
    const resized = resizeOpeningFromEdge(1350, 0, 2000, 900, 6000)
    const result = CommandBus.execute(project, command, { object_id: id, ...resized })
    assert.equal(result.result.status, 'success', JSON.stringify(result.result))
    const data = result.updatedProject.objects[id].module_data
    assert.deepEqual(data.location_mm, [2860, 3480, 0])
    assert.equal(data.offset_along_wall_mm + data.width_mm / 2, 2450)
    // Numeric Inspector edits without a supplied center retain their existing centered behavior.
    const centered = CommandBus.execute(result.updatedProject, command, { object_id: id, width_mm: 1000 })
    assert.equal(centered.result.status, 'success')
    assert.equal(centered.updatedProject.objects[id].module_data.offset_along_wall_mm, 1900)
    assert.deepEqual(centered.updatedProject.objects[id].module_data.location_mm, data.location_mm)
  })

  test(`${family} rejects an invalid combined resize without changing the project`, () => {
    const { project, id } = fixture(family)
    for (const offset of [-100, 6100, NaN]) {
      const result = CommandBus.execute(project, command, { object_id: id, width_mm: 1400, offset_along_wall_mm: offset })
      assert.notEqual(result.result.status, 'success')
      assert.deepEqual(result.updatedProject, project)
    }
  })
}
