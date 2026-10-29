// Project, Level, and Phase Mutation Command Payloads

import { Phase, RemovalPhase, Level } from '@constructflow/project-model'
import type { PlanDimension } from '@constructflow/project-model'
import type { PlanFill } from '@constructflow/project-model'
import type { PlanSketch } from '@constructflow/project-model'
import type { ProposalDraft, ProposalStatusTarget } from '@constructflow/project-model'
import type { ChangeOrderDraft } from '@constructflow/project-model'
import type { InvoiceDraft, InvoicePaymentMethod } from '@constructflow/project-model'
import type { ProjectTakeoffRate } from '@constructflow/project-model'
export interface UpdateTakeoffRatesInput { rates: Record<string, ProjectTakeoffRate> }
/** Create one placed, editable supplier bundle with a frozen SKU and price selection. */
export interface CreateSupplierBundleInstanceInput {
  id: string
  level_id: string
  created_phase?: Phase
  module_data: Record<string, unknown>
}
import type { FieldPhotoInspection } from '@constructflow/project-model'
export interface SaveFieldPhotoInspectionInput { inspection: FieldPhotoInspection }
import type { FieldFormRecord } from '@constructflow/project-model'
export interface SaveFieldFormInput { form: FieldFormRecord }
export interface DeleteFieldFormInput { form_id: string }
import type { ProjectComment, ProjectCommentReply } from '@constructflow/project-model'
export interface CreateProjectCommentInput { comment: ProjectComment }
export interface AddProjectCommentReplyInput { comment_id: string; reply: ProjectCommentReply }
export interface SetProjectCommentStatusInput { comment_id: string; status: 'open' | 'resolved' }
export interface MergeProjectCommentsInput { comments: ProjectComment[] }
import type { ProjectDocument } from '@constructflow/project-model'
export interface RestoreProjectRevisionInput { revision_id: string; project: ProjectDocument }
/** Atomic, precondition-checked delta used to replay editor Undo/Redo through CommandBus. */
export interface ApplyProjectHistoryDeltaChange {
  target: 'object' | 'field'
  id?: string
  field?: string
  expected_exists: boolean
  expected_value?: unknown
  next_exists: boolean
  next_value?: unknown
}
export interface ApplyProjectHistoryDeltaInput { changes: ApplyProjectHistoryDeltaChange[] }
export interface SaveProposalDraftInput { proposal: ProposalDraft }
export interface DeleteProposalDraftInput { proposal_id: string }
export interface TransitionProposalStatusInput { proposal_id: string; target_status: ProposalStatusTarget; note?: string; device_signature?: import('@constructflow/project-model').ProposalDeviceSignatureInput; recipient_signature?: import('@constructflow/project-model').ProposalRecipientSignature }
export interface SaveChangeOrderDraftInput { change_order: ChangeOrderDraft }
export interface TransitionChangeOrderStatusInput { change_order_id: string; target_status: ProposalStatusTarget; note?: string }
export interface SaveInvoiceDraftInput { invoice: InvoiceDraft }
export interface TransitionInvoiceStatusInput { invoice_id: string; target_status: 'issued' | 'void'; note?: string }
export interface RecordInvoicePaymentInput { invoice_id: string; amount_thb: number; method: InvoicePaymentMethod; reference?: string; integration_reference?: string; received_at?: string; note?: string }
export interface SavePlanDimensionInput { dimension: PlanDimension }
export interface DeletePlanDimensionInput { dimension_id: string }
export interface SavePlanFillInput { fill: PlanFill }
export interface DeletePlanFillInput { fill_id: string }
export interface SavePlanSketchInput { sketch: PlanSketch }
export interface DeletePlanSketchInput { sketch_id: string }
import type { CoordinationSettings, ProjectSourceReference, ProjectViewTemplate, RainwaterDesignSettings, SavedSheetViewport, SheetLayoutTemplate, SiteSurvey } from '@constructflow/project-model'
export interface UpdateSheetViewportInput { sheet_id: string; viewport: SavedSheetViewport }
export interface SaveSheetLayoutTemplateInput { template: SheetLayoutTemplate }
export interface DeleteSheetLayoutTemplateInput { template_id: string }
export interface SaveViewTemplateInput { template: ProjectViewTemplate }
export interface DeleteViewTemplateInput { template_id: string }

/** Persist hidden objects for one named view and level without changing model objects. */
export interface SetViewVisibilityInput {
  scope_id: string
  hidden_object_ids: string[]
}

/** Project-level deviations from the versioned coordination rule dataset. */
export interface UpdateCoordinationSettingsInput {
  settings: CoordinationSettings
  /** Why the deviation exists; recorded on the command envelope for audit. */
  reason?: string
}

/** Shared site-specific rainfall and outlet assumptions for every roof in the project. */
export interface UpdateRainwaterDesignInput {
  settings: RainwaterDesignSettings
}
export interface UpdateSiteSurveyInput { survey: SiteSurvey }
/** Replace source links for a group of model objects as one atomic mutation. */
export interface UpdateObjectSourceReferencesInput { object_ids: string[]; source_refs: ProjectSourceReference[] }

export interface CreateProjectInput {
  id: string
  name: string
  units?: 'mm'
}

export interface CreateLevelInput {
  id: string
  name: string
  elevation_mm: number
  storey_index: number
  height_mm?: number
}

export interface UpdateLevelInput {
  id: string
  name?: string
  elevation_mm?: number
  height_mm?: number
}

export interface SetWorkingPhaseInput {
  phase: Phase
}

export interface SetWorkingLevelInput {
  level_id: string
}

export interface UpdateObjectPhaseInput {
  object_id: string
  created_phase?: Phase
  removed_phase?: RemovalPhase | null
}
