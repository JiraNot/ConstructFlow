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
} from '@constructflow/project-model'
import { projectPointToWallOffsetMm } from '@constructflow/architecture-engine'
import { getPlanVisibleObjects } from '@constructflow/representation-engine'
import { ToolType } from './Toolbar.js'
import {
  ViewportState,
  screenToWorld,
  worldToScreen,
  zoomAtScreenPoint,
} from '../viewport/viewportTransform.js'
import { SnapResult, snapPoint, snapToWallHost, WallHostSnapResult } from '../snapping/snapEngine.js'
import { renderPlanView, PlacementGhost, UnderlayConfig } from '../rendering/planRenderer.js'

interface PlanCanvasProps {
  project: ProjectDocument
  activeTool: ToolType
  activeColumnTypeMark: string
  activeFoundationTypeMark: string
  activeBeamTypeMark: string
  activeWallTypeMark: string
  activeDoorTypeMark: string
  activeWindowTypeMark: string
  selectedId: string | null
  underlay?: UnderlayConfig | null
  onSelectObject: (id: string | null) => void
  onCommitColumn: (location_mm: [number, number]) => void
  onCommitFoundation: (opts: { columnId?: string; location_mm?: [number, number] }) => void
  onCommitBeam: (start: [number, number], end: [number, number], startColId?: string, endColId?: string) => void
  onCommitWall: (start: [number, number], end: [number, number]) => void
  onCommitDoor: (wallId: string, point_mm: [number, number], offset_mm: number, handing: DoorHanding) => void
  onCommitWindow: (wallId: string, point_mm: [number, number], offset_mm: number) => void
  onCommitGrid: (orientation: 'vertical' | 'horizontal', position_mm: number) => void
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
  onMoveColumn,
  onMoveWall,
  onMoveOpening,
  onFlipDoorHanding,
  onStartCalibrationModal,
  onCursorChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
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
  const [beamStartNode, setBeamStartNode] = useState<{ point_mm: [number, number]; columnId?: string } | null>(null)

  // 2-click wall placement state (start node -> end node)
  const [wallStartNode, setWallStartNode] = useState<{ point_mm: [number, number] } | null>(null)

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
  }, [activeTool])

  // Listen for Spacebar to toggle door handing (both during placement and on selected door)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
        } else if (selectedId && project.objects[selectedId] && isDoorObject(project.objects[selectedId])) {
          e.preventDefault()
          if (onFlipDoorHanding) {
            onFlipDoorHanding(selectedId)
          }
        }
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
      ghost = {
        type: 'beam',
        location_mm: beamStartNode.point_mm,
        target_location_mm: activeSnap.point_mm,
        size_mm: typeDef?.parameters?.section_mm || [200, 400],
        mark: activeBeamTypeMark,
      }
    } else if (activeTool === 'wall' && activeSnap && wallStartNode) {
      const typeDef = project.types?.find(
        (t) => t.object_type === 'architecture.wall' && t.name.toLowerCase() === activeWallTypeMark.toLowerCase()
      )
      ghost = {
        type: 'wall',
        location_mm: wallStartNode.point_mm,
        target_location_mm: activeSnap.point_mm,
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
      calibrationOverlay
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
    doorHanding,
    underlay,
    calibrationP1,
    calibrationMousePoint,
  ])

  useEffect(() => {
    redraw()
  }, [redraw])

  // Handle auto-resize of canvas
  useEffect(() => {
    const resizeCanvas = () => {
      const container = containerRef.current
      const canvas = canvasRef.current
      if (!container || !canvas) return
      const rect = container.getBoundingClientRect()
      canvas.width = rect.width
      canvas.height = rect.height
      redraw()
    }

    window.addEventListener('resize', resizeCanvas)
    resizeCanvas()
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [redraw])

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
        const snap = snapPoint(rawWorld, planProject, viewport)
        setActiveSnap(snap)
        onCursorChange(snap.point_mm, snap.description)
      }
    } else {
      setActiveWallSnap(null)
      const snap = snapPoint(rawWorld, planProject, viewport)
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
      const snap = snapPoint(rawWorld, planProject, viewport)

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
          setBeamStartNode({ point_mm: snap.point_mm, columnId: colId })
        } else {
          const dist = Math.hypot(
            snap.point_mm[0] - beamStartNode.point_mm[0],
            snap.point_mm[1] - beamStartNode.point_mm[1]
          )
          if (dist >= 100) {
            onCommitBeam(beamStartNode.point_mm, snap.point_mm, beamStartNode.columnId, colId)
          }
          setBeamStartNode(null)
        }
      } else if (activeTool === 'wall') {
        if (!wallStartNode) {
          setWallStartNode({ point_mm: snap.point_mm })
        } else {
          const dist = Math.hypot(
            snap.point_mm[0] - wallStartNode.point_mm[0],
            snap.point_mm[1] - wallStartNode.point_mm[1]
          )
          if (dist >= 100) {
            onCommitWall(wallStartNode.point_mm, snap.point_mm)
          }
          setWallStartNode(null)
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
            const snap = snapPoint(rawWorld, planProject, viewport)
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
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#0f172a',
        cursor: isPanning ? 'grabbing' : activeTool === 'select' ? 'default' : 'crosshair',
      }}
    >
      <canvas
        ref={canvasRef}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  )
}
