import test from 'node:test'
import assert from 'node:assert/strict'
import { isMasonryWallPlanHatch } from '../dist/index.js'

const wall = (module_data = {}) => ({ object_type: 'architecture.wall', module_data })

test('plan masonry hatch follows wall assembly and keeps legacy metadata-free walls compatible', () => {
  assert.equal(isMasonryWallPlanHatch(wall({ material: 'lightweight_block' }), []), true)
  assert.equal(isMasonryWallPlanHatch(wall({ material: 'brick_masonry' }), []), true)
  assert.equal(isMasonryWallPlanHatch(wall({ material: 'steel_stud', wall_system: 'c_stud_smartboard' }), []), false)
  assert.equal(isMasonryWallPlanHatch(wall({ material: 'reinforced_concrete', wall_system: 'masonry' }), []), false)
  assert.equal(isMasonryWallPlanHatch(wall({ wall_system: 'masonry' }), []), true)
  assert.equal(isMasonryWallPlanHatch(wall(), []), true)
})

test('instance assembly overrides and catalog assembly parameters determine plan hatch', () => {
  const types = [{ id: 'stud-wall', object_type: 'architecture.wall', name: 'W4', parameters: { material: 'steel_stud', wall_system: 'steel_frame_board' } }]
  assert.equal(isMasonryWallPlanHatch(wall({ type_id: 'stud-wall', mark: 'W4' }), types), false)
  assert.equal(isMasonryWallPlanHatch(wall({ type_id: 'stud-wall', instance_overrides: { material: 'lightweight_block' } }), types), true)
  assert.equal(isMasonryWallPlanHatch(wall({ mark: 'W4' }), types), false)
  assert.equal(isMasonryWallPlanHatch({ object_type: 'structure.beam', module_data: {} }, types), false)
})
