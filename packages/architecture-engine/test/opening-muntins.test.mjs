import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveOpeningMuntinGrid, muntinGridPositions } from '../dist/index.js'

test('one vertical bar is centered separately inside each unequal-width leaf', () => {
  const grid = muntinGridPositions(resolveOpeningMuntinGrid({ muntin_columns: 2 }))
  const panels = [{ start: 0, width: 800 }, { start: 800, width: 1200 }]
  const bars = panels.flatMap(p => grid.vertical.map(f => p.start + p.width * f))
  assert.deepEqual(bars, [400, 1400])
  assert.equal(bars.includes(1000), false)
  assert.deepEqual(grid.horizontal, [])
})

test('leaf, top and bottom light grids are independent; legacy cells retain their meaning', () => {
  const p = { muntin_rows: 3, muntin_columns: 4, transom_muntin_rows: 1, transom_muntin_columns: 2, bottom_light_muntin_rows: 2, bottom_light_muntin_columns: 1 }
  assert.deepEqual(muntinGridPositions(resolveOpeningMuntinGrid(p)), { horizontal: [1 / 3, 2 / 3], vertical: [0.25, 0.5, 0.75] })
  assert.deepEqual(muntinGridPositions(resolveOpeningMuntinGrid(p, 'transom')), { horizontal: [], vertical: [0.5] })
  assert.deepEqual(muntinGridPositions(resolveOpeningMuntinGrid(p, 'bottom_light')), { horizontal: [0.5], vertical: [] })
  assert.deepEqual(resolveOpeningMuntinGrid({ muntin_columns: 5 }, 'transom'), { rows: 1, columns: 1 })
})
