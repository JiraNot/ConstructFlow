import type { ProjectDocument } from '@constructflow/project-model'
import { isGridObject } from '@constructflow/project-model'
import type { DisplayLengthUnit, PlacementReference, StairModuleData } from '@constructflow/project-model'
import type { SnapResult, WallHostSnapResult } from '@constructflow/snapping-engine'
import type { ToolType } from './Toolbar.js'
import type { PlanCanvasProps } from './PlanCanvas.types.js'
import { isPolygonInteraction, isTwoPointInteraction } from '../app/toolInteractionRegistry.mjs'
import { gridLineEndpoints } from './PlanCanvasGeometry.js'
import { commitPlanCanvasLinePlacementPoint } from './commitPlanCanvasLinePlacementPoint.js'
import { commitPlanCanvasPointPlacement } from './commitPlanCanvasPointPlacement.js'
import { commitPlanCanvasConnectedPlacementPoint, commitPlanCanvasGridPoint, commitPlanCanvasGridSystemPoint } from './commitPlanCanvasPlacementPoints.js'
import { commitPlanCanvasPolygonPoint } from './commitPlanCanvasPolygonPoint.mjs'
import type { usePlanCanvasPlacementSession } from './usePlanCanvasPlacementSession.js'
import { stairFromRun } from '@constructflow/architecture-engine'
import { alignedDimensionOffset } from '@constructflow/geometry-kernel'
import { pointInPolygon2D } from '@constructflow/geometry-kernel'
import type { SupplierProductBundlePlacement, SupplierBundlePlacementGeometry } from '../supplierBundlePlacement.js'

type Point = [number, number]
type PlacementSession = ReturnType<typeof usePlanCanvasPlacementSession>
type PlacementCallbacks = Pick<PlanCanvasProps,
  | 'onCopyGrid' | 'onCommitColumn' | 'onCommitFoundation' | 'onCommitDoor' | 'onCommitWindow' | 'onCommitFixture'
  | 'onSelectionChange' | 'onSelectObject' | 'onCommitBeam' | 'onCommitWall' | 'onCommitRoomSeparator'
  | 'onCommitPipeRoute' | 'onCommitCabinet' | 'onCommitFurniture' | 'onCommitFamilyFurniture' | 'onCommitMoulding' | 'onCommitSlab' | 'onCommitArchitecturalFloor'
  | 'onCommitCeiling' | 'onCommitRoof' | 'onCommitSurfaceVoid' | 'onCommitGrid' | 'onCommitGridSystem'
  | 'onStartCalibrationModal' | 'onCommitStair' | 'onActivateTool' | 'onCommitManipulation' | 'onManipulationRejected'
  | 'onCommitSupplierBundle'
>

interface HandlePlanCanvasPlacementPointerDownOptions {
  event: React.PointerEvent<HTMLCanvasElement>
  activeTool: ToolType
  activeFamilyId?: string
  rawWorld: Point
  snap: SnapResult
  project: ProjectDocument
  planProject: ProjectDocument
  supplierBundlePlacement?: SupplierProductBundlePlacement | null
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
  event, activeTool, activeFamilyId, rawWorld, snap, project, planProject, supplierBundlePlacement, selectedId, displayUnit, viewportZoom, placement, settings, callbacks,
  operations, interaction,
}: HandlePlanCanvasPlacementPointerDownOptions) {
  const { onCopyGrid, onCommitColumn, onCommitFoundation, onCommitDoor, onCommitWindow, onCommitFixture,
    onCommitBeam, onCommitWall, onCommitRoomSeparator, onCommitPipeRoute, onCommitCabinet, onCommitFurniture, onCommitFamilyFurniture, onCommitMoulding,
    onCommitSlab, onCommitArchitecturalFloor, onCommitCeiling, onCommitRoof, onCommitSurfaceVoid, onCommitSupplierBundle,
    onCommitGrid, onCommitGridSystem, onStartCalibrationModal, onCommitStair, onActivateTool } = callbacks
  const { activeBeamTypeMark, activeWallTypeMark, activeDoorTypeMark, activeWindowTypeMark, placementReference, doorHanding } = settings
  const { gridStartPoint, setGridStartPoint, stairStartPoint, setStairStartPoint, stairOptions, setStairError,
    gridSequenceStyle, gridCopySourceId, drawLengthMeters, setDrawLengthMeters, drawAngleDegrees, setDrawAngleDegrees,
    gridXIntervals, gridYIntervals, gridXFirstTag, gridYFirstTag, setGridSystemError, clearDimensionOverrides,
    beamStartNode, setBeamStartNode, wallStartNode, setWallStartNode, roomSeparatorStart, setRoomSeparatorStart,
    roofShape, roofSlopeDeg, roofThicknessMm, roofElevationOffsetMm, roofMaterial, pipeSystem, fixtureKind, slabBoundary, fillStyle,
    setSlabBoundary, calibrationP1, setCalibrationP1, setCalibrationMousePoint, tapeMeasure, setTapeMeasure,
    activeWallSnap, furnitureKind, bundleStartPoint, setBundleStartPoint } = placement

  if (activeTool === 'bundle' && supplierBundlePlacement && onCommitSupplierBundle) {
    const visualType = supplierBundlePlacement.bundle.visual_type ?? 'shape'
    const geometry: SupplierBundlePlacementGeometry = {}
    if (visualType === 'shape') {
      onCommitSupplierBundle({ location_mm: snap.point_mm })
      clearDimensionOverrides()
    } else if (visualType === 'length') {
      if (!bundleStartPoint) setBundleStartPoint(snap.point_mm)
      else {
        if (Math.hypot(snap.point_mm[0] - bundleStartPoint[0], snap.point_mm[1] - bundleStartPoint[1]) >= 10) {
          geometry.path_mm = [bundleStartPoint, snap.point_mm]
          onCommitSupplierBundle(geometry)
        }
        setBundleStartPoint(null)
        clearDimensionOverrides()
      }
    } else {
      const boundary = slabBoundary
      const closesBoundary = boundary.length >= 3 && Math.hypot(snap.point_mm[0] - boundary[0]![0], snap.point_mm[1] - boundary[0]![1]) <= Math.max(80, 12 / Math.max(0.05, viewportZoom))
      if (closesBoundary || (event.detail >= 2 && boundary.length >= 2)) {
        const completed = closesBoundary ? boundary : [...boundary, snap.point_mm]
        if (completed.length >= 3) onCommitSupplierBundle({ boundary_mm: completed })
        setSlabBoundary([])
        clearDimensionOverrides()
      } else setSlabBoundary([...boundary, snap.point_mm])
    }
    return
  }

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
      resolveReferencePath: operations.resolveReferencePath,
      closeLoopToleranceMm: Math.max(100, 12 / Math.max(0.05, viewportZoom)),
      clearDimensionOverrides, onCommitBeam, onCommitWall,
    })
  } else if (activeTool === 'furniture' && activeFamilyId && callbacks.onCommitFamilyFurniture) {
    callbacks.onCommitFamilyFurniture(snap.point_mm)
  } else if (isTwoPointInteraction(activeTool) && ['roomSeparator', 'pipe', 'cabinet', 'furniture', 'moulding'].includes(activeTool)) {
    commitPlanCanvasConnectedPlacementPoint({
      activeTool: activeTool as 'roomSeparator' | 'pipe' | 'cabinet' | 'furniture' | 'moulding', point: snap.point_mm,
      startPoint: roomSeparatorStart, pipeSystem, furnitureKind, onStartPointChange: setRoomSeparatorStart,
      onDrawLengthChange: setDrawLengthMeters, onDrawAngleChange: setDrawAngleDegrees, clearDimensionOverrides,
      onCommitRoomSeparator, onCommitPipeRoute, onCommitCabinet, onCommitFurniture, onCommitMoulding,
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
  } else if (activeTool === 'dimension') {
    const points = placement.dimensionPoints
    if (points.length === 0) placement.setDimensionPoints([snap.point_mm])
    else if (points.length === 1) {
      if (Math.hypot(snap.point_mm[0] - points[0][0], snap.point_mm[1] - points[0][1]) >= 1) placement.setDimensionPoints([...points, snap.point_mm])
    } else {
      const result = callbacks.onCommitManipulation([{ name: 'SavePlanDimension', input: { dimension: {
        id: crypto.randomUUID(), level_id: project.project.active_level_id, created_phase: project.project.active_phase,
        start_mm: points[0], end_mm: points[1], offset_mm: alignedDimensionOffset(points[0], points[1], snap.point_mm),
      } } }])
      if (result.status === 'success') placement.setDimensionPoints([])
      else callbacks.onManipulationRejected?.(result.errors ?? ['บันทึกเส้นบอกระยะไม่สำเร็จ'])
    }
  } else if (activeTool === 'measure' || activeTool === 'fill') {
    const { measureMode, measurePoints, measureComplete, setMeasurePoints, setMeasureComplete, setMeasureError } = placement
    setMeasureError('')
    if (measureMode === 'distance') {
      if (!tapeMeasure || tapeMeasure.complete) setTapeMeasure({ start: snap.point_mm, end: snap.point_mm, complete: false })
      else setTapeMeasure({ ...tapeMeasure, end: snap.point_mm, complete: true })
    } else if (measureMode === 'area-pick' || measureMode === 'fill-pick') {
      const region = Object.values(planProject.objects).reverse().find(object => {
        if (!/^(structure\.slab|architecture\.(room|floor|arch_floor|ceiling)|roof\.system)$/.test(object.object_type)) return false
        const data = object.module_data as Record<string, unknown>
        const boundary = data.boundary_mm
        return Array.isArray(boundary) && pointInPolygon2D(snap.point_mm, boundary as Point[])
      })
      const boundary = (region?.module_data as unknown as Record<string, unknown> | undefined)?.boundary_mm
      if (Array.isArray(boundary)) {
        setMeasurePoints(boundary as Point[])
        setMeasureComplete(true)
        if (measureMode === 'fill-pick') {
          const result = callbacks.onCommitManipulation([{ name: 'SavePlanFill', input: { fill: {
            id: crypto.randomUUID(), level_id: project.project.active_level_id,
            created_phase: project.project.active_phase, boundary_mm: boundary as Point[], style: fillStyle,
          } } }])
          if (result.status !== 'success') setMeasureError(result.errors?.[0] ?? 'บันทึก Fill ไม่สำเร็จ')
        }
      } else {
        setMeasurePoints([])
        setMeasureComplete(false)
        setMeasureError('ไม่พบพื้นหรือพื้นที่ปิดตรงจุดนี้ · เลือก Area – Select Boundary เพื่อวาดขอบเขตเอง')
      }
    } else if (measureMode === 'angle') {
      if (measureComplete || measurePoints.length >= 3) {
        setMeasurePoints([snap.point_mm])
        setMeasureComplete(false)
      } else {
        const next = [...measurePoints, snap.point_mm]
        setMeasurePoints(next)
        if (next.length === 3) setMeasureComplete(true)
      }
    } else if (measureMode === 'rectangle') {
      if (measureComplete || measurePoints.length >= 2) {
        setMeasurePoints([snap.point_mm])
        setMeasureComplete(false)
      } else {
        const next = [...measurePoints, snap.point_mm]
        setMeasurePoints(next)
        if (next.length === 2) setMeasureComplete(true)
      }
    } else if (measureComplete) {
      setMeasurePoints([snap.point_mm])
      setMeasureComplete(false)
    } else {
      const first = measurePoints[0]
      if (measurePoints.length >= 3 && first && Math.hypot(snap.point_mm[0] - first[0], snap.point_mm[1] - first[1]) <= 180) {
        setMeasureComplete(true)
        if (measureMode === 'fill-boundary') {
          const result = callbacks.onCommitManipulation([{ name: 'SavePlanFill', input: { fill: {
            id: crypto.randomUUID(), level_id: project.project.active_level_id,
            created_phase: project.project.active_phase, boundary_mm: measurePoints, style: fillStyle,
          } } }])
          if (result.status !== 'success') setMeasureError(result.errors?.[0] ?? 'บันทึก Fill ไม่สำเร็จ')
        }
      }
      else setMeasurePoints([...measurePoints, snap.point_mm])
    }
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
