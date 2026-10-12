import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { deserializeProject, serializeProject, validateProjectV2, resolveBeamBaseElevation, resolveSlabElevation } from '../packages/project-model/dist/index.js'
import { CommandBus, ProjectCommandSession } from '../packages/command-runtime/dist/index.js'
import { structureOutputs } from '../packages/structure-engine/dist/index.js'
import { computeStairGeometry, getStairPlanDrawing } from '../packages/architecture-engine/dist/index.js'
import { buildProjectRepresentations3D, getPlanVisibleObjects, getRepresentationTriangles } from '../packages/representation-engine/dist/index.js'
import { runCoordination } from '../packages/clash-engine/dist/index.js'
import { calculateTakeoff } from '../packages/takeoff-engine/dist/index.js'
import { createReferenceHouseDemo, demoId, referenceGridX, referenceGridY } from './create_reference_house_demo.mjs'

const model = deserializeProject(await readFile(new URL('../examples/constructflow-reference-house-2storey.cfproj', import.meta.url), 'utf8'))
const objects = Object.values(model.objects)
const family = name => objects.filter(o => o.object_type === name)
const data = key => model.objects[demoId(key)].module_data
const output = key => structureOutputs(model).find(o => o.object_id === demoId(key))
const heightBand = out => {
  const z = out.meshes.flat().map(v => v[2])
  return [Math.min(...z), Math.max(...z)]
}
const inPolygon = (p, ring) => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[j]
    if ((ay > p[1]) !== (by > p[1]) && p[0] < (bx - ax) * (p[1] - ay) / (by - ay) + ax) inside = !inside
  }
  return inside
}

test('saved demo uses the requested datums, reference bays and stable UUIDs', () => {
  validateProjectV2(model)
  assert.deepEqual(model.levels.map(l => l.elevation_mm), [0, 400, 3800, 7200])
  assert.equal(model.project.active_level_id, 'GF')
  assert.ok(objects.every(o => /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/.test(o.id)))
  assert.ok(objects.every(o => o.created_phase === 'new_construction'))
  assert.deepEqual(data('grid:GF:vertical:0').system_positions_mm, referenceGridX)
  assert.deepEqual(data('grid:GF:horizontal:0').system_positions_mm, referenceGridY.map(y => 8800 - y).reverse())
  assert.equal(family('architecture.room').length, 18)
  assert.equal(family('structure.slab').length, 18)
  assert.equal(family('architecture.floor').length, 0)
  assert.equal(family('architecture.bathroom').length, 0)
  const regenerated = createReferenceHouseDemo()
  assert.deepEqual(Object.keys(regenerated.objects).sort(), Object.keys(model.objects).sort())
})

test('compound floors finish exactly at the storey datum or the 100 mm drop', () => {
  for (const o of family('structure.slab')) {
    const d = o.module_data
    const level = model.levels.find(l => l.id === d.level_id).elevation_mm
    const wetOrOutdoor = ['G01', 'G05', 'G06', 'G10', 'U03', 'U04', 'U07', 'U08'].includes(d.mark)
    const expected = level - (d.mark === 'G09' ? 300 : wetOrOutdoor ? 100 : 0)
    const layers = d.finish_layers.reduce((sum, layer) => sum + layer.thickness_mm + (layer.offset_mm ?? 0), 0)
    assert.equal(resolveSlabElevation(model, d) + d.topping_mm + layers, expected, d.mark)
    const band = heightBand(structureOutputs(model).find(out => out.object_id === o.id))
    assert.ok(band[1] >= expected && band[1] < expected + 40, `${d.mark}: finish mesh elevation`)
    assert.equal(model.types.find(t => t.id === d.type_id).object_type, 'structure.slab')
  }
  assert.deepEqual(heightBand(output('floor:GF:G03')), [210, 400])
  assert.deepEqual(heightBand(output('floor:L1:U02')), [3610, 3800])
})

test('outdoor slope drains away from the building and changes every assembly layer', () => {
  for (const key of ['floor:GF:G09', 'floor:GF:G10']) {
    const d = data(key), out = output(key)
    assert.equal(d.slope_ratio, 0.01)
    assert.equal(d.drain_direction_deg, 270)
    const minY = Math.min(...d.boundary_mm.map(p => p[1])), maxY = Math.max(...d.boundary_mm.map(p => p[1]))
    const zAt = y => Math.max(...out.meshes.flat().filter(v => Math.abs(v[1] - y) < 0.001).map(v => v[2]))
    assert.ok(Math.abs(zAt(maxY) - zAt(minY) - (maxY - minY) * 0.01) < 0.001)
  }
})

test('floor beams stay below finishes and roof beams end at +7.20', () => {
  for (const o of family('structure.beam')) {
    const d = o.module_data, top = resolveBeamBaseElevation(model, d) + d.section_mm[1]
    assert.equal(top, d.level_id === 'RF' ? 7200 : d.mark === 'RB200' ? 3650 : d.level_id === 'DATUM' ? 260 : 3660)
  }
  assert.ok(family('structure.beam').filter(o => o.module_data.mark === 'B250').every(o => o.host_refs.length === 2))
})

test('ground framing and footings belong to the datum plan, and doors have usable sizes', () => {
  const ground = structuredClone(model); ground.project.active_level_id = 'DATUM'
  const first = getPlanVisibleObjects(model), base = getPlanVisibleObjects(ground)
  assert.equal(first.filter(o => o.object_type === 'structure.foundation').length, 0)
  assert.equal(first.filter(o => o.object_type === 'structure.beam').length, 0)
  assert.equal(base.filter(o => o.object_type === 'structure.foundation').length, family('structure.foundation').length)
  assert.ok(base.some(o => o.object_type === 'structure.beam'))
  assert.ok(base.some(o => o.object_type === 'structure.grid'))
  for (const door of family('door_window.door')) {
    const d = door.module_data
    assert.equal(d.width_mm, d.mark === 'D1' ? 900 : 800)
    assert.equal(d.height_mm, 2000)
  }
})

test('exterior wall finished faces align with outside column faces, not centre lines', () => {
  for (const level of ['GF', 'L1']) {
    const south = data(`wall:${level}:outer0`), east = data(`wall:${level}:outer1`)
    assert.equal(south.start_point_mm[1] + south.thickness_mm / 2, 8800 + 100)
    assert.equal(east.start_point_mm[0] + east.thickness_mm / 2, 13800 + 100)
  }
})

test('one stair connects both floors with a real clear opening and upper landing', () => {
  const stair = data('stair'), geom = computeStairGeometry(stair)
  assert.equal(stair.start_point_mm[2], 400)
  assert.ok(Math.abs(stair.num_risers * stair.riser_height_mm - 3400) < 1e-8)
  assert.equal(Math.max(...computeStairGeometry({ ...stair, has_handrail: false }).mesh3d.vertices.map(v => v[2])), 3800)
  assert.equal(Math.max(...geom.mesh3d.vertices.map(v => v[2])), 4700)
  assert.ok(geom.code_check.passed)
  assert.equal(stair.rotation_deg, 180)
  assert.ok(geom.geometry2d.landing_bounds_mm.every(p => p[0] <= 5350.001), 'turn landing is on the west, as in the reference')
  assert.ok(geom.geometry2d.walkline_path_mm[1][0] < geom.geometry2d.walkline_path_mm[0][0], 'lower flight climbs west')
  for (const level of ['GF', 'L1']) {
    const p = structuredClone(model); p.project.active_level_id = level
    assert.equal(getPlanVisibleObjects(p).filter(o => o.object_type === 'architecture.stair').length, 1)
  }
  for (const p of [[5000, 4000], [6800, 4500]])
    assert.ok(family('structure.slab').filter(o => o.module_data.level_id === 'L1').every(o => !inPolygon(p, o.module_data.boundary_mm)), `clear opening at ${p}`)
  assert.ok(inPolygon([4300, 4900], data('floor:L1:U09').boundary_mm))
  assert.ok(inPolygon([7351, 4000], data('floor:L1:U05').boundary_mm), 'upper flight arrives at the east hall floor')
})

test('architectural and framing plans use distinct visible and selectable objects on both floors', () => {
  for (const level of ['GF', 'L1']) {
    const p = structuredClone(model); p.project.active_level_id = level
    const architectural = getPlanVisibleObjects(p, 'architecture')
    const framing = getPlanVisibleObjects(p, 'framing')
    assert.ok(architectural.some(o => o.object_type === 'architecture.wall'))
    assert.ok(architectural.some(o => o.object_type === 'structure.slab'))
    assert.ok(!architectural.some(o => ['structure.beam', 'structure.foundation', 'roof.system'].includes(o.object_type)))
    const beams = framing.filter(o => o.object_type === 'structure.beam')
    assert.ok(beams.length > 0)
    assert.ok(beams.every(o => o.module_data.level_id === (level === 'GF' ? 'DATUM' : 'L1')))
    assert.ok(framing.every(o => ['structure.beam', 'structure.column', 'structure.foundation', 'structure.grid'].includes(o.object_type)))
  }
  assert.ok(family('structure.column').every(o => o.module_data.mark === 'C1' && o.module_data.section_mm.every(n => n === 200)))
  for (const o of family('architecture.wall')) {
    assert.ok(['W1', 'W2', 'W3'].includes(o.module_data.mark))
    const t = model.types.find(t => t.id === o.module_data.type_id)
    assert.ok(['W1', 'W2', 'W3'].includes(t.parameters.inside_finish_mark))
    assert.ok(['W1', 'W2', 'W3'].includes(t.parameters.outside_finish_mark))
  }
  const entry = data('opening:GF:carport-entry')
  assert.ok(entry.location_mm[0] > 6300, 'carport door enters the stair hall, not the bathroom')
})

test('stair floor-plan cut plane separates overhead treads and reverses the upper direction', () => {
  const stair = data('stair'), lower = getStairPlanDrawing(stair, 400), upper = getStairPlanDrawing(stair, 3800)
  assert.equal(lower.direction, 'up')
  assert.equal(upper.direction, 'down')
  assert.ok(lower.overhead_paths_mm.length > 0 && upper.overhead_paths_mm.length > 0)
  assert.notDeepEqual(lower.solid_paths_mm, upper.solid_paths_mm)
  const session = new ProjectCommandSession(model)
  assert.equal(session.execute([{ name: 'UpdateStair', input: { id: demoId('stair'), rotation_deg: 90 } }]).status, 'success')
  assert.equal(session.project.objects[demoId('stair')].module_data.rotation_deg, 90)
  assert.equal(session.undo().objects[demoId('stair')].module_data.rotation_deg, 180)
  assert.equal(deserializeProject(serializeProject(session.redo())).objects[demoId('stair')].module_data.rotation_deg, 90)
})

test('every stair property updates the shared geometry, undoes and survives save/reopen', () => {
  const id = demoId('stair'), original = model.objects[id]
  for (const changes of [
    { width_mm: 950 }, { tread_depth_mm: 270 }, { landing_depth_mm: 1100 }, { num_risers: 20 },
    { first_flight_risers: 8 }, { second_tread_depth_mm: 280 }, { flight_gap_mm: 300 },
    { top_level_id: '', total_rise_mm: 3600 }, { base_offset_mm: 50 }, { top_offset_mm: 100 },
    { level_id: 'DATUM' }, { rotation_deg: 90 }, { turn_direction: 'left' }, { stair_type: 'l_shape' },
    { start_point_mm: [7600, 5525, 400] }, { has_handrail: false }, { handrail_height_mm: 1000 },
  ]) {
    const session = new ProjectCommandSession(model)
    assert.equal(session.execute([{ name: 'UpdateStair', input: { id, ...changes } }]).status, 'success', JSON.stringify(changes))
    const edited = deserializeProject(serializeProject(session.project)).objects[id].module_data
    assert.notDeepEqual(computeStairGeometry(edited), computeStairGeometry(original.module_data), JSON.stringify(changes))
    assert.deepEqual(session.undo().objects[id], original)
    assert.deepEqual(session.redo().objects[id].module_data, edited)
  }
  for (const changes of [{ width_mm: -1 }, { num_risers: 18.5 }, { rotation_deg: NaN }, { turn_direction: 'invalid' }, { top_level_id: 'MISSING' }, { first_flight_risers: 17 }, { second_tread_depth_mm: 0 }, { flight_gap_mm: -1 }]) {
    const response = CommandBus.execute(model, 'UpdateStair', { id, ...changes })
    assert.notEqual(response.result.status, 'success')
    assert.deepEqual(response.updatedProject, model)
  }
})

test('stair ends follow edited floor datums and fixed-height mode remains available', () => {
  const id = demoId('stair'), session = new ProjectCommandSession(model)
  assert.equal(session.execute([{ name: 'UpdateLevel', input: { id: 'L1', elevation_mm: 4000 } }]).status, 'success')
  assert.equal(session.project.objects[id].module_data.total_rise_mm, 3600)
  assert.equal(Math.max(...computeStairGeometry({ ...session.project.objects[id].module_data, has_handrail: false }).mesh3d.vertices.map(p => p[2])), 4000)
  session.undo()
  assert.equal(session.execute([{ name: 'UpdateStair', input: { id, top_level_id: '', total_rise_mm: 3000 } }]).status, 'success')
  assert.equal(session.project.objects[id].module_data.top_level_id, undefined)
  assert.equal(session.project.objects[id].module_data.total_rise_mm, 3000)
  assert.equal(session.project.objects[id].module_data.riser_height_mm, 3000 / 18)
})

test('representations contain all physical objects, hosted openings and finite geometry', () => {
  const representations = buildProjectRepresentations3D(model)
  assert.deepEqual(representations.warnings, [])
  for (const o of representations.objects) {
    const triangles = getRepresentationTriangles(o)
    // Opening frame/leaf geometry is produced by the 3D opening renderer,
    // not by the common triangle-mesh helper.
    assert.ok(triangles.length > 0 || o.shape.kind === 'opening', o.object_id)
    assert.ok(triangles.flat(2).every(Number.isFinite), o.object_id)
  }
  for (const o of [...family('door_window.door'), ...family('door_window.window')]) {
    const d = o.module_data, host = model.objects[d.wall_id].module_data
    const len = Math.hypot(host.end_point_mm[0] - host.start_point_mm[0], host.end_point_mm[1] - host.start_point_mm[1])
    assert.ok(d.offset_along_wall_mm - d.width_mm / 2 > 0 && d.offset_along_wall_mm + d.width_mm / 2 < len)
    for (const axis of [0, 1]) assert.ok(Math.abs(d.location_mm[axis] - host.start_point_mm[axis] - (host.end_point_mm[axis] - host.start_point_mm[axis]) * d.offset_along_wall_mm / len) < 1e-8)
  }
})

test('doors and structural openings have no hard or clearance conflicts', () => {
  const report = runCoordination(model)
  assert.equal(report.summary.by_severity.hard, 0)
  assert.equal(report.summary.by_severity.clearance, 0)
})

test('floor level, thickness, layers and slope edits undo, redo and reopen', () => {
  const id = demoId('floor:GF:G10'), session = new ProjectCommandSession(model)
  const response = session.execute([{ name: 'UpdateSlab', input: { id, level_id: 'L1', elevation_offset_mm: -90,
    thickness_mm: 180, slope_ratio: 0.02, drain_direction_deg: 180,
    finish_layers: [{ material: 'outdoor_tile', thickness_mm: 15, offset_mm: 5, quantity_unit: 'm2' }] } }])
  assert.equal(response.status, 'success')
  assert.equal(session.project.objects[id].module_data.thickness_mm, 180)
  assert.deepEqual(session.undo().objects[id], model.objects[id])
  const reopened = deserializeProject(serializeProject(session.redo()))
  assert.equal(reopened.objects[id].module_data.level_id, 'L1')
  assert.equal(reopened.objects[id].module_data.finish_layers[0].offset_mm, 5)
  assert.equal(heightBand(structureOutputs(reopened).find(o => o.object_id === id))[1], 3800)
  const takeoff = calculateTakeoff(reopened)
  assert.ok(takeoff.lines.some(l => l.source_object_ids.includes(id) && l.material === 'outdoor_tile' && l.unit === 'm2'))
  const deleted = CommandBus.execute(reopened, 'DeleteObject', { object_id: id })
  assert.equal(deleted.result.status, 'success')
  assert.equal(deleted.updatedProject.objects[id], undefined)
})
