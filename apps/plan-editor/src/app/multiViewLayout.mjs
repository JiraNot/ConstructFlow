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
    const primary = clampPrimaryPanePercent(primaryPanePercent)
    const remainder = 100 - primary
    return {
      columns: columns === 1
        ? 'minmax(0, 1fr)'
        : [primary, ...Array.from({ length: columns - 1 }, () => remainder / (columns - 1))].map(track).join(' '),
      rows: columns === 1
        ? [primary, ...Array.from({ length: rows - 1 }, () => remainder / (rows - 1))].map(track).join(' ')
        : `repeat(${rows}, minmax(0, 1fr))`,
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
