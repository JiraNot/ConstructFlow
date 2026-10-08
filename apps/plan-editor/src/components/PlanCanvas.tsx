import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import {
  ProjectDocument,
  isColumnObject,
  isFoundationObject,
  isGridObject,
  isBeamObject,
  isWallObject,
  isDoorObject,
  isWindowObject,
  DoorHanding,
  PlacementReference,
} from '@constructflow/project-model'
import { projectPointToWallOffsetMm } from '@constructflow/architecture-engine'
import { getPlanVisibleObjects } from '@constructflow/representation-engine'
import { constructionOutputs } from '@constructflow/domain-providers'
import { TypePicker } from './TypePicker.js'
import { TOOL_FAMILIES } from './catalogPresentation.js'
import { ToolType } from './Toolbar.js'
import {
  ViewportState,
  screenToWorld,
  worldToScreen,
  zoomAtScreenPoint,
} from '../viewport/viewportTransform.js'
import { constrainPointToReference, DEFAULT_SNAP_MODES, findNearestLinearReference, inferLinearConstraint, LinearReference, SnapMode, SnapResult, snapPoint, snapToWallHost, WallHostSnapResult } from '@constructflow/snapping-engine'
import { renderPlanView, PlacementGhost, UnderlayConfig } from '../rendering/planRenderer.js'
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react'

interface PlanCanvasProps {
  project: ProjectDocument
  activeTool: ToolType
  activeColumnTypeMark: string
  activeFoundationTypeMark: string
  activeBeamTypeMark: string
  activeWallTypeMark: string
  activeDoorTypeMark: string
  activeWindowTypeMark: string
  onOpenTypeManager: () => void
  onChangeActiveTypeMark: (typeMark: string) => void
  selectedId: string | null
  underlay?: UnderlayConfig | null
  onSelectObject: (id: string | null) => void
  onCommitColumn: (location_mm: [number, number]) => void
  onCommitFoundation: (opts: { columnId?: string; location_mm?: [number, number] }) => void
  onCommitBeam: (start: [number, number], end: [number, number], startColId?: string, endColId?: string, placementReference?: PlacementReference) => void
  onCommitWall: (start: [number, number], end: [number, number], placementReference?: PlacementReference) => void
  onCommitDoor: (wallId: string, point_mm: [number, number], offset_mm: number, handing: DoorHanding) => void
  onCommitWindow: (wallId: string, point_mm: [number, number], offset_mm: number) => void
  onCommitGrid: (orientation: 'vertical' | 'horizontal', position_mm: number) => void
  onCommitStair?: (location_mm: [number, number]) => void
  onMoveColumn: (id: string, newLocation_mm: [number, number]) => void
  onMoveWall: (id: string, delta_mm: [number, number]) => void
  onMoveOpening: (id: string, offset_along_wall_mm: number) => void
  onFlipDoorHanding?: (doorId: string) => void
  onStartCalibrationModal?: (measuredDist_mm: number) => void
  onCursorChange: (coords_mm: [number, number], snapKind: string) => void
}

export const PlanCanvas: React.FC<PlanCanvasProps> = ({
  project,
  activeTool,
  activeColumnTypeMark,
  activeFoundationTypeMark,
  activeBeamTypeMark,
  activeWallTypeMark,
  activeDoorTypeMark,
  activeWindowTypeMark,
  onChangeActiveTypeMark,
  onOpenTypeManager,
  selectedId,
  underlay,
  onSelectObject,
  onCommitColumn,
  onCommitFoundation,
  onCommitBeam,
  onCommitWall,
  onCommitDoor,
  onCommitWindow,
  onCommitGrid,
  onCommitStair,
  onMoveColumn,
  onMoveWall,
  onMoveOpening,
  onFlipDoorHanding,
  onStartCalibrationModal,
  onCursorChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hasInitialFitRef = useRef(false)
  const planVisibleObjects = useMemo(() => getPlanVisibleObjects(project), [project])
  const planProject = useMemo<ProjectDocument>(() => ({
    ...project,
    objects: Object.fromEntries(planVisibleObjects.map(object => [object.id, object])) as ProjectDocument['objects'],
  }), [project, planVisibleObjects])

  // Viewport state: 0.08 zoom = 1000mm -> 80px on screen.
  const [viewport, setViewport] = useState<ViewportState>({
    panX: 400,
    panY: 300,
    zoom: 0.08,
  })
  const [placementReference, setPlacementReference] = useState<'centerline' | 'left_face' | 'right_face'>('centerline')
  const [snapModes, setSnapModes] = useState<SnapMode[]>(DEFAULT_SNAP_MODES)
  const [lineConstraintMode, setLineConstraintMode] = useState<'auto' | 'none' | 'parallel' | 'perpendicular'>('auto')
  const [drawLengthMeters, setDrawLengthMeters] = useState('')
  const enabledSnapModes = useMemo(() => new Set(snapModes), [snapModes])

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
    const targetLengthMm = Number.parseFloat(drawLengthMeters) * 1000
    if (Number.isFinite(targetLengthMm) && targetLengthMm > 0) {
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
      description: `${constraintApplied ? constrainedSnap.description : snap.description}${!lockAxis && lineConstraintMode !== 'none' && !reference ? ' · ไม่พบแนวอ้างอิงใกล้จุดเริ่ม' : ''}${lineConstraintMode === 'auto' && reference && !inferredMode && !lockAxis ? ' · Auto: เล็งใกล้แนวขนาน/ตั้งฉากเพื่อจัดแนว' : ''}${lockAxis ? ' · Ortho' : ''}${Number.isFinite(targetLengthMm) && targetLengthMm > 0 ? ` · ${(targetLengthMm / 1000).toFixed(2)} m` : ''}`,
    }
  }, [drawLengthMeters, lineConstraintMode, viewport.zoom])

  const fitView = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const points: [number, number][] = []
    const pointKeys = ['location_mm', 'center_mm', 'start_point_mm', 'end_point_mm', 'origin_mm']
    const polygonKeys = ['boundary_mm', 'vertices_mm', 'outline_mm', 'points_mm', 'path_mm']
    for (const object of planVisibleObjects) {
      if (isGridObject(object)) continue
      const data = object.module_data as Record<string, unknown>
      for (const key of pointKeys) {
        const value = data[key]
        if (Array.isArray(value) && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
          points.push([value[0], value[1]])
        }
      }
      for (const key of polygonKeys) {
        const value = data[key]
        if (!Array.isArray(value)) continue
        for (const point of value) {
          if (Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1])) {
            points.push([point[0], point[1]])
          }
        }
      }
      const center = data.center_mm
      const size = data.size_mm
      if (Array.isArray(center) && Array.isArray(size) && Number.isFinite(center[0]) && Number.isFinite(center[1])) {
        points.push([center[0] - size[0] / 2, center[1] - size[1] / 2])
        points.push([center[0] + size[0] / 2, center[1] + size[1] / 2])
      }
    }
    if (points.length === 0) return
    const bounds = points.reduce((result, point) => ({
      minX: Math.min(result.minX, point[0]),
      maxX: Math.max(result.maxX, point[0]),
      minY: Math.min(result.minY, point[1]),
      maxY: Math.max(result.maxY, point[1]),
    }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity })
    const { minX, maxX, minY, maxY } = bounds
    const spanX = Math.max(1000, maxX - minX)
    const spanY = Math.max(1000, maxY - minY)
    const zoom = Math.max(0.005, Math.min(0.16,
      (container.clientWidth - 112) / (spanX + 1600),
      (container.clientHeight - 112) / (spanY + 1600),
    ))
    setViewport({
      zoom,
      panX: container.clientWidth / 2 - ((minX + maxX) / 2) * zoom,
      panY: container.clientHeight / 2 - ((minY + maxY) / 2) * zoom,
    })
  }, [planVisibleObjects])

  useEffect(() => {
    if (hasInitialFitRef.current || planVisibleObjects.length === 0) return
    const frame = requestAnimationFrame(() => {
      fitView()
      hasInitialFitRef.current = true
    })
    return () => cancelAnimationFrame(frame)
  }, [fitView, planVisibleObjects.length])

  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [activeSnap, setActiveSnap] = useState<SnapResult | null>(null)
  const [activeWallSnap, setActiveWallSnap] = useState<WallHostSnapResult | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef<[number, number]>([0, 0])
  const currentViewportRef = useRef(viewport)
  currentViewportRef.current = viewport

  // Direct-manipulation state for objects whose geometry can move in plan.
  const [draggingObject, setDraggingObject] = useState<{
    id: string
    kind: 'column' | 'wall' | 'opening'
    startWorldMm: [number, number]
    startScreenPx: [number, number]
    hostStartMm?: [number, number]
    hostEndMm?: [number, number]
    openingWidthMm?: number
  } | null>(null)

  // 2-click beam placement state (start node -> end node)
  const [beamStartNode, setBeamStartNode] = useState<{ point_mm: [number, number]; columnId?: string; reference?: LinearReference } | null>(null)

  // 2-click wall placement state (start node -> end node)
  const [wallStartNode, setWallStartNode] = useState<{ point_mm: [number, number]; reference?: LinearReference } | null>(null)

  // Calibration state (P1 -> mouse move -> P2 -> modal)
  const [calibrationP1, setCalibrationP1] = useState<[number, number] | null>(null)
  const [calibrationMousePoint, setCalibrationMousePoint] = useState<[number, number] | null>(null)

  // Door handing state (can cycle with Spacebar)
  const [doorHanding, setDoorHanding] = useState<DoorHanding>('left_in')

  useEffect(() => {
    if (activeTool !== 'beam') {
      setBeamStartNode(null)
    }
    if (activeTool !== 'wall') {
      setWallStartNode(null)
    }
    if (activeTool !== 'calibrate') {
      setCalibrationP1(null)
      setCalibrationMousePoint(null)
    }
    setDrawLengthMeters('')
  }, [activeTool])

  // Space cycles the active placement reference for linear elements, or door handing.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      if (e.code === 'Space') {
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
          setPlacementReference((prev) => {
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
        if (activeTool === 'beam') setBeamStartNode(null)
        if (activeTool === 'wall') setWallStartNode(null)
        setDrawLengthMeters('')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTool, selectedId, project.objects, onFlipDoorHanding])

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let ghost: PlacementGhost | null = null
    if (activeTool === 'column' && activeSnap) {
      const typeDef = project.types?.find(
        (t) => t.object_type === 'structure.column' && t.name.toLowerCase() === activeColumnTypeMark.toLowerCase()
      )
      ghost = {
        type: 'column',
        location_mm: activeSnap.point_mm,
        size_mm: typeDef?.parameters?.section_mm || [200, 200],
        mark: activeColumnTypeMark,
      }
    } else if (activeTool === 'foundation' && activeSnap) {
      const typeDef = project.types?.find(
        (t) => t.object_type === 'structure.foundation' && t.name.toLowerCase() === activeFoundationTypeMark.toLowerCase()
      )
      ghost = {
        type: 'foundation',
        location_mm: activeSnap.point_mm,
        size_mm: typeDef?.parameters?.size_mm || [800, 800, 300],
        mark: activeFoundationTypeMark,
      }
    } else if (activeTool === 'beam' && activeSnap && beamStartNode) {
      const typeDef = project.types?.find(
        (t) => t.object_type === 'structure.beam' && t.name.toLowerCase() === activeBeamTypeMark.toLowerCase()
      )
      const [alignedStart, alignedEnd] = resolveReferencePath(beamStartNode.point_mm, activeSnap.point_mm, typeDef?.parameters?.section_mm?.[0] || 200)
      ghost = {
        type: 'beam',
        location_mm: alignedStart,
        target_location_mm: alignedEnd,
        size_mm: typeDef?.parameters?.section_mm || [200, 400],
        mark: activeBeamTypeMark,
      }
    } else if (activeTool === 'wall' && activeSnap && wallStartNode) {
      const typeDef = project.types?.find(
        (t) => t.object_type === 'architecture.wall' && t.name.toLowerCase() === activeWallTypeMark.toLowerCase()
      )
      const [alignedStart, alignedEnd] = resolveReferencePath(wallStartNode.point_mm, activeSnap.point_mm, typeDef?.parameters?.thickness_mm || 100)
      ghost = {
        type: 'wall',
        location_mm: alignedStart,
        target_location_mm: alignedEnd,
        size_mm: [typeDef?.parameters?.thickness_mm || 100, 0],
        mark: activeWallTypeMark,
      }
    } else if (activeTool === 'door' && activeWallSnap) {
      const typeDef = project.types?.find(
        (t) => t.object_type === 'door_window.door' && t.name.toLowerCase() === activeDoorTypeMark.toLowerCase()
      )
      ghost = {
        type: 'door',
        location_mm: activeWallSnap.point_mm,
        wall_id: activeWallSnap.wall_id,
        offset_along_wall_mm: activeWallSnap.offset_along_wall_mm,
        size_mm: [typeDef?.parameters?.width_mm || 800, typeDef?.parameters?.height_mm || 2000],
        mark: activeDoorTypeMark,
        handing: doorHanding,
        operation: typeDef?.parameters?.opening_operation,
        panel_count: typeDef?.parameters?.panel_count,
      }
    } else if (activeTool === 'window' && activeWallSnap) {
      const typeDef = project.types?.find(
        (t) => t.object_type === 'door_window.window' && t.name.toLowerCase() === activeWindowTypeMark.toLowerCase()
      )
      ghost = {
        type: 'window',
        location_mm: activeWallSnap.point_mm,
        wall_id: activeWallSnap.wall_id,
        offset_along_wall_mm: activeWallSnap.offset_along_wall_mm,
        size_mm: [typeDef?.parameters?.width_mm || 1200, typeDef?.parameters?.height_mm || 1200],
        mark: activeWindowTypeMark,
        operation: typeDef?.parameters?.opening_operation,
        panel_count: typeDef?.parameters?.panel_count,
        sill_height_mm: typeDef?.parameters?.sill_height_mm,
        glazing_material: typeDef?.parameters?.glazing_material,
      }
    } else if (activeTool === 'stair' && activeSnap) {
      ghost = {
        type: 'stair',
        location_mm: activeSnap.point_mm,
        size_mm: [1000, 4000],
        mark: 'ST1',
      }
    }

    const calibrationOverlay =
      activeTool === 'calibrate'
        ? {
            point1_mm: calibrationP1,
            point2_mm: null,
            mouse_mm: calibrationMousePoint,
          }
        : null

    renderPlanView(
      ctx,
      canvas.width,
      canvas.height,
      planProject,
      viewport,
      selectedId,
      hoveredId,
      activeSnap,
      ghost,
      underlay,
      calibrationOverlay,
      project
    )
  }, [
    project,
    planProject,
    viewport,
    selectedId,
    hoveredId,
    activeSnap,
    activeWallSnap,
    activeTool,
    activeColumnTypeMark,
    activeFoundationTypeMark,
    activeBeamTypeMark,
    activeWallTypeMark,
    activeDoorTypeMark,
    activeWindowTypeMark,
    beamStartNode,
    wallStartNode,
    resolveReferencePath,
    doorHanding,
    underlay,
    calibrationP1,
    calibrationMousePoint,
  ])

  useEffect(() => {
    redraw()
  }, [redraw])

  const redrawRef = useRef(redraw)
  redrawRef.current = redraw

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

  const findHitObject = (worldPoint_mm: [number, number], preferWall = false): string | null => {
    const [wx, wy] = worldPoint_mm

    const openingTol = Math.max(150, 16 / viewport.zoom)

    // Shift-click/drag can target an architectural wall beneath a coincident beam.
    if (preferWall) {
      for (const obj of Object.values(planProject.objects)) {
        if (!isWallObject(obj)) continue
        const [x1, y1] = obj.module_data.start_point_mm
        const [x2, y2] = obj.module_data.end_point_mm
        const hitTol = Math.max(obj.module_data.thickness_mm / 2, 12 / viewport.zoom)
        const lengthSquared = (x2 - x1) ** 2 + (y2 - y1) ** 2
        if (lengthSquared <= 0) continue
        const t = Math.max(0, Math.min(1, ((wx - x1) * (x2 - x1) + (wy - y1) * (y2 - y1)) / lengthSquared))
        const nearestX = x1 + t * (x2 - x1)
        const nearestY = y1 + t * (y2 - y1)
        if ((wx - nearestX) ** 2 + (wy - nearestY) ** 2 <= hitTol * hitTol) return obj.id
      }
    }

    // 1. Doors (highest pick priority for openings: wall span + swing arc)
    for (const obj of Object.values(planProject.objects)) {
      if (isDoorObject(obj)) {
        const [cx, cy] = obj.module_data.location_mm
        const w = obj.module_data.width_mm
        const dist = Math.hypot(wx - cx, wy - cy)
        if (dist <= w + openingTol) {
          return obj.id
        }
      }
    }

    // 2. Windows
    for (const obj of Object.values(planProject.objects)) {
      if (isWindowObject(obj)) {
        const [cx, cy] = obj.module_data.location_mm
        const w = obj.module_data.width_mm
        const dist = Math.hypot(wx - cx, wy - cy)
        if (dist <= w / 2 + openingTol) {
          return obj.id
        }
      }
    }

    // 3. Columns
    for (const obj of Object.values(planProject.objects)) {
      if (isColumnObject(obj)) {
        const [cx, cy] = obj.module_data.location_mm
        const [w, d] = obj.module_data.section_mm
        if (
          wx >= cx - w / 2 &&
          wx <= cx + w / 2 &&
          wy >= cy - d / 2 &&
          wy <= cy + d / 2
        ) {
          return obj.id
        }
      }
    }

    // 4. Foundations
    for (const obj of Object.values(planProject.objects)) {
      if (isFoundationObject(obj)) {
        const [cx, cy] = obj.module_data.center_mm
        const [w, l] = obj.module_data.size_mm
        if (
          wx >= cx - w / 2 &&
          wx <= cx + w / 2 &&
          wy >= cy - l / 2 &&
          wy <= cy + l / 2
        ) {
          return obj.id
        }
      }
    }

    // 5. Beams
    for (const obj of Object.values(planProject.objects)) {
      if (isBeamObject(obj)) {
        const [x1, y1] = obj.module_data.start_point_mm
        const [x2, y2] = obj.module_data.end_point_mm
        const [bw] = obj.module_data.section_mm
        const hitTol = Math.max(bw / 2, 12 / viewport.zoom)
        const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2
        if (l2 > 0) {
          let t = ((wx - x1) * (x2 - x1) + (wy - y1) * (y2 - y1)) / l2
          t = Math.max(0, Math.min(1, t))
          const px = x1 + t * (x2 - x1)
          const py = y1 + t * (y2 - y1)
          const distSq = (wx - px) ** 2 + (wy - py) ** 2
          if (distSq <= hitTol * hitTol) {
            return obj.id
          }
        }
      }
    }

    // 6. Walls
    for (const obj of Object.values(planProject.objects)) {
      if (isWallObject(obj)) {
        const [x1, y1] = obj.module_data.start_point_mm
        const [x2, y2] = obj.module_data.end_point_mm
        const thick = obj.module_data.thickness_mm
        const hitTol = Math.max(thick / 2, 12 / viewport.zoom)
        const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2
        if (l2 > 0) {
          let t = ((wx - x1) * (x2 - x1) + (wy - y1) * (y2 - y1)) / l2
          t = Math.max(0, Math.min(1, t))
          const px = x1 + t * (x2 - x1)
          const py = y1 + t * (y2 - y1)
          const distSq = (wx - px) ** 2 + (wy - py) ** 2
          if (distSq <= hitTol * hitTol) {
            return obj.id
          }
        }
      }
    }

    // 7. Grids
    for (const obj of Object.values(planProject.objects)) {
      if (isGridObject(obj)) {
        const { orientation, position_mm } = obj.module_data
        const tol = 12 / viewport.zoom
        if (orientation === 'vertical' && Math.abs(wx - position_mm) <= tol) {
          return obj.id
        }
        if (orientation === 'horizontal' && Math.abs(wy - position_mm) <= tol) {
          return obj.id
        }
      }
    }

    for(const out of constructionOutputs(project).filter(v=>!!planProject.objects[v.object_id]).reverse()){
      const near=(a:number[],b:number[])=>{const dx=b[0]-a[0],dy=b[1]-a[1],len=dx*dx+dy*dy,t=len?Math.max(0,Math.min(1,((wx-a[0])*dx+(wy-a[1])*dy)/len)):0;return Math.hypot(wx-a[0]-t*dx,wy-a[1]-t*dy)<12/viewport.zoom}
      if(out.paths.some(path=>path.slice(1).some((v,i)=>near(path[i],v))))return out.object_id
      for(const tr of out.meshes){const signs=tr.map((a,i)=>{const b=tr[(i+1)%3];return (b[0]-a[0])*(wy-a[1])-(b[1]-a[1])*(wx-a[0])});if(Math.abs((tr[1][0]-tr[0][0])*(tr[2][1]-tr[0][1])-(tr[1][1]-tr[0][1])*(tr[2][0]-tr[0][0]))>1&& (signs.every(v=>v>=0)||signs.every(v=>v<=0)))return out.object_id}
    }
    return null
  }

  // Pointer move handler
  const handlePointerMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top

    if (isPanning) {
      const dx = screenX - panStartRef.current[0]
      const dy = screenY - panStartRef.current[1]
      panStartRef.current = [screenX, screenY]
      setViewport((v) => ({ ...v, panX: v.panX + dx, panY: v.panY + dy }))
      return
    }

    const rawWorld = screenToWorld([screenX, screenY], viewport)

    if (activeTool === 'door' || activeTool === 'window') {
      const typeDef = project.types?.find(
        (t) =>
          t.object_type === (activeTool === 'door' ? 'door_window.door' : 'door_window.window') &&
          t.name.toLowerCase() === (activeTool === 'door' ? activeDoorTypeMark : activeWindowTypeMark).toLowerCase()
      )
      const openingW = typeDef?.parameters?.width_mm || (activeTool === 'door' ? 800 : 1200)
      const wallSnap = snapToWallHost(rawWorld, planProject, viewport, openingW)
      setActiveWallSnap(wallSnap)
      if (wallSnap) {
        setActiveSnap({
          point_mm: wallSnap.point_mm,
          kind: 'free',
          description: wallSnap.description,
        })
        onCursorChange(wallSnap.point_mm, wallSnap.description)
      } else {
        const snap = e.ctrlKey
          ? { point_mm: rawWorld, kind: 'free' as const, description: 'Free / อิสระ (Ctrl)' }
          : snapPoint(rawWorld, planProject, viewport, 16, enabledSnapModes)
        setActiveSnap(snap)
        onCursorChange(snap.point_mm, snap.description)
      }
    } else {
      setActiveWallSnap(null)
      let snap = e.ctrlKey
        ? { point_mm: rawWorld, kind: 'free' as const, description: 'Free / อิสระ (Ctrl)' }
        : snapPoint(rawWorld, planProject, viewport, 16, enabledSnapModes)
      if (activeTool === 'beam' && beamStartNode) snap = constrainLineSnap(snap, rawWorld, beamStartNode.point_mm, e.shiftKey, beamStartNode.reference)
      if (activeTool === 'wall' && wallStartNode) snap = constrainLineSnap(snap, rawWorld, wallStartNode.point_mm, e.shiftKey, wallStartNode.reference)
      setActiveSnap(snap)
      onCursorChange(snap.point_mm, snap.description)
    }

    if (activeTool === 'calibrate') {
      setCalibrationMousePoint(rawWorld)
    }

    // Check hover
    const hit = findHitObject(rawWorld)
    setHoveredId(hit)

    // Redraw during direct manipulation so the pointer feedback remains responsive.
    if (draggingObject) {
      redraw()
    }
  }

  // Pointer down
  const handlePointerDown = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top

    // Middle click or Alt+Left triggers pan
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true)
      panStartRef.current = [screenX, screenY]
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }

    if (e.button === 0) {
      const rawWorld = screenToWorld([screenX, screenY], viewport)
      let snap = e.ctrlKey
        ? { point_mm: rawWorld, kind: 'free' as const, description: 'Free / อิสระ (Ctrl)' }
        : snapPoint(rawWorld, planProject, viewport, 16, enabledSnapModes)
      if (activeTool === 'beam' && beamStartNode) snap = constrainLineSnap(snap, rawWorld, beamStartNode.point_mm, e.shiftKey, beamStartNode.reference)
      if (activeTool === 'wall' && wallStartNode) snap = constrainLineSnap(snap, rawWorld, wallStartNode.point_mm, e.shiftKey, wallStartNode.reference)

      if (activeTool === 'select') {
        const hitId = findHitObject(rawWorld, e.shiftKey)
        onSelectObject(hitId)

        if (hitId) {
          const object = project.objects[hitId]
          const startScreenPx: [number, number] = [screenX, screenY]
          if (isColumnObject(object)) {
            setDraggingObject({ id: hitId, kind: 'column', startWorldMm: rawWorld, startScreenPx })
            e.currentTarget.setPointerCapture(e.pointerId)
          } else if (isWallObject(object)) {
            setDraggingObject({
              id: hitId,
              kind: 'wall',
              startWorldMm: rawWorld,
              startScreenPx,
            })
            e.currentTarget.setPointerCapture(e.pointerId)
          } else if (isDoorObject(object) || isWindowObject(object)) {
            const host = project.objects[object.module_data.wall_id]
            if (host && isWallObject(host) && Number.isFinite(object.module_data.width_mm) && object.module_data.width_mm > 0) {
              setDraggingObject({
                id: hitId,
                kind: 'opening',
                startWorldMm: rawWorld,
                startScreenPx,
                hostStartMm: [host.module_data.start_point_mm[0], host.module_data.start_point_mm[1]],
                hostEndMm: [host.module_data.end_point_mm[0], host.module_data.end_point_mm[1]],
                openingWidthMm: object.module_data.width_mm,
              })
              e.currentTarget.setPointerCapture(e.pointerId)
            }
          }
        }
      } else if (activeTool === 'column') {
        onCommitColumn(snap.point_mm)
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
            onSelectObject(existingFnd.id)
          } else {
            onCommitFoundation({ columnId: colHit.id })
          }
        } else {
          onCommitFoundation({ location_mm: snap.point_mm })
        }
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
        }
      } else if (activeTool === 'wall') {
        if (!wallStartNode) {
          setWallStartNode({ point_mm: snap.point_mm, reference: findNearestLinearReference(planProject, snap.point_mm) ?? undefined })
          setDrawLengthMeters('')
        } else {
          const dist = Math.hypot(
            snap.point_mm[0] - wallStartNode.point_mm[0],
            snap.point_mm[1] - wallStartNode.point_mm[1]
          )
          if (dist >= 100) {
            const typeDef = project.types?.find(type => type.object_type === 'architecture.wall' && type.name.toLowerCase() === activeWallTypeMark.toLowerCase())
            const [alignedStart, alignedEnd] = resolveReferencePath(wallStartNode.point_mm, snap.point_mm, typeDef?.parameters?.thickness_mm || 100)
            onCommitWall(alignedStart, alignedEnd, placementReference)
          }
          setWallStartNode({ point_mm: snap.point_mm, reference: findNearestLinearReference(planProject, snap.point_mm) ?? undefined })
          setDrawLengthMeters('')
        }
      } else if (activeTool === 'door') {
        const typeDef = project.types?.find(
          (t) => t.object_type === 'door_window.door' && t.name.toLowerCase() === activeDoorTypeMark.toLowerCase()
        )
        const openingW = typeDef?.parameters?.width_mm || 800
        const wallSnap = snapToWallHost(rawWorld, planProject, viewport, openingW) || activeWallSnap
        if (wallSnap) {
          onCommitDoor(
            wallSnap.wall_id,
            wallSnap.point_mm,
            wallSnap.offset_along_wall_mm,
            doorHanding
          )
        }
      } else if (activeTool === 'window') {
        const typeDef = project.types?.find(
          (t) => t.object_type === 'door_window.window' && t.name.toLowerCase() === activeWindowTypeMark.toLowerCase()
        )
        const openingW = typeDef?.parameters?.width_mm || 1200
        const wallSnap = snapToWallHost(rawWorld, planProject, viewport, openingW) || activeWallSnap
        if (wallSnap) {
          onCommitWindow(
            wallSnap.wall_id,
            wallSnap.point_mm,
            wallSnap.offset_along_wall_mm
          )
        }
      } else if (activeTool === 'grid') {
        const orientation = e.shiftKey ? 'horizontal' : 'vertical'
        const pos = orientation === 'vertical' ? Math.round(snap.point_mm[0] / 500) * 500 : Math.round(snap.point_mm[1] / 500) * 500
        onCommitGrid(orientation, pos)
      } else if (activeTool === 'calibrate') {
        if (!calibrationP1) {
          setCalibrationP1(snap.point_mm)
        } else {
          const dist = Math.hypot(
            snap.point_mm[0] - calibrationP1[0],
            snap.point_mm[1] - calibrationP1[1]
          )
          if (dist >= 10 && onStartCalibrationModal) {
            onStartCalibrationModal(dist)
          }
          setCalibrationP1(null)
          setCalibrationMousePoint(null)
        }
      } else if (activeTool === 'stair') {
        if (onCommitStair) {
          onCommitStair(snap.point_mm)
        }
      }
    }
  }

  // Pointer up
  const handlePointerUp = (e: React.PointerEvent) => {
    if (isPanning) {
      setIsPanning(false)
      try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
      return
    }

    if (draggingObject) {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (rect) {
        const screenX = e.clientX - rect.left
        const screenY = e.clientY - rect.top
        const rawWorld = screenToWorld([screenX, screenY], viewport)
        const movedPixels = Math.hypot(screenX - draggingObject.startScreenPx[0], screenY - draggingObject.startScreenPx[1])
        if (movedPixels >= 3) {
          if (draggingObject.kind === 'column') {
            const snap = e.ctrlKey
              ? { point_mm: rawWorld, kind: 'free' as const, description: 'Free / อิสระ (Ctrl)' }
              : snapPoint(rawWorld, planProject, viewport, 16, enabledSnapModes)
            onMoveColumn(draggingObject.id, snap.point_mm)
          } else if (draggingObject.kind === 'wall') {
            const delta: [number, number] = [
              rawWorld[0] - draggingObject.startWorldMm[0],
              rawWorld[1] - draggingObject.startWorldMm[1],
            ]
            if (Math.hypot(...delta) >= 1) onMoveWall(draggingObject.id, delta)
          } else if (draggingObject.hostStartMm && draggingObject.hostEndMm && draggingObject.openingWidthMm) {
            const offset = projectPointToWallOffsetMm(rawWorld, draggingObject.hostStartMm, draggingObject.hostEndMm, draggingObject.openingWidthMm)
            if (offset !== undefined) onMoveOpening(draggingObject.id, offset)
          }
        }
      }
      setDraggingObject(null)
      try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
    }
  }

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85
    setViewport((v) => zoomAtScreenPoint(v, [screenX, screenY], zoomFactor))
  }

  return (
    <div
      className="cf-plan-canvas"
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
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        style={{ position: 'absolute', inset: 0, display: 'block', width: '100%', height: '100%' }}
      />
      <div className="cf-authoring-controls" onPointerDown={(event) => event.stopPropagation()}>
        {(['column', 'foundation', 'beam', 'wall', 'door', 'window'] as ToolType[]).includes(activeTool) && (() => {
          const familyByTool: Partial<Record<ToolType, string>> = {
            column: 'structure.column', foundation: 'structure.foundation', beam: 'structure.beam',
            wall: 'architecture.wall', door: 'door_window.door', window: 'door_window.window',
          }
          const activeTypeMark = activeTool === 'column' ? activeColumnTypeMark
            : activeTool === 'foundation' ? activeFoundationTypeMark
              : activeTool === 'beam' ? activeBeamTypeMark
                : activeTool === 'wall' ? activeWallTypeMark
                  : activeTool === 'door' ? activeDoorTypeMark : activeWindowTypeMark
          const availableTypes = project.types.filter(type => type.object_type === familyByTool[activeTool])
          const label = activeTool === 'column' ? 'เสา' : activeTool === 'foundation' ? 'ฐานราก'
            : activeTool === 'beam' ? 'คาน' : activeTool === 'wall' ? 'ผนัง'
              : activeTool === 'door' ? 'ประตู' : 'หน้าต่าง'
          return <TypePicker types={availableTypes} value={activeTypeMark} label={label} onChange={onChangeActiveTypeMark} onOpenCatalog={onOpenTypeManager}/>
        })()}
        {(activeTool === 'wall' || activeTool === 'beam') && <label className="cf-reference-control">
          <span>แนวอ้างอิง</span>
          <select aria-label="แนวอ้างอิงการวาง" value={placementReference} onChange={(event) => setPlacementReference(event.target.value as typeof placementReference)}>
            <option value="centerline">กึ่งกลาง</option>
            <option value="left_face">ริมซ้ายตามทิศลาก</option>
            <option value="right_face">ริมขวาตามทิศลาก</option>
          </select>
        </label>}
        {(activeTool === 'wall' || activeTool === 'beam') && <label className="cf-reference-control">
          <span>จัดแนวช่วงที่วาด</span>
          <select aria-label="ข้อจำกัดแนวการวาด" value={lineConstraintMode} onChange={(event) => setLineConstraintMode(event.target.value as typeof lineConstraintMode)}>
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
        {(beamStartNode || wallStartNode) && <label className="cf-reference-control">
          <span>กำหนดความยาว (ม.)</span>
          <input
            aria-label="ความยาวช่วงที่วาดเป็นเมตร"
            type="number"
            min="0.1"
            step="0.01"
            value={drawLengthMeters}
            placeholder="ตามตำแหน่งเมาส์"
            onChange={(event) => setDrawLengthMeters(event.target.value)}
          />
          <span className="cf-snap-hint">Shift ล็อกแกนนอน/ตั้ง · คลิกต่อวาดช่วงถัดไป · Esc ยกเลิก</span>
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
            onClick={() => setSnapModes(current => current.includes(mode) ? current.filter(value => value !== mode) : [...current, mode])}
          >{label}</button>)}
          <span className="cf-snap-hint">Ctrl วางอิสระ · {activeTool === 'wall' || activeTool === 'beam' ? `Space เปลี่ยนแนวอ้างอิง (ขณะนี้: ${placementReference === 'centerline' ? 'กึ่งกลาง' : placementReference === 'left_face' ? 'ชิดซ้าย' : 'ชิดขวา'})` : 'เลื่อนเมาส์ให้เห็นสัญลักษณ์ก่อนคลิก'}</span>
        </div></details>
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
