import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyProjectDocument, serializeProject, deserializeProject } from '@constructflow/project-model'
import { ProjectCommandSession } from '@constructflow/command-runtime'
import { createKitchenProofProject, planExtensionPreset, applyExtensionPreset } from '../dist/index.js'

const options = { preset: 'kitchen', posX_m: 1.25, posY_m: 4, width_m: 4, length_m: 2.5 }
const document = () => createEmptyProjectDocument(crypto.randomUUID())

test('Kitchen Proof uses a roof datum and keeps all vertical members on explicit levels', () => {
  const result = createKitchenProofProject()
  assert.equal(result.status, 'success', result.errors?.join('; '))
  const project = result.updatedProject
  const levelById = new Map(project.levels.map(level => [level.id, level]))
  const objects = Object.values(project.objects)
  const columns = objects.filter(object => object.object_type === 'structure.column')
  const beams = objects.filter(object => object.object_type === 'structure.beam')
  const walls = objects.filter(object => object.object_type === 'architecture.wall' && object.created_phase === 'new_construction')
  const slab = objects.find(object => object.object_type === 'structure.slab')
  const roof = objects.find(object => object.object_type === 'roof.system')

  assert.equal(levelById.get('GF').elevation_mm, 0)
  assert.equal(levelById.get('L2').name, 'Roof Level')
  assert.equal(levelById.get('L2').elevation_mm, 3000)
  assert.ok(columns.every(column => column.module_data.base_level_id === 'GF' && column.module_data.top_level_id === 'L2'))
  assert.ok(beams.every(beam => beam.module_data.level_id === 'L2' && beam.module_data.start_point_mm[2] === 3000 && beam.module_data.end_point_mm[2] === 3000))
  assert.ok(walls.every(wall => wall.module_data.level_id === 'GF' && wall.module_data.start_point_mm[2] === 0 && wall.module_data.height_mm === 2800))
  assert.equal(slab.module_data.level_id, 'GF')
  assert.equal(slab.module_data.elevation_mm, 0)
  assert.equal(roof.module_data.level_id, 'L2')
  assert.equal(roof.module_data.elevation_mm, 3000)
})

test('AC-STAND-006: kitchen contains its requested hosted doors/windows and column footings', () => {
  const original = document()
  original.project.active_phase = 'existing'
  const result = applyExtensionPreset(original, options, 'ai')
  assert.equal(result.status, 'success', result.errors?.join('; '))
  const objects = Object.values(result.updatedProject.objects)
  assert.equal(objects.length, 19)
  assert.ok(objects.every(o => o.created_phase === 'new_construction'))
  assert.ok(objects.every(o => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(o.id)))
  for (const footing of objects.filter(o => o.object_type === 'structure.foundation')) {
    const column = result.updatedProject.objects[footing.module_data.supported_column_id]
    assert.equal(column.object_type, 'structure.column')
    assert.deepEqual(footing.host_refs, [column.id])
  }
  const door = objects.find(o => o.object_type === 'door_window.door')
  const window = objects.find(o => o.object_type === 'door_window.window')
  assert.deepEqual(door.module_data.location_mm, [3250, 4000, 0])
  assert.deepEqual(window.module_data.location_mm, [3250, 6500, 0])
  assert.equal(window.module_data.mark, 'W1', 'the elevation tag must use the window mark, not the host wall assembly name')
  assert.equal(door.module_data.width_mm, 900)
  assert.equal(window.module_data.width_mm, 1200)
  assert.ok(objects.filter(o => o.object_type === 'architecture.wall').every(o => o.module_data.material === 'lightweight_block'))
  const slab = objects.find(o => o.object_type === 'structure.slab')
  const roof = objects.find(o => o.object_type === 'roof.system')
  assert.equal(slab.module_data.slab_system, 'slab_on_ground')
  assert.equal(slab.module_data.elevation_mm, 0)
  assert.equal(roof.module_data.material, 'insulated_metal_sheet_pu_25')
  assert.equal(roof.module_data.elevation_mm, 3000)
  assert.equal(Object.keys(original.objects).length, 0)
  assert.equal(serializeProject(deserializeProject(serializeProject(result.updatedProject))), serializeProject(result.updatedProject))
})

test('AC-STAND-006: four-sided kitchen can exclude both openings', () => {
  const result = applyExtensionPreset(document(), { ...options, kitchenWallSides: 4, kitchenIncludeDoor: false, kitchenIncludeWindow: false })
  assert.equal(result.status, 'success')
  const objects = Object.values(result.updatedProject.objects)
  assert.equal(objects.filter(o => o.object_type === 'architecture.wall').length, 4)
  assert.equal(objects.filter(o => o.object_type === 'architecture.room').length, 1, 'a fully enclosed four-sided kitchen should create its room automatically')
  assert.equal(objects.length, 19)
  assert.ok(objects.some(o => o.object_type === 'structure.slab'))
  assert.ok(objects.some(o => o.object_type === 'roof.system'))
})

test('AC-STAND-006: kitchen floor and roof follow non-zero active and upper-level datums', () => {
  const project = document()
  const active = project.levels.find(level => level.id === project.project.active_level_id)
  active.elevation_mm = 1200
  project.levels.push({ id: 'L2', name: 'Upper Floor', elevation_mm: 4200, storey_index: 2, height_mm: 3000 })
  const result = applyExtensionPreset(project, options)
  assert.equal(result.status, 'success', result.errors?.join('; '))
  const objects = Object.values(result.updatedProject.objects)
  assert.equal(objects.find(object => object.object_type === 'structure.slab').module_data.elevation_mm, 1200)
  assert.equal(objects.find(object => object.object_type === 'roof.system').module_data.elevation_mm, 4200)
})

test('AC-STAND-006: carport assigns steel and generates individually editable slab and roof objects', () => {
  const result = applyExtensionPreset(document(), { ...options, preset: 'carport', width_m: 5, length_m: 5.5 })
  assert.equal(result.status, 'success')
  const objects = Object.values(result.updatedProject.objects)
  assert.equal(objects.length, 15)
  assert.ok(objects.filter(o => ['structure.column', 'structure.beam'].includes(o.object_type)).every(o => o.module_data.material === 'steel'))
  const slab = objects.find(object => object.object_type === 'structure.slab')
  const roof = objects.find(object => object.object_type === 'roof.system')
  assert.equal(slab.module_data.slab_system, 'slab_on_ground')
  assert.equal(slab.module_data.thickness_mm, 120)
  assert.equal(slab.module_data.slope_ratio, 0.01)
  assert.equal(roof.module_data.material, 'insulated_metal_sheet_pu_25')
  assert.equal(roof.module_data.thickness_mm, 25.4)
  assert.equal(roof.module_data.elevation_mm, 3400)
})

test('AC-STAND-006: carport slab, beams, columns and roof follow a non-zero active-level datum', () => {
  const project = document()
  const baseLevel = project.levels.find(level => level.id === project.project.active_level_id)
  baseLevel.elevation_mm = 1200

  const result = applyExtensionPreset(project, { ...options, preset: 'carport', width_m: 5, length_m: 5.5 })
  assert.equal(result.status, 'success', result.errors?.join('; '))
  const objects = Object.values(result.updatedProject.objects)
  assert.ok(objects.filter(object => object.object_type === 'structure.column').every(column => column.module_data.location_mm[2] === 1200 && column.module_data.top_elevation_mm === 4200))
  assert.ok(objects.filter(object => object.object_type === 'structure.beam').every(beam => beam.module_data.level_id === baseLevel.id && beam.module_data.base_offset_mm === 3000))
  assert.equal(objects.find(object => object.object_type === 'structure.slab').module_data.elevation_mm, 1200)
  assert.equal(objects.find(object => object.object_type === 'roof.system').module_data.elevation_mm, 4600)
})

test('AC-STAND-006: terrace framing elevation follows the meter input', () => {
  const result = applyExtensionPreset(document(), { ...options, preset: 'terrace', terraceElevation_m: 0.65 })
  assert.equal(result.status, 'success')
  const objects = Object.values(result.updatedProject.objects)
  assert.equal(objects.length, 17)
  for (const beam of objects.filter(o => o.object_type === 'structure.beam')) {
    assert.equal(beam.module_data.start_point_mm[2], 650)
    assert.equal(beam.module_data.end_point_mm[2], 650)
    assert.equal(beam.module_data.material, 'steel')
  }
})

test('AC-STAND-006: invalid dimensions and opening clearance produce no partial geometry', () => {
  for (const changes of [{ width_m: 0 }, { length_m: -1 }, { posX_m: NaN }, { width_m: Infinity }, { width_m: 0.8 }, { kitchenWallHeight_m: 1.9 }, { preset: 'invalid' }]) {
    const original = document()
    const result = applyExtensionPreset(original, { ...options, ...changes })
    assert.equal(result.status, 'rejected')
    assert.strictEqual(result.updatedProject, original)
    assert.deepEqual(result.emittedEnvelopes, [])
  }
})

test('AC-STAND-003/006: entire preset is one undo step and redo preserves host links', () => {
  const original = document()
  const commands = planExtensionPreset(original, options)
  assert.equal(Object.keys(original.objects).length, 0)
  const session = new ProjectCommandSession(original)
  assert.equal(session.execute(commands).status, 'success')
  const built = session.project
  assert.equal(Object.keys(session.undo().objects).length, 0)
  assert.deepEqual(session.redo(), built)
})

test('AC-STAND-006: every extension preset remains editable through ordinary UUID-preserving commands', () => {
  for (const preset of ['carport', 'kitchen', 'terrace']) {
    const created = applyExtensionPreset(document(), { ...options, preset })
    assert.equal(created.status, 'success', created.errors?.join('; '))
    const session = new ProjectCommandSession(created.updatedProject)
    const before = session.project
    const column = Object.values(before.objects).find(object => object.object_type === 'structure.column')
    const oldLocation = column.module_data.location_mm
    const movedLocation = [oldLocation[0] + 125, oldLocation[1], oldLocation[2]]
    const result = session.execute([{ name: 'MoveColumn', input: { object_id: column.id, location_mm: movedLocation } }])
    assert.equal(result.status, 'success', `${preset}: ${result.errors?.join('; ')}`)
    assert.deepEqual(session.project.objects[column.id].module_data.location_mm, movedLocation)
    assert.equal(session.project.objects[column.id].created_phase, 'new_construction')
    const footing = Object.values(session.project.objects).find(object => object.object_type === 'structure.foundation' && object.module_data.supported_column_id === column.id)
    assert.ok(footing, `${preset} retains the hosted footing relationship`)
    assert.deepEqual(footing.module_data.center_mm.slice(0, 2), movedLocation.slice(0, 2))
    assert.deepEqual(session.undo(), before)
    assert.deepEqual(session.redo(), result.updatedProject)
  }
})
