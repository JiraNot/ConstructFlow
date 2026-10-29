import type { PointerEvent as ReactPointerEvent } from 'react'
import type { ViewportState } from '../viewport/viewportTransform.js'
import { screenToWorld } from '../viewport/viewportTransform.js'
import type { ToolType } from './Toolbar.js'
import { handlePlanCanvasPointerDownNavigation } from './handlePlanCanvasPointerDownNavigation.js'
import { handlePlanCanvasSelectionPointerDown } from './handlePlanCanvasSelectionPointerDown.js'
import { handlePlanCanvasPlacementPointerDown } from './handlePlanCanvasPlacementPointerDown.js'
import type { SnapResult, WallHostSnapResult } from '@constructflow/snapping-engine'
import type { MutableRefObject } from 'react'
import type { MeasureDragGesture, PlanSketchMode, PlanSketchGesture, WallDrawMode, WallTouchDrawGesture } from './planCanvasInteractionTypes.js'
import { wallPlacementStartFromSnap } from './commitPlanCanvasLinePlacementPoint.js'

type NavigationContext = Omit<Parameters<typeof handlePlanCanvasPointerDownNavigation>[0], 'event' | 'screenPoint' | 'activeTool' | 'viewport'>
type SelectionContext = Omit<Parameters<typeof handlePlanCanvasSelectionPointerDown>[0], 'event' | 'screenPoint' | 'rawWorld'>
type PlacementContext = Omit<Parameters<typeof handlePlanCanvasPlacementPointerDown>[0], 'event' | 'activeTool' | 'rawWorld' | 'snap'>
type SnapContext = {
  resolveSnap: (rawWorld: [number, number], ctrlKey: boolean, shiftKey: boolean) => { snap: SnapResult; wallSnap: WallHostSnapResult | null }
}

interface HandlePlanCanvasPointerDownOptions {
  event: ReactPointerEvent<HTMLCanvasElement>
  canvas: HTMLCanvasElement | null
  activeTool: ToolType
  wallDrawMode: WallDrawMode
  viewport: ViewportState
  navigation: NavigationContext
  snapping: SnapContext
  selection: SelectionContext
  placement: PlacementContext
  wallTouchGestureRef: MutableRefObject<WallTouchDrawGesture | null>
  measureGestureRef: MutableRefObject<MeasureDragGesture | null>
  sketchGestureRef: MutableRefObject<PlanSketchGesture | null>
  sketchMode: PlanSketchMode
  sketchPoints: [number, number][]
  setSketchPoints: (points: [number, number][]) => void
  onCommitSketch: (points: [number, number][], mode: PlanSketchMode, closed?: boolean) => void
  setWallTouchPreview: (points: [number, number][] | null) => void
  cancelWallTouchGesture: () => void
}

/** Routes one pointer-down gesture through navigation, selection, then placement. */
export function handlePlanCanvasPointerDown({
  event, canvas, activeTool, wallDrawMode, viewport, navigation, snapping, selection, placement, wallTouchGestureRef, measureGestureRef,
  sketchGestureRef, sketchMode, sketchPoints, setSketchPoints, onCommitSketch, setWallTouchPreview, cancelWallTouchGesture,
}: HandlePlanCanvasPointerDownOptions) {
  const rect = canvas?.getBoundingClientRect()
  if (!rect) return
  const screenPoint: [number, number] = [event.clientX - rect.left, event.clientY - rect.top]
  if (handlePlanCanvasPointerDownNavigation({ event, screenPoint, activeTool, viewport, ...navigation })) {
    if (navigation.pointerPositionsRef.current.size > 1) {
      cancelWallTouchGesture()
      measureGestureRef.current = null
      sketchGestureRef.current = null
      setSketchPoints([])
    }
    return
  }
  if (event.button !== 0) return

  navigation.setObjectContextMenu(null)
  const rawWorld = screenToWorld(screenPoint, viewport)
  if (activeTool === 'draw') {
    const { snap } = snapping.resolveSnap(rawWorld, event.ctrlKey, event.shiftKey)
    const point = snap.point_mm
    if (sketchMode === 'freehand') {
      sketchGestureRef.current = { pointerId: event.pointerId, points: [point], lastScreenPx: screenPoint }
      setSketchPoints([point])
      try { event.currentTarget.setPointerCapture(event.pointerId) } catch {}
      event.preventDefault()
      return
    }
    if (sketchMode === 'line') {
      if (sketchPoints.length === 0) setSketchPoints([point])
      else {
        onCommitSketch([sketchPoints[0]!, point], 'line')
        setSketchPoints([])
      }
      return
    }
    if (sketchMode === 'rectangle') {
      if (sketchPoints.length === 0) setSketchPoints([point])
      else {
        const [x0, y0] = sketchPoints[0]!
        const [x1, y1] = point
        const corners: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
        onCommitSketch(corners, 'rectangle', true)
        setSketchPoints([])
      }
      return
    }
    const first = sketchPoints[0]
    const closeToleranceMm = Math.max(100, 12 / Math.max(0.05, viewport.zoom))
    if (first && sketchPoints.length >= 3 && Math.hypot(point[0] - first[0], point[1] - first[1]) <= closeToleranceMm) {
      onCommitSketch(sketchPoints, 'polyline', true)
      setSketchPoints([])
    } else {
      const next = !first ? [point] : Math.hypot(point[0] - sketchPoints.at(-1)![0], point[1] - sketchPoints.at(-1)![1]) < 10 ? sketchPoints : [...sketchPoints, point]
      if (event.detail >= 2 && next.length >= 2) {
        onCommitSketch(next, 'polyline')
        setSketchPoints([])
      } else setSketchPoints(next)
    }
    return
  }
  if (activeTool === 'select') {
    handlePlanCanvasSelectionPointerDown({ event, screenPoint, rawWorld, ...selection })
  } else {
    const { snap, wallSnap } = snapping.resolveSnap(rawWorld, event.ctrlKey, event.shiftKey)
    const placementOptions = {
      event,
      activeTool,
      rawWorld,
      snap,
      ...placement,
      placement: { ...placement.placement, activeWallSnap: wallSnap },
    }
    if (activeTool === 'wall' && (event.pointerType === 'touch' || event.pointerType === 'pen'
      || (event.pointerType === 'mouse' && (wallDrawMode.startsWith('room-') || wallDrawMode === 'continuous-lines-and-arcs' || wallDrawMode === 'line-arc')))) {
      // Room tools are one drag from the user's current corner. An unfinished
      // click-to-click wall chain must not hijack the room's origin.
      const isRoomTemplate = wallDrawMode.startsWith('room-')
      const existingStart = isRoomTemplate ? null : placement.placement.wallStartNode
      const startNode = existingStart ?? wallPlacementStartFromSnap(snap, placement.planProject)
      if (isRoomTemplate) placement.placement.setWallStartNode(null)
      else if (!existingStart) handlePlanCanvasPlacementPointerDown(placementOptions)
      wallTouchGestureRef.current = {
        pointerId: event.pointerId,
        startNode,
        startScreenPx: screenPoint,
        hadExistingStart: Boolean(existingStart),
        pathPointsMm: [startNode.point_mm],
        sampledPathMm: [startNode.point_mm],
        candidatePointMm: startNode.point_mm,
        activeHeadingDeg: null,
        pendingHeadingDeg: null,
        pendingHeadingDistanceMm: 0,
        pendingHeadingSamples: 0,
        lastSampleScreenPx: screenPoint,
        lastSampleWorldMm: startNode.point_mm,
        latestRawWorldMm: startNode.point_mm,
      }
      setWallTouchPreview([startNode.point_mm])
      try { event.currentTarget.setPointerCapture(event.pointerId) } catch {}
      return
    }
    if (activeTool === 'measure' && ['distance', 'rectangle'].includes(placement.placement.measureMode)) {
      const mode = placement.placement.measureMode as 'distance' | 'rectangle'
      const previousPoints = placement.placement.measurePoints
      const previousTape = placement.placement.tapeMeasure
      const hadStart = mode === 'distance' ? Boolean(previousTape && !previousTape.complete) : previousPoints.length === 1
      const start = mode === 'distance' && previousTape && !previousTape.complete
        ? previousTape.start
        : mode === 'rectangle' && hadStart ? previousPoints[0]! : snap.point_mm
      measureGestureRef.current = { pointerId: event.pointerId, mode, startWorldMm: start, startScreenPx: screenPoint, latestWorldMm: snap.point_mm, hadStart }
      if (mode === 'distance') placement.placement.setTapeMeasure({ start, end: snap.point_mm, complete: false })
      else if (!hadStart) { placement.placement.setMeasurePoints([start]); placement.placement.setMeasureComplete(false) }
      try { event.currentTarget.setPointerCapture(event.pointerId) } catch {}
      event.preventDefault()
      return
    }
    handlePlanCanvasPlacementPointerDown({
      ...placementOptions,
    })
  }
}
