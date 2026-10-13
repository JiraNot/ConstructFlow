import { useMemo } from 'react'
import type { ProjectDocument } from '@constructflow/project-model'
import { SnapSpatialIndex, snapPoint, snapToWallHost, type SnapResult, type WallHostSnapResult } from '@constructflow/snapping-engine'
import type { ViewportState } from '../viewport/viewportTransform.js'
import type { PlanCanvasPreferences } from '../app/planCanvasPreferences.mjs'

type Point = [number, number]

interface UsePlanCanvasSnappingOptions {
  planProject: ProjectDocument
  viewport: ViewportState
  snapModes: PlanCanvasPreferences['snapModes']
}

export function usePlanCanvasSnapping({ planProject, viewport, snapModes }: UsePlanCanvasSnappingOptions) {
  const spatialIndex = useMemo(() => new SnapSpatialIndex(planProject), [planProject])
  const enabledModes = useMemo(() => new Set(snapModes), [snapModes])

  const snapPlanPoint = (point: Point, distancePx = 16, excludedObjectId?: string): SnapResult => {
    const radiusMm = distancePx / Math.max(viewport.zoom, 0.0001)
    const candidates = spatialIndex.candidateObjectIds(point, radiusMm)
    return snapPoint(point, planProject, viewport, distancePx, enabledModes, excludedObjectId, candidates)
  }

  const snapPlanWallHost = (point: Point, openingWidthMm: number): WallHostSnapResult | null => {
    const radiusMm = 36 / Math.max(viewport.zoom, 0.0001)
    const candidates = spatialIndex.candidateObjectIds(point, radiusMm)
    return snapToWallHost(point, planProject, viewport, openingWidthMm, 36, candidates)
  }

  return { snapPlanPoint, snapPlanWallHost }
}
