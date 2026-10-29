import { DEFAULT_SNAP_MODES } from '@constructflow/snapping-engine'

export const DEFAULT_PLAN_CANVAS_PREFERENCES = Object.freeze({
  placementReference: 'centerline',
  lineConstraintMode: 'auto',
  lineDrawingMode: 'orthogonal',
  wallAngleSnapDeg: 45,
  dimensionReferenceMode: 'center',
  doorHanding: 'left_in',
  objectSnapEnabled: true,
  realtimeDimensions: true,
  lengthPrecision: 3,
  elevationPrecision: 3,
  anglePrecision: 0,
  snapModes: [...DEFAULT_SNAP_MODES],
  backgroundVisible: true,
  rulersEnabled: true,
  gridEnabled: true,
  gridSpacingMm: 250,
  majorGridEvery: 4,
  labelVisibility: { structure: true, beams: true, walls: true, openings: true, grids: true },
})

const STORAGE_KEY = 'constructflow.plan-canvas-preferences.v1'

export function loadPlanCanvasPreferences(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null')
    if (!saved || typeof saved !== 'object') return { ...DEFAULT_PLAN_CANVAS_PREFERENCES, snapModes: [...DEFAULT_SNAP_MODES] }
    const precision = (value, fallback) => {
      const parsed = Number(value)
      return Number.isInteger(parsed) ? Math.max(0, Math.min(4, parsed)) : fallback
    }
    const savedWallAngleSnapDeg = Number(saved.wallAngleSnapDeg)
    const lineDrawingMode = saved.lineDrawingMode === 'angled' ? 'angled' : 'orthogonal'
    const validSnapModes = new Set(DEFAULT_SNAP_MODES)
    const majorGridEvery = Number(saved.majorGridEvery)
    const gridSpacingMm = Number(saved.gridSpacingMm)
    const isPreviousDefaultGrid = gridSpacingMm === 1000 && majorGridEvery === 5
    const labels = saved.labelVisibility && typeof saved.labelVisibility === 'object' ? saved.labelVisibility : {}
    return {
      ...DEFAULT_PLAN_CANVAS_PREFERENCES,
      ...saved,
      lineDrawingMode,
      wallAngleSnapDeg: [0, 15, 30, 45, 90].includes(savedWallAngleSnapDeg) ? savedWallAngleSnapDeg : DEFAULT_PLAN_CANVAS_PREFERENCES.wallAngleSnapDeg,
      objectSnapEnabled: saved.objectSnapEnabled !== false,
      realtimeDimensions: saved.realtimeDimensions !== false,
      lengthPrecision: precision(saved.lengthPrecision, 3),
      elevationPrecision: precision(saved.elevationPrecision, 3),
      anglePrecision: precision(saved.anglePrecision, 0),
      snapModes: Array.isArray(saved.snapModes) ? [...new Set(saved.snapModes.filter(mode => validSnapModes.has(mode)))] : [...DEFAULT_SNAP_MODES],
      backgroundVisible: saved.backgroundVisible !== false,
      rulersEnabled: saved.rulersEnabled !== false,
      gridEnabled: saved.gridEnabled !== false,
      gridSpacingMm: isPreviousDefaultGrid ? 250 : Number.isFinite(gridSpacingMm) ? Math.max(50, Math.min(100000, gridSpacingMm)) : 250,
      majorGridEvery: isPreviousDefaultGrid ? 4 : Number.isInteger(majorGridEvery) ? Math.max(2, Math.min(20, majorGridEvery)) : 4,
      labelVisibility: {
        structure: labels.structure !== false,
        beams: labels.beams !== false,
        walls: labels.walls !== false,
        openings: labels.openings !== false,
        grids: labels.grids !== false,
      },
    }
  } catch {
    return { ...DEFAULT_PLAN_CANVAS_PREFERENCES, snapModes: [...DEFAULT_SNAP_MODES] }
  }
}

export function savePlanCanvasPreferences(preferences, storage = globalThis.localStorage) {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(preferences)) } catch { /* workspace may disable local storage */ }
}

export function updatePlanCanvasPreference(preferences, key, value) {
  const nextValue = typeof value === 'function' ? value(preferences[key]) : value
  return { ...preferences, [key]: nextValue }
}
