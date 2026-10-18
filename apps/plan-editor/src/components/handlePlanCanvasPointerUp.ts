import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { ProjectDocument } from '@constructflow/project-model'
import type { CommandRequest } from '@constructflow/command-schema'
import type { DirectManipulationPreviewResult, PlanDragGesture } from '../directManipulation.mjs'
import { screenToWorld, type ViewportState } from '../viewport/viewportTransform.js'
import { getPlanObjectBounds } from './PlanCanvasGeometry.js'
import { commitPlanCanvasDragPreview } from './commitPlanCanvasDragPreview.mjs'
import { resolvePlanCanvasBoxSelection } from './resolvePlanCanvasBoxSelection.mjs'
import type { PlanCanvasDraggingObject } from './planCanvasInteractionTypes.js'

type Point = [number, number]
type PinchState = { distance: number; center: Point } | null

interface HandlePlanCanvasPointerUpOptions {
  event: React.PointerEvent<HTMLCanvasElement>
  canvas: HTMLCanvasElement | null
  viewport: ViewportState
  isPanning: boolean
  pointerPositionsRef: MutableRefObject<Map<number, Point>>
  pinchRef: MutableRefObject<PinchState>
  pinchActiveRef: MutableRefObject<boolean>
  longPressTimerRef: MutableRefObject<number | null>
  longPressStartRef: MutableRefObject<{ pointerId: number; point: Point } | null>
  setIsPanning: Dispatch<SetStateAction<boolean>>
  selectionStartRef: MutableRefObject<Point | null>
  selectionAdditiveRef: MutableRefObject<boolean>
  setSelectionBox: Dispatch<SetStateAction<{ start: Point; end: Point } | null>>
  project: ProjectDocument
  selectedIds: string[]
  onSelectionChange?: (ids: string[], primaryId: string | null) => void
  onSelectObject: (id: string | null) => void
  eraseActiveRef: MutableRefObject<boolean>
  erasedIdsRef: MutableRefObject<Set<string>>
  onDeleteObjects?: (ids: string[]) => void
  draggingObject: PlanCanvasDraggingObject | null
  manualDragPointRef: MutableRefObject<Point | null>
  buildDragCommands: (drag: PlanDragGesture, rawWorld: Point, ctrlKey: boolean) => Promise<CommandRequest[]>
  cancelPendingPreview: () => void
  onPreviewManipulation: (commands: CommandRequest[]) => DirectManipulationPreviewResult
  onCommitManipulation: (commands: CommandRequest[]) => { status: string; errors?: string[] }
  onManipulationRejected?: (errors: string[]) => void
  setDraggingObject: Dispatch<SetStateAction<PlanCanvasDraggingObject | null>>
  setDragPreviewPoint: Dispatch<SetStateAction<Point | null>>
  setResizeDimensionWidth: (value: string) => void
  setResizeDimensionHeight: (value: string) => void
  setResizeDimensionLength: (value: string) => void
}

export async function handlePlanCanvasPointerUp({
  event,
  canvas,
  viewport,
  isPanning,
  pointerPositionsRef,
  pinchRef,
  pinchActiveRef,
  longPressTimerRef,
  longPressStartRef,
  setIsPanning,
  selectionStartRef,
  selectionAdditiveRef,
  setSelectionBox,
  project,
  selectedIds,
  onSelectionChange,
  onSelectObject,
  eraseActiveRef,
  erasedIdsRef,
  onDeleteObjects,
  draggingObject,
  manualDragPointRef,
  buildDragCommands,
  cancelPendingPreview,
  onPreviewManipulation,
  onCommitManipulation,
  onManipulationRejected,
  setDraggingObject,
  setDragPreviewPoint,
  setResizeDimensionWidth,
  setResizeDimensionHeight,
  setResizeDimensionLength,
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
      } else {
        const point = [...pointerPositionsRef.current.values()][0]!
        pinchRef.current = { distance: 1, center: point }
      }
      return
    }
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
        const next = resolvePlanCanvasBoxSelection(box, Object.values(project.objects).map(object => ({ id: object.id, bounds: getPlanObjectBounds(object) })), selectedIds, selectionAdditiveRef.current)
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
  if (rect) {
    const screenX = event.clientX - rect.left
    const screenY = event.clientY - rect.top
    const pointerWorld = screenToWorld([screenX, screenY], viewport)
    const hasManualDimensions = manualDragPointRef.current !== null
    const rawWorld = manualDragPointRef.current ?? pointerWorld
    const movedPixels = Math.hypot(screenX - draggingObject.startScreenPx[0], screenY - draggingObject.startScreenPx[1])
    try {
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
    } catch (error) {
      onManipulationRejected?.([error instanceof Error ? error.message : String(error)])
    }
  }
  manualDragPointRef.current = null
  setDraggingObject(null)
  setDragPreviewPoint(null)
  setResizeDimensionWidth('')
  setResizeDimensionHeight('')
  setResizeDimensionLength('')
  try { event.currentTarget.releasePointerCapture(event.pointerId) } catch {}
}
