import { proposalOutputLines, type ProjectDocument, type ProposalDraft, type ProposalRecipientSignature } from '@constructflow/project-model'
import { getLocalCollaborationToken } from '../projectAutosave.js'
import { getCanonicalProjectUuid } from '../projectUuid.js'

export interface ProposalApprovalSnapshot {
  schema_version: 1
  project_id: string
  proposal_id: string
  project_name: string
  title: string
  recipient_name: string
  valid_until?: string
  notes: string
  terms: string
  conditional_texts: string[]
  lines: Array<{
    phase: string
    cost_center: string
    mark: string
    description: string
    formula: string
    unit: string
    quantity: number
    unit_rate_thb: number
    amount_thb: number
  }>
  totals: Record<string, number>
}

export interface ProposalApprovalDecision {
  status: 'accepted' | 'declined'
  decided_at: string
  signer_name: string
  signature: { signer_name: string; strokes: ProposalRecipientSignature['strokes'] } | null
  note: string
}

export interface ProposalApprovalLink {
  id: string
  status: 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired'
  created_by: string
  created_at: string
  expires_at: string
  decision: ProposalApprovalDecision | null
}

async function collaborationToken(): Promise<string> {
  const settings = await getLocalCollaborationToken()
  if (!settings) throw new Error('ตั้งค่า Collaboration token ของทีมก่อนสร้างลิงก์อนุมัติ')
  return settings.token
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as ({ error?: string } & Record<string, unknown>) | null
  if (!response.ok) throw new Error(payload?.error ?? `Gateway ตอบกลับ HTTP ${response.status}`)
  if (!payload) throw new Error('Gateway ส่งข้อมูลตอบกลับไม่ถูกต้อง')
  return payload as T
}

function approvalEndpoint(projectId: string, proposalId: string): string {
  return `/api/collaboration/projects/${encodeURIComponent(getCanonicalProjectUuid(projectId))}/proposals/${encodeURIComponent(proposalId)}/approval-links`
}

/** Build a frozen customer output: hidden detail is rolled up and source UUIDs/GPS are excluded. */
export function createProposalApprovalSnapshot(project: ProjectDocument, proposal: ProposalDraft): ProposalApprovalSnapshot {
  if (proposal.status !== 'sent') throw new Error('ส่งสถานะข้อเสนอแล้วก่อนสร้างลิงก์อนุมัติ')
  if (proposal.valid_until && proposal.valid_until < new Date().toISOString().slice(0, 10)) throw new Error('ข้อเสนอนี้หมดอายุแล้ว · แก้วันใช้ได้ถึงในแบบร่างและสร้างข้อเสนอฉบับใหม่')
  const factorSubtotal = proposal.factor_f_subtotal_thb ?? proposal.preliminaries_thb + proposal.direct_cost_thb * proposal.factor_f
  const productMargin = proposal.product_margin_amount_thb ?? 0
  const grossMargin = proposal.gross_margin_amount_thb ?? 0
  const beforeDiscount = proposal.subtotal_before_discount_thb ?? factorSubtotal + productMargin + grossMargin
  const discountAmount = proposal.discount_amount_thb ?? beforeDiscount * ((proposal.discount_percent ?? 0) / 100)
  const taxable = proposal.taxable_amount_thb ?? beforeDiscount - discountAmount
  const vat = proposal.vat_amount_thb ?? taxable * proposal.vat_rate
  const lines = proposalOutputLines(proposal).map(line => ({
    phase: line.phase,
    cost_center: line.cost_center,
    mark: line.mark,
    description: line.description,
    formula: line.formula,
    unit: line.unit,
    quantity: line.quantity,
    unit_rate_thb: line.unit_rate_thb,
    amount_thb: line.amount_thb,
  }))
  return {
    schema_version: 1,
    project_id: getCanonicalProjectUuid(project.project.id),
    proposal_id: proposal.id,
    project_name: project.project.name,
    title: proposal.title,
    recipient_name: proposal.recipient_name,
    ...(proposal.valid_until ? { valid_until: proposal.valid_until } : {}),
    notes: proposal.notes,
    terms: proposal.terms,
    conditional_texts: (proposal.conditional_texts ?? []).filter(item => item.matched && item.rendered_text).map(item => item.rendered_text!),
    lines,
    totals: {
      direct_cost_thb: proposal.direct_cost_thb,
      preliminaries_thb: proposal.preliminaries_thb,
      factor_f: proposal.factor_f,
      factor_f_subtotal_thb: factorSubtotal,
      product_margin_amount_thb: productMargin,
      gross_margin_percent: proposal.gross_margin_percent ?? 0,
      gross_margin_amount_thb: grossMargin,
      subtotal_before_discount_thb: beforeDiscount,
      discount_percent: proposal.discount_percent ?? 0,
      discount_amount_thb: discountAmount,
      taxable_amount_thb: taxable,
      vat_rate: proposal.vat_rate,
      vat_amount_thb: vat,
      grand_total_thb: proposal.grand_total_thb,
    },
  }
}

export async function listProposalApprovalLinks(projectId: string, proposalId: string): Promise<ProposalApprovalLink[]> {
  const token = await collaborationToken()
  const response = await fetch(approvalEndpoint(projectId, proposalId), { headers: { Authorization: `Bearer ${token}` }, credentials: 'same-origin' })
  const result = await parseResponse<{ links: ProposalApprovalLink[] }>(response)
  if (!Array.isArray(result.links)) throw new Error('รายการลิงก์ตอบรับจาก gateway ไม่ถูกต้อง')
  return result.links
}

export async function createProposalApprovalLink(project: ProjectDocument, proposal: ProposalDraft) {
  const token = await collaborationToken()
  const projectId = getCanonicalProjectUuid(project.project.id)
  const response = await fetch(approvalEndpoint(projectId, proposal.id), {
    method: 'POST', credentials: 'same-origin',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshot: createProposalApprovalSnapshot(project, proposal) }),
  })
  const result = await parseResponse<{ id: string; token: string; status: 'pending'; created_at: string; expires_at: string }>(response)
  if (!/^[0-9a-f-]{36}$/i.test(result.id) || !/^[A-Za-z0-9_-]{40,60}$/.test(result.token) || result.status !== 'pending') {
    throw new Error('Gateway ส่งลิงก์อนุมัติกลับมาไม่ถูกต้อง')
  }
  return { ...result, url: `${window.location.origin}/#cf-proposal-approval=${result.token}` }
}

export async function revokeProposalApprovalLink(projectId: string, proposalId: string, linkId: string): Promise<void> {
  const token = await collaborationToken()
  const endpoint = `${approvalEndpoint(projectId, proposalId)}/${encodeURIComponent(linkId)}`
  await parseResponse(await fetch(endpoint, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, credentials: 'same-origin' }))
}

export interface PublicProposalApproval {
  status: 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired'
  expires_at: string
  snapshot_hash?: string
  snapshot?: ProposalApprovalSnapshot
  decision?: ProposalApprovalDecision | null
}

export async function getPublicProposalApproval(token: string): Promise<PublicProposalApproval> {
  return parseResponse(await fetch('/api/proposal-approval', { headers: { Authorization: `Bearer ${token}` }, credentials: 'same-origin' }))
}

export async function submitPublicProposalDecision(token: string, decision: 'accepted' | 'declined', snapshotHash: string, signature: { signer_name: string; strokes: ProposalRecipientSignature['strokes'] }, note = ''): Promise<{ status: 'accepted' | 'declined'; decided_at: string; already_submitted: boolean }> {
  return parseResponse(await fetch('/api/proposal-approval', {
    method: 'POST', credentials: 'same-origin',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, signer_name: signature.signer_name, strokes: signature.strokes, note, snapshot_hash: snapshotHash, confirmation: true }),
  }))
}
