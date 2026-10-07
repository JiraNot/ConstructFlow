import {
  getDisplayPhase,
  resolveCatalogType,
  isColumnObject,
  type Phase,
  type ProjectDocument,
  type SmartObject,
} from '@constructflow/project-model'
import { constructionOutputs } from '@constructflow/domain-providers'
import { tube, type Triangle } from '@constructflow/geometry-kernel'

export type Vec3Mm = [number, number, number]

export interface OpeningCutout {
  object_id: string
  min_x_mm: number
  max_x_mm: number
  min_z_mm: number
  max_z_mm: number
}

export type RepresentationShape =
  | { kind: 'triangle_mesh'; triangles_mm: Triangle[] }
  | { kind: 'box'; size_mm: Vec3Mm }
  | { kind: 'wall_extrusion'; length_mm: number; thickness_mm: number; height_mm: number; cutouts: OpeningCutout[] }

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

function representObject(project: ProjectDocument, object: SmartObject, warnings: string[]): ObjectRepresentation3D | undefined {
  const data = moduleData(object)
  if (!data) {
    warnings.push(`${object.id}: module data is not an object; 3D representation omitted`)
    return undefined
  }
  switch (object.object_type) {
    case 'structure.column': {
      const location = data.location_mm
      const section = resolveValue(project, object, data, 'section_mm')
      const base = isFiniteNumber(data.base_elevation_mm) ? data.base_elevation_mm
        : levelElevation(project, data.base_level_id) ?? (tuple3(location) ? location[2] : 0)
      const top = isFiniteNumber(data.top_elevation_mm) ? data.top_elevation_mm
        : levelElevation(project, data.top_level_id) ?? base + 3000
      if (!tuple3(location) || !positiveTuple2(section) || !isFiniteNumber(base) || !isFiniteNumber(top) || top <= base) {
        warnings.push(`${object.id}: column location, section or vertical extent is invalid; 3D representation omitted`)
        return undefined
      }
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
      if (!tuple3(start) || !tuple3(end) || !positiveTuple2(section)) {
        warnings.push(`${object.id}: beam endpoints or section are invalid; 3D representation omitted`)
        return undefined
      }
      const dx = end[0] - start[0], dy = end[1] - start[1]
      const length = Math.hypot(dx, dy)
      if (!isPositive(length)) {
        warnings.push(`${object.id}: beam has no horizontal span; 3D representation omitted`)
        return undefined
      }
      return baseObject(object, data, [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, start[2] + section[1] / 2 - (typeof data.drop_mm === 'number' ? data.drop_mm : 0)], Math.atan2(dy, dx),
        { kind: 'box', size_mm: [length, section[0], section[1]] }, { kind: 'select_only' })
    }
    case 'architecture.wall': {
      const start = data.start_point_mm, end = data.end_point_mm
      const thickness = resolveValue(project, object, data, 'thickness_mm')
      const height = resolveValue(project, object, data, 'height_mm')
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
        const openingData = moduleData(opening)
        if (!openingData || openingData.wall_id !== object.id) continue
        const width = resolveValue(project, opening, openingData, 'width_mm')
        const openingHeight = resolveValue(project, opening, openingData, 'height_mm')
        const offset = openingData.offset_along_wall_mm
        const sill = opening.object_type === 'door_window.window' ? resolveValue(project, opening, openingData, 'sill_height_mm') ?? 0 : 0
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
      return baseObject(object, data, [...start], Math.atan2(dy, dx),
        { kind: 'wall_extrusion', length_mm: length, thickness_mm: thickness, height_mm: height, cutouts }, { kind: 'wall' })
    }
    case 'door_window.door':
    case 'door_window.window': {
      const hostId = data.wall_id
      const host = typeof hostId === 'string' ? project.objects[hostId] : undefined
      const hostData = host ? moduleData(host) : undefined
      const location = data.location_mm
      const width = resolveValue(project, object, data, 'width_mm')
      const height = resolveValue(project, object, data, 'height_mm')
      const sill = object.object_type === 'door_window.window' ? resolveValue(project, object, data, 'sill_height_mm') : 0
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
      return baseObject(object, data, [location[0], location[1], location[2] + sill + height / 2], Math.atan2(dy, dx),
        { kind: 'box', size_mm: [width, 45, height] }, interaction)
    }
    default:
      return undefined
  }
}

/** Build deterministic, renderer-neutral 3D descriptions for supported Smart Objects. */
export function buildProjectRepresentations3D(project: ProjectDocument): RepresentationResult {
  const warnings: string[] = []
  const objects = Object.values(project.objects)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(object => representObject(project, object, warnings))
    .filter((object): object is ObjectRepresentation3D => object !== undefined)
  for (const out of constructionOutputs(project)) {
    const object = project.objects[out.object_id], data = moduleData(object) ?? {}
    const triangles = [...out.meshes]
    if (!triangles.length) for(const path of out.paths) for(let i=1;i<path.length;i++) if(Math.hypot(...path[i].map((v,j)=>v-path[i-1][j]))>1e-8)triangles.push(...tube(path[i-1],path[i],typeof data.diameter_mm==='number'?data.diameter_mm/2:10))
    if(triangles.length) objects.push(baseObject(object,data,[0,0,0],0,{kind:'triangle_mesh',triangles_mm:triangles},{kind:'select_only'}))
    warnings.push(...out.warnings.map(w=>`${object.id}: ${w}`))
  }
  return { objects, warnings }
}
