import { useCallback, useEffect, useRef, type RefObject } from 'react'
import type { DoorHanding, ProjectDocument, StairModuleData } from '@constructflow/project-model'
import type { ClashSeverity, CoordinationFinding } from '@constructflow/clash-engine'
import type { SnapResult, WallHostSnapResult } from '@constructflow/snapping-engine'
import type { DisplayLengthUnit } from '@constructflow/project-model'
import type { UnderlayConfig, PlanLabelVisibility } from '../rendering/planRenderer.js'
import type { ViewportState } from '../viewport/viewportTransform.js'
import type { ToolType } from './Toolbar.js'
import type { PlanCanvasPreferences } from '../app/planCanvasPreferences.mjs'
import { buildPlanPlacementGhost } from './buildPlanPlacementGhost.js'
import { drawPlanCanvasBaseScene } from './drawPlanCanvasBaseScene.js'
import { drawPlanCanvasSelectionHandles } from './drawPlanCanvasSelectionHandles.js'
import { drawPlanCanvasToolOverlays } from './drawPlanCanvasToolOverlays.js'

interface UsePlanCanvasDrawingOptions {
  containerRef: RefObject<HTMLDivElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  project: ProjectDocument
  planProject: ProjectDocument
  activeTool: ToolType
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
  editableSelectionIds: string[]
  hoveredId: string | null
  underlay?: UnderlayConfig | null
  labelMode: 'name' | 'name-size'
  labelVisibility: PlanLabelVisibility
  planDiscipline: 'architecture' | 'framing' | 'roof'
  viewport: ViewportState
  displayUnit: DisplayLengthUnit
  manipulationPreview: { project: ProjectDocument; ids: string[]; valid: boolean } | null
  externalManipulationPreview: { project: ProjectDocument; ids: string[]; valid: boolean } | null
  coordination: readonly CoordinationFinding[]
  coordinationSeverities?: readonly ClashSeverity[]
  coordinationFocusSelection: boolean
  gridStartPoint: [number, number] | null
  gridCopySourceId: string | null
  tapeMeasure: { start: [number, number]; end: [number, number]; complete: boolean } | null
  dimensionReferenceMode: PlanCanvasPreferences['dimensionReferenceMode']
  selectionBox: { start: [number, number]; end: [number, number] } | null
  roomSeparatorStart: [number, number] | null
  pipeSystem: 'waste' | 'soil' | 'rainwater' | 'vent' | 'cold_water' | 'hot_water'
  fixtureKind: 'light' | 'switch' | 'outlet' | 'panel'
  slabBoundary: [number, number][]
}

export function usePlanCanvasDrawing({ containerRef, canvasRef, ...options }: UsePlanCanvasDrawingOptions) {
  const {
    activeTool, activeSnap, project, planProject, activeColumnTypeMark, activeFoundationTypeMark,
    activeBeamTypeMark, activeWallTypeMark, activeDoorTypeMark, activeWindowTypeMark,
    beamStartNode, wallStartNode, activeWallSnap, doorHanding, stairPreview, stairStartPoint,
    resolveReferencePath, calibrationP1, calibrationMousePoint, selectedIds, editableSelectionIds,
    hoveredId, underlay, labelMode, labelVisibility, planDiscipline, viewport, displayUnit,
    manipulationPreview, externalManipulationPreview, coordination, coordinationSeverities,
    coordinationFocusSelection, gridStartPoint, gridCopySourceId, tapeMeasure,
    dimensionReferenceMode, selectionBox, roomSeparatorStart, pipeSystem, fixtureKind, slabBoundary,
  } = options

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const ghost = buildPlanPlacementGhost({
      activeTool, activeSnap, project, activeColumnTypeMark, activeFoundationTypeMark, activeBeamTypeMark,
      activeWallTypeMark, activeDoorTypeMark, activeWindowTypeMark, beamStartNode, wallStartNode,
      activeWallSnap, doorHanding, stairPreview, stairStartPoint, resolveReferencePath,
    })
    const calibrationOverlay = activeTool === 'calibrate'
      ? { point1_mm: calibrationP1, point2_mm: null, mouse_mm: calibrationMousePoint }
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
      displayUnit, activeWallSnap, project, activeDoorTypeMark, activeWindowTypeMark,
      dimensionReferenceMode, selectionBox, roomSeparatorStart, pipeSystem, fixtureKind, slabBoundary,
    })
  }, [
    canvasRef, activeTool, activeSnap, project, planProject, activeColumnTypeMark, activeFoundationTypeMark,
    activeBeamTypeMark, activeWallTypeMark, activeDoorTypeMark, activeWindowTypeMark,
    beamStartNode, wallStartNode, activeWallSnap, doorHanding, stairPreview, stairStartPoint,
    resolveReferencePath, calibrationP1, calibrationMousePoint, selectedIds, editableSelectionIds,
    hoveredId, underlay, labelMode, labelVisibility, planDiscipline, viewport, displayUnit,
    manipulationPreview, externalManipulationPreview, coordination, coordinationSeverities,
    coordinationFocusSelection, gridStartPoint, gridCopySourceId, tapeMeasure,
    dimensionReferenceMode, selectionBox, roomSeparatorStart, pipeSystem, fixtureKind, slabBoundary,
  ])

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
      const width = Math.round(rect.width), height = Math.round(rect.height)
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height
      redrawRef.current()
    }

    const observer = new ResizeObserver(resizeCanvas)
    observer.observe(container)
    resizeCanvas()
    return () => observer.disconnect()
  }, [containerRef, canvasRef])
}
