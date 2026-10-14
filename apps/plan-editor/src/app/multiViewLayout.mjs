const clampPrimaryPanePercent = value => Number.isFinite(value)
  ? Math.max(30, Math.min(70, Math.round(value)))
  : 50

const track = weight => `minmax(0, ${weight}fr)`

/** Build CSS grid tracks for the currently supported multiview arrangements. */
export function buildMultiViewGridTracks(paneCount, layout, primaryPanePercent = 50) {
  if (![2, 3, 4].includes(paneCount) || !['columns', 'rows', 'focus', 'grid'].includes(layout)) {
    return { columns: 'minmax(0, 1fr)', rows: 'minmax(0, 1fr)' }
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
