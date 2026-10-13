import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import {
  ProjectDocument,
  SmartObject,
  DoorModuleData,
  WindowModuleData,
  WallModuleData,
  StairModuleData,
  isDoorObject,
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
import { usePlanCanvasPointerInteractions } from './usePlanCanvasPointerInteractions.js'
import { PlanCanvasSurface } from './PlanCanvasSurface.js'
import { buildPlanCanvasContextMenu } from './buildPlanCanvasContextMenu.js'
import { usePlanCanvasSurfaceOverlays } from './usePlanCanvasSurfaceOverlays.js'

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

  const picking = usePlanCanvasPicking({
    project, planProject, viewport, activeTool, selectedId, onSelectObject, onSelectionChange,
  })
  const { hoveredId, setHoveredId, pickCandidates, setCandidates, findHitObject, findCandidates, cyclePick } = picking
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
    activeSnap,
    activeWallSnap,
    lineConstraintLabel: ({ auto: 'อัตโนมัติ: ขนาน/ตั้งฉาก', none: 'อิสระ', parallel: 'ขนาน', perpendicular: 'ตั้งฉาก' } as const)[lineConstraintMode],
    placementReferenceLabel: ({ centerline: 'กึ่งกลาง', left_face: 'ชิดซ้าย', right_face: 'ชิดขวา' } as const)[placementReference],
    snapCount: snapModes.length,
  }
  const interactionStatus = usePlanCanvasToolInteraction({
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
  const { placementStatus, placementHint, escapeLabel, cancelCurrentPlacement } = interactionStatus

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

  const manipulationInteractions = usePlanCanvasManipulationInteractions({
    containerRef, canvasRef, planProject, viewport, displayUnit, dragDimensions: dragDimensionInput,
    draggingObject, dragPreviewPoint, manipulationPreview, setDraggingObject, setDragPreviewPoint,
    setManipulationPreview, snapPlanPoint, onPreviewManipulation, onCommitManipulation, onManipulationRejected,
  })
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

  const { handlePointerMove, handlePointerDown, handlePointerUp } = usePlanCanvasPointerInteractions({
    canvasRef,
    activeTool, viewport, setViewport, project, planProject, selectedId, selectedIds, displayUnit,
    activeBeamTypeMark, activeWallTypeMark, activeDoorTypeMark, activeWindowTypeMark,
    placementReference, doorHanding, draggingObject, gridCopySourceId, hoveredId,
    pointerState, placement, picking, dragDimensions: dragDimensionInput,
    manipulation: { previewDragAt, lastPreviewValidationRef, buildDragCommands },
    resizeDimensionWidth: setResizeDimensionWidth,
    resizeDimensionHeight: setResizeDimensionHeight,
    resizeDimensionLength: setResizeDimensionLength,
    dimensionReferenceMode, snapPlanPoint, resolveLineSnap: constrainLineSnap,
    applyPlacementDimensions, constrainGridCopyToParallelOffset,
    snapPlanWallHost, applyOpeningDistance, resolveReferencePath, findEditHandle,
    callbacks: {
      onCopyGrid, onCommitColumn, onCommitFoundation, onCommitDoor, onCommitWindow, onCommitFixture,
      onSelectionChange, onSelectObject, onCommitBeam, onCommitWall, onCommitRoomSeparator, onCommitPipeRoute,
      onCommitCabinet, onCommitMoulding, onCommitSlab, onCommitArchitecturalFloor, onCommitCeiling,
      onCommitRoof, onCommitSurfaceVoid, onCommitGrid, onCommitGridSystem, onStartCalibrationModal,
      onCommitStair, onActivateTool, onDeleteObjects, onPreviewManipulation, onCommitManipulation,
      onManipulationRejected, onCursorChange,
    },
  })
  const placementDimensions = usePlanCanvasPlacementDimensions({
    project, planProject, activeTool, activeDoorTypeMark, activeWindowTypeMark, activeSnap,
    activeWallSnap, gridCopySourceId, dimensionReferenceMode, dimensionAnchorX, dimensionAnchorY,
    dimensionInputX, dimensionInputY, displayUnit, viewport, stairStartPoint, wallStartNode,
    beamStartNode, roomSeparatorStart, slabBoundary, gridStartPoint,
  })
  const {
    dimensionHostAxis, isHostedOpeningPlacement, dimensionReferences, showXDimension, showYDimension,
    xDimensionAnchor, yDimensionAnchor, xDimensionDisplay, yDimensionDisplay,
    dimensionOverlayPosition, supportsPlacementDimensions, hasLineGeometryInput,
  } = placementDimensions

  const { commitActivePlacement, handleCanvasDoubleClick } = createPlanCanvasPlacementCommitHandlers({
    canvasRef, activeSnap, activeTool, supportsPlacementDimensions, viewport,
    selectedId, project: planProject, slabBoundary, setSlabBoundary, roofShape,
    roofSlopeDeg, roofThicknessMm, roofElevationOffsetMm, roofMaterial, clearDimensionOverrides,
    onCommitSlab, onCommitArchitecturalFloor, onCommitCeiling, onCommitRoof, onCommitSurfaceVoid,
  })

  const placementKeyboard = usePlanCanvasPlacementKeyboard({
    activeTool, supportsPlacementDimensions, dimensionHostAxis, dimensionKeyboardAxis, dimensionAnchorX, dimensionAnchorY,
    dimensionReferences, dimensionInputX, dimensionInputY, showXDimension, showYDimension,
    dimensionInputXRef, dimensionInputYRef, canvasRef, setDimensionKeyboardAxis, setDimensionAnchorX,
    setDimensionAnchorY, setDimensionInputX, setDimensionInputY, commitActivePlacement, cancelCurrentPlacement,
    toggleDimensionReferenceMode,
  })
  const { handlePlacementInputKeyDown, handleCanvasDimensionKeyDown, handleDimensionInputKeyDown } = placementKeyboard
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
