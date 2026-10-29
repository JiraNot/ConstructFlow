import { useCallback, type Dispatch, type MutableRefObject, type PointerEvent, type SetStateAction } from 'react'
import type { MeasureDragGesture } from './planCanvasInteractionTypes.js'

type Point = [number, number]
type SelectionBox = { start: Point; end: Point } | null

interface PlanCanvasPointerCancelOptions {
  longPressTimerRef: MutableRefObject<number | null>
  longPressStartRef: MutableRefObject<{ pointerId: number; point: Point } | null>
  pointerPositionsRef: MutableRefObject<Map<number, Point>>
  touchSelectionSnapshotRef: MutableRefObject<{ ids: string[]; primaryId: string | null } | null>
  pinchRef: MutableRefObject<{ distance: number; center: Point } | null>
  pinchActiveRef: MutableRefObject<boolean>
  selectionStartRef: MutableRefObject<Point | null>
  setSelectionBox: Dispatch<SetStateAction<SelectionBox>>
  eraseActiveRef: MutableRefObject<boolean>
  erasedIdsRef: MutableRefObject<Set<string>>
  measureGestureRef: MutableRefObject<MeasureDragGesture | null>
  cancelDragGesture: () => void
}

export function usePlanCanvasPointerCancel({
  longPressTimerRef, longPressStartRef, pointerPositionsRef, touchSelectionSnapshotRef, pinchRef, pinchActiveRef,
  selectionStartRef, setSelectionBox, eraseActiveRef, erasedIdsRef, measureGestureRef, cancelDragGesture,
}: PlanCanvasPointerCancelOptions) {
  return useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = null
    longPressStartRef.current = null
    pointerPositionsRef.current.delete(event.pointerId)
    if (pointerPositionsRef.current.size === 0) touchSelectionSnapshotRef.current = null
    pinchActiveRef.current = false
    pinchRef.current = null
    selectionStartRef.current = null
    setSelectionBox(null)
    eraseActiveRef.current = false
    erasedIdsRef.current.clear()
    measureGestureRef.current = null
    cancelDragGesture()
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch {}
  }, [longPressTimerRef, longPressStartRef, pointerPositionsRef, touchSelectionSnapshotRef, pinchRef, pinchActiveRef,
    selectionStartRef, setSelectionBox, eraseActiveRef, erasedIdsRef, measureGestureRef, cancelDragGesture])
}
