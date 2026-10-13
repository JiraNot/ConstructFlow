import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_PLAN_CANVAS_PREFERENCES, updatePlanCanvasPreference } from '../src/app/planCanvasPreferences.mjs'

test('canvas preferences update immutably and retain unrelated placement settings', () => {
  const initial = DEFAULT_PLAN_CANVAS_PREFERENCES
  const withEdgePlacement = updatePlanCanvasPreference(initial, 'placementReference', 'left_face')
  const withConstraint = updatePlanCanvasPreference(withEdgePlacement, 'lineConstraintMode', 'perpendicular')
  const withSnap = updatePlanCanvasPreference(withConstraint, 'snapModes', modes => modes.filter(mode => mode !== 'grid'))

  assert.equal(initial.placementReference, 'centerline')
  assert.equal(withSnap.placementReference, 'left_face')
  assert.equal(withSnap.lineConstraintMode, 'perpendicular')
  assert.equal(withSnap.snapModes.includes('grid'), false)
  assert.equal(withSnap.doorHanding, 'left_in')
  assert.notEqual(withSnap, initial)
})
