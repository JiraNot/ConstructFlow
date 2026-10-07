import type { ProjectDocument } from './project.js'
import { migrateProjectV1ToV2, validateProjectV2, type ProjectDocumentV1 } from './migrations.js'

export function serializeProject(doc: ProjectDocument): string {
  validateProjectV2(doc)
  return JSON.stringify(doc, null, 2)
}

/** Load current files and migrate supported v1 files without losing unknown sibling data. */
export function deserializeProject(jsonText: string): ProjectDocument {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch (error: unknown) {
    throw new Error(`Invalid project JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid project format: payload is not an object')
  const candidate = parsed as { schema_version?: unknown }
  if (candidate.schema_version === 1) return migrateProjectV1ToV2(parsed as ProjectDocumentV1)
  if (candidate.schema_version === 2) {
    const project = parsed as ProjectDocument
    validateProjectV2(project)
    return project
  }
  throw new Error(`Unsupported schema_version: ${String(candidate.schema_version)}`)
}
