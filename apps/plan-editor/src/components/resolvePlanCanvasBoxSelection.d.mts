type PlanObjectBounds = [number, number, number, number]

interface PlanCanvasSelectionCandidate {
  id: string
  bounds: PlanObjectBounds | null
}

export function resolvePlanCanvasBoxSelection(
  box: PlanObjectBounds,
  candidates: PlanCanvasSelectionCandidate[],
  selectedIds?: string[],
  additive?: boolean,
): string[]
