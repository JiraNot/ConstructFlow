/** Return selected elevation objects that should receive explicit move commands.
 * Hosted doors/windows follow a selected host wall, so omitting them prevents a double move.
 */
export function resolveElevationMoveSelection(project, ids) {
  const uniqueIds = [...new Set(ids)].filter(id => !!project.objects[id])
  const selected = new Set(uniqueIds)
  return uniqueIds.filter(id => {
    const object = project.objects[id]
    if (object.object_type !== 'door_window.door' && object.object_type !== 'door_window.window') return true
    const wallId = object.module_data?.wall_id
    return typeof wallId !== 'string' || !selected.has(wallId)
  })
}

/** Build one flattened command batch for the complete selected elevation group. */
export function buildElevationGroupMoveCommands(project, ids, buildObjectCommands) {
  return resolveElevationMoveSelection(project, ids).flatMap(id => buildObjectCommands(id))
}
