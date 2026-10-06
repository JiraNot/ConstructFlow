// ConstructFlow Semantic Model Types (Millimeter Units)

export type Phase = 'existing' | 'demolition' | 'new_construction'

export interface Level {
  id: string
  name: string
  elevation_mm: number
}

export interface SmartObject {
  id: string
  object_type: 'structure.column' | 'architecture.wall' | 'structure.grid'
  owner_module: string
  schema_version: number
  created_phase: Phase
  removed_phase: Phase | null
  level_refs: { role: string; level_id: string; offset_mm?: number }[]
  host_refs: string[]
  connector_refs: string[]
  status: 'active' | 'warning' | 'invalid' | 'archived'
  module_data: Record<string, any>
  created_at: string
  updated_at: string
}

export interface ColumnModuleData {
  section_mm: [number, number]
  location_mm: [number, number]
  rotation_deg: number
  material: string
}

export interface WallModuleData {
  start_mm: [number, number]
  end_mm: [number, number]
  thickness_mm: number
  height_mm: number
  material: string
}

export interface GridLineModuleData {
  tag: string
  orientation: 'vertical' | 'horizontal'
  position_mm: number
  extent_mm: [number, number]
}

export interface Project {
  id: string
  name: string
  units: 'mm'
  active_level_id: string
  active_phase: Phase
  levels: Level[]
  objects: Record<string, SmartObject>
}

export interface SyncDeltaEvent {
  op: 'CREATE' | 'UPDATE' | 'DELETE' | 'DEMOLISH'
  id: string
  object_type: string
  timestamp: string
  payload: Record<string, any>
}
