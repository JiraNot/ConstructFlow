import type { ProjectDocument } from '@constructflow/project-model'
import type { SnapResult, WallHostSnapResult } from '@constructflow/snapping-engine'
import type { ToolType } from './Toolbar.js'
import type { PlanCanvasPreferences } from '../app/planCanvasPreferences.mjs'
import { resolvePlanCanvasLineSnap } from '../app/placementLineSnap.mjs'
import { usesPlacementDimensions } from '../app/toolInteractionRegistry.mjs'
import { gridLineEndpoints } from './PlanCanvasGeometry.js'
import { findTemporaryDimensionRefs } from './PlanCanvasTemporaryDimensions.js'
import { isGridObject } from '@constructflow/project-model'

type Point = [number, number]
type LineSnapState = Parameters<typeof resolvePlanCanvasLineSnap>[4]

interface ResolvePlanCanvasPointerSnapOptions {
  activeTool: ToolType
  rawWorld: Point
  ctrlKey: boolean
  shiftKey: boolean
  project: ProjectDocument
  planProject: ProjectDocument
  activeDoorTypeMark: string
  activeWindowTypeMark: string
  draggingObjectId?: string
  gridCopySourceId: string | null
  dimensionReferenceMode: PlanCanvasPreferences['dimensionReferenceMode']
  lineState: LineSnapState
  snapPlanPoint: (point: Point, distancePx?: number, excludedObjectId?: string) => SnapResult
  snapPlanWallHost: (point: Point, openingWidthMm: number) => WallHostSnapResult | null
  applyOpeningDistance: (wallSnap: WallHostSnapResult, rawPoint: Point, openingWidthMm: number) => WallHostSnapResult
  resolveLineSnap: Parameters<typeof resolvePlanCanvasLineSnap>[5]
  applyPlacementDimensions: (point: Point, refs: { refX?: number; refY?: number }, rawPoint?: Point) => Point
  constrainGridCopyToParallelOffset: (point: Point, source: Parameters<typeof gridLineEndpoints>[0]) => Point
}

export function resolvePlanCanvasPointerSnap({
  activeTool, rawWorld, ctrlKey, shiftKey, project, planProject, activeDoorTypeMark, activeWindowTypeMark,
  draggingObjectId, gridCopySourceId, dimensionReferenceMode, lineState, snapPlanPoint, snapPlanWallHost,
  applyOpeningDistance, resolveLineSnap, applyPlacementDimensions, constrainGridCopyToParallelOffset,
}: ResolvePlanCanvasPointerSnapOptions): { snap: SnapResult; wallSnap: WallHostSnapResult | null } {
  if (activeTool === 'door' || activeTool === 'window') {
    const typeMark = activeTool === 'door' ? activeDoorTypeMark : activeWindowTypeMark
    const objectType = activeTool === 'door' ? 'door_window.door' : 'door_window.window'
    const type = project.types?.find(candidate => candidate.object_type === objectType && candidate.name.toLowerCase() === typeMark.toLowerCase())
    const openingWidthMm = Number(type?.parameters?.width_mm ?? (activeTool === 'door' ? 800 : 1200))
    const hostCandidate = snapPlanWallHost(rawWorld, openingWidthMm)
    const wallSnap = hostCandidate ? applyOpeningDistance(hostCandidate, rawWorld, openingWidthMm) : null
    if (wallSnap) {
      return {
        wallSnap,
        snap: { point_mm: wallSnap.point_mm, kind: 'free', description: wallSnap.description },
      }
    }
    return {
      wallSnap: null,
      snap: ctrlKey
        ? { point_mm: rawWorld, kind: 'free', description: 'Free / อิสระ (Ctrl)' }
        : snapPlanPoint(rawWorld),
    }
  }

  let snap: SnapResult = ctrlKey
    ? { point_mm: rawWorld, kind: 'free', description: 'Free / อิสระ (Ctrl)' }
    : snapPlanPoint(rawWorld, 16, draggingObjectId)
  snap = resolvePlanCanvasLineSnap(snap, rawWorld, shiftKey, activeTool, lineState, resolveLineSnap)

  const copySource = activeTool === 'gridCopy' && gridCopySourceId ? planProject.objects[gridCopySourceId] : undefined
  const point = activeTool === 'gridCopy' && copySource && isGridObject(copySource)
    ? (() => {
        const [start] = gridLineEndpoints(copySource)
        const positioned = applyPlacementDimensions(snap.point_mm, { refX: start[0], refY: start[1] }, rawWorld)
        return shiftKey ? constrainGridCopyToParallelOffset(positioned, copySource) : positioned
      })()
    : usesPlacementDimensions(activeTool)
      ? applyPlacementDimensions(snap.point_mm, findTemporaryDimensionRefs(snap.point_mm, planProject, undefined, dimensionReferenceMode), rawWorld)
      : snap.point_mm

  if (point[0] !== snap.point_mm[0] || point[1] !== snap.point_mm[1]) {
    snap = { ...snap, point_mm: point, kind: 'free', target_id: undefined, description: `${snap.description} · ระยะกำหนดเอง` }
  }
  return { snap, wallSnap: null }
}
