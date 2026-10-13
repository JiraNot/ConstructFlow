import type { DisplayLengthUnit, PlacementReference } from '@constructflow/project-model'
import type { LinearReference, SnapResult } from '@constructflow/snapping-engine'

type Point = [number, number]
type DimensionRefs = { refX?: number; refY?: number }

export function applyPlanCanvasPlacementDimensions(
  point: Point,
  refs: DimensionRefs,
  rawPoint: Point,
  options: { dimensionInputX: string; dimensionInputY: string; dimensionAnchorX: number | null; dimensionAnchorY: number | null; displayUnit: DisplayLengthUnit },
): Point

export function constrainPlanCanvasGridCopyToParallelOffset(
  point: Point,
  source: Parameters<typeof import('./PlanCanvasGeometry.js').gridLineEndpoints>[0],
  gridLineEndpoints: typeof import('./PlanCanvasGeometry.js').gridLineEndpoints,
): Point

export function resolvePlanCanvasReferencePath(start: Point, end: Point, widthMm: number, placementReference: PlacementReference): [Point, Point]

export function constrainPlanCanvasLineSnap(
  snap: SnapResult,
  pointerPoint: Point,
  start: Point,
  lockAxis: boolean,
  reference: LinearReference | undefined,
  options: { lineConstraintMode: 'auto' | 'none' | 'parallel' | 'perpendicular'; viewportZoom: number; drawLength: string; drawAngle: string; displayUnit: DisplayLengthUnit },
): SnapResult
