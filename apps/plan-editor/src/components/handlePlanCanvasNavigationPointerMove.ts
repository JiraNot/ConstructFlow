import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { screenToWorld, zoomAtScreenPoint, type ViewportState } from '../viewport/viewportTransform.js'

type Point = [number, number]

interface NavigationPointerMoveContext {
  pointerPositionsRef: MutableRefObject<Map<number, Point>>
  pinchRef: MutableRefObject<{ distance: number; center: Point } | null>
  longPressStartRef: MutableRefObject<{ pointerId: number; point: Point } | null>
  longPressTimerRef: MutableRefObject<number | null>
  selectionStartRef: MutableRefObject<Point | null>
  setSelectionBox: Dispatch<SetStateAction<{ start: Point; end: Point } | null>>
  eraseActiveRef: MutableRefObject<boolean>
  erasedIdsRef: MutableRefObject<Set<string>>
  isPanning: boolean
  panStartRef: MutableRefObject<Point>
  viewport: ViewportState
  setViewport: Dispatch<SetStateAction<ViewportState>>
  findCandidates: (point: Point, includeOverlaps?: boolean) => string[]
}

export function handlePlanCanvasNavigationPointerMove(
  context: NavigationPointerMoveContext,
  pointerId: number,
  pointerType: string,
  screenPoint: Point,
): boolean {
  const {
    pointerPositionsRef, pinchRef, longPressStartRef, longPressTimerRef, selectionStartRef,
    setSelectionBox, eraseActiveRef, erasedIdsRef, isPanning, panStartRef, viewport, setViewport,
    findCandidates,
  } = context

  if (pointerType === 'touch' && pointerPositionsRef.current.has(pointerId)) {
    pointerPositionsRef.current.set(pointerId, screenPoint)
    if (pointerPositionsRef.current.size >= 2) {
      const points = [...pointerPositionsRef.current.values()]
      const center: Point = [(points[0][0] + points[1][0]) / 2, (points[0][1] + points[1][1]) / 2]
      const distance = Math.max(1, Math.hypot(points[0][0] - points[1][0], points[0][1] - points[1][1]))
      const previous = pinchRef.current
      if (previous) setViewport(value => {
        const zoomed = zoomAtScreenPoint(value, previous.center, distance / previous.distance)
        return { ...zoomed, panX: zoomed.panX + center[0] - previous.center[0], panY: zoomed.panY + center[1] - previous.center[1] }
      })
      pinchRef.current = { distance, center }
      return true
    }
    if (longPressStartRef.current?.pointerId === pointerId
      && Math.hypot(screenPoint[0] - longPressStartRef.current.point[0], screenPoint[1] - longPressStartRef.current.point[1]) > 8
      && longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  if (selectionStartRef.current) {
    setSelectionBox({ start: selectionStartRef.current, end: screenPoint })
    return true
  }

  if (eraseActiveRef.current) {
    const point = screenToWorld(screenPoint, viewport)
    for (const id of findCandidates(point, true)) erasedIdsRef.current.add(id)
    return true
  }

  if (isPanning) {
    const dx = screenPoint[0] - panStartRef.current[0]
    const dy = screenPoint[1] - panStartRef.current[1]
    panStartRef.current = screenPoint
    setViewport(value => ({ ...value, panX: value.panX + dx, panY: value.panY + dy }))
    return true
  }

  return false
}
