import test from 'node:test'
import assert from 'node:assert/strict'
import { snapPoint, snapToDrawingAxis, resolveBeamSupportSnap, SnapSpatialIndex } from '../dist/index.js'

const grid = (id, start, end) => ({ id, object_type: 'structure.grid', module_data: { tag: id, orientation: 'horizontal', position_mm: 0, start_point_mm: start, end_point_mm: end } })
const project = (...objects) => ({ objects: Object.fromEntries(objects.map(object => [object.id, object])) })

test('beam supports follow the snapped column rather than the first nearby entry', () => {
  const column = (id, x) => ({ id, object_type: 'structure.column', module_data: { mark: id, location_mm: [x, 0, 0], section_mm: [200, 200], rotation_deg: 0 } })
  for (const objects of [[column('first', 2000), column('nearest', 2300)], [column('nearest', 2300), column('first', 2000)]]) {
    const doc = project(...objects)
    const acquired = snapPoint([2399, 20], doc, { zoom: 1 })
    const beam = resolveBeamSupportSnap(acquired, doc)
    assert.equal(beam.target_id, 'nearest')
    assert.deepEqual(beam.point_mm, [2300, 0])
    const free = { point_mm: [2360, 400], kind: 'free', description: 'free' }
    assert.equal(resolveBeamSupportSnap(free, doc), free)
  }
})

test('drawn and angled grids offer exact intersections, including mixed system axes', () => {
  for (const zoom of [.04, .2, 1]) {
    const doc = project(grid('A', [0, 0], [2000, 2000]), grid('B', [0, 2000], [2000, 0]))
    const result = snapPoint([1000 + 2 / zoom, 1000 + 3 / zoom], doc, { zoom })
    assert.equal(result.kind, 'grid_intersection')
    assert.deepEqual(result.point_mm, [1000, 1000])
    const mixed = project(grid('diagonal', [0, 0], [2000, 2000]), { id: 'axis', object_type: 'structure.grid', module_data: { tag: '1', orientation: 'vertical', position_mm: 1000 } })
    assert.equal(snapPoint([1002, 1003], mixed, { zoom }).kind, 'grid_intersection')
  }
})

test('dragging a grid excludes its own intersections and line projection', () => {
  const doc = project(grid('A', [0, 0], [2000, 2000]), grid('B', [0, 2000], [2000, 0]))
  assert.equal(snapPoint([1001, 1001], doc, { zoom: 1 }, 16, new Set(['grid']), 'A').kind, 'grid_line')
  assert.equal(snapPoint([1001, 1001], project(doc.objects.A), { zoom: 1 }, 16, new Set(['grid']), 'A').kind, 'free')
})

test('polygon corners, foundations and opening jambs survive the spatial broad phase', () => {
  const doc = project(
    { id: 'floor', object_type: 'architecture.floor', module_data: { boundary_mm: [[0, 0], [2000, 0], [2000, 1000], [0, 1000]] } },
    { id: 'footing', object_type: 'structure.foundation', module_data: { center_mm: [5000, 5000, 0], size_mm: [800, 800, 400] } },
    { id: 'wall', object_type: 'architecture.wall', module_data: { start_point_mm: [0, 3000], end_point_mm: [5000, 3000], thickness_mm: 100 } },
    { id: 'door', object_type: 'door_window.door', module_data: { wall_id: 'wall', offset_along_wall_mm: 2000, width_mm: 900 } },
  )
  const index = new SnapSpatialIndex(doc)
  for (const point of [[2001, 1], [4601, 4601], [1551, 3001]]) {
    const ids = index.candidateObjectIds(point, 16)
    const snap = snapPoint(point, doc, { zoom: 1 }, 16, new Set(['endpoint']), undefined, ids)
    assert.equal(snap.kind, 'object_endpoint')
  }
})

test('axis inference uses screen tolerance and leaves exact object targets intact', () => {
  for (const zoom of [.04, .2, 1]) {
    const point = [100 / zoom, 3 / zoom]
    const snap = snapToDrawingAxis({ point_mm: point, kind: 'free', description: '' }, point, [0, 0], { zoom })
    assert.deepEqual(snap.point_mm, [100 / zoom, 0])
    const endpoint = { point_mm: point, kind: 'wall_endpoint', target_id: 'wall', description: 'endpoint' }
    assert.equal(snapToDrawingAxis(endpoint, point, [0, 0], { zoom }), endpoint)
    const offAxis = { point_mm: [100 / zoom, 20 / zoom], kind: 'free', description: '' }
    assert.equal(snapToDrawingAxis(offAxis, offAxis.point_mm, [0, 0], { zoom }), offAxis)
  }
})
