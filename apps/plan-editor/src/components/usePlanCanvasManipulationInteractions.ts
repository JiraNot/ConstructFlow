import type { DisplayLengthUnit, ProjectDocument } from '@constructflow/project-model'
import type { CommandRequest } from '@constructflow/command-schema'
import type { DirectManipulationPreviewResult } from '../directManipulation.mjs'
import type { ViewportState } from '../viewport/viewportTransform.js'
import { buildPlanCanvasDragCommands } from './buildPlanCanvasDragCommands.js'
import { usePlanCanvasDragDimensions } from './usePlanCanvasDragDimensions.js'
import { usePlanCanvasManipulationDimensions } from './usePlanCanvasManipulationDimensions.js'
import { usePlanCanvasManipulationPreview } from './usePlanCanvasManipulationPreview.js'
import type { usePlanCanvasSnapping } from './usePlanCanvasSnapping.js'
import type { PlanCanvasDraggingObject } from './planCanvasInteractionTypes.js'

interface UsePlanCanvasManipulationInteractionsOptions {
  containerRef: Parameters<typeof usePlanCanvasManipulationDimensions>[0]['containerRef']
  canvasRef: Parameters<typeof usePlanCanvasManipulationDimensions>[0]['canvasRef']
  planProject: ProjectDocument
  viewport: ViewportState
  displayUnit: DisplayLengthUnit
  precision?: number
  dragDimensions: ReturnType<typeof usePlanCanvasDragDimensions>
  draggingObject: PlanCanvasDraggingObject | null
  dimensionEdit: { drag: PlanCanvasDraggingObject; point: [number, number] } | null
  dragPreviewPoint: [number, number] | null
  manipulationPreview: { project: ProjectDocument; ids: string[]; valid: boolean } | null
  setDraggingObject: (drag: PlanCanvasDraggingObject | null) => void
  setDimensionEdit: (edit: { drag: PlanCanvasDraggingObject; point: [number, number] } | null) => void
  setDragPreviewPoint: Parameters<typeof usePlanCanvasManipulationPreview>[0]['setDragPreviewPoint']
  setManipulationPreview: Parameters<typeof usePlanCanvasManipulationPreview>[0]['setManipulationPreview']
  snapPlanPoint: ReturnType<typeof usePlanCanvasSnapping>['snapPlanPoint']
  onPreviewManipulation: (commands: CommandRequest[]) => DirectManipulationPreviewResult
  onCommitManipulation: (commands: CommandRequest[]) => { status: string; errors?: string[] }
  onManipulationRejected?: (errors: string[]) => void
}

/** Owns the move/resize interaction loop from preview validation through typed commit. */
export function usePlanCanvasManipulationInteractions({
  containerRef, canvasRef, planProject, viewport, displayUnit, precision, dragDimensions, draggingObject, dimensionEdit,
  dragPreviewPoint, manipulationPreview, setDraggingObject, setDimensionEdit, setDragPreviewPoint, setManipulationPreview,
  snapPlanPoint, onPreviewManipulation, onCommitManipulation, onManipulationRejected,
}: UsePlanCanvasManipulationInteractionsOptions) {
  const activeDrag = draggingObject ?? dimensionEdit?.drag ?? null
  const activePoint = dragPreviewPoint ?? dimensionEdit?.point ?? null
  const buildDragCommands = (drag: Parameters<typeof buildPlanCanvasDragCommands>[0]['drag'], rawWorld: [number, number], ctrlKey: boolean) =>
    buildPlanCanvasDragCommands({ planProject, drag, rawWorld, ctrlKey, viewport, snapPlanPoint })
  const previewState = usePlanCanvasManipulationPreview({
    planProject,
    dragging: Boolean(activeDrag),
    buildCommands: buildDragCommands,
    syncDimensions: dragDimensions.syncFromPreview,
    manualDragPointRef: dragDimensions.manualPointRef,
    setDragPreviewPoint,
    setManipulationPreview,
    onPreviewManipulation,
  })
  const dimensionState = usePlanCanvasManipulationDimensions({
    containerRef, canvasRef, planProject, viewport, displayUnit, precision, dragDimensions,
    draggingObject: activeDrag, dragPreviewPoint: activePoint, manipulationPreview, setDraggingObject, setDimensionEdit, setDragPreviewPoint,
    setManipulationPreview, cancelPendingPreview: previewState.cancelPendingPreview,
    onCommitManipulation, onManipulationRejected,
    previewDragAt: previewState.previewDragAt,
  })
  return { ...previewState, ...dimensionState, buildDragCommands, activeDrag, activePoint }
}
