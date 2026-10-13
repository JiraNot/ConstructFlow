/** Resolve a completed canvas marquee against semantic plan-object bounds. */
export function resolvePlanCanvasBoxSelection(box, candidates, selectedIds = [], additive = false) {
  const containedIds = candidates
    .filter(({ bounds }) => bounds && bounds[0] <= box[2] && bounds[2] >= box[0] && bounds[1] <= box[3] && bounds[3] >= box[1])
    .map(({ id }) => id)

  return additive ? [...new Set([...selectedIds, ...containedIds])] : containedIds
}
