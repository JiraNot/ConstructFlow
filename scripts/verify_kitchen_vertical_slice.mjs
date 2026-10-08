import assert from 'node:assert/strict'
import { createKitchenProofProject } from '../packages/extension-engine/dist/index.js'
import { ProjectCommandSession } from '../packages/command-runtime/dist/index.js'
import { deserializeProject, serializeProject } from '../packages/project-model/dist/index.js'
import { calculateTakeoff } from '../packages/takeoff-engine/dist/index.js'
import { compileInitialDrawingSet } from '../packages/sheet-engine/dist/index.js'

const created = createKitchenProofProject('human')
assert.equal(created.status, 'success', created.errors?.join('; '))
const project = created.updatedProject
const objectCounts = Object.values(project.objects).reduce((counts, object) => {
  counts[object.object_type] = (counts[object.object_type] ?? 0) + 1
  return counts
}, {})
assert.deepEqual(objectCounts, {
  'architecture.wall': 4,
  'door_window.door': 1,
  'door_window.window': 1,
  'structure.beam': 4,
  'structure.column': 4,
  'structure.foundation': 4,
})

const existingWall = Object.values(project.objects).find(object =>
  object.object_type === 'architecture.wall' && object.created_phase === 'existing')
assert.ok(existingWall, 'Kitchen Proof must include its Existing host wall')
const baseline = calculateTakeoff(project)
const existingWallBaseline = baseline.lines.filter(line => line.source_object_ids.includes(existingWall.id) && line.object_type === 'architecture.wall')
assert.ok(existingWallBaseline.length > 0)
assert.ok(existingWallBaseline.every(line => line.phase === 'existing' && line.cost_center === 'existing_to_remain'))
assert.ok(baseline.lines.some(line => line.phase === 'new_construction' && line.cost_center === 'new_construction'))
const jointLine = baseline.lines.find(line => line.object_type === 'architecture.joint_treatment')
assert.equal(jointLine?.mark, 'expansion_joint_sealant')
assert.equal(jointLine?.unit, 'm')
assert.equal(jointLine?.quantity, 5.6, 'two 2.80 m wall termini must produce a 5.60 m sealant takeoff')
assert.equal(baseline.totals_by_cost_center.remodeling_joint_treatment.m, 5.6)
assert.equal(baseline.totals_by_cost_center.demolition_site_prep.m2, 0)

const interfaceWalls = Object.values(project.objects).filter(object => object.object_type === 'architecture.wall' && object.created_phase === 'new_construction')
const resizeSession = new ProjectCommandSession(project)
const resized = resizeSession.execute([{ name: 'UpdateWallDimensions', input: { object_id: interfaceWalls[0].id, thickness_mm: 100, height_mm: 3000 } }])
assert.equal(resized.status, 'success', resized.errors?.join('; '))
assert.equal(calculateTakeoff(resizeSession.project).totals_by_cost_center.remodeling_joint_treatment.m, 5.8)
resizeSession.undo()
assert.deepEqual(calculateTakeoff(resizeSession.project), baseline)
const deleteSession = new ProjectCommandSession(project)
const deletedInterfaceWall = deleteSession.execute([{ name: 'DeleteObject', input: { object_id: interfaceWalls[0].id } }])
assert.equal(deletedInterfaceWall.status, 'success', deletedInterfaceWall.errors?.join('; '))
assert.equal(calculateTakeoff(deleteSession.project).totals_by_cost_center.remodeling_joint_treatment.m, 2.8)

const session = new ProjectCommandSession(project)
const demolition = session.execute([{ name: 'UpdateObjectPhase', input: {
  object_id: existingWall.id,
  removed_phase: 'demolition',
} }])
assert.equal(demolition.status, 'success', demolition.errors?.join('; '))

const reopened = deserializeProject(serializeProject(demolition.updatedProject))
const takeoff = calculateTakeoff(reopened)
const demolishedWall = takeoff.lines.filter(line => line.source_object_ids.includes(existingWall.id))
assert.equal(demolishedWall.find(line => line.unit === 'm2')?.quantity, 7)
assert.equal(demolishedWall.find(line => line.unit === 'm3')?.quantity, 1.05)
assert.ok(demolishedWall.every(line => line.phase === 'demolition' && line.cost_center === 'demolition_site_prep'))
assert.equal(takeoff.totals_by_cost_center.remodeling_joint_treatment.m, 0, 'demolishing the existing host removes its joint treatment takeoff')
const demolishedWallArea = demolishedWall.filter(line => line.unit === 'm2').reduce((sum, line) => sum + line.quantity, 0)
assert.equal(takeoff.totals_by_cost_center.existing_to_remain.m2, baseline.totals_by_cost_center.existing_to_remain.m2 - demolishedWallArea)
assert.equal(takeoff.totals_by_cost_center.demolition_site_prep.m2, demolishedWallArea)
assert.deepEqual(session.undo(), project, 'one Undo must restore the original Existing quantities')
assert.deepEqual(calculateTakeoff(session.project), baseline)
assert.deepEqual(session.redo(), demolition.updatedProject, 'Redo must restore the demolished takeoff state')
assert.equal(takeoff.lines.filter(line => line.material === 'micro_pile_i18' && line.unit === 'item')
  .reduce((total, line) => total + line.quantity, 0), 16)

const drawings = compileInitialDrawingSet(reopened)
assert.deepEqual(drawings.sheets.map(sheet => sheet.id), ['A-02', 'S-01', 'A-08'])
const [a02, s01, a08] = drawings.sheets
assert.ok(a02.svg.includes('Envelope extents 4.00 m × 2.50 m'))
assert.ok(a02.svg.includes('#ef4444'), 'A-02 must render the demolished host in demolition red')
assert.ok(s01.svg.includes('micro_pile_i18 × 4') && s01.svg.includes('LENGTH TBD'))
assert.ok(a08.svg.includes('ALL LEVELS') && a08.svg.includes('D1') && a08.svg.includes('W1'))
assert.equal(drawings.warnings.length, 1, 'Only the deliberately unspecified pile length should be warned')

process.stdout.write('Kitchen vertical-slice acceptance passed: model, phase, takeoff, serialization, A-02, S-01, A-08.\n')
