import type { DoorHanding, PlacementReference } from '@constructflow/project-model'
import type { SnapMode } from '@constructflow/snapping-engine'

export type LineConstraintMode = 'auto' | 'none' | 'parallel' | 'perpendicular'
export type DimensionReferenceMode = 'center' | 'edge'

export interface PlanCanvasPreferences {
  placementReference: PlacementReference
  lineConstraintMode: LineConstraintMode
  dimensionReferenceMode: DimensionReferenceMode
  doorHanding: DoorHanding
  snapModes: SnapMode[]
}

export const DEFAULT_PLAN_CANVAS_PREFERENCES: Readonly<PlanCanvasPreferences>
export function updatePlanCanvasPreference<K extends keyof PlanCanvasPreferences>(
  preferences: PlanCanvasPreferences,
  key: K,
  value: PlanCanvasPreferences[K] | ((current: PlanCanvasPreferences[K]) => PlanCanvasPreferences[K]),
): PlanCanvasPreferences
