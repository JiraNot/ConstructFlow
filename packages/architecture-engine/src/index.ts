import { SmartObject, WallModuleData, DoorModuleData, WindowModuleData, DoorHanding, CATALOG_PARAMETER_FIELDS, resolveCatalogType, catalogInstanceOverrides, isWallObject, isDoorObject, isWindowObject, getLevelElevation, resolveOpeningVerticalExtent, resolveWallVerticalExtent, validateDoorFaceComponents, validateOpeningPlanSymbolLines } from '@constructflow/project-model'
import { CreateWallInput, MoveWallInput, UpdateWallEndpointsInput, MoveOpeningInput, UpdateWallMarkInput, UpdateWallDimensionsInput, CreateDoorInput, UpdateDoorMarkInput, UpdateDoorDimensionsInput, FlipDoorHandingInput, CreateWindowInput, UpdateWindowMarkInput, UpdateWindowDimensionsInput, UpdateOpeningInstanceParametersInput } from '@constructflow/command-schema'

import { CommandHandlerContext, CommandBusResult } from '@constructflow/command-schema'
import type { ProjectDocument } from '@constructflow/project-model'
export { measureOpeningRegions, type OpeningDimensions } from './openingDimensions.js'
import { preserveSegmentPlacementReference, validatePolygonWithVoids } from '@constructflow/geometry-kernel'
import { validateStairThaiBuildingCode } from './stairs.js'

const polygonAreaMm2 = (ring: number[][]) => Math.abs(ring.reduce((sum, p, i) => { const q = ring[(i + 1) % ring.length]; return sum + p[0] * q[1] - q[0] * p[1] }, 0) / 2)

export type ArchitecturalFloorPatternKind = 'tile_grid' | 'staggered_plank' | 'carpet' | 'terrazzo' | 'concrete_block' | 'glass_block'

/** Resolve plan hatch from the floor finish assembly's exposed finish material. */
export function resolveArchitecturalFloorPatternKind(
  finishLayers: readonly { material?: unknown }[],
): ArchitecturalFloorPatternKind | undefined {
  const materials = finishLayers.map(layer => String(layer.material ?? ''))
  if (materials.some(material => /tile|porcelain|ceramic|กระเบื้อง/i.test(material))) return 'tile_grid'
  if (materials.some(material => /wood|timber|laminate|vinyl[_ -]?plank|ไม้|ลามิเนต/i.test(material))) return 'staggered_plank'
  if (materials.some(material => /carpet|พรม/i.test(material))) return 'carpet'
  if (materials.some(material => /terrazzo|หินขัด/i.test(material))) return 'terrazzo'
  if (materials.some(material => /concrete[_ -]?block|คอนกรีตบล็อก/i.test(material))) return 'concrete_block'
  if (materials.some(material => /glass[_ -]?block|บล็อกแก้ว/i.test(material))) return 'glass_block'
  return undefined
}

function roomRingKey(ring: number[][], toleranceMm = 10): string {
  const points = ring.map(([x, y]) => [Math.round(x / toleranceMm), Math.round(y / toleranceMm)])
  const variants: string[] = []
  for (const ordered of [points, [...points].reverse()]) {
    for (let start = 0; start < ordered.length; start++) {
      variants.push([...ordered.slice(start), ...ordered.slice(0, start)].map(point => point.join(',')).join(';'))
    }
  }
  return variants.sort()[0] ?? ''
}

function roomRingMetrics(ring: number[][]) {
  const xs = ring.map(point => point[0]), ys = ring.map(point => point[1])
  let crossSum = 0, centerX = 0, centerY = 0
  for (let i = 0; i < ring.length; i++) {
    const current = ring[i], next = ring[(i + 1) % ring.length]
    const cross = current[0] * next[1] - next[0] * current[1]
    crossSum += cross
    centerX += (current[0] + next[0]) * cross
    centerY += (current[1] + next[1]) * cross
  }
  const center: [number, number] = Math.abs(crossSum) > 1e-8
    ? [centerX / (3 * crossSum), centerY / (3 * crossSum)]
    : [xs.reduce((sum, x) => sum + x, 0) / xs.length, ys.reduce((sum, y) => sum + y, 0) / ys.length]
  return {
    area: polygonAreaMm2(ring),
    center,
    span: Math.max(100, Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))),
  }
}

function roomEdgeWallThickness(project: ProjectDocument, levelId: string, start: [number, number], end: [number, number], toleranceMm: number): number {
  const dx = end[0] - start[0], dy = end[1] - start[1]
  const length = Math.hypot(dx, dy)
  if (length <= 1e-8) return 0
  const midpoint: [number, number] = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]
  let thickness = 0
  for (const wall of Object.values(project.objects)) {
    if (wall.object_type !== 'architecture.wall' || wall.status === 'archived' || wall.removed_phase) continue
    const data = wall.module_data as Record<string, unknown>
    if (data.level_id !== levelId) continue
    const a = data.start_point_mm as number[] | undefined, b = data.end_point_mm as number[] | undefined
    if (!a || !b) continue
    const wx = b[0] - a[0], wy = b[1] - a[1], wallLength = Math.hypot(wx, wy)
    if (wallLength <= 1e-8 || Math.abs(wx * dy - wy * dx) / (wallLength * length) > 1e-4) continue
    const t = ((midpoint[0] - a[0]) * wx + (midpoint[1] - a[1]) * wy) / (wallLength * wallLength)
    const nearest: [number, number] = [a[0] + Math.max(0, Math.min(1, t)) * wx, a[1] + Math.max(0, Math.min(1, t)) * wy]
    if (t < -toleranceMm / wallLength || t > 1 + toleranceMm / wallLength || Math.hypot(nearest[0] - midpoint[0], nearest[1] - midpoint[1]) > toleranceMm) continue
    const overrides = data.instance_overrides as Record<string, unknown> | undefined
    const typeReference = typeof data.type_id === 'string' ? data.type_id : typeof data.mark === 'string' ? data.mark : undefined
    const type = resolveCatalogType(project, 'architecture.wall', typeReference)
    const masonry = Number(data.masonry_thickness_mm ?? overrides?.masonry_thickness_mm ?? type?.parameters.masonry_thickness_mm)
    const inside = Number(data.plaster_inside_thickness_mm ?? overrides?.plaster_inside_thickness_mm ?? type?.parameters.plaster_inside_thickness_mm ?? 0)
    const outside = Number(data.plaster_outside_thickness_mm ?? overrides?.plaster_outside_thickness_mm ?? type?.parameters.plaster_outside_thickness_mm ?? 0)
    const resolvedThickness = Number(data.thickness_mm ?? overrides?.thickness_mm ?? type?.parameters.thickness_mm ?? (Number.isFinite(masonry) ? masonry + inside + outside : 0))
    if (Number.isFinite(resolvedThickness) && resolvedThickness > thickness) thickness = resolvedThickness
  }
  return thickness
}

/** Move a centerline-detected room ring to the finished interior wall faces. */
function roomInteriorFinishBoundary(project: ProjectDocument, levelId: string, ring: number[][], toleranceMm: number): number[][] {
  const count = ring.length
  if (count < 3) return ring
  const offsets = ring.map((point, index) => {
    const next = ring[(index + 1) % count]
    const dx = next[0] - point[0], dy = next[1] - point[1], length = Math.hypot(dx, dy)
    const halfThickness = roomEdgeWallThickness(project, levelId, point as [number, number], next as [number, number], toleranceMm) / 2
    return length > 1e-8 ? [-dy / length * halfThickness, dx / length * halfThickness] as [number, number] : [0, 0] as [number, number]
  })
  const boundary: number[][] = []
  for (let index = 0; index < count; index++) {
    const point = ring[index]
    const previous = ring[(index - 1 + count) % count], next = ring[(index + 1) % count]
    const firstDirection: [number, number] = [point[0] - previous[0], point[1] - previous[1]]
    const secondDirection: [number, number] = [next[0] - point[0], next[1] - point[1]]
    const firstPoint: [number, number] = [previous[0] + offsets[(index - 1 + count) % count][0], previous[1] + offsets[(index - 1 + count) % count][1]]
    const secondPoint: [number, number] = [point[0] + offsets[index][0], point[1] + offsets[index][1]]
    const denominator = firstDirection[0] * secondDirection[1] - firstDirection[1] * secondDirection[0]
    if (Math.abs(denominator) <= 1e-8) {
      const sameDirection = firstDirection[0] * secondDirection[0] + firstDirection[1] * secondDirection[1] > 0
      const incomingPoint: [number, number] = [point[0] + offsets[(index - 1 + count) % count][0], point[1] + offsets[(index - 1 + count) % count][1]]
      if (sameDirection && Math.hypot(incomingPoint[0] - secondPoint[0], incomingPoint[1] - secondPoint[1]) > 1e-6) boundary.push(incomingPoint)
      boundary.push(secondPoint)
      continue
    }
    const delta: [number, number] = [secondPoint[0] - firstPoint[0], secondPoint[1] - firstPoint[1]]
    const t = (delta[0] * secondDirection[1] - delta[1] * secondDirection[0]) / denominator
    boundary.push([firstPoint[0] + firstDirection[0] * t, firstPoint[1] + firstDirection[1] * t])
  }
  return boundary
}

/** Finds closed loops in the level's wall/separation-line graph. Endpoints within tolerance share a node. */
export function detectClosedWallRooms(project: ProjectDocument, levelId: string, toleranceMm = 10): number[][][] {
  const segments: Array<{ a: [number, number]; b: [number, number]; splits: number[] }> = []
  for (const object of Object.values(project.objects)) {
    if (object.status === 'archived' || object.removed_phase) continue
    const data = object.module_data as Record<string, unknown>
    if (object.object_type !== 'architecture.wall' && object.object_type !== 'architecture.room_separator') continue
    if (data.level_id !== levelId) continue
    const start = data.start_point_mm as number[] | undefined
    const end = data.end_point_mm as number[] | undefined
    if (!start || !end || ![start[0], start[1], end[0], end[1]].every(Number.isFinite)) continue
    const a: [number, number] = [start[0], start[1]], b: [number, number] = [end[0], end[1]]
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) <= toleranceMm) continue
    segments.push({ a, b, splits: [0, 1] })
  }
  const cross = (a: [number, number], b: [number, number]) => a[0] * b[1] - a[1] * b[0]
  const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
  const offerPoint = (segment: typeof segments[number], point: [number, number]) => {
    const dx = segment.b[0] - segment.a[0], dy = segment.b[1] - segment.a[1]
    const lengthSquared = dx * dx + dy * dy, length = Math.sqrt(lengthSquared)
    const t = ((point[0] - segment.a[0]) * dx + (point[1] - segment.a[1]) * dy) / lengthSquared
    const clamped = clamp01(t)
    const nearest: [number, number] = [segment.a[0] + clamped * dx, segment.a[1] + clamped * dy]
    if (t >= -toleranceMm / length && t <= 1 + toleranceMm / length && Math.hypot(point[0] - nearest[0], point[1] - nearest[1]) <= toleranceMm) segment.splits.push(clamped)
  }
  // Split walls where another wall/partition ends or crosses them. Without this,
  // a T-junction in the middle of an unsplit wall cannot close a room boundary.
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const first = segments[i], second = segments[j]
    const r: [number, number] = [first.b[0] - first.a[0], first.b[1] - first.a[1]]
    const s: [number, number] = [second.b[0] - second.a[0], second.b[1] - second.a[1]]
    const qmp: [number, number] = [second.a[0] - first.a[0], second.a[1] - first.a[1]]
    const denominator = cross(r, s)
    if (Math.abs(denominator) > 1e-8) {
      const t = cross(qmp, s) / denominator, u = cross(qmp, r) / denominator
      const firstEpsilon = toleranceMm / Math.hypot(...r), secondEpsilon = toleranceMm / Math.hypot(...s)
      if (t < -firstEpsilon || t > 1 + firstEpsilon || u < -secondEpsilon || u > 1 + secondEpsilon) continue
      first.splits.push(clamp01(t)); second.splits.push(clamp01(u))
    } else if (Math.abs(cross(qmp, r)) <= toleranceMm * Math.hypot(...r)) {
      offerPoint(first, second.a); offerPoint(first, second.b)
      offerPoint(second, first.a); offerPoint(second, first.b)
    }
  }
  const nodes: [number, number][] = []
  const nodeId = (point: [number, number]) => {
    let index = nodes.findIndex(node => Math.hypot(node[0] - point[0], node[1] - point[1]) <= toleranceMm)
    if (index < 0) { index = nodes.length; nodes.push(point) }
    return index
  }
  const edgeKeys = new Set<string>()
  const edges: Array<[number, number]> = []
  for (const segment of segments) {
    const dx = segment.b[0] - segment.a[0], dy = segment.b[1] - segment.a[1]
    const length = Math.hypot(dx, dy)
    const cuts = [...new Set(segment.splits.map(value => Math.round(clamp01(value) * length * 1e6) / (length * 1e6)))].sort((a, b) => a - b)
    for (let i = 1; i < cuts.length; i++) {
      const t0 = cuts[i - 1], t1 = cuts[i]
      if ((t1 - t0) * length <= toleranceMm * 0.25) continue
      const a = nodeId([segment.a[0] + t0 * dx, segment.a[1] + t0 * dy])
      const b = nodeId([segment.a[0] + t1 * dx, segment.a[1] + t1 * dy])
      if (a === b) continue
      const key = a < b ? `${a},${b}` : `${b},${a}`
      if (!edgeKeys.has(key)) { edgeKeys.add(key); edges.push([a, b]) }
    }
  }
  const graph = nodes.map(() => [] as number[])
  for (const [a, b] of edges) { graph[a].push(b); graph[b].push(a) }
  const discovery = nodes.map(() => -1), low = nodes.map(() => -1), bridges = new Set<string>()
  let clock = 0
  const edgeKey = (a: number, b: number) => a < b ? `${a},${b}` : `${b},${a}`
  const findBridges = (node: number, parent: number) => {
    discovery[node] = low[node] = clock++
    for (const neighbor of graph[node]) {
      if (neighbor === parent) continue
      if (discovery[neighbor] < 0) {
        findBridges(neighbor, node)
        low[node] = Math.min(low[node], low[neighbor])
        if (low[neighbor] > discovery[node]) bridges.add(edgeKey(node, neighbor))
      } else low[node] = Math.min(low[node], discovery[neighbor])
    }
  }
  for (let node = 0; node < nodes.length; node++) if (discovery[node] < 0) findBridges(node, -1)
  const faceEdges = edges.filter(([a, b]) => !bridges.has(edgeKey(a, b)))
  const adjacent = nodes.map(() => [] as number[])
  for (const [a, b] of faceEdges) { adjacent[a].push(b); adjacent[b].push(a) }
  for (let node = 0; node < adjacent.length; node++) adjacent[node].sort((a, b) =>
    Math.atan2(nodes[a][1] - nodes[node][1], nodes[a][0] - nodes[node][0]) - Math.atan2(nodes[b][1] - nodes[node][1], nodes[b][0] - nodes[node][0]))

  // Walk directed half-edges and keep only counter-clockwise bounded faces.
  // Enumerating arbitrary graph cycles also returns the outer perimeter and
  // unions of adjacent rooms, which incorrectly inflates room counts/areas.
  const visited = new Set<string>(), rings: number[][][] = []
  for (const [a, b] of faceEdges) for (const [from, to] of [[a, b], [b, a]] as const) {
    const startKey = `${from},${to}`
    if (visited.has(startKey)) continue
    const ringIds: number[] = []
    let currentFrom = from, currentTo = to, closed = false
    for (let step = 0; step <= faceEdges.length * 2; step++) {
      const key = `${currentFrom},${currentTo}`
      if (visited.has(key)) { closed = key === startKey; break }
      visited.add(key)
      ringIds.push(currentFrom)
      const around = adjacent[currentTo], reverseIndex = around.indexOf(currentFrom)
      if (reverseIndex < 0 || around.length < 2) break
      const next = around[(reverseIndex - 1 + around.length) % around.length]
      currentFrom = currentTo; currentTo = next
      if (currentFrom === from && currentTo === to) { closed = true; break }
    }
    if (!closed || ringIds.length < 3) continue
    const simpleIds: number[] = []
    for (const nodeId of ringIds) {
      if (simpleIds.length >= 2 && simpleIds[simpleIds.length - 2] === nodeId) simpleIds.pop()
      else simpleIds.push(nodeId)
    }
    const ring = simpleIds.map(nodeId => nodes[nodeId])
    let simplified = true
    while (simplified && ring.length > 3) {
      simplified = false
      for (let index = 0; index < ring.length; index++) {
        const previous = ring[(index - 1 + ring.length) % ring.length]
        const current = ring[index]
        const next = ring[(index + 1) % ring.length]
        const first: [number, number] = [current[0] - previous[0], current[1] - previous[1]]
        const second: [number, number] = [next[0] - current[0], next[1] - current[1]]
        const span = Math.hypot(next[0] - previous[0], next[1] - previous[1])
        const collinearDistance = span > 0 ? Math.abs(cross(first, second)) / span : Number.POSITIVE_INFINITY
        const between = first[0] * (current[0] - next[0]) + first[1] * (current[1] - next[1]) <= toleranceMm * toleranceMm
        if (collinearDistance <= toleranceMm && between) {
          const incomingThickness = roomEdgeWallThickness(project, levelId, previous as [number, number], current as [number, number], toleranceMm)
          const outgoingThickness = roomEdgeWallThickness(project, levelId, current as [number, number], next as [number, number], toleranceMm)
          if (Math.abs(incomingThickness - outgoingThickness) > 1e-6) continue
          ring.splice(index, 1)
          simplified = true
          break
        }
      }
    }
    if (ring.length < 3) continue
    const signedArea = ring.reduce((sum, point, index) => {
      const next = ring[(index + 1) % ring.length]
      return sum + point[0] * next[1] - next[0] * point[1]
    }, 0) / 2
    if (signedArea > 100_000) {
      const interiorBoundary = roomInteriorFinishBoundary(project, levelId, ring, toleranceMm)
      const interiorArea = Math.abs(interiorBoundary.reduce((sum, point, index) => {
        const next = interiorBoundary[(index + 1) % interiorBoundary.length]
        return sum + point[0] * next[1] - next[0] * point[1]
      }, 0) / 2)
      if (interiorArea > 100_000 && validatePolygonWithVoids(interiorBoundary).valid) rings.push(interiorBoundary)
    }
  }
  return rings.sort((a, b) => {
    const ma = roomRingMetrics(a), mb = roomRingMetrics(b)
    return ma.center[0] - mb.center[0] || ma.center[1] - mb.center[1]
  })
}

function createArchitectureObject(context: CommandHandlerContext, family: string, owner: string, moduleData: Record<string, unknown>, update: boolean) {
  const { project, updated, commandName, input, command_id, now, envelope } = context
  const id = String(input.id ?? crypto.randomUUID())
  const existing = updated.objects[id]
  if (update && (!existing || existing.object_type !== family)) throw new Error(`${family} object ${id} was not found`)
  const levelId = String(moduleData.level_id ?? project.project.active_level_id)
  const data = { ...moduleData }
  if (update && (family === 'architecture.floor' || family === 'architecture.ceiling')) {
    const type = resolveCatalogType(updated, family, typeof data.type_id === 'string' ? data.type_id : undefined)
    if (type) data.instance_overrides = catalogInstanceOverrides(family, data, type)
  }
  if (update && (family === 'architecture.floor' || family === 'architecture.ceiling') && Array.isArray(input.boundary_mm)) {
    const previousBoundary = (existing!.module_data as Record<string, unknown>).boundary_mm
    const boundaryChanged = JSON.stringify(input.boundary_mm) !== JSON.stringify(previousBoundary)
    if (boundaryChanged) data.follows_room_boundary = false
  }
  if (update && family === 'architecture.room' && Array.isArray(input.boundary_mm)) {
    data.area_mm2 = polygonAreaMm2(data.boundary_mm as number[][])
    data.boundary_source = commandName === 'RefreshWallDerivedRooms' ? 'walls' : 'manual'
  }
  const object: SmartObject = {
    id, object_type: family, owner_module: owner, schema_version: 1,
    created_phase: String(input.created_phase ?? input.phase ?? existing?.created_phase ?? project.project.active_phase) as SmartObject['created_phase'],
    removed_phase: existing?.removed_phase ?? null, level_refs: [{ role: 'base_level', level_id: levelId }],
    host_refs: typeof data.room_id === 'string' ? [data.room_id] : [], connector_refs: [], status: 'active',
    created_at: existing?.created_at ?? now, updated_at: now, module_data: data,
  }
  updated.objects[id] = object
  const affected=[id]
  if(family==='architecture.room'&&Array.isArray(data.boundary_mm)){
    for(const child of Object.values(updated.objects)){
      const childData=child.module_data as Record<string,unknown>
      if(childData.room_id!==id||childData.follows_room_boundary!==true)continue
      updated.objects[child.id]={...child,module_data:{...childData,boundary_mm:structuredClone(data.boundary_mm),room_boundary_status:'closed'},updated_at:now}
      affected.push(child.id)
    }
  }
  return {result:{status:'success' as const,command_id,command_name:commandName,affected_object_ids:affected,updated_object_ids:affected,created_object_ids:existing?undefined:[id]},updatedProject:updated,emittedEnvelope:{...envelope,input:{...input,id}}}
}

export function refreshWallDerivedRooms(context: CommandHandlerContext, levelIds: string[], createMissing = false) {
  const { updated, now } = context
  const result = { created: [] as string[], updated: [] as string[], updatedObjects: [] as string[], affected: [] as string[] }
  for (const levelId of new Set(levelIds)) {
    if (!updated.levels.some(level => level.id === levelId)) continue
    const rings = detectClosedWallRooms(updated, levelId)
    const levelRooms = Object.values(updated.objects).filter(object => object.object_type === 'architecture.room' && (object.module_data as Record<string, unknown>).level_id === levelId)
    const existing = new Set(levelRooms.map(object => roomRingKey((object.module_data as Record<string, unknown>).boundary_mm as number[][])))
    const usedRoomMarks = new Set(levelRooms.map(object => String((object.module_data as Record<string, unknown>).mark ?? '')))
    const usedRoomNumbers = new Set(levelRooms.map(object => String((object.module_data as Record<string, unknown>).number ?? '')))
    const wallRooms = levelRooms.filter(object => (object.module_data as Record<string, unknown>).boundary_source === 'walls')
    const matched = new Set<string>()
    for (const boundary of rings) {
      const key = roomRingKey(boundary)
      const nextMetrics = roomRingMetrics(boundary)
      const match = wallRooms.filter(room => !matched.has(room.id)).map(room => {
        const oldData = room.module_data as Record<string, unknown>
        const oldMetrics = roomRingMetrics(oldData.boundary_mm as number[][])
        const ratio = Math.min(nextMetrics.area, oldMetrics.area) / Math.max(nextMetrics.area, oldMetrics.area)
        const distance = Math.hypot(nextMetrics.center[0] - oldMetrics.center[0], nextMetrics.center[1] - oldMetrics.center[1]) / Math.max(nextMetrics.span, oldMetrics.span)
        return { room, score: Math.abs(Math.log(Math.max(ratio, 1e-9))) + distance }
      }).sort((a, b) => a.score - b.score)[0]
      if (match && match.score <= 2) {
        const oldData = match.room.module_data as Record<string, unknown>
        const internalContext = { ...context, commandName: 'RefreshWallDerivedRooms', input: { ...oldData, id: match.room.id, level_id: levelId, boundary_mm: boundary, area_mm2: nextMetrics.area, boundary_source: 'walls' } }
        const objectResult = createArchitectureObject(internalContext, 'architecture.room', 'constructflow.architecture', { ...oldData, level_id: levelId, boundary_mm: boundary, area_mm2: nextMetrics.area, boundary_source: 'walls', boundary_status: 'closed' }, true)
        matched.add(match.room.id)
        result.updated.push(match.room.id)
        result.updatedObjects.push(...(objectResult.result.updated_object_ids ?? []))
        result.affected.push(...objectResult.result.affected_object_ids)
        existing.add(key)
        continue
      }
      if (!createMissing || existing.has(key)) continue
      let roomNumber = 1
      while (usedRoomNumbers.has(String(roomNumber)) || usedRoomMarks.has(`R${roomNumber}`)) roomNumber++
      const id = crypto.randomUUID(), name = String(context.input.default_name ?? 'Room')
      const input = { id, level_id: levelId, mark: `R${roomNumber}`, name: `${name} ${roomNumber}`, number: String(roomNumber), boundary_mm: boundary, area_mm2: nextMetrics.area, boundary_source: 'walls', boundary_status: 'closed' }
      const objectResult = createArchitectureObject({ ...context, commandName: 'RefreshWallDerivedRooms', input }, 'architecture.room', 'constructflow.architecture', input, false)
      result.created.push(id)
      result.affected.push(...objectResult.result.affected_object_ids)
      usedRoomMarks.add(input.mark)
      usedRoomNumbers.add(input.number)
      existing.add(key)
    }
    for (const room of wallRooms) {
      if (matched.has(room.id) || (room.module_data as Record<string, unknown>).boundary_status === 'unclosed') continue
      const data = room.module_data as Record<string, unknown>
      updated.objects[room.id] = { ...room, module_data: { ...data, boundary_status: 'unclosed' }, updated_at: now }
      result.updated.push(room.id)
      result.updatedObjects.push(room.id)
      result.affected.push(room.id)
      for (const child of Object.values(updated.objects)) {
        const childData = child.module_data as Record<string, unknown>
        if (childData.room_id !== room.id || childData.follows_room_boundary !== true) continue
        updated.objects[child.id] = { ...child, module_data: { ...childData, room_boundary_status: 'unclosed' }, updated_at: now }
        result.updatedObjects.push(child.id)
        result.affected.push(child.id)
      }
    }
  }
  result.created = [...new Set(result.created)]
  result.updated = [...new Set(result.updated)]
  result.updatedObjects = [...new Set(result.updatedObjects)]
  result.affected = [...new Set(result.affected)]
  return result
}

function shiftHostedOpenings(project: ProjectDocument, wallId: string, shiftMm: [number, number], now: string): string[] {
  if (Math.hypot(...shiftMm) < 1e-8) return []
  const affected: string[] = []
  for (const [id, object] of Object.entries(project.objects)) {
    if (!isDoorObject(object) && !isWindowObject(object)) continue
    if (object.module_data.wall_id !== wallId) continue
    const [x, y, z] = object.module_data.location_mm
    project.objects[id] = {
      ...object,
      module_data: { ...object.module_data, location_mm: [x + shiftMm[0], y + shiftMm[1], z] },
      updated_at: now,
      revision_meta: { ...object.revision_meta, dirty_quantity: true, dirty_drawing: true },
    }
    affected.push(id)
  }
  return affected
}

function positiveCatalogNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function nonNegativeCatalogNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

function catalogString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

/** Project an XY point onto a wall centerline and clamp it so a hosted opening fits. */
export function projectPointToWallOffsetMm(
  point_mm: [number, number],
  start_point_mm: [number, number],
  end_point_mm: [number, number],
  opening_width_mm: number,
): number | undefined {
  if (![...point_mm, ...start_point_mm, ...end_point_mm, opening_width_mm].every(Number.isFinite) || opening_width_mm <= 0) return undefined
  const dx = end_point_mm[0] - start_point_mm[0]
  const dy = end_point_mm[1] - start_point_mm[1]
  const length = Math.hypot(dx, dy)
  if (!Number.isFinite(length) || length < opening_width_mm) return undefined
  const projected = ((point_mm[0] - start_point_mm[0]) * dx + (point_mm[1] - start_point_mm[1]) * dy) / length
  return Math.max(opening_width_mm / 2, Math.min(length - opening_width_mm / 2, projected))
}

/** Domain-owned lifecycle query; the transaction runtime performs generic deletion. */
export function getArchitectureDeletionDependents(project: ProjectDocument, objectId: string): string[] {
  if (project.objects[objectId]?.object_type !== 'architecture.wall') return []
  return Object.values(project.objects)
    .filter(obj => (isDoorObject(obj) || isWindowObject(obj)) && obj.module_data.wall_id === objectId)
    .map(obj => obj.id)
}

export function executeArchitectureCommand(context: CommandHandlerContext): CommandBusResult | undefined {
  const { project, updated, commandName, input, command_id, now, envelope } = context
  switch (commandName) {
    case 'CreateRoom': case 'UpdateRoom': case 'CreateRoomSeparator': case 'UpdateRoomSeparator':
    case 'CreateArchitecturalFloor': case 'UpdateArchitecturalFloor': case 'CreateCeiling': case 'UpdateCeiling': {
      const familyByCommand: Record<string,string> = {
        CreateRoom:'architecture.room',UpdateRoom:'architecture.room',CreateRoomSeparator:'architecture.room_separator',UpdateRoomSeparator:'architecture.room_separator',
        CreateArchitecturalFloor:'architecture.floor',UpdateArchitecturalFloor:'architecture.floor',CreateCeiling:'architecture.ceiling',UpdateCeiling:'architecture.ceiling',
      }
      const family=familyByCommand[commandName]
      const update=commandName.startsWith('Update')
      const payload={...input}
      if(!update&&(family==='architecture.floor'||family==='architecture.ceiling')&&typeof payload.room_id==='string'){
        const room=updated.objects[payload.room_id]
        if(room?.object_type!=='architecture.room')throw new Error('A valid room is required to create a room-based floor or ceiling')
        if((room.module_data as Record<string,unknown>).boundary_status==='unclosed')throw new Error('Cannot create a room-based floor or ceiling while the room wall loop is open; close the wall loop and verify its boundary first')
      }
      if((family==='architecture.floor'||family==='architecture.ceiling')&&typeof payload.room_id==='string'&&payload.boundary_mm===undefined){
        const room=updated.objects[payload.room_id]
        payload.boundary_mm=structuredClone((room.module_data as Record<string,unknown>).boundary_mm)
        payload.level_id=(room.module_data as Record<string,unknown>).level_id
        payload.follows_room_boundary=true
        if(payload.elevation_mm===undefined)payload.elevation_mm=project.levels.find(level=>level.id===payload.level_id)?.elevation_mm??0
      }
      if(family==='architecture.floor'||family==='architecture.ceiling'){
        const levelId=String(payload.level_id??project.project.active_level_id)
        const level=project.levels.find(item=>item.id===levelId)
        if(!level)throw new Error(`${family} references unknown level ${levelId}`)
        payload.level_id=levelId
        if(payload.elevation_reference===undefined){
          // Older callers supply an absolute elevation plus an additive offset.
          // Convert that world elevation once into the new level-relative form.
          const absoluteElevation=Number(payload.elevation_mm??level.elevation_mm)+Number(payload.elevation_offset_mm??0)
          payload.elevation_reference='level'
          payload.elevation_offset_mm=absoluteElevation-level.elevation_mm
        }
        payload.elevation_offset_mm ??=0
        if(!Number.isFinite(Number(payload.elevation_offset_mm)))throw new Error(`${family} elevation offset must be finite`)
        if(payload.elevation_mm===undefined)payload.elevation_mm=level.elevation_mm+Number(payload.elevation_offset_mm)
      }
      if(family==='architecture.room_separator'){
        for(const field of ['start_point_mm','end_point_mm']){const p=payload[field];if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))throw new Error(`Room separator ${field} must be a finite 2D point`)}
      }else{
        const boundary=payload.boundary_mm
        if(!Array.isArray(boundary)||boundary.length<3||boundary.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))throw new Error(`${family} requires a closed boundary with at least three finite points`)
        const polygonValidation=validatePolygonWithVoids(boundary as number[][], family==='architecture.floor'||family==='architecture.ceiling'?(Array.isArray(payload.voids_mm)?payload.voids_mm as number[][][]:[]):[])
        if(!polygonValidation.valid)throw new Error(`${family} ${polygonValidation.reason}`)
        if(family==='architecture.room')payload.area_mm2=polygonAreaMm2(boundary as number[][])
        if(family==='architecture.floor'||family==='architecture.ceiling'){
          if(!Number.isFinite(Number(payload.thickness_mm))||Number(payload.thickness_mm)<=0)throw new Error(`${family} thickness must be positive`)
          if(payload.voids_mm!==undefined&&!Array.isArray(payload.voids_mm))throw new Error(`${family} voids must be polygon rings`)
          if(family==='architecture.floor'&&payload.finish_layers!==undefined){
            if(!Array.isArray(payload.finish_layers))throw new Error('architecture.floor finish layers must be a list')
            for(const [index,rawLayer] of payload.finish_layers.entries()){
              if(!rawLayer||typeof rawLayer!=='object'||Array.isArray(rawLayer))throw new Error(`Floor finish layer ${index+1} is invalid`)
              const layer=rawLayer as Record<string,unknown>
              if(typeof layer.material!=='string'||!layer.material.trim())throw new Error(`Floor finish layer ${index+1} requires a material`)
              if(!Number.isFinite(Number(layer.thickness_mm))||Number(layer.thickness_mm)<=0)throw new Error(`Floor finish layer ${index+1} thickness must be positive`)
              if(layer.quantity_unit!==undefined&&layer.quantity_unit!=='m2'&&layer.quantity_unit!=='m3')throw new Error(`Floor finish layer ${index+1} quantity unit must be m2 or m3`)
            }
          }
          if(family==='architecture.floor'&&payload.finish_pattern_mm!==undefined&&(!Array.isArray(payload.finish_pattern_mm)||payload.finish_pattern_mm.length!==2||!payload.finish_pattern_mm.every(value=>Number.isFinite(Number(value))&&Number(value)>0)))throw new Error('Floor finish pattern spacing must contain two positive values')
          if(family==='architecture.floor'&&payload.finish_pattern_origin_mm!==undefined&&(!Array.isArray(payload.finish_pattern_origin_mm)||payload.finish_pattern_origin_mm.length!==2||!payload.finish_pattern_origin_mm.every(value=>Number.isFinite(Number(value)))))throw new Error('Floor finish pattern origin must contain two finite values')
          if(family==='architecture.floor'&&payload.finish_pattern_rotation_deg!==undefined&&!Number.isFinite(Number(payload.finish_pattern_rotation_deg)))throw new Error('Floor finish pattern rotation must be finite')
          if(family==='architecture.ceiling'&&payload.grid_mm!==undefined&&(!Array.isArray(payload.grid_mm)||payload.grid_mm.length!==2||!payload.grid_mm.every(value=>Number.isFinite(Number(value))&&Number(value)>0)))throw new Error('Ceiling grid spacing must contain two positive values')
        }
      }
      if(family==='architecture.floor'||family==='architecture.ceiling'){
        payload.voids_mm ??=[]
        payload.follows_room_boundary ??=typeof payload.room_id==='string'
        if(family==='architecture.floor')payload.finish_layers ??=[]
      }
      return createArchitectureObject({...context,input:payload},family,'constructflow.architecture',payload,update)
    }
    case 'DetectRooms': {
      const levelId=String(input.level_id??project.project.active_level_id)
      if(!project.levels.some(level=>level.id===levelId))throw new Error(`Unknown room detection level ${levelId}`)
      const rooms=refreshWallDerivedRooms(context,[levelId],true)
      return {result:{status:'success',command_id,command_name:commandName,affected_object_ids:rooms.affected,updated_object_ids:rooms.updatedObjects,created_object_ids:rooms.created},updatedProject:updated,emittedEnvelope:{...envelope,input:{level_id:levelId,room_ids:rooms.created,updated_room_ids:rooms.updated}}}
    }
    case 'MoveWall': {
      const move = input as unknown as MoveWallInput
      const target = updated.objects[move.object_id]
      if (!target || !isWallObject(target)) {
        return {
          result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: [`Wall UUID ${move.object_id} not found`] },
          updatedProject: project,
        }
      }
      if (!Array.isArray(move.delta_mm) || move.delta_mm.length !== 2 || !move.delta_mm.every(Number.isFinite) || (move.delta_mm[0] === 0 && move.delta_mm[1] === 0)) {
        return {
          result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: ['Wall move delta must contain finite, non-zero X/Y values in millimeters'] },
          updatedProject: project,
        }
      }
      const [dx, dy] = move.delta_mm
      const wallData = target.module_data
      const start: [number, number, number] = [wallData.start_point_mm[0] + dx, wallData.start_point_mm[1] + dy, wallData.start_point_mm[2] ?? 0]
      const end: [number, number, number] = [wallData.end_point_mm[0] + dx, wallData.end_point_mm[1] + dy, wallData.end_point_mm[2] ?? 0]
      updated.objects[target.id] = {
        ...target,
        module_data: { ...wallData, start_point_mm: start, end_point_mm: end },
        updated_at: now,
      }
      const affected = [target.id]
      for (const opening of Object.values(updated.objects)) {
        if ((!isDoorObject(opening) && !isWindowObject(opening)) || opening.module_data.wall_id !== target.id) continue
        const location = opening.module_data.location_mm
        updated.objects[opening.id] = {
          ...opening,
          module_data: { ...opening.module_data, location_mm: [location[0] + dx, location[1] + dy, location[2] ?? 0] },
          updated_at: now,
        }
        affected.push(opening.id)
      }
      return {
        result: { status: 'success', command_id, command_name: commandName, affected_object_ids: affected, updated_object_ids: affected },
        updatedProject: updated,
        emittedEnvelope: { ...envelope, input: { ...move, delta_mm: [dx, dy] } },
      }
    }

    case 'UpdateWallEndpoints': {
      const update = input as unknown as UpdateWallEndpointsInput
      const target = updated.objects[update.object_id]
      if (!target || !isWallObject(target)) return { result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: [`Wall UUID ${update.object_id} not found`] }, updatedProject: project }
      const [sx, sy] = update.start_point_mm, [ex, ey] = update.end_point_mm
      if (![sx, sy, ex, ey].every(Number.isFinite) || Math.hypot(ex - sx, ey - sy) < 1) return { result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: ['Wall endpoints must define a finite span of at least 1 mm'] }, updatedProject: project }
      const old = target.module_data
      const start: [number, number, number] = [sx, sy, old.start_point_mm[2] ?? 0]
      const end: [number, number, number] = [ex, ey, old.end_point_mm[2] ?? 0]
      const exactLengthMm = Math.hypot(ex - sx, ey - sy)
      const length_mm = Math.round(exactLengthMm)
      updated.objects[target.id] = { ...target, module_data: { ...old, start_point_mm: start, end_point_mm: end, length_mm }, updated_at: now }
      const affected = [target.id]
      for (const opening of Object.values(updated.objects)) {
        if ((!isDoorObject(opening) && !isWindowObject(opening)) || opening.module_data.wall_id !== target.id) continue
        const offset = opening.module_data.offset_along_wall_mm
        // The offset is a physical distance from the wall start, not a normalized
        // fraction of its rounded catalog length. Use the exact endpoint span so
        // diagonal walls and fractional-millimeter endpoints do not drift.
        const ratio = offset / exactLengthMm
        const location: [number, number, number] = [sx + (ex - sx) * ratio, sy + (ey - sy) * ratio, opening.module_data.location_mm[2] ?? 0]
        updated.objects[opening.id] = { ...opening, module_data: { ...opening.module_data, location_mm: location }, updated_at: now }
        affected.push(opening.id)
      }
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: affected, updated_object_ids: affected }, updatedProject: updated, emittedEnvelope: { ...envelope, input: { ...update, start_point_mm: [sx, sy], end_point_mm: [ex, ey] } } }
    }

    case 'MoveOpening': {
      const move = input as unknown as MoveOpeningInput
      const target = updated.objects[move.object_id]
      if (!target || (!isDoorObject(target) && !isWindowObject(target))) {
        return {
          result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: [`Opening UUID ${move.object_id} not found`] },
          updatedProject: project,
        }
      }
      const wall = updated.objects[target.module_data.wall_id]
      if (!wall || !isWallObject(wall)) {
        return {
          result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: [`Host wall for opening ${move.object_id} not found`] },
          updatedProject: project,
        }
      }
      if (!Number.isFinite(move.offset_along_wall_mm)) {
        return {
          result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: ['Opening offset must be finite millimeters'] },
          updatedProject: project,
        }
      }
      const openingData = target.module_data
      const wallData = wall.module_data
      const width = positiveCatalogNumber(
        openingData.instance_overrides?.width_mm
          ?? openingData.width_mm
          ?? resolveCatalogType(project, target.object_type, openingData.type_id ?? openingData.mark)?.parameters.width_mm,
        0,
      )
      const dx = wallData.end_point_mm[0] - wallData.start_point_mm[0]
      const dy = wallData.end_point_mm[1] - wallData.start_point_mm[1]
      const wallLength = Math.hypot(dx, dy)
      if (!width || !Number.isFinite(wallLength) || wallLength <= 0 || move.offset_along_wall_mm - width / 2 < -1 || move.offset_along_wall_mm + width / 2 > wallLength + 1) {
        return {
          result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: [`Opening ${move.object_id} does not fit within host wall ${wall.id}`] },
          updatedProject: project,
        }
      }
      const ratio = move.offset_along_wall_mm / wallLength
      const currentLocation = openingData.location_mm
      const location_mm: [number, number, number] = [
        wallData.start_point_mm[0] + dx * ratio,
        wallData.start_point_mm[1] + dy * ratio,
        currentLocation[2] ?? wallData.start_point_mm[2] ?? 0,
      ]
      updated.objects[target.id] = {
        ...target,
        updated_at: now,
        module_data: { ...openingData, offset_along_wall_mm: move.offset_along_wall_mm, location_mm },
      }
      return {
        result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [target.id], updated_object_ids: [target.id] },
        updatedProject: updated,
        emittedEnvelope: { ...envelope, input: { ...move } },
      }
    }

    case 'CreateWall': {
      const wallInput = input as unknown as CreateWallInput
      const id = wallInput.id || crypto.randomUUID()
      const mark = wallInput.mark || 'W1'
      const level_id = wallInput.level_id || project.project.active_level_id
      const legacyInput = wallInput as CreateWallInput & { start_node_mm?: [number, number, number]; end_node_mm?: [number, number, number] }
      const rawStart = wallInput.start_point_mm || legacyInput.start_node_mm || [0, 0, 0]
      const rawEnd = wallInput.end_point_mm || legacyInput.end_node_mm || [0, 0, 0]
      const start_point_mm: [number, number, number] = [rawStart[0], rawStart[1], rawStart[2] ?? 0]
      const end_point_mm: [number, number, number] = [rawEnd[0], rawEnd[1], rawEnd[2] ?? 0]
      const inheritedWall = wallInput.inherit_joined_wall_constraint && wallInput.top_level_id === undefined && wallInput.height_mm === undefined
        ? Object.values(project.objects)
          .filter(object => object.object_type === 'architecture.wall' && object.status !== 'archived' && !object.removed_phase)
          .map(object => {
            const data = object.module_data as Record<string, unknown>
            if (data.level_id !== level_id) return null
            const a = data.start_point_mm as number[] | undefined, b = data.end_point_mm as number[] | undefined
            if (!a || !b || ![a[0], a[1], b[0], b[1]].every(Number.isFinite)) return null
            const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy)
            if (length <= 1e-8) return null
            const tolerance = Math.max(25, Number(data.thickness_mm ?? 100) / 2 + 15)
            const distanceToSegment = (point: [number, number, number]) => {
              const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (length * length)))
              return Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dy))
            }
            const connectionDistance = Math.min(distanceToSegment(start_point_mm), distanceToSegment(end_point_mm))
            if (connectionDistance > tolerance) return null
            return {
              id: object.id,
              distance: connectionDistance,
              top_level_id: typeof data.top_level_id === 'string' ? data.top_level_id : undefined,
              base_offset_mm: Number(data.base_offset_mm ?? 0),
              top_offset_mm: Number(data.top_offset_mm ?? 0),
              height_mm: Number(data.height_mm),
            }
          })
          .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
          .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id))[0]
        : undefined
      const inferredTopLevel = inheritedWall?.top_level_id
        ? updated.levels.find(level => level.id === inheritedWall.top_level_id && level.elevation_mm > (getLevelElevation(updated, level_id) ?? 0))
        : undefined
      const nextStoryLevel = wallInput.inherit_joined_wall_constraint && !inheritedWall
        ? updated.levels.filter(level => level.elevation_mm > (getLevelElevation(updated, level_id) ?? 0)).sort((a, b) => a.elevation_mm - b.elevation_mm)[0]
        : undefined
      const top_level_id = wallInput.top_level_id ?? inferredTopLevel?.id ?? nextStoryLevel?.id
      const typeDef = resolveCatalogType(updated, 'architecture.wall', wallInput.type_id || mark)
      const hasLayerAssembly = typeDef?.parameters.masonry_thickness_mm !== undefined
        || typeDef?.parameters.plaster_inside_thickness_mm !== undefined
        || typeDef?.parameters.plaster_outside_thickness_mm !== undefined
      const masonry_thickness_mm = positiveCatalogNumber(wallInput.thickness_mm, positiveCatalogNumber(typeDef?.parameters.masonry_thickness_mm, positiveCatalogNumber(typeDef?.parameters.thickness_mm, 100)))
      const plaster_inside_thickness_mm = nonNegativeCatalogNumber(typeDef?.parameters.plaster_inside_thickness_mm)
      const plaster_outside_thickness_mm = nonNegativeCatalogNumber(typeDef?.parameters.plaster_outside_thickness_mm)
      const thickness_mm = hasLayerAssembly
        ? masonry_thickness_mm + plaster_inside_thickness_mm + plaster_outside_thickness_mm
        : wallInput.thickness_mm || positiveCatalogNumber(typeDef?.parameters.thickness_mm, 100)
      const base_offset_mm = Number(wallInput.base_offset_mm ?? inheritedWall?.base_offset_mm ?? 0)
      const top_offset_mm = Number(wallInput.top_offset_mm ?? inheritedWall?.top_offset_mm ?? 0)
      const topLevelElevation = getLevelElevation(updated, top_level_id)
      const baseLevelElevation = getLevelElevation(updated, level_id) ?? 0
      const height_mm = topLevelElevation !== undefined
        ? topLevelElevation + top_offset_mm - baseLevelElevation - base_offset_mm
        : wallInput.height_mm ?? inheritedWall?.height_mm ?? positiveCatalogNumber(typeDef?.parameters.height_mm, 2800)
      if (!Number.isFinite(height_mm) || height_mm <= 0) throw new Error('Wall top level must be above its base level')
      const material = wallInput.material || catalogString(typeDef?.parameters.material, 'brick_masonry')
      const dx = end_point_mm[0] - start_point_mm[0]
      const dy = end_point_mm[1] - start_point_mm[1]
      const length_mm = Math.round(Math.sqrt(dx * dx + dy * dy))
      const instance_overrides = catalogInstanceOverrides('architecture.wall', {
        thickness_mm, height_mm, material,
        ...(hasLayerAssembly ? {
          masonry_thickness_mm, plaster_inside_thickness_mm, plaster_outside_thickness_mm,
          plaster_inside_material: typeDef?.parameters.plaster_inside_material ?? 'cement_plaster',
          plaster_outside_material: typeDef?.parameters.plaster_outside_material ?? 'cement_plaster',
        } : {}),
      }, typeDef)
      // Overall thickness is derived from masonry plus the two finish layers;
      // storing it as an independent override would prevent catalog edits from
      // resizing the wall when a layer changes.
      if (hasLayerAssembly) delete instance_overrides.thickness_mm
      if (hasLayerAssembly && Number.isFinite(wallInput.thickness_mm)
        && wallInput.thickness_mm !== typeDef?.parameters.masonry_thickness_mm) {
        instance_overrides.masonry_thickness_mm = masonry_thickness_mm
      }

      const wallObj: SmartObject<WallModuleData> = {
        id,
        object_type: 'architecture.wall',
        owner_module: 'constructflow.architecture',
        schema_version: 1,
        created_phase: wallInput.phase || project.project.active_phase,
        removed_phase: null,
        level_refs: [
          {
            role: 'base_level',
            level_id,
          },
          ...(top_level_id ? [{ role: 'top_level' as const, level_id: top_level_id }] : []),
        ],
        host_refs: [],
        connector_refs: [],
        status: 'active',
        module_data: {
          mark,
          placement_reference: wallInput.placement_reference || 'centerline',
          type_id: typeDef?.id,
          instance_overrides,
          start_point_mm,
          end_point_mm,
          thickness_mm,
          ...(hasLayerAssembly ? {
            masonry_thickness_mm,
            plaster_inside_thickness_mm,
            plaster_outside_thickness_mm,
            plaster_inside_material: catalogString(typeDef?.parameters.plaster_inside_material, 'cement_plaster'),
            plaster_outside_material: catalogString(typeDef?.parameters.plaster_outside_material, 'cement_plaster'),
          } : {}),
          interior_side: 'left',
          height_mm,
          ...(top_level_id ? { top_level_id, vertical_constraint: 'top_level' as const } : {}),
          base_offset_mm,
          top_offset_mm,
          length_mm,
          level_id,
          material,
          ...(wallInput.interface_treatments ? { interface_treatments: structuredClone(wallInput.interface_treatments) } : {}),
        },
        created_at: now,
        updated_at: now,
      }

      updated.objects[id] = wallObj

      return {
        result: {
          status: 'success',
          command_id,
          command_name: commandName,
          affected_object_ids: [id],
          created_object_ids: [id],
        },
        updatedProject: updated,
        emittedEnvelope: {
          ...envelope,
          input: {
            ...wallInput,
            id,
            mark,
            level_id,
            path_mm: [start_point_mm, end_point_mm],
            thickness_mm: wallInput.thickness_mm || 100,
            height_mm: wallInput.height_mm || 2800,
            length_mm,
          },
        },
      }
    }

    case 'UpdateWallMark': {
      const wMarkInput = input as unknown as UpdateWallMarkInput
      const target = updated.objects[wMarkInput.object_id]
      if (!target || !isWallObject(target)) {
        return {
          result: {
            status: 'rejected',
            command_id,
            command_name: commandName,
            affected_object_ids: [],
            errors: [`Wall UUID ${wMarkInput.object_id} not found`],
          },
          updatedProject: project,
        }
      }

      updated.objects[wMarkInput.object_id] = {
        ...target,
        updated_at: now,
        module_data: {
          ...target.module_data,
          mark: wMarkInput.mark,
        },
      }

      return {
        result: {
          status: 'success',
          command_id,
          command_name: commandName,
          affected_object_ids: [wMarkInput.object_id],
          updated_object_ids: [wMarkInput.object_id],
        },
        updatedProject: updated,
        emittedEnvelope: envelope,
      }
    }

    case 'UpdateWallDimensions': {
      const wDimInput = input as unknown as UpdateWallDimensionsInput
      const target = updated.objects[wDimInput.object_id]
      if (!target || !isWallObject(target)) {
        return {
          result: {
            status: 'rejected',
            command_id,
            command_name: commandName,
            affected_object_ids: [],
            errors: [`Wall UUID ${wDimInput.object_id} not found`],
          },
          updatedProject: project,
        }
      }

      const hasLayerAssembly = target.module_data.masonry_thickness_mm !== undefined
        || target.module_data.plaster_inside_thickness_mm !== undefined
        || target.module_data.plaster_outside_thickness_mm !== undefined
        || wDimInput.plaster_inside_thickness_mm !== undefined
        || wDimInput.plaster_outside_thickness_mm !== undefined
      const plasterInside = nonNegativeCatalogNumber(wDimInput.plaster_inside_thickness_mm ?? target.module_data.plaster_inside_thickness_mm)
      const plasterOutside = nonNegativeCatalogNumber(wDimInput.plaster_outside_thickness_mm ?? target.module_data.plaster_outside_thickness_mm)
      const masonryThickness = hasLayerAssembly ? wDimInput.thickness_mm - plasterInside - plasterOutside : undefined
      if (hasLayerAssembly && (!Number.isFinite(masonryThickness) || masonryThickness! <= 0)) {
        return {
          result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: ['Overall wall thickness must remain greater than the combined plaster layers'] },
          updatedProject: project,
        }
      }

      const adjustedSegment = preserveSegmentPlacementReference(
        target.module_data.start_point_mm,
        target.module_data.end_point_mm,
        target.module_data.placement_reference,
        target.module_data.thickness_mm,
        wDimInput.thickness_mm,
      )
      const shiftedOpeningIds = shiftHostedOpenings(updated, wDimInput.object_id, adjustedSegment.shift_mm, now)

      const topLevelId = wDimInput.vertical_constraint === 'fixed_height'
        ? undefined
        : wDimInput.top_level_id ?? target.module_data.top_level_id
      const baseOffset = wDimInput.base_offset_mm ?? target.module_data.base_offset_mm ?? 0
      const topOffset = wDimInput.top_offset_mm ?? target.module_data.top_offset_mm ?? 0
      const topElevation = getLevelElevation(updated, topLevelId)
      const baseElevation = getLevelElevation(updated, target.module_data.level_id) ?? 0
      const wallHeight = topElevation !== undefined
        ? topElevation + topOffset - baseElevation - baseOffset
        : wDimInput.height_mm ?? target.module_data.height_mm
      if (!Number.isFinite(wallHeight) || wallHeight <= 0) throw new Error('Wall top level must be above its base level')
      updated.objects[wDimInput.object_id] = {
        ...target,
        updated_at: now,
        module_data: {
          ...target.module_data,
          start_point_mm: adjustedSegment.start,
          end_point_mm: adjustedSegment.end,
          thickness_mm: wDimInput.thickness_mm,
          ...(hasLayerAssembly ? { masonry_thickness_mm: masonryThickness } : {}),
          ...(wDimInput.plaster_inside_thickness_mm !== undefined ? { plaster_inside_thickness_mm: plasterInside } : {}),
          ...(wDimInput.plaster_outside_thickness_mm !== undefined ? { plaster_outside_thickness_mm: plasterOutside } : {}),
          ...(wDimInput.plaster_inside_material !== undefined ? { plaster_inside_material: wDimInput.plaster_inside_material } : {}),
          ...(wDimInput.plaster_outside_material !== undefined ? { plaster_outside_material: wDimInput.plaster_outside_material } : {}),
          ...(wDimInput.inside_finish_mark !== undefined ? { inside_finish_mark: wDimInput.inside_finish_mark } : {}),
          ...(wDimInput.outside_finish_mark !== undefined ? { outside_finish_mark: wDimInput.outside_finish_mark } : {}),
          ...(wDimInput.interior_side !== undefined ? { interior_side: wDimInput.interior_side } : {}),
          height_mm: wallHeight,
          ...(topLevelId ? { top_level_id: topLevelId, vertical_constraint: 'top_level' as const } : { top_level_id: undefined, vertical_constraint: 'fixed_height' as const }),
          base_offset_mm: baseOffset,
          top_offset_mm: topOffset,
          instance_overrides: {
            ...target.module_data.instance_overrides,
            thickness_mm: wDimInput.thickness_mm,
            ...(hasLayerAssembly ? {
              masonry_thickness_mm: masonryThickness,
              plaster_inside_thickness_mm: plasterInside,
              plaster_outside_thickness_mm: plasterOutside,
              plaster_inside_material: wDimInput.plaster_inside_material ?? target.module_data.plaster_inside_material ?? 'cement_plaster',
              plaster_outside_material: wDimInput.plaster_outside_material ?? target.module_data.plaster_outside_material ?? 'cement_plaster',
              ...(wDimInput.inside_finish_mark !== undefined ? { inside_finish_mark: wDimInput.inside_finish_mark } : {}),
              ...(wDimInput.outside_finish_mark !== undefined ? { outside_finish_mark: wDimInput.outside_finish_mark } : {}),
              ...(wDimInput.interior_side !== undefined ? { interior_side: wDimInput.interior_side } : {}),
            } : {}),
            ...(wDimInput.height_mm !== undefined ? { height_mm: wDimInput.height_mm } : {}),
          },
        },
      }

      return {
        result: {
          status: 'success',
          command_id,
          command_name: commandName,
          affected_object_ids: [wDimInput.object_id, ...shiftedOpeningIds],
          updated_object_ids: [wDimInput.object_id, ...shiftedOpeningIds],
        },
        updatedProject: updated,
        emittedEnvelope: envelope,
      }
    }

    case 'CreateDoor': {
      const doorInput = input as unknown as CreateDoorInput
      const id = doorInput.id || crypto.randomUUID()
      const mark = doorInput.mark || 'D1'
      const typeDef = resolveCatalogType(updated, 'door_window.door', doorInput.type_id || mark)
      const width_mm = doorInput.width_mm || positiveCatalogNumber(typeDef?.parameters.width_mm, 800)
      const sill_height_mm = Number(doorInput.sill_height_mm ?? 0)
      const headElevation = getLevelElevation(updated, doorInput.head_level_id)
      const baseElevation = getLevelElevation(updated, doorInput.level_id) ?? 0
      const height_mm = headElevation !== undefined
        ? headElevation + Number(doorInput.head_offset_mm ?? 0) - baseElevation - sill_height_mm
        : doorInput.height_mm || positiveCatalogNumber(typeDef?.parameters.height_mm, 2000)
      if (!Number.isFinite(height_mm) || height_mm <= 0) throw new Error('Door head level must be above its sill')
      const hostWall = updated.objects[doorInput.wall_id]
      if (!hostWall || !isWallObject(hostWall)) {
        return {
          result: {
            status: 'rejected',
            command_id,
            command_name: commandName,
            affected_object_ids: [],
            errors: [`Host Wall UUID ${doorInput.wall_id} not found`],
          },
          updatedProject: project,
        }
      }

      const location_mm: [number, number, number] = [
        doorInput.location_mm[0],
        doorInput.location_mm[1],
        doorInput.location_mm[2] ?? 0,
      ]

      const doorObj: SmartObject<DoorModuleData> = {
        id,
        object_type: 'door_window.door',
        owner_module: 'constructflow.door_window',
        schema_version: 1,
        created_phase: doorInput.phase || project.project.active_phase,
        removed_phase: null,
        level_refs: [
          {
            role: 'base_level',
            level_id: doorInput.level_id || hostWall.module_data.level_id,
          },
        ],
        host_refs: [doorInput.wall_id],
        connector_refs: [],
        status: 'active',
        module_data: {
          mark,
          type_id: typeDef?.id,
          instance_overrides: catalogInstanceOverrides('door_window.door', { width_mm: width_mm, height_mm: height_mm }, typeDef),
          wall_id: doorInput.wall_id,
          location_mm,
          offset_along_wall_mm: doorInput.offset_along_wall_mm,
          width_mm,
          height_mm,
          sill_height_mm,
          ...(doorInput.head_level_id ? { head_level_id: doorInput.head_level_id, head_offset_mm: Number(doorInput.head_offset_mm ?? 0), vertical_constraint: 'head_level' as const } : {}),
          handing: doorInput.handing || 'left_in',
          level_id: doorInput.level_id || hostWall.module_data.level_id,
        },
        created_at: now,
        updated_at: now,
      }

      updated.objects[id] = doorObj
      updated.relationships.push({
        kind: 'hosted_on',
        source_id: id,
        target_id: doorInput.wall_id,
        role: 'door_wall_host',
      })
      updated.relationships.push({
        kind: 'hosts',
        source_id: doorInput.wall_id,
        target_id: id,
        role: 'wall_door_opening',
      })

      return {
        result: {
          status: 'success',
          command_id,
          command_name: commandName,
          affected_object_ids: [id, doorInput.wall_id],
          created_object_ids: [id],
        },
        updatedProject: updated,
        emittedEnvelope: {
          ...envelope,
          input: {
            ...doorInput,
            id,
            mark,
            host_object_id: doorInput.wall_id,
            point_mm: location_mm,
            width_mm: doorInput.width_mm || 800,
            height_mm: doorInput.height_mm || 2000,
            sill_mm: 0,
          },
        },
      }
    }

    case 'UpdateDoorMark': {
      const dMarkInput = input as unknown as UpdateDoorMarkInput
      const target = updated.objects[dMarkInput.object_id]
      if (!target || !isDoorObject(target)) {
        return {
          result: {
            status: 'rejected',
            command_id,
            command_name: commandName,
            affected_object_ids: [],
            errors: [`Door UUID ${dMarkInput.object_id} not found`],
          },
          updatedProject: project,
        }
      }

      updated.objects[dMarkInput.object_id] = {
        ...target,
        updated_at: now,
        module_data: {
          ...target.module_data,
          mark: dMarkInput.mark,
        },
      }

      return {
        result: {
          status: 'success',
          command_id,
          command_name: commandName,
          affected_object_ids: [dMarkInput.object_id],
          updated_object_ids: [dMarkInput.object_id],
        },
        updatedProject: updated,
        emittedEnvelope: envelope,
      }
    }

    case 'UpdateDoorDimensions': {
      const dDimInput = input as unknown as UpdateDoorDimensionsInput
      const target = updated.objects[dDimInput.object_id]
      if (!target || !isDoorObject(target)) {
        return {
          result: {
            status: 'rejected',
            command_id,
            command_name: commandName,
            affected_object_ids: [],
            errors: [`Door UUID ${dDimInput.object_id} not found`],
          },
          updatedProject: project,
        }
      }

      const nextDoorData = {
        ...target.module_data,
        width_mm: dDimInput.width_mm,
        height_mm: dDimInput.height_mm ?? target.module_data.height_mm,
        sill_height_mm: dDimInput.sill_height_mm ?? target.module_data.sill_height_mm ?? 0,
        ...(dDimInput.head_level_id !== undefined ? { head_level_id: dDimInput.head_level_id, head_offset_mm: Number(dDimInput.head_offset_mm ?? 0), vertical_constraint: 'head_level' as const } : {}),
        ...(dDimInput.vertical_constraint === 'fixed_height' ? { head_level_id: undefined, vertical_constraint: 'fixed_height' as const } : {}),
      }
      if (dDimInput.head_level_id !== undefined && !resolveOpeningVerticalExtent(updated, nextDoorData)) throw new Error('Door head level must be above its sill')
      const doorType = resolveCatalogType(updated, target.object_type, typeof nextDoorData.type_id === 'string' ? nextDoorData.type_id : nextDoorData.mark)
      updated.objects[dDimInput.object_id] = {
        ...target,
        updated_at: now,
        module_data: { ...nextDoorData, instance_overrides: catalogInstanceOverrides(target.object_type, nextDoorData, doorType) },
      }

      return {
        result: {
          status: 'success',
          command_id,
          command_name: commandName,
          affected_object_ids: [dDimInput.object_id],
          updated_object_ids: [dDimInput.object_id],
        },
        updatedProject: updated,
        emittedEnvelope: envelope,
      }
    }

    case 'FlipDoorHanding': {
      const flipInput = input as unknown as FlipDoorHandingInput
      const target = updated.objects[flipInput.object_id]
      if (!target || !isDoorObject(target)) {
        return {
          result: {
            status: 'rejected',
            command_id,
            command_name: commandName,
            affected_object_ids: [],
            errors: [`Door UUID ${flipInput.object_id} not found`],
          },
          updatedProject: project,
        }
      }

      const currentHanding = target.module_data.handing
      const cycle: Record<DoorHanding, DoorHanding> = {
        left_in: 'left_out',
        left_out: 'right_out',
        right_out: 'right_in',
        right_in: 'left_in',
      }
      const newHanding = flipInput.handing || cycle[currentHanding] || 'left_in'

      updated.objects[flipInput.object_id] = {
        ...target,
        updated_at: now,
        module_data: {
          ...target.module_data,
          handing: newHanding,
        },
      }

      return {
        result: {
          status: 'success',
          command_id,
          command_name: commandName,
          affected_object_ids: [flipInput.object_id],
          updated_object_ids: [flipInput.object_id],
        },
        updatedProject: updated,
        emittedEnvelope: envelope,
      }
    }

    case 'CreateWindow': {
      const winInput = input as unknown as CreateWindowInput
      const id = winInput.id || crypto.randomUUID()
      const mark = winInput.mark || 'W1'
      const typeDef = resolveCatalogType(updated, 'door_window.window', winInput.type_id || mark)
      const width_mm = winInput.width_mm || positiveCatalogNumber(typeDef?.parameters.width_mm, 1200)
      const sill_height_mm = winInput.sill_height_mm ?? positiveCatalogNumber(typeDef?.parameters.sill_height_mm, 900)
      const headElevation = getLevelElevation(updated, winInput.head_level_id)
      const baseElevation = getLevelElevation(updated, winInput.level_id) ?? 0
      const height_mm = headElevation !== undefined
        ? headElevation + Number(winInput.head_offset_mm ?? 0) - baseElevation - sill_height_mm
        : winInput.height_mm || positiveCatalogNumber(typeDef?.parameters.height_mm, 1200)
      if (!Number.isFinite(height_mm) || height_mm <= 0) throw new Error('Window head level must be above its sill')
      const hostWall = updated.objects[winInput.wall_id]
      if (!hostWall || !isWallObject(hostWall)) {
        return {
          result: {
            status: 'rejected',
            command_id,
            command_name: commandName,
            affected_object_ids: [],
            errors: [`Host Wall UUID ${winInput.wall_id} not found`],
          },
          updatedProject: project,
        }
      }

      const location_mm: [number, number, number] = [
        winInput.location_mm[0],
        winInput.location_mm[1],
        winInput.location_mm[2] ?? 0,
      ]

      const winObj: SmartObject<WindowModuleData> = {
        id,
        object_type: 'door_window.window',
        owner_module: 'constructflow.door_window',
        schema_version: 1,
        created_phase: winInput.phase || project.project.active_phase,
        removed_phase: null,
        level_refs: [
          {
            role: 'base_level',
            level_id: winInput.level_id || hostWall.module_data.level_id,
          },
        ],
        host_refs: [winInput.wall_id],
        connector_refs: [],
        status: 'active',
        module_data: {
          mark,
          type_id: typeDef?.id,
          instance_overrides: catalogInstanceOverrides('door_window.window', { width_mm: width_mm, height_mm: height_mm, sill_height_mm: sill_height_mm }, typeDef),
          wall_id: winInput.wall_id,
          location_mm,
          offset_along_wall_mm: winInput.offset_along_wall_mm,
          width_mm,
          height_mm,
          sill_height_mm,
          ...(winInput.head_level_id ? { head_level_id: winInput.head_level_id, head_offset_mm: Number(winInput.head_offset_mm ?? 0), vertical_constraint: 'head_level' as const } : {}),
          level_id: winInput.level_id || hostWall.module_data.level_id,
        },
        created_at: now,
        updated_at: now,
      }

      updated.objects[id] = winObj
      updated.relationships.push({
        kind: 'hosted_on',
        source_id: id,
        target_id: winInput.wall_id,
        role: 'window_wall_host',
      })
      updated.relationships.push({
        kind: 'hosts',
        source_id: winInput.wall_id,
        target_id: id,
        role: 'wall_window_opening',
      })

      return {
        result: {
          status: 'success',
          command_id,
          command_name: commandName,
          affected_object_ids: [id, winInput.wall_id],
          created_object_ids: [id],
        },
        updatedProject: updated,
        emittedEnvelope: {
          ...envelope,
          input: {
            ...winInput,
            id,
            mark,
            host_object_id: winInput.wall_id,
            point_mm: location_mm,
            width_mm: winInput.width_mm || 1200,
            height_mm: winInput.height_mm || 1200,
            sill_mm: winInput.sill_height_mm || 900,
          },
        },
      }
    }

    case 'UpdateWindowMark': {
      const wMarkInput = input as unknown as UpdateWindowMarkInput
      const target = updated.objects[wMarkInput.object_id]
      if (!target || !isWindowObject(target)) {
        return {
          result: {
            status: 'rejected',
            command_id,
            command_name: commandName,
            affected_object_ids: [],
            errors: [`Window UUID ${wMarkInput.object_id} not found`],
          },
          updatedProject: project,
        }
      }

      updated.objects[wMarkInput.object_id] = {
        ...target,
        updated_at: now,
        module_data: {
          ...target.module_data,
          mark: wMarkInput.mark,
        },
      }

      return {
        result: {
          status: 'success',
          command_id,
          command_name: commandName,
          affected_object_ids: [wMarkInput.object_id],
          updated_object_ids: [wMarkInput.object_id],
        },
        updatedProject: updated,
        emittedEnvelope: envelope,
      }
    }

    case 'UpdateWindowDimensions': {
      const wDimInput = input as unknown as UpdateWindowDimensionsInput
      const target = updated.objects[wDimInput.object_id]
      if (!target || !isWindowObject(target)) {
        return {
          result: {
            status: 'rejected',
            command_id,
            command_name: commandName,
            affected_object_ids: [],
            errors: [`Window UUID ${wDimInput.object_id} not found`],
          },
          updatedProject: project,
        }
      }

      const nextWindowData = {
        ...target.module_data,
        width_mm: wDimInput.width_mm,
        height_mm: wDimInput.height_mm ?? target.module_data.height_mm,
        sill_height_mm: wDimInput.sill_height_mm ?? target.module_data.sill_height_mm,
        ...(wDimInput.head_level_id !== undefined ? { head_level_id: wDimInput.head_level_id, head_offset_mm: Number(wDimInput.head_offset_mm ?? 0), vertical_constraint: 'head_level' as const } : {}),
        ...(wDimInput.vertical_constraint === 'fixed_height' ? { head_level_id: undefined, vertical_constraint: 'fixed_height' as const } : {}),
      }
      if (wDimInput.head_level_id !== undefined && !resolveOpeningVerticalExtent(updated, nextWindowData)) throw new Error('Window head level must be above its sill')
      const windowType = resolveCatalogType(updated, target.object_type, typeof nextWindowData.type_id === 'string' ? nextWindowData.type_id : nextWindowData.mark)
      updated.objects[wDimInput.object_id] = {
        ...target,
        updated_at: now,
        module_data: { ...nextWindowData, instance_overrides: catalogInstanceOverrides(target.object_type, nextWindowData, windowType) },
      }

      return {
        result: {
          status: 'success',
          command_id,
          command_name: commandName,
          affected_object_ids: [wDimInput.object_id],
          updated_object_ids: [wDimInput.object_id],
        },
        updatedProject: updated,
        emittedEnvelope: envelope,
      }
    }

    case 'UpdateOpeningInstanceParameters': {
      const request = input as unknown as UpdateOpeningInstanceParametersInput
      const target = updated.objects[request.object_id]
      if (!target || (!isDoorObject(target) && !isWindowObject(target))) {
        return { result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: [`Opening UUID ${request.object_id} not found`] }, updatedProject: project }
      }
      if (!request.parameters || typeof request.parameters !== 'object' || Array.isArray(request.parameters) || Object.keys(request.parameters).length === 0) {
        throw new Error('At least one opening instance parameter is required')
      }

      const data = { ...target.module_data } as Record<string, unknown>
      const family = target.object_type
      const allowed = new Set(CATALOG_PARAMETER_FIELDS[family] ?? [])
      const type = resolveCatalogType(updated, family, typeof data.type_id === 'string' ? data.type_id : typeof data.mark === 'string' ? data.mark : undefined)
      const typeParameters = type?.parameters ?? {}
      const overrides = { ...(data.instance_overrides && typeof data.instance_overrides === 'object' && !Array.isArray(data.instance_overrides) ? data.instance_overrides as Record<string, unknown> : {}) }
      for (const [field, value] of Object.entries(request.parameters)) {
        if (!allowed.has(field)) throw new Error(`Unsupported ${family} parameter ${field}`)
        if (value === null) {
          if (typeParameters[field] === undefined) delete data[field]
          else data[field] = structuredClone(typeParameters[field])
          delete overrides[field]
        } else {
          if (field.endsWith('_mm') && (typeof value !== 'number' || !Number.isFinite(value))) throw new Error(`${field} must be a finite millimeter value`)
          if (field === 'width_mm' || field === 'height_mm' || field === 'frame_depth_mm' || field === 'frame_face_width_mm' || field === 'sash_face_width_mm' || field === 'door_leaf_thickness_mm' || field === 'plan_symbol_reference_depth_mm') {
            if (typeof value !== 'number' || value <= 0) throw new Error(`${field} must be positive`)
          } else if (field.endsWith('_mm') && typeof value === 'number' && value < 0) throw new Error(`${field} cannot be negative`)
          if (field === 'panel_count' && (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 8)) throw new Error('panel_count must be an integer from 1 to 8')
          if (/(^|_)(rows|columns)$/.test(field) && (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 24)) throw new Error(`${field} must be an integer from 0 to 24`)
          if (field === 'glazing_transmission' && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)) throw new Error('glazing_transmission must be from 0 to 1')
          data[field] = structuredClone(value)
          if (typeParameters[field] !== undefined && JSON.stringify(value) === JSON.stringify(typeParameters[field])) delete overrides[field]
          else overrides[field] = structuredClone(value)
        }
      }
      const panelCount = Number(data.panel_count ?? typeParameters.panel_count ?? 1)
      if (Array.isArray(data.panel_layout) && data.panel_layout.length !== panelCount) throw new Error('panel_layout must match panel_count')
      if (Array.isArray(data.panel_width_ratios)) {
        if (data.panel_width_ratios.length !== panelCount || !data.panel_width_ratios.every(value => typeof value === 'number' && Number.isFinite(value) && value > 0)) throw new Error('panel_width_ratios must contain one positive ratio per panel')
        const ratioTotal = (data.panel_width_ratios as number[]).reduce((sum, value) => sum + value, 0)
        if (Math.abs(ratioTotal - 1) > 0.001) throw new Error('panel_width_ratios must add up to 1')
      }
      // A manually entered height takes control from a level-constrained head.
      if (Object.hasOwn(request.parameters, 'height_mm') && request.parameters.height_mm !== null) {
        data.head_level_id = undefined
        data.head_offset_mm = undefined
        data.vertical_constraint = 'fixed_height'
      }
      data.instance_overrides = overrides

      const width = Number(data.width_mm)
      const wall = updated.objects[String(data.wall_id)]
      if (!wall || !isWallObject(wall)) throw new Error(`Host wall for opening ${target.id} not found`)
      const wallData = wall.module_data
      const wallLength = Math.hypot(wallData.end_point_mm[0] - wallData.start_point_mm[0], wallData.end_point_mm[1] - wallData.start_point_mm[1])
      const offset = Number(data.offset_along_wall_mm)
      if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(offset) || offset - width / 2 < -1 || offset + width / 2 > wallLength + 1) {
        throw new Error(`Opening ${target.id} does not fit within host wall ${wall.id}`)
      }
      if (data.door_face_components !== undefined) validateDoorFaceComponents(data.door_face_components)
      if (data.plan_symbol_lines !== undefined) validateOpeningPlanSymbolLines(data.plan_symbol_lines)
      const openingExtent = resolveOpeningVerticalExtent(updated, data)
      const wallExtent = resolveWallVerticalExtent(updated, wall)
      if (!openingExtent || !wallExtent || openingExtent.base_elevation_mm < wallExtent.base_elevation_mm - 1 || openingExtent.top_elevation_mm > wallExtent.top_elevation_mm + 1) {
        throw new Error(`Opening ${target.id} vertical bounds exceed host wall ${wall.id}`)
      }
      updated.objects[target.id] = {
        ...target,
        module_data: data as unknown as DoorModuleData | WindowModuleData,
        updated_at: now,
        revision_meta: { ...target.revision_meta, dirty_quantity: true, dirty_drawing: true },
      }
      return {
        result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [target.id], updated_object_ids: [target.id] },
        updatedProject: updated,
        emittedEnvelope: { ...envelope, input: { object_id: target.id, parameters: structuredClone(request.parameters) } },
      }
    }

    case 'CreateStair':
    case 'UpdateStair': {
      const sInput = input as Record<string, unknown>
      const isUpdate = commandName === 'UpdateStair'
      const stairId = isUpdate ? (sInput.id as string) : ((sInput.id as string) || crypto.randomUUID())
      if (isUpdate && !updated.objects[stairId]) {
        return {
          result: {
            status: 'rejected',
            command_id,
            command_name: commandName,
            affected_object_ids: [],
            errors: [`Stair UUID ${stairId} not found`],
          },
          updatedProject: project,
        }
      }
      const existing = updated.objects[stairId]
      const oldData = (existing?.module_data as Record<string, unknown>) || {}

      const mark = (sInput.mark as string) || (oldData.mark as string) || 'ST1'
      const stair_type = (sInput.stair_type as any) || (oldData.stair_type as any) || 'straight'
      const width_mm = Number(sInput.width_mm ?? oldData.width_mm ?? 1000)
      const total_rise_mm = Number(sInput.total_rise_mm ?? oldData.total_rise_mm ?? 3000)
      const riser_height_mm = Number(sInput.riser_height_mm ?? oldData.riser_height_mm ?? 176.5)
      const tread_depth_mm = Number(sInput.tread_depth_mm ?? oldData.tread_depth_mm ?? 250)
      const num_risers = Number(sInput.num_risers ?? oldData.num_risers ?? Math.round(total_rise_mm / riser_height_mm))
      const start_point_mm = (sInput.start_point_mm as [number, number, number]) || (oldData.start_point_mm as [number, number, number]) || [0, 0, 0]
      const landing_depth_mm = sInput.landing_depth_mm !== undefined ? Number(sInput.landing_depth_mm) : (oldData.landing_depth_mm !== undefined ? Number(oldData.landing_depth_mm) : (total_rise_mm >= 3000 ? width_mm : undefined))
      const handrail_height_mm = Number(sInput.handrail_height_mm ?? oldData.handrail_height_mm ?? 900)
      const has_handrail = sInput.has_handrail !== undefined ? Boolean(sInput.has_handrail) : (oldData.has_handrail !== undefined ? Boolean(oldData.has_handrail) : true)
      const structure_type = (sInput.structure_type as any) || (oldData.structure_type as any) || 'rc_monolithic'
      const turn_direction = (sInput.turn_direction as any) || (oldData.turn_direction as any)

      const code_check = validateStairThaiBuildingCode({
        width_mm,
        riser_height_mm,
        tread_depth_mm,
        total_rise_mm,
        landing_depth_mm,
        handrail_height_mm,
      })

      const stairData = {
        mark,
        level_id: (sInput.level_id as string) || (oldData.level_id as string) || updated.project.active_level_id,
        stair_type,
        structure_type,
        start_point_mm,
        total_rise_mm,
        width_mm,
        num_risers,
        riser_height_mm,
        tread_depth_mm,
        landing_depth_mm,
        turn_direction,
        has_handrail,
        handrail_height_mm,
        code_check,
      }

      const stairObj: SmartObject = {
        id: stairId,
        object_type: 'architecture.stair',
        owner_module: 'constructflow.architecture',
        schema_version: 1,
        created_phase: (sInput.created_phase as any) || existing?.created_phase || updated.project.active_phase || 'new_construction',
        removed_phase: existing?.removed_phase ?? null,
        level_refs: existing?.level_refs || [{ level_id: updated.project.active_level_id, role: 'base' }],
        host_refs: existing?.host_refs || [],
        connector_refs: existing?.connector_refs || [],
        status: 'active',
        created_at: existing?.created_at || now,
        updated_at: now,
        module_data: stairData as any,
      }

      updated.objects[stairId] = stairObj

      return {
        result: {
          status: 'success',
          command_id,
          command_name: commandName,
          affected_object_ids: [stairId],
          updated_object_ids: [stairId],
        },
        updatedProject: updated,
        emittedEnvelope: { ...envelope, input: { ...sInput, id: stairId } },
      }
    }
  }
}
export * from './bathroom.js'
export * from './stairs.js'
export * from './railings.js'
export * from './openingMuntins.js'
