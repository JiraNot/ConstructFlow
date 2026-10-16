import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyProjectDocument } from '@constructflow/project-model'
import { compilePermitDrawingSet } from '../dist/index.js'

test('saved plan dimensions enter vector plan sheets with calculated values and level scope', () => {
  const project = createEmptyProjectDocument(crypto.randomUUID())
  const dimension = { id: crypto.randomUUID(), level_id: project.project.active_level_id, created_phase: 'new_construction', start_mm: [0, 0], end_mm: [3000, 4000], offset_mm: 500 }
  project.drawing_settings = { viewports: {}, plan_dimensions: [dimension] }
  const sheets = compilePermitDrawingSet(project).sheets
  const ground = sheets.find(sheet => sheet.id === 'A-02')
  const text = ground.primitives.find(primitive => primitive.kind === 'text' && primitive.dimension_id === `manual:${dimension.id}`)
  assert.ok(text)
  assert.equal(text.text, '5.000 m')
  assert.ok(!sheets.find(sheet => sheet.id === 'A-03').primitives.some(primitive => primitive.dimension_id === `manual:${dimension.id}`))
})
