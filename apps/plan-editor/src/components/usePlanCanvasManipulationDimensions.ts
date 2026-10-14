import type { RefObject } from 'react'
import type { DisplayLengthUnit, ProjectDocument } from '@constructflow/project-model'
import type { CommandRequest } from '@constructflow/command-schema'
import { formatLengthMm } from '@constructflow/project-model'
import type { ViewportState } from '../viewport/viewportTransform.js'
import { worldToScreen } from '../viewport/viewportTransform.js'
import type { DragDimensionMode } from './PlanCanvasDragDimensions.js'
import type { PlanCanvasDraggingObject } from './planCanvasInteractionTypes.js'
import type { usePlanCanvasDragDimensions } from './usePlanCanvasDragDimensions.js'
import type { usePlanCanvasManipulationPreview } from './usePlanCanvasManipulationPreview.js'
import { getPlanObjectBounds } from './PlanCanvasGeometry.js'

interface UsePlanCanvasManipulationDimensionsOptions {
  containerRef: RefObject<HTMLDivElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  planProject: ProjectDocument
  viewport: ViewportState
  displayUnit: DisplayLengthUnit
  dragDimensions: ReturnType<typeof usePlanCanvasDragDimensions>
  draggingObject: PlanCanvasDraggingObject | null
  dragPreviewPoint: [number, number] | null
  manipulationPreview: { project: ProjectDocument; ids: string[]; valid: boolean } | null
  setDraggingObject: (drag: PlanCanvasDraggingObject | null) => void
  setDragPreviewPoint: (point: [number, number] | null) => void
  setManipulationPreview: (preview: { project: ProjectDocument; ids: string[]; valid: boolean } | null) => void
  previewDragAt: ReturnType<typeof usePlanCanvasManipulationPreview>['previewDragAt']
  onCommitManipulation: (commands: CommandRequest[]) => { status: string; errors?: string[] }
  onManipulationRejected?: (errors: string[]) => void
}

export function usePlanCanvasManipulationDimensions({
  containerRef, canvasRef, planProject, viewport, displayUnit, dragDimensions, draggingObject,
  dragPreviewPoint, manipulationPreview, setDraggingObject, setDragPreviewPoint,
  setManipulationPreview, previewDragAt, onCommitManipulation, onManipulationRejected,
}: UsePlanCanvasManipulationDimensionsOptions) {
  const updateMoveDimension = (axis: 'x' | 'y', value: string) =>
    dragDimensions.updateMove(draggingObject, axis, value, previewDragAt)
  const updateResizeDimension = (axis: 'width' | 'height' | 'length' | 'offset', value: string) =>
    dragDimensions.updateResize(draggingObject, axis, value, previewDragAt)

  const commitDragDimensions = () => {
    if (!draggingObject || !dragDimensions.manualPointRef.current) return
    const { commands, valid } = previewDragAt(draggingObject, dragDimensions.manualPointRef.current, true, true)
    if (commands.length && valid) onCommitManipulation(commands)
    else if (commands.length) onManipulationRejected?.(['ไม่สามารถใช้มิติที่ระบุได้'])
    dragDimensions.manualPointRef.current = null
    setDraggingObject(null)
    setDragPreviewPoint(null)
    setManipulationPreview(null)
    dragDimensions.clearResizeValues()
    canvasRef.current?.focus({ preventScroll: true })
  }

  const dimensions = draggingObject && dragPreviewPoint
    ? (() => {
        const original = planProject.objects[draggingObject.id]
        const preview = manipulationPreview?.project.objects[draggingObject.id] ?? original
        if (!original || !preview) return null
        const dx = dragPreviewPoint[0] - draggingObject.startWorldMm[0]
        const dy = dragPreviewPoint[1] - draggingObject.startWorldMm[1]
        const bounds = getPlanObjectBounds(preview)
        const data = preview.module_data as unknown as Record<string, unknown>
        const start = data.start_point_mm as [number, number] | undefined
        const end = data.end_point_mm as [number, number] | undefined
        const length = start && end ? Math.hypot(end[0] - start[0], end[1] - start[1]) : null
        return { dx, dy, width: bounds ? bounds[2] - bounds[0] : null, height: bounds ? bounds[3] - bounds[1] : null, length }
      })()
    : null

  const rectangle = draggingObject?.kind === 'column-corner' || draggingObject?.kind === 'foundation-corner'
  const openingWidth = draggingObject?.kind === 'opening-edge'
  const stairWidth = draggingObject?.kind === 'stair-width'
  const stairRun = draggingObject?.kind === 'stair-run'
  const stairLanding = draggingObject?.kind === 'stair-landing'
  const stairFirstFlight = draggingObject?.kind === 'stair-first-flight'
  const stairSecondFlight = draggingObject?.kind === 'stair-second-flight'
  const slabEdgeOffset = draggingObject?.kind === 'slab-edge'
  const lineLength = draggingObject?.kind === 'wall-endpoint' || draggingObject?.kind === 'beam-endpoint' || draggingObject?.kind === 'grid-endpoint' || draggingObject?.kind === 'separator-endpoint' || draggingObject?.kind === 'pipe-endpoint' || draggingObject?.kind === 'moulding-endpoint'
  const mode: DragDimensionMode = rectangle ? 'rectangle' : openingWidth ? 'opening-width' : stairWidth ? 'stair-width' : stairRun ? 'stair-run' : stairLanding ? 'stair-landing' : stairFirstFlight ? 'stair-first-flight' : stairSecondFlight ? 'stair-second-flight' : slabEdgeOffset ? 'edge-offset' : lineLength ? 'line-length' : 'move'
  const readout = slabEdgeOffset
    ? `ระยะขอบ ${dragDimensions.offset || '0'} ${displayUnit}`
    : dimensions?.length !== null && dimensions?.length !== undefined
    ? `L ${formatLengthMm(dimensions.length, displayUnit)} ${displayUnit}`
    : dimensions?.width !== null && dimensions?.width !== undefined && dimensions?.height !== null && dimensions?.height !== undefined
      ? `W×H ${formatLengthMm(dimensions.width, displayUnit)} × ${formatLengthMm(dimensions.height, displayUnit)} ${displayUnit}`
      : null
  const screenPoint = dragPreviewPoint ? worldToScreen(dragPreviewPoint, viewport) : null
  const style = screenPoint ? {
    left: Math.max(8, Math.min(screenPoint[0] + 16, (containerRef.current?.clientWidth ?? 800) - 220)),
    top: Math.max(8, Math.min(screenPoint[1] + 16, (containerRef.current?.clientHeight ?? 600) - 92)),
  } : undefined

  return {
    dimensions,
    mode,
    values: { x: dragDimensions.moveX, y: dragDimensions.moveY, width: dragDimensions.width, height: dragDimensions.height, length: dragDimensions.length, offset: dragDimensions.offset },
    readout,
    style,
    updateMoveDimension,
    updateResizeDimension,
    commitDragDimensions,
  }
}
