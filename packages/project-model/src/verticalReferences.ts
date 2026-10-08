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
  const baseLevel = getLevelElevation(project, baseLevelId) ?? (typeof data.start_point_mm === 'object' && Array.isArray(data.start_point_mm) ? Number(data.start_point_mm[2] ?? 0) : 0)
  const baseOffset = Number(data.base_offset_mm ?? 0)
  const topOffset = Number(data.top_offset_mm ?? 0)
  if (!Number.isFinite(baseOffset) || !Number.isFinite(topOffset)) return undefined
  const base = baseLevel + baseOffset
  const topLevel = getLevelElevation(project, data.top_level_id)
  const height = topLevel !== undefined
    ? topLevel + topOffset - base
    : Number(data.height_mm)
  if (!Number.isFinite(height) || height <= 0) return undefined
  const top = topLevel !== undefined ? topLevel + topOffset : base + height
  return { base_elevation_mm: base, top_elevation_mm: top, height_mm: height, base_offset_mm: baseOffset, top_offset_mm: topOffset }
}

/** Resolve a hosted opening's bottom and head from level datums or legacy sill/height values. */
export function resolveOpeningVerticalExtent(project: ProjectDocument, object: SmartObject | Data): VerticalExtent | undefined {
  const data = dataOf(object)
  const levelId = typeof data.level_id === 'string' ? data.level_id : undefined
  const levelElevation = getLevelElevation(project, levelId) ?? 0
  const bottomOffset = Number(data.base_offset_mm ?? data.sill_height_mm ?? 0)
  const headLevel = getLevelElevation(project, data.head_level_id)
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
  const levelElevation = getLevelElevation(project, data.level_id) ?? 0
  const offset = Number(data.elevation_offset_mm ?? 0)
  const legacyElevation = Number(data.elevation_mm ?? 0)
  if (!Number.isFinite(offset) || !Number.isFinite(legacyElevation)) return undefined
  // elevation_offset_mm is additive to the selected level; legacy slabs remain absolute.
  return data.elevation_offset_mm !== undefined ? levelElevation + offset : legacyElevation
}
