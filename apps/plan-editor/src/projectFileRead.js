import { deserializeProject, serializeProject } from '@constructflow/project-model'
import { validateConstructionProject } from '@constructflow/domain-providers'
import { CommandBus } from '@constructflow/command-runtime'

/** Read and canonicalize a local ConstructFlow project file before it replaces editor state. */
export async function readProjectFile(file) {
  const project = CommandBus.migrateProject(deserializeProject(await file.text()))
  validateConstructionProject(project)
  return { project, serialized: serializeProject(project), name: file.name }
}
