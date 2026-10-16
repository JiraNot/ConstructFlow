import type { SnapResult, LinearReference } from '@constructflow/snapping-engine'
import type { ToolType } from '../components/Toolbar.js'

interface PlacementLineState {
  dimensionPoints?: [number, number][]
  tapeMeasure?: { start: [number, number]; complete: boolean } | null
  beamStartNode?: { point_mm: [number, number]; reference?: LinearReference } | null
  wallStartNode?: { point_mm: [number, number]; reference?: LinearReference } | null
  stairStartPoint?: [number, number] | null
  gridStartPoint?: [number, number] | null
  roomSeparatorStart?: [number, number] | null
  slabBoundary?: [number, number][]
}

export function resolvePlanCanvasLineSnap(
  snap: SnapResult,
  pointerPoint: [number, number],
  shiftKey: boolean,
  tool: ToolType,
  state: PlacementLineState,
  constrainLineSnap: (snap: SnapResult, pointerPoint: [number, number], start: [number, number], lockAxis: boolean, reference?: LinearReference) => SnapResult,
): SnapResult
