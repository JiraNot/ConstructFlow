import type { DoorHanding, ProjectDocument } from '@constructflow/project-model'
import { isColumnObject, isFoundationObject } from '@constructflow/project-model'
import type { SnapResult, WallHostSnapResult } from '@constructflow/snapping-engine'

type Point = [number, number]
type PointPlacementTool = 'column' | 'foundation' | 'door' | 'window' | 'fixture'
type FixtureKind = 'light' | 'switch' | 'outlet' | 'panel'

interface CommitPlanCanvasPointPlacementOptions {
  activeTool: PointPlacementTool
  rawWorld: Point
  snap: SnapResult
  project: ProjectDocument
  planProject: ProjectDocument
  activeDoorTypeMark: string
  activeWindowTypeMark: string
  activeWallSnap: WallHostSnapResult | null
  doorHanding: DoorHanding
  fixtureKind: FixtureKind
  snapPlanWallHost: (point: Point, openingWidthMm: number) => WallHostSnapResult | null
  applyOpeningDistance: (wallSnap: WallHostSnapResult, rawPoint: Point, openingWidthMm: number) => WallHostSnapResult
  clearDimensionOverrides: () => void
  onCommitColumn: (point: Point) => void
  onCommitFoundation: (options: { columnId?: string; location_mm?: Point }) => void
  onCommitDoor: (wallId: string, point: Point, offsetMm: number, handing: DoorHanding) => void
  onCommitWindow: (wallId: string, point: Point, offsetMm: number) => void
  onCommitFixture?: (point: Point, kind: FixtureKind) => void
  onSelectionChange?: (ids: string[], primaryId: string | null) => void
  onSelectObject: (id: string | null) => void
}

export function commitPlanCanvasPointPlacement({
  activeTool,
  rawWorld,
  snap,
  project,
  planProject,
  activeDoorTypeMark,
  activeWindowTypeMark,
  activeWallSnap,
  doorHanding,
  fixtureKind,
  snapPlanWallHost,
  applyOpeningDistance,
  clearDimensionOverrides,
  onCommitColumn,
  onCommitFoundation,
  onCommitDoor,
  onCommitWindow,
  onCommitFixture,
  onSelectionChange,
  onSelectObject,
}: CommitPlanCanvasPointPlacementOptions) {
  if (activeTool === 'column') {
    onCommitColumn(snap.point_mm)
    clearDimensionOverrides()
    return
  }

  if (activeTool === 'foundation') {
    const column = Object.values(planProject.objects).find(object => {
      if (!isColumnObject(object)) return false
      const [cx, cy] = object.module_data.location_mm
      const [width, depth] = object.module_data.section_mm
      const tolerance = Math.max(width, depth, 400)
      return Math.abs(rawWorld[0] - cx) <= tolerance && Math.abs(rawWorld[1] - cy) <= tolerance
    })

    if (column) {
      const foundation = Object.values(planProject.objects).find(object =>
        isFoundationObject(object) && (object.module_data.supported_column_id === column.id || object.host_refs?.includes(column.id)))
      if (foundation) {
        onSelectionChange?.([foundation.id], foundation.id)
        onSelectObject(foundation.id)
      } else onCommitFoundation({ columnId: column.id })
    } else onCommitFoundation({ location_mm: snap.point_mm })
    clearDimensionOverrides()
    return
  }

  if (activeTool === 'door' || activeTool === 'window') {
    const isDoor = activeTool === 'door'
    const objectType = isDoor ? 'door_window.door' : 'door_window.window'
    const typeMark = isDoor ? activeDoorTypeMark : activeWindowTypeMark
    const defaultWidth = isDoor ? 800 : 1200
    const type = project.types?.find(candidate => candidate.object_type === objectType && candidate.name.toLowerCase() === typeMark.toLowerCase())
    const width = type?.parameters?.width_mm || defaultWidth
    const hostSnap = snapPlanWallHost(rawWorld, width) || activeWallSnap
    const wallSnap = hostSnap ? applyOpeningDistance(hostSnap, rawWorld, width) : null
    if (wallSnap) {
      if (isDoor) onCommitDoor(wallSnap.wall_id, wallSnap.point_mm, wallSnap.offset_along_wall_mm, doorHanding)
      else onCommitWindow(wallSnap.wall_id, wallSnap.point_mm, wallSnap.offset_along_wall_mm)
      clearDimensionOverrides()
    }
    return
  }

  onCommitFixture?.(snap.point_mm, fixtureKind)
  clearDimensionOverrides()
}
