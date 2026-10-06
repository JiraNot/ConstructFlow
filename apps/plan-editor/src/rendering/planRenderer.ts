// ConstructFlow 2D Plan Representation Renderer
// Millimeter Model Geometry -> Viewport Projection -> HTML5 Canvas 2D

import {
  ProjectDocument,
  SmartObject,
  isGridObject,
  isColumnObject,
  isFoundationObject,
} from '@constructflow/project-model'
import { ViewportState, worldToScreen } from '../viewport/viewportTransform.js'
import { SnapResult } from '../snapping/snapEngine.js'

export function renderPlanView(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  project: ProjectDocument,
  viewport: ViewportState,
  selectedId: string | null,
  hoveredId: string | null,
  activeSnap: SnapResult | null,
  ghostObject: { type: string; location_mm: [number, number] } | null
) {
  // 1. Dark CAD canvas background
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, width, height)

  // 2. Background CAD unit grid (1000mm major)
  drawBackgroundCadGrid(ctx, width, height, viewport)

  // 3. Structural Grid Lines & Bubbles
  for (const obj of Object.values(project.objects)) {
    if (isGridObject(obj)) {
      drawStructuralGrid(ctx, obj, viewport, selectedId === obj.id, hoveredId === obj.id)
    }
  }

  // 4. Foundations (rendered underneath columns)
  for (const obj of Object.values(project.objects)) {
    if (isFoundationObject(obj)) {
      drawFoundation(ctx, obj, viewport, selectedId === obj.id, hoveredId === obj.id)
    }
  }

  // 5. Columns (rendered with cross hatch and human-readable mark)
  for (const obj of Object.values(project.objects)) {
    if (isColumnObject(obj)) {
      drawColumn(ctx, obj, viewport, selectedId === obj.id, hoveredId === obj.id)
    }
  }

  // 6. Placement Ghost Preview
  if (ghostObject) {
    drawPlacementGhost(ctx, ghostObject, viewport)
  }

  // 7. Snap Target Indicator
  if (activeSnap && activeSnap.kind !== 'free') {
    drawSnapMarker(ctx, activeSnap, viewport)
  }
}

function drawBackgroundCadGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  viewport: ViewportState
) {
  const step_mm = 1000 // 1 meter grid
  const screenStep = step_mm * viewport.zoom

  if (screenStep < 25) return // Too dense to render legibly

  const startWorldX = (-viewport.panX) / viewport.zoom
  const startWorldY = (-viewport.panY) / viewport.zoom
  const endWorldX = (width - viewport.panX) / viewport.zoom
  const endWorldY = (height - viewport.panY) / viewport.zoom

  const firstGridX = Math.floor(startWorldX / step_mm) * step_mm
  const firstGridY = Math.floor(startWorldY / step_mm) * step_mm

  ctx.strokeStyle = '#1e293b'
  ctx.lineWidth = 1
  ctx.beginPath()

  for (let x = firstGridX; x <= endWorldX; x += step_mm) {
    const [sx] = worldToScreen([x, 0], viewport)
    ctx.moveTo(sx, 0)
    ctx.lineTo(sx, height)
  }

  for (let y = firstGridY; y <= endWorldY; y += step_mm) {
    const [, sy] = worldToScreen([0, y], viewport)
    ctx.moveTo(0, sy)
    ctx.lineTo(width, sy)
  }

  ctx.stroke()
}

function drawStructuralGrid(
  ctx: CanvasRenderingContext2D,
  obj: ReturnType<typeof isGridObject> extends true ? any : SmartObject<any>,
  viewport: ViewportState,
  isSelected: boolean,
  isHovered: boolean
) {
  const { tag, orientation, position_mm, extent_mm } = obj.module_data
  const extent = extent_mm || [-10000, 15000]

  ctx.save()
  ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2 : 1.2
  ctx.strokeStyle = isSelected ? '#38bdf8' : isHovered ? '#7dd3fc' : '#64748b'
  ctx.setLineDash([8, 4, 2, 4]) // Long-dash, dot, dash

  let bubbleX = 0
  let bubbleY = 0

  if (orientation === 'vertical') {
    const [sX] = worldToScreen([position_mm, 0], viewport)
    const [, sY1] = worldToScreen([0, extent[0]], viewport)
    const [, sY2] = worldToScreen([0, extent[1]], viewport)
    ctx.beginPath()
    ctx.moveTo(sX, sY1)
    ctx.lineTo(sX, sY2)
    ctx.stroke()

    bubbleX = sX
    bubbleY = Math.min(sY1, sY2) - 20
  } else {
    const [, sY] = worldToScreen([0, position_mm], viewport)
    const [sX1] = worldToScreen([extent[0], 0], viewport)
    const [sX2] = worldToScreen([extent[1], 0], viewport)
    ctx.beginPath()
    ctx.moveTo(sX1, sY)
    ctx.lineTo(sX2, sY)
    ctx.stroke()

    bubbleX = Math.min(sX1, sX2) - 20
    bubbleY = sY
  }

  ctx.setLineDash([])

  // Grid Bubble Marker
  const radius = 14
  ctx.fillStyle = '#0f172a'
  ctx.beginPath()
  ctx.arc(bubbleX, bubbleY, radius, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = isSelected ? '#38bdf8' : '#94a3b8'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(bubbleX, bubbleY, radius, 0, Math.PI * 2)
  ctx.stroke()

  ctx.fillStyle = '#f8fafc'
  ctx.font = 'bold 12px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(tag, bubbleX, bubbleY)

  ctx.restore()
}

function drawFoundation(
  ctx: CanvasRenderingContext2D,
  obj: ReturnType<typeof isFoundationObject> extends true ? any : SmartObject<any>,
  viewport: ViewportState,
  isSelected: boolean,
  isHovered: boolean
) {
  const { mark, center_mm, size_mm } = obj.module_data
  const [cx, cy] = center_mm
  const [w_mm, l_mm] = size_mm

  const half_w = w_mm / 2
  const half_l = l_mm / 2

  const [minX, minY] = worldToScreen([cx - half_w, cy - half_l], viewport)
  const [maxX, maxY] = worldToScreen([cx + half_w, cy + half_l], viewport)
  const screenW = maxX - minX
  const screenH = maxY - minY

  ctx.save()
  // Dashed structural footing outline
  ctx.setLineDash([5, 5])
  ctx.strokeStyle = isSelected ? '#38bdf8' : isHovered ? '#60a5fa' : '#334155'
  ctx.lineWidth = isSelected ? 2 : 1.5
  ctx.fillStyle = 'rgba(30, 41, 59, 0.45)'

  ctx.beginPath()
  ctx.rect(minX, minY, screenW, screenH)
  ctx.fill()
  ctx.stroke()

  // Mark label (e.g. F01) at bottom-right of footing
  ctx.setLineDash([])
  ctx.fillStyle = '#94a3b8'
  ctx.font = '10px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(mark || 'F', minX + 4, minY + 4)

  ctx.restore()
}

function drawColumn(
  ctx: CanvasRenderingContext2D,
  obj: ReturnType<typeof isColumnObject> extends true ? any : SmartObject<any>,
  viewport: ViewportState,
  isSelected: boolean,
  isHovered: boolean
) {
  const { mark, location_mm, section_mm } = obj.module_data
  const [cx, cy] = location_mm
  const [w_mm, d_mm] = section_mm

  const half_w = w_mm / 2
  const half_d = d_mm / 2

  const [minX, minY] = worldToScreen([cx - half_w, cy - half_d], viewport)
  const [maxX, maxY] = worldToScreen([cx + half_w, cy + half_d], viewport)
  const screenW = maxX - minX
  const screenH = maxY - minY

  ctx.save()

  // Phase color scheme
  let fillColor = '#0284c7' // Blue primary (new construction)
  if (obj.created_phase === 'existing') fillColor = '#475569'
  if (obj.created_phase === 'demolition' || obj.removed_phase === 'demolition') {
    fillColor = '#ef4444'
  }

  // Column solid fill
  ctx.fillStyle = fillColor
  ctx.fillRect(minX, minY, screenW, screenH)

  // Architectural cross hatch inside column
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(minX, minY)
  ctx.lineTo(maxX, maxY)
  ctx.moveTo(maxX, minY)
  ctx.lineTo(minX, maxY)
  ctx.stroke()

  // Outline
  ctx.strokeStyle = isSelected ? '#38bdf8' : isHovered ? '#e2e8f0' : '#0f172a'
  ctx.lineWidth = isSelected ? 2.5 : 1.5
  ctx.strokeRect(minX, minY, screenW, screenH)

  // Human-readable Mark tag (e.g. "C01") rendered above column
  ctx.fillStyle = isSelected ? '#38bdf8' : '#f8fafc'
  ctx.font = 'bold 11px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText(mark || obj.id.slice(0, 6), (minX + maxX) / 2, minY - 4)

  ctx.restore()
}

function drawPlacementGhost(
  ctx: CanvasRenderingContext2D,
  ghost: { type: string; location_mm: [number, number] },
  viewport: ViewportState
) {
  const [x, y] = worldToScreen(ghost.location_mm, viewport)
  const size_px = 200 * viewport.zoom // 200mm preview
  const half = size_px / 2

  ctx.save()
  ctx.fillStyle = 'rgba(56, 189, 248, 0.35)'
  ctx.strokeStyle = '#38bdf8'
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 4])

  ctx.fillRect(x - half, y - half, size_px, size_px)
  ctx.strokeRect(x - half, y - half, size_px, size_px)
  ctx.restore()
}

function drawSnapMarker(
  ctx: CanvasRenderingContext2D,
  snap: SnapResult,
  viewport: ViewportState
) {
  const [x, y] = worldToScreen(snap.point_mm, viewport)
  ctx.save()

  if (snap.kind === 'grid_intersection') {
    // Yellow diamond for intersection
    const s = 7
    ctx.strokeStyle = '#eab308'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, y - s)
    ctx.lineTo(x + s, y)
    ctx.lineTo(x, y + s)
    ctx.lineTo(x - s, y)
    ctx.closePath()
    ctx.stroke()
  } else if (snap.kind === 'column_center') {
    // Green square for column center
    const s = 6
    ctx.strokeStyle = '#22c55e'
    ctx.lineWidth = 2
    ctx.strokeRect(x - s, y - s, s * 2, s * 2)
  } else if (snap.kind === 'grid_line') {
    // Cyan cross
    const s = 6
    ctx.strokeStyle = '#38bdf8'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x - s, y)
    ctx.lineTo(x + s, y)
    ctx.moveTo(x, y - s)
    ctx.lineTo(x, y + s)
    ctx.stroke()
  }

  // Tooltip description
  ctx.fillStyle = '#f8fafc'
  ctx.font = '10px monospace'
  ctx.textAlign = 'left'
  ctx.fillText(snap.description, x + 10, y - 10)

  ctx.restore()
}
