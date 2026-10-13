import type { ComponentProps } from 'react'
import { PlanCanvasAuthoringControls } from './PlanCanvasAuthoringControls.js'
import { PlanCanvasDragDimensions } from './PlanCanvasDragDimensions.js'
import { PlanCanvasInteractionHints } from './PlanCanvasInteractionHints.js'
import { PlanCanvasPlacementDimensions } from './PlanCanvasPlacementDimensions.js'

interface PlanCanvasInteractionOverlaysProps {
  hints: ComponentProps<typeof PlanCanvasInteractionHints>
  manipulation: ComponentProps<typeof PlanCanvasDragDimensions> | null
  placement: ComponentProps<typeof PlanCanvasPlacementDimensions>
  controls: ComponentProps<typeof PlanCanvasAuthoringControls>
}

export function PlanCanvasInteractionOverlays({ hints, manipulation, placement, controls }: PlanCanvasInteractionOverlaysProps) {
  return <>
    <PlanCanvasInteractionHints {...hints} />
    {manipulation && <PlanCanvasDragDimensions {...manipulation} />}
    <PlanCanvasPlacementDimensions {...placement} />
    <PlanCanvasAuthoringControls {...controls} />
  </>
}
