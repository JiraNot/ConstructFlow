import assert from 'node:assert/strict'
import test from 'node:test'
import { stairLandingGripPoint } from '../src/components/stairLandingGripPoint.mjs'
import { stairFlightGripPoints } from '../src/components/stairFlightGripPoints.mjs'

const base = {
  start_point_mm: [3000, 3000, 0], stair_type: 'u_shape', turn_direction: 'right',
  width_mm: 1000, num_risers: 18, first_flight_risers: 9,
  tread_depth_mm: 250, landing_depth_mm: 1000, flight_gap_mm: 100, rotation_deg: 0,
}

test('U landing grip follows its outside corner and rotates with the stair', () => {
  assert.deepEqual(stairLandingGripPoint(base), [6000, 5100])
  assert.deepEqual(stairLandingGripPoint({ ...base, rotation_deg: 90 }), [900, 6000])
})

test('L and U landing grips mirror across the stair width for left turns', () => {
  const lStair = { ...base, stair_type: 'l_shape' }
  assert.deepEqual(stairLandingGripPoint(lStair), [6000, 4000])
  assert.deepEqual(stairLandingGripPoint({ ...lStair, turn_direction: 'left' }), [6000, 3000])
  assert.deepEqual(stairLandingGripPoint({ ...base, turn_direction: 'left' }), [6000, 1900])
})

test('straight stairs do not expose a landing grip', () => {
  assert.equal(stairLandingGripPoint({ ...base, stair_type: 'straight' }), null)
})

test('L/U flight grips follow run geometry, mirror left turns, and rotate with the stair', () => {
  const u = stairFlightGripPoints(base)
  assert.deepEqual(u.map(grip => grip.flight), ['first', 'second'])
  assert.deepEqual(u[0].point, [5000, 3500])
  assert.deepEqual(u[1].point, [3000, 4600])
  assert.deepEqual(u[1].direction, [-1, 0])
  assert.deepEqual(stairFlightGripPoints({ ...base, rotation_deg: 90 })[0].point, [2500, 5000])
  assert.deepEqual(stairFlightGripPoints({ ...base, turn_direction: 'left' })[1].point, [3000, 2400])

  const l = stairFlightGripPoints({ ...base, stair_type: 'l_shape' })
  assert.deepEqual(l[1].point, [5500, 6000])
  assert.deepEqual(l[1].direction, [0, 1])
  assert.deepEqual(stairFlightGripPoints({ ...base, stair_type: 'straight' }), [])
})
