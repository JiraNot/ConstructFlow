import type { ChangeOrderDraft } from './changeOrder.js'
import type { ProposalDraft } from './proposal.js'

export type InvoiceStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'void'
export type InvoicePaymentMethod = 'cash' | 'bank_transfer' | 'cheque' | 'other'
export type InvoiceStatusTarget = 'issued' | 'void'

export interface InvoiceActor {
  kind: 'human' | 'ai' | 'sync' | 'system'
  id?: string
  role?: string
}

export interface InvoiceStatusEvent {
  command_id: string
  from_status: InvoiceStatus
  to_status: InvoiceStatusTarget
  occurred_at: string
  actor: InvoiceActor
  note?: string
}

/** Recorded receipt from a user or accounting sync; it is not a payment processor transaction. */
export interface InvoicePaymentRecord {
  command_id: string
  amount_thb: number
  method: InvoicePaymentMethod
  received_at: string
  actor: InvoiceActor
  reference?: string
  /** Stable provider identity used to make imported accounting receipts idempotent. */
  integration_reference?: string
  note?: string
}

/** Contract installment snapshot, frozen from an accepted proposal and its approved change orders. */
export interface InvoiceDraft {
  id: string
  proposal_id: string
  number: string
  title: string
  status: InvoiceStatus
  created_at: string
  updated_at: string
  due_date?: string
  basis: 'accepted_contract_billing_v1'
  recipient_name: string
  recipient_address?: string
  proposal_total_thb: number
  approved_change_order_total_thb: number
  contract_total_thb: number
  source_change_order_ids: string[]
  billing_percent: number
  vat_rate: number
  taxable_amount_thb: number
  vat_amount_thb: number
  amount_due_thb: number
  notes: string
  status_events: InvoiceStatusEvent[]
  payments: InvoicePaymentRecord[]
}

export interface InvoiceAmountBreakdown {
  amount_due_thb: number
  taxable_amount_thb: number
  vat_amount_thb: number
}

/** Bill a percentage of the frozen VAT-inclusive contract total. */
export function calculateInvoiceAmounts(contractTotalThb: number, billingPercent: number, vatRate: number): InvoiceAmountBreakdown {
  if (![contractTotalThb, billingPercent, vatRate].every(Number.isFinite) || contractTotalThb < 0 || billingPercent <= 0 || billingPercent > 100 || vatRate < 0 || vatRate > 1)
    throw new RangeError('Invoice amount inputs are outside their supported range')
  const amountDue = Number((contractTotalThb * billingPercent / 100).toFixed(2))
  const taxable = Number((amountDue / (1 + vatRate)).toFixed(2))
  return { amount_due_thb: amountDue, taxable_amount_thb: taxable, vat_amount_thb: Number((amountDue - taxable).toFixed(2)) }
}

export function getInvoicePaidAmount(invoice: Pick<InvoiceDraft, 'payments'>): number {
  return Number(invoice.payments.reduce((sum, payment) => sum + payment.amount_thb, 0).toFixed(2))
}

export function getInvoiceOutstandingAmount(invoice: Pick<InvoiceDraft, 'amount_due_thb' | 'payments'>): number {
  return Number(Math.max(0, invoice.amount_due_thb - getInvoicePaidAmount(invoice)).toFixed(2))
}

export function canTransitionInvoiceStatus(from: InvoiceStatus, to: InvoiceStatusTarget): boolean {
  return (from === 'draft' && (to === 'issued' || to === 'void')) || (from === 'issued' && to === 'void')
}

export function validateInvoice(value: InvoiceDraft, proposals: readonly ProposalDraft[], changeOrders: readonly ChangeOrderDraft[]): void {
  const fail = (message: string): never => { throw new Error(`Invalid invoice: ${message}`) }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  const text = (entry: unknown, name: string, max: number, required = false) => {
    if (entry === undefined && !required) return
    if (typeof entry !== 'string' || (required && !entry.trim()) || entry.length > max) fail(`${name} must be ${required ? 'a non-empty ' : 'a '}string of at most ${max} characters`)
  }
  const number = (entry: unknown, name: string, signed = false) => {
    if (typeof entry !== 'number' || !Number.isFinite(entry) || (!signed && entry < 0)) fail(`${name} must be a finite ${signed ? 'number' : 'non-negative number'}`)
  }
  if (!value || typeof value !== 'object' || !uuid.test(value.id)) fail('ID must be a UUID')
  if (!uuid.test(value.proposal_id)) fail('proposal ID must be a UUID')
  const proposal = proposals.find(item => item.id === value.proposal_id)
  if (!proposal || proposal.status !== 'accepted') fail('invoices must reference an accepted proposal')
  text(value.number, 'number', 60, true)
  text(value.title, 'title', 160, true)
  text(value.recipient_name, 'recipient name', 160, true)
  text(value.recipient_address, 'recipient address', 1000)
  text(value.notes, 'notes', 4000)
  if (!['draft', 'issued', 'partially_paid', 'paid', 'void'].includes(value.status)) fail('status is unsupported')
  if (value.basis !== 'accepted_contract_billing_v1') fail('basis is unsupported')
  for (const [field, date] of [['created_at', value.created_at], ['updated_at', value.updated_at]] as const) {
    if (typeof date !== 'string' || !Number.isFinite(Date.parse(date))) fail(`${field} must be an ISO date`)
  }
  if (value.due_date !== undefined && (typeof value.due_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.due_date) || !Number.isFinite(Date.parse(`${value.due_date}T00:00:00Z`)))) fail('due date must be a calendar date')
  if (!Array.isArray(value.source_change_order_ids) || value.source_change_order_ids.length > 500 || value.source_change_order_ids.some(id => !uuid.test(id))) fail('source change order IDs must be UUIDs')
  if (new Set(value.source_change_order_ids).size !== value.source_change_order_ids.length) fail('source change order IDs must be unique')
  const sourceOrders = value.source_change_order_ids.map(id => changeOrders.find(order => order.id === id))
  if (sourceOrders.some(order => !order || order.proposal_id !== value.proposal_id || order.status !== 'accepted')) fail('invoices can only snapshot approved change orders from the same proposal')
  number(value.proposal_total_thb, 'proposal total')
  number(value.approved_change_order_total_thb, 'approved change order total', true)
  number(value.contract_total_thb, 'contract total')
  if (Math.abs(value.proposal_total_thb - proposal!.grand_total_thb) > 0.03) fail('proposal total does not match its accepted snapshot')
  const orderTotal = sourceOrders.reduce((sum, order) => sum + order!.grand_total_delta_thb, 0)
  if (Math.abs(value.approved_change_order_total_thb - orderTotal) > 0.03) fail('approved change order total does not match linked snapshots')
  if (Math.abs(value.contract_total_thb - value.proposal_total_thb - value.approved_change_order_total_thb) > 0.03) fail('contract total does not match proposal and change order snapshots')
  number(value.billing_percent, 'billing percentage')
  number(value.vat_rate, 'VAT rate')
  number(value.taxable_amount_thb, 'taxable amount')
  number(value.vat_amount_thb, 'VAT amount')
  number(value.amount_due_thb, 'amount due')
  if (value.contract_total_thb <= 0 || value.billing_percent <= 0 || value.billing_percent > 100 || value.vat_rate > 1 || value.amount_due_thb <= 0) fail('billing percentage, VAT or amount due is outside its supported range')
  const breakdown = calculateInvoiceAmounts(value.contract_total_thb, value.billing_percent, value.vat_rate)
  if (Math.abs(value.amount_due_thb - breakdown.amount_due_thb) > 0.03 || Math.abs(value.taxable_amount_thb - breakdown.taxable_amount_thb) > 0.03 || Math.abs(value.vat_amount_thb - breakdown.vat_amount_thb) > 0.03) fail('invoice amount breakdown does not match the frozen contract percentage')
  if (!Array.isArray(value.status_events) || value.status_events.length > 100) fail('status history must contain at most 100 events')
  if (!Array.isArray(value.payments) || value.payments.length > 1000) fail('payment history must contain at most 1000 records')
  const commandIds = new Set<string>()
  const integrationReferences = new Set<string>()
  let stateBeforePayments: InvoiceStatus = 'draft'
  for (const event of value.status_events) {
    if (!event || !uuid.test(event.command_id) || commandIds.has(event.command_id)) fail('status event command IDs must be unique UUIDs')
    commandIds.add(event.command_id)
    if (event.from_status !== stateBeforePayments || !canTransitionInvoiceStatus(event.from_status, event.to_status)) fail('status history contains an invalid transition')
    if (typeof event.occurred_at !== 'string' || !Number.isFinite(Date.parse(event.occurred_at))) fail('status event timestamp must be an ISO date')
    if (!event.actor || !['human', 'ai', 'sync', 'system'].includes(event.actor.kind)) fail('status event actor is malformed')
    text(event.actor.id, 'status event actor ID', 160)
    text(event.actor.role, 'status event actor role', 80)
    text(event.note, 'status event note', 1000)
    stateBeforePayments = event.to_status
  }
  let paidAmount = 0
  for (const payment of value.payments) {
    if (!payment || !uuid.test(payment.command_id) || commandIds.has(payment.command_id)) fail('payment command IDs must be unique UUIDs')
    commandIds.add(payment.command_id)
    number(payment.amount_thb, 'payment amount')
    if (payment.amount_thb <= 0) fail('payment amount must be greater than zero')
    if (!['cash', 'bank_transfer', 'cheque', 'other'].includes(payment.method)) fail('payment method is unsupported')
    if (typeof payment.received_at !== 'string' || !Number.isFinite(Date.parse(payment.received_at))) fail('payment timestamp must be an ISO date')
    if (!payment.actor || !['human', 'ai', 'sync', 'system'].includes(payment.actor.kind)) fail('payment actor is malformed')
    text(payment.actor.id, 'payment actor ID', 160)
    text(payment.actor.role, 'payment actor role', 80)
    text(payment.reference, 'payment reference', 160)
    text(payment.integration_reference, 'payment integration reference', 240)
    if (payment.integration_reference) {
      if (integrationReferences.has(payment.integration_reference)) fail('payment integration references must be unique')
      integrationReferences.add(payment.integration_reference)
    }
    text(payment.note, 'payment note', 1000)
    paidAmount += payment.amount_thb
  }
  if (paidAmount - value.amount_due_thb > 0.03) fail('recorded payments cannot exceed the invoice amount')
  if (value.status === 'draft' && (value.status_events.length || value.payments.length)) fail('draft invoices cannot have status events or payments')
  else if (value.status === 'void' && (stateBeforePayments !== 'void' || value.payments.length)) fail('void invoices must have a void event and no payments')
  else if (value.status === 'issued' && (stateBeforePayments !== 'issued' || paidAmount > 0.03)) fail('issued invoice status does not match its events and payments')
  else if (value.status === 'partially_paid' && (stateBeforePayments !== 'issued' || paidAmount <= 0.03 || paidAmount >= value.amount_due_thb - 0.03)) fail('partially paid invoice status does not match its payments')
  else if (value.status === 'paid' && (stateBeforePayments !== 'issued' || Math.abs(paidAmount - value.amount_due_thb) > 0.03)) fail('paid invoice status does not match its payments')
}
