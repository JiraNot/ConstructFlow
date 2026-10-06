// Structural Domain Mutation Command Payloads (Vertical Slice 01)

import { Phase } from '@constructflow/project-model'

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

  /** Human-readable mark, e.g. "F01" */
  mark: string

  /** UUID of the column supported by this footing */
  supported_column_id: string

  /** Foundation type */
  foundation_type?: 'spread_footing' | 'pile_cap'

  /** Footing dimensions: [width, length, thickness] in mm */
  size_mm?: [number, number, number]

  /** Center coordinates [x, y, z] in mm (if omitted, derives from column location) */
  center_mm?: [number, number, number]

  /** Top surface elevation in mm */
  top_elevation_mm?: number

  material?: string
  phase?: Phase
  engineering_status?: 'preliminary' | 'engineer_approved' | 'as_built'
}

export interface DeleteObjectInput {
  /** Immutable object UUID */
  object_id: string
}
