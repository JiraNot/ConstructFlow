import test from 'node:test'
import assert from 'node:assert/strict'
import { commitPlanCanvasDragPreview } from '../src/components/commitPlanCanvasDragPreview.mjs'

const gesture = { id: 'wall-1', kind: 'wall', startWorldMm: [0, 0], startScreenPx: [20, 20] }

function createOptions(overrides = {}) {
  const calls = { built: [], previewed: [], committed: [], rejected: [] }
  const options = {
    drag: gesture,
    rawWorld: [400, 0],
    ctrlKey: false,
    hasManualDimensions: false,
    movedPixels: 12,
    buildCommands: (drag, point, ctrlKey) => {
      calls.built.push({ drag, point, ctrlKey })
      return [{ name: 'MoveWall', input: { id: drag.id, delta_mm: point } }]
    },
    preview: commands => {
      calls.previewed.push(commands)
      return { valid: true, project: {}, affected_object_ids: [gesture.id], errors: [] }
    },
    commit: commands => calls.committed.push(commands),
    onRejected: errors => calls.rejected.push(errors),
    ...overrides,
  }
  return { options, calls }
}

test('released drag validates and commits the built command batch once', async () => {
  const { options, calls } = createOptions()
  await commitPlanCanvasDragPreview(options)
  assert.equal(calls.built.length, 1)
  assert.equal(calls.previewed.length, 1)
  assert.equal(calls.committed.length, 1)
  assert.deepEqual(calls.rejected, [])
})

test('manual dimensions allow a sub-threshold release and disable snapping', async () => {
  const { options, calls } = createOptions({ movedPixels: 0.5, hasManualDimensions: true })
  await commitPlanCanvasDragPreview(options)
  assert.equal(calls.built.length, 1)
  assert.equal(calls.built[0].ctrlKey, true)
  assert.equal(calls.committed.length, 1)
})

test('small pointer jitter without dimensions does not build, preview, or commit commands', async () => {
  const { options, calls } = createOptions({ movedPixels: 2.9 })
  await commitPlanCanvasDragPreview(options)
  assert.deepEqual(calls, { built: [], previewed: [], committed: [], rejected: [] })
})

test('invalid candidate is rejected without dispatching a commit', async () => {
  const { options, calls } = createOptions({
    preview: commands => {
      calls.previewed.push(commands)
      return { valid: false, project: {}, affected_object_ids: [], errors: ['blocked'] }
    },
  })
  await commitPlanCanvasDragPreview(options)
  assert.equal(calls.committed.length, 0)
  assert.deepEqual(calls.rejected, [['blocked']])
})
