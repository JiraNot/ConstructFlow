import { useEffect, type RefObject } from 'react'
import type { DisplayLengthUnit, ProjectDocument } from '@constructflow/project-model'
import type { SnapResult, WallHostSnapResult } from '@constructflow/snapping-engine'
import { resolvePlanCanvasPointerSnap } from './resolvePlanCanvasPointerSnap.js'
import type { PlanCanvasPreferences } from '../app/planCanvasPreferences.mjs'
import type { ViewportState } from '../viewport/viewportTransform.js'
import type { PlanCanvasProps } from './PlanCanvas.types.js'
import { usePlanCanvasPointerHandlers } from './usePlanCanvasPointerHandlers.js'
import { commitPlanCanvasLinePlacementPoint } from './commitPlanCanvasLinePlacementPoint.js'
import type { WallTouchDrawGesture } from './planCanvasInteractionTypes.js'
import type { usePlanCanvasPlacementSession } from './usePlanCanvasPlacementSession.js'
import type { usePlanCanvasPointerState } from './usePlanCanvasPointerState.js'
import type { usePlanCanvasPicking } from './usePlanCanvasPicking.js'
import type { usePlanCanvasDragDimensions } from './usePlanCanvasDragDimensions.js'
import type { usePlanCanvasManipulationInteractions } from './usePlanCanvasManipulationInteractions.js'
import type { PlanCanvasDraggingObject } from './planCanvasInteractionTypes.js'
import type { ToolType } from './Toolbar.js'
import type { usePlanCanvasViewport } from './usePlanCanvasViewport.js'
import type { usePlanCanvasSnapping } from './usePlanCanvasSnapping.js'
import { getWallVerticalReference } from './PlanCanvasWallReferences.js'
import type { WallDrawMode } from './planCanvasInteractionTypes.js'
import type { PlanSketchMode } from './planCanvasInteractionTypes.js'
import { buildWallPathSegments, buildWallTemplatePath, updateTouchWallPath } from './wallDrawGeometry.js'

type CanvasCallbacks = Pick<PlanCanvasProps,
  | 'onCopyGrid' | 'onCommitColumn' | 'onCommitFoundation' | 'onCommitDoor' | 'onCommitWindow' | 'onCommitWallPath'
  | 'onCommitFixture' | 'onSelectionChange' | 'onSelectObject' | 'onCommitBeam' | 'onCommitWall'
  | 'onCommitRoomSeparator' | 'onCommitPipeRoute' | 'onCommitCabinet' | 'onCommitFurniture' | 'onCommitFamilyFurniture' | 'onCommitMoulding'
  | 'onCommitSlab' | 'onCommitArchitecturalFloor' | 'onCommitCeiling' | 'onCommitRoof'
  | 'onCommitSurfaceVoid' | 'onCommitGrid' | 'onCommitGridSystem' | 'onStartCalibrationModal'
  | 'onCommitStair' | 'onActivateTool' | 'onDeleteObjects' | 'onPreviewManipulation'
  | 'onCommitManipulation' | 'onManipulationRejected' | 'onCursorChange'
  | 'onCommitSupplierBundle'
>

interface UsePlanCanvasPointerInteractionsOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>
  activeTool: ToolType
  selectionScope?: ToolType | null
  activeFamilyId?: string
  viewport: ViewportState
  setViewport: ReturnType<typeof usePlanCanvasViewport>['setViewport']
  project: ProjectDocument
  planProject: ProjectDocument
  supplierBundlePlacement?: PlanCanvasProps['supplierBundlePlacement']
  selectedId: string | null
  selectedIds: string[]
  displayUnit: DisplayLengthUnit
  realtimeDimensions: boolean
  activeBeamTypeMark: string
  activeWallTypeMark: string
  activeDoorTypeMark: string
  activeWindowTypeMark: string
  placementReference: PlanCanvasProps['preferences']['placementReference']
  doorHanding: PlanCanvasProps['preferences']['doorHanding']
  lineDrawingMode: PlanCanvasProps['preferences']['lineDrawingMode']
  wallAngleSnapDeg: PlanCanvasProps['preferences']['wallAngleSnapDeg']
  draggingObject: PlanCanvasDraggingObject | null
  gridCopySourceId: string | null
  hoveredId: string | null
  pointerState: ReturnType<typeof usePlanCanvasPointerState>
  placement: ReturnType<typeof usePlanCanvasPlacementSession>
  picking: ReturnType<typeof usePlanCanvasPicking>
  dragDimensions: ReturnType<typeof usePlanCanvasDragDimensions>
  manipulation: Pick<ReturnType<typeof usePlanCanvasManipulationInteractions>, 'previewDragAt' | 'lastPreviewValidationRef' | 'buildDragCommands' | 'cancelPendingPreview'>
  resizeDimensionWidth: (value: string) => void
  resizeDimensionHeight: (value: string) => void
  resizeDimensionLength: (value: string) => void
  dimensionReferenceMode: PlanCanvasPreferences['dimensionReferenceMode']
  snapPlanPoint: ReturnType<typeof usePlanCanvasSnapping>['snapPlanPoint']
  resolveLineSnap: (snap: SnapResult, pointerPoint: [number, number], start: [number, number], lockAxis: boolean, reference?: import('@constructflow/snapping-engine').LinearReference) => SnapResult
  applyPlacementDimensions: (point: [number, number], refs: { refX?: number; refY?: number }, rawPoint?: [number, number]) => [number, number]
  constrainGridCopyToParallelOffset: (point: [number, number], source: Parameters<typeof import('./PlanCanvasGeometry.js').gridLineEndpoints>[0]) => [number, number]
  snapPlanWallHost: ReturnType<typeof usePlanCanvasSnapping>['snapPlanWallHost']
  applyOpeningDistance: (wallSnap: WallHostSnapResult, rawPoint: [number, number], widthMm: number) => WallHostSnapResult
  resolveReferencePath: (start: [number, number], end: [number, number], widthMm: number) => [[number, number], [number, number]]
  findEditHandle: (screenPoint: [number, number]) => ReturnType<typeof import('./PlanCanvasEditHandles.js').findPlanCanvasEditHandle>
  callbacks: CanvasCallbacks
}

/** Builds the navigation, authoring, selection, and commit contexts for canvas pointer events. */
export function usePlanCanvasPointerInteractions({
  canvasRef, activeTool, selectionScope, activeFamilyId, viewport, setViewport, project, planProject, supplierBundlePlacement, selectedId, selectedIds, displayUnit, realtimeDimensions,
  activeBeamTypeMark, activeWallTypeMark, activeDoorTypeMark, activeWindowTypeMark,
  placementReference, doorHanding, lineDrawingMode, wallAngleSnapDeg, draggingObject, gridCopySourceId, hoveredId,
  pointerState, placement, picking, dragDimensions, manipulation,
  resizeDimensionWidth, resizeDimensionHeight, resizeDimensionLength,
  dimensionReferenceMode, snapPlanPoint, resolveLineSnap, applyPlacementDimensions,
  constrainGridCopyToParallelOffset, snapPlanWallHost, applyOpeningDistance, resolveReferencePath,
  findEditHandle, callbacks,
}: UsePlanCanvasPointerInteractionsOptions) {
  const activeWallAngleSnapDeg = lineDrawingMode === 'orthogonal' ? 90 : wallAngleSnapDeg
  const {
    isPanning, setIsPanning, setObjectContextMenu, setSelectionBox,
    manipulationPreview, setManipulationPreview, dragPreviewPoint, setDragPreviewPoint,
    setDraggingObject, setDimensionEdit, panStartRef, selectionStartRef, pointerPositionsRef, touchSelectionSnapshotRef, pinchRef,
    pinchActiveRef, longPressTimerRef, longPressStartRef, eraseActiveRef, erasedIdsRef,
    selectionAdditiveRef,
    setWallTouchPreview,
    wallDrawMode,
  } = pointerState
  const onCommitSketch = (points: [number, number][], mode: PlanSketchMode, closed = false) => {
    if (points.length < 2) return
    const result = callbacks.onCommitManipulation([{ name: 'SavePlanSketch', input: { sketch: {
      id: crypto.randomUUID(), level_id: planProject.project.active_level_id, created_phase: planProject.project.active_phase,
      points_mm: points, mode, closed, color: '#334155', width_mm: 2, line_style: 'solid',
    } } }])
    if (result.status !== 'success') callbacks.onManipulationRejected?.(result.errors ?? ['บันทึกเส้นร่างไม่สำเร็จ'])
  }
  const { setHoveredId, setCandidates, findHitObject, findCandidates } = picking
  const resolvePointerSnap = (rawWorld: [number, number], ctrlKey: boolean, shiftKey: boolean, ignoreWallStartNode = false) => resolvePlanCanvasPointerSnap({
    activeTool, rawWorld, ctrlKey, shiftKey, project, planProject,
    activeDoorTypeMark, activeWindowTypeMark, draggingObjectId: draggingObject?.id, gridCopySourceId,
    dimensionReferenceMode,
    lineState: {
      dimensionPoints: placement.dimensionPoints,
      tapeMeasure: placement.tapeMeasure,
      beamStartNode: placement.beamStartNode,
      wallStartNode: pointerState.wallTouchGestureRef.current || ignoreWallStartNode ? null : placement.wallStartNode,
      stairStartPoint: placement.stairStartPoint,
      gridStartPoint: placement.gridStartPoint,
      roomSeparatorStart: placement.roomSeparatorStart,
      bundleStartPoint: placement.bundleStartPoint,
      slabBoundary: placement.slabBoundary,
    },
    snapPlanPoint, snapPlanWallHost, applyOpeningDistance, resolveLineSnap,
    applyPlacementDimensions, constrainGridCopyToParallelOffset,
  })

  useEffect(() => {
    if (activeTool !== 'wall') {
      pointerState.cancelWallTouchGesture()
    }
  }, [activeTool, pointerState.cancelWallTouchGesture])

  const finishWallTouchDraw = (gesture: WallTouchDrawGesture, rawWorld: [number, number], ctrlKey: boolean, shiftKey: boolean) => {
    if (wallDrawMode.startsWith('room-')) {
      const points = buildWallTemplatePath(wallDrawMode, gesture.startNode.point_mm, rawWorld)
      if (points.length >= 2) {
        const segments = buildWallPathSegments(points, 'continuous-lines')
        if (segments.length) callbacks.onCommitWallPath?.(segments, placementReference, getWallVerticalReference(planProject, gesture.startNode.hostWallId))
        placement.setWallStartNode(null)
      }
      setWallTouchPreview(null)
      return
    }
    const { snap } = resolvePointerSnap(rawWorld, ctrlKey, shiftKey)
    commitPlanCanvasLinePlacementPoint({
      activeTool: 'wall',
      snap,
      planProject,
      project,
      activeBeamTypeMark,
      activeWallTypeMark,
      placementReference,
      beamStartNode: null,
      wallStartNode: gesture.startNode,
      setBeamStartNode: placement.setBeamStartNode,
      setWallStartNode: placement.setWallStartNode,
      setDrawLengthMeters: placement.setDrawLengthMeters,
      setDrawAngleDegrees: placement.setDrawAngleDegrees,
      resolveReferencePath,
      clearDimensionOverrides: placement.clearDimensionOverrides,
      onCommitBeam: callbacks.onCommitBeam,
      onCommitWall: callbacks.onCommitWall,
    })
  }

  const commitWallTouchPath = (gesture: WallTouchDrawGesture, endpoint: { screenPoint: [number, number]; rawWorld: [number, number]; ctrlKey: boolean; shiftKey: boolean }) => {
    if (!wallDrawMode.startsWith('room-')) {
      const { snap } = resolvePointerSnap(endpoint.rawWorld, endpoint.ctrlKey, endpoint.shiftKey, true)
      updateTouchWallPath(gesture, endpoint.screenPoint, endpoint.rawWorld, snap.point_mm, wallDrawMode, activeWallAngleSnapDeg)
    }
    const points = wallDrawMode.startsWith('room-')
      ? buildWallTemplatePath(wallDrawMode, gesture.startNode.point_mm, gesture.latestRawWorldMm)
      : wallDrawMode === 'continuous-lines-and-arcs' || wallDrawMode === 'line-arc'
        ? [...gesture.sampledPathMm, gesture.candidatePointMm].filter((point, index, all) =>
          index === 0 || Math.hypot(point[0] - all[index - 1]![0], point[1] - all[index - 1]![1]) >= 20,
        )
        : [...gesture.pathPointsMm, gesture.candidatePointMm].filter((point, index, all) =>
          index === 0 || Math.hypot(point[0] - all[index - 1]![0], point[1] - all[index - 1]![1]) >= 100,
        )
    const segments = buildWallPathSegments(points, wallDrawMode.startsWith('room-') ? 'continuous-lines' : wallDrawMode, activeWallAngleSnapDeg)
    if (segments.length) {
      const verticalReference = getWallVerticalReference(planProject, gesture.startNode.hostWallId)
      callbacks.onCommitWallPath?.(segments, placementReference, verticalReference)
      placement.setWallStartNode(null)
      placement.setDrawLengthMeters('')
      placement.setDrawAngleDegrees('')
      placement.clearDimensionOverrides()
    }
    setWallTouchPreview(null)
  }

  const pointerHandlers = usePlanCanvasPointerHandlers({
    canvasRef,
    pointerMove: {
      navigation: {
        pointerPositionsRef, pinchRef, longPressStartRef, longPressTimerRef, selectionStartRef,
        setSelectionBox, eraseActiveRef, erasedIdsRef, isPanning, panStartRef, viewport, setViewport, findCandidates,
      },
      sketch: { sketchGestureRef: pointerState.sketchGestureRef, setSketchPoints: pointerState.setSketchPoints },
      authoring: {
        activeTool, viewport, draggingObject, hoveredId,
        resolveSnap: resolvePointerSnap,
        wallTouchGestureRef: pointerState.wallTouchGestureRef,
        measureGestureRef: pointerState.measureGestureRef,
        setWallTouchPreview,
        wallDrawMode,
        lineDrawingMode,
        wallAngleSnapDeg: activeWallAngleSnapDeg,
        findCandidates, setActiveWallSnap: placement.setActiveWallSnap, setActiveSnap: placement.setActiveSnap,
        setTapeMeasure: placement.setTapeMeasure, setCalibrationMousePoint: placement.setCalibrationMousePoint,
        setCandidates, setHoveredId, setManipulationPreview, onCursorChange: callbacks.onCursorChange,
        previewDragAt: manipulation.previewDragAt,
      },
    },
    pointerDown: {
      activeTool,
      wallDrawMode,
      sketchMode: pointerState.sketchMode,
      sketchPoints: pointerState.sketchPoints,
      sketchGestureRef: pointerState.sketchGestureRef,
      setSketchPoints: pointerState.setSketchPoints,
      onCommitSketch,
      wallTouchGestureRef: pointerState.wallTouchGestureRef,
      measureGestureRef: pointerState.measureGestureRef,
      setWallTouchPreview,
      cancelWallTouchGesture: pointerState.cancelWallTouchGesture,
      viewport,
      navigation: {
        pointerPositionsRef, touchSelectionSnapshotRef, pinchRef, pinchActiveRef, longPressStartRef, longPressTimerRef,
        selectionStartRef, panStartRef, setSelectionBox, setDraggingObject, setIsPanning, cancelActiveGesture: pointerState.clearPointerDrag,
        setObjectContextMenu, findHitObject, onSelectionChange: callbacks.onSelectionChange, onSelectObject: callbacks.onSelectObject,
        selectedIds, selectedId,
      },
      snapping: { resolveSnap: resolvePointerSnap },
      selection: {
        displayUnit, planProject, project, selectedIds, hoveredId, findEditHandle, findCandidates,
        findHitObject, setCandidates, setHoveredId, setDraggingObject, setManipulationPreview,
        setResizeDimensionWidth: resizeDimensionWidth, setResizeDimensionHeight: resizeDimensionHeight,
        setResizeDimensionLength: resizeDimensionLength, selectionStartRef, selectionAdditiveRef,
        lastPreviewValidationRef: manipulation.lastPreviewValidationRef,
        onSelectionChange: callbacks.onSelectionChange, onSelectObject: callbacks.onSelectObject,
      },
      placement: {
        project, planProject, supplierBundlePlacement, selectedId, displayUnit, viewportZoom: viewport.zoom, placement, activeFamilyId,
        settings: { activeBeamTypeMark, activeWallTypeMark, activeDoorTypeMark, activeWindowTypeMark, placementReference, doorHanding },
        callbacks: {
          onCopyGrid: callbacks.onCopyGrid, onCommitColumn: callbacks.onCommitColumn,
          onCommitFoundation: callbacks.onCommitFoundation, onCommitDoor: callbacks.onCommitDoor,
          onCommitWindow: callbacks.onCommitWindow, onCommitFixture: callbacks.onCommitFixture,
          onSelectionChange: callbacks.onSelectionChange, onSelectObject: callbacks.onSelectObject,
          onCommitBeam: callbacks.onCommitBeam, onCommitWall: callbacks.onCommitWall,
          onCommitRoomSeparator: callbacks.onCommitRoomSeparator, onCommitPipeRoute: callbacks.onCommitPipeRoute,
          onCommitCabinet: callbacks.onCommitCabinet, onCommitFurniture: callbacks.onCommitFurniture, onCommitFamilyFurniture: callbacks.onCommitFamilyFurniture, onCommitMoulding: callbacks.onCommitMoulding,
          onCommitSlab: callbacks.onCommitSlab, onCommitSupplierBundle: callbacks.onCommitSupplierBundle, onCommitArchitecturalFloor: callbacks.onCommitArchitecturalFloor,
          onCommitCeiling: callbacks.onCommitCeiling, onCommitRoof: callbacks.onCommitRoof,
          onCommitSurfaceVoid: callbacks.onCommitSurfaceVoid, onCommitGrid: callbacks.onCommitGrid,
          onCommitGridSystem: callbacks.onCommitGridSystem, onStartCalibrationModal: callbacks.onStartCalibrationModal,
          onCommitStair: callbacks.onCommitStair, onActivateTool: callbacks.onActivateTool,
          onCommitManipulation: callbacks.onCommitManipulation, onManipulationRejected: callbacks.onManipulationRejected,
        },
        operations: { snapPlanWallHost, applyOpeningDistance, resolveReferencePath },
        interaction: { eraseActiveRef, erasedIdsRef, findCandidates },
      },
    },
    pointerUp: {
      viewport, isPanning, pointerPositionsRef, touchSelectionSnapshotRef, pinchRef, pinchActiveRef, longPressTimerRef,
      longPressStartRef, setIsPanning, selectionStartRef, selectionAdditiveRef, setSelectionBox,
      project: planProject, selectionScope, selectedIds, onSelectionChange: callbacks.onSelectionChange,
      onSelectObject: callbacks.onSelectObject, eraseActiveRef, erasedIdsRef,
      onDeleteObjects: callbacks.onDeleteObjects, draggingObject,
      manualDragPointRef: dragDimensions.manualPointRef, buildDragCommands: manipulation.buildDragCommands,
      previewDragAt: manipulation.previewDragAt, realtimeDimensions,
      cancelPendingPreview: manipulation.cancelPendingPreview,
      onPreviewManipulation: callbacks.onPreviewManipulation, onCommitManipulation: callbacks.onCommitManipulation,
      onManipulationRejected: callbacks.onManipulationRejected, setDraggingObject, setDragPreviewPoint,
      setDimensionEdit,
      setResizeDimensionWidth: resizeDimensionWidth, setResizeDimensionHeight: resizeDimensionHeight,
      setResizeDimensionLength: resizeDimensionLength,
      wallTouchGestureRef: pointerState.wallTouchGestureRef,
      measureGestureRef: pointerState.measureGestureRef,
      sketchGestureRef: pointerState.sketchGestureRef,
      sketchMode: pointerState.sketchMode,
      setSketchPoints: pointerState.setSketchPoints,
      onCommitSketch,
      setTapeMeasure: placement.setTapeMeasure,
      setMeasurePoints: placement.setMeasurePoints,
      setMeasureComplete: placement.setMeasureComplete,
      setWallTouchPreview,
      onFinishWallTouchDraw: finishWallTouchDraw,
      onCommitWallTouchPath: commitWallTouchPath,
    },
  })

  const commitLinePlacementAtSnap = () => {
    if (activeTool === 'draw' && pointerState.sketchMode === 'polyline' && pointerState.sketchPoints.length >= 2) {
      onCommitSketch(pointerState.sketchPoints, 'polyline')
      pointerState.setSketchPoints([])
      return true
    }
    if (activeTool !== 'wall' && activeTool !== 'beam') return false
    const snap = placement.activeSnap
    if (!snap) return false
    commitPlanCanvasLinePlacementPoint({
      activeTool,
      snap,
      planProject,
      project,
      activeBeamTypeMark,
      activeWallTypeMark,
      placementReference,
      beamStartNode: placement.beamStartNode,
      wallStartNode: placement.wallStartNode,
      setBeamStartNode: placement.setBeamStartNode,
      setWallStartNode: placement.setWallStartNode,
      setDrawLengthMeters: placement.setDrawLengthMeters,
      setDrawAngleDegrees: placement.setDrawAngleDegrees,
      resolveReferencePath,
      clearDimensionOverrides: placement.clearDimensionOverrides,
      onCommitBeam: callbacks.onCommitBeam,
      onCommitWall: callbacks.onCommitWall,
    })
    return true
  }

  return { ...pointerHandlers, commitLinePlacementAtSnap }
}
