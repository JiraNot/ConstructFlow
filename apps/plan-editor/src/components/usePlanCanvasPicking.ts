import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProjectDocument } from '@constructflow/project-model'
import type { ViewportState } from '../viewport/viewportTransform.js'
import type { PlanCanvasProps } from './PlanCanvas.types.js'
import { findPlanHitCandidates, findPlanHitObject } from './planHitTesting.mjs'
import type { ToolType } from './Toolbar.js'
import { matchesPlanSelectionScope } from './planSelectionScope.js'

interface UsePlanCanvasPickingOptions {
  project: ProjectDocument
  planProject: ProjectDocument
  viewport: ViewportState
  activeTool: ToolType
  selectionScope?: ToolType | null
  selectedId: string | null
  onSelectObject: PlanCanvasProps['onSelectObject']
  onSelectionChange?: PlanCanvasProps['onSelectionChange']
}

export function usePlanCanvasPicking({
  project, planProject, viewport, activeTool, selectionScope = null, selectedId, onSelectObject, onSelectionChange,
}: UsePlanCanvasPickingOptions) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [pickCandidates, setPickCandidates] = useState<string[]>([])
  const pickCandidatesRef = useRef<string[]>([])
  const pickPointRef = useRef<[number, number] | null>(null)
  const chosenCandidateRef = useRef<{ id: string; point: [number, number] } | null>(null)

  const setCandidates = useCallback((ids: string[]) => {
    if (ids.join('|') === pickCandidatesRef.current.join('|')) return
    pickCandidatesRef.current = ids
    setPickCandidates(ids)
  }, [])

  const findHitObject = useCallback((worldPointMm: [number, number], preferWall = false, excluded = new Set<string>()): string | null => {
    if (!selectionScope) return findPlanHitObject(worldPointMm, planProject, project, viewport.zoom, preferWall, excluded)
    return findPlanHitCandidates(worldPointMm, planProject, project, viewport.zoom, preferWall, excluded)
      .find(id => matchesPlanSelectionScope(planProject.objects[id], selectionScope)) ?? null
  }, [planProject, project, viewport.zoom, selectionScope])

  const findCandidates = useCallback((point: [number, number], preferWall = false) => {
    const candidates = findPlanHitCandidates(point, planProject, project, viewport.zoom, preferWall)
    const ids = selectionScope
      ? candidates.filter(id => matchesPlanSelectionScope(planProject.objects[id], selectionScope))
      : candidates
    pickPointRef.current = point
    const chosen = chosenCandidateRef.current
    if (chosen && (!ids.includes(chosen.id) || Math.hypot(point[0] - chosen.point[0], point[1] - chosen.point[1]) * viewport.zoom > 6)) chosenCandidateRef.current = null
    // An explicit Tab/list choice survives small pointer movement so it can be
    // dragged. Ordinary hover always follows the nearest visible geometry.
    if (!preferWall && chosenCandidateRef.current) {
      const index = ids.indexOf(chosenCandidateRef.current.id)
      return [...ids.slice(index), ...ids.slice(0, index)]
    }
    return ids
  }, [planProject, project, viewport.zoom, selectionScope])

  const chooseCandidate = useCallback((id: string) => {
    if (pickPointRef.current) chosenCandidateRef.current = { id, point: [...pickPointRef.current] }
    setHoveredId(id)
  }, [])

  const cyclePick = useCallback((reverse = false) => {
    const ids = pickCandidatesRef.current.filter(id => !!planProject.objects[id])
    if (ids.length < 2) return
    const current = ids.indexOf(hoveredId ?? selectedId ?? '')
    const next = ids[(current + (reverse ? -1 : 1) + ids.length) % ids.length]
    chooseCandidate(next)
    onSelectionChange?.([next], next)
    onSelectObject(next)
  }, [hoveredId, selectedId, onSelectObject, onSelectionChange, planProject, chooseCandidate])

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

  useEffect(() => {
    chosenCandidateRef.current = null
    pickPointRef.current = null
    setHoveredId(null)
    setCandidates([])
  }, [activeTool, selectionScope, planProject, setCandidates])

  useEffect(() => {
    if (selectedId === null) chosenCandidateRef.current = null
  }, [selectedId])

  return { hoveredId, setHoveredId, chooseCandidate, pickCandidates, setCandidates, findHitObject, findCandidates, cyclePick }
}
