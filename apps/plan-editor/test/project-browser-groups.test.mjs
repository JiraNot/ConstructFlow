import test from 'node:test'
import assert from 'node:assert/strict'
import { groupProjectBrowserObjects } from '../src/components/groupProjectBrowserObjects.mjs'

test('Project Browser groups preserve family order and object identity', () => {
  const objects = [
    { id: 'wall-1', object_type: 'architecture.wall' },
    { id: 'beam-1', object_type: 'structure.beam' },
    { id: 'wall-2', object_type: 'architecture.wall' },
  ]
  const groups = groupProjectBrowserObjects(objects)

  assert.deepEqual(groups.map(([family]) => family), ['architecture.wall', 'structure.beam'])
  assert.deepEqual(groups[0][1], [objects[0], objects[2]])
  assert.equal(groups[0][1][0], objects[0])
})

test('Project Browser groups a large same-family project in a single linear pass', () => {
  const objects = Array.from({ length: 4780 }, (_, index) => ({ id: `wall-${index}`, object_type: 'architecture.wall' }))
  const groups = groupProjectBrowserObjects(objects)

  assert.equal(groups.length, 1)
  assert.equal(groups[0][1].length, objects.length)
  assert.equal(groups[0][1][4779], objects[4779])
})
