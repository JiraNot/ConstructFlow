import React, { lazy, Suspense, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ComponentProps } from 'react'
import { PlanCanvasAuthoringControls } from './PlanCanvasAuthoringControls.js'
import { PlanCanvasDrawingModeRail } from './PlanCanvasInteractionHints.js'
import type { PlanCanvasDragDimensionsProps } from './PlanCanvasDragDimensions.js'
import type { PlanCanvasInteractionHintsProps } from './PlanCanvasInteractionHints.js'
import type { PlanCanvasPlacementDimensionsProps } from './PlanCanvasPlacementDimensions.js'

const PlanCanvasDragDimensions = lazy(() => import('./PlanCanvasDragDimensions.js').then(module => ({ default: module.PlanCanvasDragDimensions })))
const PlanCanvasInteractionHints = lazy(() => import('./PlanCanvasInteractionHints.js').then(module => ({ default: module.PlanCanvasInteractionHints })))
const PlanCanvasPlacementDimensions = lazy(() => import('./PlanCanvasPlacementDimensions.js').then(module => ({ default: module.PlanCanvasPlacementDimensions })))

interface PlanCanvasInteractionOverlaysProps {
  portalToContextDock?: boolean
  hints: PlanCanvasInteractionHintsProps
  manipulation: PlanCanvasDragDimensionsProps | null
  placement: PlanCanvasPlacementDimensionsProps
  controls: ComponentProps<typeof PlanCanvasAuthoringControls>
}

export function PlanCanvasInteractionOverlays({ hints, manipulation, placement, controls, portalToContextDock = true }: PlanCanvasInteractionOverlaysProps) {
  const [layoutTargets, setLayoutTargets] = useState<{
    tabletLayout: boolean
    desktopControls: HTMLElement | null
    tabletControls: HTMLElement | null
    modes: HTMLElement | null
  }>({ tabletLayout: false, desktopControls: null, tabletControls: null, modes: null })
  useEffect(() => {
    // The compact drafting layout is useful on both tablet and desktop: keep
    // modes on the tool rail and settings in the bottom dock at any wide size.
    const tabletQuery = window.matchMedia('(min-width: 700px)')
    const update = () => setLayoutTargets({
      tabletLayout: tabletQuery.matches,
      desktopControls: document.getElementById('cf-tool-canvas-content'),
      tabletControls: document.getElementById('cf-tool-tablet-canvas-content'),
      modes: document.getElementById('cf-tool-draw-mode-content'),
    })
    update()
    tabletQuery.addEventListener('change', update)
    window.addEventListener('resize', update)
    return () => {
      tabletQuery.removeEventListener('change', update)
      window.removeEventListener('resize', update)
    }
  }, [])
  const showHints = hints.activeTool === 'select'
    ? Boolean(hints.escapeLabel || hints.showSelectionHandleHint || hints.pickCandidates.length > 1)
    : hints.activeTool === 'pan' ? false
    : Boolean(hints.placementHint || hints.canFinishPolygon || hints.escapeLabel || ['wall', 'measure', 'fill', 'draw'].includes(hints.activeTool))

  const hintsElement = showHints ? <Suspense fallback={null}><PlanCanvasInteractionHints {...hints} /></Suspense> : null
  const controlsElement = <PlanCanvasAuthoringControls {...controls} open={layoutTargets.tabletLayout ? true : controls.open} />
  const modesElement = <PlanCanvasDrawingModeRail {...hints} />

  return <>
    {layoutTargets.tabletLayout
      ? hintsElement
      : layoutTargets.desktopControls && portalToContextDock
        ? hintsElement && createPortal(hintsElement, layoutTargets.desktopControls)
        : hintsElement}
    {layoutTargets.tabletLayout && portalToContextDock && layoutTargets.tabletControls
      ? createPortal(controlsElement, layoutTargets.tabletControls)
      : layoutTargets.desktopControls && portalToContextDock
        ? createPortal(controlsElement, layoutTargets.desktopControls)
        : controlsElement}
    {layoutTargets.tabletLayout && layoutTargets.modes ? createPortal(modesElement, layoutTargets.modes) : null}
    {manipulation && <Suspense fallback={null}><PlanCanvasDragDimensions {...manipulation} /></Suspense>}
    {(placement.position || placement.hasLineGeometryInput) && <Suspense fallback={null}><PlanCanvasPlacementDimensions {...placement} /></Suspense>}
  </>
}
