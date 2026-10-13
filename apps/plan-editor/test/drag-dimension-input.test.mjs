import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveDragDimensionTarget, resolveLineEndpointLengthTarget, resolveOpeningEdgeWidthTarget, resolveRectangleResizeTarget } from '../src/app/dragDimensionInput.mjs'

test('direct manipulation dimensions parse displayed units and signed deltas into model coordinates', () => {
  assert.deepEqual(resolveDragDimensionTarget([1200, 800], '1.25', '-0.5', 'm'), {
    delta_mm: [1250, -500],
    point_mm: [2450, 300],
  })
  assert.deepEqual(resolveDragDimensionTarget([0, 0], '350', '75', 'mm'), {
    delta_mm: [350, 75],
    point_mm: [350, 75],
  })
  assert.equal(resolveDragDimensionTarget([0, 0], '-', '2', 'm'), null)
})

test('rectangular grip dimensions keep the opposite corner fixed, including rotated objects', () => {
  const target = resolveRectangleResizeTarget([1000, 1000], [400, 200], 0, 2, '0.6', '0.3', 'm')
  assert.deepEqual(target, { point_mm: [1400, 1200], width_mm: 600, height_mm: 300 })
  const rotated = resolveRectangleResizeTarget([0, 0], [400, 200], 90, 2, '0.6', '0.3', 'm')
  assert.ok(Math.abs(rotated.point_mm[0] + 200) < 1e-9)
  assert.ok(Math.abs(rotated.point_mm[1] - 400) < 1e-9)
  assert.equal(resolveRectangleResizeTarget([0, 0], [400, 200], 0, 2, '0.05', '0.3', 'm'), null)
})

test('line endpoint length preserves its direction and the opposite endpoint', () => {
  assert.deepEqual(resolveLineEndpointLengthTarget([0, 0], [3000, 4000], 1, '10', 'm'), {
    point_mm: [6000, 8000], length_mm: 10000,
  })
  assert.deepEqual(resolveLineEndpointLengthTarget([0, 0], [3000, 4000], 0, '2.5', 'm'), {
    point_mm: [1500, 2000], length_mm: 2500,
  })
  assert.equal(resolveLineEndpointLengthTarget([0, 0], [0, 0], 1, '2', 'm'), null)
})

test('opening edge width keeps the opposite jamb fixed along the host wall', () => {
  assert.deepEqual(resolveOpeningEdgeWidthTarget([0, 0], [5000, 0], 2000, 1000, 0, '1.4', 'm'), {
    point_mm: [1100, 0], width_mm: 1400,
  })
  assert.deepEqual(resolveOpeningEdgeWidthTarget([0, 0], [0, 5000], 2000, 1000, 1, '1.4', 'm'), {
    point_mm: [0, 2900], width_mm: 1400,
  })
  assert.equal(resolveOpeningEdgeWidthTarget([0, 0], [2000, 0], 300, 600, 0, '1.4', 'm'), null)
})
