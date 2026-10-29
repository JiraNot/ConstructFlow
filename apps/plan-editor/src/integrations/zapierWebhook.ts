import { proposalOutputLines, type ProjectDocument, type ProposalDraft } from '@constructflow/project-model'
import { getLocalCollaborationToken } from '../projectAutosave.js'
import { getCanonicalProjectUuid } from '../projectUuid.js'

export interface ProposalWebhookOptions {
  eventId: string
  includeRecipient: boolean
  includeFieldData: boolean
  emittedAt?: string
}

/** A flat, versioned payload that Zapier can map without receiving the BIM model. */
export function createProposalWebhookPayload(
  project: ProjectDocument,
  proposal: ProposalDraft,
  options: ProposalWebhookOptions,
): Record<string, string> {
  const outputLines = proposalOutputLines(proposal)
  const payload: Record<string, string> = {
    event: 'constructflow.proposal.snapshot',
    event_id: options.eventId,
    schema_version: '1',
    emitted_at: options.emittedAt ?? new Date().toISOString(),
    project_uuid: getCanonicalProjectUuid(project.project.id),
    project_name: project.project.name,
    project_unit: project.project.display_unit ?? 'm',
    project_level_count: String(project.levels.length),
    project_object_count: String(Object.keys(project.objects).length),
    proposal_uuid: proposal.id,
    proposal_title: proposal.title,
    proposal_status: proposal.status,
    proposal_created_at: proposal.created_at,
    proposal_updated_at: proposal.updated_at,
    proposal_valid_until: proposal.valid_until ?? '',
    estimate_basis: proposal.estimate_basis,
    line_count: String(outputLines.length),
    proposal_lines_json: JSON.stringify(outputLines.map(line => ({
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
    }))),
    preliminaries_thb: String(proposal.preliminaries_thb),
    direct_cost_thb: String(proposal.direct_cost_thb),
    factor_f: String(proposal.factor_f),
    factor_f_subtotal_thb: String(proposal.factor_f_subtotal_thb ?? ''),
    product_margin_amount_thb: String(proposal.product_margin_amount_thb ?? 0),
    gross_margin_percent: String(proposal.gross_margin_percent ?? ''),
    gross_margin_amount_thb: String(proposal.gross_margin_amount_thb ?? 0),
    subtotal_before_discount_thb: String(proposal.subtotal_before_discount_thb ?? ''),
    discount_percent: String(proposal.discount_percent ?? 0),
    discount_amount_thb: String(proposal.discount_amount_thb ?? 0),
    discount_rule_id: proposal.discount_rule_snapshot?.rule_id ?? '',
    discount_rule_name: proposal.discount_rule_snapshot?.rule_name ?? '',
    taxable_amount_thb: String(proposal.taxable_amount_thb ?? ''),
    vat_rate: String(proposal.vat_rate),
    vat_amount_thb: String(proposal.vat_amount_thb ?? ''),
    grand_total_thb: String(proposal.grand_total_thb),
    proposal_notes: proposal.notes,
    proposal_terms: proposal.terms,
    source_takeoff_warnings_json: JSON.stringify(proposal.source_takeoff_warnings),
    conditional_texts_json: options.includeFieldData
      ? JSON.stringify((proposal.conditional_texts ?? []).filter(item => item.matched).map(item => item.rendered_text ?? item.content))
      : '[]',
  }
  if (options.includeRecipient) {
    payload.recipient_name = proposal.recipient_name
    payload.recipient_email = proposal.recipient_email ?? ''
    payload.recipient_phone = proposal.recipient_phone ?? ''
    payload.recipient_address = proposal.recipient_address ?? ''
  }
  if (options.includeFieldData) payload.field_data_json = JSON.stringify(proposal.field_data_snapshots ?? [])
  return payload
}

export interface ZapierDeliveryAcknowledgement {
  event_id: string
  status: 'succeeded' | 'already_succeeded'
  response_status: number
  attempt: number
}

function validateCatchHookUrl(value: string): string {
  let target: URL
  try { target = new URL(value) } catch { throw new Error('รูปแบบ Zapier webhook URL ไม่ถูกต้อง') }
  if (target.protocol !== 'https:' || target.hostname.toLowerCase() !== 'hooks.zapier.com'
    || target.port || target.username || target.password || target.search || target.hash
    || !/^\/hooks\/catch\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/?$/.test(target.pathname))
    throw new Error('ใช้ได้เฉพาะ HTTPS Zapier Catch Hook URL รูปแบบ hooks.zapier.com/hooks/catch/...')
  return target.toString()
}

/** Deliver through the authenticated team gateway so the browser receives Zapier's HTTP acknowledgement. */
export async function postZapierCatchHook(
  projectId: string,
  url: string,
  payload: Record<string, string>,
): Promise<ZapierDeliveryAcknowledgement> {
  const canonicalProjectId = getCanonicalProjectUuid(projectId)
  const targetUrl = validateCatchHookUrl(url)
  if (!payload.event_id || !/^[0-9a-f-]{36}$/i.test(payload.event_id)) throw new Error('Zapier payload ต้องมี event_id UUID')
  const localSettings = await getLocalCollaborationToken()
  if (!localSettings) throw new Error('ตั้งค่า Collaboration token ของทีมในประวัติเวอร์ชันก่อนส่งไป Zapier')
  const body = JSON.stringify({ target_url: targetUrl, payload })
  if (new TextEncoder().encode(body).byteLength > 1_016_000) throw new Error('ข้อมูล webhook เกิน 1 MB')
  const response = await fetch(`/api/collaboration/projects/${encodeURIComponent(canonicalProjectId)}/integrations/zapier`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Authorization: `Bearer ${localSettings.token}`,
      'Content-Type': 'application/json',
    },
    body,
  })
  const result = await response.json().catch(() => null) as (ZapierDeliveryAcknowledgement & { error?: string }) | null
  if (!response.ok) throw new Error(result?.error ?? `Gateway ตอบกลับ HTTP ${response.status}`)
  if (!result || !['succeeded', 'already_succeeded'].includes(result.status)
    || result.event_id !== payload.event_id || !Number.isInteger(result.response_status))
    throw new Error('Gateway ตอบกลับ acknowledgement ที่ไม่ถูกต้อง')
  return result
}
