import type { ProjectDocument } from './project.js'

export type FamilyScalar = number | string
export type FamilyPoint2 = [FamilyScalar, FamilyScalar]
export type FamilyPoint3 = [FamilyScalar, FamilyScalar, FamilyScalar]
export type FamilyCategory = 'furniture' | 'door' | 'window' | 'generic' | 'detail'
export type FamilyMeshResizeMode = 'stretch' | 'fixed' | 'fit' | 'repeat'
export type FamilyPattern = 'none' | 'solid' | 'diagonal' | 'cross' | 'grid' | 'brick' | 'wood' | 'grass' | 'custom'
export interface FamilyParameter {
  name: string
  label: string
  value: number
  scope: 'type' | 'instance'
  formula?: string
  min?: number
  max?: number
}
export interface FamilyType { id: string; name: string; values: Record<string, number> }
export interface FamilyHatchLine { angle_deg: number; base_mm: [number, number]; offset_mm: [number, number]; dashes_mm: number[] }
export interface FamilyPath {
  id: string
  points: FamilyPoint2[]
  voids?: FamilyPoint2[][]
  closed: boolean
  view: 'plan' | 'front' | 'side'
  layer: string
  color: string
  lineweight_mm: number
  dash?: number[]
  visible?: boolean
  hatch?: { pattern: FamilyPattern; spacing_mm: number; rotation_deg: number; color: string; origin_mm?: [number, number]; lines?: FamilyHatchLine[]; pattern_scale?: number; name?: string }
  text?: string
}
export interface FamilyExtrusion {
  id: string
  profile_id: string
  plane: 'xy' | 'xz' | 'yz'
  start: FamilyScalar
  end: FamilyScalar
  color: string
}
export interface FamilyMesh {
  id: string
  name?: string
  vertices: [number, number, number][]
  faces: [number, number, number][]
  scale: FamilyPoint3
  offset: FamilyPoint3
  /** Reference envelope in mm used by non-stretch resizing rules. */
  reference_size_mm?: [number, number, number]
  /** Per-axis resizing: stretch preserves legacy behavior; fit preserves proportions; repeat tiles the part. */
  resize_behavior?: [FamilyMeshResizeMode, FamilyMeshResizeMode, FamilyMeshResizeMode]
  repeat_spacing_mm?: [number, number, number]
  color: string
  uvs?: [number, number][]
  texture_data_url?: string
  roughness?: number
  metalness?: number
}
export interface FamilyDefinition {
  schema_version: 1
  id: string
  name: string
  category: FamilyCategory
  parameters: FamilyParameter[]
  types: FamilyType[]
  paths: FamilyPath[]
  extrusions: FamilyExtrusion[]
  meshes: FamilyMesh[]
  source?: { filename: string; format: string; skipped_entities: number; notes?: string[]; origin_mm?: [number, number]; door_handing?: 'left_in' | 'left_out' | 'right_in' | 'right_out' }
}
export interface FamilyBinding { family_id?: string; family_type_id?: string; family_parameters?: Record<string, number> }
export interface FamilyInstanceData extends FamilyBinding {
  family_id: string
  family_type_id?: string
  family_parameters?: Record<string, number>
  mark: string
  location_mm: [number, number, number]
  rotation_deg: number
  level_id: string
}

/** Small arithmetic grammar. Family files never execute JavaScript. */
export function evaluateFamilyExpression(expression: FamilyScalar, variables: Readonly<Record<string, number>>): number {
  if (typeof expression === 'number') {
    if (!Number.isFinite(expression)) throw new Error('ค่าพารามิเตอร์ต้องเป็นตัวเลขที่มีขอบเขต')
    return expression
  }
  if (typeof expression !== 'string' || expression.length > 500) throw new Error('สูตรยาวเกินกำหนด')
  const source = expression.replace(/\s+/g, '')
  const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z_0-9]*|[()+\-*/,]/g) ?? []
  if (tokens.join('') !== source || !tokens.length) throw new Error(`สูตรไม่ถูกต้อง: ${expression}`)
  let cursor = 0
  const atom = (): number => {
    const token = tokens[cursor++]
    if (token === '+') return atom()
    if (token === '-') return -atom()
    if (token === '(') { const value = sum(); if (tokens[cursor++] !== ')') throw new Error('วงเล็บในสูตรไม่ครบ'); return value }
    if (/^(?:\d|\.)/.test(token ?? '')) return Number(token)
    if (!token) throw new Error('สูตรไม่สมบูรณ์')
    if (tokens[cursor] === '(') {
      cursor++
      const args = [sum()]
      while (tokens[cursor] === ',') { cursor++; args.push(sum()) }
      if (tokens[cursor++] !== ')') throw new Error('วงเล็บฟังก์ชันไม่ครบ')
      if (token === 'min') return Math.min(...args)
      if (token === 'max') return Math.max(...args)
      if (token === 'abs' && args.length === 1) return Math.abs(args[0])
      throw new Error(`ไม่รองรับฟังก์ชัน ${token}`)
    }
    if (!Object.hasOwn(variables, token)) throw new Error(`ไม่พบพารามิเตอร์ ${token}`)
    return variables[token]
  }
  const product = (): number => { let value = atom(); while (tokens[cursor] === '*' || tokens[cursor] === '/') { const operator = tokens[cursor++], right = atom(); value = operator === '*' ? value * right : value / right } return value }
  const sum = (): number => { let value = product(); while (tokens[cursor] === '+' || tokens[cursor] === '-') { const operator = tokens[cursor++], right = product(); value = operator === '+' ? value + right : value - right } return value }
  const value = sum()
  if (cursor !== tokens.length || !Number.isFinite(value) || Math.abs(value) > 1e12) throw new Error(`ผลลัพธ์สูตรไม่ถูกต้อง: ${expression}`)
  return value
}

export function resolveFamilyParameters(family: FamilyDefinition, typeId?: string, overrides: Record<string, number> = {}): Record<string, number> {
  const type = typeId ? family.types.find(type => type.id === typeId) : family.types[0]
  if (typeId && !type) throw new Error('ไม่พบ Type ของ Family')
  const values: Record<string, number> = Object.create(null)
  for (const parameter of family.parameters) if (!parameter.formula?.trim()) {
    values[parameter.name] = parameter.scope === 'instance' && Object.hasOwn(overrides, parameter.name) ? overrides[parameter.name] : type?.values[parameter.name] ?? parameter.value
  }
  const pending = family.parameters.filter(parameter => parameter.formula?.trim())
  while (pending.length) {
    let progress = false
    for (let index = pending.length - 1; index >= 0; index--) {
      const parameter = pending[index]
      try { values[parameter.name] = evaluateFamilyExpression(parameter.formula!, values); pending.splice(index, 1); progress = true } catch { /* Dependencies may be resolved in the next pass. */ }
    }
    if (!progress) throw new Error(`สูตรอ้างอิงวนกันหรือไม่ถูกต้อง: ${pending.map(parameter => parameter.name).join(', ')}`)
  }
  for (const parameter of family.parameters) {
    const value = values[parameter.name]
    if (!Number.isFinite(value) || (parameter.min !== undefined && value < parameter.min) || (parameter.max !== undefined && value > parameter.max)) throw new Error(`ค่า ${parameter.label || parameter.name} อยู่นอกช่วงที่กำหนด`)
  }
  for (const key of Object.keys(overrides)) {
    const parameter = family.parameters.find(parameter => parameter.name === key)
    if (!parameter || parameter.scope !== 'instance' || parameter.formula?.trim()) throw new Error(`แก้ ${key} ระดับ Instance ไม่ได้`)
  }
  return values
}

export function validateFamilyDefinition(value: unknown): asserts value is FamilyDefinition {
  const family = value as FamilyDefinition
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!family || family.schema_version !== 1 || !uuid.test(family.id) || typeof family.name !== 'string' || !family.name.trim() || family.name.length > 160 || !['furniture', 'door', 'window', 'generic', 'detail'].includes(family.category)) throw new Error('ข้อมูล Family ไม่ถูกต้อง')
  for (const [name, list, max] of [['parameters', family.parameters, 100], ['types', family.types, 200], ['paths', family.paths, 20000], ['extrusions', family.extrusions, 1000], ['meshes', family.meshes, 1000]] as const) if (!Array.isArray(list) || list.length > max) throw new Error(`${name} ของ Family เกินขอบเขตหรือไม่ถูกต้อง`)
  const names = new Set<string>()
  for (const parameter of family.parameters) {
    if (!parameter || !/^[A-Za-z_][A-Za-z_0-9]{0,63}$/.test(parameter.name) || ['min', 'max', 'abs', '__proto__', 'constructor', 'prototype'].includes(parameter.name) || names.has(parameter.name) || !['type', 'instance'].includes(parameter.scope) || !Number.isFinite(parameter.value)) throw new Error('ชื่อหรือค่า Parameter ซ้ำ/ไม่ถูกต้อง')
    if ((parameter.min!==undefined&&!Number.isFinite(parameter.min))||(parameter.max!==undefined&&!Number.isFinite(parameter.max))||(parameter.min!==undefined&&parameter.max!==undefined&&parameter.min>parameter.max)) throw new Error('ช่วง Parameter ไม่ถูกต้อง')
    names.add(parameter.name)
  }
  const ids = new Set<string>()
  for (const item of [...family.paths, ...family.extrusions, ...family.meshes]) { if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id)) throw new Error('รหัสชิ้นส่วน Family ซ้ำหรือไม่ถูกต้อง'); ids.add(item.id) }
  const typeIds = new Set<string>()
  for (const type of family.types) {
    if (!type || !uuid.test(type.id) || typeIds.has(type.id) || !type.name?.trim() || !type.values || typeof type.values !== 'object') throw new Error('Type ไม่ถูกต้องหรือรหัสซ้ำ')
    for (const [key, value] of Object.entries(type.values)) if (!names.has(key) || !Number.isFinite(value)) throw new Error(`ค่า Type ${key} ไม่ถูกต้อง`)
    typeIds.add(type.id)
  }
  for (const typeId of family.types.length ? family.types.map(type => type.id) : [undefined]) {
    const variables = resolveFamilyParameters(family, typeId)
    for (const path of family.paths) {
      if (!Array.isArray(path.points) || path.points.length < 2 || path.points.length > 20000 || typeof path.closed !== 'boolean' || !['plan', 'front', 'side'].includes(path.view) || typeof path.layer !== 'string' || !/^#[0-9a-f]{6}$/i.test(path.color) || !(path.lineweight_mm > 0 && path.lineweight_mm <= 5)) throw new Error('เส้น Family ไม่ถูกต้อง')
      if (path.text !== undefined && (typeof path.text !== 'string' || path.text.length>10000)) throw new Error('ข้อความ Family ยาวเกินขอบเขต')
      if (path.dash && (!Array.isArray(path.dash)||path.dash.length>24||path.dash.some(value=>!Number.isFinite(value)||value<0))) throw new Error('รูปแบบเส้นประไม่ถูกต้อง')
      if (path.voids && (!Array.isArray(path.voids) || path.voids.length>200 || path.voids.some(ring=>!Array.isArray(ring)||ring.length<3||ring.length>20000))) throw new Error('ช่องว่าง Hatch ไม่ถูกต้อง')
      for (const point of [...path.points,...(path.voids??[]).flat()]) { if (!Array.isArray(point) || point.length !== 2) throw new Error('จุดเส้นไม่ถูกต้อง'); point.forEach(value => evaluateFamilyExpression(value, variables)) }
      if (path.hatch?.lines && (path.hatch.lines.length > 100 || path.hatch.lines.some(line => !Number.isFinite(line.angle_deg) || line.base_mm.length !== 2 || line.offset_mm.length !== 2 || ![...line.base_mm,...line.offset_mm,...line.dashes_mm].every(Number.isFinite) || line.dashes_mm.length > 24))) throw new Error('ชุดเส้น Hatch ไม่ถูกต้อง')
      if (path.hatch?.pattern === 'custom' && !path.hatch.lines?.length) throw new Error('Hatch กำหนดเองต้องมีชุดเส้น')
      if (path.hatch?.pattern_scale !== undefined && !(path.hatch.pattern_scale > 0 && Number.isFinite(path.hatch.pattern_scale))) throw new Error('สเกล Hatch ต้องเป็นบวก')
      if (path.hatch && (!['none', 'solid', 'diagonal', 'cross', 'grid', 'brick', 'wood', 'grass', 'custom'].includes(path.hatch.pattern) || !(path.hatch.spacing_mm >= 1) || !Number.isFinite(path.hatch.rotation_deg) || !/^#[0-9a-f]{6}$/i.test(path.hatch.color))) throw new Error('Hatch ไม่ถูกต้อง')
    }
    for (const extrusion of family.extrusions) {
      const profile = family.paths.find(path => path.id === extrusion.profile_id)
      if (!profile?.closed || profile.points.length < 3 || !['xy', 'xz', 'yz'].includes(extrusion.plane)) throw new Error('Extrusion ต้องอ้างอิงเส้นปิด')
      if (evaluateFamilyExpression(extrusion.end, variables) <= evaluateFamilyExpression(extrusion.start, variables)) throw new Error('Extrusion ต้องมีระยะปลายมากกว่าระยะเริ่ม')
    }
    let vertices = 0, faces = 0
    for (const mesh of family.meshes) {
      if (!Array.isArray(mesh.vertices) || !Array.isArray(mesh.faces) || mesh.scale.length !== 3 || mesh.offset.length !== 3) throw new Error('Mesh ไม่ถูกต้อง')
      if (mesh.name !== undefined && (typeof mesh.name !== 'string' || mesh.name.length > 120)) throw new Error('ชื่อ Mesh ต้องมีความยาวไม่เกิน 120 ตัวอักษร')
      if (mesh.reference_size_mm && (mesh.reference_size_mm.length !== 3 || !mesh.reference_size_mm.every(value => Number.isFinite(value) && value > 0))) throw new Error('ขนาดอ้างอิง Mesh ไม่ถูกต้อง')
      if (mesh.resize_behavior && (mesh.resize_behavior.length !== 3 || mesh.resize_behavior.some(value => !['stretch', 'fixed', 'fit', 'repeat'].includes(value)))) throw new Error('พฤติกรรมปรับขนาด Mesh ไม่ถูกต้อง')
      if (mesh.repeat_spacing_mm && (mesh.repeat_spacing_mm.length !== 3 || !mesh.repeat_spacing_mm.every(value => Number.isFinite(value) && value >= 0))) throw new Error('ระยะซ้ำ Mesh ไม่ถูกต้อง')
      vertices += mesh.vertices.length; faces += mesh.faces.length
      if (vertices > 300000 || faces > 300000) throw new Error('Mesh เกิน 300,000 จุดหรือสามเหลี่ยม')
      for (const point of mesh.vertices) if (point.length !== 3 || !point.every(Number.isFinite)) throw new Error('จุด Mesh ไม่ถูกต้อง')
      if (mesh.uvs && (mesh.uvs.length !== mesh.vertices.length || mesh.uvs.some(point => point.length !== 2 || !point.every(Number.isFinite)))) throw new Error('UV ของ Mesh ไม่ถูกต้อง')
      if (mesh.texture_data_url && (!/^data:image\/(png|jpeg|webp);base64,/.test(mesh.texture_data_url) || mesh.texture_data_url.length > 12_000_000)) throw new Error('Texture ต้องฝังเป็น PNG/JPEG/WebP ขนาดไม่เกิน 9 MB')
      for (const face of mesh.faces) if (face.length !== 3 || !face.every(index => Number.isInteger(index) && index >= 0 && index < mesh.vertices.length)) throw new Error('หน้า Mesh อ้างอิงจุดที่ไม่มี')
      mesh.scale.forEach(value => { if (evaluateFamilyExpression(value, variables) <= 0) throw new Error('Mesh scale ต้องเป็นบวก') }); mesh.offset.forEach(value => evaluateFamilyExpression(value, variables))
    }
  }
}

export function validateProjectFamilies(project: ProjectDocument) {
  if (project.families !== undefined && (!Array.isArray(project.families) || project.families.length > 1000)) throw new Error('คลัง Family ไม่ถูกต้อง')
  const ids = new Set<string>()
  for (const family of project.families ?? []) { validateFamilyDefinition(family); if (ids.has(family.id)) throw new Error('Family UUID ซ้ำ'); ids.add(family.id) }
  for (const type of project.types) { if (type.parameters.family_id !== undefined && !project.families?.some(family => family.id === type.parameters.family_id)) throw new Error('Type อ้างอิง Family ที่ไม่มี') }
  for (const object of Object.values(project.objects)) {
    const data = object.module_data as Record<string, unknown>
    if (data.family_id === undefined) { if (object.object_type === 'family.instance') throw new Error('Family instance ต้องระบุ Family'); continue }
    const family = project.families?.find(family => family.id === data.family_id)
    if (!family) throw new Error(`วัตถุ ${object.id} อ้างอิง Family ที่ไม่มี`)
    if (!Array.isArray(data.location_mm) || data.location_mm.length !== 3 || !data.location_mm.every(Number.isFinite) || !Number.isFinite(data.rotation_deg ?? 0)) throw new Error('ตำแหน่ง Family ไม่ถูกต้อง')
    if ((object.object_type==='door_window.door'&&family.category!=='door')||(object.object_type==='door_window.window'&&family.category!=='window')||(object.object_type==='family.instance'&&['door','window'].includes(family.category))) throw new Error('หมวด Family ไม่ตรงกับวัตถุ')
    resolveFamilyParameters(family, data.family_type_id as string | undefined, data.family_parameters as Record<string, number> | undefined)
  }
}
