import type { ProjectDocument } from '@constructflow/project-model'
import type { CommandActor, CommandEnvelope, CommandExecutionResult } from './envelope.js'

export interface CommandRequest {
  name: string
  input: Record<string, unknown>
}

export interface CommandBusResult {
  result: CommandExecutionResult
  updatedProject: ProjectDocument
  emittedEnvelope?: CommandEnvelope
  /** Every committed mutation, including project metadata outside the external SketchUp bridge. */
  committedEnvelope?: CommandEnvelope
}

/** Internal handler contract; handlers mutate only the isolated draft. */
export interface CommandHandlerContext {
  project: ProjectDocument
  updated: ProjectDocument
  commandName: string
  input: Record<string, unknown>
  command_id: string
  now: string
  envelope: CommandEnvelope
}

export interface CommandBatchResult {
  transaction_id: string
  status: CommandExecutionResult['status']
  updatedProject: ProjectDocument
  results: CommandExecutionResult[]
  /** Empty on rollback: downstream consumers receive committed commands only. */
  emittedEnvelopes: CommandEnvelope[]
  committedEnvelopes: CommandEnvelope[]
  failed_command_index?: number
  errors?: string[]
}

export interface ProjectCommandTransaction {
  transaction_id: string
  commands: CommandEnvelope[]
  /** Persistent UUID for this browser/device, used to avoid replaying this device's own commands. */
  source_device_id?: string
  /** Server sequence this transaction was based on; set once before the first upload and kept for retries. */
  base_sequence?: number
  /** Fingerprint of the resulting project state, used to verify new-device baselines and remote replay. */
  project_fingerprint?: string
  sequence?: number
  submitted_by?: string
  created_at?: string
}

export type CommandActorKind = CommandActor['kind']
