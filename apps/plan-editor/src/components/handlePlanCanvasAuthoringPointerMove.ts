import type { Dispatch, SetStateAction } from 'react'
import type { ProjectDocument } from '@constructflow/project-model'
import type { SnapResult, WallHostSnapResult } from '@constructflow/snapping-engine'
import { screenToWorld, type ViewportState } from '../viewport/viewportTransform.js'
import type { PlanCanvasDraggingObject } from './planCanvasInteractionTypes.js'

type Point = [number, number]

interface HandlePlanCanvasAuthoringPointerMoveOptions {
  event: React.PointerEvent<HTMLCanvasElement>
  screenPoint: Point
  canvas: HTMLCanvasElement
  activeTool: string
  viewport: ViewportState
  draggingObject: PlanCanvasDraggingObject | null
  hoveredId: string | null
  resolveSnap: (rawWorld: Point, ctrlKey: boolean, shiftKey: boolean) => { snap: SnapResult; wallSnap: WallHostSnapResult | null }
  findCandidates: (point: Point, preferWall?: boolean) => string[]
  setActiveWallSnap: Dispatch<SetStateAction<WallHostSnapResult | null>>
  setActiveSnap: Dispatch<SetStateAction<SnapResult | null>>
  setTapeMeasure: Dispatch<SetStateAction<{ start: Point; end: Point; complete: boolean } | null>>
  setCalibrationMousePoint: Dispatch<SetStateAction<Point | null>>
  setCandidates: (ids: string[]) => void
  setHoveredId: Dispatch<SetStateAction<string | null>>
  setManipulationPreview: Dispatch<SetStateAction<{ project: ProjectDocument; ids: string[]; valid: boolean } | null>>
  onCursorChange: (coordsMm: Point, snapKind: string) => void
  previewDragAt: (drag: PlanCanvasDraggingObject, point: Point, ctrlKey: boolean) => void
}

export function handlePlanCanvasAuthoringPointerMove({
  event,
  screenPoint,
  canvas,
  activeTool,
  viewport,
  draggingObject,
  hoveredId,
  resolveSnap,
  findCandidates,
  setActiveWallSnap,
  setActiveSnap,
  setTapeMeasure,
  setCalibrationMousePoint,
  setCandidates,
  setHoveredId,
  setManipulationPreview,
  onCursorChange,
  previewDragAt,
}: HandlePlanCanvasAuthoringPointerMoveOptions) {
  const [screenX, screenY] = screenPoint
  if (activeTool !== 'select' && activeTool !== 'erase' && event.pointerType === 'mouse' && document.activeElement !== canvas) {
    canvas.focus({ preventScroll: true })
  }

  const rawWorld = screenToWorld(screenPoint, viewport)
  const { snap, wallSnap } = resolveSnap(rawWorld, event.ctrlKey, event.shiftKey)
  setActiveWallSnap(wallSnap)
  setActiveSnap(snap)
  onCursorChange(snap.point_mm, snap.description)
  if (activeTool === 'measure') setTapeMeasure(current => current && !current.complete ? { ...current, end: snap.point_mm } : current)
  if (activeTool === 'calibrate') setCalibrationMousePoint(rawWorld)

  const candidates = findCandidates(rawWorld)
  if (activeTool === 'select' && !draggingObject) setCandidates(candidates)
  setHoveredId(candidates[0] ?? null)

  if (draggingObject) {
    const moved = Math.hypot(screenX - draggingObject.startScreenPx[0], screenY - draggingObject.startScreenPx[1])
    if (moved >= 3) previewDragAt(draggingObject, rawWorld, event.ctrlKey)
    else setManipulationPreview(null)
  }
}
