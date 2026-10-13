import { DEFAULT_SNAP_MODES } from '@constructflow/snapping-engine'

export const DEFAULT_PLAN_CANVAS_PREFERENCES = Object.freeze({
  placementReference: 'centerline',
  lineConstraintMode: 'auto',
  dimensionReferenceMode: 'center',
  doorHanding: 'left_in',
  snapModes: [...DEFAULT_SNAP_MODES],
})

export function updatePlanCanvasPreference(preferences, key, value) {
  const nextValue = typeof value === 'function' ? value(preferences[key]) : value
  return { ...preferences, [key]: nextValue }
}
