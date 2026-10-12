import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createEmptyProjectDocument, serializeProject } from '../packages/project-model/dist/index.js'
import { CommandBus } from '../packages/command-runtime/dist/index.js'

// Reference image dimensions are metres; canonical model coordinates are millimetres.
export const referenceGridX = [0, 2900, 7500, 11000, 12600, 13800]
export const referenceGridY = [0, 3000, 4600, 5500, 8800]
export const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
export const demoId = key => {
  const h = createHash('sha256').update(`constructflow-reference-house-v1:${key}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}

export function createReferenceHouseDemo() {
  let model = createEmptyProjectDocument(demoId('project'), 'บ้านสองชั้นตามแปลนตัวอย่าง · 13.80 × 8.80 ม.')
  model.levels = [
    { id: 'DATUM', name: 'Ground · ระดับดินอ้างอิง', elevation_mm: 0, storey_index: 0, height_mm: 400 },
    { id: 'GF', name: 'ชั้น 1', elevation_mm: 400, storey_index: 1, height_mm: 3400 },
    { id: 'L1', name: 'ชั้น 2', elevation_mm: 3800, storey_index: 2, height_mm: 3400 },
    { id: 'RF', name: 'หลังคานอะเส', elevation_mm: 7200, storey_index: 3, height_mm: 500 },
  ]
  model.project.active_level_id = 'GF'
  model.project.active_phase = 'new_construction'
  const run = (command, input, key) => {
    const id = demoId(key)
    // The editor's plan Y grows downward. Reflect the reference's north-up
    // coordinates at the command boundary so the on-screen plan matches the image.
    const mapped = structuredClone(input)
    const point = p => [p[0], 8800 - p[1], ...p.slice(2)]
    for (const field of ['start_point_mm', 'end_point_mm', 'location_mm', 'center_mm'])
      if (Array.isArray(mapped[field])) mapped[field] = point(mapped[field])
    if (typeof mapped.rotation_deg === 'number') mapped.rotation_deg = (360 - mapped.rotation_deg) % 360
    if (Array.isArray(mapped.boundary_mm)) mapped.boundary_mm = mapped.boundary_mm.map(point)
    // CreateWall currently starts with its interior on the left. Reflection
    // reverses that normal, so swap door swing sides to preserve the layout.
    if (command === 'CreateDoor') mapped.handing = mapped.handing.endsWith('_in')
      ? mapped.handing.replace('_in', '_out') : mapped.handing.replace('_out', '_in')
    if (typeof mapped.drain_direction_deg === 'number') mapped.drain_direction_deg = (360 - mapped.drain_direction_deg) % 360
    if (command === 'CreateGridSystem') {
      if (mapped.orientation === 'horizontal') mapped.positions_mm = mapped.positions_mm.map(y => 8800 - y).reverse()
      else mapped.extent_mm = mapped.extent_mm.map(y => 8800 - y).reverse()
    }
    const response = CommandBus.execute(model, command, { ...mapped, id }, 'ai')
    if (response.result.status !== 'success') throw new Error(`${key}: ${command}: ${JSON.stringify(response.result)}`)
    model = response.updatedProject
    return id
  }
  const define = (key, family, name, parameters) => {
    const existing = model.types.find(t => t.object_type === family && t.name === name)
    if (existing) {
      run('UpdateStructuralTypeDimensions', { type_id_or_name: existing.id, object_type: family, parameters }, `type:${key}`)
      return existing.id
    }
    return run('DefineStructuralType', { object_type: family, name, parameters }, `type:${key}`)
  }
  const slabTypes = {}
  for (const [key, name, core, material, finish, pattern] of [
    ['dry', 'พื้นภายใน · คสล.150 + ปูนปรับ30 + กระเบื้อง10', 150, 'porcelain_tile', 10, [600, 600]],
    ['wet', 'พื้นลดระดับ · คสล.150 + กันซึม2 + ปูนปรับ28 + กระเบื้อง10', 150, 'ceramic_tile', 10, [300, 300]],
    ['outdoor', 'พื้นภายนอก · คสล.120 + ปูนปรับ30 + กระเบื้องกันลื่น10', 120, 'non_slip_tile', 10, [300, 300]],
    ['parking', 'ลานจอดรถ · คสล.150 + ผิวขัดหยาบ10', 150, 'broom_finished_concrete', 10, undefined],
  ]) {
    const layers = key === 'parking' ? [{ material, thickness_mm: finish, quantity_unit: 'm2' }]
      : [...(key === 'wet' ? [{ material: 'cementitious_waterproofing', thickness_mm: 2, quantity_unit: 'm2' }] : []),
        { material: 'cement_screed', thickness_mm: key === 'wet' ? 28 : 30, quantity_unit: 'm3' },
        { material, thickness_mm: finish, quantity_unit: 'm2' }]
    slabTypes[key] = { id: define(key, 'structure.slab', name, {
      thickness_mm: core, topping_mm: 0, material: 'reinforced_concrete',
      slab_system: 'suspended', finish_layers: layers, slope_ratio: 0, drain_direction_deg: 0,
      ...(pattern ? { finish_pattern_mm: pattern } : {}),
    }), finish: layers.reduce((s, l) => s + l.thickness_mm, 0) }
  }
  const extWall = define('exterior-wall', 'architecture.wall', 'W1', {
    thickness_mm: 150, masonry_thickness_mm: 125, plaster_inside_thickness_mm: 12.5,
    plaster_outside_thickness_mm: 12.5, material: 'aac_block', plaster_inside_material: 'cement_plaster', plaster_outside_material: 'cement_plaster', inside_finish_mark: 'W2', outside_finish_mark: 'W1',
  })
  const intWall = define('interior-wall', 'architecture.wall', 'W2', {
    thickness_mm: 100, masonry_thickness_mm: 75, plaster_inside_thickness_mm: 12.5,
    plaster_outside_thickness_mm: 12.5, material: 'aac_block', plaster_inside_material: 'cement_plaster', plaster_outside_material: 'cement_plaster', inside_finish_mark: 'W2', outside_finish_mark: 'W2',
  })
  const wetWall = define('wet-wall', 'architecture.wall', 'W3', {
    thickness_mm: 100, masonry_thickness_mm: 75, plaster_inside_thickness_mm: 12.5,
    plaster_outside_thickness_mm: 12.5, material: 'aac_block', plaster_inside_material: 'ceramic_tile', plaster_outside_material: 'cement_plaster', inside_finish_mark: 'W3', outside_finish_mark: 'W2',
  })
  const columnType = define('column', 'structure.column', 'C1', { section_mm: [200, 200], material: 'reinforced_concrete' })
  const beamType = define('beam', 'structure.beam', 'B250 · คาน คสล.250×450', { section_mm: [250, 450], material: 'reinforced_concrete' })
  const roofBeamType = define('roof-beam', 'structure.beam', 'RB200 · คานอะเส200×400', { section_mm: [200, 400], material: 'reinforced_concrete' })

  for (const level of ['DATUM', 'GF', 'L1']) {
    run('SetWorkingLevel', { level_id: level }, `work:${level}`)
    for (const [axis, positions, extent, tag] of [['vertical', referenceGridX, [-700, 11000], 'A'], ['horizontal', referenceGridY, [-700, 14600], '1']])
      run('CreateGridSystem', { orientation: axis, positions_mm: positions, first_tag: tag, extent_mm: extent,
        grid_ids: positions.map((_, i) => demoId(`grid:${level}:${axis}:${i}`)) }, `grid-system:${level}:${axis}`)
  }
  run('SetWorkingLevel', { level_id: 'GF' }, 'work:initial')

  // Continuous columns; host-connected beams follow moved supports.
  const supportPoints = []
  for (const y of [0, 3000, 5500]) for (const x of [2900, 7500, 11000, 13800]) supportPoints.push([x, y])
  for (const x of [2900, 7500, 11000]) supportPoints.push([x, 8800])
  const supports = { GF: new Map(), L1: new Map() }
  for (const [x, y] of supportPoints) {
    const id = run('CreateColumn', { mark: 'C1', type_id: columnType, location_mm: [x, y, -300],
      base_level_id: 'DATUM', base_offset_mm: -300, top_level_id: 'RF', top_offset_mm: 0 }, `column:${x}:${y}`)
    for (const level of ['GF', 'L1']) supports[level].set(`${x},${y}`, id)
    run('CreateFoundation', { mark: 'F1', supported_column_id: id, center_mm: [x, y, -300],
      size_mm: [1000, 1000, 350], top_elevation_mm: -300 }, `foundation:${x}:${y}`)
  }
  const beam = (level, a, b, topOffset = -140, roof = false, key = `${a}:${b}`) => {
    // Current command stores the bottom datum. Convert desired TOP explicitly once here.
    const depth = roof ? 400 : 450
    return run('CreateBeam', { mark: roof ? 'RB200' : 'B250', type_id: roof ? roofBeamType : beamType,
      section_mm: [roof ? 200 : 250, depth], start_point_mm: [...a, 0], end_point_mm: [...b, 0],
      level_id: level, base_offset_mm: topOffset - depth,
      start_column_id: supports[level === 'RF' ? 'L1' : 'GF'].get(a.join(',')),
      end_column_id: supports[level === 'RF' ? 'L1' : 'GF'].get(b.join(',')),
    }, `beam:${level}:${key}`)
  }
  for (const level of ['DATUM', 'L1', 'RF']) {
    const roof = level === 'RF'
    const topOffset = roof ? 0 : level === 'DATUM' ? 260 : -140
    for (const y of [0, 3000, 5500]) for (const [a, b] of [[2900, 7500], [7500, 11000], [11000, 13800]]) {
      // Keep the whole stairwell clear; perimeter trimmers run around its opening instead.
      beam(level, [a, y], [b, y], topOffset, roof)
    }
    for (const x of [2900, 7500, 11000, 13800]) for (const [a, b] of [[0, 3000], [3000, 5500]])
      beam(level, [x, a], [x, b], topOffset, roof)
    for (const [a, b] of [[2900, 7500], [7500, 11000]]) beam(level, [a, 8800], [b, 8800], topOffset, roof)
    for (const x of [2900, 7500, 11000]) beam(level, [x, 5500], [x, 8800], topOffset, roof)
  }

  const walls = {}
  const wall = (level, key, a, b, exterior = false) => {
    const wet = key.startsWith('bath')
    const id = run('CreateWall', { mark: exterior ? 'W1' : wet ? 'W3' : 'W2', type_id: exterior ? extWall : wet ? wetWall : intWall,
      start_point_mm: [...a, 0], end_point_mm: [...b, 0],
      level_id: level, top_level_id: level === 'GF' ? 'L1' : 'RF', top_offset_mm: level === 'GF' ? -590 : -400,
    }, `wall:${level}:${key}`)
    walls[`${level}:${key}`] = { id, a, b }
    return id
  }
  const perimeter = (level, points) => {
    // The outline follows column centres counterclockwise. Move each wall
    // centreline 25 mm outward: 200/2 - 150/2. Intersect adjacent offset
    // lines at corners, so the finished exterior face is flush with columns.
    const shifted = points.map((p, i) => {
      const prev = points[(i + points.length - 1) % points.length], next = points[(i + 1) % points.length]
      const outward = (a, b) => { const len = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[1] - a[1]) / len * 25, -(b[0] - a[0]) / len * 25] }
      const before = outward(prev, p), after = outward(p, next)
      return [p[0] + before[0] + after[0], p[1] + before[1] + after[1]]
    })
    shifted.forEach((a, i) => wall(level, `outer${i}`, a, shifted[(i + 1) % shifted.length], true))
  }
  perimeter('GF', [[2900, 0], [13800, 0], [13800, 5500], [11000, 5500], [11000, 8800], [7500, 8800], [7500, 5500], [2900, 5500]])
  perimeter('L1', [[2900, 0], [13800, 0], [13800, 5500], [11000, 5500], [11000, 8800], [2900, 8800]])
  for (const [key, a, b] of [
    ['kitchen-pantry', [5900, 0], [5900, 3000]], ['pantry-dining', [7500, 0], [7500, 3000]],
    ['bed4-west', [11000, 0], [11000, 4600]], ['bath4', [11000, 1575], [13800, 1575]],
    ['bath5-east', [4350, 3000], [4350, 5500]], ['kitchen-north', [2900, 3000], [5900, 3000]],
    ['pantry-north', [5900, 3000], [7500, 3000]],
  ]) wall('GF', key, a, b)
  for (const [key, a, b] of [
    ['south-hall', [2900, 3000], [13800, 3000]], ['bed2-bed3', [7500, 0], [7500, 3000]],
    ['bath3-east', [4500, 0], [4500, 3000]], ['bath2-west', [12200, 0], [12200, 3000]],
    ['bed1-hall', [2900, 5500], [11000, 5500]], ['bath1-west', [7500, 5500], [7500, 7100]],
    ['bath1-north', [7500, 7100], [11000, 7100]],
  ]) wall('L1', key, a, b)
  const opening = (level, host, key, distance, window = false, width = 900, height = 2000, sill = 0, handing = 'left_in') => {
    const { id, a, b } = walls[`${level}:${host}`]
    const length = Math.hypot(b[0] - a[0], b[1] - a[1])
    const point = [a[0] + (b[0] - a[0]) * distance / length, a[1] + (b[1] - a[1]) * distance / length, 0]
    return run(window ? 'CreateWindow' : 'CreateDoor', { mark: window ? (width < 1000 ? 'W-BATH' : 'W1') : (width === 800 ? 'D2' : 'D1'),
      wall_id: id, location_mm: point, offset_along_wall_mm: distance, width_mm: width, height_mm: height,
      sill_height_mm: sill, level_id: level, handing,
    }, `opening:${level}:${key}`)
  }
  opening('GF', 'outer4', 'entry', 1825, false, 900)
  opening('GF', 'outer6', 'carport-entry', 725, false, 900, 2000, 0, 'left_out')
  opening('GF', 'kitchen-north', 'kitchen-door', 1500, false, 800, 2000, 0, 'left_out')
  opening('GF', 'pantry-north', 'pantry-door', 800, false, 900, 2000, 0, 'left_out')
  opening('GF', 'pantry-dining', 'pantry-dining-door', 1500)
  opening('GF', 'bed4-west', 'bed4-door', 2250)
  opening('GF', 'bath4', 'bath4-door', 800, false, 800, 2000)
  opening('GF', 'bath5-east', 'bath5-door', 1550, false, 800, 2000, 0, 'left_in')
  opening('GF', 'outer7', 'bath5-window', 1200, true, 600, 600, 1600)
  opening('GF', 'outer0', 'kitchen-window', 1500, true, 1400, 1100, 1000)
  opening('GF', 'outer0', 'dining-window', 6300, true, 1800, 1200, 900)
  opening('GF', 'outer1', 'bed4-window', 4250, true, 1700, 1200, 900)
  opening('GF', 'outer1', 'bath4-window', 750, true, 600, 600, 1600)
  opening('GF', 'outer3', 'living-window', 1800, true, 1800, 1200, 900)
  opening('L1', 'south-hall', 'bed3-door', 3400, false, 900, 2000, 0, 'left_out')
  opening('L1', 'south-hall', 'bed2-door', 5800)
  opening('L1', 'bath3-east', 'bath3-door', 2100, false, 800, 2000)
  opening('L1', 'bath2-west', 'bath2-door', 2100, false, 800, 2000)
  opening('L1', 'bed1-hall', 'bed1-door', 3400)
  opening('L1', 'bath1-west', 'bath1-door', 800, false, 800, 2000)
  for (const distance of [3200, 6200]) opening('L1', 'outer0', `bedroom-window-${distance}`, distance, true, 1800, 1200, 900)
  opening('L1', 'outer0', 'bath3-window', 750, true, 600, 600, 1600)
  opening('L1', 'outer1', 'bath2-window', 1600, true, 600, 600, 1600)
  opening('L1', 'outer1', 'lounge-window', 4200, true, 1600, 1200, 900)
  opening('L1', 'outer4', 'bed1-window', 5300, true, 2200, 1200, 900)
  opening('L1', 'outer3', 'bath1-window', 700, true, 600, 600, 1600)

  // Wall discovery supplies temporary rooms; remove them through the same public bus.
  for (const o of Object.values(model.objects).filter(o => o.object_type === 'architecture.room'))
    run('DeleteObject', { object_id: o.id }, `remove-auto-room:${o.id}`)

  const floor = (level, key, boundary, kind = 'dry', finishedOffset = 0, slope = 0, direction = 270) => {
    const type = slabTypes[kind]
    return run('CreateSlab', { mark: key, type_id: type.id, level_id: level, boundary_mm: boundary,
      elevation_offset_mm: finishedOffset - type.finish, elevation_mm: 0,
      slab_system: level === 'GF' ? 'slab_on_ground' : 'suspended', slope_ratio: slope, drain_direction_deg: direction,
      // Tile grids are an optional finish display, not room/debug geometry.
    }, `floor:${level}:${key}`)
  }
  const room = (level, key, name, boundary, kind = 'dry', offset = 0, slope = 0, direction = 270) => {
    // Floors terminate at the inside face of the exterior wall, after its
    // centreline moves outward to align with the outside column face.
    const exteriorX = new Map([[2975, 2950], [13725, 13750], [10925, 10950], [7575, 7550]])
    const exteriorY = new Map([[75, 50], [5425, 5450], [8725, 8750]])
    boundary = boundary.map(([x, y]) => [exteriorX.get(x) ?? x, exteriorY.get(y) ?? y])
    run('CreateRoom', { mark: key, name, number: key, level_id: level, boundary_mm: boundary, boundary_source: 'manual', device_ids: [] }, `room:${level}:${key}`)
    return floor(level, key, boundary, kind, offset, slope, direction)
  }
  room('GF', 'G01', 'ครัว · +0.30', rect(2975, 75, 5850, 2950), 'wet', -100)
  room('GF', 'G02', 'เตรียมอาหาร · +0.40', rect(5950, 75, 7450, 2950))
  room('GF', 'G03', 'รับประทานอาหาร · +0.40', rect(7550, 75, 10950, 3000))
  room('GF', 'G04', 'ห้องนอน 4 · +0.40', rect(11050, 1625, 13725, 4600))
  room('GF', 'G05', 'ห้องน้ำ 4 · +0.30', rect(11050, 75, 13725, 1525), 'wet', -100, 0.01, 270)
  room('GF', 'G06', 'ห้องน้ำ 5 · +0.30', rect(2975, 3050, 4300, 5425), 'wet', -100, 0.01, 180)
  room('GF', 'G07', 'โถงบันได · +0.40', [[4400, 3050], [10950, 3050], [10950, 4600], [13725, 4600], [13725, 5425], [11050, 5425], [11050, 5500], [4400, 5500]])
  room('GF', 'G08', 'ส่วนรับแขก · +0.40', rect(7575, 5500, 10925, 8725))
  room('GF', 'G09', 'ที่จอดรถ · +0.10 / ลาดออกลาน', rect(0, 5575, 7425, 8725), 'parking', -300, 0.01, 90)
  room('GF', 'G10', 'เฉลียง · +0.30 / ลาดออกสวน', rect(7500, 8875, 11000, 10200), 'outdoor', -100, 0.01, 90)

  room('L1', 'U01', 'ห้องนอน 3 · +3.80', rect(4550, 75, 7450, 2950))
  room('L1', 'U02', 'ห้องนอน 2 · +3.80', rect(7550, 75, 12150, 2950))
  room('L1', 'U03', 'ห้องน้ำ 3 · +3.70', rect(2975, 75, 4450, 2950), 'wet', -100, 0.01, 180)
  room('L1', 'U04', 'ห้องน้ำ 2 · +3.70', rect(12250, 75, 13725, 2950), 'wet', -100, 0.01, 0)
  // One concave room floor wraps the stairwell; no duplicate full plate beneath the opening.
  const upperHall = [[2975, 3050], [13725, 3050], [13725, 5425], [2975, 5425],
    [2975, 5250], [7350, 5250], [7350, 3200], [2975, 3200]]
  room('L1', 'U05', 'โถงบันได / พักผ่อน · +3.80', upperHall)
  room('L1', 'U09', 'ทางเดินข้างบันได · +3.80', rect(2975, 3200, 4450, 5250))
  room('L1', 'U06', 'ห้องนอน 1 · +3.80', [[2975, 5550], [7450, 5550], [7450, 7150], [10925, 7150], [10925, 8725], [2975, 8725]])
  room('L1', 'U07', 'ห้องน้ำ 1 · +3.70', rect(7550, 5550, 10925, 7050), 'wet', -100, 0.01, 0)
  run('CreateStair', { mark: 'ST1', level_id: 'GF', stair_type: 'u_shape', structure_type: 'rc_monolithic',
    start_point_mm: [7350, 3275, 400], rotation_deg: 180, base_offset_mm: 0, top_level_id: 'L1', top_offset_mm: 0, total_rise_mm: 3400, width_mm: 900, num_risers: 18,
    riser_height_mm: 3400 / 18, tread_depth_mm: 250, landing_depth_mm: 900, turn_direction: 'right',
    has_handrail: true, handrail_height_mm: 900 }, 'stair')

  // Two convex roof volumes accommodate the stepped footprint. The reference has no roof plan.
  for (const [key, boundary, elevation, slope, level] of [
    ['main', rect(2500, -400, 14200, 5900), 7200, 25, 'RF'],
    ['north', rect(2500, 5500, 11400, 9200), 7200, 25, 'RF'],
    ['carport', rect(-350, 5500, 2900, 9200), 3650, 3, 'L1'],
    ['porch', rect(7350, 8800, 11200, 10400), 3650, 3, 'L1'],
  ]) run('GenerateRoof', { mark: `R-${key}`, level_id: level, boundary_mm: boundary, elevation_mm: elevation,
    thickness_mm: 30, material: key === 'main' || key === 'north' ? 'roof_tile' : 'pu_metal_sheet',
    edges: boundary.map(() => ({ defines_slope: true, slope_deg: slope })) }, `roof:${key}`)
  for (const y of [5500, 8800]) {
    const id = run('CreateColumn', { mark: 'C1', type_id: columnType, location_mm: [0, y, -300],
      base_level_id: 'DATUM', base_offset_mm: -300, top_level_id: 'L1', top_offset_mm: -150 }, `carport-column:${y}`)
    run('CreateFoundation', { mark: 'F1', supported_column_id: id, center_mm: [0, y, -300], top_elevation_mm: -300, size_mm: [1000, 1000, 350] }, `carport-foundation:${y}`)
  }
  beam('L1', [0, 5500], [0, 8800], -150, true, 'canopy-west')
  for (const y of [5500, 8800]) beam('L1', [0, y], [2900, y], -150, true, `canopy-${y}`)
  for (const x of [7500, 11000]) {
    const id = run('CreateColumn', { mark: 'C1', type_id: columnType, location_mm: [x, 10200, -300],
      base_level_id: 'DATUM', base_offset_mm: -300, top_level_id: 'L1', top_offset_mm: -150 }, `porch-column:${x}`)
    run('CreateFoundation', { mark: 'F1', supported_column_id: id, center_mm: [x, 10200, -300], top_elevation_mm: -300, size_mm: [1000, 1000, 350] }, `porch-foundation:${x}`)
    beam('L1', [x, 8800], [x, 10200], -150, true, `porch-side:${x}`)
  }
  beam('L1', [7500, 10200], [11000, 10200], -150, true, 'porch-front')
  run('SetWorkingLevel', { level_id: 'GF' }, 'work:final')
  return model
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const project = createReferenceHouseDemo()
  const out = resolve(process.argv[2] ?? 'examples/constructflow-reference-house-2storey.cfproj')
  await mkdir(resolve(out, '..'), { recursive: true })
  await writeFile(out, serializeProject(project), 'utf8')
  console.log(`Wrote ${out}; ${Object.keys(project.objects).length} editable objects`)
}
