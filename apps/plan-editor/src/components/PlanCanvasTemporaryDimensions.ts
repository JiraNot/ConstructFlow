import { ProjectDocument, isDoorObject, isGridObject, isWallObject, isWindowObject, formatLengthMm, type DisplayLengthUnit } from '@constructflow/project-model'
import { WallHostSnapResult } from '@constructflow/snapping-engine'
import { ViewportState, worldToScreen } from '../viewport/viewportTransform.js'
import { getPlanObjectBounds } from './PlanCanvasGeometry.js'

export function findTemporaryDimensionRefs(point: [number, number], project: ProjectDocument, skipObjectId?: string, mode: 'center' | 'edge' = 'center') {
  const xs: number[] = [], ys: number[] = []
  for (const object of Object.values(project.objects)) {
    if (object.id === skipObjectId) continue
    const data = object.module_data as unknown as Record<string, unknown>
    if (isGridObject(object)) {
      if (object.module_data.start_point_mm && object.module_data.end_point_mm) {
        const [a, b] = [object.module_data.start_point_mm, object.module_data.end_point_mm]
        const values = mode === 'center' ? [[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]] : [a, b]
        for (const [x, y] of values) { xs.push(x); ys.push(y) }
      } else (object.module_data.orientation === 'vertical' ? xs : ys).push(object.module_data.position_mm)
      continue
    }
    if (isDoorObject(object) || isWindowObject(object)) {
      const opening = object.module_data
      const host = project.objects[opening.wall_id]
      if (host && isWallObject(host)) {
        const [sx, sy] = host.module_data.start_point_mm, [ex, ey] = host.module_data.end_point_mm
        const dx = ex - sx, dy = ey - sy, length = Math.hypot(dx, dy)
        if (length > 1) {
          const ux = dx / length, uy = dy / length
          const center: [number, number] = [sx + ux * opening.offset_along_wall_mm, sy + uy * opening.offset_along_wall_mm]
          const halfWidth = opening.width_mm / 2
          const jambA: [number, number] = [center[0] - ux * halfWidth, center[1] - uy * halfWidth]
          const jambB: [number, number] = [center[0] + ux * halfWidth, center[1] + uy * halfWidth]
          if (mode === 'center') { xs.push(center[0]); ys.push(center[1]) }
          else { xs.push(jambA[0], jambB[0]); ys.push(jambA[1], jambB[1]) }
          continue
        }
      }
      // Do not treat an opening's center point as a 50 mm-wide bounding box.
      // If its wall is unavailable, keep the center usable but omit false edges.
      const location = opening.location_mm
      if (Array.isArray(location) && Number.isFinite(location[0]) && Number.isFinite(location[1]) && mode === 'center') {
        xs.push(Number(location[0])); ys.push(Number(location[1]))
      }
      continue
    }
    const centerPoints: [number, number][] = []
    const edgePoints: [number, number][] = []
    for (const key of ['location_mm', 'center_mm']) {
      const value = data[key]
      if (Array.isArray(value) && Number.isFinite(value[0]) && Number.isFinite(value[1])) centerPoints.push([Number(value[0]), Number(value[1])])
    }
    const start = data.start_point_mm, end = data.end_point_mm
    if (Array.isArray(start) && Array.isArray(end) && [start[0], start[1], end[0], end[1]].every(Number.isFinite)) {
      const a: [number, number] = [Number(start[0]), Number(start[1])], b: [number, number] = [Number(end[0]), Number(end[1])]
      edgePoints.push(a, b)
      centerPoints.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])
    }
    for (const key of ['boundary_mm', 'vertices_mm', 'outline_mm', 'points_mm', 'path_mm']) {
      const value = data[key]
      if (!Array.isArray(value)) continue
      for (const vertex of value) if (Array.isArray(vertex) && Number.isFinite(vertex[0]) && Number.isFinite(vertex[1])) edgePoints.push([Number(vertex[0]), Number(vertex[1])])
    }
    const bounds = getPlanObjectBounds(object)
    if (bounds) {
      edgePoints.push([bounds[0], bounds[1]], [bounds[2], bounds[1]], [bounds[0], bounds[3]], [bounds[2], bounds[3]])
      centerPoints.push([(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2])
    }
    for (const [x, y] of mode === 'center' ? centerPoints : edgePoints) { xs.push(x); ys.push(y) }
  }
  const nearest = (values: number[], target: number) => values.filter(value => Math.abs(target - value) > 25 && Math.abs(target - value) < 12000).sort((a, b) => Math.abs(target - a) - Math.abs(target - b))[0]
  return { refX: nearest(xs, point[0]), refY: nearest(ys, point[1]) }
}

export function openingDimensionRefs(point: [number, number], project: ProjectDocument, wallSnap: WallHostSnapResult, mode: 'center' | 'edge'): { refX?: number; refY?: number; axis: 'x' | 'y' } {
  const axis = Math.abs(wallSnap.wall_end_mm[0] - wallSnap.wall_start_mm[0]) >= Math.abs(wallSnap.wall_end_mm[1] - wallSnap.wall_start_mm[1]) ? 'x' : 'y'
  const refs = findTemporaryDimensionRefs(point, project, wallSnap.wall_id, mode)
  // Openings are located along their host wall. If no other object/grid is nearby,
  // use a longitudinal wall reference, never a side face or its thickness.
  const fallback: [number, number] = mode === 'center'
    ? [(wallSnap.wall_start_mm[0] + wallSnap.wall_end_mm[0]) / 2, (wallSnap.wall_start_mm[1] + wallSnap.wall_end_mm[1]) / 2]
    : wallSnap.wall_start_mm
  if (axis === 'x') return { refX: refs.refX ?? fallback[0], refY: undefined, axis }
  return { refX: undefined, refY: refs.refY ?? fallback[1], axis }
}

export function openingDimensionPoint(wallSnap: WallHostSnapResult, refs: { refX?: number; refY?: number; axis: 'x' | 'y' }, openingWidthMm: number): [number, number] {
  const dx = wallSnap.wall_end_mm[0] - wallSnap.wall_start_mm[0]
  const dy = wallSnap.wall_end_mm[1] - wallSnap.wall_start_mm[1]
  const length = Math.hypot(dx, dy)
  if (length < 1) return wallSnap.point_mm
  const ux = dx / length, uy = dy / length
  const center: [number, number] = [
    wallSnap.wall_start_mm[0] + ux * wallSnap.offset_along_wall_mm,
    wallSnap.wall_start_mm[1] + uy * wallSnap.offset_along_wall_mm,
  ]
  const coordinate = refs.axis === 'x' ? center[0] : center[1]
  const anchor = refs.axis === 'x' ? refs.refX : refs.refY
  if (anchor === undefined) return center
  const direction = coordinate < anchor ? -1 : 1
  return [center[0] - direction * ux * openingWidthMm / 2, center[1] - direction * uy * openingWidthMm / 2]
}

export function drawTemporaryDimensions(ctx: CanvasRenderingContext2D, point: [number, number], project: ProjectDocument, viewport: ViewportState, skipObjectId?: string, axisOnly?: 'x' | 'y', suppliedRefs?: { refX?: number; refY?: number }, mode: 'center' | 'edge' = 'center', displayUnit: DisplayLengthUnit = 'm') {
  const refs = findTemporaryDimensionRefs(point, project, skipObjectId, mode)
  const refX = suppliedRefs?.refX ?? refs.refX
  const refY = suppliedRefs?.refY ?? refs.refY
  const [px, py] = worldToScreen(point, viewport)
  ctx.save(); ctx.strokeStyle = '#ea580c'; ctx.fillStyle = '#9a3412'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.font = '11px sans-serif'
  const label = (text: string, x: number, y: number) => {
    const width = ctx.measureText(text).width + 10
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillRect(x - width / 2, y - 10, width, 18)
    ctx.strokeStyle = '#fdba74'; ctx.setLineDash([]); ctx.strokeRect(x - width / 2, y - 10, width, 18)
    ctx.fillStyle = '#9a3412'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y - 1)
  }
  if (refX !== undefined && axisOnly !== 'y') {
    const [x1] = worldToScreen([refX, point[1]], viewport)
    ctx.beginPath(); ctx.moveTo(x1, py - 16); ctx.lineTo(px, py - 16); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x1, py - 21); ctx.lineTo(x1, py - 9); ctx.moveTo(px, py - 21); ctx.lineTo(px, py - 9); ctx.stroke()
    label(`${formatLengthMm(Math.abs(point[0] - refX), displayUnit)} ${displayUnit}`, (x1 + px) / 2, py - 28)
  }
  if (refY !== undefined && axisOnly !== 'x') {
    const [, y1] = worldToScreen([point[0], refY], viewport)
    ctx.beginPath(); ctx.moveTo(px + 16, y1); ctx.lineTo(px + 16, py); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(px + 10, y1); ctx.lineTo(px + 22, y1); ctx.moveTo(px + 10, py); ctx.lineTo(px + 22, py); ctx.stroke()
    label(`${formatLengthMm(Math.abs(point[1] - refY), displayUnit)} ${displayUnit}`, px + 54, (y1 + py) / 2)
  }
  ctx.restore()
}

export function drawTapeMeasure(ctx: CanvasRenderingContext2D, start: [number, number], end: [number, number], viewport: ViewportState, complete: boolean, displayUnit: DisplayLengthUnit) {
  const [x1, y1] = worldToScreen(start, viewport), [x2, y2] = worldToScreen(end, viewport)
  const distanceMm = Math.hypot(end[0] - start[0], end[1] - start[1])
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const nx = -Math.sin(angle), ny = Math.cos(angle)
  ctx.save()
  ctx.strokeStyle = complete ? '#0f766e' : '#7c3aed'
  ctx.fillStyle = complete ? '#0f766e' : '#7c3aed'
  ctx.lineWidth = 1.5
  ctx.setLineDash(complete ? [] : [5, 3])
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  ctx.setLineDash([])
  for (const [x, y] of [[x1, y1], [x2, y2]]) {
    ctx.beginPath(); ctx.moveTo(x - nx * 6, y - ny * 6); ctx.lineTo(x + nx * 6, y + ny * 6); ctx.stroke()
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill()
  }
  const text = `${formatLengthMm(distanceMm, displayUnit)} ${displayUnit}`
  ctx.font = '600 11px sans-serif'
  const width = ctx.measureText(text).width + 12
  const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2 - 12
  ctx.fillStyle = 'rgba(255,255,255,0.96)'; ctx.strokeStyle = complete ? '#5eead4' : '#c4b5fd'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.roundRect(midX - width / 2, midY - 10, width, 20, 4); ctx.fill(); ctx.stroke()
  ctx.fillStyle = complete ? '#115e59' : '#5b21b6'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, midX, midY)
  ctx.restore()
}
