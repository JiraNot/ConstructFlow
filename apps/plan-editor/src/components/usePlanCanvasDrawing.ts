import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { DoorHanding, InteriorFurnitureKind, ProjectDocument, StairModuleData } from '@constructflow/project-model'
import type { ClashSeverity, CoordinationFinding } from '@constructflow/clash-engine'
import type { SnapResult, WallHostSnapResult } from '@constructflow/snapping-engine'
import type { DisplayLengthUnit } from '@constructflow/project-model'
import { loadPlanCanvasRenderer, type PlanCanvasRenderer, type UnderlayConfig, type PlanCanvasDisplaySettings, type PlanLabelVisibility } from '../rendering/planRendererTypes.js'
import { worldToScreen, type ViewportState } from '../viewport/viewportTransform.js'
import type { ToolType } from './Toolbar.js'
import type { PlanCanvasPreferences } from '../app/planCanvasPreferences.mjs'
import type { ProjectPresenceSession } from '../projectPresence.js'
import type { MeasureMode, PlanSketchMode, WallDrawMode } from './planCanvasInteractionTypes.js'
import { drawPlanCanvasBaseScene } from './drawPlanCanvasBaseScene.js'
import { drawPlanCanvasWallTouchPreview } from './drawPlanCanvasWallTouchPreview.js'

type SelectionHandleRenderer = typeof import('./drawPlanCanvasSelectionHandles.js')['drawPlanCanvasSelectionHandles']
type TransientRenderer = typeof import('./planCanvasTransientRenderer.js')
type CoordinationOverlayRenderer = typeof import('./drawPlanCanvasCoordinationOverlay.js')['drawPlanCanvasCoordinationOverlay']
type ElectricalCircuitOverlayRenderer = typeof import('./drawPlanCanvasElectricalCircuitOverlay.js')['drawPlanCanvasElectricalCircuitOverlay']

interface UsePlanCanvasDrawingOptions {
  containerRef: RefObject<HTMLDivElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  project: ProjectDocument
  planProject: ProjectDocument
  activeFamilyId?: string
  activeFamilyTypeId?: string
  activeTool: ToolType
  supplierBundleVisualType?: 'shape' | 'length' | 'area'
  bundleStartPoint?: [number, number] | null
  activeSnap: SnapResult | null
  activeWallSnap: WallHostSnapResult | null
  activeColumnTypeMark: string
  activeFoundationTypeMark: string
  activeBeamTypeMark: string
  activeWallTypeMark: string
  activeDoorTypeMark: string
  activeWindowTypeMark: string
  beamStartNode: { point_mm: [number, number] } | null
  wallStartNode: { point_mm: [number, number] } | null
  doorHanding: DoorHanding
  stairPreview: StairModuleData | null
  stairStartPoint: [number, number] | null
  resolveReferencePath: (start: [number, number], end: [number, number], widthMm: number) => [[number, number], [number, number]]
  calibrationP1: [number, number] | null
  calibrationMousePoint: [number, number] | null
  selectedIds: string[]
  collaborators: readonly ProjectPresenceSession[]
  editableSelectionIds: string[]
  hoveredId: string | null
  underlay?: UnderlayConfig | null
  labelMode: 'name' | 'name-size'
  labelVisibility: PlanLabelVisibility
  displaySettings: PlanCanvasDisplaySettings
  planDiscipline: 'architecture' | 'framing' | 'roof'
  viewport: ViewportState
  displayUnit: DisplayLengthUnit
  showRealtimeDimensions?: boolean
  lengthPrecision?: number
  anglePrecision?: number
  manipulationPreview: { project: ProjectDocument; ids: string[]; valid: boolean } | null
  externalManipulationPreview: { project: ProjectDocument; ids: string[]; valid: boolean } | null
  coordination: readonly CoordinationFinding[]
  coordinationSeverities?: readonly ClashSeverity[]
  coordinationFocusSelection: boolean
  gridStartPoint: [number, number] | null
  gridCopySourceId: string | null
  tapeMeasure: { start: [number, number]; end: [number, number]; complete: boolean } | null
  measureMode?: MeasureMode
  measurePoints?: [number, number][]
  measureComplete?: boolean
  dimensionReferenceMode: PlanCanvasPreferences['dimensionReferenceMode']
  selectionBox: { start: [number, number]; end: [number, number] } | null
  roomSeparatorStart: [number, number] | null
  pipeSystem: 'waste' | 'soil' | 'rainwater' | 'vent' | 'cold_water' | 'hot_water'
  fixtureKind: 'light' | 'switch' | 'outlet' | 'panel'
  furnitureKind: InteriorFurnitureKind
  slabBoundary: [number, number][]
  wallTouchPreview?: [number, number][] | null
  wallDrawMode?: WallDrawMode
  lineDrawingMode?: PlanCanvasPreferences['lineDrawingMode']
  wallAngleSnapDeg?: PlanCanvasPreferences['wallAngleSnapDeg']
  sketchMode?: PlanSketchMode
  sketchPoints?: [number, number][]
}

export function usePlanCanvasDrawing({ containerRef, canvasRef, ...options }: UsePlanCanvasDrawingOptions) {
  const [drawSelectionHandles, setDrawSelectionHandles] = useState<SelectionHandleRenderer | null>(null)
  const [transientRenderer, setTransientRenderer] = useState<TransientRenderer | null>(null)
  const [drawCoordinationOverlay, setDrawCoordinationOverlay] = useState<CoordinationOverlayRenderer | null>(null)
  const [drawElectricalCircuitOverlay, setDrawElectricalCircuitOverlay] = useState<ElectricalCircuitOverlayRenderer | null>(null)
  const [planRenderer, setPlanRenderer] = useState<PlanCanvasRenderer | null>(null)
  const {
    activeTool, supplierBundleVisualType, bundleStartPoint, activeFamilyId, activeFamilyTypeId, activeSnap, project, planProject, activeColumnTypeMark, activeFoundationTypeMark,
    activeBeamTypeMark, activeWallTypeMark, activeDoorTypeMark, activeWindowTypeMark,
    beamStartNode, wallStartNode, activeWallSnap, doorHanding, stairPreview, stairStartPoint,
    resolveReferencePath, calibrationP1, calibrationMousePoint, selectedIds, editableSelectionIds, collaborators,
    hoveredId, underlay, labelMode, labelVisibility, displaySettings, planDiscipline, viewport, displayUnit, showRealtimeDimensions = true, lengthPrecision = 3, anglePrecision = 0,
    manipulationPreview, externalManipulationPreview, coordination, coordinationSeverities,
    coordinationFocusSelection, gridStartPoint, gridCopySourceId, tapeMeasure, measureMode, measurePoints, measureComplete,
    dimensionReferenceMode, selectionBox, roomSeparatorStart, pipeSystem, fixtureKind, furnitureKind, slabBoundary,
    wallTouchPreview, wallDrawMode = 'continuous-lines', lineDrawingMode = 'orthogonal', wallAngleSnapDeg = 45, sketchMode, sketchPoints,
  } = options

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    if (!planRenderer) return
    const probe = (window as unknown as { __cfPlanRedrawDurationsMs?: number[] }).__cfPlanRedrawDurationsMs
    const drawStartedAt = probe ? performance.now() : 0

    const ghost = transientRenderer?.buildPlanPlacementGhost({
      activeTool, activeSnap, project, planProject, activeColumnTypeMark, activeFoundationTypeMark, activeBeamTypeMark,
      activeWallTypeMark, activeDoorTypeMark, activeWindowTypeMark, beamStartNode,
      wallStartNode: wallTouchPreview?.length ? null : wallStartNode,
      activeWallSnap, doorHanding, stairPreview, stairStartPoint, resolveReferencePath,
    }) ?? null
    canvas.dataset.wallJunctionPreview = ghost?.wall_junction_preview ? 'true' : 'false'
    canvas.dataset.wallJunctionTargetCount = String(ghost?.wall_junction_preview?.target_count ?? 0)
    const visibleManipulationPreview = manipulationPreview ?? externalManipulationPreview
    canvas.dataset.manipulationPreviewObjectIds = visibleManipulationPreview?.ids.join(' ') ?? ''
    canvas.dataset.manipulationPreviewValid = visibleManipulationPreview ? String(visibleManipulationPreview.valid) : ''
    const calibrationOverlay = activeTool === 'calibrate'
      ? { point1_mm: calibrationP1, point2_mm: null, mouse_mm: calibrationMousePoint }
      : null

    drawPlanCanvasBaseScene({
      ctx, width: rect.width, height: rect.height, project, planProject, viewport,
      selectedIds: [...new Set([...selectedIds, ...collaborators.flatMap(session => session.selected_object_ids)])], collaborators,
      editableSelectionIds, hoveredId, activeSnap, ghost, underlay, calibrationOverlay, labelMode,
      labelVisibility, displaySettings, planDiscipline, manipulationPreview, externalManipulationPreview, renderer: planRenderer,
    })
    if (wallTouchPreview) drawPlanCanvasWallTouchPreview(ctx, wallTouchPreview, viewport, displayUnit, lengthPrecision, anglePrecision, lineDrawingMode === 'orthogonal' ? 90 : wallAngleSnapDeg, wallDrawMode)
    if (drawElectricalCircuitOverlay && editableSelectionIds.some(id => {
      const object = planProject.objects[id]
      return object?.object_type === 'electrical.fixture' && (object.module_data as { kind?: unknown }).kind === 'panel'
    })) drawElectricalCircuitOverlay(ctx, project, editableSelectionIds, new Set(Object.keys(planProject.objects)), viewport)
    if (coordination.length) drawCoordinationOverlay?.(ctx, coordination, project, viewport, editableSelectionIds, coordinationSeverities, coordinationFocusSelection)
    drawSelectionHandles?.(ctx, editableSelectionIds, planProject, viewport, displayUnit, manipulationPreview, showRealtimeDimensions, lengthPrecision, activeTool === 'select')
    transientRenderer?.drawPlanCanvasToolOverlays({
      ctx, activeTool, supplierBundleVisualType, bundleStartPoint, activeFamilyId, activeFamilyTypeId, gridStartPoint, activeSnap,
      wallStartNode: wallTouchPreview?.length ? null : wallStartNode, beamStartNode,
      lineDrawingMode, planProject, viewport, gridCopySourceId, tapeMeasure, measureMode, measurePoints, measureComplete,
      displayUnit, activeWallSnap, project, activeDoorTypeMark, activeWindowTypeMark, showRealtimeDimensions, lengthPrecision, anglePrecision,
      dimensionReferenceMode, selectionBox, roomSeparatorStart, pipeSystem, fixtureKind, furnitureKind, slabBoundary, sketchMode, sketchPoints,
    })
    if (probe) probe.push(performance.now() - drawStartedAt)
  }, [    canvasRef, drawSelectionHandles, transientRenderer, drawCoordinationOverlay, drawElectricalCircuitOverlay, planRenderer, activeTool, supplierBundleVisualType, bundleStartPoint, activeFamilyId, activeFamilyTypeId, activeSnap, project, planProject, activeColumnTypeMark, activeFoundationTypeMark, activeBeamTypeMark, activeWallTypeMark, activeDoorTypeMark, activeWindowTypeMark,

    beamStartNode, wallStartNode, activeWallSnap, doorHanding, stairPreview, stairStartPoint, lineDrawingMode, wallAngleSnapDeg,
    resolveReferencePath, calibrationP1, calibrationMousePoint, selectedIds, editableSelectionIds,
    hoveredId, underlay, labelMode, labelVisibility, displaySettings, planDiscipline, viewport, displayUnit, collaborators,
    manipulationPreview, externalManipulationPreview, coordination, coordinationSeverities,
    coordinationFocusSelection, gridStartPoint, gridCopySourceId, tapeMeasure, measureMode, measurePoints, measureComplete,
    showRealtimeDimensions, lengthPrecision, anglePrecision, dimensionReferenceMode, selectionBox, roomSeparatorStart, pipeSystem, fixtureKind, furnitureKind, slabBoundary, wallTouchPreview, wallDrawMode, wallAngleSnapDeg, sketchMode, sketchPoints,
  ])

  useEffect(() => {
    let active = true
    void loadPlanCanvasRenderer()
      .then(renderer => { if (active) setPlanRenderer(renderer) })
      .catch(() => undefined)
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!editableSelectionIds.length || drawSelectionHandles) return
    let active = true
    void import('./drawPlanCanvasSelectionHandles.js')
      .then(module => { if (active) setDrawSelectionHandles(() => module.drawPlanCanvasSelectionHandles) })
      .catch(() => undefined)
    return () => { active = false }
  }, [editableSelectionIds.length, drawSelectionHandles])

  const transientToolsNeeded = activeTool !== 'select' || activeSnap !== null || selectionBox !== null || tapeMeasure !== null
  useEffect(() => {
    if (!transientToolsNeeded || transientRenderer) return
    let active = true
    void import('./planCanvasTransientRenderer.js')
      .then(module => { if (active) setTransientRenderer(module) })
      .catch(() => undefined)
    return () => { active = false }
  }, [transientToolsNeeded, transientRenderer])

  useEffect(() => {
    if (!coordination.length || drawCoordinationOverlay) return
    let active = true
    void import('./drawPlanCanvasCoordinationOverlay.js')
      .then(module => { if (active) setDrawCoordinationOverlay(() => module.drawPlanCanvasCoordinationOverlay) })
      .catch(() => undefined)
    return () => { active = false }
  }, [coordination.length, drawCoordinationOverlay])

  const electricalPanelSelected = editableSelectionIds.some(id => {
    const object = planProject.objects[id]
    return object?.object_type === 'electrical.fixture' && (object.module_data as { kind?: unknown }).kind === 'panel'
  })
  useEffect(() => {
    if (!electricalPanelSelected || drawElectricalCircuitOverlay) return
    let active = true
    void import('./drawPlanCanvasElectricalCircuitOverlay.js')
      .then(module => { if (active) setDrawElectricalCircuitOverlay(() => module.drawPlanCanvasElectricalCircuitOverlay) })
      .catch(() => undefined)
    return () => { active = false }
  }, [electricalPanelSelected, drawElectricalCircuitOverlay])

  useEffect(() => redraw(), [redraw])

  const redrawRef = useRef(redraw)
  redrawRef.current = redraw

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const resizeCanvas = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = container.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.round(rect.width * dpr)), height = Math.max(1, Math.round(rect.height * dpr))
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height
      canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0)
      redrawRef.current()
    }

    const observer = new ResizeObserver(resizeCanvas)
    observer.observe(container)
    window.addEventListener('resize', resizeCanvas)
    resizeCanvas()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', resizeCanvas)
    }
  }, [containerRef, canvasRef])
}
