// ConstructFlow Project Document Serialization & Validation

import { ProjectDocument } from './project.js'

export function serializeProject(doc: ProjectDocument): string {
  return JSON.stringify(doc, null, 2)
}

export function deserializeProject(jsonText: string): ProjectDocument {
  const parsed = JSON.parse(jsonText)

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Invalid project format: payload is not an object')
  }

  if (parsed.schema_version !== 1) {
    throw new Error(`Unsupported schema_version: ${parsed.schema_version}`)
  }

  if (!parsed.project || typeof parsed.project.id !== 'string') {
    throw new Error('Invalid project format: missing project metadata')
  }

  if (!Array.isArray(parsed.levels)) {
    throw new Error('Invalid project format: levels array required')
  }

  if (typeof parsed.objects !== 'object' || parsed.objects === null) {
    throw new Error('Invalid project format: objects map required')
  }

  return parsed as ProjectDocument
}
