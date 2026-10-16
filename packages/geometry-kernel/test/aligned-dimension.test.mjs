import test from 'node:test'
import assert from 'node:assert/strict'
import { alignedDimensionGeometry, alignedDimensionOffset } from '../dist/index.js'

test('aligned dimensions calculate diagonal lengths and signed perpendicular offsets', () => {
  const shape = alignedDimensionGeometry([0, 0], [3000, 4000], 500)
  assert.equal(shape.length_mm, 5000)
  assert.deepEqual(shape.start_mm, [-400, 300])
  assert.deepEqual(shape.end_mm, [2600, 4300])
  assert.equal(alignedDimensionOffset([0, 0], [3000, 4000], shape.start_mm), 500)
  assert.equal(alignedDimensionOffset([0, 0], [3000, 4000], [400, -300]), -500)
  assert.equal(alignedDimensionGeometry([0, 0], [0, 0], 200), null)
})
