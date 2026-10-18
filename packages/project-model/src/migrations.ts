import { DEFAULT_PHASES, DEFAULT_TYPES, type ProjectDocument, type TypeDefinition } from './project.js'
import { validateProjectV2 } from './validation.js'
import { legacyTypeUuid } from './legacyTypeUuid.js'

export interface ProjectDocumentV1 {
  schema_version: 1
  project: Record<string, unknown> & { id: string }
  levels: Array<Record<string, unknown> & { id: string }>
  phases?: Array<Record<string, unknown>>
  types?: Array<Record<string, unknown> & { id: string; object_type: string; name: string }>
  objects: Record<string, Record<string, unknown>>
  relationships?: Array<Record<string, unknown>>
  [key: string]: unknown
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ROOF_CATALOG_FIELDS = ['framing_system', 'rafter_spacing_mm', 'purlin_spacing_mm', 'truss_spacing_mm', 'rafter_section_mm', 'purlin_section_mm', 'truss_chord_section_mm', 'truss_web_section_mm', 'truss_depth_mm', 'framing_material']

/** Add the built-in roof framing types to older files and link legacy RF marks once. */
export function ensureRoofCatalogTypes(project: ProjectDocument): void {
  const defaults = DEFAULT_TYPES.filter(type => type.object_type === 'roof.system')
  for (const type of defaults) {
    const normalizedName = type.name.trim().toLowerCase()
    const exists = project.types.some(candidate => candidate.object_type === 'roof.system'
      && (candidate.id === type.id || candidate.name.trim().toLowerCase() === normalizedName))
    if (!exists) project.types.push(structuredClone(type))
  }

  for (const object of Object.values(project.objects)) {
    if (object.object_type !== 'roof.system') continue
    const data = object.module_data as Record<string, unknown>
    if (typeof data.type_id === 'string' && data.type_id) continue
    const mark = typeof data.mark === 'string' ? data.mark.trim().toLowerCase() : ''
    const matches = project.types.filter(type => type.object_type === 'roof.system' && type.name.trim().toLowerCase() === mark)
    if (matches.length !== 1) continue
    const type = matches[0]
    data.type_id = type.id
    const overrides = data.instance_overrides && typeof data.instance_overrides === 'object' && !Array.isArray(data.instance_overrides)
      ? structuredClone(data.instance_overrides as Record<string, unknown>)
      : {}
    for (const field of ROOF_CATALOG_FIELDS) {
      if (data[field] !== undefined && type.parameters[field] !== undefined
        && JSON.stringify(data[field]) !== JSON.stringify(type.parameters[field])) {
        overrides[field] = structuredClone(data[field])
      }
    }
    data.instance_overrides = overrides
  }
}

export function migrateProjectV1ToV2(source: ProjectDocumentV1): ProjectDocument {
  const project = structuredClone(source) as unknown as ProjectDocument
  const legacyTypes = Array.isArray(source.types) ? structuredClone(source.types) : []
  const ids = new Set<string>()
  const migratedTypes = legacyTypes.map(raw => {
    const type = raw as unknown as TypeDefinition
    if (!type.object_type || !type.name || !type.id) throw new Error('Invalid v1 catalog type: id, object_type and name are required')
    const originalId = type.id
    type.id = UUID_RE.test(originalId) ? originalId.toLowerCase() : legacyTypeUuid(type.object_type, originalId, type.name)
    if (ids.has(type.id)) throw new Error(`Duplicate type UUID in v1 catalog: ${type.id}`)
    ids.add(type.id)
    type.parameters = type.parameters && typeof type.parameters === 'object' ? type.parameters : {}
    return type
  })

  const typed = new Map<string, TypeDefinition[]>()
  for (const type of migratedTypes) {
    const key = `${type.object_type}\0${type.name.trim().toLowerCase()}`
    typed.set(key, [...(typed.get(key) ?? []), type])
  }
  for (const [id, object] of Object.entries(project.objects ?? {})) {
    if (!object || typeof object !== 'object' || object.id !== id || !object.module_data || typeof object.module_data !== 'object') {
      throw new Error(`Invalid v1 Smart Object record: ${id}`)
    }
    const data = object.module_data as Record<string, unknown>
    if (data.type_id !== undefined) {
      const typeId = typeof data.type_id === 'string' && UUID_RE.test(data.type_id) ? data.type_id.toLowerCase() : undefined
      if (!typeId || !ids.has(typeId)) throw new Error(`Object ${id} references an unknown catalog type UUID`)
      data.type_id = typeId
      data.instance_overrides ??= {}
      continue
    }
    if (typeof data.mark !== 'string') continue
    const matches = typed.get(`${object.object_type}\0${data.mark.trim().toLowerCase()}`) ?? []
    if (matches.length > 1) throw new Error(`Ambiguous v1 type mark ${data.mark} on object ${id}`)
    const type = matches[0]
    if (!type) continue
    data.type_id = type.id
    const fieldMap: Record<string, string[]> = {
      'structure.column': ['section_mm', 'plaster_thickness_mm', 'material'], 'structure.foundation': ['size_mm', 'foundation_type', 'material'],
      'structure.beam': ['section_mm', 'material'], 'architecture.wall': ['thickness_mm', 'height_mm', 'material', 'wall_system', 'masonry_thickness_mm', 'plaster_inside_thickness_mm', 'plaster_outside_thickness_mm', 'plaster_inside_material', 'plaster_outside_material', 'inside_finish_mark', 'outside_finish_mark'],
      'door_window.door': ['width_mm', 'height_mm', 'opening_operation', 'panel_count', 'panel_layout', 'panel_width_ratios', 'transom_height_mm', 'muntin_rows', 'muntin_columns', 'transom_muntin_rows', 'transom_muntin_columns', 'bottom_light_muntin_rows', 'bottom_light_muntin_columns', 'frame_depth_mm', 'frame_face_width_mm', 'sash_face_width_mm', 'door_leaf_thickness_mm', 'frame_material', 'panel_material', 'door_leaf_style', 'door_face_components', 'plan_symbol_lines', 'opening_handle_style', 'opening_hardware_finish', 'glazing_material', 'glazing_transmission'],
      'door_window.window': ['width_mm', 'height_mm', 'sill_height_mm', 'opening_operation', 'panel_count', 'panel_layout', 'panel_width_ratios', 'transom_height_mm', 'bottom_light_height_mm', 'muntin_rows', 'muntin_columns', 'transom_muntin_rows', 'transom_muntin_columns', 'bottom_light_muntin_rows', 'bottom_light_muntin_columns', 'frame_depth_mm', 'frame_face_width_mm', 'sash_face_width_mm', 'frame_material', 'opening_handle_style', 'opening_hardware_finish', 'glazing_material', 'glazing_transmission', 'plan_symbol_lines', 'plan_symbol_reference_depth_mm'],
    }
    const overrides: Record<string, unknown> = {}
    for (const field of fieldMap[object.object_type] ?? []) {
      if (data[field] !== undefined && type.parameters[field] !== undefined && JSON.stringify(data[field]) !== JSON.stringify(type.parameters[field])) {
        overrides[field] = data[field]
      }
    }
    data.instance_overrides = overrides
  }

  project.schema_version = 2
  project.types = migratedTypes
  project.phases = Array.isArray(source.phases) && source.phases.length
    ? structuredClone(source.phases) as unknown as ProjectDocument['phases']
    : structuredClone(DEFAULT_PHASES)
  project.relationships = Array.isArray(source.relationships) ? structuredClone(source.relationships) as unknown as ProjectDocument['relationships'] : []
  ensureRoofCatalogTypes(project)
  validateProjectV2(project)
  return project
}
