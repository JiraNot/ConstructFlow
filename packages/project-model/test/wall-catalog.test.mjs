import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_STRUCTURAL_TYPES } from '../dist/project.js'

test('wall catalog presets keep core and surface layers equal to the finished thickness', () => {
  const walls = DEFAULT_STRUCTURAL_TYPES.filter(type => type.object_type === 'architecture.wall')
  assert.deepEqual(walls.map(type => type.name), ['AAC 100 mm', 'AAC 150 mm', 'W3', 'W4', 'W5', 'W6', 'W7'])
  assert.ok(!walls.some(type => type.name === 'W1' || type.name === 'W2'), 'finish marks must not be wall assembly presets')
  for (const wall of walls) {
    const p = wall.parameters
    assert.equal(
      p.masonry_thickness_mm + p.plaster_inside_thickness_mm + p.plaster_outside_thickness_mm,
      p.thickness_mm,
      `${wall.name} finished thickness should match all layers`,
    )
  }
  assert.deepEqual(
    [walls[0].parameters.thickness_mm, walls[0].parameters.masonry_thickness_mm, walls[0].parameters.plaster_inside_thickness_mm, walls[0].parameters.plaster_outside_thickness_mm],
    [120, 100, 10, 10],
  )
  assert.deepEqual(
    [walls[1].parameters.thickness_mm, walls[1].parameters.masonry_thickness_mm],
    [170, 150],
  )
  assert.equal(walls[0].parameters.inside_finish_mark, 'W2')
  assert.equal(walls[0].parameters.outside_finish_mark, 'W1')
  assert.equal(walls[1].parameters.inside_finish_mark, 'W2')
  assert.equal(walls[1].parameters.outside_finish_mark, 'W1')
  assert.equal(walls[1].parameters.plaster_inside_material, 'ceramic_tile')
  assert.deepEqual(
    [walls[2].parameters.thickness_mm, walls[2].parameters.masonry_thickness_mm],
    [200, 170],
  )
  assert.deepEqual(new Set(walls.slice(3).map(type => type.parameters.wall_system)), new Set([
    'c_stud_smartboard', 'steel_frame_board', 'composite_panel', 'faux_wood_cladding',
  ]))
})
