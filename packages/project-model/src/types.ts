// ConstructFlow Canonical Semantic Types (Millimeter Units)

export type Phase = 'existing' | 'demolition' | 'new_construction'
export type PlacementReference = 'centerline' | 'left_face' | 'right_face'
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
  /** Optional finite reference-line geometry; used for individually drawn, angled grids. */
  start_point_mm?: Point2Mm
  end_point_mm?: Point2Mm
  /** Shared identity and parameters for grids created as one editable system. */
  system_id?: string
  system_index?: number
  system_origin_mm?: number
  system_spacing_mm?: number
  system_count?: number
  system_first_tag?: string
  system_positions_mm?: number[]
  /** Individual reference grid bubble and label sequencing controls. */
  bubble_visible?: boolean
  auto_tag?: boolean
  sequence_style?: 'auto' | 'alpha' | 'numeric'
}

export interface ColumnModuleData {
  type_id?: string
  instance_overrides?: Record<string, unknown>
  mark: string // Human-readable mark, e.g. "C01"
  location_mm: [number, number, number] // [x, y, z] in mm
  section_mm: [number, number] // [width, depth] in mm
  plaster_thickness_mm?: number
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
  placement_reference?: PlacementReference
  drop_mm?: number
  rebar_type?: Record<string, unknown>
  mass_per_m_kg?: number
  type_id?: string
  instance_overrides?: Record<string, unknown>
  mark: string // Human-readable mark, e.g. "B1", "B2"
  start_point_mm: [number, number, number] // [x, y, z] in mm
  end_point_mm: [number, number, number] // [x, y, z] in mm
  section_mm: [number, number] // [width, depth] in mm, e.g. [200, 400]
  span_mm: number // computed length in mm, e.g. 4000
  level_id: string
  /** Vertical placement from the referenced level; positive is upward. */
  base_offset_mm?: number
  start_column_id?: string // optional connected column UUID
  end_column_id?: string // optional connected column UUID
  material: 'reinforced_concrete' | 'steel' | 'timber' | 'generic' | string
  engineering_status: 'preliminary' | 'engineer_approved' | 'as_built'
}

// -------------------------------------------------------------
// Architecture & Openings Domain Module Payloads
// -------------------------------------------------------------

export interface WallModuleData {
  placement_reference?: PlacementReference
  type_id?: string
  instance_overrides?: Record<string, unknown>
  mark: string // Human-readable mark, e.g. "W1", "W2"
  start_point_mm: [number, number, number] // [x, y, z] in mm
  end_point_mm: [number, number, number] // [x, y, z] in mm
  thickness_mm: number // e.g. 100, 150, 200 mm
  masonry_thickness_mm?: number
  plaster_inside_thickness_mm?: number
  plaster_outside_thickness_mm?: number
  plaster_inside_material?: string
  plaster_outside_material?: string
  inside_finish_mark?: string
  outside_finish_mark?: string
  /** Interior face side relative to the wall's start→end direction. */
  interior_side?: 'left' | 'right'
  height_mm: number // e.g. 2800 mm
  /** Optional vertical constraint: derive the wall top from a storey datum. */
  top_level_id?: string
  base_offset_mm?: number
  top_offset_mm?: number
  vertical_constraint?: 'fixed_height' | 'top_level'
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
  /** Opening bottom offset from its base level; normally zero for doors. */
  sill_height_mm?: number
  /** When set, derive opening height so its head lands at this level + offset. */
  head_level_id?: string
  head_offset_mm?: number
  vertical_constraint?: 'fixed_height' | 'head_level'
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
  /** When set, derive opening height so its head lands at this level + offset. */
  head_level_id?: string
  head_offset_mm?: number
  vertical_constraint?: 'fixed_height' | 'head_level'
  level_id: string
  window_type_id?: string
}

// Standalone construction payloads. Coordinates/dimensions are canonical millimetres.
export type Point2Mm = [number, number]
export type Point3Mm = [number, number, number]
export interface CatalogPlacement {
  mark: string
  type_id?: string
  instance_overrides?: Record<string, unknown>
  level_id: string
}
export interface SlabModuleData extends CatalogPlacement {
  boundary_mm: Point2Mm[]
  elevation_mm: number
  elevation_offset_mm?: number
  voids_mm?: Point2Mm[][]
  thickness_mm: number
  topping_mm: number
  slab_system: 'slab_on_ground' | 'suspended' | 'precast_plank' | 'hollow_core'
  material: string
  slope_ratio?: number
  drain_direction_deg?: number
}
export interface RoomModuleData extends CatalogPlacement {
  name: string
  number: string
  boundary_mm: Point2Mm[]
  area_mm2: number
  boundary_source: 'walls' | 'separation_lines' | 'manual'
  finish_floor_id?: string
  ceiling_id?: string
}
export interface RoomSeparatorModuleData extends CatalogPlacement { start_point_mm: Point2Mm; end_point_mm: Point2Mm }
export interface ArchitecturalFloorModuleData extends CatalogPlacement {
  boundary_mm: Point2Mm[]
  voids_mm: Point2Mm[][]
  elevation_mm: number
  elevation_offset_mm: number
  thickness_mm: number
  finish_layers: Array<{ material: string; thickness_mm: number; mark?: string }>
  room_id?: string
  follows_room_boundary: boolean
}
export interface CeilingModuleData extends CatalogPlacement {
  boundary_mm: Point2Mm[]
  voids_mm: Point2Mm[][]
  elevation_mm: number
  elevation_offset_mm: number
  thickness_mm: number
  grid_mm?: Point2Mm
  room_id?: string
  follows_room_boundary: boolean
}
export interface RebarSpacingZone { start_mm:number; end_mm:number; spacing_mm:number }
export interface RebarModuleData extends CatalogPlacement {
  role?: 'top' | 'bottom' | 'stirrups' | 'general' | 'main' | 'ties' | 'bottom_x' | 'bottom_y' | 'starter'
  inherit_host_type?: boolean
  host_id:string
  mode:'longitudinal'|'stirrups'|'explicit'
  grade:'SR24'|'SD40'|'SD50'
  diameter_mm:number
  cover_mm:number
  count:number
  bend_radius_mm:number
  hook_angle_deg:0|90|135
  hook_extension_mm:number
  lap_mm:number
  legs_mm:number[]
  spacing_zones:RebarSpacingZone[]
}
export interface RoofEdgeSlope { defines_slope:boolean; slope_deg:number }
export interface RoofModuleData extends CatalogPlacement {
  boundary_mm:Point2Mm[]
  voids_mm?:Point2Mm[][]
  elevation_mm:number
  edges:RoofEdgeSlope[]
  material:string
  thickness_mm:number
}
export interface MouldingModuleData extends CatalogPlacement {
  path_mm:Point3Mm[]
  profile_mm:Point2Mm[]
  closed:boolean
  miter_limit:number
  material:string
  host_id?:string
}
export interface PanelLayoutModuleData extends CatalogPlacement {
  host_id:string
  rows:number
  columns:number
  margin_mm:number
  gap_mm:number
  depth_mm:number
  material:string
}
export type PipeSystem = 'waste'|'soil'|'rainwater'|'vent'|'cold_water'|'hot_water'
export interface PipeRouteModuleData extends CatalogPlacement {
  system:PipeSystem
  nodes_mm:Point3Mm[]
  diameter_mm:number
  start_node_id?:string
  end_node_id?:string
  start_invert_mm:number|null
  end_invert_mm:number|null
  minimum_slope_ratio:number
  material:string
}
export interface ManholeModuleData extends CatalogPlacement {
  location_mm:Point3Mm
  size_mm:Point3Mm
  invert_mm:number|null
  system:'waste'|'soil'|'rainwater'
}
export interface SepticModuleData extends CatalogPlacement {
  location_mm:Point3Mm
  people:number
  litres_per_person:number
  reserve_ratio:number
  capacity_litres:number
  rule_source:string
}
export interface PumpBypassModuleData extends CatalogPlacement {
  location_mm:Point3Mm
  span_mm:number
  diameter_mm:number
  mode:'pump'|'bypass'|'isolated'
  valve_states:{inlet:boolean;outlet:boolean;bypass:boolean}
}
export interface BathroomModuleData extends CatalogPlacement {
  boundary_mm:Point2Mm[]
  elevation_mm:number
  drop_mm:number
  slope_ratio:number
  drain_mm:Point2Mm
  waterproof_upstand_mm:number
  wet_wall_height_mm:number
  wet_wall_length_mm:number
  tile_mm:Point2Mm
  toilet_rough_in_mm:number
}
export interface ElectricalFixtureModuleData extends CatalogPlacement {
  location_mm:Point3Mm
  kind:'light'|'switch'|'outlet'|'panel'
  watts:number
  circuit_id?:string
  controlled_ids:string[]
  switch_ways:1|2|3
  grounded:boolean
}
export interface CircuitModuleData extends CatalogPlacement {
  panel_id:string
  voltage:number
  breaker_a:number
  cable_mm2:number
  allowable_current_a:number
  device_ids:string[]
}
export interface LEDModuleData extends CatalogPlacement {
  path_mm:Point3Mm[]
  watts_per_m:number
  voltage:number
  driver_watts:number
  derating_ratio:number
  material:string
  host_id?:string
}
export interface CabinetModuleData extends CatalogPlacement {
  location_mm:Point3Mm
  width_mm:number
  height_mm:number
  depth_mm:number
  board_mm:number
  back_mm:number
  plinth_mm:number
  rotation_deg:number
  modules_mm:number[]
  shelves:number
  drawers:number
  front:'solid'|'glass'|'open'
  carcass_material:string
  front_material:string
  back_material:string
  countertop_material:string
  countertop_mm:number
}

// -------------------------------------------------------------
// Legal, Land Title Deed & Signatories (Permit Package อ.1)
// -------------------------------------------------------------

export interface BoundaryPeg {
  peg_no: string
  coordinate_m: [number, number] // [x, y] in meters
  bearing_deg?: number
  distance_m?: number
}

export interface ThaiBuildingCodeSetbacks {
  front_m: number
  rear_m: number
  left_m: number
  right_m: number
  min_opening_setback_m: number // 2.00m (กฎกระทรวงฉบับที่ 55)
  min_blind_setback_m: number // 0.50m
}

export interface ThaiZoningData {
  zone_code: string // e.g. "ย.4-12"
  far_limit: number // e.g. 3.0
  osr_min_percent: number // e.g. 10.0%
  permeable_open_space_ratio_percent: number // >= 50% of open space
}

export interface ProjectSignatories {
  owner_name: string
  architect_name: string
  architect_license_no: string // e.g. "ส-สถ. 12345"
  structural_engineer_name: string
  structural_engineer_license_no: string // e.g. "วส. 67890"
  mep_engineer_name?: string
  mep_engineer_license_no?: string
  signed_date?: string
  issue_approved?: boolean
}

export interface ProjectLegalMetadata {
  deed_no: string
  land_no: string
  survey_page: string
  subdistrict: string
  district: string
  province: string
  rai: number
  ngan: number
  sq_wa: number
  total_area_sqm: number
  boundary_pegs: BoundaryPeg[]
  setbacks: ThaiBuildingCodeSetbacks
  zoning: ThaiZoningData
  signatories: ProjectSignatories
}

// -------------------------------------------------------------
// Stair & Railing Geometry & Thai Building Code Check (กม.55)
// -------------------------------------------------------------

export type StairType = 'straight' | 'l_shape' | 'u_shape'
export type StairStructureType = 'rc_monolithic' | 'steel_stringer' | 'wood_treads'

export interface StairCodeCheckResult {
  passed: boolean
  violations: string[]
  width_ok: boolean // width_mm >= 900
  riser_ok: boolean // riser_mm <= 200
  tread_ok: boolean // tread_mm >= 220
  landing_ok: boolean // rise >= 3000 requires landing >= width
  railing_ok: boolean // railing_height >= 900
}

export interface StairModuleData extends CatalogPlacement {
  stair_type: StairType
  structure_type: StairStructureType
  start_point_mm: Point3Mm
  total_rise_mm: number
  width_mm: number
  num_risers: number
  riser_height_mm: number
  tread_depth_mm: number
  landing_depth_mm?: number
  turn_direction?: 'left' | 'right'
  has_handrail: boolean
  handrail_height_mm: number
  code_check?: StairCodeCheckResult
}

export interface RailingModuleData extends CatalogPlacement {
  path_mm: Point3Mm[]
  height_mm: number
  style: 'vertical_balusters' | 'glass_panel' | 'horizontal_rails' | 'wrought_iron'
  baluster_spacing_mm: number
  material: string
}
