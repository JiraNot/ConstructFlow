import assert from 'node:assert/strict'
import test from 'node:test'
import { countProjectObjects } from '../src/app/projectStatistics.mjs'

test('project object summary counts every family in one stable object', () => {
  const counts = countProjectObjects({ objects: {
    wall: { object_type: 'architecture.wall' },
    wall2: { object_type: 'architecture.wall' },
    beam: { object_type: 'structure.beam' },
    door: { object_type: 'door_window.door' },
  } })

  assert.equal(counts['architecture.wall'], 2)
  assert.equal(counts['structure.beam'], 1)
  assert.equal(counts['door_window.door'], 1)
  assert.equal(counts['door_window.window'], undefined)
})

test('project object summary handles an empty project', () => {
  assert.deepEqual({ ...countProjectObjects({ objects: {} }) }, {})
})
