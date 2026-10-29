import { getLocalCollaborationToken } from '../projectAutosave.js'
import { getCanonicalProjectUuid } from '../projectUuid.js'

export interface QuickBooksConnectionStatus {
  configured: boolean
  connected: boolean
  realm_id: string | null
  environment: 'sandbox' | 'production' | null
  connected_at: string | null
  scope: 'company' | 'project'
  scope_id: string
  can_manage: boolean
  can_write: boolean
  configuration_error: string
}

export interface QuickBooksServiceItem { id: string; name: string; sku: string }
export interface QuickBooksTaxCode { id: string; name: string; rate: number | null }
export interface QuickBooksExportHistory {
  document_type: 'estimate' | 'invoice'
  source_record_id: string
  status: 'pending' | 'succeeded' | 'failed' | 'uncertain'
  qbo_document_id: string | null
  qbo_document_number: string | null
  requires_review: boolean
  message: string
  updated_at: string
}
export interface QuickBooksCatalog {
  realm_id: string
  company_name: string
  currency: string
  can_export: boolean
  service_items: QuickBooksServiceItem[]
  tax_codes: QuickBooksTaxCode[]
  mapping: { service_item_id: string; service_item_name: string; tax_codes: Record<string, string> } | null
  exports: QuickBooksExportHistory[]
}
export interface QuickBooksMappingInput {
  service_item_id: string
  tax_codes: Array<{ vat_rate: number; tax_code_id: string }>
}
export interface QuickBooksExportInput {
  project_uuid: string
  document_type: 'estimate' | 'invoice'
  link_to_estimate?: boolean
  record: Record<string, unknown>
  proposal?: Record<string, unknown>
}
export interface QuickBooksExportResult {
  status: 'pending' | 'succeeded' | 'failed' | 'uncertain'
  document_type: 'estimate' | 'invoice'
  source_record_id: string
  qbo_document_id: string | null
  qbo_document_number: string | null
  total?: number
  currency?: string
  requires_review?: boolean
  already_exported?: boolean
  linked_estimate_id?: string
  message: string
}
export interface QuickBooksInvoicePayment {
  external_reference: string
  source_invoice_id: string
  invoice_number: string
  payment_id: string
  payment_reference: string
  received_at: string
  amount_thb: number
  currency: string
}
export interface QuickBooksPaymentSyncResult {
  realm_id: string
  payments: QuickBooksInvoicePayment[]
  warnings: Array<{ payment_id: string; invoice_number?: string; reason: string }>
}

async function quickbooksRequest<T>(projectId: string, method: 'GET' | 'POST' | 'DELETE' | 'PUT', suffix = '', payload?: unknown): Promise<T> {
  const localSettings = await getLocalCollaborationToken()
  if (!localSettings) throw new Error('ตั้งค่า Collaboration token ของทีมก่อนเชื่อมต่อ QuickBooks Online')
  const canonicalProjectId = getCanonicalProjectUuid(projectId)
  const response = await fetch(`/api/collaboration/projects/${encodeURIComponent(canonicalProjectId)}/integrations/quickbooks${suffix}`, {
    method,
    credentials: 'same-origin',
    redirect: 'error',
    headers: { Authorization: `Bearer ${localSettings.token}`, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  })
  const result = await response.json().catch(() => null) as (T & { error?: string }) | null
  if (!response.ok) throw new Error(result?.error ?? `Gateway ตอบกลับ HTTP ${response.status}`)
  if (!result || typeof result !== 'object') throw new Error('Gateway ส่งสถานะ QuickBooks กลับมาไม่ถูกต้อง')
  return result
}

export function getQuickBooksConnectionStatus(projectId: string): Promise<QuickBooksConnectionStatus> {
  return quickbooksRequest(projectId, 'GET')
}

export function startQuickBooksConnection(projectId: string): Promise<{ authorization_url: string }> {
  return quickbooksRequest(projectId, 'POST')
}

export function disconnectQuickBooks(projectId: string): Promise<{ disconnected: boolean }> {
  return quickbooksRequest(projectId, 'DELETE')
}

export function getQuickBooksCatalog(projectId: string): Promise<QuickBooksCatalog> {
  return quickbooksRequest(projectId, 'GET', '/catalog')
}

export function getQuickBooksInvoicePayments(projectId: string): Promise<QuickBooksPaymentSyncResult> {
  return quickbooksRequest(projectId, 'GET', '/payments')
}

export function saveQuickBooksMapping(projectId: string, mapping: QuickBooksMappingInput): Promise<{ saved: boolean }> {
  return quickbooksRequest(projectId, 'PUT', '/mapping', mapping)
}

export function exportQuickBooksDocument(projectId: string, payload: QuickBooksExportInput): Promise<QuickBooksExportResult> {
  return quickbooksRequest(projectId, 'POST', '/exports', payload)
}
