import { useEffect, useState } from 'react'
import {
  useMultiViewPreferences,
  type EditorViewMode,
  type SplitViewPaneSlot,
} from './useMultiViewPreferences.js'
import {
  buildMultiViewGridTracks,
  buildMultiViewPaneGridStyle,
  buildPrimaryPaneGridStyle,
  getMultiViewTrackBoundaries,
  getMultiViewTrackShares,
  moveMultiViewPane,
  reorderMultiViewPane,
  resizeMultiViewTrackBoundary,
} from './multiViewLayout.mjs'

const PANE_SLOT_LABELS: Record<SplitViewPaneSlot, string> = {
  primary: 'มุมมองหลัก',
  secondary: 'มุมมองที่สอง',
  tertiary: 'มุมมองที่สาม',
  fourth: 'มุมมองที่สี่',
}

/** Owns editor view selection and coordinated pane layout preferences. */
export function useWorkbenchMultiViewLayout(projectId: string, activeTool: string) {
  const [viewMode, setViewMode] = useState<EditorViewMode>('plan')
  const [multiViewPreferences, setMultiViewPreferences] = useMultiViewPreferences(projectId)
  const {
    enabled: splitViewEnabled,
    paneCount: splitViewPaneCount,
    layout: splitViewLayout,
    customColumnCount,
    customColumnShares,
    customRowShares,
    paneOrder,
    primaryPanePercent,
    secondaryViewMode,
    tertiaryViewMode,
    fourthViewMode,
  } = multiViewPreferences

  const customRowCount = Math.ceil(splitViewPaneCount / customColumnCount)
  const customColumnTrackShares = getMultiViewTrackShares(customColumnCount, customColumnShares, primaryPanePercent)
  const customRowTrackShares = getMultiViewTrackShares(
    customRowCount,
    customRowShares,
    customColumnCount === 1 ? primaryPanePercent : 100 / customRowCount,
  )
  const customColumnBoundaries = getMultiViewTrackBoundaries(customColumnTrackShares)
  const customRowBoundaries = getMultiViewTrackBoundaries(customRowTrackShares)
  const splitViewTracks = buildMultiViewGridTracks(
    splitViewPaneCount,
    splitViewLayout,
    primaryPanePercent,
    customColumnCount,
    customColumnShares,
    customRowShares,
  )
  const splitViewGridStyle = splitViewEnabled ? {
    display: 'grid',
    gridTemplateColumns: splitViewTracks.columns,
    gridTemplateRows: splitViewTracks.rows,
    gap: 1,
    background: '#cbd5e1',
  } : undefined
  const primaryPaneGridStyle = buildPrimaryPaneGridStyle(splitViewPaneCount, splitViewLayout)
  const paneGridStyle = (paneIndex: number) => buildMultiViewPaneGridStyle(
    splitViewPaneCount,
    splitViewLayout,
    paneIndex,
    customColumnCount,
  )
  const paneViewModes: Record<SplitViewPaneSlot, EditorViewMode> = {
    primary: viewMode,
    secondary: multiViewPreferences.secondaryViewMode,
    tertiary: multiViewPreferences.tertiaryViewMode,
    fourth: multiViewPreferences.fourthViewMode,
  }
  const visiblePaneSlots: SplitViewPaneSlot[] = splitViewEnabled
    ? paneOrder.slice(0, splitViewPaneCount)
    : ['primary']
  const paneModes = splitViewEnabled ? visiblePaneSlots.map(slot => paneViewModes[slot]) : []

  const movePaneSlot = (slot: SplitViewPaneSlot, direction: -1 | 1) => setMultiViewPreferences(current => ({
    ...current,
    paneOrder: moveMultiViewPane(current.paneOrder, slot, direction, current.paneCount),
  }))
  const reorderPaneSlots = (source: SplitViewPaneSlot, target: SplitViewPaneSlot) => setMultiViewPreferences(current => ({
    ...current,
    paneOrder: reorderMultiViewPane(current.paneOrder, source, target, current.paneCount),
  }))
  const resizePaneTrack = (axis: 'column' | 'row', boundaryIndex: number, position: number) => setMultiViewPreferences(current => {
    const columns = Math.max(1, Math.min(current.paneCount, Math.round(current.customColumnCount)))
    const rows = Math.ceil(current.paneCount / columns)
    const isColumn = axis === 'column'
    const trackCount = isColumn ? columns : rows
    const shares = getMultiViewTrackShares(
      trackCount,
      isColumn ? current.customColumnShares : current.customRowShares,
      isColumn || columns === 1 ? current.primaryPanePercent : 100 / rows,
    )
    const nextShares = resizeMultiViewTrackBoundary(shares, boundaryIndex, position)
    const primaryPanePercent = boundaryIndex === 0 && (isColumn || columns === 1)
      ? Math.max(30, Math.min(70, Math.round(nextShares[0])))
      : current.primaryPanePercent
    return isColumn
      ? { ...current, customColumnShares: nextShares, primaryPanePercent }
      : { ...current, customRowShares: nextShares, primaryPanePercent }
  })

  useEffect(() => {
    if (['beam', 'foundation'].includes(activeTool)) setViewMode('framing')
    else if (activeTool === 'roof') setViewMode('roofplan')
    else if (['stair', 'wall', 'door', 'window', 'archFloor', 'slab', 'ceiling', 'roomSeparator', 'pipe', 'fixture', 'cabinet', 'moulding'].includes(activeTool)) setViewMode('plan')
  }, [activeTool])

  const planAnd3DNavigationLinked = paneModes.some(mode => mode === 'plan' || mode === 'framing' || mode === 'roofplan')
    && paneModes.includes('model3d')
  const planAndRcpNavigationLinked = paneModes.some(mode => mode === 'plan' || mode === 'framing' || mode === 'roofplan')
    && paneModes.includes('rcp')

  return {
    viewMode,
    setViewMode,
    multiViewPreferences,
    setMultiViewPreferences,
    splitViewEnabled,
    splitViewPaneCount,
    splitViewLayout,
    customColumnCount,
    customColumnTrackShares,
    customRowTrackShares,
    customColumnBoundaries,
    customRowBoundaries,
    primaryPanePercent,
    secondaryViewMode,
    tertiaryViewMode,
    fourthViewMode,
    splitViewGridStyle,
    primaryPaneGridStyle,
    paneGridStyle,
    paneViewModes,
    visiblePaneSlots,
    orderedPaneSlots: visiblePaneSlots,
    paneModes,
    paneSlotLabels: PANE_SLOT_LABELS,
    movePaneSlot,
    reorderPaneSlots,
    resizePaneTrack,
    planAnd3DNavigationLinked,
    planAndRcpNavigationLinked,
  }
}
