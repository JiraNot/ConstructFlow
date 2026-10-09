import test from 'node:test'
import assert from 'node:assert/strict'
import { clippedGridSegments, polygonInteriorPoint, wallMasonryHatchSegments } from '../dist/index.js'

const containsStrictly = (point, ring) => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}

test('polygonInteriorPoint returns the centroid for convex polygons and an interior point for concave rooms', () => {
  assert.deepEqual(polygonInteriorPoint([[0, 0], [4000, 0], [4000, 3000], [0, 3000]]), [2000, 1500])
  const concave = [[0, 0], [4000, 0], [4000, 1000], [1000, 1000], [1000, 4000], [0, 4000]]
  const vertexAverage = [concave.reduce((sum, point) => sum + point[0], 0) / concave.length, concave.reduce((sum, point) => sum + point[1], 0) / concave.length]
  assert.equal(containsStrictly(vertexAverage, concave), false)
  const point = polygonInteriorPoint(concave)
  assert.ok(point)
  assert.equal(containsStrictly(point, concave), true)
})

test('polygonInteriorPoint rejects degenerate and non-finite rings', () => {
  assert.equal(polygonInteriorPoint([[0, 0], [1, 1]]), undefined)
  assert.equal(polygonInteriorPoint([[0, 0], [1, 0], [Number.NaN, 1]]), undefined)
})

test('clippedGridSegments follows tile spacing and clips lines around floor voids', () => {
  const boundary = [[0, 0], [2400, 0], [2400, 2400], [0, 2400]]
  const hole = [[600, 600], [1800, 600], [1800, 1800], [600, 1800]]
  const segments = clippedGridSegments(boundary, 600, 600, [hole])
  assert.ok(segments.length > 0)
  for (const [a, b] of segments) {
    const midpoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    assert.equal(containsStrictly(midpoint, hole), false, 'finish lines must not cross a void')
    assert.ok(Math.abs(a[0] - b[0]) < 1e-7 || Math.abs(a[1] - b[1]) < 1e-7)
    assert.ok(containsStrictly(midpoint, boundary))
  }
  assert.ok(segments.some(([a, b]) => Math.abs(a[0] - b[0]) < 1e-7 && a[0] === 1200 && b[1] - a[1] > 0))
})

test('clippedGridSegments rotates around its model-space origin and rejects invalid spacing', () => {
  const boundary = [[0, 0], [2000, 0], [2000, 1000], [0, 1000]]
  const segments = clippedGridSegments(boundary, 500, 500, [], [1000, 500], 30)
  assert.ok(segments.length > 0)
  assert.ok(segments.some(([a, b]) => Math.abs(a[0] - b[0]) > 1 && Math.abs(a[1] - b[1]) > 1))
  assert.deepEqual(clippedGridSegments(boundary, 0, 500), [])
})

test('wallMasonryHatchSegments uses the plan direction and a wall-start-anchored pitch', () => {
  const segments = wallMasonryHatchSegments([0, 0], [1000, 0], 100, [], 100)
  assert.ok(segments.length > 0)
  assert.ok(segments.some(([a, b]) => Math.abs(a[0]) < 1e-7 && Math.abs(a[1]) < 1e-7 && Math.abs(b[0] - 50) < 1e-7 && Math.abs(b[1] - 50) < 1e-7),
    'the first east-going hatch should slope up to the right in plan')
  assert.ok(segments.every(([a, b]) => Math.abs(Math.abs(a[0] - b[0]) - Math.abs(a[1] - b[1])) < 1e-7),
    'each diagonal hatch should be 45 degrees in wall-local coordinates')
})

test('wallMasonryHatchSegments keeps hatch pitch aligned and cuts it at overlapping openings', () => {
  const withOpening = wallMasonryHatchSegments([0, 0], [1200, 0], 100, [[400, 550], [500, 650]], 100)
  const openingSegments = withOpening.filter(([a, b]) => {
    const midpointX = (a[0] + b[0]) / 2
    return midpointX > 400 + 1e-7 && midpointX < 650 - 1e-7
  })
  assert.equal(openingSegments.length, 0, 'hatch must not cross the merged hosted opening span')
  assert.ok(withOpening.some(([a, b]) => Math.max(a[0], b[0]) <= 400 + 1e-7), 'solid wall before the opening retains hatch')
  assert.ok(withOpening.some(([a, b]) => Math.min(a[0], b[0]) >= 650 - 1e-7), 'solid wall after the opening retains hatch')
  for (const [a, b] of withOpening) {
    assert.ok(Math.abs((a[0] - a[1]) / 100 - Math.round((a[0] - a[1]) / 100)) < 1e-7)
    assert.ok(Math.abs((b[0] - b[1]) / 100 - Math.round((b[0] - b[1]) / 100)) < 1e-7,
      'all clipped segments preserve the full-wall pitch instead of restarting at each opening')
  }
  assert.deepEqual(wallMasonryHatchSegments([0, 0], [0, 0], 100), [])
  assert.deepEqual(wallMasonryHatchSegments([0, 0], [1000, 0], 0), [])
})
