import { ProjectDocument, CabinetModuleData, isGridObject } from '@constructflow/project-model'
import { polygonInteriorPoint } from '@constructflow/geometry-kernel'
export { stairLandingGripPoint } from './stairLandingGripPoint.mjs'
export { stairFlightGripPoints } from './stairFlightGripPoints.mjs'

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
  if (object.object_type === 'interior.furniture') {
    const data = object.module_data as unknown as { location_mm: [number, number, number]; width_mm: number; depth_mm: number; rotation_deg: number }
    const angle = data.rotation_deg * Math.PI / 180
    const corners = [[0, 0], [data.width_mm, 0], [data.width_mm, data.depth_mm], [0, data.depth_mm]].map(([u, v]) => [
      data.location_mm[0] + u * Math.cos(angle) - v * Math.sin(angle),
      data.location_mm[1] + u * Math.sin(angle) + v * Math.cos(angle),
    ] as [number, number])
    return [Math.min(...corners.map(point => point[0])), Math.min(...corners.map(point => point[1])), Math.max(...corners.map(point => point[0])), Math.max(...corners.map(point => point[1]))]
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
