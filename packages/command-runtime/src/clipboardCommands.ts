import type { CommandHandlerContext } from '@constructflow/command-schema'
import type { SmartObject } from '@constructflow/project-model'

const isPoint = (value: unknown): value is number[] =>
  Array.isArray(value) && value.length >= 2 && value.length <= 3 && value.every(Number.isFinite)

const translatePointTree = (value: unknown, dx: number, dy: number): unknown => {
  if (isPoint(value)) return [value[0] + dx, value[1] + dy, ...value.slice(2)]
  return Array.isArray(value) ? value.map(point => translatePointTree(point, dx, dy)) : value
}

const translateGeometry = (value: unknown, key: string, dx: number, dy: number): unknown => {
  const pointFields = new Set([
    'location_mm', 'start_point_mm', 'end_point_mm', 'center_mm', 'origin_mm', 'position_mm',
    'anchor_mm', 'points_mm', 'vertices_mm', 'boundary_mm', 'boundary_points_mm',
    'outline_mm', 'polygon_mm', 'voids_mm', 'path_points_mm', 'corners_mm',
  ])
  if (pointFields.has(key)) {
    if (isPoint(value) || Array.isArray(value)) return translatePointTree(value, dx, dy)
  }
  if (Array.isArray(value)) return value.map(item => translateGeometry(item, '', dx, dy))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, translateGeometry(child, childKey, dx, dy)]))
  }
  return value
}

const remapReferences = (value: unknown, idMap: Map<string, string>): unknown => {
  if (Array.isArray(value)) return value.map(item => remapReferences(item, idMap))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, child]) => {
    if ((key.endsWith('_id') || key === 'host_refs' || key === 'connector_refs') && typeof child === 'string') {
      return [key, idMap.get(child) ?? child]
    }
    if ((key === 'host_refs' || key === 'connector_refs') && Array.isArray(child)) {
      return [key, child.map(id => typeof id === 'string' ? idMap.get(id) ?? id : id)]
    }
    return [key, remapReferences(child, idMap)]
  }))
}

/** Duplicate selected Smart Objects as one undoable model command. */
export function executeDuplicateObjects(context: CommandHandlerContext) {
  const rawIds = context.input.object_ids
  const dx = Number(context.input.delta_x_mm ?? 500)
  const dy = Number(context.input.delta_y_mm ?? 0)
  if (!Array.isArray(rawIds) || !rawIds.length || !rawIds.every(id => typeof id === 'string')) {
    return { result: { status: 'rejected' as const, command_id: context.command_id, command_name: context.commandName, affected_object_ids: [], errors: ['Select at least one object to duplicate'] }, updatedProject: context.project }
  }
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    return { result: { status: 'rejected' as const, command_id: context.command_id, command_name: context.commandName, affected_object_ids: [], errors: ['Duplicate offset must be a finite distance'] }, updatedProject: context.project }
  }
  const sources = [...new Set(rawIds as string[])].map(id => context.project.objects[id]).filter((object): object is SmartObject => Boolean(object))
  if (!sources.length) {
    return { result: { status: 'rejected' as const, command_id: context.command_id, command_name: context.commandName, affected_object_ids: [], errors: ['Selected objects no longer exist'] }, updatedProject: context.project }
  }
  const suppliedIdMap = context.input.id_map && typeof context.input.id_map === 'object'
    ? context.input.id_map as Record<string, unknown> : {}
  const idMap = new Map(sources.map(source => {
    const supplied = suppliedIdMap[source.id]
    return [source.id, typeof supplied === 'string' && supplied ? supplied : crypto.randomUUID()]
  }))
  if (new Set(idMap.values()).size !== idMap.size || [...idMap.values()].some(id => context.project.objects[id])) {
    return { result: { status: 'rejected' as const, command_id: context.command_id, command_name: context.commandName, affected_object_ids: [], errors: ['Duplicate object IDs must be unique and unused'] }, updatedProject: context.project }
  }
  const clones = sources.map(source => {
    const cloned = structuredClone(source) as SmartObject
    const moduleData = translateGeometry(cloned.module_data, '', dx, dy) as Record<string, unknown>
    // Openings are hosted by a wall. When that wall is not in the copied group,
    // move the opening along the original wall instead of leaving it in place.
    const wallId = typeof moduleData.wall_id === 'string' ? moduleData.wall_id : ''
    if (wallId && !idMap.has(wallId) && Number.isFinite(Number(moduleData.offset_along_wall_mm))) {
      const wall = context.project.objects[wallId]
      const wallData = wall?.module_data as Record<string, unknown> | undefined
      const start = wallData?.start_point_mm as number[] | undefined
      const end = wallData?.end_point_mm as number[] | undefined
      if (start && end) {
        const length = Math.hypot(end[0] - start[0], end[1] - start[1])
        if (length > 0) {
          const offset = Number(moduleData.offset_along_wall_mm) + (dx * (end[0] - start[0]) + dy * (end[1] - start[1])) / length
          moduleData.offset_along_wall_mm = offset
          const location = moduleData.location_mm
          if (Array.isArray(location)) moduleData.location_mm = [start[0] + (end[0] - start[0]) * offset / length, start[1] + (end[1] - start[1]) * offset / length, ...location.slice(2)]
        }
      }
    }
    const remapped = remapReferences({ ...cloned, id: idMap.get(source.id)!, module_data: moduleData }, idMap) as SmartObject
    remapped.id = idMap.get(source.id)!
    remapped.created_at = context.now
    remapped.updated_at = context.now
    return remapped
  })
  for (const clone of clones) context.updated.objects[clone.id] = clone
  const ids = clones.map(clone => clone.id)
  return {
    result: { status: 'success' as const, command_id: context.command_id, command_name: context.commandName, affected_object_ids: ids, updated_object_ids: ids },
    updatedProject: context.updated,
    emittedEnvelope: { ...context.envelope, input: { object_ids: sources.map(source => source.id), delta_x_mm: dx, delta_y_mm: dy, id_map: Object.fromEntries(idMap) } },
  }
}
