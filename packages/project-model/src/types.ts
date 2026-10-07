// ConstructFlow Canonical Semantic Types (Millimeter Units)

export type Phase = 'existing' | 'demolition' | 'new_construction'
/** Removal is a lifecycle event represented only in the demolition phase. */
export type RemovalPhase = 'demolition'
export type PileSystem = 'micro_pile_i18' | 'micro_pile_i22' | 'spun_micro_pile_20' | 'spun_micro_pile_25' | 'bored_pile'

export type SmartObjectStatus = 'active' | 'warning' | 'invalid' | 'archived'

export interface Level {
  id: string
  name: string
  elevation_mm: number
  storey_index: number
  height_mm?: number
}

export interface LevelRef {
  role: 'base_level' | 'top_level' | 'host_level' | string
  level_id: string
  offset_mm?: number
}

export interface Relationship {
  kind: 'supports' | 'supported_by' | 'hosts' | 'hosted_on' | 'connects_to' | string
  source_id: string // UUID
  target_id: string // UUID
  role?: string
  meta?: Record<string, unknown>
}

// -------------------------------------------------------------
// Structure Domain Module Payloads
// -------------------------------------------------------------

export interface GridModuleData {
  tag: string
  orientation: 'vertical' | 'horizontal'
  position_mm: number
  extent_mm: [number, number]
}

export interface ColumnModuleData {
  type_id?: string
  instance_overrides?: Record<string, unknown>
  mark: string // Human-readable mark, e.g. "C01"
  location_mm: [number, number, number] // [x, y, z] in mm
  section_mm: [number, number] // [width, depth] in mm
  rotation_deg: number
  base_level_id: string
  top_level_id?: string
  base_offset_mm: number
  top_offset_mm: number
  base_elevation_mm?: number
  top_elevation_mm?: number
  material: 'reinforced_concrete' | 'steel' | 'timber' | 'generic' | string
  profile_code?: string
  engineering_status: 'preliminary' | 'engineer_approved' | 'as_built'
}

export interface FoundationModuleData {
  type_id?: string
  instance_overrides?: Record<string, unknown>
  mark: string // Human-readable mark, e.g. "F01"
  foundation_type: 'spread_footing' | 'pile_cap'
  pile_type?: PileSystem
  /** Pile head offsets from the pile-cap center, in millimeters; pile lengths remain independently specified. */
  pile_offsets_mm?: [number, number][]
  pile_length_mm?: number
  center_mm: [number, number, number] // [x, y, z] in mm
  size_mm: [number, number, number] // [width, length, thickness] in mm
  top_elevation_mm: number
  supported_column_id?: string // UUID of the supported column (optional for isolated footings)
  material: 'reinforced_concrete' | string
  engineering_status: 'preliminary' | 'engineer_approved' | 'as_built'
}

export interface BeamModuleData {
  type_id?: string
  instance_overrides?: Record<string, unknown>
  mark: string // Human-readable mark, e.g. "B1", "B2"
  start_point_mm: [number, number, number] // [x, y, z] in mm
  end_point_mm: [number, number, number] // [x, y, z] in mm
  section_mm: [number, number] // [width, depth] in mm, e.g. [200, 400]
  span_mm: number // computed length in mm, e.g. 4000
  level_id: string
  start_column_id?: string // optional connected column UUID
  end_column_id?: string // optional connected column UUID
  material: 'reinforced_concrete' | 'steel' | 'timber' | 'generic' | string
  engineering_status: 'preliminary' | 'engineer_approved' | 'as_built'
}

// -------------------------------------------------------------
// Architecture & Openings Domain Module Payloads
// -------------------------------------------------------------

export interface WallModuleData {
  type_id?: string
  instance_overrides?: Record<string, unknown>
  mark: string // Human-readable mark, e.g. "W1", "W2"
  start_point_mm: [number, number, number] // [x, y, z] in mm
  end_point_mm: [number, number, number] // [x, y, z] in mm
  thickness_mm: number // e.g. 100, 150, 200 mm
  height_mm: number // e.g. 2800 mm
  length_mm: number // computed length in mm
  level_id: string
  wall_type_id?: string
  material: 'brick_masonry' | 'lightweight_block' | 'drywall' | 'reinforced_concrete' | string
  interface_treatments?: WallInterfaceTreatment[]
}

export type WallInterfaceTreatmentKind = 'chemical_dowel_epoxy' | 'expansion_joint_sealant' | 'roof_flashing'

/** Explicitly modeled work at an existing/new wall interface; quantity derives from target wall geometry. */
export interface WallInterfaceTreatment {
  id: string
  kind: WallInterfaceTreatmentKind
  target_object_ids: string[]
  material?: string
}

export type DoorHanding = 'left_in' | 'left_out' | 'right_in' | 'right_out'

export interface DoorModuleData {
  type_id?: string
  instance_overrides?: Record<string, unknown>
  mark: string // Human-readable mark, e.g. "D1", "D2"
  wall_id: string // Host wall UUID
  location_mm: [number, number, number] // Center point [x, y, z] along wall in mm
  offset_along_wall_mm: number // Distance along wall from start_point_mm
  width_mm: number // e.g. 800, 900, 1000 mm
  height_mm: number // e.g. 2000, 2100 mm
  handing: DoorHanding
  level_id: string
  door_type_id?: string
}

export interface WindowModuleData {
  type_id?: string
  instance_overrides?: Record<string, unknown>
  mark: string // Human-readable mark, e.g. "W1", "W2"
  wall_id: string // Host wall UUID
  location_mm: [number, number, number] // Center point [x, y, z] along wall in mm
  offset_along_wall_mm: number // Distance along wall from start_point_mm
  width_mm: number // e.g. 1200, 1800, 2400 mm
  height_mm: number // e.g. 1200, 1500 mm
  sill_height_mm: number // e.g. 800, 900 mm
  level_id: string
  window_type_id?: string
}

