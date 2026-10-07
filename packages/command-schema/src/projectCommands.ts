// Project, Level, and Phase Mutation Command Payloads

import { Phase, RemovalPhase, Level } from '@constructflow/project-model'

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
