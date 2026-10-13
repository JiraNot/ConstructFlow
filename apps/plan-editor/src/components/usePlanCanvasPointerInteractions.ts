import type { RefObject } from 'react'
import type { DisplayLengthUnit, ProjectDocument } from '@constructflow/project-model'
import type { SnapResult, WallHostSnapResult } from '@constructflow/snapping-engine'
import type { ViewportState } from '../viewport/viewportTransform.js'
import type { PlanCanvasProps } from './PlanCanvas.js'
import { usePlanCanvasPointerHandlers } from './usePlanCanvasPointerHandlers.js'
import type { usePlanCanvasPlacementSession } from './usePlanCanvasPlacementSession.js'
import type { usePlanCanvasPointerState } from './usePlanCanvasPointerState.js'
import type { usePlanCanvasPicking } from './usePlanCanvasPicking.js'
import type { usePlanCanvasDragDimensions } from './usePlanCanvasDragDimensions.js'
import type { usePlanCanvasManipulationInteractions } from './usePlanCanvasManipulationInteractions.js'
import type { PlanCanvasDraggingObject } from './planCanvasInteractionTypes.js'
import type { ToolType } from './Toolbar.js'
import type { usePlanCanvasViewport } from './usePlanCanvasViewport.js'
import type { usePlanCanvasSnapping } from './usePlanCanvasSnapping.js'

type CanvasCallbacks = Pick<PlanCanvasProps,
  | 'onCopyGrid' | 'onCommitColumn' | 'onCommitFoundation' | 'onCommitDoor' | 'onCommitWindow'
  | 'onCommitFixture' | 'onSelectionChange' | 'onSelectObject' | 'onCommitBeam' | 'onCommitWall'
  | 'onCommitRoomSeparator' | 'onCommitPipeRoute' | 'onCommitCabinet' | 'onCommitMoulding'
  | 'onCommitSlab' | 'onCommitArchitecturalFloor' | 'onCommitCeiling' | 'onCommitRoof'
  | 'onCommitSurfaceVoid' | 'onCommitGrid' | 'onCommitGridSystem' | 'onStartCalibrationModal'
  | 'onCommitStair' | 'onActivateTool' | 'onDeleteObjects' | 'onPreviewManipulation'
  | 'onCommitManipulation' | 'onManipulationRejected' | 'onCursorChange'
>

interface UsePlanCanvasPointerInteractionsOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>
  activeTool: ToolType
  viewport: ViewportState
  setViewport: ReturnType<typeof usePlanCanvasViewport>['setViewport']
  project: ProjectDocument
  planProject: ProjectDocument
  selectedId: string | null
  selectedIds: string[]
  displayUnit: DisplayLengthUnit
  activeBeamTypeMark: string
  activeWallTypeMark: string
  activeDoorTypeMark: string
  activeWindowTypeMark: string
  placementReference: PlanCanvasProps['preferences']['placementReference']
  doorHanding: PlanCanvasProps['preferences']['doorHanding']
  draggingObject: PlanCanvasDraggingObject | null
  gridCopySourceId: string | null
  hoveredId: string | null
  pointerState: ReturnType<typeof usePlanCanvasPointerState>
  placement: ReturnType<typeof usePlanCanvasPlacementSession>
  picking: ReturnType<typeof usePlanCanvasPicking>
  dragDimensions: ReturnType<typeof usePlanCanvasDragDimensions>
  manipulation: Pick<ReturnType<typeof usePlanCanvasManipulationInteractions>, 'previewDragAt' | 'lastPreviewValidationRef' | 'buildDragCommands'>
  resizeDimensionWidth: (value: string) => void
  resizeDimensionHeight: (value: string) => void
  resizeDimensionLength: (value: string) => void
  resolvePointerSnap: (rawWorld: [number, number], ctrlKey: boolean, shiftKey: boolean) => { snap: SnapResult; wallSnap: WallHostSnapResult | null }
  snapPlanWallHost: ReturnType<typeof usePlanCanvasSnapping>['snapPlanWallHost']
  applyOpeningDistance: (wallSnap: WallHostSnapResult, rawPoint: [number, number], widthMm: number) => WallHostSnapResult
  resolveReferencePath: (start: [number, number], end: [number, number], widthMm: number) => [[number, number], [number, number]]
  findEditHandle: (screenPoint: [number, number]) => ReturnType<typeof import('./PlanCanvasEditHandles.js').findPlanCanvasEditHandle>
  callbacks: CanvasCallbacks
}

/** Builds the navigation, authoring, selection, and commit contexts for canvas pointer events. */
export function usePlanCanvasPointerInteractions({
  canvasRef, activeTool, viewport, setViewport, project, planProject, selectedId, selectedIds, displayUnit,
  activeBeamTypeMark, activeWallTypeMark, activeDoorTypeMark, activeWindowTypeMark,
  placementReference, doorHanding, draggingObject, gridCopySourceId, hoveredId,
  pointerState, placement, picking, dragDimensions, manipulation,
  resizeDimensionWidth, resizeDimensionHeight, resizeDimensionLength,
  resolvePointerSnap, snapPlanWallHost, applyOpeningDistance, resolveReferencePath, findEditHandle, callbacks,
}: UsePlanCanvasPointerInteractionsOptions) {
  const {
    isPanning, setIsPanning, setObjectContextMenu, setSelectionBox,
    manipulationPreview, setManipulationPreview, dragPreviewPoint, setDragPreviewPoint,
    setDraggingObject, panStartRef, selectionStartRef, pointerPositionsRef, pinchRef,
    pinchActiveRef, longPressTimerRef, longPressStartRef, eraseActiveRef, erasedIdsRef,
    selectionAdditiveRef,
  } = pointerState
  const { setHoveredId, setCandidates, findHitObject, findCandidates } = picking

  return usePlanCanvasPointerHandlers({
    canvasRef,
    pointerMove: {
      navigation: {
        pointerPositionsRef, pinchRef, longPressStartRef, longPressTimerRef, selectionStartRef,
        setSelectionBox, eraseActiveRef, erasedIdsRef, isPanning, panStartRef, viewport, setViewport, findCandidates,
      },
      authoring: {
        activeTool, viewport, draggingObject, hoveredId,
        resolveSnap: resolvePointerSnap,
        findCandidates, setActiveWallSnap: placement.setActiveWallSnap, setActiveSnap: placement.setActiveSnap,
        setTapeMeasure: placement.setTapeMeasure, setCalibrationMousePoint: placement.setCalibrationMousePoint,
        setCandidates, setHoveredId, setManipulationPreview, onCursorChange: callbacks.onCursorChange,
        previewDragAt: manipulation.previewDragAt,
      },
    },
    pointerDown: {
      activeTool,
      viewport,
      navigation: {
        pointerPositionsRef, pinchRef, pinchActiveRef, longPressStartRef, longPressTimerRef,
        selectionStartRef, panStartRef, setSelectionBox, setDraggingObject, setIsPanning,
        setObjectContextMenu, findHitObject, onSelectionChange: callbacks.onSelectionChange, onSelectObject: callbacks.onSelectObject,
      },
      snapping: { resolveSnap: resolvePointerSnap },
      selection: {
        displayUnit, planProject, project, selectedIds, hoveredId, findEditHandle, findCandidates,
        findHitObject, setCandidates, setHoveredId, setDraggingObject, setManipulationPreview,
        setResizeDimensionWidth: resizeDimensionWidth, setResizeDimensionHeight: resizeDimensionHeight,
        setResizeDimensionLength: resizeDimensionLength, selectionStartRef, selectionAdditiveRef,
        lastPreviewValidationRef: manipulation.lastPreviewValidationRef,
        onSelectionChange: callbacks.onSelectionChange, onSelectObject: callbacks.onSelectObject,
      },
      placement: {
        project, planProject, selectedId, displayUnit, viewportZoom: viewport.zoom, placement,
        settings: { activeBeamTypeMark, activeWallTypeMark, activeDoorTypeMark, activeWindowTypeMark, placementReference, doorHanding },
        callbacks: {
          onCopyGrid: callbacks.onCopyGrid, onCommitColumn: callbacks.onCommitColumn,
          onCommitFoundation: callbacks.onCommitFoundation, onCommitDoor: callbacks.onCommitDoor,
          onCommitWindow: callbacks.onCommitWindow, onCommitFixture: callbacks.onCommitFixture,
          onSelectionChange: callbacks.onSelectionChange, onSelectObject: callbacks.onSelectObject,
          onCommitBeam: callbacks.onCommitBeam, onCommitWall: callbacks.onCommitWall,
          onCommitRoomSeparator: callbacks.onCommitRoomSeparator, onCommitPipeRoute: callbacks.onCommitPipeRoute,
          onCommitCabinet: callbacks.onCommitCabinet, onCommitMoulding: callbacks.onCommitMoulding,
          onCommitSlab: callbacks.onCommitSlab, onCommitArchitecturalFloor: callbacks.onCommitArchitecturalFloor,
          onCommitCeiling: callbacks.onCommitCeiling, onCommitRoof: callbacks.onCommitRoof,
          onCommitSurfaceVoid: callbacks.onCommitSurfaceVoid, onCommitGrid: callbacks.onCommitGrid,
          onCommitGridSystem: callbacks.onCommitGridSystem, onStartCalibrationModal: callbacks.onStartCalibrationModal,
          onCommitStair: callbacks.onCommitStair, onActivateTool: callbacks.onActivateTool,
        },
        operations: { snapPlanWallHost, applyOpeningDistance, resolveReferencePath },
        interaction: { eraseActiveRef, erasedIdsRef, findCandidates },
      },
    },
    pointerUp: {
      viewport, isPanning, pointerPositionsRef, pinchRef, pinchActiveRef, longPressTimerRef,
      longPressStartRef, setIsPanning, selectionStartRef, selectionAdditiveRef, setSelectionBox,
      project: planProject, selectedIds, onSelectionChange: callbacks.onSelectionChange,
      onSelectObject: callbacks.onSelectObject, eraseActiveRef, erasedIdsRef,
      onDeleteObjects: callbacks.onDeleteObjects, draggingObject,
      manualDragPointRef: dragDimensions.manualPointRef, buildDragCommands: manipulation.buildDragCommands,
      onPreviewManipulation: callbacks.onPreviewManipulation, onCommitManipulation: callbacks.onCommitManipulation,
      onManipulationRejected: callbacks.onManipulationRejected, setDraggingObject, setDragPreviewPoint,
      setResizeDimensionWidth: resizeDimensionWidth, setResizeDimensionHeight: resizeDimensionHeight,
      setResizeDimensionLength: resizeDimensionLength,
    },
  })
}
