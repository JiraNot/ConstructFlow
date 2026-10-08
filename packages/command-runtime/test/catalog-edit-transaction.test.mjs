import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { deserializeProject, serializeProject } from '@constructflow/project-model'
import { ProjectCommandSession } from '../dist/index.js'

const fixture = async () => deserializeProject(await readFile(new URL('../../../examples/kitchen-extension-proof.cfproj', import.meta.url), 'utf8'))

test('catalog editor saves rename and dimensions as one undoable transaction', async () => {
  const project = await fixture(), session = new ProjectCommandSession(project)
  const type = project.types.find(t => t.object_type === 'door_window.window' && t.name === 'W1')
  const ids = Object.values(project.objects).filter(o => o.module_data.type_id === type.id).map(o => o.id)
  const result = session.execute([
    { name: 'RenameCatalogType', input: { type_id: type.id, name: 'W-EDIT' } },
    { name: 'UpdateStructuralTypeDimensions', input: { type_id_or_name: type.id, parameters: { ...type.parameters, width_mm: 1100 } } },
  ])
  assert.equal(result.status, 'success', result.errors?.join('\n'))
  assert.equal(result.updatedProject.types.find(t => t.id === type.id).name, 'W-EDIT')
  for (const id of ids) {
    assert.equal(result.updatedProject.objects[id].module_data.width_mm, 1100)
    assert.equal(result.updatedProject.objects[id].created_phase, project.objects[id].created_phase)
  }
  const saved = serializeProject(session.project)
  assert.deepEqual(session.undo(), project)
  assert.equal(session.canUndo, false)
  assert.equal(serializeProject(session.redo()), saved)
})

test('invalid dimensions roll back a preceding rename and do not add undo history', async () => {
  const project = await fixture(), session = new ProjectCommandSession(project)
  const type = project.types.find(t => t.object_type === 'door_window.window' && t.name === 'W1')
  const result = session.execute([
    { name: 'RenameCatalogType', input: { type_id: type.id, name: 'W-INVALID' } },
    { name: 'UpdateStructuralTypeDimensions', input: { type_id_or_name: type.id, parameters: { width_mm: -100 } } },
  ])
  assert.notEqual(result.status, 'success')
  assert.equal(serializeProject(session.project), serializeProject(project))
  assert.equal(session.canUndo, false)
})

test('duplicate and assign changes one instance while preserving its identity and the source type', async () => {
  const project = await fixture(), session = new ProjectCommandSession(project)
  const source = project.types.find(t => t.object_type === 'door_window.window' && t.name === 'W1')
  const object = Object.values(project.objects).find(o => o.module_data.type_id === source.id)
  const id = crypto.randomUUID()
  const result = session.execute([
    { name: 'DefineStructuralType', input: { id, object_type: source.object_type, name: 'W-COPY', parameters: { ...source.parameters, width_mm: 1100 } } },
    { name: 'AssignInstanceType', input: { object_id: object.id, type_id: id } },
  ])
  assert.equal(result.status, 'success', result.errors?.join('\n'))
  assert.deepEqual(result.updatedProject.types.find(t => t.id === source.id), source)
  assert.deepEqual(Object.keys(result.updatedProject.objects).sort(), Object.keys(project.objects).sort())
  assert.equal(result.updatedProject.objects[object.id].module_data.type_id, id)
  assert.equal(result.updatedProject.objects[object.id].created_phase, object.created_phase)
  assert.deepEqual(session.undo(), project)
})
