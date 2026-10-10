import assert from 'node:assert/strict'
import test from 'node:test'
import {
  axisBox,
  boundsOf,
  capsuleSegments,
  centroidOf,
  contactBetweenSolids,
  gjkDistance,
  obbFromAxis,
  prismFromBoundary,
  supportOf,
} from '../dist/exactContact.js'

const close = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label ?? ''} expected ${expected} ± ${tolerance} but got ${actual}`)

test('support and bounds follow rotation instead of the axis-aligned envelope', () => {
  const rotated = obbFromAxis([0, 0, 0], [1000, 1000, 0], 200, 400, 0)
  const bounds = boundsOf(rotated)
  // 45° box centered at (500, 500): 500 along the long axis and 100 across it, projected on x.
  close(bounds.max[0], 500 + 500 + 70.7107, 1e-3, 'max x')
  close(bounds.min[0], 500 - 500 - 70.7107, 1e-3, 'min x')
  close(bounds.max[2], 200, 1e-6, 'max z')
  close(bounds.max[1], 500 + 500 + 70.7107, 1e-3, 'max y')
  assert.deepEqual(centroidOf(rotated).map(Math.round), [500, 500, 0])
})

const vecLen = v => Math.hypot(...v)

test('disjoint axis boxes report the exact clearance distance', () => {
  const a = axisBox([0, 0, 0], [1000, 1000, 1000])
  const b = axisBox([0, 0, 1300], [1000, 1000, 1000])
  const contact = contactBetweenSolids(a, b)
  assert.equal(contact.intersecting, false)
  close(contact.distance_mm, 300, 1e-3, 'distance')
  // A sits below B, so moving A along -z increases the clearance.
  close(contact.direction[2], -1, 1e-6, 'direction z')
  close(contact.direction[0], 0, 1e-6, 'direction x')
  assert.equal(contact.method, 'gjk_epa')

  const clearance = contactBetweenSolids(a, b, { clearance_mm: 500 })
  close(clearance.clearance_shortfall_mm, 200, 1e-3, 'shortfall')
  const satisfied = contactBetweenSolids(a, b, { clearance_mm: 250 })
  assert.equal(satisfied.clearance_shortfall_mm, 0)
})

test('overlapping axis boxes report penetration depth and a resolving direction', () => {
  const a = axisBox([0, 0, 0], [1000, 1000, 1000])
  const b = axisBox([0, 0, 1200], [1000, 1000, 2000])
  const contact = contactBetweenSolids(a, b)
  assert.equal(contact.intersecting, true)
  // B bottom sits 200 above A bottom-center: A spans z ∈ [-500, 500], B z ∈ [200, 2200] → 300 deep.
  close(contact.penetration_mm, 300, 0.5, 'penetration')
  close(Math.abs(contact.direction[2]), 1, 1e-3, 'direction z')
  assert.equal(contact.distance_mm, 0)
  assert.equal(contact.signed_separation_mm <= 0, true)
  // Translating A by the reported depth + slack along the reported direction removes the overlap.
  const shift = (contact.penetration_mm + 1) * contact.direction[2]
  const moved = axisBox([0, 0, shift], [1000, 1000, 1000])
  assert.equal(contactBetweenSolids(moved, b).intersecting, false)
})

test('penetration depth picks the shallowest exit axis', () => {
  const a = axisBox([0, 0, 0], [1000, 100, 1000])
  const b = axisBox([0, 0, 950], [1000, 200, 1000])
  // Overlap is 50 in z and 50 in y: the engine must return ~50 from an axis, never the diagonal.
  const contact = contactBetweenSolids(a, b)
  close(contact.penetration_mm, 50, 0.5, 'penetration')
  const dominant = contact.direction.map(Math.abs)
  assert.ok(Math.max(...dominant) > 0.7, `expected an axis-dominant direction, got ${contact.direction}`)
})

test('diagonal beams separated laterally stay clear even though their AABBs overlap', () => {
  // Two parallel 45° beams offset by 1000 mm perpendicular to their axes.
  const first = obbFromAxis([0, 0, 0], [4000, 4000, 0], 200, 400, 200)
  const second = obbFromAxis([0, -1000, 0], [4000, 3000, 0], 200, 400, 200)
  const boundsA = boundsOf(first)
  const boundsB = boundsOf(second)
  const aabbOverlap = [0, 1, 2].every(axis => boundsA.min[axis] <= boundsB.max[axis] && boundsB.min[axis] <= boundsA.max[axis])
  assert.equal(aabbOverlap, true, 'the inflated axis-aligned envelopes do overlap')

  const contact = contactBetweenSolids(first, second)
  assert.equal(contact.intersecting, false)
  // Perpendicular centerline distance 1000/√2 ≈ 707.1 minus two 100 mm half-widths.
  close(contact.distance_mm, 707.107 - 200, 1, 'exact surface distance')
})

test('a vertical pipe crossing a beam reports the shallowest lateral translation', () => {
  const beam = obbFromAxis([0, 0, 200], [4000, 0, 200], 200, 400, 0)
  const [pipe] = capsuleSegments([[2000, 0, -500], [2000, 0, 900]], 50)
  const contact = contactBetweenSolids(pipe, beam)
  assert.equal(contact.intersecting, true)
  // Beam occupies y ∈ [-100, 100]; the 50 mm radius capsule must clear by 150 mm of lateral shift.
  close(contact.penetration_mm, 150, 0.5, 'penetration')
  close(Math.abs(contact.direction[1]), 1, 1e-6, 'lateral direction')
  const shifted = { kind: 'capsule', a: [2000, 150 * contact.direction[1] + 1, -500], b: [2000, 150 * contact.direction[1] + 1, 900], radius: 50 }
  assert.equal(contactBetweenSolids(shifted, beam).intersecting, false)
})

test('a pipe routed 300 mm below a beam reports exact clearance, not an AABB verdict', () => {
  const beam = obbFromAxis([0, 0, 200], [4000, 0, 200], 200, 400, 0)
  const [pipe] = capsuleSegments([[1000, 0, -350], [3000, 0, -350]], 50)
  const contact = contactBetweenSolids(pipe, beam)
  assert.equal(contact.intersecting, false)
  // Beam bottom 0 mm, pipe outer top at -300 mm.
  close(contact.distance_mm, 300, 0.5, 'clearance')
})

test('door swing sector blocks a fixture only when it really intersects the arc', () => {
  const swing = { kind: 'sector_prism', hinge: [0, 0], radius: 900, start_deg: 0, sweep_deg: 90, z_min: 0, z_max: 2000 }
  const inside = prismFromBoundary([[-200, -200], [300, -200], [300, 300], [-200, 300]], 0, 1000)
  const outside = prismFromBoundary([[1200, 1200], [1500, 1200], [1500, 1500], [1200, 1500]], 0, 1000)

  const hit = contactBetweenSolids(swing, inside)
  assert.equal(hit.intersecting, true)
  assert.ok(hit.penetration_mm > 100, `expected a real overlap, got ${hit.penetration_mm}`)

  const clear = contactBetweenSolids(swing, outside)
  assert.equal(clear.intersecting, false)
  close(clear.distance_mm, Math.hypot(1200, 1200) - 900, 2, 'arc to corner clearance')
})

test('a cabinet standing off a window opening reads as a clearance shortfall, not a clash', () => {
  // Opening volume inside a 100 mm wall: y ∈ [-50, 50]. Cabinet depth 600 sits in front of it.
  const opening = axisBox([0, 0, 1200], [1800, 100, 1200])
  const cabinet = axisBox([0, 390, 400], [600, 600, 800]) // y ∈ [90, 690] → 40 mm clear
  const contact = contactBetweenSolids(opening, cabinet, { clearance_mm: 50 })
  assert.equal(contact.intersecting, false)
  close(contact.distance_mm, 40, 0.5, 'distance')
  close(contact.clearance_shortfall_mm, 10, 0.5, 'shortfall')

  const clear = contactBetweenSolids(opening, axisBox([0, 450, 400], [600, 600, 800]), { clearance_mm: 50 })
  close(clear.distance_mm, 100, 0.5, 'clear distance')
  assert.equal(clear.clearance_shortfall_mm, 0)

  const touching = contactBetweenSolids(opening, axisBox([0, 350, 400], [600, 600, 800]), { clearance_mm: 50 })
  assert.equal(touching.intersecting, false)
  close(touching.distance_mm, 0, 0.5, 'touching distance')
  close(touching.clearance_shortfall_mm, 50, 0.5, 'shortfall when touching')
})

test('a downlight buried in a beam reports the shallowest exit and the bracketed depth', () => {
  // Beam along x with cross-section 200 (y) x 400 (z) from z = 0; a 75 mm radius downlight sits
  // 50 mm inside its top face: the vertical exit is the cheapest one.
  const beam = obbFromAxis([0, 0, 200], [4000, 0, 200], 200, 400, 0)
  const downlight = { kind: 'disc_prism', center: [2000, 0], radius: 75, z_min: 350, z_max: 450 }
  const contact = contactBetweenSolids(downlight, beam)
  assert.equal(contact.intersecting, true)
  close(contact.penetration_mm, 50, 0.5, 'penetration')
  assert.ok(contact.penetration_range_mm[0] <= contact.penetration_mm + 1e-6)
  assert.ok(contact.penetration_range_mm[1] >= contact.penetration_mm - 1e-6)
  close(Math.abs(contact.direction[2]), 1, 1e-6, 'vertical exit')
  // Applying the reported shift must actually remove the overlap.
  const shift = (contact.penetration_mm + 1) * contact.direction[2]
  const moved = { ...downlight, z_min: downlight.z_min + shift, z_max: downlight.z_max + shift }
  assert.equal(contactBetweenSolids(moved, beam).intersecting, false)
})

test('a fixture outside a shelf reports exact clearance instead of a false clash', () => {
  const shelf = axisBox([0, 0, 1000], [3000, 3000, 200])
  const below = { kind: 'disc_prism', center: [1500, 1500], radius: 75, z_min: 700, z_max: 800 }
  const contact = contactBetweenSolids(shelf, below)
  assert.equal(contact.intersecting, false)
  close(contact.distance_mm, 100, 0.5, 'clearance below the shelf')
  const corner = { kind: 'disc_prism', center: [1500, 1500], radius: 75, z_min: 950, z_max: 1050 }
  const pierced = contactBetweenSolids(shelf, corner)
  assert.equal(pierced.intersecting, true)
  // The disc overlaps the shelf only near its +x/+y corner: the cheapest exit is 75 mm sideways.
  close(pierced.penetration_mm, 75, 1, 'corner penetration')
})

test('exact contact is deterministic and reports its accuracy provenance', () => {
  const a = obbFromAxis([0, 0, 0], [3000, 400, 0], 200, 400, 200)
  const b = obbFromAxis([0, 500, 0], [3000, 900, 0], 200, 400, 200)
  const first = contactBetweenSolids(a, b)
  const second = contactBetweenSolids(a, b)
  assert.deepEqual(first, second)
  assert.deepEqual(first.method, 'gjk_epa')
  assert.equal(first.converged, true)
  assert.equal(first.tolerance_mm, 1e-3)
  assert.equal(typeof first.point_a_mm[0], 'number')
})

test('gjk exposes witness points that sit on both surfaces', () => {
  const a = axisBox([0, 0, 0], [100, 100, 100])
  const b = axisBox([300, 0, 0], [100, 100, 100])
  const result = gjkDistance(a, b)
  assert.equal(result.intersecting, false)
  close(result.distance_mm, 200, 1e-3, 'distance')
  close(result.point_a_mm[0], 50, 1e-6)
  close(result.point_b_mm[0], 250, 1e-6)
})
