import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveArchitecturalFloorPatternKind } from '../dist/index.js'

test('architectural floor pattern follows the visible tile finish before any plank substrate', () => {
  assert.equal(resolveArchitecturalFloorPatternKind([{ material: 'engineered_wood' }]), 'staggered_plank')
  assert.equal(resolveArchitecturalFloorPatternKind([{ material: 'vinyl-plank' }]), 'staggered_plank')
  assert.equal(resolveArchitecturalFloorPatternKind([
    { material: 'engineered_wood' }, { material: 'porcelain_tile' },
  ]), 'tile_grid')
  assert.equal(resolveArchitecturalFloorPatternKind([{ material: 'polished_concrete' }]), undefined)
})
