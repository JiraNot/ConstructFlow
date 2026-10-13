import test from 'node:test'
import assert from 'node:assert/strict'
import { resolvePlanCanvasPickCandidates } from '../src/components/resolvePlanCanvasPickCandidates.mjs'

test('overlapping objects rank openings and structural edges ahead of room and surface faces', () => {
  const project = { objects: Object.fromEntries([
    ['room', 'architecture.room'],
    ['slab', 'architecture.floor'],
    ['wall', 'architecture.wall'],
    ['beam', 'structure.beam'],
    ['column', 'structure.column'],
    ['window', 'door_window.window'],
    ['door', 'door_window.door'],
  ].map(([id, object_type]) => [id, { id, object_type }])) }
  const hitOrder = ['room', 'slab', 'wall', 'beam', 'column', 'window', 'door']
  const visited = []
  const findHitObject = (_point, preferWall, excluded) => {
    visited.push({ preferWall, excluded: new Set(excluded) })
    return hitOrder.find(id => !excluded.has(id)) ?? null
  }

  assert.deepEqual(resolvePlanCanvasPickCandidates(project, findHitObject, [40, 20], true), [
    'door', 'window', 'column', 'wall', 'beam', 'slab', 'room',
  ])
  assert.equal(visited.length, hitOrder.length)
  assert.ok(visited.every(call => call.preferWall === true))
  assert.equal(visited.at(-1).excluded.size, hitOrder.length - 1)
})

test('objects without a specialized rank stay selectable after known families', () => {
  const project = { objects: {
    annotation: { id: 'annotation', object_type: 'documentation.annotation' },
    room: { id: 'room', object_type: 'architecture.room' },
    grid: { id: 'grid', object_type: 'structure.grid' },
  } }
  const order = ['room', 'annotation', 'grid']
  assert.deepEqual(resolvePlanCanvasPickCandidates(project, (_point, _preferWall, excluded) => order.find(id => !excluded.has(id)) ?? null, [0, 0]), [
    'grid', 'annotation', 'room',
  ])
})
