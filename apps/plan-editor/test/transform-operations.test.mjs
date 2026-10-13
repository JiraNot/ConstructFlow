import test from 'node:test'
import assert from 'node:assert/strict'
import { computeAlignmentDelta, computeOffsetDelta, joinLineSegments, reflectPlanPoint, splitLineAtRatio, trimLineAtIntersection } from '../src/app/transformOperations.mjs'

test('alignment deltas align object bounds to the selected anchor edge or center', () => {
  const anchor = [100, 200, 500, 800]
  const object = [-50, 0, 150, 300]
  assert.deepEqual(computeAlignmentDelta(anchor, object, 'left'), [150, 0])
  assert.deepEqual(computeAlignmentDelta(anchor, object, 'center-x'), [250, 0])
  assert.deepEqual(computeAlignmentDelta(anchor, object, 'right'), [350, 0])
  assert.deepEqual(computeAlignmentDelta(anchor, object, 'top'), [0, 500])
  assert.deepEqual(computeAlignmentDelta(anchor, object, 'middle-y'), [0, 350])
  assert.deepEqual(computeAlignmentDelta(anchor, object, 'bottom'), [0, 200])
})

test('alignment rejects missing bounds and unknown operations without moving objects', () => {
  assert.equal(computeAlignmentDelta(null, [0, 0, 1, 1], 'left'), null)
  assert.equal(computeAlignmentDelta([0, 0, 1, 1], [0, 0, 1, 1], 'stretch'), null)
})

test('offset produces a signed normal translation and rejects degenerate segments', () => {
  assert.deepEqual(computeOffsetDelta([0, 0], [4000, 0], 250, 'left'), [0, 250])
  assert.deepEqual(computeOffsetDelta([0, 0], [0, 4000], 250, 'right'), [250, 0])
  assert.deepEqual(computeOffsetDelta([0, 0], [4000, 0], -250, 'left'), [0, -250])
  assert.equal(computeOffsetDelta([0, 0], [0, 0], 250), null)
})

test('mirror reflection uses a vertical or horizontal axis and rejects invalid coordinates', () => {
  assert.deepEqual(reflectPlanPoint([1200, -350], 'vertical', 200), [-800, -350])
  assert.deepEqual(reflectPlanPoint([1200, -350], 'horizontal', 100), [1200, 550])
  assert.deepEqual(reflectPlanPoint([200, 100], 'vertical', 200), [200, 100])
  assert.equal(reflectPlanPoint([0, 0], 'diagonal', 0), null)
  assert.equal(reflectPlanPoint([0, 0], 'vertical', Number.NaN), null)
})

test('split interpolation creates two connected spans at a stable ratio', () => {
  assert.deepEqual(splitLineAtRatio([0, 0], [5000, 3000], 0.4), {
    start: [0, 0], split: [2000, 1200], end: [5000, 3000],
  })
  assert.deepEqual(splitLineAtRatio([10, 20], [10, 1020], 0.5), {
    start: [10, 20], split: [10, 520], end: [10, 1020],
  })
})

test('split rejects endpoint ratios, non-finite data, and spans that collapse after rounding', () => {
  assert.equal(splitLineAtRatio([0, 0], [1000, 0], 0), null)
  assert.equal(splitLineAtRatio([0, 0], [1000, 0], 1), null)
  assert.equal(splitLineAtRatio([0, 0], [1000, 0], Number.NaN), null)
  assert.equal(splitLineAtRatio([0, 0], [1, 0], 0.5), null)
})

test('trim extends the kept target to a finite cutter intersection and preserves its other endpoint', () => {
  assert.deepEqual(trimLineAtIntersection([0, 0], [4000, 0], [2000, -1000], [2000, 1000], 'start'), {
    start: [2000, 0], end: [4000, 0], intersection: [2000, 0],
  })
  assert.deepEqual(trimLineAtIntersection([0, 0], [4000, 0], [2000, -1000], [2000, 1000], 'end'), {
    start: [0, 0], end: [2000, 0], intersection: [2000, 0],
  })
  assert.equal(trimLineAtIntersection([0, 0], [4000, 0], [4000, 0], [4000, 2000]), null)
})

test('trim rejects parallel segments and intersections outside either segment', () => {
  assert.equal(trimLineAtIntersection([0, 0], [4000, 0], [0, 500], [4000, 500]), null)
  assert.equal(trimLineAtIntersection([0, 0], [4000, 0], [5000, -1000], [5000, 1000]), null)
  assert.equal(trimLineAtIntersection([0, 0], [4000, 0], [500, 100], [500, 1000]), null)
  assert.equal(trimLineAtIntersection([0, 0], [4000, 0], [2000, -1000], [2000, 1000], 'middle'), null)
})

test('join merges collinear segments that meet in any endpoint orientation', () => {
  assert.deepEqual(joinLineSegments([0, 0], [5000, 0], [5000, 0], [9000, 0]), { start: [0, 0], end: [9000, 0] })
  assert.deepEqual(joinLineSegments([0, 0], [5000, 0], [9000, 0], [5000, 0]), { start: [0, 0], end: [9000, 0] })
  assert.deepEqual(joinLineSegments([5000, 0], [0, 0], [9000, 0], [5000, 0]), { start: [0, 0], end: [9000, 0] })
  assert.deepEqual(joinLineSegments([5000, 0], [0, 0], [5000, 0], [9000, 0]), { start: [0, 0], end: [9000, 0] })
})

test('join rejects gaps, angled lines, overlaps, and invalid endpoints', () => {
  assert.equal(joinLineSegments([0, 0], [5000, 0], [5002, 0], [9000, 0]), null)
  assert.equal(joinLineSegments([0, 0], [5000, 0], [5000, 0], [9000, 1000]), null)
  assert.equal(joinLineSegments([0, 0], [5000, 0], [4000, 0], [9000, 0]), null)
  assert.equal(joinLineSegments([0, 0], [0, 0], [0, 0], [1000, 0]), null)
})
