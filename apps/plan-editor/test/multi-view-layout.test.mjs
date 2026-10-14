import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMultiViewGridTracks, buildMultiViewPaneGridStyle, buildPrimaryPaneGridStyle, getMultiViewTrackBoundaries, getMultiViewTrackBoundaryRange, getMultiViewTrackShares, moveMultiViewPane, reorderMultiViewPane, resizeMultiViewTrackBoundary } from '../src/app/multiViewLayout.mjs'

test('multiview proportions customize columns and rows while keeping every pane visible', () => {
  assert.deepEqual(buildMultiViewGridTracks(2, 'columns', 65), {
    columns: 'minmax(0, 65fr) minmax(0, 35fr)',
    rows: 'minmax(0, 1fr)',
  })
  assert.deepEqual(buildMultiViewGridTracks(3, 'rows', 40), {
    columns: 'minmax(0, 1fr)',
    rows: 'minmax(0, 40fr) minmax(0, 30fr) minmax(0, 30fr)',
  })
})

test('focus and four-pane layouts apply the saved primary proportion and preserve topology', () => {
  assert.deepEqual(buildMultiViewGridTracks(3, 'focus', 60), {
    columns: 'minmax(0, 60fr) minmax(0, 40fr)',
    rows: 'repeat(2, minmax(0, 1fr))',
  })
  assert.deepEqual(buildPrimaryPaneGridStyle(3, 'focus'), { gridRow: 'span 2' })
  assert.deepEqual(buildMultiViewGridTracks(4, 'grid', 55), {
    columns: 'minmax(0, 55fr) minmax(0, 45fr)',
    rows: 'repeat(2, minmax(0, 1fr))',
  })
  assert.equal(buildPrimaryPaneGridStyle(4, 'grid'), undefined)
})

test('custom multiview grids support variable columns and span an incomplete final row', () => {
  assert.deepEqual(buildMultiViewGridTracks(4, 'custom', 50, 3), {
    columns: 'minmax(0, 50fr) minmax(0, 25fr) minmax(0, 25fr)',
    rows: 'minmax(0, 50fr) minmax(0, 50fr)',
  })
  assert.equal(buildMultiViewPaneGridStyle(4, 'custom', 2, 3), undefined)
  assert.deepEqual(buildMultiViewPaneGridStyle(4, 'custom', 3, 3), { gridColumn: 'span 3' })
  assert.deepEqual(buildMultiViewGridTracks(3, 'custom', 50, 99), {
    columns: 'minmax(0, 50fr) minmax(0, 25fr) minmax(0, 25fr)',
    rows: 'minmax(0, 100fr)',
  })
  assert.deepEqual(buildMultiViewGridTracks(3, 'custom', 60, 1), {
    columns: 'minmax(0, 100fr)',
    rows: 'minmax(0, 60fr) minmax(0, 20fr) minmax(0, 20fr)',
  })
})

test('multiview pane ordering swaps visible slots without dropping hidden slots', () => {
  const order = ['primary', 'secondary', 'tertiary', 'fourth']
  assert.deepEqual(moveMultiViewPane(order, 'tertiary', -1, 3), ['primary', 'tertiary', 'secondary', 'fourth'])
  assert.deepEqual(moveMultiViewPane(order, 'fourth', -1, 3), order)
  assert.deepEqual(moveMultiViewPane(order, 'primary', -1, 4), order)
})

test('drag reorder moves a pane to the target slot and preserves hidden slots', () => {
  const order = ['primary', 'secondary', 'tertiary', 'fourth']
  assert.deepEqual(reorderMultiViewPane(order, 'fourth', 'secondary', 4), ['primary', 'fourth', 'secondary', 'tertiary'])
  assert.deepEqual(reorderMultiViewPane(order, 'fourth', 'secondary', 3), order)
  assert.deepEqual(reorderMultiViewPane(order, 'primary', 'primary', 4), order)
})

test('custom track splitters resize adjacent columns or rows without moving other tracks', () => {
  const columns = getMultiViewTrackShares(3, [], 70)
  assert.deepEqual(columns, [70, 15, 15])
  assert.deepEqual(getMultiViewTrackBoundaries(columns), [70, 85])
  assert.deepEqual(getMultiViewTrackBoundaryRange(columns, 1), { min: 78, max: 92 })
  assert.deepEqual(resizeMultiViewTrackBoundary(columns, 0, 58), [58, 27, 15])
  assert.deepEqual(resizeMultiViewTrackBoundary(columns, 1, 79), [70, 9, 21])
  const rows = getMultiViewTrackShares(2, [], 50)
  assert.deepEqual(resizeMultiViewTrackBoundary(rows, 0, 62), [62, 38])
})

test('invalid multiview options fall back to a single visible cell and clamp the primary ratio', () => {
  assert.deepEqual(buildMultiViewGridTracks(7, 'diagonal', Number.NaN), {
    columns: 'minmax(0, 1fr)',
    rows: 'minmax(0, 1fr)',
  })
  assert.equal(buildMultiViewGridTracks(2, 'columns', 99).columns, 'minmax(0, 70fr) minmax(0, 30fr)')
  assert.equal(buildMultiViewGridTracks(2, 'columns', -10).columns, 'minmax(0, 30fr) minmax(0, 70fr)')
})
