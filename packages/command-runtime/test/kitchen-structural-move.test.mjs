import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { deserializeProject } from '../../project-model/dist/index.js'
import { CommandBus, ProjectCommandSession } from '../dist/index.js'

const fixture = await readFile(new URL('../../../examples/kitchen-extension-proof.cfproj', import.meta.url), 'utf8')
const project = deserializeProject(fixture)

test('S2: moving a supported column keeps hosted foundation and beam endpoints associative', () => {
  const column = Object.values(project.objects).find(object =>
    object.object_type === 'structure.column'
    && Object.values(project.objects).some(candidate => candidate.object_type === 'structure.foundation'
      && candidate.module_data.supported_column_id === object.id)
  )
  const location = column.module_data.location_mm
  const nextLocation = [location[0] + 350, location[1] + 200, location[2]]
  const foundation = Object.values(project.objects).find(object =>
    object.object_type === 'structure.foundation' && object.module_data.supported_column_id === column.id
  )
  const linkedBeams = Object.values(project.objects).filter(object => object.object_type === 'structure.beam'
    && (object.module_data.start_column_id === column.id || object.module_data.end_column_id === column.id))
  assert.ok(foundation)
  assert.ok(linkedBeams.length > 0)

  const session = new ProjectCommandSession(project)
  const result = session.execute([{ name: 'MoveColumn', input: { object_id: column.id, location_mm: nextLocation } }])
  assert.equal(result.status, 'success')
  const updated = result.updatedProject
  const movedColumn = updated.objects[column.id]
  const movedFoundation = updated.objects[foundation.id]
  assert.deepEqual(movedColumn.module_data.location_mm, nextLocation)
  assert.deepEqual(movedFoundation.module_data.center_mm, nextLocation)
  assert.equal(movedFoundation.module_data.supported_column_id, column.id)
  assert.equal(movedFoundation.host_refs.includes(column.id), true)

  for (const beam of linkedBeams) {
    const movedBeam = updated.objects[beam.id]
    const endpoint = beam.module_data.start_column_id === column.id
      ? movedBeam.module_data.start_point_mm
      : movedBeam.module_data.end_point_mm
    assert.deepEqual(endpoint.slice(0, 2), nextLocation.slice(0, 2))
    assert.equal(movedBeam.module_data.span_mm, Math.round(Math.hypot(
      movedBeam.module_data.end_point_mm[0] - movedBeam.module_data.start_point_mm[0],
      movedBeam.module_data.end_point_mm[1] - movedBeam.module_data.start_point_mm[1],
    )))
  }
  assert.ok(result.results[0].affected_object_ids.includes(foundation.id))
  for (const beam of linkedBeams) assert.ok(result.results[0].affected_object_ids.includes(beam.id))
  assert.deepEqual(session.undo(), project)
  assert.deepEqual(session.redo(), updated)
})

test('S2: moving a column onto its neighbor rejects zero-span beams without partial changes', () => {
  const columns = Object.values(project.objects).filter(object => object.object_type === 'structure.column')
  const moving = columns[0]
  const neighbor = columns.find(object => {
    const dx = object.module_data.location_mm[0] - moving.module_data.location_mm[0]
    const dy = object.module_data.location_mm[1] - moving.module_data.location_mm[1]
    return Math.hypot(dx, dy) > 0
      && Object.values(project.objects).some(beam => beam.object_type === 'structure.beam'
        && ((beam.module_data.start_column_id === moving.id && beam.module_data.end_column_id === object.id)
          || (beam.module_data.end_column_id === moving.id && beam.module_data.start_column_id === object.id)))
  })
  assert.ok(neighbor)

  const result = CommandBus.execute(project, 'MoveColumn', {
    object_id: moving.id,
    location_mm: neighbor.module_data.location_mm,
  })
  assert.notEqual(result.result.status, 'success')
  assert.deepEqual(result.updatedProject, project)
  assert.deepEqual(result.emittedEnvelope, undefined)
})

test('S2: 2D column moves preserve the existing vertical datum', () => {
  const elevatedProject = structuredClone(project)
  const column = Object.values(elevatedProject.objects).find(object => object.object_type === 'structure.column')
  const original = [...column.module_data.location_mm]
  column.module_data.location_mm = [original[0], original[1], 425]
  const nextXY = [original[0] + 120, original[1] + 80]

  const result = CommandBus.execute(elevatedProject, 'MoveColumn', {
    object_id: column.id,
    location_mm: nextXY,
  })

  assert.equal(result.result.status, 'success')
  assert.deepEqual(result.updatedProject.objects[column.id].module_data.location_mm, [nextXY[0], nextXY[1], 425])
  const foundation = Object.values(result.updatedProject.objects).find(object =>
    object.object_type === 'structure.foundation' && object.module_data.supported_column_id === column.id
  )
  assert.deepEqual(foundation.module_data.center_mm, [nextXY[0], nextXY[1], 425])
})
