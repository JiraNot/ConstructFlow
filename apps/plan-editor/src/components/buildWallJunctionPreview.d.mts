import type { ProjectDocument } from '@constructflow/project-model'
import type { SnapResult } from '@constructflow/snapping-engine'

type Point = [number, number]
type Segment = [Point, Point]

export interface WallJunctionPreview {
  point_mm: Point
  target_count: number
  target_marks: string[]
  segments_mm: Segment[]
}

export function buildWallJunctionPreview(
  project: ProjectDocument,
  snap: SnapResult | null,
  start: Point,
  end: Point,
  thicknessMm: number,
  startHostWallId?: string,
): WallJunctionPreview | null
