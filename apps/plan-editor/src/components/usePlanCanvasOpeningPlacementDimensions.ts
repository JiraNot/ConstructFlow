import { useEffect } from 'react'
import { projectPointToWallOffsetMm } from '@constructflow/architecture-engine'
import { parseLengthMm, type DisplayLengthUnit, type ProjectDocument } from '@constructflow/project-model'
import type { SnapResult, WallHostSnapResult } from '@constructflow/snapping-engine'
import { usesPlacementDimensions } from '../app/toolInteractionRegistry.mjs'
import { applyPlanCanvasPlacementDimensions } from './planCanvasPlacementConstraints.mjs'
import { findTemporaryDimensionRefs, openingDimensionRefs } from './PlanCanvasGeometry.js'
import type { ToolType } from './Toolbar.js'

type Point = [number, number]

interface UsePlanCanvasOpeningPlacementDimensionsOptions {
  project: ProjectDocument
  planProject: ProjectDocument
  activeTool: ToolType
  activeDoorTypeMark: string
  activeWindowTypeMark: string
  activeSnap: SnapResult | null
  setActiveSnap: (snap: SnapResult | null) => void
  activeWallSnap: WallHostSnapResult | null
  setActiveWallSnap: (snap: WallHostSnapResult | null) => void
  dimensionReferenceMode: 'center' | 'edge'
  dimensionInputX: string
  dimensionInputY: string
  dimensionAnchorX: number | null
  dimensionAnchorY: number | null
  displayUnit: DisplayLengthUnit
  applyPlacementDimensions: (point: Point, refs: { refX?: number; refY?: number }, rawPoint?: Point) => Point
}

export function usePlanCanvasOpeningPlacementDimensions({
  project,
  planProject,
  activeTool,
  activeDoorTypeMark,
  activeWindowTypeMark,
  activeSnap,
  setActiveSnap,
  activeWallSnap,
  setActiveWallSnap,
  dimensionReferenceMode,
  dimensionInputX,
  dimensionInputY,
  dimensionAnchorX,
  dimensionAnchorY,
  displayUnit,
  applyPlacementDimensions,
}: UsePlanCanvasOpeningPlacementDimensionsOptions) {
  const applyOpeningDistance = (wallSnap: WallHostSnapResult, rawPoint: Point, openingWidthMm: number): WallHostSnapResult => {
    const refs = openingDimensionRefs(wallSnap.point_mm, planProject, wallSnap, dimensionReferenceMode)
    const point: Point = [...wallSnap.point_mm]
    const valueText = refs.axis === 'x' ? dimensionInputX : dimensionInputY
    const anchor = refs.axis === 'x' ? dimensionAnchorX ?? refs.refX : dimensionAnchorY ?? refs.refY
    const value = parseLengthMm(valueText, displayUnit)
    if (valueText.trim() && anchor !== undefined && value !== null && value >= 0) {
      const rawCoordinate = refs.axis === 'x' ? rawPoint[0] : rawPoint[1]
      const direction = rawCoordinate < anchor ? -1 : 1
      const center = anchor + direction * (value + openingWidthMm / 2)
      if (refs.axis === 'x') point[0] = Math.round(center)
      else point[1] = Math.round(center)
    }
    const offset = projectPointToWallOffsetMm(point, wallSnap.wall_start_mm, wallSnap.wall_end_mm, openingWidthMm)
    if (offset === undefined) return wallSnap
    const dx = wallSnap.wall_end_mm[0] - wallSnap.wall_start_mm[0]
    const dy = wallSnap.wall_end_mm[1] - wallSnap.wall_start_mm[1]
    const length = Math.hypot(dx, dy)
    const adjustedPoint: Point = [
      Math.round(wallSnap.wall_start_mm[0] + dx / length * offset),
      Math.round(wallSnap.wall_start_mm[1] + dy / length * offset),
    ]
    const axis = refs.axis
    return {
      ...wallSnap,
      point_mm: adjustedPoint,
      offset_along_wall_mm: Math.round(offset),
      description: `${wallSnap.description}${point[axis === 'x' ? 0 : 1] !== wallSnap.point_mm[axis === 'x' ? 0 : 1] ? ' · ระยะกำหนดเอง' : ''}`,
    }
  }

  useEffect(() => {
    if (!activeSnap || !usesPlacementDimensions(activeTool)) return
    if ((activeTool === 'door' || activeTool === 'window') && activeWallSnap) {
      const typeId = activeTool === 'door' ? 'door_window.door' : 'door_window.window'
      const mark = activeTool === 'door' ? activeDoorTypeMark : activeWindowTypeMark
      const type = project.types.find(candidate => candidate.object_type === typeId && candidate.name.toLowerCase() === mark.toLowerCase())
      const width = Number(type?.parameters?.width_mm ?? (activeTool === 'door' ? 800 : 1200))
      const adjusted = applyOpeningDistance(activeWallSnap, activeSnap.point_mm, width)
      setActiveWallSnap(adjusted)
      setActiveSnap({ ...activeSnap, point_mm: adjusted.point_mm, description: adjusted.description })
    } else {
      const point = applyPlacementDimensions(
        activeSnap.point_mm,
        findTemporaryDimensionRefs(activeSnap.point_mm, planProject, undefined, dimensionReferenceMode),
        activeSnap.point_mm,
      )
      if (point[0] !== activeSnap.point_mm[0] || point[1] !== activeSnap.point_mm[1]) {
        setActiveSnap({ ...activeSnap, point_mm: point, kind: 'free', target_id: undefined, description: `${activeSnap.description} · ระยะกำหนดเอง` })
      }
    }
  }, [dimensionInputX, dimensionInputY, dimensionAnchorX, dimensionAnchorY, dimensionReferenceMode, activeTool])

  return { applyOpeningDistance }
}
