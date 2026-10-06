import React, { useRef, useEffect, useState, useCallback } from 'react'
import { Project, SmartObject } from '../types/model'
import { ToolType } from './Toolbar'
import {
  ViewportState,
  screenToWorld,
  worldToScreen,
  zoomAtScreenPoint,
} from '../viewport/viewportTransform'
import { SnapResult, snapPoint } from '../snapping/snapEngine'
import { renderPlanView } from '../rendering/planRenderer'

interface PlanCanvasProps {
  project: Project
  activeTool: ToolType
  selectedId: string | null
  onSelectObject: (id: string | null) => void
  onCommitColumn: (location_mm: [number, number]) => void
  onCommitWall: (start_mm: [number, number], end_mm: [number, number]) => void
  onMoveColumn: (id: string, newLocation_mm: [number, number]) => void
  onCursorChange: (coords_mm: [number, number], snapKind: string) => void
}

export const PlanCanvas: React.FC<PlanCanvasProps> = ({
  project,
  activeTool,
  selectedId,
  onSelectObject,
  onCommitColumn,
  onCommitWall,
  onMoveColumn,
  onCursorChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Viewport state: 0.1 zoom = 100mm -> 10px on screen. Pan centered initially.
  const [viewport, setViewport] = useState<ViewportState>({
    panX: 450,
    panY: 350,
    zoom: 0.08,
  })

  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [activeSnap, setActiveSnap] = useState<SnapResult | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef<[number, number]>([0, 0])
  const currentViewportRef = useRef(viewport)
  currentViewportRef.current = viewport

  // Wall placement multi-step state
  const [wallStartPoint_mm, setWallStartPoint_mm] = useState<[number, number] | null>(null)

  // Dragging selected column state
  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null)

  // Redraw canvas on any state update
  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let ghost: { type: string; location_mm: [number, number] } | null = null
    if (activeTool === 'column' && activeSnap) {
      ghost = { type: 'column', location_mm: activeSnap.point_mm }
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

    // In-progress wall preview line
    if (activeTool === 'wall' && wallStartPoint_mm && activeSnap) {
      const [sX, sY] = worldToScreen(wallStartPoint_mm, viewport)
      const [eX, eY] = worldToScreen(activeSnap.point_mm, viewport)
      ctx.save()
      ctx.strokeStyle = '#38bdf8'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(sX, sY)
      ctx.lineTo(eX, eY)
      ctx.stroke()
      ctx.restore()
    }
  }, [project, viewport, selectedId, hoveredId, activeSnap, activeTool, wallStartPoint_mm])

  useEffect(() => {
    redraw()
  }, [redraw])

  // Resize canvas to container
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        const w = entry.contentRect.width
        const h = entry.contentRect.height
        canvas.width = w
        canvas.height = h
        redraw()
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [redraw])

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top

    const factor = e.deltaY < 0 ? 1.15 : 0.85
    const newViewport = zoomAtScreenPoint(viewport, [screenX, screenY], factor)
    setViewport(newViewport)
  }

  // Hit-test objects under screen point
  const hitTest = (worldPoint_mm: [number, number]): string | null => {
    const tolerance_mm = 18 / viewport.zoom

    // Hit-test columns first
    for (const obj of Object.values(project.objects)) {
      if (obj.object_type === 'structure.column') {
        const [cx, cy] = obj.module_data.location_mm
        const [w, h] = obj.module_data.section_mm
        if (
          Math.abs(worldPoint_mm[0] - cx) <= w / 2 + tolerance_mm &&
          Math.abs(worldPoint_mm[1] - cy) <= h / 2 + tolerance_mm
        ) {
          return obj.id
        }
      }
    }

    // Hit-test walls
    for (const obj of Object.values(project.objects)) {
      if (obj.object_type === 'architecture.wall') {
        const { start_mm, end_mm } = obj.module_data
        const dist = distToSegment(worldPoint_mm, start_mm, end_mm)
        if (dist <= 150 + tolerance_mm) {
          return obj.id
        }
      }
    }

    // Hit-test grids
    for (const obj of Object.values(project.objects)) {
      if (obj.object_type === 'structure.grid') {
        const { orientation, position_mm } = obj.module_data
        if (orientation === 'vertical') {
          if (Math.abs(worldPoint_mm[0] - position_mm) <= tolerance_mm) return obj.id
        } else {
          if (Math.abs(worldPoint_mm[1] - position_mm) <= tolerance_mm) return obj.id
        }
      }
    }

    return null
  }

  // Mouse down
  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const screenPt: [number, number] = [e.clientX - rect.left, e.clientY - rect.top]

    // Middle button or Space+click = Pan
    if (e.button === 1 || e.altKey || (e.button === 0 && e.shiftKey)) {
      setIsPanning(true)
      panStartRef.current = [e.clientX, e.clientY]
      return
    }

    if (e.button !== 0) return

    const rawWorld = screenToWorld(screenPt, viewport)
    const snap = snapPoint(rawWorld, project, viewport)

    if (activeTool === 'column') {
      onCommitColumn(snap.point_mm)
    } else if (activeTool === 'wall') {
      if (!wallStartPoint_mm) {
        setWallStartPoint_mm(snap.point_mm)
      } else {
        if (
          wallStartPoint_mm[0] !== snap.point_mm[0] ||
          wallStartPoint_mm[1] !== snap.point_mm[1]
        ) {
          onCommitWall(wallStartPoint_mm, snap.point_mm)
        }
        setWallStartPoint_mm(null)
      }
    } else if (activeTool === 'select') {
      const hitId = hitTest(rawWorld)
      onSelectObject(hitId)
      if (hitId && project.objects[hitId]?.object_type === 'structure.column') {
        setDraggingColumnId(hitId)
      }
    }
  }

  // Mouse move
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - panStartRef.current[0]
      const dy = e.clientY - panStartRef.current[1]
      panStartRef.current = [e.clientX, e.clientY]
      setViewport((prev) => ({
        ...prev,
        panX: prev.panX + dx,
        panY: prev.panY + dy,
      }))
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const screenPt: [number, number] = [e.clientX - rect.left, e.clientY - rect.top]

    const rawWorld = screenToWorld(screenPt, viewport)
    const snap = snapPoint(rawWorld, project, viewport)
    setActiveSnap(snap)

    onCursorChange(snap.point_mm, snap.description)

    if (draggingColumnId) {
      // Live move drag
      onMoveColumn(draggingColumnId, snap.point_mm)
    } else if (activeTool === 'select') {
      const hit = hitTest(rawWorld)
      setHoveredId(hit)
    }
  }

  // Mouse up
  const handleMouseUp = () => {
    if (isPanning) setIsPanning(false)
    if (draggingColumnId) setDraggingColumnId(null)
  }

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        position: 'relative',
        background: '#0f172a',
        overflow: 'hidden',
        cursor: isPanning
          ? 'grabbing'
          : activeTool === 'column' || activeTool === 'wall'
          ? 'crosshair'
          : 'default',
      }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

      {/* Floating Instructions Overlay */}
      <div style={floatingInstructionsStyle}>
        {activeTool === 'column' && 'Click near a grid intersection or endpoint to place a Column'}
        {activeTool === 'wall' &&
          (wallStartPoint_mm
            ? 'Click to set wall end point (Esc to cancel)'
            : 'Click to set wall start point')}
        {activeTool === 'select' && 'Click to select. Drag column to move. Shift+Drag to pan.'}
      </div>
    </div>
  )
}

function distToSegment(
  p: [number, number],
  a: [number, number],
  b: [number, number]
): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const projX = a[0] + t * dx
  const projY = a[1] + t * dy
  return Math.hypot(p[0] - projX, p[1] - projY)
}

const floatingInstructionsStyle: React.CSSProperties = {
  position: 'absolute',
  top: '12px',
  left: '12px',
  background: 'rgba(15, 23, 42, 0.85)',
  backdropFilter: 'blur(6px)',
  border: '1px solid #334155',
  borderRadius: '6px',
  padding: '6px 12px',
  fontSize: '11px',
  color: '#94a3b8',
  pointerEvents: 'none',
}
