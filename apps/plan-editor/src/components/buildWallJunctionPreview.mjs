import { polygonUnionBoundary } from '@constructflow/geometry-kernel'

const openingIntervalsByProject = new WeakMap()
const wallEndpointsByProject = new WeakMap()

function endpointCell(point) {
  return `${Math.floor(point[0] / 500)},${Math.floor(point[1] / 500)}`
}

function wallFootprint(project, wall) {
  const data = wall.module_data
  const type = project.types?.find(candidate => candidate.id === data.type_id && candidate.object_type === wall.object_type)
  const [ax, ay] = data.start_point_mm ?? []
  const [bx, by] = data.end_point_mm ?? []
  const length = Math.hypot(bx - ax, by - ay)
  const thickness = Number(data.thickness_mm ?? type?.parameters?.thickness_mm ?? 100)
  if (!Number.isFinite(length) || length < 1 || !Number.isFinite(thickness) || thickness <= 0) return null
  const nx = -(by - ay) / length * thickness / 2
  const ny = (bx - ax) / length * thickness / 2
  return {
    ring: [[ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny]],
    start: [ax, ay],
    end: [bx, by],
    thickness,
    mark: String(data.mark ?? type?.name ?? 'W1'),
  }
}

function getOpeningIntervalsByWall(project) {
  let intervals = openingIntervalsByProject.get(project)
  if (intervals) return intervals
  intervals = new Map()
  for (const object of Object.values(project.objects)) {
    if (object.status === 'archived' || !['door_window.door', 'door_window.window'].includes(object.object_type)) continue
    const data = object.module_data
    const hostId = data?.wall_id
    const wall = project.objects[hostId]
    if (typeof hostId !== 'string' || wall?.object_type !== 'architecture.wall') continue
    const footprint = wallFootprint(project, wall)
    if (!footprint) continue
    const width = Number(data.width_mm)
    const wallDx = footprint.end[0] - footprint.start[0], wallDy = footprint.end[1] - footprint.start[1]
    const wallLength = Math.hypot(wallDx, wallDy)
    const locationDx = Number(data.location_mm?.[0]) - footprint.start[0]
    const locationDy = Number(data.location_mm?.[1]) - footprint.start[1]
    const offset = Number.isFinite(Number(data.offset_along_wall_mm))
      ? Number(data.offset_along_wall_mm)
      : (locationDx * wallDx + locationDy * wallDy) / wallLength
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(offset)) continue
    const openings = intervals.get(hostId) ?? []
    openings.push([offset - width / 2, offset + width / 2])
    intervals.set(hostId, openings)
  }
  openingIntervalsByProject.set(project, intervals)
  return intervals
}

function junctionOverlapsOpening(wall, point, openingIntervals, candidateThickness) {
  if (!openingIntervals?.length) return false
  const dx = wall.end[0] - wall.start[0], dy = wall.end[1] - wall.start[1]
  const length = Math.hypot(dx, dy)
  if (length < 1) return true
  const along = ((point[0] - wall.start[0]) * dx + (point[1] - wall.start[1]) * dy) / length
  const halfJunction = candidateThickness / 2 + 2
  return openingIntervals.some(([start, end]) => along + halfJunction >= start && along - halfJunction <= end)
}

function getWallEndpointIndex(project) {
  let endpoints = wallEndpointsByProject.get(project)
  if (endpoints) return endpoints
  endpoints = new Map()
  for (const wall of Object.values(project.objects)) {
    if (wall.status === 'archived' || wall.object_type !== 'architecture.wall') continue
    for (const point of [wall.module_data?.start_point_mm, wall.module_data?.end_point_mm]) {
      if (!Array.isArray(point) || point.length < 2) continue
      const key = endpointCell(point), ids = endpoints.get(key) ?? new Set()
      ids.add(wall.id)
      endpoints.set(key, ids)
    }
  }
  wallEndpointsByProject.set(project, endpoints)
  return endpoints
}

function addNearbyEndpointWalls(ids, index, point) {
  const [cellX, cellY] = endpointCell(point).split(',').map(Number)
  for (let x = cellX - 1; x <= cellX + 1; x++) for (let y = cellY - 1; y <= cellY + 1; y++) {
    for (const id of index.get(`${x},${y}`) ?? []) ids.add(id)
  }
}

function distanceToSegment(point, start, end) {
  const dx = end[0] - start[0], dy = end[1] - start[1]
  const lengthSq = dx * dx + dy * dy
  if (lengthSq <= 0) return Math.hypot(point[0] - start[0], point[1] - start[1])
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSq))
  return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy))
}

/** Preview the union outline where a pending wall meets walls selected by BIM snapping. */
/** @param {string | string[]} [startHostWallIds=[]] */
export function buildWallJunctionPreview(project, snap, start, end, thicknessMm, startHostWallIds = []) {
  const ids = new Set()
  const hostIds = Array.isArray(startHostWallIds) ? startHostWallIds : [startHostWallIds]
  for (const id of hostIds) if (typeof id === 'string') ids.add(id)
  if (snap?.kind.startsWith('wall_') && typeof snap.target_id === 'string') ids.add(snap.target_id)
  if (snap?.kind === 'intersection' && typeof snap.target_id === 'string') {
    for (const id of snap.target_id.split(':')) ids.add(id)
  }
  const endpointIndex = getWallEndpointIndex(project)
  for (const point of [start, end]) addNearbyEndpointWalls(ids, endpointIndex, point)
  if (!ids.size) return null

  const openingIntervals = getOpeningIntervalsByWall(project)
  const candidate = { start, end, thickness: Number(thicknessMm) }
  if (!Number.isFinite(candidate.thickness) || candidate.thickness <= 0) return null
  const connected = []
  for (const id of ids) {
    const wall = project.objects[id]
    if (!wall || wall.status === 'archived' || wall.object_type !== 'architecture.wall') continue
    const footprint = wallFootprint(project, wall)
    if (!footprint) continue
    const threshold = (candidate.thickness + footprint.thickness) / 2 + 2
    const contactPoint = [start, end].find(point => distanceToSegment(point, footprint.start, footprint.end) <= threshold)
    const snappedToWall = snap?.target_id === id || snap?.target_id?.split(':').includes(id)
    if (!contactPoint && !snappedToWall) continue
    const junctionPoint = contactPoint ?? snap.point_mm
    if (junctionOverlapsOpening(footprint, junctionPoint, openingIntervals.get(id), candidate.thickness)) continue
    connected.push({ id, ...footprint })
  }
  if (!connected.length) return null

  const candidateLength = Math.hypot(end[0] - start[0], end[1] - start[1])
  if (candidateLength < 1) return null
  const nx = -(end[1] - start[1]) / candidateLength * candidate.thickness / 2
  const ny = (end[0] - start[0]) / candidateLength * candidate.thickness / 2
  const candidateRing = [[start[0] + nx, start[1] + ny], [end[0] + nx, end[1] + ny], [end[0] - nx, end[1] - ny], [start[0] - nx, start[1] - ny]]
  const segments = polygonUnionBoundary([...connected.map(wall => wall.ring), candidateRing])
  if (!segments.length) return null
  return {
    point_mm: [...(snap?.kind !== 'free' ? snap.point_mm : start)],
    target_count: connected.length,
    target_marks: connected.map(wall => wall.mark),
    segments_mm: segments,
  }
}
