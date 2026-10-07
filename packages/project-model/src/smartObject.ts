// ConstructFlow Canonical SmartObject Interface
// Strictly mirrors schemas/smart-object.schema.json

import {
  Phase,
  RemovalPhase,
  SmartObjectStatus,
  LevelRef,
  GridModuleData,
  ColumnModuleData,
  FoundationModuleData,
  BeamModuleData,
  WallModuleData,
  DoorModuleData,
  WindowModuleData,
  SlabModuleData,RebarModuleData,RoofModuleData,MouldingModuleData,PanelLayoutModuleData,PipeRouteModuleData,ManholeModuleData,SepticModuleData,PumpBypassModuleData,BathroomModuleData,ElectricalFixtureModuleData,CircuitModuleData,LEDModuleData,CabinetModuleData,
  StairModuleData, RailingModuleData,
} from './types.js'

export type KnownModuleData =
  | GridModuleData
  | ColumnModuleData
  | FoundationModuleData
  | BeamModuleData
  | WallModuleData
  | DoorModuleData
  | WindowModuleData
  | SlabModuleData | RebarModuleData | RoofModuleData | MouldingModuleData | PanelLayoutModuleData | PipeRouteModuleData | ManholeModuleData | SepticModuleData | PumpBypassModuleData | BathroomModuleData | ElectricalFixtureModuleData | CircuitModuleData | LEDModuleData | CabinetModuleData
  | StairModuleData | RailingModuleData
  | Record<string, unknown>

export interface SmartObject<TData extends object = KnownModuleData> {
  /** Immutable unique identity (UUID v4/v7) — never changes across renames */
  id: string

  /** Namespaced type identifier, e.g. "structure.column", "structure.foundation" */
  object_type: string

  /** Owner module namespace, e.g. "constructflow.structure" */
  owner_module: string

  /** Schema version of this SmartObject */
  schema_version: number

  /** Lifecycle phase when object was created */
  created_phase: Phase

  /** Lifecycle phase when object was demolished/removed, or null if active */
  removed_phase: RemovalPhase | null

  /** Associated building levels and vertical datums */
  level_refs: LevelRef[]

  /** Direct parent/host object UUIDs (e.g. column ID for a foundation) */
  host_refs: string[]

  /** Connector reference IDs */
  connector_refs: string[]

  /** Status of this SmartObject */
  status: SmartObjectStatus

  /** Domain-specific payload owned by the registering module */
  module_data: TData

  /** Optional revision metadata */
  revision_meta?: Record<string, unknown>

  /** ISO 8601 creation timestamp */
  created_at: string

  /** ISO 8601 last update timestamp */
  updated_at: string
}

/** Lifecycle phase used by visual representations: removed objects render in their removal phase. */
export function getDisplayPhase(object: Pick<SmartObject, 'created_phase' | 'removed_phase'>): Phase {
  return object.removed_phase ?? object.created_phase
}

// -------------------------------------------------------------
// Type Guards & Utility Helpers
// -------------------------------------------------------------

export function isSmartObject(obj: unknown): obj is SmartObject {
  if (typeof obj !== 'object' || obj === null) return false
  const candidate = obj as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.object_type === 'string' &&
    typeof candidate.owner_module === 'string' &&
    typeof candidate.created_phase === 'string' &&
    Array.isArray(candidate.level_refs) &&
    typeof candidate.module_data === 'object' &&
    candidate.module_data !== null &&
    !Array.isArray(candidate.module_data)
  )
}

export function isColumnObject(
  obj: SmartObject
): obj is SmartObject<ColumnModuleData> {
  return obj.object_type === 'structure.column'
}

export function isFoundationObject(
  obj: SmartObject
): obj is SmartObject<FoundationModuleData> {
  return obj.object_type === 'structure.foundation'
}

export function isGridObject(
  obj: SmartObject
): obj is SmartObject<GridModuleData> {
  return obj.object_type === 'structure.grid'
}

export function isBeamObject(
  obj: SmartObject
): obj is SmartObject<BeamModuleData> {
  return obj.object_type === 'structure.beam'
}

export function isWallObject(
  obj: SmartObject
): obj is SmartObject<WallModuleData> {
  return obj.object_type === 'architecture.wall'
}

export function isDoorObject(
  obj: SmartObject
): obj is SmartObject<DoorModuleData> {
  return obj.object_type === 'door_window.door'
}

export function isWindowObject(
  obj: SmartObject
): obj is SmartObject<WindowModuleData> {
  return obj.object_type === 'door_window.window'
}

