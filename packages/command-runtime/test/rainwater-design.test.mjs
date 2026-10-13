import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyProjectDocument, DEFAULT_RAINWATER_DESIGN } from '@constructflow/project-model'
import { CommandBus } from '../dist/index.js'

test('UpdateRainwaterDesign persists validated project inputs as one undoable command result', () => {
  const project = createEmptyProjectDocument('RAIN-DESIGN', 'Rain design')
  const settings = {
    ...DEFAULT_RAINWATER_DESIGN,
    design_rainfall_mm_per_hr: 185,
    design_return_period_years: 10,
    location: 'เขตบางนา กรุงเทพมหานคร',
    source: 'Project district IDF sheet 2025',
    runoff_coefficient: 0.95,
    outlet_capacity_lps: 2,
    downpipe_diameter_mm: 100,
  }
  const result = CommandBus.execute(project, 'UpdateRainwaterDesign', { settings })
  assert.equal(result.result.status, 'success')
  assert.deepEqual(result.updatedProject.rainwater_design, settings)
  assert.deepEqual(project.rainwater_design, DEFAULT_RAINWATER_DESIGN, 'the caller project is not mutated')

  const rejected = CommandBus.execute(result.updatedProject, 'UpdateRainwaterDesign', {
    settings: { ...settings, design_rainfall_mm_per_hr: 0 },
  })
  assert.notEqual(rejected.result.status, 'success')
  assert.match(rejected.result.errors?.[0] ?? '', /design_rainfall_mm_per_hr/)
  assert.deepEqual(rejected.updatedProject, result.updatedProject)
})
