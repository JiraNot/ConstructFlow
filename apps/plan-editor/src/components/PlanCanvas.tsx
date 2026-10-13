import React, { useRef, useState, useMemo } from 'react'
import {
  ProjectDocument,
  SmartObject,
  DoorModuleData,
  WindowModuleData,
  WallModuleData,
  StairModuleData,
} from '@constructflow/project-model'
import { polygonInteriorPoint } from '@constructflow/geometry-kernel'
import { getEditableRoofRidge } from '@constructflow/roof-engine'
import { getPlanViewProject, getPlanVisibleObjects } from '@constructflow/representation-engine'
import { TOOL_FAMILIES } from './catalogPresentation.js'
import { ToolType } from './Toolbar.js'
import type { ViewportState } from '../viewport/viewportTransform.js'
import { usePlanCanvasViewport } from './usePlanCanvasViewport.js'
import { usePlanCanvasDragDimensions } from './usePlanCanvasDragDimensions.js'
import { usePlanCanvasPlacementSession } from './usePlanCanvasPlacementSession.js'
import { usePlanCanvasPicking } from './usePlanCanvasPicking.js'
import { usePlanCanvasPointerState } from './usePlanCanvasPointerState.js'
import { usePlanCanvasToolController } from './usePlanCanvasToolController.js'
import { usePlanCanvasPlacementController } from './usePlanCanvasPlacementController.js'
import { usePlanCanvasPointerController } from './usePlanCanvasPointerController.js'
import { usePlanCanvasSceneController } from './usePlanCanvasSceneController.js'
import { usePlanCanvasSnapping } from './usePlanCanvasSnapping.js'
import { PlanCanvasSurface } from './PlanCanvasSurface.js'
import { buildPlanCanvasContextMenu } from './buildPlanCanvasContextMenu.js'
import { usePlanCanvasSurfaceOverlays } from './usePlanCanvasSurfaceOverlays.js'
import type { PlanCanvasProps } from './PlanCanvas.types.js'
export type { PlanCanvasProps } from './PlanCanvas.types.js'

import {
  cabinetFootprintPoints,
  drawTemporaryDimensions, drawTapeMeasure,
} from './PlanCanvasGeometry.js'

export const PlanCanvas: React.FC<PlanCanvasProps> = props => {
  const {
  project,
  preferences,
  onPreferencesChange,
  planDiscipline = 'architecture',
  displayUnit,
  activeTool,
  toolActivation = 0,
  activeColumnTypeMark,
  activeFoundationTypeMark,
  activeBeamTypeMark,
  activeWallTypeMark,
  activeDoorTypeMark,
  activeWindowTypeMark,
  activeSlabTypeMark,
  activeRoofTypeMark,
  labelMode,
  labelVisibility,
  onChangeActiveTypeMark,
  onOpenTypeManager,
  selectedId,
  selectedIds = selectedId ? [selectedId] : [],
  underlay,
  onSelectObject,
  onRequestEditProperties,
  onSelectionChange,
  onDeleteObjects,
  onCopyObjects,
  onCommitColumn,
  onCommitFoundation,
  onCommitBeam,
  onCommitWall,
  onCommitDoor,
  onCommitWindow,
  onCommitSlab,
  onCommitArchitecturalFloor,
  onCommitCeiling,
  onCommitRoof,
  onCommitPipeRoute,
  onCommitFixture,
  onCommitCabinet,
  onCommitMoulding,
  onCommitRoomSeparator,
  onCommitSurfaceVoid,
  onCommitGrid,
  onCommitGridSystem,
  onCopyGrid,
  onActivateTool,
  onCommitStair,
  onPreviewManipulation,
  onCommitManipulation,
  externalManipulationPreview = null,
  onManipulationRejected,
  onFlipDoorHanding,
  onStartCalibrationModal,
  onCursorChange,
  coordination = [],
  coordinationSeverities,
  coordinationFocusSelection = false,
  navigationViewport,
  onNavigationViewportChange,
  } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragDimensionInput = usePlanCanvasDragDimensions(displayUnit)
  const hasInitialFitRef = useRef(false)
  const planVisibleObjects = useMemo(() => getPlanVisibleObjects(project, planDiscipline), [project, planDiscipline])
  const planProject = useMemo(() => getPlanViewProject(project, planVisibleObjects), [project, planVisibleObjects])

  const { placementReference, dimensionReferenceMode, doorHanding, snapModes } = preferences

  // Viewport state: 0.08 zoom = 1000mm -> 80px on screen.
  const { viewport, setViewport, fitView, handleWheel } = usePlanCanvasViewport(
    containerRef, planVisibleObjects, navigationViewport, onNavigationViewportChange,
  )
  const placement = usePlanCanvasPlacementSession({ project, displayUnit, activeTool, activation: toolActivation })
  const {
    gridStartPoint, setGridStartPoint, stairStartPoint, setStairStartPoint, stairOptions, setStairOptions, stairError, setStairError,
    gridSequenceStyle, setGridSequenceStyle, gridCopySourceId, setGridCopySourceId,
    gridXIntervals, setGridXIntervals, gridYIntervals, setGridYIntervals, gridXFirstTag, setGridXFirstTag,
    gridYFirstTag, setGridYFirstTag, gridSystemError, setGridSystemError,
    drawLengthMeters, setDrawLengthMeters, drawAngleDegrees, setDrawAngleDegrees,
    dimensionInputX, setDimensionInputX, dimensionInputY, setDimensionInputY,
    dimensionInputXRef, dimensionInputYRef, dimensionAnchorX, setDimensionAnchorX, dimensionAnchorY, setDimensionAnchorY,
    dimensionKeyboardAxis, setDimensionKeyboardAxis, clearDimensionOverrides,
    beamStartNode, setBeamStartNode, wallStartNode, setWallStartNode, roomSeparatorStart, setRoomSeparatorStart,
    roofShape, setRoofShape, roofSlopeDeg, setRoofSlopeDeg, roofThicknessMm, setRoofThicknessMm,
    roofElevationOffsetMm, setRoofElevationOffsetMm, roofMaterial, setRoofMaterial,
    pipeSystem, setPipeSystem, fixtureKind, setFixtureKind, slabBoundary, setSlabBoundary,
    calibrationP1, setCalibrationP1, calibrationMousePoint, setCalibrationMousePoint,
    tapeMeasure, setTapeMeasure, activeSnap, setActiveSnap, activeWallSnap, setActiveWallSnap,
  } = placement
  const [authoringControlsOpen, setAuthoringControlsOpen] = useState(true)
  const { snapPlanPoint, snapPlanWallHost } = usePlanCanvasSnapping({ planProject, viewport, snapModes })

  const picking = usePlanCanvasPicking({
    project, planProject, viewport, activeTool, selectedId, onSelectObject, onSelectionChange,
  })
  const { pickCandidates, cyclePick } = picking
  const setResizeDimensionWidth = dragDimensionInput.setWidth
  const setResizeDimensionHeight = dragDimensionInput.setHeight
  const setResizeDimensionLength = dragDimensionInput.setLength
  const manualDragPointRef = dragDimensionInput.manualPointRef
  const pointerState = usePlanCanvasPointerState({
    manualDragPointRef,
    setResizeDimensionWidth,
    setResizeDimensionHeight,
    setResizeDimensionLength,
  })
  const {
    isPanning, setIsPanning, objectContextMenu, setObjectContextMenu, selectionBox, setSelectionBox,
    manipulationPreview, setManipulationPreview, dragPreviewPoint, setDragPreviewPoint,
    draggingObject, setDraggingObject, panStartRef, selectionStartRef, pointerPositionsRef, pinchRef,
    pinchActiveRef, longPressTimerRef, longPressStartRef, eraseActiveRef, erasedIdsRef,
    selectionAdditiveRef, clearPointerDrag, handlePointerCancel,
  } = pointerState

  const editableSelectionIds = selectedIds.length ? selectedIds : selectedId ? [selectedId] : []
  const interactionStatus = usePlanCanvasToolController({
    project,
    planProject,
    preferences,
    onPreferencesChange,
    activeTool,
    selectedId,
    editableSelectionIds,
    selectedIds,
    placement,
    pointer: pointerState,
    onActivateTool,
    onSelectionChange,
    onSelectObject,
    onFlipDoorHanding,
  })
  const { placementStatus, placementHint, escapeLabel, cancelCurrentPlacement } = interactionStatus

  const placementController = usePlanCanvasPlacementController({
    props, planProject, viewport, canvasRef, placement, cancelCurrentPlacement,
  })
  const {
    applyPlacementDimensions,
    applyOpeningDistance,
    constrainGridCopyToParallelOffset,
    toggleDimensionReferenceMode,
    resolveReferencePath,
    constrainLineSnap,
    placementDimensions,
    placementKeyboard,
    handleCanvasDoubleClick,
  } = placementController
  const { handleCanvasDimensionKeyDown } = placementKeyboard

  const pointerController = usePlanCanvasPointerController({
    props,
    planProject,
    viewport,
    setViewport,
    containerRef,
    canvasRef,
    selectedId,
    selectedIds,
    editableSelectionIds,
    pointerState,
    picking,
    dragDimensions: dragDimensionInput,
    placement,
    placementController,
    snapPlanPoint,
    snapPlanWallHost,
  })
  const { manipulation: manipulationInteractions, pointerInteractions } = pointerController
  const {
    previewDragAt,
    lastPreviewValidationRef,
    buildDragCommands,
    dimensions: manipulationDimensions,
    mode: manipulationDimensionMode,
    values: manipulationDimensionValues,
    readout: manipulationDimensionReadout,
    style: manipulationDimensionStyle,
    updateMoveDimension,
    updateResizeDimension,
    commitDragDimensions,
  } = manipulationInteractions
  const { handlePointerMove, handlePointerDown, handlePointerUp } = pointerInteractions

  usePlanCanvasSceneController({
    props, planProject, viewport, containerRef, canvasRef, selectedIds,
    editableSelectionIds, placement, placementController, pointer: pointerState, picking,
  })

  const containerSize = {
    width: containerRef.current?.clientWidth ?? 800,
    height: containerRef.current?.clientHeight ?? 600,
  }
  const contextMenu = buildPlanCanvasContextMenu({
    project: planProject,
    menu: objectContextMenu,
    setGridCopySourceId,
    onSelectionChange,
    onSelectObject,
    onActivateTool,
    onCopyObjects,
    onRequestEditProperties,
    onDeleteObjects,
    closeMenu: () => setObjectContextMenu(null),
  })
  const overlays = usePlanCanvasSurfaceOverlays({
    props,
    planProject,
    editableSelectionIds,
    status: interactionStatus,
    picking,
    placement,
    placementDimensions,
    manipulation: manipulationInteractions,
    pointer: pointerState,
    keyboard: placementKeyboard,
    displayUnit,
    dimensionReferenceMode,
    containerSize,
    canvasRef,
    authoringControlsOpen,
    setAuthoringControlsOpen,
    toggleDimensionReferenceMode,
  })

  return <PlanCanvasSurface
    containerRef={containerRef}
    canvasRef={canvasRef}
    activeTool={activeTool}
    cursor={isPanning ? 'grabbing' : activeTool === 'select' ? 'default' : 'crosshair'}
    canvasEvents={{
      onPointerMove: handlePointerMove,
      onPointerDown: handlePointerDown,
      onDoubleClick: handleCanvasDoubleClick,
      onContextMenu: event => event.preventDefault(),
      onPointerUp: handlePointerUp,
      onWheel: handleWheel,
      onKeyDown: handleCanvasDimensionKeyDown,
      onPointerCancel: handlePointerCancel,
    }}
    contextMenu={contextMenu}
    containerSize={containerSize}
    overlays={overlays}
    viewport={viewport}
    setViewport={setViewport}
    fitView={fitView}
  />
}
