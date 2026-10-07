import { deserializeProject, serializeProject } from '@constructflow/project-model'
import { validateConstructionProject } from '@constructflow/domain-providers'

/** Read and canonicalize a local ConstructFlow project file before it replaces editor state. */
export async function readProjectFile(file) {
  const project = deserializeProject(await file.text())
  validateConstructionProject(project)
  return { project, serialized: serializeProject(project), name: file.name }
}

/** Persist one complete project snapshot through the browser's local file handle. */
export async function writeProjectFile(handle, serializedProject) {
  const writable = await handle.createWritable()
  try {
    await writable.write(serializedProject)
    await writable.close()
  } catch (error) {
    try {
      await writable.abort?.()
    } catch {
      // Preserve the original write/close error; an abort may fail after a partial close.
    }
    throw error
  }
}
