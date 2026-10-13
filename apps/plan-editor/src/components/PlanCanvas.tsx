import React from 'react'
import { PlanCanvasSurface } from './PlanCanvasSurface.js'
import type { PlanCanvasProps } from './PlanCanvas.types.js'
import { usePlanCanvasController } from './usePlanCanvasController.js'
export type { PlanCanvasProps } from './PlanCanvas.types.js'

/** Plan canvas entry point; interaction orchestration lives in usePlanCanvasController. */
export const PlanCanvas: React.FC<PlanCanvasProps> = props => {
  const surface = usePlanCanvasController(props)
  return <PlanCanvasSurface {...surface} />
}
