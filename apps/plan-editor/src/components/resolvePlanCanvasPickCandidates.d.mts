import type { ProjectDocument } from '@constructflow/project-model'

type Point = [number, number]
type HitTest = (point: Point, preferWall?: boolean, excluded?: Set<string>) => string | null

export function resolvePlanCanvasPickCandidates(
  project: ProjectDocument,
  findHitObject: HitTest,
  point: Point,
  preferWall?: boolean,
): string[]
