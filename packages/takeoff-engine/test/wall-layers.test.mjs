import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createEmptyProjectDocument, deserializeProject } from '../../project-model/dist/index.js'
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

test('architectural floor takeoff subtracts voids and reports each finish layer separately from ceilings', () => {
  const project = createEmptyProjectDocument('ARCH-FLOOR-TAKEOFF', 'Architectural floor takeoff')
  const boundary_mm = [[0, 0], [4000, 0], [4000, 3000], [0, 3000]]
  const voids_mm = [[[1000, 1000], [2000, 1000], [2000, 2000], [1000, 2000]]]
  project.objects.floor = {
    id: 'floor', object_type: 'architecture.floor', created_phase: 'new_construction', level_refs: [], host_refs: [],
    module_data: { mark: 'AF1', boundary_mm, voids_mm, thickness_mm: 50, finish_layers: [
      { mark: 'Tile', material: 'porcelain_tile', thickness_mm: 10 },
      { mark: 'Screed', material: 'cement_screed', thickness_mm: 40, quantity_unit: 'm3' },
    ] },
  }
  project.objects.ceiling = {
    id: 'ceiling', object_type: 'architecture.ceiling', created_phase: 'new_construction', level_refs: [], host_refs: [],
    module_data: { mark: 'CL1', boundary_mm, voids_mm, thickness_mm: 12, material: 'gypsum_board' },
  }

  const report = calculateTakeoff(project)
  const floorLines = report.lines.filter(line => line.object_type === 'architecture.floor.finish')
  const ceilingLine = report.lines.find(line => line.object_type === 'architecture.ceiling')
  assert.equal(floorLines.length, 2)
  assert.equal(floorLines.find(line => line.unit === 'm2' && line.material === 'porcelain_tile').quantity, 11)
  assert.equal(floorLines.find(line => line.unit === 'm3' && line.material === 'cement_screed').quantity, 0.44)
  assert.equal(ceilingLine.unit, 'm2')
  assert.equal(ceilingLine.quantity, 11)
  assert.equal(ceilingLine.material, 'gypsum_board')

  const invalidProject = structuredClone(project)
  invalidProject.objects.floor.module_data.voids_mm = [[[0, 0], [5000, 0], [5000, 3000], [0, 3000]]]
  const invalidReport = calculateTakeoff(invalidProject)
  assert.ok(!invalidReport.lines.some(line => line.source_object_ids.includes('floor')))
  assert.ok(invalidReport.warnings.some(warning => warning.includes('void area exceeds the gross area')))

  const invalidOutside = structuredClone(project)
  invalidOutside.objects.floor.module_data.voids_mm = [[[5000, 1000], [6000, 1000], [6000, 2000], [5000, 2000]]]
  const outsideReport = calculateTakeoff(invalidOutside)
  assert.ok(!outsideReport.lines.some(line => line.source_object_ids.includes('floor')))
  assert.ok(outsideReport.warnings.some(warning => warning.includes('not fully contained')))

  const overlapping = structuredClone(project)
  overlapping.objects.floor.module_data.voids_mm = [
    [[500, 500], [2500, 500], [2500, 2000], [500, 2000]],
    [[2000, 1000], [3500, 1000], [3500, 2500], [2000, 2500]],
  ]
  const overlapReport = calculateTakeoff(overlapping)
  assert.ok(!overlapReport.lines.some(line => line.source_object_ids.includes('floor')))
  assert.ok(overlapReport.warnings.some(warning => warning.includes('voids overlap')))

  const selfIntersecting = structuredClone(project)
  selfIntersecting.objects.floor.module_data.boundary_mm = [[0, 0], [4000, 3000], [4000, 0], [0, 3000]]
  const selfIntersectingReport = calculateTakeoff(selfIntersecting)
  assert.ok(!selfIntersectingReport.lines.some(line => line.source_object_ids.includes('floor')))
  assert.ok(selfIntersectingReport.warnings.some(warning => warning.includes('self-intersecting')))
})
