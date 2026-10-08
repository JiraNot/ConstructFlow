import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyProjectDocument, deserializeProject, formatLengthMm, parseLengthMm, serializeProject } from '../dist/index.js'

test('display units format and parse lengths without changing canonical millimeters', () => {
  assert.equal(formatLengthMm(1760, 'm'), '1.760')
  assert.equal(formatLengthMm(1760, 'cm'), '176.0')
  assert.equal(formatLengthMm(1760, 'mm'), '1760')
  assert.equal(parseLengthMm('1.76', 'm'), 1760)
  assert.equal(parseLengthMm('176', 'cm'), 1760)
  assert.equal(parseLengthMm('1.76 m', 'mm'), 1760)
  assert.equal(parseLengthMm('176 cm', 'm'), 1760)
  assert.equal(parseLengthMm('not a length', 'm'), null)
})

test('project display unit persists while legacy projects default to meters in presentation', () => {
  const project = createEmptyProjectDocument('units-test')
  assert.equal(project.project.units, 'mm')
  assert.equal(project.project.display_unit, 'm')
  project.project.display_unit = 'cm'
  assert.equal(deserializeProject(serializeProject(project)).project.display_unit, 'cm')
  const legacy = structuredClone(project)
  delete legacy.project.display_unit
  assert.equal(deserializeProject(JSON.stringify(legacy)).project.display_unit ?? 'm', 'm')
})
