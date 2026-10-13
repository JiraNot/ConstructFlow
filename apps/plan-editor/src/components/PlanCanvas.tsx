import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import {
  ProjectDocument,
  SmartObject,
  DoorModuleData,
  WindowModuleData,
  WallModuleData,
  StairModuleData,
  isColumnObject,
  isFoundationObject,
  isGridObject,
  isBeamObject,
  isWallObject,
  isDoorObject,
  isWindowObject,
  DoorHanding,
  PlacementReference,
  DisplayLengthUnit,
} from '@constructflow/project-model'
import { stairFromRun } from '@constructflow/architecture-engine'
import { polygonInteriorPoint } from '@constructflow/geometry-kernel'
import { getEditableRoofRidge } from '@constructflow/roof-engine'
import { getPlanViewProject, getPlanVisibleObjects } from '@constructflow/representation-engine'
import type { ClashSeverity, CoordinationFinding } from '@constructflow/clash-engine'
import { usePlanCanvasPlacementKeyboard } from './usePlanCanvasPlacementKeyboard.js'
import { TOOL_FAMILIES } from './catalogPresentation.js'
import { ToolType } from './Toolbar.js'
import { type LinearReference, type SnapResult } from '@constructflow/snapping-engine'
import { UnderlayConfig, PlanLabelVisibility } from '../rendering/planRenderer.js'
import type { CommandRequest } from '@constructflow/command-schema'
import type { ViewportState } from '../viewport/viewportTransform.js'
import type { DirectManipulationPreviewResult } from '../directManipulation.mjs'
import { isPolygonInteraction, isTwoPointInteraction } from '../app/toolInteractionRegistry.mjs'
import { usePlanCanvasViewport } from './usePlanCanvasViewport.js'
import { resolvePlanCanvasPointerSnap } from './resolvePlanCanvasPointerSnap.js'
import { usePlanCanvasDragDimensions } from './usePlanCanvasDragDimensions.js'
import { findPlanCanvasEditHandle } from './PlanCanvasEditHandles.js'
import { updatePlanCanvasPreference, type PlanCanvasPreferences } from '../app/planCanvasPreferences.mjs'
import { applyPlanCanvasPlacementDimensions, constrainPlanCanvasGridCopyToParallelOffset, constrainPlanCanvasLineSnap, resolvePlanCanvasReferencePath } from './planCanvasPlacementConstraints.mjs'
import { usePlanCanvasPlacementSession } from './usePlanCanvasPlacementSession.js'
import { usePlanCanvasManipulationInteractions } from './usePlanCanvasManipulationInteractions.js'
import { createPlanCanvasPlacementCommitHandlers } from './createPlanCanvasPlacementCommitHandlers.js'
import { nextDoorHanding, usePlanCanvasGlobalShortcuts } from './usePlanCanvasGlobalShortcuts.js'
import { usePlanCanvasDrawing } from './usePlanCanvasDrawing.js'
import { usePlanCanvasPicking } from './usePlanCanvasPicking.js'
import { usePlanCanvasPointerState } from './usePlanCanvasPointerState.js'
import { usePlanCanvasPlacementDimensions } from './usePlanCanvasPlacementDimensions.js'
import { usePlanCanvasToolInteraction } from './usePlanCanvasToolInteraction.js'
import { usePlanCanvasOpeningPlacementDimensions } from './usePlanCanvasOpeningPlacementDimensions.js'
import { usePlanCanvasSnapping } from './usePlanCanvasSnapping.js'
import { usePlanCanvasPointerHandlers } from './usePlanCanvasPointerHandlers.js'
import { PlanCanvasSurface } from './PlanCanvasSurface.js'

export interface PlanCanvasProps {
  project: ProjectDocument
  preferences: PlanCanvasPreferences
  onPreferencesChange: (updater: (current: PlanCanvasPreferences) => PlanCanvasPreferences) => void
  planDiscipline?: 'architecture' | 'framing' | 'roof'
  displayUnit: DisplayLengthUnit
  activeTool: ToolType
  toolActivation?: number
  activeColumnTypeMark: string
  activeFoundationTypeMark: string
  activeBeamTypeMark: string
  activeWallTypeMark: string
  activeDoorTypeMark: string
  activeWindowTypeMark: string
  activeSlabTypeMark: string
  activeRoofTypeMark: string
  labelMode: 'name' | 'name-size'
  labelVisibility: PlanLabelVisibility
  onOpenTypeManager: () => void
  onChangeActiveTypeMark: (typeMark: string) => void
  selectedId: string | null
  selectedIds?: string[]
  underlay?: UnderlayConfig | null
  onSelectObject: (id: string | null) => void
  onRequestEditProperties?: () => void
  onSelectionChange?: (ids: string[], primaryId: string | null) => void
  onDeleteObjects?: (ids: string[]) => void
  onCopyObjects?: (ids: string[]) => void
  onCommitColumn: (location_mm: [number, number]) => void
  onCommitFoundation: (opts: { columnId?: string; location_mm?: [number, number] }) => void
  onCommitBeam: (start: [number, number], end: [number, number], startColId?: string, endColId?: string, placementReference?: PlacementReference) => void
  onCommitWall: (start: [number, number], end: [number, number], placementReference?: PlacementReference, verticalReference?: WallVerticalReference) => void
  onCommitDoor: (wallId: string, point_mm: [number, number], offset_mm: number, handing: DoorHanding) => void
  onCommitWindow: (wallId: string, point_mm: [number, number], offset_mm: number) => void
  onCommitSlab: (boundary_mm: [number, number][]) => void
  onCommitArchitecturalFloor?: (boundary_mm: [number, number][]) => void
  onCommitCeiling?: (boundary_mm: [number, number][]) => void
  onCommitRoof?: (boundary_mm: [number, number][], options?: { shape: 'hip' | 'gable' | 'flat'; slope_deg: number; thickness_mm: number; elevation_offset_mm: number; material: string }) => void
  onCommitPipeRoute?: (start: [number, number], end: [number, number], system: 'waste' | 'soil' | 'rainwater' | 'vent' | 'cold_water' | 'hot_water') => void
  onCommitFixture?: (point: [number, number], kind: 'light' | 'switch' | 'outlet' | 'panel') => void
  onCommitCabinet?: (start: [number, number], end: [number, number]) => void
  onCommitMoulding?: (start: [number, number], end: [number, number]) => void
  onCommitRoomSeparator?: (start: [number, number], end: [number, number]) => void
  onCommitSurfaceVoid: (hostId: string, boundary_mm: [number, number][]) => void
  onCommitGrid: (tag: string, start_mm: [number, number], end_mm: [number, number], sequenceStyle?: 'auto' | 'alpha' | 'numeric') => void
  onCommitGridSystem: (origin_mm: [number, number], xIntervals_mm: number[], yIntervals_mm: number[], xFirstTag: string, yFirstTag: string) => void
  onCopyGrid?: (sourceId: string, start: [number, number], end: [number, number]) => void
  onActivateTool?: (tool: ToolType) => void
  onCommitStair?: (stair: StairModuleData) => boolean
  onPreviewManipulation: (commands: CommandRequest[]) => DirectManipulationPreviewResult
  onCommitManipulation: (commands: CommandRequest[]) => { status: string; errors?: string[] }
  externalManipulationPreview?: { project: ProjectDocument; ids: string[]; valid: boolean } | null
  onManipulationRejected?: (errors: string[]) => void
  onFlipDoorHanding?: (doorId: string) => void
  onStartCalibrationModal?: (measuredDist_mm: number, point1_mm: [number, number], point2_mm: [number, number]) => void
  onCursorChange: (coords_mm: [number, number], snapKind: string) => void
  /** Coordination findings from the clash engine (exact narrow phase + Thai rule set). */
  coordination?: readonly CoordinationFinding[]
  /** Severities to draw on the canvas; omitted = every severity. */
  coordinationSeverities?: readonly ClashSeverity[]
  /** Highlight coordinate findings that involve the current selection. */
  coordinationFocusSelection?: boolean
  navigationViewport?: ViewportState | null
  onNavigationViewportChange?: (viewport: ViewportState) => void
}

import {
  cabinetFootprintPoints,
  gridLineEndpoints,
  drawTemporaryDimensions, drawTapeMeasure,
  type WallVerticalReference,
} from './PlanCanvasGeometry.js'

export const PlanCanvas: React.FC<PlanCanvasProps> = ({
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
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragDimensionInput = usePlanCanvasDragDimensions(displayUnit)
  const hasInitialFitRef = useRef(false)
  const planVisibleObjects = useMemo(() => getPlanVisibleObjects(project, planDiscipline), [project, planDiscipline])
  const planProject = useMemo(() => getPlanViewProject(project, planVisibleObjects), [project, planVisibleObjects])

  const { placementReference, lineConstraintMode, dimensionReferenceMode, doorHanding, snapModes } = preferences
  const setPreference = <K extends keyof PlanCanvasPreferences>(
    key: K,
    value: PlanCanvasPreferences[K] | ((current: PlanCanvasPreferences[K]) => PlanCanvasPreferences[K]),
  ) => onPreferencesChange(current => updatePlanCanvasPreference(current, key, value))

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

  const applyPlacementDimensions = (point: [number, number], refs: { refX?: number; refY?: number }, rawPoint: [number, number] = point): [number, number] =>
    applyPlanCanvasPlacementDimensions(point, refs, rawPoint, { dimensionInputX, dimensionInputY, dimensionAnchorX, dimensionAnchorY, displayUnit })

  const { applyOpeningDistance } = usePlanCanvasOpeningPlacementDimensions({
    project,
    planProject,
    activeTool,
    activeDoorTypeMark,
    activeWindowTypeMark,
    activeSnap,
    setActiveSnap,
    activeWallSnap,
    setActiveWallSnap,
    dimensionReferenceMode,
    dimensionInputX,
    dimensionInputY,
    dimensionAnchorX,
    dimensionAnchorY,
    displayUnit,
    applyPlacementDimensions,
  })

  const constrainGridCopyToParallelOffset = (point: [number, number], source: Parameters<typeof gridLineEndpoints>[0]): [number, number] => {
    return constrainPlanCanvasGridCopyToParallelOffset(point, source, gridLineEndpoints)
  }

  const toggleDimensionReferenceMode = () => {
    setPreference('dimensionReferenceMode', mode => mode === 'center' ? 'edge' : 'center')
    // Keep the entered distance and re-anchor it to the chosen center/edge reference.
    setDimensionAnchorX(null); setDimensionAnchorY(null)
  }

  const resolveReferencePath = useCallback((start: [number, number], end: [number, number], widthMm: number): [[number, number], [number, number]] => {
    return resolvePlanCanvasReferencePath(start, end, widthMm, placementReference)
  }, [placementReference])

  const constrainLineSnap = useCallback((snap: SnapResult, pointerPoint: [number, number], start: [number, number], lockAxis: boolean, reference?: LinearReference): SnapResult => {
    return constrainPlanCanvasLineSnap(snap, pointerPoint, start, lockAxis, reference, {
      lineConstraintMode, viewportZoom: viewport.zoom, drawLength: drawLengthMeters,
      drawAngle: drawAngleDegrees, displayUnit,
    })
  }, [drawLengthMeters, drawAngleDegrees, lineConstraintMode, viewport.zoom, displayUnit])

  const { hoveredId, setHoveredId, pickCandidates, setCandidates, findHitObject, findCandidates, cyclePick } = usePlanCanvasPicking({
    project, planProject, viewport, activeTool, selectedId, onSelectObject, onSelectionChange,
  })
  const stairPreview = useMemo(() => {
    if (activeTool !== 'stair' || !stairStartPoint || !activeSnap) return null
    try { return stairFromRun(project, stairStartPoint, activeSnap.point_mm, stairOptions) } catch { return null }
  }, [activeTool, stairStartPoint, activeSnap, stairOptions, project])
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

  // Door handing state (can cycle with Spacebar)
  const setDoorHanding = (value: DoorHanding | ((current: DoorHanding) => DoorHanding)) => setPreference('doorHanding', value)
  const editableSelectionIds = selectedIds.length ? selectedIds : selectedId ? [selectedId] : []
  const selectionHint = editableSelectionIds.some(id => planProject.objects[id]?.object_type === 'interior.cabinet_run')
    ? 'เลือกบิลท์อิน · ลากด้ามสีม่วงเพื่อหมุน โดยคงตำแหน่งและขนาด · Esc ล้างการเลือก'
    : 'เลือก · คลิกเลือกหรือ ลากครอบวัตถุ · Tab สลับวัตถุซ้อน · Esc ล้างการเลือก'
  const interactionState = {
    draggingObject,
    objectContextMenu,
    stairStartPoint,
    gridStartPoint,
    gridCopySourceId,
    beamStartNode,
    wallStartNode,
    roomSeparatorStart,
    slabBoundary,
    tapeMeasure,
    calibrationP1,
    dimensionInputX,
    dimensionInputY,
    drawLengthMeters,
    drawAngleDegrees,
    gridSystemError,
    pipeSystem,
    fixtureKind,
    lineConstraintLabel: ({ auto: 'อัตโนมัติ: ขนาน/ตั้งฉาก', none: 'อิสระ', parallel: 'ขนาน', perpendicular: 'ตั้งฉาก' } as const)[lineConstraintMode],
    placementReferenceLabel: ({ centerline: 'กึ่งกลาง', left_face: 'ชิดซ้าย', right_face: 'ชิดขวา' } as const)[placementReference],
    snapCount: snapModes.length,
  }
  const { placementStatus, placementHint, escapeLabel, cancelCurrentPlacement } = usePlanCanvasToolInteraction({
    activeTool,
    selectionHint,
    interactionState,
    hasSelection: Boolean(selectedId || selectedIds.length),
    onActivateTool,
    onSelectionChange,
    onSelectObject,
    closeObjectContextMenu: () => setObjectContextMenu(null),
    clearPointerDrag,
    resetPlacementDrafts: placement.resetPlacementDrafts,
  })

  const selectedDoorId = selectedId && project.objects[selectedId] && isDoorObject(project.objects[selectedId]) ? selectedId : null
  usePlanCanvasGlobalShortcuts({
    activeTool,
    selectedDoorId,
    draggingObject: Boolean(draggingObject),
    onFlipDoorHanding,
    cancelCurrentPlacement,
    cycleDoorHanding: () => setDoorHanding(current => nextDoorHanding(current)),
    cyclePlacementReference: () => setPreference('placementReference', current => {
      const cycle = { centerline: 'left_face', left_face: 'right_face', right_face: 'centerline' } as const
      return cycle[current]
    }),
  })

  useEffect(() => {
    if (!activeSnap) return
    const isPolygonTool = isPolygonInteraction(activeTool)
    const isTwoPointTool = isTwoPointInteraction(activeTool)
    const start = activeTool === 'wall' ? wallStartNode : activeTool === 'beam' ? beamStartNode : activeTool === 'stair' && stairStartPoint ? { point_mm: stairStartPoint } : activeTool === 'grid' && gridStartPoint ? { point_mm: gridStartPoint } : isTwoPointTool && roomSeparatorStart ? { point_mm: roomSeparatorStart } : isPolygonTool && slabBoundary.length ? { point_mm: slabBoundary[slabBoundary.length - 1] } : null
    if (!start) return
    const constrained = constrainLineSnap(activeSnap, activeSnap.point_mm, start.point_mm, false, 'reference' in start ? start.reference : undefined)
    if (constrained.point_mm[0] !== activeSnap.point_mm[0] || constrained.point_mm[1] !== activeSnap.point_mm[1]) setActiveSnap(constrained)
  }, [activeTool, activeSnap, wallStartNode, beamStartNode, stairStartPoint, gridStartPoint, roomSeparatorStart, slabBoundary, drawLengthMeters, drawAngleDegrees, constrainLineSnap])

  const findEditHandle = (screenPoint: [number, number]) => findPlanCanvasEditHandle({ planProject, editableSelectionIds, viewport, screenPoint, onFlipDoorHanding })

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
  } = usePlanCanvasManipulationInteractions({
    containerRef, canvasRef, planProject, viewport, displayUnit, dragDimensions: dragDimensionInput,
    draggingObject, dragPreviewPoint, manipulationPreview, setDraggingObject, setDragPreviewPoint,
    setManipulationPreview, snapPlanPoint, onPreviewManipulation, onCommitManipulation, onManipulationRejected,
  })

  usePlanCanvasDrawing({
    containerRef,
    canvasRef,
    project,
    planProject,
    activeTool,
    activeSnap,
    activeWallSnap,
    activeColumnTypeMark,
    activeFoundationTypeMark,
    activeBeamTypeMark,
    activeWallTypeMark,
    activeDoorTypeMark,
    activeWindowTypeMark,
    beamStartNode,
    wallStartNode,
    doorHanding,
    stairPreview,
    stairStartPoint,
    resolveReferencePath,
    calibrationP1,
    calibrationMousePoint,
    selectedIds,
    editableSelectionIds,
    hoveredId,
    underlay,
    labelMode,
    labelVisibility,
    planDiscipline,
    viewport,
    displayUnit,
    manipulationPreview,
    externalManipulationPreview,
    coordination,
    coordinationSeverities,
    coordinationFocusSelection,
    gridStartPoint,
    gridCopySourceId,
    tapeMeasure,
    dimensionReferenceMode,
    selectionBox,
    roomSeparatorStart,
    pipeSystem,
    fixtureKind,
    slabBoundary,
  })

  const resolvePointerSnap = (rawWorld: [number, number], ctrlKey: boolean, shiftKey: boolean) => resolvePlanCanvasPointerSnap({
    activeTool, rawWorld, ctrlKey, shiftKey, project, planProject,
    activeDoorTypeMark, activeWindowTypeMark, draggingObjectId: draggingObject?.id, gridCopySourceId,
    dimensionReferenceMode,
    lineState: { beamStartNode, wallStartNode, stairStartPoint, gridStartPoint, roomSeparatorStart, slabBoundary },
    snapPlanPoint, snapPlanWallHost, applyOpeningDistance, resolveLineSnap: constrainLineSnap,
    applyPlacementDimensions, constrainGridCopyToParallelOffset,
  })

  const { handlePointerMove, handlePointerDown, handlePointerUp } = usePlanCanvasPointerHandlers({
    canvasRef,
    pointerMove: {
      navigation: {
        pointerPositionsRef, pinchRef, longPressStartRef, longPressTimerRef, selectionStartRef,
        setSelectionBox, eraseActiveRef, erasedIdsRef, isPanning, panStartRef, viewport, setViewport, findCandidates,
      },
      authoring: {
        activeTool, viewport, draggingObject, hoveredId,
        resolveSnap: resolvePointerSnap,
        findCandidates, setActiveWallSnap, setActiveSnap, setTapeMeasure, setCalibrationMousePoint,
        setCandidates, setHoveredId, setManipulationPreview, onCursorChange, previewDragAt,
      },
    },
    pointerDown: {
      activeTool,
      viewport,
      navigation: {
      pointerPositionsRef, pinchRef, pinchActiveRef, longPressStartRef, longPressTimerRef,
      selectionStartRef, panStartRef, setSelectionBox, setDraggingObject, setIsPanning,
      setObjectContextMenu, findHitObject, onSelectionChange, onSelectObject,
      },
      snapping: {
        resolveSnap: resolvePointerSnap,
      },
      selection: {
      displayUnit, planProject, project, selectedIds, hoveredId, findEditHandle, findCandidates,
      findHitObject, setCandidates, setHoveredId, setDraggingObject, setManipulationPreview,
      setResizeDimensionWidth, setResizeDimensionHeight, setResizeDimensionLength,
      selectionStartRef, selectionAdditiveRef, lastPreviewValidationRef, onSelectionChange, onSelectObject,
      },
      placement: {
      project, planProject, selectedId, displayUnit, viewportZoom: viewport.zoom, placement,
      settings: { activeBeamTypeMark, activeWallTypeMark, activeDoorTypeMark, activeWindowTypeMark, placementReference, doorHanding },
      callbacks: {
        onCopyGrid, onCommitColumn, onCommitFoundation, onCommitDoor, onCommitWindow, onCommitFixture,
        onSelectionChange, onSelectObject, onCommitBeam, onCommitWall, onCommitRoomSeparator, onCommitPipeRoute,
        onCommitCabinet, onCommitMoulding, onCommitSlab, onCommitArchitecturalFloor, onCommitCeiling,
        onCommitRoof, onCommitSurfaceVoid, onCommitGrid, onCommitGridSystem, onStartCalibrationModal,
        onCommitStair, onActivateTool,
      },
      operations: { snapPlanWallHost, applyOpeningDistance, resolveReferencePath },
      interaction: { eraseActiveRef, erasedIdsRef, findCandidates },
      },
    },
    pointerUp: {
      viewport,
      isPanning,
      pointerPositionsRef,
      pinchRef,
      pinchActiveRef,
      longPressTimerRef,
      longPressStartRef,
      setIsPanning,
      selectionStartRef,
      selectionAdditiveRef,
      setSelectionBox,
      project: planProject,
      selectedIds,
      onSelectionChange,
      onSelectObject,
      eraseActiveRef,
      erasedIdsRef,
      onDeleteObjects,
      draggingObject,
      manualDragPointRef,
      buildDragCommands,
      onPreviewManipulation,
      onCommitManipulation,
      onManipulationRejected,
      setDraggingObject,
      setDragPreviewPoint,
      setResizeDimensionWidth,
      setResizeDimensionHeight,
      setResizeDimensionLength,
    },
  })
  const {
    dimensionHostAxis, isHostedOpeningPlacement, dimensionReferences, showXDimension, showYDimension,
    xDimensionAnchor, yDimensionAnchor, xDimensionDisplay, yDimensionDisplay,
    dimensionOverlayPosition, supportsPlacementDimensions, hasLineGeometryInput,
  } = usePlanCanvasPlacementDimensions({
    project, planProject, activeTool, activeDoorTypeMark, activeWindowTypeMark, activeSnap,
    activeWallSnap, gridCopySourceId, dimensionReferenceMode, dimensionAnchorX, dimensionAnchorY,
    dimensionInputX, dimensionInputY, displayUnit, viewport, stairStartPoint, wallStartNode,
    beamStartNode, roomSeparatorStart, slabBoundary, gridStartPoint,
  })

  const { commitActivePlacement, handleCanvasDoubleClick } = createPlanCanvasPlacementCommitHandlers({
    canvasRef, activeSnap, activeTool, supportsPlacementDimensions, viewport,
    selectedId, project: planProject, slabBoundary, setSlabBoundary, roofShape,
    roofSlopeDeg, roofThicknessMm, roofElevationOffsetMm, roofMaterial, clearDimensionOverrides,
    onCommitSlab, onCommitArchitecturalFloor, onCommitCeiling, onCommitRoof, onCommitSurfaceVoid,
  })

  const { handlePlacementInputKeyDown, handleCanvasDimensionKeyDown, handleDimensionInputKeyDown } = usePlanCanvasPlacementKeyboard({
    activeTool, supportsPlacementDimensions, dimensionHostAxis, dimensionKeyboardAxis, dimensionAnchorX, dimensionAnchorY,
    dimensionReferences, dimensionInputX, dimensionInputY, showXDimension, showYDimension,
    dimensionInputXRef, dimensionInputYRef, canvasRef, setDimensionKeyboardAxis, setDimensionAnchorX,
    setDimensionAnchorY, setDimensionInputX, setDimensionInputY, commitActivePlacement, cancelCurrentPlacement,
    toggleDimensionReferenceMode,
  })
  const containerSize = {
    width: containerRef.current?.clientWidth ?? 800,
    height: containerRef.current?.clientHeight ?? 600,
  }
  const contextMenu = objectContextMenu && planProject.objects[objectContextMenu.id]
    ? {
        object: planProject.objects[objectContextMenu.id]!,
        position: { x: objectContextMenu.x, y: objectContextMenu.y },
        onStartGridCopy: (objectId: string) => {
          setGridCopySourceId(objectId)
          onSelectionChange?.([objectId], objectId)
          onSelectObject(objectId)
          onActivateTool?.('gridCopy')
          setObjectContextMenu(null)
        },
        onCopy: (objectId: string) => {
          onSelectionChange?.([objectId], objectId)
          onSelectObject(objectId)
          onCopyObjects?.([objectId])
          setObjectContextMenu(null)
        },
        onEditProperties: (objectId: string) => {
          onSelectionChange?.([objectId], objectId)
          onSelectObject(objectId)
          onRequestEditProperties?.()
          setObjectContextMenu(null)
        },
        onDelete: (objectId: string) => {
          onDeleteObjects?.([objectId])
          setObjectContextMenu(null)
        },
      }
    : null
  const overlays: Parameters<typeof PlanCanvasSurface>[0]['overlays'] = {
    hints: {
      activeTool,
      tapeMeasure,
      showSelectionHandleHint: editableSelectionIds.some(id => {
        const object = planProject.objects[id]
        return object && (isColumnObject(object) || isFoundationObject(object) || isWallObject(object) || isBeamObject(object) || isGridObject(object) || isDoorObject(object) || isWindowObject(object) || ['structure.slab', 'architecture.floor', 'architecture.ceiling', 'roof.system', 'architecture.room_separator', 'drainage.pipe_route', 'plumbing.pipe_route', 'decorative.moulding_run', 'interior.cabinet_run'].includes(object.object_type))
      }),
      placementStatus, placementHint, escapeLabel, pickCandidates, hoveredId, project: planProject,
      onCyclePick: cyclePick, onHoverChange: setHoveredId, onSelectionChange, onSelectObject,
    },
    manipulation: manipulationDimensions && dragPreviewPoint && draggingObject ? {
      mode: manipulationDimensionMode as 'move' | 'rectangle' | 'opening-width' | 'line-length',
      displayUnit,
      values: manipulationDimensionValues,
      onChange: (field, value) => field === 'x' || field === 'y' ? updateMoveDimension(field, value) : updateResizeDimension(field, value),
      onCommit: commitDragDimensions,
      onCancel: () => { cancelCurrentPlacement(); canvasRef.current?.focus({ preventScroll: true }) },
      readout: manipulationDimensionReadout,
      style: manipulationDimensionStyle ?? {},
    } : null,
    placement: {
      position: supportsPlacementDimensions ? dimensionOverlayPosition : null,
      containerSize,
      displayUnit, showX: showXDimension, showY: showYDimension, hasLineGeometryInput, isHostedOpeningPlacement,
      dimensionReferenceMode, dimensionReferences, dimensionAnchorX, dimensionAnchorY, xDimensionDisplay, yDimensionDisplay,
      drawLengthMeters, drawAngleDegrees, dimensionInputXRef, dimensionInputYRef,
      setDimensionKeyboardAxis, setDimensionAnchorX, setDimensionAnchorY, setDimensionInputX, setDimensionInputY,
      setDrawLengthMeters, setDrawAngleDegrees, onDimensionKeyDown: handleDimensionInputKeyDown,
      onPlacementKeyDown: handlePlacementInputKeyDown, onToggleDimensionReference: toggleDimensionReferenceMode,
    },
    controls: {
      project, activeTool, displayUnit, preferences, open: authoringControlsOpen, pipeSystem, fixtureKind,
      roof: { shape: roofShape, slopeDeg: roofSlopeDeg, thicknessMm: roofThicknessMm, elevationOffsetMm: roofElevationOffsetMm, material: roofMaterial },
      stairOptions, stairError, gridSequenceStyle, gridStartPoint,
      gridSystem: { xIntervals: gridXIntervals, yIntervals: gridYIntervals, xFirstTag: gridXFirstTag, yFirstTag: gridYFirstTag, error: gridSystemError },
      lineReferenceDescription: (activeTool === 'beam' ? beamStartNode?.reference : wallStartNode?.reference)?.description,
      activeTypeMarks: { column: activeColumnTypeMark, foundation: activeFoundationTypeMark, beam: activeBeamTypeMark, wall: activeWallTypeMark, door: activeDoorTypeMark, window: activeWindowTypeMark, slab: activeSlabTypeMark, roof: activeRoofTypeMark },
      onOpenChange: setAuthoringControlsOpen, onPipeSystemChange: setPipeSystem, onFixtureKindChange: setFixtureKind,
      onRoofChange: updater => {
        const next = updater({ shape: roofShape, slopeDeg: roofSlopeDeg, thicknessMm: roofThicknessMm, elevationOffsetMm: roofElevationOffsetMm, material: roofMaterial })
        setRoofShape(next.shape); setRoofSlopeDeg(next.slopeDeg); setRoofThicknessMm(next.thicknessMm)
        setRoofElevationOffsetMm(next.elevationOffsetMm); setRoofMaterial(next.material)
      },
      onStairOptionsChange: setStairOptions, onGridSequenceStyleChange: setGridSequenceStyle,
      onGridIntervalsChange: (axis, value) => {
        if (axis === 'x') setGridXIntervals(value)
        else setGridYIntervals(value)
        setGridSystemError('')
      },
      onGridFirstTagChange: (axis, value) => axis === 'x' ? setGridXFirstTag(value) : setGridYFirstTag(value),
      onPlacementReferenceChange: value => setPreference('placementReference', value),
      onLineConstraintModeChange: value => setPreference('lineConstraintMode', value),
      onSnapModeToggle: mode => setPreference('snapModes', current => current.includes(mode) ? current.filter(value => value !== mode) : [...current, mode]),
      onPlacementKeyDown: handlePlacementInputKeyDown, onChangeActiveTypeMark, onOpenTypeManager,
    },
  }

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
