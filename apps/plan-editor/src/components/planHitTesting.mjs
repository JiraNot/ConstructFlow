import { getPlanPickCandidates } from '@constructflow/representation-engine'

/** Domain geometry and ranking are shared; canvas only orchestrates selection. */
export const findPlanHitCandidates = (point, planProject, project, zoom, preferWall = false, excluded = new Set()) =>
  getPlanPickCandidates(planProject, project, point, zoom, preferWall, excluded)

export const findPlanHitObject = (point, planProject, project, zoom, preferWall = false, excluded = new Set()) =>
  findPlanHitCandidates(point, planProject, project, zoom, preferWall, excluded)[0] ?? null
