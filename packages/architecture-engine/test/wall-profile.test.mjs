import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyProjectDocument } from '../../project-model/dist/index.js'
import { getWallSolidProfiles, resolveWallTopSegments, wallProfileAreaMm2 } from '../dist/index.js'

function scene() {
  const project = createEmptyProjectDocument(crypto.randomUUID())
  project.levels.find(l => l.id === project.project.active_level_id).elevation_mm = 0
  const object = (object_type, module_data) => ({ id: crypto.randomUUID(), object_type, status: 'active', created_phase: 'new_construction', removed_phase: null, module_data })
  const wall = object('architecture.wall', { start_point_mm: [0, 500, 0], end_point_mm: [3750, 500, 0], length_mm: 3750, thickness_mm: 105, height_mm: 3200, level_id: project.project.active_level_id, fit_to_stair: true })
  const stair = object('architecture.stair', { start_point_mm: [0, 0, 0], level_id: project.project.active_level_id, stair_type: 'straight', total_rise_mm: 3200, num_risers: 16, tread_depth_mm: 250, width_mm: 1000, landing_depth_mm: 1000 })
  project.objects = { [wall.id]: wall, [stair.id]: stair }
  return { project, wall, stair, object }
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.01, `${a} != ${b}`)

test('wall top follows the solid soffit rather than the treads or handrail; area excludes below-base portions', () => {
  const { project, wall } = scene()
  near(wallProfileAreaMm2(getWallSolidProfiles(project, wall)), 5076562.5)
  near(resolveWallTopSegments(project, wall).at(-1).end_height_mm, 2850)
})
test('move, rotate, remove and disable stair constraints rebuild without stale wall geometry', () => {
  const { project, wall, stair } = scene()
  const original = getWallSolidProfiles(project, wall)
  for (const o of [wall, stair]) {
    const d = o.module_data
    const rotate = ([x,y,z]) => [-y + 4000, x + 800, z]
    d.start_point_mm = rotate(d.start_point_mm)
    if (d.end_point_mm) d.end_point_mm = rotate(d.end_point_mm)
    if (o === stair) d.rotation_deg = 90
  }
  near(wallProfileAreaMm2(getWallSolidProfiles(project, wall)), wallProfileAreaMm2(original))
  stair.module_data.start_point_mm[0] += 5000
  near(wallProfileAreaMm2(getWallSolidProfiles(project, wall)), 3750 * 3200)
  stair.status = 'archived'
  near(wallProfileAreaMm2(getWallSolidProfiles(project, wall)), 3750 * 3200)
  wall.module_data.fit_to_stair = false
  near(wallProfileAreaMm2(getWallSolidProfiles(project, wall)), 3750 * 3200)
})
test('partial overlap cuts only the intersecting wall span and clips overlapping apertures once', () => {
  const { project, wall, stair, object } = scene()
  wall.module_data.start_point_mm[0] = -1000
  wall.module_data.length_mm = 4750
  near(wallProfileAreaMm2(getWallSolidProfiles(project, wall)), 3200000 + 5076562.5)
  for (let i = 0; i < 2; i++) {
    const opening = object('door_window.window', { wall_id: wall.id, level_id: project.project.active_level_id, offset_along_wall_mm: 4000, width_mm: 1000, height_mm: 3000, sill_height_mm: 0 })
    project.objects[opening.id] = opening
  }
  // At global x=2500..3500 the opening removes only the existing sloping masonry.
  near(wallProfileAreaMm2(getWallSolidProfiles(project, wall)), 3200000 + 5076562.5 - 2250000)
  stair.created_phase = 'demolition'
  near(wallProfileAreaMm2(getWallSolidProfiles(project, wall, false)), 4750 * 3200)
})
test('U and L landings and mirrored return flights use their real underside elevations', () => {
  for (const shape of ['u_shape', 'l_shape']) for (const turn of ['left', 'right']) {
    const { project, wall, stair } = scene()
    Object.assign(stair.module_data, { stair_type: shape, first_flight_risers: 8, turn_direction: turn, flight_gap_mm: 100 })
    wall.module_data.start_point_mm = [1800, 400, 0]
    wall.module_data.end_point_mm = [2600, 400, 0]
    if (turn === 'left') { wall.module_data.start_point_mm[1] = 600; wall.module_data.end_point_mm[1] = 600 }
    near(wallProfileAreaMm2(getWallSolidProfiles(project, wall)), 800 * 1450)
  }
})
test('a crosswise wall stays below the soffit across its complete finished thickness', () => {
  const { project, wall } = scene()
  wall.module_data.start_point_mm = [500, 0, 0]
  wall.module_data.end_point_mm = [500, 1000, 0]
  near(wallProfileAreaMm2(getWallSolidProfiles(project, wall)), 208000)
})
