import type { ProjectDocument, StairModuleData } from '@constructflow/project-model'
import type { SnapResult, WallHostSnapResult } from '@constructflow/snapping-engine'
import type { PlacementGhost } from '../rendering/planRenderer.js'
import type { ToolType } from './Toolbar.js'
import { buildWallJunctionPreview } from './buildWallJunctionPreview.mjs'

interface BuildPlanPlacementGhostOptions {
  activeTool: ToolType
  activeSnap: SnapResult | null
  project: ProjectDocument
  planProject: ProjectDocument
  activeColumnTypeMark: string
  activeFoundationTypeMark: string
  activeBeamTypeMark: string
  activeWallTypeMark: string
  activeDoorTypeMark: string
  activeWindowTypeMark: string
  beamStartNode: { point_mm: [number, number] } | null
  wallStartNode: { point_mm: [number, number]; hostWallId?: string; hostWallIds?: string[] } | null
  activeWallSnap: WallHostSnapResult | null
  doorHanding: 'left_in' | 'right_in' | 'left_out' | 'right_out'
  stairPreview: StairModuleData | null
  stairStartPoint: [number, number] | null
  resolveReferencePath: (start: [number, number], end: [number, number], widthMm: number) => [[number, number], [number, number]]
}

export function buildPlanPlacementGhost({
  activeTool, activeSnap, project, planProject, activeColumnTypeMark, activeFoundationTypeMark, activeBeamTypeMark,
  activeWallTypeMark, activeDoorTypeMark, activeWindowTypeMark, beamStartNode, wallStartNode, activeWallSnap,
  doorHanding, stairPreview, stairStartPoint, resolveReferencePath,
}: BuildPlanPlacementGhostOptions): PlacementGhost | null {
  let ghost: PlacementGhost | null = null
  if (activeTool === 'column' && activeSnap) {
      const typeDef = project.types?.find(
        (t) => t.object_type === 'structure.column' && t.name.toLowerCase() === activeColumnTypeMark.toLowerCase()
      )
      ghost = {
        type: 'column',
        location_mm: activeSnap.point_mm,
        size_mm: typeDef?.parameters?.section_mm || [200, 200],
        mark: activeColumnTypeMark,
      }
    } else if (activeTool === 'foundation' && activeSnap) {
      const typeDef = project.types?.find(
        (t) => t.object_type === 'structure.foundation' && t.name.toLowerCase() === activeFoundationTypeMark.toLowerCase()
      )
      ghost = {
        type: 'foundation',
        location_mm: activeSnap.point_mm,
        size_mm: typeDef?.parameters?.size_mm || [800, 800, 300],
        mark: activeFoundationTypeMark,
      }
    } else if (activeTool === 'beam' && activeSnap && beamStartNode) {
      const typeDef = project.types?.find(
        (t) => t.object_type === 'structure.beam' && t.name.toLowerCase() === activeBeamTypeMark.toLowerCase()
      )
      const [alignedStart, alignedEnd] = resolveReferencePath(beamStartNode.point_mm, activeSnap.point_mm, typeDef?.parameters?.section_mm?.[0] || 200)
      ghost = {
        type: 'beam',
        location_mm: alignedStart,
        reference_start_mm: beamStartNode.point_mm,
        target_location_mm: alignedEnd,
        size_mm: typeDef?.parameters?.section_mm || [200, 400],
        mark: activeBeamTypeMark,
      }
    } else if (activeTool === 'wall' && activeSnap && wallStartNode) {
      const typeDef = project.types?.find(
        (t) => t.object_type === 'architecture.wall' && t.name.toLowerCase() === activeWallTypeMark.toLowerCase()
      )
      const [alignedStart, alignedEnd] = resolveReferencePath(wallStartNode.point_mm, activeSnap.point_mm, typeDef?.parameters?.thickness_mm || 100)
      ghost = {
        type: 'wall',
        location_mm: alignedStart,
        reference_start_mm: wallStartNode.point_mm,
        target_location_mm: alignedEnd,
        size_mm: [typeDef?.parameters?.thickness_mm || 100, 0],
        mark: activeWallTypeMark,
        wall_junction_preview: buildWallJunctionPreview(
          planProject, activeSnap, alignedStart, alignedEnd, typeDef?.parameters?.thickness_mm || 100, wallStartNode.hostWallIds ?? wallStartNode.hostWallId,
        ) ?? undefined,
      }
    } else if (activeTool === 'door' && activeWallSnap) {
      const typeDef = project.types?.find(
        (t) => t.object_type === 'door_window.door' && t.name.toLowerCase() === activeDoorTypeMark.toLowerCase()
      )
      ghost = {
        type: 'door',
        location_mm: activeWallSnap.point_mm,
        wall_id: activeWallSnap.wall_id,
        offset_along_wall_mm: activeWallSnap.offset_along_wall_mm,
        size_mm: [typeDef?.parameters?.width_mm || 800, typeDef?.parameters?.height_mm || 2000],
        mark: activeDoorTypeMark,
        handing: doorHanding,
        operation: typeDef?.parameters?.opening_operation,
        panel_count: typeDef?.parameters?.panel_count,
      }
    } else if (activeTool === 'window' && activeWallSnap) {
      const typeDef = project.types?.find(
        (t) => t.object_type === 'door_window.window' && t.name.toLowerCase() === activeWindowTypeMark.toLowerCase()
      )
      ghost = {
        type: 'window',
        location_mm: activeWallSnap.point_mm,
        wall_id: activeWallSnap.wall_id,
        offset_along_wall_mm: activeWallSnap.offset_along_wall_mm,
        size_mm: [typeDef?.parameters?.width_mm || 1200, typeDef?.parameters?.height_mm || 1200],
        mark: activeWindowTypeMark,
        operation: typeDef?.parameters?.opening_operation,
        panel_count: typeDef?.parameters?.panel_count,
        sill_height_mm: typeDef?.parameters?.sill_height_mm,
        glazing_material: typeDef?.parameters?.glazing_material,
      }
    } else if (activeTool === 'stair' && activeSnap) {
      if (stairPreview) ghost = { type: 'stair', location_mm: stairStartPoint!, stair: stairPreview }
    }
  return ghost
}
