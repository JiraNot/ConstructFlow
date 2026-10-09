import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createEmptyProjectDocument, serializeProject } from '../packages/project-model/dist/index.js'
import { CommandBus } from '../packages/command-runtime/dist/index.js'

const out = resolve('examples/constructflow-house-demo.cfproj')
const project = createEmptyProjectDocument('CF-HOUSE-DEMO', 'บ้านเดโมสองชั้น · ConstructFlow')
project.levels = [
  { id: 'GF', name: 'Ground Floor', elevation_mm: 400, storey_index: 1, height_mm: 2900 },
  { id: 'L1', name: 'First Floor', elevation_mm: 3300, storey_index: 2, height_mm: 3200 },
  { id: 'RF', name: 'Roof Level', elevation_mm: 6500, storey_index: 3, height_mm: 500 },
]
project.project.active_level_id = 'GF'

let model = project
const ids = Object.create(null)
const run = (name, input, key) => {
  const id = input.id ?? crypto.randomUUID()
  const result = CommandBus.execute(model, name, { ...input, id })
  if (result.result.status !== 'success') {
    throw new Error(`${name} rejected: ${result.result.errors?.join('; ') ?? JSON.stringify(result.result)}`)
  }
  model = result.updatedProject
  if (key) ids[key] = id
  return id
}
const uid = () => crypto.randomUUID()

// 8 × 10 m house, 4 m structural bays. Grid systems remain editable as groups.
run('CreateGridSystem', { id: uid(), orientation: 'vertical', origin_mm: 0, spacing_mm: 4000, count: 3, first_tag: 'A', extent_mm: [-1000, 11000] }, 'grid-x')
run('CreateGridSystem', { id: uid(), orientation: 'horizontal', origin_mm: 0, spacing_mm: 5000, count: 3, first_tag: '1', extent_mm: [-1000, 9000] }, 'grid-y')

const columns = []
for (const y of [0, 5000, 10000]) for (const x of [0, 4000, 8000]) {
  const id = run('CreateColumn', {
    mark: 'C1', location_mm: [x, y, 0], section_mm: [200, 200],
    base_level_id: 'GF', base_offset_mm: -400, top_level_id: 'RF', top_offset_mm: 0,
  })
  columns.push({ id, x, y })
  run('CreateFoundation', { mark: 'F1', supported_column_id: id, size_mm: [1000, 1000, 350], top_elevation_mm: -350 })
}

// Continuous beam lines at both floor/roof bands, with their tops aligned to levels.
for (const [level, offset, mark] of [['GF', 2600, 'B1'], ['L1', 3200, 'B1']]) {
  for (const y of [0, 5000, 10000]) for (const [x0, x1] of [[0, 4000], [4000, 8000]]) {
    run('CreateBeam', { mark, start_point_mm: [x0, y, 0], end_point_mm: [x1, y, 0], section_mm: [200, 400], level_id: level, base_offset_mm: offset })
  }
  for (const x of [0, 4000, 8000]) for (const [y0, y1] of [[0, 5000], [5000, 10000]]) {
    run('CreateBeam', { mark: 'B2', start_point_mm: [x, y0, 0], end_point_mm: [x, y1, 0], section_mm: [200, 400], level_id: level, base_offset_mm: offset })
  }
}

// Structural floor plates with a stairwell opening.
const stairVoid = [[4500, 3000], [7500, 3000], [7500, 5000], [4500, 5000]]
for (const level of ['GF', 'L1']) {
  run('CreateSlab', {
    mark: 'S1', level_id: level, elevation_offset_mm: -120,
    boundary_mm: [[0, 0], [8000, 0], [8000, 10000], [0, 10000]],
    voids_mm: [stairVoid], elevation_mm: 0,
    thickness_mm: 120, topping_mm: level === 'GF' ? 0 : 50,
    slab_system: level === 'GF' ? 'slab_on_ground' : 'suspended', material: 'reinforced_concrete',
  })
}

const wallsByLevel = {}
for (const level of ['GF', 'L1']) {
  const walls = {}
  const wall = (key, start, end) => {
    walls[key] = run('CreateWall', {
      mark: 'W1', start_point_mm: [...start, 0], end_point_mm: [...end, 0],
      thickness_mm: 100, level_id: level, top_level_id: level === 'GF' ? 'L1' : 'RF', top_offset_mm: -200,
    })
  }
  // Perimeter, then room partitions; divisions create living/dining, kitchen, bath, and bedrooms.
  wall('front', [0, 0], [8000, 0])
  wall('right', [8000, 0], [8000, 10000])
  wall('back', [8000, 10000], [0, 10000])
  wall('left', [0, 10000], [0, 0])
  wall('partition-x-south', [4000, 0], [4000, 5000])
  wall('partition-x-north', [4000, 5000], [4000, 10000])
  wall('partition-y-west', [0, 5000], [4000, 5000])
  wall('partition-y-east', [4000, 5000], [8000, 5000])
  wallsByLevel[level] = walls
}

// Hosted openings use the wall's own centerline offset. Front doors and windows on the exterior walls.
for (const level of ['GF', 'L1']) {
  const w = wallsByLevel[level]
  run('CreateDoor', { mark: 'D1', wall_id: w.front, location_mm: [4000, 0, 0], offset_along_wall_mm: 4000, width_mm: 900, height_mm: 2100, handing: 'left_in', level_id: level })
  if (level === 'GF') {
    run('CreateDoor', { mark: 'D2', wall_id: w['partition-x-south'], location_mm: [4000, 2500, 0], offset_along_wall_mm: 2500, width_mm: 800, height_mm: 2000, handing: 'right_in', level_id: level })
  } else {
    run('CreateDoor', { mark: 'D1', wall_id: w['partition-x-north'], location_mm: [4000, 7500, 0], offset_along_wall_mm: 2500, width_mm: 800, height_mm: 2000, handing: 'left_in', level_id: level })
  }
  run('CreateWindow', { mark: 'W1', wall_id: w.front, location_mm: [1800, 0, 0], offset_along_wall_mm: 1800, width_mm: 1400, height_mm: 1200, sill_height_mm: 900, level_id: level })
  run('CreateWindow', { mark: 'W1', wall_id: w.front, location_mm: [6200, 0, 0], offset_along_wall_mm: 6200, width_mm: 1400, height_mm: 1200, sill_height_mm: 900, level_id: level })
  run('CreateWindow', { mark: 'W2', wall_id: w.back, location_mm: [6000, 10000, 0], offset_along_wall_mm: 2000, width_mm: 1600, height_mm: 1200, sill_height_mm: 900, level_id: level })
  run('CreateWindow', { mark: 'W2', wall_id: w.left, location_mm: [0, 7000, 0], offset_along_wall_mm: 3000, width_mm: 1200, height_mm: 1200, sill_height_mm: 900, level_id: level })
}

// Main stair and stairwell are included as editable objects, not drawing-only linework.
run('CreateStair', {
  mark: 'ST1', level_id: 'GF', stair_type: 'u_shape', structure_type: 'rc_monolithic',
  start_point_mm: [4500, 3000, 400], total_rise_mm: 2900, width_mm: 900, num_risers: 17,
  riser_height_mm: 170.59, tread_depth_mm: 220, landing_depth_mm: 1000, turn_direction: 'right',
  has_handrail: true, handrail_height_mm: 900,
})

// Add editable room regions, then associate finish floors and ceilings to each room.
for (const level of ['GF', 'L1']) {
  const roomSpecs = [
    ['Living / Dining', '01', [[0, 0], [4000, 0], [4000, 5000], [0, 5000]]],
    ['Kitchen', '02', [[4000, 0], [8000, 0], [8000, 5000], [4000, 5000]]],
    [level === 'GF' ? 'Bath / Guest' : 'Bedroom 2', '03', [[0, 5000], [4000, 5000], [4000, 10000], [0, 10000]]],
    [level === 'GF' ? 'Bedroom 1' : 'Primary Bedroom', '04', [[4000, 5000], [8000, 5000], [8000, 10000], [4000, 10000]]],
  ]
  roomSpecs.forEach(([name, number, boundary_mm], index) => {
    const roomId = run('CreateRoom', { mark: `R${number}`, name, number, level_id: level, boundary_mm, boundary_source: 'manual', device_ids: [] })
    run('CreateArchitecturalFloor', {
      mark: 'AF1', room_id: roomId, level_id: level,
      elevation_mm: level === 'GF' ? 400 : 3300, elevation_offset_mm: 0, thickness_mm: 50,
      voids_mm: [], finish_layers: [{ material: index === 2 && level === 'GF' ? 'ceramic_tile' : 'porcelain_tile', thickness_mm: 10 }],
    })
    run('CreateCeiling', {
      mark: 'CL1', room_id: roomId, level_id: level,
      elevation_mm: level === 'GF' ? 2800 : 5800, elevation_offset_mm: 0, thickness_mm: 9,
      voids_mm: [], grid_mm: [600, 600],
    })
  })
}

// Roof, wet area, kitchen millwork and representative electrical fixtures/circuit.
run('GenerateRoof', {
  mark: 'RF1', level_id: 'RF', elevation_mm: 6500, thickness_mm: 30, material: 'pu_metal_sheet',
  boundary_mm: [[-300, -300], [8300, -300], [8300, 10300], [-300, 10300]],
  edges: [0, 1, 2, 3].map(() => ({ defines_slope: true, slope_deg: 25 })),
})
run('CreateBathroom', {
  mark: 'BATH1', level_id: 'GF', boundary_mm: [[1000, 5500], [3500, 5500], [3500, 9000], [1000, 9000]],
  elevation_mm: 400, drop_mm: 75, slope_ratio: 0.02, drain_mm: [3000, 8000],
  waterproof_upstand_mm: 300, wet_wall_height_mm: 1800, wet_wall_length_mm: 6500,
  tile_mm: [300, 300], toilet_rough_in_mm: 305,
})
const cabinetId = run('CreateCabinetRun', {
  mark: 'CB1', level_id: 'GF', location_mm: [4300, 1200, 400], width_mm: 3000, height_mm: 850, depth_mm: 600,
  board_mm: 18, back_mm: 9, plinth_mm: 100, rotation_deg: 90, modules_mm: [600, 900, 900, 600],
  shelves: 2, drawers: 3, front: 'solid', carcass_material: 'melamine', front_material: 'laminate',
  back_material: 'plywood', countertop_material: 'quartz', countertop_mm: 20,
})
run('CreateLEDRun', { mark: 'LED1', level_id: 'GF', host_id: cabinetId, path_mm: [[4300, 1200, 1220], [7300, 1200, 1220]], watts_per_m: 9.6, voltage: 24, driver_watts: 40, derating_ratio: 0.8, material: 'aluminium_profile_diffuser' })
const panelId = run('PlaceElectricalFixture', { mark: 'DB1', level_id: 'GF', kind: 'panel', location_mm: [500, 500, 1900], watts: 0, grounded: true, controlled_ids: [], switch_ways: 1 })
const lightIds = []
for (const [index, point] of [[1, [2000, 2500, 2700]], [2, [6000, 2500, 2700]], [3, [2000, 7500, 2700]], [4, [6000, 7500, 2700]]]) {
  lightIds.push(run('PlaceElectricalFixture', { mark: `L${index}`, level_id: 'GF', kind: 'light', location_mm: point, watts: 18, grounded: true, controlled_ids: [], switch_ways: 1 }))
}
const outletId = run('PlaceElectricalFixture', { mark: 'SO1', level_id: 'GF', kind: 'outlet', location_mm: [1000, 500, 700], watts: 1000, grounded: true, controlled_ids: [], switch_ways: 1 })
run('PlaceElectricalFixture', { mark: 'SW1', level_id: 'GF', kind: 'switch', location_mm: [500, 700, 1600], watts: 0, grounded: true, controlled_ids: [lightIds[0], lightIds[1]], switch_ways: 2 })
run('CreateCircuit', { mark: 'CKT1', level_id: 'GF', panel_id: panelId, device_ids: [...lightIds, outletId], voltage: 230, breaker_a: 16, cable_mm2: 2.5, allowable_current_a: 20 })

await mkdir(resolve('examples'), { recursive: true })
await writeFile(out, serializeProject(model), 'utf8')
console.log(`Wrote ${out}`)
console.log(`Objects: ${Object.keys(model.objects).length}; rooms: ${Object.values(model.objects).filter(o => o.object_type === 'architecture.room').length}; levels: ${model.levels.length}`)
