import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyPlanCanvasPlacementDimensions,
  constrainPlanCanvasGridCopyToParallelOffset,
  constrainPlanCanvasLineSnap,
  resolvePlanCanvasNumericInputTarget,
  resolvePlanCanvasReferencePath,
} from '../src/components/planCanvasPlacementConstraints.mjs'

const metricDimensions = (overrides = {}) => ({
  dimensionInputX: '',
  dimensionInputY: '',
  dimensionAnchorX: null,
  dimensionAnchorY: null,
  displayUnit: 'm',
  ...overrides,
})

test('placement dimensions parse units and preserve the pointer-selected side of each anchor', () => {
  const result = applyPlanCanvasPlacementDimensions(
    [1200, 900], { refX: 1000, refY: 1000 }, [900, 1100],
    metricDimensions({ dimensionInputX: '2.5m', dimensionInputY: '750mm' }),
  )
  assert.deepEqual(result, [ -1500, 1750 ])
})

test('placement dimensions ignore invalid and negative values without disturbing the other axis', () => {
  const result = applyPlanCanvasPlacementDimensions(
    [1200, 900], { refX: 1000, refY: 1000 }, [1200, 900],
    metricDimensions({ dimensionInputX: '-1m', dimensionInputY: 'bad' }),
  )
  assert.deepEqual(result, [1200, 900])
})

test('numeric placement input targets segment length while drawing and X/Y offsets otherwise', () => {
  assert.equal(resolvePlanCanvasNumericInputTarget({ hasLineGeometryInput: true, showXDimension: false, showYDimension: false }), 'length')
  assert.equal(resolvePlanCanvasNumericInputTarget({ hasLineGeometryInput: true, showXDimension: true, showYDimension: true }), 'length')
  assert.equal(resolvePlanCanvasNumericInputTarget({ hasLineGeometryInput: false, showXDimension: true, showYDimension: false }), 'axis')
  assert.equal(resolvePlanCanvasNumericInputTarget({ hasLineGeometryInput: false, showXDimension: false, showYDimension: false }), null)
})

test('Shift grid copy preserves its source direction and uses only perpendicular spacing', () => {
  const endpoints = () => [[100, 200], [500, 400]]
  const result = constrainPlanCanvasGridCopyToParallelOffset([350, 800], {}, endpoints)
  const [start, end] = endpoints()
  const original = [end[0] - start[0], end[1] - start[1]]
  const copied = [end[0] + result[0] - start[0], end[1] + result[1] - start[1]]
  assert.ok(Math.abs(original[0] * (result[0] - start[0]) + original[1] * (result[1] - start[1])) < 1)
  assert.deepEqual(copied.map((value, index) => value - result[index]), original)
})

test('wall reference offset follows the selected face and keeps the centerline unchanged', () => {
  assert.deepEqual(resolvePlanCanvasReferencePath([0, 0], [1000, 0], 200, 'centerline'), [[0, 0], [1000, 0]])
  assert.deepEqual(resolvePlanCanvasReferencePath([0, 0], [1000, 0], 200, 'left_face'), [[0, -100], [1000, -100]])
  assert.deepEqual(resolvePlanCanvasReferencePath([0, 0], [1000, 0], 200, 'right_face'), [[0, 100], [1000, 100]])
})

test('line constraints apply numeric length, angle and orthogonal lock from one origin', () => {
  const snap = { point_mm: [400, 300], kind: 'endpoint', target_id: 'grid-1', description: 'Grid' }
  const base = { lineConstraintMode: 'none', viewportZoom: 0.08, drawLength: '5m', drawAngle: '', displayUnit: 'm' }
  const fixedLength = constrainPlanCanvasLineSnap(snap, snap.point_mm, [100, 100], false, undefined, base)
  assert.ok(Math.abs(Math.hypot(fixedLength.point_mm[0] - 100, fixedLength.point_mm[1] - 100) - 5000) < 1)
  assert.equal(fixedLength.target_id, undefined)

  const fixedAngle = constrainPlanCanvasLineSnap(snap, snap.point_mm, [100, 100], false, undefined, { ...base, drawAngle: '90' })
  assert.deepEqual(fixedAngle.point_mm, [100, -4900])

  const orthogonal = constrainPlanCanvasLineSnap(snap, snap.point_mm, [100, 100], true, undefined, { ...base, drawLength: '', drawAngle: '' })
  assert.deepEqual(orthogonal.point_mm, [400, 100])
})

test('automatic line constraint retains the canonical reference identity', () => {
  const snap = { point_mm: [500, 12], kind: 'free', description: 'Free' }
  const reference = { target_id: 'wall-uuid', description: 'wall', start_mm: [0, 0], end_mm: [1000, 0], distance_mm: 0 }
  const result = constrainPlanCanvasLineSnap(snap, [500, 12], [0, 0], false, reference, {
    lineConstraintMode: 'auto', viewportZoom: 0.08, drawLength: '', drawAngle: '', displayUnit: 'm',
  })
  assert.deepEqual(result.point_mm, [500, 0])
  assert.equal(result.kind, 'parallel')
  assert.equal(result.target_id, 'wall-uuid')
})
