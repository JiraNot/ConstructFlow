import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

export type EditorViewMode = 'plan' | 'framing' | 'roofplan' | 'north' | 'south' | 'east' | 'west' | 'rcp' | 'model3d'
export type SplitViewLayout = 'columns' | 'rows' | 'focus' | 'grid' | 'custom'
export type SplitViewPaneCount = 2 | 3 | 4
export type SplitViewPaneSlot = 'primary' | 'secondary' | 'tertiary' | 'fourth'

export interface MultiViewPreferences {
  enabled: boolean
  paneCount: SplitViewPaneCount
  layout: SplitViewLayout
  customColumnCount: number
  customColumnShares: number[]
  customRowShares: number[]
  paneOrder: SplitViewPaneSlot[]
  primaryPanePercent: number
  secondaryViewMode: EditorViewMode
  tertiaryViewMode: EditorViewMode
  fourthViewMode: EditorViewMode
}

const VIEW_MODES = new Set<EditorViewMode>(['plan', 'framing', 'roofplan', 'north', 'south', 'east', 'west', 'rcp', 'model3d'])
const PANE_SLOTS: SplitViewPaneSlot[] = ['primary', 'secondary', 'tertiary', 'fourth']
const LAYOUTS = new Set<SplitViewLayout>(['columns', 'rows', 'focus', 'grid', 'custom'])
const DEFAULT_PREFERENCES: MultiViewPreferences = {
  enabled: false,
  paneCount: 2,
  layout: 'columns',
  customColumnCount: 2,
  customColumnShares: [],
  customRowShares: [],
  paneOrder: PANE_SLOTS,
  primaryPanePercent: 50,
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
    const primaryPanePercent = typeof stored.primaryPanePercent === 'number' && Number.isFinite(stored.primaryPanePercent)
      ? Math.max(30, Math.min(70, Math.round(stored.primaryPanePercent)))
      : DEFAULT_PREFERENCES.primaryPanePercent
    const customColumnCount = typeof stored.customColumnCount === 'number' && Number.isFinite(stored.customColumnCount)
      ? Math.max(1, Math.min(paneCount, Math.round(stored.customColumnCount)))
      : DEFAULT_PREFERENCES.customColumnCount
    const validShares = (value: unknown) => Array.isArray(value) && value.length <= 4
      && value.every(share => typeof share === 'number' && Number.isFinite(share) && share > 0)
      ? value as number[]
      : []
    const customColumnShares = validShares(stored.customColumnShares)
    const customRowShares = validShares(stored.customRowShares)
    const storedPaneOrder = Array.isArray(stored.paneOrder)
      ? stored.paneOrder.filter((slot): slot is SplitViewPaneSlot => PANE_SLOTS.includes(slot as SplitViewPaneSlot))
      : []
    const paneOrder = [...new Set(storedPaneOrder), ...PANE_SLOTS].slice(0, PANE_SLOTS.length)
    return {
      enabled: stored.enabled === true,
      paneCount,
      layout,
      customColumnCount,
      customColumnShares,
      customRowShares,
      paneOrder,
      primaryPanePercent,
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
