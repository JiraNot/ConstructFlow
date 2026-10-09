import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { deserializeProject } from '../../project-model/dist/index.js'
import { compileInitialDrawingSet, compilePermitDrawingSet } from '../dist/index.js'

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

test('A-02 distinguishes new masonry hatch from existing white wall poche', () => {
  const phased = structuredClone(project)
  const walls = Object.values(phased.objects).filter(object => object.object_type === 'architecture.wall')
  walls[0].created_phase = 'existing'
  walls[1].created_phase = 'new_construction'
  const a02 = compileInitialDrawingSet(phased).sheets.find(sheet => sheet.id === 'A-02')
  assert.match(a02.svg, /fill="none" stroke="#9aa6b4" stroke-width="0\.18"/,
    'new masonry hatch should compile as editable model-space line segments')
  assert.ok(!a02.svg.includes('url(#masonry-hatch)'), 'legacy A-02 should not use a separate SVG pattern hatch')
  assert.ok(a02.svg.includes('fill="#ffffff"'))
})

test('A-02 draws adjustable tile finish lines clipped around architectural floor voids', () => {
  const withFloor = structuredClone(project)
  const levelId = withFloor.levels[0].id
  withFloor.objects['floor-tile-proof'] = {
    id: 'floor-tile-proof',
    object_type: 'architecture.floor',
    created_phase: 'new_construction',
    level_refs: [{ level_id: levelId, role: 'base' }],
    module_data: {
      mark: 'AF1', level_id: levelId,
      boundary_mm: [[0, 0], [2400, 0], [2400, 2400], [0, 2400]],
      voids_mm: [[[600, 600], [1800, 600], [1800, 1800], [600, 1800]]],
      elevation_mm: 0, elevation_offset_mm: 0, thickness_mm: 100,
      finish_layers: [{ material: 'porcelain_tile', thickness_mm: 10 }],
      finish_pattern_mm: [400, 600], finish_pattern_origin_mm: [100, 0],
      finish_pattern_rotation_deg: 15, follows_room_boundary: false,
    },
  }
  const a02 = compilePermitDrawingSet(withFloor).sheets.find(sheet => sheet.id === 'A-02')
  assert.ok(a02.svg.includes('#9aa6b4'), 'tile finish grid should compile to editable vector linework')
})

test('S4: A-08 covers all levels and schedules catalog dimensions in meters', () => {
  const drawingSet = compileInitialDrawingSet(project)
  const a08 = drawingSet.sheets.find(sheet => sheet.id === 'A-08')

  assert.ok(a08.svg.includes('ALL LEVELS'))
  assert.ok(a08.svg.includes('0.90'))
  assert.ok(a08.svg.includes('1.20'))
  for (const type of project.types.filter(type => type.object_type.startsWith('door_window.')))
    assert.ok(a08.svg.includes(`${type.name} ·`), `A-08 should show ${type.name} in its type elevations`)
  assert.ok(!drawingSet.warnings.some(warning => warning.includes('catalog has') && warning.includes('opening types')))
})
