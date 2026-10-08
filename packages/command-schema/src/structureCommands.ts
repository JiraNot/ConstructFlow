// Structural Domain Mutation Command Payloads (Vertical Slice 01)

import { Phase, PileSystem, PlacementReference } from '@constructflow/project-model'

export interface CreateGridInput {
  /** Immutable unique identity (UUID) */
  id: string
  tag: string
  orientation: 'vertical' | 'horizontal'
  position_mm: number
  extent_mm?: [number, number]
  phase?: Phase
}

export interface ModifyGridInput {
  object_id: string // UUID
  position_mm: number
  extent_mm?: [number, number]
}

export interface CreateColumnInput {
  /** Immutable unique identity (UUID) */
  id: string
  type_id?: string

  /** Human-readable mark, e.g. "C01" */
  mark: string

  /** Position in millimeters: [x, y] or [x, y, z] */
  location_mm: [number, number, number] | [number, number]

  /** Cross-section dimensions [width, depth] in mm */
  section_mm: [number, number]

  /** Rotation angle in degrees */
  rotation_deg?: number

  /** Base storey reference ID */
  base_level_id: string

  /** Top storey reference ID (optional) */
  top_level_id?: string

  base_offset_mm?: number
  top_offset_mm?: number
  base_elevation_mm?: number
  top_elevation_mm?: number

  material?: 'reinforced_concrete' | 'steel' | 'timber' | 'generic' | string
  phase?: Phase
  engineering_status?: 'preliminary' | 'engineer_approved' | 'as_built'
}

export interface MoveColumnInput {
  /** Immutable object UUID */
  object_id: string

  /** New position in millimeters: [x, y] or [x, y, z] */
  location_mm: [number, number, number] | [number, number]
}

export interface UpdateColumnMarkInput {
  /** Immutable object UUID */
  object_id: string

  /** New human-readable mark, e.g. "C03" */
  mark: string
}

export interface CreateFoundationInput {
  /** Immutable unique identity (UUID) */
  id: string
  type_id?: string

  /** Human-readable mark, e.g. "F1" */
  mark?: string

  /** Optional UUID of the column supported by this footing */
  supported_column_id?: string

  /** Foundation type */
  foundation_type?: 'spread_footing' | 'pile_cap'
  topping_mm?:number
  slab_system?:'slab_on_ground'|'suspended'|'precast_plank'|'hollow_core'
  drop_mm?:number
  rebar_type?:Record<string,unknown>
  [field:string]:unknown
  pile_type?: PileSystem
  pile_offsets_mm?: [number, number][]
  pile_length_mm?: number

  /** Footing dimensions: [width, length, thickness] in mm */
  size_mm?: [number, number, number]

  /** Center coordinates [x, y, z] in mm (if omitted, derives from column location) */
  center_mm?: [number, number, number]
  location_mm?: [number, number, number] | [number, number]

  /** Top surface elevation in mm */
  top_elevation_mm?: number

  material?: string
  phase?: Phase
  engineering_status?: 'preliminary' | 'engineer_approved' | 'as_built'
}

export interface UpdateFoundationMarkInput {
  /** Immutable object UUID */
  object_id: string

  /** New human-readable mark, e.g. "F1" or "F2" */
  mark: string
}

export interface UpdateGridTagInput {
  /** Immutable object UUID */
  object_id: string

  /** New grid tag, e.g. "A" or "1" */
  tag: string
}

export interface DeleteObjectInput {
  /** Immutable object UUID */
  object_id: string
}

export interface CreateBeamInput {
  /** Immutable unique identity (UUID) */
  id: string
  type_id?: string

  /** Human-readable mark, e.g. "B1", "B2" */
  mark?: string
  placement_reference?: PlacementReference

  /** Start node coordinate [x, y] or [x, y, z] in mm */
  start_point_mm: [number, number, number] | [number, number]

  /** End node coordinate [x, y] or [x, y, z] in mm */
  end_point_mm: [number, number, number] | [number, number]

  /** Path coordinates for SketchUp sync [[x1, y1, z1], [x2, y2, z2]] in mm */
  path_mm?: [[number, number, number], [number, number, number]]

  /** Cross-section dimensions [width, depth] in mm */
  section_mm?: [number, number]

  /** Storey reference ID */
  level_id?: string
  base_level_id?: string
  base_elevation_mm?: number
  base_offset_mm?: number

  /** Connected Column UUIDs */
  start_column_id?: string
  end_column_id?: string

  material?: 'reinforced_concrete' | 'steel' | 'timber' | 'generic' | string
  phase?: Phase
  engineering_status?: 'preliminary' | 'engineer_approved' | 'as_built'
}

export interface UpdateBeamMarkInput {
  /** Immutable object UUID */
  object_id: string

  /** New human-readable mark, e.g. "B2" */
  mark: string
}

export interface UpdateBeamDimensionsInput {
  object_id: string
  section_mm: [number, number]
}

export interface StructuralTypeParameters {
  /** Cross-section [width, depth] in mm (for column and beam) */
  section_mm?: [number, number]
  /** Dimensions [width, length, thickness] in mm (for foundation) */
  size_mm?: [number, number, number]
  /** Wall thickness in mm */
  thickness_mm?: number
  masonry_thickness_mm?: number
  plaster_inside_thickness_mm?: number
  plaster_outside_thickness_mm?: number
  plaster_inside_material?: string
  plaster_outside_material?: string
  /** Element height in mm */
  height_mm?: number
  /** Door / Window width in mm */
  width_mm?: number
  /** Window sill height in mm */
  sill_height_mm?: number
  opening_operation?: 'hinged' | 'sliding' | 'fixed' | 'awning' | 'louver'
  panel_count?: number
  panel_layout?: Array<'hinged' | 'sliding' | 'fixed' | 'awning' | 'louver'>
  panel_width_ratios?: number[]
  transom_height_mm?: number
  bottom_light_height_mm?: number
  muntin_rows?: number
  muntin_columns?: number
  transom_muntin_rows?: number
  transom_muntin_columns?: number
  bottom_light_muntin_rows?: number
  bottom_light_muntin_columns?: number
  frame_depth_mm?: number
  frame_material?: string
  panel_material?: string
  door_leaf_style?: 'flush' | 'raised_2_panel' | 'raised_4_panel' | 'raised_6_panel' | 'horizontal_grooves_3' | 'horizontal_grooves_5' | 'vertical_grooves_3' | 'louvered'
  opening_handle_style?: 'lever' | 'round_knob' | 'pull_handle' | 'recessed_pull' | 'none'
  opening_hardware_finish?: 'stainless' | 'matte_black' | 'satin_brass' | 'bronze'
  glazing_material?: 'none' | 'clear_glass' | 'frosted_glass' | 'tinted_glass'
  glazing_transmission?: number
  material?: string
  foundation_type?: 'spread_footing' | 'pile_cap'
}

export type CatalogObjectType =
  | 'structure.slab'
  | 'structure.column'
  | 'structure.foundation'
  | 'structure.beam'
  | 'architecture.wall'
  | 'door_window.door'
  | 'door_window.window'

export interface DefineStructuralTypeInput {
  id?: string
  object_type: CatalogObjectType
  name: string // e.g. "C1", "F1", "B1", "W1", "D1"
  parameters: StructuralTypeParameters
}

export interface UpdateStructuralTypeDimensionsInput {
  type_id_or_name: string // e.g. "C1", "B1", "W1" or type ID
  type_name?: string
  object_type?: CatalogObjectType
  section_mm?: [number, number]
  size_mm?: [number, number, number]
  thickness_mm?: number
  masonry_thickness_mm?: number
  plaster_inside_thickness_mm?: number
  plaster_outside_thickness_mm?: number
  plaster_inside_material?: string
  plaster_outside_material?: string
  height_mm?: number
  width_mm?: number
  sill_height_mm?: number
  parameters?: StructuralTypeParameters
}

export interface UpdateColumnDimensionsInput {
  object_id: string
  section_mm: [number, number]
}

export interface UpdateFoundationDimensionsInput {
  object_id: string
  size_mm: [number, number, number]
}

export interface AssignInstanceTypeInput {
  object_id: string
  type_id?: string
  /** @deprecated Kept for adapters while they migrate to stable type UUIDs. */
  type_name?: string // e.g. "C2", "F2", "B2"
}

export interface RenameCatalogTypeInput {
  type_id: string
  name: string
}

