import test from 'node:test'
import assert from 'node:assert/strict'
import { hasPlanCanvasSelectionGrip } from '../src/planCanvasSelectionHint.mjs'

test('selection hint is enabled for editable object families', () => {
  const families = [
    'structure.column', 'structure.foundation', 'structure.beam', 'architecture.wall',
    'structure.grid', 'door_window.door', 'door_window.window', 'structure.slab',
    'architecture.floor', 'architecture.ceiling', 'roof.system', 'architecture.room_separator',
    'drainage.pipe_route', 'plumbing.pipe_route', 'decorative.moulding_run', 'interior.cabinet_run',
  ]
  const project = { objects: Object.fromEntries(families.map((object_type, index) => [String(index), { id: String(index), object_type }])) }
  for (const id of Object.keys(project.objects)) assert.equal(hasPlanCanvasSelectionGrip(project, [id]), true)
})

test('selection hint stays hidden when no selected object has a canvas grip', () => {
  const project = { objects: { annotation: { id: 'annotation', object_type: 'documentation.note' } } }
  assert.equal(hasPlanCanvasSelectionGrip(project, []), false)
  assert.equal(hasPlanCanvasSelectionGrip(project, ['missing']), false)
  assert.equal(hasPlanCanvasSelectionGrip(project, ['annotation']), false)
})
