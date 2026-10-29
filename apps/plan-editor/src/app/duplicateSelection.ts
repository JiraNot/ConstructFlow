import type { ProjectDocument } from '@constructflow/project-model'

/** Copy hosted doors/windows with their wall so duplicated BIM geometry keeps valid host links. */
export function expandSelectionWithHostedOpenings(project: ProjectDocument, objectIds: string[]): string[] {
  const ids = [...new Set(objectIds)].filter(id => Boolean(project.objects[id]))
  const wallIds = new Set(ids.filter(id => project.objects[id]?.object_type === 'architecture.wall'))
  if (!wallIds.size) return ids
  const dependentOpenings = Object.values(project.objects)
    .filter(object => object.object_type === 'door_window.door' || object.object_type === 'door_window.window')
    .filter(object => wallIds.has(String((object.module_data as Record<string, unknown>).wall_id ?? '')))
    .map(object => object.id)
  return [...ids, ...dependentOpenings.filter(id => !ids.includes(id))]
}
