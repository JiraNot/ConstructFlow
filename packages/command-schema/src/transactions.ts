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
  failed_command_index?: number
  errors?: string[]
}

export type CommandActorKind = CommandActor['kind']
