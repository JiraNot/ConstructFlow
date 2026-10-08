import assert from 'node:assert/strict'
import test from 'node:test'
import { doorLeafDetails, sashBeadDetails, openingMaterialAppearance, openingHandlePlacement } from '../dist/index.js'

test('hardware stays on the stile at varying widths, faces into each leaf, and skips fixed panels', () => {
  for (const width of [300, 800, 1400]) {
    for (const operation of ['hinged', 'sliding', 'louver']) {
      const left = openingHandlePlacement(operation, 0, width, 2000, true)
      const right = openingHandlePlacement(operation, 1, width, 2000, true)
      assert.ok(Math.abs((1 - left.x) * width - 16) < 1e-9)
      assert.equal(right.x * width, 16)
      assert.equal(left.direction, -1)
      assert.equal(right.direction, 1)
    }
  }
  const awning = openingHandlePlacement('awning', 0, 800, 1000, true)
  assert.equal(awning.x, 0.5)
  assert.equal(awning.y, 0.984)
  assert.equal(openingHandlePlacement('fixed', 0, 800, 1000, true), null)
})

test('glazing beads stay inside sash rails on both faces and reject insufficient space', () => {
  const beads = sashBeadDetails(600, 1100, 40, 25)
  assert.equal(beads.length, 8)
  for (const bead of beads) {
    assert.ok(Math.abs(bead.center_mm[0]) + bead.size_mm[0] / 2 <= 275)
    assert.ok(Math.abs(bead.center_mm[2]) + bead.size_mm[2] / 2 <= 525)
    assert.ok(bead.size_mm.every(v => v > 0))
  }
  assert.deepEqual(sashBeadDetails(40, 1100, 40, 25), [])
})

test('joinery relief fits each leaf, stays finite and appears on both faces', () => {
  for (const style of ['raised_2_panel', 'raised_4_panel', 'raised_6_panel', 'horizontal_grooves_3', 'horizontal_grooves_5', 'vertical_grooves_3', 'louvered']) {
    for (const [width, height] of [[880, 2050], [200, 400]]) {
      const details = doorLeafDetails(style, width, height, 42)
      assert.ok(details.length > 0)
      assert.deepEqual(details, doorLeafDetails(style, width, height, 42))
      for (const d of details) {
        assert.ok(d.size_mm.every(v => Number.isFinite(v) && v > 0))
        assert.ok(Math.abs(d.center_mm[0]) + d.size_mm[0] / 2 <= width / 2)
        assert.ok(Math.abs(d.center_mm[2]) + d.size_mm[2] / 2 <= height / 2)
        assert.ok(details.some(other => other.center_mm[1] === -d.center_mm[1]))
      }
    }
  }
  assert.deepEqual(doorLeafDetails('flush', 900, 2100, 42), [])
  assert.deepEqual(doorLeafDetails('raised_2_panel', NaN, 2100, 42), [])
  assert.notEqual(openingMaterialAppearance('timber').color, openingMaterialAppearance('hdf').color)
})
