const clampPrimaryPanePercent = value => Number.isFinite(value)
  ? Math.max(30, Math.min(70, Math.round(value)))
  : 50

const track = weight => `minmax(0, ${weight}fr)`

export function getMultiViewTrackShares(trackCount, storedShares = [], fallbackFirstShare = 50) {
  if (!Number.isInteger(trackCount) || trackCount < 1) return []
  if (storedShares.length === trackCount && storedShares.every(value => Number.isFinite(value) && value > 0)) {
    const total = storedShares.reduce((sum, value) => sum + value, 0)
    return storedShares.map(value => Math.round((value / total) * 100_000) / 1_000)
  }
  if (trackCount === 1) return [100]
  const firstShare = Math.max(8, Math.min(92 - (trackCount - 2) * 8, fallbackFirstShare))
  const remainder = 100 - firstShare
  return [firstShare, ...Array.from({ length: trackCount - 1 }, () => remainder / (trackCount - 1))]
}

export function getMultiViewTrackBoundaries(shares) {
  let position = 0
  return shares.slice(0, -1).map(share => (position += share))
}

export function getMultiViewTrackBoundaryRange(shares, boundaryIndex, minTrackShare = 8) {
  const before = shares.slice(0, boundaryIndex).reduce((sum, share) => sum + share, 0)
  const pairShare = (shares[boundaryIndex] ?? 0) + (shares[boundaryIndex + 1] ?? 0)
  return { min: before + minTrackShare, max: before + pairShare - minTrackShare }
}

export function resizeMultiViewTrackBoundary(shares, boundaryIndex, position, minTrackShare = 8) {
  if (boundaryIndex < 0 || boundaryIndex >= shares.length - 1 || !Number.isFinite(position)) return shares
  const range = getMultiViewTrackBoundaryRange(shares, boundaryIndex, minTrackShare)
  const nextBoundary = Math.max(range.min, Math.min(range.max, position))
  const before = shares.slice(0, boundaryIndex).reduce((sum, share) => sum + share, 0)
  const pairShare = shares[boundaryIndex] + shares[boundaryIndex + 1]
  const firstShare = nextBoundary - before
  const nextShares = [...shares]
  nextShares[boundaryIndex] = firstShare
  nextShares[boundaryIndex + 1] = pairShare - firstShare
  return nextShares
}

/** Build CSS grid tracks for the currently supported multiview arrangements. */
export function buildMultiViewGridTracks(paneCount, layout, primaryPanePercent = 50, customColumnCount = 2, customColumnShares = [], customRowShares = []) {
  if (![2, 3, 4].includes(paneCount) || !['columns', 'rows', 'focus', 'grid', 'custom'].includes(layout)) {
    return { columns: 'minmax(0, 1fr)', rows: 'minmax(0, 1fr)' }
  }
  if (layout === 'custom') {
    const columns = Number.isFinite(customColumnCount)
      ? Math.max(1, Math.min(paneCount, Math.round(customColumnCount)))
      : 2
    const rows = Math.ceil(paneCount / columns)
    const columnShares = getMultiViewTrackShares(columns, customColumnShares, primaryPanePercent)
    const rowShares = getMultiViewTrackShares(rows, customRowShares, columns === 1 ? primaryPanePercent : 100 / rows)
    return {
      columns: columnShares.map(track).join(' '),
      rows: rowShares.map(track).join(' '),
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

export function moveMultiViewPane(order, paneSlot, direction, visiblePaneCount = order.length) {
  const currentIndex = order.indexOf(paneSlot)
  const nextIndex = currentIndex + Math.sign(direction)
  if (currentIndex < 0 || currentIndex >= visiblePaneCount || nextIndex < 0 || nextIndex >= visiblePaneCount) return order
  const nextOrder = [...order]
  ;[nextOrder[currentIndex], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[currentIndex]]
  return nextOrder
}

export function reorderMultiViewPane(order, sourceSlot, targetSlot, visiblePaneCount = order.length) {
  const sourceIndex = order.indexOf(sourceSlot)
  const targetIndex = order.indexOf(targetSlot)
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex >= visiblePaneCount || targetIndex >= visiblePaneCount || sourceIndex === targetIndex) return order
  const nextOrder = [...order]
  nextOrder.splice(sourceIndex, 1)
  nextOrder.splice(targetIndex, 0, sourceSlot)
  return nextOrder
}
