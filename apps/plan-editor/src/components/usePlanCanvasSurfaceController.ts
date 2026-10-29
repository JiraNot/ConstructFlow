import type { Dispatch, RefObject, SetStateAction, ComponentProps } from 'react'
import type { PlanCanvasProps } from './PlanCanvas.types.js'
import type { usePlanCanvasViewport } from './usePlanCanvasViewport.js'
import type { usePlanCanvasPlacementSession } from './usePlanCanvasPlacementSession.js'
import type { usePlanCanvasPointerState } from './usePlanCanvasPointerState.js'
import type { usePlanCanvasPicking } from './usePlanCanvasPicking.js'
import type { usePlanCanvasToolController } from './usePlanCanvasToolController.js'
import type { usePlanCanvasPlacementController } from './usePlanCanvasPlacementController.js'
import type { usePlanCanvasPointerController } from './usePlanCanvasPointerController.js'
import { PlanCanvasSurface } from './PlanCanvasSurface.js'
import { buildPlanCanvasContextMenu } from './buildPlanCanvasContextMenu.js'
import { usePlanCanvasSurfaceOverlays } from './usePlanCanvasSurfaceOverlays.js'

interface UsePlanCanvasSurfaceControllerOptions {
  props: PlanCanvasProps
  planProject: PlanCanvasProps['project']
  containerRef: RefObject<HTMLDivElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  editableSelectionIds: string[]
  placement: ReturnType<typeof usePlanCanvasPlacementSession>
  pointer: ReturnType<typeof usePlanCanvasPointerState>
  picking: ReturnType<typeof usePlanCanvasPicking>
  status: ReturnType<typeof usePlanCanvasToolController>
  viewport: ReturnType<typeof usePlanCanvasViewport>
  placementController: ReturnType<typeof usePlanCanvasPlacementController>
  pointerController: ReturnType<typeof usePlanCanvasPointerController>
  authoringControlsOpen: boolean
  setAuthoringControlsOpen: Dispatch<SetStateAction<boolean>>
}

/** Combines editor controllers into the presentation model consumed by PlanCanvasSurface. */
export function usePlanCanvasSurfaceController({
  props, planProject, containerRef, canvasRef, editableSelectionIds,
  placement, pointer, picking, status, viewport, placementController, pointerController,
  authoringControlsOpen, setAuthoringControlsOpen,
}: UsePlanCanvasSurfaceControllerOptions): ComponentProps<typeof PlanCanvasSurface> {
  const containerSize = {
    width: containerRef.current?.clientWidth ?? 800,
    height: containerRef.current?.clientHeight ?? 600,
  }

  const contextMenu = buildPlanCanvasContextMenu({
    project: planProject,
    menu: pointer.objectContextMenu,
    setGridCopySourceId: placement.setGridCopySourceId,
    onSelectionChange: props.onSelectionChange,
    onSelectObject: props.onSelectObject,
    onActivateTool: props.onActivateTool,
    onCopyObjects: props.onCopyObjects,
    onRequestEditProperties: props.onRequestEditProperties,
    onDeleteObjects: props.onDeleteObjects,
    closeMenu: () => pointer.setObjectContextMenu(null),
  })

  const overlays = usePlanCanvasSurfaceOverlays({
    props, planProject, editableSelectionIds, status, picking, placement,
    placementDimensions: placementController.placementDimensions,
    manipulation: pointerController.manipulation,
    pointer,
    keyboard: placementController.placementKeyboard,
    displayUnit: props.displayUnit,
    dimensionReferenceMode: props.preferences.dimensionReferenceMode,
    containerSize, canvasRef, authoringControlsOpen, setAuthoringControlsOpen,
    toggleDimensionReferenceMode: placementController.toggleDimensionReferenceMode,
    onCommitPlacement: () => {
      if (!pointerController.pointerInteractions.commitLinePlacementAtSnap()) placementController.commitActivePlacement(true)
    },
    onFinishPolygon: () => { placementController.commitActivePlacement(); canvasRef.current?.focus({ preventScroll: true }) },
  })

  return {
    containerRef,
    canvasRef,
    activeTool: props.activeTool,
    cursor: pointer.isPanning ? 'grabbing' : props.activeTool === 'pan' ? 'grab' : props.activeTool === 'select' ? 'default' : 'crosshair',
    canvasEvents: {
      onPointerMove: pointerController.pointerInteractions.handlePointerMove,
      onPointerDown: pointerController.pointerInteractions.handlePointerDown,
      onDoubleClick: placementController.handleCanvasDoubleClick,
      onContextMenu: event => event.preventDefault(),
      onPointerUp: pointerController.pointerInteractions.handlePointerUp,
      onWheel: viewport.handleWheel,
      onKeyDown: placementController.placementKeyboard.handleCanvasDimensionKeyDown,
      onPointerCancel: pointer.handlePointerCancel,
    },
    contextMenu,
    containerSize,
    overlays,
    dimensions: {
      project: props.project, planProject, viewport: viewport.viewport, displayUnit: props.displayUnit, lengthPrecision: props.preferences.lengthPrecision,
      activeTool: props.activeTool, points: placement.dimensionPoints, pointer: placement.activeSnap?.point_mm ?? null,
      snapModes: props.preferences.objectSnapEnabled ? props.preferences.snapModes : [], onCommit: props.onCommitManipulation, onPreview: props.onPreviewManipulation,
      onRejected: props.onManipulationRejected, onClearObjectSelection: () => { props.onSelectionChange?.([], null); props.onSelectObject(null) },
    },
    photoPins: props.photoSessions ? {
      viewport: viewport.viewport,
      activeLevelId: props.project.project.active_level_id,
      sessions: props.photoSessions,
      onSelectSession: props.onOpenPhotoSession ?? (() => {}),
    } : undefined,
    commentPins: (props.project.comments?.length ?? 0) > 0 && props.onOpenProjectComment ? {
      viewport: viewport.viewport,
      activeLevelId: props.project.project.active_level_id,
      comments: props.project.comments ?? [],
      onOpen: props.onOpenProjectComment,
    } : undefined,
    viewport: viewport.viewport,
    setViewport: viewport.setViewport,
    fitView: viewport.fitView,
  }
}
