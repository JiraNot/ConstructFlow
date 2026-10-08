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
      frame_material: string
      panel_material?: string
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
      const masonryThickness = resolveValue(project, object, data, 'masonry_thickness_mm')
      const insidePlasterThickness = resolveValue(project, object, data, 'plaster_inside_thickness_mm')
      const outsidePlasterThickness = resolveValue(project, object, data, 'plaster_outside_thickness_mm')
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
        if (visibleObjectIds && !visibleObjectIds.has(opening.id)) continue
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
      const layers = isPositive(masonryThickness)
        ? [
            { role: 'masonry' as const, thickness_mm: masonryThickness, offset_mm: ((isPositive(outsidePlasterThickness) ? outsidePlasterThickness : 0) - (isPositive(insidePlasterThickness) ? insidePlasterThickness : 0)) / 2, material: String(resolveValue(project, object, data, 'material') ?? 'brick_masonry') },
            ...(isPositive(insidePlasterThickness) ? [{ role: 'plaster_inside' as const, thickness_mm: insidePlasterThickness, offset_mm: thickness / 2 - insidePlasterThickness / 2, material: String(resolveValue(project, object, data, 'plaster_inside_material') ?? 'cement_plaster') }] : []),
            ...(isPositive(outsidePlasterThickness) ? [{ role: 'plaster_outside' as const, thickness_mm: outsidePlasterThickness, offset_mm: -thickness / 2 + outsidePlasterThickness / 2, material: String(resolveValue(project, object, data, 'plaster_outside_material') ?? 'cement_plaster') }] : []),
          ]
        : undefined
      return baseObject(object, data, [...start], Math.atan2(dy, dx),
        { kind: 'wall_extrusion', length_mm: length, thickness_mm: thickness, height_mm: height, cutouts, ...(layers ? { layers } : {}) }, { kind: 'wall' })
    }
    case 'door_window.door':
    case 'door_window.window': {
      const hostId = data.wall_id
      const host = typeof hostId === 'string' ? project.objects[hostId] : undefined
      const hostData = host ? moduleData(host) : undefined
      const location = data.location_mm
      const width = resolveValue(project, object, data, 'width_mm')
      const height = resolveValue(project, object, data, 'height_mm')
      const sill = object.object_type === 'door_window.window' ? resolveValue(project, object, data, 'sill_height_mm') ?? 0 : 0
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
      return baseObject(object, data, [location[0], location[1], location[2] + sill + height / 2], Math.atan2(dy, dx), {
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
        frame_material: typeof frameMaterialValue === 'string' ? frameMaterialValue : 'aluminium',
        panel_material: typeof panelMaterialValue === 'string' ? panelMaterialValue : undefined,
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
