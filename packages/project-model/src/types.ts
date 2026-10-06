// ConstructFlow Canonical Semantic Types (Millimeter Units)

export type Phase = 'existing' | 'demolition' | 'new_construction'

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
  meta?: Record<string, any>
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
  mark: string // Human-readable mark, e.g. "F01"
  foundation_type: 'spread_footing' | 'pile_cap'
  center_mm: [number, number, number] // [x, y, z] in mm
  size_mm: [number, number, number] // [width, length, thickness] in mm
  top_elevation_mm: number
  supported_column_id?: string // UUID of the supported column (optional for isolated footings)
  material: 'reinforced_concrete' | string
  engineering_status: 'preliminary' | 'engineer_approved' | 'as_built'
}
