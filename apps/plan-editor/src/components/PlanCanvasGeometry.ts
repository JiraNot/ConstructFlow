import {
  ProjectDocument, SmartObject, DoorModuleData, WindowModuleData, WallModuleData, CabinetModuleData,
  isColumnObject, isGridObject, isWallObject, isDoorObject, isWindowObject, formatLengthMm,
  type DisplayLengthUnit,
} from '@constructflow/project-model'
import { polygonInteriorPoint } from '@constructflow/geometry-kernel'
import { SnapResult, WallHostSnapResult } from '@constructflow/snapping-engine'
import { ViewportState, worldToScreen } from '../viewport/viewportTransform.js'

export interface WallVerticalReference {
  level_id: string
  top_level_id?: string
  height_mm?: number
  base_offset_mm?: number
  top_offset_mm?: number
}

export function getSnappedWallId(snap: SnapResult | undefined, project: ProjectDocument): string | undefined {
  if (!snap?.target_id) return undefined
  const ids = snap.kind === 'intersection' ? snap.target_id.split(':') : [snap.target_id]
  return ids.find(id => {
    const object = project.objects[id]
    return object ? isWallObject(object) : false
  })
}

export function getWallVerticalReference(project: ProjectDocument, wallId?: string): WallVerticalReference | undefined {
  if (!wallId) return undefined
  const wall = project.objects[wallId]
  if (!wall || !isWallObject(wall)) return undefined
  const data = wall.module_data
  return {
    level_id: data.level_id,
    ...(data.top_level_id ? { top_level_id: data.top_level_id } : {}),
    ...(!data.top_level_id && Number.isFinite(data.height_mm) ? { height_mm: data.height_mm } : {}),
    base_offset_mm: data.base_offset_mm ?? 0,
    top_offset_mm: data.top_offset_mm ?? 0,
  }
}

export function getPlanObjectBounds(object: ProjectDocument['objects'][string]): [number, number, number, number] | null {
  if (isGridObject(object)) {
    if (object.module_data.start_point_mm && object.module_data.end_point_mm) {
      const [a, b] = [object.module_data.start_point_mm, object.module_data.end_point_mm]
      return [Math.min(a[0], b[0]) - 50, Math.min(a[1], b[1]) - 50, Math.max(a[0], b[0]) + 50, Math.max(a[1], b[1]) + 50]
    }
    const [a, b] = object.module_data.extent_mm
    return object.module_data.orientation === 'vertical'
      ? [object.module_data.position_mm - 1, Math.min(a, b), object.module_data.position_mm + 1, Math.max(a, b)]
      : [Math.min(a, b), object.module_data.position_mm - 1, Math.max(a, b), object.module_data.position_mm + 1]
  }
  if (object.object_type === 'interior.cabinet_run') {
    const corners = cabinetFootprintPoints(object.module_data as unknown as CabinetModuleData)
    return [Math.min(...corners.map(point => point[0])), Math.min(...corners.map(point => point[1])),
      Math.max(...corners.map(point => point[0])), Math.max(...corners.map(point => point[1]))]
  }
  const data = object.module_data as unknown as Record<string, unknown>
  const points: [number, number][] = []
  for (const key of ['location_mm', 'center_mm', 'start_point_mm', 'end_point_mm', 'origin_mm']) {
    const value = data[key]
    if (Array.isArray(value) && Number.isFinite(value[0]) && Number.isFinite(value[1])) points.push([Number(value[0]), Number(value[1])])
  }
  for (const key of ['boundary_mm', 'vertices_mm', 'outline_mm', 'points_mm', 'path_mm']) {
    const value = data[key]
    if (!Array.isArray(value)) continue
    for (const point of value) {
      if (Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1])) points.push([Number(point[0]), Number(point[1])])
    }
  }
  const center = data.center_mm, size = data.size_mm ?? data.section_mm
  if (Array.isArray(center) && Array.isArray(size) && Number.isFinite(center[0]) && Number.isFinite(center[1])) {
    points.push([Number(center[0]) - Number(size[0]) / 2, Number(center[1]) - Number(size[1]) / 2])
    points.push([Number(center[0]) + Number(size[0]) / 2, Number(center[1]) + Number(size[1]) / 2])
  }
  if (!points.length) return null
  const radius = Math.max(Number(data.thickness_mm ?? 0), Array.isArray(data.section_mm) ? Number(data.section_mm[0] ?? 0) : 0, 100) / 2
  return [Math.min(...points.map(point => point[0])) - radius, Math.min(...points.map(point => point[1])) - radius,
    Math.max(...points.map(point => point[0])) + radius, Math.max(...points.map(point => point[1])) + radius]
}

export function orientedRectangleCorners(center: [number, number], size: [number, number], rotationDeg = 0): [number, number][] {
  const angle = rotationDeg * Math.PI / 180
  return [[-size[0]/2,-size[1]/2],[size[0]/2,-size[1]/2],[size[0]/2,size[1]/2],[-size[0]/2,size[1]/2]].map(([x,y]) => [
    center[0] + x * Math.cos(angle) - y * Math.sin(angle),
    center[1] + x * Math.sin(angle) + y * Math.cos(angle),
  ])
}

export function cabinetFootprintPoints(data: CabinetModuleData): [number, number][] {
  const angle = data.rotation_deg * Math.PI / 180
  const frontY = data.countertop_mm > 0 ? -20 : -data.board_mm
  return [[0, frontY], [data.width_mm, frontY], [data.width_mm, data.depth_mm], [0, data.depth_mm]].map(([localX, localY]) => [
    data.location_mm[0] + localX * Math.cos(angle) - localY * Math.sin(angle),
    data.location_mm[1] + localX * Math.sin(angle) + localY * Math.cos(angle),
  ])
}

export function cabinetRotationGripPoint(data: CabinetModuleData, zoom: number): [number, number] {
  const angle = data.rotation_deg * Math.PI / 180
  const localX = data.width_mm / 2
  const localY = -data.board_mm - 18 / Math.max(zoom, 0.001)
  return [
    data.location_mm[0] + localX * Math.cos(angle) - localY * Math.sin(angle),
    data.location_mm[1] + localX * Math.sin(angle) + localY * Math.cos(angle),
  ]
}

export function cabinetRotationFromGrip(data: CabinetModuleData, point: [number, number], zoom: number): number | null {
  const dx = point[0] - data.location_mm[0]
  const dy = point[1] - data.location_mm[1]
  if (Math.hypot(dx, dy) < 1) return null
  const localX = data.width_mm / 2
  const localY = -data.board_mm - 18 / Math.max(zoom, 0.001)
  const nextAngle = Math.atan2(dy, dx) - Math.atan2(localY, localX)
  const degrees = ((nextAngle * 180 / Math.PI + 180) % 360 + 360) % 360 - 180
  return Math.round(degrees * 10) / 10
}

export function slabSlopeArrow(boundary: [number, number][], slopeRatio: number, directionDeg: number, zoom: number) {
  if (boundary.length < 3 || !(slopeRatio > 0)) return null
  const start = polygonInteriorPoint(boundary) as [number, number] | null
  if (!start) return null
  const angle = directionDeg * Math.PI / 180
  const direction: [number, number] = [Math.cos(angle), Math.sin(angle)]
  let extent = Number.POSITIVE_INFINITY
  for (let index = 0; index < boundary.length; index++) {
    const a = boundary[index], b = boundary[(index + 1) % boundary.length]
    const sx = b[0] - a[0], sy = b[1] - a[1]
    const denominator = direction[0] * sy - direction[1] * sx
    if (Math.abs(denominator) < 1e-8) continue
    const ax = a[0] - start[0], ay = a[1] - start[1]
    const distance = (ax * sy - ay * sx) / denominator
    const alongEdge = (ax * direction[1] - ay * direction[0]) / denominator
    if (distance > 1e-3 && alongEdge >= -1e-6 && alongEdge <= 1 + 1e-6) extent = Math.min(extent, distance)
  }
  const desired = Math.max(220, Math.min(1000, 46 / Math.max(zoom, 0.001)))
  const length = Number.isFinite(extent) ? Math.min(desired, extent * 0.7) : desired
  if (!(length > 1)) return null
  return {
    start_mm: start,
    end_mm: [start[0] + direction[0] * length, start[1] + direction[1] * length] as [number, number],
    label: `${(slopeRatio * 100).toFixed(1)}%`,
  }
}

export function gridLineEndpoints(grid: { module_data: { orientation: 'vertical' | 'horizontal'; position_mm: number; extent_mm: [number, number]; start_point_mm?: [number, number]; end_point_mm?: [number, number] } }): [[number, number], [number, number]] {
  const data = grid.module_data
  if (data.start_point_mm && data.end_point_mm) return [data.start_point_mm, data.end_point_mm]
  return data.orientation === 'vertical' ? [[data.position_mm, data.extent_mm[0]], [data.position_mm, data.extent_mm[1]]] : [[data.extent_mm[0], data.position_mm], [data.extent_mm[1], data.position_mm]]
}

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

export function drawOpeningInspectionDimensions(
  ctx: CanvasRenderingContext2D,
  opening: SmartObject<DoorModuleData | WindowModuleData>,
  hostWall: SmartObject<WallModuleData>,
  project: ProjectDocument,
  viewport: ViewportState,
  displayUnit: DisplayLengthUnit
) {
  const [sx, sy] = hostWall.module_data.start_point_mm
  const [ex, ey] = hostWall.module_data.end_point_mm
  const length = Math.hypot(ex - sx, ey - sy)
  if (length < 1) return

  const ux = (ex - sx) / length, uy = (ey - sy) / length
  const nx = -uy, ny = ux
  const offset = opening.module_data.offset_along_wall_mm
  const w = opening.module_data.width_mm
  const halfWidth = w / 2

  const jambStart = offset - halfWidth
  const jambEnd = offset + halfWidth

  // Check for column faces at start and end of wall
  let startColFace = 0
  let endColFace = 0
  for (const other of Object.values(project.objects)) {
    if (isColumnObject(other)) {
      const [colX, colY] = other.module_data.location_mm
      const [cw, cd] = other.module_data.section_mm
      const colHalf = Math.max(cw, cd) / 2
      if (Math.hypot(colX - sx, colY - sy) <= colHalf + 60) startColFace = Math.max(startColFace, colHalf)
      if (Math.hypot(colX - ex, colY - ey) <= colHalf + 60) endColFace = Math.max(endColFace, colHalf)
    }
  }

  const clearanceStart = Math.max(0, jambStart - startColFace)
  const clearanceEnd = Math.max(0, length - endColFace - jambEnd)
  const isStartWarn = clearanceStart < 100
  const isEndWarn = clearanceEnd < 100

  // Dimension line side: opposite door swing, or side +1 for window
  const isDoor = isDoorObject(opening)
  const swingSign = isDoor ? ((opening.module_data.handing || 'left_in').endsWith('_out') ? -1 : 1) : 1
  const dimSide = isDoor ? -swingSign : 1
  const dimOffsetMm = (hostWall.module_data.thickness_mm / 2 + 380) * dimSide

  // 4 witness points along the wall line (at wall surface)
  const pStartFace: [number, number] = [sx + ux * startColFace, sy + uy * startColFace]
  const pJamb1: [number, number] = [sx + ux * jambStart, sy + uy * jambStart]
  const pJamb2: [number, number] = [sx + ux * jambEnd, sy + uy * jambEnd]
  const pEndFace: [number, number] = [ex - ux * endColFace, ey - uy * endColFace]

  // Projected points on the dimension line
  const dStartFace: [number, number] = [pStartFace[0] + nx * dimOffsetMm, pStartFace[1] + ny * dimOffsetMm]
  const dJamb1: [number, number] = [pJamb1[0] + nx * dimOffsetMm, pJamb1[1] + ny * dimOffsetMm]
  const dJamb2: [number, number] = [pJamb2[0] + nx * dimOffsetMm, pJamb2[1] + ny * dimOffsetMm]
  const dEndFace: [number, number] = [pEndFace[0] + nx * dimOffsetMm, pEndFace[1] + ny * dimOffsetMm]

  // Screen conversions
  const [sPStart, sPJamb1, sPJamb2, sPEnd] = [
    worldToScreen(pStartFace, viewport),
    worldToScreen(pJamb1, viewport),
    worldToScreen(pJamb2, viewport),
    worldToScreen(pEndFace, viewport),
  ]
  const [sDStart, sDJamb1, sDJamb2, sDEnd] = [
    worldToScreen(dStartFace, viewport),
    worldToScreen(dJamb1, viewport),
    worldToScreen(dJamb2, viewport),
    worldToScreen(dEndFace, viewport),
  ]

  ctx.save()

  // 1. Extension Witness Lines
  ctx.strokeStyle = '#94a3b8'
  ctx.lineWidth = 1
  ctx.setLineDash([3, 3])
  const witnessOverrun = 6
  for (const [[pBaseX, pBaseY], [pDimX, pDimY]] of [
    [sPStart, sDStart],
    [sPJamb1, sDJamb1],
    [sPJamb2, sDJamb2],
    [sPEnd, sDEnd],
  ]) {
    const wvx = pDimX - pBaseX, wvy = pDimY - pBaseY
    const wlen = Math.hypot(wvx, wvy)
    if (wlen > 1) {
      const wdx = wvx / wlen, wdy = wvy / wlen
      ctx.beginPath()
      ctx.moveTo(pBaseX, pBaseY)
      ctx.lineTo(pDimX + wdx * witnessOverrun, pDimY + wdy * witnessOverrun)
      ctx.stroke()
    }
  }
  ctx.setLineDash([])

  // 2. Dimension Line Segments
  const drawInterval = (
    p1: [number, number],
    p2: [number, number],
    valueMm: number,
    isWarning: boolean,
    labelPrefix?: string
  ) => {
    ctx.beginPath()
    ctx.strokeStyle = isWarning ? '#dc2626' : '#0284c7'
    ctx.lineWidth = isWarning ? 1.8 : 1.2
    ctx.moveTo(p1[0], p1[1])
    ctx.lineTo(p2[0], p2[1])
    ctx.stroke()

    // 45° Architectural Slashes at endpoints
    const tickLen = 5
    for (const pt of [p1, p2]) {
      ctx.beginPath()
      ctx.strokeStyle = isWarning ? '#dc2626' : '#0369a1'
      ctx.lineWidth = 1.6
      ctx.moveTo(pt[0] - tickLen, pt[1] + tickLen)
      ctx.lineTo(pt[0] + tickLen, pt[1] - tickLen)
      ctx.stroke()
    }

    // Text Label
    const midX = (p1[0] + p2[0]) / 2
    const midY = (p1[1] + p2[1]) / 2
    const distText = `${formatLengthMm(valueMm, displayUnit)} ${displayUnit}`
    const text = labelPrefix ? `${labelPrefix} ${distText}` : distText

    ctx.font = isWarning ? 'bold 11px sans-serif' : '600 11px sans-serif'
    const textWidth = ctx.measureText(text).width + 10
    ctx.fillStyle = isWarning ? '#fef2f2' : 'rgba(255, 255, 255, 0.95)'
    ctx.strokeStyle = isWarning ? '#f87171' : '#bae6fd'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(midX - textWidth / 2, midY - 9, textWidth, 18, 4)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = isWarning ? '#b91c1c' : '#0369a1'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, midX, midY)
  }

  // Draw 3 intervals: Start clearance, Opening width, End clearance
  drawInterval(sDStart, sDJamb1, clearanceStart, isStartWarn, isStartWarn ? '⚠️ เอ็น' : 'ริมเสา')
  drawInterval(sDJamb1, sDJamb2, w, false, 'ช่องกว้าง')
  drawInterval(sDJamb2, sDEnd, clearanceEnd, isEndWarn, isEndWarn ? '⚠️ เอ็น' : 'ริมเสา')

  // 3. Opening Specification Pill Tag (Centered above opening width)
  const midJambX = (sDJamb1[0] + sDJamb2[0]) / 2
  const midJambY = (sDJamb1[1] + sDJamb2[1]) / 2
  const specText = isDoor
    ? `🚪 ${opening.module_data.mark || 'D1'}: ${formatLengthMm(w, displayUnit)} × ${formatLengthMm(opening.module_data.height_mm || 2000, displayUnit)} ${displayUnit} · ธรณี +0.00`
    : `🪟 ${opening.module_data.mark || 'W1'}: ${formatLengthMm(w, displayUnit)} × ${formatLengthMm(opening.module_data.height_mm || 1200, displayUnit)} ${displayUnit} (ธรณี +${formatLengthMm(opening.module_data.sill_height_mm ?? 900, displayUnit)})`
  
  ctx.font = '600 11px sans-serif'
  const specWidth = ctx.measureText(specText).width + 14
  const specYOffset = dimSide > 0 ? 22 : -22
  ctx.fillStyle = '#0f172a'
  ctx.strokeStyle = '#38bdf8'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.roundRect(midJambX - specWidth / 2, midJambY + specYOffset - 10, specWidth, 20, 5)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(specText, midJambX, midJambY + specYOffset)

  // 4. Stiffener Compliance Indicator Badge
  if (!isStartWarn && !isEndWarn) {
    const okText = '✓ ระยะเสาเอ็น-ทับหลัง ผ่านเกณฑ์ (≥ 100 มม.)'
    ctx.font = '500 10px sans-serif'
    const okWidth = ctx.measureText(okText).width + 12
    const okYOffset = dimSide > 0 ? 44 : -44
    ctx.fillStyle = '#f0fdf4'
    ctx.strokeStyle = '#86efac'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(midJambX - okWidth / 2, midJambY + okYOffset - 9, okWidth, 18, 4)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#15803d'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(okText, midJambX, midJambY + okYOffset)
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

