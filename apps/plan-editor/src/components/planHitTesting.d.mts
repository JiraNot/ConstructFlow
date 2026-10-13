import type { ProjectDocument } from '@constructflow/project-model'
export function findPlanHitObject(
  worldPoint_mm: [number, number],
  planProject: ProjectDocument,
  project: ProjectDocument,
  zoom: number,
  preferWall?: boolean,
  excluded?: Set<string>,
): string | null
