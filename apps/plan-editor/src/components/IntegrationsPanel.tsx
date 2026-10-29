import React, { useEffect, useMemo, useState } from 'react'
import { ArrowDownToLine, Check, CircleAlert, Clock3, Copy, LoaderCircle, Network, RotateCw, Send, ShieldCheck, Unplug } from 'lucide-react'
import { getInvoiceOutstandingAmount, proposalOutputLines, type ChangeOrderDraft, type InvoiceDraft, type ProjectDocument, type ProposalDraft } from '@constructflow/project-model'
import type { CommandBatchResult, CommandRequest } from '@constructflow/command-schema'
import {
  deleteLocalCustomWebhook, deleteLocalZapierWebhook, getLocalCustomWebhook, getLocalZapierWebhook, listLocalIntegrationActivity, recordLocalIntegrationActivity, saveLocalCustomWebhook, saveLocalZapierWebhook, type LocalIntegrationActivity,
} from '../projectAutosave.js'
import { createProposalWebhookPayload, postZapierCatchHook } from '../integrations/zapierWebhook.js'
import { createIntegrationEventPayload, getWebhookGatewayConfig, postCustomWebhook, type IntegrationRecord, type WebhookGatewayConfig } from '../integrations/customWebhook.js'
import { disconnectQuickBooks, exportQuickBooksDocument, getQuickBooksCatalog, getQuickBooksConnectionStatus, getQuickBooksInvoicePayments, saveQuickBooksMapping, startQuickBooksConnection, type QuickBooksCatalog, type QuickBooksConnectionStatus, type QuickBooksExportResult, type QuickBooksInvoicePayment, type QuickBooksPaymentSyncResult } from '../integrations/quickbooks.js'

type ConnectorId = LocalIntegrationActivity['connector_id']
type ExportConnectorId = Exclude<ConnectorId, 'zapier' | 'webhook'>

interface IntegrationsPanelProps {
  project: ProjectDocument
  onExportProject: () => Promise<boolean>
  onExportDxf: () => Promise<boolean>
  onExportIfc: () => Promise<boolean>
  onConfigureCollaboration: () => void
  onExecute: (commands: CommandRequest[]) => CommandBatchResult
}

const CONNECTOR_DETAILS: Record<ExportConnectorId, { title: string; format: string; description: string; artifact: (projectId: string) => string }> = {
  sketchup: {
    title: 'SketchUp Extension', format: '.cfproj',
    description: 'ย้ายโมเดลและรูปภาคสนามไปเปิดด้วย ConstructFlow Extension โดยจับคู่ Project และ Object UUID',
    artifact: () => 'ไฟล์โครงการ .cfproj',
  },
  'autocad-dxf': {
    title: 'AutoCAD', format: 'DXF · 20 layouts',
    description: 'ส่งออกชุดแบบ 20 แผ่น พร้อมข้อมูล phase และ UUID ในข้อมูลวัตถุ CAD',
    artifact: projectId => `${projectId}_20Layouts.dxf`,
  },
  'openbim-ifc': {
    title: 'Revit · OpenBIM', format: 'IFC 4.3',
    description: 'แลกเปลี่ยนโมเดล BIM พร้อม GlobalId ที่แปลงจาก UUID และ property ของเฟสงาน',
    artifact: projectId => `${projectId}.ifc`,
  },
}

const actionLabel: Record<ExportConnectorId, string> = {
  sketchup: 'เตรียมไฟล์สำหรับ SketchUp',
  'autocad-dxf': 'ส่งออก DXF',
  'openbim-ifc': 'ส่งออก IFC',
}

const roundBaht = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100

function recommendQuickBooksPaymentRefs(result: QuickBooksPaymentSyncResult, invoices: readonly InvoiceDraft[]): Set<string> {
  const invoiceById = new Map(invoices.map(invoice => [invoice.id, invoice]))
  const remainingByInvoice = new Map<string, number>()
  for (const invoice of invoices) {
    if (['issued', 'partially_paid'].includes(invoice.status)) remainingByInvoice.set(invoice.id, getInvoiceOutstandingAmount(invoice))
  }
  const selected = new Set<string>()
  const payments = [...result.payments].sort((left, right) => left.received_at.localeCompare(right.received_at) || left.payment_id.localeCompare(right.payment_id))
  for (const payment of payments) {
    const invoice = invoiceById.get(payment.source_invoice_id)
    const remaining = remainingByInvoice.get(payment.source_invoice_id)
    if (!invoice || remaining === undefined || invoice.payments.some(item => item.integration_reference === payment.external_reference)) continue
    if (!Number.isFinite(payment.amount_thb) || payment.amount_thb <= 0 || payment.amount_thb > remaining + 0.001) continue
    selected.add(payment.external_reference)
    remainingByInvoice.set(payment.source_invoice_id, roundBaht(remaining - payment.amount_thb))
  }
  return selected
}

const formatTime = (value: string) => new Date(value).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })

const createSigningSecret = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2, '0')).join('')

/** Project-scoped entry point for the native, UUID-preserving downstream file adapters. */
export const IntegrationsPanel: React.FC<IntegrationsPanelProps> = ({ project, onExportProject, onExportDxf, onExportIfc, onConfigureCollaboration, onExecute }) => {
  const [activity, setActivity] = useState<LocalIntegrationActivity[]>([])
  const [busyConnector, setBusyConnector] = useState<ConnectorId | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState('')
  const [quickbooksStatus, setQuickbooksStatus] = useState<QuickBooksConnectionStatus | null>(null)
  const [quickbooksCatalog, setQuickbooksCatalog] = useState<QuickBooksCatalog | null>(null)
  const [quickbooksCatalogLoading, setQuickbooksCatalogLoading] = useState(false)
  const [quickbooksCatalogError, setQuickbooksCatalogError] = useState('')
  const [quickbooksCatalogAttempt, setQuickbooksCatalogAttempt] = useState(0)
  const [quickbooksStatusAttempt, setQuickbooksStatusAttempt] = useState(0)
  const [quickbooksStatusLoading, setQuickbooksStatusLoading] = useState(true)
  const [quickbooksBusy, setQuickbooksBusy] = useState(false)
  const [quickbooksError, setQuickbooksError] = useState('')
  const [quickbooksPaymentSync, setQuickbooksPaymentSync] = useState<QuickBooksPaymentSyncResult | null>(null)
  const [quickbooksPaymentLoading, setQuickbooksPaymentLoading] = useState(false)
  const [quickbooksPaymentError, setQuickbooksPaymentError] = useState('')
  const [selectedQuickBooksPaymentRefs, setSelectedQuickBooksPaymentRefs] = useState<Set<string>>(() => new Set())
  const [quickbooksImportedPaymentRefs, setQuickbooksImportedPaymentRefs] = useState<Set<string>>(() => new Set())
  const [quickbooksServiceItemId, setQuickbooksServiceItemId] = useState('')
  const [quickbooksTaxCodeIds, setQuickbooksTaxCodeIds] = useState<Record<string, string>>({})
  const [quickbooksProposalId, setQuickbooksProposalId] = useState(project.proposal_drafts?.find(item => ['draft', 'sent', 'accepted'].includes(item.status))?.id ?? '')
  const [quickbooksInvoiceId, setQuickbooksInvoiceId] = useState(project.invoices?.find(item => item.status === 'issued')?.id ?? '')
  const [quickbooksLinkInvoiceToEstimate, setQuickbooksLinkInvoiceToEstimate] = useState(false)
  const [quickbooksExportResult, setQuickbooksExportResult] = useState<QuickBooksExportResult | null>(null)
  const [zapierUrl, setZapierUrl] = useState('')
  const [zapierConfigured, setZapierConfigured] = useState(false)
  const [customWebhookUrl, setCustomWebhookUrl] = useState('')
  const [customWebhookSecret, setCustomWebhookSecret] = useState('')
  const [customWebhookConfigured, setCustomWebhookConfigured] = useState(false)
  const [webhookGatewayConfig, setWebhookGatewayConfig] = useState<WebhookGatewayConfig | null>(null)
  const [webhookGatewayError, setWebhookGatewayError] = useState('')
  const [webhookRecordKey, setWebhookRecordKey] = useState('')
  const [webhookIncludeRecipient, setWebhookIncludeRecipient] = useState(false)
  const [webhookIncludeFieldData, setWebhookIncludeFieldData] = useState(false)
  const [proposalId, setProposalId] = useState(project.proposal_drafts?.[0]?.id ?? '')
  const [includeRecipient, setIncludeRecipient] = useState(false)
  const [includeFieldData, setIncludeFieldData] = useState(false)
  const selectedProposal = useMemo(() => project.proposal_drafts?.find(item => item.id === proposalId) ?? null, [project.proposal_drafts, proposalId])
  const quickbooksProposal = useMemo(() => project.proposal_drafts?.find(item => item.id === quickbooksProposalId) ?? null, [project.proposal_drafts, quickbooksProposalId])
  const quickbooksInvoice = useMemo(() => project.invoices?.find(item => item.id === quickbooksInvoiceId) ?? null, [project.invoices, quickbooksInvoiceId])
  const quickbooksInvoiceProposal = useMemo(() => project.proposal_drafts?.find(item => item.id === quickbooksInvoice?.proposal_id) ?? null, [project.proposal_drafts, quickbooksInvoice?.proposal_id])
  const quickbooksLinkedEstimate = useMemo(() => quickbooksCatalog?.exports.find(item => item.document_type === 'estimate'
    && item.source_record_id === quickbooksInvoice?.proposal_id && item.status === 'succeeded' && !!item.qbo_document_id) ?? null,
  [quickbooksCatalog?.exports, quickbooksInvoice?.proposal_id])
  const quickbooksInvoiceExport = useMemo(() => quickbooksCatalog?.exports.find(item => item.document_type === 'invoice'
    && item.source_record_id === quickbooksInvoice?.id) ?? null,
  [quickbooksCatalog?.exports, quickbooksInvoice?.id])
  const quickbooksPaymentCandidates = useMemo(() => {
    const invoiceById = new Map((project.invoices ?? []).map(invoice => [invoice.id, invoice]))
    return (quickbooksPaymentSync?.payments ?? []).flatMap(payment => {
      const invoice = invoiceById.get(payment.source_invoice_id)
      if (!invoice || !['issued', 'partially_paid'].includes(invoice.status) || getInvoiceOutstandingAmount(invoice) <= 0) return []
      if (quickbooksImportedPaymentRefs.has(payment.external_reference) || invoice.payments.some(item => item.integration_reference === payment.external_reference)) return []
      return [{ payment, invoice, outstandingThb: getInvoiceOutstandingAmount(invoice) }]
    })
  }, [project.invoices, quickbooksPaymentSync, quickbooksImportedPaymentRefs])
  const quickbooksVatRates = useMemo(() => {
    const rates = new Set<number>()
    for (const proposal of project.proposal_drafts ?? []) if (!['declined', 'void'].includes(proposal.status) && Number.isFinite(proposal.vat_rate)) rates.add(proposal.vat_rate)
    for (const invoice of project.invoices ?? []) if (invoice.status === 'issued' && invoice.payments.length === 0 && Number.isFinite(invoice.vat_rate)) rates.add(invoice.vat_rate)
    return [...rates].sort((left, right) => left - right)
  }, [project.proposal_drafts, project.invoices])
  const webhookRecords = useMemo<IntegrationRecord[]>(() => [
    ...(project.proposal_drafts ?? []).map(value => ({ kind: 'proposal' as const, value })),
    ...(project.change_orders ?? []).map(value => ({ kind: 'change_order' as const, value })),
    ...(project.invoices ?? []).map(value => ({ kind: 'invoice' as const, value })),
  ], [project.proposal_drafts, project.change_orders, project.invoices])
  const selectedWebhookRecord = webhookRecords.find(item => `${item.kind}:${item.value.id}` === webhookRecordKey) ?? null
  const customWebhookHostAllowed = (() => {
    try {
      const host = new URL(customWebhookUrl).hostname.toLowerCase().replace(/\.$/, '')
      return Boolean(webhookGatewayConfig?.allowed_hosts.includes(host))
    } catch { return false }
  })()

  useEffect(() => {
    let active = true
    void listLocalIntegrationActivity(project.project.id).then(items => { if (active) { setActivity(items); setError('') } })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => { active = false }
  }, [project.project.id])

  useEffect(() => {
    setQuickbooksProposalId(project.proposal_drafts?.find(item => ['draft', 'sent', 'accepted'].includes(item.status))?.id ?? '')
    setQuickbooksInvoiceId(project.invoices?.find(item => item.status === 'issued')?.id ?? '')
    setQuickbooksLinkInvoiceToEstimate(false)
    setQuickbooksPaymentSync(null)
    setQuickbooksPaymentError('')
    setSelectedQuickBooksPaymentRefs(new Set())
    setQuickbooksImportedPaymentRefs(new Set())
  }, [project.project.id])

  useEffect(() => {
    if (!quickbooksCatalog || !quickbooksInvoice || quickbooksInvoiceExport) return
    setQuickbooksLinkInvoiceToEstimate(Boolean(quickbooksLinkedEstimate))
  }, [quickbooksCatalog?.realm_id, quickbooksCatalog?.exports.length, quickbooksInvoice?.id, quickbooksInvoiceExport?.status, quickbooksLinkedEstimate?.qbo_document_id])

  useEffect(() => {
    let active = true
    setQuickbooksCatalog(null)
    setQuickbooksCatalogError('')
    if (!quickbooksStatus?.connected || !quickbooksStatus.can_write) {
      setQuickbooksCatalogLoading(false)
      return () => { active = false }
    }
    setQuickbooksCatalogLoading(true)
    void getQuickBooksCatalog(project.project.id).then(catalog => {
      if (!active) return
      setQuickbooksCatalog(catalog)
      setQuickbooksServiceItemId(catalog.mapping?.service_item_id ?? '')
      setQuickbooksTaxCodeIds(catalog.mapping?.tax_codes ?? {})
      setQuickbooksError('')
    }).catch(reason => {
      if (active) setQuickbooksCatalogError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => { if (active) setQuickbooksCatalogLoading(false) })
    return () => { active = false }
  }, [project.project.id, quickbooksStatus?.connected, quickbooksStatus?.can_write, quickbooksStatus?.connected_at, quickbooksCatalogAttempt])

  useEffect(() => {
    let active = true
    setQuickbooksStatus(null)
    setQuickbooksError('')
    setQuickbooksStatusLoading(true)
    void getQuickBooksConnectionStatus(project.project.id).then(status => {
      if (active) { setQuickbooksStatus(status); setQuickbooksError('') }
    }).catch(reason => {
      if (active) { setQuickbooksStatus(null); setQuickbooksError(reason instanceof Error ? reason.message : String(reason)) }
    }).finally(() => { if (active) setQuickbooksStatusLoading(false) })
    return () => { active = false }
  }, [project.project.id, quickbooksStatusAttempt])

  useEffect(() => {
    let active = true
    void getLocalZapierWebhook().then(settings => {
      if (active && settings) { setZapierUrl(settings.url); setZapierConfigured(true) }
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    void getLocalCustomWebhook().then(settings => {
      if (active && settings) {
        setCustomWebhookUrl(settings.url)
        setCustomWebhookSecret(settings.signing_secret)
        setCustomWebhookConfigured(true)
      }
    }).catch(reason => { if (active) setWebhookGatewayError(reason instanceof Error ? reason.message : String(reason)) })
    void getWebhookGatewayConfig(project.project.id).then(config => {
      if (active) { setWebhookGatewayConfig(config); setWebhookGatewayError('') }
    }).catch(reason => {
      if (active) { setWebhookGatewayConfig(null); setWebhookGatewayError(reason instanceof Error ? reason.message : String(reason)) }
    })
    return () => { active = false }
  }, [project.project.id])

  useEffect(() => {
    setProposalId(project.proposal_drafts?.[0]?.id ?? '')
  }, [project.project.id])

  useEffect(() => {
    if (!selectedProposal && project.proposal_drafts?.[0]) setProposalId(project.proposal_drafts[0].id)
  }, [selectedProposal, project.proposal_drafts])

  useEffect(() => {
    if (!webhookRecords.some(item => `${item.kind}:${item.value.id}` === webhookRecordKey)) {
      const first = webhookRecords[0]
      setWebhookRecordKey(first ? `${first.kind}:${first.value.id}` : '')
    }
  }, [webhookRecords, webhookRecordKey])

  const runExport = async (connectorId: ExportConnectorId) => {
    if (busyConnector) return
    setBusyConnector(connectorId); setStatusMessage(''); setError('')
    const callbacks: Record<ExportConnectorId, () => Promise<boolean>> = {
      sketchup: onExportProject,
      'autocad-dxf': onExportDxf,
      'openbim-ifc': onExportIfc,
    }
    const details = CONNECTOR_DETAILS[connectorId]
    let succeeded = false
    let failureMessage = ''
    try {
      succeeded = await callbacks[connectorId]()
      if (!succeeded) failureMessage = 'สร้างไฟล์ไม่สำเร็จ · ดูรายละเอียดที่แถบสถานะ แล้วลองส่งออกอีกครั้ง'
    } catch (reason) {
      failureMessage = reason instanceof Error ? reason.message : String(reason)
    }
    const message = succeeded
      ? 'สร้างและส่งไฟล์ให้เบราว์เซอร์ดาวน์โหลดแล้ว · ปลายทางยังไม่ได้ยืนยันการนำเข้า'
      : `ส่งออกไม่สำเร็จ: ${failureMessage}`
    try {
      const saved = await recordLocalIntegrationActivity({
        project_id: project.project.id,
        connector_id: connectorId,
        status: succeeded ? 'succeeded' : 'failed',
        artifact_name: details.artifact(project.project.id),
        message,
      })
      setActivity(current => [saved, ...current].slice(0, 50))
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason)
      setError(succeeded
        ? `ไฟล์สร้างแล้ว แต่บันทึกประวัติบนอุปกรณ์ไม่สำเร็จ: ${detail}`
        : `${failureMessage} · และบันทึกประวัติไม่สำเร็จ: ${detail}`)
    }
    if (succeeded) setStatusMessage(`${details.format}: เตรียมไฟล์แล้ว`)
    else setError(current => current || `${details.format}: ${failureMessage}`)
    setBusyConnector(null)
  }

  const connectQuickBooks = async () => {
    const popup = window.open('about:blank', 'constructflow-quickbooks-oauth', 'popup,width=640,height=760')
    if (!popup) {
      setQuickbooksError('เบราว์เซอร์บล็อกหน้าต่างเชื่อมต่อ · อนุญาต popup สำหรับ ConstructFlow แล้วลองอีกครั้ง')
      return
    }
    const previousConnectedAt = quickbooksStatus?.connected_at ?? null
    setQuickbooksBusy(true); setQuickbooksError(''); setStatusMessage('')
    try {
      const result = await startQuickBooksConnection(project.project.id)
      const authorizationUrl = new URL(result.authorization_url)
      if (authorizationUrl.origin !== 'https://appcenter.intuit.com') throw new Error('Gateway ส่ง URL เชื่อมต่อ QuickBooks ที่ไม่ถูกต้อง')
      popup.location.replace(authorizationUrl.toString())
      const startedAt = Date.now()
      let connected = false
      while (Date.now() - startedAt < 240_000) {
        await new Promise(resolve => window.setTimeout(resolve, 2_000))
        const latest = await getQuickBooksConnectionStatus(project.project.id)
        setQuickbooksStatus(latest)
        if (latest.connected && (!previousConnectedAt || latest.connected_at !== previousConnectedAt)) { connected = true; break }
        if (popup.closed) break
      }
      if (connected) setStatusMessage('เชื่อมบัญชี QuickBooks Online แล้ว')
      else if (popup.closed) setQuickbooksError('หน้าต่าง QuickBooks ปิดก่อนการเชื่อมต่อเสร็จ · ตรวจสอบสถานะแล้วลองใหม่ได้')
      else setQuickbooksError('ใช้เวลายืนยันนานเกินไป · กลับมาเช็คสถานะการเชื่อมต่อได้ภายหลัง')
    } catch (reason) {
      popup.close()
      setQuickbooksError(reason instanceof Error ? reason.message : String(reason))
    } finally { setQuickbooksBusy(false) }
  }

  const removeQuickBooksConnection = async () => {
    if (!window.confirm('ยกเลิกการเชื่อมต่อ QuickBooks Online สำหรับขอบเขตนี้หรือไม่?')) return
    setQuickbooksBusy(true); setQuickbooksError(''); setStatusMessage('')
    try {
      await disconnectQuickBooks(project.project.id)
      const latest = await getQuickBooksConnectionStatus(project.project.id)
      setQuickbooksStatus(latest)
      setStatusMessage('ยกเลิกการเชื่อมต่อ QuickBooks Online แล้ว')
    } catch (reason) { setQuickbooksError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setQuickbooksBusy(false) }
  }

  const saveQuickBooksAccountMapping = async () => {
    if (!quickbooksServiceItemId || quickbooksVatRates.length === 0) {
      setQuickbooksError('เลือก Service item และตรวจว่ามีอัตรา VAT ในเอกสารก่อนบันทึก')
      return
    }
    const missingRate = quickbooksVatRates.find(rate => !quickbooksTaxCodeIds[String(rate)])
    if (missingRate !== undefined) {
      setQuickbooksError(`เลือก Tax Code สำหรับ VAT ${(missingRate * 100).toLocaleString('th-TH')}% ให้ครบก่อนบันทึก`)
      return
    }
    setQuickbooksBusy(true); setQuickbooksError(''); setQuickbooksExportResult(null)
    try {
      await saveQuickBooksMapping(project.project.id, {
        service_item_id: quickbooksServiceItemId,
        tax_codes: quickbooksVatRates.map(vat_rate => ({ vat_rate, tax_code_id: quickbooksTaxCodeIds[String(vat_rate)] })),
      })
      const catalog = await getQuickBooksCatalog(project.project.id)
      setQuickbooksCatalog(catalog)
      setStatusMessage('บันทึกการจับคู่บัญชี QuickBooks แล้ว')
    } catch (reason) { setQuickbooksError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setQuickbooksBusy(false) }
  }

  const exportQuickBooksRecord = async (documentType: 'estimate' | 'invoice') => {
    const record = documentType === 'estimate' ? quickbooksProposal : quickbooksInvoice
    const acceptedProposal = documentType === 'invoice' ? quickbooksInvoiceProposal : undefined
    if (!record) {
      setQuickbooksError(documentType === 'estimate' ? 'เลือกข้อเสนอที่จะส่งเป็น Estimate' : 'เลือกใบแจ้งหนี้ที่จะส่ง')
      return
    }
    setQuickbooksBusy(true); setQuickbooksError(''); setQuickbooksExportResult(null); setStatusMessage('')
    try {
      const estimateSnapshot = documentType === 'estimate' && quickbooksProposal ? {
        id: quickbooksProposal.id, title: quickbooksProposal.title, status: quickbooksProposal.status,
        recipient_name: quickbooksProposal.recipient_name, recipient_email: quickbooksProposal.recipient_email,
        notes: quickbooksProposal.notes, terms: quickbooksProposal.terms, valid_until: quickbooksProposal.valid_until,
        lines: proposalOutputLines(quickbooksProposal).map(line => ({
          id: line.id, mark: line.mark, description: line.description, formula: line.formula, unit: line.unit,
          quantity: line.quantity, amount_thb: line.amount_thb, product_margin_amount_thb: line.product_margin_amount_thb,
          phase: line.phase, cost_center: line.cost_center, source_object_ids: line.source_object_ids.slice(0, 12),
          source_object_ids_count: line.source_object_ids.length,
        })),
        preliminaries_thb: quickbooksProposal.preliminaries_thb, direct_cost_thb: quickbooksProposal.direct_cost_thb,
        factor_f: quickbooksProposal.factor_f, vat_rate: quickbooksProposal.vat_rate,
        gross_margin_percent: quickbooksProposal.gross_margin_percent, factor_f_subtotal_thb: quickbooksProposal.factor_f_subtotal_thb,
        product_margin_amount_thb: quickbooksProposal.product_margin_amount_thb, gross_margin_amount_thb: quickbooksProposal.gross_margin_amount_thb,
        subtotal_before_discount_thb: quickbooksProposal.subtotal_before_discount_thb, discount_percent: quickbooksProposal.discount_percent,
        discount_amount_thb: quickbooksProposal.discount_amount_thb, taxable_amount_thb: quickbooksProposal.taxable_amount_thb,
        vat_amount_thb: quickbooksProposal.vat_amount_thb, grand_total_thb: quickbooksProposal.grand_total_thb,
      } : undefined
      const invoiceSnapshot = documentType === 'invoice' && quickbooksInvoice ? {
        id: quickbooksInvoice.id, proposal_id: quickbooksInvoice.proposal_id, number: quickbooksInvoice.number,
        title: quickbooksInvoice.title, status: quickbooksInvoice.status, due_date: quickbooksInvoice.due_date,
        recipient_name: quickbooksInvoice.recipient_name, contract_total_thb: quickbooksInvoice.contract_total_thb,
        billing_percent: quickbooksInvoice.billing_percent, vat_rate: quickbooksInvoice.vat_rate,
        taxable_amount_thb: quickbooksInvoice.taxable_amount_thb, vat_amount_thb: quickbooksInvoice.vat_amount_thb,
        amount_due_thb: quickbooksInvoice.amount_due_thb, payments: [],
      } : undefined
      const acceptedProposalSnapshot = acceptedProposal ? {
        id: acceptedProposal.id, status: acceptedProposal.status, recipient_email: acceptedProposal.recipient_email,
        vat_rate: acceptedProposal.vat_rate,
      } : undefined
      const result = await exportQuickBooksDocument(project.project.id, {
        project_uuid: project.project.id,
        document_type: documentType,
        ...(documentType === 'invoice' ? { link_to_estimate: quickbooksLinkInvoiceToEstimate } : {}),
        record: (estimateSnapshot ?? invoiceSnapshot ?? {}) as Record<string, unknown>,
        ...(acceptedProposalSnapshot ? { proposal: acceptedProposalSnapshot } : {}),
      })
      setQuickbooksExportResult(result)
      setStatusMessage(result.message)
      setQuickbooksCatalog(await getQuickBooksCatalog(project.project.id))
    } catch (reason) {
      setQuickbooksError(reason instanceof Error ? reason.message : String(reason))
      void getQuickBooksCatalog(project.project.id).then(setQuickbooksCatalog).catch(() => {})
    } finally { setQuickbooksBusy(false) }
  }

  const syncQuickBooksPayments = async () => {
    setQuickbooksPaymentLoading(true)
    setQuickbooksPaymentError('')
    setQuickbooksPaymentSync(null)
    setQuickbooksImportedPaymentRefs(new Set())
    setSelectedQuickBooksPaymentRefs(new Set())
    try {
      const result = await getQuickBooksInvoicePayments(project.project.id)
      setQuickbooksPaymentSync(result)
      setSelectedQuickBooksPaymentRefs(recommendQuickBooksPaymentRefs(result, project.invoices ?? []))
    } catch (reason) {
      setQuickbooksPaymentError(reason instanceof Error ? reason.message : String(reason))
    } finally { setQuickbooksPaymentLoading(false) }
  }

  const toggleQuickBooksPayment = (candidate: { payment: QuickBooksInvoicePayment; invoice: InvoiceDraft; outstandingThb: number }) => {
    const next = new Set(selectedQuickBooksPaymentRefs)
    if (next.has(candidate.payment.external_reference)) {
      next.delete(candidate.payment.external_reference)
      setSelectedQuickBooksPaymentRefs(next)
      setQuickbooksPaymentError('')
      return
    }
    if (next.size >= 500) {
      setQuickbooksPaymentError('นำเข้าได้ไม่เกิน 500 รายการต่อหนึ่ง Undo transaction · ยกเลิกบางรายการก่อน')
      return
    }
    const selectedForInvoice = quickbooksPaymentCandidates
      .filter(item => item.invoice.id === candidate.invoice.id && next.has(item.payment.external_reference))
      .reduce((total, item) => total + item.payment.amount_thb, 0)
    if (selectedForInvoice + candidate.payment.amount_thb > candidate.outstandingThb + 0.001) {
      setQuickbooksPaymentError(`ยอดที่เลือกเกินยอดคงเหลือของใบแจ้งหนี้ ${candidate.invoice.number}`)
      return
    }
    next.add(candidate.payment.external_reference)
    setSelectedQuickBooksPaymentRefs(next)
    setQuickbooksPaymentError('')
  }

  const importSelectedQuickBooksPayments = () => {
    const selected = quickbooksPaymentCandidates
      .filter(item => selectedQuickBooksPaymentRefs.has(item.payment.external_reference))
      .sort((left, right) => left.payment.received_at.localeCompare(right.payment.received_at) || left.payment.payment_id.localeCompare(right.payment.payment_id))
    if (!selected.length) {
      setQuickbooksPaymentError('เลือกรายการรับชำระที่ต้องการนำเข้าก่อน')
      return
    }
    if (selected.length > 500) {
      setQuickbooksPaymentError('นำเข้าได้ไม่เกิน 500 รายการต่อหนึ่ง Undo transaction · ยกเลิกบางรายการก่อน')
      return
    }
    const invoiceById = new Map((project.invoices ?? []).map(invoice => [invoice.id, invoice]))
    const remainingByInvoice = new Map<string, number>()
    for (const item of selected) {
      const invoice = invoiceById.get(item.invoice.id)
      if (!invoice || !['issued', 'partially_paid'].includes(invoice.status)) {
        setQuickbooksPaymentError(`ใบแจ้งหนี้ ${item.invoice.number} เปลี่ยนสถานะแล้ว · อ่านรายการใหม่ก่อนนำเข้า`)
        return
      }
      const outstanding = remainingByInvoice.get(invoice.id) ?? getInvoiceOutstandingAmount(invoice)
      if (item.payment.amount_thb > outstanding + 0.001) {
        setQuickbooksPaymentError(`ยอดที่เลือกเกินยอดคงเหลือของใบแจ้งหนี้ ${invoice.number} · อ่านรายการใหม่หรือลดยอดที่เลือก`)
        return
      }
      remainingByInvoice.set(invoice.id, roundBaht(outstanding - item.payment.amount_thb))
    }
    const commands: CommandRequest[] = selected.map(({ payment, invoice }) => ({
      name: 'RecordInvoicePayment',
      input: {
        invoice_id: invoice.id,
        amount_thb: payment.amount_thb,
        method: 'other',
        reference: (payment.payment_reference || `QuickBooks Payment #${payment.payment_id}`).slice(0, 160),
        integration_reference: payment.external_reference,
        received_at: payment.received_at,
        note: `นำเข้าจาก QuickBooks Online · วันที่รับชำระ ${payment.received_at}`,
      },
    }))
    try {
      const result = onExecute(commands)
      if (result.status !== 'success') {
        setQuickbooksPaymentError(result.errors?.join(' · ') || 'CommandBus ปฏิเสธการบันทึกรับชำระ · ตรวจสอบยอดคงเหลือแล้วลองใหม่')
        return
      }
      const importedRefs = selected.map(item => item.payment.external_reference)
      setQuickbooksImportedPaymentRefs(current => new Set([...current, ...importedRefs]))
      setSelectedQuickBooksPaymentRefs(new Set())
      setQuickbooksPaymentError('')
      setStatusMessage(`บันทึกรายการรับชำระจาก QuickBooks ${selected.length} รายการแล้ว · ไม่ได้มีการเคลื่อนย้ายเงิน`)
    } catch (reason) {
      setQuickbooksPaymentError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const saveZapierConnection = async () => {
    setError(''); setStatusMessage('')
    try {
      const saved = await saveLocalZapierWebhook(zapierUrl)
      setZapierUrl(saved.url); setZapierConfigured(true)
      setStatusMessage('บันทึก Zapier Catch Hook URL บนอุปกรณ์นี้แล้ว')
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }

  const disconnectZapier = async () => {
    if (!window.confirm('ยกเลิกการเชื่อมต่อ Zapier และลบประวัติ payload จากอุปกรณ์นี้หรือไม่?')) return
    try {
      await deleteLocalZapierWebhook()
      setZapierUrl(''); setZapierConfigured(false)
      setActivity(current => current.filter(item => item.connector_id !== 'zapier'))
      setStatusMessage('ลบ webhook URL และประวัติส่งข้อมูลจากอุปกรณ์นี้แล้ว')
      setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }

  const saveCustomWebhookConnection = async () => {
    setError(''); setStatusMessage('')
    try {
      if (!webhookGatewayConfig?.allowed_hosts.length) throw new Error('Gateway ยังไม่มี host ที่อนุญาต · ผู้ดูแลเซิร์ฟเวอร์ตั้ง CONSTRUCTFLOW_WEBHOOK_ALLOWED_HOSTS ก่อน')
      const host = new URL(customWebhookUrl).hostname.toLowerCase().replace(/\.$/, '')
      if (!webhookGatewayConfig.allowed_hosts.includes(host))
        throw new Error(`Gateway อนุญาตเฉพาะ: ${webhookGatewayConfig.allowed_hosts.join(', ')}`)
      const saved = await saveLocalCustomWebhook(customWebhookUrl, customWebhookSecret)
      setCustomWebhookUrl(saved.url); setCustomWebhookSecret(saved.signing_secret); setCustomWebhookConfigured(true)
      setStatusMessage('บันทึกปลายทางและ signing secret ในอุปกรณ์นี้แล้ว')
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }

  const disconnectCustomWebhook = async () => {
    if (!window.confirm('ยกเลิก custom webhook และลบ signing secret กับประวัติ payload จากอุปกรณ์นี้หรือไม่?')) return
    try {
      await deleteLocalCustomWebhook()
      setCustomWebhookUrl(''); setCustomWebhookSecret(''); setCustomWebhookConfigured(false)
      setActivity(current => current.filter(item => item.connector_id !== 'webhook'))
      setStatusMessage('ลบ custom webhook, signing secret และประวัติ payload จากอุปกรณ์นี้แล้ว')
      setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }

  const deliverCustomWebhookEvent = async (input: {
    eventId: string
    payloadJson: string
    targetUrl: string
    signingSecret: string
    artifactName: string
  }) => {
    if (busyConnector) return
    setBusyConnector('webhook'); setStatusMessage(''); setError('')
    const common = {
      id: input.eventId,
      event_id: input.eventId,
      project_id: project.project.id,
      connector_id: 'webhook' as const,
      artifact_name: input.artifactName,
      payload_json: input.payloadJson,
      target_url: input.targetUrl,
    }
    try {
      const pending = await recordLocalIntegrationActivity({ ...common, status: 'pending', message: 'กำลังส่ง signed snapshot ผ่าน project gateway' })
      setActivity(current => [pending, ...current.filter(item => item.id !== pending.id)].slice(0, 50))
      const payload = JSON.parse(input.payloadJson) as Record<string, unknown>
      const acknowledgement = await postCustomWebhook(project.project.id, input.targetUrl, input.signingSecret, input.eventId, payload)
      const alreadyDelivered = acknowledgement.status === 'already_succeeded'
      const succeeded = await recordLocalIntegrationActivity({
        ...common,
        status: 'succeeded',
        message: alreadyDelivered
          ? `Gateway ยืนยันว่า event นี้ส่งสำเร็จแล้วก่อนหน้านี้ · HTTP ${acknowledgement.response_status} · ไม่ส่งซ้ำ`
          : `ปลายทางตอบรับ HTTP ${acknowledgement.response_status} · ${acknowledgement.attempt === 1 ? 'ครั้งแรก' : `ครั้งที่ ${acknowledgement.attempt}`}`,
      })
      setActivity(current => [succeeded, ...current.filter(item => item.id !== succeeded.id)].slice(0, 50))
      setStatusMessage(alreadyDelivered
        ? 'ปลายทางยืนยัน event นี้ว่าเคยรับแล้ว · ระบบไม่ได้ส่งซ้ำ'
        : `ปลายทางตอบรับ ${payload.event_type} (HTTP ${acknowledgement.response_status})`)
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason)
      const outcomeUncertain = /outcome is uncertain|still pending/i.test(detail)
      try {
        const failed = await recordLocalIntegrationActivity({
          ...common,
          status: 'failed',
          message: outcomeUncertain ? `ผลการส่งไม่แน่ชัด: ${detail}` : `ส่งคำขอไม่สำเร็จ: ${detail}`,
        })
        setActivity(current => [failed, ...current.filter(item => item.id !== failed.id)].slice(0, 50))
      } catch (storageReason) {
        const storageDetail = storageReason instanceof Error ? storageReason.message : String(storageReason)
        setError(`${detail} · และบันทึกประวัติบนอุปกรณ์ไม่สำเร็จ: ${storageDetail}`)
      }
      setError(current => current || detail)
    } finally { setBusyConnector(null) }
  }

  const sendCustomWebhookRecord = (record: IntegrationRecord) => {
    if (!customWebhookConfigured || !customWebhookUrl || !customWebhookSecret) { setError('บันทึก URL และ signing secret ก่อนส่ง'); return }
    const unresolved = activity.some(item => {
      if (item.connector_id !== 'webhook' || item.status !== 'failed' || !item.message.includes('ผลการส่งไม่แน่ชัด') || !item.payload_json) return false
      try { return (JSON.parse(item.payload_json) as { data?: { record_uuid?: string } }).data?.record_uuid === record.value.id }
      catch { return false }
    })
    if (unresolved && !window.confirm('รายการนี้มี event ก่อนหน้าที่ผลการส่งไม่แน่ชัด กรุณาตรวจระบบปลายทางก่อน การสร้าง event ใหม่อาจทำให้เกิดรายการซ้ำ ต้องการส่งต่อหรือไม่?')) return
    const eventId = crypto.randomUUID()
    const payload = createIntegrationEventPayload(project, record, {
      eventId,
      includeRecipient: webhookIncludeRecipient,
      includeFieldData: record.kind === 'proposal' && webhookIncludeFieldData,
    })
    void deliverCustomWebhookEvent({
      eventId,
      payloadJson: JSON.stringify(payload),
      targetUrl: customWebhookUrl,
      signingSecret: customWebhookSecret,
      artifactName: record.value.title || record.value.id,
    })
  }

  const retryCustomWebhook = (item: LocalIntegrationActivity) => {
    if (item.connector_id !== 'webhook' || !item.event_id || !item.payload_json || !item.target_url || !customWebhookSecret || item.target_url !== customWebhookUrl) return
    if (!window.confirm('ลองส่ง event เดิมด้วย event_id เดิมหรือไม่? Gateway จะไม่ส่งซ้ำหากปลายทางตอบรับแล้ว หรือผลครั้งก่อนยังไม่แน่ชัด')) return
    void deliverCustomWebhookEvent({
      eventId: item.event_id,
      payloadJson: item.payload_json,
      targetUrl: item.target_url,
      signingSecret: customWebhookSecret,
      artifactName: item.artifact_name,
    })
  }

  const deliverZapierEvent = async (input: {
    eventId: string
    payloadJson: string
    targetUrl: string
    artifactName: string
  }) => {
    if (busyConnector) return
    setBusyConnector('zapier'); setStatusMessage(''); setError('')
    const common = {
      id: input.eventId,
      event_id: input.eventId,
      project_id: project.project.id,
      connector_id: 'zapier' as const,
      artifact_name: input.artifactName,
      payload_json: input.payloadJson,
      target_url: input.targetUrl,
    }
    try {
      const pending = await recordLocalIntegrationActivity({ ...common, status: 'pending', message: 'กำลังส่ง snapshot ผ่าน gateway ของทีมไปยัง Zapier' })
      setActivity(current => [pending, ...current.filter(item => item.id !== pending.id)].slice(0, 50))
      const payload = JSON.parse(input.payloadJson) as Record<string, string>
      const acknowledgement = await postZapierCatchHook(project.project.id, input.targetUrl, payload)
      const alreadyDelivered = acknowledgement.status === 'already_succeeded'
      const succeeded = await recordLocalIntegrationActivity({
        ...common,
        status: 'succeeded',
        message: alreadyDelivered
          ? `Gateway ยืนยันว่า event นี้ส่งสำเร็จแล้วก่อนหน้านี้ · Zapier HTTP ${acknowledgement.response_status} · ไม่ส่งซ้ำ`
          : `Zapier ตอบรับ HTTP ${acknowledgement.response_status} · ครั้งที่ ${acknowledgement.attempt} · ตรวจ Zap History เพื่อดูขั้นตอนถัดไป`,
      })
      setActivity(current => [succeeded, ...current.filter(item => item.id !== succeeded.id)].slice(0, 50))
      setStatusMessage(alreadyDelivered
        ? 'Zapier ยืนยัน event นี้ว่าเคยรับแล้ว · ระบบไม่ได้ส่งซ้ำ'
        : `Zapier ตอบรับ proposal แล้ว (HTTP ${acknowledgement.response_status}) · ตรวจ Zap History สำหรับผลขั้นตอนถัดไป`)
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason)
      const outcomeUncertain = /outcome is uncertain/i.test(detail)
      try {
        const failed = await recordLocalIntegrationActivity({
          ...common,
          status: 'failed',
          message: outcomeUncertain
            ? `ผลการส่งไม่แน่ชัด: ${detail}`
            : `ส่งคำขอไม่สำเร็จ: ${detail}`,
        })
        setActivity(current => [failed, ...current.filter(item => item.id !== failed.id)].slice(0, 50))
      } catch (storageReason) {
        const storageDetail = storageReason instanceof Error ? storageReason.message : String(storageReason)
        setError(`${detail} · และบันทึกประวัติบนอุปกรณ์ไม่สำเร็จ: ${storageDetail}`)
      }
      setError(current => current || detail)
    } finally { setBusyConnector(null) }
  }

  const sendProposal = (proposal: ProposalDraft) => {
    if (!zapierConfigured || !zapierUrl) { setError('บันทึก Zapier Catch Hook URL ก่อนส่ง proposal'); return }
    const unresolvedDelivery = activity.some(item => {
      if (item.connector_id !== 'zapier' || item.status !== 'failed' || !item.message.includes('ผลการส่งไม่แน่ชัด') || !item.payload_json) return false
      try { return (JSON.parse(item.payload_json) as Record<string, unknown>).proposal_uuid === proposal.id }
      catch { return false }
    })
    if (unresolvedDelivery && !window.confirm('ข้อเสนอนี้มี event ก่อนหน้าที่ผลการส่งไม่แน่ชัด กรุณาตรวจ Zapier Task History ก่อน การสร้าง event ใหม่อาจส่งซ้ำ ต้องการสร้าง event ใหม่ต่อหรือไม่?')) return
    const eventId = crypto.randomUUID()
    const payload = createProposalWebhookPayload(project, proposal, { eventId, includeRecipient, includeFieldData })
    const payloadJson = JSON.stringify(payload)
    void deliverZapierEvent({ eventId, payloadJson, targetUrl: zapierUrl, artifactName: proposal.title || proposal.id })
  }

  const retryZapier = (item: LocalIntegrationActivity) => {
    if (item.connector_id !== 'zapier' || !item.event_id || !item.payload_json || !item.target_url) return
    if (!window.confirm('ลองส่ง event เดิมอีกครั้งด้วย event_id เดิมหรือไม่? Gateway จะไม่ส่งซ้ำหาก Zapier ตอบรับไปแล้ว หรือผลครั้งก่อนยังไม่แน่ชัด')) return
    void deliverZapierEvent({ eventId: item.event_id, payloadJson: item.payload_json, targetUrl: item.target_url, artifactName: item.artifact_name })
  }

  const copyProjectId = async () => {
    try {
      await navigator.clipboard.writeText(project.project.id)
      setStatusMessage('คัดลอก Project UUID แล้ว')
      setError('')
    } catch {
      setError('คัดลอกไม่ได้ · เลือก UUID แล้วคัดลอกด้วยตนเอง')
    }
  }

  const retry = (item: LocalIntegrationActivity) => {
    if (item.connector_id === 'webhook') retryCustomWebhook(item)
    else if (item.connector_id !== 'zapier') void runExport(item.connector_id)
  }

  return <section className="cf-integration-panel" aria-label="การเชื่อมต่อและส่งออก">
    <header className="cf-integration-project">
      <div className="cf-integration-title"><Network size={17} /><h2>เชื่อมต่อ CAD / BIM</h2></div>
      <p>ส่งโมเดลจาก ConstructFlow ไปยังเครื่องมือปลายทาง โดยใช้ UUID ของโครงการและวัตถุเดิม</p>
      <div className="cf-integration-project-id"><span>Project UUID</span><code>{project.project.id}</code><button type="button" onClick={() => void copyProjectId()} aria-label="คัดลอก Project UUID" title="คัดลอก Project UUID"><Copy size={15} /></button></div>
      <div className="cf-integration-model-meta">{Object.keys(project.objects).length.toLocaleString('th-TH')} วัตถุ · {project.levels.length} ชั้น · {project.project.display_unit ?? 'm'}</div>
    </header>

    <div className="cf-integration-connectors" aria-label="ตัวเชื่อมต่อที่พร้อมใช้">
      {(Object.keys(CONNECTOR_DETAILS) as ExportConnectorId[]).map(id => {
        const connector = CONNECTOR_DETAILS[id]
        const latest = activity.find(item => item.connector_id === id)
        const running = busyConnector === id
        const onClick = () => void runExport(id)
        return <article className="cf-integration-row" key={id}>
          <div className="cf-integration-row-copy">
            <div className="cf-integration-row-heading"><strong>{connector.title}</strong><span>{connector.format}</span></div>
            <p>{connector.description}</p>
            {latest && <div className={`cf-integration-last ${latest.status === 'succeeded' ? 'is-success' : 'is-error'}`}>
              {latest.status === 'succeeded' ? <Check size={14} /> : <CircleAlert size={14} />}
              <span>{latest.status === 'succeeded' ? 'ส่งออกล่าสุด' : 'ส่งออกไม่สำเร็จ'} · {formatTime(latest.created_at)}</span>
            </div>}
          </div>
          <button type="button" className="cf-integration-action" onClick={onClick} disabled={Boolean(busyConnector)}>
            {running ? <LoaderCircle className="cf-integration-spin" size={16} /> : latest?.status === 'failed' ? <RotateCw size={16} /> : <ArrowDownToLine size={16} />}
            <span>{running ? 'กำลังเตรียม…' : latest?.status === 'failed' ? 'ลองอีกครั้ง' : actionLabel[id]}</span>
          </button>
        </article>
      })}
    </div>

    <section className="cf-zapier-webhook" aria-label="เชื่อมต่อ QuickBooks Online">
      <header><div><strong><Network size={15} /> QuickBooks Online</strong><small>ส่งข้อเสนอและใบแจ้งหนี้จากข้อมูลราคา snapshot ที่บันทึกไว้</small></div>
        {quickbooksStatus?.connected && <span className="cf-zapier-connected"><ShieldCheck size={13} /> เชื่อมต่อแล้ว</span>}
      </header>
      {quickbooksStatus?.connected && <div className="cf-zapier-proposal-summary">
        <strong>{quickbooksStatus.environment === 'sandbox' ? 'QuickBooks Sandbox' : 'QuickBooks Online'} · Realm {quickbooksStatus.realm_id}</strong>
        <span>{quickbooksStatus.scope === 'company' ? 'ใช้ร่วมกันในบริษัท' : 'เชื่อมเฉพาะโปรเจกต์นี้'} · เชื่อมเมื่อ {quickbooksStatus.connected_at ? formatTime(quickbooksStatus.connected_at) : 'ไม่ทราบเวลา'}</span>
      </div>}
      <small className="cf-zapier-local-note">Gateway เข้ารหัส token และต่ออายุให้อัตโนมัติ · ผู้ใช้ในบริษัทหรือโปรเจกต์เห็นสถานะได้ · Owner เชื่อมบัญชี ส่วน Owner/Editor ตั้ง mapping และส่งเอกสารได้</small>
      {quickbooksStatus && !quickbooksStatus.configured && <p className="cf-zapier-boundary">{quickbooksStatus.configuration_error || 'ตั้งค่า OAuth Client และ token encryption key บน gateway ก่อน'}</p>}
      {quickbooksStatus?.configured && quickbooksStatus.connected && !quickbooksStatus.can_manage && <p className="cf-zapier-boundary">มีเฉพาะ Company Owner หรือ Project Owner ที่ยกเลิกการเชื่อมต่อนี้ได้</p>}
      <div className="cf-zapier-config-actions">
        {quickbooksStatus?.can_manage && <button type="button" className="cf-integration-action" onClick={() => void connectQuickBooks()} disabled={!quickbooksStatus.configured || quickbooksBusy}>
          {quickbooksBusy ? <LoaderCircle className="cf-integration-spin" size={16} /> : <Network size={15} />}
          {quickbooksBusy ? 'กำลังเชื่อมต่อ…' : quickbooksStatus.connected ? 'เชื่อมบัญชีอื่น / ต่ออายุ' : 'เชื่อมต่อ QuickBooks'}
        </button>}
        {quickbooksStatus?.connected && quickbooksStatus.can_manage && <button type="button" className="cf-zapier-disconnect" onClick={() => void removeQuickBooksConnection()} disabled={quickbooksBusy}><Unplug size={14} /> ยกเลิกการเชื่อมต่อ</button>}
      </div>
      {quickbooksStatusLoading && <p className="cf-qbo-loading"><LoaderCircle className="cf-integration-spin" size={15} /> กำลังตรวจสถานะ QuickBooks…</p>}
      {!quickbooksStatusLoading && !quickbooksStatus && <div className="cf-qbo-recovery">
        <p>ตั้งค่า Collaboration token ที่ ประวัติเวอร์ชัน → ซิงค์ประวัติกับทีม แล้วกลับมาตรวจสถานะอีกครั้ง</p>
        <div className="cf-zapier-config-actions">
          <button type="button" className="cf-integration-action" onClick={onConfigureCollaboration}>ตั้งค่า Collaboration token</button>
          <button type="button" className="cf-zapier-disconnect" onClick={() => setQuickbooksStatusAttempt(value => value + 1)}>ตรวจสถานะอีกครั้ง</button>
        </div>
      </div>}
      {quickbooksStatus?.connected && quickbooksStatus.can_write && <div className="cf-qbo-workflow">
        <div className="cf-qbo-heading"><strong>บัญชีและภาษี</strong><span>เลือกรายการจากบัญชี QuickBooks ที่เชื่อมอยู่</span></div>
        {!quickbooksCatalog && quickbooksCatalogLoading && <p className="cf-qbo-loading"><LoaderCircle className="cf-integration-spin" size={15} /> กำลังอ่านรายการบัญชี…</p>}
        {!quickbooksCatalog && !quickbooksCatalogLoading && <div className="cf-qbo-recovery" role="alert">
          <p>อ่านรายการ Service item และ Tax Code ไม่สำเร็จ{quickbooksCatalogError ? `: ${quickbooksCatalogError}` : ''}</p>
          <button type="button" className="cf-integration-action" onClick={() => setQuickbooksCatalogAttempt(value => value + 1)}>ลองอ่านรายการอีกครั้ง</button>
        </div>}
        {quickbooksCatalog && <>
          <p className="cf-qbo-company-line"><strong>{quickbooksCatalog.company_name}</strong><span>สกุลเงินหลัก {quickbooksCatalog.currency || 'ไม่ทราบ'}</span></p>
          {!quickbooksCatalog.can_export && <p className="cf-zapier-boundary">บริษัท QuickBooks ต้องใช้สกุลเงินหลัก THB เพื่อส่งยอดเงินบาทจาก ConstructFlow</p>}
          <label className="cf-qbo-field">Service item สำหรับรายการประมาณราคา
            <select value={quickbooksServiceItemId} onChange={event => setQuickbooksServiceItemId(event.target.value)} disabled={quickbooksBusy || !quickbooksCatalog.can_export}>
              <option value="">เลือก Service item</option>
              {quickbooksCatalog.service_items.map(item => <option key={item.id} value={item.id}>{item.name}{item.sku ? ` · ${item.sku}` : ''}</option>)}
            </select>
          </label>
          {quickbooksVatRates.length > 0 ? <div className="cf-qbo-tax-grid">
            {quickbooksVatRates.map(rate => {
              const key = String(rate)
              const matchingCodes = quickbooksCatalog.tax_codes.filter(code => code.rate !== null && Math.abs(code.rate - rate) <= 0.0001)
              return <label className="cf-qbo-field" key={key}>VAT {(rate * 100).toLocaleString('th-TH')}%
                <select value={quickbooksTaxCodeIds[key] ?? ''} onChange={event => setQuickbooksTaxCodeIds(current => ({ ...current, [key]: event.target.value }))} disabled={quickbooksBusy || !quickbooksCatalog.can_export}>
                  <option value="">เลือก Tax Code ที่อัตราตรงกัน</option>
                  {matchingCodes.map(code => <option key={code.id} value={code.id}>{code.name} · {((code.rate ?? 0) * 100).toLocaleString('th-TH')}%</option>)}
                </select>
                {matchingCodes.length === 0 && <small>บัญชีนี้ไม่มี Tax Code ที่ตรงกับอัตรา VAT นี้</small>}
              </label>
            })}
          </div> : <p className="cf-qbo-empty">เพิ่ม Proposal หรือ Invoice ที่มีอัตรา VAT ก่อนตั้ง mapping</p>}
          <button type="button" className="cf-integration-action cf-qbo-save" onClick={() => void saveQuickBooksAccountMapping()} disabled={quickbooksBusy || !quickbooksCatalog.can_export || !quickbooksCatalog.service_items.length || quickbooksVatRates.length === 0}>
            {quickbooksBusy ? <LoaderCircle className="cf-integration-spin" size={16} /> : <Check size={15} />} บันทึก mapping
          </button>

          <div className="cf-qbo-heading cf-qbo-doc-heading"><strong>ส่งเอกสาร</strong><span>สร้างรายการใน QuickBooks เท่านั้น · ไม่ส่งอีเมลให้ลูกค้า</span></div>
          <div className="cf-qbo-export-grid">
            <div className="cf-qbo-export-block">
              <label className="cf-qbo-field">Estimate จากข้อเสนอ
                <select value={quickbooksProposalId} onChange={event => setQuickbooksProposalId(event.target.value)} disabled={quickbooksBusy}>
                  <option value="">เลือกข้อเสนอ</option>
                  {(project.proposal_drafts ?? []).filter(item => ['draft', 'sent', 'accepted'].includes(item.status)).map(item => <option key={item.id} value={item.id}>{item.title} · {item.recipient_name}</option>)}
                </select>
              </label>
              <small className="cf-qbo-recipient">{quickbooksProposal?.recipient_email ? `Customer email: ${quickbooksProposal.recipient_email}` : 'ข้อเสนอนี้ยังไม่มีอีเมลลูกค้า'}</small>
              <button type="button" className="cf-integration-action" onClick={() => void exportQuickBooksRecord('estimate')} disabled={quickbooksBusy || !quickbooksCatalog.can_export || !quickbooksCatalog.mapping?.tax_codes[String(quickbooksProposal?.vat_rate)] || !quickbooksProposal || !quickbooksProposal.recipient_email}>
                {quickbooksBusy ? <LoaderCircle className="cf-integration-spin" size={16} /> : <Send size={15} />} สร้าง Estimate
              </button>
            </div>
            <div className="cf-qbo-export-block">
              <label className="cf-qbo-field">Invoice ที่ออกแล้ว
                <select value={quickbooksInvoiceId} onChange={event => {
                  setQuickbooksInvoiceId(event.target.value)
                  const selectedInvoice = project.invoices?.find(item => item.id === event.target.value)
                  const selectedEstimate = quickbooksCatalog.exports.find(item => item.document_type === 'estimate'
                    && item.source_record_id === selectedInvoice?.proposal_id && item.status === 'succeeded' && !!item.qbo_document_id)
                  setQuickbooksLinkInvoiceToEstimate(Boolean(selectedEstimate))
                }} disabled={quickbooksBusy}>
                  <option value="">เลือก Invoice</option>
                  {(project.invoices ?? []).map(item => <option key={item.id} value={item.id}>{item.number} · {item.title} · {item.status}</option>)}
                </select>
              </label>
              <small className="cf-qbo-recipient">{quickbooksInvoice?.status !== 'issued' ? 'ส่งได้เมื่อ Invoice มีสถานะออกแล้วและยังไม่มีการบันทึกชำระเงิน' : quickbooksInvoiceProposal?.recipient_email ? `Customer email: ${quickbooksInvoiceProposal.recipient_email}` : 'ข้อเสนอที่เชื่อมอยู่ยังไม่มีอีเมลลูกค้า'}</small>
              {quickbooksInvoiceExport?.status === 'succeeded' ? <small className="cf-qbo-link-note">Invoice นี้สร้างใน QuickBooks แล้ว · {quickbooksInvoiceExport.message}</small>
                : quickbooksLinkedEstimate ? <>
                  <label className="cf-qbo-link-toggle"><input type="checkbox" checked={quickbooksLinkInvoiceToEstimate} onChange={event => setQuickbooksLinkInvoiceToEstimate(event.target.checked)} disabled={quickbooksBusy || ['pending', 'uncertain'].includes(quickbooksInvoiceExport?.status ?? '')} /><span>เชื่อมกับ Estimate {quickbooksLinkedEstimate.qbo_document_number || `#${quickbooksLinkedEstimate.qbo_document_id}`} ของข้อเสนอเดียวกัน</span></label>
                  <small className="cf-qbo-link-note">เป็นการเชื่อมรายการ Invoice–Estimate · QuickBooks API ไม่รองรับการจัดสรร progress invoice จาก Estimate</small>
                </> : <small className="cf-qbo-link-note">หากต้องการเชื่อม Estimate ให้ส่งข้อเสนอเดียวกันเป็น Estimate ก่อน · มิฉะนั้น Invoice จะถูกสร้างแยก</small>}
              <button type="button" className="cf-integration-action" onClick={() => void exportQuickBooksRecord('invoice')} disabled={quickbooksBusy || !quickbooksCatalog.can_export || !quickbooksCatalog.mapping?.tax_codes[String(quickbooksInvoice?.vat_rate)] || !quickbooksInvoice || quickbooksInvoice.status !== 'issued' || quickbooksInvoice.payments.length > 0 || !quickbooksInvoiceProposal?.recipient_email}>
                {quickbooksBusy ? <LoaderCircle className="cf-integration-spin" size={16} /> : <Send size={15} />} สร้าง Invoice
              </button>
            </div>
          </div>
          {quickbooksExportResult && <p className={`cf-integration-feedback ${quickbooksExportResult.requires_review || quickbooksExportResult.status === 'pending' || quickbooksExportResult.status === 'uncertain' ? 'is-warning' : quickbooksExportResult.status === 'succeeded' ? 'is-success' : 'is-error'}`} role="status">
            {quickbooksExportResult.message}{quickbooksExportResult.qbo_document_number ? ` · เลขที่ ${quickbooksExportResult.qbo_document_number}` : ''}
          </p>}
          {quickbooksCatalog.exports.length > 0 && <div className="cf-qbo-history" aria-label="ประวัติส่ง QuickBooks">
            <strong>รายการล่าสุด</strong>
            {quickbooksCatalog.exports.slice(0, 5).map(item => <div className="cf-qbo-history-row" key={`${item.document_type}:${item.source_record_id}`}>
              <span>{item.document_type === 'estimate' ? 'Estimate' : 'Invoice'} · {item.qbo_document_number || item.source_record_id.slice(0, 8)}</span>
              <span className={`cf-qbo-status is-${item.requires_review ? 'review' : item.status}`}>{item.requires_review ? 'ตรวจยอด' : item.status === 'succeeded' ? 'สร้างแล้ว' : item.status === 'uncertain' ? 'ตรวจสอบผล' : item.status === 'pending' ? 'กำลังส่ง' : 'ไม่สำเร็จ'}</span>
              <small>{item.message}</small>
            </div>)}
          </div>}
        </>}
        <div className="cf-qbo-payment-import" aria-label="นำเข้ารายการรับชำระ QuickBooks">
          <div className="cf-qbo-heading"><strong>รับชำระจาก QuickBooks</strong><span>ตรวจรายการก่อนบันทึกลงใบแจ้งหนี้ในโครงการ</span></div>
          <p className="cf-qbo-boundary">อ่านเฉพาะรายการรับชำระที่ QuickBooks เชื่อมกับ Invoice ที่ส่งจาก ConstructFlow · นำเข้าเป็นบันทึก receipt ผ่าน CommandBus และไม่เคลื่อนย้ายเงิน</p>
          <button type="button" className="cf-integration-action" onClick={() => void syncQuickBooksPayments()} disabled={quickbooksPaymentLoading || quickbooksBusy}>
            {quickbooksPaymentLoading ? <LoaderCircle className="cf-integration-spin" size={16} /> : <RotateCw size={15} />}
            {quickbooksPaymentLoading ? 'กำลังอ่านรายการ…' : quickbooksPaymentSync ? 'อ่านรายการล่าสุดอีกครั้ง' : 'ตรวจรายการรับชำระ'}
          </button>
          {quickbooksPaymentLoading && <p className="cf-qbo-loading" role="status"><LoaderCircle className="cf-integration-spin" size={15} /> กำลังจับคู่ยอดรับชำระกับ Invoice</p>}
          {quickbooksPaymentError && <p className="cf-integration-feedback is-error" role="alert">{quickbooksPaymentError}</p>}
          {quickbooksPaymentSync && <>
            <p className="cf-qbo-payment-summary" role="status">พบรายการที่เชื่อมกับ Invoice ใน QuickBooks {quickbooksPaymentSync.payments.length.toLocaleString('th-TH')} รายการ · Realm {quickbooksPaymentSync.realm_id}</p>
            {quickbooksPaymentSync.warnings.length > 0 && <div className="cf-qbo-payment-warnings" role="note">
              <strong>มีรายการที่ควรตรวจใน QuickBooks ({quickbooksPaymentSync.warnings.length.toLocaleString('th-TH')})</strong>
              {quickbooksPaymentSync.warnings.slice(0, 5).map((warning, index) => <span key={`${warning.payment_id}:${warning.reason}:${index}`}>Payment #{warning.payment_id}{warning.invoice_number ? ` · Invoice ${warning.invoice_number}` : ''} — {warning.reason}</span>)}
              {quickbooksPaymentSync.warnings.length > 5 && <span>แสดง 5 รายการแรก</span>}
            </div>}
            {quickbooksPaymentCandidates.length > 0 ? <>
              <div className="cf-qbo-payment-list">
                {quickbooksPaymentCandidates.map(({ payment, invoice, outstandingThb }) => {
                  const checked = selectedQuickBooksPaymentRefs.has(payment.external_reference)
                  const exceedsBalance = payment.amount_thb > outstandingThb + 0.001
                  const selectedForInvoice = quickbooksPaymentCandidates
                    .filter(item => item.invoice.id === invoice.id && selectedQuickBooksPaymentRefs.has(item.payment.external_reference))
                    .reduce((total, item) => total + item.payment.amount_thb, 0)
                  const exceedsSelectedBalance = !checked && selectedForInvoice + payment.amount_thb > outstandingThb + 0.001
                  const selectionLimitReached = !checked && selectedQuickBooksPaymentRefs.size >= 500
                  return <label className={`cf-qbo-payment-row${checked ? ' is-selected' : ''}`} key={payment.external_reference}>
                    <input type="checkbox" checked={checked} disabled={(!checked && (exceedsBalance || exceedsSelectedBalance || selectionLimitReached)) || quickbooksBusy || quickbooksPaymentLoading} onChange={() => toggleQuickBooksPayment({ payment, invoice, outstandingThb })} />
                    <span className="cf-qbo-payment-copy">
                      <strong>Invoice {invoice.number} · {payment.amount_thb.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</strong>
                      <small>{payment.received_at} · Payment #{payment.payment_id}{payment.payment_reference ? ` · อ้างอิง ${payment.payment_reference}` : ''}</small>
                      <small>ยอดคงเหลือ {outstandingThb.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท{exceedsBalance ? ' · ยอดรับชำระเกินยอดคงเหลือ' : exceedsSelectedBalance ? ' · เลือกรายการอื่นแล้วเต็มยอดคงเหลือ' : ''}</small>
                    </span>
                  </label>
                })}
              </div>
              <div className="cf-qbo-payment-actions">
                <span>เลือก {selectedQuickBooksPaymentRefs.size.toLocaleString('th-TH')} รายการ · {quickbooksPaymentCandidates.filter(item => selectedQuickBooksPaymentRefs.has(item.payment.external_reference)).reduce((total, item) => total + item.payment.amount_thb, 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</span>
                <button type="button" className="cf-integration-action" onClick={importSelectedQuickBooksPayments} disabled={!selectedQuickBooksPaymentRefs.size || quickbooksBusy || quickbooksPaymentLoading}>
                  <Check size={15} /> นำเข้ารายการที่เลือก
                </button>
              </div>
            </> : <p className="cf-qbo-empty">{quickbooksPaymentSync.payments.length
              ? 'ไม่พบรายการที่ยังนำเข้าได้ · ตรวจว่ามี Invoice ในโครงการที่ยังมียอดคงเหลือหรือไม่'
              : 'ยังไม่มีรายการรับชำระที่เชื่อมกับ Invoice ที่ส่งจากโครงการนี้'}</p>}
          </>}
        </div>
      </div>}
      {quickbooksError && <p className="cf-integration-feedback is-error" role="alert">{quickbooksError}</p>}
    </section>

    <section className="cf-zapier-webhook cf-custom-webhook" aria-label="เชื่อมต่อระบบภายนอกด้วย signed webhook">
      <header><div><strong><Network size={15} /> Custom webhook · CRM / บัญชี / ระบบภาคสนาม</strong><small>ส่ง snapshot ข้อเสนอ, change order หรือใบแจ้งหนี้ไปยัง Make, n8n หรือ endpoint ที่องค์กรอนุญาต</small></div>
        {customWebhookConfigured && <span className="cf-zapier-connected"><ShieldCheck size={13} /> เชื่อมต่อแล้ว</span>}
      </header>
      <form className="cf-zapier-config-form" onSubmit={event => { event.preventDefault(); void saveCustomWebhookConnection() }}>
        <label className="cf-zapier-url-label">HTTPS receiver URL <input type="password" autoComplete="new-password" spellCheck={false} value={customWebhookUrl} placeholder="https://hooks.example.com/constructflow" aria-label="Custom webhook receiver URL" onChange={event => { setCustomWebhookUrl(event.target.value); setCustomWebhookConfigured(false) }} /></label>
        <label className="cf-zapier-url-label">HMAC signing secret <input type="password" autoComplete="new-password" spellCheck={false} value={customWebhookSecret} placeholder="อย่างน้อย 32 bytes" aria-label="Custom webhook signing secret" onChange={event => { setCustomWebhookSecret(event.target.value); setCustomWebhookConfigured(false) }} /></label>
        <div className="cf-zapier-config-actions">
          <button type="button" className="cf-zapier-disconnect" onClick={() => { setCustomWebhookSecret(createSigningSecret()); setCustomWebhookConfigured(false) }}>สร้าง secret</button>
          <button type="button" className="cf-zapier-disconnect" disabled={!customWebhookSecret} onClick={() => { void navigator.clipboard.writeText(customWebhookSecret).then(() => setStatusMessage('คัดลอก signing secret แล้ว · เก็บไว้ที่ receiver ด้วย')).catch(() => setError('คัดลอก secret ไม่ได้ · กรุณาอนุญาต clipboard')) }}>คัดลอก secret</button>
          <button type="submit" className="cf-integration-action" disabled={!customWebhookUrl.trim() || !customWebhookSecret.trim() || busyConnector === 'webhook'}>บันทึกบนอุปกรณ์นี้</button>
          {customWebhookConfigured && <button type="button" className="cf-zapier-disconnect" onClick={() => void disconnectCustomWebhook()} disabled={busyConnector === 'webhook'}><Unplug size={14} /> ยกเลิก</button>}
        </div>
      </form>
      <small className="cf-zapier-local-note">URL และ secret อยู่ใน IndexedDB ของอุปกรณ์นี้ · Gateway ใช้ secret เซ็น HMAC-SHA256 เฉพาะตอนส่งและไม่บันทึกค่า secret</small>
      <p className="cf-zapier-boundary">{webhookGatewayConfig?.allowed_hosts.length
        ? `Gateway อนุญาต host: ${webhookGatewayConfig.allowed_hosts.join(', ')}`
        : webhookGatewayError || 'ผู้ดูแล gateway ต้องกำหนด CONSTRUCTFLOW_WEBHOOK_ALLOWED_HOSTS และเปิด collaboration ก่อน'}</p>
      <label>รายการที่จะส่ง<select aria-label="เลือกข้อเสนอ change order หรือใบแจ้งหนี้" value={webhookRecordKey} onChange={event => setWebhookRecordKey(event.target.value)} disabled={!webhookRecords.length}>
        {webhookRecords.length ? webhookRecords.map(record => {
          const value = `${record.kind}:${record.value.id}`
          const title = record.kind === 'proposal' ? record.value.title : `${record.kind === 'change_order' ? record.value.number : `ใบแจ้งหนี้ ${record.value.number}`} · ${record.value.title}`
          const amount = record.kind === 'proposal' ? record.value.grand_total_thb : record.kind === 'change_order' ? record.value.grand_total_delta_thb : record.value.amount_due_thb
          return <option key={value} value={value}>{title} · {record.value.status} · {amount.toLocaleString('th-TH')} บาท</option>
        }) : <option value="">ยังไม่มี proposal, change order หรือ invoice</option>}
      </select></label>
      <div className="cf-zapier-consent-options">
        <label><input type="checkbox" checked={webhookIncludeRecipient} onChange={event => setWebhookIncludeRecipient(event.target.checked)} /> แนบชื่อและข้อมูลผู้รับ</label>
        {selectedWebhookRecord?.kind === 'proposal' && <label><input type="checkbox" checked={webhookIncludeFieldData} onChange={event => setWebhookIncludeFieldData(event.target.checked)} /> แนบ Field Data และตำแหน่ง GPS ที่อยู่ใน snapshot</label>}
      </div>
      {selectedWebhookRecord && <div className="cf-zapier-proposal-summary"><strong>{selectedWebhookRecord.kind === 'invoice'
        ? `งวด ${selectedWebhookRecord.value.billing_percent}% · ${selectedWebhookRecord.value.amount_due_thb.toLocaleString('th-TH')} บาท`
        : `${selectedWebhookRecord.value.lines.length} รายการ · ${selectedWebhookRecord.kind}`}</strong><span>UUID {selectedWebhookRecord.value.id}</span></div>}
      <button type="button" className="cf-integration-action cf-zapier-send" onClick={() => selectedWebhookRecord && sendCustomWebhookRecord(selectedWebhookRecord)} disabled={!customWebhookConfigured || !selectedWebhookRecord || Boolean(busyConnector) || !customWebhookHostAllowed}>
        {busyConnector === 'webhook' ? <LoaderCircle className="cf-integration-spin" size={16} /> : <Send size={15} />}
        {busyConnector === 'webhook' ? 'กำลังส่ง…' : 'ส่ง business snapshot แบบลงนาม'}
      </button>
      <p className="cf-zapier-boundary">ผู้รับตรวจลายเซ็นจาก raw request body ด้วย HMAC-SHA256 · ส่งเฉพาะข้อมูลธุรกิจที่เลือก ไม่แนบ geometry ของ BIM · redirect และ DNS ไปยัง IP ภายในถูกปฏิเสธ</p>
    </section>

    <section className="cf-zapier-webhook" aria-label="ส่งข้อเสนอไป Zapier">
      <header><div><strong><Network size={15} /> Zapier Catch Hook</strong><small>ส่ง snapshot ข้อเสนอจากเครื่องนี้เมื่อคุณกดส่ง</small></div>
        {zapierConfigured && <span className="cf-zapier-connected"><ShieldCheck size={13} /> เชื่อมต่อแล้ว</span>}
      </header>
      <form className="cf-zapier-config-form" onSubmit={event => { event.preventDefault(); void saveZapierConnection() }}>
        <label className="cf-zapier-url-label">Webhook URL <input type="password" autoComplete="new-password" spellCheck={false} value={zapierUrl} placeholder="https://hooks.zapier.com/hooks/catch/…" aria-label="Zapier Catch Hook URL" onChange={event => { setZapierUrl(event.target.value); setZapierConfigured(false) }} /></label>
        <div className="cf-zapier-config-actions">
          <button type="submit" className="cf-integration-action" disabled={!zapierUrl.trim() || busyConnector === 'zapier'}>บันทึก URL</button>
          {zapierConfigured && <button type="button" className="cf-zapier-disconnect" onClick={() => void disconnectZapier()} disabled={busyConnector === 'zapier'}><Unplug size={14} /> ยกเลิกการเชื่อมต่อ</button>}
        </div>
      </form>
      <small className="cf-zapier-local-note">URL ทำหน้าที่เหมือนรหัสผ่านและเก็บเฉพาะใน IndexedDB ของอุปกรณ์นี้ · ไม่แนบโมเดล BIM</small>
      <label>ข้อเสนอ<select aria-label="เลือกข้อเสนอสำหรับ Zapier" value={proposalId} onChange={event => setProposalId(event.target.value)} disabled={!project.proposal_drafts?.length}>
        {project.proposal_drafts?.length ? project.proposal_drafts.map(proposal => <option key={proposal.id} value={proposal.id}>{proposal.title} · {proposal.status} · {proposal.grand_total_thb.toLocaleString('th-TH')} บาท</option>) : <option value="">ยังไม่มีข้อเสนอที่บันทึก</option>}
      </select></label>
      <div className="cf-zapier-consent-options">
        <label><input type="checkbox" checked={includeRecipient} onChange={event => setIncludeRecipient(event.target.checked)} /> แนบชื่อและข้อมูลติดต่อผู้รับ</label>
        <label><input type="checkbox" checked={includeFieldData} onChange={event => setIncludeFieldData(event.target.checked)} /> แนบข้อมูล Field Data ในข้อเสนอ</label>
      </div>
      {selectedProposal && <div className="cf-zapier-proposal-summary"><strong>{selectedProposal.lines.length} รายการ · {selectedProposal.grand_total_thb.toLocaleString('th-TH')} บาท</strong><span>{selectedProposal.recipient_name || 'ไม่ระบุผู้รับ'} · {selectedProposal.status}</span></div>}
      <button type="button" className="cf-integration-action cf-zapier-send" onClick={() => selectedProposal && sendProposal(selectedProposal)} disabled={!zapierConfigured || !selectedProposal || Boolean(busyConnector)}>
        {busyConnector === 'zapier' ? <LoaderCircle className="cf-integration-spin" size={16} /> : <Send size={15} />}
        {busyConnector === 'zapier' ? 'กำลังส่ง…' : 'ส่ง snapshot ข้อเสนอ'}
      </button>
      <p className="cf-zapier-boundary">ส่งผ่าน gateway ที่ยืนยันสิทธิ์ทีมและรับ HTTP acknowledgement จาก Zapier · gateway ปฏิเสธ redirect และไม่ส่ง event_id ที่สำเร็จหรือยังไม่ทราบผลซ้ำ · HTTP 2xx ยืนยันการรับ Catch Hook ไม่ได้ยืนยันขั้นตอน Zap ถัดไป</p>
    </section>

    <section className="cf-integration-history" aria-label="ประวัติการส่งออก">
      <h3><Clock3 size={15} />ประวัติบนอุปกรณ์นี้</h3>
      {activity.length ? <ul>{activity.slice(0, 8).map(item => <li key={item.id}>
        <span className={`cf-integration-history-state ${item.status === 'succeeded' ? 'is-success' : item.status === 'dispatched' ? 'is-dispatched' : item.status === 'pending' ? 'is-pending' : 'is-error'}`} aria-label={item.status === 'dispatched' ? 'ส่งคำขอแล้ว ยังไม่ยืนยันปลายทาง' : item.status === 'pending' ? 'กำลังส่ง' : item.status === 'succeeded' ? 'สำเร็จ' : 'ไม่สำเร็จ'} />
        <div><strong>{item.connector_id === 'zapier' ? 'Zapier Catch Hook' : item.connector_id === 'webhook' ? 'Custom webhook' : CONNECTOR_DETAILS[item.connector_id].title} · {item.artifact_name}</strong><span>{item.message}</span><time dateTime={item.created_at}>{formatTime(item.created_at)}</time></div>
        {(item.status === 'failed' && !(['zapier', 'webhook'].includes(item.connector_id) && item.message.includes('ผลการส่งไม่แน่ชัด')) || (item.status === 'pending' && ['zapier', 'webhook'].includes(item.connector_id))) && <button type="button" onClick={() => item.connector_id === 'zapier' ? retryZapier(item) : retry(item)} disabled={Boolean(busyConnector)} aria-label={`ลองส่ง ${item.connector_id === 'zapier' ? 'Zapier' : item.connector_id === 'webhook' ? 'custom webhook' : CONNECTOR_DETAILS[item.connector_id].title} อีกครั้ง`}><RotateCw size={15} /></button>}
      </li>)}</ul> : <div className="cf-integration-empty">เมื่อส่งออกแล้ว ผลและข้อผิดพลาดล่าสุดจะแสดงที่นี่</div>}
    </section>

    {statusMessage && <p className="cf-integration-feedback is-success" role="status">{statusMessage}</p>}
    {error && <p className="cf-integration-feedback is-error" role="alert">{error}</p>}
    <p className="cf-integration-boundary">สถานะนี้ยืนยันเฉพาะการสร้างไฟล์ใน ConstructFlow ไม่ได้ยืนยันว่าโปรแกรมปลายทางเปิดหรือนำเข้าแล้ว</p>
  </section>
}
