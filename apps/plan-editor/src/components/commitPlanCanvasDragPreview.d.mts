import type { CommandRequest } from '@constructflow/command-schema'
import type { DirectManipulationPreviewResult, PlanDragGesture } from '../directManipulation.mjs'

interface PlanCanvasDragPreviewOptions {
  drag: PlanDragGesture
  rawWorld: [number, number]
  ctrlKey: boolean
  hasManualDimensions: boolean
  movedPixels: number
  buildCommands: (drag: PlanDragGesture, rawWorld: [number, number], ctrlKey: boolean) => CommandRequest[]
  preview: (commands: CommandRequest[]) => DirectManipulationPreviewResult
  commit: (commands: CommandRequest[]) => unknown
  onRejected?: (errors: string[]) => void
}

export function commitPlanCanvasDragPreview(options: PlanCanvasDragPreviewOptions): void
