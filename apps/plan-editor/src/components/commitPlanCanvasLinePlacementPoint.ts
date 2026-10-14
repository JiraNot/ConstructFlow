import type { Dispatch, SetStateAction } from 'react'
import type { PlacementReference, ProjectDocument } from '@constructflow/project-model'
import { isColumnObject } from '@constructflow/project-model'
import type { LinearReference, SnapResult } from '@constructflow/snapping-engine'
import { findNearestLinearReference } from '@constructflow/snapping-engine'
import { getSnappedWallId, getWallVerticalReference, type WallVerticalReference } from './PlanCanvasWallReferences.js'
import type { ToolType } from './Toolbar.js'

type Point = [number, number]

export interface BeamPlacementStart {
  point_mm: Point
  columnId?: string
  reference?: LinearReference
}

export interface WallPlacementStart {
  point_mm: Point
  reference?: LinearReference
  hostWallId?: string
}

interface CommitPlanCanvasLinePlacementPointOptions {
  activeTool: Extract<ToolType, 'beam' | 'wall'>
  snap: SnapResult
  planProject: ProjectDocument
  project: ProjectDocument
  activeBeamTypeMark: string
  activeWallTypeMark: string
  placementReference: PlacementReference
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
    const clickedColumn = Object.values(planProject.objects).find(object => {
      if (!isColumnObject(object)) return false
      const [cx, cy] = object.module_data.location_mm
      const [width, depth] = object.module_data.section_mm
      const tolerance = Math.max(width, depth, 400)
      return Math.abs(snap.point_mm[0] - cx) <= tolerance && Math.abs(snap.point_mm[1] - cy) <= tolerance
    })
    const columnId = clickedColumn?.id ?? (snap.kind === 'column_center' ? snap.target_id : undefined)

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
    const hostWallId = getSnappedWallId(snap, planProject)
    setWallStartNode({
      point_mm: snap.point_mm,
      // A host snap supplies junction and vertical-datum context; it must not
      // constrain the new wall to run parallel with its host.
      reference: hostWallId ? undefined : findNearestLinearReference(planProject, snap.point_mm) ?? undefined,
      hostWallId,
    })
    setDrawLengthMeters('')
    setDrawAngleDegrees('')
    clearDimensionOverrides()
    return
  }

  const distance = Math.hypot(snap.point_mm[0] - wallStartNode.point_mm[0], snap.point_mm[1] - wallStartNode.point_mm[1])
  if (distance >= 100) {
    const type = project.types?.find(candidate => candidate.object_type === 'architecture.wall' && candidate.name.toLowerCase() === activeWallTypeMark.toLowerCase())
    const [start, end] = resolveReferencePath(wallStartNode.point_mm, snap.point_mm, type?.parameters?.thickness_mm || 100)
    const endHostWallId = getSnappedWallId(snap, planProject)
    const verticalReference = getWallVerticalReference(planProject, wallStartNode.hostWallId ?? endHostWallId)
    onCommitWall(start, end, placementReference, verticalReference)
  }
  const nextHostWallId = getSnappedWallId(snap, planProject)
  setWallStartNode({
    point_mm: snap.point_mm,
    reference: nextHostWallId ? undefined : findNearestLinearReference(planProject, snap.point_mm) ?? undefined,
    hostWallId: nextHostWallId,
  })
  setDrawLengthMeters('')
  setDrawAngleDegrees('')
  clearDimensionOverrides()
}
