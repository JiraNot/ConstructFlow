import { polygonUnionBoundary } from '@constructflow/geometry-kernel'

const openingsByProject = new WeakMap()
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

function getOpeningHosts(project) {
  let hosts = openingsByProject.get(project)
  if (hosts) return hosts
  hosts = new Set()
  for (const object of Object.values(project.objects)) {
    if (object.status === 'archived' || !['door_window.door', 'door_window.window'].includes(object.object_type)) continue
    const hostId = object.module_data?.wall_id
    if (typeof hostId === 'string') hosts.add(hostId)
  }
  openingsByProject.set(project, hosts)
  return hosts
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
export function buildWallJunctionPreview(project, snap, start, end, thicknessMm, startHostWallId) {
  const ids = new Set()
  if (typeof startHostWallId === 'string') ids.add(startHostWallId)
  if (snap?.kind.startsWith('wall_') && typeof snap.target_id === 'string') ids.add(snap.target_id)
  if (snap?.kind === 'intersection' && typeof snap.target_id === 'string') {
    for (const id of snap.target_id.split(':')) ids.add(id)
  }
  const endpointIndex = getWallEndpointIndex(project)
  for (const point of [start, end]) addNearbyEndpointWalls(ids, endpointIndex, point)
  if (!ids.size) return null

  const openingHosts = getOpeningHosts(project)
  const candidate = { start, end, thickness: Number(thicknessMm) }
  if (!Number.isFinite(candidate.thickness) || candidate.thickness <= 0) return null
  const connected = []
  for (const id of ids) {
    const wall = project.objects[id]
    if (!wall || wall.status === 'archived' || wall.object_type !== 'architecture.wall' || openingHosts.has(id)) continue
    const footprint = wallFootprint(project, wall)
    if (!footprint) continue
    const threshold = (candidate.thickness + footprint.thickness) / 2 + 2
    const touches = [start, end].some(point => distanceToSegment(point, footprint.start, footprint.end) <= threshold)
    if (touches || snap?.target_id === id || snap?.target_id?.split(':').includes(id)) connected.push({ id, ...footprint })
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
