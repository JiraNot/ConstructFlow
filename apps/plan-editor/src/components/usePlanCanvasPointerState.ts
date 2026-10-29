import { useCallback, useRef, useState, type MutableRefObject } from 'react'
import type { ProjectDocument } from '@constructflow/project-model'
import { usePlanCanvasPointerCancel } from './usePlanCanvasPointerCancel.js'
import type { MeasureDragGesture, PlanCanvasDraggingObject, PlanSketchGesture, PlanSketchMode, WallDrawMode, WallTouchDrawGesture } from './planCanvasInteractionTypes.js'

interface UsePlanCanvasPointerStateOptions {
  manualDragPointRef: MutableRefObject<[number, number] | null>
  setResizeDimensionWidth: (value: string) => void
  setResizeDimensionHeight: (value: string) => void
  setResizeDimensionLength: (value: string) => void
  onCancelWallTouchGesture: (gesture: WallTouchDrawGesture) => void
}

export function usePlanCanvasPointerState({
  manualDragPointRef,
  setResizeDimensionWidth,
  setResizeDimensionHeight,
  setResizeDimensionLength,
  onCancelWallTouchGesture,
}: UsePlanCanvasPointerStateOptions) {
  const [isPanning, setIsPanning] = useState(false)
  const [objectContextMenu, setObjectContextMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [selectionBox, setSelectionBox] = useState<{ start: [number, number]; end: [number, number] } | null>(null)
  const [manipulationPreview, setManipulationPreview] = useState<{ project: ProjectDocument; ids: string[]; valid: boolean } | null>(null)
  const [dragPreviewPoint, setDragPreviewPoint] = useState<[number, number] | null>(null)
  const [dimensionEdit, setDimensionEdit] = useState<{ drag: PlanCanvasDraggingObject; point: [number, number] } | null>(null)
  const [wallTouchPreview, setWallTouchPreview] = useState<[number, number][] | null>(null)
  const [wallDrawMode, setWallDrawMode] = useState<WallDrawMode>('continuous-lines')
  const [sketchMode, setSketchModeState] = useState<PlanSketchMode>('polyline')
  const [sketchPoints, setSketchPoints] = useState<[number, number][]>([])
  const [draggingObject, setDraggingObject] = useState<PlanCanvasDraggingObject | null>(null)
  const wallTouchGestureRef = useRef<WallTouchDrawGesture | null>(null)
  const measureGestureRef = useRef<MeasureDragGesture | null>(null)
  const sketchGestureRef = useRef<PlanSketchGesture | null>(null)
  const panStartRef = useRef<[number, number]>([0, 0])
  const selectionStartRef = useRef<[number, number] | null>(null)
  const pointerPositionsRef = useRef(new Map<number, [number, number]>())
  const touchSelectionSnapshotRef = useRef<{ ids: string[]; primaryId: string | null } | null>(null)
  const pinchRef = useRef<{ distance: number; center: [number, number] } | null>(null)
  const pinchActiveRef = useRef(false)
  const longPressTimerRef = useRef<number | null>(null)
  const longPressStartRef = useRef<{ pointerId: number; point: [number, number] } | null>(null)
  const eraseActiveRef = useRef(false)
  const erasedIdsRef = useRef(new Set<string>())
  const selectionAdditiveRef = useRef(false)

  const cancelWallTouchGesture = useCallback(() => {
    const gesture = wallTouchGestureRef.current
    if (gesture) onCancelWallTouchGesture(gesture)
    wallTouchGestureRef.current = null
    setWallTouchPreview(null)
  }, [onCancelWallTouchGesture, wallTouchGestureRef, setWallTouchPreview])

  const clearPointerDrag = useCallback(() => {
    manualDragPointRef.current = null
    cancelWallTouchGesture()
    measureGestureRef.current = null
    setDraggingObject(null)
    setDimensionEdit(null)
    setDragPreviewPoint(null)
    setManipulationPreview(null)
    setIsPanning(false)
    sketchGestureRef.current = null
    setSketchPoints([])
    setResizeDimensionWidth('')
    setResizeDimensionHeight('')
    setResizeDimensionLength('')
  }, [manualDragPointRef, cancelWallTouchGesture, setResizeDimensionWidth, setResizeDimensionHeight, setResizeDimensionLength, setSketchPoints, setDimensionEdit])

  const setSketchMode = useCallback((mode: PlanSketchMode) => {
    setSketchModeState(mode)
    sketchGestureRef.current = null
    setSketchPoints([])
  }, [])

  const handlePointerCancel = usePlanCanvasPointerCancel({
    longPressTimerRef, longPressStartRef, pointerPositionsRef, touchSelectionSnapshotRef, pinchRef, pinchActiveRef,
    selectionStartRef, setSelectionBox, eraseActiveRef, erasedIdsRef, measureGestureRef,
    cancelDragGesture: clearPointerDrag,
  })

  return {
    isPanning, setIsPanning, objectContextMenu, setObjectContextMenu, selectionBox, setSelectionBox,
    manipulationPreview, setManipulationPreview, dragPreviewPoint, setDragPreviewPoint, dimensionEdit, setDimensionEdit,
    draggingObject, setDraggingObject, wallTouchGestureRef, measureGestureRef, sketchGestureRef, wallTouchPreview, setWallTouchPreview,
    sketchMode, setSketchMode, sketchPoints, setSketchPoints,
    wallDrawMode, setWallDrawMode, panStartRef, selectionStartRef, pointerPositionsRef, pinchRef,
    pinchActiveRef, longPressTimerRef, longPressStartRef, eraseActiveRef, erasedIdsRef, touchSelectionSnapshotRef,
    selectionAdditiveRef, clearPointerDrag, cancelWallTouchGesture, handlePointerCancel,
  }
}
