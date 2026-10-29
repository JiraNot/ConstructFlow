import { changeOrderOutputLines, proposalOutputLines, type ChangeOrderDraft, type InvoiceDraft, type ProjectDocument, type ProposalDraft } from '@constructflow/project-model'
import { getLocalCollaborationToken } from '../projectAutosave.js'
import { getCanonicalProjectUuid } from '../projectUuid.js'

export type IntegrationRecord =
  | { kind: 'proposal'; value: ProposalDraft }
  | { kind: 'change_order'; value: ChangeOrderDraft }
  | { kind: 'invoice'; value: InvoiceDraft }

export interface WebhookGatewayConfig {
  allowed_hosts: string[]
  signature: 'HMAC-SHA256'
  max_payload_bytes: number
}

export interface CustomWebhookAcknowledgement {
  event_id: string
  status: 'succeeded' | 'already_succeeded'
  response_status: number
  attempt: number
}

export function createIntegrationEventPayload(
  project: ProjectDocument,
  record: IntegrationRecord,
  options: { eventId: string; includeRecipient: boolean; includeFieldData: boolean; emittedAt?: string },
): Record<string, unknown> {
  const emittedAt = options.emittedAt ?? new Date().toISOString()
  let eventType: string
  let data: Record<string, unknown>

  if (record.kind === 'proposal') {
    const proposal = record.value
    eventType = 'constructflow.proposal.snapshot'
    data = {
      record_uuid: proposal.id,
      title: proposal.title,
      status: proposal.status,
      created_at: proposal.created_at,
      updated_at: proposal.updated_at,
      valid_until: proposal.valid_until ?? null,
      estimate_basis: proposal.estimate_basis,
      lines: proposalOutputLines(proposal).map(line => ({
        line_uuid: line.id,
        phase: line.phase,
        cost_center: line.cost_center,
        mark: line.mark,
        description: line.description,
        formula: line.formula,
        unit: line.unit,
        quantity: line.quantity,
        unit_rate_thb: line.unit_rate_thb,
        amount_thb: line.amount_thb,
        product_margin_amount_thb: line.product_margin_amount_thb ?? 0,
        source_object_uuids: line.source_object_ids,
      })),
      totals: {
        direct_cost_thb: proposal.direct_cost_thb,
        factor_f: proposal.factor_f,
        factor_f_subtotal_thb: proposal.factor_f_subtotal_thb ?? null,
        product_margin_amount_thb: proposal.product_margin_amount_thb ?? 0,
        gross_margin_percent: proposal.gross_margin_percent ?? null,
        gross_margin_amount_thb: proposal.gross_margin_amount_thb ?? 0,
        subtotal_before_discount_thb: proposal.subtotal_before_discount_thb ?? null,
        discount_percent: proposal.discount_percent ?? 0,
        discount_amount_thb: proposal.discount_amount_thb ?? 0,
        taxable_amount_thb: proposal.taxable_amount_thb ?? null,
        vat_rate: proposal.vat_rate,
        vat_amount_thb: proposal.vat_amount_thb ?? null,
        grand_total_thb: proposal.grand_total_thb,
      },
      discount_rule_snapshot: proposal.discount_rule_snapshot ?? null,
      notes: proposal.notes,
      terms: proposal.terms,
      field_data: options.includeFieldData ? proposal.field_data_snapshots ?? [] : undefined,
      conditional_texts: options.includeFieldData
        ? (proposal.conditional_texts ?? []).filter(item => item.matched).map(item => item.rendered_text ?? item.content)
        : undefined,
      recipient: options.includeRecipient ? {
        name: proposal.recipient_name,
        email: proposal.recipient_email ?? null,
        phone: proposal.recipient_phone ?? null,
        address: proposal.recipient_address ?? null,
      } : undefined,
    }
  } else if (record.kind === 'change_order') {
    const order = record.value
    eventType = 'constructflow.change_order.snapshot'
    data = {
      record_uuid: order.id,
      proposal_uuid: order.proposal_id,
      number: order.number,
      title: order.title,
      status: order.status,
      created_at: order.created_at,
      updated_at: order.updated_at,
      basis: order.basis,
      lines: changeOrderOutputLines(order).map(line => ({
        line_uuid: line.id,
        source_takeoff_line_id: line.source_takeoff_line_id,
        source_object_uuids: line.source_object_ids,
        phase: line.phase,
        cost_center: line.cost_center,
        mark: line.mark,
        description: line.description,
        formula: line.formula,
        unit: line.unit,
        change_quantity: line.change_quantity,
        unit_rate_thb: line.unit_rate_thb,
        amount_thb: line.amount_thb,
        product_margin_amount_thb: line.product_margin_amount_thb ?? 0,
      })),
      totals: {
        base_contract_total_thb: order.base_contract_total_thb,
        direct_cost_delta_thb: order.direct_cost_delta_thb,
        product_margin_delta_thb: order.product_margin_delta_thb ?? 0,
        factor_f: order.factor_f,
        gross_margin_percent: order.gross_margin_percent,
        discount_percent: order.discount_percent,
        vat_rate: order.vat_rate,
        grand_total_delta_thb: order.grand_total_delta_thb,
      },
      notes: order.notes,
      recipient: options.includeRecipient ? {
        name: project.proposal_drafts?.find(proposal => proposal.id === order.proposal_id)?.recipient_name ?? null,
        email: project.proposal_drafts?.find(proposal => proposal.id === order.proposal_id)?.recipient_email ?? null,
      } : undefined,
    }
  } else {
    const invoice = record.value
    eventType = 'constructflow.invoice.snapshot'
    data = {
      record_uuid: invoice.id,
      proposal_uuid: invoice.proposal_id,
      number: invoice.number,
      title: invoice.title,
      status: invoice.status,
      created_at: invoice.created_at,
      updated_at: invoice.updated_at,
      due_date: invoice.due_date ?? null,
      basis: invoice.basis,
      approved_change_order_uuids: invoice.source_change_order_ids,
      totals: {
        proposal_total_thb: invoice.proposal_total_thb,
        approved_change_order_total_thb: invoice.approved_change_order_total_thb,
        contract_total_thb: invoice.contract_total_thb,
        billing_percent: invoice.billing_percent,
        taxable_amount_thb: invoice.taxable_amount_thb,
        vat_rate: invoice.vat_rate,
        vat_amount_thb: invoice.vat_amount_thb,
        amount_due_thb: invoice.amount_due_thb,
      },
      notes: invoice.notes,
      recipient: options.includeRecipient ? {
        name: invoice.recipient_name,
        address: invoice.recipient_address ?? null,
      } : undefined,
    }
  }

  return {
    schema: 'constructflow.integration-event',
    schema_version: 1,
    event_type: eventType,
    event_id: options.eventId,
    emitted_at: emittedAt,
    project: {
      project_uuid: getCanonicalProjectUuid(project.project.id),
      name: project.project.name,
      unit: project.project.display_unit ?? 'm',
      level_count: project.levels.length,
    },
    data,
  }
}

export async function getWebhookGatewayConfig(projectId: string): Promise<WebhookGatewayConfig> {
  const canonicalProjectId = getCanonicalProjectUuid(projectId)
  const localSettings = await getLocalCollaborationToken()
  if (!localSettings) throw new Error('ตั้งค่า Collaboration token ของทีมก่อนใช้ custom webhook')
  const response = await fetch(`/api/collaboration/projects/${encodeURIComponent(canonicalProjectId)}/integrations/webhook/config`, {
    method: 'GET', credentials: 'same-origin', redirect: 'error',
    headers: { Authorization: `Bearer ${localSettings.token}` },
  })
  const result = await response.json().catch(() => null) as (WebhookGatewayConfig & { error?: string }) | null
  if (!response.ok) throw new Error(result?.error ?? `Gateway ตอบกลับ HTTP ${response.status}`)
  if (!result || !Array.isArray(result.allowed_hosts) || result.signature !== 'HMAC-SHA256' || !Number.isFinite(result.max_payload_bytes))
    throw new Error('Gateway ส่ง policy ของ webhook กลับมาไม่ถูกต้อง')
  return result
}

export async function postCustomWebhook(
  projectId: string,
  targetUrl: string,
  signingSecret: string,
  eventId: string,
  payload: Record<string, unknown>,
): Promise<CustomWebhookAcknowledgement> {
  if (!/^[0-9a-f-]{36}$/i.test(eventId) || payload.event_id !== eventId || typeof payload.event_type !== 'string')
    throw new Error('Webhook payload ต้องมี event_id และ event_type ที่ถูกต้อง')
  const localSettings = await getLocalCollaborationToken()
  if (!localSettings) throw new Error('ตั้งค่า Collaboration token ของทีมในประวัติเวอร์ชันก่อนส่ง webhook')
  const canonicalProjectId = getCanonicalProjectUuid(projectId)
  const body = JSON.stringify({ target_url: targetUrl, signing_secret: signingSecret, event_id: eventId, event_type: payload.event_type, payload })
  if (new TextEncoder().encode(body).byteLength > 1_016_000) throw new Error('ข้อมูล webhook เกิน 1 MB')
  const response = await fetch(`/api/collaboration/projects/${encodeURIComponent(canonicalProjectId)}/integrations/webhook`, {
    method: 'POST', credentials: 'same-origin', redirect: 'error',
    headers: { Authorization: `Bearer ${localSettings.token}`, 'Content-Type': 'application/json' },
    body,
  })
  const result = await response.json().catch(() => null) as (CustomWebhookAcknowledgement & { error?: string }) | null
  if (!response.ok) throw new Error(result?.error ?? `Gateway ตอบกลับ HTTP ${response.status}`)
  if (!result || !['succeeded', 'already_succeeded'].includes(result.status) || result.event_id !== eventId || !Number.isInteger(result.response_status))
    throw new Error('Gateway ตอบกลับ acknowledgement ที่ไม่ถูกต้อง')
  return result
}
