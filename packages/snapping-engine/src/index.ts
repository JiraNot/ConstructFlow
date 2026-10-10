import { type ProjectDocument, isColumnObject, isGridObject, isBeamObject, isWallObject } from '@constructflow/project-model'

export interface SnapViewport { zoom: number }

export type SnapKind =
  | 'grid_intersection' | 'grid_line'
  | 'column_center' | 'column_corner' | 'column_face'
  | 'beam_endpoint' | 'beam_midpoint' | 'beam_axis' | 'beam_edge'
  | 'wall_endpoint' | 'wall_corner' | 'wall_midpoint' | 'wall_centerline' | 'wall_face'
  | 'intersection' | 'parallel' | 'perpendicular' | 'free'

export type SnapMode = 'grid' | 'center' | 'endpoint' | 'midpoint' | 'face' | 'centerline' | 'intersection'
export const DEFAULT_SNAP_MODES: SnapMode[] = ['grid', 'center', 'endpoint', 'midpoint', 'face', 'centerline', 'intersection']

export interface SnapResult {
  point_mm: [number, number]
  kind: SnapKind
  target_id?: string
  description: string
}

interface SnapCandidate extends SnapResult {
  distance_sq: number
  priority: number
}
type Point = [number, number]
interface Segment { start: Point; end: Point; object_id: string; source: 'beam' | 'wall' }
export interface LinearReference {
  target_id: string
  description: string
  start_mm: Point
  end_mm: Point
  distance_mm: number
}

const distSq = (a: Point, b: Point) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2
const midpoint = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]

function projectToSegment(point: Point, start: Point, end: Point): { point: Point; t: number } {
  const dx = end[0] - start[0], dy = end[1] - start[1]
  const lengthSq = dx * dx + dy * dy
  if (lengthSq <= 0) return { point: [...start], t: 0 }
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSq))
  return { point: [start[0] + dx * t, start[1] + dy * t], t }
}

function closestSegmentIntersection(a: Segment, b: Segment): Point | null {
  const p = a.start, r: Point = [a.end[0] - a.start[0], a.end[1] - a.start[1]]
  const q = b.start, s: Point = [b.end[0] - b.start[0], b.end[1] - b.start[1]]
  const cross = (u: Point, v: Point) => u[0] * v[1] - u[1] * v[0]
  const denominator = cross(r, s)
  if (Math.abs(denominator) < 1e-7) return null
  const qp: Point = [q[0] - p[0], q[1] - p[1]]
  const t = cross(qp, s) / denominator, u = cross(qp, r) / denominator
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return [p[0] + t * r[0], p[1] + t * r[1]]
}

/** Finds a nearby beam or wall centerline to use as a drawing constraint. */
export function findNearestLinearReference(
  project: ProjectDocument,
  anchor_mm: Point,
  maxDistanceMm = 150,
): LinearReference | null {
  const candidates: LinearReference[] = []
  for (const object of Object.values(project.objects)) {
    if (!isBeamObject(object) && !isWallObject(object)) continue
    const data = object.module_data
    const [sx, sy] = data.start_point_mm
    const [ex, ey] = data.end_point_mm
    const projected = projectToSegment(anchor_mm, [sx, sy], [ex, ey])
    const distance_mm = Math.sqrt(distSq(anchor_mm, projected.point))
    if (distance_mm > maxDistanceMm) continue
    candidates.push({
      target_id: object.id,
      description: `${isBeamObject(object) ? 'คาน' : 'ผนัง'} ${data.mark || object.id}`,
      start_mm: [sx, sy],
      end_mm: [ex, ey],
      distance_mm,
    })
  }
  candidates.sort((a, b) => a.distance_mm - b.distance_mm || a.target_id.localeCompare(b.target_id))
  return candidates[0] ?? null
}

/** Projects a drawing endpoint onto a parallel or perpendicular ray from its start point. */
export function constrainPointToReference(
  point_mm: Point,
  origin_mm: Point,
  reference: LinearReference,
  mode: 'parallel' | 'perpendicular',
): SnapResult {
  const dx = reference.end_mm[0] - reference.start_mm[0]
  const dy = reference.end_mm[1] - reference.start_mm[1]
  const length = Math.hypot(dx, dy)
  if (length < 1) return { point_mm, kind: 'free', description: 'แนวอ้างอิงสั้นเกินไป' }
  const direction: Point = mode === 'parallel' ? [dx / length, dy / length] : [-dy / length, dx / length]
  const delta: Point = [point_mm[0] - origin_mm[0], point_mm[1] - origin_mm[1]]
  const projectedLength = delta[0] * direction[0] + delta[1] * direction[1]
  return {
    point_mm: [Math.round(origin_mm[0] + direction[0] * projectedLength), Math.round(origin_mm[1] + direction[1] * projectedLength)],
    kind: mode,
    target_id: reference.target_id,
    description: `${mode === 'parallel' ? 'ขนาน' : 'ตั้งฉาก'}กับ${reference.description}`,
  }
}

/** Infers a parallel/perpendicular constraint when the pointer is close to either projection. */
export function inferLinearConstraint(
  point_mm: Point,
  origin_mm: Point,
  reference: LinearReference,
  tolerance_mm: number,
): 'parallel' | 'perpendicular' | null {
  const dx = reference.end_mm[0] - reference.start_mm[0]
  const dy = reference.end_mm[1] - reference.start_mm[1]
  const refLength = Math.hypot(dx, dy)
  const pointerLength = Math.hypot(point_mm[0] - origin_mm[0], point_mm[1] - origin_mm[1])
  if (refLength < 1 || pointerLength < 1 || tolerance_mm < 0) return null

  const ux = dx / refLength, uy = dy / refLength
  const projectedLength = (point_mm[0] - origin_mm[0]) * ux + (point_mm[1] - origin_mm[1]) * uy
  const parallelPoint: Point = [origin_mm[0] + ux * projectedLength, origin_mm[1] + uy * projectedLength]
  const perpendicularPoint: Point = [origin_mm[0] - uy * ((point_mm[0] - origin_mm[0]) * -uy + (point_mm[1] - origin_mm[1]) * ux), origin_mm[1] + ux * ((point_mm[0] - origin_mm[0]) * -uy + (point_mm[1] - origin_mm[1]) * ux)]
  const parallelDistance = Math.sqrt(distSq(point_mm, parallelPoint))
  const perpendicularDistance = Math.sqrt(distSq(point_mm, perpendicularPoint))
  if (parallelDistance > tolerance_mm && perpendicularDistance > tolerance_mm) return null
  return parallelDistance <= perpendicularDistance ? 'parallel' : 'perpendicular'
}

function rectangleCorners(center: Point, width: number, depth: number, rotationDeg: number): Point[] {
  const angle = rotationDeg * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle)
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const x = sx * width / 2, y = sy * depth / 2
    return [center[0] + c * x - s * y, center[1] + s * x + c * y]
  })
}

function snapModeFor(kind: SnapKind): SnapMode | null {
  if (kind === 'grid_intersection' || kind === 'grid_line') return 'grid'
  if (kind === 'column_center') return 'center'
  if (kind.includes('endpoint') || kind === 'column_corner' || kind === 'wall_corner') return 'endpoint'
  if (kind.includes('midpoint')) return 'midpoint'
  if (kind === 'column_face' || kind === 'beam_edge' || kind === 'wall_face') return 'face'
  if (kind === 'wall_centerline' || kind === 'beam_axis') return 'centerline'
  if (kind === 'intersection') return 'intersection'
  return null
}

export function snapPoint(
  rawWorldPoint_mm: Point,
  project: ProjectDocument,
  viewport: SnapViewport,
  snapDistanceScreenPx = 16,
  enabledModes: ReadonlySet<SnapMode> = new Set(DEFAULT_SNAP_MODES),
  excludedObjectId?: string,
): SnapResult {
  const toleranceMm = snapDistanceScreenPx / Math.max(viewport.zoom, 0.0001)
  const toleranceSq = toleranceMm * toleranceMm
  const candidates: SnapCandidate[] = []
  const verticalGrids: { id: string; tag: string; pos: number }[] = []
  const horizontalGrids: { id: string; tag: string; pos: number }[] = []
  const angledGrids: { id: string; tag: string; start: Point; end: Point }[] = []
  const segments: Segment[] = []

  const offer = (point: Point, kind: SnapKind, targetId: string | undefined, description: string, priority: number) => {
    if (excludedObjectId && targetId === excludedObjectId) return
    const distance_sq = distSq(rawWorldPoint_mm, point)
    const mode = snapModeFor(kind)
    if (distance_sq > toleranceSq || (mode && !enabledModes.has(mode))) return
    candidates.push({ point_mm: [Math.round(point[0]), Math.round(point[1])], kind, target_id: targetId, description, distance_sq, priority })
  }

  for (const object of Object.values(project.objects)) {
    if (isGridObject(object)) {
      const { tag, orientation, position_mm } = object.module_data
      if (object.module_data.start_point_mm && object.module_data.end_point_mm) {
        angledGrids.push({ id: object.id, tag, start: object.module_data.start_point_mm, end: object.module_data.end_point_mm })
        continue
      }
      if (orientation === 'vertical') verticalGrids.push({ id: object.id, tag, pos: position_mm })
      else horizontalGrids.push({ id: object.id, tag, pos: position_mm })
      continue
    }
    if (isColumnObject(object)) {
      const [cx, cy] = object.module_data.location_mm
      const [width, depth] = object.module_data.section_mm
      const corners = rectangleCorners([cx, cy], width, depth, object.module_data.rotation_deg || 0)
      // A precise center point must win over the nearby projected faces, even
      // at typical plan zoom where half a column is only a few screen pixels.
      offer([cx, cy], 'column_center', object.id, `เสากึ่งกลาง ${object.module_data.mark || ''}`.trim(), 0)
      corners.forEach((corner, index) => offer(corner, 'column_corner', object.id, `มุมเสา ${object.module_data.mark || ''} ${index + 1}`.trim(), 0))
      for (let index = 0; index < 4; index++) {
        const start = corners[index], end = corners[(index + 1) % 4]
        const projected = projectToSegment(rawWorldPoint_mm, start, end)
        offer(projected.point, 'column_face', object.id, `ขอบเสา ${object.module_data.mark || ''}`.trim(), 1)
      }
    } else if (isBeamObject(object)) {
      const [sx, sy] = object.module_data.start_point_mm
      const [ex, ey] = object.module_data.end_point_mm
      const start: Point = [sx, sy], end: Point = [ex, ey]
      const dx = ex - sx, dy = ey - sy, length = Math.hypot(dx, dy)
      if (length <= 1) continue
      const normal: Point = [-dy / length, dx / length]
      const halfWidth = object.module_data.section_mm[0] / 2
      offer(start, 'beam_endpoint', object.id, `ปลายคาน ${object.module_data.mark || ''}`.trim(), 0)
      offer(end, 'beam_endpoint', object.id, `ปลายคาน ${object.module_data.mark || ''}`.trim(), 0)
      offer(midpoint(start, end), 'beam_midpoint', object.id, `กึ่งกลางคาน ${object.module_data.mark || ''}`.trim(), 1)
      offer(projectToSegment(rawWorldPoint_mm, start, end).point, 'beam_axis', object.id, `แนวกลางคาน ${object.module_data.mark || ''}`.trim(), 3)
      for (const side of [-1, 1]) {
        const offset: Point = [normal[0] * halfWidth * side, normal[1] * halfWidth * side]
        const faceStart: Point = [sx + offset[0], sy + offset[1]], faceEnd: Point = [ex + offset[0], ey + offset[1]]
        offer(projectToSegment(rawWorldPoint_mm, faceStart, faceEnd).point, 'beam_edge', object.id, `ขอบคาน ${object.module_data.mark || ''}`.trim(), 1)
      }
      segments.push({ start, end, object_id: object.id, source: 'beam' })
    } else if (isWallObject(object)) {
      const [sx, sy] = object.module_data.start_point_mm
      const [ex, ey] = object.module_data.end_point_mm
      const start: Point = [sx, sy], end: Point = [ex, ey]
      const dx = ex - sx, dy = ey - sy, length = Math.hypot(dx, dy)
      if (length <= 1) continue
      const normal: Point = [-dy / length, dx / length]
      const halfThickness = object.module_data.thickness_mm / 2
      offer(start, 'wall_endpoint', object.id, `ปลายผนัง ${object.module_data.mark || ''}`.trim(), 0)
      offer(end, 'wall_endpoint', object.id, `ปลายผนัง ${object.module_data.mark || ''}`.trim(), 0)
      offer(midpoint(start, end), 'wall_midpoint', object.id, `กึ่งกลางผนัง ${object.module_data.mark || ''}`.trim(), 1)
      offer(projectToSegment(rawWorldPoint_mm, start, end).point, 'wall_centerline', object.id, `แนวกึ่งกลางผนัง ${object.module_data.mark || ''}`.trim(), 3)
      for (const side of [-1, 1]) {
        const offset: Point = [normal[0] * halfThickness * side, normal[1] * halfThickness * side]
        const faceStart: Point = [sx + offset[0], sy + offset[1]], faceEnd: Point = [ex + offset[0], ey + offset[1]]
        offer(faceStart, 'wall_corner', object.id, `มุมผนัง ${object.module_data.mark || ''}`.trim(), 0)
        offer(faceEnd, 'wall_corner', object.id, `มุมผนัง ${object.module_data.mark || ''}`.trim(), 0)
        offer(projectToSegment(rawWorldPoint_mm, faceStart, faceEnd).point, 'wall_face', object.id, `ผิวผนัง ${object.module_data.mark || ''}`.trim(), 1)
      }
      segments.push({ start, end, object_id: object.id, source: 'wall' })
    }
  }

  for (const vg of verticalGrids) {
    for (const hg of horizontalGrids) offer([vg.pos, hg.pos], 'grid_intersection', `${vg.tag}-${hg.tag}`, `Grid ${vg.tag} / ${hg.tag}`, 0)
    offer([vg.pos, rawWorldPoint_mm[1]], 'grid_line', vg.id, `Grid ${vg.tag}`, 2)
  }
  for (const hg of horizontalGrids) offer([rawWorldPoint_mm[0], hg.pos], 'grid_line', hg.id, `Grid ${hg.tag}`, 2)
  for (const grid of angledGrids) {
    const projected = projectToSegment(rawWorldPoint_mm, grid.start, grid.end)
    offer(projected.point, 'grid_line', grid.id, `Grid ${grid.tag}`, 2)
    offer(grid.start, 'grid_line', grid.id, `ปลายเส้นกริด ${grid.tag}`, 1)
    offer(grid.end, 'grid_line', grid.id, `ปลายเส้นกริด ${grid.tag}`, 1)
  }

  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      if (segments[i].object_id === segments[j].object_id) continue
      const point = closestSegmentIntersection(segments[i], segments[j])
      if (point) {
        const [firstId, secondId] = [segments[i].object_id, segments[j].object_id].sort((a, b) => a.localeCompare(b))
        offer(point, 'intersection', `${firstId}:${secondId}`, 'จุดตัดแนวคาน/ผนัง', 0)
      }
    }
  }

  // When a precise point (corner/endpoint/midpoint) and a projected edge are
  // both within a few screen pixels, prefer the precise point. Without this
  // small priority bias, an edge projection can steal the cursor just beside
  // a corner and make endpoint snapping feel unreliable.
  const priorityBiasMm = 6 / Math.max(viewport.zoom, 0.0001)
  candidates.sort((a, b) =>
    (a.distance_sq + a.priority * priorityBiasMm * priorityBiasMm) -
      (b.distance_sq + b.priority * priorityBiasMm * priorityBiasMm) ||
    a.distance_sq - b.distance_sq || a.kind.localeCompare(b.kind) || (a.target_id || '').localeCompare(b.target_id || '')
  )
  const winner = candidates[0]
  return winner
    ? { point_mm: winner.point_mm, kind: winner.kind, target_id: winner.target_id, description: winner.description }
    : { point_mm: rawWorldPoint_mm, kind: 'free', description: 'Free / อิสระ' }
}

export interface WallHostSnapResult {
  snapped: boolean
  wall_id: string
  point_mm: [number, number]
  offset_along_wall_mm: number
  wall_start_mm: [number, number]
  wall_end_mm: [number, number]
  wall_thickness_mm: number
  wall_mark: string
  description: string
}

/** Snaps an opening to the nearest host wall while preserving end clearance. */
export function snapToWallHost(
  rawWorldPoint_mm: [number, number],
  project: ProjectDocument,
  viewport: SnapViewport,
  openingWidth_mm = 800,
  snapDistanceScreenPx = 36,
): WallHostSnapResult | null {
  if (!Number.isFinite(openingWidth_mm) || openingWidth_mm <= 0) return null
  const tolerance_mm = snapDistanceScreenPx / Math.max(viewport.zoom, 0.0001)
  let closest: WallHostSnapResult | null = null
  let minPerpDist = Infinity

  for (const obj of Object.values(project.objects)) {
    if (!isWallObject(obj)) continue
    const [sx, sy] = obj.module_data.start_point_mm
    const [ex, ey] = obj.module_data.end_point_mm
    const dx = ex - sx, dy = ey - sy, length = Math.hypot(dx, dy)
    if (length < 10 || length < openingWidth_mm) continue
    const ux = dx / length, uy = dy / length
    const px = rawWorldPoint_mm[0] - sx, py = rawWorldPoint_mm[1] - sy
    const t = px * ux + py * uy
    if (t < -tolerance_mm || t > length + tolerance_mm) continue
    const halfOpening = openingWidth_mm / 2
    const minT = Math.min(halfOpening, length / 2)
    const maxT = Math.max(minT, length - halfOpening)
    const clampedT = Math.max(minT, Math.min(maxT, t))
    const projX = sx + clampedT * ux, projY = sy + clampedT * uy
    const perpDist = Math.hypot(rawWorldPoint_mm[0] - projX, rawWorldPoint_mm[1] - projY)
    const isCloser = perpDist < minPerpDist - 1e-9
    const isStableTie = Math.abs(perpDist - minPerpDist) <= 1e-9
      && obj.id.localeCompare(closest?.wall_id ?? '') < 0
    if (perpDist <= tolerance_mm + obj.module_data.thickness_mm / 2 && (isCloser || isStableTie)) {
      minPerpDist = perpDist
      closest = {
        snapped: true,
        wall_id: obj.id,
        point_mm: [Math.round(projX), Math.round(projY)],
        offset_along_wall_mm: Math.round(clampedT),
        wall_start_mm: [sx, sy],
        wall_end_mm: [ex, ey],
        wall_thickness_mm: obj.module_data.thickness_mm,
        wall_mark: obj.module_data.mark,
        description: `On Wall ${obj.module_data.mark} (${(clampedT / 1000).toFixed(2)}m)`,
      }
    }
  }
  return closest
}

export interface OpeningBimSnapResult {
  offset_along_wall_mm: number
  description: string
  snap_type: 'column_clearance' | 'wall_end_clearance' | 'midpoint' | 'increment' | 'free'
}

export interface OpeningBimSnapOptions {
  startColumnWidth_mm?: number
  endColumnWidth_mm?: number
  minClearance_mm?: number
  stepIncrement_mm?: number
  snapTolerance_mm?: number
}

/**
 * Snaps a proposed opening position along its host wall taking into account
 * BIM architectural rules: minimum clearance to wall ends or columns (default 100mm),
 * wall midpoint snapping, and standard 50mm increment quantization.
 */
export function snapOpeningOffsetBimAware(
  rawOffset_mm: number,
  wallLength_mm: number,
  openingWidth_mm: number,
  options: OpeningBimSnapOptions = {}
): OpeningBimSnapResult {
  const minClearance = options.minClearance_mm ?? 100
  const step = options.stepIncrement_mm ?? 50
  const tolerance = options.snapTolerance_mm ?? 50
  const halfWidth = openingWidth_mm / 2

  // Start obstacle: either column edge or wall start
  const startObstacle = options.startColumnWidth_mm ? options.startColumnWidth_mm / 2 : 0
  const minOffset = Math.round(startObstacle + minClearance + halfWidth)

  // End obstacle: either column edge or wall end
  const endObstacle = options.endColumnWidth_mm ? options.endColumnWidth_mm / 2 : 0
  const maxOffset = Math.round(wallLength_mm - (endObstacle + minClearance + halfWidth))

  // In case the wall is shorter than minOffset, clamp to available space or midpoint
  if (minOffset > maxOffset) {
    const center = Math.round(wallLength_mm / 2)
    return {
      offset_along_wall_mm: center,
      description: `Midpoint / กึ่งกลาง (${(center / 1000).toFixed(2)}m)`,
      snap_type: 'midpoint',
    }
  }

  // 1. Check start clearance snap
  if (Math.abs(rawOffset_mm - minOffset) <= tolerance) {
    return {
      offset_along_wall_mm: minOffset,
      description: options.startColumnWidth_mm
        ? `Column Clearance / ระยะขอบเสา ${minClearance} มม.`
        : `Wall End Clearance / ระยะขอบผนัง ${minClearance} มม.`,
      snap_type: options.startColumnWidth_mm ? 'column_clearance' : 'wall_end_clearance',
    }
  }

  // 2. Check end clearance snap
  if (Math.abs(rawOffset_mm - maxOffset) <= tolerance) {
    return {
      offset_along_wall_mm: maxOffset,
      description: options.endColumnWidth_mm
        ? `Column Clearance / ระยะขอบเสา ${minClearance} มม.`
        : `Wall End Clearance / ระยะขอบผนัง ${minClearance} มม.`,
      snap_type: options.endColumnWidth_mm ? 'column_clearance' : 'wall_end_clearance',
    }
  }

  // 3. Check midpoint snap
  const midpoint = Math.round(wallLength_mm / 2)
  if (Math.abs(rawOffset_mm - midpoint) <= tolerance && midpoint >= minOffset && midpoint <= maxOffset) {
    return {
      offset_along_wall_mm: midpoint,
      description: `Midpoint / กึ่งกลางผนัง (${(midpoint / 1000).toFixed(2)}m)`,
      snap_type: 'midpoint',
    }
  }

  // 4. Quantize to step increment (50 mm)
  const quantized = Math.round(rawOffset_mm / step) * step
  const clamped = Math.max(minOffset, Math.min(maxOffset, quantized))
  return {
    offset_along_wall_mm: clamped,
    description: `Step / ระยะ ${clamped} มม. (${(clamped / 1000).toFixed(2)}m)`,
    snap_type: 'increment',
  }
}

/**
 * Snaps a proposed opening width to standard architectural catalog increments
 * while respecting maximum width constraints based on wall clearance.
 */
export function snapOpeningWidthBimAware(
  rawWidth_mm: number,
  maxWidth_mm: number,
  options: {
    standardWidths_mm?: number[]
    stepIncrement_mm?: number
    snapTolerance_mm?: number
  } = {}
): number {
  const standards = options.standardWidths_mm ?? [600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1800, 2000, 2400]
  const step = options.stepIncrement_mm ?? 50
  const tolerance = options.snapTolerance_mm ?? 40

  const validMax = Math.max(100, maxWidth_mm)

  // 1. Check nearby standard width
  for (const std of standards) {
    if (std <= validMax && Math.abs(rawWidth_mm - std) <= tolerance) {
      return std
    }
  }

  // 2. Quantize to step increment
  const quantized = Math.round(rawWidth_mm / step) * step
  return Math.max(100, Math.min(validMax, quantized))
}
