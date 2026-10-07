// ConstructFlow Command Envelope & Execution Result Contracts

export interface CommandActor {
  kind: 'human' | 'ai' | 'sync' | 'system'
  id?: string
  role?: string
}

export interface CommandEnvelope<TInput = Record<string, unknown>> {
  /** Unique command execution UUID */
  command_id: string

  /** Shared identity for committed commands in one atomic batch. */
  transaction_id?: string

  /** Registered command type name, e.g. "CreateColumn", "MoveColumn" */
  name: string

  /** Command schema version */
  version: number

  /** Target Project UUID */
  project_id: string

  /** ISO 8601 UTC timestamp */
  timestamp: string

  /** Author / caller identity */
  actor: CommandActor

  /** Command input payload */
  input: TInput
}

export interface CommandExecutionResult {
  status: 'success' | 'rejected' | 'failed'
  command_id: string
  command_name: string
  affected_object_ids: string[]
  created_object_ids?: string[]
  updated_object_ids?: string[]
  deleted_object_ids?: string[]
  errors?: string[]
  warnings?: string[]
}
