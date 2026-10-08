import assert from 'node:assert/strict'
import test from 'node:test'
import { measureOpeningRegions } from '../dist/index.js'

test('nominal region heights partition the full opening independently of leaf operation', () => {
  const dimensions = measureOpeningRegions({ width_mm: 2000, height_mm: 3000, transom_height_mm: 300, bottom_light_height_mm: 500 })
  assert.equal(dimensions.main_height_mm, 2200)
  assert.equal(dimensions.main_height_mm + dimensions.transom_height_mm + dimensions.bottom_light_height_mm, dimensions.height_mm)
  // A tall transom must be represented at its real ratio, not a visual 38% cap.
  assert.equal(measureOpeningRegions({ width_mm: 1200, height_mm: 2000, transom_height_mm: 1000 }).transom_height_mm, 1000)
  assert.equal(measureOpeningRegions({ width_mm: 900, height_mm: 2000 }).main_height_mm, 2000)
})

test('invalid drafts do not produce misleading dimensions', () => {
  for (const input of [
    { width_mm: 0, height_mm: 2000 },
    { width_mm: 900, height_mm: NaN },
    { width_mm: 900, height_mm: 2000, transom_height_mm: -1 },
    { width_mm: 900, height_mm: 2000, transom_height_mm: Infinity },
    { width_mm: 900, height_mm: 2000, transom_height_mm: 1800, bottom_light_height_mm: 200 },
  ]) assert.equal(measureOpeningRegions(input), undefined)
})
