import type { ProjectDocument } from '@constructflow/project-model'
import { isGridObject } from '@constructflow/project-model'
import type { DisplayLengthUnit, PlacementReference, StairModuleData } from '@constructflow/project-model'
import type { SnapResult, WallHostSnapResult } from '@constructflow/snapping-engine'
import type { ToolType } from './Toolbar.js'
import type { PlanCanvasProps } from './PlanCanvas.js'
import { isPolygonInteraction, isTwoPointInteraction } from '../app/toolInteractionRegistry.mjs'
import { gridLineEndpoints } from './PlanCanvasGeometry.js'
import { commitPlanCanvasLinePlacementPoint } from './commitPlanCanvasLinePlacementPoint.js'
import { commitPlanCanvasPointPlacement } from './commitPlanCanvasPointPlacement.js'
import { commitPlanCanvasConnectedPlacementPoint, commitPlanCanvasGridPoint, commitPlanCanvasGridSystemPoint } from './commitPlanCanvasPlacementPoints.js'
import { commitPlanCanvasPolygonPoint } from './commitPlanCanvasPolygonPoint.mjs'
import type { usePlanCanvasPlacementSession } from './usePlanCanvasPlacementSession.js'
import { stairFromRun } from '@constructflow/architecture-engine'

type Point = [number, number]
type PlacementSession = ReturnType<typeof usePlanCanvasPlacementSession>
type PlacementCallbacks = Pick<PlanCanvasProps,
  | 'onCopyGrid' | 'onCommitColumn' | 'onCommitFoundation' | 'onCommitDoor' | 'onCommitWindow' | 'onCommitFixture'
  | 'onSelectionChange' | 'onSelectObject' | 'onCommitBeam' | 'onCommitWall' | 'onCommitRoomSeparator'
  | 'onCommitPipeRoute' | 'onCommitCabinet' | 'onCommitMoulding' | 'onCommitSlab' | 'onCommitArchitecturalFloor'
  | 'onCommitCeiling' | 'onCommitRoof' | 'onCommitSurfaceVoid' | 'onCommitGrid' | 'onCommitGridSystem'
  | 'onStartCalibrationModal' | 'onCommitStair' | 'onActivateTool'
>

interface HandlePlanCanvasPlacementPointerDownOptions {
  event: React.PointerEvent<HTMLCanvasElement>
  activeTool: ToolType
  rawWorld: Point
  snap: SnapResult
  project: ProjectDocument
  planProject: ProjectDocument
  selectedId: string | null
  displayUnit: DisplayLengthUnit
  viewportZoom: number
  placement: PlacementSession
  settings: Pick<PlanCanvasProps,
    | 'activeBeamTypeMark' | 'activeWallTypeMark' | 'activeDoorTypeMark' | 'activeWindowTypeMark'
  > & { placementReference: PlacementReference; doorHanding: PlanCanvasProps['preferences']['doorHanding'] }
  callbacks: PlacementCallbacks
  operations: {
    snapPlanWallHost: (point: Point, openingWidthMm: number) => WallHostSnapResult | null
    applyOpeningDistance: (wallSnap: WallHostSnapResult, rawPoint: Point, openingWidthMm: number) => WallHostSnapResult
    resolveReferencePath: (start: Point, end: Point, widthMm: number) => [Point, Point]
  }
  interaction: {
    eraseActiveRef: React.MutableRefObject<boolean>
    erasedIdsRef: React.MutableRefObject<Set<string>>
    findCandidates: (point: Point, preferWall?: boolean) => string[]
  }
}

export function handlePlanCanvasPlacementPointerDown({
  event, activeTool, rawWorld, snap, project, planProject, selectedId, displayUnit, viewportZoom, placement, settings, callbacks,
  operations, interaction,
}: HandlePlanCanvasPlacementPointerDownOptions) {
  const { onCopyGrid, onCommitColumn, onCommitFoundation, onCommitDoor, onCommitWindow, onCommitFixture,
    onCommitBeam, onCommitWall, onCommitRoomSeparator, onCommitPipeRoute, onCommitCabinet, onCommitMoulding,
    onCommitSlab, onCommitArchitecturalFloor, onCommitCeiling, onCommitRoof, onCommitSurfaceVoid,
    onCommitGrid, onCommitGridSystem, onStartCalibrationModal, onCommitStair, onActivateTool } = callbacks
  const { activeBeamTypeMark, activeWallTypeMark, activeDoorTypeMark, activeWindowTypeMark, placementReference, doorHanding } = settings
  const { gridStartPoint, setGridStartPoint, stairStartPoint, setStairStartPoint, stairOptions, setStairError,
    gridSequenceStyle, gridCopySourceId, drawLengthMeters, setDrawLengthMeters, drawAngleDegrees, setDrawAngleDegrees,
    gridXIntervals, gridYIntervals, gridXFirstTag, gridYFirstTag, setGridSystemError, clearDimensionOverrides,
    beamStartNode, setBeamStartNode, wallStartNode, setWallStartNode, roomSeparatorStart, setRoomSeparatorStart,
    roofShape, roofSlopeDeg, roofThicknessMm, roofElevationOffsetMm, roofMaterial, pipeSystem, fixtureKind, slabBoundary,
    setSlabBoundary, calibrationP1, setCalibrationP1, setCalibrationMousePoint, tapeMeasure, setTapeMeasure,
    activeWallSnap } = placement

  if (activeTool === 'gridCopy' && gridCopySourceId) {
    const source = planProject.objects[gridCopySourceId]
    if (source && isGridObject(source)) {
      const [start, end] = gridLineEndpoints(source)
      onCopyGrid?.(source.id, snap.point_mm, [end[0] + snap.point_mm[0] - start[0], end[1] + snap.point_mm[1] - start[1]])
      clearDimensionOverrides()
    }
  } else if (activeTool === 'erase') {
    interaction.eraseActiveRef.current = true
    interaction.erasedIdsRef.current.clear()
    for (const id of interaction.findCandidates(rawWorld, true)) interaction.erasedIdsRef.current.add(id)
    event.currentTarget.setPointerCapture(event.pointerId)
  } else if (activeTool === 'column' || activeTool === 'foundation' || activeTool === 'door' || activeTool === 'window' || activeTool === 'fixture') {
    commitPlanCanvasPointPlacement({
      activeTool, rawWorld, snap, project, planProject, activeDoorTypeMark, activeWindowTypeMark, activeWallSnap,
      doorHanding, fixtureKind, snapPlanWallHost: operations.snapPlanWallHost, applyOpeningDistance: operations.applyOpeningDistance,
      clearDimensionOverrides, onCommitColumn, onCommitFoundation, onCommitDoor, onCommitWindow, onCommitFixture,
      onSelectionChange: callbacks.onSelectionChange, onSelectObject: callbacks.onSelectObject,
    })
  } else if (activeTool === 'beam' || activeTool === 'wall') {
    commitPlanCanvasLinePlacementPoint({
      activeTool, snap, planProject, project, activeBeamTypeMark, activeWallTypeMark, placementReference,
      beamStartNode, wallStartNode, setBeamStartNode, setWallStartNode, setDrawLengthMeters, setDrawAngleDegrees,
      resolveReferencePath: operations.resolveReferencePath, clearDimensionOverrides, onCommitBeam, onCommitWall,
    })
  } else if (isTwoPointInteraction(activeTool) && ['roomSeparator', 'pipe', 'cabinet', 'moulding'].includes(activeTool)) {
    commitPlanCanvasConnectedPlacementPoint({
      activeTool: activeTool as 'roomSeparator' | 'pipe' | 'cabinet' | 'moulding', point: snap.point_mm,
      startPoint: roomSeparatorStart, pipeSystem, onStartPointChange: setRoomSeparatorStart,
      onDrawLengthChange: setDrawLengthMeters, onDrawAngleChange: setDrawAngleDegrees, clearDimensionOverrides,
      onCommitRoomSeparator, onCommitPipeRoute, onCommitCabinet, onCommitMoulding,
    })
  } else if (isPolygonInteraction(activeTool)) {
    commitPlanCanvasPolygonPoint({
      activeTool, clickCount: event.detail, pointMm: snap.point_mm, zoom: viewportZoom,
      boundary: slabBoundary, selectedId, selectedObjectType: planProject.objects[selectedId ?? '']?.object_type,
      roofOptions: { shape: roofShape, slope_deg: roofSlopeDeg, thickness_mm: roofThicknessMm, elevation_offset_mm: roofElevationOffsetMm, material: roofMaterial },
      onCommitSlab, onCommitArchitecturalFloor, onCommitCeiling, onCommitRoof, onCommitSurfaceVoid,
      onBoundaryChange: setSlabBoundary, onDrawLengthChange: setDrawLengthMeters, onDrawAngleChange: setDrawAngleDegrees,
      clearDimensionOverrides,
    })
  } else if (activeTool === 'grid') {
    commitPlanCanvasGridPoint({
      point: snap.point_mm, startPoint: gridStartPoint, sequenceStyle: gridSequenceStyle,
      onStartPointChange: setGridStartPoint, onDrawLengthChange: setDrawLengthMeters, onDrawAngleChange: setDrawAngleDegrees,
      clearDimensionOverrides, onCommitGrid,
    })
  } else if (activeTool === 'gridSystem') {
    commitPlanCanvasGridSystemPoint({
      point: snap.point_mm, displayUnit, xIntervalsText: gridXIntervals, yIntervalsText: gridYIntervals,
      xFirstTag: gridXFirstTag, yFirstTag: gridYFirstTag, setError: setGridSystemError,
      onCommit: onCommitGridSystem, clearDimensionOverrides,
    })
  } else if (activeTool === 'measure') {
    if (!tapeMeasure || tapeMeasure.complete) setTapeMeasure({ start: snap.point_mm, end: snap.point_mm, complete: false })
    else setTapeMeasure({ ...tapeMeasure, end: snap.point_mm, complete: true })
  } else if (activeTool === 'calibrate') {
    if (!calibrationP1) setCalibrationP1(snap.point_mm)
    else {
      const distance = Math.hypot(snap.point_mm[0] - calibrationP1[0], snap.point_mm[1] - calibrationP1[1])
      if (distance >= 10 && onStartCalibrationModal) onStartCalibrationModal(distance, calibrationP1, snap.point_mm)
      setCalibrationP1(null)
      setCalibrationMousePoint(null)
    }
  } else if (activeTool === 'stair') {
    if (!stairStartPoint) { setStairStartPoint(snap.point_mm); setStairError('') }
    else try {
      const stair: StairModuleData = stairFromRun(project, stairStartPoint, snap.point_mm, stairOptions)
      if (onCommitStair?.(stair)) { setStairStartPoint(null); setStairError(''); onActivateTool?.('select') }
    } catch (error) { setStairError(error instanceof Error ? error.message : 'ไม่สามารถสร้างบันไดได้') }
    clearDimensionOverrides()
  }
}
