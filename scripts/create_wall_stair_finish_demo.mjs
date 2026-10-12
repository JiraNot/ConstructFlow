import { writeFileSync } from 'node:fs'
import { createEmptyProjectDocument, serializeProject } from '../packages/project-model/dist/index.js'
import { CommandBus } from '../packages/command-runtime/dist/index.js'

let project = createEmptyProjectDocument('258e3328-a356-4d79-9cbe-a31603c025bd', 'ผนังใต้บันไดและรอยต่อฉาบ')
const level = project.project.active_level_id
project.levels = [{ ...project.levels.find(l => l.id === level), elevation_mm: 0, height_mm: 3600 }]
const columnType = project.types.find(t => t.object_type === 'structure.column')
columnType.parameters.plaster_thickness_mm = 15
columnType.parameters.material = 'reinforced_concrete'
const type = project.types.find(t => t.object_type === 'architecture.wall')
Object.assign(type.parameters, { thickness_mm: 105, masonry_thickness_mm: 75, plaster_inside_thickness_mm: 15, plaster_outside_thickness_mm: 15, plaster_inside_material: 'cement_plaster', plaster_outside_material: 'cement_plaster', inside_finish_mark: 'W3', outside_finish_mark: 'W3' })
type.name = 'W-AAC75'
const id = number => `7b5c8f75-8d14-4280-8626-${String(number).padStart(12, '0')}`
function run(name, input) {
  const r = CommandBus.execute(project, name, input)
  if (r.result.status !== 'success') throw new Error(JSON.stringify(r.result))
  project = r.updatedProject
}
run('CreateStair', { id: id(1), mark: 'ST1', level_id: level, start_point_mm: [0, 0, 0], total_rise_mm: 3200, width_mm: 1000, num_risers: 16, tread_depth_mm: 250, landing_depth_mm: 1000, stair_type: 'straight', has_handrail: false })
run('CreateWall', { id: id(2), type_id: type.id, mark: type.name, level_id: level, start_point_mm: [0, 500, 0], end_point_mm: [3750, 500, 0], thickness_mm: 75, height_mm: 3200, fit_to_stair: true })
// A 200 mm RC column with 15 mm plaster on both sides projects beyond the thin wall.
run('CreateColumn', { id: id(3), type_id: columnType.id, mark: 'C-PROUD', level_id: level, location_mm: [6500, 3500, 0], section_mm: [200, 200], height_mm: 3200, material: 'reinforced_concrete' })
run('CreateWall', { id: id(4), type_id: type.id, mark: type.name, level_id: level, start_point_mm: [5000, 3500, 0], end_point_mm: [8000, 3500, 0], thickness_mm: 75, height_mm: 3200 })
// Offset the wall reference so its finished north face is flush with the RC column/beam.
run('CreateColumn', { id: id(5), type_id: columnType.id, mark: 'C-FLUSH', level_id: level, location_mm: [10500, 3500, 0], section_mm: [200, 200], height_mm: 3200, material: 'reinforced_concrete' })
run('CreateWall', { id: id(6), type_id: type.id, mark: type.name, level_id: level, start_point_mm: [9000, 3562.5, 0], end_point_mm: [12000, 3562.5, 0], thickness_mm: 75, height_mm: 3200 })
run('CreateBeam', { id: id(7), mark: 'B-FLUSH', level_id: level, start_point_mm: [9000, 3500, 0], end_point_mm: [12000, 3500, 0], section_mm: [200, 400], base_offset_mm: 3200, material: 'reinforced_concrete' })
writeFileSync(new URL('../examples/wall-stair-finish-proof.cfproj', import.meta.url), serializeProject(project))
console.log('Created examples/wall-stair-finish-proof.cfproj')
