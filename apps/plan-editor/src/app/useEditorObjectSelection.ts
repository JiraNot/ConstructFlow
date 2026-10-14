import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import { EMPTY_EDITOR_SELECTION, selectObjectSet, selectPrimaryObject } from './editorObjectSelection.mjs'

export function useEditorObjectSelection() {
  const [selection, setSelection] = useState(EMPTY_EDITOR_SELECTION)

  const setSelectedId = useCallback<Dispatch<SetStateAction<string | null>>>(value => {
    setSelection(current => selectPrimaryObject(
      current,
      typeof value === 'function' ? value(current.selectedId) : value,
    ))
  }, [])

  const setSelectedIds = useCallback<Dispatch<SetStateAction<string[]>>>(value => {
    setSelection(current => selectObjectSet(
      current,
      typeof value === 'function' ? value(current.selectedIds) : value,
    ))
  }, [])

  return {
    selectedId: selection.selectedId,
    selectedIds: selection.selectedIds,
    setSelectedId,
    setSelectedIds,
  }
}
