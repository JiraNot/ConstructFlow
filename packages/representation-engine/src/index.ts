import type { DoorFaceComponent } from '@constructflow/project-model'
import {
  getDisplayPhase,
  resolveCatalogType,
  isColumnObject,
  resolveWallVerticalExtent,
  resolveOpeningVerticalExtent,
  resolveColumnVerticalExtent,
  resolveBeamBaseElevation,
  type Phase,
  type ProjectDocument,
  type SmartObject,
} from '@constructflow/project-model'
import { constructionOutputs } from '@constructflow/domain-providers'
import { box, tube, type Triangle, type Vec3 } from '@constructflow/geometry-kernel'
export { doorLeafDetails, sashBeadDetails, openingMaterialAppearance, openingHandlePlacement } from './openingDetails.js'

export type Vec3Mm = [number, number, number]

/** Shared elevation palette for wall faces in Canvas, permit sheets and DXF. */
export interface ElevationWallPhaseStyle {
  fill: string
  stroke: string
  dash: number[]
}

export function resolveElevationWallPhaseStyle(phase: Phase): ElevationWallPhaseStyle {
  if (phase === 'existing') return { fill: '#ffffff', stroke: '#64748b', dash: [] }
  if (phase === 'demolition') return { fill: '#fee2e2', stroke: '#ef4444', dash: [6, 3] }
  return { fill: '#e3e8ed', stroke: '#334155', dash: [] }
}

/** Shared plan phase palette for Canvas, permit vectors and CAD layers. */
export function resolvePlanPhaseStyle(phase: Phase): ElevationWallPhaseStyle {
  if (phase === 'existing') return { fill: '#ffffff', stroke: '#94a3b8', dash: [] }
  if (phase === 'demolition') return { fill: '#fee2e2', stroke: '#ef4444', dash: [6, 3] }
  return { fill: '#e3e8ed', stroke: '#0f172a', dash: [] }
}

/** Shared reflected-ceiling grid styling for Canvas, permit vectors and DXF. */
export function resolveCeilingGridStyle(phase: Phase): Pick<ElevationWallPhaseStyle, 'stroke' | 'dash'> {
  if (phase === 'existing') return { stroke: '#cbd5e1', dash: [] }
  if (phase === 'demolition') return { stroke: '#ef4444', dash: [6, 3] }
  return { stroke: '#94a3b8', dash: [] }
}

export function resolvePlanWallPhaseStyle(phase: Phase): ElevationWallPhaseStyle {
  return resolvePlanPhaseStyle(phase)
}

export interface OpeningCutout {
  object_id: string
  min_x_mm: number
  max_x_mm: number
  min_z_mm: number
  max_z_mm: number
}

export interface WallExtrusionLayer {
  role: 'masonry' | 'plaster_inside' | 'plaster_outside'
  thickness_mm: number
  offset_mm: number
  material: string
}

export type RepresentationShape =
  | { kind: 'triangle_mesh'; triangles_mm: Triangle[] }
  | { kind: 'box'; size_mm: Vec3Mm }
  | { kind: 'wall_extrusion'; length_mm: number; thickness_mm: number; height_mm: number; cutouts: OpeningCutout[]; layers?: WallExtrusionLayer[] }
  | {
      kind: 'opening'
      opening_type: 'door' | 'window'
      width_mm: number
      height_mm: number
      wall_thickness_mm: number
      sill_height_mm: number
      operation: 'hinged' | 'sliding' | 'fixed' | 'awning' | 'louver'
      panel_count: number
      panel_layout: Array<'hinged' | 'sliding' | 'fixed' | 'awning' | 'louver'>
      panel_width_ratios: number[]
      transom_height_mm: number
      bottom_light_height_mm: number
      muntin_rows: number
      muntin_columns: number
      transom_muntin_rows: number
      transom_muntin_columns: number
      bottom_light_muntin_rows: number
      bottom_light_muntin_columns: number
      frame_depth_mm: number
      frame_face_width_mm: number
      sash_face_width_mm: number
      door_leaf_thickness_mm: number
      frame_material: string
      panel_material?: string
      door_face_components?: DoorFaceComponent[]
      door_leaf_style: 'flush' | 'raised_2_panel' | 'raised_4_panel' | 'raised_6_panel' | 'horizontal_grooves_3' | 'horizontal_grooves_5' | 'vertical_grooves_3' | 'louvered'
      opening_handle_style: 'lever' | 'round_knob' | 'pull_handle' | 'recessed_pull' | 'none'
      opening_hardware_finish: 'stainless' | 'matte_black' | 'satin_brass' | 'bronze'
      glazing_material: 'none' | 'clear_glass' | 'frosted_glass' | 'tinted_glass'
      glazing_transmission: number
      handing?: string
    }

export type RepresentationInteraction =
  | { kind: 'column' }
  | { kind: 'wall' }
  | { kind: 'supported_foundation'; supported_column_id: string }
  | {
      kind: 'hosted_opening'
      host_wall_id: string
      host_start_point_mm: Vec3Mm
      host_end_point_mm: Vec3Mm
      width_mm: number
      offset_along_wall_mm: number
    }
  | { kind: 'select_only' }

/** Renderer-neutral 3D representation derived from the authoritative project document. */
export interface ObjectRepresentation3D {
  object_id: string
  object_type: string
  mark: string
  display_phase: Phase
  material?: string
  position_mm: Vec3Mm
  rotation_rad: number
  shape: RepresentationShape
  interaction: RepresentationInteraction
}

export interface RepresentationResult {
  objects: ObjectRepresentation3D[]
  warnings: string[]
}

export interface OpeningElevationPath {
  points_mm: Array<[number, number]>
  closed: boolean
  line_width_mm: number
  fill?: string
}

/**
 * Build front-elevation linework in opening-local coordinates (origin at its
 * lower-left corner). Canvas, PDF and DXF use this same catalog-resolved shape
 * so their frame, sash and glazing divisions cannot drift independently.
 */
export function getOpeningElevationLinework(shape: Extract<RepresentationShape, { kind: 'opening' }>): OpeningElevationPath[] {
  const width = shape.width_mm, height = shape.height_mm
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return []
  const frame = Math.min(width / 5, Math.max(25, shape.frame_face_width_mm || 50))
  const paths: OpeningElevationPath[] = []
  const rect = (left: number, bottom: number, right: number, top: number, line_width_mm: number, fill?: string) => {
    if (right <= left || top <= bottom) return
    paths.push({ points_mm: [[left, bottom], [right, bottom], [right, top], [left, top]], closed: true, line_width_mm, fill })
  }
  const line = (x1: number, z1: number, x2: number, z2: number, line_width_mm: number) => {
    paths.push({ points_mm: [[x1, z1], [x2, z2]], closed: false, line_width_mm })
  }

  rect(0, 0, width, height, 0.35, '#ffffff')
  rect(frame, frame, width - frame, height - frame, 0.25)
  if (shape.opening_type === 'window') {
    const panels = Math.max(1, Math.min(8, Math.floor(shape.panel_count || 2)))
    const ratios = shape.panel_width_ratios && shape.panel_width_ratios.length === panels && shape.panel_width_ratios.every(value => Number.isFinite(value) && value > 0)
      ? shape.panel_width_ratios
      : Array.from({ length: panels }, () => 1 / panels)
    let accumulated = 0
    for (let index = 0; index < panels - 1; index++) {
      accumulated += ratios[index]
      const x = width * accumulated
      line(x, frame, x, height - frame, 0.3)
    }
    const rows = Math.max(1, Math.min(8, Math.floor(shape.muntin_rows || 1)))
    const columns = Math.max(1, Math.min(8, Math.floor(shape.muntin_columns || 1)))
    for (let index = 1; index <= rows; index++) {
      const z = frame + (height - frame * 2) * index / (rows + 1)
      line(frame, z, width - frame, z, 0.2)
    }
    for (let index = 1; index <= columns; index++) {
      const x = frame + (width - frame * 2) * index / (columns + 1)
      line(x, frame, x, height - frame, 0.2)
    }
  } else {
    const inset = frame * 1.7
    rect(inset, inset, width - inset, height - inset, 0.2)
    const panels = Math.max(1, Math.min(4, Math.floor(shape.panel_count || 1)))
    for (let index = 1; index <= panels; index++) {
      const z = inset + (height - inset * 2) * index / (panels + 1)
      line(inset, z, width - inset, z, 0.2)
    }
  }

  return paths
}

/**
 * Expand a renderer-neutral representation into world-space triangles.
 * Elevation sheets and interactive elevation canvases use this same geometry
 * so wall cutouts and structural outlines cannot drift between views.
 */
export function getRepresentationTriangles(representation: ObjectRepresentation3D): Triangle[] {
  const { shape } = representation
  if (shape.kind === 'triangle_mesh') return shape.triangles_mm
  // Hosted openings are negative space already removed from their wall mesh.
  if (shape.kind === 'opening') return []
  if (shape.kind === 'wall_extrusion') {
    const { length_mm: length, thickness_mm: thickness, height_mm: height, cutouts } = shape
    const xs = [0, length, ...cutouts.flatMap(cutout => [cutout.min_x_mm, cutout.max_x_mm])].sort((a, b) => a - b)
    const zs = [0, height, ...cutouts.flatMap(cutout => [cutout.min_z_mm, cutout.max_z_mm])].sort((a, b) => a - b)
    const local: Triangle[] = []
    for (let i = 1; i < xs.length; i++) for (let j = 1; j < zs.length; j++) {
      if (xs[i] <= xs[i - 1] || zs[j] <= zs[j - 1]) continue
      const cx = (xs[i] + xs[i - 1]) / 2, cz = (zs[j] + zs[j - 1]) / 2
      if (cutouts.some(cutout => cx > cutout.min_x_mm && cx < cutout.max_x_mm && cz > cutout.min_z_mm && cz < cutout.max_z_mm)) continue
      local.push(...box([xs[i - 1], -thickness / 2, zs[j - 1]], [xs[i] - xs[i - 1], thickness, zs[j] - zs[j - 1]]))
    }
    return local.map(triangle => triangle.map(vertex => transformRepresentationPoint(representation, vertex)) as Triangle)
  }
  const [width, depth, height] = shape.size_mm
  return box([-width / 2, -depth / 2, -height / 2], [width, depth, height])
    .map(triangle => triangle.map(vertex => transformRepresentationPoint(representation, vertex)) as Triangle)
}

/** Return whether a wall's long axis forms a facade in the requested orthographic elevation. */
export function isWallFacadeForElevation(
  wall: SmartObject,
  direction: 'north' | 'south' | 'east' | 'west',
): boolean {
  if (wall.object_type !== 'architecture.wall') return false
  const data = moduleData(wall)
  const start = data?.start_point_mm, end = data?.end_point_mm
  if (!Array.isArray(start) || !Array.isArray(end) || !isFiniteNumber(start[0]) || !isFiniteNumber(start[1]) || !isFiniteNumber(end[0]) || !isFiniteNumber(end[1])) return false
  const dx = Math.abs(end[0] - start[0]), dy = Math.abs(end[1] - start[1])
  if (dx + dy <= 1e-8) return false
  return direction === 'east' || direction === 'west' ? dy > dx : dx >= dy
}

/**
 * Project a triangulated surface into an orthographic elevation and omit or
 * split edges covered by a nearer triangle of the same surface. This is used
 * by the live elevation canvas and the permit-sheet compiler so hip/gable roof
 * back edges do not show through the near roof plane in either output.
 */
export function getVisibleElevationMeshEdges(
  triangles: Triangle[],
  direction: 'north' | 'south' | 'east' | 'west',
  paperUnitsPerMm = 0.1,
): Array<[Vec3, Vec3]> {
  const edgeMap = new Map<string, { a: Vec3; b: Vec3; normals: Vec3[] }>()
  const pointKey = (point: Vec3) => point.map(value => Math.round(value * 10) / 10).join(',')
  for (const triangle of triangles) {
    if (triangle.length !== 3 || triangle.some(point => !point.every(Number.isFinite))) continue
    const a = triangle[1].map((value, index) => value - triangle[0][index]) as Vec3
    const b = triangle[2].map((value, index) => value - triangle[0][index]) as Vec3
    const normal = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] as Vec3
    const magnitude = Math.hypot(...normal)
    if (magnitude < 1e-8) continue
    const unitNormal = normal.map(value => value / magnitude) as Vec3
    for (let index = 0; index < 3; index++) {
      const start = triangle[index], end = triangle[(index + 1) % 3]
      const keys = [pointKey(start), pointKey(end)].sort()
      const key = keys.join('|')
      const edge = edgeMap.get(key) ?? { a: keys[0] === pointKey(start) ? start : end, b: keys[0] === pointKey(start) ? end : start, normals: [] }
      edge.normals.push(unitNormal)
      edgeMap.set(key, edge)
    }
  }
  const edges = [...edgeMap.values()]
    .filter(edge => edge.normals.length === 1 || edge.normals.slice(1).some(normal =>
      Math.abs(normal.reduce((sum, value, index) => sum + value * edge.normals[0][index], 0)) < 0.9999,
    ))
  const eastWest = direction === 'east' || direction === 'west'
  const depthAxis = eastWest ? 0 : 1
  const horizontalAxis = eastWest ? 1 : 0
  const cameraSign = direction === 'north' || direction === 'east' ? 1 : -1
  const projected = (point: Vec3): [number, number] => [point[horizontalAxis], point[2]]
  const signedDepth = (point: Vec3) => cameraSign * point[depthAxis]
  const depthAt = (point: Vec3, triangle: Triangle): number | undefined => {
    const [p0, p1, p2] = triangle.map(projected)
    const [x, y] = projected(point)
    const denominator = (p1[1] - p2[1]) * (p0[0] - p2[0]) + (p2[0] - p1[0]) * (p0[1] - p2[1])
    if (Math.abs(denominator) < 1e-8) return undefined
    const u = ((p1[1] - p2[1]) * (x - p2[0]) + (p2[0] - p1[0]) * (y - p2[1])) / denominator
    const v = ((p2[1] - p0[1]) * (x - p2[0]) + (p0[0] - p2[0]) * (y - p2[1])) / denominator
    const w = 1 - u - v
    if (u < -1e-7 || v < -1e-7 || w < -1e-7) return undefined
    return u * signedDepth(triangle[0]) + v * signedDepth(triangle[1]) + w * signedDepth(triangle[2])
  }
  const isVisible = (point: Vec3) => !triangles.some(triangle => {
    if (triangle.length !== 3 || triangle.some(vertex => !vertex.every(Number.isFinite))) return false
    const surfaceDepth = depthAt(point, triangle)
    return surfaceDepth !== undefined && surfaceDepth > signedDepth(point) + 15
  })
  const stepMm = Math.max(0.25, Math.min(100, 1.5 / Math.max(0.001, paperUnitsPerMm)))
  const result: Array<[Vec3, Vec3]> = []
  for (const { a, b } of edges) {
    const length = Math.hypot(...a.map((value, axis) => b[axis] - value))
    const steps = Math.max(1, Math.min(1024, Math.ceil(length / stepMm)))
    let runStart: number | undefined
    for (let index = 0; index < steps; index++) {
      const t0 = index / steps, t1 = (index + 1) / steps, mid = (t0 + t1) / 2
      const sample = a.map((value, axis) => value + (b[axis] - value) * mid) as Vec3
      const visible = isVisible(sample)
      if (visible && runStart === undefined) runStart = t0
      const currentRunStart = runStart
      if (currentRunStart !== undefined && (!visible || index === steps - 1)) {
        const runEnd = visible ? t1 : t0
        if (runEnd - currentRunStart > 1e-6) {
          result.push([
            a.map((value, axis) => value + (b[axis] - value) * currentRunStart) as Vec3,
            a.map((value, axis) => value + (b[axis] - value) * runEnd) as Vec3,
          ])
        }
        runStart = undefined
      }
    }
  }
  return result
}

/**
 * Return facade walls whose projected face is not completely covered by a
 * nearer facade wall. Partial visibility is retained so stepped elevations
 * still show their exposed portions; fully hidden rear walls add no duplicate
 * elevation face or finish annotation.
 */
export function getElevationVisibleWallIds(
  project: ProjectDocument,
  direction: 'north' | 'south' | 'east' | 'west',
): ReadonlySet<string> {
  const eastWest = direction === 'east' || direction === 'west'
  const depthAxis = eastWest ? 0 : 1
  const horizontalAxis = eastWest ? 1 : 0
  const cameraSign = direction === 'north' || direction === 'east' ? 1 : -1
  const coordinate = (point: unknown, axis: number): number | undefined =>
    Array.isArray(point) && isFiniteNumber(point[axis]) ? point[axis] as number : undefined
  const bounds = new Map<string, { depth: number; minX: number; maxX: number; base: number; top: number }>()
  for (const wall of Object.values(project.objects)) {
    if (wall.status === 'archived' || !isWallFacadeForElevation(wall, direction)) continue
    const data = moduleData(wall)
    const start = data?.start_point_mm, end = data?.end_point_mm
    const x1 = coordinate(start, horizontalAxis), x2 = coordinate(end, horizontalAxis)
    const d1 = coordinate(start, depthAxis), d2 = coordinate(end, depthAxis)
    const extent = resolveWallVerticalExtent(project, wall)
    if (x1 === undefined || x2 === undefined || d1 === undefined || d2 === undefined || !extent) continue
    const halfThickness = Math.max(0, Number(data?.thickness_mm ?? 0)) / 2
    bounds.set(wall.id, {
      depth: (d1 + d2) / 2 + cameraSign * halfThickness,
      minX: Math.min(x1, x2) - halfThickness,
      maxX: Math.max(x1, x2) + halfThickness,
      base: extent.base_elevation_mm,
      top: extent.top_elevation_mm,
    })
  }
  const visible = new Set<string>()
  for (const [id, candidate] of bounds) {
    const fullyMasked = [...bounds].some(([otherId, other]) => {
      if (otherId === id || cameraSign * other.depth <= cameraSign * candidate.depth + 1) return false
      if (other.minX > candidate.minX || other.maxX < candidate.maxX || other.base > candidate.base || other.top < candidate.top) return false
      return true
    })
    if (!fullyMasked) visible.add(id)
  }
  return visible
}

function transformRepresentationPoint(representation: ObjectRepresentation3D, point: Vec3): Vec3 {
  const c = Math.cos(representation.rotation_rad), s = Math.sin(representation.rotation_rad)
  return [
    representation.position_mm[0] + point[0] * c - point[1] * s,
    representation.position_mm[1] + point[0] * s + point[1] * c,
    representation.position_mm[2] + point[2],
  ]
}

/**
 * Return the hosted door/window objects visible from one orthographic facade.
 * Openings on a rear wall are omitted when a nearer finished wall masks them,
 * unless an opening on that nearer wall fully clears their projected bounds.
 */
export function getElevationVisibleOpeningIds(
  project: ProjectDocument,
  direction: 'north' | 'south' | 'east' | 'west',
): ReadonlySet<string> {
  const eastWest = direction === 'east' || direction === 'west'
  const depthAxis = eastWest ? 0 : 1
  const horizontalAxis = eastWest ? 1 : 0
  const cameraSign = direction === 'north' || direction === 'east' ? 1 : -1
  const coordinate = (point: unknown, axis: number): number | undefined =>
    Array.isArray(point) && isFiniteNumber(point[axis]) ? point[axis] : undefined
  const walls = Object.values(project.objects).filter(object =>
    object.status !== 'archived' && isWallFacadeForElevation(object, direction),
  )
  const openings = Object.values(project.objects).filter(object =>
    object.object_type.startsWith('door_window.') &&
    object.status !== 'archived',
  )
  const wallBounds = new Map<string, { depth: number; minX: number; maxX: number; base: number; top: number }>()
  for (const wall of walls) {
    const data = moduleData(wall)
    if (!data) continue
    const start = data.start_point_mm, end = data.end_point_mm
    const x1 = coordinate(start, horizontalAxis), x2 = coordinate(end, horizontalAxis)
    const d1 = coordinate(start, depthAxis), d2 = coordinate(end, depthAxis)
    const extent = resolveWallVerticalExtent(project, wall)
    if (x1 === undefined || x2 === undefined || d1 === undefined || d2 === undefined || !extent) continue
    const halfThickness = Math.max(0, Number(data.thickness_mm ?? 0)) / 2
    wallBounds.set(wall.id, {
      depth: (d1 + d2) / 2 + cameraSign * halfThickness,
      minX: Math.min(x1, x2) - halfThickness,
      maxX: Math.max(x1, x2) + halfThickness,
      base: extent.base_elevation_mm,
      top: extent.top_elevation_mm,
    })
  }
  const openingBounds = new Map<string, { hostId: string; minX: number; maxX: number; base: number; top: number; depth: number }>()
  for (const opening of openings) {
    const data = moduleData(opening)
    const hostId = typeof data?.wall_id === 'string' ? data.wall_id : ''
    const host = wallBounds.get(hostId)
    const center = coordinate(data?.location_mm, horizontalAxis)
    const extent = resolveOpeningVerticalExtent(project, opening)
    if (!host || center === undefined || !extent) continue
    const halfWidth = Math.max(0, Number(data?.width_mm ?? 0)) / 2
    openingBounds.set(opening.id, { hostId, minX: center - halfWidth, maxX: center + halfWidth, base: extent.base_elevation_mm, top: extent.top_elevation_mm, depth: host.depth })
  }
  const visible = new Set<string>()
  for (const [id, opening] of openingBounds) {
    const masked = [...wallBounds].some(([wallId, wall]) => {
      if (wallId === opening.hostId || cameraSign * wall.depth <= cameraSign * opening.depth + 1) return false
      if (wall.maxX <= opening.minX || wall.minX >= opening.maxX || wall.top <= opening.base || wall.base >= opening.top) return false
      const hasClearOpening = openings.some(candidate => {
        const aperture = openingBounds.get(candidate.id)
        return aperture?.hostId === wallId && aperture.minX <= opening.minX && aperture.maxX >= opening.maxX && aperture.base <= opening.base && aperture.top >= opening.top
      })
      return !hasClearOpening
    })
    if (!masked) visible.add(id)
  }
  return visible
}

/** Return the Smart Objects that belong on the project's active plan level. */
export function getPlanVisibleObjects(project: ProjectDocument): SmartObject[] {
  const activeLevel = project.levels.find(level => level.id === project.project.active_level_id)
  if (!activeLevel) return Object.values(project.objects)
  const activeIndex = activeLevel.storey_index

  const levelRef = (object: SmartObject, role: string): string | undefined =>
    object.level_refs.find(reference => reference.role === role)?.level_id

  return Object.values(project.objects).filter(object => {
    const data = moduleData(object)
    if (!data) return true

    if (isColumnObject(object)) {
      const baseId = typeof data.base_level_id === 'string' ? data.base_level_id : levelRef(object, 'base_level')
      const topId = typeof data.top_level_id === 'string' ? data.top_level_id : levelRef(object, 'top_level')
      const baseIndex = project.levels.find(level => level.id === baseId)?.storey_index
      const topIndex = project.levels.find(level => level.id === topId)?.storey_index
      if (baseIndex === undefined) return true
      return activeIndex >= baseIndex && (topIndex === undefined ? activeLevel.id === baseId : activeIndex <= topIndex)
    }

    if (object.object_type === 'structure.foundation') {
      const baseId = levelRef(object, 'base_level')
        ?? (typeof data.base_level_id === 'string' ? data.base_level_id : undefined)
        ?? (typeof data.supported_column_id === 'string'
          ? (() => {
              const support = project.objects[data.supported_column_id]
              if (!support || !isColumnObject(support)) return undefined
              const supportData = moduleData(support)
              return typeof supportData?.base_level_id === 'string' ? supportData.base_level_id : levelRef(support, 'base_level')
            })()
          : undefined)
      return baseId ? baseId === activeLevel.id : true
    }

    const directLevelId = typeof data.level_id === 'string' ? data.level_id
      : levelRef(object, 'base_level') ?? levelRef(object, 'host_level')
    return directLevelId ? directLevelId === activeLevel.id : true
  })
}

/** Return a project snapshot containing only objects that belong in the active 2D plan. */
export function getPlanViewProject(project: ProjectDocument, visibleObjects = getPlanVisibleObjects(project)): ProjectDocument {
  return {
    ...project,
    objects: Object.fromEntries(visibleObjects.map(object => [object.id, object])) as ProjectDocument['objects'],
  }
}

type Data = Record<string, unknown>
const isRecord = (value: unknown): value is Data => value !== null && typeof value === 'object' && !Array.isArray(value)
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isPositive = (value: unknown): value is number => isFiniteNumber(value) && value > 0
const tuple3 = (value: unknown): value is Vec3Mm => Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber)
const positiveTuple2 = (value: unknown): value is [number, number] => Array.isArray(value) && value.length === 2 && value.every(isPositive)
const mmToM = (value: unknown): number | undefined => isFiniteNumber(value) ? value / 1000 : undefined

function moduleData(object: SmartObject): Data | undefined {
  return isRecord(object.module_data) ? object.module_data : undefined
}

function resolveValue(project: ProjectDocument, object: SmartObject, data: Data, field: string): unknown {
  const overrides = isRecord(data.instance_overrides) ? data.instance_overrides : undefined
  if (overrides?.[field] !== undefined) return overrides[field]
  if (data[field] !== undefined) return data[field]
  const reference = typeof data.type_id === 'string' ? data.type_id : typeof data.mark === 'string' ? data.mark : undefined
  return resolveCatalogType(project, object.object_type, reference)?.parameters[field]
}

function levelElevation(project: ProjectDocument, levelId: unknown): number | undefined {
  if (typeof levelId !== 'string') return undefined
  const elevation = project.levels.find(level => level.id === levelId)?.elevation_mm
  return isFiniteNumber(elevation) ? elevation : undefined
}

function baseObject(object: SmartObject, data: Data, position_mm: Vec3Mm, rotation_rad: number, shape: RepresentationShape, interaction: RepresentationInteraction): ObjectRepresentation3D {
  return {
    object_id: object.id,
    object_type: object.object_type,
    mark: typeof data.mark === 'string' ? data.mark : object.object_type,
    display_phase: getDisplayPhase(object),
    material: typeof data.material === 'string' ? data.material : undefined,
    position_mm,
    rotation_rad,
    shape,
    interaction,
  }
}

function representObject(project: ProjectDocument, object: SmartObject, warnings: string[], visibleObjectIds?: ReadonlySet<string>): ObjectRepresentation3D | undefined {
  const data = moduleData(object)
  if (!data) {
    warnings.push(`${object.id}: module data is not an object; 3D representation omitted`)
    return undefined
  }
  switch (object.object_type) {
    case 'structure.column': {
      const location = data.location_mm
      const section = resolveValue(project, object, data, 'section_mm')
      const extent = resolveColumnVerticalExtent(project, object)
      if (!tuple3(location) || !positiveTuple2(section) || !extent) {
        warnings.push(`${object.id}: column location, section or vertical extent is invalid; 3D representation omitted`)
        return undefined
      }
      const { base_elevation_mm: base, top_elevation_mm: top } = extent
      const rotation = isFiniteNumber(data.rotation_deg) ? data.rotation_deg * Math.PI / 180 : 0
      return baseObject(object, data, [location[0], location[1], (base + top) / 2], rotation,
        { kind: 'box', size_mm: [section[0], section[1], top - base] }, { kind: 'column' })
    }
    case 'structure.foundation': {
      const center = data.center_mm
      const size = resolveValue(project, object, data, 'size_mm')
      if (!tuple3(center) || !Array.isArray(size) || size.length !== 3 || !size.every(isPositive)) {
        warnings.push(`${object.id}: foundation center or size is invalid; 3D representation omitted`)
        return undefined
      }
      const [width, length, thickness] = size as Vec3Mm
      const supportedColumnId = typeof data.supported_column_id === 'string' ? data.supported_column_id
        : object.host_refs.find(hostId => project.objects[hostId]?.object_type === 'structure.column')
      const interaction: RepresentationInteraction = supportedColumnId && project.objects[supportedColumnId]?.object_type === 'structure.column'
        ? { kind: 'supported_foundation', supported_column_id: supportedColumnId }
        : { kind: 'select_only' }
      return baseObject(object, data, [center[0], center[1], center[2] - thickness / 2], 0,
        { kind: 'box', size_mm: [width, length, thickness] }, interaction)
    }
    case 'structure.beam': {
      const start = data.start_point_mm, end = data.end_point_mm
      const section = resolveValue(project, object, data, 'section_mm')
      const baseElevation = resolveBeamBaseElevation(project, object)
      if (!tuple3(start) || !tuple3(end) || !positiveTuple2(section) || baseElevation === undefined) {
        warnings.push(`${object.id}: beam endpoints or section are invalid; 3D representation omitted`)
        return undefined
      }
      const dx = end[0] - start[0], dy = end[1] - start[1]
      const length = Math.hypot(dx, dy)
      if (!isPositive(length)) {
        warnings.push(`${object.id}: beam has no horizontal span; 3D representation omitted`)
        return undefined
      }
      return baseObject(object, data, [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, baseElevation + section[1] / 2 - (typeof data.drop_mm === 'number' ? data.drop_mm : 0)], Math.atan2(dy, dx),
        { kind: 'box', size_mm: [length, section[0], section[1]] }, { kind: 'select_only' })
    }
    case 'architecture.wall': {
      const start = data.start_point_mm, end = data.end_point_mm
      const thickness = resolveValue(project, object, data, 'thickness_mm')
      const masonryThickness = resolveValue(project, object, data, 'masonry_thickness_mm')
      const insidePlasterThickness = resolveValue(project, object, data, 'plaster_inside_thickness_mm')
      const outsidePlasterThickness = resolveValue(project, object, data, 'plaster_outside_thickness_mm')
      const insideSign = resolveValue(project, object, data, 'interior_side') === 'right' ? -1 : 1
      const vertical = resolveWallVerticalExtent(project, data)
      const height = vertical?.height_mm
      if (!tuple3(start) || !tuple3(end) || !isPositive(thickness) || !isPositive(height)) {
        warnings.push(`${object.id}: wall endpoints, thickness or height are invalid; 3D representation omitted`)
        return undefined
      }
      const dx = end[0] - start[0], dy = end[1] - start[1]
      const length = Math.hypot(dx, dy)
      if (!isPositive(length)) {
        warnings.push(`${object.id}: wall has no horizontal span; 3D representation omitted`)
        return undefined
      }
      const cutouts: OpeningCutout[] = []
      for (const opening of Object.values(project.objects)) {
        if (opening.object_type !== 'door_window.door' && opening.object_type !== 'door_window.window') continue
        if (visibleObjectIds && !visibleObjectIds.has(opening.id)) continue
        const openingData = moduleData(opening)
        if (!openingData || openingData.wall_id !== object.id) continue
        const width = resolveValue(project, opening, openingData, 'width_mm')
        const openingVertical = resolveOpeningVerticalExtent(project, openingData)
        const openingHeight = openingVertical?.height_mm ?? resolveValue(project, opening, openingData, 'height_mm')
        const offset = openingData.offset_along_wall_mm
        const sill = openingVertical ? openingVertical.base_elevation_mm - (vertical?.base_elevation_mm ?? 0) : 0
        if (!isPositive(width) || !isPositive(openingHeight) || !isFiniteNumber(offset) || !isFiniteNumber(sill) || sill < 0) {
          warnings.push(`${opening.id}: hosted opening dimensions are invalid; wall cutout omitted`)
          continue
        }
        const minX = Math.max(0, offset - width / 2), maxX = Math.min(length, offset + width / 2)
        const minZ = Math.max(0, sill), maxZ = Math.min(height, sill + openingHeight)
        if (maxX <= minX || maxZ <= minZ) {
          warnings.push(`${opening.id}: hosted opening does not intersect wall extent; wall cutout omitted`)
          continue
        }
        cutouts.push({ object_id: opening.id, min_x_mm: minX, max_x_mm: maxX, min_z_mm: minZ, max_z_mm: maxZ })
      }
      const layers = isPositive(masonryThickness)
        ? [
            { role: 'masonry' as const, thickness_mm: masonryThickness, offset_mm: insideSign * ((isPositive(outsidePlasterThickness) ? outsidePlasterThickness : 0) - (isPositive(insidePlasterThickness) ? insidePlasterThickness : 0)) / 2, material: String(resolveValue(project, object, data, 'material') ?? 'brick_masonry') },
            ...(isPositive(insidePlasterThickness) ? [{ role: 'plaster_inside' as const, thickness_mm: insidePlasterThickness, offset_mm: insideSign * (thickness / 2 - insidePlasterThickness / 2), material: String(resolveValue(project, object, data, 'plaster_inside_material') ?? 'cement_plaster') }] : []),
            ...(isPositive(outsidePlasterThickness) ? [{ role: 'plaster_outside' as const, thickness_mm: outsidePlasterThickness, offset_mm: -insideSign * (thickness / 2 - outsidePlasterThickness / 2), material: String(resolveValue(project, object, data, 'plaster_outside_material') ?? 'cement_plaster') }] : []),
          ]
        : undefined
      return baseObject(object, data, [start[0], start[1], vertical?.base_elevation_mm ?? start[2]], Math.atan2(dy, dx),
        { kind: 'wall_extrusion', length_mm: length, thickness_mm: thickness, height_mm: height, cutouts, ...(layers ? { layers } : {}) }, { kind: 'wall' })
    }
    case 'door_window.door':
    case 'door_window.window': {
      const hostId = data.wall_id
      const host = typeof hostId === 'string' ? project.objects[hostId] : undefined
      const hostData = host ? moduleData(host) : undefined
      const location = data.location_mm
      const width = resolveValue(project, object, data, 'width_mm')
      const vertical = resolveOpeningVerticalExtent(project, data)
      const height = vertical?.height_mm ?? resolveValue(project, object, data, 'height_mm')
      const hostVertical = hostData ? resolveWallVerticalExtent(project, hostData) : undefined
      const sill = vertical ? vertical.base_elevation_mm - (hostVertical?.base_elevation_mm ?? 0) : (object.object_type === 'door_window.window' ? resolveValue(project, object, data, 'sill_height_mm') ?? 0 : 0)
      if (!host || host.object_type !== 'architecture.wall' || !hostData || !tuple3(hostData.start_point_mm)
        || !tuple3(hostData.end_point_mm) || !tuple3(location) || !isPositive(width) || !isPositive(height)
        || !isFiniteNumber(sill) || sill < 0 || !isFiniteNumber(data.offset_along_wall_mm)) {
        warnings.push(`${object.id}: host or opening dimensions are invalid; 3D representation omitted`)
        return undefined
      }
      const dx = hostData.end_point_mm[0] - hostData.start_point_mm[0]
      const dy = hostData.end_point_mm[1] - hostData.start_point_mm[1]
      const hostLength = Math.hypot(dx, dy)
      if (!isPositive(hostLength)) {
        warnings.push(`${object.id}: host wall has no horizontal span; 3D representation omitted`)
        return undefined
      }
      const interaction: RepresentationInteraction = {
        kind: 'hosted_opening',
        host_wall_id: host.id,
        host_start_point_mm: [...hostData.start_point_mm],
        host_end_point_mm: [...hostData.end_point_mm],
        width_mm: width,
        offset_along_wall_mm: data.offset_along_wall_mm,
      }
      const operationValue = resolveValue(project, object, data, 'opening_operation')
      const operations = ['hinged', 'sliding', 'fixed', 'awning', 'louver'] as const
      const operation = operations.includes(operationValue as typeof operations[number])
        ? operationValue as typeof operations[number]
        : object.object_type === 'door_window.door' ? 'hinged' : 'sliding'
      const panelCountValue = resolveValue(project, object, data, 'panel_count')
      const panelCount = isPositive(panelCountValue) ? Math.min(8, Math.floor(panelCountValue)) : object.object_type === 'door_window.window' ? 2 : 1
      const panelLayoutValue = resolveValue(project, object, data, 'panel_layout')
      const panelOperations = ['hinged', 'sliding', 'fixed', 'awning', 'louver'] as const
      const panelLayout = Array.isArray(panelLayoutValue) && panelLayoutValue.length === panelCount
        && panelLayoutValue.every(value => panelOperations.includes(value as typeof panelOperations[number]))
        ? panelLayoutValue as Array<typeof panelOperations[number]>
        : Array.from({ length: panelCount }, () => operation)
      const panelWidthRatiosValue = resolveValue(project, object, data, 'panel_width_ratios')
      const panelWidthRatios = Array.isArray(panelWidthRatiosValue) && panelWidthRatiosValue.length === panelCount
        && panelWidthRatiosValue.every(value => typeof value === 'number' && Number.isFinite(value) && value > 0)
        && Math.abs(panelWidthRatiosValue.reduce((sum, value) => sum + value, 0) - 1) < 0.001
        ? panelWidthRatiosValue as number[]
        : Array.from({ length: panelCount }, () => 1 / panelCount)
      const transomHeight = resolveValue(project, object, data, 'transom_height_mm')
      const bottomLightHeight = object.object_type === 'door_window.window' ? resolveValue(project, object, data, 'bottom_light_height_mm') : 0
      const muntinRowsValue = resolveValue(project, object, data, 'muntin_rows')
      const muntinColumnsValue = resolveValue(project, object, data, 'muntin_columns')
      const frameDepthValue = resolveValue(project, object, data, 'frame_depth_mm')
      const frameFaceWidthValue = resolveValue(project, object, data, 'frame_face_width_mm')
      const sashFaceWidthValue = resolveValue(project, object, data, 'sash_face_width_mm')
      const doorLeafThicknessValue = resolveValue(project, object, data, 'door_leaf_thickness_mm')
      const frameMaterialValue = resolveValue(project, object, data, 'frame_material')
      const panelMaterialValue = resolveValue(project, object, data, 'panel_material')
      const leafStyleValue = resolveValue(project, object, data, 'door_leaf_style')
      const handleStyleValue = resolveValue(project, object, data, 'opening_handle_style')
      const hardwareFinishValue = resolveValue(project, object, data, 'opening_hardware_finish')
      const glazingValue = resolveValue(project, object, data, 'glazing_material')
      const transmissionValue = resolveValue(project, object, data, 'glazing_transmission')
      const glazingMaterials = ['none', 'clear_glass', 'frosted_glass', 'tinted_glass'] as const
      const glazingMaterial = glazingMaterials.includes(glazingValue as typeof glazingMaterials[number])
        ? glazingValue as typeof glazingMaterials[number]
        : object.object_type === 'door_window.window' ? 'clear_glass' : 'none'
      const wall = project.objects[host.id]
      const wallThickness = resolveValue(project, wall, moduleData(wall)!, 'thickness_mm')
      return baseObject(object, data, [location[0], location[1], (vertical?.base_elevation_mm ?? location[2] + sill) + height / 2], Math.atan2(dy, dx), {
        kind: 'opening',
        opening_type: object.object_type === 'door_window.door' ? 'door' : 'window',
        width_mm: width,
        height_mm: height,
        wall_thickness_mm: isPositive(wallThickness) ? wallThickness : 100,
        sill_height_mm: sill,
        operation,
        panel_count: panelCount,
        panel_layout: panelLayout,
        panel_width_ratios: panelWidthRatios,
        transom_height_mm: isPositive(transomHeight) ? Math.min(transomHeight, height * 0.45) : 0,
        bottom_light_height_mm: isPositive(bottomLightHeight) ? Math.min(bottomLightHeight, height * 0.45) : 0,
        muntin_rows: isPositive(muntinRowsValue) ? Math.min(8, Math.floor(muntinRowsValue)) : 1,
        muntin_columns: isPositive(muntinColumnsValue) ? Math.min(8, Math.floor(muntinColumnsValue)) : 1,
        transom_muntin_rows: Math.max(1, Math.min(8, Math.floor(Number(resolveValue(project, object, data, 'transom_muntin_rows')) || 1))),
        transom_muntin_columns: Math.max(1, Math.min(8, Math.floor(Number(resolveValue(project, object, data, 'transom_muntin_columns')) || 1))),
        bottom_light_muntin_rows: Math.max(1, Math.min(8, Math.floor(Number(resolveValue(project, object, data, 'bottom_light_muntin_rows')) || 1))),
        bottom_light_muntin_columns: Math.max(1, Math.min(8, Math.floor(Number(resolveValue(project, object, data, 'bottom_light_muntin_columns')) || 1))),
        frame_depth_mm: isPositive(frameDepthValue) ? frameDepthValue : 65,
        frame_face_width_mm: isPositive(frameFaceWidthValue) ? frameFaceWidthValue : 50,
        sash_face_width_mm: isPositive(sashFaceWidthValue) ? sashFaceWidthValue : 50,
        door_leaf_thickness_mm: isPositive(doorLeafThicknessValue) ? doorLeafThicknessValue : 50,
        frame_material: typeof frameMaterialValue === 'string' ? frameMaterialValue : 'aluminium',
        panel_material: typeof panelMaterialValue === 'string' ? panelMaterialValue : undefined,
        door_face_components: resolveValue(project, object, data, 'door_face_components') as DoorFaceComponent[] | undefined,
        door_leaf_style: ['flush', 'raised_2_panel', 'raised_4_panel', 'raised_6_panel', 'horizontal_grooves_3', 'horizontal_grooves_5', 'vertical_grooves_3', 'louvered'].includes(String(leafStyleValue)) ? leafStyleValue as 'flush' | 'raised_2_panel' | 'raised_4_panel' | 'raised_6_panel' | 'horizontal_grooves_3' | 'horizontal_grooves_5' | 'vertical_grooves_3' | 'louvered' : operation === 'louver' ? 'louvered' : 'raised_2_panel',
        opening_handle_style: ['lever', 'round_knob', 'pull_handle', 'recessed_pull', 'none'].includes(String(handleStyleValue)) ? handleStyleValue as 'lever' | 'round_knob' | 'pull_handle' | 'recessed_pull' | 'none' : operation === 'sliding' ? 'recessed_pull' : 'lever',
        opening_hardware_finish: ['stainless', 'matte_black', 'satin_brass', 'bronze'].includes(String(hardwareFinishValue)) ? hardwareFinishValue as 'stainless' | 'matte_black' | 'satin_brass' | 'bronze' : 'stainless',
        glazing_material: glazingMaterial,
        glazing_transmission: isFiniteNumber(transmissionValue) ? Math.max(0, Math.min(1, transmissionValue)) : (glazingMaterial === 'none' ? 0 : 0.72),
        handing: object.object_type === 'door_window.door' && typeof data.handing === 'string' ? data.handing : undefined,
      }, interaction)
    }
    default:
      return undefined
  }
}

/** Build deterministic, renderer-neutral 3D descriptions for supported Smart Objects. */
export function buildProjectRepresentations3D(project: ProjectDocument, options: { visibleObjectIds?: ReadonlySet<string> } = {}): RepresentationResult {
  const warnings: string[] = []
  const objects = Object.values(project.objects)
    .filter(object => !options.visibleObjectIds || options.visibleObjectIds.has(object.id))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(object => representObject(project, object, warnings, options.visibleObjectIds))
    .filter((object): object is ObjectRepresentation3D => object !== undefined)
  for (const out of constructionOutputs(project)) {
    if (options.visibleObjectIds && !options.visibleObjectIds.has(out.object_id)) continue
    const object = project.objects[out.object_id], data = moduleData(object) ?? {}
    const triangles = [...out.meshes]
    if (!triangles.length) for(const path of out.paths) for(let i=1;i<path.length;i++) if(Math.hypot(...path[i].map((v,j)=>v-path[i-1][j]))>1e-8)triangles.push(...tube(path[i-1],path[i],typeof data.diameter_mm==='number'?data.diameter_mm/2:10))
    if(triangles.length) objects.push(baseObject(object,data,[0,0,0],0,{kind:'triangle_mesh',triangles_mm:triangles},{kind:'select_only'}))
    warnings.push(...out.warnings.map(w=>`${object.id}: ${w}`))
  }
  return { objects, warnings }
}
