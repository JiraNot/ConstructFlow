import type { ProjectDocument } from '@constructflow/project-model'
import type { CommandRequest } from '@constructflow/command-schema'
export function resolveElevationMoveSelection(project: ProjectDocument, ids: readonly string[]): string[]
export function buildElevationGroupMoveCommands(project: ProjectDocument, ids: readonly string[], buildObjectCommands: (id: string) => CommandRequest[]): CommandRequest[]
