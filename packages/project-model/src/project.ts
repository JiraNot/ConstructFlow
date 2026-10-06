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

export const DEFAULT_STRUCTURAL_TYPES: TypeDefinition[] = [
  {
    id: 'type-col-c1',
    object_type: 'structure.column',
    name: 'C1',
    parameters: {
      section_mm: [200, 200],
      material: 'reinforced_concrete',
    },
  },
  {
    id: 'type-col-c2',
    object_type: 'structure.column',
    name: 'C2',
    parameters: {
      section_mm: [300, 300],
      material: 'reinforced_concrete',
    },
  },
  {
    id: 'type-fnd-f1',
    object_type: 'structure.foundation',
    name: 'F1',
    parameters: {
      size_mm: [800, 800, 300],
      foundation_type: 'spread_footing',
      material: 'reinforced_concrete',
    },
  },
  {
    id: 'type-fnd-f2',
    object_type: 'structure.foundation',
    name: 'F2',
    parameters: {
      size_mm: [1200, 1200, 400],
      foundation_type: 'spread_footing',
      material: 'reinforced_concrete',
    },
  },
  {
    id: 'type-beam-b1',
    object_type: 'structure.beam',
    name: 'B1',
    parameters: {
      section_mm: [200, 400],
      material: 'reinforced_concrete',
    },
  },
  {
    id: 'type-beam-b2',
    object_type: 'structure.beam',
    name: 'B2',
    parameters: {
      section_mm: [200, 500],
      material: 'reinforced_concrete',
    },
  },
  {
    id: 'type-beam-rb1',
    object_type: 'structure.beam',
    name: 'RB1',
    parameters: {
      section_mm: [150, 300],
      material: 'reinforced_concrete',
    },
  },
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
    types: DEFAULT_STRUCTURAL_TYPES.map((t) => ({ ...t, parameters: { ...t.parameters } })),
    objects: {},
    relationships: [],
  }
}
