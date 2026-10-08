import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { deserializeProject, serializeProject } from '@constructflow/project-model'
import { buildProjectRepresentations3D } from '../../representation-engine/dist/index.js'
import { ProjectCommandSession } from '../dist/index.js'
const fixture = async () => deserializeProject(await readFile(new URL('../../../examples/kitchen-extension-proof.cfproj', import.meta.url), 'utf8'))

test('independent opening grids cascade, survive save/reopen and undo together', async () => {
  const project = await fixture(), session = new ProjectCommandSession(project)
  const type = project.types.find(t => t.object_type === 'door_window.window' && t.name === 'W1')
  const window = Object.values(project.objects).find(o => o.object_type === 'door_window.window')
  const parameters = { panel_count: 2, panel_layout: ['sliding', 'sliding'], panel_width_ratios: [0.4, 0.6], transom_height_mm: 200, bottom_light_height_mm: 200, muntin_rows: 2, muntin_columns: 2, transom_muntin_rows: 1, transom_muntin_columns: 4, bottom_light_muntin_rows: 3, bottom_light_muntin_columns: 1 }
  const result = session.execute([{ name: 'UpdateStructuralTypeDimensions', input: { type_id_or_name: type.id, parameters } }])
  assert.equal(result.status, 'success', result.errors?.join('\n'))
  const reopened = deserializeProject(serializeProject(session.project))
  const shape = buildProjectRepresentations3D(reopened).objects.find(o => o.object_id === window.id).shape
  for (const key of ['muntin_rows', 'muntin_columns', 'transom_muntin_rows', 'transom_muntin_columns', 'bottom_light_muntin_rows', 'bottom_light_muntin_columns']) {
    assert.equal(reopened.objects[window.id].module_data[key], parameters[key])
    assert.equal(shape[key], parameters[key])
  }
  assert.equal(reopened.objects[window.id].created_phase, window.created_phase)
  assert.deepEqual(session.undo(), project)
  assert.equal(session.canUndo, false)
})

test('invalid fixed-light grid rolls back without modifying the shared type', async () => {
  const project = await fixture(), session = new ProjectCommandSession(project)
  const type = project.types.find(t => t.object_type === 'door_window.window')
  for (const value of [0, 9, 1.5]) {
    const result = session.execute([{ name: 'UpdateStructuralTypeDimensions', input: { type_id_or_name: type.id, parameters: { transom_muntin_columns: value } } }])
    assert.notEqual(result.status, 'success')
    assert.match(result.errors.join('\n'), /invalid transom_muntin_columns/)
    assert.deepEqual(session.project, project)
    assert.equal(session.canUndo, false)
  }
})
