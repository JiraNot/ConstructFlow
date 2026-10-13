import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProjectDocument } from '@constructflow/project-model'
import type { ViewportState } from '../viewport/viewportTransform.js'
import type { PlanCanvasProps } from './PlanCanvas.types.js'
import { findPlanHitObject } from './planHitTesting.mjs'
import { resolvePlanCanvasPickCandidates } from './resolvePlanCanvasPickCandidates.mjs'
import type { ToolType } from './Toolbar.js'

interface UsePlanCanvasPickingOptions {
  project: ProjectDocument
  planProject: ProjectDocument
  viewport: ViewportState
  activeTool: ToolType
  selectedId: string | null
  onSelectObject: PlanCanvasProps['onSelectObject']
  onSelectionChange?: PlanCanvasProps['onSelectionChange']
}

export function usePlanCanvasPicking({
  project, planProject, viewport, activeTool, selectedId, onSelectObject, onSelectionChange,
}: UsePlanCanvasPickingOptions) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [pickCandidates, setPickCandidates] = useState<string[]>([])
  const pickCandidatesRef = useRef<string[]>([])

  const setCandidates = useCallback((ids: string[]) => {
    if (ids.join('|') === pickCandidatesRef.current.join('|')) return
    pickCandidatesRef.current = ids
    setPickCandidates(ids)
  }, [])

  const findHitObject = useCallback((worldPointMm: [number, number], preferWall = false, excluded = new Set<string>()): string | null =>
    findPlanHitObject(worldPointMm, planProject, project, viewport.zoom, preferWall, excluded),
  [planProject, project, viewport.zoom])

  const findCandidates = useCallback((point: [number, number], preferWall = false) =>
    resolvePlanCanvasPickCandidates(planProject, findHitObject, point, preferWall),
  [planProject, findHitObject])

  const cyclePick = useCallback((reverse = false) => {
    const ids = pickCandidatesRef.current.filter(id => !!planProject.objects[id])
    if (ids.length < 2) return
    const current = ids.indexOf(hoveredId ?? selectedId ?? '')
    const next = ids[(current + (reverse ? -1 : 1) + ids.length) % ids.length]
    setHoveredId(next)
    onSelectionChange?.([next], next)
    onSelectObject(next)
  }, [hoveredId, selectedId, onSelectObject, onSelectionChange, planProject])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || activeTool !== 'select' || pickCandidatesRef.current.length < 2) return
      if (document.querySelector('[role="dialog"]')) return
      if (event.target instanceof HTMLElement && (event.target.matches('input,select,textarea,button,a') || event.target.isContentEditable)) return
      event.preventDefault()
      cyclePick(event.shiftKey)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [cyclePick, activeTool])

  useEffect(() => { setCandidates([]) }, [activeTool, planProject, setCandidates])

  return { hoveredId, setHoveredId, pickCandidates, setCandidates, findHitObject, findCandidates, cyclePick }
}
