// Plan Representation Renderer (Semantic Model -> Plan View -> 2D Canvas)

import { Project, SmartObject, Phase } from '../types/model'
import { ViewportState, worldToScreen } from '../viewport/viewportTransform'
import { SnapResult } from '../snapping/snapEngine'

export function renderPlanView(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  project: Project,
  viewport: ViewportState,
  selectedId: string | null,
  hoveredId: string | null,
  activeSnap: SnapResult | null,
  ghostObject: { type: string; location_mm: [number, number] } | null
) {
  // Clear viewport
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)

  // 1. Draw subtle background CAD grid (1000mm major, 500mm minor)
  drawBackgroundCadGrid(ctx, canvasWidth, canvasHeight, viewport)

  // 2. Draw Structural Grid Lines
  for (const obj of Object.values(project.objects)) {
    if (obj.object_type === 'structure.grid') {
      drawStructuralGrid(ctx, obj, viewport, selectedId === obj.id, hoveredId === obj.id)
    }
  }

  // 3. Draw Walls
  for (const obj of Object.values(project.objects)) {
    if (obj.object_type === 'architecture.wall') {
      drawWall(ctx, obj, viewport, selectedId === obj.id, hoveredId === obj.id)
    }
  }

  // 4. Draw Columns
  for (const obj of Object.values(project.objects)) {
    if (obj.object_type === 'structure.column') {
      drawColumn(ctx, obj, viewport, selectedId === obj.id, hoveredId === obj.id)
    }
  }

  // 5. Draw Placement Ghost Preview
  if (ghostObject) {
    drawPlacementGhost(ctx, ghostObject, viewport)
  }

  // 6. Draw Snap Target Marker
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
  const step_mm = 1000 // 1 meter major grid
  const screenStep = step_mm * viewport.zoom

  if (screenStep < 20) return // Don't draw if too dense

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
  obj: SmartObject,
  viewport: ViewportState,
  isSelected: boolean,
  isHovered: boolean
) {
  const { tag, orientation, position_mm, extent_mm } = obj.module_data
  ctx.save()

  ctx.strokeStyle = isSelected ? '#38bdf8' : isHovered ? '#7dd3fc' : '#64748b'
  ctx.lineWidth = isSelected ? 2 : 1
  ctx.setLineDash([8, 4, 2, 4]) // Long-short centerline CAD dash

  let startScreen: [number, number]
  let endScreen: [number, number]

  if (orientation === 'vertical') {
    startScreen = worldToScreen([position_mm, extent_mm[0]], viewport)
    endScreen = worldToScreen([position_mm, extent_mm[1]], viewport)
  } else {
    startScreen = worldToScreen([extent_mm[0], position_mm], viewport)
    endScreen = worldToScreen([extent_mm[1], position_mm], viewport)
  }

  ctx.beginPath()
  ctx.moveTo(startScreen[0], startScreen[1])
  ctx.lineTo(endScreen[0], endScreen[1])
  ctx.stroke()

  ctx.setLineDash([])

  // Grid bubble
  const bubbleRadius = 14
  for (const pt of [startScreen, endScreen]) {
    ctx.fillStyle = '#0f172a'
    ctx.strokeStyle = isSelected ? '#38bdf8' : '#94a3b8'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(pt[0], pt[1], bubbleRadius, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = isSelected ? '#38bdf8' : '#e2e8f0'
    ctx.font = '600 11px JetBrains Mono, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(tag, pt[0], pt[1])
  }

  ctx.restore()
}

function getPhaseColors(phase: Phase, removedPhase: Phase | null) {
  if (removedPhase === 'demolition' || phase === 'demolition') {
    return {
      fill: 'rgba(239, 68, 68, 0.25)',
      stroke: '#ef4444',
      dash: [6, 4],
      label: 'DEMO',
    }
  }
  if (phase === 'existing') {
    return {
      fill: 'rgba(100, 116, 139, 0.4)',
      stroke: '#94a3b8',
      dash: [],
      label: 'EXISTING',
    }
  }
  return {
    fill: 'rgba(56, 189, 248, 0.25)',
    stroke: '#38bdf8',
    dash: [],
    label: 'NEW',
  }
}

function drawColumn(
  ctx: CanvasRenderingContext2D,
  obj: SmartObject,
  viewport: ViewportState,
  isSelected: boolean,
  isHovered: boolean
) {
  const { location_mm, section_mm, rotation_deg } = obj.module_data
  const [w_mm, h_mm] = section_mm
  const [cx_px, cy_px] = worldToScreen(location_mm, viewport)
  const w_px = w_mm * viewport.zoom
  const h_px = h_mm * viewport.zoom

  const colors = getPhaseColors(obj.created_phase, obj.removed_phase)

  ctx.save()
  ctx.translate(cx_px, cy_px)
  if (rotation_deg) {
    ctx.rotate((rotation_deg * Math.PI) / 180)
  }

  // Body
  ctx.fillStyle = colors.fill
  ctx.strokeStyle = isSelected ? '#00f0ff' : isHovered ? '#38bdf8' : colors.stroke
  ctx.lineWidth = isSelected ? 2.5 : 1.5
  ctx.setLineDash(colors.dash)

  ctx.fillRect(-w_px / 2, -h_px / 2, w_px, h_px)
  ctx.strokeRect(-w_px / 2, -h_px / 2, w_px, h_px)

  // Architectural column cross hatch (diagonal lines)
  ctx.beginPath()
  ctx.moveTo(-w_px / 2, -h_px / 2)
  ctx.lineTo(w_px / 2, h_px / 2)
  ctx.moveTo(w_px / 2, -h_px / 2)
  ctx.lineTo(-w_px / 2, h_px / 2)
  ctx.stroke()

  ctx.setLineDash([])

  // Label tag above column
  ctx.fillStyle = isSelected ? '#00f0ff' : '#94a3b8'
  ctx.font = '500 10px JetBrains Mono, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText(obj.id, 0, -h_px / 2 - 4)

  // Selection grips
  if (isSelected) {
    drawGrips(ctx, [
      [-w_px / 2, -h_px / 2],
      [w_px / 2, -h_px / 2],
      [w_px / 2, h_px / 2],
      [-w_px / 2, h_px / 2],
      [0, 0],
    ])
  }

  ctx.restore()
}

function drawWall(
  ctx: CanvasRenderingContext2D,
  obj: SmartObject,
  viewport: ViewportState,
  isSelected: boolean,
  isHovered: boolean
) {
  const { start_mm, end_mm, thickness_mm } = obj.module_data
  const [x1, y1] = worldToScreen(start_mm, viewport)
  const [x2, y2] = worldToScreen(end_mm, viewport)
  const t_px = thickness_mm * viewport.zoom

  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy)
  if (len < 1) return

  const nx = (-dy / len) * (t_px / 2)
  const ny = (dx / len) * (t_px / 2)

  const colors = getPhaseColors(obj.created_phase, obj.removed_phase)

  ctx.save()
  ctx.beginPath()
  ctx.moveTo(x1 + nx, y1 + ny)
  ctx.lineTo(x2 + nx, y2 + ny)
  ctx.lineTo(x2 - nx, y2 - ny)
  ctx.lineTo(x1 - nx, y1 - ny)
  ctx.closePath()

  ctx.fillStyle = colors.fill
  ctx.fill()

  ctx.strokeStyle = isSelected ? '#00f0ff' : isHovered ? '#38bdf8' : colors.stroke
  ctx.lineWidth = isSelected ? 2.5 : 1.5
  ctx.setLineDash(colors.dash)
  ctx.stroke()
  ctx.setLineDash([])

  // Wall ID label at midpoint
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  ctx.fillStyle = '#cbd5e1'
  ctx.font = '500 10px JetBrains Mono, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(obj.id, mx, my)

  if (isSelected) {
    drawGrips(ctx, [
      [x1, y1],
      [x2, y2],
      [mx, my],
    ])
  }

  ctx.restore()
}

function drawGrips(ctx: CanvasRenderingContext2D, points: [number, number][]) {
  const gripSize = 6
  ctx.fillStyle = '#00f0ff'
  ctx.strokeStyle = '#0284c7'
  ctx.lineWidth = 1
  for (const [gx, gy] of points) {
    ctx.fillRect(gx - gripSize / 2, gy - gripSize / 2, gripSize, gripSize)
    ctx.strokeRect(gx - gripSize / 2, gy - gripSize / 2, gripSize, gripSize)
  }
}

function drawPlacementGhost(
  ctx: CanvasRenderingContext2D,
  ghost: { type: string; location_mm: [number, number] },
  viewport: ViewportState
) {
  const [sx, sy] = worldToScreen(ghost.location_mm, viewport)
  ctx.save()
  ctx.translate(sx, sy)

  if (ghost.type === 'column') {
    const s_px = 200 * viewport.zoom
    ctx.fillStyle = 'rgba(56, 189, 248, 0.3)'
    ctx.strokeStyle = '#38bdf8'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])
    ctx.fillRect(-s_px / 2, -s_px / 2, s_px, s_px)
    ctx.strokeRect(-s_px / 2, -s_px / 2, s_px, s_px)
  }

  ctx.restore()
}

function drawSnapMarker(
  ctx: CanvasRenderingContext2D,
  snap: SnapResult,
  viewport: ViewportState
) {
  const [sx, sy] = worldToScreen(snap.point_mm, viewport)
  ctx.save()

  // Snap diamond marker
  const r = 7
  ctx.strokeStyle = '#facc15'
  ctx.fillStyle = 'rgba(250, 204, 21, 0.2)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(sx, sy - r)
  ctx.lineTo(sx + r, sy)
  ctx.lineTo(sx, sy + r)
  ctx.lineTo(sx - r, sy)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Snap tooltip badge
  ctx.fillStyle = '#020617'
  ctx.strokeStyle = '#eab308'
  ctx.lineWidth = 1
  ctx.font = '500 10px Inter, sans-serif'
  const text = `${snap.description} (${snap.point_mm[0]}, ${snap.point_mm[1]})`
  const textWidth = ctx.measureText(text).width

  const bx = sx + 12
  const by = sy - 18
  const pad = 4
  ctx.fillRect(bx - pad, by - 12 - pad, textWidth + pad * 2, 16 + pad * 2)
  ctx.strokeRect(bx - pad, by - 12 - pad, textWidth + pad * 2, 16 + pad * 2)

  ctx.fillStyle = '#fef08a'
  ctx.textBaseline = 'top'
  ctx.fillText(text, bx, by - 12)

  ctx.restore()
}
