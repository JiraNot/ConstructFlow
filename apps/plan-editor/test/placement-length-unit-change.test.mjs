import test from 'node:test'
import assert from 'node:assert/strict'
import { reformatPlacementLengthInput } from '../src/components/reformatPlacementLengthInput.mjs'

test('changing display units preserves incomplete placement length input', () => {
  assert.equal(reformatPlacementLengthInput('-', 'm', 'mm'), '-')
  assert.equal(reformatPlacementLengthInput('2.', 'm', 'mm'), '2000')
  assert.equal(reformatPlacementLengthInput('not a length', 'm', 'mm'), 'not a length')
  assert.equal(reformatPlacementLengthInput('  ', 'm', 'mm'), '  ')
})

test('changing display units preserves the entered physical length', () => {
  assert.equal(reformatPlacementLengthInput('2.5', 'm', 'mm'), '2500')
  assert.equal(reformatPlacementLengthInput('2500', 'mm', 'm'), '2.500')
  assert.equal(reformatPlacementLengthInput('2.5 m', 'mm', 'm'), '2.500')
  assert.equal(reformatPlacementLengthInput('2.5', 'm', 'm'), '2.5')
})
