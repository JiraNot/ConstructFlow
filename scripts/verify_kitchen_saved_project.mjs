import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { readProjectFile } from '../apps/plan-editor/src/projectFileIO.js'
import { compileInitialDrawingSet } from '../packages/sheet-engine/dist/index.js'
import { calculateTakeoff } from '../packages/takeoff-engine/dist/index.js'

const sourcePath = process.argv[2]
if (!sourcePath) {
  throw new Error('Usage: node scripts/verify_kitchen_saved_project.mjs <path-to-cfproj>')
}

const absolutePath = resolve(sourcePath)
const rawProject = await readFile(absolutePath, 'utf8')
const opened = await readProjectFile({
  name: basename(absolutePath),
  text: async () => rawProject,
})
assert.equal(rawProject, `${opened.serialized}\n`, 'saved project must already be canonical JSON with the generator newline')
assert.equal(opened.project.project.id, 'CF-KITCHEN-PROOF-001', 'unexpected project identity')

const objects = Object.values(opened.project.objects)
const counts = objects.reduce((result, object) => {
  result[object.object_type] = (result[object.object_type] ?? 0) + 1
  return result
}, {})
assert.deepEqual(counts, {
  'architecture.wall': 4,
  'architecture.room': 1,
  'door_window.door': 1,
  'door_window.window': 1,
  'structure.beam': 4,
  'structure.column': 4,
  'structure.foundation': 4,
  'structure.slab': 1,
  'roof.system': 1,
}, 'saved Kitchen Proof must retain the expected BIM object graph')
assert.equal(new Set(objects.map(object => object.id)).size, objects.length, 'object UUIDs must be unique')
const levelById = new Map(opened.project.levels.map(level => [level.id, level]))
assert.equal(levelById.get('GF')?.elevation_mm, 0)
assert.equal(levelById.get('L2')?.name, 'Roof Level')
assert.equal(levelById.get('L2')?.elevation_mm, 3000)
assert.ok(objects.filter(object => object.object_type === 'structure.column').every(object =>
  object.module_data.base_level_id === 'GF' && object.module_data.top_level_id === 'L2'))
assert.ok(objects.filter(object => object.object_type === 'structure.beam').every(object =>
  object.module_data.level_id === 'L2' && object.module_data.start_point_mm[2] === 3000 && object.module_data.end_point_mm[2] === 3000))
assert.ok(objects.filter(object => object.object_type === 'architecture.wall' && object.created_phase === 'new_construction').every(object =>
  object.module_data.level_id === 'GF' && object.module_data.start_point_mm[2] === 0 && object.module_data.height_mm === 2800))
const floor = objects.find(object => object.object_type === 'structure.slab')
const roof = objects.find(object => object.object_type === 'roof.system')
assert.equal(floor.module_data.level_id, 'GF')
assert.equal(floor.module_data.elevation_mm, 0)
assert.equal(roof.module_data.level_id, 'L2')
assert.equal(roof.module_data.elevation_mm, 3000)

const takeoff = calculateTakeoff(opened.project)
assert.ok(!takeoff.lines.some(line => line.cost_center === 'existing_to_remain'), 'existing-to-remain model context is not a BOQ cost center')
assert.ok(takeoff.lines.some(line => line.cost_center === 'new_construction' && Math.abs(line.quantity - 19.16) < 1e-9 && line.unit === 'm2'))
assert.ok(takeoff.lines.some(line => line.quantity === 16 && line.unit === 'item' && line.formula.includes('micro_pile_i18')))
const jointLine = takeoff.lines.find(line => line.object_type === 'architecture.joint_treatment')
assert.equal(jointLine?.cost_center, 'remodeling_joint_treatment')
assert.equal(jointLine?.phase, 'new_construction')
assert.equal(jointLine?.unit, 'm')
assert.equal(jointLine?.quantity, 5.6, 'saved project must retain the 5.60 m expansion-joint takeoff')

const drawingSet = compileInitialDrawingSet(opened.project)
assert.deepEqual(drawingSet.sheets.map(sheet => sheet.id), ['A-02', 'S-01', 'A-08'])
assert.ok(drawingSet.sheets.find(sheet => sheet.id === 'A-02').svg.includes('Envelope extents 4.00 m × 2.50 m'))
assert.ok(drawingSet.sheets.find(sheet => sheet.id === 'S-01').svg.includes('Foundations: 4'))
const elevations = drawingSet.sheets.find(sheet => sheet.id === 'A-08').svg
assert.ok(elevations.includes('ALL LEVELS'))

process.stdout.write(`Saved Kitchen Proof accepted: ${absolutePath}\n`)
process.stdout.write(`Objects: ${objects.length}; takeoff lines: ${takeoff.lines.length}; joint: ${jointLine.quantity.toFixed(2)} m; sheets: ${drawingSet.sheets.map(sheet => sheet.id).join(', ')}\n`)
