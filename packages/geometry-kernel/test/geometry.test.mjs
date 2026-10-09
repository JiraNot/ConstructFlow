import test from 'node:test'
import assert from 'node:assert/strict'
import { clippedGridSegments, clippedStaggeredPlankSegments, polygonDiagonalHatchSegments, polygonInteriorPoint, polygonSectionIntervals, validatePolygonWithVoids, wallMasonryHatchSegments } from '../dist/index.js'

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

test('surface polygon validation accepts concave boundaries and rejects invalid or overlapping voids', () => {
  const concave = [[0, 0], [4000, 0], [4000, 1000], [1000, 1000], [1000, 4000], [0, 4000]]
  assert.deepEqual(validatePolygonWithVoids(concave, [[[100, 100], [400, 100], [400, 400], [100, 400]]]), { valid: true })
  assert.match(validatePolygonWithVoids([[0, 0], [4000, 3000], [4000, 0], [0, 3000]]).reason, /simple/)
  assert.match(validatePolygonWithVoids([[0, 0], [4000, 0], [4000, 3000], [0, 3000]], [[[3500, 1000], [4500, 1000], [4500, 2000], [3500, 2000]]]).reason, /strictly inside/)
  assert.match(validatePolygonWithVoids([[0, 0], [4000, 0], [4000, 3000], [0, 3000]], [[[0, 1000], [500, 1000], [500, 2000], [0, 2000]]]).reason, /strictly inside/)
  assert.match(validatePolygonWithVoids([[0, 0], [4000, 0], [4000, 3000], [0, 3000]], [[[500, 500], [2000, 500], [2000, 2000], [500, 2000]], [[1500, 1000], [3000, 1000], [3000, 2500], [1500, 2500]]]).reason, /overlaps/)
  assert.match(validatePolygonWithVoids([[0, 0], [4000, 0], [4000, 3000], [0, 3000]], [[[500, 500], [1500, 500], [Number.NaN, 1200]]]).reason, /finite/)
})

test('polygon section intervals preserve concave spans and subtract openings for either cut axis', () => {
  const concave = [[0, 0], [4000, 0], [4000, 1000], [1000, 1000], [1000, 4000], [0, 4000]]
  const voids = [[[200, 500], [400, 500], [400, 800], [200, 800]]]
  assert.deepEqual(polygonSectionIntervals(concave, voids, 1, 700), [[0, 200], [400, 4000]])
  assert.deepEqual(polygonSectionIntervals(concave, [], 1, 2000), [[0, 1000]], 'a concave arm yields only the material span at the cut')
  assert.deepEqual(polygonSectionIntervals(concave, [], 0, 2000), [[0, 1000]], 'the opposite section axis resolves independently')
  assert.deepEqual(polygonSectionIntervals(concave, [], 1000, 2000), [])
  assert.deepEqual(polygonSectionIntervals(concave, [], 0, Number.NaN), [])
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

test('staggered plank patterns alternate butt joints and clip courses and joints around floor voids', () => {
  const boundary = [[0, 0], [4000, 0], [4000, 2000], [0, 2000]]
  const hole = [[1000, 500], [1500, 500], [1500, 900], [1000, 900]]
  const segments = clippedStaggeredPlankSegments(boundary, 1200, 200, [hole])
  const atCourse = segments
    .filter(([a, b]) => Math.abs(a[1] - 800) < 1e-7 && Math.abs(b[1] - 800) < 1e-7)
    .map(([a, b]) => [Math.min(a[0], b[0]), Math.max(a[0], b[0])])
    .sort((a, b) => a[0] - b[0])
  assert.deepEqual(atCourse, [[0, 1000], [1500, 4000]], 'long seams leave an exact gap at the opening')

  const jointAt1200 = segments
    .filter(([a, b]) => Math.abs(a[0] - 1200) < 1e-7 && Math.abs(b[0] - 1200) < 1e-7)
    .map(([a, b]) => [Math.min(a[1], b[1]), Math.max(a[1], b[1])])
  assert.ok(jointAt1200.some(([from, to]) => Math.abs(from - 400) < 1e-7 && Math.abs(to - 500) < 1e-7),
    'a butt joint is cut at the opening boundary and does not continue through the void')
  assert.ok(segments.some(([a, b]) => Math.abs(a[0] - b[0]) > 100 && Math.abs(a[1] - b[1]) < 1e-7),
    'the first rotated plank course contains a longitudinal seam')
  assert.deepEqual(clippedStaggeredPlankSegments(boundary, 0, 200), [])

  const rotated = clippedStaggeredPlankSegments(boundary, 1200, 200, [], [0, 0], 90)
  assert.ok(rotated.some(([a, b]) => Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) > 1500),
    'rotating the finish pattern rotates the plank direction in model space')
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

test('polygonDiagonalHatchSegments clips demolition hatch to concave surfaces and voids', () => {
  const boundary = [[0, 0], [1200, 0], [1200, 500], [500, 500], [500, 1200], [0, 1200]]
  const voids = [[[150, 150], [350, 150], [350, 350], [150, 350]]]
  const segments = polygonDiagonalHatchSegments(boundary, 100, voids)
  assert.ok(segments.length > 0)
  const hatchLength = (lines) => lines.reduce((sum, [a, b]) => sum + Math.hypot(b[0] - a[0], b[1] - a[1]), 0)
  assert.ok(hatchLength(segments) < hatchLength(polygonDiagonalHatchSegments(boundary, 100)), 'a void removes hatch length')
  for (const [start, end] of segments) {
    assert.ok(Math.abs((end[1] - start[1]) / (end[0] - start[0]) - 1) < 1e-7, 'hatch lines retain a 45-degree direction')
    for (const t of [0.25, 0.5, 0.75]) {
      const point = [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t]
      assert.equal(containsStrictly(point, voids[0]), false, 'hatch strokes do not cross a surface void')
    }
  }
  assert.deepEqual(polygonDiagonalHatchSegments([[0, 0], [1, 0]], 100), [])
})
