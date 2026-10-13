import type { MutableRefObject, PointerEvent as ReactPointerEvent } from 'react'
import type { ViewportState } from '../viewport/viewportTransform.js'
import { screenToWorld } from '../viewport/viewportTransform.js'

interface PlanCanvasPointerDownNavigationOptions {
  event: ReactPointerEvent<Element>
  screenPoint: [number, number]
  activeTool: string
  viewport: ViewportState
  pointerPositionsRef: MutableRefObject<Map<number, [number, number]>>
  pinchRef: MutableRefObject<{ distance: number; center: [number, number] } | null>
  pinchActiveRef: MutableRefObject<boolean>
  longPressStartRef: MutableRefObject<{ pointerId: number; point: [number, number] } | null>
  longPressTimerRef: MutableRefObject<number | null>
  selectionStartRef: MutableRefObject<[number, number] | null>
  panStartRef: MutableRefObject<[number, number] | null>
  setSelectionBox: (value: null) => void
  setDraggingObject: (value: null) => void
  setIsPanning: (value: boolean) => void
  setObjectContextMenu: (menu: { id: string; x: number; y: number } | null) => void
  findHitObject: (point: [number, number], cycle?: boolean) => string | null
  onSelectionChange?: (ids: string[], primaryId: string | null) => void
  onSelectObject: (id: string | null) => void
  setPointerCapture: (pointerId: number) => void
}

/** Handles canvas gestures that navigate or open context actions before authoring starts. */
export function handlePlanCanvasPointerDownNavigation({
  event,
  screenPoint,
  activeTool,
  viewport,
  pointerPositionsRef,
  pinchRef,
  pinchActiveRef,
  longPressStartRef,
  longPressTimerRef,
  selectionStartRef,
  panStartRef,
  setSelectionBox,
  setDraggingObject,
  setIsPanning,
  setObjectContextMenu,
  findHitObject,
  onSelectionChange,
  onSelectObject,
  setPointerCapture,
}: PlanCanvasPointerDownNavigationOptions): boolean {
  const [screenX, screenY] = screenPoint

  if (event.button === 2) {
    event.preventDefault()
    const hitId = findHitObject(screenToWorld(screenPoint, viewport), event.shiftKey)
    if (hitId) {
      onSelectionChange?.([hitId], hitId)
      onSelectObject(hitId)
      setObjectContextMenu({ id: hitId, x: screenX, y: screenY })
    } else {
      setObjectContextMenu(null)
    }
    return true
  }

  if (event.pointerType === 'touch') {
    pointerPositionsRef.current.set(event.pointerId, screenPoint)
    try { setPointerCapture(event.pointerId) } catch {}
    if (pointerPositionsRef.current.size >= 2) {
      if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
      selectionStartRef.current = null
      setSelectionBox(null)
      setDraggingObject(null)
      setIsPanning(false)
      const points = [...pointerPositionsRef.current.values()]
      pinchRef.current = {
        distance: Math.max(1, Math.hypot(points[0][0] - points[1][0], points[0][1] - points[1][1])),
        center: [(points[0][0] + points[1][0]) / 2, (points[0][1] + points[1][1]) / 2],
      }
      pinchActiveRef.current = true
      return true
    }

    if (activeTool === 'select') {
      longPressStartRef.current = { pointerId: event.pointerId, point: screenPoint }
      longPressTimerRef.current = window.setTimeout(() => {
        const point = longPressStartRef.current?.point
        if (!point) return
        longPressTimerRef.current = null
        const hitId = findHitObject(screenToWorld(point, viewport), false)
        setDraggingObject(null)
        selectionStartRef.current = null
        setSelectionBox(null)
        if (hitId) {
          onSelectionChange?.([hitId], hitId)
          onSelectObject(hitId)
          setObjectContextMenu({ id: hitId, x: point[0], y: point[1] })
        } else {
          setObjectContextMenu(null)
          panStartRef.current = point
          setIsPanning(true)
        }
      }, 500)
    }
  }

  if (event.button === 1) {
    setIsPanning(true)
    panStartRef.current = screenPoint
    setPointerCapture(event.pointerId)
    return true
  }

  return false
}
