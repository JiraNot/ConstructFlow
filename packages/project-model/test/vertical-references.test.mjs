import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyProjectDocument, resolveBeamBaseElevation, resolveColumnVerticalExtent, resolveOpeningVerticalExtent, resolveSlabElevation, resolveWallVerticalExtent } from '../dist/index.js'

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

test('beam vertical placement follows its level datum with a signed offset', () => {
  const project = createEmptyProjectDocument('V', 'Beam vertical refs')
  project.levels = [{ id: 'GF', name: 'Ground Floor FFL', elevation_mm: 0, storey_index: 0, height_mm: 3000 }]
  assert.equal(resolveBeamBaseElevation(project, { level_id: 'GF', base_offset_mm: -200, start_point_mm: [0, 0, 500] }), -200)
  assert.equal(resolveBeamBaseElevation(project, { level_id: 'GF', base_offset_mm: 150, start_point_mm: [0, 0, 0] }), 150)
  assert.equal(resolveBeamBaseElevation(project, { level_id: 'missing', base_offset_mm: 0, start_point_mm: [0, 0, 0] }), undefined)
})

test('columns resolve to explicit roof datum, then next datum and finally legacy storey height', () => {
  const project = createEmptyProjectDocument('V', 'Column vertical refs')
  project.levels = [
    { id: 'GF', name: 'Ground', elevation_mm: 0, storey_index: 0, height_mm: 400 },
    { id: 'L1', name: 'First Floor', elevation_mm: 400, storey_index: 1, height_mm: 3000 },
    { id: 'EAVE', name: 'ระดับอเส', elevation_mm: 3400, storey_index: 2, height_mm: 2000 },
  ]
  const location_mm = [250, 500, 0]
  assert.deepEqual(resolveColumnVerticalExtent(project, {
    base_level_id: 'GF', top_level_id: 'EAVE', base_offset_mm: 0, top_offset_mm: 0, location_mm,
  }), { base_elevation_mm: 0, top_elevation_mm: 3400, height_mm: 3400, base_offset_mm: 0, top_offset_mm: 0 })
  assert.equal(resolveColumnVerticalExtent(project, {
    base_level_id: 'GF', base_offset_mm: 0, top_offset_mm: 0, location_mm,
  }).top_elevation_mm, 400)
  project.levels = [{ id: 'GF', name: 'Ground', elevation_mm: 0, storey_index: 0, height_mm: 2800 }]
  assert.equal(resolveColumnVerticalExtent(project, {
    base_level_id: 'GF', base_offset_mm: 100, top_offset_mm: -50, location_mm,
  }).top_elevation_mm, 2750)
  project.levels[0].height_mm = undefined
  assert.equal(resolveColumnVerticalExtent(project, {
    base_level_id: 'GF', base_offset_mm: 0, top_offset_mm: 0, location_mm,
  }).top_elevation_mm, 3000)
  assert.equal(resolveColumnVerticalExtent(project, {
    base_level_id: 'GF', top_level_id: 'GF', base_offset_mm: 0, top_offset_mm: 0, location_mm,
  }), undefined)
})
