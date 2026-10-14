export interface EditorObjectSelection {
  selectedId: string | null
  selectedIds: string[]
}

export const EMPTY_EDITOR_SELECTION: EditorObjectSelection
export function selectPrimaryObject(selection: EditorObjectSelection, requestedId: string | null): EditorObjectSelection
export function selectObjectSet(selection: EditorObjectSelection, requestedIds: string[], preferredPrimaryId?: string | null): EditorObjectSelection
