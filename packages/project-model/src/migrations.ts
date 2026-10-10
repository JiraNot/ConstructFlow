import { validateDoorFaceComponents } from './doorFace.js'
import { validateOpeningPlanSymbolLines } from './openingPlanSymbol.js'
import type { Phase } from './types.js'
import type { ProjectDocument, TypeDefinition } from './project.js'
import { validateConstructionPayloads } from './constructionValidation.js'
import { validateDrawingSettings } from './sheetSettings.js'

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

const V5_NAMESPACE = '6770dbfa-ff6e-47e6-b5e8-18c0581970c8'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PHASES = new Set<Phase>(['existing', 'demolition', 'new_construction'])
const PILE_TYPES = new Set(['micro_pile_i18', 'micro_pile_i22', 'spun_micro_pile_20', 'spun_micro_pile_25', 'bored_pile'])

/** Deterministic RFC-4122 UUID v5 using the ConstructFlow catalog namespace. */
export function legacyTypeUuid(objectType: string, legacyId: string, name: string): string {
  const namespace = V5_NAMESPACE.replaceAll('-', '').match(/.{2}/g)!.map(value => parseInt(value, 16))
  const nameBytes = [...new TextEncoder().encode(`constructflow/catalog/v1/${objectType}/${legacyId}/${name.trim().toLowerCase()}`)]
  const bytes = [...namespace, ...nameBytes]
  const bitLength = bytes.length * 8
  bytes.push(0x80)
  while (bytes.length % 64 !== 56) bytes.push(0)
  const high = Math.floor(bitLength / 0x100000000)
  const low = bitLength >>> 0
  for (const value of [high, low]) bytes.push(value >>> 24, value >>> 16 & 255, value >>> 8 & 255, value & 255)

  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = new Uint32Array(80)
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4
      words[i] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>> 0
    }
    for (let i = 16; i < 80; i++) {
      const value = words[i - 3] ^ words[i - 8] ^ words[i - 14] ^ words[i - 16]
      words[i] = ((value << 1) | (value >>> 31)) >>> 0
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4
    for (let i = 0; i < 80; i++) {
      let f: number, k: number
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999 }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1 }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc }
      else { f = b ^ c ^ d; k = 0xca62c1d6 }
      const rotated = ((a << 5) | (a >>> 27)) >>> 0
      const next = (rotated + f + e + k + words[i]) >>> 0
      e = d; d = c; c = ((b << 30) | (b >>> 2)) >>> 0; b = a; a = next
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0
  }
  const hash = [h0, h1, h2, h3, h4].flatMap(value => [value >>> 24, value >>> 16 & 255, value >>> 8 & 255, value & 255]).slice(0, 16)
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = hash.map(value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
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
  project.phases = Array.isArray(source.phases) ? structuredClone(source.phases) as unknown as ProjectDocument['phases'] : []
  project.relationships = Array.isArray(source.relationships) ? structuredClone(source.relationships) as unknown as ProjectDocument['relationships'] : []
  validateProjectV2(project)
  return project
}

export function validateProjectV2(project: ProjectDocument): void {
  if (project.schema_version !== 2) throw new Error(`Unsupported schema_version: ${project.schema_version}`)
  if (!project.project || typeof project.project.id !== 'string' || !project.project.id) throw new Error('Invalid project format: missing project metadata')
  if (!PHASES.has(project.project.active_phase)) throw new Error('Invalid project format: unknown active phase')
  if (project.project.display_unit !== undefined && !['m', 'cm', 'mm'].includes(project.project.display_unit)) throw new Error('Invalid project format: display_unit must be m, cm or mm')
  if (!Array.isArray(project.levels) || !Array.isArray(project.types) || !Array.isArray(project.phases) || !Array.isArray(project.relationships)) {
    throw new Error('Invalid project format: levels, types, phases and relationships arrays required')
  }
  if (!project.objects || typeof project.objects !== 'object' || Array.isArray(project.objects)) throw new Error('Invalid project format: objects map required')
  validateConstructionPayloads(project)
  if(project.drawing_settings!==undefined)validateDrawingSettings(project.drawing_settings)
  if (project.underlays !== undefined) {
    if (!project.underlays || typeof project.underlays !== 'object' || Array.isArray(project.underlays)) throw new Error('Invalid project format: underlays must be a keyed map')
    for (const [key, underlay] of Object.entries(project.underlays)) {
      if (!key || !underlay || typeof underlay.data_url !== 'string' || !underlay.data_url.startsWith('data:image/')) throw new Error(`Invalid project format: underlay ${key} must contain an embedded image`)
      if (!Array.isArray(underlay.origin_mm) || underlay.origin_mm.length !== 2 || underlay.origin_mm.some(value => !Number.isFinite(value))) throw new Error(`Invalid project format: underlay ${key} has invalid origin`)
      if (!Number.isFinite(underlay.scale_mm_per_px) || underlay.scale_mm_per_px <= 0 || !Number.isFinite(underlay.rotation_deg) || !Number.isFinite(underlay.opacity) || underlay.opacity < 0 || underlay.opacity > 1 || typeof underlay.visible !== 'boolean') throw new Error(`Invalid project format: underlay ${key} has invalid transform or visibility`)
    }
  }
  function requireFinite(value: unknown, objectId: string, field: string): asserts value is number {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Invalid project format: object ${objectId} has a non-finite ${field}`)
  }
  function requirePositive(value: unknown, objectId: string, field: string): asserts value is number {
    requireFinite(value, objectId, field)
    if (value <= 0) throw new Error(`Invalid project format: object ${objectId} has a non-positive ${field}`)
  }
  function requireTuple(value: unknown, length: number, objectId: string, field: string, positive = false): asserts value is number[] {
    if (!Array.isArray(value) || value.length !== length) throw new Error(`Invalid project format: object ${objectId} has invalid ${field}`)
    value.forEach((item, index) => positive ? requirePositive(item, objectId, `${field}[${index}]`) : requireFinite(item, objectId, `${field}[${index}]`))
  }
  function requirePoint(value: unknown, objectId: string, field: string): asserts value is number[] {
    if (!Array.isArray(value) || (value.length !== 2 && value.length !== 3)) throw new Error(`Invalid project format: object ${objectId} has invalid ${field}`)
    value.forEach((item, index) => requireFinite(item, objectId, `${field}[${index}]`))
  }
  function validateFamilyParameters(values: Record<string, unknown>, objectType: string, owner: string): void {
    const allowedFamilies: Record<string, string[]> = {
      section_mm: ['structure.column', 'structure.beam'],
      plaster_thickness_mm: ['structure.column'],
      size_mm: ['structure.foundation', 'drainage.manhole'],
      foundation_type: ['structure.foundation'],
      thickness_mm: ['architecture.wall', 'structure.slab', 'roof.system', 'architecture.floor', 'architecture.ceiling'],
      masonry_thickness_mm: ['architecture.wall'],
      plaster_inside_thickness_mm: ['architecture.wall'],
      plaster_outside_thickness_mm: ['architecture.wall'],
      plaster_inside_material: ['architecture.wall'],
      plaster_outside_material: ['architecture.wall'],
      wall_system: ['architecture.wall'],
      inside_finish_mark: ['architecture.wall'],
      outside_finish_mark: ['architecture.wall'],
      top_level_id: ['architecture.wall', 'structure.column'],
      base_offset_mm: ['architecture.wall', 'structure.column', 'structure.beam'],
      top_offset_mm: ['architecture.wall', 'structure.column'],
      vertical_constraint: ['architecture.wall', 'structure.column', 'door_window.door', 'door_window.window'],
      width_mm: ['door_window.door', 'door_window.window', 'interior.cabinet_run', 'architecture.stair'],
      height_mm: ['architecture.wall', 'door_window.door', 'door_window.window', 'interior.cabinet_run'],
      sill_height_mm: ['door_window.door', 'door_window.window'],
      head_level_id: ['door_window.door', 'door_window.window'],
      head_offset_mm: ['door_window.door', 'door_window.window'],
      elevation_offset_mm: ['structure.slab', 'architecture.floor', 'architecture.ceiling'],
      voids_mm: ['structure.slab', 'architecture.floor', 'architecture.ceiling'],
      finish_layers: ['architecture.floor'],
      finish_pattern_mm: ['architecture.floor'],
      finish_pattern_origin_mm: ['architecture.floor'],
      finish_pattern_rotation_deg: ['architecture.floor'],
      grid_mm: ['architecture.ceiling'],
      opening_operation: ['door_window.door', 'door_window.window'],
      panel_count: ['door_window.door', 'door_window.window'],
      panel_layout: ['door_window.door', 'door_window.window'],
      panel_width_ratios: ['door_window.door', 'door_window.window'],
      transom_height_mm: ['door_window.door', 'door_window.window'],
      bottom_light_height_mm: ['door_window.window'],
      muntin_rows: ['door_window.door', 'door_window.window'],
      muntin_columns: ['door_window.door', 'door_window.window'],
      transom_muntin_rows: ['door_window.door', 'door_window.window'],
      transom_muntin_columns: ['door_window.door', 'door_window.window'],
      bottom_light_muntin_rows: ['door_window.door', 'door_window.window'],
      bottom_light_muntin_columns: ['door_window.door', 'door_window.window'],
      frame_depth_mm: ['door_window.door', 'door_window.window'],
      frame_face_width_mm: ['door_window.door', 'door_window.window'],
      sash_face_width_mm: ['door_window.door', 'door_window.window'],
      door_leaf_thickness_mm: ['door_window.door'],
      frame_material: ['door_window.door', 'door_window.window'],
      panel_material: ['door_window.door'],
      door_leaf_style: ['door_window.door'],
      door_face_components: ['door_window.door'],
      plan_symbol_lines: ['door_window.door', 'door_window.window'],
      plan_symbol_reference_depth_mm: ['door_window.window'],
      opening_handle_style: ['door_window.door', 'door_window.window'],
      opening_hardware_finish: ['door_window.door', 'door_window.window'],
      glazing_material: ['door_window.door', 'door_window.window'],
      glazing_transmission: ['door_window.door', 'door_window.window'],
      placement_reference: ['structure.beam', 'architecture.wall'],
      interior_side: ['architecture.wall'],
      drop_mm:['structure.beam','architecture.bathroom'],rebar_type:['structure.beam','structure.column'],topping_mm:['structure.slab'],slab_system:['structure.slab'],
      eccentric_offset_mm: ['structure.foundation'],
      strap_beam_id: ['structure.foundation'],
      middle_support_column_id: ['structure.beam'],
      beam_system: ['structure.beam'],
      continuity_type: ['structure.beam'],
      skin_rebar_required: ['structure.beam'],
      shower_curb_mm: ['architecture.bathroom'],
      wall_tile_height_mm: ['architecture.bathroom'],
    }
    for (const [field, families] of Object.entries(allowedFamilies)) {
      if (values[field] !== undefined && !families.includes(objectType)) {
        throw new Error(`Invalid project format: ${owner} has ${field} outside its ${objectType} family`)
      }
    }
    if (values.finish_layers !== undefined) {
      if (!Array.isArray(values.finish_layers)) throw new Error(`Invalid project format: ${owner} finish_layers must be a list`)
      values.finish_layers.forEach((rawLayer, index) => {
        if (!rawLayer || typeof rawLayer !== 'object' || Array.isArray(rawLayer)) throw new Error(`Invalid project format: ${owner} finish layer ${index + 1} is invalid`)
        const layer = rawLayer as Record<string, unknown>
        if (typeof layer.material !== 'string' || !layer.material.trim()) throw new Error(`Invalid project format: ${owner} finish layer ${index + 1} has no material`)
        requirePositive(layer.thickness_mm, owner, `finish_layers[${index}].thickness_mm`)
        if (layer.mark !== undefined && (typeof layer.mark !== 'string' || !layer.mark.trim())) throw new Error(`Invalid project format: ${owner} finish layer ${index + 1} has an invalid mark`)
        if (layer.quantity_unit !== undefined && layer.quantity_unit !== 'm2' && layer.quantity_unit !== 'm3') throw new Error(`Invalid project format: ${owner} finish layer ${index + 1} has an invalid quantity unit`)
      })
    }
    if (values.finish_pattern_mm !== undefined) requireTuple(values.finish_pattern_mm, 2, owner, 'finish_pattern_mm', true)
    if (values.finish_pattern_origin_mm !== undefined) requireTuple(values.finish_pattern_origin_mm, 2, owner, 'finish_pattern_origin_mm')
    if (values.finish_pattern_rotation_deg !== undefined) requireFinite(values.finish_pattern_rotation_deg, owner, 'finish_pattern_rotation_deg')
    if (values.grid_mm !== undefined) requireTuple(values.grid_mm, 2, owner, 'grid_mm', true)
    if (values.placement_reference !== undefined && !['centerline', 'left_face', 'right_face'].includes(String(values.placement_reference))) {
      throw new Error(`Invalid project format: ${owner} has an invalid placement reference`)
    }
    if (values.interior_side !== undefined && !['left', 'right'].includes(String(values.interior_side))) {
      throw new Error(`Invalid project format: ${owner} has an invalid interior side`)
    }
    if (values.plaster_thickness_mm !== undefined && (typeof values.plaster_thickness_mm !== 'number' || !Number.isFinite(values.plaster_thickness_mm) || values.plaster_thickness_mm < 0)) throw new Error(`Invalid project format: ${owner} has an invalid plaster_thickness_mm`)
    for (const field of ['inside_finish_mark', 'outside_finish_mark'] as const) {
      if (values[field] !== undefined && typeof values[field] !== 'string') throw new Error(`Invalid project format: ${owner} has an invalid ${field}`)
    }
    if (values.material !== undefined && (typeof values.material !== 'string' || !values.material.trim())) {
      throw new Error(`Invalid project format: ${owner} has an invalid material`)
    }
    for (const field of ['plaster_inside_material', 'plaster_outside_material'] as const) {
      if (values[field] !== undefined && (typeof values[field] !== 'string' || !values[field].trim())) throw new Error(`Invalid project format: ${owner} has an invalid ${field}`)
    }
    const hasWallLayers = ['masonry_thickness_mm', 'plaster_inside_thickness_mm', 'plaster_outside_thickness_mm'].some(field => values[field] !== undefined)
    if (hasWallLayers) {
      if (objectType !== 'architecture.wall') throw new Error(`Invalid project format: ${owner} has wall layers outside architecture.wall`)
      requirePositive(values.masonry_thickness_mm, owner, 'masonry_thickness_mm')
      for (const field of ['plaster_inside_thickness_mm', 'plaster_outside_thickness_mm'] as const) {
        if (values[field] !== undefined) {
          requireFinite(values[field], owner, field)
          if (Number(values[field]) < 0) throw new Error(`Invalid project format: ${owner} has negative ${field}`)
        }
      }
      const total = Number(values.masonry_thickness_mm) + Number(values.plaster_inside_thickness_mm ?? 0) + Number(values.plaster_outside_thickness_mm ?? 0)
      if (!owner.endsWith('instance overrides') && values.thickness_mm !== undefined && Math.abs(Number(values.thickness_mm) - total) > 1) throw new Error(`Invalid project format: ${owner} overall thickness must equal masonry and plaster layers`)
    }
    if (values.opening_operation !== undefined && !['hinged', 'sliding', 'fixed', 'awning', 'louver', 'bifold', 'pocket', 'surface_sliding'].includes(String(values.opening_operation))) {
      throw new Error(`Invalid project format: ${owner} has an invalid opening operation`)
    }
    for (const field of ['frame_material', 'panel_material'] as const) {
      if (values[field] !== undefined && (typeof values[field] !== 'string' || !values[field].trim())) {
        throw new Error(`Invalid project format: ${owner} has an invalid ${field}`)
      }
    }
    if (values.door_face_components !== undefined) validateDoorFaceComponents(values.door_face_components)
    if (values.plan_symbol_lines !== undefined) validateOpeningPlanSymbolLines(values.plan_symbol_lines)
    if (values.plan_symbol_reference_depth_mm !== undefined) {
      requireFinite(values.plan_symbol_reference_depth_mm, owner, 'plan_symbol_reference_depth_mm')
      if (Number(values.plan_symbol_reference_depth_mm) < 50 || Number(values.plan_symbol_reference_depth_mm) > 1000) throw new Error(`Invalid project format: ${owner} has an invalid plan_symbol_reference_depth_mm`)
    }
    const enumFields = {
      door_leaf_style: ['flush', 'raised_2_panel', 'raised_4_panel', 'raised_6_panel', 'horizontal_grooves_3', 'horizontal_grooves_5', 'vertical_grooves_3', 'louvered'],
      opening_handle_style: ['lever', 'round_knob', 'pull_handle', 'recessed_pull', 'none'],
      opening_hardware_finish: ['stainless', 'matte_black', 'satin_brass', 'bronze'],
      vertical_constraint: ['fixed_height', 'top_level', 'head_level'],
    } as const
    for (const [field, valuesAllowed] of Object.entries(enumFields)) {
      if (values[field] !== undefined && !valuesAllowed.includes(String(values[field]) as never)) {
        throw new Error(`Invalid project format: ${owner} has an invalid ${field}`)
      }
    }
    if (values.glazing_material !== undefined && !['none', 'clear_glass', 'frosted_glass', 'tinted_glass'].includes(String(values.glazing_material))) {
      throw new Error(`Invalid project format: ${owner} has an invalid glazing material`)
    }
    if (values.panel_count !== undefined && (!Number.isInteger(values.panel_count) || Number(values.panel_count) < 1 || Number(values.panel_count) > 8)) {
      throw new Error(`Invalid project format: ${owner} has an invalid panel count`)
    }
    if (values.panel_layout !== undefined) {
      const layouts = values.panel_layout
      const validLayouts = ['hinged', 'sliding', 'fixed', 'awning', 'louver', 'bifold', 'pocket', 'surface_sliding']
      if (!Array.isArray(layouts) || layouts.length < 1 || layouts.length > 8 || layouts.some(value => !validLayouts.includes(String(value)))) {
        throw new Error(`Invalid project format: ${owner} has an invalid panel layout`)
      }
      if (values.panel_count !== undefined && layouts.length !== values.panel_count) throw new Error(`Invalid project format: ${owner} panel layout must match panel count`)
    }
    if (values.panel_width_ratios !== undefined) {
      const ratios = values.panel_width_ratios
      if (!Array.isArray(ratios) || ratios.length < 1 || ratios.length > 8 || ratios.some(value => typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1)) {
        throw new Error(`Invalid project format: ${owner} has invalid panel width ratios`)
      }
      if (Math.abs(ratios.reduce((sum, value) => sum + value, 0) - 1) > 0.001) throw new Error(`Invalid project format: ${owner} panel width ratios must sum to 1`)
      if (values.panel_count !== undefined && ratios.length !== values.panel_count) throw new Error(`Invalid project format: ${owner} panel width ratios must match panel count`)
    }
    for (const field of ['muntin_rows', 'muntin_columns', 'transom_muntin_rows', 'transom_muntin_columns', 'bottom_light_muntin_rows', 'bottom_light_muntin_columns'] as const) {
      if (values[field] !== undefined && (!Number.isInteger(values[field]) || Number(values[field]) < 1 || Number(values[field]) > 8)) {
        throw new Error(`Invalid project format: ${owner} has an invalid ${field}`)
      }
    }
    if (values.transom_height_mm !== undefined) {
      requireFinite(values.transom_height_mm, owner, 'transom_height_mm')
      if (Number(values.transom_height_mm) < 0) throw new Error(`Invalid project format: ${owner} has negative transom_height_mm`)
    }
    if (values.bottom_light_height_mm !== undefined) {
      requireFinite(values.bottom_light_height_mm, owner, 'bottom_light_height_mm')
      if (Number(values.bottom_light_height_mm) < 0) throw new Error(`Invalid project format: ${owner} has negative bottom_light_height_mm`)
    }
    if (values.height_mm !== undefined && Number(values.transom_height_mm ?? 0) + Number(values.bottom_light_height_mm ?? 0) >= Number(values.height_mm)) {
      throw new Error(`Invalid project format: ${owner} fixed lights must leave a movable or clear opening section`)
    }
    if (values.frame_depth_mm !== undefined) requirePositive(values.frame_depth_mm, owner, 'frame_depth_mm')
    for (const field of ['frame_face_width_mm', 'sash_face_width_mm'] as const) {
      if (values[field] !== undefined) {
        requireFinite(values[field], owner, field)
        if (Number(values[field]) < 5 || Number(values[field]) > 200) throw new Error(`Invalid project format: ${owner} has an invalid ${field}`)
      }
    }
    if (values.door_leaf_thickness_mm !== undefined) {
      requireFinite(values.door_leaf_thickness_mm, owner, 'door_leaf_thickness_mm')
      if (Number(values.door_leaf_thickness_mm) < 10 || Number(values.door_leaf_thickness_mm) > 120) throw new Error(`Invalid project format: ${owner} has an invalid door_leaf_thickness_mm`)
    }
    if (values.glazing_transmission !== undefined) {
      requireFinite(values.glazing_transmission, owner, 'glazing_transmission')
      if (Number(values.glazing_transmission) < 0 || Number(values.glazing_transmission) > 1) throw new Error(`Invalid project format: ${owner} glazing transmission must be between 0 and 1`)
    }
    for(const field of ['drop_mm','topping_mm'])if(values[field]!==undefined){requireFinite(values[field],owner,field);if(Number(values[field])<0)throw new Error(`Invalid project format: ${owner} has negative ${field}`)}
    if (values.rebar_type !== undefined) {
      const config = values.rebar_type
      if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error(`Invalid project format: ${owner} reinforcement must be an object`)
      const roles = ['top', 'bottom', 'stirrups', 'main', 'ties', 'bottom_x', 'bottom_y', 'starter', 'top_extra', 'top_extra_left', 'top_extra_mid', 'top_extra_right', 'bottom_extra', 'side_skin']
      const entries: [string, unknown][] = roles.some(role => role in config) ? Object.entries(config) : [['general', config]]
      for (const [role, raw] of entries) {
        if ((!roles.includes(role) && role !== 'general') || !raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Invalid project format: ${owner} invalid reinforcement role`)
        const d = raw as Record<string, unknown>
        for (const key of ['diameter_mm', 'count']) requirePositive(d[key], owner, key)
        if (!Number.isInteger(d.count) || Number(d.count) > 2000 || Number(d.diameter_mm) > 100) throw new Error(`Invalid project format: ${owner} reinforcement count/diameter exceeds supported limits`)
        for (const key of ['cover_mm', 'bend_radius_mm', 'hook_extension_mm', 'lap_mm']) {
          requireFinite(d[key], owner, key)
          if (Number(d[key]) < 0) throw new Error(`Invalid project format: ${owner} negative ${key}`)
        }
        if (!['SR24', 'SD40', 'SD50'].includes(String(d.grade))) throw new Error(`Invalid project format: ${owner} invalid reinforcement grade`)
        if (![0, 90, 135].includes(Number(d.hook_angle_deg))) throw new Error(`Invalid project format: ${owner} invalid hook angle`)
        if (role === 'stirrups' || role === 'ties') {
          if (!Array.isArray(d.spacing_zones) || !d.spacing_zones.length) throw new Error(`Invalid project format: ${owner} stirrups need zones`)
          for (const zone of d.spacing_zones) {
            if (!zone || typeof zone !== 'object' || Array.isArray(zone)) throw new Error(`Invalid project format: ${owner} invalid stirrup zone`)
            const z = zone as Record<string, unknown>, relative = z.start_ratio !== undefined || z.end_ratio !== undefined
            const start = relative ? z.start_ratio : z.start_mm, end = relative ? z.end_ratio : z.end_mm
            requireFinite(start, owner, 'zone start'); requireFinite(end, owner, 'zone end'); requirePositive(z.spacing_mm, owner, 'zone spacing')
            if (Number(start) < 0 || Number(end) <= Number(start) || (relative && Number(end) > 1)) throw new Error(`Invalid project format: ${owner} invalid stirrup zone range`)
          }
        }
      }
    }
    if (values.foundation_type !== undefined && values.foundation_type !== 'spread_footing' && values.foundation_type !== 'pile_cap' && values.foundation_type !== 'eccentric_footing') {
      throw new Error(`Invalid project format: ${owner} has an invalid foundation type`)
    }
    if (values.pile_type !== undefined && (objectType !== 'structure.foundation' || typeof values.pile_type !== 'string' || !PILE_TYPES.has(values.pile_type))) {
      throw new Error(`Invalid project format: ${owner} has an invalid pile type`)
    }
    if (values.pile_offsets_mm !== undefined) {
      if (objectType !== 'structure.foundation' || !Array.isArray(values.pile_offsets_mm) || values.pile_offsets_mm.length < 2) {
        throw new Error(`Invalid project format: ${owner} has an invalid pile layout`)
      }
      values.pile_offsets_mm.forEach((offset, index) => requireTuple(offset, 2, owner, `pile_offsets_mm[${index}]`))
    }
    if (values.pile_length_mm !== undefined) {
      if (objectType !== 'structure.foundation') throw new Error(`Invalid project format: ${owner} has pile length outside its foundation family`)
      requirePositive(values.pile_length_mm, owner, 'pile_length_mm')
    }
  }
  const levelIds = new Set<string>()
  for (const level of project.levels) {
    if (!level || typeof level.id !== 'string' || !level.id || levelIds.has(level.id)) throw new Error('Invalid project format: duplicate or missing level ID')
    if (!Number.isFinite(level.elevation_mm) || !Number.isFinite(level.storey_index) || (level.height_mm !== undefined && (!Number.isFinite(level.height_mm) || level.height_mm <= 0))) throw new Error(`Invalid project format: level ${level.id} has invalid elevation, index or height`)
    levelIds.add(level.id)
  }
  if (!levelIds.has(project.project.active_level_id)) throw new Error(`Invalid project format: active level ${project.project.active_level_id} is missing`)
  const typeIds = new Set<string>()
  const typeNames = new Set<string>()
  for (const type of project.types) {
    if (!type || !UUID_RE.test(type.id) || !type.object_type || !type.name || !type.parameters || typeof type.parameters !== 'object') {
      throw new Error('Invalid project format: catalog types need a UUID, family, name and parameters')
    }
    if (typeIds.has(type.id)) throw new Error(`Invalid project format: duplicate catalog type UUID ${type.id}`)
    validateFamilyParameters(type.parameters, type.object_type, `catalog type ${type.name}`)
    if (type.object_type === 'structure.column' || type.object_type === 'structure.beam') {
      if (type.parameters.section_mm !== undefined) requireTuple(type.parameters.section_mm, 2, type.id, 'parameters.section_mm', true)
    }
    if (type.object_type === 'structure.foundation' && type.parameters.size_mm !== undefined) requireTuple(type.parameters.size_mm, 3, type.id, 'parameters.size_mm', true)
    if (type.object_type === 'structure.foundation' && type.parameters.pile_offsets_mm && type.parameters.size_mm) {
      type.parameters.pile_offsets_mm.forEach(([x, y], index) => {
        if (Math.abs(x) >= type.parameters.size_mm![0] / 2 || Math.abs(y) >= type.parameters.size_mm![1] / 2) throw new Error(`Invalid project format: catalog type ${type.name} pile ${index + 1} lies outside its cap`)
      })
    }
    for (const field of ['thickness_mm', 'height_mm', 'width_mm'] as const) {
      if (type.parameters[field] !== undefined) requirePositive(type.parameters[field], type.id, `parameters.${field}`)
    }
    if (type.parameters.sill_height_mm !== undefined) {
      requireFinite(type.parameters.sill_height_mm, type.id, 'parameters.sill_height_mm')
      if (type.parameters.sill_height_mm < 0) throw new Error(`Invalid project format: catalog type ${type.name} has negative sill height`)
    }
    const nameKey = `${type.object_type}\0${type.name.trim().toLowerCase()}`
    if (typeNames.has(nameKey)) throw new Error(`Invalid project format: duplicate type name ${type.name} in ${type.object_type}`)
    typeIds.add(type.id); typeNames.add(nameKey)
  }
  const interfaceTreatmentIds = new Set<string>()
  const smartObjectIds = new Set<string>()
  for (const [id, object] of Object.entries(project.objects)) {
    if (!UUID_RE.test(id) || !object || object.id !== id || !object.object_type || !Array.isArray(object.level_refs) || !Array.isArray(object.host_refs) || !object.module_data || typeof object.module_data !== 'object') {
      throw new Error(`Invalid project format: malformed Smart Object ${id}`)
    }
    const normalizedId = id.toLowerCase()
    if (smartObjectIds.has(normalizedId)) throw new Error(`Invalid project format: duplicate Smart Object UUID ${id}`)
    smartObjectIds.add(normalizedId)
    if (!PHASES.has(object.created_phase)) throw new Error(`Invalid project format: object ${id} has an unknown created phase`)
    if (object.removed_phase !== null && object.removed_phase !== 'demolition') throw new Error(`Invalid project format: object ${id} has an unsupported removed phase`)
    const moduleData = object.module_data as Record<string, unknown>
    validateFamilyParameters(moduleData, object.object_type, `object ${id}`)
    const typeId = moduleData.type_id
    if (typeId !== undefined && (typeof typeId !== 'string' || !typeIds.has(typeId))) throw new Error(`Invalid project format: object ${id} references missing type ${String(typeId)}`)
    if (typeId !== undefined && project.types.find(type => type.id === typeId)?.object_type !== object.object_type) {
      throw new Error(`Invalid project format: object ${id} references a type from another domain`)
    }
    const overrides = moduleData.instance_overrides
    if (overrides !== undefined && (!overrides || typeof overrides !== 'object' || Array.isArray(overrides))) throw new Error(`Invalid project format: object ${id} has invalid instance overrides`)
    if (overrides && typeof overrides === 'object') {
      const values = overrides as Record<string, unknown>
      validateFamilyParameters(values, object.object_type, `object ${id} instance overrides`)
      if ((object.object_type === 'structure.column' || object.object_type === 'structure.beam') && values.section_mm !== undefined) requireTuple(values.section_mm, 2, id, 'instance_overrides.section_mm', true)
      if (object.object_type === 'structure.foundation' && values.size_mm !== undefined) requireTuple(values.size_mm, 3, id, 'instance_overrides.size_mm', true)
      if (object.object_type === 'structure.foundation' && values.pile_offsets_mm && values.size_mm) {
        const offsets = values.pile_offsets_mm as [number, number][]
        const size = values.size_mm as [number, number, number]
        offsets.forEach(([x, y], index) => {
          if (Math.abs(x) >= size[0] / 2 || Math.abs(y) >= size[1] / 2) throw new Error(`Invalid project format: object ${id} pile override ${index + 1} lies outside its cap`)
        })
      }
      for (const field of ['thickness_mm', 'height_mm', 'width_mm'] as const) {
        if (values[field] !== undefined) requirePositive(values[field], id, `instance_overrides.${field}`)
      }
      if (values.sill_height_mm !== undefined) {
        requireFinite(values.sill_height_mm, id, 'instance_overrides.sill_height_mm')
        if (values.sill_height_mm < 0) throw new Error(`Invalid project format: object ${id} has negative sill height override`)
      }
    }
    for (const ref of object.level_refs) if (!levelIds.has(ref.level_id)) throw new Error(`Invalid project format: object ${id} references missing level ${ref.level_id}`)
    for (const hostId of object.host_refs) if (!project.objects[hostId]) throw new Error(`Invalid project format: object ${id} references missing host ${hostId}`)

    switch (object.object_type) {
      case 'structure.grid':
        requireFinite(moduleData.position_mm, id, 'position_mm')
        requireTuple(moduleData.extent_mm, 2, id, 'extent_mm')
        if (moduleData.extent_mm[0] > moduleData.extent_mm[1]) throw new Error(`Invalid project format: grid ${id} has reversed extents`)
        if (moduleData.orientation !== 'vertical' && moduleData.orientation !== 'horizontal') throw new Error(`Invalid project format: grid ${id} has invalid orientation`)
        if (moduleData.start_point_mm !== undefined || moduleData.end_point_mm !== undefined) {
          requirePoint(moduleData.start_point_mm, id, 'start_point_mm')
          requirePoint(moduleData.end_point_mm, id, 'end_point_mm')
          if (Math.hypot(moduleData.end_point_mm[0] - moduleData.start_point_mm[0], moduleData.end_point_mm[1] - moduleData.start_point_mm[1]) <= 0) throw new Error(`Invalid project format: grid ${id} has zero-length reference geometry`)
        }
        if (moduleData.system_positions_mm !== undefined) {
          const systemPositions = moduleData.system_positions_mm
          if (!Array.isArray(systemPositions) || !systemPositions.length || systemPositions.length > 100 || systemPositions.some((value: unknown, index: number) => !Number.isFinite(value) || (index > 0 && Number(value) <= Number(systemPositions[index - 1])))) throw new Error(`Invalid project format: grid ${id} has invalid system positions`)
        }
        if (moduleData.bubble_visible !== undefined && typeof moduleData.bubble_visible !== 'boolean') throw new Error(`Invalid project format: grid ${id} has invalid bubble visibility`)
        if (moduleData.auto_tag !== undefined && typeof moduleData.auto_tag !== 'boolean') throw new Error(`Invalid project format: grid ${id} has invalid auto-tag setting`)
        if (moduleData.sequence_style !== undefined && !['auto', 'alpha', 'numeric'].includes(String(moduleData.sequence_style))) throw new Error(`Invalid project format: grid ${id} has invalid sequence style`)
        break
      case 'structure.column':
        requirePoint(moduleData.location_mm, id, 'location_mm')
        requireTuple(moduleData.section_mm, 2, id, 'section_mm', true)
        requireFinite(moduleData.rotation_deg, id, 'rotation_deg')
        requireFinite(moduleData.base_offset_mm, id, 'base_offset_mm')
        requireFinite(moduleData.top_offset_mm, id, 'top_offset_mm')
        if (typeof moduleData.base_level_id !== 'string' || !levelIds.has(moduleData.base_level_id)) throw new Error(`Invalid project format: column ${id} references a missing base level`)
        if (moduleData.top_level_id !== undefined && (typeof moduleData.top_level_id !== 'string' || !levelIds.has(moduleData.top_level_id))) throw new Error(`Invalid project format: column ${id} references a missing top level`)
        break
      case 'structure.foundation':
        requirePoint(moduleData.center_mm, id, 'center_mm')
        requireTuple(moduleData.size_mm, 3, id, 'size_mm', true)
        requireFinite(moduleData.top_elevation_mm, id, 'top_elevation_mm')
        if (moduleData.foundation_type !== 'spread_footing' && moduleData.foundation_type !== 'pile_cap' && moduleData.foundation_type !== 'eccentric_footing') throw new Error(`Invalid project format: foundation ${id} has an invalid foundation type`)
        if (moduleData.foundation_type === 'pile_cap' && moduleData.pile_type === undefined) throw new Error(`Invalid project format: pile cap ${id} is missing its pile type`)
        if (moduleData.pile_offsets_mm && moduleData.size_mm) {
          const offsets = moduleData.pile_offsets_mm as [number, number][]
          const size = moduleData.size_mm as [number, number, number]
          offsets.forEach(([x, y], index) => {
            if (Math.abs(x) >= size[0] / 2 || Math.abs(y) >= size[1] / 2) throw new Error(`Invalid project format: foundation ${id} pile ${index + 1} lies outside its cap`)
          })
        }
        break
      case 'structure.beam': {
        requirePoint(moduleData.start_point_mm, id, 'start_point_mm')
        requirePoint(moduleData.end_point_mm, id, 'end_point_mm')
        requireTuple(moduleData.section_mm, 2, id, 'section_mm', true)
        requirePositive(moduleData.span_mm, id, 'span_mm')
        if (moduleData.base_offset_mm !== undefined) requireFinite(moduleData.base_offset_mm, id, 'base_offset_mm')
        if (typeof moduleData.level_id !== 'string' || !levelIds.has(moduleData.level_id)) throw new Error(`Invalid project format: beam ${id} references a missing level`)
        if (Math.hypot(moduleData.end_point_mm[0] - moduleData.start_point_mm[0], moduleData.end_point_mm[1] - moduleData.start_point_mm[1]) <= 0) throw new Error(`Invalid project format: beam ${id} has zero horizontal span`)
        break
      }
      case 'architecture.wall': {
        requirePoint(moduleData.start_point_mm, id, 'start_point_mm')
        requirePoint(moduleData.end_point_mm, id, 'end_point_mm')
        requirePositive(moduleData.thickness_mm, id, 'thickness_mm')
        requirePositive(moduleData.height_mm, id, 'height_mm')
        requirePositive(moduleData.length_mm, id, 'length_mm')
        validateFamilyParameters(moduleData, 'architecture.wall', `wall ${id}`)
        if (typeof moduleData.level_id !== 'string' || !levelIds.has(moduleData.level_id)) throw new Error(`Invalid project format: wall ${id} references a missing level`)
        const computedLength = Math.hypot(moduleData.end_point_mm[0] - moduleData.start_point_mm[0], moduleData.end_point_mm[1] - moduleData.start_point_mm[1])
        if (computedLength <= 0 || Math.abs(computedLength - moduleData.length_mm) > 1) throw new Error(`Invalid project format: wall ${id} length does not match its endpoints`)
        if (moduleData.interface_treatments !== undefined) {
          if (!Array.isArray(moduleData.interface_treatments)) throw new Error(`Invalid project format: wall ${id} interface treatments must be an array`)
          for (const [index, rawTreatment] of moduleData.interface_treatments.entries()) {
            if (!rawTreatment || typeof rawTreatment !== 'object' || Array.isArray(rawTreatment)) throw new Error(`Invalid project format: wall ${id} interface treatment ${index + 1} is malformed`)
            const treatment = rawTreatment as Record<string, unknown>
            if (typeof treatment.id !== 'string' || !UUID_RE.test(treatment.id) || interfaceTreatmentIds.has(treatment.id)) throw new Error(`Invalid project format: wall ${id} interface treatment ${index + 1} has an invalid or duplicate UUID`)
            if (!['chemical_dowel_epoxy', 'expansion_joint_sealant', 'roof_flashing'].includes(String(treatment.kind))) throw new Error(`Invalid project format: wall ${id} interface treatment ${index + 1} has an unknown kind`)
            if (!Array.isArray(treatment.target_object_ids) || treatment.target_object_ids.length === 0 || treatment.target_object_ids.some(targetId => typeof targetId !== 'string' || !UUID_RE.test(targetId))) throw new Error(`Invalid project format: wall ${id} interface treatment ${index + 1} requires target wall UUIDs`)
            if (new Set(treatment.target_object_ids).size !== treatment.target_object_ids.length) throw new Error(`Invalid project format: wall ${id} interface treatment ${index + 1} has duplicate target walls`)
            for (const targetId of treatment.target_object_ids as string[]) {
              const target = project.objects[targetId]
              if (!target || target.object_type !== 'architecture.wall' || target.created_phase !== 'new_construction') throw new Error(`Invalid project format: wall ${id} interface treatment references a missing or non-new wall ${targetId}`)
              if (targetId === id) throw new Error(`Invalid project format: wall ${id} interface treatment cannot target itself`)
            }
            interfaceTreatmentIds.add(treatment.id)
          }
        }
        break
      }
      case 'architecture.room':
      case 'architecture.floor':
      case 'architecture.ceiling': {
        const ring=moduleData.boundary_mm
        if(!Array.isArray(ring)||ring.length<3)throw new Error(`Invalid project format: ${object.object_type} ${id} needs at least three boundary points`)
        ring.forEach((point,index)=>requireTuple(point,2,id,`boundary_mm[${index}]`))
        const area=ring.reduce((sum,point,index)=>{const next=ring[(index+1)%ring.length] as number[];return sum+point[0]*next[1]-next[0]*point[1]},0)/2
        if(Math.abs(area)<=0)throw new Error(`Invalid project format: ${object.object_type} ${id} boundary has zero area`)
        if(typeof moduleData.level_id!=='string'||!levelIds.has(moduleData.level_id))throw new Error(`Invalid project format: ${object.object_type} ${id} references a missing level`)
        if(object.object_type==='architecture.room'){
          requirePositive(moduleData.area_mm2,id,'area_mm2')
          if(Math.abs(Number(moduleData.area_mm2)-Math.abs(area))>1)throw new Error(`Invalid project format: room ${id} area does not match its boundary`)
        }else{
          requirePositive(moduleData.thickness_mm,id,'thickness_mm');requireFinite(moduleData.elevation_mm,id,'elevation_mm');requireFinite(moduleData.elevation_offset_mm,id,'elevation_offset_mm')
          if(!Array.isArray(moduleData.voids_mm))throw new Error(`Invalid project format: ${object.object_type} ${id} voids must be an array`)
          if(moduleData.room_id!==undefined&&(typeof moduleData.room_id!=='string'||project.objects[moduleData.room_id]?.object_type!=='architecture.room'))throw new Error(`Invalid project format: ${object.object_type} ${id} references a missing room`)
          if(moduleData.follows_room_boundary!==undefined&&typeof moduleData.follows_room_boundary!=='boolean')throw new Error(`Invalid project format: ${object.object_type} ${id} has invalid room-boundary tracking state`)
        }
        break
      }
      case 'architecture.room_separator':
        requireTuple(moduleData.start_point_mm,2,id,'start_point_mm');requireTuple(moduleData.end_point_mm,2,id,'end_point_mm')
        if(typeof moduleData.level_id!=='string'||!levelIds.has(moduleData.level_id))throw new Error(`Invalid project format: room separator ${id} references a missing level`)
        break
      case 'door_window.door':
      case 'door_window.window':
        requirePoint(moduleData.location_mm, id, 'location_mm')
        requirePositive(moduleData.width_mm, id, 'width_mm')
        requirePositive(moduleData.height_mm, id, 'height_mm')
        requireFinite(moduleData.offset_along_wall_mm, id, 'offset_along_wall_mm')
        if (moduleData.offset_along_wall_mm < 0) throw new Error(`Invalid project format: opening ${id} has a negative wall offset`)
        if (object.object_type === 'door_window.window') {
          requireFinite(moduleData.sill_height_mm, id, 'sill_height_mm')
          if (moduleData.sill_height_mm < 0) throw new Error(`Invalid project format: window ${id} has a negative sill height`)
        } else if (!['left_in', 'left_out', 'right_in', 'right_out'].includes(String(moduleData.handing))) {
          throw new Error(`Invalid project format: door ${id} has invalid handing`)
        }
        if (typeof moduleData.level_id !== 'string' || !levelIds.has(moduleData.level_id)) throw new Error(`Invalid project format: opening ${id} references a missing level`)
        break
    }
  }
  for (const [id, object] of Object.entries(project.objects)) {
    const data = object.module_data as Record<string, unknown>
    if (object.object_type === 'structure.foundation') {
      const columnId = data.supported_column_id
      if (typeof columnId === 'string' && columnId) {
        if (project.objects[columnId]?.object_type !== 'structure.column') throw new Error(`Invalid project format: foundation ${id} references a missing supported column`)
        if (!object.host_refs.includes(columnId)) throw new Error(`Invalid project format: foundation ${id} is missing its supported-column host reference`)
      }
    }
    if (object.object_type === 'structure.beam') {
      for (const columnId of [data.start_column_id, data.end_column_id]) {
        if (columnId !== undefined && (typeof columnId !== 'string' || project.objects[columnId]?.object_type !== 'structure.column')) throw new Error(`Invalid project format: beam ${id} references a missing endpoint column`)
      }
    }
    if (object.object_type === 'door_window.door' || object.object_type === 'door_window.window') {
      const wallId = data.wall_id
      const wall = typeof wallId === 'string' ? project.objects[wallId] : undefined
      if (!wall || wall.object_type !== 'architecture.wall') throw new Error(`Invalid project format: opening ${id} references a missing host wall`)
      const wallData = wall.module_data as Record<string, unknown>
      if (data.level_id !== wallData.level_id || !object.host_refs.includes(wall.id)) throw new Error(`Invalid project format: opening ${id} host and level references are inconsistent`)
      const typeId = data.type_id
      const type = typeof typeId === 'string' ? project.types.find(candidate => candidate.id === typeId && candidate.object_type === object.object_type) : undefined
      const instanceOverrides = data.instance_overrides && typeof data.instance_overrides === 'object' && !Array.isArray(data.instance_overrides)
        ? data.instance_overrides as Record<string, unknown>
        : undefined
      const width = instanceOverrides?.width_mm ?? data.width_mm ?? type?.parameters.width_mm
      const height = instanceOverrides?.height_mm ?? data.height_mm ?? type?.parameters.height_mm
      const sill = object.object_type === 'door_window.window' ? instanceOverrides?.sill_height_mm ?? data.sill_height_mm ?? type?.parameters.sill_height_mm ?? 0 : 0
      const wallLength = wallData.length_mm
      const offset = data.offset_along_wall_mm
      if (typeof wallLength !== 'number' || !Number.isFinite(wallLength) || typeof offset !== 'number' || !Number.isFinite(offset) || typeof width !== 'number' || !Number.isFinite(width) || width <= 0 || offset - width / 2 < -1 || offset + width / 2 > wallLength + 1) {
        throw new Error(`Invalid project format: opening ${id} does not fit within host wall ${wall.id}`)
      }
      const wallHeight = wallData.height_mm
      if (typeof wallHeight !== 'number' || !Number.isFinite(wallHeight) || typeof height !== 'number' || !Number.isFinite(height) || height <= 0 || typeof sill !== 'number' || !Number.isFinite(sill) || sill + height > wallHeight + 1) {
        throw new Error(`Invalid project format: opening ${id} exceeds host wall height ${wall.id}`)
      }
    }
  }
  for (const relationship of project.relationships) {
    if (!project.objects[relationship.source_id] || !project.objects[relationship.target_id]) throw new Error('Invalid project format: relationship references a missing object')
  }
}
