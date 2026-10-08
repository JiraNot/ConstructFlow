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
import { beginPlanLabels, queuePlanLabel, flushPlanLabels, planLabelScale } from './planLabels.js'

function openingValue(project: ProjectDocument, object: SmartObject, field: string, fallback: unknown) {
  const data = object.module_data as Record<string, unknown>
  const overrides = data.instance_overrides as Record<string, unknown> | undefined
  const typeId = typeof data.type_id === 'string' ? data.type_id : undefined
  const type = project.types.find(candidate => candidate.id === typeId)
    ?? project.types.find(candidate => candidate.object_type === object.object_type && candidate.name.toLowerCase() === String(data.mark ?? '').toLowerCase())
  return overrides?.[field] ?? data[field] ?? type?.parameters[field] ?? fallback
}

export interface UnderlayConfig {
  image: HTMLImageElement | null
  origin_mm: [number, number]
  scale_mm_per_px: number
  opacity: number
  visible: boolean
  rotation_deg?: number
}

export interface CalibrationOverlay {
  point1_mm: [number, number] | null
  point2_mm: [number, number] | null
  mouse_mm?: [number, number] | null
}

export interface PlanLabelVisibility {
  structure: boolean
  walls: boolean
  openings: boolean
  grids: boolean
}

export const DEFAULT_PLAN_LABEL_VISIBILITY: PlanLabelVisibility = {
  structure: true,
  walls: true,
  openings: true,
  grids: true,
}

export function renderPlanView(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  project: ProjectDocument,
  viewport: ViewportState,
  selectedId: string | null | readonly string[],
  hoveredId: string | null,
  activeSnap: SnapResult | null,
  ghostObject: PlacementGhost | null,
  underlay?: UnderlayConfig | null,
  calibration?: CalibrationOverlay | null,
  sourceProject: ProjectDocument = project,
  labelMode: 'name' | 'name-size' = 'name-size',
  labelVisibility: PlanLabelVisibility = DEFAULT_PLAN_LABEL_VISIBILITY
) {
  const isSelected = (id: string) => Array.isArray(selectedId) ? selectedId.includes(id) : selectedId === id
  beginPlanLabels(ctx, viewport.zoom)
  // 1. Bright drafting canvas background
  ctx.fillStyle = '#fbfdff'
  ctx.fillRect(0, 0, width, height)

  // 2. Background CAD unit grid (1000mm major)
  drawBackgroundCadGrid(ctx, width, height, viewport)

  // 2.5 Underlay Image (Floor plan underlay / DWG with scale & opacity)
  if (underlay && underlay.visible && underlay.image) {
    drawUnderlayImage(ctx, underlay, viewport)
  }

  // Architectural finishes and room tags are separate semantic objects from structural slabs.
  for (const obj of Object.values(project.objects)) {
    const data = obj.module_data as Record<string, unknown>
    if (obj.object_type === 'architecture.room_separator') {
      const a=data.start_point_mm as [number,number],b=data.end_point_mm as [number,number]
      if(a?.length===2&&b?.length===2){const [ax,ay]=worldToScreen(a,viewport),[bx,by]=worldToScreen(b,viewport);ctx.save();ctx.strokeStyle=isSelected(obj.id)?'#087cf0':'#f59e0b';ctx.lineWidth=isSelected(obj.id)?2:1.4;ctx.setLineDash([5,3]);ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();ctx.restore()}
      continue
    }
    if (obj.object_type === 'architecture.floor' || obj.object_type === 'architecture.room') {
      const ring = data.boundary_mm as [number, number][] | undefined
      if (!ring || ring.length < 3) continue
      ctx.save(); ctx.beginPath()
      ring.forEach((point,index)=>{const [x,y]=worldToScreen(point,viewport);if(index===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)})
      ctx.closePath()
      if(obj.object_type==='architecture.floor'){
        ctx.fillStyle=isSelected(obj.id)?'rgba(5,150,105,.22)':'rgba(16,185,129,.10)';ctx.strokeStyle=isSelected(obj.id)?'#059669':'rgba(5,150,105,.55)';ctx.lineWidth=1
        for(const raw of (Array.isArray(data.voids_mm)?data.voids_mm:[]) as [number,number][][]){ctx.moveTo(...worldToScreen(raw[0],viewport));raw.slice(1).forEach(p=>ctx.lineTo(...worldToScreen(p,viewport)));ctx.closePath()}
        ctx.fill('evenodd');ctx.stroke()
      }else{
        ctx.fillStyle='rgba(148,163,184,.04)';ctx.fill();ctx.strokeStyle='#94a3b8';ctx.lineWidth=.8;ctx.setLineDash([4,3]);ctx.stroke();ctx.setLineDash([])
        const center:[number,number]=[ring.reduce((s,p)=>s+p[0],0)/ring.length,ring.reduce((s,p)=>s+p[1],0)/ring.length]
        const [x,y]=worldToScreen(center,viewport);ctx.font='11px sans-serif';ctx.textAlign='center';ctx.fillStyle='#334155';ctx.fillText(`${String(data.number??'')} ${String(data.name??'Room')} · ${(Number(data.area_mm2??0)/1e6).toFixed(2)} m²`,x,y)
      }
      ctx.restore()
    }
  }

  // 3. Structural Grid Lines & Bubbles
  for (const out of constructionOutputs(sourceProject).filter(out=>!!project.objects[out.object_id])) {
    const phase=out.removed_phase==='demolition'?'demolition':out.phase
    ctx.save();ctx.strokeStyle=isSelected(out.object_id)?'#fbbf24':phase==='demolition'?'#ef4444':phase==='existing'?'#94a3b8':'#38bdf8'
    ctx.lineWidth=phase==='new_construction'?2:1;ctx.setLineDash(phase==='demolition'?[6,3]:[])
    const lines=[...out.paths,...out.meshes.map(t=>[...t,t[0]])]
    const seen=new Set<string>()
    for(const points of lines){const key=points.map(v=>v.slice(0,2).join(',')).join('|');if(seen.has(key))continue;seen.add(key);ctx.beginPath();points.forEach((p,i)=>{const [x,y]=worldToScreen([p[0],p[1]],viewport);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y)});ctx.stroke()}
    const anchor=lines[0]?.[0];if(anchor && labelVisibility.structure){const [x,y]=worldToScreen([anchor[0],anchor[1]],viewport);ctx.font='11px sans-serif';const family=project.objects[out.object_id]?.object_type ?? '';const shape=family.endsWith('.ceiling')?'ellipse':'rect';queuePlanLabel(ctx,x+4,y-12,out.mark,String(ctx.strokeStyle),'#c7d3df',isSelected(out.object_id)?10:0,'#fbfdff',false,shape)}
    ctx.restore()
  }
  const standaloneGrids = Object.values(project.objects).filter(isGridObject).filter(object => !object.module_data.system_id)
  const autoGridTags = new Map<string, string>()
  const toAlphaTag = (index: number) => {
    let value = index + 1, tag = ''
    while (value > 0) { value--; tag = String.fromCharCode(65 + value % 26) + tag; value = Math.floor(value / 26) }
    return tag
  }
  for (const style of ['alpha', 'numeric'] as const) {
    const group = standaloneGrids.filter(object => object.module_data.bubble_visible !== false && object.module_data.auto_tag !== false && (object.module_data.sequence_style === style || (object.module_data.sequence_style !== 'alpha' && object.module_data.sequence_style !== 'numeric' && (object.module_data.orientation === 'vertical' ? 'alpha' : 'numeric') === style)))
      .sort((a, b) => {
        const point = (object: typeof a) => object.module_data.start_point_mm && object.module_data.end_point_mm
          ? [(object.module_data.start_point_mm[0] + object.module_data.end_point_mm[0]) / 2, (object.module_data.start_point_mm[1] + object.module_data.end_point_mm[1]) / 2]
          : object.module_data.orientation === 'vertical' ? [object.module_data.position_mm, (object.module_data.extent_mm[0] + object.module_data.extent_mm[1]) / 2] : [(object.module_data.extent_mm[0] + object.module_data.extent_mm[1]) / 2, object.module_data.position_mm]
        const pa = point(a), pb = point(b)
        return (a.module_data.orientation === 'vertical' ? pa[0] - pb[0] || pa[1] - pb[1] : pa[1] - pb[1] || pa[0] - pb[0]) || a.id.localeCompare(b.id)
      })
    group.forEach((object, index) => autoGridTags.set(object.id, style === 'alpha' ? toAlphaTag(index) : String(index + 1)))
  }
  for (const obj of Object.values(project.objects)) {
    if (isGridObject(obj)) {
      const displayTag = obj.module_data.system_id ? obj.module_data.tag : obj.module_data.auto_tag === false ? obj.module_data.tag : autoGridTags.get(obj.id) ?? obj.module_data.tag
      drawStructuralGrid(ctx, obj, viewport, isSelected(obj.id), hoveredId === obj.id, labelVisibility.grids && obj.module_data.bubble_visible !== false, displayTag)
    }
  }

  // 4. Foundations (rendered underneath beams and columns)
  for (const obj of Object.values(project.objects)) {
    if (isFoundationObject(obj)) {
      drawFoundation(ctx, obj, viewport, isSelected(obj.id), hoveredId === obj.id, labelVisibility.structure)
    }
  }

  // 5. Beams (rendered connecting columns/grids)
  for (const obj of Object.values(project.objects)) {
    if (isBeamObject(obj)) {
      drawBeam(ctx, obj, project, viewport, isSelected(obj.id), hoveredId === obj.id, labelMode, labelVisibility.structure)
    }
  }

  // 6. Walls (rendered with opening cutouts)
  for (const obj of Object.values(project.objects)) {
    if (isWallObject(obj)) {
      drawWall(ctx, obj, project, viewport, isSelected(obj.id), hoveredId === obj.id, labelVisibility.walls)
    }
  }

  // 7. Windows & Doors (infill symbols on walls)
  for (const obj of Object.values(project.objects)) {
    if (isWindowObject(obj)) {
      drawWindow(ctx, obj, project, viewport, isSelected(obj.id), hoveredId === obj.id, labelVisibility.openings)
    } else if (isDoorObject(obj)) {
      drawDoor(ctx, obj, project, viewport, isSelected(obj.id), hoveredId === obj.id, labelVisibility.openings)
    }
  }

  // 8. Columns (rendered with cross hatch and human-readable mark)
  for (const obj of Object.values(project.objects)) {
    if (isColumnObject(obj)) {
      drawColumn(ctx, obj, viewport, isSelected(obj.id), hoveredId === obj.id, labelVisibility.structure)
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
  flushPlanLabels(ctx, width, height)
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
  const rotation = -(underlay.rotation_deg ?? 0) * Math.PI / 180
  ctx.translate(sx, sy)
  ctx.rotate(rotation)
  ctx.drawImage(underlay.image, 0, 0, screenW, screenH)

  // Subtle boundary outline
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)'
  ctx.lineWidth = 1
  ctx.setLineDash([6, 6])
  ctx.strokeRect(0, 0, screenW, screenH)
  ctx.setLineDash([])

  // Header badge
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'
  ctx.fillRect(0, -20, 210, 20)
  ctx.fillStyle = '#38bdf8'
  ctx.font = 'bold 10px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(`📐 Underlay (1px = ${underlay.scale_mm_per_px.toFixed(2)} mm)`, 6, -10)

  ctx.restore()
}

function drawStructuralGrid(
  ctx: CanvasRenderingContext2D,
  obj: ReturnType<typeof isGridObject> extends true ? any : SmartObject<any>,
  viewport: ViewportState,
  isSelected: boolean,
  isHovered: boolean,
  showLabel: boolean,
  displayTag = obj.module_data.tag
) {
  const { tag, orientation, position_mm, extent_mm } = obj.module_data
  const extent = extent_mm || [-10000, 15000]

  ctx.save()
  ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2 : 1.2
  ctx.strokeStyle = isSelected ? '#38bdf8' : isHovered ? '#7dd3fc' : '#64748b'
  ctx.setLineDash([8, 4, 2, 4]) // Long-dash, dot, dash

  let bubbleX = 0
  let bubbleY = 0

  if (obj.module_data.start_point_mm && obj.module_data.end_point_mm) {
    const [x1, y1] = worldToScreen(obj.module_data.start_point_mm, viewport)
    const [x2, y2] = worldToScreen(obj.module_data.end_point_mm, viewport)
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    bubbleX = x1
    bubbleY = y1
  } else if (orientation === 'vertical') {
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

  if (!showLabel) { ctx.restore(); return }
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
  ctx.fillText(displayTag, bubbleX, bubbleY)

  ctx.restore()
}

function drawFoundation(
  ctx: CanvasRenderingContext2D,
  obj: ReturnType<typeof isFoundationObject> extends true ? any : SmartObject<any>,
  viewport: ViewportState,
  isSelected: boolean,
  isHovered: boolean,
  showLabel: boolean
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
  const text = mark || 'F1'
  // Tuck footing marks into the lower-left edge of the footing outline. This
  // keeps them beside their own footing instead of colliding with the column
  // mark directly above and being moved into a distant screen-space lane.
  if (showLabel) queuePlanLabel(ctx, minX + 8, maxY - 8, text, '#64748b', '#c7d3df', isSelected ? 10 : 3)

  ctx.restore()
}

function drawColumn(
  ctx: CanvasRenderingContext2D,
  obj: ReturnType<typeof isColumnObject> extends true ? any : SmartObject<any>,
  viewport: ViewportState,
  isSelected: boolean,
  isHovered: boolean,
  showLabel: boolean
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
  const name = mark || 'วัตถุ'
  if (showLabel) queuePlanLabel(ctx, (minX + maxX) / 2, minY - 12, name, '#33465b', '#c7d3df', isSelected ? 10 : 2)

  ctx.restore()
}

function drawBeam(
  ctx: CanvasRenderingContext2D,
  obj: ReturnType<typeof isBeamObject> extends true ? any : SmartObject<any>,
  project: ProjectDocument,
  viewport: ViewportState,
  isSelected: boolean,
  isHovered: boolean,
  labelMode: 'name' | 'name-size',
  showLabel: boolean
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

  // 4. Place the beam tag in the longest clear run, away from hosted doors
  // and windows. The opening cutout is drawn over the beam, so a midpoint tag
  // would otherwise sit directly on top of its frame and glazing lines.
  const label = mark || 'B1'
  const size = `${w_mm}×${d_mm}`
  const text = labelMode === 'name-size' ? `${label} ${size}` : label
  ctx.font = 'bold 10px monospace'
  const labelHalfWidthMm = (ctx.measureText(text).width / viewport.zoom) / 2 + 100
  const worldLength = Math.hypot(end_point_mm[0] - start_point_mm[0], end_point_mm[1] - start_point_mm[1])
  const uxWorld = (end_point_mm[0] - start_point_mm[0]) / worldLength
  const uyWorld = (end_point_mm[1] - start_point_mm[1]) / worldLength
  const blocked: Array<[number, number]> = []
  for (const opening of Object.values(project.objects)) {
    if (!isDoorObject(opening) && !isWindowObject(opening)) continue
    const openingData = opening.module_data as DoorModuleData | WindowModuleData
    const host = project.objects[openingData.wall_id]
    if (!host || !isWallObject(host)) continue
    const [hx, hy] = host.module_data.start_point_mm
    const [h2x, h2y] = host.module_data.end_point_mm
    const hostLength = Math.hypot(h2x - hx, h2y - hy)
    if (hostLength < 1) continue
    const centerX = hx + (h2x - hx) / hostLength * openingData.offset_along_wall_mm
    const centerY = hy + (h2y - hy) / hostLength * openingData.offset_along_wall_mm
    const deltaX = centerX - start_point_mm[0]
    const deltaY = centerY - start_point_mm[1]
    const along = deltaX * uxWorld + deltaY * uyWorld
    const lateral = Math.abs(deltaX * uyWorld - deltaY * uxWorld)
    if (lateral > Math.max(w_mm / 2 + 500, 600)) continue
    const halfOpening = Math.max(0, Number(openingData.width_mm) || 0) / 2
    const margin = halfOpening + labelHalfWidthMm
    const from = Math.max(0, along - margin)
    const to = Math.min(worldLength, along + margin)
    if (to > from) blocked.push([from, to])
  }
  blocked.sort((a, b) => a[0] - b[0])
  const clearRuns: Array<[number, number]> = []
  let cursor = 0
  for (const [from, to] of blocked) {
    if (from > cursor) clearRuns.push([cursor, from])
    cursor = Math.max(cursor, to)
  }
  if (cursor < worldLength) clearRuns.push([cursor, worldLength])
  const usableRuns = clearRuns.filter(([from, to]) => to - from >= labelHalfWidthMm * 2)
  const labelRun = usableRuns.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0]
  const labelT = labelRun ? ((labelRun[0] + labelRun[1]) / 2) / worldLength : 0.5
  const mx = sx1 + dx * labelT
  const my = sy1 + dy * labelT
  let angle = Math.atan2(dy, dx)
  if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
    angle += Math.PI
  }

  ctx.translate(mx, my)
  ctx.rotate(angle)

  // Label badge
  if (showLabel) queuePlanLabel(ctx, 0, -18, text, isSelected ? '#0876d1' : '#33465b', isSelected ? '#1682e8' : '#c7d3df', isSelected ? 10 : isHovered ? 8 : 1, '#fbfdff', true)

  ctx.restore()
}

function drawWall(
  ctx: CanvasRenderingContext2D,
  wall: SmartObject<WallModuleData>,
  project: ProjectDocument,
  viewport: ViewportState,
  isSelected: boolean,
  isHovered: boolean,
  showLabel: boolean
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
      const insideSign = wall.module_data.interior_side === 'right' ? -1 : 1
      const insideFace = insideSign * (half_thick - plasterInside)
      const outsideFace = -insideSign * (half_thick - plasterOutside)
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

  // W1/W2 identify the finish build-up on each face of the same shared wall
  // core, so render each face's own mark on that side of the wall.
  const wallType = project.types.find(type => type.id === wall.module_data.type_id)
    ?? project.types.find(type => type.object_type === 'architecture.wall' && type.name.toLowerCase() === mark.toLowerCase())
  const wallValue = (field: string, fallback: unknown) => wall.module_data.instance_overrides?.[field]
    ?? wall.module_data[field as keyof WallModuleData]
    ?? wallType?.parameters[field]
    ?? fallback
  const interiorSign = wallValue('interior_side', 'left') === 'right' ? -1 : 1
  const rawAngle = Math.atan2(sy2 - sy1, sx2 - sx1)
  let labelAngle = rawAngle
  if (labelAngle > Math.PI / 2 || labelAngle < -Math.PI / 2) labelAngle += Math.PI
  const orientationSign = Math.cos(labelAngle - rawAngle) < 0 ? -1 : 1
  const insideLocalSign = interiorSign * orientationSign
  const halfThicknessPx = thickness_mm * viewport.zoom / 2
  const triangleHalfHeight = 17 * planLabelScale(viewport.zoom)
  const wallMark = mark || 'W1'
  const insideMark = String(wallValue('inside_finish_mark', wallMark) || wallMark)
  const outsideMark = String(wallValue('outside_finish_mark', wallMark) || wallMark)
  const priority = isSelected ? 10 : isHovered ? 8 : 2
  ctx.font = 'bold 10px monospace'
  const tagWidthPx = Math.max(30, ctx.measureText(insideMark).width + 10, ctx.measureText(outsideMark).width + 10) * planLabelScale(viewport.zoom)
  // Put the tag in the longest continuous solid run, never over a hosted
  // door/window opening. Hide it when every remaining run is too short.
  const labelSegment = subSegments
    .filter(segment => (segment.e - segment.s) * viewport.zoom >= tagWidthPx + 12)
    .sort((a, b) => (b.e - b.s) - (a.e - a.s))[0]
  if (labelSegment && showLabel) {
    const labelDistance = (labelSegment.s + labelSegment.e) / 2
    const [mx, my] = worldToScreen([x1 + labelDistance * ux, y1 + labelDistance * uy], viewport)
    ctx.save()
    ctx.translate(mx, my)
    ctx.rotate(labelAngle)
    queuePlanLabel(ctx, 0, insideLocalSign * (halfThicknessPx + triangleHalfHeight), insideMark, isSelected ? '#0876d1' : '#33465b', isSelected ? '#1682e8' : '#94a3b8', priority, '#fbfdff', true, insideLocalSign > 0 ? 'triangle' : 'triangle-down', [0, insideLocalSign * halfThicknessPx])
    queuePlanLabel(ctx, 0, -insideLocalSign * (halfThicknessPx + triangleHalfHeight), outsideMark, isSelected ? '#0876d1' : '#33465b', isSelected ? '#1682e8' : '#94a3b8', priority, '#fbfdff', true, insideLocalSign < 0 ? 'triangle' : 'triangle-down', [0, -insideLocalSign * halfThicknessPx])
    ctx.restore()
  }
}

function drawDoor(
  ctx: CanvasRenderingContext2D,
  door: SmartObject<DoorModuleData>,
  project: ProjectDocument,
  viewport: ViewportState,
  isSelected: boolean,
  isHovered: boolean,
  showLabel: boolean
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

  ctx.strokeStyle = isSelected ? '#1682e8' : isHovered ? '#0284c7' : '#334155'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(sj1x + snx * (thick_px / 2), sj1y + sny * (thick_px / 2))
  ctx.lineTo(sj1x - snx * (thick_px / 2), sj1y - sny * (thick_px / 2))
  ctx.moveTo(sj2x + snx * (thick_px / 2), sj2y + sny * (thick_px / 2))
  ctx.lineTo(sj2x - snx * (thick_px / 2), sj2y - sny * (thick_px / 2))
  ctx.stroke()

  // Thin, open jamb profiles sit entirely within the wall thickness. Keep the
  // frame unfilled; the wall cutout already supplies the white background.
  const openingPx = width_mm * viewport.zoom
  const frameFaceWidthMm = Math.max(1, Number(openingValue(project, door, 'frame_face_width_mm', 50)) || 50)
  const leafThicknessMm = Math.max(1, Number(openingValue(project, door, 'door_leaf_thickness_mm', 50)) || 50)
  const jambFaceWidthPx = Math.max(1, Math.min(frameFaceWidthMm * viewport.zoom, openingPx * 0.25))
  ctx.strokeStyle = isSelected ? '#1682e8' : isHovered ? '#0284c7' : '#475569'
  ctx.lineWidth = 1
  for (const [jx, jy, direction] of [[sj1x, sj1y, 1], [sj2x, sj2y, -1]] as const) {
    const halfWall = thick_px / 2
    ctx.beginPath()
    ctx.moveTo(jx + nx * halfWall, jy + ny * halfWall)
    ctx.lineTo(jx + ux * jambFaceWidthPx * direction + nx * halfWall, jy + uy * jambFaceWidthPx * direction + ny * halfWall)
    ctx.lineTo(jx + ux * jambFaceWidthPx * direction - nx * halfWall, jy + uy * jambFaceWidthPx * direction - ny * halfWall)
    ctx.lineTo(jx - nx * halfWall, jy - ny * halfWall)
    ctx.closePath()
    ctx.stroke()
  }

  // Double frame profiles along both wall faces.
  const framePx = Math.max(1.5, Math.min(5, 6 * viewport.zoom))
  const frameInset = Math.max(0, thick_px / 2 - framePx)
  ctx.strokeStyle = isSelected ? '#1682e8' : '#475569'
  ctx.lineWidth = framePx
  ctx.beginPath()
  for (const side of [-1, 1]) {
    const offset = side * frameInset
    ctx.moveTo(sj1x + snx * offset, sj1y + sny * offset)
    ctx.lineTo(sj2x + snx * offset, sj2y + sny * offset)
  }
  ctx.stroke()

  // 2. Door leaf and swing arc
  const isDemolition = door.created_phase === 'demolition' || door.removed_phase === 'demolition'
  const isExisting = door.created_phase === 'existing'

  const operation = String(openingValue(project, door, 'opening_operation', 'hinged'))
  const panelCount = Math.max(1, Math.min(8, Number(openingValue(project, door, 'panel_count', 1)) || 1))
  const panelLayout = openingValue(project, door, 'panel_layout', Array.from({ length: panelCount }, () => operation)) as string[]
  const rawRatios = openingValue(project, door, 'panel_width_ratios', []) as number[]
  const ratios = Array.from({ length: panelCount }, (_, index) => Math.max(0.05, Number(rawRatios[index] ?? 1 / panelCount)))
  const ratioTotal = ratios.reduce((sum, value) => sum + value, 0)
  const normalizedRatios = ratios.map(value => value / ratioTotal)
  const panelAt = (index: number) => normalizedRatios.slice(0, index).reduce((sum, value) => sum + value, 0)
  const scale = Math.max(0.85, Math.min(1.65, viewport.zoom / 0.065))
  const leafColor = isSelected ? '#1682e8' : isHovered ? '#0284c7' : isDemolition ? '#ef4444' : isExisting ? '#64748b' : '#0f172a'
  const drawArrow = (x: number, y: number, dir: number, color: string) => {
    const size = 7 * scale
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 1.1
    ctx.moveTo(x - ux * size * dir, y - uy * size * dir)
    ctx.lineTo(x + ux * size * dir, y + uy * size * dir)
    ctx.moveTo(x + ux * size * dir, y + uy * size * dir)
    ctx.lineTo(x + ux * size * dir - ux * size * 0.55 + nx * size * 0.45, y + uy * size * dir - uy * size * 0.55 + ny * size * 0.45)
    ctx.moveTo(x + ux * size * dir, y + uy * size * dir)
    ctx.lineTo(x + ux * size * dir - ux * size * 0.55 - nx * size * 0.45, y + uy * size * dir - uy * size * 0.55 - ny * size * 0.45)
    ctx.stroke()
  }
  let doorSwingTagPoint: [number, number] | null = null
  if (panelLayout.every(value => value === 'bifold')) {
    const foldDepth = Math.max(8, Math.min(15, openingPx * 0.1))
    ctx.strokeStyle = leafColor
    ctx.lineWidth = isSelected ? 2 : 1.5
    ctx.beginPath()
    ctx.moveTo(sj1x, sj1y)
    for (let i = 1; i < panelCount; i++) {
      const t = panelAt(i)
      const px = sj1x + (sj2x - sj1x) * t
      const py = sj1y + (sj2y - sj1y) * t
      const foldSide = i % 2 === 1 ? 1 : -1
      ctx.lineTo(px + nx * foldDepth * foldSide, py + ny * foldDepth * foldSide)
    }
    ctx.lineTo(sj2x, sj2y)
    ctx.stroke()
    for (let i = 1; i < panelCount; i++) {
      const t = panelAt(i)
      const px = sj1x + (sj2x - sj1x) * t
      const py = sj1y + (sj2y - sj1y) * t
      ctx.beginPath(); ctx.arc(px, py, 2.1, 0, Math.PI * 2); ctx.fillStyle = leafColor; ctx.fill()
    }
  } else if (panelLayout.some(value => ['sliding', 'pocket', 'surface_sliding'].includes(value))) {
    const slidingMode = panelLayout.find(value => ['pocket', 'surface_sliding'].includes(value))
    const trackOffset = Math.max(2, Math.min(thick_px * 0.22, 8))
    ctx.strokeStyle = isSelected ? '#38bdf8' : '#475569'
    ctx.lineWidth = 1.35
    if (slidingMode === 'surface_sliding') {
      const surfaceOffset = thick_px / 2 + 4
      ctx.setLineDash([4, 2])
      ctx.beginPath()
      ctx.moveTo(sj1x + snx * surfaceOffset, sj1y + sny * surfaceOffset)
      ctx.lineTo(sj2x + snx * surfaceOffset, sj2y + sny * surfaceOffset)
      ctx.stroke(); ctx.setLineDash([])
      ctx.beginPath()
      ctx.moveTo(sj1x + snx * surfaceOffset, sj1y + sny * surfaceOffset)
      ctx.lineTo(sj2x + snx * surfaceOffset, sj2y + sny * surfaceOffset)
      ctx.moveTo(sj1x + snx * (surfaceOffset + 3), sj1y + sny * (surfaceOffset + 3))
      ctx.lineTo(sj2x + snx * (surfaceOffset + 3), sj2y + sny * (surfaceOffset + 3))
      ctx.stroke()
    } else if (slidingMode === 'pocket') {
      const pocketStartX = handing.startsWith('left') ? sj1x - ux * openingPx : sj2x + ux * openingPx
      const pocketStartY = handing.startsWith('left') ? sj1y - uy * openingPx : sj2y + uy * openingPx
      const pocketEndX = handing.startsWith('left') ? sj1x : sj2x
      const pocketEndY = handing.startsWith('left') ? sj1y : sj2y
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.moveTo(pocketStartX + nx * trackOffset, pocketStartY + ny * trackOffset)
      ctx.lineTo(pocketEndX + nx * trackOffset, pocketEndY + ny * trackOffset)
      ctx.moveTo(pocketStartX - nx * trackOffset, pocketStartY - ny * trackOffset)
      ctx.lineTo(pocketEndX - nx * trackOffset, pocketEndY - ny * trackOffset)
      ctx.stroke(); ctx.setLineDash([])
      // Panel is shown retracted into its wall pocket, with a solid leaf edge
      // and a small motion arrow through the clear opening.
      ctx.strokeStyle = leafColor
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(pocketStartX + nx * trackOffset, pocketStartY + ny * trackOffset)
      ctx.lineTo(pocketStartX - nx * trackOffset, pocketStartY - ny * trackOffset)
      ctx.moveTo(pocketStartX, pocketStartY)
      ctx.lineTo(pocketEndX, pocketEndY)
      ctx.stroke()
      drawArrow((sj1x + sj2x) / 2, (sj1y + sj2y) / 2, handing.startsWith('left') ? -1 : 1, leafColor)
    } else if (slidingMode === 'surface_sliding') {
      const surfaceOffset = thick_px / 2 + 4
      ctx.strokeStyle = leafColor
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(sj1x + nx * surfaceOffset, sj1y + ny * surfaceOffset)
      ctx.lineTo(sj2x + nx * surfaceOffset, sj2y + ny * surfaceOffset)
      ctx.moveTo(sj1x + nx * (surfaceOffset + 3), sj1y + ny * (surfaceOffset + 3))
      ctx.lineTo(sj2x + nx * (surfaceOffset + 3), sj2y + ny * (surfaceOffset + 3))
      ctx.moveTo(sj1x + nx * surfaceOffset, sj1y + ny * surfaceOffset)
      ctx.lineTo(sj1x + nx * (surfaceOffset + 3), sj1y + ny * (surfaceOffset + 3))
      ctx.moveTo(sj2x + nx * surfaceOffset, sj2y + ny * surfaceOffset)
      ctx.lineTo(sj2x + nx * (surfaceOffset + 3), sj2y + ny * (surfaceOffset + 3))
      ctx.stroke()
      drawArrow((sj1x + sj2x) / 2, (sj1y + sj2y) / 2 + ny * (surfaceOffset + 1.5), 1, leafColor)
    }
    if (!slidingMode) {
      ctx.beginPath()
      ctx.moveTo(sj1x + snx * trackOffset, sj1y + sny * trackOffset)
      ctx.lineTo(sj2x + snx * trackOffset, sj2y + sny * trackOffset)
      ctx.moveTo(sj1x - snx * trackOffset, sj1y - sny * trackOffset)
      ctx.lineTo(sj2x - snx * trackOffset, sj2y - sny * trackOffset)
      for (let i = 1; i < panelCount; i++) {
        const t = panelAt(i)
        const mx = sj1x + (sj2x - sj1x) * t
        const my = sj1y + (sj2y - sj1y) * t
        ctx.moveTo(mx - snx * trackOffset, my - sny * trackOffset)
        ctx.lineTo(mx + snx * trackOffset, my + sny * trackOffset)
      }
      ctx.stroke()
    }
    for (let i = 0; i < panelCount; i++) {
      if (panelLayout[i] !== 'sliding') continue
      const t = panelAt(i) + normalizedRatios[i] / 2
      drawArrow(sj1x + (sj2x - sj1x) * t, sj1y + (sj2y - sj1y) * t, i % 2 === 0 ? 1 : -1, leafColor)
    }
  } else if (panelLayout.every(value => value === 'fixed')) {
    ctx.strokeStyle = leafColor
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let i = 0; i < panelCount; i++) {
      const start = panelAt(i), end = start + normalizedRatios[i]
      const ax = sj1x + (sj2x - sj1x) * start, ay = sj1y + (sj2y - sj1y) * start
      const bx = sj1x + (sj2x - sj1x) * end, by = sj1y + (sj2y - sj1y) * end
      ctx.moveTo(ax, ay); ctx.lineTo(bx, by)
      ctx.moveTo(ax + nx * thick_px * 0.22, ay + ny * thick_px * 0.22); ctx.lineTo(bx - nx * thick_px * 0.22, by - ny * thick_px * 0.22)
    }
    ctx.stroke()
  } else {
    const isLeft = handing.startsWith('left')
    const isOut = handing.endsWith('out')
    const normalSign = isOut ? -1 : 1
    // Door slab is 50 mm thick in plan (25 mm either side of its centreline).
    const leafHalf = Math.max(1, leafThicknessMm / 2 * viewport.zoom)
    for (let i = 0; i < panelCount; i++) {
      const panelOperation = panelLayout[i] ?? operation
      const startT = panelAt(i), endT = startT + normalizedRatios[i]
      const start = [sj1x + (sj2x - sj1x) * startT, sj1y + (sj2y - sj1y) * startT] as const
      const end = [sj1x + (sj2x - sj1x) * endT, sj1y + (sj2y - sj1y) * endT] as const
      const panelWidthPx = Math.hypot(end[0] - start[0], end[1] - start[1])
      if (panelOperation === 'fixed') {
        ctx.strokeStyle = leafColor; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(start[0], start[1]); ctx.lineTo(end[0], end[1]); ctx.moveTo(start[0] + nx * thick_px * .2, start[1] + ny * thick_px * .2); ctx.lineTo(end[0] - nx * thick_px * .2, end[1] - ny * thick_px * .2); ctx.stroke()
        continue
      }
      if (panelOperation === 'sliding') continue
      const hingeAtStart = panelCount === 1 ? isLeft : i === 0 || (i !== panelCount - 1 && i % 2 === 1)
      // The panel endpoints include the frame faces. Keep the moving leaf
      // inside those faces so its 50 mm thickness cannot project past a jamb.
      const ux = (end[0] - start[0]) / Math.max(panelWidthPx, 1)
      const uy = (end[1] - start[1]) / Math.max(panelWidthPx, 1)
      const atOpeningStart = startT < 1e-6
      const atOpeningEnd = endT > 1 - 1e-6
      const endClearance = (isStart: boolean) => Math.min(
        (isStart ? jambFaceWidthPx : 2 * scale) + leafHalf + 1,
        panelWidthPx * 0.22
      )
      const startClearance = endClearance(atOpeningStart)
      const finishClearance = endClearance(atOpeningEnd)
      const innerStart = [start[0] + ux * startClearance, start[1] + uy * startClearance] as const
      const innerEnd = [end[0] - ux * finishClearance, end[1] - uy * finishClearance] as const
      const hinge = hingeAtStart ? innerStart : innerEnd
      const latch = hingeAtStart
        ? atOpeningEnd
          ? [end[0] - ux * jambFaceWidthPx, end[1] - uy * jambFaceWidthPx] as const
          : innerEnd
        : atOpeningStart
          ? [start[0] + ux * jambFaceWidthPx, start[1] + uy * jambFaceWidthPx] as const
          : innerStart
      const leafLength = Math.hypot(latch[0] - hinge[0], latch[1] - hinge[1])
      // Keep the open slab tip on the arc while ending the closed-sweep ray at
      // the inside face of the opposite jamb.
      const swingRadius = leafLength
      const hx = hinge[0], hy = hinge[1]
      const closedAngle = Math.atan2(latch[1] - hy, latch[0] - hx)
      const openAngle = closedAngle + normalSign * (hingeAtStart ? Math.PI / 2 : -Math.PI / 2)
      if (!doorSwingTagPoint) {
        // Put the door mark inside the swept quarter-circle, rather than on
        // the wall/opening line. The middle angle and 62% radius stay clear
        // of both the closed opening and the open leaf itself.
        const middleAngle = (closedAngle + openAngle) / 2
        const tagRadius = swingRadius * 0.62
        doorSwingTagPoint = [hx + Math.cos(middleAngle) * tagRadius, hy + Math.sin(middleAngle) * tagRadius]
      }
      const leafEndX = hx + Math.cos(openAngle) * leafLength
      const leafEndY = hy + Math.sin(openAngle) * leafLength
      const leafNx = -Math.sin(openAngle), leafNy = Math.cos(openAngle)
      ctx.beginPath()
      ctx.moveTo(hx + leafNx * leafHalf, hy + leafNy * leafHalf)
      ctx.lineTo(leafEndX + leafNx * leafHalf, leafEndY + leafNy * leafHalf)
      ctx.lineTo(leafEndX - leafNx * leafHalf, leafEndY - leafNy * leafHalf)
      ctx.lineTo(hx - leafNx * leafHalf, hy - leafNy * leafHalf)
      ctx.closePath()
      ctx.fillStyle = isSelected ? 'rgba(56,189,248,0.25)' : '#f8fafc'
      ctx.fill(); ctx.strokeStyle = leafColor; ctx.lineWidth = isSelected ? 2.5 : 1.5
      if (isDemolition) ctx.setLineDash([4, 4])
      ctx.stroke(); ctx.setLineDash([])
      // Draw the leaf's inner edge as a distinct pair of plan lines so the
      // open sash reads as a door panel rather than a single swing ray.
      ctx.beginPath()
      ctx.strokeStyle = isSelected ? '#1682e8' : '#64748b'
      ctx.lineWidth = 0.8
      ctx.moveTo(hx + leafNx * leafHalf * 0.35, hy + leafNy * leafHalf * 0.35)
      ctx.lineTo(leafEndX + leafNx * leafHalf * 0.35, leafEndY + leafNy * leafHalf * 0.35)
      ctx.stroke()
      ctx.beginPath()
      ctx.strokeStyle = isSelected ? '#1682e8' : isDemolition ? '#ef4444' : isExisting ? '#94a3b8' : '#334155'
      ctx.lineWidth = 1.15; ctx.setLineDash([])
      const counterClockwise = (openAngle - closedAngle + 2 * Math.PI) % (2 * Math.PI) > Math.PI
      ctx.arc(hx, hy, swingRadius, closedAngle, openAngle, counterClockwise)
      ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = leafColor
      ctx.beginPath(); ctx.arc(hx, hy, 2, 0, Math.PI * 2); ctx.fill()
      if (panelOperation === 'louver' || String(openingValue(project, door, 'door_leaf_style', '')) === 'louvered') {
        // A louver leaf uses the same jamb, open leaf and quarter swing as an
        // ordinary door. Only the face receives thin, evenly spaced slats.
        ctx.strokeStyle = isSelected ? '#0369a1' : '#475569'
        ctx.lineWidth = 0.85
        ctx.beginPath()
        const slatCount = Math.max(3, Math.min(5, Math.round(leafLength / 34)))
        for (let slat = 0; slat < slatCount; slat++) {
          const offset = ((slat + 0.5) / slatCount - 0.5) * leafHalf * 1.2
          const fromT = 0.14, toT = 0.86
          ctx.moveTo(hx + leafNx * offset + (leafEndX - hx) * fromT, hy + leafNy * offset + (leafEndY - hy) * fromT)
          ctx.lineTo(hx + leafNx * offset + (leafEndX - hx) * toT, hy + leafNy * offset + (leafEndY - hy) * toT)
        }
        ctx.stroke()
      }
    }
  }

  // Badge mark
  const text = mark || 'D1'
  ctx.font = isSelected ? 'bold 10px monospace' : 'bold 9px monospace'
  ctx.save()
  const [tagX, tagY] = doorSwingTagPoint ?? [scx, scy]
  ctx.translate(tagX, tagY)
  if (showLabel) queuePlanLabel(ctx, 0, 0, text, '#15803d', isSelected ? '#1682e8' : '#22c55e', isSelected ? 10 : isHovered ? 8 : 5, '#fbfdff', true, 'circle')
  ctx.restore()

  ctx.restore()
}

function drawWindow(
  ctx: CanvasRenderingContext2D,
  win: SmartObject<WindowModuleData>,
  project: ProjectDocument,
  viewport: ViewportState,
  isSelected: boolean,
  isHovered: boolean,
  showLabel: boolean
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
  const thickPx = hostWall.module_data.thickness_mm * viewport.zoom

  ctx.save()

  // Opening cutout background
  ctx.beginPath()
  ctx.moveTo(sc1x, sc1y)
  ctx.lineTo(sc2x, sc2y)
  ctx.lineTo(sc3x, sc3y)
  ctx.lineTo(sc4x, sc4y)
  ctx.closePath()
  ctx.fillStyle = isSelected ? 'rgba(56, 189, 248, 0.2)' : '#fbfdff'
  ctx.fill()

  // Perimeter frame profile: two nested rectangles around the glazed opening
  // represent the outer frame and the inner glazing stop in plan.
  const frameCorners: [number, number][] = [[sc1x, sc1y], [sc2x, sc2y], [sc3x, sc3y], [sc4x, sc4y]]
  ctx.strokeStyle = isSelected ? '#1682e8' : '#334155'
  ctx.lineWidth = 1.8
  ctx.beginPath()
  frameCorners.forEach(([x, y], index) => {
    const [nextX, nextY] = frameCorners[(index + 1) % frameCorners.length]
    if (index === 0) ctx.moveTo(x, y)
    ctx.lineTo(nextX, nextY)
  })
  ctx.stroke()
  const profileInset = Math.max(1.5, Math.min(3, thickPx * 0.08))
  ctx.strokeStyle = '#64748b'
  ctx.lineWidth = 0.85
  ctx.beginPath()
  frameCorners.forEach(([x, y], index) => {
    const [nextX, nextY] = frameCorners[(index + 1) % frameCorners.length]
    const ix = x + Math.sign(scx - x) * profileInset
    const iy = y + Math.sign(scy - y) * profileInset
    const inx = nextX + Math.sign(scx - nextX) * profileInset
    const iny = nextY + Math.sign(scy - nextY) * profileInset
    if (index === 0) ctx.moveTo(ix, iy)
    ctx.lineTo(inx, iny)
  })
  ctx.stroke()

  // Jambs
  ctx.strokeStyle = isSelected ? '#1682e8' : isHovered ? '#0284c7' : '#475569'
  ctx.lineWidth = 2.25
  ctx.beginPath()
  ctx.moveTo(sc1x, sc1y)
  ctx.lineTo(sc4x, sc4y)
  ctx.moveTo(sc2x, sc2y)
  ctx.lineTo(sc3x, sc3y)
  ctx.stroke()

  // Sill lines
  // A layered surround and sill make the frame profile read separately from
  // the glazing instead of appearing as a simple hole cut in the wall.
  ctx.strokeStyle = isSelected ? '#1682e8' : '#334155'
  ctx.lineWidth = Math.max(2.5, Math.min(4, thickPx * 0.12))
  ctx.beginPath()
  ctx.moveTo(sc1x, sc1y)
  ctx.lineTo(sc2x, sc2y)
  ctx.moveTo(sc4x, sc4y)
  ctx.lineTo(sc3x, sc3y)
  ctx.stroke()
  ctx.strokeStyle = '#f8fafc'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(sc1x + nx * 1.5, sc1y + ny * 1.5)
  ctx.lineTo(sc2x + nx * 1.5, sc2y + ny * 1.5)
  ctx.moveTo(sc4x - nx * 1.5, sc4y - ny * 1.5)
  ctx.lineTo(sc3x - nx * 1.5, sc3y - ny * 1.5)
  ctx.stroke()

  // Double Glass Lines
  const isDemolition = win.created_phase === 'demolition' || win.removed_phase === 'demolition'
  const isExisting = win.created_phase === 'existing'

  // 5 mm double-glazing linework remains thin while scaling with the drawing.
  const glassOffsetPx = Math.max(0.8, 2.5 * viewport.zoom)
  const frameFaceWidthMm = Math.max(1, Number(openingValue(project, win, 'frame_face_width_mm', 50)) || 50)
  const sashFaceWidthMm = Math.max(1, Number(openingValue(project, win, 'sash_face_width_mm', 50)) || 50)
  const snx = nx
  const sny = ny
  const [sp1x, sp1y] = worldToScreen(p1_mm, viewport)
  const [sp2x, sp2y] = worldToScreen(p2_mm, viewport)

  // Double frame profiles along both wall faces.
  const framePx = 1.25
  const frameInset = Math.max(0, thickPx / 2 - framePx)
  ctx.strokeStyle = isSelected ? '#1682e8' : '#475569'
  ctx.lineWidth = framePx
  ctx.beginPath()
  for (const side of [-1, 1]) {
    const offset = side * frameInset
    ctx.moveTo(sp1x + nx * offset, sp1y + ny * offset)
    ctx.lineTo(sp2x + nx * offset, sp2y + ny * offset)
  }
  ctx.stroke()

  // Two inset sash rails on each side of the glazing show the actual sliding
  // frame channels. Keep the rails parallel to the opening, independent of
  // wall thickness, so the detail remains clean at both horizontal and
  // vertical orientations.
  const trackGap = Math.max(2, Math.min((sashFaceWidthMm / 2) * viewport.zoom, thickPx * 0.45))
  ctx.strokeStyle = isSelected ? '#075985' : '#475569'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const side of [-1, 1]) {
    const offset = side * trackGap
    ctx.moveTo(sp1x + nx * offset, sp1y + ny * offset)
    ctx.lineTo(sp2x + nx * offset, sp2y + ny * offset)
  }
  ctx.stroke()

  // Pale glazing field and sash divisions clarify the frame and glass in plan.
  ctx.beginPath()
  ctx.moveTo(sp1x + snx * glassOffsetPx, sp1y + sny * glassOffsetPx)
  ctx.lineTo(sp2x + snx * glassOffsetPx, sp2y + sny * glassOffsetPx)
  ctx.lineTo(sp2x - snx * glassOffsetPx, sp2y - sny * glassOffsetPx)
  ctx.lineTo(sp1x - snx * glassOffsetPx, sp1y - sny * glassOffsetPx)
  ctx.closePath()
  ctx.fillStyle = isSelected ? 'rgba(186,230,253,0.78)' : 'rgba(186,230,253,0.72)'
  ctx.fill()

  const panelCount = Math.max(1, Math.min(8, Number(openingValue(project, win, 'panel_count', 2)) || 2))
  const operation = String(openingValue(project, win, 'opening_operation', 'sliding'))
  const layout = openingValue(project, win, 'panel_layout', Array.from({ length: panelCount }, () => operation)) as string[]
  const rawRatios = openingValue(project, win, 'panel_width_ratios', []) as number[]
  const ratios = Array.from({ length: panelCount }, (_, index) => Math.max(0.05, Number(rawRatios[index] ?? 1 / panelCount)))
  const ratioTotal = ratios.reduce((sum, value) => sum + value, 0)
  const normalizedRatios = ratios.map(value => value / ratioTotal)
  const panelAt = (index: number) => normalizedRatios.slice(0, index).reduce((sum, value) => sum + value, 0)
  const frameStroke = isSelected ? '#0369a1' : '#334155'
  const openingLengthPx = Math.hypot(sp2x - sp1x, sp2y - sp1y)
  // A sliding sash has a shallow 40 mm frame on one of two tracks. It must
  // not fill the entire wall depth; adjacent panels overlap at their meeting
  // stiles, as they do in a real bypass slider.
  ctx.strokeStyle = frameStroke
  ctx.lineWidth = 1.1
  for (let i = 0; i < panelCount; i++) {
    const panelOperation = layout[i] ?? operation
    const nominalStart = panelAt(i)
    const nominalEnd = nominalStart + normalizedRatios[i]
    const isSlidingPanel = panelOperation === 'sliding'
    const overlapPx = isSlidingPanel && panelCount > 1 ? Math.min((sashFaceWidthMm / 2) * viewport.zoom, openingLengthPx * 0.08) : 0
    const overlapT = overlapPx / Math.max(openingLengthPx, 1) / 2
    const startT = Math.max(0, nominalStart - (i > 0 ? overlapT : 0))
    const endT = Math.min(1, nominalEnd + (i < panelCount - 1 ? overlapT : 0))
    const panelWidthPx = openingLengthPx * (endT - startT)
    const outerInset = Math.min(frameFaceWidthMm * viewport.zoom, panelWidthPx * 0.22)
    const longitudinalInsetStart = i === 0 ? outerInset : 0
    const longitudinalInsetEnd = i === panelCount - 1 ? outerInset : 0
    const ax = sp1x + (sp2x - sp1x) * startT + ux * longitudinalInsetStart
    const ay = sp1y + (sp2y - sp1y) * startT + uy * longitudinalInsetStart
    const bx = sp1x + (sp2x - sp1x) * endT - ux * longitudinalInsetEnd
    const by = sp1y + (sp2y - sp1y) * endT - uy * longitudinalInsetEnd
    const trackCenter = isSlidingPanel ? (i % 2 === 0 ? -trackGap : trackGap) : 0
    const sashHalfDepth = isSlidingPanel
      ? Math.max(1.5, Math.min((sashFaceWidthMm / 2) * viewport.zoom, thickPx / 2 - 1.5))
      : Math.max(3, thickPx / 2 - 1.5)
    ctx.beginPath()
    ctx.moveTo(ax + nx * (trackCenter + sashHalfDepth), ay + ny * (trackCenter + sashHalfDepth))
    ctx.lineTo(bx + nx * (trackCenter + sashHalfDepth), by + ny * (trackCenter + sashHalfDepth))
    ctx.lineTo(bx + nx * (trackCenter - sashHalfDepth), by + ny * (trackCenter - sashHalfDepth))
    ctx.lineTo(ax + nx * (trackCenter - sashHalfDepth), ay + ny * (trackCenter - sashHalfDepth))
    ctx.closePath()
    ctx.stroke()
    // One fine glass line within each sash, not a pair of heavy rails through
    // the full opening.
    const beadDepth = Math.max(1, Math.min(glassOffsetPx, sashHalfDepth - 1))
    ctx.beginPath()
    ctx.strokeStyle = '#0ea5a8'
    ctx.lineWidth = 0.8
    ctx.moveTo(ax + nx * (trackCenter + beadDepth), ay + ny * (trackCenter + beadDepth))
    ctx.lineTo(bx + nx * (trackCenter + beadDepth), by + ny * (trackCenter + beadDepth))
    ctx.moveTo(ax + nx * (trackCenter - beadDepth), ay + ny * (trackCenter - beadDepth))
    ctx.lineTo(bx + nx * (trackCenter - beadDepth), by + ny * (trackCenter - beadDepth))
    ctx.stroke()
    ctx.strokeStyle = frameStroke
  }
  // Draw sash stiles, with a slight overlap on sliding pairs, at the catalog
  // panel ratios. The two track offsets make each sash legible as a framed
  // panel instead of leaving only a center mullion.
  if (panelCount > 1) {
    ctx.strokeStyle = frameStroke
    ctx.lineWidth = 1.1
    ctx.beginPath()
    for (let i = 1; i < panelCount; i++) {
      const t = panelAt(i)
      const mx = sp1x + (sp2x - sp1x) * t
      const my = sp1y + (sp2y - sp1y) * t
      if ((layout[i - 1] ?? operation) === 'sliding' || (layout[i] ?? operation) === 'sliding') {
        const stileOffset = Math.min((sashFaceWidthMm / 2) * viewport.zoom, openingLengthPx * 0.05)
        for (const [trackIndex, panelIndex] of [[-1, i - 1], [1, i]] as const) {
          const panelIsSliding = (layout[panelIndex] ?? operation) === 'sliding'
          if (!panelIsSliding) continue
          const trackCenter = (panelIndex % 2 === 0 ? -1 : 1) * trackGap
          const stileX = mx + ux * stileOffset * trackIndex
          const stileY = my + uy * stileOffset * trackIndex
          const halfDepth = Math.max(1.5, Math.min((sashFaceWidthMm / 2) * viewport.zoom, thickPx / 2 - 1.5))
          ctx.moveTo(stileX + nx * (trackCenter - halfDepth), stileY + ny * (trackCenter - halfDepth))
          ctx.lineTo(stileX + nx * (trackCenter + halfDepth), stileY + ny * (trackCenter + halfDepth))
        }
      } else {
        ctx.moveTo(mx - nx * half_thick * viewport.zoom, my - ny * half_thick * viewport.zoom)
        ctx.lineTo(mx + nx * half_thick * viewport.zoom, my + ny * half_thick * viewport.zoom)
      }
    }
    ctx.stroke()
  }
  const symbolScale = Math.max(0.55, Math.min(1.25, viewport.zoom / 0.08))
  for (let i = 0; i < panelCount; i++) {
    const panelOperation = layout[i] ?? operation
    const startT = panelAt(i), endT = startT + normalizedRatios[i]
    const sx = sp1x + (sp2x - sp1x) * startT, sy = sp1y + (sp2y - sp1y) * startT
    const ex = sp1x + (sp2x - sp1x) * endT, ey = sp1y + (sp2y - sp1y) * endT
    const mx = (sx + ex) / 2, my = (sy + ey) / 2
    const panelColor = isDemolition ? '#ef4444' : isExisting ? '#94a3b8' : '#1682a8'
    if (panelOperation === 'sliding') {
      // The plan symbol is the pair of offset tracks and overlapping sash
      // stiles above; directional arrows belong in elevation, not in plan.
    } else if (panelOperation === 'fixed') {
      const size = Math.min(Math.hypot(ex - sx, ey - sy) * .12, 4 * symbolScale)
      ctx.beginPath(); ctx.strokeStyle = '#7f98a7'; ctx.lineWidth = 1
      ctx.moveTo(mx - ux * size - nx * size, my - uy * size - ny * size); ctx.lineTo(mx + ux * size + nx * size, my + uy * size + ny * size)
      ctx.moveTo(mx - ux * size + nx * size, my - uy * size + ny * size); ctx.lineTo(mx + ux * size - nx * size, my + uy * size - ny * size)
      ctx.stroke()
    } else if (panelOperation === 'louver') {
      ctx.beginPath(); ctx.strokeStyle = panelColor; ctx.lineWidth = .8
      for (let slat = 1; slat < 5; slat++) {
        const t = slat / 5, px = sx + (ex - sx) * t, py = sy + (ey - sy) * t
        ctx.moveTo(px - nx * glassOffsetPx * .65, py - ny * glassOffsetPx * .65); ctx.lineTo(px + nx * glassOffsetPx * .65, py + ny * glassOffsetPx * .65)
      }
      ctx.stroke()
    } else {
      // Casement/awning sash symbol: diagonal leaf to the opening face plus a directional cue.
      const hingeStart = i % 2 === 0
      const hx = hingeStart ? sx : ex, hy = hingeStart ? sy : ey
      const leafLength = Math.min(Math.hypot(ex - sx, ey - sy) * .62, glassOffsetPx * 1.6)
      const side = 1
      ctx.beginPath(); ctx.strokeStyle = panelColor; ctx.lineWidth = 1.1; ctx.setLineDash([2, 2])
      ctx.moveTo(hx, hy); ctx.lineTo(hx + nx * leafLength * side + ux * (hingeStart ? leafLength * .35 : -leafLength * .35), hy + ny * leafLength * side + uy * (hingeStart ? leafLength * .35 : -leafLength * .35))
      ctx.stroke(); ctx.setLineDash([])
      ctx.beginPath(); ctx.arc(hx, hy, 1.5 * symbolScale, 0, Math.PI * 2); ctx.fillStyle = panelColor; ctx.fill()
    }
  }

  if (panelCount === 2 && layout.some(panel => panel === 'sliding')) {
    // Two-panel window plan symbol follows each panel's operation: two stepped
    // tracks when both slide, or one fixed lite plus one sliding sash.
    ctx.beginPath()
    frameCorners.forEach(([x, y], index) => {
      const [nextX, nextY] = frameCorners[(index + 1) % frameCorners.length]
      if (index === 0) ctx.moveTo(x, y)
      ctx.lineTo(nextX, nextY)
    })
    ctx.closePath()
    // Opaque fill clears the earlier generic sash rails before the reference
    // symbol is drawn, including when the opening is selected.
    ctx.fillStyle = isSelected ? '#dff3ff' : '#fbfdff'
    ctx.fill()
    ctx.strokeStyle = isSelected ? '#1682e8' : '#334155'
    ctx.lineWidth = 1.35
    ctx.stroke()

    const symbolPoint = (along: number, depth: number): [number, number] => [
      sp1x + (sp2x - sp1x) * along + nx * thickPx * depth / 2,
      sp1y + (sp2y - sp1y) * along + ny * thickPx * depth / 2,
    ]
    const sashTrackFraction = Math.min(0.95, sashFaceWidthMm * viewport.zoom / Math.max(thickPx, 1))
    // The end-frame face is 50 mm wide (rather than a fixed 10% of the
    // opening, which made the jambs look oversized on a 1200 mm window).
    const jambRatio = Math.min(0.22, frameFaceWidthMm / Math.max(width_mm, 1))
    const frameStart = jambRatio
    const frameEnd = 1 - jambRatio
    const meetingOffset = Math.min(0.08, sashFaceWidthMm / 2 / Math.max(width_mm, 1))
    const leftMeeting = 0.5 - meetingOffset
    const rightMeeting = 0.5 + meetingOffset
    const segments: Array<[[number, number], [number, number]]> = [
      [symbolPoint(frameStart, -1), symbolPoint(frameStart, 1)],
      [symbolPoint(frameEnd, -1), symbolPoint(frameEnd, 1)],
    ]
    const leftSlides = layout[0] === 'sliding'
    const rightSlides = layout[1] === 'sliding'
    if (leftSlides && rightSlides) {
      // Both panels slide on opposing tracks.
      segments.push(
        [symbolPoint(frameStart, 0), symbolPoint(frameEnd, 0)],
        [symbolPoint(0.17, -1), symbolPoint(0.17, -0.48)],
        [symbolPoint(frameStart, -sashTrackFraction), symbolPoint(leftMeeting, -sashTrackFraction)],
        [symbolPoint(frameStart, 0), symbolPoint(leftMeeting, 0)],
        [symbolPoint(leftMeeting, -1), symbolPoint(leftMeeting, 1)],
        [symbolPoint(rightMeeting, -1), symbolPoint(rightMeeting, 1)],
        [symbolPoint(rightMeeting, 0), symbolPoint(frameEnd, 0)],
        [symbolPoint(rightMeeting, sashTrackFraction), symbolPoint(0.83, sashTrackFraction)],
        [symbolPoint(0.83, sashTrackFraction), symbolPoint(0.83, 1)],
      )
    } else if (rightSlides) {
      // Fixed left lite, with the right sash sliding in front of it.
      segments.push(
        [symbolPoint(frameStart, -0.35), symbolPoint(leftMeeting, -0.35)],
        [symbolPoint(leftMeeting, -1), symbolPoint(leftMeeting, 1)],
        [symbolPoint(rightMeeting, -1), symbolPoint(rightMeeting, 1)],
        [symbolPoint(leftMeeting, 0), symbolPoint(frameEnd, 0)],
        [symbolPoint(rightMeeting, sashTrackFraction), symbolPoint(0.83, sashTrackFraction)],
        [symbolPoint(0.83, sashTrackFraction), symbolPoint(0.83, 1)],
      )
    } else {
      // Fixed right lite, mirrored: the left sash is the only moving panel.
      segments.push(
        [symbolPoint(rightMeeting, 0.35), symbolPoint(frameEnd, 0.35)],
        [symbolPoint(leftMeeting, -1), symbolPoint(leftMeeting, 1)],
        [symbolPoint(rightMeeting, -1), symbolPoint(rightMeeting, 1)],
        [symbolPoint(frameStart, 0), symbolPoint(rightMeeting, 0)],
        [symbolPoint(frameStart, -sashTrackFraction), symbolPoint(leftMeeting, -sashTrackFraction)],
        [symbolPoint(0.17, -1), symbolPoint(0.17, -0.48)],
      )
    }
    ctx.beginPath()
    for (const [[x1, y1], [x2, y2]] of segments) {
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
    }
    ctx.stroke()

    // Fine glazing edges run the full clear width of each panel, from the
    // 50 mm jamb face to its meeting stile. They sit inside the sash profiles
    // instead of stopping at the short stepped rail returns above.
    const glassSegments: Array<[[number, number], [number, number]]> = [
      [
        symbolPoint(frameStart, leftSlides ? -sashTrackFraction / 2 : -0.7),
        symbolPoint(leftMeeting, leftSlides ? -sashTrackFraction / 2 : -0.7),
      ],
      [
        symbolPoint(rightMeeting, rightSlides ? sashTrackFraction / 2 : 0.7),
        symbolPoint(frameEnd, rightSlides ? sashTrackFraction / 2 : 0.7),
      ],
    ]
    ctx.beginPath()
    ctx.strokeStyle = isSelected ? '#0e7490' : '#0ea5a8'
    ctx.lineWidth = 0.8
    for (const [[x1, y1], [x2, y2]] of glassSegments) {
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
    }
    ctx.stroke()
  }

  // Badge mark
  const text = mark || 'W1'
  ctx.font = 'bold 9px monospace'
  ctx.save()
  ctx.translate(scx, scy)
  const windowTagScale = planLabelScale(viewport.zoom)
  const windowTagOffset = thickPx / 2 + 9 * windowTagScale + 8
  ctx.rotate(Math.atan2(-uy, ux))
  if (showLabel) queuePlanLabel(ctx, 0, -windowTagOffset, text, '#0369a1', isSelected ? '#1682e8' : '#0ea5e9', isSelected ? 10 : isHovered ? 8 : 5, '#fbfdff', true, 'hexagon', [0, -thickPx / 2])
  ctx.restore()

  ctx.restore()
}

export interface PlacementGhost {
  type: string
  location_mm: [number, number]
  target_location_mm?: [number, number]
  reference_start_mm?: [number, number]
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
      queuePlanLabel(ctx, mx, my, badgeText, '#38bdf8', '#38bdf8', 20, '#0f172a')
    }

    // Start anchor circle
    ctx.fillStyle = '#38bdf8'
    ctx.beginPath()
    const referenceStart = worldToScreen(ghost.reference_start_mm ?? ghost.location_mm, viewport)
    ctx.arc(referenceStart[0], referenceStart[1], 5, 0, Math.PI * 2)
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
      queuePlanLabel(ctx, mx, my, badgeText, '#e2e8f0', '#94a3b8', 20, '#0f172a')
    }

    ctx.fillStyle = '#94a3b8'
    ctx.beginPath()
    const referenceStart = worldToScreen(ghost.reference_start_mm ?? ghost.location_mm, viewport)
    ctx.arc(referenceStart[0], referenceStart[1], 5, 0, Math.PI * 2)
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

