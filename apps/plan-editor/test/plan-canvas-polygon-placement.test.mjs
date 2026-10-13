import test from 'node:test'
import assert from 'node:assert/strict'
import { commitPlanCanvasPolygonPoint } from '../src/components/commitPlanCanvasPolygonPoint.mjs'

const boundary = [[0, 0], [1000, 0], [1000, 1000]]

function createOptions(overrides = {}) {
  const calls = { committed: [], boundary: [], dimensions: [] }
  const options = {
    activeTool: 'slab',
    clickCount: 1,
    pointMm: [0, 1000],
    zoom: 0.1,
    boundary,
    selectedId: null,
    selectedObjectType: undefined,
    roofOptions: { shape: 'gable', slope_deg: 30, thickness_mm: 150, elevation_offset_mm: 0, material: 'tile' },
    onCommitSlab: points => calls.committed.push(['slab', points]),
    onCommitArchitecturalFloor: points => calls.committed.push(['floor', points]),
    onCommitCeiling: points => calls.committed.push(['ceiling', points]),
    onCommitRoof: (points, options) => calls.committed.push(['roof', points, options]),
    onCommitSurfaceVoid: (hostId, points) => calls.committed.push(['void', hostId, points]),
    onBoundaryChange: points => calls.boundary.push(points),
    onDrawLengthChange: value => calls.dimensions.push(['length', value]),
    onDrawAngleChange: value => calls.dimensions.push(['angle', value]),
    clearDimensionOverrides: () => calls.dimensions.push(['clear']),
    ...overrides,
  }
  return { options, calls }
}

test('polygon click appends a point and clears stale numeric overrides', () => {
  const { options, calls } = createOptions()
  assert.equal(commitPlanCanvasPolygonPoint(options), 'point-added')
  assert.deepEqual(calls.boundary, [[...boundary, [0, 1000]]])
  assert.deepEqual(calls.dimensions, [['length', ''], ['angle', ''], ['clear']])
})

test('double click commits the current slab boundary and resets the placement session', () => {
  const { options, calls } = createOptions({ clickCount: 2, pointMm: [4000, 4000] })
  assert.equal(commitPlanCanvasPolygonPoint(options), 'committed')
  assert.deepEqual(calls.committed, [['slab', boundary]])
  assert.deepEqual(calls.boundary, [[]])
  assert.deepEqual(calls.dimensions, [['length', ''], ['angle', ''], ['clear']])
})

test('clicking near the first vertex closes a polygon without a double click', () => {
  const { options, calls } = createOptions({ clickCount: 1, pointMm: [100, 80] })
  assert.equal(commitPlanCanvasPolygonPoint(options), 'committed')
  assert.equal(calls.committed[0][0], 'slab')
})

test('double click with fewer than three boundary points does not append or commit', () => {
  const { options, calls } = createOptions({ clickCount: 2, boundary: boundary.slice(0, 2) })
  assert.equal(commitPlanCanvasPolygonPoint(options), 'ignored')
  assert.deepEqual(calls.committed, [])
  assert.deepEqual(calls.boundary, [])
})

test('surface void placement requires a selected surface host and forwards the host identity', () => {
  const { options, calls } = createOptions({ activeTool: 'slabVoid', clickCount: 2, selectedId: 'surface-7', selectedObjectType: 'structure.slab' })
  assert.equal(commitPlanCanvasPolygonPoint(options), 'committed')
  assert.deepEqual(calls.committed, [['void', 'surface-7', boundary]])
})
