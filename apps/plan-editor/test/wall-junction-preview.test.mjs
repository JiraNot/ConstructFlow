import assert from 'node:assert/strict'
import test from 'node:test'
import { buildWallJunctionPreview } from '../src/components/buildWallJunctionPreview.mjs'

function projectWithWall(extraObjects = {}) {
  const wall = {
    id: 'wall-a',
    object_type: 'architecture.wall',
    status: 'active',
    module_data: { type_id: 'wall-type', start_point_mm: [-1000, 0, 0], end_point_mm: [1000, 0, 0], thickness_mm: 100, mark: 'W1' },
  }
  return {
    types: [{ id: 'wall-type', object_type: 'architecture.wall', name: 'W1', parameters: { thickness_mm: 100 } }],
    objects: { [wall.id]: wall, ...extraObjects },
  }
}

test('wall snap previews the union boundary of a pending T-junction', () => {
  const project = projectWithWall()
  const preview = buildWallJunctionPreview(
    project,
    { kind: 'wall_midpoint', target_id: 'wall-a', point_mm: [0, 0], description: 'wall midpoint' },
    [0, 0],
    [0, 1000],
    100,
  )

  assert.equal(preview.target_count, 1)
  assert.deepEqual(preview.target_marks, ['W1'])
  assert.ok(preview.segments_mm.length > 0)
  assert.ok(!preview.segments_mm.some(([a, b]) => a[0] === 0 && b[0] === 0 && Math.max(a[1], b[1]) <= 50 && Math.min(a[1], b[1]) >= -50))
})

test('wall start host previews a connected next segment while the cursor is free', () => {
  const preview = buildWallJunctionPreview(
    projectWithWall(),
    { kind: 'free', point_mm: [0, 1000], description: 'free' },
    [1000, 0],
    [1000, 1000],
    100,
    'wall-a',
  )

  assert.ok(preview)
  assert.equal(preview.point_mm[0], 1000)
  assert.equal(preview.point_mm[1], 0)
})

test('a free cursor still previews a chain connected to a committed wall endpoint', () => {
  const preview = buildWallJunctionPreview(
    projectWithWall(),
    { kind: 'free', point_mm: [1000, 1000], description: 'free' },
    [1000, 0],
    [1000, 1000],
    100,
  )
  assert.ok(preview)
  assert.deepEqual(preview.target_marks, ['W1'])
})

test('wall snap does not preview across a hosted opening or an unrelated free point', () => {
  const opening = {
    id: 'door-a', object_type: 'door_window.door', status: 'active',
    module_data: { wall_id: 'wall-a', offset_along_wall_mm: 1000, width_mm: 900 },
  }
  const project = projectWithWall({ 'door-a': opening })
  assert.equal(buildWallJunctionPreview(
    project,
    { kind: 'wall_midpoint', target_id: 'wall-a', point_mm: [0, 0], description: 'wall midpoint' },
    [0, 0], [0, 1000], 100,
  ), null)
  assert.equal(buildWallJunctionPreview(
    projectWithWall(),
    { kind: 'free', point_mm: [0, 0], description: 'free' },
    [0, 0], [0, 1000], 100,
  ), null)
})

test('wall snap previews a clear junction on a wall that has a distant opening', () => {
  const opening = {
    id: 'window-a', object_type: 'door_window.window', status: 'active',
    module_data: { wall_id: 'wall-a', offset_along_wall_mm: 1650, width_mm: 500 },
  }
  const preview = buildWallJunctionPreview(
    projectWithWall({ 'window-a': opening }),
    { kind: 'wall_midpoint', target_id: 'wall-a', point_mm: [0, 0], description: 'wall midpoint' },
    [0, 0], [0, 1000], 100,
  )

  assert.equal(preview?.target_count, 1)
  assert.deepEqual(preview?.target_marks, ['W1'])
})

test('wall snap rejects a junction that reaches a hosted opening jamb', () => {
  const opening = {
    id: 'door-a', object_type: 'door_window.door', status: 'active',
    module_data: { wall_id: 'wall-a', offset_along_wall_mm: 1200, width_mm: 600 },
  }
  assert.equal(buildWallJunctionPreview(
    projectWithWall({ 'door-a': opening }),
    { kind: 'wall_midpoint', target_id: 'wall-a', point_mm: [200, 0], description: 'wall midpoint' },
    [200, 0], [200, 1000], 100,
  ), null)
})
