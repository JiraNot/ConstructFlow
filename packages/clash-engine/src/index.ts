import { resolveBeamBaseElevation, resolveCatalogType, resolveColumnVerticalExtent, type ProjectDocument, type SmartObject } from '@constructflow/project-model'
import { constructionOutputs } from '@constructflow/domain-providers'

export type Vec3 = [number, number, number]

/** Axis-aligned bounds; project analysis uses the model's canonical millimeter units. */
export interface SpatialBounds {
  min: Vec3
  max: Vec3
}

export interface SpatialObjectBounds {
  object_id: string
  object_type: string
  created_phase: SmartObject['created_phase']
  removed_phase: SmartObject['removed_phase']
  level_id?: string
  host_refs: string[]
  bounds: SpatialBounds
}

export interface SpatialCandidatePair {
  first: SpatialObjectBounds
  second: SpatialObjectBounds
}

export interface ProjectSpatialAnalysis {
  objects: SpatialObjectBounds[]
  candidate_pairs: SpatialCandidatePair[]
  warnings: string[]
}

export type SpatialInteractionKind = 'intentional_connection' | 'boundary_contact' | 'overlap_candidate'

/**
 * A conservative broad-phase interaction. `overlap_candidate` is not a hard-clash verdict:
 * supported object bounds are AABBs, so exact geometry/clearance checks are still required.
 */
export interface SpatialInteraction extends SpatialCandidatePair {
  kind: SpatialInteractionKind
  overlap_mm: Vec3
}

export interface SpatialEntry<T> {
  bounds: SpatialBounds
  value: T
}

interface RTreeNode<T> {
  leaf: boolean
  bounds: SpatialBounds
  children: Array<RTreeNode<T> | SpatialEntry<T>>
}

type Data = Record<string, unknown>
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isPositiveNumber = (value: unknown): value is number => isFiniteNumber(value) && value > 0

function record(value: unknown): Data | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Data : undefined
}

function tuple3(value: unknown): Vec3 | undefined {
  if (!Array.isArray(value) || value.length !== 3) return undefined
  const tuple: unknown[] = value
  return tuple.every(isFiniteNumber) ? tuple as Vec3 : undefined
}

function positiveTuple2(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 2) return undefined
  const tuple: unknown[] = value
  return tuple.every(isPositiveNumber) ? tuple as [number, number] : undefined
}

function valueFor(project: ProjectDocument, object: SmartObject, data: Data, field: string): unknown {
  const overrides = record(data.instance_overrides)
  const override = overrides?.[field]
  if (override !== undefined) return override
  if (data[field] !== undefined) return data[field]
  const reference = typeof data.type_id === 'string' ? data.type_id : typeof data.mark === 'string' ? data.mark : undefined
  return resolveCatalogType(project, object.object_type, reference)?.parameters[field]
}

function makeBounds(min: Vec3, max: Vec3): SpatialBounds | undefined {
  if (![...min, ...max].every(isFiniteNumber) || min.some((value, index) => value > max[index])) return undefined
  return { min, max }
}

function isValidBounds(value: unknown): value is SpatialBounds {
  const candidate = record(value)
  const min = candidate?.min
  const max = candidate?.max
  return Array.isArray(min) && min.length === 3 && Array.isArray(max) && max.length === 3
    && min.every(isFiniteNumber) && max.every(isFiniteNumber)
    && min.every((coordinate, axis) => coordinate <= max[axis])
}

function assertValidBounds(value: unknown, label: string): asserts value is SpatialBounds {
  if (!isValidBounds(value)) throw new Error(`${label} must contain finite 3D min/max coordinates in ascending order`)
}

function boundsFor(project: ProjectDocument, object: SmartObject, warnings: string[]): SpatialBounds | undefined {
  const data = record(object.module_data)
  if (!data) {
    warnings.push(`${object.id}: module data is not an object; spatial bounds omitted`)
    return undefined
  }

  if (object.object_type === 'structure.column') {
    const location = tuple3(data.location_mm)
    const section = positiveTuple2(valueFor(project, object, data, 'section_mm'))
    if (!location || !section) {
      warnings.push(`${object.id}: column location or section is invalid; spatial bounds omitted`)
      return undefined
    }
    const extent = resolveColumnVerticalExtent(project, object)
    if (!extent) {
      warnings.push(`${object.id}: column top is not above its base; spatial bounds omitted`)
      return undefined
    }
    const { base_elevation_mm: base, top_elevation_mm: top } = extent
    const rotation = isFiniteNumber(data.rotation_deg) ? data.rotation_deg * Math.PI / 180 : 0
    const halfX = (Math.abs(Math.cos(rotation)) * section[0] + Math.abs(Math.sin(rotation)) * section[1]) / 2
    const halfY = (Math.abs(Math.sin(rotation)) * section[0] + Math.abs(Math.cos(rotation)) * section[1]) / 2
    return makeBounds([location[0] - halfX, location[1] - halfY, base], [location[0] + halfX, location[1] + halfY, top])
  }

  if (object.object_type === 'structure.foundation') {
    const center = tuple3(data.center_mm)
    const size = valueFor(project, object, data, 'size_mm')
    if (!center || !Array.isArray(size) || size.length !== 3 || !size.every(isPositiveNumber)) {
      warnings.push(`${object.id}: foundation center or size is invalid; spatial bounds omitted`)
      return undefined
    }
    const [width, length, thickness] = size as [number, number, number]
    const top = isFiniteNumber(data.top_elevation_mm) ? data.top_elevation_mm : center[2]
    return makeBounds([center[0] - width / 2, center[1] - length / 2, top - thickness], [center[0] + width / 2, center[1] + length / 2, top])
  }

  if (object.object_type === 'structure.beam') {
    const start = tuple3(data.start_point_mm)
    const end = tuple3(data.end_point_mm)
    const section = positiveTuple2(valueFor(project, object, data, 'section_mm'))
    const baseElevation = resolveBeamBaseElevation(project, object)
    if (!start || !end || !section || baseElevation === undefined) {
      warnings.push(`${object.id}: beam endpoints or section are invalid; spatial bounds omitted`)
      return undefined
    }
    const halfPlan = Math.max(...section) / 2
    const drop=isFiniteNumber(data.drop_mm)?data.drop_mm:0
    return makeBounds(
      [Math.min(start[0], end[0]) - halfPlan, Math.min(start[1], end[1]) - halfPlan, baseElevation-drop],
      [Math.max(start[0], end[0]) + halfPlan, Math.max(start[1], end[1]) + halfPlan, baseElevation+section[1]-drop],
    )
  }

  if (object.object_type === 'architecture.wall') {
    const start = tuple3(data.start_point_mm)
    const end = tuple3(data.end_point_mm)
    const thickness = valueFor(project, object, data, 'thickness_mm')
    const height = valueFor(project, object, data, 'height_mm')
    if (!start || !end || !isPositiveNumber(thickness) || !isPositiveNumber(height)) {
      warnings.push(`${object.id}: wall endpoints, thickness or height are invalid; spatial bounds omitted`)
      return undefined
    }
    const halfThickness = thickness / 2
    return makeBounds(
      [Math.min(start[0], end[0]) - halfThickness, Math.min(start[1], end[1]) - halfThickness, Math.min(start[2], end[2])],
      [Math.max(start[0], end[0]) + halfThickness, Math.max(start[1], end[1]) + halfThickness, Math.max(start[2] + height, end[2] + height)],
    )
  }

  return undefined
}

export function intersects(a: SpatialBounds, b: SpatialBounds): boolean {
  assertValidBounds(a, 'First spatial bounds')
  assertValidBounds(b, 'Second spatial bounds')
  return overlaps(a, b)
}

function overlaps(a: SpatialBounds, b: SpatialBounds): boolean {
  return a.min[0] <= b.max[0] && a.max[0] >= b.min[0]
    && a.min[1] <= b.max[1] && a.max[1] >= b.min[1]
    && a.min[2] <= b.max[2] && a.max[2] >= b.min[2]
}

function unionBounds(bounds: SpatialBounds[]): SpatialBounds {
  return {
    min: [0, 1, 2].map(axis => Math.min(...bounds.map(item => item.min[axis]))) as Vec3,
    max: [0, 1, 2].map(axis => Math.max(...bounds.map(item => item.max[axis]))) as Vec3,
  }
}

function centerOnAxis(bounds: SpatialBounds, axis: number): number {
  return (bounds.min[axis] + bounds.max[axis]) / 2
}

/** A packed 3D R-tree optimized for rebuilding an index from a project snapshot. */
export class RTree<T> {
  private readonly root: RTreeNode<T> | null
  readonly size: number

  constructor(entries: Array<SpatialEntry<T>>, readonly maxEntries = 8) {
    if (!Number.isInteger(maxEntries) || maxEntries < 4) throw new Error('R-tree maxEntries must be an integer of at least 4')
    for (const [index, entry] of entries.entries()) assertValidBounds(entry?.bounds, `R-tree entry ${index}`)
    this.size = entries.length
    if (!entries.length) {
      this.root = null
      return
    }
    let axis = 0
    let level: RTreeNode<T>[] = []
    const sortedEntries = [...entries].sort((a, b) => centerOnAxis(a.bounds, axis) - centerOnAxis(b.bounds, axis))
    for (let i = 0; i < sortedEntries.length; i += maxEntries) {
      const children = sortedEntries.slice(i, i + maxEntries)
      level.push({ leaf: true, bounds: unionBounds(children.map(entry => entry.bounds)), children })
    }
    axis = 1
    while (level.length > maxEntries) {
      const sortedNodes = level.sort((a, b) => centerOnAxis(a.bounds, axis) - centerOnAxis(b.bounds, axis))
      const parentLevel: RTreeNode<T>[] = []
      for (let i = 0; i < sortedNodes.length; i += maxEntries) {
        const children = sortedNodes.slice(i, i + maxEntries)
        parentLevel.push({ leaf: false, bounds: unionBounds(children.map(node => node.bounds)), children })
      }
      level = parentLevel
      axis = (axis + 1) % 3
    }
    this.root = level.length === 1
      ? level[0]
      : { leaf: false, bounds: unionBounds(level.map(node => node.bounds)), children: level }
  }

  search(bounds: SpatialBounds): Array<SpatialEntry<T>> {
    assertValidBounds(bounds, 'R-tree query bounds')
    if (!this.root) return []
    const found: Array<SpatialEntry<T>> = []
    const stack: RTreeNode<T>[] = [this.root]
    while (stack.length) {
      const node = stack.pop()!
      if (!overlaps(node.bounds, bounds)) continue
      if (node.leaf) {
        for (const child of node.children as Array<SpatialEntry<T>>) if (overlaps(child.bounds, bounds)) found.push(child)
      } else {
        for (const child of node.children as Array<RTreeNode<T>>) if (overlaps(child.bounds, bounds)) stack.push(child)
      }
    }
    return found
  }
}

/** Create conservative AABBs for currently supported structural and wall objects. */
export function analyzeProjectSpatialBounds(project: ProjectDocument): ProjectSpatialAnalysis {
  const warnings: string[] = []
  const objects: SpatialObjectBounds[] = []
  const domainBounds=new Map<string,SpatialBounds>()
  for(const out of constructionOutputs(project)){
    const data=record(project.objects[out.object_id].module_data),points=[...out.meshes.flat(),...out.paths.flat()]
    if(out.family==='drainage.pipe_route'&&['soil','waste','rainwater'].includes(String(data?.system))&&(data?.start_invert_mm===null||data?.end_invert_mm===null)){warnings.push(`${out.object_id}: unknown invert; spatial clearance cannot be verified`);continue}
    if(!points.length)continue;const radius=isPositiveNumber(data?.diameter_mm)?data.diameter_mm/2:0
    domainBounds.set(out.object_id,{min:[0,1,2].map(i=>Math.min(...points.map(v=>v[i]))-radius) as Vec3,max:[0,1,2].map(i=>Math.max(...points.map(v=>v[i]))+radius) as Vec3})
  }
  for (const object of Object.values(project.objects)) {
    const bounds = domainBounds.get(object.id)??boundsFor(project, object, warnings)
    if (!bounds) continue
    const data = record(object.module_data)
    const levelId = typeof data?.level_id === 'string'
      ? data.level_id
      : typeof data?.base_level_id === 'string'
        ? data.base_level_id
        : object.level_refs.find(ref => ref.role === 'base_level' || ref.role === 'host_level')?.level_id
    objects.push({
      object_id: object.id,
      object_type: object.object_type,
      created_phase: object.created_phase,
      removed_phase: object.removed_phase,
      level_id: levelId,
      host_refs: [...object.host_refs],
      bounds,
    })
  }

  const entries = objects.map(value => ({ bounds: value.bounds, value }))
  const tree = new RTree(entries)
  const candidate_pairs: SpatialCandidatePair[] = []
  for (const object of objects) {
    for (const { value: other } of tree.search(object.bounds)) {
      if (object.object_id < other.object_id) candidate_pairs.push({ first: object, second: other })
    }
  }
  candidate_pairs.sort((a, b) => a.first.object_id.localeCompare(b.first.object_id) || a.second.object_id.localeCompare(b.second.object_id))
  return { objects, candidate_pairs, warnings }
}

/** Classify broad-phase pairs without promoting AABB overlap to a hard-clash claim. */
export function classifySpatialInteractions(
  analysis: ProjectSpatialAnalysis,
  contactToleranceMm = 0.5,
): SpatialInteraction[] {
  if (!isFiniteNumber(contactToleranceMm) || contactToleranceMm < 0) {
    throw new Error('Contact tolerance must be a finite non-negative millimeter value')
  }
  return analysis.candidate_pairs.map(({ first, second }) => {
    const overlap_mm = [0, 1, 2].map(axis => Math.max(
      0,
      Math.min(first.bounds.max[axis], second.bounds.max[axis])
        - Math.max(first.bounds.min[axis], second.bounds.min[axis]),
    )) as Vec3
    const connected = first.host_refs.includes(second.object_id) || second.host_refs.includes(first.object_id)
    const kind: SpatialInteractionKind = connected
      ? 'intentional_connection'
      : overlap_mm.some(depth => depth <= contactToleranceMm)
        ? 'boundary_contact'
        : 'overlap_candidate'
    return { first, second, kind, overlap_mm }
  })
}

export * from './legalEngine.js'
