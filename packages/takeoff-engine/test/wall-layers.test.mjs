import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { deserializeProject } from '../../project-model/dist/index.js'
import { calculateTakeoff } from '../dist/index.js'

const fixture = deserializeProject(await readFile(new URL('../../../examples/kitchen-extension-proof.cfproj', import.meta.url), 'utf8'))

test('wall takeoff separates masonry volume from inside and outside plaster areas', () => {
  const project = structuredClone(fixture)
  const wall = Object.values(project.objects).find(object => object.object_type === 'architecture.wall')
  const type = project.types.find(candidate => candidate.id === wall.module_data.type_id)
  type.parameters = {
    ...type.parameters,
    thickness_mm: 120,
    masonry_thickness_mm: 100,
    plaster_inside_thickness_mm: 10,
    plaster_outside_thickness_mm: 10,
    plaster_inside_material: 'cement_plaster',
    plaster_outside_material: 'cement_plaster',
  }
  wall.module_data = {
    ...wall.module_data,
    thickness_mm: 120,
    masonry_thickness_mm: 100,
    plaster_inside_thickness_mm: 10,
    plaster_outside_thickness_mm: 10,
  }
  project.objects = { [wall.id]: wall }

  const report = calculateTakeoff(project)
  const wallLines = report.lines.filter(line => line.source_object_ids.includes(wall.id))
  const area = wall.module_data.length_mm * wall.module_data.height_mm / 1_000_000
  const masonryVolume = wallLines.find(line => line.unit === 'm3')
  const plasterLines = wallLines.filter(line => line.unit === 'm2' && line.material === 'cement_plaster')

  assert.equal(masonryVolume.material, wall.module_data.material)
  assert.ok(Math.abs(masonryVolume.quantity - area * 0.1) < 1e-9)
  assert.equal(plasterLines.length, 2)
  assert.ok(plasterLines.every(line => Math.abs(line.quantity - area) < 1e-9))
  assert.ok(plasterLines[0].formula !== plasterLines[1].formula)
})
