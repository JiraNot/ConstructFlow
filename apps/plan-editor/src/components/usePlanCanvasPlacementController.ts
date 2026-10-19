import { useCallback } from 'react'
import type { RefObject } from 'react'
import type { SnapResult, LinearReference } from '@constructflow/snapping-engine'
import type { ViewportState } from '../viewport/viewportTransform.js'
import { updatePlanCanvasPreference } from '../app/planCanvasPreferences.mjs'
import { applyPlanCanvasPlacementDimensions, constrainPlanCanvasGridCopyToParallelOffset, constrainPlanCanvasLineSnap, resolvePlanCanvasReferencePath } from './planCanvasPlacementConstraints.mjs'
import type { usePlanCanvasPlacementSession } from './usePlanCanvasPlacementSession.js'
import { usePlanCanvasOpeningPlacementDimensions } from './usePlanCanvasOpeningPlacementDimensions.js'
import { usePlanCanvasLineConstraint } from './usePlanCanvasLineConstraint.js'
import { usePlanCanvasPlacementDimensions } from './usePlanCanvasPlacementDimensions.js'
import { createPlanCanvasPlacementCommitHandlers } from './createPlanCanvasPlacementCommitHandlers.js'
import { usePlanCanvasPlacementKeyboard } from './usePlanCanvasPlacementKeyboard.js'
import { gridLineEndpoints } from './PlanCanvasGeometry.js'
import type { PlanCanvasProps } from './PlanCanvas.types.js'

interface UsePlanCanvasPlacementControllerOptions {
  props: PlanCanvasProps
  planProject: PlanCanvasProps['project']
  viewport: ViewportState
  canvasRef: RefObject<HTMLCanvasElement | null>
  placement: ReturnType<typeof usePlanCanvasPlacementSession>
  cancelCurrentPlacement: () => void
}

/** Coordinates placement state, geometry constraints, commit and keyboard behavior for one canvas session. */
export function usePlanCanvasPlacementController({
  props, planProject, viewport, canvasRef, placement, cancelCurrentPlacement,
}: UsePlanCanvasPlacementControllerOptions) {
  const {
    project, displayUnit, activeTool, activeDoorTypeMark, activeWindowTypeMark,
    selectedId, onPreferencesChange, onCommitSlab, onCommitArchitecturalFloor, onCommitCeiling,
    onCommitRoof, onCommitSurfaceVoid,
  } = props
  const { placementReference, lineConstraintMode, dimensionReferenceMode } = props.preferences
  const {
    dimensionInputX, setDimensionInputX, dimensionInputY, setDimensionInputY,
    dimensionAnchorX, setDimensionAnchorX, dimensionAnchorY, setDimensionAnchorY,
    dimensionKeyboardAxis, setDimensionKeyboardAxis, dimensionInputXRef, dimensionInputYRef,
    drawLengthMeters, setDrawLengthMeters, drawLengthInputRef, drawAngleDegrees, clearDimensionOverrides,
  } = placement

  const setPreference = <K extends keyof typeof props.preferences>(
    key: K,
    value: (typeof props.preferences)[K] | ((current: (typeof props.preferences)[K]) => (typeof props.preferences)[K]),
  ) => onPreferencesChange(current => updatePlanCanvasPreference(current, key, value))

  const applyPlacementDimensions = useCallback((point: [number, number], refs: { refX?: number; refY?: number }, rawPoint: [number, number] = point): [number, number] =>
    applyPlanCanvasPlacementDimensions(point, refs, rawPoint, {
      dimensionInputX, dimensionInputY, dimensionAnchorX, dimensionAnchorY, displayUnit,
    }), [dimensionInputX, dimensionInputY, dimensionAnchorX, dimensionAnchorY, displayUnit])

  const { applyOpeningDistance } = usePlanCanvasOpeningPlacementDimensions({
    project, planProject, activeTool, activeDoorTypeMark, activeWindowTypeMark,
    activeSnap: placement.activeSnap, setActiveSnap: placement.setActiveSnap,
    activeWallSnap: placement.activeWallSnap, setActiveWallSnap: placement.setActiveWallSnap,
    dimensionReferenceMode, dimensionInputX, dimensionInputY, dimensionAnchorX, dimensionAnchorY,
    displayUnit, applyPlacementDimensions,
  })

  const constrainGridCopyToParallelOffset = useCallback((point: [number, number], source: Parameters<typeof gridLineEndpoints>[0]): [number, number] =>
    constrainPlanCanvasGridCopyToParallelOffset(point, source, gridLineEndpoints), [])

  const toggleDimensionReferenceMode = useCallback(() => {
    setPreference('dimensionReferenceMode', mode => mode === 'center' ? 'edge' : 'center')
    setDimensionAnchorX(null)
    setDimensionAnchorY(null)
  }, [onPreferencesChange, setDimensionAnchorX, setDimensionAnchorY])

  const resolveReferencePath = useCallback((start: [number, number], end: [number, number], widthMm: number): [[number, number], [number, number]] =>
    resolvePlanCanvasReferencePath(start, end, widthMm, placementReference), [placementReference])

  const constrainLineSnap = useCallback((snap: SnapResult, pointerPoint: [number, number], start: [number, number], lockAxis: boolean, reference?: LinearReference): SnapResult =>
    constrainPlanCanvasLineSnap(snap, pointerPoint, start, lockAxis, reference, {
      lineConstraintMode, viewportZoom: viewport.zoom, drawLength: drawLengthMeters,
      drawAngle: drawAngleDegrees, displayUnit,
    }), [drawLengthMeters, drawAngleDegrees, lineConstraintMode, viewport.zoom, displayUnit])

  usePlanCanvasLineConstraint({ activeTool, placement, constrainLineSnap })

  const placementDimensions = usePlanCanvasPlacementDimensions({
    project, planProject, activeTool, activeDoorTypeMark, activeWindowTypeMark,
    activeSnap: placement.activeSnap, activeWallSnap: placement.activeWallSnap,
    gridCopySourceId: placement.gridCopySourceId, dimensionReferenceMode,
    dimensionAnchorX, dimensionAnchorY, dimensionInputX, dimensionInputY,
    displayUnit, viewport, stairStartPoint: placement.stairStartPoint,
    wallStartNode: placement.wallStartNode, beamStartNode: placement.beamStartNode,
    roomSeparatorStart: placement.roomSeparatorStart, slabBoundary: placement.slabBoundary,
    gridStartPoint: placement.gridStartPoint,
  })

  const { commitActivePlacement, handleCanvasDoubleClick } = createPlanCanvasPlacementCommitHandlers({
    canvasRef, activeSnap: placement.activeSnap, activeTool,
    supportsPlacementDimensions: placementDimensions.supportsPlacementDimensions, viewport,
    selectedId, project: planProject, slabBoundary: placement.slabBoundary,
    setSlabBoundary: placement.setSlabBoundary,
    roofShape: placement.roofShape, roofSlopeDeg: placement.roofSlopeDeg,
    roofThicknessMm: placement.roofThicknessMm, roofElevationOffsetMm: placement.roofElevationOffsetMm,
    roofMaterial: placement.roofMaterial, clearDimensionOverrides,
    onCommitSlab, onCommitArchitecturalFloor, onCommitCeiling, onCommitRoof, onCommitSurfaceVoid,
  })

  const placementKeyboard = usePlanCanvasPlacementKeyboard({
    activeTool,
    supportsPlacementDimensions: placementDimensions.supportsPlacementDimensions,
    dimensionHostAxis: placementDimensions.dimensionHostAxis,
    dimensionKeyboardAxis, dimensionAnchorX, dimensionAnchorY,
    dimensionReferences: placementDimensions.dimensionReferences,
    dimensionInputX, dimensionInputY, drawLengthMeters, hasLineGeometryInput: placementDimensions.hasLineGeometryInput,
    setDrawLengthMeters,
    showXDimension: placementDimensions.showXDimension,
    showYDimension: placementDimensions.showYDimension,
    dimensionInputXRef, dimensionInputYRef, drawLengthInputRef, canvasRef,
    setDimensionKeyboardAxis, setDimensionAnchorX, setDimensionAnchorY,
    setDimensionInputX, setDimensionInputY, commitActivePlacement, cancelCurrentPlacement,
    toggleDimensionReferenceMode,
  })

  return {
    placement,
    applyPlacementDimensions,
    applyOpeningDistance,
    constrainGridCopyToParallelOffset,
    toggleDimensionReferenceMode,
    resolveReferencePath,
    constrainLineSnap,
    placementDimensions,
    placementKeyboard,
    commitActivePlacement,
    handleCanvasDoubleClick,
  }
}
