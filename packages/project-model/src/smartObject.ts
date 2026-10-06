// ConstructFlow Canonical SmartObject Interface
// Strictly mirrors schemas/smart-object.schema.json

import {
  Phase,
  SmartObjectStatus,
  LevelRef,
  GridModuleData,
  ColumnModuleData,
  FoundationModuleData,
} from './types.js'

export type KnownModuleData =
  | GridModuleData
  | ColumnModuleData
  | FoundationModuleData
  | Record<string, any>

export interface SmartObject<TData extends Record<string, any> = KnownModuleData> {
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
  removed_phase: Phase | null

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
  revision_meta?: Record<string, any>

  /** ISO 8601 creation timestamp */
  created_at: string

  /** ISO 8601 last update timestamp */
  updated_at: string
}

// -------------------------------------------------------------
// Type Guards & Utility Helpers
// -------------------------------------------------------------

export function isSmartObject(obj: unknown): obj is SmartObject {
  if (typeof obj !== 'object' || obj === null) return false
  const candidate = obj as Record<string, any>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.object_type === 'string' &&
    typeof candidate.owner_module === 'string' &&
    typeof candidate.created_phase === 'string' &&
    Array.isArray(candidate.level_refs) &&
    typeof candidate.module_data === 'object'
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
