import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { deserializeProject } from '../../project-model/dist/index.js'
import { compileInitialDrawingSet } from '../dist/index.js'

const fixtureUrl = new URL('../../../examples/kitchen-extension-proof.cfproj', import.meta.url)
const project = deserializeProject(await readFile(fixtureUrl, 'utf8'))

test('S4: kitchen compiler creates deterministic A3 landscape sheets at the required scales', () => {
  const first = compileInitialDrawingSet(project)
  const second = compileInitialDrawingSet(project)

  assert.equal(first.project_id, project.project.id)
  assert.deepEqual(first.sheets.map(sheet => [sheet.id, sheet.scale]), [
    ['A-02', '1:100'], ['S-01', '1:100'], ['A-08', '1:50'],
  ])
  assert.deepEqual(second.sheets.map(sheet => sheet.svg), first.sheets.map(sheet => sheet.svg))
  for (const sheet of first.sheets) {
    assert.ok(sheet.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'))
    assert.ok(sheet.svg.includes('width="420mm" height="297mm" viewBox="0 0 420 297"'))
    assert.ok(sheet.svg.includes(`${sheet.id} · CF · v2`) || sheet.svg.includes(`>${sheet.id}</text>`))
  }
})

test('S4: A-02 and S-01 show the same kitchen envelope, hosted openings and foundations', () => {
  const { sheets, warnings } = compileInitialDrawingSet(project)
  const a02 = sheets.find(sheet => sheet.id === 'A-02')
  const s01 = sheets.find(sheet => sheet.id === 'S-01')

  assert.ok(a02.svg.includes('Envelope extents 4.00 m × 2.50 m'))
  assert.ok(a02.svg.includes('D1') && a02.svg.includes('W1'))
  assert.ok(s01.svg.includes('Foundations: 4') && s01.svg.includes('Columns: 4'))
  assert.equal((s01.svg.match(/micro_pile_i18 × 4/g) ?? []).length, 8)
  assert.equal((s01.svg.match(/LENGTH TBD/g) ?? []).length, 4)
  assert.equal(warnings.length, 1)
  assert.ok(warnings[0].includes('pile length is not assigned'))
})

test('S4: A-08 covers all levels and schedules catalog dimensions in meters', () => {
  const a08 = compileInitialDrawingSet(project).sheets.find(sheet => sheet.id === 'A-08')

  assert.ok(a08.svg.includes('ALL LEVELS'))
  assert.ok(a08.svg.includes('0.90'))
  assert.ok(a08.svg.includes('1.20'))
})
