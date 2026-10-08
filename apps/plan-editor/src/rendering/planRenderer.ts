import {
  ProjectDocument,
  SmartObject,
  isGridObject,
  isColumnObject,
  isFoundationObject,
  isBeamObject,
  isWallObject,
  isDoorObject,
  isWindowObject,
  WallModuleData,
  DoorModuleData,
  WindowModuleData,
  DoorHanding,
} from '@constructflow/project-model'
import { ViewportState, worldToScreen } from '../viewport/viewportTransform.js'
import { SnapResult } from '@constructflow/snapping-engine'
import { constructionOutputs } from '@constructflow/domain-providers'

export interface UnderlayConfig {
  image: HTMLImageElement | null
  origin_mm: [number, number]
  scale_mm_per_px: number
  opacity: number
  visible: boolean
}

export interface CalibrationOverlay {
  point1_mm: [number, number] | null
  point2_mm: [number, number] | null
  mouse_mm?: [number, number] | null
}

export function renderPlanView(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  project: ProjectDocument,
  viewport: ViewportState,
  selectedId: string | null,
  hoveredId: string | null,
  activeSnap: SnapResult | null,
  ghostObject: PlacementGhost | null,
  underlay?: UnderlayConfig | null,
  calibration?: CalibrationOverlay | null,
  sourceProject: ProjectDocument = project
) {
  // 1. Bright drafting canvas background
  ctx.fillStyle = '#fbfdff'
  ctx.fillRect(0, 0, width, height)

  // 2. Background CAD unit grid (1000mm major)
  drawBackgroundCadGrid(ctx, width, height, viewport)

  // 2.5 Underlay Image (Floor plan underlay / DWG with scale & opacity)
  if (underlay && underlay.visible && underlay.image) {
    drawUnderlayImage(ctx, underlay, viewport)
  }

  // 3. Structural Grid Lines & Bubbles
  for (const out of constructionOutputs(sourceProject).filter(out=>!!project.objects[out.object_id])) {
    const phase=out.removed_phase==='demolition'?'demolition':out.phase
    ctx.save();ctx.strokeStyle=selectedId===out.object_id?'#fbbf24':phase==='demolition'?'#ef4444':phase==='existing'?'#94a3b8':'#38bdf8'
    ctx.lineWidth=phase==='new_construction'?2:1;ctx.setLineDash(phase==='demolition'?[6,3]:[])
    const lines=[...out.paths,...out.meshes.map(t=>[...t,t[0]])]
    const seen=new Set<string>()
    for(const points of lines){const key=points.map(v=>v.slice(0,2).join(',')).join('|');if(seen.has(key))continue;seen.add(key);ctx.beginPath();points.forEach((p,i)=>{const [x,y]=worldToScreen([p[0],p[1]],viewport);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y)});ctx.stroke()}
    const anchor=lines[0]?.[0];if(anchor){const [x,y]=worldToScreen([anchor[0],anchor[1]],viewport);ctx.fillStyle=ctx.strokeStyle;ctx.font='11px sans-serif';ctx.fillText(out.mark,x+4,y-4)}
    ctx.restore()
  }
  for (const obj of Object.values(project.objects)) {
    if (isGridObject(obj)) {
      drawStructuralGrid(ctx, obj, viewport, selectedId === obj.id, hoveredId === obj.id)
    }
  }

  // 4. Foundations (rendered underneath beams and columns)
  for (const obj of Object.values(project.objects)) {
    if (isFoundationObject(obj)) {
      drawFoundation(ctx, obj, viewport, selectedId === obj.id, hoveredId === obj.id)
    }
  }

  // 5. Beams (rendered connecting columns/grids)
  for (const obj of Object.values(project.objects)) {
    if (isBeamObject(obj)) {
      drawBeam(ctx, obj, viewport, selectedId === obj.id, hoveredId === obj.id)
    }
  }

  // 6. Walls (rendered with opening cutouts)
  for (const obj of Object.values(project.objects)) {
    if (isWallObject(obj)) {
      drawWall(ctx, obj, project, viewport, selectedId === obj.id, hoveredId === obj.id)
    }
  }

  // 7. Windows & Doors (infill symbols on walls)
  for (const obj of Object.values(project.objects)) {
    if (isWindowObject(obj)) {
      drawWindow(ctx, obj, project, viewport, selectedId === obj.id, hoveredId === obj.id)
    } else if (isDoorObject(obj)) {
      drawDoor(ctx, obj, project, viewport, selectedId === obj.id, hoveredId === obj.id)
    }
  }

  // 8. Columns (rendered with cross hatch and human-readable mark)
  for (const obj of Object.values(project.objects)) {
    if (isColumnObject(obj)) {
      drawColumn(ctx, obj, viewport, selectedId === obj.id, hoveredId === obj.id)
    }
  }

  // 9. Placement Ghost Preview
  if (ghostObject) {
    drawPlacementGhost(ctx, ghostObject, viewport, project)
  }

  // 10. Snap Target Indicator
  if (activeSnap && activeSnap.kind !== 'free') {
    drawSnapMarker(ctx, activeSnap, viewport)
  }

  // 11. Calibration Overlay (Point-to-Point Scale Measure)
  if (calibration && (calibration.point1_mm || calibration.point2_mm)) {
    drawCalibrationOverlay(ctx, calibration, viewport)
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

  ctx.strokeStyle = '#e5ebf2'
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

function drawUnderlayImage(
  ctx: CanvasRenderingContext2D,
  underlay: UnderlayConfig,
  viewport: ViewportState
) {
  if (!underlay.image || !underlay.visible) return

  ctx.save()
  ctx.globalAlpha = Math.max(0.05, Math.min(1, underlay.opacity))

  const [origX, origY] = underlay.origin_mm
  const [sx, sy] = worldToScreen([origX, origY], viewport)
  const imgW = underlay.image.naturalWidth || underlay.image.width
  const imgH = underlay.image.naturalHeight || underlay.image.height

  const screenW = imgW * underlay.scale_mm_per_px * viewport.zoom
  const screenH = imgH * underlay.scale_mm_per_px * viewport.zoom

  ctx.drawImage(underlay.image, sx, sy, screenW, screenH)

  // Subtle boundary outline
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)'
  ctx.lineWidth = 1
  ctx.setLineDash([6, 6])
  ctx.strokeRect(sx, sy, screenW, screenH)
  ctx.setLineDash([])

  // Header badge
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'
  ctx.fillRect(sx, sy - 20, 210, 20)
  ctx.fillStyle = '#38bdf8'
  ctx.font = 'bold 10px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(`📐 Underlay (1px = ${underlay.scale_mm_per_px.toFixed(2)} mm)`, sx + 6, sy - 10)

  ctx.restore()
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
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(bubbleX, bubbleY, radius, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = isSelected ? '#38bdf8' : '#94a3b8'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(bubbleX, bubbleY, radius, 0, Math.PI * 2)
  ctx.stroke()

  ctx.fillStyle = '#33465b'
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
  ctx.strokeStyle = isSelected ? '#38bdf8' : isHovered ? '#60a5fa' : '#64748b'
  ctx.lineWidth = isSelected ? 2 : 1.5
  ctx.fillStyle = 'rgba(226, 232, 240, 0.72)'

  ctx.beginPath()
  ctx.rect(minX, minY, screenW, screenH)
  ctx.fill()
  ctx.stroke()

  // Mark label (e.g. F1) at bottom-right or top-left of footing
  ctx.setLineDash([])
  ctx.fillStyle = isSelected ? '#0876d1' : '#64748b'
  ctx.font = 'bold 10px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(mark || 'F1', minX + 4, minY + 4)

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
  let fillColor = '#b9dcf7' // Blue primary (new construction)
  if (obj.created_phase === 'existing') fillColor = '#d5dde6'
  if (obj.created_phase === 'demolition' || obj.removed_phase === 'demolition') {
    fillColor = '#ef4444'
  }

  // Column solid fill
  ctx.fillStyle = fillColor
  ctx.fillRect(minX, minY, screenW, screenH)

  // Architectural cross hatch inside column
  ctx.strokeStyle = '#eaf4ff'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(minX, minY)
  ctx.lineTo(maxX, maxY)
  ctx.moveTo(maxX, minY)
  ctx.lineTo(minX, maxY)
  ctx.stroke()

  // Outline
  ctx.strokeStyle = isSelected ? '#1682e8' : isHovered ? '#60a5fa' : '#49627a'
  ctx.lineWidth = isSelected ? 2.5 : 1.5
  ctx.strokeRect(minX, minY, screenW, screenH)

  // Human-readable Mark tag (e.g. "C01") rendered above column
  ctx.fillStyle = isSelected ? '#0876d1' : '#33465b'
  ctx.font = 'bold 11px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText(mark || obj.id.slice(0, 6), (minX + maxX) / 2, minY - 4)

  ctx.restore()
}

function drawBeam(
  ctx: CanvasRenderingContext2D,
  obj: ReturnType<typeof isBeamObject> extends true ? any : SmartObject<any>,
  viewport: ViewportState,
  isSelected: boolean,
  isHovered: boolean
) {
  const { mark, start_point_mm, end_point_mm, section_mm, span_mm } = obj.module_data
  const [w_mm, d_mm] = section_mm || [200, 400]

  const [sx1, sy1] = worldToScreen([start_point_mm[0], start_point_mm[1]], viewport)
  const [sx2, sy2] = worldToScreen([end_point_mm[0], end_point_mm[1]], viewport)

  const dx = sx2 - sx1
  const dy = sy2 - sy1
  const len = Math.hypot(dx, dy)
  if (len < 1) return

  const nx = -dy / len
  const ny = dx / len
  const half_w_px = (w_mm * viewport.zoom) / 2

  ctx.save()

  const isDemolition = obj.created_phase === 'demolition' || obj.removed_phase === 'demolition'
  const isExisting = obj.created_phase === 'existing'

  // 1. Fill beam body
  ctx.beginPath()
  ctx.moveTo(sx1 + nx * half_w_px, sy1 + ny * half_w_px)
  ctx.lineTo(sx2 + nx * half_w_px, sy2 + ny * half_w_px)
  ctx.lineTo(sx2 - nx * half_w_px, sy2 - ny * half_w_px)
  ctx.lineTo(sx1 - nx * half_w_px, sy1 - ny * half_w_px)
  ctx.closePath()

  ctx.fillStyle = isSelected
    ? 'rgba(14, 165, 233, 0.35)'
    : isHovered
    ? 'rgba(56, 189, 248, 0.25)'
    : isDemolition
    ? 'rgba(239, 68, 68, 0.2)'
    : isExisting
    ? 'rgba(71, 85, 105, 0.5)'
    : 'rgba(205, 218, 231, 0.82)'
  ctx.fill()

  // 2. Stroke beam boundary
  ctx.strokeStyle = isSelected
    ? '#38bdf8'
    : isHovered
    ? '#7dd3fc'
    : isDemolition
    ? '#ef4444'
    : isExisting
    ? '#64748b'
    : '#0284c7'
  ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2 : 1.5
  if (isDemolition) ctx.setLineDash([6, 4])
  ctx.stroke()
  ctx.setLineDash([])

  // 3. Centerline
  ctx.beginPath()
  ctx.setLineDash([4, 4])
  ctx.strokeStyle = isSelected ? '#0876d1' : '#8497aa'
  ctx.lineWidth = 1
  ctx.moveTo(sx1, sy1)
  ctx.lineTo(sx2, sy2)
  ctx.stroke()
  ctx.setLineDash([])

  // 4. Text Annotation at Midpoint
  const mx = (sx1 + sx2) / 2
  const my = (sy1 + sy2) / 2
  let angle = Math.atan2(dy, dx)
  if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
    angle += Math.PI
  }

  ctx.translate(mx, my)
  ctx.rotate(angle)

  // Label badge
  const label = `${mark || 'B1'} ${w_mm}×${d_mm}`
  const spanLabel = `L=${(span_mm / 1000).toFixed(2)}m`
  const text = `${label} [${spanLabel}]`

  ctx.font = 'bold 10px monospace'
  const textWidth = ctx.measureText(text).width

  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)'
  ctx.fillRect(-textWidth / 2 - 4, -8, textWidth + 8, 16)
  ctx.strokeStyle = isSelected ? '#1682e8' : '#c7d3df'
  ctx.lineWidth = 1
  ctx.strokeRect(-textWidth / 2 - 4, -8, textWidth + 8, 16)

  ctx.fillStyle = isSelected ? '#0876d1' : '#33465b'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 0, 0)

  ctx.restore()
}

function drawWall(
  ctx: CanvasRenderingContext2D,
  wall: SmartObject<WallModuleData>,
  project: ProjectDocument,
  viewport: ViewportState,
  isSelected: boolean,
  isHovered: boolean
) {
  const { start_point_mm, end_point_mm, thickness_mm, mark } = wall.module_data
  const [x1, y1] = start_point_mm
  const [x2, y2] = end_point_mm
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy)
  if (len < 5) return

  const ux = dx / len
  const uy = dy / len
  const nx = -uy
  const ny = ux

  // Collect openings hosted on this wall
  interface OpeningSpan {
    start_dist: number
    end_dist: number
  }
  const openings: OpeningSpan[] = []

  for (const obj of Object.values(project.objects)) {
    if (isDoorObject(obj) && obj.module_data.wall_id === wall.id) {
      const halfW = obj.module_data.width_mm / 2
      const center = obj.module_data.offset_along_wall_mm
      openings.push({
        start_dist: Math.max(0, center - halfW),
        end_dist: Math.min(len, center + halfW),
      })
    } else if (isWindowObject(obj) && obj.module_data.wall_id === wall.id) {
      const halfW = obj.module_data.width_mm / 2
      const center = obj.module_data.offset_along_wall_mm
      openings.push({
        start_dist: Math.max(0, center - halfW),
        end_dist: Math.min(len, center + halfW),
      })
    }
  }

  // Sort and merge openings
  openings.sort((a, b) => a.start_dist - b.start_dist)
  const mergedOpenings: OpeningSpan[] = []
  for (const op of openings) {
    if (mergedOpenings.length === 0) {
      mergedOpenings.push({ ...op })
    } else {
      const last = mergedOpenings[mergedOpenings.length - 1]
      if (op.start_dist <= last.end_dist) {
        last.end_dist = Math.max(last.end_dist, op.end_dist)
      } else {
        mergedOpenings.push({ ...op })
      }
    }
  }

  // Wall sub-segments
  interface WallSubSegment {
    s: number
    e: number
  }
  const subSegments: WallSubSegment[] = []
  let curr = 0
  for (const op of mergedOpenings) {
    if (op.start_dist > curr) {
      subSegments.push({ s: curr, e: op.start_dist })
    }
    curr = Math.max(curr, op.end_dist)
  }
  if (curr < len) {
    subSegments.push({ s: curr, e: len })
  }

  const half_thick = thickness_mm / 2
  const masonryThickness = wall.module_data.masonry_thickness_mm ?? thickness_mm
  const plasterInside = wall.module_data.plaster_inside_thickness_mm ?? 0
  const plasterOutside = wall.module_data.plaster_outside_thickness_mm ?? 0
  const hasFinishLayers = plasterInside + plasterOutside > 0

  // Render solid segments
  for (const seg of subSegments) {
    const p1_mm: [number, number] = [x1 + seg.s * ux, y1 + seg.s * uy]
    const p2_mm: [number, number] = [x1 + seg.e * ux, y1 + seg.e * uy]

    const c1_mm: [number, number] = [p1_mm[0] + nx * half_thick, p1_mm[1] + ny * half_thick]
    const c2_mm: [number, number] = [p2_mm[0] + nx * half_thick, p2_mm[1] + ny * half_thick]
    const c3_mm: [number, number] = [p2_mm[0] - nx * half_thick, p2_mm[1] - ny * half_thick]
    const c4_mm: [number, number] = [p1_mm[0] - nx * half_thick, p1_mm[1] - ny * half_thick]

    const [sc1x, sc1y] = worldToScreen(c1_mm, viewport)
    const [sc2x, sc2y] = worldToScreen(c2_mm, viewport)
    const [sc3x, sc3y] = worldToScreen(c3_mm, viewport)
    const [sc4x, sc4y] = worldToScreen(c4_mm, viewport)

    const isDemolition = wall.created_phase === 'demolition' || wall.removed_phase === 'demolition'
    const isExisting = wall.created_phase === 'existing'

    ctx.save()
    ctx.beginPath()
    ctx.moveTo(sc1x, sc1y)
    ctx.lineTo(sc2x, sc2y)
    ctx.lineTo(sc3x, sc3y)
    ctx.lineTo(sc4x, sc4y)
    ctx.closePath()

    ctx.fillStyle = isSelected
      ? 'rgba(56, 189, 248, 0.4)'
      : isHovered
      ? 'rgba(71, 85, 105, 0.85)'
      : isDemolition
      ? 'rgba(239, 68, 68, 0.25)'
      : isExisting
      ? 'rgba(71, 85, 105, 0.65)'
      : 'rgba(226, 232, 240, 0.92)'
    ctx.fill()

    ctx.strokeStyle = isSelected
      ? '#38bdf8'
      : isHovered
      ? '#94a3b8'
      : isDemolition
      ? '#ef4444'
      : isExisting
      ? '#64748b'
      : '#64748b'
    ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2 : 1.5
    if (isDemolition) ctx.setLineDash([6, 4])
    ctx.stroke()
    ctx.setLineDash([])
    if (hasFinishLayers) {
      const insideFace = half_thick - plasterInside
      const outsideFace = -half_thick + plasterOutside
      const [si1x, si1y] = worldToScreen([p1_mm[0] + nx * insideFace, p1_mm[1] + ny * insideFace], viewport)
      const [si2x, si2y] = worldToScreen([p2_mm[0] + nx * insideFace, p2_mm[1] + ny * insideFace], viewport)
      const [so1x, so1y] = worldToScreen([p1_mm[0] + nx * outsideFace, p1_mm[1] + ny * outsideFace], viewport)
      const [so2x, so2y] = worldToScreen([p2_mm[0] + nx * outsideFace, p2_mm[1] + ny * outsideFace], viewport)
      ctx.beginPath()
      ctx.moveTo(si1x, si1y); ctx.lineTo(si2x, si2y)
      ctx.moveTo(so1x, so1y); ctx.lineTo(so2x, so2y)
      ctx.strokeStyle = isSelected ? '#7dd3fc' : isDemolition ? '#fca5a5' : '#a3adb8'
      ctx.lineWidth = 1
      ctx.stroke()
    }
    ctx.restore()
  }

  // Draw centerline dashes along entire wall
  const [sx1, sy1] = worldToScreen([x1, y1], viewport)
  const [sx2, sy2] = worldToScreen([x2, y2], viewport)
  ctx.save()
  ctx.beginPath()
  ctx.setLineDash([3, 3])
  ctx.strokeStyle = isSelected ? '#38bdf8' : '#475569'
  ctx.lineWidth = 1
  ctx.moveTo(sx1, sy1)
  ctx.lineTo(sx2, sy2)
  ctx.stroke()
  ctx.restore()

  // Label badge at midpoint
  ctx.save()
  const mx = (sx1 + sx2) / 2
  const my = (sy1 + sy2) / 2
  let angle = Math.atan2(dy, dx)
  if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
    angle += Math.PI
  }
  ctx.translate(mx, my)
  ctx.rotate(angle)

  const masonry = wall.module_data.masonry_thickness_mm ?? thickness_mm
  const layerLabel = plasterInside + plasterOutside > 0 ? ` ก${masonry}+ฉ${plasterInside}/${plasterOutside}` : ` ${thickness_mm}mm`
  const text = `${mark || 'W1'} (${layerLabel}) [L=${(len / 1000).toFixed(2)}m]`
  ctx.font = 'bold 9px monospace'
  const textWidth = ctx.measureText(text).width
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'
  ctx.fillRect(-textWidth / 2 - 4, -7, textWidth + 8, 14)
  ctx.strokeStyle = isSelected ? '#38bdf8' : '#475569'
  ctx.lineWidth = 1
  ctx.strokeRect(-textWidth / 2 - 4, -7, textWidth + 8, 14)
  ctx.fillStyle = isSelected ? '#38bdf8' : '#e2e8f0'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 0, 0)
  ctx.restore()
}

function drawDoor(
  ctx: CanvasRenderingContext2D,
  door: SmartObject<DoorModuleData>,
  project: ProjectDocument,
  viewport: ViewportState,
  isSelected: boolean,
  isHovered: boolean
) {
  const { mark, wall_id, offset_along_wall_mm, width_mm, handing } = door.module_data
  const hostWall = project.objects[wall_id]
  if (!hostWall || !isWallObject(hostWall)) return

  const [wx1, wy1] = hostWall.module_data.start_point_mm
  const [wx2, wy2] = hostWall.module_data.end_point_mm
  const wdx = wx2 - wx1
  const wdy = wy2 - wy1
  const wlen = Math.hypot(wdx, wdy)
  if (wlen < 1) return

  const ux = wdx / wlen
  const uy = wdy / wlen
  const nx = -uy
  const ny = ux

  const cx = wx1 + offset_along_wall_mm * ux
  const cy = wy1 + offset_along_wall_mm * uy
  const half_w = width_mm / 2

  const j1_mm: [number, number] = [cx - half_w * ux, cy - half_w * uy]
  const j2_mm: [number, number] = [cx + half_w * ux, cy + half_w * uy]

  const [sj1x, sj1y] = worldToScreen(j1_mm, viewport)
  const [sj2x, sj2y] = worldToScreen(j2_mm, viewport)
  const [scx, scy] = worldToScreen([cx, cy], viewport)

  ctx.save()

  // 1. Jamb end lines
  const thick_px = hostWall.module_data.thickness_mm * viewport.zoom
  const snx = nx
  const sny = ny

  ctx.strokeStyle = isSelected ? '#38bdf8' : isHovered ? '#7dd3fc' : '#94a3b8'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(sj1x + snx * (thick_px / 2), sj1y + sny * (thick_px / 2))
  ctx.lineTo(sj1x - snx * (thick_px / 2), sj1y - sny * (thick_px / 2))
  ctx.moveTo(sj2x + snx * (thick_px / 2), sj2y + sny * (thick_px / 2))
  ctx.lineTo(sj2x - snx * (thick_px / 2), sj2y - sny * (thick_px / 2))
  ctx.stroke()

  // 2. Door leaf and swing arc
  const isDemolition = door.created_phase === 'demolition' || door.removed_phase === 'demolition'
  const isExisting = door.created_phase === 'existing'

  const isLeft = handing.startsWith('left')
  const isOut = handing.endsWith('out')

  const hinge_mm = isLeft ? j1_mm : j2_mm
  const latch_mm = isLeft ? j2_mm : j1_mm
  const [shx, shy] = worldToScreen(hinge_mm, viewport)
  const [slx, sly] = worldToScreen(latch_mm, viewport)

  const normalSign = isOut ? -1 : 1
  const doorLeafLenPx = width_mm * viewport.zoom
  const leafEndX = shx + normalSign * snx * doorLeafLenPx
  const leafEndY = shy + normalSign * sny * doorLeafLenPx

  // Leaf line
  ctx.beginPath()
  ctx.strokeStyle = isSelected
    ? '#38bdf8'
    : isHovered
    ? '#4ade80'
    : isDemolition
    ? '#ef4444'
    : isExisting
    ? '#94a3b8'
    : '#22c55e'
  ctx.lineWidth = isSelected ? 2.5 : 2
  if (isDemolition) ctx.setLineDash([4, 4])
  ctx.moveTo(shx, shy)
  ctx.lineTo(leafEndX, leafEndY)
  ctx.stroke()
  ctx.setLineDash([])

  // Swing arc
  const angleClosed = Math.atan2(sly - shy, slx - shx)
  const angleOpen = Math.atan2(leafEndY - shy, leafEndX - shx)

  ctx.beginPath()
  ctx.strokeStyle = isSelected
    ? 'rgba(56, 189, 248, 0.7)'
    : isDemolition
    ? 'rgba(239, 68, 68, 0.7)'
    : isExisting
    ? 'rgba(148, 163, 184, 0.6)'
    : 'rgba(34, 197, 94, 0.6)'
  ctx.lineWidth = 1
  ctx.setLineDash([3, 3])
  const counterClockwise = (angleOpen - angleClosed + 2 * Math.PI) % (2 * Math.PI) > Math.PI
  ctx.arc(shx, shy, doorLeafLenPx, angleClosed, angleOpen, counterClockwise)
  ctx.stroke()
  ctx.setLineDash([])

  // Badge mark
  const handingText = (handing || 'left_in').replace('_', ' ').toUpperCase()
  const text = isSelected
    ? `${mark || 'D1'} [${handingText} • Space: Flip]`
    : `${mark || 'D1'} (${(width_mm / 1000).toFixed(2)} m)`
  ctx.font = isSelected ? 'bold 10px monospace' : 'bold 9px monospace'
  const bw = ctx.measureText(text).width
  ctx.fillStyle = 'rgba(15, 23, 42, 0.95)'
  ctx.fillRect(scx - bw / 2 - 4, scy - 8, bw + 8, 16)
  ctx.strokeStyle = isSelected ? '#38bdf8' : '#22c55e'
  ctx.lineWidth = isSelected ? 1.5 : 1
  ctx.strokeRect(scx - bw / 2 - 4, scy - 8, bw + 8, 16)
  ctx.fillStyle = isSelected ? '#38bdf8' : '#4ade80'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, scx, scy)

  ctx.restore()
}

function drawWindow(
  ctx: CanvasRenderingContext2D,
  win: SmartObject<WindowModuleData>,
  project: ProjectDocument,
  viewport: ViewportState,
  isSelected: boolean,
  isHovered: boolean
) {
  const { mark, wall_id, offset_along_wall_mm, width_mm } = win.module_data
  const hostWall = project.objects[wall_id]
  if (!hostWall || !isWallObject(hostWall)) return

  const [wx1, wy1] = hostWall.module_data.start_point_mm
  const [wx2, wy2] = hostWall.module_data.end_point_mm
  const wdx = wx2 - wx1
  const wdy = wy2 - wy1
  const wlen = Math.hypot(wdx, wdy)
  if (wlen < 1) return

  const ux = wdx / wlen
  const uy = wdy / wlen
  const nx = -uy
  const ny = ux
  const half_thick = hostWall.module_data.thickness_mm / 2

  const cx = wx1 + offset_along_wall_mm * ux
  const cy = wy1 + offset_along_wall_mm * uy
  const half_w = width_mm / 2

  const p1_mm: [number, number] = [cx - half_w * ux, cy - half_w * uy]
  const p2_mm: [number, number] = [cx + half_w * ux, cy + half_w * uy]

  const c1_mm: [number, number] = [p1_mm[0] + nx * half_thick, p1_mm[1] + ny * half_thick]
  const c2_mm: [number, number] = [p2_mm[0] + nx * half_thick, p2_mm[1] + ny * half_thick]
  const c3_mm: [number, number] = [p2_mm[0] - nx * half_thick, p2_mm[1] - ny * half_thick]
  const c4_mm: [number, number] = [p1_mm[0] - nx * half_thick, p1_mm[1] - ny * half_thick]

  const [sc1x, sc1y] = worldToScreen(c1_mm, viewport)
  const [sc2x, sc2y] = worldToScreen(c2_mm, viewport)
  const [sc3x, sc3y] = worldToScreen(c3_mm, viewport)
  const [sc4x, sc4y] = worldToScreen(c4_mm, viewport)
  const [scx, scy] = worldToScreen([cx, cy], viewport)

  ctx.save()

  // Opening cutout background
  ctx.beginPath()
  ctx.moveTo(sc1x, sc1y)
  ctx.lineTo(sc2x, sc2y)
  ctx.lineTo(sc3x, sc3y)
  ctx.lineTo(sc4x, sc4y)
  ctx.closePath()
  ctx.fillStyle = isSelected ? 'rgba(56, 189, 248, 0.25)' : 'rgba(15, 23, 42, 0.95)'
  ctx.fill()

  // Jambs
  ctx.strokeStyle = isSelected ? '#38bdf8' : isHovered ? '#7dd3fc' : '#94a3b8'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(sc1x, sc1y)
  ctx.lineTo(sc4x, sc4y)
  ctx.moveTo(sc2x, sc2y)
  ctx.lineTo(sc3x, sc3y)
  ctx.stroke()

  // Sill lines
  ctx.strokeStyle = isSelected ? '#38bdf8' : '#64748b'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(sc1x, sc1y)
  ctx.lineTo(sc2x, sc2y)
  ctx.moveTo(sc4x, sc4y)
  ctx.lineTo(sc3x, sc3y)
  ctx.stroke()

  // Double Glass Lines
  const isDemolition = win.created_phase === 'demolition' || win.removed_phase === 'demolition'
  const isExisting = win.created_phase === 'existing'

  const glassOffsetPx = Math.max(2, 20 * viewport.zoom)
  const snx = nx
  const sny = ny
  const [sp1x, sp1y] = worldToScreen(p1_mm, viewport)
  const [sp2x, sp2y] = worldToScreen(p2_mm, viewport)

  ctx.strokeStyle = isSelected
    ? '#38bdf8'
    : isDemolition
    ? '#ef4444'
    : isExisting
    ? '#94a3b8'
    : '#38bdf8'
  ctx.lineWidth = 1.5
  if (isDemolition) ctx.setLineDash([4, 4])
  ctx.beginPath()
  ctx.moveTo(sp1x + snx * glassOffsetPx, sp1y + sny * glassOffsetPx)
  ctx.lineTo(sp2x + snx * glassOffsetPx, sp2y + sny * glassOffsetPx)
  ctx.moveTo(sp1x - snx * glassOffsetPx, sp1y - sny * glassOffsetPx)
  ctx.lineTo(sp2x - snx * glassOffsetPx, sp2y - sny * glassOffsetPx)
  ctx.stroke()
  ctx.setLineDash([])

  // Badge mark
  const text = `${mark || 'W1'} (${(width_mm / 1000).toFixed(2)} m)`
  ctx.font = 'bold 9px monospace'
  const bw = ctx.measureText(text).width
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'
  ctx.fillRect(scx - bw / 2 - 3, scy - 7, bw + 6, 14)
  ctx.strokeStyle = isSelected ? '#38bdf8' : '#0ea5e9'
  ctx.lineWidth = 1
  ctx.strokeRect(scx - bw / 2 - 3, scy - 7, bw + 6, 14)
  ctx.fillStyle = isSelected ? '#38bdf8' : '#38bdf8'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, scx, scy)

  ctx.restore()
}

export interface PlacementGhost {
  type: string
  location_mm: [number, number]
  target_location_mm?: [number, number]
  size_mm?: [number, number] | [number, number, number]
  mark?: string
  handing?: DoorHanding
  operation?: string
  panel_count?: number
  sill_height_mm?: number
  glazing_material?: string
  wall_id?: string
  offset_along_wall_mm?: number
}

function drawPlacementGhost(
  ctx: CanvasRenderingContext2D,
  ghost: PlacementGhost,
  viewport: ViewportState,
  project?: ProjectDocument
) {
  ctx.save()

  if (ghost.type === 'beam' && ghost.target_location_mm) {
    const [sx1, sy1] = worldToScreen(ghost.location_mm, viewport)
    const [sx2, sy2] = worldToScreen(ghost.target_location_mm, viewport)
    const w_mm = ghost.size_mm?.[0] || 200
    const d_mm = ghost.size_mm?.[1] || 400
    const dx = sx2 - sx1
    const dy = sy2 - sy1
    const len = Math.hypot(dx, dy)
    if (len > 2) {
      const nx = -dy / len
      const ny = dx / len
      const half_w_px = (w_mm * viewport.zoom) / 2

      ctx.beginPath()
      ctx.moveTo(sx1 + nx * half_w_px, sy1 + ny * half_w_px)
      ctx.lineTo(sx2 + nx * half_w_px, sy2 + ny * half_w_px)
      ctx.lineTo(sx2 - nx * half_w_px, sy2 - ny * half_w_px)
      ctx.lineTo(sx1 - nx * half_w_px, sy1 - ny * half_w_px)
      ctx.closePath()

      ctx.fillStyle = 'rgba(56, 189, 248, 0.25)'
      ctx.fill()
      ctx.strokeStyle = '#38bdf8'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 4])
      ctx.stroke()
      ctx.setLineDash([])

      // Live span badge
      const span_mm = Math.round(Math.hypot(
        ghost.target_location_mm[0] - ghost.location_mm[0],
        ghost.target_location_mm[1] - ghost.location_mm[1]
      ))
      const mx = (sx1 + sx2) / 2
      const my = (sy1 + sy2) / 2
      ctx.fillStyle = '#0f172a'
      const badgeText = `${ghost.mark || 'B1'} (${(w_mm / 1000).toFixed(2)}×${(d_mm / 1000).toFixed(2)} m)  Span: ${(span_mm / 1000).toFixed(2)} m`
      ctx.font = 'bold 11px monospace'
      const bw = ctx.measureText(badgeText).width
      ctx.fillRect(mx - bw / 2 - 6, my - 10, bw + 12, 20)
      ctx.strokeStyle = '#38bdf8'
      ctx.lineWidth = 1
      ctx.strokeRect(mx - bw / 2 - 6, my - 10, bw + 12, 20)
      ctx.fillStyle = '#38bdf8'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(badgeText, mx, my)
    }

    // Start anchor circle
    ctx.fillStyle = '#38bdf8'
    ctx.beginPath()
    ctx.arc(sx1, sy1, 5, 0, Math.PI * 2)
    ctx.fill()

    ctx.restore()
    return
  }

  if (ghost.type === 'wall' && ghost.target_location_mm) {
    const [sx1, sy1] = worldToScreen(ghost.location_mm, viewport)
    const [sx2, sy2] = worldToScreen(ghost.target_location_mm, viewport)
    const thick_mm = ghost.size_mm?.[0] || 100
    const dx = sx2 - sx1
    const dy = sy2 - sy1
    const len = Math.hypot(dx, dy)
    if (len > 2) {
      const nx = -dy / len
      const ny = dx / len
      const half_thick_px = (thick_mm * viewport.zoom) / 2

      ctx.beginPath()
      ctx.moveTo(sx1 + nx * half_thick_px, sy1 + ny * half_thick_px)
      ctx.lineTo(sx2 + nx * half_thick_px, sy2 + ny * half_thick_px)
      ctx.lineTo(sx2 - nx * half_thick_px, sy2 - ny * half_thick_px)
      ctx.lineTo(sx1 - nx * half_thick_px, sy1 - ny * half_thick_px)
      ctx.closePath()

      ctx.fillStyle = 'rgba(148, 163, 184, 0.35)'
      ctx.fill()
      ctx.strokeStyle = '#94a3b8'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 4])
      ctx.stroke()
      ctx.setLineDash([])

      // Live length badge
      const length_mm = Math.round(Math.hypot(
        ghost.target_location_mm[0] - ghost.location_mm[0],
        ghost.target_location_mm[1] - ghost.location_mm[1]
      ))
      const mx = (sx1 + sx2) / 2
      const my = (sy1 + sy2) / 2
      ctx.fillStyle = '#0f172a'
      const badgeText = `${ghost.mark || 'W1'} (${(thick_mm / 1000).toFixed(2)} m)  L: ${(length_mm / 1000).toFixed(2)} m`
      ctx.font = 'bold 11px monospace'
      const bw = ctx.measureText(badgeText).width
      ctx.fillRect(mx - bw / 2 - 6, my - 10, bw + 12, 20)
      ctx.strokeStyle = '#94a3b8'
      ctx.lineWidth = 1
      ctx.strokeRect(mx - bw / 2 - 6, my - 10, bw + 12, 20)
      ctx.fillStyle = '#e2e8f0'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(badgeText, mx, my)
    }

    ctx.fillStyle = '#94a3b8'
    ctx.beginPath()
    ctx.arc(sx1, sy1, 5, 0, Math.PI * 2)
    ctx.fill()

    ctx.restore()
    return
  }

  if (ghost.type === 'door' && ghost.wall_id && project) {
    const hostWall = project.objects[ghost.wall_id]
    if (hostWall && isWallObject(hostWall)) {
      const [wx1, wy1] = hostWall.module_data.start_point_mm
      const [wx2, wy2] = hostWall.module_data.end_point_mm
      const wdx = wx2 - wx1
      const wdy = wy2 - wy1
      const wlen = Math.hypot(wdx, wdy)
      if (wlen > 1) {
        const ux = wdx / wlen
        const uy = wdy / wlen
        const nx = -uy
        const ny = ux
        const offset = ghost.offset_along_wall_mm ?? (wlen / 2)
        const cx = wx1 + offset * ux
        const cy = wy1 + offset * uy
        const width_mm = ghost.size_mm?.[0] || 800
        const half_w = width_mm / 2
        const j1_mm: [number, number] = [cx - half_w * ux, cy - half_w * uy]
        const j2_mm: [number, number] = [cx + half_w * ux, cy + half_w * uy]
        const [sj1x, sj1y] = worldToScreen(j1_mm, viewport)
        const [sj2x, sj2y] = worldToScreen(j2_mm, viewport)
        const [scx, scy] = worldToScreen([cx, cy], viewport)

        const thick_px = hostWall.module_data.thickness_mm * viewport.zoom
        ctx.strokeStyle = '#4ade80'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(sj1x + nx * (thick_px / 2), sj1y + ny * (thick_px / 2))
        ctx.lineTo(sj1x - nx * (thick_px / 2), sj1y - ny * (thick_px / 2))
        ctx.moveTo(sj2x + nx * (thick_px / 2), sj2y + ny * (thick_px / 2))
        ctx.lineTo(sj2x - nx * (thick_px / 2), sj2y - ny * (thick_px / 2))
        ctx.stroke()

        const operation = ghost.operation || 'hinged'
        const panels = Math.max(1, Math.min(8, ghost.panel_count || 1))
        ctx.strokeStyle = '#4ade80'
        ctx.lineWidth = 2
        if (operation === 'fixed') {
          ctx.beginPath()
          ctx.moveTo(sj1x, sj1y); ctx.lineTo(sj2x, sj2y)
          ctx.moveTo(sj1x + nx * thick_px * 0.3, sj1y + ny * thick_px * 0.3)
          ctx.lineTo(sj2x + nx * thick_px * 0.3, sj2y + ny * thick_px * 0.3)
          ctx.moveTo(sj1x, sj1y); ctx.lineTo(sj2x + nx * thick_px * 0.3, sj2y + ny * thick_px * 0.3)
          ctx.stroke()
        } else if (operation === 'sliding') {
          ctx.beginPath()
          ctx.moveTo(sj1x, sj1y); ctx.lineTo(sj2x, sj2y)
          for (let i = 1; i < panels; i++) {
            const t = i / panels
            const px = sj1x + (sj2x - sj1x) * t, py = sj1y + (sj2y - sj1y) * t
            ctx.moveTo(px + nx * thick_px * 0.28, py + ny * thick_px * 0.28)
            ctx.lineTo(px - nx * thick_px * 0.28, py - ny * thick_px * 0.28)
          }
          ctx.stroke()
          ctx.strokeStyle = 'rgba(74, 222, 128, 0.55)'
          ctx.beginPath()
          ctx.moveTo(sj1x + nx * thick_px * 0.24, sj1y + ny * thick_px * 0.24)
          ctx.lineTo(sj2x + nx * thick_px * 0.24, sj2y + ny * thick_px * 0.24)
          ctx.stroke()
        } else if (operation === 'louver') {
          ctx.beginPath()
          ctx.moveTo(sj1x, sj1y); ctx.lineTo(sj2x, sj2y)
          for (let i = 1; i <= 4; i++) {
            const t = i / 5
            const px = sj1x + (sj2x - sj1x) * t, py = sj1y + (sj2y - sj1y) * t
            ctx.moveTo(px + nx * thick_px * 0.35, py + ny * thick_px * 0.35)
            ctx.lineTo(px - nx * thick_px * 0.35, py - ny * thick_px * 0.35)
          }
          ctx.stroke()
        } else {
          const isLeft = (ghost.handing || 'left_in').startsWith('left')
          const isOut = (ghost.handing || 'left_in').endsWith('out')
          const hinge_s = isLeft ? [sj1x, sj1y] : [sj2x, sj2y]
          const latch_s = isLeft ? [sj2x, sj2y] : [sj1x, sj1y]
          const normalSign = isOut ? -1 : 1
          const doorLeafLenPx = width_mm * viewport.zoom
          const leafEndX = hinge_s[0] + normalSign * nx * doorLeafLenPx
          const leafEndY = hinge_s[1] + normalSign * ny * doorLeafLenPx
          ctx.beginPath(); ctx.moveTo(hinge_s[0], hinge_s[1]); ctx.lineTo(leafEndX, leafEndY); ctx.stroke()
          const angleClosed = Math.atan2(latch_s[1] - hinge_s[1], latch_s[0] - hinge_s[0])
          const angleOpen = Math.atan2(leafEndY - hinge_s[1], leafEndX - hinge_s[0])
          const counterClockwise = (angleOpen - angleClosed + 2 * Math.PI) % (2 * Math.PI) > Math.PI
          ctx.beginPath(); ctx.strokeStyle = 'rgba(74, 222, 128, 0.7)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3])
          ctx.arc(hinge_s[0], hinge_s[1], doorLeafLenPx, angleClosed, angleOpen, counterClockwise)
          ctx.stroke(); ctx.setLineDash([])
        }

        const handingLabel = operation === 'hinged' ? ` · ${(ghost.handing || 'left_in').replace('_', ' ').toUpperCase()} · Space: Flip` : ''
        const operationLabel = operation === 'sliding' ? 'บานเลื่อน' : operation === 'louver' ? 'บานเกล็ด' : operation === 'fixed' ? 'ช่องแสง' : 'บานเปิด'
        const panelLabel = panels > 1 ? ` · ${panels} บาน` : ''
        const badgeText = `${ghost.mark || 'D1'} ${operationLabel}${panelLabel} (${(width_mm / 1000).toFixed(2)} m)${handingLabel}`
        ctx.font = 'bold 10px monospace'
        const bw = ctx.measureText(badgeText).width
        ctx.fillStyle = '#0f172a'
        ctx.fillRect(scx - bw / 2 - 4, scy - 8, bw + 8, 16)
        ctx.strokeStyle = '#22c55e'
        ctx.strokeRect(scx - bw / 2 - 4, scy - 8, bw + 8, 16)
        ctx.fillStyle = '#4ade80'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(badgeText, scx, scy)

        ctx.restore()
        return
      }
    }
  }

  if (ghost.type === 'window' && ghost.wall_id && project) {
    const hostWall = project.objects[ghost.wall_id]
    if (hostWall && isWallObject(hostWall)) {
      const [wx1, wy1] = hostWall.module_data.start_point_mm
      const [wx2, wy2] = hostWall.module_data.end_point_mm
      const wdx = wx2 - wx1
      const wdy = wy2 - wy1
      const wlen = Math.hypot(wdx, wdy)
      if (wlen > 1) {
        const ux = wdx / wlen
        const uy = wdy / wlen
        const nx = -uy
        const ny = ux
        const offset = ghost.offset_along_wall_mm ?? (wlen / 2)
        const cx = wx1 + offset * ux
        const cy = wy1 + offset * uy
        const width_mm = ghost.size_mm?.[0] || 1200
        const half_w = width_mm / 2
        const [scx, scy] = worldToScreen([cx, cy], viewport)

        const p1_mm: [number, number] = [cx - half_w * ux, cy - half_w * uy]
        const p2_mm: [number, number] = [cx + half_w * ux, cy + half_w * uy]
        const [sp1x, sp1y] = worldToScreen(p1_mm, viewport)
        const [sp2x, sp2y] = worldToScreen(p2_mm, viewport)
        const thick_px = hostWall.module_data.thickness_mm * viewport.zoom

        const operation = ghost.operation || 'sliding'
        const panels = Math.max(1, Math.min(8, ghost.panel_count || 2))
        ctx.strokeStyle = '#38bdf8'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(sp1x + nx * (thick_px / 2), sp1y + ny * (thick_px / 2))
        ctx.lineTo(sp1x - nx * (thick_px / 2), sp1y - ny * (thick_px / 2))
        ctx.moveTo(sp2x + nx * (thick_px / 2), sp2y + ny * (thick_px / 2))
        ctx.lineTo(sp2x - nx * (thick_px / 2), sp2y - ny * (thick_px / 2))
        ctx.moveTo(sp1x, sp1y)
        ctx.lineTo(sp2x, sp2y)
        for (let i = 1; i < panels; i++) {
          const t = i / panels
          const px = sp1x + (sp2x - sp1x) * t, py = sp1y + (sp2y - sp1y) * t
          ctx.moveTo(px + nx * thick_px * 0.32, py + ny * thick_px * 0.32)
          ctx.lineTo(px - nx * thick_px * 0.32, py - ny * thick_px * 0.32)
        }
        ctx.stroke()
        if (ghost.glazing_material && ghost.glazing_material !== 'none') {
          ctx.fillStyle = ghost.glazing_material === 'frosted_glass' ? 'rgba(186, 230, 253, 0.58)' : 'rgba(125, 211, 252, 0.3)'
          ctx.beginPath(); ctx.moveTo(sp1x, sp1y); ctx.lineTo(sp2x, sp2y); ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)'; ctx.lineWidth = Math.max(4, thick_px * 0.3); ctx.stroke()
          ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2
        }
        if (operation === 'louver') {
          ctx.beginPath()
          for (let i = 1; i <= 3; i++) {
            const t = i / 4
            const px = sp1x + (sp2x - sp1x) * t, py = sp1y + (sp2y - sp1y) * t
            ctx.moveTo(px + nx * thick_px * 0.36, py + ny * thick_px * 0.36)
            ctx.lineTo(px - nx * thick_px * 0.36, py - ny * thick_px * 0.36)
          }
          ctx.stroke()
        }

        const operationLabel = operation === 'sliding' ? 'บานเลื่อน' : operation === 'awning' ? 'บานกระทุ้ง' : operation === 'louver' ? 'บานเกล็ด' : 'ช่องแสง'
        const sillLabel = `${Math.round(ghost.sill_height_mm || 0)} mm`
        const badgeText = `${ghost.mark || 'W1'} ${operationLabel} · ${panels} บาน · ธรณี ${sillLabel} · ${(width_mm / 1000).toFixed(2)} m`
        ctx.font = 'bold 10px monospace'
        const bw = ctx.measureText(badgeText).width
        ctx.fillStyle = '#0f172a'
        ctx.fillRect(scx - bw / 2 - 4, scy - 8, bw + 8, 16)
        ctx.strokeStyle = '#0284c7'
        ctx.strokeRect(scx - bw / 2 - 4, scy - 8, bw + 8, 16)
        ctx.fillStyle = '#38bdf8'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(badgeText, scx, scy)

        ctx.restore()
        return
      }
    }
  }

  const [x, y] = worldToScreen(ghost.location_mm, viewport)

  if (ghost.type === 'stair') {
    const w_mm = ghost.size_mm?.[0] || 1000
    const l_mm = ghost.size_mm?.[1] || 4000
    const w_px = w_mm * viewport.zoom
    const l_px = l_mm * viewport.zoom

    ctx.fillStyle = 'rgba(168, 85, 247, 0.25)'
    ctx.strokeStyle = '#a855f7'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])
    ctx.fillRect(x, y, w_px, l_px)
    ctx.strokeRect(x, y, w_px, l_px)
    const numSteps = 16
    const stepH = l_px / numSteps
    ctx.setLineDash([])
    for (let i = 1; i < numSteps; i++) {
      ctx.beginPath()
      ctx.moveTo(x, y + i * stepH)
      ctx.lineTo(x + w_px, y + i * stepH)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.moveTo(x + w_px / 2, y + l_px - 8)
    ctx.lineTo(x + w_px / 2, y + 8)
    ctx.lineTo(x + w_px / 2 - 5, y + 16)
    ctx.moveTo(x + w_px / 2, y + 8)
    ctx.lineTo(x + w_px / 2 + 5, y + 16)
    ctx.stroke()

    ctx.fillStyle = '#c084fc'
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${ghost.mark || 'ST1'} UP (17 Risers)`, x + w_px / 2, y + l_px / 2)
    ctx.restore()
    return
  }

  if (ghost.type === 'foundation') {
    const w_mm = ghost.size_mm?.[0] || 800
    const l_mm = ghost.size_mm?.[1] || 800
    const w_px = w_mm * viewport.zoom
    const l_px = l_mm * viewport.zoom

    ctx.fillStyle = 'rgba(245, 158, 11, 0.25)' // Amber
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])

    ctx.fillRect(x - w_px / 2, y - l_px / 2, w_px, l_px)
    ctx.strokeRect(x - w_px / 2, y - l_px / 2, w_px, l_px)

    ctx.fillStyle = '#f59e0b'
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${ghost.mark || 'F1'} (${w_mm}×${l_mm})`, x, y)
  } else {
    const w_mm = ghost.size_mm?.[0] || 200
    const d_mm = ghost.size_mm?.[1] || 200
    const w_px = w_mm * viewport.zoom
    const d_px = d_mm * viewport.zoom

    ctx.fillStyle = 'rgba(56, 189, 248, 0.35)' // Cyan
    ctx.strokeStyle = '#38bdf8'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])

    ctx.fillRect(x - w_px / 2, y - d_px / 2, w_px, d_px)
    ctx.strokeRect(x - w_px / 2, y - d_px / 2, w_px, d_px)

    ctx.fillStyle = '#38bdf8'
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${ghost.mark || 'C1'} (${w_mm}×${d_mm})`, x, y)
  }
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
  } else if (snap.kind === 'parallel' || snap.kind === 'perpendicular') {
    const s = 7
    ctx.strokeStyle = snap.kind === 'parallel' ? '#f97316' : '#a855f7'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, y - s)
    ctx.lineTo(x + s, y)
    ctx.lineTo(x, y + s)
    ctx.lineTo(x - s, y)
    ctx.closePath()
    ctx.stroke()
  } else if (snap.kind.includes('endpoint') || snap.kind.includes('midpoint') || snap.kind === 'intersection') {
    // Node and midpoint marker
    ctx.strokeStyle = snap.kind === 'intersection' ? '#eab308' : '#c084fc'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y, snap.kind.includes('endpoint') ? 6 : 5, 0, Math.PI * 2)
    ctx.stroke()
  } else if (snap.kind === 'column_corner' || snap.kind === 'wall_corner') {
    ctx.strokeStyle = '#22c55e'
    ctx.lineWidth = 2
    ctx.strokeRect(x - 5, y - 5, 10, 10)
  } else if (snap.kind === 'column_face' || snap.kind === 'wall_face' || snap.kind === 'beam_edge' || snap.kind === 'wall_centerline' || snap.kind === 'beam_axis') {
    ctx.strokeStyle = '#06b6d4'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x - 6, y - 6)
    ctx.lineTo(x + 6, y + 6)
    ctx.moveTo(x + 6, y - 6)
    ctx.lineTo(x - 6, y + 6)
    ctx.stroke()
  } else if (snap.kind === 'wall_endpoint') {
    // Cyan triangle for wall endpoint
    const s = 6
    ctx.strokeStyle = '#38bdf8'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, y - s)
    ctx.lineTo(x + s, y + s)
    ctx.lineTo(x - s, y + s)
    ctx.closePath()
    ctx.stroke()
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

function drawCalibrationOverlay(
  ctx: CanvasRenderingContext2D,
  calibration: CalibrationOverlay,
  viewport: ViewportState
) {
  ctx.save()

  const p1 = calibration.point1_mm
  const p2 = calibration.point2_mm || calibration.mouse_mm

  if (p1) {
    const [sx1, sy1] = worldToScreen(p1, viewport)

    // P1 Marker (Bright red crosshair + ring)
    ctx.strokeStyle = '#ef4444'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(sx1, sy1, 9, 0, Math.PI * 2)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(sx1 - 14, sy1)
    ctx.lineTo(sx1 + 14, sy1)
    ctx.moveTo(sx1, sy1 - 14)
    ctx.lineTo(sx1, sy1 + 14)
    ctx.stroke()

    ctx.fillStyle = '#ef4444'
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText('Point 1', sx1 + 12, sy1 - 6)

    if (p2) {
      const [sx2, sy2] = worldToScreen(p2, viewport)

      // Dynamic measurement rubber-band
      ctx.strokeStyle = '#f59e0b' // Amber
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      ctx.moveTo(sx1, sy1)
      ctx.lineTo(sx2, sy2)
      ctx.stroke()
      ctx.setLineDash([])

      // P2 Marker
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(sx2, sy2, 9, 0, Math.PI * 2)
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(sx2 - 14, sy2)
      ctx.lineTo(sx2 + 14, sy2)
      ctx.moveTo(sx2, sy2 - 14)
      ctx.lineTo(sx2, sy2 + 14)
      ctx.stroke()

      ctx.fillStyle = '#f59e0b'
      ctx.font = 'bold 11px monospace'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'bottom'
      ctx.fillText('Point 2', sx2 + 12, sy2 - 6)

      // Live measurement badge at midpoint
      const mx = (sx1 + sx2) / 2
      const my = (sy1 + sy2) / 2
      const dist_mm = Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]))
      const badgeText = `📏 วัดเทียบระยะ: ${(dist_mm / 1000).toFixed(3)} m (${dist_mm} mm)`

      ctx.font = 'bold 12px monospace'
      const bw = ctx.measureText(badgeText).width
      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)'
      ctx.fillRect(mx - bw / 2 - 8, my - 13, bw + 16, 26)
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 1.5
      ctx.strokeRect(mx - bw / 2 - 8, my - 13, bw + 16, 26)

      ctx.fillStyle = '#fef08a'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(badgeText, mx, my)
    }
  }

  ctx.restore()
}

