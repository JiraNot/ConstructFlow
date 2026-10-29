import React, { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDownRight, ArrowUpRight, Crosshair, Download, FileText, Printer, RefreshCw, Search, Share2, Upload, X } from 'lucide-react'
import { calculateInvoiceAmounts, getInvoiceOutstandingAmount, getInvoicePaidAmount, validateProjectTakeoffRates, type ChangeOrderDraft, type FieldFormRecord, type InvoiceDraft, type InvoicePaymentMethod, type InvoiceStatus, type InvoiceStatusTarget, type Phase, type ProjectDocument, type ProposalConditionalTextRule, type ProposalConditionalTextSnapshot, type ProposalDeviceSignatureInput, type ProposalDraft, type ProposalFieldDataSnapshot, type ProposalRecipientSignature, type ProposalStatus, type ProposalStatusTarget, type ProjectTakeoffRate } from '@constructflow/project-model'
import { calculateChangeOrderPricing, calculateProposalPricing, calculatePhasedBOQ, calculateTakeoff, DEFAULT_THAI_UNIT_RATES, type TakeoffCostCenter } from '@constructflow/takeoff-engine'
import { printProposalDocument } from '../app/proposalPrint.js'
import { printChangeOrderDocument } from '../app/changeOrderPrint.js'
import { printInvoiceDocument } from '../app/invoicePrint.js'
import { SupplierProductLibrary } from './SupplierProductLibrary.js'
import type { SupplierProductBundlePlacement } from '../supplierBundlePlacement.js'
import { ProposalSignatureCaptureModal } from './ProposalSignatureCaptureModal.js'
import { ProposalApprovalLinkModal } from './ProposalApprovalLinkModal.js'
import {
  createLocalCompanyLibraryBundle, deleteLocalProposalTemplate, deleteLocalTakeoffPriceBook, importLocalCompanyLibraryBundle,
  listLocalDiscountRules, listLocalProposalTemplates, listLocalTakeoffPriceBooks,
  saveLocalDiscountRule, saveLocalProposalTemplate, saveLocalTakeoffPriceBook,
  type LocalDiscountRule, type LocalProposalTemplate, type LocalTakeoffPriceBook,
} from '../projectAutosave.js'
import { syncCompanyLibraryWithProject } from '../companyLibrarySync.js'

const takeoffCostCenterLabels: Record<TakeoffCostCenter, string> = {
  demolition_site_prep: 'รื้อถอน/เตรียมพื้นที่',
  new_construction: 'งานสร้างใหม่',
  remodeling_joint_treatment: 'รอยต่อเดิม–ใหม่',
}

type TakeoffGroupMode = 'phase' | 'cost_center' | 'material' | 'none'
const takeoffGroupModeLabels: Record<TakeoffGroupMode, string> = {
  phase: 'เฟสงาน', cost_center: 'หมวด BOQ', material: 'วัสดุ', none: 'ไม่จัดกลุ่ม',
}
const takeoffUnitLabels: Record<string, string> = { item: 'ชิ้น', m: 'ม.', m2: 'ม²', m3: 'ม³', kg: 'กก.' }

const phaseLabels: Record<Phase, string> = {
  existing: 'อาคารเดิม',
  demolition: 'รื้อถอน',
  new_construction: 'สร้างใหม่',
}

const proposalStatusLabels: Record<ProposalStatus, string> = {
  draft: 'แบบร่าง', sent: 'บันทึกว่าส่งแล้ว', accepted: 'ตอบรับแล้ว', declined: 'ไม่รับข้อเสนอ', void: 'ยกเลิก',
}
const changeOrderStatusLabels: Record<ProposalStatus, string> = {
  draft: 'แบบร่าง', sent: 'บันทึกว่าส่งแล้ว', accepted: 'อนุมัติแล้ว', declined: 'ไม่อนุมัติ', void: 'ยกเลิก',
}
const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  draft: 'แบบร่าง', issued: 'ออกเอกสารแล้ว', partially_paid: 'รับชำระบางส่วน', paid: 'ชำระครบแล้ว', void: 'ยกเลิก',
}
const invoicePaymentMethodLabels: Record<InvoicePaymentMethod, string> = {
  cash: 'เงินสด', bank_transfer: 'โอนเงิน', cheque: 'เช็ค', other: 'อื่น ๆ',
}
const fieldFormCategoryLabels: Record<FieldFormRecord['category'], string> = {
  site_visit: 'เข้าตรวจหน้างาน', quality_inspection: 'ตรวจงาน', safety_observation: 'ความปลอดภัย', client_request: 'คำขอลูกค้า', custom: 'กำหนดเอง',
}
const conditionalOperatorLabels: Record<ProposalConditionalTextRule['operator'], string> = {
  is_on: 'เป็น ใช่', is_off: 'เป็น ไม่ใช่', equals: 'เท่ากับ', not_empty: 'มีข้อมูล',
}
const conditionalOperatorsForField = (inputType: ProposalConditionalFieldOption['input_type']): ProposalConditionalTextRule['operator'][] =>
  inputType === 'checkbox' ? ['is_on', 'is_off']
    : inputType === 'select' ? ['equals']
      : inputType === 'date' ? ['not_empty'] : ['equals', 'not_empty']
const formatSignedThb = (amount: number) => `${amount < 0 ? '−' : '+'}฿${Math.abs(amount).toLocaleString('th-TH', { maximumFractionDigits: 2 })}`
const formatThb = (amount: number) => `฿${amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const formatInvoicePaymentDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  ? new Date(`${value}T00:00:00`).toLocaleDateString('th-TH')
  : new Date(value).toLocaleString('th-TH')

function snapshotSubmittedFieldForm(form: FieldFormRecord, project: ProjectDocument): ProposalFieldDataSnapshot {
  if (form.status !== 'submitted' || !form.submitted_at) throw new Error('ข้อเสนอแนบได้เฉพาะแบบฟอร์มที่ส่งแล้ว')
  return {
    field_form_id: form.id,
    template_id: form.template_id,
    title: form.title,
    category: form.category,
    submitted_at: form.submitted_at,
    ...(form.level_id ? { level_name: project.levels.find(level => level.id === form.level_id)?.name ?? 'ชั้นที่ไม่มีในโครงการ' } : {}),
    ...(form.location_mm ? { location_mm: [...form.location_mm] as [number, number] } : {}),
    ...(form.gps_location ? { gps_location: { ...form.gps_location } } : {}),
    responses: form.fields.flatMap(field => {
      const value = form.responses[field.id]
      return value === undefined || value === null || value === '' ? [] : [{ field_id: field.id, label: field.label, value }]
    }),
    ...(form.notes?.trim() ? { notes: form.notes } : {}),
  }
}

interface ProposalConditionalFieldOption {
  key: string
  template_id: string
  template_title: string
  field_id: string
  field_label: string
  input_type: FieldFormRecord['fields'][number]['input_type']
  options?: string[]
}

const conditionalFieldKey = (templateId: string, fieldId: string) => `${templateId}::${fieldId}`

function getProposalConditionalFieldOptions(forms: FieldFormRecord[]): ProposalConditionalFieldOption[] {
  const latestByField = new Map<string, ProposalConditionalFieldOption>()
  const recentFirst = [...forms].filter(form => form.status === 'submitted' && form.submitted_at)
    .sort((a, b) => Date.parse(b.submitted_at!) - Date.parse(a.submitted_at!))
  for (const form of recentFirst) for (const field of form.fields) {
    if (field.input_type === 'section') continue
    const key = conditionalFieldKey(form.template_id, field.id)
    if (latestByField.has(key)) continue
    latestByField.set(key, {
      key, template_id: form.template_id, template_title: form.title,
      field_id: field.id, field_label: field.label, input_type: field.input_type,
      ...(field.options ? { options: [...field.options] } : {}),
    })
  }
  return [...latestByField.values()]
}

function conditionalTextMatches(operator: ProposalConditionalTextRule['operator'], expected: string | number | undefined, value: unknown): boolean {
  if (operator === 'is_on') return value === true
  if (operator === 'is_off') return value === false
  if (operator === 'not_empty') return value !== null && value !== undefined && (typeof value !== 'string' || value.trim() !== '')
  return typeof expected === typeof value && expected === value
}

function formatFieldValue(value: unknown): string {
  return typeof value === 'boolean' ? value ? 'ใช่' : 'ไม่ใช่'
    : typeof value === 'number' ? value.toLocaleString('th-TH')
      : typeof value === 'string' ? value : ''
}

function resolveProposalConditionalTexts(rules: ProposalConditionalTextRule[], forms: FieldFormRecord[]): ProposalConditionalTextSnapshot[] {
  const recentFirst = [...forms].filter(form => form.status === 'submitted' && form.submitted_at)
    .sort((a, b) => Date.parse(b.submitted_at!) - Date.parse(a.submitted_at!))
  return rules.map(rule => {
    const source = recentFirst.find(form => form.template_id === rule.template_id && form.fields.some(field => field.id === rule.field_id))
    const field = source?.fields.find(item => item.id === rule.field_id)
    const value = source?.responses[rule.field_id]
    const matched = Boolean(source && conditionalTextMatches(rule.operator, rule.expected_value, value))
    const valueByField = new Map(source?.fields.map(item => [item.id, formatFieldValue(source.responses[item.id])]) ?? [])
    const renderedText = rule.content.replace(/\{\{([a-z0-9._-]{1,120})\}\}/gi, (_match, fieldId: string) => valueByField.get(fieldId) ?? '')
    return {
      ...rule,
      ...(field ? { field_label: field.label, template_title: source!.title } : {}),
      matched,
      ...(source ? { source_form_id: source.id, source_submitted_at: source.submitted_at } : {}),
      ...(matched ? { rendered_text: renderedText } : {}),
    }
  })
}

function proposalRuleFromSnapshot(snapshot: ProposalConditionalTextSnapshot): ProposalConditionalTextRule {
  return {
    id: snapshot.id, template_id: snapshot.template_id, template_title: snapshot.template_title,
    field_id: snapshot.field_id, field_label: snapshot.field_label, operator: snapshot.operator,
    ...(snapshot.expected_value !== undefined ? { expected_value: snapshot.expected_value } : {}),
    content: snapshot.content,
  }
}

interface TakeoffPanelProps {
  project: ProjectDocument
  onOpenConstruction: () => void
  onExportTakeoff: () => void
  onExportBOQ: () => void
  onSelectObjects: (objectIds: string[]) => void
  onSaveProposal: (proposal: ProposalDraft) => boolean
  onTransitionProposal: (proposalId: string, targetStatus: ProposalStatusTarget, deviceSignature?: ProposalDeviceSignatureInput, recipientSignature?: ProposalRecipientSignature, note?: string) => boolean
  onSaveChangeOrder: (changeOrder: ChangeOrderDraft) => boolean
  onTransitionChangeOrder: (changeOrderId: string, targetStatus: ProposalStatusTarget) => boolean
  onSaveInvoice: (invoice: InvoiceDraft) => boolean
  onTransitionInvoice: (invoiceId: string, targetStatus: InvoiceStatusTarget) => boolean
  onRecordInvoicePayment: (invoiceId: string, amountThb: number, method: InvoicePaymentMethod, reference?: string, note?: string) => boolean
  onSaveTakeoffRates: (rates: Record<string, ProjectTakeoffRate>) => boolean
  onBeginBundlePlacement?: (placement: SupplierProductBundlePlacement) => void
}

const rateLabels: Record<string, string> = {
  concrete_240_ksc: 'คอนกรีต 240 ksc', concrete_lean: 'คอนกรีตหยาบ', concrete: 'คอนกรีต',
  plywood_formwork: 'ไม้แบบ', formwork: 'แบบหล่อ', rebar_rb6: 'เหล็ก RB6', rebar_rb9: 'เหล็ก RB9',
  rebar_db12: 'เหล็ก DB12', rebar_db16: 'เหล็ก DB16', rebar_db20: 'เหล็ก DB20', rebar: 'เหล็กเสริม',
  wire_mesh: 'ไวร์เมช', micro_pile_i18: 'ไมโครไพล์ I-18', pile: 'เสาเข็ม', aac_block: 'อิฐมวลเบา',
  brick: 'อิฐมอญ', cement_plaster: 'ปูนฉาบ', tile_ceramic: 'กระเบื้องเซรามิก', tile_granite: 'กระเบื้องแกรนิต',
  tile: 'กระเบื้องทั่วไป', paint: 'สีทาอาคาร', door: 'ประตู', window: 'หน้าต่าง',
  chemical_dowel_epoxy: 'Chemical Dowel', expansion_joint_sealant: 'ยาแนวรอยต่อ', roof_flashing: 'แฟลชชิ่งหลังคา', joint_sealant: 'ซีลแลนท์',
}

/** Model-linked quantity view; choosing a row returns directly to its source objects. */
export const TakeoffPanel: React.FC<TakeoffPanelProps> = ({ project, onOpenConstruction, onExportTakeoff, onExportBOQ, onSelectObjects, onSaveProposal, onTransitionProposal, onSaveChangeOrder, onTransitionChangeOrder, onSaveInvoice, onTransitionInvoice, onRecordInvoicePayment, onSaveTakeoffRates, onBeginBundlePlacement }) => {
  const [query, setQuery] = useState('')
  const [phaseFilter, setPhaseFilter] = useState<'all' | Phase>('all')
  const [costCenterFilter, setCostCenterFilter] = useState<'all' | TakeoffCostCenter>('all')
  const [takeoffGroupMode, setTakeoffGroupMode] = useState<TakeoffGroupMode>('phase')
  const [proposalDraft, setProposalDraft] = useState<ProposalDraft | null>(null)
  const [signatureProposal, setSignatureProposal] = useState<ProposalDraft | null>(null)
  const [approvalLinkProposal, setApprovalLinkProposal] = useState<ProposalDraft | null>(null)
  const [changeOrderDraft, setChangeOrderDraft] = useState<ChangeOrderDraft | null>(null)
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraft | null>(null)
  const [invoiceError, setInvoiceError] = useState('')
  const [invoiceMessage, setInvoiceMessage] = useState('')
  const [paymentDraft, setPaymentDraft] = useState<{ invoiceId: string; amount: string; method: InvoicePaymentMethod; reference: string; note: string } | null>(null)
  const [paymentError, setPaymentError] = useState('')
  const [changeOrderError, setChangeOrderError] = useState('')
  const [proposalError, setProposalError] = useState('')
  const [proposalStatusMessage, setProposalStatusMessage] = useState('')
  const [changeOrderMessage, setChangeOrderMessage] = useState('')
  const [proposalTemplates, setProposalTemplates] = useState<LocalProposalTemplate[]>([])
  const [proposalTemplateId, setProposalTemplateId] = useState('')
  const [proposalTemplateName, setProposalTemplateName] = useState('')
  const [proposalTemplateMessage, setProposalTemplateMessage] = useState('')
  const [proposalTemplateError, setProposalTemplateError] = useState('')
  const [proposalTemplateBusy, setProposalTemplateBusy] = useState(false)
  const [discountRules, setDiscountRules] = useState<LocalDiscountRule[]>([])
  const [discountRuleId, setDiscountRuleId] = useState('')
  const [discountRuleName, setDiscountRuleName] = useState('')
  const [discountRuleNotes, setDiscountRuleNotes] = useState('')
  const [discountRuleMessage, setDiscountRuleMessage] = useState('')
  const [discountRuleError, setDiscountRuleError] = useState('')
  const [discountRuleBusy, setDiscountRuleBusy] = useState(false)
  const [rateDraft, setRateDraft] = useState<Record<string, ProjectTakeoffRate> | null>(null)
  const [rateQuery, setRateQuery] = useState('')
  const [rateBooks, setRateBooks] = useState<LocalTakeoffPriceBook[]>([])
  const [selectedRateBookId, setSelectedRateBookId] = useState('')
  const [rateBookName, setRateBookName] = useState('')
  const [rateBookMessage, setRateBookMessage] = useState('')
  const [rateBookError, setRateBookError] = useState('')
  const [rateBookBusy, setRateBookBusy] = useState(false)
  const rateBookFileInput = useRef<HTMLInputElement>(null)
  const [companyLibraryMessage, setCompanyLibraryMessage] = useState('')
  const [companyLibraryError, setCompanyLibraryError] = useState('')
  const [companyLibraryBusy, setCompanyLibraryBusy] = useState(false)
  const [companyLibraryRevision, setCompanyLibraryRevision] = useState(0)
  const [companyLibrarySyncMessage, setCompanyLibrarySyncMessage] = useState('')
  const [companyLibrarySyncError, setCompanyLibrarySyncError] = useState('')
  const companyLibraryFileInput = useRef<HTMLInputElement>(null)
  const takeoff = useMemo(() => calculateTakeoff(project), [project])
  const boq = useMemo(() => calculatePhasedBOQ(project, project.takeoff_rates), [project])
  const boqLines = useMemo(() => Object.values(boq.cost_centers).flatMap(center => center.items), [boq])
  const boqLineById = useMemo(() => new Map(boqLines.map(line => [line.id, line])), [boqLines])
  const submittedFieldForms = useMemo(() => (project.field_forms ?? []).filter(form => form.status === 'submitted'), [project.field_forms])
  const conditionalFieldOptions = useMemo(() => getProposalConditionalFieldOptions(submittedFieldForms), [submittedFieldForms])
  const filteredLines = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('th-TH')
    return takeoff.lines.filter(line => {
      if (phaseFilter !== 'all' && line.phase !== phaseFilter) return false
      if (costCenterFilter !== 'all' && line.cost_center !== costCenterFilter) return false
      if (!normalizedQuery) return true
      return [line.mark, line.material, line.object_type, line.formula, phaseLabels[line.phase], takeoffCostCenterLabels[line.cost_center]]
        .filter(Boolean).some(value => String(value).toLocaleLowerCase('th-TH').includes(normalizedQuery))
    })
  }, [costCenterFilter, phaseFilter, query, takeoff.lines])
  const groupedLines = useMemo(() => {
    const groups = new Map<string, {
      key: string; label: string; lines: typeof filteredLines; quantityByUnit: Record<string, number>;
      directCostThb: number; sourceIds: Set<string>
    }>()
    for (const line of filteredLines) {
      const [key, label] = takeoffGroupMode === 'phase'
        ? [line.phase, phaseLabels[line.phase]]
        : takeoffGroupMode === 'cost_center'
          ? [line.cost_center, takeoffCostCenterLabels[line.cost_center]]
          : takeoffGroupMode === 'material'
            ? [line.material?.trim() || line.mark, line.material?.trim() || line.mark]
            : ['all', 'รายการทั้งหมด']
      let group = groups.get(key)
      if (!group) {
        group = { key, label, lines: [], quantityByUnit: {}, directCostThb: 0, sourceIds: new Set() }
        groups.set(key, group)
      }
      group.lines.push(line)
      group.quantityByUnit[line.unit] = (group.quantityByUnit[line.unit] ?? 0) + line.quantity
      group.directCostThb += boqLineById.get(line.id)?.total_direct_cost_thb ?? 0
      for (const sourceId of line.source_object_ids) if (project.objects[sourceId]) group.sourceIds.add(sourceId)
    }
    return [...groups.values()].map(group => ({ ...group, directCostThb: Number(group.directCostThb.toFixed(2)) }))
  }, [boqLineById, filteredLines, project.objects, takeoffGroupMode])
  const invoiceDraftProposal = invoiceDraft ? project.proposal_drafts?.find(proposal => proposal.id === invoiceDraft.proposal_id) : undefined
  const invoiceDraftApprovedOrders = invoiceDraft
    ? (project.change_orders ?? []).filter(order => order.proposal_id === invoiceDraft.proposal_id && order.status === 'accepted')
    : []
  const invoiceDraftOrderIds = invoiceDraftApprovedOrders.map(order => order.id).sort()
  const invoiceDraftOrderTotal = Number(invoiceDraftApprovedOrders.reduce((sum, order) => sum + order.grand_total_delta_thb, 0).toFixed(2))
  const invoiceDraftSnapshotStale = !!invoiceDraft && (!invoiceDraftProposal || invoiceDraftProposal.status !== 'accepted'
    || Math.abs(invoiceDraft.proposal_total_thb - invoiceDraftProposal.grand_total_thb) > 0.03
    || Math.abs(invoiceDraft.approved_change_order_total_thb - invoiceDraftOrderTotal) > 0.03
    || Math.abs(invoiceDraft.contract_total_thb - invoiceDraftProposal.grand_total_thb - invoiceDraftOrderTotal) > 0.03
    || invoiceDraft.source_change_order_ids.length !== invoiceDraftOrderIds.length
    || invoiceDraft.source_change_order_ids.some((id, index) => id !== invoiceDraftOrderIds[index]))

  const startProposal = (existing?: ProposalDraft) => {
    setProposalTemplates([])
    setProposalTemplateId('')
    setProposalTemplateName('')
    setProposalTemplateMessage('')
    setProposalTemplateError('')
    setProposalTemplateBusy(true)
    setDiscountRuleId(existing?.discount_rule_snapshot?.rule_id ?? '')
    setDiscountRuleName(existing?.discount_rule_snapshot?.rule_name ?? '')
    setDiscountRuleNotes('')
    setDiscountRuleMessage('')
    setDiscountRuleError('')
    setDiscountRuleBusy(true)
    void Promise.all([listLocalProposalTemplates(), listLocalDiscountRules()]).then(([templates, rules]) => {
      setProposalTemplates(templates)
      setDiscountRules(rules)
      const selected = rules.find(rule => rule.id === existing?.discount_rule_snapshot?.rule_id)
      if (selected) setDiscountRuleNotes(selected.notes)
    })
      .catch(error => {
        const message = error instanceof Error ? error.message : 'อ่าน Company Library ไม่สำเร็จ'
        setProposalTemplateError(message)
        setDiscountRuleError(message)
      })
      .finally(() => { setProposalTemplateBusy(false); setDiscountRuleBusy(false) })
    if (existing) { setProposalDraft(structuredClone(existing)); setProposalError(''); return }
    const takeoffById = new Map(takeoff.lines.map(line => [line.id, line]))
    const now = new Date()
    const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    const lines = boqLines.filter(line => line.net_quantity > 0).map(line => {
      const source = takeoffById.get(line.id)
      const bundleObject = source?.object_type === 'supplier.bundle_instance'
        ? project.objects[source.source_object_ids[0] ?? '']
        : undefined
      return {
        id: crypto.randomUUID(),
        source_takeoff_line_id: line.id,
        source_object_ids: source?.source_object_ids ?? [],
        phase: line.phase,
        cost_center: line.cost_center,
        mark: line.mark,
        description: source?.object_type === 'supplier.bundle_instance'
          ? `ชุดสินค้า · ${String((bundleObject?.module_data as Record<string, unknown> | undefined)?.bundle_name ?? line.mark)}`
          : [line.material, line.object_type].filter(Boolean).join(' · ') || line.mark,
        formula: line.formula,
        unit: line.unit,
        quantity: line.net_quantity,
        unit_rate_thb: line.net_quantity > 0 ? Number((line.total_direct_cost_thb / line.net_quantity).toFixed(2)) : 0,
        amount_thb: line.total_direct_cost_thb,
        product_margin_amount_thb: line.total_product_margin_thb,
        hide_on_proposal: line.hide_on_proposal === true,
      }
    })
    const createdAt = now.toISOString()
    const dateLabel = now.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
    const initialDirect = lines.reduce((sum, line) => sum + line.amount_thb, 0)
    const productMargin = lines.reduce((sum, line) => sum + (line.product_margin_amount_thb ?? 0), 0)
    const pricing = calculateProposalPricing({ direct_cost_thb: initialDirect, preliminaries_thb: boq.preliminaries_cost_thb, product_margin_amount_thb: productMargin })
    setProposalDraft({
      id: crypto.randomUUID(),
      title: `ข้อเสนอราคา · ${project.project.name} · ${dateLabel}`,
      status: 'draft',
      created_at: createdAt,
      updated_at: createdAt,
      valid_until: validUntil.toISOString().slice(0, 10),
      recipient_name: '',
      notes: '',
      terms: 'ราคานี้จัดทำจากปริมาณในแบบและอัตราอ้างอิงในระบบ กรุณาตรวจสอบหน้างานและยืนยันราคาก่อนตกลงจ้าง',
      estimate_basis: 'thai_reference_rates_v1',
      lines,
      field_data_snapshots: [],
      conditional_texts: [],
      preliminaries_thb: boq.preliminaries_cost_thb,
      direct_cost_thb: initialDirect,
      factor_f: pricing.factor_f,
      vat_rate: pricing.vat_rate,
      product_margin_amount_thb: pricing.product_margin_amount_thb,
      gross_margin_percent: pricing.gross_margin_percent,
      factor_f_subtotal_thb: pricing.factor_f_subtotal_thb,
      gross_margin_amount_thb: pricing.gross_margin_amount_thb,
      subtotal_before_discount_thb: pricing.subtotal_before_discount_thb,
      discount_percent: pricing.discount_percent,
      discount_amount_thb: pricing.discount_amount_thb,
      taxable_amount_thb: pricing.taxable_amount_thb,
      vat_amount_thb: pricing.vat_amount_thb,
      grand_total_thb: pricing.grand_total_thb,
      source_takeoff_warnings: [...new Set([...takeoff.warnings, ...boq.warnings])],
      status_events: [],
    })
    setProposalError('')
  }

  const transitionProposal = (proposal: ProposalDraft, targetStatus: ProposalStatusTarget, deviceSignature?: ProposalDeviceSignatureInput, recipientSignature?: ProposalRecipientSignature, note?: string) => {
    setProposalStatusMessage('')
    const saved = onTransitionProposal(proposal.id, targetStatus, deviceSignature, recipientSignature, note)
    if (saved) setProposalStatusMessage(`${proposal.title} · ${proposalStatusLabels[targetStatus]}`)
    else setProposalStatusMessage(`บันทึกสถานะของ “${proposal.title}” ไม่สำเร็จ · ตรวจสอบสถานะล่าสุดแล้วลองอีกครั้ง`)
    return saved
  }

  const printSavedProposal = (proposal: ProposalDraft) => {
    try { printProposalDocument(proposal, project.project.name) }
    catch { setProposalStatusMessage('เปิดหน้าพิมพ์ไม่สำเร็จ · อนุญาตหน้าต่างใหม่ในเบราว์เซอร์แล้วลองอีกครั้ง') }
  }

  const createChangeOrder = (proposal: ProposalDraft) => {
    if (proposal.status !== 'accepted') return
    const acceptedOrders = (project.change_orders ?? []).filter(order => order.proposal_id === proposal.id && order.status === 'accepted')
    const allOrders = (project.change_orders ?? []).filter(order => order.proposal_id === proposal.id)
    const contracted = new Map<string, {
      quantity: number; unit_rate_thb: number; product_margin_per_unit_thb: number; source_object_ids: string[]; phase: Phase
      cost_center: ProposalDraft['lines'][number]['cost_center']; mark: string; description: string
      formula: string; unit: ProposalDraft['lines'][number]['unit']; hide_on_proposal?: boolean
    }>()
    for (const line of proposal.lines) contracted.set(line.source_takeoff_line_id, {
      quantity: line.quantity, unit_rate_thb: line.unit_rate_thb, source_object_ids: line.source_object_ids,
      product_margin_per_unit_thb: (line.product_margin_amount_thb ?? 0) / line.quantity,
      phase: line.phase, cost_center: line.cost_center, mark: line.mark, description: line.description,
      formula: line.formula, unit: line.unit, hide_on_proposal: line.hide_on_proposal,
    })
    for (const order of acceptedOrders) for (const line of order.lines) {
      const current = contracted.get(line.source_takeoff_line_id)
      contracted.set(line.source_takeoff_line_id, {
        quantity: (current?.quantity ?? 0) + line.change_quantity,
        unit_rate_thb: line.unit_rate_thb, source_object_ids: line.source_object_ids,
        product_margin_per_unit_thb: line.product_margin_per_unit_thb ?? current?.product_margin_per_unit_thb ?? 0,
        phase: line.phase, cost_center: line.cost_center, mark: line.mark, description: line.description,
        formula: line.formula, unit: line.unit, hide_on_proposal: line.hide_on_proposal ?? current?.hide_on_proposal,
      })
    }
    const currentTakeoff = new Map(takeoff.lines.map(line => [line.id, line]))
    const currentBoq = new Map(boqLines.map(line => [line.id, line]))
    const lineIds = new Set([...contracted.keys(), ...currentBoq.keys()])
    const lines = [...lineIds].flatMap(sourceId => {
      const prior = contracted.get(sourceId)
      const current = currentBoq.get(sourceId)
      const currentQuantity = current?.net_quantity ?? 0
      const delta = Number((currentQuantity - (prior?.quantity ?? 0)).toFixed(3))
      if (Math.abs(delta) < 0.0005) return []
      const currentRate = current && current.net_quantity > 0 ? current.total_direct_cost_thb / current.net_quantity : 0
      const unitRate = prior?.unit_rate_thb ?? Number(currentRate.toFixed(2))
      const currentProductMarginPerUnit = current && current.net_quantity > 0 ? current.total_product_margin_thb / current.net_quantity : 0
      const productMarginPerUnit = prior ? prior.product_margin_per_unit_thb : currentProductMarginPerUnit
      const basis = current ?? prior
      if (!basis) return []
      const source = currentTakeoff.get(sourceId)
      return [{
        id: crypto.randomUUID(), source_takeoff_line_id: sourceId,
        source_object_ids: source?.source_object_ids ?? prior?.source_object_ids ?? [],
        phase: basis.phase, cost_center: basis.cost_center, mark: basis.mark,
        description: current ? [current.material, current.object_type].filter(Boolean).join(' · ') || current.mark : prior?.description ?? basis.mark,
        formula: current?.formula || prior?.formula || 'ปรับปริมาณตามแบบ', unit: basis.unit,
        change_quantity: delta, unit_rate_thb: unitRate,
        amount_thb: Number((delta * unitRate).toFixed(2)),
        product_margin_per_unit_thb: Number(productMarginPerUnit.toFixed(4)),
        product_margin_amount_thb: Number((delta * productMarginPerUnit).toFixed(2)),
        hide_on_proposal: current?.hide_on_proposal ?? prior?.hide_on_proposal ?? false,
      }]
    }).filter(line => line.amount_thb !== 0)
    if (!lines.length) {
      setChangeOrderMessage(`${proposal.title} · ปริมาณปัจจุบันตรงกับ scope ที่ตอบรับแล้ว ไม่มีส่วนต่างให้สร้าง`)
      return
    }
    const directDelta = Number(lines.reduce((sum, line) => sum + line.amount_thb, 0).toFixed(2))
    const productMarginDelta = Number(lines.reduce((sum, line) => sum + line.product_margin_amount_thb, 0).toFixed(2))
    const grossMargin = proposal.gross_margin_percent ?? 0
    const discount = proposal.discount_percent ?? 0
    const pricing = calculateChangeOrderPricing({
      direct_cost_delta_thb: directDelta, factor_f: proposal.factor_f,
      gross_margin_percent: grossMargin, discount_percent: discount, vat_rate: proposal.vat_rate,
      product_margin_delta_thb: productMarginDelta,
    })
    const baseContractTotal = Number((proposal.grand_total_thb + acceptedOrders.reduce((sum, order) => sum + order.grand_total_delta_thb, 0)).toFixed(2))
    const number = `CO-${String(allOrders.length + 1).padStart(2, '0')}`
    const now = new Date().toISOString()
    const changeOrder: ChangeOrderDraft = {
      id: crypto.randomUUID(), proposal_id: proposal.id, number,
      title: `${number} · ${proposal.title}`, status: 'draft', created_at: now, updated_at: now,
      basis: 'accepted_proposal_delta_v1', base_contract_total_thb: baseContractTotal,
      lines, direct_cost_delta_thb: directDelta, factor_f: proposal.factor_f,
      gross_margin_percent: grossMargin, discount_percent: discount, vat_rate: proposal.vat_rate,
      ...pricing, notes: '', source_takeoff_warnings: [...new Set([...takeoff.warnings, ...boq.warnings])], status_events: [],
    }
    if (onSaveChangeOrder(changeOrder)) setChangeOrderMessage(`${number} · บันทึกแบบร่างส่วนต่าง ${lines.length} รายการ · ตรวจ scope และยอดก่อนส่ง`)
    else setChangeOrderMessage(`บันทึก ${number} ไม่สำเร็จ · ตรวจสถานะข้อเสนอและยอดสัญญาล่าสุดแล้วลองอีกครั้ง`)
  }

  const transitionChangeOrder = (changeOrder: ChangeOrderDraft, targetStatus: ProposalStatusTarget) => {
    if (onTransitionChangeOrder(changeOrder.id, targetStatus)) setChangeOrderMessage(`${changeOrder.number} · ${changeOrderStatusLabels[targetStatus]}`)
    else setChangeOrderMessage(`เปลี่ยนสถานะ ${changeOrder.number} ไม่สำเร็จ · ตรวจยอดสัญญาล่าสุดแล้วลองอีกครั้ง`)
  }

  const createInvoice = (proposal: ProposalDraft) => {
    if (proposal.status !== 'accepted') return
    const acceptedOrders = (project.change_orders ?? []).filter(order => order.proposal_id === proposal.id && order.status === 'accepted')
    const approvedChangeOrderTotal = Number(acceptedOrders.reduce((sum, order) => sum + order.grand_total_delta_thb, 0).toFixed(2))
    const contractTotal = Number((proposal.grand_total_thb + approvedChangeOrderTotal).toFixed(2))
    const now = new Date()
    const dueDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    let sequence = (project.invoices?.length ?? 0) + 1
    let number = `INV-${String(sequence).padStart(3, '0')}`
    while (project.invoices?.some(invoice => invoice.number.toLocaleLowerCase('en-US') === number.toLocaleLowerCase('en-US'))) {
      sequence += 1
      number = `INV-${String(sequence).padStart(3, '0')}`
    }
    const amounts = calculateInvoiceAmounts(contractTotal, 30, proposal.vat_rate)
    setInvoiceDraft({
      id: crypto.randomUUID(), proposal_id: proposal.id, number,
      title: `งวดที่ ${(project.invoices?.filter(invoice => invoice.proposal_id === proposal.id).length ?? 0) + 1} · ${project.project.name}`,
      status: 'draft', created_at: now.toISOString(), updated_at: now.toISOString(), due_date: dueDate,
      basis: 'accepted_contract_billing_v1', recipient_name: proposal.recipient_name,
      ...(proposal.recipient_address ? { recipient_address: proposal.recipient_address } : {}),
      proposal_total_thb: proposal.grand_total_thb, approved_change_order_total_thb: approvedChangeOrderTotal,
      contract_total_thb: contractTotal, source_change_order_ids: acceptedOrders.map(order => order.id).sort(),
      billing_percent: 30, vat_rate: proposal.vat_rate, ...amounts, notes: '', status_events: [], payments: [],
    })
    setInvoiceError('')
  }

  const editInvoice = (invoice: InvoiceDraft) => {
    if (invoice.status !== 'draft') return
    setInvoiceDraft(structuredClone(invoice))
    setInvoiceError('')
  }

  const refreshInvoiceSnapshot = () => {
    if (!invoiceDraft || !invoiceDraftProposal || invoiceDraftProposal.status !== 'accepted') return
    const approvedOrders = (project.change_orders ?? []).filter(order => order.proposal_id === invoiceDraft.proposal_id && order.status === 'accepted')
    const approvedTotal = Number(approvedOrders.reduce((sum, order) => sum + order.grand_total_delta_thb, 0).toFixed(2))
    updateInvoiceDraft({
      proposal_total_thb: invoiceDraftProposal.grand_total_thb,
      approved_change_order_total_thb: approvedTotal,
      contract_total_thb: Number((invoiceDraftProposal.grand_total_thb + approvedTotal).toFixed(2)),
      source_change_order_ids: approvedOrders.map(order => order.id).sort(),
      recipient_name: invoiceDraftProposal.recipient_name,
      recipient_address: invoiceDraftProposal.recipient_address,
    })
    setInvoiceError('')
  }

  const updateInvoiceDraft = (changes: Partial<InvoiceDraft>) => setInvoiceDraft(current => {
    if (!current) return current
    const next = { ...current, ...changes }
    const amounts = calculateInvoiceAmounts(next.contract_total_thb, next.billing_percent, next.vat_rate)
    return { ...next, ...amounts }
  })

  const saveInvoice = () => {
    if (!invoiceDraft) return
    const invoice = { ...invoiceDraft, updated_at: new Date().toISOString() }
    if (onSaveInvoice(invoice)) {
      setInvoiceDraft(null)
      setInvoiceMessage(`${invoice.number} · บันทึก snapshot แบบร่างแล้ว`)
      setInvoiceError('')
    } else setInvoiceError(`บันทึก ${invoice.number} ไม่สำเร็จ · ตรวจข้อเสนอที่ตอบรับและ change orders ที่อนุมัติล่าสุด`)
  }

  const transitionInvoice = (invoice: InvoiceDraft, targetStatus: InvoiceStatusTarget) => {
    if (onTransitionInvoice(invoice.id, targetStatus)) setInvoiceMessage(`${invoice.number} · ${invoiceStatusLabels[targetStatus]}`)
    else setInvoiceMessage(`เปลี่ยนสถานะ ${invoice.number} ไม่สำเร็จ · ตรวจยอดคงเหลือหรือประวัติรับชำระแล้วลองอีกครั้ง`)
  }

  const startInvoicePayment = (invoice: InvoiceDraft) => {
    setPaymentDraft({ invoiceId: invoice.id, amount: getInvoiceOutstandingAmount(invoice).toFixed(2), method: 'bank_transfer', reference: '', note: '' })
    setPaymentError('')
  }

  const saveInvoicePayment = () => {
    if (!paymentDraft) return
    const amount = Number(paymentDraft.amount)
    if (!Number.isFinite(amount) || amount <= 0) { setPaymentError('ใส่ยอดรับชำระที่มากกว่า 0 บาท'); return }
    if (onRecordInvoicePayment(paymentDraft.invoiceId, amount, paymentDraft.method, paymentDraft.reference, paymentDraft.note)) {
      setInvoiceMessage('บันทึกรับชำระแล้ว · ยอดคงเหลือและสถานะใบแจ้งหนี้อัปเดตแล้ว')
      setPaymentDraft(null)
      setPaymentError('')
    } else setPaymentError('บันทึกรับชำระไม่สำเร็จ · ตรวจยอดคงเหลือแล้วลองอีกครั้ง')
  }

  const printSavedInvoice = (invoice: InvoiceDraft, proposal: ProposalDraft) => {
    try { printInvoiceDocument(invoice, proposal, project.project.name) }
    catch { setInvoiceMessage(`เปิดเอกสาร ${invoice.number} เพื่อพิมพ์ไม่สำเร็จ · อนุญาตหน้าต่างใหม่แล้วลองอีกครั้ง`) }
  }

  const printSavedChangeOrder = (changeOrder: ChangeOrderDraft, proposal: ProposalDraft) => {
    try { printChangeOrderDocument(changeOrder, proposal, project.project.name) }
    catch { setChangeOrderMessage(`เปิดเอกสาร ${changeOrder.number} เพื่อพิมพ์ไม่สำเร็จ · อนุญาตหน้าต่างใหม่แล้วลองอีกครั้ง`) }
  }

  const editChangeOrder = (changeOrder: ChangeOrderDraft) => {
    setChangeOrderDraft(structuredClone(changeOrder))
    setChangeOrderError('')
  }

  const updateChangeOrderDraft = (changes: Partial<ChangeOrderDraft>) => setChangeOrderDraft(current => {
    if (!current) return current
    const updated = { ...current, ...changes }
    const lines = updated.lines.map(line => ({
      ...line,
      amount_thb: Number((line.change_quantity * line.unit_rate_thb).toFixed(2)),
      ...(line.product_margin_per_unit_thb !== undefined
        ? { product_margin_amount_thb: Number((line.change_quantity * line.product_margin_per_unit_thb).toFixed(2)) }
        : {}),
    }))
      .filter(line => line.change_quantity !== 0)
    const directDelta = Number(lines.reduce((sum, line) => sum + line.amount_thb, 0).toFixed(2))
    const productMarginDelta = Number(lines.reduce((sum, line) => sum + (line.product_margin_amount_thb ?? 0), 0).toFixed(2))
    const pricing = calculateChangeOrderPricing({
      direct_cost_delta_thb: directDelta, factor_f: updated.factor_f,
      gross_margin_percent: updated.gross_margin_percent, discount_percent: updated.discount_percent,
      vat_rate: updated.vat_rate, product_margin_delta_thb: productMarginDelta,
    })
    return { ...updated, lines, direct_cost_delta_thb: directDelta, ...pricing }
  })

  const saveChangeOrder = () => {
    if (!changeOrderDraft) return
    if (changeOrderDraft.lines.length === 0) { setChangeOrderError('เพิ่มอย่างน้อยหนึ่งรายการใน scope ก่อนบันทึก'); return }
    if (onSaveChangeOrder({ ...changeOrderDraft, updated_at: new Date().toISOString() })) {
      setChangeOrderDraft(null)
      setChangeOrderMessage(`${changeOrderDraft.number} · บันทึก snapshot ที่ตรวจแก้แล้ว`)
    } else setChangeOrderError('บันทึกไม่ได้ · ฐานสัญญาอาจเปลี่ยนหลังมี change order อื่นได้รับอนุมัติ')
  }

  const updateProposal = (changes: Partial<ProposalDraft>) => setProposalDraft(current => {
    if (!current) return current
    const updated = { ...current, ...changes }
    if (Object.hasOwn(changes, 'discount_percent') && changes.discount_percent !== current.discount_percent
      && !Object.hasOwn(changes, 'discount_rule_snapshot')) updated.discount_rule_snapshot = undefined
    const direct = updated.lines.reduce((sum, line) => sum + line.amount_thb, 0)
    const productMargin = updated.lines.reduce((sum, line) => sum + (line.product_margin_amount_thb ?? 0), 0)
    const pricing = calculateProposalPricing({
      direct_cost_thb: direct,
      preliminaries_thb: updated.preliminaries_thb,
      product_margin_amount_thb: productMargin,
      gross_margin_percent: updated.gross_margin_percent ?? 0,
      discount_percent: updated.discount_percent ?? 0,
    })
    return {
      ...updated,
      direct_cost_thb: direct,
      factor_f: pricing.factor_f,
      vat_rate: pricing.vat_rate,
      product_margin_amount_thb: pricing.product_margin_amount_thb,
      gross_margin_percent: pricing.gross_margin_percent,
      factor_f_subtotal_thb: pricing.factor_f_subtotal_thb,
      gross_margin_amount_thb: pricing.gross_margin_amount_thb,
      subtotal_before_discount_thb: pricing.subtotal_before_discount_thb,
      discount_percent: pricing.discount_percent,
      discount_amount_thb: pricing.discount_amount_thb,
      taxable_amount_thb: pricing.taxable_amount_thb,
      vat_amount_thb: pricing.vat_amount_thb,
      grand_total_thb: pricing.grand_total_thb,
    }
  })

  const applyDiscountRule = (id: string) => {
    setDiscountRuleId(id)
    setDiscountRuleMessage('')
    setDiscountRuleError('')
    const rule = discountRules.find(item => item.id === id)
    if (!rule) {
      setDiscountRuleName('')
      setDiscountRuleNotes('')
      updateProposal({ discount_rule_snapshot: undefined })
      return
    }
    setDiscountRuleName(rule.name)
    setDiscountRuleNotes(rule.notes)
    updateProposal({
      discount_percent: rule.discount_percent,
      discount_rule_snapshot: { rule_id: rule.id, rule_name: rule.name, discount_percent: rule.discount_percent },
    })
    setDiscountRuleMessage(`ใช้กฎ “${rule.name}” · ${rule.discount_percent.toLocaleString('th-TH')}% · บันทึกเป็น snapshot ในข้อเสนอนี้`)
  }

  const saveDiscountRule = async () => {
    if (!proposalDraft) return
    setDiscountRuleBusy(true)
    setDiscountRuleError('')
    setDiscountRuleMessage('')
    try {
      const saved = await saveLocalDiscountRule({
        ...(discountRules.some(rule => rule.id === discountRuleId) ? { id: discountRuleId } : {}),
        name: discountRuleName,
        discount_percent: proposalDraft.discount_percent ?? 0,
        notes: discountRuleNotes,
      })
      setDiscountRules(await listLocalDiscountRules())
      setDiscountRuleId(saved.id)
      setDiscountRuleName(saved.name)
      setDiscountRuleNotes(saved.notes)
      updateProposal({
        discount_percent: saved.discount_percent,
        discount_rule_snapshot: { rule_id: saved.id, rule_name: saved.name, discount_percent: saved.discount_percent },
      })
      setDiscountRuleMessage(`บันทึก “${saved.name}” ใน Company Library แล้ว · ซิงค์กับทีมเพื่อใช้ข้ามอุปกรณ์`)
    } catch (error) {
      setDiscountRuleError(error instanceof Error ? error.message : 'บันทึกกฎส่วนลดไม่สำเร็จ')
    } finally {
      setDiscountRuleBusy(false)
    }
  }

  const toggleProposalFieldForm = (form: FieldFormRecord, checked: boolean) => {
    if (!proposalDraft) return
    const selected = proposalDraft.field_data_snapshots ?? []
    const next = checked
      ? selected.some(snapshot => snapshot.field_form_id === form.id) ? selected : [...selected, snapshotSubmittedFieldForm(form, project)]
      : selected.filter(snapshot => snapshot.field_form_id !== form.id)
    updateProposal({ field_data_snapshots: next })
  }

  const updateProposalConditionalRule = (ruleId: string, changes: Partial<ProposalConditionalTextRule>) => {
    if (!proposalDraft) return
    const rules = (proposalDraft.conditional_texts ?? []).map(proposalRuleFromSnapshot)
      .map(rule => rule.id === ruleId ? { ...rule, ...changes } : rule)
    updateProposal({ conditional_texts: resolveProposalConditionalTexts(rules, submittedFieldForms) })
  }

  const addProposalConditionalRule = () => {
    const option = conditionalFieldOptions[0]
    if (!option || !proposalDraft) return
    const operator: ProposalConditionalTextRule['operator'] = option.input_type === 'checkbox' ? 'is_on'
      : option.input_type === 'select' ? 'equals' : 'not_empty'
    const rule: ProposalConditionalTextRule = {
      id: crypto.randomUUID(), template_id: option.template_id, template_title: option.template_title,
      field_id: option.field_id, field_label: option.field_label, operator,
      ...(operator === 'equals' ? { expected_value: option.options?.[0] ?? '' } : {}),
      content: `{{${option.field_id}}}`,
    }
    updateProposal({ conditional_texts: resolveProposalConditionalTexts([...(proposalDraft.conditional_texts ?? []).map(proposalRuleFromSnapshot), rule], submittedFieldForms) })
  }

  const removeProposalConditionalRule = (ruleId: string) => {
    if (!proposalDraft) return
    const rules = (proposalDraft.conditional_texts ?? []).filter(rule => rule.id !== ruleId).map(proposalRuleFromSnapshot)
    updateProposal({ conditional_texts: resolveProposalConditionalTexts(rules, submittedFieldForms) })
  }

  const applyProposalTemplate = (templateId: string) => {
    setProposalTemplateId(templateId)
    setProposalTemplateMessage('')
    setProposalTemplateError('')
    const template = proposalTemplates.find(item => item.id === templateId)
    if (!template) { setProposalTemplateName(''); return }
    setProposalTemplateName(template.name)
    const validUntil = new Date(Date.now() + template.validity_days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    setProposalDraft(current => current ? {
      ...current, notes: template.notes, terms: template.terms, valid_until: validUntil,
      conditional_texts: resolveProposalConditionalTexts(template.conditional_text_rules ?? [], submittedFieldForms),
    } : current)
    setProposalTemplateMessage(`ใช้แม่แบบ “${template.name}” แล้ว · ตรวจข้อมูลลูกค้าและราคาอีกครั้ง`)
  }

  const saveProposalTemplate = async () => {
    if (!proposalDraft) return
    const until = proposalDraft.valid_until ? Date.parse(`${proposalDraft.valid_until}T00:00:00`) : NaN
    const days = Number.isFinite(until)
      ? Math.max(1, Math.min(365, Math.ceil((until - Date.now()) / (24 * 60 * 60 * 1000))))
      : 30
    setProposalTemplateBusy(true)
    setProposalTemplateError('')
    setProposalTemplateMessage('')
    try {
      const saved = await saveLocalProposalTemplate({
        ...(proposalTemplateId ? { id: proposalTemplateId } : {}),
        name: proposalTemplateName,
        notes: proposalDraft.notes,
        terms: proposalDraft.terms,
        validity_days: days,
        conditional_text_rules: (proposalDraft.conditional_texts ?? []).map(proposalRuleFromSnapshot),
      })
      setProposalTemplates(await listLocalProposalTemplates())
      setProposalTemplateId(saved.id)
      setProposalTemplateName(saved.name)
      setProposalTemplateMessage(`บันทึกแม่แบบ “${saved.name}” ในอุปกรณ์นี้แล้ว`)
    } catch (error) {
      setProposalTemplateError(error instanceof Error ? error.message : 'บันทึกแม่แบบข้อเสนอไม่สำเร็จ')
    } finally {
      setProposalTemplateBusy(false)
    }
  }

  const deleteProposalTemplate = async () => {
    const template = proposalTemplates.find(item => item.id === proposalTemplateId)
    if (!template || !window.confirm(`ลบแม่แบบ “${template.name}” ออกจาก Library ในอุปกรณ์นี้หรือไม่?`)) return
    setProposalTemplateBusy(true)
    setProposalTemplateError('')
    setProposalTemplateMessage('')
    try {
      await deleteLocalProposalTemplate(template.id)
      setProposalTemplates(await listLocalProposalTemplates())
      setProposalTemplateId('')
      setProposalTemplateName('')
      setProposalTemplateMessage(`ลบแม่แบบ “${template.name}” แล้ว`)
    } catch (error) {
      setProposalTemplateError(error instanceof Error ? error.message : 'ลบแม่แบบข้อเสนอไม่สำเร็จ')
    } finally {
      setProposalTemplateBusy(false)
    }
  }

  const saveProposal = () => {
    if (!proposalDraft?.recipient_name.trim()) { setProposalError('กรอกชื่อลูกค้าก่อนบันทึก'); return }
    const next = { ...proposalDraft, updated_at: new Date().toISOString() }
    if (onSaveProposal(next)) setProposalDraft(null)
    else setProposalError('บันทึกไม่สำเร็จ กรุณาตรวจข้อความแจ้งเตือนของโครงการ')
  }
  const visibleRates = Object.entries(rateDraft ?? {}).filter(([key]) => {
    const search = rateQuery.trim().toLocaleLowerCase('th-TH')
    return !search || `${key} ${rateLabels[key] ?? key}`.toLocaleLowerCase('th-TH').includes(search)
  })
  const selectedRateBook = rateBooks.find(book => book.id === selectedRateBookId)
  const proposalPricing = proposalDraft ? calculateProposalPricing({
    direct_cost_thb: proposalDraft.direct_cost_thb,
    preliminaries_thb: proposalDraft.preliminaries_thb,
    product_margin_amount_thb: proposalDraft.product_margin_amount_thb ?? 0,
    gross_margin_percent: proposalDraft.gross_margin_percent ?? 0,
    discount_percent: proposalDraft.discount_percent ?? 0,
  }) : null

  const openRateLibrary = () => {
    setRateDraft({ ...DEFAULT_THAI_UNIT_RATES, ...project.takeoff_rates })
    setRateQuery('')
    setRateBookName('')
    setRateBookMessage('')
    setRateBookError('')
    setRateBookBusy(true)
    void listLocalTakeoffPriceBooks().then(books => {
      setRateBooks(books)
      setSelectedRateBookId(current => books.some(book => book.id === current) ? current : books[0]?.id ?? '')
    }).catch(error => setRateBookError(error instanceof Error ? error.message : 'อ่าน Library ราคาไม่สำเร็จ'))
      .finally(() => setRateBookBusy(false))
  }

  const saveRateBook = async (id?: string) => {
    if (!rateDraft) return
    setRateBookBusy(true)
    setRateBookError('')
    setRateBookMessage('')
    try {
      const saved = await saveLocalTakeoffPriceBook({ id, name: rateBookName.trim() || (id ? selectedRateBook?.name ?? '' : ''), rates: rateDraft })
      const books = await listLocalTakeoffPriceBooks()
      setRateBooks(books)
      setSelectedRateBookId(saved.id)
      setRateBookName(saved.name)
      setRateBookMessage(`บันทึก “${saved.name}” ใน Library ของอุปกรณ์นี้แล้ว`)
    } catch (error) {
      setRateBookError(error instanceof Error ? error.message : 'บันทึก Library ราคาไม่สำเร็จ')
    } finally {
      setRateBookBusy(false)
    }
  }

  const deleteRateBook = async (book: LocalTakeoffPriceBook) => {
    if (!window.confirm(`ลบชุดราคา “${book.name}” ออกจาก Library ในอุปกรณ์นี้หรือไม่?`)) return
    setRateBookBusy(true)
    setRateBookError('')
    setRateBookMessage('')
    try {
      await deleteLocalTakeoffPriceBook(book.id)
      const books = await listLocalTakeoffPriceBooks()
      setRateBooks(books)
      setSelectedRateBookId(books[0]?.id ?? '')
      setRateBookName('')
      setRateBookMessage(`ลบ “${book.name}” ออกจาก Library แล้ว`)
    } catch (error) {
      setRateBookError(error instanceof Error ? error.message : 'ลบ Library ราคาไม่สำเร็จ')
    } finally {
      setRateBookBusy(false)
    }
  }

  const exportRateBook = () => {
    if (!selectedRateBook) return
    const content = JSON.stringify({
      format: 'constructflow.takeoff-price-book',
      schema_version: 1,
      currency: 'THB',
      name: selectedRateBook.name,
      rates: selectedRateBook.rates,
      exported_at: new Date().toISOString(),
    }, null, 2)
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${selectedRateBook.name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'constructflow-price-book'}.cfprice.json`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const importRateBook = async (file: File | null) => {
    if (!file) return
    setRateBookBusy(true)
    setRateBookError('')
    setRateBookMessage('')
    try {
      if (file.size > 2_000_000) throw new Error('ไฟล์ Library ราคาต้องมีขนาดไม่เกิน 2 MB')
      const payload: unknown = JSON.parse(await file.text())
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('ไฟล์นี้ไม่ใช่ Library ราคาของ ConstructFlow')
      const record = payload as Record<string, unknown>
      if (record.format !== 'constructflow.takeoff-price-book' || record.schema_version !== 1 || record.currency !== 'THB')
        throw new Error('รูปแบบหรือรุ่นของไฟล์ Library ราคาไม่รองรับ')
      if (typeof record.name !== 'string' || !record.name.trim() || !record.rates || typeof record.rates !== 'object' || Array.isArray(record.rates))
        throw new Error('ไฟล์นี้ไม่มีชื่อชุดราคาหรือรายการราคาที่ถูกต้อง')
      validateProjectTakeoffRates(record.rates as Record<string, ProjectTakeoffRate>)
      const books = await listLocalTakeoffPriceBooks()
      const baseName = record.name.trim().slice(0, 80)
      let name = baseName
      let suffix = 2
      while (books.some(book => book.name.toLocaleLowerCase('th-TH') === name.toLocaleLowerCase('th-TH'))) {
        const ending = ` (นำเข้า ${suffix++})`
        name = `${baseName.slice(0, 100 - ending.length)}${ending}`
      }
      const saved = await saveLocalTakeoffPriceBook({ name, rates: record.rates as Record<string, ProjectTakeoffRate> })
      const updatedBooks = await listLocalTakeoffPriceBooks()
      setRateBooks(updatedBooks)
      setSelectedRateBookId(saved.id)
      setRateBookName(saved.name)
      setRateBookMessage(`นำเข้า “${saved.name}” แล้ว · เลือก “นำชุดราคามาใช้” เพื่อใส่ในแบบร่าง`)
    } catch (error) {
      setRateBookError(error instanceof Error ? error.message : 'นำเข้า Library ราคาไม่สำเร็จ')
    } finally {
      setRateBookBusy(false)
      if (rateBookFileInput.current) rateBookFileInput.current.value = ''
    }
  }

  const exportCompanyLibrary = async () => {
    setCompanyLibraryBusy(true)
    setCompanyLibraryError('')
    setCompanyLibraryMessage('')
    try {
      const bundle = await createLocalCompanyLibraryBundle()
      const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'constructflow-company-library.cfcompanylib.json'
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setCompanyLibraryMessage(`ส่งออก Library แล้ว · แบบฟอร์ม ${bundle.field_form_templates?.length ?? 0} · ข้อเสนอ ${bundle.proposal_templates.length} · กฎส่วนลด ${bundle.discount_rules?.length ?? 0} · Price books ${bundle.price_books.length} · สินค้า ${bundle.supplier_products.length} · กลุ่มสินค้า ${bundle.supplier_product_groups.length} · Bundles ${bundle.supplier_product_bundles.length}`)
    } catch (error) {
      setCompanyLibraryError(error instanceof Error ? error.message : 'ส่งออก Company Library ไม่สำเร็จ')
    } finally {
      setCompanyLibraryBusy(false)
    }
  }

  const importCompanyLibrary = async (file: File | null) => {
    if (!file) return
    setCompanyLibraryBusy(true)
    setCompanyLibraryError('')
    setCompanyLibraryMessage('')
    try {
      if (file.size > 20_000_000) throw new Error('ไฟล์ Company Library ต้องมีขนาดไม่เกิน 20 MB')
      const imported = await importLocalCompanyLibraryBundle(JSON.parse(await file.text()) as unknown)
      const books = await listLocalTakeoffPriceBooks()
      const rules = await listLocalDiscountRules()
      setRateBooks(books)
      setDiscountRules(rules)
      setSelectedRateBookId(current => books.some(book => book.id === current) ? current : books[0]?.id ?? '')
      setCompanyLibraryRevision(current => current + 1)
      setCompanyLibraryMessage(`นำเข้าแล้ว · แบบฟอร์ม ${imported.field_form_templates} · ชุดราคา ${imported.price_books} · ข้อเสนอ ${imported.proposal_templates} · กฎส่วนลด ${imported.discount_rules} · สินค้า ${imported.supplier_products} · กลุ่มสินค้า ${imported.supplier_product_groups} · Bundle ${imported.supplier_product_bundles}`)
    } catch (error) {
      setCompanyLibraryError(error instanceof Error ? error.message : 'นำเข้า Company Library ไม่สำเร็จ')
    } finally {
      setCompanyLibraryBusy(false)
      if (companyLibraryFileInput.current) companyLibraryFileInput.current.value = ''
    }
  }

  const syncCompanyLibrary = async () => {
    setCompanyLibraryBusy(true)
    setCompanyLibrarySyncError('')
    setCompanyLibrarySyncMessage('')
    try {
      const result = await syncCompanyLibraryWithProject(project.project.id)
      const [books, templates, rules] = await Promise.all([listLocalTakeoffPriceBooks(), listLocalProposalTemplates(), listLocalDiscountRules()])
      setRateBooks(books)
      setSelectedRateBookId(current => books.some(book => book.id === current) ? current : books[0]?.id ?? '')
      setProposalTemplates(templates)
      setDiscountRules(rules)
      setCompanyLibraryRevision(current => current + 1)
      const scopeLabel = result.scope === 'company' ? 'Company Library ระดับบริษัท (ใช้ข้ามโครงการ)' : 'Company Library ของทีมโครงการ'
      setCompanyLibrarySyncMessage(result.canWrite
        ? `ซิงค์ ${scopeLabel} แล้ว · เวอร์ชัน ${result.version}${result.imported ? ' · รวมรายการจากอุปกรณ์ทีมแล้ว' : ''}`
        : `รับ ${scopeLabel} แล้ว · เวอร์ชัน ${result.version} · สิทธิ์ Viewer อ่านได้อย่างเดียว`)
    } catch (error) {
      setCompanyLibrarySyncError(error instanceof Error ? error.message : 'ซิงค์ Company Library ไม่สำเร็จ')
    } finally {
      setCompanyLibraryBusy(false)
    }
  }

  return <section className="cf-takeoff-panel" aria-label="ปริมาณและ BOQ">
    <div className="cf-takeoff-heading">
      <div>
        <strong>ปริมาณและ BOQ</strong>
        <span>{filteredLines.length.toLocaleString('th-TH')} จาก {takeoff.lines.length.toLocaleString('th-TH')} รายการ · จัดกลุ่มตาม{takeoffGroupModeLabels[takeoffGroupMode]}</span>
      </div>
      <button type="button" className="cf-takeoff-document-action" onClick={onOpenConstruction} title="เปิดชุดแบบและตาราง A3 20 แผ่น">
        <FileText size={16} aria-hidden="true" /><span>ชุดแบบ A3</span>
      </button>
    </div>
    <nav className="cf-takeoff-workflow-nav" aria-label="ขั้นตอนปริมาณและเอกสาร">
      <button type="button" onClick={() => document.getElementById('cf-takeoff-summary')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>สรุปราคา</button>
      <button type="button" onClick={() => document.getElementById('cf-takeoff-lines')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>รายการ BOQ · {takeoff.lines.length}</button>
      {(project.proposal_drafts?.length ?? 0) > 0 && <button type="button" onClick={() => document.getElementById('cf-takeoff-proposals')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>ข้อเสนอ · {project.proposal_drafts!.length}</button>}
      {(project.change_orders?.length ?? 0) > 0 && <button type="button" onClick={() => document.getElementById('cf-change-orders')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Change orders · {project.change_orders!.length}</button>}
      {(project.proposal_drafts?.some(proposal => proposal.status === 'accepted') ?? false) && <button type="button" onClick={() => document.getElementById('cf-invoices')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>ใบแจ้งหนี้ · {project.invoices?.length ?? 0}</button>}
    </nav>

    <section id="cf-takeoff-summary" className="cf-takeoff-summary" aria-label="สรุปราคาประมาณ">
      <div className="cf-takeoff-total">
        <span>ยอดประมาณรวม · Factor F และ VAT 7%</span>
        <strong>฿{boq.grand_total_thb.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</strong>
        <button type="button" className="cf-takeoff-proposal-button" onClick={() => startProposal()} disabled={!takeoff.lines.length}>
          <FileText size={16} aria-hidden="true" /><span>สร้างข้อเสนอ</span>
        </button>
      </div>
      <button type="button" className="cf-takeoff-rate-trigger" onClick={openRateLibrary}>ตั้งราคา Library · อัตราอ้างอิง</button>
      <dl className="cf-takeoff-cost-summary">
        <div><dt>ต้นทุนตรง</dt><dd>฿{boq.total_direct_cost_thb.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</dd></div>
        <div><dt>เตรียมการ</dt><dd>฿{boq.preliminaries_cost_thb.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</dd></div>
        <div><dt>Factor F</dt><dd>{boq.factor_f.factor_f.toFixed(4)}</dd></div>
      </dl>
      <div className="cf-takeoff-centers">
        <span data-phase="demolition">รื้อถอน ฿{boq.cost_centers.demolition_site_prep.total_direct_cost_thb.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</span>
        <span data-phase="new">สร้างใหม่ ฿{boq.cost_centers.new_construction.total_direct_cost_thb.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</span>
        <span data-phase="joint">รอยต่อ ฿{boq.cost_centers.remodeling_joint_treatment.total_direct_cost_thb.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</span>
      </div>
    </section>

    {(project.proposal_drafts?.length ?? 0) > 0 && <section id="cf-takeoff-proposals" className="cf-takeoff-proposals" aria-label="ข้อเสนอที่บันทึกไว้">
      <div className="cf-takeoff-proposals-heading"><strong>ข้อเสนอที่บันทึกไว้</strong><p>สร้างลิงก์ snapshot ให้ลูกค้าตรวจและตอบกลับได้ · การแชร์เป็นการส่งเอง และไม่มีการยืนยันตัวบุคคลหรือผู้ให้บริการ e-signature</p></div>
      {proposalStatusMessage && <p className="cf-takeoff-proposal-feedback" role="status">{proposalStatusMessage}</p>}
      {project.proposal_drafts!.map(proposal => {
        const lastEvent = proposal.status_events?.at(-1)
        return <article className="cf-takeoff-proposal-row" key={proposal.id}>
          <div className="cf-takeoff-proposal-summary">
            {proposal.status === 'draft'
              ? <button type="button" className="cf-takeoff-proposal-title" onClick={() => startProposal(proposal)}>{proposal.title}</button>
              : <strong className="cf-takeoff-proposal-title-static">{proposal.title}</strong>}
            <div className="cf-takeoff-proposal-meta"><span className="cf-proposal-status" data-status={proposal.status}>{proposalStatusLabels[proposal.status]}</span><b>฿{proposal.grand_total_thb.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</b></div>
            {lastEvent && <small>อัปเดต {new Date(lastEvent.occurred_at).toLocaleString('th-TH')}{lastEvent.note ? ` · ${lastEvent.note}` : ''}</small>}
            {!!proposal.status_events?.length && <details className="cf-takeoff-proposal-history">
              <summary>ประวัติสถานะ {proposal.status_events.length} รายการ</summary>
              <ol>{proposal.status_events.map(event => <li key={event.command_id}>
                <span>{proposalStatusLabels[event.from_status]} → {proposalStatusLabels[event.to_status]}</span>
                <small>{new Date(event.occurred_at).toLocaleString('th-TH')} · {event.actor.kind === 'human' ? 'ผู้ใช้' : event.actor.kind}</small>
                {event.note && <small>{event.note}</small>}
                {event.device_signature && <small>ลงนามบนอุปกรณ์โดย {event.device_signature.signer_name} · {new Date(event.device_signature.captured_at).toLocaleString('th-TH')} · ยังไม่มีการยืนยันตัวบุคคล</small>}
                {event.recipient_signature && <small>ตอบกลับผ่านลิงก์โดย {event.recipient_signature.signer_name} · {new Date(event.recipient_signature.captured_at).toLocaleString('th-TH')} · ไม่ได้ยืนยันตัวบุคคล · รหัสลิงก์ {event.recipient_signature.approval_link_id.slice(0, 8)}</small>}
              </li>)}</ol>
            </details>}
          </div>
          <div className="cf-takeoff-proposal-actions">
            {proposal.status === 'draft' && <button type="button" onClick={() => transitionProposal(proposal, 'sent')}>บันทึกว่าส่งแล้ว</button>}
            {proposal.status === 'sent' && <>
              <button type="button" onClick={() => setApprovalLinkProposal(proposal)}><Share2 size={16} />ส่งลิงก์ให้ลูกค้าตอบกลับ</button>
              <button type="button" onClick={() => transitionProposal(proposal, 'accepted')}>บันทึกตอบรับ</button>
              <button type="button" onClick={() => setSignatureProposal(proposal)}>ลงนามบนอุปกรณ์</button>
              <button type="button" onClick={() => transitionProposal(proposal, 'declined')}>บันทึกไม่รับ</button>
            </>}
            {(proposal.status === 'draft' || proposal.status === 'sent') && <button type="button" className="is-quiet" onClick={() => transitionProposal(proposal, 'void')}>ยกเลิกข้อเสนอ</button>}
            {proposal.status === 'accepted' && <>
              <button type="button" onClick={() => createChangeOrder(proposal)}>สร้าง change order</button>
              <button type="button" onClick={() => createInvoice(proposal)}>สร้างใบแจ้งหนี้ / งวด</button>
            </>}
            <button type="button" className="is-quiet" aria-label={`พิมพ์ข้อเสนอ ${proposal.title}`} onClick={() => printSavedProposal(proposal)}>พิมพ์</button>
          </div>
        </article>
      })}
      {changeOrderMessage && <p className="cf-takeoff-proposal-feedback" role="status">{changeOrderMessage}</p>}
      {(project.change_orders?.length ?? 0) > 0 && <section id="cf-change-orders" className="cf-change-orders" aria-label="Change orders ที่บันทึกไว้">
        <div className="cf-change-orders-heading"><strong>Change orders</strong><p>ส่วนต่าง scope เทียบกับข้อเสนอที่ตอบรับและ change orders ที่อนุมัติแล้ว · เอกสารและสถานะเป็นการติดตามด้วยตนเอง</p></div>
        {project.change_orders!.map(changeOrder => {
          const baseProposal = project.proposal_drafts?.find(item => item.id === changeOrder.proposal_id)
          const totalAfterApproval = changeOrder.base_contract_total_thb + changeOrder.grand_total_delta_thb
          const lastEvent = changeOrder.status_events?.at(-1)
          return <article className="cf-change-order-row" key={changeOrder.id}>
            <div className="cf-change-order-summary">
              <strong>{changeOrder.number} · {baseProposal?.recipient_name || baseProposal?.title || 'ข้อเสนอที่อ้างอิง'}</strong>
              <div className="cf-change-order-meta">
                <span className="cf-proposal-status" data-status={changeOrder.status}>{changeOrderStatusLabels[changeOrder.status]}</span>
                <b className={changeOrder.grand_total_delta_thb < 0 ? 'is-credit' : 'is-charge'}>
                  {changeOrder.grand_total_delta_thb < 0 ? <ArrowDownRight size={14} aria-hidden="true" /> : <ArrowUpRight size={14} aria-hidden="true" />}
                  {formatSignedThb(changeOrder.grand_total_delta_thb)}
                </b>
                <span>ยอดสัญญาหากอนุมัติ ฿{totalAfterApproval.toLocaleString('th-TH', { maximumFractionDigits: 2 })}</span>
              </div>
              <small>{changeOrder.title} · ส่วนต่าง {changeOrder.lines.length} รายการ · ใช้ Factor F {changeOrder.factor_f.toFixed(4)} และเงื่อนไขราคาเดิม</small>
              {lastEvent && <small>อัปเดต {new Date(lastEvent.occurred_at).toLocaleString('th-TH')}{lastEvent.note ? ` · ${lastEvent.note}` : ''}</small>}
              <details className="cf-change-order-lines">
                <summary>ตรวจ scope และราคา {changeOrder.lines.length} รายการ</summary>
                <div className="cf-change-order-table-wrap"><table><thead><tr><th>รายการ</th><th>ส่วนต่าง</th><th>ราคา/หน่วย</th><th>รวม</th><th></th></tr></thead><tbody>
                  {changeOrder.lines.map(line => <tr key={line.id}>
                    <td><strong>{line.mark}</strong><small>{line.description}</small><small>{phaseLabels[line.phase]} · {takeoffCostCenterLabels[line.cost_center]}</small></td>
                    <td className={line.change_quantity < 0 ? 'is-credit' : ''}>{line.change_quantity > 0 ? '+' : '−'}{Math.abs(line.change_quantity).toLocaleString('th-TH', { maximumFractionDigits: 3 })} {line.unit}</td>
                    <td>฿{line.unit_rate_thb.toLocaleString('th-TH', { maximumFractionDigits: 2 })}</td>
                    <td className={line.amount_thb < 0 ? 'is-credit' : ''}>{formatSignedThb(line.amount_thb)}</td>
                    <td>{line.source_object_ids.length > 0 && <button type="button" className="cf-change-order-source" onClick={() => onSelectObjects(line.source_object_ids)}>ดูในแบบ</button>}</td>
                  </tr>)}
                </tbody></table></div>
                {!!changeOrder.status_events?.length && <details className="cf-takeoff-proposal-history"><summary>ประวัติสถานะ {changeOrder.status_events.length} รายการ</summary><ol>
                  {changeOrder.status_events.map(event => <li key={event.command_id}><span>{changeOrderStatusLabels[event.from_status]} → {changeOrderStatusLabels[event.to_status]}</span><small>{new Date(event.occurred_at).toLocaleString('th-TH')} · {event.actor.kind === 'human' ? 'ผู้ใช้' : event.actor.kind}</small>{event.note && <small>{event.note}</small>}</li>)}
                </ol></details>}
              </details>
            </div>
            <div className="cf-takeoff-proposal-actions">
              {changeOrder.status === 'draft' && <button type="button" onClick={() => editChangeOrder(changeOrder)}>ตรวจ / แก้ draft</button>}
              {changeOrder.status === 'draft' && <button type="button" onClick={() => transitionChangeOrder(changeOrder, 'sent')}>บันทึกว่าส่งแล้ว</button>}
              {changeOrder.status === 'sent' && <><button type="button" onClick={() => transitionChangeOrder(changeOrder, 'accepted')}>บันทึกอนุมัติ</button><button type="button" onClick={() => transitionChangeOrder(changeOrder, 'declined')}>ไม่อนุมัติ</button></>}
              {(changeOrder.status === 'draft' || changeOrder.status === 'sent') && <button type="button" className="is-quiet" onClick={() => transitionChangeOrder(changeOrder, 'void')}>ยกเลิก</button>}
              {baseProposal && <button type="button" className="is-quiet" aria-label={`พิมพ์ ${changeOrder.number}`} onClick={() => printSavedChangeOrder(changeOrder, baseProposal)}>พิมพ์</button>}
            </div>
          </article>
        })}
      </section>}
      {(project.proposal_drafts?.some(proposal => proposal.status === 'accepted') ?? false) && <section id="cf-invoices" className="cf-invoices" aria-label="ใบแจ้งหนี้และงวดชำระ">
        <div className="cf-invoices-heading"><strong>ใบแจ้งหนี้และงวดชำระ</strong><p>ยอดตรึงจากข้อเสนอที่ตอบรับและ change orders ที่อนุมัติ ณ วันที่สร้างเอกสาร · การออกเอกสารและรับชำระบันทึกด้วยตนเอง</p></div>
        {invoiceMessage && <p className="cf-takeoff-proposal-feedback" role="status">{invoiceMessage}</p>}
        {(project.invoices?.length ?? 0) === 0 && <p className="cf-invoices-empty">ยังไม่มีใบแจ้งหนี้ · เลือก “สร้างใบแจ้งหนี้ / งวด” จากข้อเสนอที่ตอบรับ</p>}
        {(project.invoices ?? []).map(invoice => {
          const baseProposal = project.proposal_drafts?.find(item => item.id === invoice.proposal_id)
          const paid = getInvoicePaidAmount(invoice)
          const outstanding = getInvoiceOutstandingAmount(invoice)
          const latestEvent = invoice.status_events.at(-1)
          return <article className="cf-invoice-row" key={invoice.id}>
            <div className="cf-invoice-summary">
              <strong>{invoice.number} · {invoice.title}</strong>
              <div className="cf-invoice-meta">
                <span className="cf-proposal-status" data-status={invoice.status === 'partially_paid' || invoice.status === 'paid' ? 'accepted' : invoice.status === 'issued' ? 'sent' : invoice.status}>{invoiceStatusLabels[invoice.status]}</span>
                <b>{formatThb(invoice.amount_due_thb)}</b>
                <span>งวด {invoice.billing_percent.toLocaleString('th-TH')}% · ครบกำหนด {invoice.due_date ? new Date(`${invoice.due_date}T00:00:00`).toLocaleDateString('th-TH') : 'ไม่ระบุ'}</span>
              </div>
              <small>ลูกค้า {invoice.recipient_name} · สัญญา {formatThb(invoice.contract_total_thb)} · CO ที่ตรึง {invoice.source_change_order_ids.length} รายการ</small>
              <div className="cf-invoice-balance"><span>รับแล้ว <b>{formatThb(paid)}</b></span><span>คงค้าง <b>{formatThb(outstanding)}</b></span></div>
              {latestEvent && <small>สถานะล่าสุด {new Date(latestEvent.occurred_at).toLocaleString('th-TH')}{latestEvent.note ? ` · ${latestEvent.note}` : ''}</small>}
              {invoice.notes && <small>{invoice.notes}</small>}
              {(invoice.status_events.length > 0 || invoice.payments.length > 0) && <details className="cf-takeoff-proposal-history cf-invoice-history">
                <summary>ประวัติเอกสารและรับชำระ · {invoice.status_events.length + invoice.payments.length} รายการ</summary>
                <ol>
                  {invoice.status_events.map(event => <li key={event.command_id}><span>{invoiceStatusLabels[event.to_status]}</span><small>{new Date(event.occurred_at).toLocaleString('th-TH')} · {event.actor.kind === 'human' ? 'ผู้ใช้' : event.actor.kind}</small>{event.note && <small>{event.note}</small>}</li>)}
                  {invoice.payments.map(payment => <li key={payment.command_id}><span>รับ {formatThb(payment.amount_thb)} · {invoicePaymentMethodLabels[payment.method]}</span><small>{formatInvoicePaymentDate(payment.received_at)} · {payment.actor.kind === 'human' ? 'ผู้ใช้' : payment.actor.kind}{payment.reference ? ` · ${payment.reference}` : ''}</small>{payment.note && <small>{payment.note}</small>}</li>)}
                </ol>
              </details>}
            </div>
            <div className="cf-takeoff-proposal-actions">
              {invoice.status === 'draft' && <button type="button" onClick={() => editInvoice(invoice)}>ตรวจ / แก้ draft</button>}
              {invoice.status === 'draft' && <button type="button" onClick={() => transitionInvoice(invoice, 'issued')}>ออกเอกสาร</button>}
              {(invoice.status === 'issued' || invoice.status === 'partially_paid') && <button type="button" onClick={() => startInvoicePayment(invoice)}>บันทึกรับชำระ</button>}
              {(invoice.status === 'draft' || (invoice.status === 'issued' && invoice.payments.length === 0)) && <button type="button" className="is-quiet" onClick={() => transitionInvoice(invoice, 'void')}>ยกเลิก</button>}
              {baseProposal && <button type="button" className="is-quiet" aria-label={`พิมพ์ ${invoice.number}`} onClick={() => printSavedInvoice(invoice, baseProposal)}>พิมพ์</button>}
            </div>
          </article>
        })}
      </section>}
    </section>}

    <div className="cf-takeoff-filters">
      <label className="cf-takeoff-search">
        <Search size={16} aria-hidden="true" />
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหาชื่อวัสดุหรือรายการ" aria-label="ค้นหารายการถอดปริมาณ" />
      </label>
      <div className="cf-takeoff-filter-row">
        <label>เฟส
          <select aria-label="กรองตามเฟสงาน" value={phaseFilter} onChange={event => setPhaseFilter(event.target.value as 'all' | Phase)}>
            <option value="all">ทุกเฟส</option>
            <option value="existing">อาคารเดิม</option>
            <option value="demolition">รื้อถอน</option>
            <option value="new_construction">สร้างใหม่</option>
          </select>
        </label>
        <label>หมวด BOQ
          <select aria-label="กรองตามหมวด BOQ" value={costCenterFilter} onChange={event => setCostCenterFilter(event.target.value as 'all' | TakeoffCostCenter)}>
            <option value="all">ทุกหมวด</option>
            <option value="demolition_site_prep">รื้อถอน/เตรียมพื้นที่</option>
            <option value="new_construction">งานสร้างใหม่</option>
            <option value="remodeling_joint_treatment">รอยต่อเดิม–ใหม่</option>
          </select>
        </label>
        <label>จัดกลุ่ม
          <select aria-label="จัดกลุ่มรายการถอดปริมาณ" value={takeoffGroupMode} onChange={event => setTakeoffGroupMode(event.target.value as TakeoffGroupMode)}>
            {Object.entries(takeoffGroupModeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>
    </div>

    <div id="cf-takeoff-lines" className="cf-takeoff-lines" aria-label="รายการถอดปริมาณ">
      {filteredLines.length === 0 ? <div className="cf-takeoff-empty" role="status">
        {takeoff.lines.length === 0 ? 'ยังไม่มีรายการถอดปริมาณจากแบบนี้' : 'ไม่พบรายการที่ตรงกับตัวกรอง'}
      </div> : groupedLines.map(group => <section className="cf-takeoff-group" key={`${takeoffGroupMode}:${group.key}`}>
        <header className="cf-takeoff-group-heading">
          <div><strong>{group.label}</strong><span>{group.lines.length} รายการ · {group.sourceIds.size} วัตถุ</span></div>
          <div className="cf-takeoff-group-totals">
            <span>{Object.entries(group.quantityByUnit).map(([unit, quantity]) => `${quantity.toLocaleString('th-TH', { maximumFractionDigits: 3 })} ${takeoffUnitLabels[unit] ?? unit}`).join(' · ')}</span>
            {group.lines.some(line => boqLineById.has(line.id)) && <b>ต้นทุนตรง ฿{group.directCostThb.toLocaleString('th-TH', { maximumFractionDigits: 2 })}</b>}
          </div>
        </header>
        {group.lines.map(line => {
        const sourceIds = line.source_object_ids.filter(id => !!project.objects[id])
        const pricedLine = boqLineById.get(line.id)
        return <article className="cf-takeoff-line" key={line.id}>
          <div className="cf-takeoff-line-main">
            <div className="cf-takeoff-line-title">
              <strong>{line.mark}</strong>
              <span data-center={line.cost_center}>{takeoffCostCenterLabels[line.cost_center]}</span>
            </div>
            <div className="cf-takeoff-line-meta">
              <span>{phaseLabels[line.phase]}</span>
              {line.material && <span>{line.material}</span>}
              <span>{sourceIds.length} วัตถุต้นทาง</span>
            </div>
            <small>{line.formula}{line.waste_percent ? ` · เผื่อเศษ ${line.waste_percent}%` : ''}</small>
            {pricedLine && <div className="cf-takeoff-line-pricing" aria-label={`ราคา BOQ ${line.mark}`}>
              <span>วัสดุ {formatThb(pricedLine.unit_material_cost_thb)} + ค่าแรง {formatThb(pricedLine.unit_labor_cost_thb)} / {line.unit}</span>
              <strong>ต้นทุนตรงรวม {formatThb(pricedLine.total_direct_cost_thb)}</strong>
              {pricedLine.unit_material_sell_rate_thb !== undefined && <span className="has-product-margin">
                ราคาขายวัสดุ {formatThb(pricedLine.unit_material_sell_rate_thb)} / {line.unit}
                {pricedLine.product_gross_margin_percent !== undefined ? ` · Margin SKU ${pricedLine.product_gross_margin_percent.toLocaleString('th-TH')}%` : ''}
                {pricedLine.total_product_margin_thb > 0 ? ` · ส่วนต่าง ${formatThb(pricedLine.total_product_margin_thb)}` : ''}
              </span>}
            </div>}
          </div>
          <div className="cf-takeoff-line-quantity">
            <strong>{line.quantity.toLocaleString('th-TH', { maximumFractionDigits: 3 })} <span>{line.unit}</span></strong>
            {line.gross_quantity !== undefined && line.gross_quantity !== line.quantity && <small>รวมเผื่อ {line.gross_quantity.toLocaleString('th-TH', { maximumFractionDigits: 3 })} {line.unit}</small>}
            <button type="button" disabled={!sourceIds.length} onClick={() => onSelectObjects(sourceIds)} title={sourceIds.length ? 'เลือกวัตถุต้นทางบน canvas' : 'รายการนี้ไม่มีวัตถุต้นทาง'}>
              <Crosshair size={15} aria-hidden="true" /><span>ดูบนแบบ</span>
            </button>
          </div>
        </article>
      })}
      </section>)}
    </div>

    <div className="cf-takeoff-footer">
      {takeoff.warnings.length > 0 && <details className="cf-takeoff-warnings">
        <summary>ต้องตรวจสอบ {takeoff.warnings.length} รายการ</summary>
        <ul>{takeoff.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul>
      </details>}
      <div className="cf-takeoff-export-actions">
        <button type="button" onClick={onExportTakeoff}>ส่งออก Net CSV</button>
        <button type="button" onClick={onExportBOQ}>ส่งออก BOQ · ฿</button>
      </div>
    </div>

    {proposalDraft && createPortal(<div className="cf-proposal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setProposalDraft(null) }}>
      <section className="cf-proposal-composer" role="dialog" aria-modal="true" aria-labelledby="cf-proposal-title" onKeyDown={event => { if (event.key === 'Escape') setProposalDraft(null) }}>
        <header className="cf-proposal-heading"><div><span>เอกสารเสนอราคา · แบบร่าง</span><h2 id="cf-proposal-title">ตรวจและแก้ข้อเสนอก่อนส่ง</h2></div><button type="button" aria-label="ปิดหน้าต่างข้อเสนอ" onClick={() => setProposalDraft(null)}><X size={19} /></button></header>
        <div className="cf-proposal-caveat">ยอดนี้เป็นราคาอ้างอิงจากระบบและปริมาณในแบบ · margin คิดจากยอด Factor F ก่อน VAT ส่วนลดหักก่อนคำนวณ VAT · ยังไม่มีการส่งอีเมลหรือลงนามอิเล็กทรอนิกส์</div>
        <section className="cf-proposal-template-library" aria-label="Library แม่แบบข้อเสนอ">
          <div className="cf-proposal-template-row">
            <label>ใช้แม่แบบ
              <select aria-label="เลือกแม่แบบข้อเสนอ" value={proposalTemplateId} onChange={event => applyProposalTemplate(event.target.value)} disabled={proposalTemplateBusy || proposalTemplates.length === 0}>
                <option value="">{proposalTemplateBusy ? 'กำลังอ่าน…' : proposalTemplates.length ? 'ไม่ใช้แม่แบบ' : 'ยังไม่มีแม่แบบในอุปกรณ์นี้'}</option>
                {proposalTemplates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
            </label>
            <button type="button" className="cf-proposal-template-delete" onClick={() => void deleteProposalTemplate()} disabled={!proposalTemplateId || proposalTemplateBusy}>ลบแม่แบบ</button>
          </div>
          <div className="cf-proposal-template-row">
            <label>บันทึกเงื่อนไขเป็นแม่แบบ
              <input aria-label="ชื่อแม่แบบข้อเสนอ" value={proposalTemplateName} onChange={event => setProposalTemplateName(event.target.value)} maxLength={80} placeholder="เช่น งานต่อเติมบ้าน · 30 วัน" />
            </label>
            <button type="button" className="cf-proposal-template-save" onClick={() => void saveProposalTemplate()} disabled={proposalTemplateBusy || !proposalTemplateName.trim()}>
              {proposalTemplateBusy ? 'กำลังบันทึก…' : proposalTemplateId ? 'อัปเดตแม่แบบ' : 'บันทึกแม่แบบ'}
            </button>
          </div>
          {(proposalTemplateMessage || proposalTemplateError) && <p className={proposalTemplateError ? 'is-error' : ''} role={proposalTemplateError ? 'alert' : 'status'}>{proposalTemplateError || proposalTemplateMessage}</p>}
        </section>
        <div className="cf-proposal-fields">
          <label className="cf-proposal-wide">ชื่อเอกสาร<input value={proposalDraft.title} onChange={event => updateProposal({ title: event.target.value })} maxLength={160} /></label>
          <label>ชื่อลูกค้า<input value={proposalDraft.recipient_name} onChange={event => updateProposal({ recipient_name: event.target.value })} maxLength={160} autoFocus /></label>
          <label>อีเมล<input type="email" value={proposalDraft.recipient_email ?? ''} onChange={event => updateProposal({ recipient_email: event.target.value })} maxLength={254} /></label>
          <label>โทรศัพท์<input value={proposalDraft.recipient_phone ?? ''} onChange={event => updateProposal({ recipient_phone: event.target.value })} maxLength={60} /></label>
          <label>ใช้ได้ถึง<input type="date" value={proposalDraft.valid_until ?? ''} onChange={event => updateProposal({ valid_until: event.target.value })} /></label>
          <label className="cf-proposal-wide">ที่อยู่ลูกค้า<textarea value={proposalDraft.recipient_address ?? ''} onChange={event => updateProposal({ recipient_address: event.target.value })} rows={2} maxLength={1000} /></label>
        </div>
        <section className="cf-proposal-field-data" aria-label="เลือกข้อมูลหน้างานประกอบข้อเสนอ">
          <div className="cf-proposal-field-data-heading"><strong>ข้อมูลหน้างานในข้อเสนอ</strong><span>เลือกแบบฟอร์มที่ส่งแล้ว · ค่าจะถูกตรึงไว้ในเอกสารฉบับนี้</span></div>
          {submittedFieldForms.length ? <div className="cf-proposal-field-data-list">
            {submittedFieldForms.map(form => {
              const checked = (proposalDraft.field_data_snapshots ?? []).some(snapshot => snapshot.field_form_id === form.id)
              const responseCount = Object.values(form.responses).filter(value => value !== null && value !== undefined && value !== '').length
              const disabled = !checked && (proposalDraft.field_data_snapshots?.length ?? 0) >= 100
              return <label className="cf-proposal-field-data-option" key={form.id}>
                <input type="checkbox" checked={checked} disabled={disabled} onChange={event => toggleProposalFieldForm(form, event.target.checked)} />
                <span><strong>{form.title}</strong><small>{fieldFormCategoryLabels[form.category]} · ส่งเมื่อ {new Date(form.submitted_at!).toLocaleDateString('th-TH')} · {responseCount} ช่องข้อมูล{form.level_id ? ` · ${project.levels.find(level => level.id === form.level_id)?.name ?? 'ไม่พบชั้น'}` : ''}{form.gps_location ? ' · มี GPS (จะแนบเมื่อเลือก)' : ''}</small></span>
              </label>
            })}
            {(proposalDraft.field_data_snapshots ?? []).filter(snapshot => !submittedFieldForms.some(form => form.id === snapshot.field_form_id)).map(snapshot => <label className="cf-proposal-field-data-option is-retained" key={snapshot.field_form_id}>
              <input type="checkbox" checked onChange={() => updateProposal({ field_data_snapshots: (proposalDraft.field_data_snapshots ?? []).filter(item => item.field_form_id !== snapshot.field_form_id) })} />
              <span><strong>{snapshot.title}</strong><small>เก็บ snapshot เดิม · แบบฟอร์มต้นทางไม่มีในโครงการนี้</small></span>
            </label>)}
          </div> : <p className="cf-proposal-field-data-empty">ยังไม่มีแบบฟอร์มที่ส่งแล้ว · ส่งแบบฟอร์มจากบันทึกหน้างานก่อนจึงจะแนบได้</p>}
        </section>
        <section className="cf-proposal-conditional" aria-label="ข้อความข้อเสนอแบบมีเงื่อนไข">
          <div className="cf-proposal-conditional-heading">
            <div><strong>ข้อความอัตโนมัติตามข้อมูลหน้างาน</strong><small>ใช้คำตอบจากแบบฟอร์มที่ส่งล่าสุด · จะแสดงเฉพาะข้อความที่เงื่อนไขผ่าน คำตอบต้นทางไม่ถูกพิมพ์เพิ่มเอง</small></div>
            <button type="button" onClick={addProposalConditionalRule} disabled={!conditionalFieldOptions.length || (proposalDraft.conditional_texts?.length ?? 0) >= 100}>เพิ่มข้อความ</button>
          </div>
          {(proposalDraft.conditional_texts ?? []).length ? <div className="cf-proposal-conditional-list">
            {proposalDraft.conditional_texts!.map((rule, index) => {
              const selectedKey = conditionalFieldKey(rule.template_id, rule.field_id)
              const fieldOption = conditionalFieldOptions.find(option => option.key === selectedKey)
              const operators = fieldOption ? conditionalOperatorsForField(fieldOption.input_type) : (Object.keys(conditionalOperatorLabels) as ProposalConditionalTextRule['operator'][])
              return <article className="cf-proposal-conditional-rule" key={rule.id}>
                <div className="cf-proposal-conditional-rule-top"><strong>เงื่อนไข {index + 1}</strong><button type="button" aria-label={`ลบเงื่อนไข ${index + 1}`} onClick={() => removeProposalConditionalRule(rule.id)}>ลบ</button></div>
                <div className="cf-proposal-conditional-controls">
                  <label>ข้อมูลที่ใช้ตรวจ
                    <select aria-label={`ข้อมูลที่ใช้ตรวจ ${index + 1}`} value={selectedKey} onChange={event => {
                      const nextOption = conditionalFieldOptions.find(option => option.key === event.target.value)
                      if (!nextOption) return
                      const operator: ProposalConditionalTextRule['operator'] = nextOption.input_type === 'checkbox' ? 'is_on'
                        : nextOption.input_type === 'select' ? 'equals' : 'not_empty'
                      updateProposalConditionalRule(rule.id, {
                        template_id: nextOption.template_id, template_title: nextOption.template_title,
                        field_id: nextOption.field_id, field_label: nextOption.field_label, operator,
                        ...(operator === 'equals' ? { expected_value: nextOption.options?.[0] ?? (nextOption.input_type === 'number' ? 0 : '') } : { expected_value: undefined }),
                      })
                    }}>
                      {!fieldOption && <option value={selectedKey}>{rule.template_title} · {rule.field_label} · ไม่พบแบบฟอร์มต้นทาง</option>}
                      {conditionalFieldOptions.map(option => <option key={option.key} value={option.key}>{option.template_title} · {option.field_label} · ใช้คำตอบล่าสุด</option>)}
                    </select>
                  </label>
                  <label>เงื่อนไข
                    <select aria-label={`เงื่อนไข ${index + 1}`} value={rule.operator} onChange={event => {
                      const operator = event.target.value as ProposalConditionalTextRule['operator']
                      const expectedValue = operator !== 'equals' ? undefined
                        : fieldOption?.input_type === 'select' ? fieldOption.options?.[0] ?? ''
                          : fieldOption?.input_type === 'number' ? 0 : ''
                      updateProposalConditionalRule(rule.id, { operator, expected_value: expectedValue })
                    }}>
                      {operators.map(operator => <option key={operator} value={operator}>{conditionalOperatorLabels[operator]}</option>)}
                    </select>
                  </label>
                  {rule.operator === 'equals' && <label>ค่าที่ต้องตรงกัน
                    {fieldOption?.input_type === 'select' ? <select aria-label={`ค่าที่ต้องตรงกัน ${index + 1}`} value={String(rule.expected_value ?? '')} onChange={event => updateProposalConditionalRule(rule.id, { expected_value: event.target.value })}>
                      {(fieldOption.options ?? []).map(option => <option key={option} value={option}>{option}</option>)}
                    </select> : <input aria-label={`ค่าที่ต้องตรงกัน ${index + 1}`} type={fieldOption?.input_type === 'number' ? 'number' : 'text'} inputMode={fieldOption?.input_type === 'number' ? 'decimal' : undefined} value={String(rule.expected_value ?? '')} onChange={event => updateProposalConditionalRule(rule.id, { expected_value: fieldOption?.input_type === 'number' ? Number(event.target.value) : event.target.value })} />}
                  </label>}
                </div>
                <label className="cf-proposal-conditional-content">ข้อความที่แสดงเมื่อเงื่อนไขผ่าน
                  <textarea aria-label={`ข้อความเมื่อผ่าน ${index + 1}`} rows={2} maxLength={4000} value={rule.content} onChange={event => updateProposalConditionalRule(rule.id, { content: event.target.value })} />
                  <small>แทรกค่าจากฟอร์มด้วย {'{{field_id}}'} เช่น {'{{visit_date}}'}</small>
                </label>
                <p className={rule.matched ? 'is-matched' : 'is-hidden'}>{rule.matched ? `จะแสดงในเอกสาร: ${rule.rendered_text}` : 'เงื่อนไขยังไม่ผ่าน หรือยังไม่มีแบบฟอร์มต้นทางที่ส่งแล้ว · ข้อความนี้จะไม่อยู่ในเอกสาร'}</p>
              </article>
            })}
          </div> : <p className="cf-proposal-conditional-empty">ยังไม่มีข้อความแบบมีเงื่อนไข · เพิ่มข้อความเพื่อแสดงเงื่อนไขหรือหมายเหตุจากแบบฟอร์มในเอกสาร</p>}
        </section>
        <section className="cf-proposal-template-library cf-discount-rule-library" aria-label="กฎส่วนลด Company Library">
          <div className="cf-proposal-template-row">
            <label>ใช้กฎส่วนลดจาก Company Library
              <select aria-label="เลือกกฎส่วนลดจาก Company Library" value={discountRuleId} onChange={event => applyDiscountRule(event.target.value)} disabled={discountRuleBusy}>
                <option value="">กำหนดส่วนลดเอง / สร้างกฎใหม่</option>
                {discountRules.map(rule => <option key={rule.id} value={rule.id}>{rule.name} · {rule.discount_percent.toLocaleString('th-TH')}%</option>)}
              </select>
            </label>
          <button type="button" onClick={() => {
            setDiscountRuleId('')
            setDiscountRuleName('')
            setDiscountRuleNotes('')
            setDiscountRuleMessage('')
            setDiscountRuleError('')
            updateProposal({ discount_rule_snapshot: undefined })
          }} disabled={discountRuleBusy}>กฎใหม่</button>
          </div>
          <div className="cf-proposal-template-row">
            <label>ชื่อกฎที่ใช้ซ้ำ
              <input aria-label="ชื่อกฎส่วนลดที่ใช้ซ้ำ" value={discountRuleName} onChange={event => setDiscountRuleName(event.target.value)} maxLength={100} placeholder="เช่น ส่วนลดลูกค้าเดิม · 5%" />
            </label>
            <button type="button" className="cf-proposal-template-save" onClick={() => void saveDiscountRule()} disabled={discountRuleBusy || !discountRuleName.trim()}>
              {discountRuleBusy ? 'กำลังบันทึก…' : discountRuleId && discountRules.some(rule => rule.id === discountRuleId) ? 'อัปเดตกฎ' : 'บันทึกกฎ'}
            </button>
          </div>
          <label className="cf-discount-rule-notes">หมายเหตุ / เงื่อนไขการใช้ (ไม่บังคับ)<input aria-label="หมายเหตุของกฎส่วนลด" value={discountRuleNotes} onChange={event => setDiscountRuleNotes(event.target.value)} maxLength={500} placeholder="เช่น ใช้กับงานที่ชำระเต็มจำนวน" /></label>
          {proposalDraft.discount_rule_snapshot && <p>ข้อเสนอนี้เก็บ snapshot “{proposalDraft.discount_rule_snapshot.rule_name}” ที่ {proposalDraft.discount_rule_snapshot.discount_percent.toLocaleString('th-TH')}% · เปลี่ยนส่วนลดเองแล้ว snapshot นี้จะถูกล้าง</p>}
          {(discountRuleMessage || discountRuleError) && <p className={discountRuleError ? 'is-error' : ''} role={discountRuleError ? 'alert' : 'status'}>{discountRuleError || discountRuleMessage}</p>}
        </section>
        <div className="cf-proposal-fields cf-proposal-pricing-options" aria-label="กำไรและส่วนลด">
          <label>Gross margin เพิ่มเติม (%)<input type="number" min="0" max="99.9" step="0.1" inputMode="decimal" value={proposalDraft.gross_margin_percent ?? 0} onChange={event => {
            const value = Number(event.target.value)
            if (Number.isFinite(value) && value >= 0 && value < 100) updateProposal({ gross_margin_percent: value })
          }} /></label>
          <label>ส่วนลด (%)<input type="number" min="0" max="100" step="0.1" inputMode="decimal" value={proposalDraft.discount_percent ?? 0} onChange={event => {
            const value = Number(event.target.value)
            if (Number.isFinite(value) && value >= 0 && value <= 100) {
              setDiscountRuleId('')
              setDiscountRuleName('')
              setDiscountRuleNotes('')
              setDiscountRuleMessage('')
              setDiscountRuleError('')
              updateProposal({ discount_percent: value, discount_rule_snapshot: undefined })
            }
          }} /></label>
          <p className="cf-proposal-pricing-hint">คำนวณ margin เป็นสัดส่วนของราคาขายก่อนส่วนลด แล้วหักส่วนลดก่อนคิด VAT</p>
        </div>
        <div className="cf-proposal-table-wrap"><table className="cf-proposal-table"><thead><tr><th>รายการ / เฟส</th><th>ปริมาณ</th><th>ราคา/หน่วย ฿</th><th>รวม ฿</th></tr></thead><tbody>
          {proposalDraft.lines.map((line, index) => <tr key={line.id}><td><strong>{line.mark}</strong><span>{line.description}</span><small>{takeoffCostCenterLabels[line.cost_center]}{line.hide_on_proposal ? ' · ซ่อนรายละเอียดในเอกสารลูกค้า แต่รวมยอด' : ''}</small><small>{line.formula}</small></td><td>{line.quantity.toLocaleString('th-TH', { maximumFractionDigits: 3 })} {line.unit}</td><td><input aria-label={`ราคา ${line.mark} ต่อหน่วย`} type="number" min="0" step="0.01" value={line.unit_rate_thb} onChange={event => {
            const rate = Number(event.target.value)
            if (!Number.isFinite(rate) || rate < 0) return
            const lines = proposalDraft.lines.map((item, itemIndex) => itemIndex === index ? { ...item, unit_rate_thb: rate, amount_thb: Number((item.quantity * rate).toFixed(2)) } : item)
            updateProposal({ lines })
          }} /></td><td>{line.amount_thb.toLocaleString('th-TH', { maximumFractionDigits: 2 })}</td></tr>)}
          {proposalDraft.lines.length === 0 && <tr><td colSpan={4}>ยังไม่มีปริมาณจากแบบสำหรับสร้างข้อเสนอ</td></tr>}
        </tbody></table></div>
        <div className="cf-proposal-bottom-fields">
          <label>หมายเหตุ<textarea value={proposalDraft.notes} onChange={event => updateProposal({ notes: event.target.value })} rows={2} maxLength={4000} /></label>
          <label>เงื่อนไข<textarea value={proposalDraft.terms} onChange={event => updateProposal({ terms: event.target.value })} rows={3} maxLength={4000} /></label>
          <dl className="cf-proposal-totals">
            <div><dt>งานตาม BOQ</dt><dd>฿{proposalDraft.direct_cost_thb.toLocaleString('th-TH', { maximumFractionDigits: 2 })}</dd></div>
            <div><dt>เตรียมการ</dt><dd>฿{proposalDraft.preliminaries_thb.toLocaleString('th-TH', { maximumFractionDigits: 2 })}</dd></div>
            <div><dt>ฐาน Factor F · ×{proposalDraft.factor_f.toFixed(4)} ก่อน VAT</dt><dd>฿{(proposalPricing?.factor_f_subtotal_thb ?? 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })}</dd></div>
            {(proposalDraft.product_margin_amount_thb ?? 0) > 0 && <div><dt>Gross margin จากสินค้า Supplier</dt><dd>฿{(proposalDraft.product_margin_amount_thb ?? 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })}</dd></div>}
            <div><dt>Gross margin เพิ่มเติม ({(proposalDraft.gross_margin_percent ?? 0).toLocaleString('th-TH')}%)</dt><dd>฿{(proposalPricing?.gross_margin_amount_thb ?? 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })}</dd></div>
            <div><dt>ยอดก่อนส่วนลด</dt><dd>฿{(proposalPricing?.subtotal_before_discount_thb ?? 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })}</dd></div>
            <div><dt>ส่วนลด ({(proposalDraft.discount_percent ?? 0).toLocaleString('th-TH')}%)</dt><dd>−฿{(proposalPricing?.discount_amount_thb ?? 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })}</dd></div>
            <div><dt>ฐานภาษี</dt><dd>฿{(proposalPricing?.taxable_amount_thb ?? 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })}</dd></div>
            <div><dt>VAT {Math.round(proposalDraft.vat_rate * 100)}%</dt><dd>฿{(proposalPricing?.vat_amount_thb ?? 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })}</dd></div>
            <div className="is-grand"><dt>ยอดเสนอราคา</dt><dd>฿{proposalDraft.grand_total_thb.toLocaleString('th-TH', { maximumFractionDigits: 2 })}</dd></div>
          </dl>
        </div>
        {proposalDraft.source_takeoff_warnings.length > 0 && <p className="cf-proposal-warning">มีข้อสังเกตจากการถอดปริมาณ {proposalDraft.source_takeoff_warnings.length} รายการ · ตรวจสอบก่อนส่งให้ลูกค้า</p>}
        {proposalError && <p className="cf-proposal-error" role="alert">{proposalError}</p>}
        <footer className="cf-proposal-actions"><button type="button" className="cf-button cf-button-quiet" onClick={() => setProposalDraft(null)}>ยกเลิก</button><button type="button" className="cf-button cf-button-quiet" onClick={() => { try { printProposalDocument(proposalDraft, project.project.name) } catch { setProposalError('เปิดหน้าพิมพ์ไม่สำเร็จ กรุณาอนุญาตหน้าต่างใหม่ในเบราว์เซอร์') } }}><Printer size={16} />พิมพ์ / บันทึก PDF</button><button type="button" className="cf-button cf-button-primary" onClick={saveProposal}>บันทึกแบบร่าง</button></footer>
      </section>
    </div>, document.body)}

    {changeOrderDraft && createPortal(<div className="cf-proposal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setChangeOrderDraft(null) }}>
      <section className="cf-proposal-composer cf-change-order-composer" role="dialog" aria-modal="true" aria-labelledby="cf-change-order-title" onKeyDown={event => { if (event.key === 'Escape') setChangeOrderDraft(null) }}>
        <header className="cf-proposal-heading"><div><h2 id="cf-change-order-title">ตรวจและแก้ {changeOrderDraft.number}</h2></div><button type="button" aria-label="ปิด change order" onClick={() => setChangeOrderDraft(null)}><X size={19} /></button></header>
        <div className="cf-proposal-caveat">รายการเป็นส่วนต่างจาก scope ที่ทำสัญญาแล้ว · จำนวนบวกเพิ่มงาน จำนวนลบลดงาน · ราคาใช้เงื่อนไขที่ freeze ไว้จากข้อเสนอฐาน</div>
        <div className="cf-proposal-fields"><label className="cf-proposal-wide">ชื่อเอกสาร<input value={changeOrderDraft.title} onChange={event => updateChangeOrderDraft({ title: event.target.value })} maxLength={160} autoFocus /></label></div>
        <div className="cf-proposal-table-wrap cf-change-order-edit-table"><table className="cf-proposal-table"><thead><tr><th>รายการ / เฟส</th><th>ส่วนต่างปริมาณ</th><th>ราคา/หน่วย ฿</th><th>รวม ฿</th><th></th></tr></thead><tbody>
          {changeOrderDraft.lines.map(line => <tr key={line.id}>
            <td><strong>{line.mark}</strong><span>{line.description}</span><small>{phaseLabels[line.phase]} · {takeoffCostCenterLabels[line.cost_center]}</small></td>
            <td><input aria-label={`ส่วนต่างปริมาณ ${line.mark}`} type="number" step="0.001" inputMode="decimal" value={line.change_quantity} onChange={event => {
              const value = Number(event.target.value)
              if (!Number.isFinite(value)) return
              updateChangeOrderDraft({ lines: changeOrderDraft.lines.map(item => item.id === line.id ? { ...item, change_quantity: value } : item) })
            }} /></td>
            <td><input aria-label={`ราคา ${line.mark} ต่อหน่วย`} type="number" min="0" step="0.01" inputMode="decimal" value={line.unit_rate_thb} onChange={event => {
              const value = Number(event.target.value)
              if (!Number.isFinite(value) || value < 0) return
              updateChangeOrderDraft({ lines: changeOrderDraft.lines.map(item => item.id === line.id ? { ...item, unit_rate_thb: value } : item) })
            }} /></td>
            <td className={line.amount_thb < 0 ? 'is-credit' : ''}>{formatSignedThb(line.amount_thb)}</td>
            <td><button type="button" className="cf-change-order-remove" aria-label={`เอา ${line.mark} ออกจาก change order`} onClick={() => updateChangeOrderDraft({ lines: changeOrderDraft.lines.filter(item => item.id !== line.id) })}>เอาออก</button></td>
          </tr>)}
          {changeOrderDraft.lines.length === 0 && <tr><td colSpan={5}>ไม่มีรายการ · เพิ่มส่วนต่างจากแบบหรือยกเลิก change order นี้</td></tr>}
        </tbody></table></div>
        <div className="cf-proposal-bottom-fields cf-change-order-bottom">
          <label className="cf-change-order-notes">หมายเหตุ<textarea value={changeOrderDraft.notes} onChange={event => updateChangeOrderDraft({ notes: event.target.value })} rows={3} maxLength={4000} /></label>
          <dl className="cf-proposal-totals">
            <div><dt>ยอดสัญญาก่อนอนุมัติ</dt><dd>฿{changeOrderDraft.base_contract_total_thb.toLocaleString('th-TH', { maximumFractionDigits: 2 })}</dd></div>
            <div><dt>ส่วนต่างต้นทุนตรง</dt><dd>{formatSignedThb(changeOrderDraft.direct_cost_delta_thb)}</dd></div>
            {(changeOrderDraft.product_margin_delta_thb ?? 0) !== 0 && <div><dt>ส่วนต่าง margin สินค้า</dt><dd>{formatSignedThb(changeOrderDraft.product_margin_delta_thb ?? 0)}</dd></div>}
            <div><dt>ส่วนต่างก่อนส่วนลด</dt><dd>{formatSignedThb(changeOrderDraft.subtotal_before_discount_delta_thb)}</dd></div>
            <div><dt>ส่วนลดเดิม {changeOrderDraft.discount_percent.toLocaleString('th-TH')}%</dt><dd>{formatSignedThb(-changeOrderDraft.discount_amount_delta_thb)}</dd></div>
            <div><dt>VAT {Math.round(changeOrderDraft.vat_rate * 100)}%</dt><dd>{formatSignedThb(changeOrderDraft.vat_amount_delta_thb)}</dd></div>
            <div className="is-grand"><dt>มูลค่า CO</dt><dd>{formatSignedThb(changeOrderDraft.grand_total_delta_thb)}</dd></div>
            <div><dt>ยอดสัญญาหากอนุมัติ</dt><dd>฿{(changeOrderDraft.base_contract_total_thb + changeOrderDraft.grand_total_delta_thb).toLocaleString('th-TH', { maximumFractionDigits: 2 })}</dd></div>
          </dl>
        </div>
        {changeOrderDraft.source_takeoff_warnings.length > 0 && <p className="cf-proposal-warning">มีข้อสังเกตจาก takeoff {changeOrderDraft.source_takeoff_warnings.length} รายการ · ตรวจปริมาณและราคาก่อนส่ง</p>}
        {changeOrderError && <p className="cf-proposal-error" role="alert">{changeOrderError}</p>}
        <footer className="cf-proposal-actions"><button type="button" className="cf-button cf-button-quiet" onClick={() => setChangeOrderDraft(null)}>ปิดโดยไม่บันทึก</button><button type="button" className="cf-button cf-button-primary" onClick={saveChangeOrder} disabled={changeOrderDraft.lines.length === 0}>บันทึก snapshot</button></footer>
      </section>
    </div>, document.body)}

    {invoiceDraft && createPortal(<div className="cf-proposal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setInvoiceDraft(null) }}>
      <section className="cf-proposal-composer cf-invoice-composer" role="dialog" aria-modal="true" aria-labelledby="cf-invoice-title" onKeyDown={event => { if (event.key === 'Escape') setInvoiceDraft(null) }}>
        <header className="cf-proposal-heading"><div><span>Progress billing · ยอดตามสัญญาที่ตอบรับ</span><h2 id="cf-invoice-title">ตรวจและแก้ {invoiceDraft.number}</h2></div><button type="button" aria-label="ปิดใบแจ้งหนี้" onClick={() => setInvoiceDraft(null)}><X size={19} /></button></header>
        <div className="cf-proposal-caveat">ใบแจ้งหนี้นี้ตรึงยอดข้อเสนอและ change orders ที่อนุมัติแล้ว · การออกเอกสารหรือบันทึกรับชำระไม่ได้ส่งอีเมล ไม่ได้เชื่อม payment gateway และไม่ใช่ใบกำกับภาษีอิเล็กทรอนิกส์</div>
        {invoiceDraftSnapshotStale && <div className="cf-invoice-stale-note" role="alert"><span>มี change order อนุมัติหลังสร้างแบบร่าง · อัปเดต snapshot ก่อนบันทึกและออกเอกสาร</span><button type="button" onClick={refreshInvoiceSnapshot} disabled={!invoiceDraftProposal || invoiceDraftProposal.status !== 'accepted'}>ใช้ยอดสัญญาล่าสุด</button></div>}
        <div className="cf-proposal-fields">
          <label>เลขที่เอกสาร<input value={invoiceDraft.number} onChange={event => updateInvoiceDraft({ number: event.target.value })} maxLength={60} autoFocus /></label>
          <label>วันครบกำหนด<input type="date" value={invoiceDraft.due_date ?? ''} onChange={event => updateInvoiceDraft({ due_date: event.target.value || undefined })} /></label>
          <label className="cf-proposal-wide">ชื่อเอกสาร<input value={invoiceDraft.title} onChange={event => updateInvoiceDraft({ title: event.target.value })} maxLength={160} /></label>
          <label>ชื่อลูกค้า<input value={invoiceDraft.recipient_name} onChange={event => updateInvoiceDraft({ recipient_name: event.target.value })} maxLength={160} /></label>
          <label>สัดส่วนงวด (% ของสัญญา)<input type="number" min="0.01" max="100" step="0.01" inputMode="decimal" value={invoiceDraft.billing_percent} onChange={event => {
            const value = Number(event.target.value)
            if (Number.isFinite(value) && value > 0 && value <= 100) updateInvoiceDraft({ billing_percent: value })
          }} /></label>
          <label className="cf-proposal-wide">ที่อยู่ลูกค้า<textarea value={invoiceDraft.recipient_address ?? ''} onChange={event => updateInvoiceDraft({ recipient_address: event.target.value })} rows={2} maxLength={1000} /></label>
        </div>
        {(() => {
          const committed = (project.invoices ?? []).filter(invoice => invoice.proposal_id === invoiceDraft.proposal_id && invoice.id !== invoiceDraft.id && ['issued', 'partially_paid', 'paid'].includes(invoice.status)).reduce((sum, invoice) => sum + invoice.amount_due_thb, 0)
          const remaining = Number((invoiceDraft.contract_total_thb - committed - invoiceDraft.amount_due_thb).toFixed(2))
          return <>
            <dl className="cf-proposal-totals cf-invoice-totals">
              <div><dt>ข้อเสนอที่ตอบรับ</dt><dd>{formatThb(invoiceDraft.proposal_total_thb)}</dd></div>
              <div><dt>ส่วนต่าง change orders ที่อนุมัติ</dt><dd>{formatSignedThb(invoiceDraft.approved_change_order_total_thb)}</dd></div>
              <div><dt>ยอดสัญญาที่ตรึง</dt><dd>{formatThb(invoiceDraft.contract_total_thb)}</dd></div>
              <div><dt>ออกเอกสารงวดก่อน</dt><dd>{formatThb(committed)}</dd></div>
              <div><dt>ฐานภาษี · VAT {Math.round(invoiceDraft.vat_rate * 100)}%</dt><dd>{formatThb(invoiceDraft.taxable_amount_thb)} · {formatThb(invoiceDraft.vat_amount_thb)}</dd></div>
              <div className="is-grand"><dt>ยอดงวดนี้ · {invoiceDraft.billing_percent.toLocaleString('th-TH')}%</dt><dd>{formatThb(invoiceDraft.amount_due_thb)}</dd></div>
              <div className={remaining < -0.03 ? 'is-over' : ''}><dt>คงเหลือหลังออกงวดนี้</dt><dd>{formatThb(remaining)}</dd></div>
            </dl>
            {remaining < -0.03 && <p className="cf-proposal-warning">ยอดงวดนี้เกินวงเงินที่ยังออกเอกสารได้ · ลดสัดส่วนก่อนออกเอกสาร</p>}
          </>
        })()}
        <div className="cf-proposal-fields cf-invoice-notes"><label className="cf-proposal-wide">หมายเหตุ<textarea value={invoiceDraft.notes} onChange={event => updateInvoiceDraft({ notes: event.target.value })} rows={3} maxLength={4000} /></label></div>
        {invoiceError && <p className="cf-proposal-error" role="alert">{invoiceError}</p>}
        <footer className="cf-proposal-actions"><button type="button" className="cf-button cf-button-quiet" onClick={() => setInvoiceDraft(null)}>ปิด</button><button type="button" className="cf-button cf-button-primary" onClick={saveInvoice} disabled={invoiceDraftSnapshotStale}>บันทึก snapshot</button></footer>
      </section>
    </div>, document.body)}

    {paymentDraft && createPortal(<div className="cf-proposal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setPaymentDraft(null) }}>
      <section className="cf-proposal-composer cf-payment-composer" role="dialog" aria-modal="true" aria-labelledby="cf-payment-title" onKeyDown={event => { if (event.key === 'Escape') setPaymentDraft(null) }}>
        <header className="cf-proposal-heading"><div><h2 id="cf-payment-title">บันทึกรับชำระ</h2></div><button type="button" aria-label="ปิดแบบฟอร์มรับชำระ" onClick={() => setPaymentDraft(null)}><X size={19} /></button></header>
        <div className="cf-proposal-caveat">บันทึกเป็นประวัติรับเงินจริงที่ผู้ใช้กรอก · ระบบไม่ตัดเงินและไม่ตรวจสอบรายการกับธนาคาร</div>
        <div className="cf-proposal-fields">
          <label>ยอดรับชำระ (บาท)<input autoFocus type="number" min="0.01" step="0.01" inputMode="decimal" value={paymentDraft.amount} onChange={event => setPaymentDraft(current => current ? { ...current, amount: event.target.value } : current)} /></label>
          <label>วิธีรับชำระ<select value={paymentDraft.method} onChange={event => setPaymentDraft(current => current ? { ...current, method: event.target.value as InvoicePaymentMethod } : current)}>
            {Object.entries(invoicePaymentMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <label className="cf-proposal-wide">เลขอ้างอิง / เลขเช็ค<input value={paymentDraft.reference} onChange={event => setPaymentDraft(current => current ? { ...current, reference: event.target.value } : current)} maxLength={160} /></label>
          <label className="cf-proposal-wide">หมายเหตุ<textarea value={paymentDraft.note} onChange={event => setPaymentDraft(current => current ? { ...current, note: event.target.value } : current)} rows={3} maxLength={1000} /></label>
        </div>
        {paymentError && <p className="cf-proposal-error" role="alert">{paymentError}</p>}
        <footer className="cf-proposal-actions"><button type="button" className="cf-button cf-button-quiet" onClick={() => setPaymentDraft(null)}>ยกเลิก</button><button type="button" className="cf-button cf-button-primary" onClick={saveInvoicePayment}>บันทึกรับชำระ</button></footer>
      </section>
    </div>, document.body)}

    {rateDraft && createPortal(<div className="cf-proposal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setRateDraft(null) }}>
      <section className="cf-proposal-composer cf-rate-composer" role="dialog" aria-modal="true" aria-labelledby="cf-rate-title" onKeyDown={event => { if (event.key === 'Escape') setRateDraft(null) }}>
        <header className="cf-proposal-heading"><div><span>Library · Price book ของโครงการ</span><h2 id="cf-rate-title">อัตราวัสดุและค่าแรง</h2></div><button type="button" aria-label="ปิด price book" onClick={() => setRateDraft(null)}><X size={19} /></button></header>
        <div className="cf-proposal-caveat">ปรับอัตราแล้ว BOQ และข้อเสนอที่สร้างใหม่จะใช้ราคานี้ · ข้อเสนอที่บันทึกไว้ก่อนหน้าเก็บยอด snapshot เดิม</div>
        <section className="cf-rate-library" aria-label="Library ราคาใช้ซ้ำข้ามโครงการ">
          <div className="cf-rate-library-heading"><strong>ชุดราคา Library</strong><span>บันทึกไว้ในเบราว์เซอร์นี้และนำไปใช้กับโครงการอื่นได้</span></div>
          <div className="cf-rate-library-controls">
            <label>เลือกชุดราคา
              <select aria-label="เลือกชุดราคา Library" value={selectedRateBookId} onChange={event => { setSelectedRateBookId(event.target.value); setRateBookMessage(''); setRateBookError('') }} disabled={rateBookBusy || rateBooks.length === 0}>
                {rateBooks.length === 0 ? <option value="">{rateBookBusy ? 'กำลังอ่าน Library…' : 'ยังไม่มีชุดราคา'}</option> : rateBooks.map(book => <option key={book.id} value={book.id}>{book.name}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => {
              if (!selectedRateBook) return
              setRateDraft({ ...DEFAULT_THAI_UNIT_RATES, ...selectedRateBook.rates })
              setRateBookMessage(`นำ “${selectedRateBook.name}” มาใส่แบบร่างแล้ว · กดบันทึกราคาโครงการเพื่อใช้กับโครงการนี้`)
              setRateBookError('')
            }} disabled={!selectedRateBook || rateBookBusy}>นำชุดราคามาใช้</button>
            <button type="button" onClick={exportRateBook} disabled={!selectedRateBook || rateBookBusy}><Download size={14} aria-hidden="true" /> ส่งออก</button>
            <button type="button" onClick={() => rateBookFileInput.current?.click()} disabled={rateBookBusy}><Upload size={14} aria-hidden="true" /> นำเข้า</button>
            <input ref={rateBookFileInput} type="file" accept=".json,application/json" hidden aria-label="นำเข้า Library ราคา JSON" onChange={event => void importRateBook(event.currentTarget.files?.[0] ?? null)} />
          </div>
          <div className="cf-rate-library-save">
            <input aria-label="ชื่อชุดราคาใหม่" value={rateBookName} onChange={event => setRateBookName(event.target.value)} maxLength={100} placeholder="เช่น ราคาผู้รับเหมา · กรุงเทพฯ 2569" />
            <button type="button" onClick={() => void saveRateBook()} disabled={rateBookBusy || !rateBookName.trim()}>{rateBookBusy ? 'กำลังบันทึก…' : 'บันทึกเป็นชุดใหม่'}</button>
            {selectedRateBook && <button type="button" onClick={() => void saveRateBook(selectedRateBook.id)} disabled={rateBookBusy}>อัปเดตชุดที่เลือก</button>}
            {selectedRateBook && <button type="button" className="cf-rate-library-delete" onClick={() => void deleteRateBook(selectedRateBook)} disabled={rateBookBusy}>ลบชุดที่เลือก</button>}
          </div>
          {rateBookError && <p className="cf-rate-library-status is-error" role="alert">{rateBookError}</p>}
          {rateBookMessage && <p className="cf-rate-library-status" role="status">{rateBookMessage}</p>}
        </section>
        <section className="cf-company-library-transfer" aria-label="นำเข้าและส่งออก Company Library">
          <div className="cf-company-library-copy"><strong>Company Library · 6 หมวด + Pricing</strong><span>แบบฟอร์มหน้างาน · ชุดราคา · แม่แบบข้อเสนอ · กฎส่วนลด · Supplier products · Product bundles · ค่า margin บริษัท</span></div>
          <div className="cf-company-library-actions">
            <button type="button" className="cf-company-library-sync" onClick={() => void syncCompanyLibrary()} disabled={companyLibraryBusy}>
              <RefreshCw size={15} aria-hidden="true" />{companyLibraryBusy ? 'กำลังซิงค์…' : 'ซิงค์กับทีม'}
            </button>
            <button type="button" onClick={() => void exportCompanyLibrary()} disabled={companyLibraryBusy}>
              <Download size={15} aria-hidden="true" />{companyLibraryBusy ? 'กำลังเตรียม…' : 'ส่งออกทั้งหมด'}
            </button>
            <button type="button" onClick={() => companyLibraryFileInput.current?.click()} disabled={companyLibraryBusy}>
              <Upload size={15} aria-hidden="true" />นำเข้าและรวม
            </button>
            <input ref={companyLibraryFileInput} type="file" accept=".json,.cfcompanylib.json,application/json" hidden aria-label="เลือกไฟล์ Company Library JSON" onChange={event => void importCompanyLibrary(event.currentTarget.files?.[0] ?? null)} />
          </div>
          <p>บัญชีที่กำหนด company_id บน gateway ใช้ Library เดียวกันข้ามโครงการได้ · บัญชีอื่นใช้ขอบเขตทีมโครงการ · Viewer รับข้อมูลได้ ส่วน Editor/Owner เผยแพร่ได้ · ไฟล์ JSON ใช้ย้ายข้อมูลออฟไลน์</p>
          {companyLibraryError && <p className="cf-company-library-status is-error" role="alert">{companyLibraryError}</p>}
          {companyLibraryMessage && <p className="cf-company-library-status" role="status">{companyLibraryMessage}</p>}
          {companyLibrarySyncError && <p className="cf-company-library-status is-error" role="alert">{companyLibrarySyncError}</p>}
          {companyLibrarySyncMessage && <p className="cf-company-library-status" role="status">{companyLibrarySyncMessage}</p>}
        </section>
        <SupplierProductLibrary
          rates={rateDraft}
          rateLabels={rateLabels}
          catalogRevision={companyLibraryRevision}
          onApplyRate={(key, rate) => {
            setRateDraft(current => current ? { ...current, [key]: rate } : current)
            setRateBookMessage(`ใช้ราคาสินค้าใน ${rateLabels[key] ?? key} แล้ว · กด “บันทึกราคาโครงการ” เพื่อคำนวณ BOQ ใหม่`)
            setRateBookError('')
          }}
          onBeginBundlePlacement={onBeginBundlePlacement}
        />
        <label className="cf-rate-search"><Search size={16} /><input type="search" value={rateQuery} onChange={event => setRateQuery(event.target.value)} placeholder="ค้นหาวัสดุหรือรหัส" /></label>
        <div className="cf-rate-table-wrap"><table className="cf-proposal-table cf-rate-table"><thead><tr><th>รายการ</th><th>หน่วย</th><th>วัสดุ ฿</th><th>ค่าแรง ฿</th></tr></thead><tbody>
          {visibleRates.map(([key, rate]) => <tr key={key}><td><strong>{rateLabels[key] ?? key}</strong><small>{key}</small></td><td>{rate.unit}</td><td><input aria-label={`ค่าวัสดุ ${rateLabels[key] ?? key}`} type="number" min="0" step="0.01" value={rate.material_rate} onChange={event => {
            const value = Number(event.target.value)
            if (Number.isFinite(value) && value >= 0) setRateDraft(current => current ? { ...current, [key]: { ...current[key], material_rate: value } } : current)
          }} /></td><td><input aria-label={`ค่าแรง ${rateLabels[key] ?? key}`} type="number" min="0" step="0.01" value={rate.labor_rate} onChange={event => {
            const value = Number(event.target.value)
            if (Number.isFinite(value) && value >= 0) setRateDraft(current => current ? { ...current, [key]: { ...current[key], labor_rate: value } } : current)
          }} /></td></tr>)}
          {visibleRates.length === 0 && <tr><td colSpan={4}>ไม่พบรายการราคาที่ค้นหา</td></tr>}
        </tbody></table></div>
        <footer className="cf-proposal-actions"><button type="button" className="cf-button cf-button-quiet" onClick={() => setRateDraft(null)}>ยกเลิก</button><button type="button" className="cf-button cf-button-primary" onClick={() => {
          if (onSaveTakeoffRates(rateDraft)) setRateDraft(null)
        }}>บันทึกราคาโครงการ</button></footer>
      </section>
    </div>, document.body)}
    {signatureProposal && <ProposalSignatureCaptureModal
      proposalTitle={signatureProposal.title}
      initialSignerName={signatureProposal.recipient_name}
      onCancel={() => setSignatureProposal(null)}
      onConfirm={signature => {
        if (!transitionProposal(signatureProposal, 'accepted', signature)) return false
        setSignatureProposal(null)
        return true
      }}
    />}
    {approvalLinkProposal && <ProposalApprovalLinkModal
      project={project}
      proposal={project.proposal_drafts?.find(item => item.id === approvalLinkProposal.id) ?? approvalLinkProposal}
      onClose={() => setApprovalLinkProposal(null)}
      onApplyDecision={(target, signature, note) => transitionProposal(approvalLinkProposal, target, undefined, signature, note)}
    />}
  </section>
}
