import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { OPENING_DESIGNS, deserializeProject, serializeProject } from '@constructflow/project-model'
import { ProjectCommandSession } from '../dist/index.js'

test('all opening designs create through commands, roundtrip and undo without touching existing objects', async () => {
  const project = deserializeProject(await readFile(new URL('../../../examples/kitchen-extension-proof.cfproj', import.meta.url), 'utf8'))
  const session = new ProjectCommandSession(project)
  assert.equal(new Set(OPENING_DESIGNS.map(d => d.key)).size, 24)
  for (const design of OPENING_DESIGNS) {
    const id = crypto.randomUUID()
    const result = session.execute([{ name: 'DefineStructuralType', input: {
      id, name: design.key, object_type: design.object_type, parameters: structuredClone(design.parameters),
    } }])
    assert.equal(result.status, 'success', `${design.key}: ${result.errors?.join('\n')}`)
    const reopened = deserializeProject(serializeProject(result.updatedProject))
    assert.deepEqual(reopened.types.find(t => t.id === id).parameters, design.parameters)
    assert.deepEqual(reopened.objects, project.objects)
    assert.deepEqual(session.undo(), project)
  }
})
