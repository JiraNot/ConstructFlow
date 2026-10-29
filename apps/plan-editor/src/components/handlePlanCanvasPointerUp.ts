import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { ProjectDocument } from '@constructflow/project-model'
import type { CommandRequest } from '@constructflow/command-schema'
import type { DirectManipulationPreviewResult, PlanDragGesture } from '../directManipulation.mjs'
import { screenToWorld, type ViewportState } from '../viewport/viewportTransform.js'
import { getPlanObjectBounds } from './PlanCanvasGeometry.js'
import { commitPlanCanvasDragPreview } from './commitPlanCanvasDragPreview.mjs'
import { resolvePlanCanvasBoxSelection } from './resolvePlanCanvasBoxSelection.mjs'
import type { PlanCanvasDraggingObject } from './planCanvasInteractionTypes.js'
import type { ToolType } from './Toolbar.js'
import { matchesPlanSelectionScope } from './planSelectionScope.js'
import type { PlanSketchGesture, PlanSketchMode, WallTouchDrawGesture } from './planCanvasInteractionTypes.js'
import type { MeasureDragGesture } from './planCanvasInteractionTypes.js'

type Point = [number, number]
type PinchState = { distance: number; center: Point } | null

interface HandlePlanCanvasPointerUpOptions {
  event: React.PointerEvent<HTMLCanvasElement>
  canvas: HTMLCanvasElement | null
  viewport: ViewportState
  isPanning: boolean
  pointerPositionsRef: MutableRefObject<Map<number, Point>>
  touchSelectionSnapshotRef: MutableRefObject<{ ids: string[]; primaryId: string | null } | null>
  pinchRef: MutableRefObject<PinchState>
  pinchActiveRef: MutableRefObject<boolean>
  longPressTimerRef: MutableRefObject<number | null>
  longPressStartRef: MutableRefObject<{ pointerId: number; point: Point } | null>
  setIsPanning: Dispatch<SetStateAction<boolean>>
  selectionStartRef: MutableRefObject<Point | null>
  selectionAdditiveRef: MutableRefObject<boolean>
  setSelectionBox: Dispatch<SetStateAction<{ start: Point; end: Point } | null>>
  project: ProjectDocument
  selectionScope?: ToolType | null
  selectedIds: string[]
  onSelectionChange?: (ids: string[], primaryId: string | null) => void
  onSelectObject: (id: string | null) => void
  eraseActiveRef: MutableRefObject<boolean>
  erasedIdsRef: MutableRefObject<Set<string>>
  onDeleteObjects?: (ids: string[]) => void
  draggingObject: PlanCanvasDraggingObject | null
  manualDragPointRef: MutableRefObject<Point | null>
  previewDragAt: (drag: PlanDragGesture, point: Point, ctrlKey: boolean, manual?: boolean) => Promise<{ commands: CommandRequest[]; valid: boolean }>
  realtimeDimensions: boolean
  buildDragCommands: (drag: PlanDragGesture, rawWorld: Point, ctrlKey: boolean) => Promise<CommandRequest[]>
  cancelPendingPreview: () => void
  onPreviewManipulation: (commands: CommandRequest[]) => DirectManipulationPreviewResult
  onCommitManipulation: (commands: CommandRequest[]) => { status: string; errors?: string[] }
  onManipulationRejected?: (errors: string[]) => void
  setDraggingObject: Dispatch<SetStateAction<PlanCanvasDraggingObject | null>>
  setDimensionEdit: Dispatch<SetStateAction<{ drag: PlanCanvasDraggingObject; point: Point } | null>>
  setDragPreviewPoint: Dispatch<SetStateAction<Point | null>>
  setResizeDimensionWidth: (value: string) => void
  setResizeDimensionHeight: (value: string) => void
  setResizeDimensionLength: (value: string) => void
  wallTouchGestureRef: MutableRefObject<WallTouchDrawGesture | null>
  measureGestureRef: MutableRefObject<MeasureDragGesture | null>
  sketchGestureRef: MutableRefObject<PlanSketchGesture | null>
  sketchMode: PlanSketchMode
  setSketchPoints: (points: Point[]) => void
  onCommitSketch: (points: Point[], mode: PlanSketchMode, closed?: boolean) => void
  setTapeMeasure: Dispatch<SetStateAction<{ start: Point; end: Point; complete: boolean } | null>>
  setMeasurePoints: Dispatch<SetStateAction<Point[]>>
  setMeasureComplete: Dispatch<SetStateAction<boolean>>
  setWallTouchPreview: (points: Point[] | null) => void
  onFinishWallTouchDraw: (gesture: WallTouchDrawGesture, rawWorld: Point, ctrlKey: boolean, shiftKey: boolean) => void
  onCommitWallTouchPath: (gesture: WallTouchDrawGesture, endpoint: { screenPoint: Point; rawWorld: Point; ctrlKey: boolean; shiftKey: boolean }) => void
}

export async function handlePlanCanvasPointerUp({
  event,
  canvas,
  viewport,
  isPanning,
  pointerPositionsRef,
  touchSelectionSnapshotRef,
  pinchRef,
  pinchActiveRef,
  longPressTimerRef,
  longPressStartRef,
  setIsPanning,
  selectionStartRef,
  selectionAdditiveRef,
  setSelectionBox,
  project,
  selectionScope,
  selectedIds,
  onSelectionChange,
  onSelectObject,
  eraseActiveRef,
  erasedIdsRef,
  onDeleteObjects,
  draggingObject,
  manualDragPointRef,
  previewDragAt,
  realtimeDimensions,
  buildDragCommands,
  cancelPendingPreview,
  onPreviewManipulation,
  onCommitManipulation,
  onManipulationRejected,
  setDraggingObject,
  setDimensionEdit,
  setDragPreviewPoint,
  setResizeDimensionWidth,
  setResizeDimensionHeight,
  setResizeDimensionLength,
  wallTouchGestureRef,
  measureGestureRef,
  sketchGestureRef,
  sketchMode,
  setSketchPoints,
  onCommitSketch,
  setTapeMeasure,
  setMeasurePoints,
  setMeasureComplete,
  setWallTouchPreview,
  onFinishWallTouchDraw,
  onCommitWallTouchPath,
}: HandlePlanCanvasPointerUpOptions) {
  if (event.pointerType === 'touch') {
    if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = null
    longPressStartRef.current = null
    pointerPositionsRef.current.delete(event.pointerId)
    if (pinchActiveRef.current) {
      if (pointerPositionsRef.current.size === 0) {
        pinchActiveRef.current = false
        pinchRef.current = null
        touchSelectionSnapshotRef.current = null
      } else {
        const point = [...pointerPositionsRef.current.values()][0]!
        pinchRef.current = { distance: 1, center: point }
      }
      return
    }
    if (pointerPositionsRef.current.size === 0) touchSelectionSnapshotRef.current = null
  }

  const sketchGesture = sketchGestureRef.current
  if (sketchGesture?.pointerId === event.pointerId) {
    sketchGestureRef.current = null
    setSketchPoints([])
    const rect = canvas?.getBoundingClientRect()
    const finalPoint = rect ? screenToWorld([event.clientX - rect.left, event.clientY - rect.top], viewport) : sketchGesture.points.at(-1)
    const previous = sketchGesture.points.at(-1)
    const points = finalPoint && previous && Math.hypot(finalPoint[0] - previous[0], finalPoint[1] - previous[1]) >= 1
      ? [...sketchGesture.points, finalPoint]
      : sketchGesture.points
    if (points.length >= 2) onCommitSketch(points, sketchMode)
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch {}
    return
  }

  const wallGesture = wallTouchGestureRef.current
  if (wallGesture?.pointerId === event.pointerId) {
    const rect = canvas?.getBoundingClientRect()
    if (rect) {
      const screenPoint: Point = [event.clientX - rect.left, event.clientY - rect.top]
      const movedPixels = Math.hypot(screenPoint[0] - wallGesture.startScreenPx[0], screenPoint[1] - wallGesture.startScreenPx[1])
      const rawWorld = screenToWorld(screenPoint, viewport)
      wallGesture.latestRawWorldMm = rawWorld
      if (movedPixels >= 6) {
        onCommitWallTouchPath(wallGesture, { screenPoint, rawWorld, ctrlKey: event.ctrlKey, shiftKey: event.shiftKey })
      } else if (wallGesture.hadExistingStart || event.pointerType === 'mouse') {
        // A tap can still place the endpoint of the classic point-by-point chain.
        wallTouchGestureRef.current = null
        onFinishWallTouchDraw(wallGesture, wallGesture.latestRawWorldMm, event.ctrlKey, event.shiftKey)
      }
    }
    wallTouchGestureRef.current = null
    setWallTouchPreview(null)
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch {}
    return
  }

  const measureGesture = measureGestureRef.current
  if (measureGesture?.pointerId === event.pointerId) {
    measureGestureRef.current = null
    const rect = canvas?.getBoundingClientRect()
    if (rect) {
      const screenPoint: Point = [event.clientX - rect.left, event.clientY - rect.top]
      const endWorldMm = measureGesture.latestWorldMm
      const movedPixels = Math.hypot(screenPoint[0] - measureGesture.startScreenPx[0], screenPoint[1] - measureGesture.startScreenPx[1])
      const complete = measureGesture.hadStart || movedPixels >= 4
      if (measureGesture.mode === 'distance') setTapeMeasure({ start: measureGesture.startWorldMm, end: endWorldMm, complete })
      else {
        setMeasurePoints(complete ? [measureGesture.startWorldMm, endWorldMm] : [measureGesture.startWorldMm])
        setMeasureComplete(complete)
      }
    }
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch {}
    return
  }

  if (isPanning) {
    setIsPanning(false)
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch {}
    return
  }

  if (selectionStartRef.current) {
    const rect = canvas?.getBoundingClientRect()
    if (rect) {
      const end: Point = [event.clientX - rect.left, event.clientY - rect.top]
      const start = selectionStartRef.current
      selectionStartRef.current = null
      setSelectionBox(null)
      if (Math.hypot(end[0] - start[0], end[1] - start[1]) >= 5) {
        const a = screenToWorld(start, viewport)
        const b = screenToWorld(end, viewport)
        const box: [number, number, number, number] = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]
        const next = resolvePlanCanvasBoxSelection(box, Object.values(project.objects)
          .filter(object => matchesPlanSelectionScope(object, selectionScope))
          .map(object => ({ id: object.id, bounds: getPlanObjectBounds(object) })), selectedIds, selectionAdditiveRef.current)
        onSelectionChange?.(next, next.at(-1) ?? null)
        onSelectObject(next.at(-1) ?? null)
      } else if (!selectionAdditiveRef.current) {
        onSelectionChange?.([], null)
        onSelectObject(null)
      }
    }
    return
  }

  if (eraseActiveRef.current) {
    if (erasedIdsRef.current.size) onDeleteObjects?.([...erasedIdsRef.current])
    eraseActiveRef.current = false
    erasedIdsRef.current.clear()
    return
  }

  if (!draggingObject) return
  cancelPendingPreview()
  const rect = canvas?.getBoundingClientRect()
  let keepDimensionEdit = false
  let dimensionEditPoint: Point | null = null
  if (rect) {
    const screenX = event.clientX - rect.left
    const screenY = event.clientY - rect.top
    const pointerWorld = screenToWorld([screenX, screenY], viewport)
    const hasManualDimensions = manualDragPointRef.current !== null
    const rawWorld = manualDragPointRef.current ?? pointerWorld
    const movedPixels = Math.hypot(screenX - draggingObject.startScreenPx[0], screenY - draggingObject.startScreenPx[1])
    try {
      if (realtimeDimensions && (movedPixels >= 3 || hasManualDimensions)) {
        const preview = await previewDragAt(draggingObject, rawWorld, event.ctrlKey || hasManualDimensions, hasManualDimensions)
        if (preview.commands.length) {
          keepDimensionEdit = true
          dimensionEditPoint = rawWorld
          setDimensionEdit({ drag: draggingObject, point: rawWorld })
        }
      }
      if (!keepDimensionEdit) {
        await commitPlanCanvasDragPreview({
          drag: draggingObject,
          rawWorld,
          ctrlKey: event.ctrlKey,
          hasManualDimensions,
          movedPixels,
          buildCommands: buildDragCommands,
          preview: onPreviewManipulation,
          commit: onCommitManipulation,
          onRejected: onManipulationRejected,
        })
      }
    } catch (error) {
      onManipulationRejected?.([error instanceof Error ? error.message : String(error)])
    }
  }
  manualDragPointRef.current = null
  setDraggingObject(null)
  setDragPreviewPoint(null)
  if (keepDimensionEdit) manualDragPointRef.current = dimensionEditPoint
  else {
    setDimensionEdit(null)
    setResizeDimensionWidth('')
    setResizeDimensionHeight('')
    setResizeDimensionLength('')
  }
  try { event.currentTarget.releasePointerCapture(event.pointerId) } catch {}
}
