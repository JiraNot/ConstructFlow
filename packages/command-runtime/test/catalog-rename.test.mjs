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
