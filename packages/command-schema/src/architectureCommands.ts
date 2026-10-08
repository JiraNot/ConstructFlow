// Architecture & Openings Domain Mutation Command Payloads (Vertical Slice 02)

import { Phase, DoorHanding, WallInterfaceTreatment, PlacementReference, RoomModuleData, RoomSeparatorModuleData, ArchitecturalFloorModuleData, CeilingModuleData } from '@constructflow/project-model'

export type ArchitectureObjectInput<T extends object> = T & { id?: string; created_phase?: Phase; phase?: Phase }
export interface ArchitectureRoomCommands {
  CreateRoom: ArchitectureObjectInput<RoomModuleData>
  UpdateRoom: ArchitectureObjectInput<RoomModuleData>
  CreateRoomSeparator: ArchitectureObjectInput<RoomSeparatorModuleData>
  UpdateRoomSeparator: ArchitectureObjectInput<RoomSeparatorModuleData>
  CreateArchitecturalFloor: ArchitectureObjectInput<ArchitecturalFloorModuleData>
  UpdateArchitecturalFloor: ArchitectureObjectInput<ArchitecturalFloorModuleData>
  CreateCeiling: ArchitectureObjectInput<CeilingModuleData>
  UpdateCeiling: ArchitectureObjectInput<CeilingModuleData>
  DetectRooms: { level_id: string; default_name?: string }
}

export interface CreateWallInput {
  /** Immutable unique identity (UUID) */
  id: string
  type_id?: string

  /** Human-readable mark, e.g. "W1" */
  mark: string
  placement_reference?: PlacementReference

  /** Start point in millimeters: [x, y] or [x, y, z] */
  start_point_mm: [number, number, number] | [number, number]

  /** End point in millimeters: [x, y] or [x, y, z] */
  end_point_mm: [number, number, number] | [number, number]

  /** Wall thickness in mm, e.g. 100, 150, 200 */
  thickness_mm: number

  /** Wall height in mm, defaults to 2800 */
  height_mm?: number
  top_level_id?: string
  base_offset_mm?: number
  top_offset_mm?: number

  /** Associated building level ID */
  level_id: string

  material?: string
  phase?: Phase
  interface_treatments?: WallInterfaceTreatment[]
}

export interface UpdateWallMarkInput {
  object_id: string
  mark: string
}

export interface UpdateWallDimensionsInput {
  object_id: string
  thickness_mm: number
  height_mm?: number
  top_level_id?: string
  base_offset_mm?: number
  top_offset_mm?: number
  vertical_constraint?: 'fixed_height' | 'top_level'
  plaster_inside_thickness_mm?: number
  plaster_outside_thickness_mm?: number
  plaster_inside_material?: string
  plaster_outside_material?: string
  inside_finish_mark?: string
  outside_finish_mark?: string
  /** Which side of the start→end centerline is the room/interior face. */
  interior_side?: 'left' | 'right'
}

export interface MoveWallInput {
  object_id: string
  delta_mm: [number, number]
}

/** Move a hosted door/window along its host wall centerline, preserving the relationship. */
export interface MoveOpeningInput {
  object_id: string
  offset_along_wall_mm: number
}

export interface CreateDoorInput {
  /** Immutable unique identity (UUID) */
  id: string
  type_id?: string

  /** Human-readable mark, e.g. "D1" */
  mark: string

  /** Host wall UUID */
  wall_id: string

  /** Center point in mm: [x, y] or [x, y, z] */
  location_mm: [number, number, number] | [number, number]

  /** Distance from wall start point along wall segment in mm */
  offset_along_wall_mm: number

  /** Door width in mm, e.g. 800, 900, 1000 */
  width_mm: number

  /** Door height in mm, defaults to 2000 */
  height_mm?: number
  sill_height_mm?: number
  head_level_id?: string
  head_offset_mm?: number

  /** Swing handing */
  handing?: DoorHanding

  /** Associated building level ID */
  level_id: string

  phase?: Phase
}

export interface UpdateDoorMarkInput {
  object_id: string
  mark: string
}

export interface UpdateDoorDimensionsInput {
  object_id: string
  width_mm: number
  height_mm?: number
  sill_height_mm?: number
  head_level_id?: string
  head_offset_mm?: number
  vertical_constraint?: 'fixed_height' | 'head_level'
}

export interface FlipDoorHandingInput {
  object_id: string
  handing?: DoorHanding
}

export interface CreateWindowInput {
  /** Immutable unique identity (UUID) */
  id: string
  type_id?: string

  /** Human-readable mark, e.g. "W1" */
  mark: string

  /** Host wall UUID */
  wall_id: string

  /** Center point in mm: [x, y] or [x, y, z] */
  location_mm: [number, number, number] | [number, number]

  /** Distance from wall start point along wall segment in mm */
  offset_along_wall_mm: number

  /** Window width in mm, e.g. 1200, 1800, 2400 */
  width_mm: number

  /** Window height in mm, defaults to 1200 */
  height_mm?: number

  /** Window sill height in mm, defaults to 900 */
  sill_height_mm?: number
  head_level_id?: string
  head_offset_mm?: number

  /** Associated building level ID */
  level_id: string

  phase?: Phase
}

export interface UpdateWindowMarkInput {
  object_id: string
  mark: string
}

export interface UpdateWindowDimensionsInput {
  object_id: string
  width_mm: number
  height_mm?: number
  sill_height_mm?: number
  head_level_id?: string
  head_offset_mm?: number
  vertical_constraint?: 'fixed_height' | 'head_level'
}
