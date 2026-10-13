import test from 'node:test'
import assert from 'node:assert/strict'
import { resolvePlanCanvasLineSnap } from '../src/app/placementLineSnap.mjs'

const snap = { point_mm: [900, 700], kind: 'endpoint', description: 'Endpoint' }

test('line placement preview and commit use one shared start point and Shift lock rule', () => {
  const start = [100, 200]
  const calls = []
  const constrain = (...args) => { calls.push(args); return { ...args[0], description: 'constrained' } }
  const preview = resolvePlanCanvasLineSnap(snap, [920, 680], false, 'wall', {
    wallStartNode: { point_mm: start, reference: { id: 'grid-A' } },
  }, constrain)
  const commit = resolvePlanCanvasLineSnap(snap, [920, 680], false, 'wall', {
    wallStartNode: { point_mm: start, reference: { id: 'grid-A' } },
  }, constrain)
  assert.deepEqual(preview, commit)
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[0].slice(1, 4), [[920, 680], start, false])
  assert.deepEqual(calls[0][4], { id: 'grid-A' })
})

test('line snap resolves each drawing tool to its current construction point', () => {
  const calls = []
  const constrain = (...args) => { calls.push(args); return args[0] }
  const cases = [
    ['beam', { beamStartNode: { point_mm: [1, 2], reference: { id: 'beam-ref' } } }, [1, 2], { id: 'beam-ref' }],
    ['wall', { wallStartNode: { point_mm: [3, 4], reference: { id: 'wall-ref' } } }, [3, 4], { id: 'wall-ref' }],
    ['stair', { stairStartPoint: [5, 6] }, [5, 6], undefined],
    ['grid', { gridStartPoint: [7, 8] }, [7, 8], undefined],
    ['pipe', { roomSeparatorStart: [9, 10] }, [9, 10], undefined],
    ['roof', { slabBoundary: [[11, 12], [13, 14]] }, [13, 14], undefined],
  ]
  for (const [tool, state, expectedStart, expectedReference] of cases) {
    resolvePlanCanvasLineSnap(snap, [20, 30], true, tool, state, constrain)
    assert.deepEqual(calls.at(-1).slice(1, 4), [[20, 30], expectedStart, true])
    assert.deepEqual(calls.at(-1)[4], expectedReference)
  }
})

test('non-line tools leave the snap untouched', () => {
  let called = false
  const result = resolvePlanCanvasLineSnap(snap, [1, 2], true, 'column', {}, () => { called = true; return snap })
  assert.equal(result, snap)
  assert.equal(called, false)
})
