// ConstructFlow Project Container Interface (.cfproj format)

import { Phase, Level, PileSystem, Relationship } from './types.js'
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

/** Typed catalog values shared by current domains; extension fields stay explicitly unknown. */
export interface TypeParameters {
  section_mm?: [number, number]
  size_mm?: [number, number, number]
  foundation_type?: 'spread_footing' | 'pile_cap'
  pile_type?: PileSystem
  pile_offsets_mm?: [number, number][]
  pile_length_mm?: number
  material?: string
  thickness_mm?: number
  height_mm?: number
  width_mm?: number
  sill_height_mm?: number
  [field: string]: unknown
}

export interface PhaseDefinition {
  id: Phase
  name: string
  order: number
}

export interface TypeDefinition {
  /** Stable RFC-4122 UUID. Type names/marks are editable labels, never identity. */
  id: string
  object_type: string
  name: string
  parameters: TypeParameters
}

export interface ProjectDocument {
  schema_version: 2
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
    id: '8e7e8aab-1584-58f1-a6da-ce32b51ad0e4',
    object_type: 'structure.column',
    name: 'C1',
    parameters: {
      section_mm: [200, 200],
      material: 'reinforced_concrete',
    },
  },
  {
    id: 'af2cf88d-287f-5c57-aca3-0ad8e54c19de',
    object_type: 'structure.column',
    name: 'C2',
    parameters: {
      section_mm: [300, 300],
      material: 'reinforced_concrete',
    },
  },
  {
    id: '488f33b1-f8e7-52a2-98ba-659cc97173dc',
    object_type: 'structure.column',
    name: 'SC1',
    parameters: {
      section_mm: [150, 150],
      material: 'steel',
    },
  },
  {
    id: 'de98d82a-1316-50a9-9399-398c140429be',
    object_type: 'structure.foundation',
    name: 'F1',
    parameters: {
      size_mm: [800, 800, 300],
      foundation_type: 'spread_footing',
      material: 'reinforced_concrete',
    },
  },
  {
    id: '812fffd4-9b5a-5364-8d30-9c4f2dec48fa',
    object_type: 'structure.foundation',
    name: 'F2',
    parameters: {
      size_mm: [1200, 1200, 400],
      foundation_type: 'spread_footing',
      material: 'reinforced_concrete',
    },
  },
  {
    id: '6b0b7721-1fa1-56bf-825b-a1cf26a10123',
    object_type: 'structure.beam',
    name: 'B1',
    parameters: {
      section_mm: [200, 400],
      material: 'reinforced_concrete',
    },
  },
  {
    id: '1e515bfc-5648-5ea4-be5a-12cc291b8ddb',
    object_type: 'structure.beam',
    name: 'B2',
    parameters: {
      section_mm: [200, 500],
      material: 'reinforced_concrete',
    },
  },
  {
    id: 'f047f882-0906-5d28-9ce3-507055a832b0',
    object_type: 'structure.beam',
    name: 'RB1',
    parameters: {
      section_mm: [150, 300],
      material: 'reinforced_concrete',
    },
  },
  // Walls
  {
    id: 'b9edee00-81b1-5fe3-b4c3-9fb927a0f974',
    object_type: 'architecture.wall',
    name: 'W1',
    parameters: {
      thickness_mm: 100,
      height_mm: 2800,
      material: 'brick_masonry',
    },
  },
  {
    id: 'cb47541b-1720-5ac6-a762-6e0c3957927f',
    object_type: 'architecture.wall',
    name: 'W2',
    parameters: {
      thickness_mm: 150,
      height_mm: 2800,
      material: 'lightweight_block',
    },
  },
  {
    id: '974f5539-f236-5828-9707-cc0718f53acd',
    object_type: 'architecture.wall',
    name: 'W3',
    parameters: {
      thickness_mm: 200,
      height_mm: 2800,
      material: 'reinforced_concrete',
    },
  },
  // Doors
  {
    id: 'f549faa5-6144-558c-b8f0-53a7e111ed2d',
    object_type: 'door_window.door',
    name: 'D1',
    parameters: {
      width_mm: 800,
      height_mm: 2000,
    },
  },
  {
    id: 'e2ca17d9-6ad6-5962-a469-78f760ae7e5e',
    object_type: 'door_window.door',
    name: 'D2',
    parameters: {
      width_mm: 900,
      height_mm: 2000,
    },
  },
  {
    id: 'c6719277-c1dc-51dc-93f8-28a1463b78e1',
    object_type: 'door_window.door',
    name: 'D3',
    parameters: {
      width_mm: 1000,
      height_mm: 2100,
    },
  },
  // Windows
  {
    id: 'f5a8e0b4-7f71-5187-9f52-4fe84ab8bdb3',
    object_type: 'door_window.window',
    name: 'W1',
    parameters: {
      width_mm: 1200,
      height_mm: 1200,
      sill_height_mm: 900,
    },
  },
  {
    id: '07025120-30be-52a2-bf1e-05126114ef94',
    object_type: 'door_window.window',
    name: 'W2',
    parameters: {
      width_mm: 1800,
      height_mm: 1200,
      sill_height_mm: 900,
    },
  },
  {
    id: 'fb2d8980-a014-578a-940f-3d1e10647c05',
    object_type: 'door_window.window',
    name: 'W3',
    parameters: {
      width_mm: 2400,
      height_mm: 1500,
      sill_height_mm: 800,
    },
  },
]

export const DEFAULT_TYPES = DEFAULT_STRUCTURAL_TYPES

export const CATALOG_PARAMETER_FIELDS: Record<string, string[]> = {
  'structure.column': ['section_mm', 'material'],
  'structure.foundation': ['size_mm', 'foundation_type', 'pile_type', 'pile_offsets_mm', 'pile_length_mm', 'material'],
  'structure.beam': ['section_mm', 'material'],
  'architecture.wall': ['thickness_mm', 'height_mm', 'material'],
  'door_window.door': ['width_mm', 'height_mm'],
  'door_window.window': ['width_mm', 'height_mm', 'sill_height_mm'],
}

export function resolveCatalogType(
  project: Pick<ProjectDocument, 'types'>,
  objectType: string,
  typeIdOrName: string | undefined,
): TypeDefinition | undefined {
  if (!typeIdOrName) return undefined
  const normalized = typeIdOrName.trim().toLowerCase()
  return project.types.find(type => type.object_type === objectType && type.id.toLowerCase() === normalized)
    ?? project.types.find(type => type.object_type === objectType && type.name.trim().toLowerCase() === normalized)
}

/** Save only per-instance deviations; shared type dimensions remain owned by the catalog. */
export function catalogInstanceOverrides(
  objectType: string,
  values: Record<string, unknown>,
  type: TypeDefinition | undefined,
): Record<string, unknown> {
  if (!type) return {}
  const overrides: Record<string, unknown> = {}
  for (const field of CATALOG_PARAMETER_FIELDS[objectType] ?? []) {
    if (values[field] !== undefined && type.parameters[field] !== undefined &&
        JSON.stringify(values[field]) !== JSON.stringify(type.parameters[field])) {
      overrides[field] = structuredClone(values[field])
    }
  }
  return overrides
}

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
    schema_version: 2,
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
    phases: structuredClone(DEFAULT_PHASES),
    types: structuredClone(DEFAULT_TYPES),
    objects: {},
    relationships: [],
  }
}
