import type { ProjectDocument } from './project.js'
import type { SmartObject } from './smartObject.js'

/**
 * Masonry poche is a material convention, not a phase convention. New steel-
 * stud, board and concrete walls stay unhatched even when built in the new
 * construction phase. Old files without assembly metadata retain the historic
 * masonry default until their wall type is explicitly classified.
 */
export function isMasonryWallPlanHatch(
  wall: Pick<SmartObject, 'module_data' | 'object_type'>,
  types: ProjectDocument['types'],
): boolean {
  if (wall.object_type !== 'architecture.wall') return false
  const data = wall.module_data as Record<string, unknown>
  const overrides = data.instance_overrides as Record<string, unknown> | undefined
  const typeId = typeof data.type_id === 'string' ? data.type_id : typeof data.wall_type_id === 'string' ? data.wall_type_id : undefined
  const wallType = types.find((candidate) => candidate.id === typeId)
    ?? types.find((candidate) => candidate.object_type === 'architecture.wall' && candidate.name.toLowerCase() === String(data.mark ?? '').toLowerCase())
  const resolve = (field: string) => overrides?.[field] ?? data[field] ?? wallType?.parameters[field]
  const material = String(resolve('material') ?? '').toLowerCase()
  const system = String(resolve('wall_system') ?? '').toLowerCase()

  if (material) return ['brick_masonry', 'lightweight_block', 'masonry', 'brick', 'aac', 'concrete_block'].includes(material)
  if (system) return ['masonry', 'brick_masonry', 'block_masonry'].includes(system)
  return true
}
