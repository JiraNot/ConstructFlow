import type { DoorHanding, PlacementReference } from '@constructflow/project-model'
import type { SnapMode } from '@constructflow/snapping-engine'
import type { PlanCanvasDisplaySettings, PlanLabelVisibility } from '../rendering/planRendererTypes.js'

export type LineConstraintMode = 'auto' | 'none' | 'parallel' | 'perpendicular'
export type LineDrawingMode = 'orthogonal' | 'angled'
export type DimensionReferenceMode = 'center' | 'edge'
export type WallAngleSnapDegrees = 0 | 15 | 30 | 45 | 90

export interface PlanCanvasPreferences extends PlanCanvasDisplaySettings {
  labelVisibility: PlanLabelVisibility
  placementReference: PlacementReference
  lineConstraintMode: LineConstraintMode
  lineDrawingMode: LineDrawingMode
  wallAngleSnapDeg: WallAngleSnapDegrees
  dimensionReferenceMode: DimensionReferenceMode
  doorHanding: DoorHanding
  objectSnapEnabled: boolean
  realtimeDimensions: boolean
  lengthPrecision: number
  elevationPrecision: number
  anglePrecision: number
  snapModes: SnapMode[]
}

export const DEFAULT_PLAN_CANVAS_PREFERENCES: Readonly<PlanCanvasPreferences>
export function loadPlanCanvasPreferences(storage?: Storage): PlanCanvasPreferences
export function savePlanCanvasPreferences(preferences: PlanCanvasPreferences, storage?: Storage): void
export function updatePlanCanvasPreference<K extends keyof PlanCanvasPreferences>(
  preferences: PlanCanvasPreferences,
  key: K,
  value: PlanCanvasPreferences[K] | ((current: PlanCanvasPreferences[K]) => PlanCanvasPreferences[K]),
): PlanCanvasPreferences
