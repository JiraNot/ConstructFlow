import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import {
  ProjectDocument,
  SmartObject,
  DoorModuleData,
  WindowModuleData,
  WallModuleData,
  CabinetModuleData,
  StairModuleData,
  PipeRouteModuleData,
  MouldingModuleData,
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
import { projectPointToWallOffsetMm, stairFromRun, type StairPlacementOptions } from '@constructflow/architecture-engine'
import { movePipeRouteEndpoint, movePipeRouteNode } from '@constructflow/drainage-engine'
import { polygonInteriorPoint } from '@constructflow/geometry-kernel'
import { getEditableRoofRidge } from '@constructflow/roof-engine'
import { WorkbenchNumberInput } from './WorkbenchNumberInput.js'
import { getPlanViewProject, getPlanVisibleObjects } from '@constructflow/representation-engine'
import type { ClashSeverity, CoordinationFinding } from '@constructflow/clash-engine'
import { TypePicker } from './TypePicker.js'
import { usePlanCanvasPlacementKeyboard } from './usePlanCanvasPlacementKeyboard.js'
import { TOOL_FAMILIES } from './catalogPresentation.js'
import { ToolType } from './Toolbar.js'
import {
  ViewportState,
  screenToWorld,
  worldToScreen,
  zoomAtScreenPoint,
} from '../viewport/viewportTransform.js'
import { constrainPointToReference, findNearestLinearReference, inferLinearConstraint, LinearReference, SnapMode, SnapResult, SnapSpatialIndex, snapPoint, snapToWallHost, WallHostSnapResult, snapOpeningOffsetBimAware, resizeOpeningFromEdge } from '@constructflow/snapping-engine'
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
import { commitPlanCanvasDragPreview } from './commitPlanCanvasDragPreview.mjs'
import { findPlanHitObject } from './planHitTesting.mjs'
import { resolvePlanCanvasBoxSelection } from './resolvePlanCanvasBoxSelection.mjs'
import { drawPlanCanvasSelectionHandles } from './drawPlanCanvasSelectionHandles.js'
import { drawPlanCanvasToolOverlays } from './drawPlanCanvasToolOverlays.js'
import { buildPlanPlacementGhost } from './buildPlanPlacementGhost.js'
import { drawPlanCanvasBaseScene } from './drawPlanCanvasBaseScene.js'
import { resolvePlanCanvasLineSnap } from '../app/placementLineSnap.mjs'
import { updatePlanCanvasPreference, type PlanCanvasPreferences } from '../app/planCanvasPreferences.mjs'
import { hasPendingToolStep, resolveEscapeAction, resolveToolInteractionStatus } from '../app/toolInteractionStatus.mjs'

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
  onModifyGrid?: (id: string, changes: { start_point_mm?: [number, number]; end_point_mm?: [number, number] }) => void
  onCopyGrid?: (sourceId: string, start: [number, number], end: [number, number]) => void
  onActivateTool?: (tool: ToolType) => void
  onCommitStair?: (stair: StairModuleData) => boolean
  onMoveColumn: (id: string, newLocation_mm: [number, number]) => void
  onMoveWall: (id: string, delta_mm: [number, number]) => void
  onMoveOpening: (id: string, offset_along_wall_mm: number) => void
  onUpdateWallEndpoints?: (id: string, start: [number, number], end: [number, number]) => void
  onUpdateBeamEndpoints?: (id: string, start: [number, number], end: [number, number], startColumnId?: string | null, endColumnId?: string | null) => void
  onResizeOpening?: (id: string, width_mm: number, offset_along_wall_mm: number) => void
  onUpdateBoundaryVertex?: (id: string, boundary_mm: [number, number][]) => void
  onUpdateRoomSeparator?: (id: string, start: [number, number], end: [number, number]) => void
  onUpdatePipeRoute?: (id: string, changes: Partial<PipeRouteModuleData>) => void
  onUpdateMoulding?: (id: string, changes: Partial<MouldingModuleData>) => void
  onUpdateCabinet?: (id: string, changes: Partial<CabinetModuleData>) => void
  onResizeColumn?: (id: string, section_mm: [number, number]) => void
  onResizeFoundation?: (id: string, size_mm: [number, number]) => void
  onPreviewManipulation?: (commands: CommandRequest[]) => DirectManipulationPreviewResult
  onCommitManipulation?: (commands: CommandRequest[]) => { status: string; errors?: string[] }
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
  getSnappedWallId, getWallVerticalReference, getPlanObjectBounds,
  cabinetFootprintPoints, cabinetRotationFromGrip,
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
  onModifyGrid,
  onCopyGrid,
  onActivateTool,
  onCommitStair,
  onMoveColumn,
  onMoveWall,
  onMoveOpening,
  onUpdateWallEndpoints,
  onUpdateBeamEndpoints,
  onResizeOpening,
  onUpdateBoundaryVertex,
  onUpdateRoomSeparator,
  onUpdatePipeRoute,
  onUpdateMoulding,
  onUpdateCabinet,
  onResizeColumn,
  onResizeFoundation,
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
  const [gridStartPoint, setGridStartPoint] = useState<[number, number] | null>(null)
  const [stairStartPoint, setStairStartPoint] = useState<[number, number] | null>(null)
  const [stairOptions, setStairOptions] = useState<StairPlacementOptions>({ stair_type: 'u_shape', width_mm: 900, landing_depth_mm: 900, turn_direction: 'right', num_risers: 18, flight_gap_mm: 100, top_level_id: '' })
  const [stairError, setStairError] = useState('')
  const [authoringControlsOpen, setAuthoringControlsOpen] = useState(true)
  useEffect(() => {
    const base = project.levels.find(l => l.id === project.project.active_level_id)
    const top = project.levels.filter(l => l.elevation_mm > (base?.elevation_mm ?? 0)).sort((a, b) => a.elevation_mm - b.elevation_mm)[0]
    setStairOptions(o => ({ ...o, top_level_id: top?.id ?? '', num_risers: top && base ? Math.ceil((top.elevation_mm - base.elevation_mm) / 190) : 18, first_flight_risers: undefined }))
    setStairStartPoint(null)
  }, [project.project.active_level_id, project.levels])
  const [gridSequenceStyle, setGridSequenceStyle] = useState<'auto' | 'alpha' | 'numeric'>('auto')
  const [gridCopySourceId, setGridCopySourceId] = useState<string | null>(null)
  const [gridXIntervals, setGridXIntervals] = useState(() => [3000, 3000, 3000].map(value => formatLengthMm(value, displayUnit)).join(', '))
  const [gridYIntervals, setGridYIntervals] = useState(() => [2500, 2500].map(value => formatLengthMm(value, displayUnit)).join(', '))
  const [gridXFirstTag, setGridXFirstTag] = useState('A')
  const [gridYFirstTag, setGridYFirstTag] = useState('1')
  const [gridSystemError, setGridSystemError] = useState('')
  const [drawLengthMeters, setDrawLengthMeters] = useState('')
  const [drawAngleDegrees, setDrawAngleDegrees] = useState('')
  const [dimensionInputX, setDimensionInputX] = useState('')
  const [dimensionInputY, setDimensionInputY] = useState('')
  const dimensionInputXRef = useRef<HTMLInputElement>(null)
  const dimensionInputYRef = useRef<HTMLInputElement>(null)
  const [dimensionAnchorX, setDimensionAnchorX] = useState<number | null>(null)
  const [dimensionAnchorY, setDimensionAnchorY] = useState<number | null>(null)
  const [dimensionKeyboardAxis, setDimensionKeyboardAxis] = useState<'x' | 'y'>('x')
  const previousDisplayUnit = useRef(displayUnit)
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

  useEffect(() => {
    const previousUnit = previousDisplayUnit.current
    if (previousUnit === displayUnit) return
    const convert = (value: string) => value.split(/[,;]+/).map(part => part.trim()).filter(Boolean).map(part => {
      const mm = parseLengthMm(part, previousUnit)
      return mm === null ? part : formatLengthMm(mm, displayUnit)
    }).join(', ')
    setGridXIntervals(convert(gridXIntervals))
    setGridYIntervals(convert(gridYIntervals))
    setDimensionInputX(value => value.trim() ? formatLengthMm(parseLengthMm(value, previousUnit) ?? 0, displayUnit) : '')
    setDimensionInputY(value => value.trim() ? formatLengthMm(parseLengthMm(value, previousUnit) ?? 0, displayUnit) : '')
    setDrawLengthMeters(value => value.trim() ? formatLengthMm(parseLengthMm(value, previousUnit) ?? 0, displayUnit) : '')
    previousDisplayUnit.current = displayUnit
  }, [displayUnit])

  const applyPlacementDimensions = (point: [number, number], refs: { refX?: number; refY?: number }, rawPoint: [number, number] = point): [number, number] => {
    const result: [number, number] = [...point]
    for (const axis of ['x', 'y'] as const) {
      const valueText = axis === 'x' ? dimensionInputX : dimensionInputY
      const anchor = axis === 'x' ? dimensionAnchorX ?? refs.refX : dimensionAnchorY ?? refs.refY
      const value = parseLengthMm(valueText, displayUnit)
      if (!valueText.trim() || anchor === undefined || anchor === null || value === null || value < 0) continue
      const coordinate = axis === 'x' ? rawPoint[0] : rawPoint[1]
      const sign = coordinate < anchor ? -1 : 1
      if (axis === 'x') result[0] = Math.round(anchor + sign * value)
      else result[1] = Math.round(anchor + sign * value)
    }
    return result
  }

  const constrainGridCopyToParallelOffset = (point: [number, number], source: Parameters<typeof gridLineEndpoints>[0]): [number, number] => {
    const [start, end] = gridLineEndpoints(source)
    const dx = end[0] - start[0], dy = end[1] - start[1]
    const length = Math.hypot(dx, dy)
    if (length < 1) return point
    // Shift constrains the copy displacement to the normal of the source line,
    // so the new grid remains parallel and only its spacing changes.
    const nx = -dy / length, ny = dx / length
    const offset = (point[0] - start[0]) * nx + (point[1] - start[1]) * ny
    return [Math.round(start[0] + nx * offset), Math.round(start[1] + ny * offset)]
  }

  const clearDimensionOverrides = () => {
    setDimensionInputX(''); setDimensionInputY(''); setDimensionAnchorX(null); setDimensionAnchorY(null)
  }
  useEffect(() => {
    clearDimensionOverrides()
  }, [activeTool, toolActivation])

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
    if (placementReference === 'centerline') return [start, end]
    const dx = end[0] - start[0], dy = end[1] - start[1]
    const length = Math.hypot(dx, dy)
    if (length < 1) return [start, end]
    const side = placementReference === 'left_face' ? -1 : 1
    const offsetX = (-dy / length) * widthMm / 2 * side
    const offsetY = (dx / length) * widthMm / 2 * side
    return [[start[0] + offsetX, start[1] + offsetY], [end[0] + offsetX, end[1] + offsetY]]
  }, [placementReference])

  const constrainLineSnap = useCallback((snap: SnapResult, pointerPoint: [number, number], start: [number, number], lockAxis: boolean, reference?: LinearReference): SnapResult => {
    let constrainedSnap = snap
    const inferredMode = !lockAxis && lineConstraintMode === 'auto' && reference
      ? inferLinearConstraint(pointerPoint, start, reference, 12 / Math.max(viewport.zoom, 0.0001))
      : null
    const appliedMode = lineConstraintMode === 'auto' ? inferredMode : lineConstraintMode === 'none' ? null : lineConstraintMode
    if (!lockAxis && appliedMode && reference) {
      constrainedSnap = constrainPointToReference(snap.point_mm, start, reference, appliedMode)
    }
    let dx = constrainedSnap.point_mm[0] - start[0], dy = constrainedSnap.point_mm[1] - start[1]
    if (lockAxis) {
      if (Math.abs(dx) >= Math.abs(dy)) dy = 0
      else dx = 0
    }
    const targetLengthMm = parseLengthMm(drawLengthMeters, displayUnit) ?? Number.NaN
    const targetAngle = Number(drawAngleDegrees)
    if (drawAngleDegrees.trim() && Number.isFinite(targetAngle)) {
      const cursorLength = Math.hypot(dx, dy)
      const length = Number.isFinite(targetLengthMm) && targetLengthMm > 0 ? targetLengthMm : cursorLength
      if (length > 0) {
        const radians = targetAngle * Math.PI / 180
        dx = Math.cos(radians) * length
        dy = -Math.sin(radians) * length
      }
    } else if (Number.isFinite(targetLengthMm) && targetLengthMm > 0) {
      const length = Math.hypot(dx, dy)
      if (length > 0) {
        dx = dx / length * targetLengthMm
        dy = dy / length * targetLengthMm
      }
    }
    const point_mm: [number, number] = [Math.round(start[0] + dx), Math.round(start[1] + dy)]
    const changed = Math.hypot(point_mm[0] - snap.point_mm[0], point_mm[1] - snap.point_mm[1]) >= 1
    const constraintApplied = !lockAxis && !!appliedMode && !!reference
    return {
      ...snap,
      point_mm,
      kind: constraintApplied ? constrainedSnap.kind : snap.kind,
      target_id: constraintApplied ? reference?.target_id : changed ? undefined : snap.target_id,
      description: `${constraintApplied ? constrainedSnap.description : snap.description}${!lockAxis && lineConstraintMode !== 'none' && !reference ? ' · ไม่พบแนวอ้างอิงใกล้จุดเริ่ม' : ''}${lineConstraintMode === 'auto' && reference && !inferredMode && !lockAxis ? ' · Auto: เล็งใกล้แนวขนาน/ตั้งฉากเพื่อจัดแนว' : ''}${lockAxis ? ' · Ortho' : ''}${Number.isFinite(targetLengthMm) && targetLengthMm > 0 ? ` · ${formatLengthMm(targetLengthMm, displayUnit)} ${displayUnit}` : ''}`,
    }
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
  const [activeSnap, setActiveSnap] = useState<SnapResult | null>(null)
  const stairPreview = useMemo(() => {
    if (activeTool !== 'stair' || !stairStartPoint || !activeSnap) return null
    try { return stairFromRun(project, stairStartPoint, activeSnap.point_mm, stairOptions) } catch { return null }
  }, [activeTool, stairStartPoint, activeSnap, stairOptions, project])
  const [activeWallSnap, setActiveWallSnap] = useState<WallHostSnapResult | null>(null)
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
  const [draggingObject, setDraggingObject] = useState<{
    id: string
    kind: 'column' | 'wall' | 'opening' | 'opening-center' | 'grid' | 'column-corner' | 'foundation-corner' | 'wall-endpoint' | 'beam-endpoint' | 'grid-endpoint' | 'separator-endpoint' | 'pipe-endpoint' | 'pipe-node' | 'moulding-endpoint' | 'cabinet-rotation' | 'opening-edge' | 'polygon-vertex' | 'slab-edge' | 'slab-slope' | 'roof-ridge' | 'roof-seam' | 'object-move' | 'group-move' | 'stair-width' | 'stair-run'
    startWorldMm: [number, number]
    startScreenPx: [number, number]
    endpointIndex?: number
    roofSeamEdgeIndices?: [number, number]
    roofSeamGripMm?: [number, number]
    startPointMm?: [number, number]
    endPointMm?: [number, number]
    boundaryPointsMm?: [number, number][]
    edgeStartMm?: [number, number]
    edgeNormalMm?: [number, number]
    centerMm?: [number, number]
    sectionMm?: [number, number]
    rotationDeg?: number
    objectIds?: string[]
    openingCenterOffsetMm?: number
    hostStartMm?: [number, number]
    hostEndMm?: [number, number]
    openingWidthMm?: number
    gridStartMm?: [number, number]
    gridEndMm?: [number, number]
    pipeRouteData?: PipeRouteModuleData
    mouldingData?: MouldingModuleData
    cabinetData?: CabinetModuleData
  } | null>(null)

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

  // 2-click beam placement state (start node -> end node)
  const [beamStartNode, setBeamStartNode] = useState<{ point_mm: [number, number]; columnId?: string; reference?: LinearReference } | null>(null)

  // 2-click wall placement state (start node -> end node)
  const [wallStartNode, setWallStartNode] = useState<{ point_mm: [number, number]; reference?: LinearReference; hostWallId?: string } | null>(null)
  const [roomSeparatorStart, setRoomSeparatorStart] = useState<[number,number] | null>(null)
  const [roofShape, setRoofShape] = useState<'hip' | 'gable' | 'flat'>('hip')
  const [roofSlopeDeg, setRoofSlopeDeg] = useState(25)
  const [roofThicknessMm, setRoofThicknessMm] = useState(30)
  const [roofElevationOffsetMm, setRoofElevationOffsetMm] = useState(2800)
  const [roofMaterial, setRoofMaterial] = useState('metal_sheet')
  const [pipeSystem, setPipeSystem] = useState<'waste' | 'soil' | 'rainwater' | 'vent' | 'cold_water' | 'hot_water'>('waste')
  const [fixtureKind, setFixtureKind] = useState<'light' | 'switch' | 'outlet' | 'panel'>('light')
  const [slabBoundary, setSlabBoundary] = useState<[number, number][]>([])

  // Calibration state (P1 -> mouse move -> P2 -> modal)
  const [calibrationP1, setCalibrationP1] = useState<[number, number] | null>(null)
  const [calibrationMousePoint, setCalibrationMousePoint] = useState<[number, number] | null>(null)
  const [tapeMeasure, setTapeMeasure] = useState<{ start: [number, number]; end: [number, number]; complete: boolean } | null>(null)

  // Door handing state (can cycle with Spacebar)
  const setDoorHanding = (value: DoorHanding | ((current: DoorHanding) => DoorHanding)) => setPreference('doorHanding', value)

  const cancelCurrentPlacement = () => {
    const pendingState = hasPendingToolStep({ draggingObject, objectContextMenu, stairStartPoint, gridStartPoint, gridCopySourceId, beamStartNode, wallStartNode, roomSeparatorStart, slabBoundary, calibrationP1, tapeMeasure, dimensionInputX, dimensionInputY, drawLengthMeters, drawAngleDegrees, gridSystemError })
    const escapeAction = resolveEscapeAction(activeTool, pendingState, Boolean(selectedId || selectedIds.length))
    setObjectContextMenu(null)
    clearPointerDrag()
    setDimensionInputX(''); setDimensionInputY(''); setDimensionAnchorX(null); setDimensionAnchorY(null)
    setGridStartPoint(null); setGridCopySourceId(null); setBeamStartNode(null); setWallStartNode(null); setRoomSeparatorStart(null); setStairStartPoint(null); setStairError('')
    setSlabBoundary([]); setCalibrationP1(null); setCalibrationMousePoint(null); setTapeMeasure(null)
    setDrawLengthMeters(''); setDrawAngleDegrees(''); setGridSystemError('')
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

  useEffect(() => {
    if (activeTool !== 'beam') {
      setBeamStartNode(null)
    }
    if (activeTool !== 'wall') {
      setWallStartNode(null)
    }
    if (!['roomSeparator', 'pipe', 'cabinet', 'moulding'].includes(activeTool)) setRoomSeparatorStart(null)
    if (activeTool !== 'grid') setGridStartPoint(null)
    if (activeTool !== 'stair') { setStairStartPoint(null); setStairError('') }
    if (activeTool !== 'gridCopy') setGridCopySourceId(null)
    if (!['slab','slabVoid','archFloor','ceiling','roof'].includes(activeTool)) setSlabBoundary([])
    if (activeTool !== 'calibrate') {
      setCalibrationP1(null)
      setCalibrationMousePoint(null)
    }
    if (activeTool !== 'measure') setTapeMeasure(null)
    setDrawLengthMeters('')
    setDrawAngleDegrees('')
  }, [activeTool, toolActivation])

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
    const excluded = new Set<string>()
    for (let index = 0; index < Object.keys(planProject.objects).length; index++) {
      const id = findHitObject(point, preferWall, excluded)
      if (!id) break
      excluded.add(id)
    }
    const ids = [...excluded]
    // Pick the small structural/architectural object under the pointer before
    // its enclosing slab or room face. The former default rank placed slabs
    // above walls, so clicks on visible wall edges selected floor objects.
    return ids.sort((a, b) => {
      const rank = (id: string) => {
        const object = planProject.objects[id]
        if (isDoorObject(object)) return 0
        if (isWindowObject(object)) return 1
        if (isColumnObject(object)) return 2
        if (isWallObject(object)) return 3
        if (isBeamObject(object)) return 4
        if (object.object_type === 'architecture.stair') return 5
        if (isFoundationObject(object)) return 6
        if (isGridObject(object)) return 7
        return object.object_type === 'architecture.room' ? 9 : 8
      }
      return rank(a) - rank(b)
    })
  }

  // Pointer move handler
  const handlePointerMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    if (activeTool !== 'select' && activeTool !== 'erase' && e.pointerType === 'mouse' && document.activeElement !== canvasRef.current) {
      canvasRef.current?.focus({ preventScroll: true })
    }

    if (handlePlanCanvasNavigationPointerMove({
      pointerPositionsRef, pinchRef, longPressStartRef, longPressTimerRef, selectionStartRef,
      setSelectionBox, eraseActiveRef, erasedIdsRef, isPanning, panStartRef, viewport, setViewport,
      findCandidates,
    }, e.pointerId, e.pointerType, [screenX, screenY])) return

    const rawWorld = screenToWorld([screenX, screenY], viewport)

    const { snap, wallSnap } = resolvePlanCanvasPointerSnap({
      activeTool, rawWorld, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, project, planProject,
      activeDoorTypeMark, activeWindowTypeMark, draggingObjectId: draggingObject?.id, gridCopySourceId,
      dimensionReferenceMode,
      lineState: { beamStartNode, wallStartNode, stairStartPoint, gridStartPoint, roomSeparatorStart, slabBoundary },
      snapPlanPoint, snapPlanWallHost, applyOpeningDistance, resolveLineSnap: constrainLineSnap,
      applyPlacementDimensions, constrainGridCopyToParallelOffset,
    })
    setActiveWallSnap(wallSnap)
    setActiveSnap(snap)
    onCursorChange(snap.point_mm, snap.description)
    if (activeTool === 'measure') setTapeMeasure(current => current && !current.complete ? { ...current, end: snap.point_mm } : current)

    if (activeTool === 'calibrate') {
      setCalibrationMousePoint(rawWorld)
    }

    // Check hover
    const candidates = findCandidates(rawWorld)
    if (activeTool === 'select' && !draggingObject) setCandidates(candidates)
    setHoveredId(candidates.includes(hoveredId ?? '') ? hoveredId : candidates[0] ?? null)

    // Drag candidates stay outside the project model until a valid release.
    if (draggingObject) {
      const moved = Math.hypot(screenX - draggingObject.startScreenPx[0], screenY - draggingObject.startScreenPx[1])
      if (moved >= 3) previewDragAt(draggingObject, rawWorld, e.ctrlKey)
      else setManipulationPreview(null)
    }
  }

  // Pointer down
  const handlePointerDown = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top

    // Right-clicking an object opens the same quick actions available to touch.
    // Suppress the browser menu over the drawing canvas.
    if (e.button === 2) {
      e.preventDefault()
      const point = screenToWorld([screenX, screenY], viewport)
      const hitId = findHitObject(point, e.shiftKey)
      if (hitId) {
        onSelectionChange?.([hitId], hitId)
        onSelectObject(hitId)
        setObjectContextMenu({ id: hitId, x: screenX, y: screenY })
      } else {
        setObjectContextMenu(null)
      }
      return
    }

    if (e.pointerType === 'touch') {
      pointerPositionsRef.current.set(e.pointerId, [screenX, screenY])
      try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
      if (pointerPositionsRef.current.size >= 2) {
        if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
        selectionStartRef.current = null; setSelectionBox(null)
        setDraggingObject(null); setIsPanning(false)
        const points = [...pointerPositionsRef.current.values()]
        pinchRef.current = { distance: Math.max(1, Math.hypot(points[0][0] - points[1][0], points[0][1] - points[1][1])), center: [(points[0][0] + points[1][0]) / 2, (points[0][1] + points[1][1]) / 2] }
        pinchActiveRef.current = true
        return
      }
      if (activeTool === 'select') {
        longPressStartRef.current = { pointerId: e.pointerId, point: [screenX, screenY] }
        longPressTimerRef.current = window.setTimeout(() => {
          const point = longPressStartRef.current?.point
          if (!point) return
          longPressTimerRef.current = null
          const world = screenToWorld(point, viewport)
          const hitId = findHitObject(world, false)
          setDraggingObject(null); selectionStartRef.current = null; setSelectionBox(null)
          if (hitId) {
            onSelectionChange?.([hitId], hitId)
            onSelectObject(hitId)
            setObjectContextMenu({ id: hitId, x: point[0], y: point[1] })
          } else {
            setObjectContextMenu(null)
            panStartRef.current = point
            setIsPanning(true)
          }
        }, 500)
      }
    }

    // Middle mouse button is the desktop pan gesture.
    if (e.button === 1) {
      setIsPanning(true)
      panStartRef.current = [screenX, screenY]
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }

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
        const editHandle = findEditHandle([screenX, screenY])
        if (editHandle) {
          const editObject = planProject.objects[editHandle.id]
          const editData = editObject?.module_data as Record<string, unknown> | undefined
          const editSize = editData && editObject?.object_type === 'structure.column'
            ? editData.section_mm as [number, number]
            : editData && editObject?.object_type === 'structure.foundation' ? editData.size_mm as [number, number] : undefined
          setResizeDimensionWidth(editSize ? formatLengthMm(Number(editSize[0]), displayUnit) : editHandle.kind === 'opening-edge' ? formatLengthMm(Number(editHandle.openingWidthMm), displayUnit) : '')
          setResizeDimensionHeight(editSize ? formatLengthMm(Number(editSize[1]), displayUnit) : '')
          setResizeDimensionLength(editHandle.startPointMm && editHandle.endPointMm
            ? formatLengthMm(Math.hypot(editHandle.endPointMm[0] - editHandle.startPointMm[0], editHandle.endPointMm[1] - editHandle.startPointMm[1]), displayUnit)
            : '')
          setDraggingObject({ id: editHandle.id, kind: editHandle.kind, endpointIndex: editHandle.endpointIndex,
            startPointMm: editHandle.startPointMm, endPointMm: editHandle.endPointMm,
            boundaryPointsMm: editHandle.boundaryPointsMm,
            edgeStartMm: editHandle.edgeStartMm,
            edgeNormalMm: editHandle.edgeNormalMm,
            roofSeamEdgeIndices: editHandle.roofSeamEdgeIndices,
            roofSeamGripMm: editHandle.roofSeamGripMm,
            pipeRouteData: editHandle.pipeRouteData, mouldingData: editHandle.mouldingData,
            cabinetData: editHandle.cabinetData,
            centerMm: editHandle.centerMm, sectionMm: editHandle.sectionMm, rotationDeg: editHandle.rotationDeg,
            hostStartMm: editHandle.hostStartMm, hostEndMm: editHandle.hostEndMm,
            openingWidthMm: editHandle.openingWidthMm, openingCenterOffsetMm: editHandle.openingCenterOffsetMm,
            startWorldMm: rawWorld, startScreenPx: [screenX, screenY] })
          setManipulationPreview(null)
          lastPreviewValidationRef.current = { at: 0, valid: true }
          e.currentTarget.setPointerCapture(e.pointerId)
        } else {
        const candidates = findCandidates(rawWorld, e.shiftKey)
        setCandidates(candidates)
        const hitId = e.shiftKey ? findHitObject(rawWorld, true) : candidates.includes(hoveredId ?? '') ? hoveredId : candidates[0] ?? null
        setHoveredId(hitId)
        if (hitId && e.shiftKey) {
          const next = selectedIds.includes(hitId) ? selectedIds.filter(id => id !== hitId) : [...selectedIds, hitId]
          onSelectionChange?.(next, next.at(-1) ?? null)
          onSelectObject(next.at(-1) ?? null)
        } else if (hitId) {
          const retainGroup = selectedIds.includes(hitId) && selectedIds.length > 1
          if (!retainGroup) {
            onSelectionChange?.([hitId], hitId)
            onSelectObject(hitId)
          }
        } else {
          selectionStartRef.current = [screenX, screenY]
          selectionAdditiveRef.current = e.shiftKey
          e.currentTarget.setPointerCapture(e.pointerId)
        }

        if (hitId && !e.shiftKey) {
          const object = project.objects[hitId]
          const startScreenPx: [number, number] = [screenX, screenY]
          const retainGroup = selectedIds.includes(hitId) && selectedIds.length > 1
          if (retainGroup) {
            setDraggingObject({ id: hitId, kind: 'group-move', objectIds: [...selectedIds], startWorldMm: rawWorld, startScreenPx })
            setManipulationPreview(null)
            lastPreviewValidationRef.current = { at: 0, valid: true }
            e.currentTarget.setPointerCapture(e.pointerId)
          } else if (isColumnObject(object)) {
            setDraggingObject({ id: hitId, kind: 'column', startWorldMm: rawWorld, startScreenPx })
            setManipulationPreview(null)
            lastPreviewValidationRef.current = { at: 0, valid: true }
            e.currentTarget.setPointerCapture(e.pointerId)
          } else if (isWallObject(object)) {
            setDraggingObject({
              id: hitId,
              kind: 'wall',
              startWorldMm: rawWorld,
              startScreenPx,
            })
            setManipulationPreview(null)
            lastPreviewValidationRef.current = { at: 0, valid: true }
            e.currentTarget.setPointerCapture(e.pointerId)
          } else if (isGridObject(object) && !object.module_data.system_id) {
            const [gridStartMm, gridEndMm] = gridLineEndpoints(object)
            setDraggingObject({ id: hitId, kind: 'grid', startWorldMm: rawWorld, startScreenPx, gridStartMm, gridEndMm })
            setManipulationPreview(null)
            e.currentTarget.setPointerCapture(e.pointerId)
          } else if (isDoorObject(object) || isWindowObject(object)) {
            const host = project.objects[object.module_data.wall_id]
            if (host && isWallObject(host) && Number.isFinite(object.module_data.width_mm) && object.module_data.width_mm > 0) {
              setDraggingObject({
                id: hitId,
                kind: 'opening-center',
                startWorldMm: rawWorld,
                startScreenPx,
                hostStartMm: [host.module_data.start_point_mm[0], host.module_data.start_point_mm[1]],
                hostEndMm: [host.module_data.end_point_mm[0], host.module_data.end_point_mm[1]],
                openingWidthMm: object.module_data.width_mm,
                openingCenterOffsetMm: object.module_data.offset_along_wall_mm,
              })
              setManipulationPreview(null)
              lastPreviewValidationRef.current = { at: 0, valid: true }
              e.currentTarget.setPointerCapture(e.pointerId)
            }
          } else {
            setDraggingObject({ id: hitId, kind: 'object-move', startWorldMm: rawWorld, startScreenPx })
            setManipulationPreview(null)
            lastPreviewValidationRef.current = { at: 0, valid: true }
            e.currentTarget.setPointerCapture(e.pointerId)
          }
        }
        }
      } else if (activeTool === 'column') {
        onCommitColumn(snap.point_mm)
        clearDimensionOverrides()
      } else if (activeTool === 'foundation') {
        const colHit = Object.values(planProject.objects).find((o) => {
          if (!isColumnObject(o)) return false
          const [cx, cy] = o.module_data.location_mm
          const [cw, cd] = o.module_data.section_mm
          const tol = Math.max(cw, cd, 400)
          return Math.abs(rawWorld[0] - cx) <= tol && Math.abs(rawWorld[1] - cy) <= tol
        })

        if (colHit) {
          const existingFnd = Object.values(planProject.objects).find(
            (o) => isFoundationObject(o) && (o.module_data.supported_column_id === colHit.id || o.host_refs?.includes(colHit.id))
          )
          if (existingFnd) {
            onSelectionChange?.([existingFnd.id], existingFnd.id)
            onSelectObject(existingFnd.id)
          } else {
            onCommitFoundation({ columnId: colHit.id })
          }
        } else {
          onCommitFoundation({ location_mm: snap.point_mm })
        }
        clearDimensionOverrides()
      } else if (activeTool === 'beam') {
        const clickedCol = Object.values(planProject.objects).find((o) => {
          if (!isColumnObject(o)) return false
          const [cx, cy] = o.module_data.location_mm
          const [cw, cd] = o.module_data.section_mm
          const tol = Math.max(cw, cd, 400)
          return Math.abs(rawWorld[0] - cx) <= tol && Math.abs(rawWorld[1] - cy) <= tol
        })
        const colId = clickedCol ? clickedCol.id : (snap.kind === 'column_center' ? snap.target_id : undefined)

        if (!beamStartNode) {
          setBeamStartNode({ point_mm: snap.point_mm, columnId: colId, reference: findNearestLinearReference(planProject, snap.point_mm) ?? undefined })
          setDrawLengthMeters('')
          setDrawAngleDegrees(''); clearDimensionOverrides()
        } else {
          const dist = Math.hypot(
            snap.point_mm[0] - beamStartNode.point_mm[0],
            snap.point_mm[1] - beamStartNode.point_mm[1]
          )
          if (dist >= 100) {
            const typeDef = project.types?.find(type => type.object_type === 'structure.beam' && type.name.toLowerCase() === activeBeamTypeMark.toLowerCase())
            const [alignedStart, alignedEnd] = resolveReferencePath(beamStartNode.point_mm, snap.point_mm, typeDef?.parameters?.section_mm?.[0] || 200)
            onCommitBeam(alignedStart, alignedEnd, beamStartNode.columnId, colId, placementReference)
          }
          setBeamStartNode({ point_mm: snap.point_mm, columnId: colId, reference: findNearestLinearReference(planProject, snap.point_mm) ?? undefined })
          setDrawLengthMeters('')
          setDrawAngleDegrees('')
          clearDimensionOverrides()
        }
      } else if (activeTool === 'wall') {
        if (!wallStartNode) {
          setWallStartNode({ point_mm: snap.point_mm, reference: findNearestLinearReference(planProject, snap.point_mm) ?? undefined, hostWallId: getSnappedWallId(snap, planProject) })
          setDrawLengthMeters('')
          setDrawAngleDegrees(''); clearDimensionOverrides()
        } else {
          const dist = Math.hypot(
            snap.point_mm[0] - wallStartNode.point_mm[0],
            snap.point_mm[1] - wallStartNode.point_mm[1]
          )
          if (dist >= 100) {
            const typeDef = project.types?.find(type => type.object_type === 'architecture.wall' && type.name.toLowerCase() === activeWallTypeMark.toLowerCase())
            const [alignedStart, alignedEnd] = resolveReferencePath(wallStartNode.point_mm, snap.point_mm, typeDef?.parameters?.thickness_mm || 100)
            const endHostWallId = getSnappedWallId(snap, planProject)
            const verticalReference = getWallVerticalReference(planProject, wallStartNode.hostWallId ?? endHostWallId)
            onCommitWall(alignedStart, alignedEnd, placementReference, verticalReference)
          }
          setWallStartNode({ point_mm: snap.point_mm, reference: findNearestLinearReference(planProject, snap.point_mm) ?? undefined, hostWallId: getSnappedWallId(snap, planProject) })
          setDrawLengthMeters('')
          setDrawAngleDegrees('')
          clearDimensionOverrides()
        }
      } else if (activeTool === 'door') {
        const typeDef = project.types?.find(
          (t) => t.object_type === 'door_window.door' && t.name.toLowerCase() === activeDoorTypeMark.toLowerCase()
        )
        const openingW = typeDef?.parameters?.width_mm || 800
        const hostSnap = snapPlanWallHost(rawWorld, openingW) || activeWallSnap
        const wallSnap = hostSnap ? applyOpeningDistance(hostSnap, rawWorld, openingW) : null
        if (wallSnap) {
          onCommitDoor(
            wallSnap.wall_id,
            wallSnap.point_mm,
            wallSnap.offset_along_wall_mm,
            doorHanding
          )
          clearDimensionOverrides()
        }
      } else if (activeTool === 'window') {
        const typeDef = project.types?.find(
          (t) => t.object_type === 'door_window.window' && t.name.toLowerCase() === activeWindowTypeMark.toLowerCase()
        )
        const openingW = typeDef?.parameters?.width_mm || 1200
        const hostSnap = snapPlanWallHost(rawWorld, openingW) || activeWallSnap
        const wallSnap = hostSnap ? applyOpeningDistance(hostSnap, rawWorld, openingW) : null
        if (wallSnap) {
          onCommitWindow(
            wallSnap.wall_id,
            wallSnap.point_mm,
            wallSnap.offset_along_wall_mm
          )
          clearDimensionOverrides()
        }
      } else if (isTwoPointInteraction(activeTool) && ['roomSeparator', 'pipe', 'cabinet', 'moulding'].includes(activeTool)) {
        if (!roomSeparatorStart) { setRoomSeparatorStart(snap.point_mm); setDrawLengthMeters(''); setDrawAngleDegrees('') }
        else {
          if (activeTool === 'roomSeparator') onCommitRoomSeparator?.(roomSeparatorStart, snap.point_mm)
          else if (activeTool === 'pipe') onCommitPipeRoute?.(roomSeparatorStart, snap.point_mm, pipeSystem)
          else if (activeTool === 'cabinet') onCommitCabinet?.(roomSeparatorStart, snap.point_mm)
          else if (activeTool === 'moulding') onCommitMoulding?.(roomSeparatorStart, snap.point_mm)
          setRoomSeparatorStart(null); setDrawLengthMeters(''); setDrawAngleDegrees('')
        }
        clearDimensionOverrides()
      } else if (activeTool === 'fixture') {
        onCommitFixture?.(snap.point_mm, fixtureKind)
        clearDimensionOverrides()
      } else if (isPolygonInteraction(activeTool)) {
        const closeDistance = Math.max(150, 18 / viewport.zoom)
        const closesAtStart = slabBoundary.length >= 3 && Math.hypot(snap.point_mm[0] - slabBoundary[0][0], snap.point_mm[1] - slabBoundary[0][1]) <= closeDistance
        if ((e.detail >= 2 || closesAtStart) && slabBoundary.length >= 3) {
          if (activeTool === 'slab') onCommitSlab(slabBoundary)
          else if (activeTool === 'archFloor') onCommitArchitecturalFloor?.(slabBoundary)
          else if (activeTool === 'ceiling') onCommitCeiling?.(slabBoundary)
          else if (activeTool === 'roof') onCommitRoof?.(slabBoundary, { shape: roofShape, slope_deg: roofSlopeDeg, thickness_mm: roofThicknessMm, elevation_offset_mm: roofElevationOffsetMm, material: roofMaterial })
          else if (selectedId && ['structure.slab', 'architecture.floor', 'architecture.ceiling', 'roof.system'].includes(planProject.objects[selectedId]?.object_type ?? '')) onCommitSurfaceVoid(selectedId, slabBoundary)
          setSlabBoundary([])
          setDrawLengthMeters(''); setDrawAngleDegrees('')
          clearDimensionOverrides()
        } else if (e.detail < 2) { setSlabBoundary(current => [...current, snap.point_mm]); setDrawLengthMeters(''); setDrawAngleDegrees(''); clearDimensionOverrides() }
      } else if (activeTool === 'grid') {
        if (!gridStartPoint) { setGridStartPoint(snap.point_mm); clearDimensionOverrides() }
        else {
          const dx = snap.point_mm[0] - gridStartPoint[0], dy = snap.point_mm[1] - gridStartPoint[1]
          if (Math.hypot(dx, dy) >= 100) onCommitGrid('A', gridStartPoint, snap.point_mm, gridSequenceStyle)
          setGridStartPoint(null)
          setDrawLengthMeters(''); setDrawAngleDegrees(''); clearDimensionOverrides()
        }
      } else if (activeTool === 'gridSystem') {
        const parseIntervals = (value: string) => value.split(/[,;]+/).map(item => item.trim()).filter(Boolean).map(item => parseLengthMm(item, displayUnit))
        const xIntervals = parseIntervals(gridXIntervals), yIntervals = parseIntervals(gridYIntervals)
        const allIntervals = [...xIntervals, ...yIntervals]
        if (!allIntervals.length) setGridSystemError('กรอกระยะอย่างน้อยหนึ่งแนว')
        else if (xIntervals.length > 99 || yIntervals.length > 99 || allIntervals.some(value => value === null || !Number.isFinite(value) || value <= 0)) setGridSystemError('ระยะแต่ละช่วงต้องมากกว่า 0 และแต่ละแนวสร้างได้ไม่เกิน 100 เส้น')
        else {
          setGridSystemError('')
          onCommitGridSystem(snap.point_mm, xIntervals as number[], yIntervals as number[], gridXFirstTag.trim() || 'A', gridYFirstTag.trim() || '1')
          clearDimensionOverrides()
        }
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
  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') {
      if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null; longPressStartRef.current = null
      pointerPositionsRef.current.delete(e.pointerId)
      if (pinchActiveRef.current) {
        if (pointerPositionsRef.current.size === 0) { pinchActiveRef.current = false; pinchRef.current = null }
        else {
          const point = [...pointerPositionsRef.current.values()][0]
          pinchRef.current = { distance: 1, center: point }
        }
        return
      }
    }

    if (isPanning) {
      setIsPanning(false)
      try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
      return
    }

    if (selectionStartRef.current) {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (rect) {
        const end: [number, number] = [e.clientX - rect.left, e.clientY - rect.top]
        const start = selectionStartRef.current
        selectionStartRef.current = null; setSelectionBox(null)
        if (Math.hypot(end[0] - start[0], end[1] - start[1]) >= 5) {
          const a = screenToWorld(start, viewport), b = screenToWorld(end, viewport)
          const box: [number, number, number, number] = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]
          const next = resolvePlanCanvasBoxSelection(box, Object.values(planProject.objects).map(object => ({
            id: object.id,
            bounds: getPlanObjectBounds(object),
          })), selectedIds, selectionAdditiveRef.current)
          onSelectionChange?.(next, next.at(-1) ?? null)
          onSelectObject(next.at(-1) ?? null)
        } else if (!selectionAdditiveRef.current) {
          onSelectionChange?.([], null); onSelectObject(null)
        }
      }
      return
    }

    if (eraseActiveRef.current) {
      if (erasedIdsRef.current.size) onDeleteObjects?.([...erasedIdsRef.current])
      eraseActiveRef.current = false; erasedIdsRef.current.clear()
      return
    }

    if (draggingObject) {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (rect && onPreviewManipulation && onCommitManipulation) {
        const screenX = e.clientX - rect.left, screenY = e.clientY - rect.top
        const pointerWorld = screenToWorld([screenX, screenY], viewport)
        const hasManualDimensions = manualDragPointRef.current !== null
        const rawWorld = manualDragPointRef.current ?? pointerWorld
        const movedPixels = Math.hypot(screenX - draggingObject.startScreenPx[0], screenY - draggingObject.startScreenPx[1])
        commitPlanCanvasDragPreview({
          drag: draggingObject,
          rawWorld,
          ctrlKey: e.ctrlKey,
          hasManualDimensions,
          movedPixels,
          buildCommands: buildDragCommands,
          preview: onPreviewManipulation,
          commit: onCommitManipulation,
          onRejected: onManipulationRejected,
        })
        manualDragPointRef.current = null
        setDraggingObject(null); setDragPreviewPoint(null); setManipulationPreview(null)
        setResizeDimensionWidth(''); setResizeDimensionHeight(''); setResizeDimensionLength('')
        try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
        return
      }
      if (rect) {
        const screenX = e.clientX - rect.left
        const screenY = e.clientY - rect.top
        const rawWorld = screenToWorld([screenX, screenY], viewport)
        const movedPixels = Math.hypot(screenX - draggingObject.startScreenPx[0], screenY - draggingObject.startScreenPx[1])
        if (movedPixels >= 3) {
          if ((draggingObject.kind === 'column-corner' || draggingObject.kind === 'foundation-corner') && draggingObject.centerMm) {
            const point = e.ctrlKey ? rawWorld : snapPlanPoint(rawWorld, 16, draggingObject.id).point_mm
            const size: [number, number] = [Math.max(100, Math.round(2 * Math.abs(point[0] - draggingObject.centerMm[0]))), Math.max(100, Math.round(2 * Math.abs(point[1] - draggingObject.centerMm[1])))]
            if (draggingObject.kind === 'column-corner') onResizeColumn?.(draggingObject.id, size)
            else onResizeFoundation?.(draggingObject.id, size)
          } else if (draggingObject.kind === 'polygon-vertex' && draggingObject.boundaryPointsMm && draggingObject.endpointIndex !== undefined) {
            const point = e.ctrlKey ? rawWorld : snapPlanPoint(rawWorld, 16, draggingObject.id).point_mm
            const boundary: [number, number][] = structuredClone(draggingObject.boundaryPointsMm)
            boundary[draggingObject.endpointIndex] = point
            onUpdateBoundaryVertex?.(draggingObject.id, boundary)
          } else if (draggingObject.kind === 'wall-endpoint' && draggingObject.startPointMm && draggingObject.endPointMm && draggingObject.endpointIndex !== undefined) {
            const point = e.ctrlKey ? rawWorld : snapPlanPoint(rawWorld, 16, draggingObject.id).point_mm
            const start: [number, number] = [...draggingObject.startPointMm], end: [number, number] = [...draggingObject.endPointMm]
            if (draggingObject.endpointIndex === 0) start.splice(0, 2, point[0], point[1]); else end.splice(0, 2, point[0], point[1])
            onUpdateWallEndpoints?.(draggingObject.id, start, end)
          } else if (draggingObject.kind === 'beam-endpoint' && draggingObject.startPointMm && draggingObject.endPointMm && draggingObject.endpointIndex !== undefined) {
            const snap = e.ctrlKey ? { point_mm: rawWorld, target_id: undefined } : snapPlanPoint(rawWorld, 16, draggingObject.id)
            let point: [number, number] = snap.point_mm
            const start: [number, number] = [...draggingObject.startPointMm], end: [number, number] = [...draggingObject.endPointMm]
            const targetColumn = snap.target_id ? planProject.objects[snap.target_id] : undefined
            const columnId = targetColumn && isColumnObject(targetColumn) ? targetColumn.id : null
            if (targetColumn && isColumnObject(targetColumn)) point = [targetColumn.module_data.location_mm[0], targetColumn.module_data.location_mm[1]]
            if (draggingObject.endpointIndex === 0) start.splice(0, 2, point[0], point[1]); else end.splice(0, 2, point[0], point[1])
            const beam = planProject.objects[draggingObject.id]
            const oldStartColumn = beam && isBeamObject(beam) ? beam.module_data.start_column_id ?? null : null
            const oldEndColumn = beam && isBeamObject(beam) ? beam.module_data.end_column_id ?? null : null
            onUpdateBeamEndpoints?.(draggingObject.id, start, end, draggingObject.endpointIndex === 0 ? columnId : oldStartColumn, draggingObject.endpointIndex === 1 ? columnId : oldEndColumn)
          } else if (draggingObject.kind === 'grid-endpoint' && draggingObject.startPointMm && draggingObject.endPointMm && draggingObject.endpointIndex !== undefined) {
            const point = e.ctrlKey ? rawWorld : snapPlanPoint(rawWorld, 16, draggingObject.id).point_mm
            const start: [number, number] = [...draggingObject.startPointMm], end: [number, number] = [...draggingObject.endPointMm]
            if (draggingObject.endpointIndex === 0) start.splice(0, 2, point[0], point[1]); else end.splice(0, 2, point[0], point[1])
            onModifyGrid?.(draggingObject.id, { start_point_mm: start, end_point_mm: end })
          } else if (draggingObject.kind === 'separator-endpoint' && draggingObject.startPointMm && draggingObject.endPointMm && draggingObject.endpointIndex !== undefined) {
            const point = e.ctrlKey ? rawWorld : snapPlanPoint(rawWorld, 16, draggingObject.id).point_mm
            const start: [number, number] = [...draggingObject.startPointMm], end: [number, number] = [...draggingObject.endPointMm]
            if (draggingObject.endpointIndex === 0) start.splice(0, 2, point[0], point[1]); else end.splice(0, 2, point[0], point[1])
            onUpdateRoomSeparator?.(draggingObject.id, start, end)
          } else if (draggingObject.kind === 'pipe-endpoint' && draggingObject.pipeRouteData && draggingObject.endpointIndex !== undefined) {
            const route = draggingObject.pipeRouteData
            const point = e.ctrlKey ? rawWorld : snapPlanPoint(rawWorld, 16, draggingObject.id).point_mm
            const adjacentIndex = draggingObject.endpointIndex === 0 ? 1 : route.nodes_mm.length - 2
            const adjacent = route.nodes_mm[adjacentIndex]
            if (Math.hypot(point[0] - adjacent[0], point[1] - adjacent[1]) >= 1) {
              const endpoint = draggingObject.endpointIndex === 0 ? 'start' : 'end'
              onUpdatePipeRoute?.(draggingObject.id, movePipeRouteEndpoint(route, endpoint, point))
            }
          } else if (draggingObject.kind === 'pipe-node' && draggingObject.pipeRouteData && draggingObject.endpointIndex !== undefined) {
            const route = draggingObject.pipeRouteData
            const point = e.ctrlKey ? rawWorld : snapPlanPoint(rawWorld, 16, draggingObject.id).point_mm
            try { onUpdatePipeRoute?.(draggingObject.id, movePipeRouteNode(route, draggingObject.endpointIndex, point)) }
            catch (error) { onManipulationRejected?.([error instanceof Error ? error.message : String(error)]) }
          } else if (draggingObject.kind === 'moulding-endpoint' && draggingObject.mouldingData && draggingObject.endpointIndex !== undefined) {
            const moulding = draggingObject.mouldingData
            const point = e.ctrlKey ? rawWorld : snapPlanPoint(rawWorld, 16, draggingObject.id).point_mm
            const path_mm = structuredClone(moulding.path_mm) as [number, number, number][]
            const current = path_mm[draggingObject.endpointIndex]
            const adjacentIndex = draggingObject.endpointIndex === 0 ? 1 : path_mm.length - 2
            const adjacent = path_mm[adjacentIndex]
            if (Math.hypot(point[0] - adjacent[0], point[1] - adjacent[1], current[2] - adjacent[2]) >= 1) {
              path_mm[draggingObject.endpointIndex] = [point[0], point[1], current[2]]
              onUpdateMoulding?.(draggingObject.id, { path_mm })
            }
          } else if (draggingObject.kind === 'cabinet-rotation' && draggingObject.cabinetData) {
            const point = e.ctrlKey ? rawWorld : snapPlanPoint(rawWorld, 16, draggingObject.id).point_mm
            const rotation_deg = cabinetRotationFromGrip(draggingObject.cabinetData, point, viewport.zoom)
            if (rotation_deg !== null) onUpdateCabinet?.(draggingObject.id, { rotation_deg })
          } else if (draggingObject.kind === 'opening-edge' && draggingObject.endpointIndex !== undefined && draggingObject.hostStartMm && draggingObject.hostEndMm && draggingObject.openingCenterOffsetMm !== undefined && draggingObject.openingWidthMm !== undefined) {
            const offset = projectPointToWallOffsetMm(rawWorld, draggingObject.hostStartMm, draggingObject.hostEndMm, 1)
            if (offset !== undefined) {
              const hostLength = Math.hypot(draggingObject.hostEndMm[0] - draggingObject.hostStartMm[0], draggingObject.hostEndMm[1] - draggingObject.hostStartMm[1])
              const resized = resizeOpeningFromEdge(offset, draggingObject.endpointIndex === 0 ? 0 : 1,
                draggingObject.openingCenterOffsetMm, draggingObject.openingWidthMm, hostLength, { snap: !e.ctrlKey })
              if (resized) onResizeOpening?.(draggingObject.id, resized.width_mm, resized.offset_along_wall_mm)
            }
          } else if (draggingObject.kind === 'column') {
            const snap = e.ctrlKey
              ? { point_mm: rawWorld, kind: 'free' as const, description: 'Free / อิสระ (Ctrl)' }
              : snapPlanPoint(rawWorld, 16, draggingObject.id)
            onMoveColumn(draggingObject.id, snap.point_mm)
          } else if (draggingObject.kind === 'wall') {
            const delta: [number, number] = [
              rawWorld[0] - draggingObject.startWorldMm[0],
              rawWorld[1] - draggingObject.startWorldMm[1],
            ]
            if (Math.hypot(...delta) >= 1) onMoveWall(draggingObject.id, delta)
          } else if (draggingObject.kind === 'grid' && draggingObject.gridStartMm && draggingObject.gridEndMm) {
            const delta: [number, number] = [rawWorld[0] - draggingObject.startWorldMm[0], rawWorld[1] - draggingObject.startWorldMm[1]]
            if (Math.hypot(...delta) >= 1) onModifyGrid?.(draggingObject.id, {
              start_point_mm: [draggingObject.gridStartMm[0] + delta[0], draggingObject.gridStartMm[1] + delta[1]],
              end_point_mm: [draggingObject.gridEndMm[0] + delta[0], draggingObject.gridEndMm[1] + delta[1]],
            })
          } else if ((draggingObject.kind === 'opening' || draggingObject.kind === 'opening-center') && draggingObject.hostStartMm && draggingObject.hostEndMm && draggingObject.openingWidthMm) {
            const hostLength = Math.hypot(draggingObject.hostEndMm[0] - draggingObject.hostStartMm[0], draggingObject.hostEndMm[1] - draggingObject.hostStartMm[1])
            const rawOffset = projectPointToWallOffsetMm(rawWorld, draggingObject.hostStartMm, draggingObject.hostEndMm, draggingObject.openingWidthMm)
            if (rawOffset !== undefined) {
              let startColW: number | undefined
              let endColW: number | undefined
              for (const col of Object.values(planProject.objects)) {
                if (!isColumnObject(col)) continue
                const [colX, colY] = col.module_data.location_mm
                const colDim = Math.max(...col.module_data.section_mm)
                if (Math.hypot(colX - draggingObject.hostStartMm[0], colY - draggingObject.hostStartMm[1]) <= colDim) startColW = colDim
                if (Math.hypot(colX - draggingObject.hostEndMm[0], colY - draggingObject.hostEndMm[1]) <= colDim) endColW = colDim
              }
              const snapped = e.ctrlKey
                ? { offset_along_wall_mm: Math.round(rawOffset) }
                : snapOpeningOffsetBimAware(rawOffset, hostLength, draggingObject.openingWidthMm, {
                    startColumnWidth_mm: startColW,
                    endColumnWidth_mm: endColW,
                    minClearance_mm: 100,
                  })
              onMoveOpening(draggingObject.id, snapped.offset_along_wall_mm)
            }
          }
        }
      }
      manualDragPointRef.current = null
      setDraggingObject(null); setDragPreviewPoint(null)
      setResizeDimensionWidth(''); setResizeDimensionHeight(''); setResizeDimensionLength('')
      try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
    }
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
  const authoringToolName: Partial<Record<ToolType, string>> = {
    select: 'เลือกวัตถุ', column: 'เสา', foundation: 'ฐานราก', beam: 'คาน', wall: 'ผนัง', door: 'ประตู', window: 'หน้าต่าง',
    slab: 'พื้นโครงสร้าง', slabVoid: 'ช่องเจาะพื้น/หลังคา', archFloor: 'พื้นสถาปัตย์', ceiling: 'ฝ้าเพดาน', roof: 'หลังคา', roomSeparator: 'เส้นแบ่งห้อง',
    stair: 'บันได', grid: 'เส้นกริด', gridSystem: 'ระบบกริด', gridCopy: 'คัดลอกกริด', pipe: 'แนวท่อ', fixture: 'อุปกรณ์ไฟฟ้า', cabinet: 'บิลท์อิน', moulding: 'แนวบัว', measure: 'ตลับเมตร', calibrate: 'ปรับสเกลภาพ', erase: 'ลบวัตถุ',
  }

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
      {activeTool === 'measure' && <div className="cf-tape-measure-hint" aria-live="polite">
        ตลับเมตร · {tapeMeasure?.complete ? 'คลิกเพื่อเริ่มวัดเส้นใหม่' : tapeMeasure ? 'คลิกจุดปลาย' : 'คลิกจุดเริ่ม'} · Esc ออก
      </div>}
      {activeTool === 'select' && editableSelectionIds.some(id => {
        const object = planProject.objects[id]
        return object && (isColumnObject(object) || isFoundationObject(object) || isWallObject(object) || isBeamObject(object) || isGridObject(object) || isDoorObject(object) || isWindowObject(object) || ['structure.slab', 'architecture.floor', 'architecture.ceiling', 'roof.system', 'architecture.room_separator', 'drainage.pipe_route', 'plumbing.pipe_route', 'decorative.moulding_run', 'interior.cabinet_run'].includes(object.object_type))
      }) && <div className="cf-tape-measure-hint" aria-live="polite">จุดจับสีน้ำเงิน: ปรับขนาดเสา/ฐานราก หรือลากปลายผนัง คาน กริด ท่อ และแนวบัว · จุดสีม่วง: หมุนบิลท์อินรอบจุดวาง · จุดสีส้ม: ลากขอบปรับความกว้าง หรือลากจุดกึ่งกลางปรับตำแหน่ง (BIM Snap ขอบเสา 100 มม.) · ปุ่ม ⇄: สลับด้านบานประตู</div>}
      {placementHint && <div className="cf-tape-measure-hint" aria-live="polite" data-tool-step={placementStatus?.step}>
        <strong>{placementStatus?.stepLabel}</strong> · {placementHint} · {placementStatus?.constraint} {escapeLabel && `· ${escapeLabel}`}
      </div>}
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
      {supportsPlacementDimensions && dimensionOverlayPosition && (showXDimension || showYDimension || hasLineGeometryInput) && <div className="cf-dynamic-dimensions" role="group" aria-label="ระยะและแนวระหว่างวางวัตถุ" onPointerDown={event => event.stopPropagation()} style={{
        left: Math.max(8, Math.min(dimensionOverlayPosition[0] > (containerRef.current?.clientWidth ?? 800) / 2 ? dimensionOverlayPosition[0] - 318 : dimensionOverlayPosition[0] + 18, (containerRef.current?.clientWidth ?? 800) - 318)),
        top: Math.max(8, Math.min(dimensionOverlayPosition[1] > (containerRef.current?.clientHeight ?? 600) / 2 ? dimensionOverlayPosition[1] - 94 : dimensionOverlayPosition[1] + 22, (containerRef.current?.clientHeight ?? 600) - 86)),
      }}>
        {showXDimension && <label><span>X · {displayUnit}</span><input ref={dimensionInputXRef} aria-label={`ระยะจากแนวอ้างอิง X (${displayUnit})`} type="text" inputMode="decimal" value={xDimensionDisplay} onFocus={event => { if (dimensionReferences.refX !== undefined) setDimensionAnchorX(dimensionAnchorX ?? dimensionReferences.refX); setDimensionKeyboardAxis('x'); event.currentTarget.select() }} onChange={event => { setDimensionAnchorX(dimensionAnchorX ?? dimensionReferences.refX ?? null); setDimensionInputX(event.target.value) }} onKeyDown={handleDimensionInputKeyDown} /></label>}
        {showYDimension && <label><span>Y · {displayUnit}</span><input ref={dimensionInputYRef} aria-label={`ระยะจากแนวอ้างอิง Y (${displayUnit})`} type="text" inputMode="decimal" value={yDimensionDisplay} onFocus={event => { if (dimensionReferences.refY !== undefined) setDimensionAnchorY(dimensionAnchorY ?? dimensionReferences.refY); setDimensionKeyboardAxis('y'); event.currentTarget.select() }} onChange={event => { setDimensionAnchorY(dimensionAnchorY ?? dimensionReferences.refY ?? null); setDimensionInputY(event.target.value) }} onKeyDown={handleDimensionInputKeyDown} /></label>}
        {hasLineGeometryInput && <>
          <label><span>ระยะ · {displayUnit}</span><input aria-label={`ความยาวช่วงที่วาด (${displayUnit})`} type="text" inputMode="decimal" value={drawLengthMeters} placeholder="ตามเมาส์" onFocus={event => event.currentTarget.select()} onChange={event => setDrawLengthMeters(event.target.value)} onKeyDown={handlePlacementInputKeyDown} /></label>
          <label><span>องศ</span><input aria-label="องศาช่วงที่วาด (0 องศาขวา 90 องศาขึ้น)" type="number" step="0.1" value={drawAngleDegrees} placeholder="ตามเมาส์" onFocus={event => event.currentTarget.select()} onChange={event => setDrawAngleDegrees(event.target.value)} onKeyDown={handlePlacementInputKeyDown} /></label>
        </>}
        {(showXDimension || showYDimension) && <button type="button" className="cf-dimension-reference-toggle" aria-label="สลับวัดจากกึ่งกลางหรือขอบวัตถุ" aria-pressed={dimensionReferenceMode === 'edge'} onClick={toggleDimensionReferenceMode}>วัดจาก {dimensionReferenceMode === 'center' ? 'กึ่งกลาง' : 'ขอบ'}</button>}
        <small>{isHostedOpeningPlacement ? 'พิมพ์ระยะจากขอบช่อง · Tab/Shift+Tab สลับขอบ/กึ่งกลาง · Enter วาง' : hasLineGeometryInput ? `ระยะ/องศาคุมช่วงเส้น · Enter วาดช่วง${showXDimension || showYDimension ? ` · ${showXDimension && showYDimension ? 'Shift+Tab สลับ X/Y' : 'Tab ขอบ/กลาง'}` : ''}` : `พิมพ์ระยะ ${showXDimension && showYDimension ? '· Tab ขอบ/กลาง · Shift+Tab สลับ X/Y · ' : '· Tab/Shift+Tab ขอบ/กลาง · '}Enter วาง`} · Esc ยกเลิกขั้นตอน/ออกเมื่อว่าง</small>
      </div>}
      {activeTool === 'select' && pickCandidates.length > 1 && <div className="cf-pick-stack" role="group" aria-label="วัตถุซ้อนกัน" onPointerDown={event => event.stopPropagation()}>
        <span>วัตถุซ้อนกัน {pickCandidates.length} ชิ้น</span>
          <button type="button" onClick={() => cyclePick(true)} aria-label="เลือกวัตถุก่อนหน้า">‹</button>
        <select aria-label="เลือกวัตถุที่ซ้อนกัน" value={pickCandidates.includes(hoveredId ?? '') ? hoveredId! : pickCandidates[0]} onChange={event => { setHoveredId(event.target.value); onSelectionChange?.([event.target.value], event.target.value); onSelectObject(event.target.value) }}>
          {pickCandidates.map(id => {
            const object = planProject.objects[id]
            if (!object) return null
            const family = object.object_type === 'architecture.wall' ? 'ผนัง' : object.object_type === 'structure.beam' ? 'คาน' : object.object_type === 'structure.column' ? 'เสา' : object.object_type === 'structure.foundation' ? 'ฐานราก' : object.object_type === 'door_window.door' ? 'ประตู' : object.object_type === 'door_window.window' ? 'หน้าต่าง' : object.object_type
            const data = object.module_data as unknown as Record<string, unknown>
            return <option key={id} value={id}>{family} {String(data.mark ?? data.type_mark ?? 'ไม่มีรหัสแบบ')}</option>
          })}
        </select>
        <button type="button" onClick={() => cyclePick()} aria-label="เลือกวัตถุถัดไป">›</button>
        <small>Tab / Shift+Tab · iPad แตะลูกศรหรือเลือกจากรายการ</small>
      </div>}
      <div className="cf-authoring-controls" onPointerDown={(event) => event.stopPropagation()}>
        <button type="button" className="cf-authoring-controls-toggle" aria-expanded={authoringControlsOpen} onClick={() => setAuthoringControlsOpen(open => !open)}>
          <span>ตัวเลือกการวาด · {authoringToolName[activeTool] ?? activeTool}</span>
          <span aria-hidden="true">{authoringControlsOpen ? 'ยุบ' : 'แสดง'}</span>
        </button>
        {authoringControlsOpen && <div className="cf-authoring-controls-content">
        {activeTool === 'pipe' && <label className="cf-reference-control">ระบบท่อ
          <select aria-label="ระบบของแนวท่อ" value={pipeSystem} onChange={event => setPipeSystem(event.target.value as typeof pipeSystem)}>
            <option value="waste">น้ำทิ้ง</option><option value="soil">โสโครก</option><option value="rainwater">น้ำฝน</option>
            <option value="vent">อากาศ</option><option value="cold_water">น้ำดีเย็น</option><option value="hot_water">น้ำร้อน</option>
          </select>
          <small>น้ำทิ้ง/โสโครก/น้ำฝนสร้างระดับปลายให้ลาดลง 1:100 · ปรับขนาดและระดับต่อได้ในคุณสมบัติ</small>
        </label>}
        {activeTool === 'fixture' && <label className="cf-reference-control">อุปกรณ์ไฟฟ้า
          <select aria-label="ชนิดอุปกรณ์ไฟฟ้าที่จะวาง" value={fixtureKind} onChange={event => setFixtureKind(event.target.value as typeof fixtureKind)}>
            <option value="light">ดวงโคม</option><option value="switch">สวิตช์</option><option value="outlet">เต้ารับ</option><option value="panel">ตู้ไฟ</option>
          </select>
        </label>}
        {activeTool === 'roof' && <div className="cf-grid-orientation-control" role="group" aria-label="ตั้งค่าหลังคาก่อนวาด">
          <label>ทรงหลังคา <select aria-label="ทรงหลังคาก่อนวาด" value={roofShape} onChange={event => setRoofShape(event.target.value as typeof roofShape)}><option value="hip">ปั้นหยา</option><option value="gable">จั่ว · รูป 4 ด้าน</option><option value="flat">ดาดฟ้า</option></select></label>
          {roofShape !== 'flat' && <label>ความลาด (องศา)<input aria-label="ความลาดหลังคาก่อนวาด (องศา)" type="number" min="0.5" max="88" step="0.5" value={roofSlopeDeg} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) setRoofSlopeDeg(Math.max(0.5, Math.min(88, value))) }} /></label>}
          <label>ยกจากระดับชั้น ({displayUnit}) <WorkbenchNumberInput ariaLabel={`ระยะยกหลังคาจากระดับชั้น (${displayUnit})`} value={roofElevationOffsetMm} unit={displayUnit} onChange={setRoofElevationOffsetMm} style={{ width: 72 }} /></label>
          <label>หนา (มม.) <WorkbenchNumberInput ariaLabel="ความหนาหลังคาก่อนวาด (มม.)" value={roofThicknessMm} onChange={value => setRoofThicknessMm(Math.max(1, value))} style={{ width: 58 }} /></label>
          <label>วัสดุมุง <select aria-label="วัสดุมุงหลังคาก่อนวาด" value={roofMaterial} onChange={event => setRoofMaterial(event.target.value)}><option value="metal_sheet">เมทัลชีท</option><option value="pu_metal_sheet">เมทัลชีท PU</option><option value="concrete_tile">กระเบื้องคอนกรีต</option><option value="clay_tile">กระเบื้องดินเผา</option><option value="reinforced_concrete">คอนกรีตเสริมเหล็ก</option><option value="polycarbonate">โพลีคาร์บอเนต</option></select></label>
          <small>{roofShape === 'gable' ? 'กำหนดความลาดสลับด้านที่ 1 และ 3 · ต้องวาดขอบเขต 4 จุด' : roofShape === 'flat' ? 'สร้างผืนราบตามขอบเขต · ตั้งความหนาและวัสดุก่อนวาด' : 'สร้างความลาดเข้าหาสันปั้นหยา · ปรับความลาดรายด้านได้หลังวาง'}</small>
        </div>}
        {activeTool === 'stair' && <div role="group" aria-label="ตั้งค่าบันไดก่อนวาด" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxWidth: 650, alignItems: 'center' }}>
          <label>รูปแบบ <select aria-label="รูปแบบบันไดก่อนวาด" value={stairOptions.stair_type} onChange={e => setStairOptions(o => ({ ...o, stair_type: e.target.value as StairModuleData['stair_type'] }))}><option value="straight">ตรง</option><option value="l_shape">L</option><option value="u_shape">U</option></select></label>
          <label>จบที่ <select aria-label="ระดับจบบันไดก่อนวาด" value={stairOptions.top_level_id} onChange={e => {
            const top = project.levels.find(l => l.id === e.target.value), base = project.levels.find(l => l.id === project.project.active_level_id)
            setStairOptions(o => ({ ...o, top_level_id: e.target.value, num_risers: top && base ? Math.ceil((top.elevation_mm - base.elevation_mm) / 190) : o.num_risers, first_flight_risers: undefined }))
          }}><option value="">เลือกระดับจบ</option>{project.levels.filter(l => l.elevation_mm > (project.levels.find(b => b.id === project.project.active_level_id)?.elevation_mm ?? 0)).map(l => <option key={l.id} value={l.id}>{l.name} +{(l.elevation_mm / 1000).toFixed(2)}</option>)}</select></label>
          <label>กว้าง ({displayUnit}) <WorkbenchNumberInput ariaLabel="ความกว้างบันไดก่อนวาด" value={stairOptions.width_mm} unit={displayUnit} onChange={v => setStairOptions(o => ({ ...o, width_mm: v }))} style={{ width: 65 }} /></label>
          <label>ขั้นรวม <WorkbenchNumberInput ariaLabel="จำนวนลูกตั้งก่อนวาด" value={stairOptions.num_risers} onChange={v => setStairOptions(o => ({ ...o, num_risers: v }))} style={{ width: 48 }} /></label>
          {stairOptions.stair_type !== 'straight' && <>
            <label>เที่ยวแรก <WorkbenchNumberInput ariaLabel="ลูกตั้งเที่ยวแรกก่อนวาด" value={stairOptions.first_flight_risers ?? Math.floor(stairOptions.num_risers / 2)} onChange={v => setStairOptions(o => ({ ...o, first_flight_risers: v }))} style={{ width: 48 }} /></label>
            <label>ชานพัก ({displayUnit}) <WorkbenchNumberInput ariaLabel="ความลึกชานพักก่อนวาด" value={stairOptions.landing_depth_mm} unit={displayUnit} onChange={v => setStairOptions(o => ({ ...o, landing_depth_mm: v }))} style={{ width: 65 }} /></label>
            <label>เลี้ยว <select aria-label="ทิศเลี้ยวบันไดก่อนวาด" value={stairOptions.turn_direction} onChange={e => setStairOptions(o => ({ ...o, turn_direction: e.target.value as 'left' | 'right' }))}><option value="right">ขวา</option><option value="left">ซ้าย</option></select></label>
            {stairOptions.stair_type === 'u_shape' && <label>ช่องกลาง ({displayUnit}) <WorkbenchNumberInput ariaLabel="ช่องกลางบันไดก่อนวาด" value={stairOptions.flight_gap_mm ?? 100} unit={displayUnit} onChange={v => setStairOptions(o => ({ ...o, flight_gap_mm: v }))} style={{ width: 65 }} /></label>}
          </>}
          <small>จุดเริ่ม → ปลายเที่ยวแรกกำหนดระยะวิ่งและทิศ · ลูกนอนคำนวณตามระยะจริง</small>
          {stairError && <span role="alert" style={{ color: '#b91c1c' }}>{stairError}</span>}
        </div>}
        {activeTool === 'grid' && <div className="cf-grid-orientation-control" role="group" aria-label="วาดเส้นกริดอ้างอิง">
          <strong>เส้นกริดอ้างอิง · เส้นเดี่ยว</strong>
          <label>ลำดับป้าย
            <select aria-label="ลำดับป้ายเส้นกริดอ้างอิง" value={gridSequenceStyle} onChange={event => setGridSequenceStyle(event.target.value as typeof gridSequenceStyle)}>
              <option value="auto">อัตโนมัติ (ตั้ง A / นอน 1)</option><option value="alpha">ตัวอักษร A, B, C</option><option value="numeric">ตัวเลข 1, 2, 3</option>
            </select>
          </label>
          <small>{gridStartPoint ? 'คลิกจุดปลายเพื่อกำหนดแนวและมุมเอียง · Esc ยกเลิก' : 'คลิกจุดเริ่มและจุดปลาย · ปรับย้าย คัดลอก และตั้ง bubble ได้ภายหลัง'}</small>
        </div>}
        {activeTool === 'gridSystem' && <div className="cf-grid-orientation-control" role="group" aria-label="สร้างระบบ Grid Line">
          <strong>ระบบ Grid Line · ระยะเป็นช่วงจากเส้นก่อนหน้า ({displayUnit})</strong>
          <div className="cf-grid-system-axis">
            <label>แนวตั้ง · ระยะ X<input aria-label={`ระยะช่วงแนวตั้งของระบบกริด (${displayUnit})`} value={gridXIntervals} onChange={event => { setGridXIntervals(event.target.value); setGridSystemError('') }} onKeyDown={handlePlacementInputKeyDown} placeholder={`3, 2.5, 3 ${displayUnit}`} /></label>
            <label>ป้ายแรก<input aria-label="ป้ายเริ่มต้นแนวตั้ง" value={gridXFirstTag} onChange={event => setGridXFirstTag(event.target.value)} /></label>
          </div>
          <div className="cf-grid-system-axis">
            <label>แนวนอน · ระยะ Y<input aria-label={`ระยะช่วงแนวนอนของระบบกริด (${displayUnit})`} value={gridYIntervals} onChange={event => { setGridYIntervals(event.target.value); setGridSystemError('') }} onKeyDown={handlePlacementInputKeyDown} placeholder={`2.5, 3 ${displayUnit}`} /></label>
            <label>ป้ายแรก<input aria-label="ป้ายเริ่มต้นแนวนอน" value={gridYFirstTag} onChange={event => setGridYFirstTag(event.target.value)} /></label>
          </div>
            <small>คั่นแต่ละช่วงด้วยจุลภาค · คลิกจุดกำเนิดหนึ่งครั้งเพื่อสร้างได้ทั้งสองแนว · ลบช่องระยะของแนวที่ไม่ใช้</small>
            {gridSystemError && <small role="alert" style={{ color: '#b42332' }}>{gridSystemError}</small>}
        </div>}
        {(['column', 'foundation', 'beam', 'wall', 'door', 'window', 'slab', 'roof'] as ToolType[]).includes(activeTool) && (() => {
          const familyByTool: Partial<Record<ToolType, string>> = {
            column: 'structure.column', foundation: 'structure.foundation', beam: 'structure.beam',
            wall: 'architecture.wall', door: 'door_window.door', window: 'door_window.window', slab: 'structure.slab', roof: 'roof.system',
          }
          const activeTypeMark = activeTool === 'column' ? activeColumnTypeMark
            : activeTool === 'foundation' ? activeFoundationTypeMark
              : activeTool === 'beam' ? activeBeamTypeMark
                : activeTool === 'wall' ? activeWallTypeMark
                  : activeTool === 'door' ? activeDoorTypeMark : activeTool === 'window' ? activeWindowTypeMark : activeTool === 'roof' ? activeRoofTypeMark : activeSlabTypeMark
          const availableTypes = project.types.filter(type => type.object_type === familyByTool[activeTool])
          const label = activeTool === 'column' ? 'เสา' : activeTool === 'foundation' ? 'ฐานราก'
            : activeTool === 'beam' ? 'คาน' : activeTool === 'wall' ? 'ผนัง'
              : activeTool === 'door' ? 'ประตู' : activeTool === 'window' ? 'หน้าต่าง' : activeTool === 'roof' ? 'ระบบหลังคา' : 'พื้น'
          return <TypePicker types={availableTypes} value={activeTypeMark} label={label} displayUnit={displayUnit} onChange={onChangeActiveTypeMark} onOpenCatalog={onOpenTypeManager}/>
        })()}
        {(activeTool === 'wall' || activeTool === 'beam') && <label className="cf-reference-control">
          <span>แนวอ้างอิง</span>
          <select aria-label="แนวอ้างอิงการวาง" value={placementReference} onChange={(event) => setPreference('placementReference', event.target.value as typeof placementReference)}>
            <option value="centerline">กึ่งกลาง</option>
            <option value="left_face">ริมซ้ายตามทิศลาก</option>
            <option value="right_face">ริมขวาตามทิศลาก</option>
          </select>
        </label>}
        {(activeTool === 'wall' || activeTool === 'beam') && <label className="cf-reference-control">
          <span>จัดแนวช่วงที่วาด</span>
          <select aria-label="ข้อจำกัดแนวการวาด" value={lineConstraintMode} onChange={(event) => setPreference('lineConstraintMode', event.target.value as typeof lineConstraintMode)}>
            <option value="auto">อัตโนมัติ: ขนาน/ตั้งฉาก</option>
            <option value="none">อิสระ</option>
            <option value="parallel">ขนานกับแนวใกล้จุดเริ่ม</option>
            <option value="perpendicular">ตั้งฉากกับแนวใกล้จุดเริ่ม</option>
          </select>
          {lineConstraintMode !== 'none' && <span className="cf-snap-hint">
            {(activeTool === 'beam' ? beamStartNode?.reference : wallStartNode?.reference)?.description
              ? `อ้างอิง: ${(activeTool === 'beam' ? beamStartNode?.reference : wallStartNode?.reference)?.description}`
              : 'เริ่มจากหรือใกล้แนวผนัง/คาน ภายใน 150 มม.'}
          </span>}
        </label>}
        <details className="cf-snap-details"><summary>Snap · {snapModes.length ? `เปิด ${snapModes.length} ประเภท` : 'วางอิสระ'} · ตั้งค่า</summary><div className="cf-snap-controls" role="group" aria-label="ประเภทจุด Snap">
          <span>Snap</span>
          {([
            ['grid', 'กริด'], ['endpoint', 'ปลาย/มุม'], ['midpoint', 'กึ่งกลาง'], ['center', 'ศูนย์กลาง'],
            ['face', 'ขอบ'], ['centerline', 'แนว'], ['intersection', 'จุดตัด'],
          ] as [SnapMode, string][]).map(([mode, label]) => <button
            key={mode}
            type="button"
            aria-pressed={snapModes.includes(mode)}
            className={snapModes.includes(mode) ? 'is-enabled' : ''}
            title={`${snapModes.includes(mode) ? 'ปิด' : 'เปิด'} Snap ${label}`}
            onClick={() => setPreference('snapModes', current => current.includes(mode) ? current.filter(value => value !== mode) : [...current, mode])}
          >{label}</button>)}
          <span className="cf-snap-hint">Ctrl วางอิสระ · {activeTool === 'wall' || activeTool === 'beam' ? `Space เปลี่ยนแนวอ้างอิง (ขณะนี้: ${placementReference === 'centerline' ? 'กึ่งกลาง' : placementReference === 'left_face' ? 'ชิดซ้าย' : 'ชิดขวา'})` : 'เลื่อนเมาส์ให้เห็นสัญลักษณ์ก่อนคลิก'}</span>
        </div></details>
        </div>}
      </div>
      <div className="cf-canvas-zoom" aria-label="ควบคุมมุมมองแปลน">
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
