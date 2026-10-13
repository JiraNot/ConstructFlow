import assert from 'node:assert/strict'
import { ProjectCommandSession } from '../packages/command-runtime/dist/index.js'
import { deserializeProject, serializeProject } from '../packages/project-model/dist/index.js'
import { calculateTakeoff, calculatePhasedBOQ } from '../packages/takeoff-engine/dist/index.js'
import { compileInitialDrawingSet } from '../packages/sheet-engine/dist/index.js'
import { runCoordination } from '../packages/clash-engine/dist/index.js'
import { createRenovationIntegrationProject } from './fixtures/renovationIntegrationProject.mjs'

const { project, sourceObjectCount, demolitionObjectId, hostFacadeId } = createRenovationIntegrationProject()
assert.equal(sourceObjectCount, 239, 'the test begins with the 239-object two-storey reference house')
const newObjects = Object.values(project.objects).filter(object => object.created_phase === 'new_construction')
const existingPartition = project.objects[demolitionObjectId]
const hostFacade = project.objects[hostFacadeId]
assert.equal(Object.values(project.objects).filter(object => object.created_phase === 'existing').length, 239)
assert.equal(Object.keys(project.objects).length, 260)
assert.equal(existingPartition.removed_phase, 'demolition')
assert.equal(hostFacade.created_phase, 'existing')
assert.equal(newObjects.length, 21)
assert.ok(newObjects.every(object => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(object.id)))
assert.ok(newObjects.some(object => object.object_type === 'structure.foundation'))
assert.ok(newObjects.some(object => object.object_type === 'structure.beam'))
assert.ok(newObjects.some(object => object.object_type === 'door_window.door'))
assert.ok(newObjects.some(object => object.object_type === 'door_window.window'))

const savedProject = deserializeProject(serializeProject(project))
assert.equal(Object.keys(savedProject.objects).length, 260)
assert.equal(savedProject.objects[existingPartition.id].removed_phase, 'demolition')
assert.equal(savedProject.objects[hostFacade.id].created_phase, 'existing')

const takeoff = calculateTakeoff(savedProject)
assert.ok(takeoff.totals_by_cost_center.demolition_site_prep.m2 > 0)
assert.ok(takeoff.totals_by_cost_center.new_construction.m2 > 0)
assert.ok(takeoff.lines.some(line => line.source_object_ids.includes(existingPartition.id) && line.phase === 'demolition'))
assert.ok(takeoff.lines.some(line => newObjects.some(object => line.source_object_ids.includes(object.id)) && line.phase === 'new_construction'))
const boq = calculatePhasedBOQ(savedProject)
assert.ok(boq.cost_centers.demolition_site_prep.total_direct_cost_thb > 0)
assert.ok(boq.cost_centers.new_construction.total_direct_cost_thb > 0)

const drawings = compileInitialDrawingSet(savedProject)
assert.deepEqual(drawings.sheets.map(sheet => sheet.id), ['A-02', 'S-01', 'A-08'])
assert.ok(drawings.sheets.every(sheet => sheet.svg.length > 0))
const coordinationOptions = { now: '2026-10-13T00:00:00.000Z' }
const coordination = runCoordination(savedProject, coordinationOptions)
assert.deepEqual(runCoordination(savedProject, coordinationOptions), coordination, 'combined-project coordination output must be deterministic')

const edit = new ProjectCommandSession(savedProject)
const extensionWall = newObjects.find(object => object.object_type === 'architecture.wall')
const adjusted = edit.execute([{ name: 'UpdateWallDimensions', input: { object_id: extensionWall.id, thickness_mm: 100, height_mm: 2850 } }])
assert.equal(adjusted.status, 'success', adjusted.errors?.join('; '))
assert.equal(edit.project.objects[extensionWall.id].module_data.height_mm, 2850)
assert.equal(Object.keys(edit.undo().objects).length, 260)
assert.deepEqual(edit.redo(), adjusted.updatedProject)

process.stdout.write(`Integrated renovation acceptance passed: ${Object.keys(savedProject.objects).length} objects (${sourceObjectCount} existing base + ${newObjects.length} new), explicit demolition, model roundtrip, takeoff/BOQ, coordination, A-02/S-01/A-08, edit/undo/redo.\n`)
