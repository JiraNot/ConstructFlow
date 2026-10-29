import { getArchitectureDeletionDependents } from '@constructflow/architecture-engine'
import { validatePolygonWithVoids } from '@constructflow/geometry-kernel'
import { getStructureDeletionDependents, reconcileStructureDeletion } from '@constructflow/structure-engine'
import { DeleteObjectInput } from '@constructflow/command-schema'
import {
  analyzeDependencyImpact,
  buildDependencyGraph,
  normalizeCoordinationSettings,
  validateCoordinationSettings,
  validateDrawingSettings,
  validatePlanDimension,
  validatePlanFill,
  validatePlanSketch,
  validateProposalDraft,
  validateProposalDeviceSignatureInput,
  validateProposalRecipientSignature,
  validateChangeOrder,
  validateInvoice,
  canTransitionProposalStatus,
  canTransitionInvoiceStatus,
  getInvoicePaidAmount,
  getInvoiceOutstandingAmount,
  validateProjectTakeoffRates,
  validateProjectV2,
  validateFieldPhotoInspections,
  validateFieldForms,
  validateProjectComments,
  mergeProjectComments,
  validateRainwaterDesignSettings,
  validateSiteSurvey,
  resolveStairVerticalExtent,
} from '@constructflow/project-model'
import type { AddProjectCommentReplyInput, ApplyProjectHistoryDeltaInput, CreateProjectCommentInput, CreateSupplierBundleInstanceInput, DeleteFieldFormInput, DeleteProposalDraftInput, DeleteSheetLayoutTemplateInput, DeleteViewTemplateInput, MergeProjectCommentsInput, RecordInvoicePaymentInput, RestoreProjectRevisionInput, SaveChangeOrderDraftInput, SaveFieldFormInput, SaveFieldPhotoInspectionInput, SaveInvoiceDraftInput, SaveProposalDraftInput, SaveSheetLayoutTemplateInput, SaveViewTemplateInput, SetProjectCommentStatusInput, SetViewVisibilityInput, TransitionChangeOrderStatusInput, TransitionInvoiceStatusInput, TransitionProposalStatusInput, UpdateCoordinationSettingsInput, UpdateObjectSourceReferencesInput, UpdateRainwaterDesignInput, UpdateSheetViewportInput, UpdateSiteSurveyInput, UpdateTakeoffRatesInput } from '@constructflow/command-schema'
import { applyProjectHistoryDelta } from './projectHistoryDelta.js'

import {
  CommandHandlerContext,
  CommandBusResult,
  SetWorkingLevelInput,
  SetWorkingPhaseInput,
  CreateLevelInput,
  UpdateLevelInput,
  UpdateObjectPhaseInput,
} from '@constructflow/command-schema'

function getAcceptedContractSnapshot(project: CommandHandlerContext['project'], proposalId: string) {
  const proposal = project.proposal_drafts?.find(item => item.id === proposalId && item.status === 'accepted')
  if (!proposal) return null
  const changeOrders = (project.change_orders ?? []).filter(item => item.proposal_id === proposalId && item.status === 'accepted')
  const approvedChangeOrderTotal = changeOrders.reduce((sum, item) => sum + item.grand_total_delta_thb, 0)
  return {
    proposal,
    proposalTotal: proposal.grand_total_thb,
    changeOrders,
    changeOrderTotal: Number(approvedChangeOrderTotal.toFixed(2)),
    contractTotal: Number((proposal.grand_total_thb + approvedChangeOrderTotal).toFixed(2)),
    changeOrderIds: changeOrders.map(item => item.id).sort(),
  }
}

function getCommittedInvoiceTotal(project: CommandHandlerContext['project'], proposalId: string, excludeInvoiceId?: string): number {
  return Number((project.invoices ?? []).filter(invoice => invoice.proposal_id === proposalId && invoice.id !== excludeInvoiceId && ['issued', 'partially_paid', 'paid'].includes(invoice.status))
    .reduce((sum, invoice) => sum + invoice.amount_due_thb, 0).toFixed(2))
}

function matchesInvoiceContractSnapshot(invoice: NonNullable<CommandHandlerContext['project']['invoices']>[number], snapshot: NonNullable<ReturnType<typeof getAcceptedContractSnapshot>>): boolean {
  const sourceIds = [...invoice.source_change_order_ids].sort()
  return Math.abs(invoice.proposal_total_thb - snapshot.proposalTotal) <= 0.03
    && Math.abs(invoice.approved_change_order_total_thb - snapshot.changeOrderTotal) <= 0.03
    && Math.abs(invoice.contract_total_thb - snapshot.contractTotal) <= 0.03
    && sourceIds.length === snapshot.changeOrderIds.length
    && sourceIds.every((id, index) => id === snapshot.changeOrderIds[index])
}

export function executeProjectCommand(context: CommandHandlerContext): CommandBusResult | undefined {
  const { project, updated, commandName, input, command_id, now, envelope } = context
  switch (commandName) {
    case 'CreateSupplierBundleInstance': {
      const { id, level_id, created_phase, module_data } = input as unknown as CreateSupplierBundleInstanceInput
      const fail = (message: string): never => { throw new Error(`Invalid supplier bundle instance: ${message}`) }
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      const level = updated.levels.find(item => item.id === level_id)
      if (typeof id !== 'string' || !uuid.test(id)) fail('object ID must be a UUID')
      if (!level) fail('level does not exist')
      if (created_phase !== undefined && !['existing', 'demolition', 'new_construction'].includes(created_phase)) fail('phase is invalid')
      if (!module_data || typeof module_data !== 'object' || Array.isArray(module_data)) fail('module data is malformed')
      const visualType = module_data.visual_type
      const expectedUnit = visualType === 'shape' ? 'item' : visualType === 'length' ? 'm' : visualType === 'area' ? 'm2' : undefined
      if (!expectedUnit || module_data.unit !== expectedUnit) fail('visual type and quantity unit do not match')
      if (typeof module_data.bundle_id !== 'string' || !uuid.test(module_data.bundle_id) || typeof module_data.bundle_name !== 'string' || !module_data.bundle_name.trim()) fail('bundle identity is invalid')
      const validPoint = (point: unknown): point is [number, number] => Array.isArray(point) && point.length === 2 && point.every(value => typeof value === 'number' && Number.isFinite(value))
      if (visualType === 'shape' && !validPoint(module_data.location_mm)) fail('shape placement point is invalid')
      if (visualType === 'length' && (!Array.isArray(module_data.path_mm) || module_data.path_mm.length < 2 || module_data.path_mm.length > 500 || !module_data.path_mm.every(validPoint))) fail('length path is invalid')
      if (visualType === 'area') {
        if (!Array.isArray(module_data.boundary_mm) || module_data.boundary_mm.length < 3 || module_data.boundary_mm.length > 500 || !module_data.boundary_mm.every(validPoint)) fail('area boundary is invalid')
        const validation = validatePolygonWithVoids(module_data.boundary_mm as number[][])
        if (!validation.valid) fail(`area ${validation.reason}`)
      }
      const price = module_data.unit_rate_snapshot as Record<string, unknown> | undefined
      if (!price || price.unit !== expectedUnit || !['material_rate', 'labor_rate'].every(field => typeof price[field] === 'number' && Number.isFinite(price[field]) && Number(price[field]) >= 0)) fail('unit rate snapshot is invalid')
      if (!Array.isArray(module_data.component_snapshots) || module_data.component_snapshots.length > 100) fail('component snapshot is invalid')
      const object = {
        id, object_type: 'supplier.bundle_instance', owner_module: 'constructflow.takeoff', schema_version: 1,
        created_phase: created_phase ?? updated.project.active_phase, removed_phase: null,
        level_refs: [{ role: 'base_level', level_id }], host_refs: [], connector_refs: [], status: 'active' as const,
        module_data: structuredClone(module_data), created_at: now, updated_at: now,
      }
      updated.objects[id] = object
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [id], updated_object_ids: [id], created_object_ids: [id] }, updatedProject: updated, emittedEnvelope: envelope }
    }
    case 'UpdateSupplierBundleInstance': {
      const objectId = String(input.object_id ?? input.id ?? '')
      const object = updated.objects[objectId]
      if (!object || object.object_type !== 'supplier.bundle_instance') throw new Error('Supplier bundle instance was not found')
      const validPoint = (point: unknown): point is [number, number] => Array.isArray(point) && point.length === 2 && point.every(value => typeof value === 'number' && Number.isFinite(value))
      const changes: Record<string, unknown> = {}
      if (input.location_mm !== undefined) {
        if (!validPoint(input.location_mm)) throw new Error('Supplier bundle shape location is invalid')
        changes.location_mm = input.location_mm
      }
      if (input.path_mm !== undefined) {
        if (!Array.isArray(input.path_mm) || input.path_mm.length < 2 || input.path_mm.length > 500 || !input.path_mm.every(validPoint)) throw new Error('Supplier bundle length path is invalid')
        changes.path_mm = input.path_mm
      }
      if (input.boundary_mm !== undefined) {
        if (!Array.isArray(input.boundary_mm) || input.boundary_mm.length < 3 || input.boundary_mm.length > 500 || !input.boundary_mm.every(validPoint)) throw new Error('Supplier bundle area boundary is invalid')
        const validation = validatePolygonWithVoids(input.boundary_mm as number[][])
        if (!validation.valid) throw new Error(`Supplier bundle area ${validation.reason}`)
        const areaTwice = input.boundary_mm.reduce((sum: number, point: [number, number], index: number, ring: [number, number][]) => {
          const next = ring[(index + 1) % ring.length]!
          return sum + point[0] * next[1] - next[0] * point[1]
        }, 0)
        if (!Number.isFinite(areaTwice) || Math.abs(areaTwice) < 1) throw new Error('Supplier bundle area has zero area')
        changes.boundary_mm = input.boundary_mm
      }
      if (!Object.keys(changes).length) throw new Error('Supplier bundle geometry changes are missing')
      updated.objects[objectId] = { ...object, updated_at: now, module_data: { ...object.module_data, ...changes } }
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [objectId], updated_object_ids: [objectId] }, updatedProject: updated, emittedEnvelope: envelope }
    }
    case 'ApplyProjectHistoryDelta': {
      const affectedIds = applyProjectHistoryDelta(updated, input as unknown as ApplyProjectHistoryDeltaInput)
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: affectedIds }, updatedProject: updated }
    }
    case 'RestoreProjectRevision': {
      const { revision_id, project: restored } = input as unknown as RestoreProjectRevisionInput
      if (typeof revision_id !== 'string' || !revision_id.trim()) throw new Error('A revision ID is required')
      if (!restored || restored.project?.id !== project.project.id) throw new Error('A revision can only restore the current project UUID')
      validateProjectV2(restored)
      const affectedIds = [...new Set([...Object.keys(updated.objects), ...Object.keys(restored.objects)])]
      const target = updated as unknown as Record<string, unknown>
      for (const key of Object.keys(target)) delete target[key]
      Object.assign(target, structuredClone(restored))
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: affectedIds }, updatedProject: updated, emittedEnvelope: envelope }
    }
    case 'UpdateTakeoffRates': {
      const { rates } = input as unknown as UpdateTakeoffRatesInput
      validateProjectTakeoffRates(rates)
      updated.takeoff_rates = structuredClone(rates)
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] }, updatedProject: updated, emittedEnvelope: envelope }
    }
    case 'SaveFieldPhotoInspection': {
      const { inspection } = input as unknown as SaveFieldPhotoInspectionInput
      const records = [...(updated.field_photo_inspections ?? [])]
      const index = records.findIndex(item => item.id === inspection?.id)
      if (index < 0) records.push(structuredClone(inspection))
      else records[index] = structuredClone(inspection)
      validateFieldPhotoInspections(records, new Set(updated.levels.map(level => level.id)))
      updated.field_photo_inspections = records
      // Photo assets are local media and must never be sent to the SketchUp mutation bridge.
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] }, updatedProject: updated }
    }
    case 'SaveFieldForm': {
      const { form } = input as unknown as SaveFieldFormInput
      const records = [...(updated.field_forms ?? [])]
      const index = records.findIndex(item => item.id === form?.id)
      const existing = index < 0 ? undefined : records[index]
      if (existing?.status === 'submitted') throw new Error('Submitted field forms are read-only records')
      if (form?.status === 'submitted' && existing?.status !== 'draft') throw new Error('Only a saved draft can be submitted')
      if (index < 0) records.push(structuredClone(form))
      else records[index] = structuredClone(form)
      validateFieldForms(records, {
        levelIds: new Set(updated.levels.map(level => level.id)),
        photoInspectionIds: new Set((updated.field_photo_inspections ?? []).map(inspection => inspection.id)),
      })
      updated.field_forms = records
      // Keep field records in the portable project document; the current SketchUp bridge does not own field-form data.
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] }, updatedProject: updated }
    }
    case 'DeleteFieldForm': {
      const { form_id } = input as unknown as DeleteFieldFormInput
      const existing = updated.field_forms?.find(item => item.id === form_id)
      if (!existing) throw new Error(`Field form ${form_id} was not found`)
      if (existing.status !== 'draft') throw new Error('Submitted field forms cannot be deleted')
      updated.field_forms = updated.field_forms?.filter(item => item.id !== form_id) ?? []
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] }, updatedProject: updated }
    }
    case 'CreateProjectComment': {
      const { comment } = input as unknown as CreateProjectCommentInput
      const comments = [...(updated.comments ?? []), structuredClone(comment)]
      validateProjectComments(comments)
      if (updated.comments?.some(existing => existing.id === comment.id)) throw new Error(`Project comment ${comment.id} already exists`)
      updated.comments = comments
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: comment.object_id ? [comment.object_id] : [] }, updatedProject: updated }
    }
    case 'AddProjectCommentReply': {
      const { comment_id, reply } = input as unknown as AddProjectCommentReplyInput
      const comments = updated.comments ?? []
      const existing = comments.find(comment => comment.id === comment_id)
      if (!existing) throw new Error(`Project comment ${comment_id} was not found`)
      if (existing.replies.length >= 100) throw new Error('This comment thread has reached its reply limit')
      const next = { ...existing, replies: [...existing.replies, structuredClone(reply)], updated_at: now }
      const nextComments = comments.map(comment => comment.id === comment_id ? next : comment)
      validateProjectComments(nextComments)
      updated.comments = nextComments
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: existing.object_id ? [existing.object_id] : [] }, updatedProject: updated }
    }
    case 'SetProjectCommentStatus': {
      const { comment_id, status } = input as unknown as SetProjectCommentStatusInput
      if (!['open', 'resolved'].includes(status)) throw new Error('Project comment status must be open or resolved')
      const comments = updated.comments ?? []
      const existing = comments.find(comment => comment.id === comment_id)
      if (!existing) throw new Error(`Project comment ${comment_id} was not found`)
      updated.comments = comments.map(comment => comment.id === comment_id ? { ...comment, status, status_updated_at: now, updated_at: now } : comment)
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: existing.object_id ? [existing.object_id] : [] }, updatedProject: updated }
    }
    case 'MergeProjectComments': {
      const { comments: incoming } = input as unknown as MergeProjectCommentsInput
      validateProjectComments(incoming)
      const comments = mergeProjectComments(updated.comments ?? [], incoming)
      validateProjectComments(comments)
      updated.comments = comments
      // Discussion sync is project metadata and must stay out of the SketchUp model bridge.
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] }, updatedProject: updated }
    }
    case 'SaveProposalDraft': {
      const { proposal } = input as unknown as SaveProposalDraftInput
      validateProposalDraft(proposal)
      if (proposal.status !== 'draft') throw new Error('Proposal drafts can only be saved with draft status')
      const current = updated.proposal_drafts ?? []
      const existing = current.find(item => item.id === proposal.id)
      if (existing && existing.status !== 'draft') throw new Error('Only draft proposals can be edited')
      updated.proposal_drafts = [...current.filter(item => item.id !== proposal.id), structuredClone(proposal)]
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] }, updatedProject: updated, emittedEnvelope: envelope }
    }
    case 'TransitionProposalStatus': {
      const { proposal_id, target_status, note, device_signature, recipient_signature } = input as unknown as TransitionProposalStatusInput
      if (typeof proposal_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(proposal_id)) throw new Error('Proposal ID must be a UUID')
      if (!['sent', 'accepted', 'declined', 'void'].includes(target_status)) throw new Error('Proposal status transition target is unsupported')
      if (note !== undefined && (typeof note !== 'string' || note.length > 1000)) throw new Error('Proposal status note must be at most 1000 characters')
      if (device_signature !== undefined) {
        if (target_status !== 'accepted') throw new Error('A device signature can only accompany proposal acceptance')
        if (recipient_signature !== undefined) throw new Error('Choose either a device signature or a recipient approval signature')
        validateProposalDeviceSignatureInput(device_signature)
      }
      if (recipient_signature !== undefined) {
        if (target_status !== 'accepted' && target_status !== 'declined') throw new Error('A recipient signature can only accompany a recipient decision')
        validateProposalRecipientSignature(recipient_signature)
      }
      const proposals = updated.proposal_drafts ?? []
      const index = proposals.findIndex(item => item.id === proposal_id)
      const existing = proposals[index]
      if (!existing) throw new Error(`Proposal ${proposal_id} was not found`)
      validateProposalDraft(existing)
      if (!canTransitionProposalStatus(existing.status, target_status)) throw new Error(`Proposal cannot transition from ${existing.status} to ${target_status}`)
      const next = {
        ...existing,
        status: target_status,
        updated_at: now,
        status_events: [...(existing.status_events ?? []), {
          command_id,
          from_status: existing.status,
          to_status: target_status,
          occurred_at: now,
          actor: structuredClone(envelope.actor),
          ...(note?.trim() ? { note: note.trim() } : {}),
          ...(device_signature ? { device_signature: { ...structuredClone(device_signature), captured_at: now } } : {}),
          ...(recipient_signature ? { recipient_signature: structuredClone(recipient_signature) } : {}),
        }],
      }
      validateProposalDraft(next)
      updated.proposal_drafts = proposals.map((proposal, proposalIndex) => proposalIndex === index ? next : proposal)
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] }, updatedProject: updated, emittedEnvelope: envelope }
    }
    case 'SaveChangeOrderDraft': {
      const { change_order: changeOrder } = input as unknown as SaveChangeOrderDraftInput
      validateChangeOrder(changeOrder, updated.proposal_drafts ?? [])
      if (changeOrder.status !== 'draft') throw new Error('Change order drafts can only be saved with draft status')
      const proposals = updated.proposal_drafts ?? []
      const proposal = proposals.find(item => item.id === changeOrder.proposal_id)
      if (!proposal || proposal.status !== 'accepted') throw new Error('Change orders require an accepted proposal')
      const orders = updated.change_orders ?? []
      const existing = orders.find(item => item.id === changeOrder.id)
      if (existing && existing.status !== 'draft') throw new Error('Only draft change orders can be edited')
      if (orders.some(item => item.id !== changeOrder.id && item.proposal_id === changeOrder.proposal_id && item.number.toLocaleLowerCase('en-US') === changeOrder.number.toLocaleLowerCase('en-US'))) throw new Error(`Change order number ${changeOrder.number} is already used for this proposal`)
      const contractTotal = proposal.grand_total_thb + orders.filter(item => item.proposal_id === proposal.id && item.status === 'accepted').reduce((sum, item) => sum + item.grand_total_delta_thb, 0)
      if (Math.abs(contractTotal - changeOrder.base_contract_total_thb) > 0.03) throw new Error('Accepted contract value changed; rebuild this change order from the latest scope')
      updated.change_orders = [...orders.filter(item => item.id !== changeOrder.id), structuredClone(changeOrder)]
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] }, updatedProject: updated, emittedEnvelope: envelope }
    }
    case 'TransitionChangeOrderStatus': {
      const { change_order_id: changeOrderId, target_status: targetStatus, note } = input as unknown as TransitionChangeOrderStatusInput
      if (typeof changeOrderId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(changeOrderId)) throw new Error('Change order ID must be a UUID')
      if (!['sent', 'accepted', 'declined', 'void'].includes(targetStatus)) throw new Error('Change order status transition target is unsupported')
      if (note !== undefined && (typeof note !== 'string' || note.length > 1000)) throw new Error('Change order status note must be at most 1000 characters')
      const orders = updated.change_orders ?? []
      const index = orders.findIndex(item => item.id === changeOrderId)
      const existing = orders[index]
      if (!existing) throw new Error(`Change order ${changeOrderId} was not found`)
      validateChangeOrder(existing, updated.proposal_drafts ?? [])
      if (!canTransitionProposalStatus(existing.status, targetStatus)) throw new Error(`Change order cannot transition from ${existing.status} to ${targetStatus}`)
      if (targetStatus === 'sent' || targetStatus === 'accepted') {
        const proposal = updated.proposal_drafts?.find(item => item.id === existing.proposal_id)
        if (!proposal || proposal.status !== 'accepted') throw new Error('Change order can only be sent or accepted while its base proposal remains accepted')
        const acceptedTotal = proposal.grand_total_thb + orders.filter(item => item.id !== existing.id && item.proposal_id === proposal.id && item.status === 'accepted').reduce((sum, item) => sum + item.grand_total_delta_thb, 0)
        if (Math.abs(acceptedTotal - existing.base_contract_total_thb) > 0.03) throw new Error('Accepted contract value changed; rebuild this change order before sending or acceptance')
        if (acceptedTotal + existing.grand_total_delta_thb < -0.03) throw new Error('This scope reduction would make the accepted contract value negative; revise the draft before sending')
        if (targetStatus === 'accepted' && getCommittedInvoiceTotal(updated, existing.proposal_id) - (acceptedTotal + existing.grand_total_delta_thb) > 0.03) throw new Error('This scope reduction would put the contract below the amount already invoiced')
      }
      const next = {
        ...existing,
        status: targetStatus,
        updated_at: now,
        status_events: [...(existing.status_events ?? []), {
          command_id,
          from_status: existing.status,
          to_status: targetStatus,
          occurred_at: now,
          actor: structuredClone(envelope.actor),
          ...(note?.trim() ? { note: note.trim() } : {}),
        }],
      }
      validateChangeOrder(next, updated.proposal_drafts ?? [])
      updated.change_orders = orders.map((item, orderIndex) => orderIndex === index ? next : item)
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] }, updatedProject: updated, emittedEnvelope: envelope }
    }
    case 'SaveInvoiceDraft': {
      const { invoice } = input as unknown as SaveInvoiceDraftInput
      validateInvoice(invoice, updated.proposal_drafts ?? [], updated.change_orders ?? [])
      if (invoice.status !== 'draft') throw new Error('Invoice drafts can only be saved with draft status')
      const snapshot = getAcceptedContractSnapshot(updated, invoice.proposal_id)
      if (!snapshot) throw new Error('Invoices require an accepted proposal')
      if (!matchesInvoiceContractSnapshot(invoice, snapshot)) throw new Error('The accepted contract changed; rebuild this invoice draft from the latest proposal and approved change orders')
      const invoices = updated.invoices ?? []
      const existing = invoices.find(item => item.id === invoice.id)
      if (existing && existing.status !== 'draft') throw new Error('Only draft invoices can be edited')
      if (invoices.some(item => item.id !== invoice.id && item.number.toLocaleLowerCase('en-US') === invoice.number.toLocaleLowerCase('en-US'))) throw new Error(`Invoice number ${invoice.number} is already used in this project`)
      updated.invoices = [...invoices.filter(item => item.id !== invoice.id), structuredClone(invoice)]
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] }, updatedProject: updated, emittedEnvelope: envelope }
    }
    case 'TransitionInvoiceStatus': {
      const { invoice_id: invoiceId, target_status: targetStatus, note } = input as unknown as TransitionInvoiceStatusInput
      if (typeof invoiceId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(invoiceId)) throw new Error('Invoice ID must be a UUID')
      if (!['issued', 'void'].includes(targetStatus)) throw new Error('Invoice status transition target is unsupported')
      if (note !== undefined && (typeof note !== 'string' || note.length > 1000)) throw new Error('Invoice status note must be at most 1000 characters')
      const invoices = updated.invoices ?? []
      const index = invoices.findIndex(item => item.id === invoiceId)
      const existing = invoices[index]
      if (!existing) throw new Error(`Invoice ${invoiceId} was not found`)
      validateInvoice(existing, updated.proposal_drafts ?? [], updated.change_orders ?? [])
      if (!canTransitionInvoiceStatus(existing.status, targetStatus)) throw new Error(`Invoice cannot transition from ${existing.status} to ${targetStatus}`)
      if (targetStatus === 'issued') {
        const snapshot = getAcceptedContractSnapshot(updated, existing.proposal_id)
        if (!snapshot) throw new Error('Invoices can only be issued from an accepted proposal')
        if (!matchesInvoiceContractSnapshot(existing, snapshot)) throw new Error('The accepted contract changed; rebuild this invoice before issuing')
        const committedTotal = getCommittedInvoiceTotal(updated, existing.proposal_id, existing.id)
        if (committedTotal + existing.amount_due_thb - snapshot.contractTotal > 0.03) throw new Error('This invoice would bill more than the current accepted contract balance')
      } else if (existing.payments.length > 0) throw new Error('An invoice with recorded payments cannot be voided')
      const next = {
        ...existing,
        status: targetStatus,
        updated_at: now,
        status_events: [...existing.status_events, {
          command_id,
          from_status: existing.status,
          to_status: targetStatus,
          occurred_at: now,
          actor: structuredClone(envelope.actor),
          ...(note?.trim() ? { note: note.trim() } : {}),
        }],
      }
      validateInvoice(next, updated.proposal_drafts ?? [], updated.change_orders ?? [])
      updated.invoices = invoices.map((item, invoiceIndex) => invoiceIndex === index ? next : item)
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] }, updatedProject: updated, emittedEnvelope: envelope }
    }
    case 'RecordInvoicePayment': {
      const { invoice_id: invoiceId, amount_thb: amount, method, reference, integration_reference: integrationReference, received_at: receivedAt, note } = input as unknown as RecordInvoicePaymentInput
      if (typeof invoiceId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(invoiceId)) throw new Error('Invoice ID must be a UUID')
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) throw new Error('Payment amount must be greater than zero')
      if (!['cash', 'bank_transfer', 'cheque', 'other'].includes(method)) throw new Error('Payment method is unsupported')
      if (reference !== undefined && (typeof reference !== 'string' || reference.length > 160)) throw new Error('Payment reference must be at most 160 characters')
      if (integrationReference !== undefined && (typeof integrationReference !== 'string' || !integrationReference.startsWith('QBO:') || integrationReference.length > 240)) throw new Error('Payment integration reference is invalid')
      if (receivedAt !== undefined) {
        if (!integrationReference || typeof receivedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(receivedAt)) throw new Error('Imported payment date must be an ISO date and include an integration reference')
        const parsedDate = new Date(`${receivedAt}T00:00:00.000Z`)
        if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== receivedAt) throw new Error('Imported payment date is invalid')
      }
      if (note !== undefined && (typeof note !== 'string' || note.length > 1000)) throw new Error('Payment note must be at most 1000 characters')
      const invoices = updated.invoices ?? []
      const index = invoices.findIndex(item => item.id === invoiceId)
      const existing = invoices[index]
      if (!existing) throw new Error(`Invoice ${invoiceId} was not found`)
      validateInvoice(existing, updated.proposal_drafts ?? [], updated.change_orders ?? [])
      if (integrationReference && existing.payments.some(payment => payment.integration_reference === integrationReference)) {
        return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] }, updatedProject: updated, emittedEnvelope: envelope }
      }
      if (!['issued', 'partially_paid'].includes(existing.status)) throw new Error('Only issued invoices with an open balance can receive a payment record')
      if (amount - getInvoiceOutstandingAmount(existing) > 0.03) throw new Error('Payment amount exceeds the outstanding invoice balance')
      const payments = [...existing.payments, {
        command_id,
        amount_thb: Number(amount.toFixed(2)),
        method,
        received_at: receivedAt ?? now,
        actor: structuredClone(envelope.actor),
        ...(reference?.trim() ? { reference: reference.trim() } : {}),
        ...(integrationReference ? { integration_reference: integrationReference } : {}),
        ...(note?.trim() ? { note: note.trim() } : {}),
      }]
      const paidAmount = getInvoicePaidAmount({ payments })
      const next = {
        ...existing,
        status: getInvoiceOutstandingAmount({ amount_due_thb: existing.amount_due_thb, payments }) <= 0.03 ? 'paid' as const : 'partially_paid' as const,
        updated_at: now,
        payments,
      }
      if (paidAmount - existing.amount_due_thb > 0.03) throw new Error('Payment total exceeds the invoice amount')
      validateInvoice(next, updated.proposal_drafts ?? [], updated.change_orders ?? [])
      updated.invoices = invoices.map((item, invoiceIndex) => invoiceIndex === index ? next : item)
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] }, updatedProject: updated, emittedEnvelope: envelope }
    }
    case 'DeleteProposalDraft': {
      const { proposal_id } = input as unknown as DeleteProposalDraftInput
      const current = updated.proposal_drafts ?? []
      const existing = current.find(proposal => proposal.id === proposal_id)
      if (!existing) throw new Error(`Proposal ${proposal_id} was not found`)
      if (existing.status !== 'draft') throw new Error('Only draft proposals can be deleted')
      updated.proposal_drafts = current.filter(proposal => proposal.id !== proposal_id)
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] }, updatedProject: updated, emittedEnvelope: envelope }
    }
    case 'SavePlanDimension': {
      const dimension = input.dimension
      validatePlanDimension(dimension)
      if (!updated.levels.some(level => level.id === dimension.level_id)) throw new Error('Plan dimension level does not exist')
      const settings = updated.drawing_settings ?? { viewports: {} }
      const dimensions = [...(settings.plan_dimensions ?? [])]
      const index = dimensions.findIndex(item => item.id === dimension.id)
      if (index < 0) dimensions.push(structuredClone(dimension))
      else dimensions[index] = structuredClone(dimension)
      updated.drawing_settings = { ...settings, plan_dimensions: dimensions }
      validateDrawingSettings(updated.drawing_settings)
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] }, updatedProject: updated, emittedEnvelope: envelope }
    }
    case 'DeletePlanDimension': {
      const settings = updated.drawing_settings
      if (!settings?.plan_dimensions?.some(dimension => dimension.id === input.dimension_id)) throw new Error('Plan dimension does not exist')
      updated.drawing_settings = { ...settings, plan_dimensions: settings.plan_dimensions.filter(dimension => dimension.id !== input.dimension_id) }
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] }, updatedProject: updated, emittedEnvelope: envelope }
    }
    case 'SavePlanFill': {
      const fill = input.fill
      validatePlanFill(fill)
      if (!updated.levels.some(level => level.id === fill.level_id)) throw new Error('Plan fill level does not exist')
      const settings = updated.drawing_settings ?? { viewports: {} }
      const fills = [...(settings.plan_fills ?? [])]
      const index = fills.findIndex(item => item.id === fill.id)
      if (index < 0) fills.push(structuredClone(fill))
      else fills[index] = structuredClone(fill)
      updated.drawing_settings = { ...settings, plan_fills: fills }
      validateDrawingSettings(updated.drawing_settings)
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] }, updatedProject: updated, emittedEnvelope: envelope }
    }
    case 'DeletePlanFill': {
      const settings = updated.drawing_settings
      if (!settings?.plan_fills?.some(fill => fill.id === input.fill_id)) throw new Error('Plan fill does not exist')
      updated.drawing_settings = { ...settings, plan_fills: settings.plan_fills.filter(fill => fill.id !== input.fill_id) }
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] }, updatedProject: updated, emittedEnvelope: envelope }
    }
    case 'SavePlanSketch': {
      const sketch = input.sketch
      validatePlanSketch(sketch)
      if (!updated.levels.some(level => level.id === sketch.level_id)) throw new Error('Plan sketch level does not exist')
      const settings = updated.drawing_settings ?? { viewports: {} }
      const sketches = [...(settings.plan_sketches ?? [])]
      const index = sketches.findIndex(item => item.id === sketch.id)
      if (index < 0) sketches.push(structuredClone(sketch))
      else sketches[index] = structuredClone(sketch)
      updated.drawing_settings = { ...settings, plan_sketches: sketches }
      validateDrawingSettings(updated.drawing_settings)
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] }, updatedProject: updated, emittedEnvelope: envelope }
    }
    case 'DeletePlanSketch': {
      const settings = updated.drawing_settings
      if (!settings?.plan_sketches?.some(sketch => sketch.id === input.sketch_id)) throw new Error('Plan sketch does not exist')
      updated.drawing_settings = { ...settings, plan_sketches: settings.plan_sketches.filter(sketch => sketch.id !== input.sketch_id) }
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] }, updatedProject: updated, emittedEnvelope: envelope }
    }
    case 'CreateLevel': {
      const level = input as unknown as CreateLevelInput
      if (!level.id || !level.name.trim()) throw new Error('Level id and name are required')
      if (updated.levels.some(existing => existing.id === level.id)) throw new Error(`Level ${level.id} already exists`)
      if (![level.elevation_mm, level.storey_index].every(Number.isFinite) || level.storey_index < 1) throw new Error('Level elevation and storey index must be valid')
      if (level.height_mm !== undefined && (!Number.isFinite(level.height_mm) || level.height_mm <= 0)) throw new Error('Level height must be greater than zero')
      if (updated.levels.some(existing => Math.abs(existing.elevation_mm - level.elevation_mm) < 1)) throw new Error('Another level already uses this elevation')
      updated.levels.push({ ...level })
      updated.levels.sort((a, b) => a.elevation_mm - b.elevation_mm)
      return {
        result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] },
        updatedProject: updated,
        emittedEnvelope: envelope,
      }
    }
    case 'UpdateCoordinationSettings': {
      const { settings } = input as unknown as UpdateCoordinationSettingsInput
      validateCoordinationSettings(settings)
      const normalized = normalizeCoordinationSettings(settings)
      updated.coordination_settings = normalized
      // Re-running coordination after a settings change is the caller's decision; the command only
      // owns the persisted deviation so undo/redo restores the previous rule set atomically.
      return {
        result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] },
        updatedProject: updated,
        emittedEnvelope: envelope,
      }
    }
    case 'UpdateRainwaterDesign': {
      const { settings } = input as unknown as UpdateRainwaterDesignInput
      validateRainwaterDesignSettings(settings)
      updated.rainwater_design = structuredClone(settings)
      return {
        result: { status: 'success', command_id, command_name: commandName, affected_object_ids: Object.values(updated.objects).filter(object => object.object_type === 'roof.system').map(object => object.id) },
        updatedProject: updated,
        emittedEnvelope: envelope,
      }
    }
    case 'UpdateSiteSurvey': {
      const { survey } = input as unknown as UpdateSiteSurveyInput
      validateSiteSurvey(survey)
      updated.site_survey = structuredClone(survey)
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] }, updatedProject: updated, emittedEnvelope: envelope }
    }
    case 'UpdateObjectSourceReferences': {
      const { object_ids, source_refs } = input as unknown as UpdateObjectSourceReferencesInput
      if (!Array.isArray(object_ids) || object_ids.length === 0 || object_ids.some(id => typeof id !== 'string' || !updated.objects[id]) || new Set(object_ids).size !== object_ids.length) {
        throw new Error('Source references require a non-empty list of unique existing objects')
      }
      if (!Array.isArray(source_refs) || source_refs.length > 100) throw new Error('An object may reference at most 100 project sources')
      const validPointIds = new Set(updated.site_survey?.points.map(point => point.id) ?? [])
      const validBoundaryIds = new Set(updated.site_survey?.boundaries.map(boundary => boundary.id) ?? [])
      const validUnderlayIds = new Set(Object.keys(updated.underlays ?? {}))
      const keys = new Set<string>()
      for (const source of source_refs) {
        if (!source || typeof source.source_id !== 'string' || !source.source_id.trim() || !['site_survey_point', 'site_survey_boundary', 'underlay', 'drawing_page'].includes(source.kind) || (source.kind === 'drawing_page' && (!Number.isInteger(source.page_number) || source.page_number! < 1))) {
          throw new Error('Project source reference is malformed')
        }
        const key = `${source.kind}:${source.source_id}`
        if (keys.has(key)) throw new Error('Project source references must be unique')
        keys.add(key)
        const exists = source.kind === 'drawing_page' ? true : source.kind === 'site_survey_point' ? validPointIds.has(source.source_id)
          : source.kind === 'site_survey_boundary' ? validBoundaryIds.has(source.source_id)
            : validUnderlayIds.has(source.source_id)
        if (!exists) throw new Error(`Project source ${key} does not exist`)
      }
      for (const id of object_ids) {
        const object = updated.objects[id]!
        if (source_refs.length) object.source_refs = structuredClone(source_refs)
        else delete object.source_refs
      }
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [...object_ids] }, updatedProject: updated, emittedEnvelope: envelope }
    }
    case 'UpdateSheetViewport': {
      const {sheet_id,viewport}=input as unknown as UpdateSheetViewportInput
      updated.drawing_settings={...updated.drawing_settings,viewports:{...updated.drawing_settings?.viewports,[sheet_id]:viewport}}
      validateDrawingSettings(updated.drawing_settings)
      return {result:{status:'success',command_id,command_name:commandName,affected_object_ids:[]},updatedProject:updated,emittedEnvelope:envelope}
    }
    case 'SaveSheetLayoutTemplate': {
      const { template } = input as unknown as SaveSheetLayoutTemplateInput
      if (!template || typeof template !== 'object' || !template.id?.trim() || template.id.length > 100) throw new Error('Sheet layout template requires a valid ID')
      if (!template.name?.trim() || template.name.trim().length > 80) throw new Error('Sheet layout template name must contain 1 to 80 characters')
      const settings = updated.drawing_settings ?? { viewports: {} }
      const current = settings.layout_templates ?? []
      if (current.some(existing => existing.id !== template.id && existing.name.trim().toLowerCase() === template.name.trim().toLowerCase())) throw new Error('Sheet layout template names must be unique')
      const viewports = Object.fromEntries(Object.entries(template.viewports ?? {}).map(([sheetId, viewport]) => [sheetId, {
        scale_denominator: viewport.scale_denominator,
        ...(viewport.view_layout !== undefined ? { view_layout: [...viewport.view_layout] } : {}),
        ...(viewport.paper_frame_mm !== undefined ? { paper_frame_mm: [...viewport.paper_frame_mm] as [number, number, number, number] } : {}),
        ...(viewport.subviews !== undefined ? { subviews: structuredClone(viewport.subviews) } : {}),
        ...(viewport.level_id !== undefined ? { level_id: viewport.level_id } : {}),
        ...(viewport.center_mm !== undefined ? { center_mm: [...viewport.center_mm] as [number, number] } : {}),
        ...(viewport.crop_bounds_mm !== undefined ? { crop_bounds_mm: [...viewport.crop_bounds_mm] as [number, number, number, number] } : {}),
        ...(viewport.section_cut_mm !== undefined ? { section_cut_mm: viewport.section_cut_mm } : {}),
      }]))
      const next = [...current.filter(existing => existing.id !== template.id), { id: template.id, name: template.name.trim(), viewports }]
      updated.drawing_settings = { ...settings, layout_templates: next }
      validateDrawingSettings(updated.drawing_settings)
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] }, updatedProject: updated, emittedEnvelope: envelope }
    }
    case 'DeleteSheetLayoutTemplate': {
      const { template_id } = input as unknown as DeleteSheetLayoutTemplateInput
      const settings = updated.drawing_settings
      const current = settings?.layout_templates ?? []
      if (!current.some(template => template.id === template_id)) throw new Error(`Sheet layout template ${template_id} was not found`)
      const layout_templates = current.filter(template => template.id !== template_id)
      if (settings) updated.drawing_settings = { ...settings, ...(layout_templates.length ? { layout_templates } : { layout_templates: undefined }) }
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] }, updatedProject: updated, emittedEnvelope: envelope }
    }
    case 'SaveViewTemplate': {
      const { template } = input as unknown as SaveViewTemplateInput
      if (!template || typeof template !== 'object' || !template.id?.trim() || template.id.length > 100) throw new Error('View template requires a valid ID')
      if (!template.name?.trim() || template.name.trim().length > 80) throw new Error('View template name must contain 1 to 80 characters')
      const views = new Set(['plan', 'framing', 'roofplan', 'north', 'south', 'east', 'west', 'rcp', 'model3d'])
      if (!views.has(template.view_id) || !updated.levels.some(level => level.id === template.level_id)) throw new Error('View template requires a supported view and existing level')
      if (!Array.isArray(template.hidden_object_ids) || template.hidden_object_ids.some(id => typeof id !== 'string' || !updated.objects[id])) throw new Error('View template can only reference existing object UUIDs')
      if (new Set(template.hidden_object_ids).size !== template.hidden_object_ids.length) throw new Error('View template object UUIDs must be unique')
      const current = updated.view_settings?.view_templates ?? []
      if (current.some(existing => existing.id !== template.id && existing.name.trim().toLowerCase() === template.name.trim().toLowerCase())) throw new Error('View template names must be unique')
      const next = current.filter(existing => existing.id !== template.id)
      next.push(structuredClone({ ...template, name: template.name.trim(), hidden_object_ids: [...template.hidden_object_ids] }))
      updated.view_settings = { hidden_object_ids_by_scope: updated.view_settings?.hidden_object_ids_by_scope ?? {}, view_templates: next }
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] }, updatedProject: updated, emittedEnvelope: envelope }
    }
    case 'DeleteViewTemplate': {
      const { template_id } = input as unknown as DeleteViewTemplateInput
      const current = updated.view_settings?.view_templates ?? []
      if (!current.some(template => template.id === template_id)) throw new Error(`View template ${template_id} was not found`)
      const view_templates = current.filter(template => template.id !== template_id)
      const visibility = updated.view_settings?.hidden_object_ids_by_scope ?? {}
      updated.view_settings = Object.keys(visibility).length || view_templates.length
        ? { hidden_object_ids_by_scope: visibility, ...(view_templates.length ? { view_templates } : {}) }
        : undefined
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] }, updatedProject: updated, emittedEnvelope: envelope }
    }
    case 'SetViewVisibility': {
      const { scope_id, hidden_object_ids } = input as unknown as SetViewVisibilityInput
      const [viewId, levelId, extra] = scope_id.split(':')
      const views = new Set(['plan', 'framing', 'roofplan', 'north', 'south', 'east', 'west', 'rcp', 'model3d'])
      if (!scope_id || extra !== undefined || !views.has(viewId) || !updated.levels.some(level => level.id === levelId)) {
        throw new Error('View visibility requires a supported view and existing level scope')
      }
      if (!Array.isArray(hidden_object_ids) || hidden_object_ids.some(id => typeof id !== 'string' || !updated.objects[id])) {
        throw new Error('View visibility can only reference existing object UUIDs')
      }
      if (new Set(hidden_object_ids).size !== hidden_object_ids.length) throw new Error('View visibility object UUIDs must be unique')
      const scopes = updated.view_settings?.hidden_object_ids_by_scope ?? {}
      const visibility = { ...scopes }
      if (hidden_object_ids.length) visibility[scope_id] = [...hidden_object_ids]
      else delete visibility[scope_id]
      const viewTemplates = updated.view_settings?.view_templates
      updated.view_settings = Object.keys(visibility).length || viewTemplates?.length
        ? { hidden_object_ids_by_scope: visibility, ...(viewTemplates?.length ? { view_templates: viewTemplates } : {}) }
        : undefined
      return {
        result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] },
        updatedProject: updated,
        emittedEnvelope: envelope,
      }
    }
    case 'SetWorkingLevel': {
      const { level_id } = input as unknown as SetWorkingLevelInput
      if (!updated.levels.some(level => level.id === level_id)) {
        return {
          result: {
            status: 'rejected',
            command_id,
            command_name: commandName,
            affected_object_ids: [],
            errors: [`Level ${level_id} not found`],
          },
          updatedProject: project,
        }
      }
      updated.project.active_level_id = level_id
      return {
        result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] },
        updatedProject: updated,
        emittedEnvelope: envelope,
      }
    }

    case 'UpdateLevel': {
      const levelInput = input as unknown as UpdateLevelInput
      const index = updated.levels.findIndex(level => level.id === levelInput.id)
      if (index < 0) {
        return {
          result: {
            status: 'rejected',
            command_id,
            command_name: commandName,
            affected_object_ids: [],
            errors: [`Level ${levelInput.id} not found`],
          },
          updatedProject: project,
        }
      }
      if (levelInput.name !== undefined && !levelInput.name.trim()) {
        throw new Error('Level name must not be empty')
      }
      for (const [field, value] of Object.entries({ elevation_mm: levelInput.elevation_mm, height_mm: levelInput.height_mm })) {
        if (value !== undefined && (!Number.isFinite(value) || (field === 'height_mm' && value <= 0))) {
          throw new Error(`Invalid level ${field}: ${String(value)}`)
        }
      }
      updated.levels[index] = { ...updated.levels[index], ...levelInput }
      const dependentIds = Object.values(updated.objects).filter(object => {
        const data = object.module_data as Record<string, unknown>
        return object.level_refs.some(reference => reference.level_id === levelInput.id)
          || ['level_id', 'base_level_id', 'top_level_id', 'head_level_id'].some(key => data[key] === levelInput.id)
      }).map(object => object.id)
      for (const id of dependentIds) {
        const object = updated.objects[id]
        if (object.object_type !== 'architecture.stair') continue
        const d = object.module_data as Record<string, unknown>
        const vertical = resolveStairVerticalExtent(updated, object)
        if (!vertical) throw new Error('Updated level would place a stair top below its base')
        const point = d.start_point_mm as [number, number, number]
        updated.objects[id] = { ...object, updated_at: now, module_data: { ...d,
          start_point_mm: [point[0], point[1], vertical.base_elevation_mm], total_rise_mm: vertical.height_mm,
          riser_height_mm: vertical.height_mm / Number(d.num_risers) } }
      }
      return {
        result: { status: 'success', command_id, command_name: commandName, affected_object_ids: dependentIds, updated_object_ids: dependentIds },
        updatedProject: updated,
        emittedEnvelope: envelope,
      }
    }

    case 'SetWorkingPhase': {
      const { phase } = input as unknown as SetWorkingPhaseInput
      updated.project.active_phase = phase
      return {
        result: {
          status: 'success',
          command_id,
          command_name: commandName,
          affected_object_ids: [],
        },
        updatedProject: updated,
        emittedEnvelope: envelope,
      }
    }

    case 'DeleteObject': {
      const delInput = input as unknown as DeleteObjectInput
      const target = updated.objects[delInput.object_id]
      if (!target) {
        return {
          result: {
            status: 'rejected',
            command_id,
            command_name: commandName,
            affected_object_ids: [],
            errors: [`Object UUID ${delInput.object_id} not found`],
          },
          updatedProject: project,
        }
      }

      // The dependency graph is the shared source of truth for "who depends on this object".
      // Domain helpers still contribute their own derived geometry, and both sets are unioned so
      // no dependent is silently orphaned.
      const dependencyImpact = analyzeDependencyImpact(buildDependencyGraph(updated), [delInput.object_id], 'delete')
      const graphCascade = dependencyImpact.entries
        .filter(entry => entry.disposition === 'cascade_delete')
        .map(entry => entry.object_id)
      const archDependents = getArchitectureDeletionDependents(updated, delInput.object_id)
      const structDependents = getStructureDeletionDependents(updated, delInput.object_id)
      const decorativeDependents = Object.values(updated.objects)
        .filter(obj => (obj.object_type === 'decorative.moulding_run' || obj.object_type === 'decorative.wall_panel') &&
          ((obj.module_data as Record<string, unknown>).host_id === delInput.object_id || obj.host_refs.includes(delInput.object_id)))
        .map(obj => obj.id)

      const hostedIdsToDelete = [...new Set([...archDependents, ...structDependents, ...decorativeDependents, ...graphCascade])]

      delete updated.objects[delInput.object_id]
      for (const hid of hostedIdsToDelete) {
        delete updated.objects[hid]
      }

      const allDeletedIds = [delInput.object_id, ...hostedIdsToDelete]
      if (updated.view_settings) {
        const visibility = Object.fromEntries(Object.entries(updated.view_settings.hidden_object_ids_by_scope)
          .flatMap(([scopeId, ids]) => {
            const remaining = ids.filter(id => !allDeletedIds.includes(id))
            return remaining.length ? [[scopeId, remaining]] : []
          }))
        const templates = updated.view_settings.view_templates?.map(template => ({
          ...template,
          hidden_object_ids: template.hidden_object_ids.filter(id => !allDeletedIds.includes(id)),
        }))
        updated.view_settings = Object.keys(visibility).length || templates?.length
          ? { hidden_object_ids_by_scope: visibility, ...(templates?.length ? { view_templates: templates } : {}) }
          : undefined
      }
      const structUpdated = reconcileStructureDeletion(updated, allDeletedIds, now)

      const treatmentHostsUpdated: string[] = []
      for (const [objectId, object] of Object.entries(updated.objects)) {
        if (object.object_type !== 'architecture.wall') continue
        const data = object.module_data as Record<string, unknown>
        if (!Array.isArray(data.interface_treatments)) continue
        const treatments = data.interface_treatments as Array<Record<string, unknown>>
        let changed = false
        const remaining = treatments.flatMap(treatment => {
          if (!Array.isArray(treatment.target_object_ids)) return [treatment]
          const targets = treatment.target_object_ids.filter(targetId => typeof targetId === 'string' && !allDeletedIds.includes(targetId))
          if (targets.length === treatment.target_object_ids.length) return [treatment]
          changed = true
          return targets.length ? [{ ...treatment, target_object_ids: targets }] : []
        })
        if (changed) {
          updated.objects[objectId] = { ...object, module_data: { ...data, interface_treatments: remaining }, updated_at: now }
          treatmentHostsUpdated.push(objectId)
        }
      }
      updated.relationships = updated.relationships.filter(
        (r) => !allDeletedIds.includes(r.source_id) && !allDeletedIds.includes(r.target_id)
      )
      // Objects that survive the deletion but lost a host/support must be reported as needing a
      // new one; blocking dependents are surfaced so the caller can resolve them explicitly.
      const needsRehost = dependencyImpact.entries
        .filter(entry => entry.disposition === 'needs_rehost' && updated.objects[entry.object_id])
        .map(entry => entry.object_id)
      const updatedObjectIds = [...new Set([...treatmentHostsUpdated, ...structUpdated, ...needsRehost])]
      const affectedIds = [...allDeletedIds, ...updatedObjectIds]
      const warnings = [
        ...dependencyImpact.warnings,
        ...(needsRehost.length ? [`ต้องกำหนด host/ที่ยึดใหม่ ${needsRehost.length} ชิ้น: ${needsRehost.join(', ')}`] : []),
      ]

      return {
        result: {
          status: 'success',
          command_id,
          command_name: commandName,
          affected_object_ids: affectedIds,
          deleted_object_ids: allDeletedIds,
          updated_object_ids: updatedObjectIds,
          ...(warnings.length ? { warnings } : {}),
          dependency_impact: dependencyImpact,
        },
        updatedProject: updated,
        emittedEnvelope: envelope,
      }
    }

    case 'UpdateObjectPhase': {
      const { object_id, created_phase, removed_phase } = input as unknown as UpdateObjectPhaseInput
      const target = updated.objects[object_id]
      if (!target) {
        return {
          result: {
            status: 'rejected',
            command_id,
            command_name: commandName,
            affected_object_ids: [],
            errors: [`Object UUID ${object_id} not found`],
          },
          updatedProject: project,
        }
      }

      updated.objects[object_id] = {
        ...target,
        created_phase: created_phase || target.created_phase,
        removed_phase: removed_phase !== undefined ? removed_phase : target.removed_phase,
        updated_at: now,
      }

      // Demolishing a host is not the same as deleting it: hosted objects survive but must be
      // re-hosted or re-routed, so the impact report is attached to the committed command.
      const nextRemovedPhase = updated.objects[object_id].removed_phase
      const dependencyImpact = nextRemovedPhase === 'demolition' && target.removed_phase !== 'demolition'
        ? analyzeDependencyImpact(buildDependencyGraph(updated), [object_id], 'demolish')
        : undefined
      const affectedDependents = dependencyImpact
        ? dependencyImpact.entries.filter(entry => entry.disposition !== 'informational').map(entry => entry.object_id)
        : []

      return {
        result: {
          status: 'success',
          command_id,
          command_name: commandName,
          affected_object_ids: [object_id, ...affectedDependents],
          updated_object_ids: [object_id],
          ...(dependencyImpact ? { dependency_impact: dependencyImpact } : {}),
        },
        updatedProject: updated,
        emittedEnvelope: { ...envelope, input: { ...input } },
      }
    }


  }
}
