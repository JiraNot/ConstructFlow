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
      'structure.column': ['section_mm', 'material'], 'structure.foundation': ['size_mm', 'foundation_type', 'material'],
      'structure.beam': ['section_mm', 'material'], 'architecture.wall': ['thickness_mm', 'height_mm', 'material'],
      'door_window.door': ['width_mm', 'height_mm'], 'door_window.window': ['width_mm', 'height_mm', 'sill_height_mm'],
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
  if (!Array.isArray(project.levels) || !Array.isArray(project.types) || !Array.isArray(project.phases) || !Array.isArray(project.relationships)) {
    throw new Error('Invalid project format: levels, types, phases and relationships arrays required')
  }
  if (!project.objects || typeof project.objects !== 'object' || Array.isArray(project.objects)) throw new Error('Invalid project format: objects map required')
  validateConstructionPayloads(project)
  if(project.drawing_settings!==undefined)validateDrawingSettings(project.drawing_settings)
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
      size_mm: ['structure.foundation', 'drainage.manhole'],
      foundation_type: ['structure.foundation'],
      thickness_mm: ['architecture.wall', 'structure.slab', 'roof.system'],
      width_mm: ['door_window.door', 'door_window.window', 'interior.cabinet_run'],
      height_mm: ['architecture.wall', 'door_window.door', 'door_window.window', 'interior.cabinet_run'],
      sill_height_mm: ['door_window.window'],
      drop_mm:['structure.beam','architecture.bathroom'],rebar_type:['structure.beam','structure.column'],topping_mm:['structure.slab'],slab_system:['structure.slab'],
    }
    for (const [field, families] of Object.entries(allowedFamilies)) {
      if (values[field] !== undefined && !families.includes(objectType)) {
        throw new Error(`Invalid project format: ${owner} has ${field} outside its ${objectType} family`)
      }
    }
    if (values.material !== undefined && (typeof values.material !== 'string' || !values.material.trim())) {
      throw new Error(`Invalid project format: ${owner} has an invalid material`)
    }
    for(const field of ['drop_mm','topping_mm'])if(values[field]!==undefined){requireFinite(values[field],owner,field);if(Number(values[field])<0)throw new Error(`Invalid project format: ${owner} has negative ${field}`)}
    if (values.rebar_type !== undefined) {
      const config = values.rebar_type
      if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error(`Invalid project format: ${owner} reinforcement must be an object`)
      const roles = ['top', 'bottom', 'stirrups', 'main', 'ties', 'bottom_x', 'bottom_y', 'starter']
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
    if (values.foundation_type !== undefined && values.foundation_type !== 'spread_footing' && values.foundation_type !== 'pile_cap') {
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
        if (moduleData.foundation_type !== 'spread_footing' && moduleData.foundation_type !== 'pile_cap') throw new Error(`Invalid project format: foundation ${id} has an invalid foundation type`)
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
