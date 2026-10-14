const clampPrimaryPanePercent = value => Number.isFinite(value)
  ? Math.max(30, Math.min(70, Math.round(value)))
  : 50

const track = weight => `minmax(0, ${weight}fr)`

/** Build CSS grid tracks for the currently supported multiview arrangements. */
export function buildMultiViewGridTracks(paneCount, layout, primaryPanePercent = 50, customColumnCount = 2) {
  if (![2, 3, 4].includes(paneCount) || !['columns', 'rows', 'focus', 'grid', 'custom'].includes(layout)) {
    return { columns: 'minmax(0, 1fr)', rows: 'minmax(0, 1fr)' }
  }
  if (layout === 'custom') {
    const columns = Number.isFinite(customColumnCount)
      ? Math.max(1, Math.min(paneCount, Math.round(customColumnCount)))
      : 2
    const rows = Math.ceil(paneCount / columns)
    return {
      columns: `repeat(${columns}, minmax(0, 1fr))`,
      rows: `repeat(${rows}, minmax(0, 1fr))`,
    }
  }
  const primary = clampPrimaryPanePercent(primaryPanePercent)
  const remainder = 100 - primary
  if (layout === 'rows') {
    const rest = remainder / (paneCount - 1)
    return {
      columns: 'minmax(0, 1fr)',
      rows: [primary, ...Array.from({ length: paneCount - 1 }, () => rest)].map(track).join(' '),
    }
  }
  if (layout === 'focus' && paneCount === 3) {
    return {
      columns: `${track(primary)} ${track(remainder)}`,
      rows: 'repeat(2, minmax(0, 1fr))',
    }
  }
  if (layout === 'grid' && paneCount === 4) {
    return {
      columns: `${track(primary)} ${track(remainder)}`,
      rows: 'repeat(2, minmax(0, 1fr))',
    }
  }
  const rest = remainder / (paneCount - 1)
  return {
    columns: [primary, ...Array.from({ length: paneCount - 1 }, () => rest)].map(track).join(' '),
    rows: 'minmax(0, 1fr)',
  }
}

export function buildPrimaryPaneGridStyle(paneCount, layout) {
  return layout === 'focus' && paneCount === 3 ? { gridRow: 'span 2' } : undefined
}

export function buildMultiViewPaneGridStyle(paneCount, layout, paneIndex, customColumnCount = 2) {
  if (layout !== 'custom' || ![2, 3, 4].includes(paneCount)) return undefined
  const columns = Number.isFinite(customColumnCount)
    ? Math.max(1, Math.min(paneCount, Math.round(customColumnCount)))
    : 2
  const remainder = paneCount % columns
  if (remainder !== 0 && paneIndex >= paneCount - remainder) return { gridColumn: `span ${columns}` }
  return undefined
}
