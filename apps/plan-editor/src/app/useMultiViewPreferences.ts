import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

export type EditorViewMode = 'plan' | 'framing' | 'roofplan' | 'north' | 'south' | 'east' | 'west' | 'rcp' | 'model3d'
export type SplitViewLayout = 'columns' | 'rows' | 'focus' | 'grid'
export type SplitViewPaneCount = 2 | 3 | 4

export interface MultiViewPreferences {
  enabled: boolean
  paneCount: SplitViewPaneCount
  layout: SplitViewLayout
  secondaryViewMode: EditorViewMode
  tertiaryViewMode: EditorViewMode
  fourthViewMode: EditorViewMode
}

const VIEW_MODES = new Set<EditorViewMode>(['plan', 'framing', 'roofplan', 'north', 'south', 'east', 'west', 'rcp', 'model3d'])
const LAYOUTS = new Set<SplitViewLayout>(['columns', 'rows', 'focus', 'grid'])
const DEFAULT_PREFERENCES: MultiViewPreferences = {
  enabled: false,
  paneCount: 2,
  layout: 'columns',
  secondaryViewMode: 'model3d',
  tertiaryViewMode: 'north',
  fourthViewMode: 'east',
}

function storageKey(projectId: string) {
  return `cf-multiview-preferences:${encodeURIComponent(projectId)}`
}

function isViewMode(value: unknown): value is EditorViewMode {
  return typeof value === 'string' && VIEW_MODES.has(value as EditorViewMode)
}

function loadPreferences(projectId: string): MultiViewPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES
  try {
    const raw = window.localStorage.getItem(storageKey(projectId))
    if (!raw) return DEFAULT_PREFERENCES
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return DEFAULT_PREFERENCES
    const stored = value as Partial<MultiViewPreferences>
    const paneCount: SplitViewPaneCount = stored.paneCount === 3 || stored.paneCount === 4 ? stored.paneCount : 2
    let layout = LAYOUTS.has(stored.layout as SplitViewLayout) ? stored.layout as SplitViewLayout : 'columns'
    if ((layout === 'focus' && paneCount !== 3) || (layout === 'grid' && paneCount !== 4)) layout = 'columns'
    return {
      enabled: stored.enabled === true,
      paneCount,
      layout,
      secondaryViewMode: isViewMode(stored.secondaryViewMode) ? stored.secondaryViewMode : DEFAULT_PREFERENCES.secondaryViewMode,
      tertiaryViewMode: isViewMode(stored.tertiaryViewMode) ? stored.tertiaryViewMode : DEFAULT_PREFERENCES.tertiaryViewMode,
      fourthViewMode: isViewMode(stored.fourthViewMode) ? stored.fourthViewMode : DEFAULT_PREFERENCES.fourthViewMode,
    }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

function savePreferences(projectId: string, preferences: MultiViewPreferences) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(projectId), JSON.stringify(preferences))
  } catch {
    // Multiview preferences are optional and must not block model editing.
  }
}

export function useMultiViewPreferences(projectId: string): [MultiViewPreferences, Dispatch<SetStateAction<MultiViewPreferences>>] {
  const [stored, setStored] = useState(() => ({ projectId, preferences: loadPreferences(projectId) }))
  const preferences = stored.projectId === projectId ? stored.preferences : DEFAULT_PREFERENCES

  useEffect(() => {
    if (stored.projectId !== projectId) setStored({ projectId, preferences: loadPreferences(projectId) })
  }, [projectId, stored.projectId])

  useEffect(() => {
    if (stored.projectId === projectId) savePreferences(projectId, stored.preferences)
  }, [projectId, stored])

  const setPreferences: Dispatch<SetStateAction<MultiViewPreferences>> = updater => {
    setStored(current => {
      const currentPreferences = current.projectId === projectId ? current.preferences : loadPreferences(projectId)
      return { projectId, preferences: typeof updater === 'function' ? updater(currentPreferences) : updater }
    })
  }

  return [preferences, setPreferences] as const
}
