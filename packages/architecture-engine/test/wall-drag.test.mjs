import assert from 'node:assert/strict'
import test from 'node:test'
import { projectPointToWallOffsetMm } from '../dist/index.js'

test('2D opening drag projects onto a wall centerline and clamps to valid host extents', () => {
  assert.equal(projectPointToWallOffsetMm([1200, 400], [0, 0], [4000, 0], 900), 1200)
  assert.equal(projectPointToWallOffsetMm([-500, 300], [0, 0], [4000, 0], 900), 450)
  assert.equal(projectPointToWallOffsetMm([6000, 0], [0, 0], [4000, 0], 900), 3550)
})

test('2D opening drag follows angled walls and rejects malformed or too-short hosts', () => {
  assert.equal(projectPointToWallOffsetMm([1500, 2000], [0, 0], [3000, 4000], 1000), 2500)
  assert.equal(projectPointToWallOffsetMm([0, 0], [0, 0], [500, 0], 600), undefined)
  assert.equal(projectPointToWallOffsetMm([0, 0], [0, 0], [0, 0], 100), undefined)
  assert.equal(projectPointToWallOffsetMm([Number.NaN, 0], [0, 0], [1000, 0], 100), undefined)
})
