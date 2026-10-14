import { getDisplayPhase, resolveCatalogType, resolveColumnVerticalExtent, resolveBeamBaseElevation, resolveWallVerticalExtent, type ProjectDocument, type SmartObject, type Phase } from '@constructflow/project-model'
import { getWallSolidProfiles } from '@constructflow/architecture-engine'
import { polygonUnionBoundary, segmentOutsidePolygons, type Vec2 } from '@constructflow/geometry-kernel'

function value(project: ProjectDocument, object: SmartObject, key: string): unknown {
  const d = object.module_data as Record<string, unknown>
  const type = resolveCatalogType(project, object.object_type, String(d.type_id ?? d.mark ?? ''))
  return (d.instance_overrides as Record<string, unknown> | undefined)?.[key] ?? d[key] ?? type?.parameters[key]
}
export function structuralPlasterThickness(project: ProjectDocument, object: SmartObject): number {
  const raw = value(project, object, 'plaster_thickness_mm')
  // Existing unclassified RC beams receive the adjacent architectural plaster convention.
  return Math.max(0, Number(raw ?? (value(project, object, 'material') === 'reinforced_concrete' ? 15 : 0)))
}
export interface FinishSurface {
  object_id: string
  phase: Phase
  material: string
  finished: boolean
  depth_mm: number
  polygons_mm: Vec2[][]
  edges_mm: Array<[Vec2, Vec2]>
}

/** Clip projected roof/stair edges against opaque architectural faces at the correct depth. */
export function clipElevationEdgeBySurfaces(edge: [[number, number, number], [number, number, number]], direction: 'north' | 'south' | 'east' | 'west', surfaces: readonly FinishSurface[]): Array<[[number, number, number], [number, number, number]]> {
  const h = direction === 'east' || direction === 'west' ? 1 : 0, depth = h === 1 ? 0 : 1
  const sign = direction === 'north' || direction === 'east' ? 1 : -1, [a, b] = edge
  const delta = b.map((v, i) => v - a[i]), cuts = [0, 1]
  if (Math.abs(delta[depth]) > 1e-8) for (const surface of surfaces) {
    const t = (surface.depth_mm - a[depth]) / delta[depth]
    if (t > 0 && t < 1) cuts.push(t)
  }
  cuts.sort((x, y) => x - y)
  const world = (t: number): [number, number, number] => [a[0] + delta[0] * t, a[1] + delta[1] * t, a[2] + delta[2] * t]
  const denominator = Math.abs(delta[h]) >= Math.abs(delta[2]) ? delta[h] : delta[2], axis = Math.abs(delta[h]) >= Math.abs(delta[2]) ? 0 : 1
  if (Math.abs(denominator) < 1e-8) return []
  const result: Array<[[number, number, number], [number, number, number]]> = []
  for (let i = 1; i < cuts.length; i++) {
    const p = world(cuts[i - 1]), q = world(cuts[i]), mid = world((cuts[i - 1] + cuts[i]) / 2)
    const masks = surfaces.filter(s => sign * (s.depth_mm - mid[depth]) > 0.001).flatMap(s => s.polygons_mm)
    for (const [u, v] of segmentOutsidePolygons([[p[h], p[2]], [q[h], q[2]]], masks)) {
      const offset = axis === 0 ? a[h] : a[2]
      result.push([world((u[axis] - offset) / denominator), world((v[axis] - offset) / denominator)])
    }
  }
  return result
}

/** Coplanar equal finishes merge; a projecting column retains its real return edge. */
export function getElevationFinishSurfaces(project: ProjectDocument, direction: 'north' | 'south' | 'east' | 'west', ids?: ReadonlySet<string>): FinishSurface[] {
  const ew = direction === 'east' || direction === 'west', h = ew ? 1 : 0, depth = ew ? 0 : 1
  const sign = direction === 'north' || direction === 'east' ? 1 : -1
  const surfaces: FinishSurface[] = []
  for (const o of Object.values(project.objects)) {
    if (o.status === 'archived' || (ids && !ids.has(o.id))) continue
    const d = o.module_data as Record<string, unknown>
    let polygons: Vec2[][] = [], plane = 0, material = 'cement_plaster', finished = false
    if (o.object_type === 'architecture.wall') {
      const a = d.start_point_mm as number[], b = d.end_point_mm as number[], v = resolveWallVerticalExtent(project, o)
      if (!a || !b || !v) continue
      const length = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (!length || Math.abs(b[h] - a[h]) / length < 0.9999) continue
      const normal = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length]
      const nearSide = sign * normal[depth] >= 0 ? 1 : -1
      const inside = d.interior_side === 'right' ? -1 : 1, face = nearSide === inside ? 'inside' : 'outside'
      finished = Number(value(project, o, `plaster_${face}_thickness_mm`) ?? 0) > 0
      material = String(value(project, o, `plaster_${face}_material`) ?? 'cement_plaster')
      const offset = Number(value(project, o, 'thickness_mm')) / 2 * nearSide
      plane = a[depth] + normal[depth] * offset
      polygons = getWallSolidProfiles(project, o).map(p => p.map(([x, z]) => [a[h] + (b[h] - a[h]) / length * x + normal[h] * offset, v.base_elevation_mm + z]))
    } else if (o.object_type === 'structure.column') {
      const p = d.location_mm as number[], s = value(project, o, 'section_mm') as number[], v = resolveColumnVerticalExtent(project, o)
      if (!p || !s || !v) continue
      const t = structuralPlasterThickness(project, o)
      finished = t > 0
      material = String(value(project, o, 'plaster_material') ?? 'cement_plaster')
      plane = p[depth] + sign * (s[depth] / 2 + t)
      const lo = p[h] - s[h] / 2 - t, hi = p[h] + s[h] / 2 + t
      polygons = [[[lo, v.base_elevation_mm], [hi, v.base_elevation_mm], [hi, v.top_elevation_mm], [lo, v.top_elevation_mm]]]
    } else if (o.object_type === 'structure.beam') {
      const a = d.start_point_mm as number[], b = d.end_point_mm as number[], s = value(project, o, 'section_mm') as number[], base = resolveBeamBaseElevation(project, o)
      if (!a || !b || !s || base === undefined) continue
      const length = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (!length || Math.abs(b[h] - a[h]) / length < 0.9999) continue
      const t = structuralPlasterThickness(project, o), z = base - Number(d.drop_mm ?? 0)
      finished = t > 0
      material = String(value(project, o, 'plaster_material') ?? 'cement_plaster')
      plane = a[depth] + sign * (s[0] / 2 + t)
      const lo = Math.min(a[h], b[h]), hi = Math.max(a[h], b[h])
      polygons = [[[lo, z - t], [hi, z - t], [hi, z + s[1] + t], [lo, z + s[1] + t]]]
    } else continue
    surfaces.push({ object_id: o.id, phase: getDisplayPhase(o), material, finished, depth_mm: plane, polygons_mm: polygons, edges_mm: [] })
  }
  const groups = new Map<string, FinishSurface[]>()
  for (const s of surfaces) {
    const key = s.finished ? `${s.phase}|${s.material}|${Math.round(s.depth_mm * 1000)}` : s.object_id
    const group = groups.get(key) ?? []; group.push(s); groups.set(key, group)
  }
  for (const group of groups.values()) {
    const edges = polygonUnionBoundary(group.flatMap(s => s.polygons_mm))
    // Attach each exposed fragment to one original UUID for selection and styling.
    for (const edge of edges) {
      const mid: Vec2 = [(edge[0][0] + edge[1][0]) / 2, (edge[0][1] + edge[1][1]) / 2]
      const owner = group.find(s => s.polygons_mm.some(p => p.some((a, i) => {
        const b = p[(i + 1) % p.length], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy)
        return len > 0 && Math.abs(dx * (mid[1] - a[1]) - dy * (mid[0] - a[0])) / len < 0.001 &&
          (mid[0] - a[0]) * (mid[0] - b[0]) + (mid[1] - a[1]) * (mid[1] - b[1]) <= 0.001
      }))) ?? group[0]
      owner.edges_mm.push(edge)
    }
  }
  for (const surface of surfaces) {
    const nearer = surfaces.filter(s => sign * (s.depth_mm - surface.depth_mm) > 0.001).flatMap(s => s.polygons_mm)
    surface.edges_mm = surface.edges_mm.flatMap(edge => segmentOutsidePolygons(edge, nearer))
  }
  const emittedEdges = new Set<string>()
  for (const s of surfaces) s.edges_mm = s.edges_mm.filter(edge => {
    const key = `${s.phase}|${s.depth_mm}|${edge.map(p => p.map(x => Math.round(x * 1e6)).join(',')).sort().join('|')}`
    if (emittedEdges.has(key)) return false
    emittedEdges.add(key); return true
  })
  return surfaces
}

export interface PlanFinishBoundary { phase: Phase; segments_mm: Array<[Vec2, Vec2]> }

function indexHostedOpenings(objects: readonly SmartObject[]): Map<string, SmartObject[]> {
  const byWall = new Map<string, SmartObject[]>()
  for (const object of objects) {
    if (object.status === 'archived' || (object.object_type !== 'door_window.door' && object.object_type !== 'door_window.window')) continue
    const wallId = (object.module_data as Record<string, unknown>).wall_id
    if (typeof wallId !== 'string') continue
    const hosted = byWall.get(wallId) ?? []
    hosted.push(object)
    byWall.set(wallId, hosted)
  }
  return byWall
}

/** Masonry/finish interfaces in plan; hosted apertures and column finishes interrupt these lines. */
export function getPlanWallLayerBoundaries(project: ProjectDocument, ids?: ReadonlySet<string>): PlanFinishBoundary[] {
  const objects = Object.values(project.objects).filter(o => o.status !== 'archived' && (ids ? ids.has(o.id) :
    !(o.module_data as Record<string, unknown>).level_id || (o.module_data as Record<string, unknown>).level_id === project.project.active_level_id))
  const openingsByWall = indexHostedOpenings(objects)
  const columns = objects.filter(o => o.object_type === 'structure.column').flatMap(o => {
    const d = o.module_data as Record<string, unknown>, p = d.location_mm as number[], s = value(project, o, 'section_mm') as number[]
    if (!p || !s) return []
    const t = structuralPlasterThickness(project, o), w = s[0] / 2 + t, h = s[1] / 2 + t
    return [[[p[0] - w, p[1] - h], [p[0] + w, p[1] - h], [p[0] + w, p[1] + h], [p[0] - w, p[1] + h]] as Vec2[]]
  })
  const result: PlanFinishBoundary[] = []
  for (const o of objects) {
    if (o.object_type !== 'architecture.wall') continue
    const d = o.module_data as Record<string, unknown>, a = d.start_point_mm as number[], b = d.end_point_mm as number[]
    if (!a || !b) continue
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]), inside = Number(value(project, o, 'plaster_inside_thickness_mm') ?? 0), outside = Number(value(project, o, 'plaster_outside_thickness_mm') ?? 0)
    if (!length || inside + outside <= 0) continue
    const ux = (b[0] - a[0]) / length, uy = (b[1] - a[1]) / length, half = Number(value(project, o, 'thickness_mm')) / 2, sign = d.interior_side === 'right' ? -1 : 1
    const world = (x: number, y: number): Vec2 => [a[0] + ux * x - uy * y, a[1] + uy * x + ux * y]
    const apertures = (openingsByWall.get(o.id) ?? []).map(item => {
      const v = item.module_data as Record<string, unknown>, x = Number(v.offset_along_wall_mm), w = Number(value(project, item, 'width_mm')) / 2
      return [world(x - w, -half - 1), world(x + w, -half - 1), world(x + w, half + 1), world(x - w, half + 1)]
    })
    const segments = [sign * (half - inside), -sign * (half - outside)].flatMap(y => segmentOutsidePolygons([world(0, y), world(length, y)], [...columns, ...apertures]))
    result.push({ phase: getDisplayPhase(o), segments_mm: segments })
  }
  return result
}
/** Finished plan outline wraps projecting columns rather than running plaster through their core. */
export function getPlanFinishBoundaries(project: ProjectDocument, ids?: ReadonlySet<string>): PlanFinishBoundary[] {
  const groups = new Map<Phase, Vec2[][]>()
  const openingsByWall = indexHostedOpenings(Object.values(project.objects))
  for (const o of Object.values(project.objects)) {
    if (o.status === 'archived' || (ids && !ids.has(o.id))) continue
    const d = o.module_data as Record<string, unknown>
    if (!ids && d.level_id && d.level_id !== project.project.active_level_id && d.base_level_id !== project.project.active_level_id) continue
    let rings: Vec2[][] = []
    if (o.object_type === 'architecture.wall') {
      const a = d.start_point_mm as number[], b = d.end_point_mm as number[]
      if (!a || !b) continue
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]), half = Number(value(project, o, 'thickness_mm')) / 2
      if (!length) continue
      const ux = (b[0] - a[0]) / length, uy = (b[1] - a[1]) / length
      // Plan apertures are processed against the host UUID, independently of elevation clipping.
      const openings = (openingsByWall.get(o.id) ?? [])
        .map(item => { const v = item.module_data as Record<string, unknown>, x = Number(v.offset_along_wall_mm), w = Number(value(project, item, 'width_mm')); return [x - w / 2, x + w / 2] })
      const xs = [...new Set([0, length, ...openings.flat().filter(x => x > 0 && x < length)])].sort((x, y) => x - y)
      for (let i = 1; i < xs.length; i++) {
        const lo = xs[i - 1], hi = xs[i], mid = (lo + hi) / 2
        if (openings.some(([a, b]) => mid > a && mid < b)) continue
        rings.push([[lo, half], [hi, half], [hi, -half], [lo, -half]].map(([x, y]) => [a[0] + ux * x - uy * y, a[1] + uy * x + ux * y]))
      }
    } else if (o.object_type === 'structure.column') {
      const p = d.location_mm as number[], section = value(project, o, 'section_mm') as number[], t = structuralPlasterThickness(project, o)
      if (!p || !section || !t) continue
      const w = section[0] / 2 + t, h = section[1] / 2 + t
      rings = [[[p[0] - w, p[1] - h], [p[0] + w, p[1] - h], [p[0] + w, p[1] + h], [p[0] - w, p[1] + h]]]
    } else continue
    const phase = getDisplayPhase(o), group = groups.get(phase) ?? []; group.push(...rings); groups.set(phase, group)
  }
  return [...groups].map(([phase, rings]) => ({ phase, segments_mm: polygonUnionBoundary(rings) }))
}
