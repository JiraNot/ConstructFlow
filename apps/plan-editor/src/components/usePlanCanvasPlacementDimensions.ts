import type { DisplayLengthUnit, ProjectDocument } from '@constructflow/project-model'
import { formatLengthMm, isGridObject } from '@constructflow/project-model'
import type { SnapResult, WallHostSnapResult } from '@constructflow/snapping-engine'
import type { ViewportState } from '../viewport/viewportTransform.js'
import { worldToScreen } from '../viewport/viewportTransform.js'
import type { ToolType } from './Toolbar.js'
import type { PlanCanvasPreferences } from '../app/planCanvasPreferences.mjs'
import { usesPlacementDimensions } from '../app/toolInteractionRegistry.mjs'
import { gridLineEndpoints } from './PlanCanvasGeometry.js'
import { findTemporaryDimensionRefs, openingDimensionPoint, openingDimensionRefs } from './PlanCanvasTemporaryDimensions.js'

interface UsePlanCanvasPlacementDimensionsOptions {
  project: ProjectDocument
  planProject: ProjectDocument
  activeTool: ToolType
  activeDoorTypeMark: string
  activeWindowTypeMark: string
  activeSnap: SnapResult | null
  activeWallSnap: WallHostSnapResult | null
  gridCopySourceId: string | null
  dimensionReferenceMode: PlanCanvasPreferences['dimensionReferenceMode']
  dimensionAnchorX: number | null
  dimensionAnchorY: number | null
  dimensionInputX: string
  dimensionInputY: string
  displayUnit: DisplayLengthUnit
  viewport: ViewportState
  stairStartPoint: [number, number] | null
  wallStartNode: { point_mm: [number, number] } | null
  beamStartNode: { point_mm: [number, number] } | null
  roomSeparatorStart: [number, number] | null
  slabBoundary: [number, number][]
  gridStartPoint: [number, number] | null
}

export function usePlanCanvasPlacementDimensions({
  project, planProject, activeTool, activeDoorTypeMark, activeWindowTypeMark, activeSnap, activeWallSnap,
  gridCopySourceId, dimensionReferenceMode, dimensionAnchorX, dimensionAnchorY, dimensionInputX,
  dimensionInputY, displayUnit, viewport, stairStartPoint, wallStartNode, beamStartNode,
  roomSeparatorStart, slabBoundary, gridStartPoint,
}: UsePlanCanvasPlacementDimensionsOptions) {
  const dimensionHostAxis: 'x' | 'y' | null = activeWallSnap
    ? Math.abs(activeWallSnap.wall_end_mm[0] - activeWallSnap.wall_start_mm[0]) >= Math.abs(activeWallSnap.wall_end_mm[1] - activeWallSnap.wall_start_mm[1]) ? 'x' : 'y'
    : null
  const isHostedOpeningPlacement = (activeTool === 'door' || activeTool === 'window') && !!activeWallSnap
  const copyDimensionSource = activeTool === 'gridCopy' && gridCopySourceId ? planProject.objects[gridCopySourceId] : null
  const copyDimensionStart = copyDimensionSource && isGridObject(copyDimensionSource) ? gridLineEndpoints(copyDimensionSource)[0] : null
  const dimensionReferences = activeSnap
    ? copyDimensionStart
      ? { refX: copyDimensionStart[0], refY: copyDimensionStart[1] }
      : activeWallSnap
        ? openingDimensionRefs(activeSnap.point_mm, planProject, activeWallSnap, dimensionReferenceMode)
        : findTemporaryDimensionRefs(activeSnap.point_mm, planProject, undefined, dimensionReferenceMode)
    : { refX: undefined, refY: undefined }
  const showXDimension = !!activeSnap && (dimensionHostAxis ? dimensionHostAxis === 'x' : dimensionReferences.refX !== undefined)
  const showYDimension = !!activeSnap && (dimensionHostAxis ? dimensionHostAxis === 'y' : dimensionReferences.refY !== undefined)
  const xDimensionAnchor = dimensionAnchorX ?? dimensionReferences.refX
  const yDimensionAnchor = dimensionAnchorY ?? dimensionReferences.refY
  const activeOpeningWidth = activeWallSnap
    ? Number(project.types.find(type => type.object_type === (activeTool === 'door' ? 'door_window.door' : 'door_window.window') && type.name.toLowerCase() === (activeTool === 'door' ? activeDoorTypeMark : activeWindowTypeMark).toLowerCase())?.parameters?.width_mm ?? (activeTool === 'door' ? 800 : 1200))
    : 0
  const dimensionPoint = activeSnap && activeWallSnap
    ? openingDimensionPoint(activeWallSnap, dimensionReferences as { refX?: number; refY?: number; axis: 'x' | 'y' }, activeOpeningWidth)
    : activeSnap?.point_mm
  const xDimensionDisplay = dimensionInputX || (dimensionPoint && xDimensionAnchor !== undefined ? formatLengthMm(Math.abs(dimensionPoint[0] - xDimensionAnchor), displayUnit) : '')
  const yDimensionDisplay = dimensionInputY || (dimensionPoint && yDimensionAnchor !== undefined ? formatLengthMm(Math.abs(dimensionPoint[1] - yDimensionAnchor), displayUnit) : '')
  const dimensionOverlayPosition = activeSnap ? worldToScreen(activeSnap.point_mm, viewport) : null
  const supportsPlacementDimensions = usesPlacementDimensions(activeTool)
  const hasPolygonSegment = ['slab', 'slabVoid', 'archFloor', 'ceiling', 'roof'].includes(activeTool) && slabBoundary.length > 0
  const hasLineGeometryInput = !!stairStartPoint || !!wallStartNode || !!beamStartNode || !!roomSeparatorStart || hasPolygonSegment || (activeTool === 'grid' && !!gridStartPoint)

  return {
    dimensionHostAxis,
    isHostedOpeningPlacement,
    dimensionReferences,
    showXDimension,
    showYDimension,
    xDimensionAnchor,
    yDimensionAnchor,
    xDimensionDisplay,
    yDimensionDisplay,
    dimensionOverlayPosition,
    supportsPlacementDimensions,
    hasLineGeometryInput,
  }
}
