import test from 'node:test'
import assert from 'node:assert/strict'
import { formatRoomAreaM2 } from '../src/roomLabel.mjs'

test('room area labels are hidden while their wall-derived boundary is open', () => {
  assert.equal(formatRoomAreaM2(12_345_678, 'unclosed'), null)
})

test('closed room area labels format square millimeters to square meters', () => {
  assert.equal(formatRoomAreaM2(12_345_678, 'closed'), '12.35')
  assert.equal(formatRoomAreaM2(0, 'closed'), '0.00')
})

test('room area labels reject non-finite or negative model values', () => {
  assert.equal(formatRoomAreaM2(Number.NaN, 'closed'), null)
  assert.equal(formatRoomAreaM2(-1, 'closed'), null)
})
