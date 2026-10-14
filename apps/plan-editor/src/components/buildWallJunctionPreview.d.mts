import type { ProjectDocument } from '@constructflow/project-model'
import type { SnapResult } from '@constructflow/snapping-engine'

export interface WallJunctionPreview {
  point_mm: [number, number]
  target_count: number
  target_marks: string[]
  segments_mm: Array<[[number, number], [number, number]]>
}

export function buildWallJunctionPreview(
  project: ProjectDocument,
  snap: SnapResult | null,
  start: [number, number],
  end: [number, number],
  thicknessMm: number,
  startHostWallIds?: string | string[],
): WallJunctionPreview | null
