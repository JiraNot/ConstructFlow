import assert from 'node:assert/strict'
import test from 'node:test'
import { createEmptyProjectDocument } from '@constructflow/project-model'
import { CommandBus, ProjectCommandSession } from '../dist/index.js'

const run = (project, name, input) => {
  const result = CommandBus.execute(project, name, input)
  assert.equal(result.result.status, 'success', JSON.stringify(result.result))
  return result.updatedProject
}

function fixture() {
  let project = createEmptyProjectDocument(crypto.randomUUID())
  const levelId = project.project.active_level_id
  const hostA = crypto.randomUUID(), hostB = crypto.randomUUID(), windowId = crypto.randomUUID()
  project = run(project, 'CreateWall', { id: hostA, mark: 'W1', start_point_mm: [0, 0, 0], end_point_mm: [5000, 0, 0], thickness_mm: 120, height_mm: 2800, level_id: levelId })
  project = run(project, 'CreateWall', { id: hostB, mark: 'W1', start_point_mm: [1000, 3000, 0], end_point_mm: [6000, 3000, 0], thickness_mm: 120, height_mm: 2800, level_id: levelId })
  project = run(project, 'CreateWindow', { id: windowId, mark: 'W1', wall_id: hostA, location_mm: [2500, 0, 1200], offset_along_wall_mm: 2500, width_mm: 1200, height_mm: 1200, sill_height_mm: 900, level_id: levelId })
  return { project, hostA, hostB, windowId }
}

test('RehostOpening changes host relationship and location atomically with stable identity and undo/redo', () => {
  const { project, hostA, hostB, windowId } = fixture()
  const session = new ProjectCommandSession(project)
  const moved = session.execute([{ name: 'RehostOpening', input: { object_id: windowId, wall_id: hostB, offset_along_wall_mm: 3000 } }])
  assert.equal(moved.status, 'success', JSON.stringify(moved))
  const window = moved.updatedProject.objects[windowId]
  assert.equal(window.id, windowId)
  assert.equal(window.module_data.wall_id, hostB)
  assert.deepEqual(window.host_refs, [hostB])
  assert.equal(window.module_data.offset_along_wall_mm, 3000)
  assert.deepEqual(window.module_data.location_mm, [4000, 3000, 1200])
  assert.ok(moved.updatedProject.relationships.some(item => item.kind === 'hosted_on' && item.source_id === windowId && item.target_id === hostB))
  assert.ok(moved.updatedProject.relationships.some(item => item.kind === 'hosts' && item.source_id === hostB && item.target_id === windowId))
  assert.ok(!moved.updatedProject.relationships.some(item => item.source_id === windowId && item.target_id === hostA))

  assert.equal(session.undo().objects[windowId].module_data.wall_id, hostA)
  const redone = session.redo()
  assert.equal(redone.objects[windowId].module_data.wall_id, hostB)
  assert.equal(redone.objects[windowId].id, windowId)
})

test('RehostOpening rejects invalid fit, overlapping openings and cross-level hosts without mutation', () => {
  const { project, hostB, windowId } = fixture()
  let withSecondWindow = run(project, 'CreateWindow', {
    id: crypto.randomUUID(), mark: 'W1', wall_id: hostB, location_mm: [3000, 3000, 1200],
    offset_along_wall_mm: 2000, width_mm: 1200, height_mm: 1200, sill_height_mm: 900,
    level_id: project.project.active_level_id,
  })
  const upperLevel = { id: crypto.randomUUID() }
  withSecondWindow = run(withSecondWindow, 'CreateLevel', {
    id: upperLevel.id, name: 'Upper', elevation_mm: 3000, storey_index: 1, height_mm: 3000,
  })
  const upperWallId = crypto.randomUUID()
  withSecondWindow = run(withSecondWindow, 'CreateWall', {
    id: upperWallId, mark: 'W1', start_point_mm: [0, 6000, 0], end_point_mm: [5000, 6000, 0],
    thickness_mm: 120, height_mm: 2800, level_id: upperLevel.id,
  })

  for (const input of [
    { object_id: windowId, wall_id: hostB, offset_along_wall_mm: 400 },
    { object_id: windowId, wall_id: hostB, offset_along_wall_mm: 2000 },
    { object_id: windowId, wall_id: upperWallId, offset_along_wall_mm: 2500 },
    { object_id: windowId, wall_id: 'missing-wall', offset_along_wall_mm: 2500 },
  ]) {
    const result = CommandBus.execute(withSecondWindow, 'RehostOpening', input)
    assert.equal(result.result.status, 'rejected', JSON.stringify(input))
    assert.deepEqual(result.updatedProject, withSecondWindow, 'rejection leaves every project record unchanged')
  }
})
