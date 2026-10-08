import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyProjectDocument, resolveOpeningVerticalExtent, resolveSlabElevation, resolveWallVerticalExtent } from '../dist/index.js'

test('wall height resolves between storey levels with offsets', () => {
  const project = createEmptyProjectDocument('V', 'Vertical refs')
  project.levels = [
    { id: 'GF', name: 'ชั้น 1', elevation_mm: 0, storey_index: 1, height_mm: 3200 },
    { id: 'L2', name: 'ชั้น 2', elevation_mm: 3200, storey_index: 2, height_mm: 3000 },
  ]
  assert.deepEqual(resolveWallVerticalExtent(project, {
    level_id: 'GF', top_level_id: 'L2', base_offset_mm: 100, top_offset_mm: -50,
    height_mm: 2800,
  }), {
    base_elevation_mm: 100, top_elevation_mm: 3150, height_mm: 3050,
    base_offset_mm: 100, top_offset_mm: -50,
  })
})

test('opening head can be constrained to a level while sill stays relative to its base floor', () => {
  const project = createEmptyProjectDocument('V', 'Vertical refs')
  project.levels = [
    { id: 'GF', name: 'ชั้น 1', elevation_mm: 0, storey_index: 1, height_mm: 3200 },
    { id: 'L2', name: 'ชั้น 2', elevation_mm: 3200, storey_index: 2, height_mm: 3000 },
  ]
  const opening = resolveOpeningVerticalExtent(project, {
    level_id: 'GF', sill_height_mm: 900, height_mm: 1200,
    head_level_id: 'L2', head_offset_mm: -450,
  })
  assert.deepEqual(opening, {
    base_elevation_mm: 900, top_elevation_mm: 2750, height_mm: 1850,
    base_offset_mm: 900, top_offset_mm: -450,
  })
})

test('slab can follow its storey datum with an independent vertical offset', () => {
  const project = createEmptyProjectDocument('V', 'Vertical refs')
  project.levels = [{ id: 'L2', name: 'ชั้น 2', elevation_mm: 3200, storey_index: 2, height_mm: 3000 }]
  assert.equal(resolveSlabElevation(project, { level_id: 'L2', elevation_mm: 0, elevation_offset_mm: -150 }), 3050)
  assert.equal(resolveSlabElevation(project, { level_id: 'L2', elevation_mm: 3150 }), 3150)
})
