/** Field form values are project data; attached photo bytes remain in the media store. */
export type FieldFormCategory = 'site_visit' | 'quality_inspection' | 'safety_observation' | 'client_request' | 'custom'
export type FieldFormInputType = 'text' | 'long_text' | 'number' | 'date' | 'select' | 'checkbox' | 'section'
export type FieldFormValue = string | number | boolean | null

export interface FieldFormField {
  id: string
  label: string
  input_type: FieldFormInputType
  required: boolean
  options?: string[]
}

/** Device-reported position captured on demand; it is not a cadastral survey point. */
export interface FieldFormGpsLocation {
  latitude: number
  longitude: number
  accuracy_m: number
  captured_at: string
}

export interface FieldFormRecord {
  id: string
  template_id: string
  category: FieldFormCategory
  title: string
  status: 'draft' | 'submitted'
  created_at: string
  updated_at: string
  submitted_at?: string
  level_id?: string
  location_mm?: [number, number]
  gps_location?: FieldFormGpsLocation
  linked_object_ids: string[]
  photo_inspection_ids: string[]
  /** Immutable field definitions make old records readable if a built-in template changes. */
  fields: FieldFormField[]
  responses: Record<string, FieldFormValue>
  notes?: string
}

export interface FieldFormTemplate {
  id: string
  category: FieldFormCategory
  title: string
  description: string
  fields: FieldFormField[]
}

const field = (id: string, label: string, input_type: FieldFormInputType, required = false, options?: string[]): FieldFormField => ({
  id, label, input_type, required, ...(options ? { options } : {}),
})

/** Starter forms are neutral site records, not claims of statutory or engineering approval. */
export const FIELD_FORM_TEMPLATES: readonly FieldFormTemplate[] = [
  {
    id: 'site-visit-v1', category: 'site_visit', title: 'บันทึกเข้าตรวจหน้างาน',
    description: 'เก็บสภาพพื้นที่ สิ่งที่พบ และรายการติดตาม',
    fields: [
      field('visit_date', 'วันที่เข้าตรวจ', 'date', true),
      field('site_condition', 'สภาพพื้นที่และสิ่งที่พบ', 'long_text', true),
      field('access_condition', 'การเข้าถึงพื้นที่', 'select', false, ['เข้าถึงได้', 'มีข้อจำกัด', 'ต้องนัดหมาย']),
      field('follow_up', 'งานติดตาม', 'long_text'),
      field('responsible_person', 'ผู้รับผิดชอบ', 'text'),
    ],
  },
  {
    id: 'quality-inspection-v1', category: 'quality_inspection', title: 'ตรวจงานและบันทึกข้อแก้ไข',
    description: 'บันทึกขอบเขตงาน ผลตรวจ และผู้รับผิดชอบการแก้ไข',
    fields: [
      field('work_item', 'รายการงานที่ตรวจ', 'text', true),
      field('result', 'ผลตรวจ', 'select', true, ['ผ่าน', 'พบข้อบกพร่อง', 'รอตรวจซ้ำ', 'ไม่เกี่ยวข้อง']),
      field('finding', 'สิ่งที่พบ', 'long_text'),
      field('corrective_action', 'แนวทางแก้ไขหรือติดตาม', 'long_text'),
      field('responsible_person', 'ผู้รับผิดชอบ', 'text'),
      field('due_date', 'กำหนดติดตาม', 'date'),
    ],
  },
  {
    id: 'safety-observation-v1', category: 'safety_observation', title: 'บันทึกข้อสังเกตความปลอดภัย',
    description: 'เก็บข้อสังเกต ระดับความเร่งด่วน และการติดตาม',
    fields: [
      field('observation', 'ข้อสังเกต', 'long_text', true),
      field('priority', 'ระดับความเร่งด่วน', 'select', true, ['ต่ำ', 'ปานกลาง', 'สูง']),
      field('action', 'การดำเนินการ', 'long_text'),
      field('responsible_person', 'ผู้รับผิดชอบ', 'text'),
      field('resolved', 'ดำเนินการแล้ว', 'checkbox'),
    ],
  },
  {
    id: 'client-request-v1', category: 'client_request', title: 'บันทึกคำขอเปลี่ยนแปลง',
    description: 'แยกรายละเอียดคำขอ ผลกระทบที่ประเมิน และสถานะอนุมัติ',
    fields: [
      field('request', 'รายละเอียดคำขอ', 'long_text', true),
      field('reason', 'เหตุผลหรือบริบท', 'long_text'),
      field('cost_impact_thb', 'ผลกระทบต้นทุนที่ประเมิน (บาท)', 'number'),
      field('schedule_impact_days', 'ผลกระทบกำหนดการ (วัน)', 'number'),
      field('approval_status', 'สถานะ', 'select', true, ['รอพิจารณา', 'อนุมัติ', 'ไม่อนุมัติ']),
    ],
  },
]

const FIELD_FORM_CATEGORIES = new Set<FieldFormCategory>(['site_visit', 'quality_inspection', 'safety_observation', 'client_request', 'custom'])
const FIELD_FORM_INPUT_TYPES = new Set<FieldFormInputType>(['text', 'long_text', 'number', 'date', 'select', 'checkbox', 'section'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Validate reusable project-independent field definitions before saving or importing a company library. */
export function validateFieldFormTemplate(value: unknown): asserts value is FieldFormTemplate {
  const fail = (message: string): never => { throw new Error(`Invalid field-form template: ${message}`) }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('template must be an object')
  const template = value as FieldFormTemplate
  if (typeof template.id !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,99}$/i.test(template.id)) fail('template ID is invalid')
  if (!FIELD_FORM_CATEGORIES.has(template.category)) fail('category is unsupported')
  if (typeof template.title !== 'string' || !template.title.trim() || template.title.length > 200) fail('title must contain 1–200 characters')
  if (typeof template.description !== 'string' || template.description.length > 1000) fail('description must contain at most 1,000 characters')
  if (!Array.isArray(template.fields) || template.fields.length < 1 || template.fields.length > 100) fail('template must contain 1–100 fields')
  const ids = new Set<string>()
  for (const item of template.fields) {
    if (!item || typeof item !== 'object') fail('field definition is invalid')
    validateFieldString(item.id, 'Field ID', 120, true)
    validateFieldString(item.label, 'Field label', 200, true)
    if (ids.has(item.id) || !FIELD_FORM_INPUT_TYPES.has(item.input_type) || typeof item.required !== 'boolean') fail(`field “${item.label}” has an invalid or duplicate definition`)
    ids.add(item.id)
    if (item.input_type === 'section') {
      if (item.required || item.options !== undefined) fail(`section “${item.label}” cannot be required or have options`)
    } else if (item.input_type === 'select') {
      const fieldOptions = item.options ?? fail(`select field “${item.label}” needs 1–100 options`)
      if (!Array.isArray(fieldOptions) || fieldOptions.length < 1 || fieldOptions.length > 100) fail(`select field “${item.label}” needs 1–100 options`)
      const options = new Set<string>()
      for (const option of fieldOptions) {
        validateFieldString(option, 'Field option', 200, true)
        if (options.has(option)) fail(`select field “${item.label}” has duplicate options`)
        options.add(option)
      }
    } else if (item.options !== undefined) fail(`non-select field “${item.label}” cannot have options`)
  }
}

export interface FieldFormValidationContext {
  levelIds?: ReadonlySet<string>
  objectIds?: ReadonlySet<string>
  photoInspectionIds?: ReadonlySet<string>
}

function validateFieldString(value: unknown, label: string, maximum: number, required: boolean): asserts value is string {
  if (value === undefined && !required) return
  if (typeof value !== 'string' || value.length > maximum || (required && !value.trim()))
    throw new Error(`${label} must be ${required ? 'a non-empty ' : 'a '}string of at most ${maximum} characters`)
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function validateFieldForm(value: unknown, context: FieldFormValidationContext = {}): asserts value is FieldFormRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Field form must be an object')
  const record = value as FieldFormRecord
  if (typeof record.id !== 'string' || !UUID_RE.test(record.id)) throw new Error('Field form ID must be an RFC-4122 UUID')
  if (typeof record.template_id !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,99}$/i.test(record.template_id)) throw new Error(`Field form ${record.id} has an invalid template ID`)
  if (!FIELD_FORM_CATEGORIES.has(record.category)) throw new Error(`Field form ${record.id} has an unsupported category`)
  validateFieldString(record.title, 'Field form title', 200, true)
  if (record.status !== 'draft' && record.status !== 'submitted') throw new Error(`Field form ${record.id} has an invalid status`)
  for (const [label, timestamp] of [['created_at', record.created_at], ['updated_at', record.updated_at]] as const)
    if (typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp))) throw new Error(`Field form ${record.id} has an invalid ${label}`)
  if (record.submitted_at !== undefined && (typeof record.submitted_at !== 'string' || !Number.isFinite(Date.parse(record.submitted_at)))) throw new Error(`Field form ${record.id} has an invalid submitted_at`)
  if (record.status === 'submitted' && !record.submitted_at) throw new Error(`Field form ${record.id} needs submitted_at before submission`)
  if (record.level_id !== undefined && (typeof record.level_id !== 'string' || !record.level_id.trim() || (context.levelIds && !context.levelIds.has(record.level_id)))) throw new Error(`Field form ${record.id} references an unknown level`)
  if (record.location_mm !== undefined && (!Array.isArray(record.location_mm) || record.location_mm.length !== 2 || record.location_mm.some(item => !Number.isFinite(item)))) throw new Error(`Field form ${record.id} has invalid plan coordinates`)
  if (record.gps_location !== undefined) {
    const gps = record.gps_location
    if (!gps || typeof gps !== 'object' || !Number.isFinite(gps.latitude) || gps.latitude < -90 || gps.latitude > 90 || !Number.isFinite(gps.longitude) || gps.longitude < -180 || gps.longitude > 180 || !Number.isFinite(gps.accuracy_m) || gps.accuracy_m < 0 || gps.accuracy_m > 1_000_000 || typeof gps.captured_at !== 'string' || !Number.isFinite(Date.parse(gps.captured_at))) throw new Error(`Field form ${record.id} has invalid device GPS location data`)
  }
  const validateReferences = (ids: unknown, label: string, knownIds?: ReadonlySet<string>) => {
    if (!Array.isArray(ids) || ids.length > 100) throw new Error(`Field form ${record.id} must contain at most 100 ${label}`)
    const unique = new Set<string>()
    for (const id of ids) {
      if (typeof id !== 'string' || !UUID_RE.test(id) || unique.has(id) || (knownIds && !knownIds.has(id))) throw new Error(`Field form ${record.id} has an invalid ${label} reference`)
      unique.add(id)
    }
  }
  validateReferences(record.linked_object_ids, 'object', context.objectIds)
  validateReferences(record.photo_inspection_ids, 'photo', context.photoInspectionIds)
  if (!Array.isArray(record.fields) || record.fields.length < 1 || record.fields.length > 100) throw new Error(`Field form ${record.id} needs 1–100 fields`)
  if (!record.responses || typeof record.responses !== 'object' || Array.isArray(record.responses)) throw new Error(`Field form ${record.id} responses must be an object`)
  const fieldIds = new Set<string>()
  for (const item of record.fields) {
    if (!item || typeof item !== 'object') throw new Error(`Field form ${record.id} has an invalid field definition`)
    validateFieldString(item.id, 'Field form field ID', 120, true)
    validateFieldString(item.label, 'Field form field label', 200, true)
    if (fieldIds.has(item.id) || !FIELD_FORM_INPUT_TYPES.has(item.input_type) || typeof item.required !== 'boolean') throw new Error(`Field form ${record.id} has an invalid or duplicated field`)
    if (item.input_type === 'section') {
      if (item.required || item.options !== undefined || record.responses[item.id] !== undefined) throw new Error(`Field form section “${item.label}” cannot contain a response, required flag or options`)
      fieldIds.add(item.id)
      continue
    }
    if (item.input_type === 'select') {
      if (!Array.isArray(item.options) || item.options.length < 1 || item.options.length > 100) throw new Error(`Field form field ${item.id} needs 1–100 select options`)
      const options = new Set<string>()
      for (const option of item.options) {
        validateFieldString(option, 'Field form option', 200, true)
        if (options.has(option)) throw new Error(`Field form field ${item.id} has duplicated options`)
        options.add(option)
      }
    } else if (item.options !== undefined) throw new Error(`Field form field ${item.id} cannot have options`)
    const response = record.responses[item.id]
    const empty = response === undefined || response === null || response === ''
    if (record.status === 'submitted' && item.required && empty) throw new Error(`Complete “${item.label}” before submitting this field form`)
    if (empty) { fieldIds.add(item.id); continue }
    if (item.input_type === 'number') {
      if (typeof response !== 'number' || !Number.isFinite(response)) throw new Error(`Field form response for “${item.label}” must be a number`)
    } else if (item.input_type === 'checkbox') {
      if (typeof response !== 'boolean') throw new Error(`Field form response for “${item.label}” must be true or false`)
    } else if (typeof response !== 'string') throw new Error(`Field form response for “${item.label}” must be text`)
    else {
      const maximum = item.input_type === 'long_text' ? 4000 : 1000
      validateFieldString(response, `Field form response for “${item.label}”`, maximum, false)
      if (item.input_type === 'date' && response && !isCalendarDate(response)) throw new Error(`Field form response for “${item.label}” must be a valid date`)
      if (item.input_type === 'select' && item.options && !item.options.includes(response)) throw new Error(`Field form response for “${item.label}” is not an available option`)
    }
    fieldIds.add(item.id)
  }
  for (const key of Object.keys(record.responses)) if (!fieldIds.has(key)) throw new Error(`Field form ${record.id} has a response for an unknown field`)
  validateFieldString(record.notes, 'Field form notes', 4000, false)
}

export function validateFieldForms(value: unknown, context: FieldFormValidationContext = {}): asserts value is FieldFormRecord[] {
  if (!Array.isArray(value) || value.length > 1000) throw new Error('Project field_forms must contain at most 1000 records')
  const ids = new Set<string>()
  for (const form of value) {
    validateFieldForm(form, context)
    if (ids.has(form.id)) throw new Error(`Duplicate field form UUID ${form.id}`)
    ids.add(form.id)
  }
}
