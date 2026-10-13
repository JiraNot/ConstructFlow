import test from 'node:test'
import assert from 'node:assert/strict'
import { resolvePlanCanvasBoxSelection } from '../src/components/resolvePlanCanvasBoxSelection.mjs'

const candidates = [
  { id: 'inside', bounds: [10, 10, 20, 20] },
  { id: 'edge', bounds: [20, 12, 30, 18] },
  { id: 'outside', bounds: [31, 10, 40, 20] },
  { id: 'unbounded', bounds: null },
]

test('marquee selection includes intersecting object bounds and excludes objects outside the box', () => {
  assert.deepEqual(resolvePlanCanvasBoxSelection([0, 0, 20, 25], candidates), ['inside', 'edge'])
})

test('additive marquee selection keeps existing IDs once and appends intersecting objects', () => {
  assert.deepEqual(resolvePlanCanvasBoxSelection([0, 0, 20, 25], candidates, ['edge', 'existing'], true), ['edge', 'existing', 'inside'])
})

test('non-additive marquee selection replaces the previous selection, including with an empty result', () => {
  assert.deepEqual(resolvePlanCanvasBoxSelection([100, 100, 120, 120], candidates, ['existing'], false), [])
})
