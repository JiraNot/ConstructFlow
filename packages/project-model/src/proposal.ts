import type { Phase } from './types.js'
import type { FieldFormCategory, FieldFormGpsLocation, FieldFormValue } from './fieldForms.js'

export type ProposalStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'void'
export type ProposalStatusTarget = Exclude<ProposalStatus, 'draft'>
export type ProposalCostCenter = 'demolition_site_prep' | 'new_construction' | 'remodeling_joint_treatment'
export type ProposalQuantityUnit = 'item' | 'm' | 'm2' | 'm3' | 'kg'

/** Command-linked status history. Delivery can be tracked manually; one-time gateway links can record recipient decisions without verifying identity. */
export interface ProposalStatusEvent {
  command_id: string
  from_status: ProposalStatus
  to_status: ProposalStatusTarget
  occurred_at: string
  actor: { kind: 'human' | 'ai' | 'sync' | 'system'; id?: string; role?: string }
  note?: string
  /** A locally captured signature; it does not prove identity or provider-backed consent. */
  device_signature?: ProposalDeviceSignature
  /** Recipient signature recorded by a one-time, project-gateway approval link. */
  recipient_signature?: ProposalRecipientSignature
}

export interface ProposalSignaturePoint { x: number; y: number }
export type ProposalSignatureStroke = ProposalSignaturePoint[]
export interface ProposalDeviceSignatureInput {
  signer_name: string
  strokes: ProposalSignatureStroke[]
}
export interface ProposalDeviceSignature extends ProposalDeviceSignatureInput {
  captured_at: string
}
export interface ProposalRecipientSignature extends ProposalDeviceSignature {
  approval_link_id: string
}

export function validateProposalDeviceSignatureInput(value: unknown): asserts value is ProposalDeviceSignatureInput {
  const fail = (message: string): never => { throw new Error(`Invalid proposal device signature: ${message}`) }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('signature must be an object')
  const signature = value as ProposalDeviceSignatureInput
  if (typeof signature.signer_name !== 'string' || !signature.signer_name.trim() || signature.signer_name.length > 120) fail('signer name must contain at most 120 characters')
  if (!Array.isArray(signature.strokes) || signature.strokes.length < 1 || signature.strokes.length > 40) fail('signature must contain between 1 and 40 strokes')
  let totalPoints = 0
  for (const stroke of signature.strokes) {
    if (!Array.isArray(stroke) || stroke.length < 2 || stroke.length > 2500) fail('each stroke must contain between 2 and 2500 points')
    totalPoints += stroke.length
    for (const point of stroke) {
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) fail('signature points must be normalized finite coordinates')
    }
  }
  if (totalPoints > 5000) fail('signature cannot exceed 5000 points')
}

export function validateProposalDeviceSignature(value: unknown): asserts value is ProposalDeviceSignature {
  validateProposalDeviceSignatureInput(value)
  const signature = value as ProposalDeviceSignature
  if (typeof signature.captured_at !== 'string' || !Number.isFinite(Date.parse(signature.captured_at))) throw new Error('Invalid proposal device signature: capture timestamp must be an ISO date')
}

export function validateProposalRecipientSignature(value: unknown): asserts value is ProposalRecipientSignature {
  validateProposalDeviceSignature(value)
  const signature = value as ProposalRecipientSignature
  if (typeof signature.approval_link_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(signature.approval_link_id)) {
    throw new Error('Invalid proposal recipient signature: approval link ID must be a UUID')
  }
}

export function canTransitionProposalStatus(from: ProposalStatus, to: ProposalStatusTarget): boolean {
  return (from === 'draft' && (to === 'sent' || to === 'void'))
    || (from === 'sent' && (to === 'accepted' || to === 'declined' || to === 'void'))
}

/** Frozen commercial scope captured from a model takeoff at proposal drafting time. */
export interface ProposalLineSnapshot {
  id: string
  source_takeoff_line_id: string
  source_object_ids: string[]
  phase: Phase
  cost_center: ProposalCostCenter
  mark: string
  description: string
  formula: string
  unit: ProposalQuantityUnit
  quantity: number
  unit_rate_thb: number
  amount_thb: number
  /** Frozen product-level margin on supplier material for this line. */
  product_margin_amount_thb?: number
  /** Hidden lines remain priced in totals but are represented by an aggregate on customer-facing output. */
  hide_on_proposal?: boolean
}

/** Output-only proposal row; hidden source rows are collapsed and stripped of source identity. */
export interface ProposalOutputLine {
  id: string
  phase: string
  cost_center: string
  mark: string
  description: string
  formula: string
  unit: ProposalQuantityUnit
  quantity: number
  unit_rate_thb: number
  amount_thb: number
  product_margin_amount_thb?: number
  source_takeoff_line_id?: string
  source_object_ids: string[]
  visibility_rollup?: true
}

/** Derive a stable, non-source UUID for one transient output summary row. */
export function outputRollupUuid(parentId: string, discriminator = ''): string {
  const compact = parentId.replace(/-/g, '').toLowerCase().split('')
  let hashA = 2166136261
  let hashB = 0x9e3779b9
  for (const [index, character] of [...`${parentId}:${discriminator}`].entries()) {
    hashA = Math.imul(hashA ^ character.charCodeAt(0), 16777619)
    hashB = Math.imul(hashB ^ (character.charCodeAt(0) + index), 2246822519)
  }
  const suffix = `${(hashA >>> 0).toString(16).padStart(8, '0')}${(hashB >>> 0).toString(16).padStart(8, '0')}`
  for (let index = 20; index < 32; index++) compact[index] = suffix[index - 20]!
  compact[12] = '5'
  compact[16] = ((Number.parseInt(compact[16]!, 16) & 0x3) | 0x8).toString(16)
  const hex = compact.join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Keep hidden proposal scope in all totals while exposing only one generic, source-free output row. */
export function proposalOutputLines(proposal: Pick<ProposalDraft, 'id' | 'lines'>): ProposalOutputLine[] {
  const visible: ProposalOutputLine[] = proposal.lines.filter(line => line.hide_on_proposal !== true).map(line => ({
    id: line.id,
    phase: line.phase,
    cost_center: line.cost_center,
    mark: line.mark,
    description: line.description,
    formula: line.formula,
    unit: line.unit,
    quantity: line.quantity,
    unit_rate_thb: line.unit_rate_thb,
    amount_thb: line.amount_thb,
    ...(line.product_margin_amount_thb !== undefined ? { product_margin_amount_thb: line.product_margin_amount_thb } : {}),
    source_takeoff_line_id: line.source_takeoff_line_id,
    source_object_ids: [...line.source_object_ids],
  }))
  const hiddenGroups = new Map<string, ProposalLineSnapshot[]>()
  for (const line of proposal.lines) {
    if (line.hide_on_proposal !== true) continue
    const key = [line.phase, line.cost_center].join('|')
    const group = hiddenGroups.get(key) ?? []
    group.push(line)
    hiddenGroups.set(key, group)
  }
  for (const [key, group] of hiddenGroups) {
    const first = group[0]!
    const amount = Number(group.reduce((sum, line) => sum + line.amount_thb, 0).toFixed(2))
    const productMargin = Number(group.reduce((sum, line) => sum + (line.product_margin_amount_thb ?? 0), 0).toFixed(2))
    visible.push({
      id: outputRollupUuid(proposal.id, key),
      phase: first.phase,
      cost_center: first.cost_center,
      mark: 'SCOPE',
      description: 'รายการประกอบโครงการ (รวมรายการย่อย)',
      formula: 'สรุปรวม',
      unit: 'item',
      quantity: 1,
      unit_rate_thb: amount,
      amount_thb: amount,
      product_margin_amount_thb: productMargin,
      source_object_ids: [],
      visibility_rollup: true,
    })
  }
  return visible
}

/** Frozen project-level field information included with a proposal output. */
export interface ProposalFieldDataSnapshot {
  field_form_id: string
  template_id?: string
  title: string
  category: FieldFormCategory
  submitted_at: string
  level_name?: string
  location_mm?: [number, number]
  gps_location?: FieldFormGpsLocation
  responses: Array<{ field_id: string; label: string; value: Exclude<FieldFormValue, null> }>
  notes?: string
}

export type ProposalConditionalTextOperator = 'is_on' | 'is_off' | 'equals' | 'not_empty'

/** Reusable rule keyed to stable field IDs from a field-form template. */
export interface ProposalConditionalTextRule {
  id: string
  template_id: string
  template_title: string
  field_id: string
  field_label: string
  operator: ProposalConditionalTextOperator
  expected_value?: string | number
  content: string
}

/** Resolved rule snapshot; matched text is frozen with the proposal. */
export interface ProposalConditionalTextSnapshot extends ProposalConditionalTextRule {
  matched: boolean
  source_form_id?: string
  source_submitted_at?: string
  rendered_text?: string
}

/** Identifies the reusable company rule used when this proposal's discount was frozen. */
export interface ProposalDiscountRuleSnapshot {
  rule_id: string
  rule_name: string
  discount_percent: number
}

export function validateProposalConditionalTextRule(value: unknown): asserts value is ProposalConditionalTextRule {
  const fail = (message: string): never => { throw new Error(`Invalid conditional proposal text: ${message}`) }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('rule must be an object')
  const rule = value as ProposalConditionalTextRule
  if (!uuid.test(rule.id)) fail('rule ID must be a UUID')
  if (typeof rule.template_id !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,99}$/i.test(rule.template_id)) fail('field template ID is invalid')
  for (const [entry, label, max] of [[rule.template_title, 'template title', 200], [rule.field_label, 'field label', 200], [rule.content, 'content', 4000]] as const) {
    if (typeof entry !== 'string' || !entry.trim() || entry.length > max) fail(`${label} must be a non-empty string of at most ${max} characters`)
  }
  if (typeof rule.field_id !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,119}$/i.test(rule.field_id)) fail('field ID is invalid')
  if (!['is_on', 'is_off', 'equals', 'not_empty'].includes(rule.operator)) fail('operator is unsupported')
  if (rule.operator === 'equals') {
    if (typeof rule.expected_value !== 'string' && typeof rule.expected_value !== 'number') fail('equals requires a text or numeric value')
    if (typeof rule.expected_value === 'number' && !Number.isFinite(rule.expected_value)) fail('numeric value must be finite')
    if (typeof rule.expected_value === 'string' && (!rule.expected_value.trim() || rule.expected_value.length > 200)) fail('text value must contain at most 200 characters')
  } else if (rule.expected_value !== undefined) fail('this operator cannot have an expected value')
}

/** A project-owned proposal snapshot; changing the model does not silently change a sent quote. */
export interface ProposalDraft {
  id: string
  title: string
  status: ProposalStatus
  created_at: string
  updated_at: string
  valid_until?: string
  recipient_name: string
  recipient_email?: string
  recipient_phone?: string
  recipient_address?: string
  notes: string
  terms: string
  estimate_basis: 'thai_reference_rates_v1'
  lines: ProposalLineSnapshot[]
  /** Optional, frozen project-level data copied from submitted field forms. */
  field_data_snapshots?: ProposalFieldDataSnapshot[]
  /** Conditional paragraphs resolved against submitted form data and frozen for output. */
  conditional_texts?: ProposalConditionalTextSnapshot[]
  preliminaries_thb: number
  direct_cost_thb: number
  factor_f: number
  vat_rate: number
  /** Frozen commercial margin/discount inputs and their calculated amount breakdown. */
  gross_margin_percent?: number
  factor_f_subtotal_thb?: number
  product_margin_amount_thb?: number
  gross_margin_amount_thb?: number
  subtotal_before_discount_thb?: number
  discount_percent?: number
  discount_rule_snapshot?: ProposalDiscountRuleSnapshot
  discount_amount_thb?: number
  taxable_amount_thb?: number
  vat_amount_thb?: number
  grand_total_thb: number
  source_takeoff_warnings: string[]
  status_events?: ProposalStatusEvent[]
}

export function validateProposalDraft(value: ProposalDraft): void {
  const fail = (message: string): never => { throw new Error(`Invalid proposal: ${message}`) }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  const text = (entry: unknown, name: string, max: number, required = false) => {
    if (entry === undefined && !required) return
    if (typeof entry !== 'string' || (required && !entry.trim()) || entry.length > max) fail(`${name} must be ${required ? 'a non-empty ' : 'a '}string of at most ${max} characters`)
  }
  const amount = (entry: unknown, name: string, allowZero = true) => {
    if (typeof entry !== 'number' || !Number.isFinite(entry) || entry < 0 || (!allowZero && entry === 0)) fail(`${name} must be a valid ${allowZero ? 'non-negative' : 'positive'} amount`)
  }
  if (!value || typeof value !== 'object' || !uuid.test(value.id)) fail('ID must be a UUID')
  text(value.title, 'title', 160, true)
  text(value.recipient_name, 'recipient name', 160, true)
  text(value.recipient_email, 'recipient email', 254)
  text(value.recipient_phone, 'recipient phone', 60)
  text(value.recipient_address, 'recipient address', 1000)
  text(value.notes, 'notes', 4000)
  text(value.terms, 'terms', 4000)
  if (!['draft', 'sent', 'accepted', 'declined', 'void'].includes(value.status)) fail('status is unsupported')
  if (!['thai_reference_rates_v1'].includes(value.estimate_basis)) fail('estimate basis is unsupported')
  for (const [field, date] of [['created_at', value.created_at], ['updated_at', value.updated_at]] as const) {
    if (typeof date !== 'string' || !Number.isFinite(Date.parse(date))) fail(`${field} must be an ISO date`)
  }
  if (value.valid_until !== undefined && (typeof value.valid_until !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.valid_until) || !Number.isFinite(Date.parse(`${value.valid_until}T00:00:00Z`)))) fail('valid until must be a calendar date')
  if (!Array.isArray(value.lines) || value.lines.length > 5000) fail('lines must contain at most 5000 rows')
  const lineIds = new Set<string>()
  for (const line of value.lines) {
    if (!line || !uuid.test(line.id) || lineIds.has(line.id)) fail('line IDs must be unique UUIDs')
    lineIds.add(line.id)
    text(line.source_takeoff_line_id, 'source takeoff line ID', 500, true)
    text(line.mark, 'line mark', 160, true)
    text(line.description, 'line description', 500, true)
    text(line.formula, 'line formula', 1000, true)
    if (!['existing', 'demolition', 'new_construction'].includes(line.phase)) fail('line phase is unsupported')
    if (!['demolition_site_prep', 'new_construction', 'remodeling_joint_treatment'].includes(line.cost_center)) fail('line cost center is unsupported')
    if (!['item', 'm', 'm2', 'm3', 'kg'].includes(line.unit)) fail('line unit is unsupported')
    amount(line.quantity, 'line quantity', false)
    amount(line.unit_rate_thb, 'line unit rate')
    amount(line.amount_thb, 'line amount')
    if (line.product_margin_amount_thb !== undefined) amount(line.product_margin_amount_thb, 'line product margin')
    if (line.hide_on_proposal !== undefined && typeof line.hide_on_proposal !== 'boolean') fail('line hide_on_proposal must be boolean')
    if (!Array.isArray(line.source_object_ids) || line.source_object_ids.length > 10000 || line.source_object_ids.some(id => typeof id !== 'string' || !uuid.test(id))) fail('line source object IDs must be UUIDs')
    if (new Set(line.source_object_ids).size !== line.source_object_ids.length) fail('line source object IDs must be unique')
  }
  if (value.field_data_snapshots !== undefined) {
    if (!Array.isArray(value.field_data_snapshots) || value.field_data_snapshots.length > 100) fail('field data snapshots must contain at most 100 records')
    const formIds = new Set<string>()
    for (const snapshot of value.field_data_snapshots) {
      if (!snapshot || !uuid.test(snapshot.field_form_id) || formIds.has(snapshot.field_form_id)) fail('field data form IDs must be unique UUIDs')
      formIds.add(snapshot.field_form_id)
      text(snapshot.title, 'field data title', 200, true)
      if (snapshot.template_id !== undefined && (typeof snapshot.template_id !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,99}$/i.test(snapshot.template_id))) fail('field data template ID is invalid')
      if (!['site_visit', 'quality_inspection', 'safety_observation', 'client_request', 'custom'].includes(snapshot.category)) fail('field data category is unsupported')
      if (typeof snapshot.submitted_at !== 'string' || !Number.isFinite(Date.parse(snapshot.submitted_at))) fail('field data submitted_at must be an ISO date')
      text(snapshot.level_name, 'field data level name', 160)
      if (snapshot.location_mm !== undefined && (!Array.isArray(snapshot.location_mm) || snapshot.location_mm.length !== 2 || snapshot.location_mm.some(item => !Number.isFinite(item)))) fail('field data location must contain two finite coordinates')
      if (snapshot.gps_location !== undefined) {
        const gps = snapshot.gps_location
        if (!gps || !Number.isFinite(gps.latitude) || gps.latitude < -90 || gps.latitude > 90 || !Number.isFinite(gps.longitude) || gps.longitude < -180 || gps.longitude > 180 || !Number.isFinite(gps.accuracy_m) || gps.accuracy_m < 0 || gps.accuracy_m > 1_000_000 || typeof gps.captured_at !== 'string' || !Number.isFinite(Date.parse(gps.captured_at))) fail('field data GPS location is invalid')
      }
      if (!Array.isArray(snapshot.responses) || snapshot.responses.length > 100) fail('field data responses must contain at most 100 values')
      const responseIds = new Set<string>()
      for (const response of snapshot.responses) {
        if (!response || typeof response.field_id !== 'string' || !response.field_id.trim() || response.field_id.length > 120 || responseIds.has(response.field_id)) fail('field data response IDs must be unique non-empty strings')
        responseIds.add(response.field_id)
        text(response.label, 'field data response label', 200, true)
        if (typeof response.value === 'string') text(response.value, 'field data response', 4000, true)
        else if (typeof response.value === 'number' && !Number.isFinite(response.value)) fail('field data number responses must be finite')
        else if (typeof response.value !== 'boolean') fail('field data response values must be text, numbers, or booleans')
      }
      text(snapshot.notes, 'field data notes', 4000)
    }
  }
  if (value.conditional_texts !== undefined) {
    if (!Array.isArray(value.conditional_texts) || value.conditional_texts.length > 100) fail('conditional text must contain at most 100 rules')
    const ruleIds = new Set<string>()
    for (const snapshot of value.conditional_texts) {
      validateProposalConditionalTextRule(snapshot)
      if (ruleIds.has(snapshot.id)) fail('conditional text rule IDs must be unique')
      ruleIds.add(snapshot.id)
      if (typeof snapshot.matched !== 'boolean') fail('conditional text matched flag must be boolean')
      if (snapshot.source_form_id !== undefined && !uuid.test(snapshot.source_form_id)) fail('conditional text source form ID must be a UUID')
      if (snapshot.source_submitted_at !== undefined && (typeof snapshot.source_submitted_at !== 'string' || !Number.isFinite(Date.parse(snapshot.source_submitted_at)))) fail('conditional text source date is invalid')
      text(snapshot.rendered_text, 'conditional text output', 4000)
      if (snapshot.matched && !snapshot.rendered_text?.trim()) fail('matched conditional text must have rendered output')
      if (!snapshot.matched && snapshot.rendered_text !== undefined) fail('hidden conditional text cannot have rendered output')
    }
  }
  amount(value.preliminaries_thb, 'preliminaries')
  amount(value.direct_cost_thb, 'direct cost')
  amount(value.factor_f, 'factor F', false)
  amount(value.vat_rate, 'VAT rate')
  const percentage = (entry: unknown, name: string, maximum: number, exclusiveMaximum = false) => {
    if (entry === undefined) return
    if (typeof entry !== 'number' || !Number.isFinite(entry) || entry < 0 || (exclusiveMaximum ? entry >= maximum : entry > maximum)) fail(`${name} must be between 0 and ${maximum}${exclusiveMaximum ? ' exclusive' : ''}`)
  }
  percentage(value.gross_margin_percent, 'gross margin', 100, true)
  percentage(value.discount_percent, 'discount', 100)
  if (value.discount_rule_snapshot !== undefined) {
    const snapshot = value.discount_rule_snapshot
    if (!snapshot || typeof snapshot !== 'object' || !uuid.test(snapshot.rule_id)) fail('discount rule ID must be a UUID')
    text(snapshot.rule_name, 'discount rule name', 100, true)
    percentage(snapshot.discount_percent, 'discount rule percentage', 100)
    if (value.discount_percent === undefined || Math.abs(snapshot.discount_percent - value.discount_percent) > 0.000001) fail('discount rule snapshot must match the frozen proposal discount')
  }
  if (value.status_events !== undefined) {
    if (!Array.isArray(value.status_events) || value.status_events.length > 100) fail('status history must contain at most 100 events')
    const commandIds = new Set<string>()
    let status: ProposalStatus = 'draft'
    for (const event of value.status_events) {
      if (!event || !uuid.test(event.command_id) || commandIds.has(event.command_id)) fail('status history command IDs must be unique UUIDs')
      commandIds.add(event.command_id)
      if (!['draft', 'sent', 'accepted', 'declined', 'void'].includes(event.from_status)
        || !['sent', 'accepted', 'declined', 'void'].includes(event.to_status)) fail('status history contains an unsupported status')
      if (event.from_status !== status || !canTransitionProposalStatus(event.from_status, event.to_status)) fail('status history contains an invalid transition')
      if (typeof event.occurred_at !== 'string' || !Number.isFinite(Date.parse(event.occurred_at))) fail('status event timestamp must be an ISO date')
      if (!event.actor || !['human', 'ai', 'sync', 'system'].includes(event.actor.kind)) fail('status event actor is malformed')
      text(event.actor.id, 'status event actor ID', 160)
      text(event.actor.role, 'status event actor role', 80)
      text(event.note, 'status event note', 1000)
      if (event.device_signature !== undefined) {
        if (event.to_status !== 'accepted') fail('device signatures can only accompany accepted status events')
        try { validateProposalDeviceSignature(event.device_signature) } catch (error) { fail(error instanceof Error ? error.message.replace(/^Invalid proposal device signature: /, '') : 'device signature is invalid') }
      }
      if (event.recipient_signature !== undefined) {
        if (event.to_status !== 'accepted' && event.to_status !== 'declined') fail('recipient signatures can only accompany a recipient decision')
        try { validateProposalRecipientSignature(event.recipient_signature) } catch (error) { fail(error instanceof Error ? error.message.replace(/^Invalid proposal recipient signature: /, '') : 'recipient signature is invalid') }
      }
      status = event.to_status
    }
    if (value.status_events.length > 0 && status !== value.status) fail('status history must end at the current proposal status')
  }
  for (const [field, entry] of Object.entries({
    factor_f_subtotal_thb: value.factor_f_subtotal_thb,
    product_margin_amount_thb: value.product_margin_amount_thb,
    gross_margin_amount_thb: value.gross_margin_amount_thb,
    subtotal_before_discount_thb: value.subtotal_before_discount_thb,
    discount_amount_thb: value.discount_amount_thb,
    taxable_amount_thb: value.taxable_amount_thb,
    vat_amount_thb: value.vat_amount_thb,
  })) if (entry !== undefined) amount(entry, field)
  const pricingSnapshot = [
    value.gross_margin_percent, value.factor_f_subtotal_thb, value.gross_margin_amount_thb,
    value.subtotal_before_discount_thb, value.discount_percent, value.discount_amount_thb,
    value.taxable_amount_thb, value.vat_amount_thb,
  ]
  if (pricingSnapshot.some(entry => entry !== undefined)) {
    if (pricingSnapshot.some(entry => entry === undefined)) fail('commercial pricing breakdown must be complete')
    const close = (left: number, right: number) => Math.abs(left - right) <= 0.03
    const lineProductMargin = value.lines.reduce((sum, line) => sum + (line.product_margin_amount_thb ?? 0), 0)
    if (value.product_margin_amount_thb !== undefined && !close(value.product_margin_amount_thb, lineProductMargin)) fail('product margin total does not match proposal lines')
    if (value.lines.some(line => line.product_margin_amount_thb !== undefined) && value.product_margin_amount_thb === undefined) fail('product margin total is required when proposal lines contain product margin')
    if (!close(value.subtotal_before_discount_thb!, value.factor_f_subtotal_thb! + (value.product_margin_amount_thb ?? 0) + value.gross_margin_amount_thb!)) fail('commercial margin amounts do not add up')
    if (!close(value.discount_amount_thb!, value.subtotal_before_discount_thb! * value.discount_percent! / 100)) fail('commercial discount amount does not match its percentage')
    if (!close(value.taxable_amount_thb!, value.subtotal_before_discount_thb! - value.discount_amount_thb!)) fail('taxable amount does not match the discounted subtotal')
    if (!close(value.vat_amount_thb!, value.grand_total_thb - value.taxable_amount_thb!)) fail('VAT amount does not match the proposal total')
  }
  amount(value.grand_total_thb, 'grand total')
  if (!Array.isArray(value.source_takeoff_warnings) || value.source_takeoff_warnings.length > 1000 || value.source_takeoff_warnings.some(warning => typeof warning !== 'string' || warning.length > 1000)) fail('source warnings are malformed')
}
