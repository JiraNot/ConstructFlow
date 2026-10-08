import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { deserializeProject, serializeProject } from '@constructflow/project-model'
import { ProjectCommandSession } from '../dist/index.js'

const fixtureUrl = new URL('../../../examples/kitchen-extension-proof.cfproj', import.meta.url)

test('S0: renaming a catalog type cascades by stable type UUID and survives undo, redo and reload', async () => {
  const project = deserializeProject(await readFile(fixtureUrl, 'utf8'))
  const windowType = project.types.find(type => type.object_type === 'door_window.window' && type.name === 'W1')
  assert.ok(windowType)
  const originalWindowIds = Object.values(project.objects)
    .filter(object => object.object_type === 'door_window.window' && object.module_data.type_id === windowType.id)
    .map(object => object.id)
  const originalWallIds = Object.values(project.objects)
    .filter(object => object.object_type === 'architecture.wall' && object.module_data.mark === 'W1')
    .map(object => object.id)
  assert.equal(originalWindowIds.length, 1)
  assert.equal(originalWallIds.length, 4)

  const session = new ProjectCommandSession(project)
  const result = session.execute([{ name: 'RenameCatalogType', input: { type_id: windowType.id, name: 'W-KITCHEN' } }])
  assert.equal(result.status, 'success')
  assert.deepEqual(result.emittedEnvelopes[0].input, { type_id: windowType.id, name: 'W-KITCHEN' })
  assert.deepEqual(result.results[0].affected_object_ids, originalWindowIds)
  assert.equal(session.project.types.find(type => type.id === windowType.id).name, 'W-KITCHEN')
  assert.deepEqual(
    Object.values(session.project.objects)
      .filter(object => object.object_type === 'door_window.window' && object.module_data.type_id === windowType.id)
      .map(object => [object.id, object.module_data.mark]),
    originalWindowIds.map(id => [id, 'W-KITCHEN']),
  )
  assert.deepEqual(
    Object.values(session.project.objects)
      .filter(object => originalWallIds.includes(object.id))
      .map(object => object.module_data.mark),
    originalWallIds.map(() => 'W1'),
    'the same W1 mark in the wall family must not be renamed',
  )

  const serialized = serializeProject(session.project)
  const reloaded = deserializeProject(serialized)
  assert.equal(serializeProject(reloaded), serialized)
  assert.deepEqual(Object.keys(reloaded.objects).sort(), Object.keys(project.objects).sort())
  assert.deepEqual(session.undo(), project)
  assert.deepEqual(session.redo(), reloaded)
})

test('S0: invalid or duplicate catalog names reject without changing the project', async () => {
  const project = deserializeProject(await readFile(fixtureUrl, 'utf8'))
  const windowType = project.types.find(type => type.object_type === 'door_window.window' && type.name === 'W1')
  assert.ok(windowType)
  const session = new ProjectCommandSession(project)
  const snapshot = serializeProject(session.project)

  const empty = session.execute([{ name: 'RenameCatalogType', input: { type_id: windowType.id, name: '   ' } }])
  assert.equal(empty.status, 'rejected')
  assert.equal(serializeProject(session.project), snapshot)
  assert.equal(session.canUndo, false)

  session.execute([{ name: 'DefineStructuralType', input: {
    object_type: 'door_window.window',
    name: 'W2',
    parameters: { width_mm: 900, height_mm: 1200, sill_height_mm: 900 },
  } }])
  const beforeDuplicate = serializeProject(session.project)
  const duplicate = session.execute([{ name: 'RenameCatalogType', input: { type_id: windowType.id, name: 'W2' } }])
  assert.equal(duplicate.status, 'rejected')
  assert.equal(serializeProject(session.project), beforeDuplicate)
})

test('opening type builder parameters save, assign and cascade to hosted instances', async () => {
  const project = deserializeProject(await readFile(fixtureUrl, 'utf8'))
  const session = new ProjectCommandSession(project)
  const window = Object.values(project.objects).find(object => object.object_type === 'door_window.window')
  assert.ok(window)

  const create = session.execute([{ name: 'DefineStructuralType', input: {
    object_type: 'door_window.window',
    name: 'W-COMPOSITE',
    parameters: {
      width_mm: 1800, height_mm: 1800, sill_height_mm: 700,
      opening_operation: 'sliding', panel_count: 2,
      panel_layout: ['sliding', 'fixed'],
      panel_width_ratios: [0.65, 0.35],
      transom_height_mm: 300, bottom_light_height_mm: 300,
      muntin_rows: 2, muntin_columns: 3,
      frame_depth_mm: 80, frame_material: 'aluminium',
      glazing_material: 'clear_glass', glazing_transmission: 0.72,
    },
  } }])
  assert.equal(create.status, 'success')
  const compositeType = session.project.types.find(type => type.name === 'W-COMPOSITE')
  assert.ok(compositeType)

  const assign = session.execute([{ name: 'AssignInstanceType', input: { object_id: window.id, type_id: compositeType.id } }])
  assert.equal(assign.status, 'success')
  assert.equal(session.project.objects[window.id].module_data.bottom_light_height_mm, 300)
  assert.equal(session.project.objects[window.id].module_data.transom_height_mm, 300)
  assert.equal(session.project.objects[window.id].module_data.muntin_columns, 3)
  assert.deepEqual(session.project.objects[window.id].module_data.panel_layout, ['sliding', 'fixed'])
  assert.deepEqual(session.project.objects[window.id].module_data.panel_width_ratios, [0.65, 0.35])

  const update = session.execute([{ name: 'UpdateStructuralTypeDimensions', input: {
    type_id_or_name: compositeType.id,
    object_type: 'door_window.window',
    parameters: { bottom_light_height_mm: 350, muntin_rows: 3, panel_layout: ['fixed', 'sliding'], panel_width_ratios: [0.4, 0.6] },
  } }])
  assert.equal(update.status, 'success')
  assert.equal(session.project.objects[window.id].module_data.bottom_light_height_mm, 350)
  assert.equal(session.project.objects[window.id].module_data.muntin_rows, 3)
  assert.deepEqual(session.project.objects[window.id].module_data.panel_layout, ['fixed', 'sliding'])
  assert.deepEqual(session.project.objects[window.id].module_data.panel_width_ratios, [0.4, 0.6])
})
