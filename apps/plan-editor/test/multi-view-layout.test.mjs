import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMultiViewGridTracks, buildMultiViewPaneGridStyle, buildPrimaryPaneGridStyle } from '../src/app/multiViewLayout.mjs'

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
    columns: 'repeat(3, minmax(0, 1fr))',
    rows: 'repeat(2, minmax(0, 1fr))',
  })
  assert.equal(buildMultiViewPaneGridStyle(4, 'custom', 2, 3), undefined)
  assert.deepEqual(buildMultiViewPaneGridStyle(4, 'custom', 3, 3), { gridColumn: 'span 3' })
  assert.deepEqual(buildMultiViewGridTracks(3, 'custom', 50, 99), {
    columns: 'repeat(3, minmax(0, 1fr))',
    rows: 'repeat(1, minmax(0, 1fr))',
  })
})

test('invalid multiview options fall back to a single visible cell and clamp the primary ratio', () => {
  assert.deepEqual(buildMultiViewGridTracks(7, 'diagonal', Number.NaN), {
    columns: 'minmax(0, 1fr)',
    rows: 'minmax(0, 1fr)',
  })
  assert.equal(buildMultiViewGridTracks(2, 'columns', 99).columns, 'minmax(0, 70fr) minmax(0, 30fr)')
  assert.equal(buildMultiViewGridTracks(2, 'columns', -10).columns, 'minmax(0, 30fr) minmax(0, 70fr)')
})
