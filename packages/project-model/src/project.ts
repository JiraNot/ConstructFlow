// ConstructFlow Project Container Interface (.cfproj format)

import { Phase, Level, PileSystem, Relationship, ProjectLegalMetadata } from './types.js'
import { SmartObject } from './smartObject.js'
import type { DrawingSettings } from './sheetSettings.js'
import type { DoorFaceComponent } from './doorFace.js'
import type { OpeningPlanSymbolLine } from './openingPlanSymbol.js'

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
  door_face_components?: DoorFaceComponent[]
  /** Reusable 2D plan detail with real-mm offsets and stable opening anchors. */
  plan_symbol_lines?: OpeningPlanSymbolLine[]
  /** Wall depth used to frame the symbol editor; symbol coordinates remain real mm. */
  plan_symbol_reference_depth_mm?: number
  section_mm?: [number, number]
  plaster_thickness_mm?: number
  size_mm?: [number, number, number]
  foundation_type?: 'spread_footing' | 'pile_cap'
  pile_type?: PileSystem
  pile_offsets_mm?: [number, number][]
  pile_length_mm?: number
  material?: string
  thickness_mm?: number
  masonry_thickness_mm?: number
  plaster_inside_thickness_mm?: number
  plaster_outside_thickness_mm?: number
  plaster_inside_material?: string
  plaster_outside_material?: string
  wall_system?: string
  height_mm?: number
  width_mm?: number
  sill_height_mm?: number
  opening_operation?: 'hinged' | 'sliding' | 'fixed' | 'awning' | 'louver' | 'bifold' | 'pocket' | 'surface_sliding'
  panel_count?: number
  panel_layout?: Array<'hinged' | 'sliding' | 'fixed' | 'awning' | 'louver' | 'bifold' | 'pocket' | 'surface_sliding'>
  panel_width_ratios?: number[]
  transom_height_mm?: number
  bottom_light_height_mm?: number
  /** Cell counts per leaf, not bar counts; UI bar counts equal cells minus one. */
  muntin_rows?: number
  muntin_columns?: number
  /** Independent fixed-light cell counts; missing means no internal bars. */
  transom_muntin_rows?: number
  transom_muntin_columns?: number
  bottom_light_muntin_rows?: number
  bottom_light_muntin_columns?: number
  frame_depth_mm?: number
  /** Visible face width of the frame profile in elevation, in real mm. */
  frame_face_width_mm?: number
  /** Visible face width of sash rails/stiles in elevation, in real mm. */
  sash_face_width_mm?: number
  /** Plan/3D thickness of an opaque hinged door leaf, in real mm. */
  door_leaf_thickness_mm?: number
  frame_material?: string
  panel_material?: string
  /** Door face treatment; independent of leaf material and glazing. */
  door_leaf_style?: 'flush' | 'raised_2_panel' | 'raised_4_panel' | 'raised_6_panel' | 'horizontal_grooves_3' | 'horizontal_grooves_5' | 'vertical_grooves_3' | 'louvered'
  /** Visible handle profile and finish, independent of the door leaf. */
  opening_handle_style?: 'lever' | 'round_knob' | 'pull_handle' | 'recessed_pull' | 'none'
  opening_hardware_finish?: 'stainless' | 'matte_black' | 'satin_brass' | 'bronze'
  glazing_material?: 'none' | 'clear_glass' | 'frosted_glass' | 'tinted_glass'
  glazing_transmission?: number
  topping_mm?: number
  slab_system?: 'slab_on_ground' | 'suspended' | 'precast_plank' | 'hollow_core'
  drop_mm?: number
  rebar_type?: Record<string, unknown>
  mass_per_m_kg?: number
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
  drawing_settings?: DrawingSettings
  legal_metadata?: ProjectLegalMetadata
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
    name: 'AAC 100 mm',
    parameters: {
      thickness_mm: 120,
      masonry_thickness_mm: 100,
      plaster_inside_thickness_mm: 10,
      plaster_outside_thickness_mm: 10,
      wall_system: 'masonry',
      plaster_inside_material: 'ceramic_tile',
      plaster_outside_material: 'exterior_paint',
      inside_finish_mark: 'W2',
      outside_finish_mark: 'W1',
      height_mm: 2800,
      material: 'lightweight_block',
    },
  },
  {
    id: 'cb47541b-1720-5ac6-a762-6e0c3957927f',
    object_type: 'architecture.wall',
    name: 'AAC 150 mm',
    parameters: {
      thickness_mm: 170,
      masonry_thickness_mm: 150,
      plaster_inside_thickness_mm: 10,
      plaster_outside_thickness_mm: 10,
      wall_system: 'masonry',
      plaster_inside_material: 'ceramic_tile',
      plaster_outside_material: 'exterior_paint',
      inside_finish_mark: 'W2',
      outside_finish_mark: 'W1',
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
      masonry_thickness_mm: 170,
      plaster_inside_thickness_mm: 15,
      plaster_outside_thickness_mm: 15,
      plaster_inside_material: 'cement_plaster',
      plaster_outside_material: 'cement_plaster',
      wall_system: 'masonry',
      height_mm: 2800,
      material: 'reinforced_concrete',
    },
  },
  {
    id: '449e73d0-6020-4d86-a1b7-268f3b20d451', object_type: 'architecture.wall', name: 'W4',
    parameters: { thickness_mm: 100, masonry_thickness_mm: 75, plaster_inside_thickness_mm: 12.5, plaster_outside_thickness_mm: 12.5, plaster_inside_material: 'gypsum_board', plaster_outside_material: 'smartboard', wall_system: 'c_stud_smartboard', height_mm: 2800, material: 'steel_stud' },
  },
  {
    id: '84beef8e-0f01-4f2e-a89f-44dab3f27438', object_type: 'architecture.wall', name: 'W5',
    parameters: { thickness_mm: 95.5, masonry_thickness_mm: 75, plaster_inside_thickness_mm: 12.5, plaster_outside_thickness_mm: 8, plaster_inside_material: 'gypsum_board', plaster_outside_material: 'fiber_cement_board', wall_system: 'steel_frame_board', height_mm: 2800, material: 'steel_stud' },
  },
  {
    id: '7f05843d-d796-4b17-8f71-4c5e91fe0326', object_type: 'architecture.wall', name: 'W6',
    parameters: { thickness_mm: 104, masonry_thickness_mm: 75, plaster_inside_thickness_mm: 9, plaster_outside_thickness_mm: 20, plaster_inside_material: 'gypsum_board', plaster_outside_material: 'composite_panel', wall_system: 'composite_panel', height_mm: 2800, material: 'steel_stud' },
  },
  {
    id: '8be76696-95d0-471b-a1af-93f04a17b03f', object_type: 'architecture.wall', name: 'W7',
    parameters: { thickness_mm: 103, masonry_thickness_mm: 75, plaster_inside_thickness_mm: 12, plaster_outside_thickness_mm: 16, plaster_inside_material: 'gypsum_board', plaster_outside_material: 'faux_wood_panel', wall_system: 'faux_wood_cladding', height_mm: 2800, material: 'steel_stud' },
  },
  // Doors
  {
    id: 'f549faa5-6144-558c-b8f0-53a7e111ed2d',
    object_type: 'door_window.door',
    name: 'D1',
    parameters: {
      width_mm: 800,
      height_mm: 2000,
      opening_operation: 'hinged',
      panel_count: 1,
      frame_depth_mm: 70,
      frame_material: 'timber',
      panel_material: 'timber',
      glazing_material: 'none',
      glazing_transmission: 0,
    },
  },
  {
    id: 'e2ca17d9-6ad6-5962-a469-78f760ae7e5e',
    object_type: 'door_window.door',
    name: 'D2',
    parameters: {
      width_mm: 900,
      height_mm: 2000,
      opening_operation: 'hinged',
      panel_count: 1,
      frame_depth_mm: 70,
      frame_material: 'timber',
      panel_material: 'timber',
      glazing_material: 'none',
      glazing_transmission: 0,
    },
  },
  {
    id: 'c6719277-c1dc-51dc-93f8-28a1463b78e1',
    object_type: 'door_window.door',
    name: 'D3',
    parameters: {
      width_mm: 1000,
      height_mm: 2100,
      opening_operation: 'hinged',
      panel_count: 1,
      frame_depth_mm: 70,
      frame_material: 'aluminium',
      panel_material: 'timber',
      glazing_material: 'none',
      glazing_transmission: 0,
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
      opening_operation: 'sliding',
      panel_count: 2,
      frame_depth_mm: 65,
      frame_material: 'aluminium',
      glazing_material: 'clear_glass',
      glazing_transmission: 0.72,
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
      opening_operation: 'awning',
      panel_count: 2,
      frame_depth_mm: 65,
      frame_material: 'aluminium',
      glazing_material: 'frosted_glass',
      glazing_transmission: 0.38,
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
      opening_operation: 'fixed',
      panel_count: 3,
      frame_depth_mm: 75,
      frame_material: 'aluminium',
      glazing_material: 'tinted_glass',
      glazing_transmission: 0.56,
    },
  },
  {
    id: '327882e7-19be-4eba-a30f-e4165da5e201',
    object_type: 'door_window.door',
    name: 'D4',
    parameters: {
      width_mm: 1600, height_mm: 2100, opening_operation: 'sliding', panel_count: 2,
      frame_depth_mm: 90, frame_material: 'aluminium', panel_material: 'aluminium',
      glazing_material: 'clear_glass', glazing_transmission: 0.72,
    },
  },
  {
    id: '7bdaff3c-e824-4aec-88b0-414e2133afa2',
    object_type: 'door_window.door',
    name: 'D5',
    parameters: {
      width_mm: 1600, height_mm: 2100, opening_operation: 'hinged', panel_count: 2,
      frame_depth_mm: 75, frame_material: 'timber', panel_material: 'timber',
      glazing_material: 'none', glazing_transmission: 0,
    },
  },
  {
    id: '4224fe56-79e6-4a0e-9755-b92e64d4e90a',
    object_type: 'door_window.window',
    name: 'W4',
    parameters: {
      width_mm: 1200, height_mm: 1200, sill_height_mm: 900, opening_operation: 'louver', panel_count: 1,
      frame_depth_mm: 65, frame_material: 'aluminium', glazing_material: 'none', glazing_transmission: 0,
    },
  },
  {
    id: '50200632-27c1-4cf3-a54b-7f5595e4f07d',
    object_type: 'door_window.window',
    name: 'W5',
    parameters: {
      width_mm: 1800, height_mm: 1200, sill_height_mm: 900, opening_operation: 'sliding', panel_count: 3,
      frame_depth_mm: 70, frame_material: 'aluminium', glazing_material: 'clear_glass', glazing_transmission: 0.72,
    },
  },
  {
    id: '84460d26-f977-4b4e-9bc0-0fd4fae794f0',
    object_type: 'door_window.door', name: 'D6',
    parameters: { width_mm: 900, height_mm: 2100, opening_operation: 'hinged', panel_count: 1, frame_depth_mm: 90, frame_material: 'aluminium', panel_material: 'aluminium', glazing_material: 'clear_glass', glazing_transmission: 0.68 },
  },
  {
    id: '2b88e131-faf9-43e0-86a8-7ff4f95e324c',
    object_type: 'door_window.door', name: 'D7',
    parameters: { width_mm: 2400, height_mm: 2100, opening_operation: 'sliding', panel_count: 3, frame_depth_mm: 100, frame_material: 'aluminium', panel_material: 'aluminium', glazing_material: 'clear_glass', glazing_transmission: 0.72 },
  },
  {
    id: '74077642-8151-47bd-9539-1e8cb473408c',
    object_type: 'door_window.door', name: 'D8',
    parameters: { width_mm: 800, height_mm: 2000, opening_operation: 'louver', panel_count: 1, frame_depth_mm: 70, frame_material: 'timber', panel_material: 'timber', glazing_material: 'none', glazing_transmission: 0 },
  },
  {
    id: '1e3c7095-77fa-44cc-87b0-372bb8d9a835',
    object_type: 'door_window.window', name: 'W6',
    parameters: { width_mm: 1200, height_mm: 1200, sill_height_mm: 900, opening_operation: 'hinged', panel_count: 2, frame_depth_mm: 75, frame_material: 'aluminium', glazing_material: 'clear_glass', glazing_transmission: 0.7 },
  },
  {
    id: 'bc22285a-e6a3-4bc9-a20c-53ce7a8f3d25',
    object_type: 'door_window.window', name: 'W7',
    parameters: { width_mm: 900, height_mm: 600, sill_height_mm: 1200, opening_operation: 'awning', panel_count: 1, frame_depth_mm: 65, frame_material: 'aluminium', glazing_material: 'frosted_glass', glazing_transmission: 0.4 },
  },
  {
    id: '2cac5e2b-118a-4331-a158-1fc7b3847229',
    object_type: 'door_window.door', name: 'D9',
    parameters: { width_mm: 2400, height_mm: 2400, opening_operation: 'sliding', panel_count: 2, transom_height_mm: 450, muntin_rows: 1, muntin_columns: 3, frame_depth_mm: 100, frame_material: 'aluminium', panel_material: 'aluminium', glazing_material: 'clear_glass', glazing_transmission: 0.72 },
  },
  {
    id: '2f84a55a-83a6-45c8-adf8-3edf4ce74a17',
    object_type: 'door_window.window', name: 'W8',
    parameters: { width_mm: 1500, height_mm: 1200, sill_height_mm: 900, opening_operation: 'hinged', panel_count: 2, muntin_rows: 2, muntin_columns: 2, frame_depth_mm: 75, frame_material: 'aluminium', glazing_material: 'clear_glass', glazing_transmission: 0.68 },
  },
  {
    id: 'b9bbd802-6ed1-4cc4-a697-0f524d8f2d59',
    object_type: 'door_window.window', name: 'W9',
    parameters: { width_mm: 1800, height_mm: 1350, sill_height_mm: 800, opening_operation: 'fixed', panel_count: 3, muntin_rows: 2, muntin_columns: 3, frame_depth_mm: 75, frame_material: 'aluminium', glazing_material: 'clear_glass', glazing_transmission: 0.68 },
  },
  {
    id: '9f7ec4ca-72ca-4f66-9a73-118bd854c526',
    object_type: 'door_window.window', name: 'W10',
    parameters: { width_mm: 1800, height_mm: 1800, sill_height_mm: 700, opening_operation: 'sliding', panel_count: 2, transom_height_mm: 300, bottom_light_height_mm: 300, muntin_rows: 1, muntin_columns: 2, frame_depth_mm: 80, frame_material: 'aluminium', glazing_material: 'clear_glass', glazing_transmission: 0.7 },
  },
]

export const DEFAULT_TYPES = DEFAULT_STRUCTURAL_TYPES
DEFAULT_TYPES.push(
  { id: 'aed33941-9ba8-5e5c-977a-b35a81d2b903', object_type: 'structure.slab', name: 'GS', parameters: { thickness_mm: 120, topping_mm: 0, slab_system: 'slab_on_ground', material: 'reinforced_concrete' } },
  { id: '1a6d1781-cf3a-5c29-9f43-4b1efa2577cf', object_type: 'structure.slab', name: 'S1', parameters: { thickness_mm: 150, topping_mm: 50, slab_system: 'precast_plank', material: 'precast_concrete' } }
)

export const CATALOG_PARAMETER_FIELDS: Record<string, string[]> = {
  'structure.column': ['section_mm', 'plaster_thickness_mm', 'material'],
  'structure.foundation': ['size_mm', 'foundation_type', 'pile_type', 'pile_offsets_mm', 'pile_length_mm', 'material'],
  'structure.beam': ['section_mm', 'material', 'drop_mm', 'rebar_type', 'mass_per_m_kg'],
  'structure.slab': ['thickness_mm', 'topping_mm', 'slab_system', 'material'],
  'interior.cabinet_run': ['width_mm','height_mm','depth_mm','board_mm','back_mm','plinth_mm','front','carcass_material','front_material','back_material','countertop_material','countertop_mm'],
  'architecture.wall': ['thickness_mm', 'height_mm', 'material', 'wall_system', 'masonry_thickness_mm', 'plaster_inside_thickness_mm', 'plaster_outside_thickness_mm', 'plaster_inside_material', 'plaster_outside_material', 'inside_finish_mark', 'outside_finish_mark'],
  'door_window.door': ['width_mm', 'height_mm', 'opening_operation', 'panel_count', 'panel_layout', 'panel_width_ratios', 'transom_height_mm', 'muntin_rows', 'muntin_columns', 'transom_muntin_rows', 'transom_muntin_columns', 'bottom_light_muntin_rows', 'bottom_light_muntin_columns', 'frame_depth_mm', 'frame_face_width_mm', 'sash_face_width_mm', 'door_leaf_thickness_mm', 'frame_material', 'panel_material', 'door_leaf_style', 'door_face_components', 'opening_handle_style', 'opening_hardware_finish', 'glazing_material', 'glazing_transmission'],
  'door_window.window': ['width_mm', 'height_mm', 'sill_height_mm', 'opening_operation', 'panel_count', 'panel_layout', 'panel_width_ratios', 'transom_height_mm', 'bottom_light_height_mm', 'muntin_rows', 'muntin_columns', 'transom_muntin_rows', 'transom_muntin_columns', 'bottom_light_muntin_rows', 'bottom_light_muntin_columns', 'frame_depth_mm', 'frame_face_width_mm', 'sash_face_width_mm', 'frame_material', 'opening_handle_style', 'opening_hardware_finish', 'glazing_material', 'glazing_transmission', 'plan_symbol_lines', 'plan_symbol_reference_depth_mm'],
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
