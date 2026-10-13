import { useCallback, useRef, useState, type MutableRefObject } from 'react'
import type { ProjectDocument } from '@constructflow/project-model'
import { usePlanCanvasPointerCancel } from './usePlanCanvasPointerCancel.js'
import type { PlanCanvasDraggingObject } from './planCanvasInteractionTypes.js'

interface UsePlanCanvasPointerStateOptions {
  manualDragPointRef: MutableRefObject<[number, number] | null>
  setResizeDimensionWidth: (value: string) => void
  setResizeDimensionHeight: (value: string) => void
  setResizeDimensionLength: (value: string) => void
}

export function usePlanCanvasPointerState({
  manualDragPointRef,
  setResizeDimensionWidth,
  setResizeDimensionHeight,
  setResizeDimensionLength,
}: UsePlanCanvasPointerStateOptions) {
  const [isPanning, setIsPanning] = useState(false)
  const [objectContextMenu, setObjectContextMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [selectionBox, setSelectionBox] = useState<{ start: [number, number]; end: [number, number] } | null>(null)
  const [manipulationPreview, setManipulationPreview] = useState<{ project: ProjectDocument; ids: string[]; valid: boolean } | null>(null)
  const [dragPreviewPoint, setDragPreviewPoint] = useState<[number, number] | null>(null)
  const [draggingObject, setDraggingObject] = useState<PlanCanvasDraggingObject | null>(null)
  const panStartRef = useRef<[number, number]>([0, 0])
  const selectionStartRef = useRef<[number, number] | null>(null)
  const pointerPositionsRef = useRef(new Map<number, [number, number]>())
  const pinchRef = useRef<{ distance: number; center: [number, number] } | null>(null)
  const pinchActiveRef = useRef(false)
  const longPressTimerRef = useRef<number | null>(null)
  const longPressStartRef = useRef<{ pointerId: number; point: [number, number] } | null>(null)
  const eraseActiveRef = useRef(false)
  const erasedIdsRef = useRef(new Set<string>())
  const selectionAdditiveRef = useRef(false)

  const clearPointerDrag = useCallback(() => {
    manualDragPointRef.current = null
    setDraggingObject(null)
    setDragPreviewPoint(null)
    setManipulationPreview(null)
    setIsPanning(false)
    setResizeDimensionWidth('')
    setResizeDimensionHeight('')
    setResizeDimensionLength('')
  }, [manualDragPointRef, setResizeDimensionWidth, setResizeDimensionHeight, setResizeDimensionLength])

  const handlePointerCancel = usePlanCanvasPointerCancel({
    longPressTimerRef, longPressStartRef, pointerPositionsRef, pinchRef, pinchActiveRef,
    selectionStartRef, setSelectionBox, eraseActiveRef, erasedIdsRef, cancelDragGesture: clearPointerDrag,
  })

  return {
    isPanning, setIsPanning, objectContextMenu, setObjectContextMenu, selectionBox, setSelectionBox,
    manipulationPreview, setManipulationPreview, dragPreviewPoint, setDragPreviewPoint,
    draggingObject, setDraggingObject, panStartRef, selectionStartRef, pointerPositionsRef, pinchRef,
    pinchActiveRef, longPressTimerRef, longPressStartRef, eraseActiveRef, erasedIdsRef,
    selectionAdditiveRef, clearPointerDrag, handlePointerCancel,
  }
}
