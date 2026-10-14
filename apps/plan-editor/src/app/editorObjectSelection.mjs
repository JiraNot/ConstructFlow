export const EMPTY_EDITOR_SELECTION = Object.freeze({ selectedId: null, selectedIds: Object.freeze([]) })

export function selectPrimaryObject(selection, requestedId) {
  if (!requestedId) return EMPTY_EDITOR_SELECTION
  if (selection.selectedIds.includes(requestedId)) {
    return { selectedId: requestedId, selectedIds: selection.selectedIds }
  }
  return { selectedId: requestedId, selectedIds: [requestedId] }
}

export function selectObjectSet(selection, requestedIds) {
  const selectedIds = [...new Set(requestedIds.filter(Boolean))]
  const selectedId = selection.selectedId && selectedIds.includes(selection.selectedId)
    ? selection.selectedId
    : selectedIds[0] ?? null
  return { selectedId, selectedIds }
}
