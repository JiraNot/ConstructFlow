import type { Dispatch, SetStateAction } from 'react'
import type { PlacementReference, ProjectDocument } from '@constructflow/project-model'
import { isColumnObject } from '@constructflow/project-model'
import type { LinearReference, SnapResult } from '@constructflow/snapping-engine'
import { findNearestLinearReference } from '@constructflow/snapping-engine'
import { getSnappedWallId, getSnappedWallIds, getWallVerticalReference, type WallVerticalReference } from './PlanCanvasWallReferences.js'
import type { ToolType } from './Toolbar.js'

type Point = [number, number]

export interface BeamPlacementStart {
  point_mm: Point
  columnId?: string
  reference?: LinearReference
}

export interface WallPlacementStart {
  point_mm: Point
  chainStartPointMm: Point
  chainSegmentCount: number
  reference?: LinearReference
  hostWallId?: string
  hostWallIds?: string[]
}

export function wallPlacementStartFromSnap(snap: SnapResult, planProject: ProjectDocument): WallPlacementStart {
  const hostWallIds = getSnappedWallIds(snap, planProject)
  const hostWallId = hostWallIds[0]
  return {
    point_mm: snap.point_mm,
    chainStartPointMm: snap.point_mm,
    chainSegmentCount: 0,
    // A host snap supplies junction and vertical-datum context; it must not
    // constrain the new wall to run parallel with its host.
    reference: hostWallId ? undefined : findNearestLinearReference(planProject, snap.point_mm) ?? undefined,
    hostWallId,
    hostWallIds,
  }
}

interface CommitPlanCanvasLinePlacementPointOptions {
  activeTool: Extract<ToolType, 'beam' | 'wall'>
  snap: SnapResult
  planProject: ProjectDocument
  project: ProjectDocument
  activeBeamTypeMark: string
  activeWallTypeMark: string
  placementReference: PlacementReference
  closeLoopToleranceMm?: number
  beamStartNode: BeamPlacementStart | null
  wallStartNode: WallPlacementStart | null
  setBeamStartNode: Dispatch<SetStateAction<BeamPlacementStart | null>>
  setWallStartNode: Dispatch<SetStateAction<WallPlacementStart | null>>
  setDrawLengthMeters: Dispatch<SetStateAction<string>>
  setDrawAngleDegrees: Dispatch<SetStateAction<string>>
  resolveReferencePath: (start: Point, end: Point, widthMm: number) => [Point, Point]
  clearDimensionOverrides: () => void
  onCommitBeam: (start: Point, end: Point, startColumnId?: string, endColumnId?: string, placementReference?: PlacementReference) => void
  onCommitWall: (start: Point, end: Point, placementReference?: PlacementReference, verticalReference?: WallVerticalReference) => void
}

export function commitPlanCanvasLinePlacementPoint({
  activeTool,
  snap,
  planProject,
  project,
  activeBeamTypeMark,
  activeWallTypeMark,
  placementReference,
  closeLoopToleranceMm = 100,
  beamStartNode,
  wallStartNode,
  setBeamStartNode,
  setWallStartNode,
  setDrawLengthMeters,
  setDrawAngleDegrees,
  resolveReferencePath,
  clearDimensionOverrides,
  onCommitBeam,
  onCommitWall,
}: CommitPlanCanvasLinePlacementPointOptions) {
  if (activeTool === 'beam') {
    const support = snap.target_id ? planProject.objects[snap.target_id] : undefined
    const columnId = snap.kind === 'column_center' && support && isColumnObject(support) ? support.id : undefined

    if (!beamStartNode) {
      setBeamStartNode({ point_mm: snap.point_mm, columnId, reference: findNearestLinearReference(planProject, snap.point_mm) ?? undefined })
      setDrawLengthMeters('')
      setDrawAngleDegrees('')
      clearDimensionOverrides()
      return
    }

    const distance = Math.hypot(snap.point_mm[0] - beamStartNode.point_mm[0], snap.point_mm[1] - beamStartNode.point_mm[1])
    if (distance >= 100) {
      const type = project.types?.find(candidate => candidate.object_type === 'structure.beam' && candidate.name.toLowerCase() === activeBeamTypeMark.toLowerCase())
      const [start, end] = resolveReferencePath(beamStartNode.point_mm, snap.point_mm, type?.parameters?.section_mm?.[0] || 200)
      onCommitBeam(start, end, beamStartNode.columnId, columnId, placementReference)
    }
    setBeamStartNode({ point_mm: snap.point_mm, columnId, reference: findNearestLinearReference(planProject, snap.point_mm) ?? undefined })
    setDrawLengthMeters('')
    setDrawAngleDegrees('')
    clearDimensionOverrides()
    return
  }

  if (!wallStartNode) {
    setWallStartNode(wallPlacementStartFromSnap(snap, planProject))
    setDrawLengthMeters('')
    setDrawAngleDegrees('')
    clearDimensionOverrides()
    return
  }

  const closesWallChain = wallStartNode.chainSegmentCount >= 2
    && Math.hypot(snap.point_mm[0] - wallStartNode.chainStartPointMm[0], snap.point_mm[1] - wallStartNode.chainStartPointMm[1]) <= closeLoopToleranceMm
  const endPoint = closesWallChain ? wallStartNode.chainStartPointMm : snap.point_mm
  const distance = Math.hypot(endPoint[0] - wallStartNode.point_mm[0], endPoint[1] - wallStartNode.point_mm[1])
  if (distance >= 100) {
    const type = project.types?.find(candidate => candidate.object_type === 'architecture.wall' && candidate.name.toLowerCase() === activeWallTypeMark.toLowerCase())
    const [start, end] = resolveReferencePath(wallStartNode.point_mm, endPoint, type?.parameters?.thickness_mm || 100)
    const endHostWallId = closesWallChain ? undefined : getSnappedWallId(snap, planProject)
    const verticalReference = getWallVerticalReference(planProject, wallStartNode.hostWallId ?? endHostWallId)
    onCommitWall(start, end, placementReference, verticalReference)
  }
  if (closesWallChain) {
    setWallStartNode(null)
    setDrawLengthMeters('')
    setDrawAngleDegrees('')
    clearDimensionOverrides()
    return
  }
  const nextHostWallId = getSnappedWallId(snap, planProject)
  const committedSegmentCount = wallStartNode.chainSegmentCount + (distance >= 100 ? 1 : 0)
  setWallStartNode({
    point_mm: snap.point_mm,
    chainStartPointMm: wallStartNode.chainStartPointMm,
    chainSegmentCount: committedSegmentCount,
    reference: nextHostWallId ? undefined : findNearestLinearReference(planProject, snap.point_mm) ?? undefined,
    hostWallId: nextHostWallId,
    hostWallIds: getSnappedWallIds(snap, planProject),
  })
  setDrawLengthMeters('')
  setDrawAngleDegrees('')
  clearDimensionOverrides()
}
