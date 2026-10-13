import assert from 'node:assert/strict'
import test from 'node:test'
import { constrainPointToReference, findNearestLinearReference, inferLinearConstraint, SnapSpatialIndex, snapPoint, snapToWallHost, snapOpeningOffsetBimAware, snapOpeningWidthBimAware, resizeOpeningFromEdge } from '../dist/index.js'

const view = (zoom = 1) => ({ zoom })

test('opening edge stretch grows and shrinks each jamb without moving the opposite jamb', () => {
  for (const [edge, pointer, width, center] of [
    [0, 1350, 1100, 1900], [0, 1750, 700, 2100],
    [1, 2650, 1100, 2100], [1, 2250, 700, 1900],
  ]) {
    const resized = resizeOpeningFromEdge(pointer, edge, 2000, 900, 6000)
    assert.deepEqual(resized, { width_mm: width, offset_along_wall_mm: center })
    assert.equal(center + (edge === 0 ? width / 2 : -width / 2), edge === 0 ? 2450 : 1550)
  }
  // Standard-size snapping adjusts only the dragged jamb; Ctrl permits a millimeter width.
  assert.deepEqual(resizeOpeningFromEdge(2643, 1, 2000, 900, 6000), { width_mm: 1100, offset_along_wall_mm: 2100 })
  assert.deepEqual(resizeOpeningFromEdge(2643, 1, 2000, 900, 6000, { snap: false }), { width_mm: 1093, offset_along_wall_mm: 2096.5 })
  assert.deepEqual(resizeOpeningFromEdge(1575, 0, 2025, 900, 6000), { width_mm: 900, offset_along_wall_mm: 2025 }, 'clicking a grip does not snap an unchanged opening')
})

test('opening stretch clamps the moving jamb to host ends and prevents crossing the fixed jamb', () => {
  assert.deepEqual(resizeOpeningFromEdge(-500, 0, 2000, 900, 6000), { width_mm: 2350, offset_along_wall_mm: 1275 })
  assert.deepEqual(resizeOpeningFromEdge(7000, 1, 2000, 900, 6000), { width_mm: 4350, offset_along_wall_mm: 3725 })
  assert.deepEqual(resizeOpeningFromEdge(3000, 0, 2000, 900, 6000), { width_mm: 100, offset_along_wall_mm: 2400 })
  assert.deepEqual(resizeOpeningFromEdge(0, 1, 2000, 900, 6000), { width_mm: 100, offset_along_wall_mm: 1600 })
  assert.equal(resizeOpeningFromEdge(100, 0, 70, 100, 6000), undefined, 'insufficient room cannot manufacture a valid width')
  assert.equal(resizeOpeningFromEdge(NaN, 0, 2000, 900, 6000), undefined)
})
const project = (...objects) => ({ objects: Object.fromEntries(objects.map(object => [object.id, object])) })
const column = (id, location_mm = [1000, 1000], section_mm = [200, 300], rotation_deg = 0) => ({
  id, object_type: 'structure.column', module_data: { mark: id, location_mm, section_mm, rotation_deg },
})
const beam = (id, start_point_mm, end_point_mm, section_mm = [200, 400]) => ({
  id, object_type: 'structure.beam', module_data: { mark: id, start_point_mm, end_point_mm, section_mm },
})
const wall = (id, start_point_mm, end_point_mm, thickness_mm = 100) => ({
  id, object_type: 'architecture.wall', module_data: { mark: id, start_point_mm, end_point_mm, thickness_mm },
})
const grid = (id, tag, orientation, position_mm) => ({
  id, object_type: 'structure.grid', module_data: { tag, orientation, position_mm },
})

test('snaps to rotated column corners using a screen-space tolerance', () => {
  const projectDoc = project(column('column-a', [1000, 1000], [200, 300], 90))
  const result = snapPoint([1152, 1098], projectDoc, view(), 8, new Set(['endpoint']))

  assert.equal(result.kind, 'column_corner')
  assert.equal(result.target_id, 'column-a')
  assert.deepEqual(result.point_mm, [1150, 1100])
})

test('prefers a wall corner over its parallel face when both are near the cursor', () => {
  const projectDoc = project(wall('wall-a', [0, 0], [1000, 0], 100))
  const result = snapPoint([4, 48], projectDoc, view(), 16, new Set(['endpoint', 'face']))

  assert.equal(result.kind, 'wall_corner')
  assert.deepEqual(result.point_mm, [0, 50])
})

test('editing handles ignore their own snap points but retain other-wall centerlines and intersections', () => {
  const moving = wall('wall-moving', [0, 0], [1000, 0])
  const stationary = wall('wall-stationary', [500, -1000], [500, 1000])
  const projectDoc = project(moving, stationary)

  const selfOnly = snapPoint([498, 4], project(moving), view(), 16, new Set(['centerline']), moving.id)
  assert.equal(selfOnly.kind, 'free', 'the moving wall centerline must not pull its endpoint back during a drag')
  assert.deepEqual(selfOnly.point_mm, [498, 4])

  const otherCenterline = snapPoint([498, 4], projectDoc, view(), 16, new Set(['centerline']), moving.id)
  assert.equal(otherCenterline.kind, 'wall_centerline')
  assert.equal(otherCenterline.target_id, stationary.id)
  assert.deepEqual(otherCenterline.point_mm, [500, 4])

  const crossing = snapPoint([500, 2], projectDoc, view(), 16, new Set(['intersection']), moving.id)
  assert.equal(crossing.kind, 'intersection', 'excluding direct self-snaps must retain live cross-object junctions')
  assert.equal(crossing.target_id, 'wall-moving:wall-stationary')
  assert.deepEqual(crossing.point_mm, [500, 0])
})

test('snap spatial broad phase preserves exact candidates while excluding distant objects', () => {
  const nearby = [
    wall('wall-horizontal', [0, 0], [1000, 0]),
    wall('wall-vertical', [500, -1000], [500, 1000]),
    beam('beam-near', [0, 500], [1000, 500]),
    column('column-near', [1000, 1000]),
    grid('grid-x', 'A', 'vertical', 500),
    grid('grid-y', '1', 'horizontal', 0),
  ]
  const distant = Array.from({ length: 1000 }, (_, index) =>
    wall(`wall-far-${index}`, [100_000 + index * 3000, 100_000], [101_000 + index * 3000, 100_000]),
  )
  const projectDoc = project(...nearby, ...distant)
  const index = new SnapSpatialIndex(projectDoc)
  const candidates = index.candidateObjectIds([500, 0], 20)

  assert.ok(candidates.length < 10, `expected a local candidate set, received ${candidates.length}`)
  assert.deepEqual(
    snapToWallHost([500, 8], projectDoc, view(), 800),
    snapToWallHost([500, 8], projectDoc, view(), 800, 36, index.candidateObjectIds([500, 8], 36)),
  )
  for (const point of [[500, 2], [1000, 1000], [20_000, 20_000]]) {
    const fullScan = snapPoint(point, projectDoc, view(), 16)
    const indexed = snapPoint(point, projectDoc, view(), 16, undefined, undefined,
      index.candidateObjectIds(point, 16))
    assert.deepEqual(indexed, fullScan)
  }
})

test('projects onto a column face and onto beam edges and axes', () => {
  const columnFace = snapPoint([904, 965], project(column()), view(), 8, new Set(['face']))
  assert.equal(columnFace.kind, 'column_face')
  assert.deepEqual(columnFace.point_mm, [900, 965])

  const beamEdge = snapPoint([500, 97], project(beam('beam-a', [0, 0], [1000, 0])), view(), 8, new Set(['face']))
  assert.equal(beamEdge.kind, 'beam_edge')
  assert.deepEqual(beamEdge.point_mm, [500, 100])

  const beamAxis = snapPoint([500, 4], project(beam('beam-a', [0, 0], [1000, 0])), view(), 8, new Set(['centerline']))
  assert.equal(beamAxis.kind, 'beam_axis')
  assert.deepEqual(beamAxis.point_mm, [500, 0])
})

test('keeps the column center snap stronger than its faces at normal plan zoom', () => {
  const target = column('lower-storey-column', [4000, 3000], [200, 200])
  const result = snapPoint([4000, 3000], project(target), view(0.08), 16)

  assert.equal(result.kind, 'column_center')
  assert.equal(result.target_id, 'lower-storey-column')
  assert.deepEqual(result.point_mm, [4000, 3000])
})

test('the nearest column face stays selectable with center, grid and endpoint snaps enabled at low zoom', () => {
  const target = column('C1', [4000, 3000], [200, 200])
  const doc = project(target, grid('grid-x', 'A', 'vertical', 4000), grid('grid-y', '1', 'horizontal', 3000))
  for (const zoom of [.04, .08, .2]) {
    const result = snapPoint([4000, 3100], doc, view(zoom))
    assert.equal(result.kind, 'column_face')
    assert.deepEqual(result.point_mm, [4000, 3100])
    assert.equal(snapPoint([4000, 3000], doc, view(zoom)).kind, 'column_center')
  }
  const rotated = snapPoint([1000, 1150], project(column('rotated', [1000, 1000], [300, 200], 90)), view(.04))
  assert.equal(rotated.kind, 'column_face')
  assert.deepEqual(rotated.point_mm, [1000, 1150])
})

test('classifies deterministic midpoint, endpoint, and duplicate-target ties', () => {
  const beamDoc = project(beam('beam-a', [0, 0], [1000, 0]))
  assert.equal(snapPoint([500, 0], beamDoc, view(), 8, new Set(['midpoint'])).kind, 'beam_midpoint')
  assert.equal(snapPoint([0, 0], beamDoc, view(), 8, new Set(['endpoint'])).kind, 'beam_endpoint')

  const tied = snapPoint([1000, 1000], project(column('column-z'), column('column-a')), view(), 8, new Set(['center']))
  assert.equal(tied.kind, 'column_center')
  assert.equal(tied.target_id, 'column-a')
})

test('snaps to grid intersections and line projections, then returns free outside tolerance', () => {
  const gridDoc = project(grid('grid-x', 'A', 'vertical', 500), grid('grid-y', '2', 'horizontal', 700))
  const intersection = snapPoint([500, 700], gridDoc, view(), 8, new Set(['grid']))
  assert.equal(intersection.kind, 'grid_intersection')
  assert.deepEqual(intersection.point_mm, [500, 700])

  const line = snapPoint([503, 900], gridDoc, view(), 8, new Set(['grid']))
  assert.equal(line.kind, 'grid_line')
  assert.deepEqual(line.point_mm, [500, 900])

  const free = snapPoint([517, 900], gridDoc, view(), 8, new Set(['grid']))
  assert.equal(free.kind, 'free')
  assert.deepEqual(free.point_mm, [517, 900])
})

test('projects onto individually drawn angled grid references and snaps their endpoints', () => {
  const angled = {
    id: 'grid-angle', object_type: 'structure.grid',
    module_data: { tag: 'A1', orientation: 'vertical', position_mm: 1000, extent_mm: [0, 1000], start_point_mm: [0, 0], end_point_mm: [1000, 1000] },
  }
  const onLine = snapPoint([502, 498], project(angled), view(), 8, new Set(['grid']))
  assert.equal(onLine.kind, 'grid_line')
  assert.equal(onLine.target_id, 'grid-angle')
  assert.deepEqual(onLine.point_mm, [500, 500])

  const endpoint = snapPoint([1000, 1000], project(angled), view(), 8, new Set(['grid']))
  assert.equal(endpoint.kind, 'grid_line')
  assert.deepEqual(endpoint.point_mm, [1000, 1000])
})

test('intersection mode snaps only to finite beam/wall crossings', () => {
  const beamObject = beam('beam-a', [0, 500], [1000, 500])
  const wallObject = wall('wall-b', [500, 0], [500, 1000])
  const projectDoc = project(beamObject, wallObject)
  const result = snapPoint([504, 500], projectDoc, view(), 8, new Set(['intersection']))
  const reversed = snapPoint([504, 500], project(wallObject, beamObject), view(), 8, new Set(['intersection']))

  assert.equal(result.kind, 'intersection')
  assert.equal(result.target_id, 'beam-a:wall-b')
  assert.deepEqual(result.point_mm, [500, 500])
  assert.deepEqual(reversed, result, 'intersection provenance must not depend on project object insertion order')

  const outside = snapPoint([1100, 500], projectDoc, view(), 8, new Set(['intersection']))
  assert.equal(outside.kind, 'free')
})

test('snaps hosted openings to the nearest wall and enforces end clearance', () => {
  const projectDoc = project(wall('wall-a', [0, 0], [3000, 0], 100))
  const result = snapToWallHost([420, 20], projectDoc, view(), 800)
  assert.equal(result.wall_id, 'wall-a')
  assert.equal(result.offset_along_wall_mm, 420)
  assert.deepEqual(result.point_mm, [420, 0])
  assert.equal(snapToWallHost([1500, 200], projectDoc, view(), 800), null)
  assert.equal(snapToWallHost([1500, 0], project(wall('short-wall', [0, 0], [700, 0], 100)), view(), 800), null,
    'a host shorter than the opening must not appear as a valid placement target')
  assert.equal(snapToWallHost([1500, 0], projectDoc, view(), 0), null, 'invalid opening widths cannot create a host snap')
})

test('hosted-opening snaps choose a stable wall when parallel hosts are equidistant', () => {
  const lower = wall('wall-a', [0, -50], [3000, -50], 100)
  const upper = wall('wall-z', [0, 50], [3000, 50], 100)
  const forward = snapToWallHost([1500, 0], project(upper, lower), view(), 800)
  const reverse = snapToWallHost([1500, 0], project(lower, upper), view(), 800)

  assert.equal(forward.wall_id, 'wall-a')
  assert.deepEqual(reverse, forward, 'project object enumeration order must not change the chosen host')
})

test('parallel and perpendicular constraints use the nearest stable beam/wall reference', () => {
  const projectDoc = project(
    wall('wall-z', [0, 500], [1000, 500]),
    beam('beam-a', [0, 0], [1000, 0]),
    wall('far-wall', [0, 1000], [1000, 1000]),
  )
  const reference = findNearestLinearReference(projectDoc, [250, 50], 100)
  assert.equal(reference.target_id, 'beam-a')

  const parallel = constrainPointToReference([650, 280], [250, 50], reference, 'parallel')
  assert.equal(parallel.kind, 'parallel')
  assert.deepEqual(parallel.point_mm, [650, 50])
  assert.equal(parallel.target_id, 'beam-a')

  const perpendicular = constrainPointToReference([610, 480], [250, 50], reference, 'perpendicular')
  assert.equal(perpendicular.kind, 'perpendicular')
  assert.deepEqual(perpendicular.point_mm, [250, 480])

  assert.equal(findNearestLinearReference(projectDoc, [250, 250], 100), null)
})

test('automatically infers parallel and perpendicular intent within screen-space tolerance', () => {
  const reference = findNearestLinearReference(project(beam('beam-a', [0, 0], [1000, 0])), [100, 20], 100)
  assert.ok(reference)
  assert.equal(inferLinearConstraint([600, 11], [100, 20], reference, 10), 'parallel')
  assert.equal(inferLinearConstraint([108, 500], [100, 20], reference, 10), 'perpendicular')
  assert.equal(inferLinearConstraint([600, 150], [100, 20], reference, 10), null)
  assert.equal(inferLinearConstraint([100, 20], [100, 20], reference, 10), null)
})

test('snapOpeningOffsetBimAware enforces 100mm clearance from column and wall ends', () => {
  // Wall length 3000mm, opening width 800mm (half width = 400mm)
  // minOffset without column: 100 + 400 = 500mm
  const r1 = snapOpeningOffsetBimAware(520, 3000, 800)
  assert.equal(r1.offset_along_wall_mm, 500)
  assert.equal(r1.snap_type, 'wall_end_clearance')

  // Wall start with 200mm column (half col = 100mm) -> minOffset = 100 + 100 + 400 = 600mm
  const r2 = snapOpeningOffsetBimAware(615, 3000, 800, { startColumnWidth_mm: 200 })
  assert.equal(r2.offset_along_wall_mm, 600)
  assert.equal(r2.snap_type, 'column_clearance')

  // Wall midpoint: 1500mm
  const r3 = snapOpeningOffsetBimAware(1520, 3000, 800)
  assert.equal(r3.offset_along_wall_mm, 1500)
  assert.equal(r3.snap_type, 'midpoint')

  // Step quantization: 1100 -> 1100, 1120 -> 1100, 1130 -> 1150
  const r4 = snapOpeningOffsetBimAware(1130, 3000, 800)
  assert.equal(r4.offset_along_wall_mm, 1150)
  assert.equal(r4.snap_type, 'increment')
})

test('snapOpeningWidthBimAware snaps to standard catalog increments and clamps within max width', () => {
  assert.equal(snapOpeningWidthBimAware(885, 2000), 900)
  assert.equal(snapOpeningWidthBimAware(990, 2000), 1000)
  assert.equal(snapOpeningWidthBimAware(1180, 2000), 1200)
  // Max width clamping
  assert.equal(snapOpeningWidthBimAware(1500, 1200), 1200)
})
