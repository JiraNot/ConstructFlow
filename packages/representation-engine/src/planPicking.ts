import { objectFamilyGeometry } from '@constructflow/family-engine'
import { constructionOutputs } from '@constructflow/domain-providers'
import { distanceToArc2D, distanceToPath2D, pointInPolygon2D, rectangleCorners2D } from '@constructflow/geometry-kernel'
import { wallCenterlineLengthMm, wallCenterlinePointAtOffsetMm, wallCenterlinePointsBetweenOffsetsMm, type ProjectDocument, type SmartObject, type WallModuleData } from '@constructflow/project-model'
import { buildOpeningRepresentationShapeFromObject, getOpeningPlanLinework } from './index.js'

type Point = [number, number]
type Data = Record<string, unknown>
interface PickPath { points: Point[]; closed?: boolean; filled?: boolean; voids?: Point[][]; halfWidth?: number }
interface PickArc { center: Point; radius: number; start: number; sweep: number }
interface PickGeometry {
  id: string
  family: string
  paths: PickPath[]
  arcs: PickArc[]
  boundary?: Point[]
  voids?: Point[][]
  bounds: [number, number, number, number]
}

const cache = new WeakMap<ProjectDocument, { source: ProjectDocument; geometry: PickGeometry[] }>()
const point = (value: unknown): Point | undefined => Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]) ? [Number(value[0]), Number(value[1])] : undefined
const ring = (value: unknown): Point[] => Array.isArray(value) ? value.flatMap(value => { const p = point(value); return p ? [p] : [] }) : []
const backgroundFamilies = new Set(['structure.slab', 'architecture.floor', 'architecture.ceiling', 'architecture.room', 'roof.system', 'architecture.bathroom'])
const priority: Readonly<Record<string, number>> = {
  'door_window.door': 0, 'door_window.window': 1, 'structure.column': 2,
  'architecture.wall': 3, 'structure.beam': 4, 'architecture.stair': 5,
  'structure.foundation': 6, 'structure.grid': 8, 'reference.grid': 8,
  'architecture.floor': 9, 'structure.slab': 10, 'architecture.ceiling': 11, 'architecture.room': 12,
}

function openingGeometry(object: SmartObject, source: ProjectDocument, paths: PickPath[], arcs: PickArc[]) {
  const data = object.module_data as Data
  const host = source.objects[String(data.wall_id)]
  if (host?.object_type !== 'architecture.wall') return
  const wall = host.module_data as Data
  const a = point(wall.start_point_mm), b = point(wall.end_point_mm)
  if (!a || !b) return
  const wallData = host.module_data as WallModuleData
  const length = wallCenterlineLengthMm(wallData)
  const width = Number(data.width_mm), offset = Number(data.offset_along_wall_mm)
  if (length < 1 || !Number.isFinite(width) || width <= 0 || !Number.isFinite(offset)) return
  const originPose = wallCenterlinePointAtOffsetMm(wallData, offset - width / 2)
  const ux = Math.cos(originPose.tangent_angle_deg * Math.PI / 180), uy = Math.sin(originPose.tangent_angle_deg * Math.PI / 180)
  const transform = (p: Point): Point => [originPose.point_mm[0] + ux * p[0] - uy * p[1], originPose.point_mm[1] + uy * p[0] + ux * p[1]]
  // Keep the clear span selectable without turning the whole swing disc into a hit.
  const openingCenterline = wallCenterlinePointsBetweenOffsetsMm(wallData, offset - width / 2, offset + width / 2, 5).map(p => [p[0], p[1]] as Point)
  paths.push({ points: openingCenterline, halfWidth: Number(wall.thickness_mm ?? 100) / 2 })
  const shape = buildOpeningRepresentationShapeFromObject(source, object)
  if (!shape) return
  const linework = getOpeningPlanLinework({ ...shape, width_mm: width }, Number(wall.thickness_mm ?? 100))
  const wallAngle = Math.atan2(uy, ux) * 180 / Math.PI
  for (const path of linework) {
    if (object.object_type === 'door_window.door' && shape.operation !== 'hinged') continue
    // The shared symbol has one full-width leaf. Two-leaf doors need their
    // actual half-width swings rather than an invisible full-width arc.
    if (object.object_type === 'door_window.door' && shape.panel_count >= 2 && !path.closed) continue
    if (path.arc) arcs.push({ center: transform(path.arc.center), radius: path.arc.radius, start: path.arc.start_angle_deg + wallAngle, sweep: path.arc.sweep_angle_deg })
    else paths.push({ points: path.points_mm.map(transform), closed: path.closed, filled: path.kind === 'polygon' })
  }
  if (object.object_type === 'door_window.door' && shape.operation === 'hinged' && shape.panel_count >= 2) {
    const sign = String(data.handing ?? 'left_in').endsWith('_out') ? -1 : 1
    const inset = Math.min(width / 4, shape.frame_face_width_mm) * 0.65
    const y = sign * (Number(wall.thickness_mm ?? 100) / 2 - shape.door_leaf_thickness_mm)
    const radius = Math.max(1, width / 2 - inset)
    for (const left of [true, false]) {
      const x = left ? inset : width - inset
      paths.push({ points: [transform([x, y]), transform([x, y + sign * radius])] })
      arcs.push({ center: transform([x, y]), radius, start: wallAngle + (left ? 0 : 180), sweep: (left ? 1 : -1) * sign * 90 })
    }
  }
}

function geometryFor(plan: ProjectDocument, source: ProjectDocument): PickGeometry[] {
  const existing = cache.get(plan)
  if (existing?.source === source) return existing.geometry
  const outputs = new Map(constructionOutputs(source).map(output => [output.object_id, output]))
  const geometry: PickGeometry[] = []
  for (const object of Object.values(plan.objects)) {
    const data = object.module_data as Data
    const paths: PickPath[] = [], arcs: PickArc[] = []
    let boundary: Point[] | undefined, voids: Point[][] | undefined
    const addRectangle = (center: unknown, size: unknown) => {
      const c = point(center), s = point(size)
      if (c && s) paths.push({ points: rectangleCorners2D(c, s[0], s[1], Number(data.rotation_deg ?? 0)), closed: true, filled: true })
    }
    const custom = objectFamilyGeometry(source, object)
    if (custom) for (const path of custom.worldPaths) {
      const holes=path.voids?.map(ring=>ring.map(p=>{const world=custom.transform([...p,0]);return [world[0],world[1]] as Point}))
      paths.push({ points: path.points.map(point => [point[0], point[1]]), closed: path.closed, filled: path.closed, voids:holes })
      for(const points of holes??[])paths.push({points,closed:true})
    }
    else if (object.object_type === 'structure.column') addRectangle(data.location_mm, data.section_mm)
    else if (object.object_type === 'structure.foundation') addRectangle(data.center_mm, data.size_mm)
    else if (object.object_type === 'door_window.door' || object.object_type === 'door_window.window') openingGeometry(object, source, paths, arcs)
    else if (object.object_type === 'architecture.wall' || object.object_type === 'structure.beam') {
      const a = point(data.start_point_mm), b = point(data.end_point_mm), section = point(data.section_mm)
      if (a && b && object.object_type === 'architecture.wall') {
        const wall = object.module_data as WallModuleData
        const centerline = wallCenterlinePointsBetweenOffsetsMm(wall, 0, wallCenterlineLengthMm(wall), 5).map(p => [p[0], p[1]] as Point)
        paths.push({ points: centerline, halfWidth: Number(data.thickness_mm ?? 100) / 2 })
      } else if (a && b) paths.push({ points: [a, b], halfWidth: Number(section?.[0] ?? 0) / 2 })
    } else if (object.object_type === 'structure.grid' || object.object_type === 'reference.grid') {
      const vertical = data.orientation === 'vertical', position = Number(data.position_mm), extent = point(data.extent_mm)
      const a = point(data.start_point_mm) ?? (extent ? vertical ? [position, extent[0]] as Point : [extent[0], position] as Point : undefined)
      const b = point(data.end_point_mm) ?? (extent ? vertical ? [position, extent[1]] as Point : [extent[1], position] as Point : undefined)
      if (a && b) paths.push({ points: [a, b] })
    } else if (backgroundFamilies.has(object.object_type)) {
      boundary = ring(data.boundary_mm)
      voids = Array.isArray(data.voids_mm) ? data.voids_mm.map(ring) : []
      if (boundary.length) paths.push({ points: boundary, closed: true }, ...voids.map(points => ({ points, closed: true })))
    } else if (object.object_type === 'architecture.room_separator') {
      const a = point(data.start_point_mm), b = point(data.end_point_mm)
      if (a && b) paths.push({ points: [a, b] })
    } else if (object.object_type === 'supplier.bundle_instance') {
      boundary = ring(data.boundary_mm)
      if (boundary.length >= 3) paths.push({ points: boundary, closed: true, filled: true })
      else if (Array.isArray(data.path_mm)) {
        const points = ring(data.path_mm)
        if (points.length >= 2) paths.push({ points })
      } else {
        const location = point(data.location_mm)
        if (location) paths.push({ points: [[location[0] - 80, location[1]], [location[0] + 80, location[1]]], halfWidth: 80 })
      }
    }
    if (!paths.length && !arcs.length) {
      const output = outputs.get(object.id)
      if (output) {
        paths.push(...output.paths.map(path => ({ points: ring(path) })))
        if (!backgroundFamilies.has(object.object_type)) for (const triangle of output.meshes) {
          const projected = ring(triangle)
          if (projected.length === 3 && Math.abs((projected[1][0] - projected[0][0]) * (projected[2][1] - projected[0][1]) - (projected[1][1] - projected[0][1]) * (projected[2][0] - projected[0][0])) > 1)
            paths.push({ points: projected, closed: true, filled: true })
        }
      }
    }
    const allPoints = paths.flatMap(path => path.points)
    for (const arc of arcs) allPoints.push([arc.center[0] - arc.radius, arc.center[1] - arc.radius], [arc.center[0] + arc.radius, arc.center[1] + arc.radius])
    if (!allPoints.length) continue
    const padding = paths.reduce((max, path) => Math.max(max, path.halfWidth ?? 0), 0)
    const bounds: PickGeometry['bounds'] = [Infinity, Infinity, -Infinity, -Infinity]
    for (const p of allPoints) {
      bounds[0] = Math.min(bounds[0], p[0] - padding); bounds[1] = Math.min(bounds[1], p[1] - padding)
      bounds[2] = Math.max(bounds[2], p[0] + padding); bounds[3] = Math.max(bounds[3], p[1] + padding)
    }
    geometry.push({ id: object.id, family: object.object_type, paths, arcs, boundary, voids, bounds })
  }
  cache.set(plan, { source, geometry })
  return geometry
}

/** Nearest visible linework first; enclosing surface interiors are fallback picks. */
export function getPlanPickCandidates(plan: ProjectDocument, source: ProjectDocument, point: Point, zoom: number, preferWall = false, excluded: ReadonlySet<string> = new Set()): string[] {
  const scale = Math.max(0.0001, zoom), tolerance = 8 / scale
  const hits: { id: string; family: string; interior: boolean; distancePx: number }[] = []
  for (const item of geometryFor(plan, source)) {
    if (excluded.has(item.id)) continue
    const [minX, minY, maxX, maxY] = item.bounds
    if (point[0] < minX - tolerance || point[0] > maxX + tolerance || point[1] < minY - tolerance || point[1] > maxY + tolerance) continue
    let distance = Infinity
    for (const path of item.paths) distance = Math.min(distance, path.filled && pointInPolygon2D(point, path.points) && !path.voids?.some(hole=>pointInPolygon2D(point,hole)) ? 0 : Math.max(0, distanceToPath2D(point, path.points, path.closed) - (path.halfWidth ?? 0)))
    for (const arc of item.arcs) distance = Math.min(distance, distanceToArc2D(point, arc.center, arc.radius, arc.start, arc.sweep))
    const inside = item.boundary && pointInPolygon2D(point, item.boundary) && !item.voids?.some(hole => pointInPolygon2D(point, hole))
    if (distance <= tolerance || inside) hits.push({ id: item.id, family: item.family, interior: distance > tolerance, distancePx: distance * scale })
  }
  hits.sort((a, b) => {
    if (preferWall && (a.family === 'architecture.wall') !== (b.family === 'architecture.wall')) return a.family === 'architecture.wall' ? -1 : 1
    return Number(a.interior) - Number(b.interior)
      || Math.floor(a.distancePx / 2) - Math.floor(b.distancePx / 2)
      || (priority[a.family] ?? 7) - (priority[b.family] ?? 7)
      || a.distancePx - b.distancePx || a.id.localeCompare(b.id)
  })
  return hits.map(hit => hit.id)
}
