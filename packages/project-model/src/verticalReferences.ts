import type { ProjectDocument } from './project.js'
import type { SmartObject } from './smartObject.js'

type Data = Record<string, unknown>
export interface VerticalExtent {
  base_elevation_mm: number
  top_elevation_mm: number
  height_mm: number
  base_offset_mm: number
  top_offset_mm: number
}

const dataOf = (object: SmartObject | Data): Data =>
  'module_data' in object
    ? (object.module_data as Data)
    : object

export function getLevelElevation(project: ProjectDocument, levelId: unknown): number | undefined {
  if (typeof levelId !== 'string') return undefined
  const value = project.levels.find(level => level.id === levelId)?.elevation_mm
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** Resolve a wall's vertical extent while keeping legacy fixed-height walls valid. */
export function resolveWallVerticalExtent(project: ProjectDocument, object: SmartObject | Data): VerticalExtent | undefined {
  const data = dataOf(object)
  const baseLevelId = typeof data.level_id === 'string' ? data.level_id : undefined
  const referencedBaseLevel = baseLevelId ? project.levels.find(level => level.id === baseLevelId) : undefined
  if (baseLevelId && !referencedBaseLevel) return undefined
  const topLevelId = typeof data.top_level_id === 'string' ? data.top_level_id : undefined
  const referencedTopLevel = topLevelId ? project.levels.find(level => level.id === topLevelId) : undefined
  if (topLevelId && !referencedTopLevel) return undefined
  const baseLevel = getLevelElevation(project, baseLevelId) ?? (typeof data.start_point_mm === 'object' && Array.isArray(data.start_point_mm) ? Number(data.start_point_mm[2] ?? 0) : 0)
  const baseOffset = Number(data.base_offset_mm ?? 0)
  const topOffset = Number(data.top_offset_mm ?? 0)
  if (!Number.isFinite(baseOffset) || !Number.isFinite(topOffset)) return undefined
  const base = baseLevel + baseOffset
  const topLevel = referencedTopLevel?.elevation_mm
  const height = topLevel !== undefined
    ? topLevel + topOffset - base
    : Number(data.height_mm)
  if (!Number.isFinite(height) || height <= 0) return undefined
  const top = topLevel !== undefined ? topLevel + topOffset : base + height
  return { base_elevation_mm: base, top_elevation_mm: top, height_mm: height, base_offset_mm: baseOffset, top_offset_mm: topOffset }
}

/** Resolve a structural column against storey datums, with a deterministic legacy fallback. */
export function resolveColumnVerticalExtent(project: ProjectDocument, object: SmartObject | Data): VerticalExtent | undefined {
  const data = dataOf(object)
  const location = Array.isArray(data.location_mm) ? data.location_mm : undefined
  const baseLevel = project.levels.find(level => level.id === data.base_level_id)
  if (typeof data.base_level_id === 'string' && !baseLevel) return undefined
  const constrainedTop = project.levels.find(level => level.id === data.top_level_id)
  if (typeof data.top_level_id === 'string' && !constrainedTop) return undefined
  const baseOffset = Number(data.base_offset_mm ?? 0)
  const topOffset = Number(data.top_offset_mm ?? 0)
  if (![baseOffset, topOffset].every(Number.isFinite)) return undefined
  const baseDatum = baseLevel?.elevation_mm ?? (typeof data.base_elevation_mm === 'number' ? data.base_elevation_mm : Number(location?.[2] ?? 0))
  const base = baseDatum + baseOffset
  const nextLevel = baseLevel
    ? [...project.levels].filter(level => level.elevation_mm > baseLevel.elevation_mm).sort((a, b) => a.elevation_mm - b.elevation_mm)[0]
    : undefined
  const explicitTop = typeof data.top_elevation_mm === 'number' && Number.isFinite(data.top_elevation_mm)
    ? data.top_elevation_mm
    : undefined
  const fallbackTop = nextLevel?.elevation_mm
    ?? (baseLevel?.height_mm !== undefined && baseLevel.height_mm > 0 ? baseDatum + baseLevel.height_mm : base + 3000)
  const top = (constrainedTop?.elevation_mm ?? explicitTop ?? fallbackTop) + topOffset
  const height = top - base
  if (![base, top, height].every(Number.isFinite) || height <= 0) return undefined
  return { base_elevation_mm: base, top_elevation_mm: top, height_mm: height, base_offset_mm: baseOffset, top_offset_mm: topOffset }
}

/** Resolve a beam's placement line from its storey datum and optional vertical offset. */
export function resolveBeamBaseElevation(project: ProjectDocument, object: SmartObject | Data): number | undefined {
  const data = dataOf(object)
  const level = project.levels.find(item => item.id === data.level_id)
  if (typeof data.level_id === 'string' && !level) return undefined
  const points = Array.isArray(data.start_point_mm) ? data.start_point_mm : undefined
  const datum = level?.elevation_mm ?? Number(points?.[2] ?? data.base_elevation_mm ?? 0)
  const offset = Number(data.base_offset_mm ?? 0)
  const elevation = datum + offset
  return Number.isFinite(elevation) ? elevation : undefined
}

/** Resolve a hosted opening's bottom and head from level datums or legacy sill/height values. */
export function resolveOpeningVerticalExtent(project: ProjectDocument, object: SmartObject | Data): VerticalExtent | undefined {
  const data = dataOf(object)
  const levelId = typeof data.level_id === 'string' ? data.level_id : undefined
  const baseLevel = levelId ? project.levels.find(level => level.id === levelId) : undefined
  if (levelId && !baseLevel) return undefined
  const levelElevation = getLevelElevation(project, levelId) ?? 0
  const bottomOffset = Number(data.base_offset_mm ?? data.sill_height_mm ?? 0)
  const headLevelId = typeof data.head_level_id === 'string' ? data.head_level_id : undefined
  const referencedHeadLevel = headLevelId ? project.levels.find(level => level.id === headLevelId) : undefined
  if (headLevelId && !referencedHeadLevel) return undefined
  const headLevel = referencedHeadLevel?.elevation_mm
  const headOffset = Number(data.head_offset_mm ?? 0)
  const fixedHeight = Number(data.height_mm)
  if (![bottomOffset, headOffset].every(Number.isFinite)) return undefined
  const base = levelElevation + bottomOffset
  const top = headLevel !== undefined
    ? headLevel + headOffset
    : base + fixedHeight
  const height = top - base
  if (!Number.isFinite(height) || height <= 0) return undefined
  return { base_elevation_mm: base, top_elevation_mm: top, height_mm: height, base_offset_mm: bottomOffset, top_offset_mm: headOffset }
}

export function resolveSlabElevation(project: ProjectDocument, object: SmartObject | Data): number | undefined {
  const data = dataOf(object)
  const levelId = typeof data.level_id === 'string' ? data.level_id : undefined
  const level = levelId ? project.levels.find(item => item.id === levelId) : undefined
  if (levelId && !level) return undefined
  const levelElevation = getLevelElevation(project, data.level_id) ?? 0
  const offset = Number(data.elevation_offset_mm ?? 0)
  const legacyElevation = Number(data.elevation_mm ?? 0)
  if (!Number.isFinite(offset) || !Number.isFinite(legacyElevation)) return undefined
  // elevation_offset_mm is additive to the selected level; legacy slabs remain absolute.
  return data.elevation_offset_mm !== undefined ? levelElevation + offset : legacyElevation
}

/** Resolve an architectural floor/ceiling elevation from its level datum and offset.
 * Objects without the discriminator keep the historical absolute-elevation behavior.
 */
export function resolveArchitectureSurfaceElevation(project: ProjectDocument, object: SmartObject | Data): number | undefined {
  const data = dataOf(object)
  const offset = Number(data.elevation_offset_mm ?? 0)
  const storedElevation = Number(data.elevation_mm ?? 0)
  if (!Number.isFinite(offset) || !Number.isFinite(storedElevation)) return undefined
  if (data.elevation_reference !== 'level' && data.elevation_reference !== 'absolute') {
    // Before the explicit reference mode existed, architectural surfaces stored a
    // world elevation in elevation_mm and then added elevation_offset_mm.
    return storedElevation + offset
  }
  if (data.elevation_reference === 'absolute') return storedElevation + offset
  const levelId = typeof data.level_id === 'string' ? data.level_id : undefined
  const level = levelId ? project.levels.find(item => item.id === levelId) : undefined
  if (levelId && !level) return undefined
  if (!level) return undefined
  return level.elevation_mm + offset
}
