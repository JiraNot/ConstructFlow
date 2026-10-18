import type { ProjectDocument } from './project.js'
import { validateProjectV2 } from './validation.js'

export { deserializeProject } from './deserialization.js'

export function serializeProject(doc: ProjectDocument): string {
  validateProjectV2(doc)
  return JSON.stringify(doc, null, 2)
}
