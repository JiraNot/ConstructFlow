import type { ProjectDocument } from '@constructflow/project-model'

/** Compact drift check for model sync; comments and edit timestamps use their own sync semantics. */
export function projectSyncFingerprint(value: ProjectDocument | string): string {
  const project = (typeof value === 'string' ? JSON.parse(value) : value) as ProjectDocument
  const normalized = {
    ...project,
    comments: undefined,
    project: { ...project.project, updated_at: undefined },
  }
  const serialized = JSON.stringify(normalized)
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < serialized.length; index += 1) {
    const character = serialized.charCodeAt(index)
    first = Math.imul(first ^ character, 0x01000193)
    second = Math.imul(second ^ character, 0x85ebca6b)
  }
  return `${serialized.length}:${(first >>> 0).toString(16)}${(second >>> 0).toString(16)}`
}
