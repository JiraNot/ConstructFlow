import React, { useRef, useEffect, useState, useCallback } from 'react'
import {
  ProjectDocument,
  SmartObject,
  isColumnObject,
  isFoundationObject,
  isGridObject,
  isBeamObject,
  isWallObject,
  isDoorObject,
  isWindowObject,
  DoorHanding,
} from '@constructflow/project-model'
import { ToolType } from './Toolbar.js'
import {
  ViewportState,
  screenToWorld,
  worldToScreen,
  zoomAtScreenPoint,
} from '../viewport/viewportTransform.js'
import { SnapResult, snapPoint, snapToWallHost, WallHostSnapResult } from '../snapping/snapEngine.js'
import { renderPlanView, PlacementGhost } from '../rendering/planRenderer.js'

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
  onSelectObject: (id: string | null) => void
  onCommitColumn: (location_mm: [number, number]) => void
  onCommitFoundation: (opts: { columnId?: string; location_mm?: [number, number] }) => void
  onCommitBeam: (start: [number, number], end: [number, number], startColId?: string, endColId?: string) => void
  onCommitWall: (start: [number, number], end: [number, number]) => void
  onCommitDoor: (wallId: string, point_mm: [number, number], offset_mm: number, handing: DoorHanding) => void
  onCommitWindow: (wallId: string, point_mm: [number, number], offset_mm: number) => void
  onCommitGrid: (orientation: 'vertical' | 'horizontal', position_mm: number) => void
  onMoveColumn: (id: string, newLocation_mm: [number, number]) => void
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
  onSelectObject,
  onCommitColumn,
  onCommitFoundation,
  onCommitBeam,
  onCommitWall,
  onCommitDoor,
  onCommitWindow,
  onCommitGrid,
  onMoveColumn,
  onCursorChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

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

  // Dragging selected column state
  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null)

  // 2-click beam placement state (start node -> end node)
  const [beamStartNode, setBeamStartNode] = useState<{ point_mm: [number, number]; columnId?: string } | null>(null)

  // 2-click wall placement state (start node -> end node)
  const [wallStartNode, setWallStartNode] = useState<{ point_mm: [number, number] } | null>(null)

  // Door handing state (can cycle with Spacebar)
  const [doorHanding, setDoorHanding] = useState<DoorHanding>('left_in')

  useEffect(() => {
    if (activeTool !== 'beam') {
      setBeamStartNode(null)
    }
    if (activeTool !== 'wall') {
      setWallStartNode(null)
    }
  }, [activeTool])

  // Listen for Spacebar to toggle door handing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && activeTool === 'door') {
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
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTool])

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

    renderPlanView(
      ctx,
      canvas.width,
      canvas.height,
      project,
      viewport,
      selectedId,
      hoveredId,
      activeSnap,
      ghost
    )
  }, [
    project,
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

  const findHitObject = (worldPoint_mm: [number, number]): string | null => {
    const [wx, wy] = worldPoint_mm

    // 1. Doors (highest pick priority for openings)
    for (const obj of Object.values(project.objects)) {
      if (isDoorObject(obj)) {
        const [cx, cy] = obj.module_data.location_mm
        const w = obj.module_data.width_mm
        const dist = Math.hypot(wx - cx, wy - cy)
        if (dist <= w / 2 + 100) {
          return obj.id
        }
      }
    }

    // 2. Windows
    for (const obj of Object.values(project.objects)) {
      if (isWindowObject(obj)) {
        const [cx, cy] = obj.module_data.location_mm
        const w = obj.module_data.width_mm
        const dist = Math.hypot(wx - cx, wy - cy)
        if (dist <= w / 2 + 100) {
          return obj.id
        }
      }
    }

    // 3. Columns
    for (const obj of Object.values(project.objects)) {
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
    for (const obj of Object.values(project.objects)) {
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
    for (const obj of Object.values(project.objects)) {
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
    for (const obj of Object.values(project.objects)) {
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
    for (const obj of Object.values(project.objects)) {
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
      const openingW = activeTool === 'door' ? 800 : 1200
      const wallSnap = snapToWallHost(rawWorld, project, viewport, openingW)
      setActiveWallSnap(wallSnap)
      if (wallSnap) {
        setActiveSnap({
          point_mm: wallSnap.point_mm,
          kind: 'free',
          description: wallSnap.description,
        })
        onCursorChange(wallSnap.point_mm, wallSnap.description)
      } else {
        const snap = snapPoint(rawWorld, project, viewport)
        setActiveSnap(snap)
        onCursorChange(snap.point_mm, snap.description)
      }
    } else {
      setActiveWallSnap(null)
      const snap = snapPoint(rawWorld, project, viewport)
      setActiveSnap(snap)
      onCursorChange(snap.point_mm, snap.description)
    }

    // Check hover
    const hit = findHitObject(rawWorld)
    setHoveredId(hit)

    // If dragging a column, update preview
    if (draggingColumnId) {
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
      const snap = snapPoint(rawWorld, project, viewport)

      if (activeTool === 'select') {
        const hitId = findHitObject(rawWorld)
        onSelectObject(hitId)

        // If clicking on a column that is selected, start dragging
        if (hitId && project.objects[hitId]?.object_type === 'structure.column') {
          setDraggingColumnId(hitId)
          e.currentTarget.setPointerCapture(e.pointerId)
        }
      } else if (activeTool === 'column') {
        onCommitColumn(snap.point_mm)
      } else if (activeTool === 'foundation') {
        const colHit = Object.values(project.objects).find((o) => {
          if (!isColumnObject(o)) return false
          const [cx, cy] = o.module_data.location_mm
          const [cw, cd] = o.module_data.section_mm
          const tol = Math.max(cw, cd, 400)
          return Math.abs(rawWorld[0] - cx) <= tol && Math.abs(rawWorld[1] - cy) <= tol
        })

        if (colHit) {
          const existingFnd = Object.values(project.objects).find(
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
        const clickedCol = Object.values(project.objects).find((o) => {
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
        if (activeWallSnap) {
          onCommitDoor(
            activeWallSnap.wall_id,
            activeWallSnap.point_mm,
            activeWallSnap.offset_along_wall_mm,
            doorHanding
          )
        }
      } else if (activeTool === 'window') {
        if (activeWallSnap) {
          onCommitWindow(
            activeWallSnap.wall_id,
            activeWallSnap.point_mm,
            activeWallSnap.offset_along_wall_mm
          )
        }
      } else if (activeTool === 'grid') {
        const orientation = e.shiftKey ? 'horizontal' : 'vertical'
        const pos = orientation === 'vertical' ? Math.round(snap.point_mm[0] / 500) * 500 : Math.round(snap.point_mm[1] / 500) * 500
        onCommitGrid(orientation, pos)
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

    if (draggingColumnId) {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (rect) {
        const screenX = e.clientX - rect.left
        const screenY = e.clientY - rect.top
        const rawWorld = screenToWorld([screenX, screenY], viewport)
        const snap = snapPoint(rawWorld, project, viewport)
        onMoveColumn(draggingColumnId, snap.point_mm)
      }
      setDraggingColumnId(null)
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
