import type { RefObject } from 'react'
import type { ProjectDocument } from '@constructflow/project-model'
import type { ViewportState } from '../viewport/viewportTransform.js'
import type { PlanCanvasProps } from './PlanCanvas.types.js'
import type { usePlanCanvasPointerState } from './usePlanCanvasPointerState.js'
import type { usePlanCanvasPicking } from './usePlanCanvasPicking.js'
import type { usePlanCanvasDragDimensions } from './usePlanCanvasDragDimensions.js'
import type { usePlanCanvasSnapping } from './usePlanCanvasSnapping.js'
import type { usePlanCanvasPlacementController } from './usePlanCanvasPlacementController.js'
import { findPlanCanvasEditHandle } from './PlanCanvasEditHandles.js'
import { matchesPlanSelectionScope } from './planSelectionScope.js'
import { usePlanCanvasManipulationInteractions } from './usePlanCanvasManipulationInteractions.js'
import { usePlanCanvasPointerInteractions } from './usePlanCanvasPointerInteractions.js'

interface UsePlanCanvasPointerControllerOptions {
  props: PlanCanvasProps
  planProject: ProjectDocument
  viewport: ViewportState
  setViewport: (viewport: ViewportState | ((current: ViewportState) => ViewportState)) => void
  containerRef: RefObject<HTMLDivElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  selectedId: string | null
  selectedIds: string[]
  editableSelectionIds: string[]
  pointerState: ReturnType<typeof usePlanCanvasPointerState>
  picking: ReturnType<typeof usePlanCanvasPicking>
  dragDimensions: ReturnType<typeof usePlanCanvasDragDimensions>
  placement: ReturnType<typeof import('./usePlanCanvasPlacementSession.js').usePlanCanvasPlacementSession>
  placementController: ReturnType<typeof usePlanCanvasPlacementController>
  snapPlanPoint: ReturnType<typeof usePlanCanvasSnapping>['snapPlanPoint']
  snapPlanWallHost: ReturnType<typeof usePlanCanvasSnapping>['snapPlanWallHost']
}

/** Connects hit testing, manipulation previews and canvas pointer gestures. */
export function usePlanCanvasPointerController({
  props, planProject, viewport, setViewport, containerRef, canvasRef, selectedId,
  selectedIds, editableSelectionIds, pointerState, picking, dragDimensions, placement,
  placementController, snapPlanPoint, snapPlanWallHost,
}: UsePlanCanvasPointerControllerOptions) {
  const {
    project, activeTool, supplierBundlePlacement, displayUnit, activeBeamTypeMark, activeWallTypeMark,
    activeDoorTypeMark, activeWindowTypeMark, preferences,
    onCopyGrid, onCommitColumn, onCommitFoundation, onCommitDoor, onCommitWindow,
    onCommitFixture, onSelectionChange, onSelectObject, onCommitBeam, onCommitWall, onCommitWallPath,
    onCommitRoomSeparator, onCommitPipeRoute, onCommitCabinet, onCommitFurniture, onCommitFamilyFurniture, onCommitMoulding,
    onCommitSlab, onCommitSupplierBundle, onCommitArchitecturalFloor, onCommitCeiling, onCommitRoof,
    onCommitSurfaceVoid, onCommitGrid, onCommitGridSystem, onStartCalibrationModal,
    onCommitStair, onActivateTool, onDeleteObjects, onPreviewManipulation,
    onCommitManipulation, onManipulationRejected, onCursorChange,
  } = props
  const {
    draggingObject, dimensionEdit, dragPreviewPoint, manipulationPreview,
    setDraggingObject, setDimensionEdit, setDragPreviewPoint, setManipulationPreview,
  } = pointerState

  const findEditHandle = (screenPoint: [number, number]) => {
    const handle = findPlanCanvasEditHandle({
      planProject, editableSelectionIds, viewport, screenPoint, onFlipDoorHanding: props.onFlipDoorHanding,
    })
    return handle && matchesPlanSelectionScope(planProject.objects[handle.id], props.selectionScope) ? handle : null
  }

  const manipulation = usePlanCanvasManipulationInteractions({
    containerRef, canvasRef, planProject, viewport, displayUnit, precision: preferences.lengthPrecision, dragDimensions,
    draggingObject, dimensionEdit, dragPreviewPoint, manipulationPreview,
    setDraggingObject, setDimensionEdit, setDragPreviewPoint, setManipulationPreview, snapPlanPoint,
    onPreviewManipulation, onCommitManipulation, onManipulationRejected,
  })

  const pointerInteractions = usePlanCanvasPointerInteractions({
    canvasRef,
    activeTool, activeFamilyId: props.activeFamilyId, viewport, setViewport, project, planProject, supplierBundlePlacement, selectedId, selectedIds, displayUnit,
    realtimeDimensions: preferences.realtimeDimensions,
    selectionScope: props.selectionScope,
    activeBeamTypeMark, activeWallTypeMark, activeDoorTypeMark, activeWindowTypeMark,
    placementReference: preferences.placementReference, doorHanding: preferences.doorHanding,
    lineDrawingMode: preferences.lineDrawingMode, wallAngleSnapDeg: preferences.wallAngleSnapDeg,
    draggingObject, gridCopySourceId: placement.gridCopySourceId, hoveredId: picking.hoveredId,
    pointerState, placement, picking, dragDimensions,
    manipulation: {
      previewDragAt: manipulation.previewDragAt,
      lastPreviewValidationRef: manipulation.lastPreviewValidationRef,
      buildDragCommands: manipulation.buildDragCommands,
      cancelPendingPreview: manipulation.cancelPendingPreview,
    },
    resizeDimensionWidth: dragDimensions.setWidth,
    resizeDimensionHeight: dragDimensions.setHeight,
    resizeDimensionLength: dragDimensions.setLength,
    dimensionReferenceMode: preferences.dimensionReferenceMode,
    snapPlanPoint,
    resolveLineSnap: placementController.constrainLineSnap,
    applyPlacementDimensions: placementController.applyPlacementDimensions,
    constrainGridCopyToParallelOffset: placementController.constrainGridCopyToParallelOffset,
    snapPlanWallHost,
    applyOpeningDistance: placementController.applyOpeningDistance,
    resolveReferencePath: placementController.resolveReferencePath,
    findEditHandle,
    callbacks: {
      onCopyGrid, onCommitColumn, onCommitFoundation, onCommitDoor, onCommitWindow,
      onCommitFixture, onSelectionChange, onSelectObject, onCommitBeam, onCommitWall, onCommitWallPath,
      onCommitRoomSeparator, onCommitPipeRoute, onCommitCabinet,
      onCommitFurniture: onCommitFurniture ? (start, end) => onCommitFurniture(start, end, placement.furnitureKind) : undefined,
      onCommitFamilyFurniture,
      onCommitMoulding,
      onCommitSlab, onCommitSupplierBundle, onCommitArchitecturalFloor, onCommitCeiling, onCommitRoof,
      onCommitSurfaceVoid, onCommitGrid, onCommitGridSystem, onStartCalibrationModal,
      onCommitStair, onActivateTool, onDeleteObjects, onPreviewManipulation,
      onCommitManipulation, onManipulationRejected, onCursorChange,
    },
  })

  return { findEditHandle, manipulation, pointerInteractions }
}
