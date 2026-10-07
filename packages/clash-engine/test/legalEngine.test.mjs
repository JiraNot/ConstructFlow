import test from 'node:test'
import assert from 'node:assert/strict'
import {
  convertSqMetersToThaiLand,
  formatThaiLandArea,
  calculateParcelFromPegs,
  evaluateThaiBuildingCompliance,
  evaluateBmaZoning,
  BMA_ZONING_STANDARDS,
} from '../dist/index.js'

test('F03: convertSqMetersToThaiLand accurately converts sqm to Rai, Ngan, and Sq.Wa', () => {
  // 1 Rai = 1600 sqm
  const oneRai = convertSqMetersToThaiLand(1600)
  assert.equal(oneRai.rai, 1)
  assert.equal(oneRai.ngan, 0)
  assert.equal(oneRai.sqWa, 0)
  assert.equal(oneRai.formatted, '1 ไร่ 0 งาน 0.0 ตร.ว.')

  // 1 Ngan = 400 sqm
  const oneNgan = convertSqMetersToThaiLand(400)
  assert.equal(oneNgan.rai, 0)
  assert.equal(oneNgan.ngan, 1)
  assert.equal(oneNgan.sqWa, 0)

  // 1 Sq.Wa = 4 sqm
  const oneSqWa = convertSqMetersToThaiLand(4)
  assert.equal(oneSqWa.rai, 0)
  assert.equal(oneSqWa.ngan, 0)
  assert.equal(oneSqWa.sqWa, 1)

  // Complex: 2,650 sqm = 1 Rai (1600) + 2 Ngan (800) + 62.5 Sq.Wa (250)
  const complex = convertSqMetersToThaiLand(2650)
  assert.equal(complex.rai, 1)
  assert.equal(complex.ngan, 2)
  assert.equal(complex.sqWa, 62.5)
  assert.equal(formatThaiLandArea(2650), '1 ไร่ 2 งาน 62.5 ตร.ว.')
})

test('F03: calculateParcelFromPegs calculates area, perimeter and closure from coordinates', () => {
  // 20m x 20m square = 400 sqm (1 Ngan)
  const result = calculateParcelFromPegs({
    deed_number: '12345',
    pegs: [
      { name: '1A', x_m: 0, y_m: 0 },
      { name: '1B', x_m: 20, y_m: 0 },
      { name: '1C', x_m: 20, y_m: 20 },
      { name: '1D', x_m: 0, y_m: 20 },
    ],
  })

  assert.equal(result.area_sq_m, 400)
  assert.equal(result.perimeter_m, 60)
  assert.equal(result.land_area.rai, 0)
  assert.equal(result.land_area.ngan, 1)
  assert.equal(result.land_area.sqWa, 0)
})

test('F03: evaluateThaiBuildingCompliance checks setbacks under กฎกระทรวง ฉบับที่ 55 (พ.ศ. 2543)', () => {
  // Scenario 1: House height 6.0m (<= 9m)
  // Wall 1: Has openings, setback 2.50m -> PASS (>= 2.00m)
  // Wall 2: Has openings, setback 1.50m -> FAIL (< 2.00m)
  // Wall 3: Blind wall, setback 0.80m -> PASS (>= 0.50m)
  // Wall 4: Blind wall on boundary (0.00m) without consent -> FAIL
  // Wall 5: Blind wall on boundary (0.00m) WITH consent -> PASS
  const result = evaluateThaiBuildingCompliance({
    building_height_m: 6.0,
    road_width_m: 5.0, // road < 6m
    walls: [
      {
        wall_id: 'W1',
        wall_name: 'Front Wall with Windows',
        has_openings: true,
        distance_to_boundary_m: 2.5,
        distance_to_road_center_m: 3.5, // >= 3.0m PASS
      },
      {
        wall_id: 'W2',
        wall_name: 'Side Wall with Balcony',
        has_openings: true,
        distance_to_boundary_m: 1.5, // < 2.0m FAIL
      },
      {
        wall_id: 'W3',
        wall_name: 'Rear Blind Wall',
        has_openings: false,
        distance_to_boundary_m: 0.8, // >= 0.50m PASS
      },
      {
        wall_id: 'W4',
        wall_name: 'Side Blind Wall 0m No Consent',
        has_openings: false,
        distance_to_boundary_m: 0.0,
        neighbor_consent: false, // FAIL
      },
      {
        wall_id: 'W5',
        wall_name: 'Side Blind Wall 0m With Consent',
        has_openings: false,
        distance_to_boundary_m: 0.0,
        neighbor_consent: true, // PASS
      },
    ],
  })

  assert.equal(result.overall_status, 'fail')
  const w1Finding = result.findings.find((f) => f.title.includes('W1'))
  assert.equal(w1Finding?.status, 'pass')

  const w2Finding = result.findings.find((f) => f.title.includes('W2'))
  assert.equal(w2Finding?.status, 'fail')
  assert.ok(w2Finding?.citation.includes('ข้อ 50 วรรคหนึ่ง'))

  const w3Finding = result.findings.find((f) => f.title.includes('W3'))
  assert.equal(w3Finding?.status, 'pass')

  const w4Finding = result.findings.find((f) => f.title.includes('W4'))
  assert.equal(w4Finding?.status, 'fail')

  const w5Finding = result.findings.find((f) => f.title.includes('W5'))
  assert.equal(w5Finding?.status, 'pass')
  assert.ok(w5Finding?.actual.toString().includes('มีหนังสือยินยอม'))
})

test('F03: evaluateBmaZoning evaluates FAR, OSR and permeable green area for BMA zones', () => {
  // Land: 400 sqm (1 Ngan)
  // Footprint: 160 sqm
  // Total Floor: 320 sqm (2 storeys)
  // Open Space = 400 - 160 = 240 sqm
  // Actual FAR = 320 / 400 = 0.80 (Allowed Y2 <= 1.50 -> PASS)
  // Actual OSR = (240 / 320) * 100% = 75.0% (Allowed Y2 >= 30% -> PASS)
  // Permeable surface: 140 sqm out of 240 sqm = 58.3% (Required >= 50% -> PASS)
  const result = evaluateBmaZoning({
    zone_code: 'Y2',
    total_land_area_sq_m: 400,
    building_footprint_area_sq_m: 160,
    total_floor_area_sq_m: 320,
    permeable_surface_area_sq_m: 140,
  })

  assert.equal(result.overall_status, 'pass')
  assert.equal(result.actual_far, 0.8)
  assert.equal(result.far_status, 'pass')
  assert.equal(result.actual_osr_percent, 75.0)
  assert.equal(result.osr_status, 'pass')
  assert.equal(result.permeable_status, 'pass')
})
