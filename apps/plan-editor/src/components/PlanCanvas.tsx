import React, { useRef, useEffect, useState, useCallback } from 'react'
import {
  ProjectDocument,
  SmartObject,
  isColumnObject,
  isFoundationObject,
  isGridObject,
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
  selectedId: string | null
  onSelectObject: (id: string | null) => void
  onCommitColumn: (location_mm: [number, number]) => void
  onCommitFoundation: (columnId: string) => void
  onCommitGrid: (orientation: 'vertical' | 'horizontal', position_mm: number) => void
  onMoveColumn: (id: string, newLocation_mm: [number, number]) => void
  onCursorChange: (coords_mm: [number, number], snapKind: string) => void
}

export const PlanCanvas: React.FC<PlanCanvasProps> = ({
  project,
  activeTool,
  selectedId,
  onSelectObject,
  onCommitColumn,
  onCommitFoundation,
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
  }, [project, viewport, selectedId, hoveredId, activeSnap, activeTool])

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

    // 3. Grids
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
          const distSq = (rawWorld[0] - cx) ** 2 + (rawWorld[1] - cy) ** 2
          return distSq <= (400 / viewport.zoom) ** 2
        })
        if (colHit) {
          onCommitFoundation(colHit.id)
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
