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
  formatLengthMm,
  parseLengthMm,
  DisplayLengthUnit,
} from '@constructflow/project-model'
import { projectPointToWallOffsetMm, stairFromRun } from '@constructflow/architecture-engine'
import { polygonInteriorPoint } from '@constructflow/geometry-kernel'
import { getEditableRoofRidge } from '@constructflow/roof-engine'
import { getPlanViewProject, getPlanVisibleObjects } from '@constructflow/representation-engine'
import type { ClashSeverity, CoordinationFinding } from '@constructflow/clash-engine'
import { PlanCanvasAuthoringControls } from './PlanCanvasAuthoringControls.js'
import { commitPlanCanvasLinePlacementPoint } from './commitPlanCanvasLinePlacementPoint.js'
import { commitPlanCanvasPointPlacement } from './commitPlanCanvasPointPlacement.js'
import { commitPlanCanvasConnectedPlacementPoint, commitPlanCanvasGridPoint, commitPlanCanvasGridSystemPoint } from './commitPlanCanvasPlacementPoints.js'
import { handlePlanCanvasAuthoringPointerMove } from './handlePlanCanvasAuthoringPointerMove.js'
import { usePlanCanvasPlacementKeyboard } from './usePlanCanvasPlacementKeyboard.js'
import { TOOL_FAMILIES } from './catalogPresentation.js'
import { ToolType } from './Toolbar.js'
import {
  ViewportState,
  screenToWorld,
  worldToScreen,
  zoomAtScreenPoint,
} from '../viewport/viewportTransform.js'
import { SnapMode, SnapSpatialIndex, snapPoint, snapToWallHost, type LinearReference, type SnapResult, type WallHostSnapResult, snapOpeningOffsetBimAware } from '@constructflow/snapping-engine'
import { UnderlayConfig, PlanLabelVisibility } from '../rendering/planRenderer.js'
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react'
import type { CommandRequest } from '@constructflow/command-schema'
import { optimisticManipulationProject, type DirectManipulationPreviewResult, type PlanDragGesture } from '../directManipulation.mjs'
import { isPolygonInteraction, isTwoPointInteraction, usesPlacementDimensions } from '../app/toolInteractionRegistry.mjs'
import { usePlanCanvasViewport } from './usePlanCanvasViewport.js'
import { usePlanCanvasPointerCancel } from './usePlanCanvasPointerCancel.js'
import { PlanCanvasObjectContextMenu } from './PlanCanvasObjectContextMenu.js'
import { resolvePlanCanvasPointerSnap } from './resolvePlanCanvasPointerSnap.js'
import { handlePlanCanvasNavigationPointerMove } from './handlePlanCanvasNavigationPointerMove.js'
import { PlanCanvasDragDimensions, type DragDimensionField, type DragDimensionMode } from './PlanCanvasDragDimensions.js'
import { usePlanCanvasDragDimensions } from './usePlanCanvasDragDimensions.js'
import { findPlanCanvasEditHandle } from './PlanCanvasEditHandles.js'
import { buildPlanCanvasDragCommands } from './buildPlanCanvasDragCommands.js'
import { handlePlanCanvasPointerDownNavigation } from './handlePlanCanvasPointerDownNavigation.js'
import { commitPlanCanvasPolygonPoint } from './commitPlanCanvasPolygonPoint.mjs'
import { findPlanHitObject } from './planHitTesting.mjs'
import { handlePlanCanvasPointerUp } from './handlePlanCanvasPointerUp.js'
import { drawPlanCanvasSelectionHandles } from './drawPlanCanvasSelectionHandles.js'
import { drawPlanCanvasToolOverlays } from './drawPlanCanvasToolOverlays.js'
import { buildPlanPlacementGhost } from './buildPlanPlacementGhost.js'
import { drawPlanCanvasBaseScene } from './drawPlanCanvasBaseScene.js'
import { resolvePlanCanvasLineSnap } from '../app/placementLineSnap.mjs'
import { updatePlanCanvasPreference, type PlanCanvasPreferences } from '../app/planCanvasPreferences.mjs'
import { hasPendingToolStep, resolveEscapeAction, resolveToolInteractionStatus } from '../app/toolInteractionStatus.mjs'
import { handlePlanCanvasSelectionPointerDown } from './handlePlanCanvasSelectionPointerDown.js'
import type { PlanCanvasDraggingObject } from './planCanvasInteractionTypes.js'
import { PlanCanvasInteractionHints } from './PlanCanvasInteractionHints.js'
import { PlanCanvasPlacementDimensions } from './PlanCanvasPlacementDimensions.js'
import { applyPlanCanvasPlacementDimensions, constrainPlanCanvasGridCopyToParallelOffset, constrainPlanCanvasLineSnap, resolvePlanCanvasReferencePath } from './planCanvasPlacementConstraints.mjs'
import { resolvePlanCanvasPickCandidates } from './resolvePlanCanvasPickCandidates.mjs'
import { usePlanCanvasPlacementSession } from './usePlanCanvasPlacementSession.js'

interface PlanCanvasProps {
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
}

import {
  getPlanObjectBounds,
  cabinetFootprintPoints,
  gridLineEndpoints, findTemporaryDimensionRefs, openingDimensionRefs, openingDimensionPoint,
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
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragDimensionInput = usePlanCanvasDragDimensions(displayUnit)
  const hasInitialFitRef = useRef(false)
  const planVisibleObjects = useMemo(() => getPlanVisibleObjects(project, planDiscipline), [project, planDiscipline])
  const planProject = useMemo(() => getPlanViewProject(project, planVisibleObjects), [project, planVisibleObjects])
  const snapSpatialIndex = useMemo(() => new SnapSpatialIndex(planProject), [planProject])

  const { placementReference, lineConstraintMode, dimensionReferenceMode, doorHanding, snapModes } = preferences
  const setPreference = <K extends keyof PlanCanvasPreferences>(
    key: K,
    value: PlanCanvasPreferences[K] | ((current: PlanCanvasPreferences[K]) => PlanCanvasPreferences[K]),
  ) => onPreferencesChange(current => updatePlanCanvasPreference(current, key, value))

  // Viewport state: 0.08 zoom = 1000mm -> 80px on screen.
  const { viewport, setViewport, fitView, handleWheel } = usePlanCanvasViewport(containerRef, planVisibleObjects)
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
  const enabledSnapModes = useMemo(() => new Set(snapModes), [snapModes])
  const snapPlanPoint = (point: [number, number], distancePx = 16, excludedObjectId?: string) => {
    const radiusMm = distancePx / Math.max(viewport.zoom, 0.0001)
    const candidates = snapSpatialIndex.candidateObjectIds(point, radiusMm)
    return snapPoint(point, planProject, viewport, distancePx, enabledSnapModes, excludedObjectId, candidates)
  }
  const snapPlanWallHost = (point: [number, number], openingWidthMm: number) => {
    const radiusMm = 36 / Math.max(viewport.zoom, 0.0001)
    const candidates = snapSpatialIndex.candidateObjectIds(point, radiusMm)
    return snapToWallHost(point, planProject, viewport, openingWidthMm, 36, candidates)
  }

  const applyPlacementDimensions = (point: [number, number], refs: { refX?: number; refY?: number }, rawPoint: [number, number] = point): [number, number] =>
    applyPlanCanvasPlacementDimensions(point, refs, rawPoint, { dimensionInputX, dimensionInputY, dimensionAnchorX, dimensionAnchorY, displayUnit })

  const constrainGridCopyToParallelOffset = (point: [number, number], source: Parameters<typeof gridLineEndpoints>[0]): [number, number] => {
    return constrainPlanCanvasGridCopyToParallelOffset(point, source, gridLineEndpoints)
  }

  const toggleDimensionReferenceMode = () => {
    setPreference('dimensionReferenceMode', mode => mode === 'center' ? 'edge' : 'center')
    // Keep the entered distance and re-anchor it to the chosen center/edge reference.
    setDimensionAnchorX(null); setDimensionAnchorY(null)
  }

  const applyOpeningDistance = (wallSnap: WallHostSnapResult, rawPoint: [number, number], openingWidthMm: number): WallHostSnapResult => {
    const refs = openingDimensionRefs(wallSnap.point_mm, planProject, wallSnap, dimensionReferenceMode)
    const point: [number, number] = [...wallSnap.point_mm]
    const valueText = refs.axis === 'x' ? dimensionInputX : dimensionInputY
    const anchor = refs.axis === 'x' ? dimensionAnchorX ?? refs.refX : dimensionAnchorY ?? refs.refY
    const value = parseLengthMm(valueText, displayUnit)
    if (valueText.trim() && anchor !== undefined && value !== null && value >= 0) {
      const rawCoordinate = refs.axis === 'x' ? rawPoint[0] : rawPoint[1]
      const direction = rawCoordinate < anchor ? -1 : 1
      const center = anchor + direction * (value + openingWidthMm / 2)
      if (refs.axis === 'x') point[0] = Math.round(center)
      else point[1] = Math.round(center)
    }
    const offset = projectPointToWallOffsetMm(point, wallSnap.wall_start_mm, wallSnap.wall_end_mm, openingWidthMm)
    if (offset === undefined) return wallSnap
    const dx = wallSnap.wall_end_mm[0] - wallSnap.wall_start_mm[0], dy = wallSnap.wall_end_mm[1] - wallSnap.wall_start_mm[1]
    const length = Math.hypot(dx, dy)
    const adjustedPoint: [number, number] = [Math.round(wallSnap.wall_start_mm[0] + dx / length * offset), Math.round(wallSnap.wall_start_mm[1] + dy / length * offset)]
    const axis = refs.axis
    return { ...wallSnap, point_mm: adjustedPoint, offset_along_wall_mm: Math.round(offset), description: `${wallSnap.description}${point[axis === 'x' ? 0 : 1] !== wallSnap.point_mm[axis === 'x' ? 0 : 1] ? ' · ระยะกำหนดเอง' : ''}` }
  }
  useEffect(() => {
    if (!activeSnap || !usesPlacementDimensions(activeTool)) return
    if ((activeTool === 'door' || activeTool === 'window') && activeWallSnap) {
      const typeId = activeTool === 'door' ? 'door_window.door' : 'door_window.window'
      const mark = activeTool === 'door' ? activeDoorTypeMark : activeWindowTypeMark
      const type = project.types.find(candidate => candidate.object_type === typeId && candidate.name.toLowerCase() === mark.toLowerCase())
      const width = Number(type?.parameters?.width_mm ?? (activeTool === 'door' ? 800 : 1200))
      const adjusted = applyOpeningDistance(activeWallSnap, activeSnap.point_mm, width)
      setActiveWallSnap(adjusted); setActiveSnap({ ...activeSnap, point_mm: adjusted.point_mm, description: adjusted.description })
    } else {
      const point = applyPlacementDimensions(activeSnap.point_mm, findTemporaryDimensionRefs(activeSnap.point_mm, planProject, undefined, dimensionReferenceMode), activeSnap.point_mm)
      if (point[0] !== activeSnap.point_mm[0] || point[1] !== activeSnap.point_mm[1]) setActiveSnap({ ...activeSnap, point_mm: point, kind: 'free', target_id: undefined, description: `${activeSnap.description} · ระยะกำหนดเอง` })
    }
  }, [dimensionInputX, dimensionInputY, dimensionAnchorX, dimensionAnchorY, dimensionReferenceMode, activeTool])

  const resolveReferencePath = useCallback((start: [number, number], end: [number, number], widthMm: number): [[number, number], [number, number]] => {
    return resolvePlanCanvasReferencePath(start, end, widthMm, placementReference)
  }, [placementReference])

  const constrainLineSnap = useCallback((snap: SnapResult, pointerPoint: [number, number], start: [number, number], lockAxis: boolean, reference?: LinearReference): SnapResult => {
    return constrainPlanCanvasLineSnap(snap, pointerPoint, start, lockAxis, reference, {
      lineConstraintMode, viewportZoom: viewport.zoom, drawLength: drawLengthMeters,
      drawAngle: drawAngleDegrees, displayUnit,
    })
  }, [drawLengthMeters, drawAngleDegrees, lineConstraintMode, viewport.zoom, displayUnit])

  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [pickCandidates, setPickCandidates] = useState<string[]>([])
  const pickCandidatesRef = useRef<string[]>([])
  const setCandidates = (ids: string[]) => {
    if (ids.join('|') !== pickCandidatesRef.current.join('|')) {
      pickCandidatesRef.current = ids
      setPickCandidates(ids)
    }
  }
  const cyclePick = useCallback((reverse = false) => {
    const ids = pickCandidatesRef.current.filter(id => !!planProject.objects[id])
    if (ids.length < 2) return
    const current = ids.indexOf(hoveredId ?? selectedId ?? '')
    const next = ids[(current + (reverse ? -1 : 1) + ids.length) % ids.length]
    setHoveredId(next)
    onSelectionChange?.([next], next)
    onSelectObject(next)
  }, [hoveredId, selectedId, onSelectObject, onSelectionChange, planProject])
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || activeTool !== 'select' || pickCandidatesRef.current.length < 2) return
      if (document.querySelector('[role="dialog"]')) return
      if (event.target instanceof HTMLElement && (event.target.matches('input,select,textarea,button,a') || event.target.isContentEditable)) return
      event.preventDefault()
      cyclePick(event.shiftKey)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [cyclePick, activeTool])
  useEffect(() => { setCandidates([]) }, [activeTool, planProject])
  const stairPreview = useMemo(() => {
    if (activeTool !== 'stair' || !stairStartPoint || !activeSnap) return null
    try { return stairFromRun(project, stairStartPoint, activeSnap.point_mm, stairOptions) } catch { return null }
  }, [activeTool, stairStartPoint, activeSnap, stairOptions, project])
  const [isPanning, setIsPanning] = useState(false)
  const [objectContextMenu, setObjectContextMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [selectionBox, setSelectionBox] = useState<{ start: [number, number]; end: [number, number] } | null>(null)
  const [manipulationPreview, setManipulationPreview] = useState<{ project: ProjectDocument; ids: string[]; valid: boolean } | null>(null)
  const [dragPreviewPoint, setDragPreviewPoint] = useState<[number, number] | null>(null)
  const dragDimensionX = dragDimensionInput.moveX
  const dragDimensionY = dragDimensionInput.moveY
  const resizeDimensionWidth = dragDimensionInput.width
  const resizeDimensionHeight = dragDimensionInput.height
  const resizeDimensionLength = dragDimensionInput.length
  const setResizeDimensionWidth = dragDimensionInput.setWidth
  const setResizeDimensionHeight = dragDimensionInput.setHeight
  const setResizeDimensionLength = dragDimensionInput.setLength
  const manualDragPointRef = dragDimensionInput.manualPointRef
  const lastPreviewValidationRef = useRef<{ at: number; valid: boolean }>({ at: 0, valid: true })
  const panStartRef = useRef<[number, number]>([0, 0])
  const selectionStartRef = useRef<[number, number] | null>(null)
  const pointerPositionsRef = useRef(new Map<number, [number, number]>())
  const pinchRef = useRef<{ distance: number; center: [number, number] } | null>(null)
  const pinchActiveRef = useRef(false)
  const longPressTimerRef = useRef<number | null>(null)
  const longPressStartRef = useRef<{ pointerId: number; point: [number, number] } | null>(null)
  const eraseActiveRef = useRef(false)
  const erasedIdsRef = useRef(new Set<string>())
  const selectionAdditiveRef = useRef(false)
  const currentViewportRef = useRef(viewport)
  currentViewportRef.current = viewport

  // Direct-manipulation state for objects whose geometry can move in plan.
  const [draggingObject, setDraggingObject] = useState<PlanCanvasDraggingObject | null>(null)

  const clearPointerDrag = useCallback(() => {
    manualDragPointRef.current = null
    setDraggingObject(null)
    setDragPreviewPoint(null)
    setManipulationPreview(null)
    setIsPanning(false)
    setResizeDimensionWidth('')
    setResizeDimensionHeight('')
    setResizeDimensionLength('')
  }, [setResizeDimensionWidth, setResizeDimensionHeight, setResizeDimensionLength])

  const handlePointerCancel = usePlanCanvasPointerCancel({
    longPressTimerRef, longPressStartRef, pointerPositionsRef, pinchRef, pinchActiveRef,
    selectionStartRef, setSelectionBox, eraseActiveRef, erasedIdsRef, cancelDragGesture: clearPointerDrag,
  })

  // Door handing state (can cycle with Spacebar)
  const setDoorHanding = (value: DoorHanding | ((current: DoorHanding) => DoorHanding)) => setPreference('doorHanding', value)

  const cancelCurrentPlacement = () => {
    const pendingState = hasPendingToolStep({ draggingObject, objectContextMenu, stairStartPoint, gridStartPoint, gridCopySourceId, beamStartNode, wallStartNode, roomSeparatorStart, slabBoundary, calibrationP1, tapeMeasure, dimensionInputX, dimensionInputY, drawLengthMeters, drawAngleDegrees, gridSystemError })
    const escapeAction = resolveEscapeAction(activeTool, pendingState, Boolean(selectedId || selectedIds.length))
    setObjectContextMenu(null)
    clearPointerDrag()
    placement.resetPlacementDrafts()
    if (escapeAction === 'exit-tool') onActivateTool?.('select')
    else if (escapeAction === 'clear-selection') {
      if (onSelectionChange) onSelectionChange([], null)
      else onSelectObject(null)
    }
  }

  useEffect(() => {
    if (!activeSnap) return
    const isPolygonTool = isPolygonInteraction(activeTool)
    const isTwoPointTool = isTwoPointInteraction(activeTool)
    const start = activeTool === 'wall' ? wallStartNode : activeTool === 'beam' ? beamStartNode : activeTool === 'stair' && stairStartPoint ? { point_mm: stairStartPoint } : activeTool === 'grid' && gridStartPoint ? { point_mm: gridStartPoint } : isTwoPointTool && roomSeparatorStart ? { point_mm: roomSeparatorStart } : isPolygonTool && slabBoundary.length ? { point_mm: slabBoundary[slabBoundary.length - 1] } : null
    if (!start) return
    const constrained = constrainLineSnap(activeSnap, activeSnap.point_mm, start.point_mm, false, 'reference' in start ? start.reference : undefined)
    if (constrained.point_mm[0] !== activeSnap.point_mm[0] || constrained.point_mm[1] !== activeSnap.point_mm[1]) setActiveSnap(constrained)
  }, [activeTool, activeSnap, wallStartNode, beamStartNode, stairStartPoint, gridStartPoint, roomSeparatorStart, slabBoundary, drawLengthMeters, drawAngleDegrees, constrainLineSnap])

  // Space cycles the active placement reference for linear elements, or door handing.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      if (e.key === 'Tab' && draggingObject) {
        e.preventDefault()
        requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.cf-manipulation-dimensions input')?.focus())
      } else if (e.code === 'Space') {
        if (activeTool === 'door') {
          e.preventDefault()
          setDoorHanding((prev) => {
            const cycle: Record<DoorHanding, DoorHanding> = {
              left_in: 'left_out',
              left_out: 'right_out',
              right_out: 'right_in',
              right_in: 'left_in',
            }
            return cycle[prev] || 'left_in'
          })
        } else if (activeTool === 'wall' || activeTool === 'beam') {
          e.preventDefault()
          setPreference('placementReference', (prev) => {
            const cycle = { centerline: 'left_face', left_face: 'right_face', right_face: 'centerline' } as const
            return cycle[prev]
          })
        } else if (selectedId && project.objects[selectedId] && isDoorObject(project.objects[selectedId])) {
          e.preventDefault()
          if (onFlipDoorHanding) {
            onFlipDoorHanding(selectedId)
          }
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cancelCurrentPlacement()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTool, selectedId, project.objects, onFlipDoorHanding, onActivateTool, clearPointerDrag, draggingObject, objectContextMenu, stairStartPoint, gridStartPoint, gridCopySourceId, beamStartNode, wallStartNode, roomSeparatorStart, slabBoundary, calibrationP1, tapeMeasure, dimensionInputX, dimensionInputY, drawLengthMeters, drawAngleDegrees, gridSystemError])

  const editableSelectionIds = selectedIds.length ? selectedIds : selectedId ? [selectedId] : []
  const findEditHandle = (screenPoint: [number, number]) => findPlanCanvasEditHandle({ planProject, editableSelectionIds, viewport, screenPoint, onFlipDoorHanding })

  const buildDragCommands = (drag: PlanDragGesture, rawWorld: [number, number], ctrlKey: boolean): CommandRequest[] => buildPlanCanvasDragCommands({ planProject, drag, rawWorld, ctrlKey, viewport, snapPlanPoint })

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const ghost = buildPlanPlacementGhost({
      activeTool, activeSnap, project, activeColumnTypeMark, activeFoundationTypeMark, activeBeamTypeMark,
      activeWallTypeMark, activeDoorTypeMark, activeWindowTypeMark, beamStartNode, wallStartNode, activeWallSnap,
      doorHanding, stairPreview, stairStartPoint, resolveReferencePath,
    })
    const calibrationOverlay =
      activeTool === 'calibrate'
        ? {
            point1_mm: calibrationP1,
            point2_mm: null,
            mouse_mm: calibrationMousePoint,
          }
        : null

    drawPlanCanvasBaseScene({
      ctx, width: canvas.width, height: canvas.height, project, planProject, viewport, selectedIds,
      editableSelectionIds, hoveredId, activeSnap, ghost, underlay, calibrationOverlay, labelMode,
      labelVisibility, planDiscipline, manipulationPreview, externalManipulationPreview, coordination,
      coordinationSeverities, coordinationFocusSelection,
    })
    drawPlanCanvasSelectionHandles(ctx, editableSelectionIds, planProject, viewport, displayUnit, manipulationPreview)
    drawPlanCanvasToolOverlays({
      ctx, activeTool, gridStartPoint, activeSnap, planProject, viewport, gridCopySourceId, tapeMeasure,
      displayUnit, activeWallSnap, project, activeDoorTypeMark, activeWindowTypeMark, dimensionReferenceMode,
      selectionBox, roomSeparatorStart, pipeSystem, fixtureKind, slabBoundary,
    })
  }, [
    project,
    displayUnit,
    labelMode,
    labelVisibility,
    planProject,
    viewport,
    selectedIds,
    selectedId,
    editableSelectionIds,
    hoveredId,
    activeSnap,
    activeWallSnap,
    activeTool,
    gridStartPoint,
    stairStartPoint,
    stairPreview,
    gridCopySourceId,
    dimensionInputX,
    dimensionInputY,
    dimensionAnchorX,
    dimensionAnchorY,
    activeColumnTypeMark,
    activeFoundationTypeMark,
    activeBeamTypeMark,
    activeWallTypeMark,
    activeDoorTypeMark,
    activeWindowTypeMark,
    activeSlabTypeMark,
    slabBoundary,
    roomSeparatorStart,
    roofShape,
    roofSlopeDeg,
    roofThicknessMm,
    roofElevationOffsetMm,
    roofMaterial,
    pipeSystem,
    fixtureKind,
    beamStartNode,
    wallStartNode,
    resolveReferencePath,
    doorHanding,
    underlay,
    calibrationP1,
    calibrationMousePoint,
    selectionBox,
    dimensionReferenceMode,
    tapeMeasure,
    coordination,
    coordinationSeverities,
    coordinationFocusSelection,
    manipulationPreview,
    externalManipulationPreview,
  ])

  useEffect(() => {
    redraw()
  }, [redraw])

  const redrawRef = useRef(redraw)
  redrawRef.current = redraw

  const previewDragAt = (drag: PlanDragGesture, point: [number, number], ctrlKey: boolean, manual = false) => {
    manualDragPointRef.current = manual ? point : null
    setDragPreviewPoint(point)
    const commands = buildDragCommands(drag, point, ctrlKey)
    if (!commands.length) { setManipulationPreview(null); return { commands, valid: false } }
    const optimistic = optimisticManipulationProject(planProject, commands)
    dragDimensionInput.syncFromPreview(drag, point, optimistic, manual)
    const now = performance.now()
    const validation = (manual || now - lastPreviewValidationRef.current.at >= 50) ? onPreviewManipulation?.(commands) : undefined
    if (validation) lastPreviewValidationRef.current = { at: now, valid: validation.valid }
    const idsFromCommands = commands.map(command => String(command.input.object_id ?? command.input.id ?? '')).filter(Boolean)
    const relatedIds = new Set(idsFromCommands)
    for (const command of commands) {
      const id = String(command.input.object_id ?? command.input.id ?? '')
      const object = planProject.objects[id]
      if (command.name === 'MoveWall' || command.name === 'UpdateWallEndpoints') {
        for (const child of Object.values(planProject.objects)) if ((isDoorObject(child) || isWindowObject(child)) && child.module_data.wall_id === id) relatedIds.add(child.id)
      }
      if (command.name === 'MoveColumn' && object) {
        for (const child of Object.values(planProject.objects)) {
          if ((isBeamObject(child) && (child.module_data.start_column_id === id || child.module_data.end_column_id === id)) ||
              (isFoundationObject(child) && (child.module_data.supported_column_id === id || child.host_refs.includes(id)))) relatedIds.add(child.id)
        }
      }
    }
    const valid = validation?.valid ?? lastPreviewValidationRef.current.valid
    const ids = validation?.affected_object_ids?.length ? validation.affected_object_ids : [...relatedIds]
    setManipulationPreview({ project: valid && validation ? validation.project : optimistic, ids, valid })
    return { commands, valid }
  }

  const updateDragDimension = (axis: 'x' | 'y', value: string) => dragDimensionInput.updateMove(draggingObject, axis, value, previewDragAt)
  const updateResizeDimension = (axis: 'width' | 'height' | 'length', value: string) => dragDimensionInput.updateResize(draggingObject, axis, value, previewDragAt)

  const commitDragDimensions = () => {
    if (!draggingObject || !manualDragPointRef.current) return
    const { commands, valid } = previewDragAt(draggingObject, manualDragPointRef.current, true, true)
    if (commands.length && valid) onCommitManipulation?.(commands)
    else if (commands.length) onManipulationRejected?.(['ไม่สามารถใช้มิติที่ระบุได้'])
    manualDragPointRef.current = null
    setDraggingObject(null); setDragPreviewPoint(null); setManipulationPreview(null)
    dragDimensionInput.clearResizeValues()
    canvasRef.current?.focus({ preventScroll: true })
  }

  // Observe the drawing area, including changes from collapsing the inspector.
  // Canvas bitmap dimensions must not contribute to the flex item's minimum size.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const resizeCanvas = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = container.getBoundingClientRect()
      const width = Math.round(rect.width), height = Math.round(rect.height)
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height
      redrawRef.current()
    }

    const observer = new ResizeObserver(resizeCanvas)
    observer.observe(container)
    resizeCanvas()
    return () => observer.disconnect()
  }, [])

  const findHitObject = (worldPoint_mm: [number, number], preferWall = false, excluded = new Set<string>()): string | null =>
    findPlanHitObject(worldPoint_mm, planProject, project, viewport.zoom, preferWall, excluded)

  const findCandidates = (point: [number, number], preferWall = false) => {
    return resolvePlanCanvasPickCandidates(planProject, findHitObject, point, preferWall)
  }

  // Pointer move handler
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (!rect) return
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    if (handlePlanCanvasNavigationPointerMove({
      pointerPositionsRef, pinchRef, longPressStartRef, longPressTimerRef, selectionStartRef,
      setSelectionBox, eraseActiveRef, erasedIdsRef, isPanning, panStartRef, viewport, setViewport,
      findCandidates,
    }, e.pointerId, e.pointerType, [screenX, screenY])) return

    handlePlanCanvasAuthoringPointerMove({
      event: e,
      screenPoint: [screenX, screenY],
      canvas,
      activeTool,
      viewport,
      draggingObject,
      hoveredId,
      resolveSnap: (rawWorld, ctrlKey, shiftKey) => resolvePlanCanvasPointerSnap({
        activeTool, rawWorld, ctrlKey, shiftKey, project, planProject,
        activeDoorTypeMark, activeWindowTypeMark, draggingObjectId: draggingObject?.id, gridCopySourceId,
        dimensionReferenceMode,
        lineState: { beamStartNode, wallStartNode, stairStartPoint, gridStartPoint, roomSeparatorStart, slabBoundary },
        snapPlanPoint, snapPlanWallHost, applyOpeningDistance, resolveLineSnap: constrainLineSnap,
        applyPlacementDimensions, constrainGridCopyToParallelOffset,
      }),
      findCandidates,
      setActiveWallSnap,
      setActiveSnap,
      setTapeMeasure,
      setCalibrationMousePoint,
      setCandidates,
      setHoveredId,
      setManipulationPreview,
      onCursorChange,
      previewDragAt,
    })
  }

  // Pointer down
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    if (handlePlanCanvasPointerDownNavigation({
      event: e,
      screenPoint: [screenX, screenY],
      activeTool,
      viewport,
      pointerPositionsRef,
      pinchRef,
      pinchActiveRef,
      longPressStartRef,
      longPressTimerRef,
      selectionStartRef,
      panStartRef,
      setSelectionBox,
      setDraggingObject,
      setIsPanning,
      setObjectContextMenu,
      findHitObject,
      onSelectionChange,
      onSelectObject,
      setPointerCapture: pointerId => canvasRef.current?.setPointerCapture(pointerId),
    })) return

    if (e.button === 0) {
      setObjectContextMenu(null)
      const rawWorld = screenToWorld([screenX, screenY], viewport)
      let snap = e.ctrlKey
        ? { point_mm: rawWorld, kind: 'free' as const, description: 'Free / อิสระ (Ctrl)' }
        : snapPlanPoint(rawWorld)
      snap = resolvePlanCanvasLineSnap(snap, rawWorld, e.shiftKey, activeTool, {
        beamStartNode, wallStartNode, stairStartPoint, gridStartPoint, roomSeparatorStart, slabBoundary,
      }, constrainLineSnap)

      if (activeTool === 'gridCopy' && gridCopySourceId) {
        const source = planProject.objects[gridCopySourceId]
        if (source && isGridObject(source)) {
          const [start, end] = gridLineEndpoints(source)
          const positioned = applyPlacementDimensions(snap.point_mm, { refX: start[0], refY: start[1] }, rawWorld)
          const destination = e.shiftKey ? constrainGridCopyToParallelOffset(positioned, source) : positioned
          onCopyGrid?.(source.id, destination, [end[0] + destination[0] - start[0], end[1] + destination[1] - start[1]])
          clearDimensionOverrides()
        }
      } else if (activeTool === 'erase') {
        eraseActiveRef.current = true
        erasedIdsRef.current.clear()
        for (const id of findCandidates(rawWorld, true)) {
          erasedIdsRef.current.add(id)
        }
        e.currentTarget.setPointerCapture(e.pointerId)
      } else if (activeTool === 'select') {
        handlePlanCanvasSelectionPointerDown({
          event: e,
          screenPoint: [screenX, screenY],
          rawWorld,
          displayUnit,
          planProject,
          project,
          selectedIds,
          hoveredId,
          findEditHandle,
          findCandidates,
          findHitObject,
          setCandidates,
          setHoveredId,
          setDraggingObject,
          setManipulationPreview,
          setResizeDimensionWidth,
          setResizeDimensionHeight,
          setResizeDimensionLength,
          selectionStartRef,
          selectionAdditiveRef,
          lastPreviewValidationRef,
          onSelectionChange,
          onSelectObject,
        })
      } else if (activeTool === 'column' || activeTool === 'foundation' || activeTool === 'door' || activeTool === 'window' || activeTool === 'fixture') {
        commitPlanCanvasPointPlacement({
          activeTool,
          rawWorld,
          snap,
          project,
          planProject,
          activeDoorTypeMark,
          activeWindowTypeMark,
          activeWallSnap,
          doorHanding,
          fixtureKind,
          snapPlanWallHost,
          applyOpeningDistance,
          clearDimensionOverrides,
          onCommitColumn,
          onCommitFoundation,
          onCommitDoor,
          onCommitWindow,
          onCommitFixture,
          onSelectionChange,
          onSelectObject,
        })
      } else if (activeTool === 'beam' || activeTool === 'wall') {
        commitPlanCanvasLinePlacementPoint({
          activeTool,
          snap,
          planProject,
          project,
          activeBeamTypeMark,
          activeWallTypeMark,
          placementReference,
          beamStartNode,
          wallStartNode,
          setBeamStartNode,
          setWallStartNode,
          setDrawLengthMeters,
          setDrawAngleDegrees,
          resolveReferencePath,
          clearDimensionOverrides,
          onCommitBeam,
          onCommitWall,
        })
      } else if (isTwoPointInteraction(activeTool) && ['roomSeparator', 'pipe', 'cabinet', 'moulding'].includes(activeTool)) {
        commitPlanCanvasConnectedPlacementPoint({
          activeTool: activeTool as 'roomSeparator' | 'pipe' | 'cabinet' | 'moulding',
          point: snap.point_mm,
          startPoint: roomSeparatorStart,
          pipeSystem,
          onStartPointChange: setRoomSeparatorStart,
          onDrawLengthChange: setDrawLengthMeters,
          onDrawAngleChange: setDrawAngleDegrees,
          clearDimensionOverrides,
          onCommitRoomSeparator,
          onCommitPipeRoute,
          onCommitCabinet,
          onCommitMoulding,
        })
      } else if (isPolygonInteraction(activeTool)) {
        commitPlanCanvasPolygonPoint({
          activeTool,
          clickCount: e.detail,
          pointMm: snap.point_mm,
          zoom: viewport.zoom,
          boundary: slabBoundary,
          selectedId,
          selectedObjectType: planProject.objects[selectedId ?? '']?.object_type,
          roofOptions: { shape: roofShape, slope_deg: roofSlopeDeg, thickness_mm: roofThicknessMm, elevation_offset_mm: roofElevationOffsetMm, material: roofMaterial },
          onCommitSlab,
          onCommitArchitecturalFloor,
          onCommitCeiling,
          onCommitRoof,
          onCommitSurfaceVoid,
          onBoundaryChange: setSlabBoundary,
          onDrawLengthChange: setDrawLengthMeters,
          onDrawAngleChange: setDrawAngleDegrees,
          clearDimensionOverrides,
        })
      } else if (activeTool === 'grid') {
        commitPlanCanvasGridPoint({
          point: snap.point_mm,
          startPoint: gridStartPoint,
          sequenceStyle: gridSequenceStyle,
          onStartPointChange: setGridStartPoint,
          onDrawLengthChange: setDrawLengthMeters,
          onDrawAngleChange: setDrawAngleDegrees,
          clearDimensionOverrides,
          onCommitGrid,
        })
      } else if (activeTool === 'gridSystem') {
        commitPlanCanvasGridSystemPoint({
          point: snap.point_mm,
          displayUnit,
          xIntervalsText: gridXIntervals,
          yIntervalsText: gridYIntervals,
          xFirstTag: gridXFirstTag,
          yFirstTag: gridYFirstTag,
          setError: setGridSystemError,
          onCommit: onCommitGridSystem,
          clearDimensionOverrides,
        })
      } else if (activeTool === 'measure') {
        if (!tapeMeasure || tapeMeasure.complete) setTapeMeasure({ start: snap.point_mm, end: snap.point_mm, complete: false })
        else setTapeMeasure({ ...tapeMeasure, end: snap.point_mm, complete: true })
      } else if (activeTool === 'calibrate') {
        if (!calibrationP1) {
          setCalibrationP1(snap.point_mm)
        } else {
          const dist = Math.hypot(
            snap.point_mm[0] - calibrationP1[0],
            snap.point_mm[1] - calibrationP1[1]
          )
          if (dist >= 10 && onStartCalibrationModal) {
            onStartCalibrationModal(dist, calibrationP1, snap.point_mm)
          }
          setCalibrationP1(null)
          setCalibrationMousePoint(null)
        }
      } else if (activeTool === 'stair') {
        if (!stairStartPoint) { setStairStartPoint(snap.point_mm); setStairError('') }
        else try {
          const stair = stairFromRun(project, stairStartPoint, snap.point_mm, stairOptions)
          if (onCommitStair?.(stair)) { setStairStartPoint(null); setStairError(''); onActivateTool?.('select') }
        } catch (error) { setStairError(error instanceof Error ? error.message : 'ไม่สามารถสร้างบันไดได้') }
        clearDimensionOverrides()
      }
    }
  }

  // Pointer up
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    handlePlanCanvasPointerUp({
      event: e,
      canvas: canvasRef.current,
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
    })
  }
  const dimensionHostAxis = activeWallSnap
    ? Math.abs(activeWallSnap.wall_end_mm[0] - activeWallSnap.wall_start_mm[0]) >= Math.abs(activeWallSnap.wall_end_mm[1] - activeWallSnap.wall_start_mm[1]) ? 'x' : 'y'
    : null
  const isHostedOpeningPlacement = (activeTool === 'door' || activeTool === 'window') && !!activeWallSnap
  const copyDimensionSource = activeTool === 'gridCopy' && gridCopySourceId ? planProject.objects[gridCopySourceId] : null
  const copyDimensionStart = copyDimensionSource && isGridObject(copyDimensionSource) ? gridLineEndpoints(copyDimensionSource)[0] : null
  const dimensionReferences = activeSnap
    ? copyDimensionStart ? { refX: copyDimensionStart[0], refY: copyDimensionStart[1] } : activeWallSnap ? openingDimensionRefs(activeSnap.point_mm, planProject, activeWallSnap, dimensionReferenceMode) : findTemporaryDimensionRefs(activeSnap.point_mm, planProject, undefined, dimensionReferenceMode)
    : { refX: undefined, refY: undefined }
  const showXDimension = !!activeSnap && (dimensionHostAxis ? dimensionHostAxis === 'x' : dimensionReferences.refX !== undefined)
  const showYDimension = !!activeSnap && (dimensionHostAxis ? dimensionHostAxis === 'y' : dimensionReferences.refY !== undefined)
  const xDimensionAnchor = dimensionAnchorX ?? dimensionReferences.refX
  const yDimensionAnchor = dimensionAnchorY ?? dimensionReferences.refY
  const activeOpeningWidth = activeWallSnap
    ? Number(project.types.find(type => type.object_type === (activeTool === 'door' ? 'door_window.door' : 'door_window.window') && type.name.toLowerCase() === (activeTool === 'door' ? activeDoorTypeMark : activeWindowTypeMark).toLowerCase())?.parameters?.width_mm ?? (activeTool === 'door' ? 800 : 1200))
    : 0
  const dimensionPoint = activeSnap && activeWallSnap ? openingDimensionPoint(activeWallSnap, dimensionReferences as { refX?: number; refY?: number; axis: 'x' | 'y' }, activeOpeningWidth) : activeSnap?.point_mm
  const xDimensionDisplay = dimensionInputX || (dimensionPoint && xDimensionAnchor !== undefined ? formatLengthMm(Math.abs(dimensionPoint[0] - xDimensionAnchor), displayUnit) : '')
  const yDimensionDisplay = dimensionInputY || (dimensionPoint && yDimensionAnchor !== undefined ? formatLengthMm(Math.abs(dimensionPoint[1] - yDimensionAnchor), displayUnit) : '')
  const dimensionOverlayPosition = activeSnap ? worldToScreen(activeSnap.point_mm, viewport) : null
  const supportsPlacementDimensions = usesPlacementDimensions(activeTool)
  const hasPolygonSegment = ['slab', 'slabVoid', 'archFloor', 'ceiling', 'roof'].includes(activeTool) && slabBoundary.length > 0
  const hasLineGeometryInput = !!stairStartPoint || !!wallStartNode || !!beamStartNode || !!roomSeparatorStart || hasPolygonSegment || (activeTool === 'grid' && !!gridStartPoint)

  const commitPlacementAtCursor = () => {
    const canvas = canvasRef.current
    if (!canvas || !activeSnap || (!supportsPlacementDimensions && activeTool !== 'measure' && activeTool !== 'calibrate')) return
    const rect = canvas.getBoundingClientRect()
    const [x, y] = worldToScreen(activeSnap.point_mm, viewport)
    canvas.focus({ preventScroll: true })
    canvas.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      buttons: 1,
      detail: 1,
      clientX: rect.left + x,
      clientY: rect.top + y,
    }))
  }

  const finishPolygonPlacement = () => {
    if (slabBoundary.length < 3) return false
    if (activeTool === 'slab') onCommitSlab(slabBoundary)
    else if (activeTool === 'archFloor') onCommitArchitecturalFloor?.(slabBoundary)
    else if (activeTool === 'ceiling') onCommitCeiling?.(slabBoundary)
    else if (activeTool === 'roof') onCommitRoof?.(slabBoundary, { shape: roofShape, slope_deg: roofSlopeDeg, thickness_mm: roofThicknessMm, elevation_offset_mm: roofElevationOffsetMm, material: roofMaterial })
    else if (activeTool === 'slabVoid' && selectedId && ['structure.slab', 'architecture.floor', 'architecture.ceiling', 'roof.system'].includes(planProject.objects[selectedId]?.object_type ?? '')) onCommitSurfaceVoid(selectedId, slabBoundary)
    else return false
    setSlabBoundary([])
    clearDimensionOverrides()
    return true
  }

  const handleCanvasDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!['slab', 'slabVoid', 'archFloor', 'ceiling', 'roof'].includes(activeTool)) return
    event.preventDefault()
    finishPolygonPlacement()
  }

  const commitActivePlacement = (fromInput = false) => {
    const polygonTool = ['slab', 'slabVoid', 'archFloor', 'ceiling', 'roof'].includes(activeTool)
    if (polygonTool && !fromInput && finishPolygonPlacement()) return
    commitPlacementAtCursor()
  }

  const { handlePlacementInputKeyDown, handleCanvasDimensionKeyDown, handleDimensionInputKeyDown } = usePlanCanvasPlacementKeyboard({
    activeTool, supportsPlacementDimensions, dimensionHostAxis, dimensionKeyboardAxis, dimensionAnchorX, dimensionAnchorY,
    dimensionReferences, dimensionInputX, dimensionInputY, showXDimension, showYDimension,
    dimensionInputXRef, dimensionInputYRef, canvasRef, setDimensionKeyboardAxis, setDimensionAnchorX,
    setDimensionAnchorY, setDimensionInputX, setDimensionInputY, commitActivePlacement, cancelCurrentPlacement,
    toggleDimensionReferenceMode,
  })
  const selectionHint = editableSelectionIds.some(id => planProject.objects[id]?.object_type === 'interior.cabinet_run')
    ? 'เลือกบิลท์อิน · ลากด้ามสีม่วงเพื่อหมุน โดยคงตำแหน่งและขนาด · Esc ล้างการเลือก'
    : 'เลือก · คลิกเลือกหรือ ลากครอบวัตถุ · Tab สลับวัตถุซ้อน · Esc ล้างการเลือก'
  const placementStatus = resolveToolInteractionStatus(activeTool, {
    selectionHint, wallStartNode, beamStartNode, gridStartPoint, gridCopySourceId, stairStartPoint, roomSeparatorStart,
    slabBoundary, tapeMeasure, calibrationP1, gridSystemError, pipeSystem, fixtureKind,
    lineConstraintLabel: ({ auto: 'อัตโนมัติ: ขนาน/ตั้งฉาก', none: 'อิสระ', parallel: 'ขนาน', perpendicular: 'ตั้งฉาก' } as const)[lineConstraintMode],
    placementReferenceLabel: ({ centerline: 'กึ่งกลาง', left_face: 'ชิดซ้าย', right_face: 'ชิดขวา' } as const)[placementReference],
    snapCount: snapModes.length,
  })
  const placementHint = placementStatus?.instruction ?? null
  const pendingPlacementStep = hasPendingToolStep({ draggingObject, objectContextMenu, stairStartPoint, gridStartPoint, gridCopySourceId, beamStartNode, wallStartNode, roomSeparatorStart, slabBoundary, calibrationP1, tapeMeasure, dimensionInputX, dimensionInputY, drawLengthMeters, drawAngleDegrees, gridSystemError })
  const escapeAction = resolveEscapeAction(activeTool, pendingPlacementStep, Boolean(selectedId || selectedIds.length))
  const escapeLabel = escapeAction === 'cancel-step' ? 'Esc ยกเลิกขั้นตอนนี้' : escapeAction === 'clear-selection' ? 'Esc ล้างการเลือก' : escapeAction === 'exit-tool' ? 'Esc ออกจากเครื่องมือ' : ''
  const manipulationDimensions = draggingObject && dragPreviewPoint
    ? (() => {
        const original = planProject.objects[draggingObject.id]
        const preview = manipulationPreview?.project.objects[draggingObject.id] ?? original
        if (!original || !preview) return null
        const dx = dragPreviewPoint[0] - draggingObject.startWorldMm[0]
        const dy = dragPreviewPoint[1] - draggingObject.startWorldMm[1]
        const bounds = getPlanObjectBounds(preview)
        const data = preview.module_data as unknown as Record<string, unknown>
        const start = data.start_point_mm as [number, number] | undefined
        const end = data.end_point_mm as [number, number] | undefined
        const length = start && end ? Math.hypot(end[0] - start[0], end[1] - start[1]) : null
        return { dx, dy, width: bounds ? bounds[2] - bounds[0] : null, height: bounds ? bounds[3] - bounds[1] : null, length }
      })()
    : null
  const targetRectangleDimensions = draggingObject?.kind === 'column-corner' || draggingObject?.kind === 'foundation-corner'
  const targetOpeningWidth = draggingObject?.kind === 'opening-edge'
  const targetLineLength = draggingObject?.kind === 'wall-endpoint' || draggingObject?.kind === 'beam-endpoint'
  return (
    <div
      className="cf-plan-canvas"
      data-active-tool={activeTool}
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#fbfdff',
        cursor: isPanning ? 'grabbing' : activeTool === 'select' ? 'default' : 'crosshair',
      }}
    >
      <canvas
        ref={canvasRef}
        tabIndex={0}
        aria-label="แปลน: คลิกขวาหรือแตะค้างบนวัตถุเพื่อเปิดเมนูแก้ไขและลบ; กด Tab เพื่อสลับวัตถุที่ซ้อนกัน"
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onDoubleClick={handleCanvasDoubleClick}
        onContextMenu={event => event.preventDefault()}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        onKeyDown={handleCanvasDimensionKeyDown}
        onPointerCancel={handlePointerCancel}
        style={{ position: 'absolute', inset: 0, display: 'block', width: '100%', height: '100%', touchAction: 'none' }}
      />
      {objectContextMenu && planProject.objects[objectContextMenu.id] && <PlanCanvasObjectContextMenu
        object={planProject.objects[objectContextMenu.id]!}
        position={objectContextMenu}
        containerSize={{ width: containerRef.current?.clientWidth ?? 800, height: containerRef.current?.clientHeight ?? 600 }}
        onStartGridCopy={objectId => {
          setGridCopySourceId(objectId)
          onSelectionChange?.([objectId], objectId)
          onSelectObject(objectId)
          onActivateTool?.('gridCopy')
          setObjectContextMenu(null)
        }}
        onCopy={objectId => {
          onSelectionChange?.([objectId], objectId)
          onSelectObject(objectId)
          onCopyObjects?.([objectId])
          setObjectContextMenu(null)
        }}
        onEditProperties={objectId => {
          onSelectionChange?.([objectId], objectId)
          onSelectObject(objectId)
          onRequestEditProperties?.()
          setObjectContextMenu(null)
        }}
        onDelete={objectId => {
          onDeleteObjects?.([objectId])
          setObjectContextMenu(null)
        }}
      />}
      <PlanCanvasInteractionHints
        activeTool={activeTool}
        tapeMeasure={tapeMeasure}
        showSelectionHandleHint={editableSelectionIds.some(id => {
          const object = planProject.objects[id]
          return object && (isColumnObject(object) || isFoundationObject(object) || isWallObject(object) || isBeamObject(object) || isGridObject(object) || isDoorObject(object) || isWindowObject(object) || ['structure.slab', 'architecture.floor', 'architecture.ceiling', 'roof.system', 'architecture.room_separator', 'drainage.pipe_route', 'plumbing.pipe_route', 'decorative.moulding_run', 'interior.cabinet_run'].includes(object.object_type))
        })}
        placementStatus={placementStatus}
        placementHint={placementHint}
        escapeLabel={escapeLabel}
        pickCandidates={pickCandidates}
        hoveredId={hoveredId}
        project={planProject}
        onCyclePick={cyclePick}
        onHoverChange={setHoveredId}
        onSelectionChange={onSelectionChange}
        onSelectObject={onSelectObject}
      />
      {manipulationDimensions && dragPreviewPoint && draggingObject && <PlanCanvasDragDimensions
        mode={(targetRectangleDimensions ? 'rectangle' : targetOpeningWidth ? 'opening-width' : targetLineLength ? 'line-length' : 'move') as DragDimensionMode}
        displayUnit={displayUnit}
        values={{ x: dragDimensionX, y: dragDimensionY, width: resizeDimensionWidth, height: resizeDimensionHeight, length: resizeDimensionLength }}
        onChange={(field: DragDimensionField, value) => field === 'x' || field === 'y' ? updateDragDimension(field, value) : updateResizeDimension(field, value)}
        onCommit={commitDragDimensions}
        onCancel={() => { cancelCurrentPlacement(); canvasRef.current?.focus({ preventScroll: true }) }}
        readout={manipulationDimensions.length !== null
          ? `L ${formatLengthMm(manipulationDimensions.length, displayUnit)} ${displayUnit}`
          : manipulationDimensions.width !== null && manipulationDimensions.height !== null
            ? `W×H ${formatLengthMm(manipulationDimensions.width, displayUnit)} × ${formatLengthMm(manipulationDimensions.height, displayUnit)} ${displayUnit}`
            : null}
        style={{
          left: Math.max(8, Math.min(worldToScreen(dragPreviewPoint, viewport)[0] + 16, (containerRef.current?.clientWidth ?? 800) - 220)),
          top: Math.max(8, Math.min(worldToScreen(dragPreviewPoint, viewport)[1] + 16, (containerRef.current?.clientHeight ?? 600) - 92)),
        }}
      />}
      <PlanCanvasPlacementDimensions
        position={supportsPlacementDimensions ? dimensionOverlayPosition : null}
        containerSize={{ width: containerRef.current?.clientWidth ?? 800, height: containerRef.current?.clientHeight ?? 600 }}
        displayUnit={displayUnit}
        showX={showXDimension}
        showY={showYDimension}
        hasLineGeometryInput={hasLineGeometryInput}
        isHostedOpeningPlacement={isHostedOpeningPlacement}
        dimensionReferenceMode={dimensionReferenceMode}
        dimensionReferences={dimensionReferences}
        dimensionAnchorX={dimensionAnchorX}
        dimensionAnchorY={dimensionAnchorY}
        xDimensionDisplay={xDimensionDisplay}
        yDimensionDisplay={yDimensionDisplay}
        drawLengthMeters={drawLengthMeters}
        drawAngleDegrees={drawAngleDegrees}
        dimensionInputXRef={dimensionInputXRef}
        dimensionInputYRef={dimensionInputYRef}
        setDimensionKeyboardAxis={setDimensionKeyboardAxis}
        setDimensionAnchorX={setDimensionAnchorX}
        setDimensionAnchorY={setDimensionAnchorY}
        setDimensionInputX={setDimensionInputX}
        setDimensionInputY={setDimensionInputY}
        setDrawLengthMeters={setDrawLengthMeters}
        setDrawAngleDegrees={setDrawAngleDegrees}
        onDimensionKeyDown={handleDimensionInputKeyDown}
        onPlacementKeyDown={handlePlacementInputKeyDown}
        onToggleDimensionReference={toggleDimensionReferenceMode}
      />
      <PlanCanvasAuthoringControls
        project={project}
        activeTool={activeTool}
        displayUnit={displayUnit}
        preferences={preferences}
        open={authoringControlsOpen}
        pipeSystem={pipeSystem}
        fixtureKind={fixtureKind}
        roof={{ shape: roofShape, slopeDeg: roofSlopeDeg, thicknessMm: roofThicknessMm, elevationOffsetMm: roofElevationOffsetMm, material: roofMaterial }}
        stairOptions={stairOptions}
        stairError={stairError}
        gridSequenceStyle={gridSequenceStyle}
        gridStartPoint={gridStartPoint}
        gridSystem={{ xIntervals: gridXIntervals, yIntervals: gridYIntervals, xFirstTag: gridXFirstTag, yFirstTag: gridYFirstTag, error: gridSystemError }}
        lineReferenceDescription={(activeTool === 'beam' ? beamStartNode?.reference : wallStartNode?.reference)?.description}
        activeTypeMarks={{ column: activeColumnTypeMark, foundation: activeFoundationTypeMark, beam: activeBeamTypeMark, wall: activeWallTypeMark, door: activeDoorTypeMark, window: activeWindowTypeMark, slab: activeSlabTypeMark, roof: activeRoofTypeMark }}
        onOpenChange={setAuthoringControlsOpen}
        onPipeSystemChange={setPipeSystem}
        onFixtureKindChange={setFixtureKind}
        onRoofChange={updater => {
          const next = updater({ shape: roofShape, slopeDeg: roofSlopeDeg, thicknessMm: roofThicknessMm, elevationOffsetMm: roofElevationOffsetMm, material: roofMaterial })
          setRoofShape(next.shape)
          setRoofSlopeDeg(next.slopeDeg)
          setRoofThicknessMm(next.thicknessMm)
          setRoofElevationOffsetMm(next.elevationOffsetMm)
          setRoofMaterial(next.material)
        }}
        onStairOptionsChange={setStairOptions}
        onGridSequenceStyleChange={setGridSequenceStyle}
        onGridIntervalsChange={(axis, value) => {
          if (axis === 'x') setGridXIntervals(value)
          else setGridYIntervals(value)
          setGridSystemError('')
        }}
        onGridFirstTagChange={(axis, value) => axis === 'x' ? setGridXFirstTag(value) : setGridYFirstTag(value)}
        onPlacementReferenceChange={value => setPreference('placementReference', value)}
        onLineConstraintModeChange={value => setPreference('lineConstraintMode', value)}
        onSnapModeToggle={mode => setPreference('snapModes', current => current.includes(mode) ? current.filter(value => value !== mode) : [...current, mode])}
        onPlacementKeyDown={handlePlacementInputKeyDown}
        onChangeActiveTypeMark={onChangeActiveTypeMark}
        onOpenTypeManager={onOpenTypeManager}
      />      <div className="cf-canvas-zoom" aria-label="ควบคุมมุมมองแปลน">
        <button type="button" aria-label="ซูมออก" title="ซูมออก" onPointerDown={(event) => event.stopPropagation()} onClick={() => {
          const box = containerRef.current
          if (box) setViewport((current) => zoomAtScreenPoint(current, [box.clientWidth / 2, box.clientHeight / 2], 0.8))
        }}><ZoomOut size={16} /></button>
        <span aria-live="polite">{Math.round((viewport.zoom / 0.08) * 100)}%</span>
        <button type="button" aria-label="ซูมเข้า" title="ซูมเข้า" onPointerDown={(event) => event.stopPropagation()} onClick={() => {
          const box = containerRef.current
          if (box) setViewport((current) => zoomAtScreenPoint(current, [box.clientWidth / 2, box.clientHeight / 2], 1.25))
        }}><ZoomIn size={16} /></button>
        <button type="button" aria-label="จัดแปลนให้อยู่ในหน้าจอ" title="จัดแปลนให้อยู่ในหน้าจอ" onPointerDown={(event) => event.stopPropagation()} onClick={fitView}><Maximize2 size={15} /></button>
      </div>
    </div>
  )
}
