import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseXiaomiLaserPacket,
  createSimulatedLaserPacket,
  formatThaiDistanceSpoken,
  checkAsBuiltTolerance,
  validateThaiBuildingLawSetback,
  mapAsBuiltWallToModuleData,
  createAsBuiltPlanDimension,
} from '../dist/index.js'

test('Xiaomi Laser BLE Packet Parser - Structured float packet', () => {
  // Simulate 3.450 meters (3450 mm)
  const packet = createSimulatedLaserPacket(3.45, 'rear')
  const result = parseXiaomiLaserPacket(packet)

  assert.equal(result.is_valid, true)
  assert.equal(result.benchmark, 'rear')
  assert.equal(result.distance_mm, 3450)
  assert.equal(result.distance_m, 3.45)
})

test('Xiaomi Laser BLE Packet Parser - Front benchmark flag', () => {
  // Simulate 1.200 meters with front benchmark
  const packet = createSimulatedLaserPacket(1.20, 'front')
  const result = parseXiaomiLaserPacket(packet)

  assert.equal(result.is_valid, true)
  assert.equal(result.benchmark, 'front')
  assert.equal(result.distance_mm, 1200)
  assert.equal(result.distance_m, 1.20)
})

test('Xiaomi Laser BLE Packet Parser - Empty/Invalid packet handling', () => {
  const result = parseXiaomiLaserPacket(new Uint8Array([]))
  assert.equal(result.is_valid, false)
  assert.equal(result.distance_mm, 0)
})

test('Thai Distance Speech Synthesis (TTS) - Numbers formatting', () => {
  // 1.45m -> หนึ่งจุดสี่ห้าเมตร
  assert.equal(formatThaiDistanceSpoken(1.45), 'หนึ่งจุดสี่ห้าเมตร')
  // 3.00m -> สามเมตร
  assert.equal(formatThaiDistanceSpoken(3.00), 'สามเมตร')
  // 0.50m -> ศูนย์จุดห้าเมตร
  assert.equal(formatThaiDistanceSpoken(0.50), 'ศูนย์จุดห้าเมตร')
  // 12.34m -> สิบสองจุดสามสี่เมตร
  assert.equal(formatThaiDistanceSpoken(12.34), 'สิบสองจุดสามสี่เมตร')
  // 25.00m -> ยี่สิบห้าเมตร
  assert.equal(formatThaiDistanceSpoken(25.00), 'ยี่สิบห้าเมตร')
})

test('As-Built Tolerance Checker - EIT Standards (Pass <= 3mm, Warning <= 10mm, Defect > 10mm)', () => {
  // Pass case: 3450mm design, 3452mm measured (+2mm deviation)
  const passCheck = checkAsBuiltTolerance('wall-1', 'wall', 3450, 3452)
  assert.equal(passCheck.status, 'pass')
  assert.equal(passCheck.deviation_mm, 2)
  assert.equal(passCheck.is_within_standard, true)

  // Warning case: 3450mm design, 3458mm measured (+8mm deviation)
  const warnCheck = checkAsBuiltTolerance('wall-2', 'wall', 3450, 3458)
  assert.equal(warnCheck.status, 'warning')
  assert.equal(warnCheck.deviation_mm, 8)
  assert.equal(warnCheck.is_within_standard, false)

  // Defect case: 3450mm design, 3475mm measured (+25mm deviation)
  const defectCheck = checkAsBuiltTolerance('wall-3', 'wall', 3450, 3475)
  assert.equal(defectCheck.status, 'defect')
  assert.equal(defectCheck.deviation_mm, 25)
  assert.equal(defectCheck.is_within_standard, false)
})

test('Thai Building Law Setback Validation (กฎกระทรวงฉบับที่ 55)', () => {
  // Solid wall >= 500mm
  const solidLegal = validateThaiBuildingLawSetback(650, false)
  assert.equal(solidLegal.is_legal, true)
  assert.equal(solidLegal.required_distance_mm, 500)

  // Solid wall violation (< 500mm)
  const solidIllegal = validateThaiBuildingLawSetback(400, false)
  assert.equal(solidIllegal.is_legal, false)

  // Wall with windows >= 2000mm (2 storeys)
  const windowLegal = validateThaiBuildingLawSetback(2100, true, 2)
  assert.equal(windowLegal.is_legal, true)
  assert.equal(windowLegal.required_distance_mm, 2000)

  // Wall with windows illegal (< 2000mm)
  const windowIllegal = validateThaiBuildingLawSetback(1500, true, 2)
  assert.equal(windowIllegal.is_legal, false)
})

test('Renovation Phasing & As-Built Wall Mapping', () => {
  const measurement = {
    wallId: 'w-101',
    mark: 'W-EXISTING-01',
    start_point_mm: [0, 0, 0],
    end_point_mm: [4250, 0, 0],
    measured_length_mm: 4250,
    thickness_mm: 100,
    height_mm: 2800,
    level_id: 'level-1f',
    phase: 'existing',
  }

  const moduleData = mapAsBuiltWallToModuleData(measurement)
  assert.equal(moduleData.mark, 'W-EXISTING-01')
  assert.equal(moduleData.length_mm, 4250)
  assert.equal(moduleData.material, 'brick_masonry')

  const dimension = createAsBuiltPlanDimension(measurement)
  assert.equal(dimension.level_id, 'level-1f')
  assert.equal(dimension.created_phase, 'existing')
  assert.deepEqual(dimension.start_mm, [0, 0])
  assert.deepEqual(dimension.end_mm, [4250, 0])
})

test('Photo Surface Area Calculator - Gross and Net Area with Deductions', async () => {
  const { createNewPhotoAreaBox, recalculateAreaBox } = await import('../dist/index.js')
  // Wall 4.0m width x 2.8m height -> Gross 11.20 m²
  const areaBox = createNewPhotoAreaBox([0.1, 0.1, 0.8, 0.8], 4000, 2800, 'ผนังทาสีห้องรับแขก', 'paint')
  assert.equal(areaBox.width_mm, 4000)
  assert.equal(areaBox.height_mm, 2800)
  assert.equal(areaBox.area_sqm, 11.2)
  assert.equal(areaBox.net_area_sqm, 11.2)

  // Deduct 1 door (0.90m x 2.00m = 1.80 m²) and 1 window (1.20m x 1.00m = 1.20 m²) -> Total 3.0 m²
  areaBox.deductions_sqm = 3.0
  const recalculated = recalculateAreaBox(areaBox)
  assert.equal(recalculated.area_sqm, 11.2)
  assert.equal(recalculated.deductions_sqm, 3.0)
  assert.equal(recalculated.net_area_sqm, 8.2) // 11.2 - 3.0 = 8.2 m²
})

test('Continuous Multi-Segment Dimension Chain Model', async () => {
  const { createNewPhotoDimensionLine } = await import('../dist/index.js')
  const line = createNewPhotoDimensionLine([0.1, 0.5], [0.9, 0.5], 4500, 'ผนังยาวรวม')
  line.sub_segments = [
    { id: 'sub-1', ratio: 0.25, distance_mm: 1125, distance_m: 1.125, label: 'เสาถึงปลั๊กไฟ' },
    { id: 'sub-2', ratio: 0.60, distance_mm: 1575, distance_m: 1.575, label: 'ปลั๊กถึงประตู' },
  ]

  assert.equal(line.distance_mm, 4500)
  assert.equal(line.sub_segments.length, 2)
  assert.equal(line.sub_segments[0].distance_m, 1.125)
  assert.equal(line.sub_segments[1].distance_m, 1.575)
})

test('Tile Calculation Engine - Exact Pieces, Waste Allowance, Boxes, and Mortar/Grout', async () => {
  const { calculateTileRequirement, STANDARD_TILE_PRESETS } = await import('../dist/index.js')
  assert.ok(STANDARD_TILE_PRESETS.length >= 5)

  // 10.0 m² area with 60x60 cm tiles (0.36 m² per tile, 4 tiles/box, 10% waste)
  const result = calculateTileRequirement(10.0, {
    tile_width_cm: 60,
    tile_length_cm: 60,
    waste_percent: 10,
    pieces_per_box: 4,
  })

  assert.equal(result.tile_area_sqm, 0.36)
  assert.equal(result.base_pieces, 28) // ceil(10 / 0.36) = 28
  assert.equal(result.waste_pieces, 3) // ceil(28 * 0.1) = 3
  assert.equal(result.total_pieces, 31) // 28 + 3 = 31
  assert.equal(result.total_boxes, 8) // ceil(31 / 4) = 8
  assert.equal(result.mortar_bags_20kg, 3) // ceil(10 / 4) = 3 bags
  assert.equal(result.grout_bags_1kg, 3) // ceil(10 / 3.5) = 3 bags
})


