import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { useProjectSession } from './useProjectSession.js'
import type { useToolSession } from './useToolSession.js'

interface UseWorkbenchKeyboardShortcutsOptions {
  viewMode: string
  setActiveTool: ReturnType<typeof useToolSession>['activate']
  setSelectedId: Dispatch<SetStateAction<string | null>>
  handleSaveProject: () => Promise<void>
  undo: ReturnType<typeof useProjectSession>['undo']
  redo: ReturnType<typeof useProjectSession>['redo']
  canCalibrateUnderlayRef: MutableRefObject<boolean>
}

/** Keeps global shortcuts out of the workbench shell and binds them to current project actions. */
export function useWorkbenchKeyboardShortcuts({
  viewMode, setActiveTool, setSelectedId, handleSaveProject, undo, redo, canCalibrateUnderlayRef,
}: UseWorkbenchKeyboardShortcutsOptions) {
  const saveProjectRef = useRef(handleSaveProject)
  saveProjectRef.current = handleSaveProject

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return
      const target = event.target
      const isTextEditing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      const isUndoRedo = (event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())
      if (isTextEditing && !isUndoRedo) return
      // Let native selects use letter keys for option type-ahead and Escape to close.
      if (target instanceof HTMLSelectElement && !isUndoRedo && !event.ctrlKey && !event.metaKey) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveProjectRef.current()
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        if (isTextEditing) return
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        if (isTextEditing) return
        event.preventDefault()
        redo()
      } else if (event.key === 'Escape') {
        // PlanCanvas owns staged Escape in plan-derived views, including automatic framing/roof-plan switches.
        if (['plan', 'framing', 'roofplan'].includes(viewMode)) return
        setActiveTool('select')
        setSelectedId(null)
      } else if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'p') {
        setActiveTool('archFloor')
      } else if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'c') {
        setActiveTool('ceiling')
      } else if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'r') {
        setActiveTool('roomSeparator')
      } else if (event.key.toLowerCase() === 's') {
        setActiveTool('select')
      } else if (event.key.toLowerCase() === 'e') {
        setActiveTool('erase')
      } else if (event.key.toLowerCase() === 'c') {
        setActiveTool('column')
      } else if (event.key.toLowerCase() === 'f') {
        setActiveTool('foundation')
      } else if (event.key.toLowerCase() === 'b') {
        setActiveTool('beam')
      } else if (event.key.toLowerCase() === 'w') {
        setActiveTool('wall')
      } else if (event.key.toLowerCase() === 'd') {
        setActiveTool('door')
      } else if (event.key.toLowerCase() === 'n') {
        setActiveTool('window')
      } else if (event.key.toLowerCase() === 'g') {
        setActiveTool(event.shiftKey ? 'gridSystem' : 'grid')
      } else if (event.key.toLowerCase() === 'm') {
        setActiveTool(event.shiftKey ? 'dimension' : 'measure')
      } else if (event.key.toLowerCase() === 'r') {
        if (canCalibrateUnderlayRef.current) setActiveTool('calibrate')
      } else if (event.key.toLowerCase() === 't') {
        setActiveTool('stair')
      } else if (event.key.toLowerCase() === 'q') {
        setActiveTool('roof')
      } else if (event.key.toLowerCase() === 'u') {
        setActiveTool('pipe')
      } else if (event.key.toLowerCase() === 'l') {
        setActiveTool('fixture')
      } else if (event.key.toLowerCase() === 'k') {
        setActiveTool('cabinet')
      } else if (event.key.toLowerCase() === 'v') {
        setActiveTool('furniture')
      } else if (event.key.toLowerCase() === 'j') {
        setActiveTool('moulding')
      } else if (event.key.toLowerCase() === 'p') {
        setActiveTool('slab')
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [viewMode, setActiveTool, setSelectedId, undo, redo, canCalibrateUnderlayRef])
}
