import type { ProposalCostCenter, ProposalDraft, ProposalQuantityUnit, ProposalStatus, ProposalStatusEvent, ProposalStatusTarget } from './proposal.js'
import { canTransitionProposalStatus, outputRollupUuid } from './proposal.js'
import type { Phase } from './types.js'

export interface ChangeOrderLineSnapshot {
  id: string
  source_takeoff_line_id: string
  source_object_ids: string[]
  phase: Phase
  cost_center: ProposalCostCenter
  mark: string
  description: string
  formula: string
  unit: ProposalQuantityUnit
  /** Signed quantity relative to the accepted contract scope. */
  change_quantity: number
  unit_rate_thb: number
  /** Signed amount; negative values credit the contract. */
  amount_thb: number
  product_margin_per_unit_thb?: number
  /** Signed product-margin delta frozen from supplier price settings. */
  product_margin_amount_thb?: number
  /** Keep hidden scope in contract totals but collapse its description on output documents. */
  hide_on_proposal?: boolean
}

/** A frozen, incremental scope and price adjustment linked to an accepted proposal. */
export interface ChangeOrderDraft {
  id: string
  proposal_id: string
  number: string
  title: string
  status: ProposalStatus
  created_at: string
  updated_at: string
  basis: 'accepted_proposal_delta_v1'
  base_contract_total_thb: number
  lines: ChangeOrderLineSnapshot[]
  direct_cost_delta_thb: number
  product_margin_delta_thb?: number
  factor_f: number
  gross_margin_percent: number
  discount_percent: number
  vat_rate: number
  factor_f_subtotal_delta_thb: number
  gross_margin_amount_delta_thb: number
  subtotal_before_discount_delta_thb: number
  discount_amount_delta_thb: number
  taxable_amount_delta_thb: number
  vat_amount_delta_thb: number
  grand_total_delta_thb: number
  notes: string
  source_takeoff_warnings: string[]
  status_events?: ProposalStatusEvent[]
}

export interface ChangeOrderOutputLine {
  id: string
  source_takeoff_line_id?: string
  source_object_ids: string[]
  phase: string
  cost_center: string
  mark: string
  description: string
  formula: string
  unit: ProposalQuantityUnit
  change_quantity: number
  unit_rate_thb: number
  amount_thb: number
  product_margin_amount_thb?: number
  visibility_rollup?: true
}

/** Keep hidden change scope in contract totals while exposing only a source-free roll-up row. */
export function changeOrderOutputLines(order: Pick<ChangeOrderDraft, 'id' | 'lines'>): ChangeOrderOutputLine[] {
  const visible: ChangeOrderOutputLine[] = order.lines.filter(line => line.hide_on_proposal !== true).map(line => ({
    id: line.id,
    source_takeoff_line_id: line.source_takeoff_line_id,
    source_object_ids: [...line.source_object_ids],
    phase: line.phase,
    cost_center: line.cost_center,
    mark: line.mark,
    description: line.description,
    formula: line.formula,
    unit: line.unit,
    change_quantity: line.change_quantity,
    unit_rate_thb: line.unit_rate_thb,
    amount_thb: line.amount_thb,
    ...(line.product_margin_amount_thb !== undefined ? { product_margin_amount_thb: line.product_margin_amount_thb } : {}),
  }))
  const hiddenGroups = new Map<string, ChangeOrderLineSnapshot[]>()
  for (const line of order.lines) {
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
      id: outputRollupUuid(order.id, key),
      source_object_ids: [],
      phase: first.phase,
      cost_center: first.cost_center,
      mark: 'SCOPE',
      description: 'รายการเปลี่ยนแปลงประกอบโครงการ (รวมรายการย่อย)',
      formula: 'สรุปรวมส่วนต่าง',
      unit: 'item',
      change_quantity: amount < 0 ? -1 : 1,
      unit_rate_thb: Math.abs(amount),
      amount_thb: amount,
      product_margin_amount_thb: productMargin,
      visibility_rollup: true,
    })
  }
  return visible
}

export function validateChangeOrder(value: ChangeOrderDraft, proposals: readonly ProposalDraft[]): void {
  const fail = (message: string): never => { throw new Error(`Invalid change order: ${message}`) }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  const text = (entry: unknown, name: string, max: number, required = false) => {
    if (typeof entry !== 'string' || (required && !entry.trim()) || entry.length > max) fail(`${name} must be ${required ? 'a non-empty ' : 'a '}string of at most ${max} characters`)
  }
  const number = (entry: unknown, name: string, signed = false) => {
    if (typeof entry !== 'number' || !Number.isFinite(entry) || (!signed && entry < 0)) fail(`${name} must be a finite ${signed ? 'number' : 'non-negative number'}`)
  }
  if (!value || typeof value !== 'object' || !uuid.test(value.id)) fail('ID must be a UUID')
  if (!uuid.test(value.proposal_id)) fail('proposal ID must be a UUID')
  const proposal = proposals.find(item => item.id === value.proposal_id)
  if (!proposal || proposal.status !== 'accepted') fail('change orders must reference an accepted proposal')
  text(value.number, 'number', 40, true)
  text(value.title, 'title', 160, true)
  text(value.notes, 'notes', 4000)
  if (!['draft', 'sent', 'accepted', 'declined', 'void'].includes(value.status)) fail('status is unsupported')
  if (value.basis !== 'accepted_proposal_delta_v1') fail('basis is unsupported')
  for (const [field, date] of [['created_at', value.created_at], ['updated_at', value.updated_at]] as const) {
    if (typeof date !== 'string' || !Number.isFinite(Date.parse(date))) fail(`${field} must be an ISO date`)
  }
  number(value.base_contract_total_thb, 'base contract total')
  if (!Array.isArray(value.lines) || value.lines.length > 5000) fail('lines must contain at most 5000 rows')
  const ids = new Set<string>()
  for (const line of value.lines) {
    if (!line || !uuid.test(line.id) || ids.has(line.id)) fail('line IDs must be unique UUIDs')
    ids.add(line.id)
    text(line.source_takeoff_line_id, 'source takeoff line ID', 500, true)
    text(line.mark, 'line mark', 160, true)
    text(line.description, 'line description', 500, true)
    text(line.formula, 'line formula', 1000, true)
    if (!['existing', 'demolition', 'new_construction'].includes(line.phase)) fail('line phase is unsupported')
    if (!['demolition_site_prep', 'new_construction', 'remodeling_joint_treatment'].includes(line.cost_center)) fail('line cost center is unsupported')
    if (!['item', 'm', 'm2', 'm3', 'kg'].includes(line.unit)) fail('line unit is unsupported')
    number(line.change_quantity, 'line change quantity', true)
    if (line.change_quantity === 0) fail('line change quantity cannot be zero')
    number(line.unit_rate_thb, 'line unit rate')
    number(line.amount_thb, 'line amount', true)
    if (line.product_margin_per_unit_thb !== undefined) number(line.product_margin_per_unit_thb, 'line product margin per unit')
    if (line.product_margin_amount_thb !== undefined) number(line.product_margin_amount_thb, 'line product margin', true)
    if (line.hide_on_proposal !== undefined && typeof line.hide_on_proposal !== 'boolean') fail('line hide_on_proposal must be boolean')
    if (line.product_margin_per_unit_thb !== undefined && Math.abs((line.product_margin_amount_thb ?? 0) - line.change_quantity * line.product_margin_per_unit_thb) > 0.03) fail('line product margin does not match its signed quantity and unit amount')
    if (Math.abs(line.amount_thb - line.change_quantity * line.unit_rate_thb) > 0.03) fail('line amount does not match its signed quantity and rate')
    if (!Array.isArray(line.source_object_ids) || line.source_object_ids.length > 10000 || line.source_object_ids.some(id => typeof id !== 'string' || !uuid.test(id))) fail('line source object IDs must be UUIDs')
    if (new Set(line.source_object_ids).size !== line.source_object_ids.length) fail('line source object IDs must be unique')
  }
  if (value.lines.length === 0) fail('at least one scope change is required')
  const close = (actual: number, expected: number) => Math.abs(actual - expected) <= 0.03
  number(value.direct_cost_delta_thb, 'direct cost delta', true)
  if (value.product_margin_delta_thb !== undefined) number(value.product_margin_delta_thb, 'product margin delta', true)
  number(value.factor_f, 'Factor F')
  if (value.factor_f <= 0) fail('Factor F must be greater than zero')
  number(value.gross_margin_percent, 'gross margin')
  number(value.discount_percent, 'discount')
  number(value.vat_rate, 'VAT rate')
  for (const field of ['factor_f_subtotal_delta_thb', 'gross_margin_amount_delta_thb', 'subtotal_before_discount_delta_thb', 'discount_amount_delta_thb', 'taxable_amount_delta_thb', 'vat_amount_delta_thb', 'grand_total_delta_thb'] as const) number(value[field], field, true)
  if (value.gross_margin_percent >= 100 || value.discount_percent > 100 || value.vat_rate > 1) fail('commercial percentages are outside their supported range')
  if (!close(value.direct_cost_delta_thb, value.lines.reduce((sum, line) => sum + line.amount_thb, 0))) fail('direct cost delta does not match line amounts')
  const lineProductMargin = value.lines.reduce((sum, line) => sum + (line.product_margin_amount_thb ?? 0), 0)
  if (value.product_margin_delta_thb !== undefined && !close(value.product_margin_delta_thb, lineProductMargin)) fail('product margin delta does not match line amounts')
  if (value.lines.some(line => line.product_margin_amount_thb !== undefined) && value.product_margin_delta_thb === undefined) fail('product margin delta is required when lines contain product margin')
  const preMargin = value.direct_cost_delta_thb * value.factor_f / (1 + value.vat_rate)
  const productMargin = value.product_margin_delta_thb ?? 0
  const subtotal = (preMargin + productMargin) / (1 - value.gross_margin_percent / 100)
  const discount = subtotal * value.discount_percent / 100
  const taxable = subtotal - discount
  const grand = taxable * (1 + value.vat_rate)
  if (!close(value.factor_f_subtotal_delta_thb, preMargin)
    || !close(value.gross_margin_amount_delta_thb, subtotal - preMargin - productMargin)
    || !close(value.subtotal_before_discount_delta_thb, subtotal)
    || !close(value.discount_amount_delta_thb, discount)
    || !close(value.taxable_amount_delta_thb, taxable)
    || !close(value.vat_amount_delta_thb, grand - taxable)
    || !close(value.grand_total_delta_thb, grand)) fail('commercial delta breakdown does not add up')
  if (value.status !== 'draft' && value.status !== 'void' && value.base_contract_total_thb + value.grand_total_delta_thb < -0.03) fail('a sent or declined change order cannot reduce the contract below zero')
  if (!Array.isArray(value.source_takeoff_warnings) || value.source_takeoff_warnings.length > 1000 || value.source_takeoff_warnings.some(warning => typeof warning !== 'string' || warning.length > 1000)) fail('source warnings are malformed')
  if (value.status_events !== undefined) {
    if (!Array.isArray(value.status_events) || value.status_events.length > 100) fail('status history must contain at most 100 events')
    const commandIds = new Set<string>()
    let status: ProposalStatus = 'draft'
    for (const event of value.status_events) {
      if (!event || !uuid.test(event.command_id) || commandIds.has(event.command_id)) fail('status history command IDs must be unique UUIDs')
      commandIds.add(event.command_id)
      if (event.from_status !== status || !canTransitionProposalStatus(event.from_status, event.to_status)) fail('status history contains an invalid transition')
      if (typeof event.occurred_at !== 'string' || !Number.isFinite(Date.parse(event.occurred_at))) fail('status event timestamp must be an ISO date')
      if (!event.actor || !['human', 'ai', 'sync', 'system'].includes(event.actor.kind)) fail('status event actor is malformed')
      text(event.actor.id, 'status event actor ID', 160)
      text(event.actor.role, 'status event actor role', 80)
      text(event.note, 'status event note', 1000)
      status = event.to_status
    }
    if (value.status_events.length > 0 && status !== value.status) fail('status history must end at the current change order status')
  }
}
