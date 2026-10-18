import React, { lazy, Suspense } from 'react'
import type { ComponentProps } from 'react'
import { PlanCanvasAuthoringControls } from './PlanCanvasAuthoringControls.js'
import type { PlanCanvasDragDimensionsProps } from './PlanCanvasDragDimensions.js'
import type { PlanCanvasInteractionHintsProps } from './PlanCanvasInteractionHints.js'
import type { PlanCanvasPlacementDimensionsProps } from './PlanCanvasPlacementDimensions.js'

const PlanCanvasDragDimensions = lazy(() => import('./PlanCanvasDragDimensions.js').then(module => ({ default: module.PlanCanvasDragDimensions })))
const PlanCanvasInteractionHints = lazy(() => import('./PlanCanvasInteractionHints.js').then(module => ({ default: module.PlanCanvasInteractionHints })))
const PlanCanvasPlacementDimensions = lazy(() => import('./PlanCanvasPlacementDimensions.js').then(module => ({ default: module.PlanCanvasPlacementDimensions })))

interface PlanCanvasInteractionOverlaysProps {
  hints: PlanCanvasInteractionHintsProps
  manipulation: PlanCanvasDragDimensionsProps | null
  placement: PlanCanvasPlacementDimensionsProps
  controls: ComponentProps<typeof PlanCanvasAuthoringControls>
}

export function PlanCanvasInteractionOverlays({ hints, manipulation, placement, controls }: PlanCanvasInteractionOverlaysProps) {
  const showHints = hints.activeTool === 'select'
    ? Boolean(hints.escapeLabel || hints.showSelectionHandleHint || hints.pickCandidates.length > 1)
    : Boolean(hints.placementHint || hints.canFinishPolygon || hints.escapeLabel)

  return <>
    {showHints && <Suspense fallback={null}><PlanCanvasInteractionHints {...hints} /></Suspense>}
    {manipulation && <Suspense fallback={null}><PlanCanvasDragDimensions {...manipulation} /></Suspense>}
    {(placement.position || placement.hasLineGeometryInput) && <Suspense fallback={null}><PlanCanvasPlacementDimensions {...placement} /></Suspense>}
    <PlanCanvasAuthoringControls {...controls} />
  </>
}
