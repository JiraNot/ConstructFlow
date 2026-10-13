import { useCallback, type Dispatch, type MutableRefObject, type PointerEvent, type SetStateAction } from 'react'

type Point = [number, number]
type SelectionBox = { start: Point; end: Point } | null

interface PlanCanvasPointerCancelOptions {
  longPressTimerRef: MutableRefObject<number | null>
  longPressStartRef: MutableRefObject<{ pointerId: number; point: Point } | null>
  pointerPositionsRef: MutableRefObject<Map<number, Point>>
  pinchRef: MutableRefObject<{ distance: number; center: Point } | null>
  pinchActiveRef: MutableRefObject<boolean>
  selectionStartRef: MutableRefObject<Point | null>
  setSelectionBox: Dispatch<SetStateAction<SelectionBox>>
  eraseActiveRef: MutableRefObject<boolean>
  erasedIdsRef: MutableRefObject<Set<string>>
  cancelDragGesture: () => void
}

export function usePlanCanvasPointerCancel({
  longPressTimerRef, longPressStartRef, pointerPositionsRef, pinchRef, pinchActiveRef,
  selectionStartRef, setSelectionBox, eraseActiveRef, erasedIdsRef, cancelDragGesture,
}: PlanCanvasPointerCancelOptions) {
  return useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = null
    longPressStartRef.current = null
    pointerPositionsRef.current.delete(event.pointerId)
    pinchActiveRef.current = false
    pinchRef.current = null
    selectionStartRef.current = null
    setSelectionBox(null)
    eraseActiveRef.current = false
    erasedIdsRef.current.clear()
    cancelDragGesture()
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch {}
  }, [longPressTimerRef, longPressStartRef, pointerPositionsRef, pinchRef, pinchActiveRef,
    selectionStartRef, setSelectionBox, eraseActiveRef, erasedIdsRef, cancelDragGesture])
}
