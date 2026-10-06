// ConstructFlow Project Container Interface (.cfproj format)

import { Phase, Level, Relationship } from './types.js'
import { SmartObject } from './smartObject.js'

export interface ProjectMetadata {
  id: string
  name: string
  units: 'mm'
  active_level_id: string
  active_phase: Phase
  description?: string
  created_at: string
  updated_at: string
}

export interface PhaseDefinition {
  id: Phase
  name: string
  order: number
}

export interface TypeDefinition {
  id: string
  object_type: string
  name: string
  parameters: Record<string, any>
}

export interface ProjectDocument {
  schema_version: 1
  project: ProjectMetadata
  levels: Level[]
  phases: PhaseDefinition[]
  types: TypeDefinition[]
  objects: Record<string, SmartObject> // Keyed by immutable UUID
  relationships: Relationship[]
}

export const DEFAULT_PHASES: PhaseDefinition[] = [
  { id: 'existing', name: 'Existing', order: 1 },
  { id: 'demolition', name: 'Demolition', order: 2 },
  { id: 'new_construction', name: 'New Construction', order: 3 },
]

export function createEmptyProjectDocument(
  id: string,
  name: string = 'Untitled Project'
): ProjectDocument {
  const now = new Date().toISOString()
  const defaultLevel: Level = {
    id: 'L1',
    name: 'Ground Floor',
    elevation_mm: 0,
    storey_index: 1,
    height_mm: 3000,
  }

  return {
    schema_version: 1,
    project: {
      id,
      name,
      units: 'mm',
      active_level_id: defaultLevel.id,
      active_phase: 'new_construction',
      created_at: now,
      updated_at: now,
    },
    levels: [defaultLevel],
    phases: DEFAULT_PHASES,
    types: [],
    objects: {},
    relationships: [],
  }
}
