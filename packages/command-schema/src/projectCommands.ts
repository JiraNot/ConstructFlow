// Project, Level, and Phase Mutation Command Payloads

import { Phase, RemovalPhase, Level } from '@constructflow/project-model'
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
