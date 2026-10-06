import React, { useRef, useEffect, useState, useCallback } from 'react'
import {
  ProjectDocument,
  SmartObject,
  isColumnObject,
  isFoundationObject,
  isGridObject,
  isBeamObject,
} from '@constructflow/project-model'
import { ToolType } from './Toolbar.js'
import {
  ViewportState,
  screenToWorld,
  worldToScreen,
  zoomAtScreenPoint,
} from '../viewport/viewportTransform.js'
import { SnapResult, snapPoint } from '../snapping/snapEngine.js'
import { renderPlanView } from '../rendering/planRenderer.js'

interface PlanCanvasProps {
  project: ProjectDocument
  activeTool: ToolType
  activeColumnTypeMark: string
  activeFoundationTypeMark: string
  activeBeamTypeMark: string
  selectedId: string | null
  onSelectObject: (id: string | null) => void
  onCommitColumn: (location_mm: [number, number]) => void
  onCommitFoundation: (opts: { columnId?: string; location_mm?: [number, number] }) => void
  onCommitBeam: (start: [number, number], end: [number, number], startColId?: string, endColId?: string) => void
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
  selectedId,
  onSelectObject,
  onCommitColumn,
  onCommitFoundation,
  onCommitBeam,
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
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef<[number, number]>([0, 0])
  const currentViewportRef = useRef(viewport)
  currentViewportRef.current = viewport

  // Dragging selected column state
  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null)

  // 2-click beam placement state (start node -> end node)
  const [beamStartNode, setBeamStartNode] = useState<{ point_mm: [number, number]; columnId?: string } | null>(null)

  useEffect(() => {
    if (activeTool !== 'beam') {
      setBeamStartNode(null)
    }
  }, [activeTool])

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let ghost: any = null
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
  }, [project, viewport, selectedId, hoveredId, activeSnap, activeTool, activeColumnTypeMark, activeFoundationTypeMark, activeBeamTypeMark, beamStartNode])

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

    // 1. Columns
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

    // 2. Foundations
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

    // 3. Beams
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

    // 4. Grids
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
    const snap = snapPoint(rawWorld, project, viewport)
    setActiveSnap(snap)
    onCursorChange(snap.point_mm, snap.description)

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
        // If clicking on or near a column, create foundation for that column
        const colHit = Object.values(project.objects).find((o) => {
          if (!isColumnObject(o)) return false
          const [cx, cy] = o.module_data.location_mm
          const [cw, cd] = o.module_data.section_mm
          const tol = Math.max(cw, cd, 400)
          return Math.abs(rawWorld[0] - cx) <= tol && Math.abs(rawWorld[1] - cy) <= tol
        })

        if (colHit) {
          // Check if this column already has a foundation
          const existingFnd = Object.values(project.objects).find(
            (o) => isFoundationObject(o) && (o.module_data.supported_column_id === colHit.id || o.host_refs?.includes(colHit.id))
          )
          if (existingFnd) {
            onSelectObject(existingFnd.id)
          } else {
            onCommitFoundation({ columnId: colHit.id })
          }
        } else {
          // Isolated spread footing at clicked/snapped location
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
          // 1st click: set start node
          setBeamStartNode({ point_mm: snap.point_mm, columnId: colId })
        } else {
          // 2nd click: finish beam
          const dist = Math.hypot(
            snap.point_mm[0] - beamStartNode.point_mm[0],
            snap.point_mm[1] - beamStartNode.point_mm[1]
          )
          if (dist >= 100) {
            onCommitBeam(beamStartNode.point_mm, snap.point_mm, beamStartNode.columnId, colId)
          }
          setBeamStartNode(null)
        }
      } else if (activeTool === 'grid') {
        // Alt or shift switches between vertical/horizontal
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
