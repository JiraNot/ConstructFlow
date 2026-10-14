import { ProjectDocument, isWallObject } from '@constructflow/project-model'
import { SnapResult } from '@constructflow/snapping-engine'

export interface WallVerticalReference {
  level_id: string
  top_level_id?: string
  height_mm?: number
  base_offset_mm?: number
  top_offset_mm?: number
}

export function getSnappedWallId(snap: SnapResult | undefined, project: ProjectDocument): string | undefined {
  if (!snap?.target_id) return undefined
  const ids = snap.kind === 'intersection' ? snap.target_id.split(':') : [snap.target_id]
  return ids.find(id => {
    const object = project.objects[id]
    return object ? isWallObject(object) : false
  })
}

export function getWallVerticalReference(project: ProjectDocument, wallId?: string): WallVerticalReference | undefined {
  if (!wallId) return undefined
  const wall = project.objects[wallId]
  if (!wall || !isWallObject(wall)) return undefined
  const data = wall.module_data
  return {
    level_id: data.level_id,
    ...(data.top_level_id ? { top_level_id: data.top_level_id } : {}),
    ...(!data.top_level_id && Number.isFinite(data.height_mm) ? { height_mm: data.height_mm } : {}),
    base_offset_mm: data.base_offset_mm ?? 0,
    top_offset_mm: data.top_offset_mm ?? 0,
  }
}
