import test from 'node:test'
import assert from 'node:assert/strict'
import {
  convertSqMetersToThaiLand,
  formatThaiLandArea,
  calculateParcelFromPegs,
  evaluateThaiBuildingCompliance,
  evaluateBmaZoning,
  BMA_ZONING_STANDARDS,
  evaluateSiteGradeAndDrainage,
  evaluateProjectSiteAndLegalCompliance,
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

test('F03: evaluateRoomVentilationCompliance checks MR55 Rules 40 & 41 for rooms and openings', async () => {
  const { evaluateRoomVentilationCompliance } = await import('../dist/index.js')

  const dummyProject = {
    schema_version: 1,
    id: 'proj-1',
    name: 'Ventilation Test Project',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    levels: [{ id: 'GF', name: 'Ground Floor', elevation_mm: 0 }],
    types: [
      {
        id: 'win-sliding',
        name: 'Sliding Window',
        object_type: 'door_window.window',
        parameters: { opening_operation: 'sliding', glazing_material: 'clear_glass' },
      },
      {
        id: 'win-casement',
        name: 'Casement Window',
        object_type: 'door_window.window',
        parameters: { opening_operation: 'hinged', glazing_material: 'clear_glass' },
      },
      {
        id: 'door-solid',
        name: 'Solid Door',
        object_type: 'door_window.door',
        parameters: { opening_operation: 'hinged', glazing_material: 'none' },
      },
    ],
    objects: {
      // Room 1: Bedroom 1 (Habitable, 4m x 4m = 16 sqm)
      'room-1': {
        id: 'room-1',
        object_type: 'architecture.room',
        owner_module: 'constructflow.architecture',
        schema_version: 1,
        created_phase: 'new_construction',
        removed_phase: null,
        level_refs: [{ level_id: 'GF' }],
        host_refs: [],
        connector_refs: [],
        status: 'active',
        module_data: {
          number: '101',
          name: 'Bedroom 1',
          level_id: 'GF',
          area_mm2: 16_000_000,
          boundary_mm: [[0, 0], [4000, 0], [4000, 4000], [0, 4000]],
        },
        created_at: '',
        updated_at: '',
      },
      // Wall 1: Exterior south wall at Y = -50
      'wall-1': {
        id: 'wall-1',
        object_type: 'architecture.wall',
        owner_module: 'constructflow.architecture',
        schema_version: 1,
        created_phase: 'new_construction',
        removed_phase: null,
        level_refs: [{ level_id: 'GF' }],
        host_refs: [],
        connector_refs: [],
        status: 'active',
        module_data: {
          start_point_mm: [-100, -50, 0],
          end_point_mm: [4100, -50, 0],
          thickness_mm: 100,
          level_id: 'GF',
          plaster_outside_material: 'exterior_paint',
        },
        created_at: '',
        updated_at: '',
      },
      // Window 1 on Wall 1: Casement window 1.6m x 1.2m = 1.92 sqm
      // Daylight = 1.92 sqm (12.0% of 16 sqm -> >= 10% PASS)
      // Vent (hinged 100%) = 1.92 sqm (12.0% -> >= 10% PASS)
      'win-1': {
        id: 'win-1',
        object_type: 'door_window.window',
        owner_module: 'constructflow.architecture',
        schema_version: 1,
        created_phase: 'new_construction',
        removed_phase: null,
        level_refs: [{ level_id: 'GF' }],
        host_refs: ['wall-1'],
        connector_refs: [],
        status: 'active',
        module_data: {
          mark: 'W1',
          wall_id: 'wall-1',
          type_id: 'win-casement',
          location_mm: [2000, -50, 0],
          width_mm: 1600,
          height_mm: 1200,
          level_id: 'GF',
        },
        created_at: '',
        updated_at: '',
      },
      // Room 2: Bath (Bathroom, 2m x 2m = 4 sqm)
      'room-2': {
        id: 'room-2',
        object_type: 'architecture.room',
        owner_module: 'constructflow.architecture',
        schema_version: 1,
        created_phase: 'new_construction',
        removed_phase: null,
        level_refs: [{ level_id: 'GF' }],
        host_refs: [],
        connector_refs: [],
        status: 'active',
        module_data: {
          number: '102',
          name: 'Guest Bath',
          level_id: 'GF',
          area_mm2: 4_000_000,
          boundary_mm: [[4000, 0], [6000, 0], [6000, 2000], [4000, 2000]],
        },
        created_at: '',
        updated_at: '',
      },
      // Wall 2: Exterior south wall for bath
      'wall-2': {
        id: 'wall-2',
        object_type: 'architecture.wall',
        owner_module: 'constructflow.architecture',
        schema_version: 1,
        created_phase: 'new_construction',
        removed_phase: null,
        level_refs: [{ level_id: 'GF' }],
        host_refs: [],
        connector_refs: [],
        status: 'active',
        module_data: {
          start_point_mm: [3900, -50, 0],
          end_point_mm: [6100, -50, 0],
          thickness_mm: 100,
          level_id: 'GF',
          plaster_outside_material: 'exterior_paint',
        },
        created_at: '',
        updated_at: '',
      },
      // Window 2 for Bath: Awning window 0.8m x 0.6m = 0.48 sqm
      // Awning (100% vent) = 0.48 sqm >= 0.20 sqm min -> PASS
      'win-2': {
        id: 'win-2',
        object_type: 'door_window.window',
        owner_module: 'constructflow.architecture',
        schema_version: 1,
        created_phase: 'new_construction',
        removed_phase: null,
        level_refs: [{ level_id: 'GF' }],
        host_refs: ['wall-2'],
        connector_refs: [],
        status: 'active',
        module_data: {
          mark: 'W2',
          wall_id: 'wall-2',
          location_mm: [5000, -50, 0],
          width_mm: 800,
          height_mm: 600,
          level_id: 'GF',
        },
        created_at: '',
        updated_at: '',
      },
    },
  }

  const result = evaluateRoomVentilationCompliance(dummyProject)
  assert.equal(result.total_rooms, 2)
  assert.equal(result.passed_rooms, 2)
  assert.equal(result.failed_rooms, 0)
  assert.equal(result.overall_status, 'pass')

  const r1 = result.rooms.find((r) => r.room_id === 'room-1')
  assert.ok(r1)
  assert.equal(r1.room_type, 'habitable')
  assert.equal(r1.floor_area_sq_m, 16)
  assert.equal(r1.exterior_openings.length, 1)
  assert.equal(r1.daylight_status, 'pass')
  assert.equal(r1.ventilation_status, 'pass')
  assert.equal(r1.overall_status, 'pass')

  const r2 = result.rooms.find((r) => r.room_id === 'room-2')
  assert.ok(r2)
  assert.equal(r2.room_type, 'bathroom')
  assert.equal(r2.floor_area_sq_m, 4)
  assert.equal(r2.exterior_openings.length, 1)
  assert.equal(r2.ventilation_status, 'pass')
  assert.ok(r2.total_ventilation_area_sq_m >= 0.2)
})

test('Pillar 1: Roof Eaves Setback (ข้อ 50) and Rain Gutters', () => {
  // Scenario 1: Roof 1 eaves setback 0.80m (>= 0.50m) with gutter -> PASS
  // Scenario 2: Roof 2 eaves setback 0.30m (< 0.50m) without consent -> FAIL
  // Scenario 3: Roof 3 eaves setback 0.20m (< 0.50m) with neighbor consent -> PASS
  // Scenario 4: Roof 4 has no gutter -> WARNING
  const result = evaluateThaiBuildingCompliance({
    building_height_m: 5.0,
    walls: [
      { wall_id: 'W1', has_openings: false, distance_to_boundary_m: 2.0 },
    ],
    eaves: [
      {
        roof_id: 'R1',
        roof_name: 'Main Gable Roof',
        distance_to_boundary_m: 0.8,
        has_gutter: true,
      },
      {
        roof_id: 'R2',
        roof_name: 'Kitchen Eaves Violation',
        distance_to_boundary_m: 0.3,
        neighbor_consent: false,
        has_gutter: true,
      },
      {
        roof_id: 'R3',
        roof_name: 'Carport Eaves with Consent',
        distance_to_boundary_m: 0.2,
        neighbor_consent: true,
        has_gutter: true,
      },
      {
        roof_id: 'R4',
        roof_name: 'Terrace Eaves Missing Gutter',
        distance_to_boundary_m: 1.0,
        has_gutter: false,
      },
    ],
  })

  assert.equal(result.overall_status, 'fail')

  const r1Finding = result.findings.find((f) => f.title.includes('R1'))
  assert.equal(r1Finding?.status, 'pass')
  assert.equal(r1Finding?.rule_id, 'TH-MR55-RULE-50-EAVES')

  const r2Finding = result.findings.find((f) => f.title.includes('R2'))
  assert.equal(r2Finding?.status, 'fail')
  assert.equal(r2Finding?.rule_id, 'TH-MR55-RULE-50-EAVES-VIOLATION')

  const r3Finding = result.findings.find((f) => f.title.includes('R3'))
  assert.equal(r3Finding?.status, 'pass')
  assert.equal(r3Finding?.rule_id, 'TH-MR55-RULE-50-EAVES-CONSENT')

  const gutterFinding = result.findings.find((f) => f.rule_id === 'TH-MR55-RULE-50-GUTTER')
  assert.ok(gutterFinding)
  assert.equal(gutterFinding?.status, 'warning')
})

test('Pillar 1: Maximum Building Height from Road Width (ข้อ 44)', () => {
  // Road width: 6.00m, Front wall setback: 2.00m
  // Distance to opposite road edge = 2.00 + 6.00 = 8.00m
  // Max allowed building height = 2 * 8.00 = 16.00m
  // Case A: Height 12.00m <= 16.00m -> PASS
  const passResult = evaluateThaiBuildingCompliance({
    building_height_m: 12.0,
    road_width_m: 6.0,
    front_road_setback_m: 2.0,
    walls: [{ wall_id: 'W1', has_openings: true, distance_to_boundary_m: 2.5 }],
  })
  const passHeightFinding = passResult.findings.find((f) => f.rule_id === 'TH-MR55-RULE-44-HEIGHT')
  assert.ok(passHeightFinding)
  assert.equal(passHeightFinding?.status, 'pass')

  // Case B: Height 18.00m > 16.00m -> FAIL
  const failResult = evaluateThaiBuildingCompliance({
    building_height_m: 18.0,
    road_width_m: 6.0,
    front_road_setback_m: 2.0,
    walls: [{ wall_id: 'W1', has_openings: true, distance_to_boundary_m: 2.5 }],
  })
  const failHeightFinding = failResult.findings.find((f) => f.rule_id === 'TH-MR55-RULE-44-HEIGHT')
  assert.ok(failHeightFinding)
  assert.equal(failHeightFinding?.status, 'fail')
})

test('Pillar 1: Waterway Setbacks (ข้อ 42)', () => {
  // Small canal (< 10m): requires >= 3.00m
  // Large canal (>= 10m): requires >= 6.00m
  // Large waterbody (lake/sea): requires >= 12.00m
  const result = evaluateThaiBuildingCompliance({
    building_height_m: 6.0,
    walls: [{ wall_id: 'W1', has_openings: false, distance_to_boundary_m: 2.0 }],
    waterways: [
      {
        waterway_name: 'คลองสาธารณะขนาดเล็ก',
        waterway_type: 'small_canal',
        waterway_width_m: 5.0,
        distance_to_waterway_boundary_m: 3.5, // >= 3.0m -> PASS
      },
      {
        waterway_name: 'คลองเปรมประชากร',
        waterway_type: 'large_canal',
        waterway_width_m: 15.0,
        distance_to_waterway_boundary_m: 4.5, // < 6.0m -> FAIL
      },
      {
        waterway_name: 'บึงสาธารณะขนาดใหญ่',
        waterway_type: 'large_waterbody',
        distance_to_waterway_boundary_m: 13.0, // >= 12.0m -> PASS
      },
    ],
  })

  assert.equal(result.overall_status, 'fail')
  const wwFindings = result.findings.filter((f) => f.rule_id === 'TH-MR55-RULE-42-WATERWAY')
  assert.equal(wwFindings.length, 3)
  assert.equal(wwFindings[0].status, 'pass')
  assert.equal(wwFindings[1].status, 'fail')
  assert.equal(wwFindings[2].status, 'pass')
})

test('Pillar 1: evaluateSiteGradeAndDrainage (Soil Excavation & Land Fill Act & BMA FFL)', () => {
  // Case 1: Land fill 1.2m on 800 sqm with drainage -> PASS
  const r1 = evaluateSiteGradeAndDrainage({
    land_area_sq_m: 800,
    fill_height_m: 1.2,
    has_drainage_system: true,
  })
  assert.equal(r1.overall_status, 'pass')
  assert.equal(r1.findings[0].rule_id, 'TH-SOIL-ACT-SEC26-DRAINAGE')
  assert.equal(r1.findings[0].status, 'pass')

  // Case 2: Land fill 2.0m (> 1.50m) without retaining wall -> FAIL
  const r2 = evaluateSiteGradeAndDrainage({
    land_area_sq_m: 800,
    fill_height_m: 2.0,
    has_drainage_system: true,
    has_retaining_wall: false,
  })
  assert.equal(r2.overall_status, 'fail')
  const wallFinding = r2.findings.find((f) => f.rule_id === 'TH-SOIL-ACT-SEC26-RETAINING-WALL')
  assert.ok(wallFinding)
  assert.equal(wallFinding?.status, 'fail')

  // Case 3: Ground Floor FFL vs Road Crown (+0.60m vs 0.0m -> >= +0.50m PASS)
  const r3 = evaluateSiteGradeAndDrainage({
    land_area_sq_m: 400,
    fill_height_m: 0.3,
    has_drainage_system: true,
    finished_floor_elevation_m: 0.60,
    road_crown_elevation_m: 0.00,
  })
  assert.equal(r3.overall_status, 'pass')
  const fflFinding = r3.findings.find((f) => f.rule_id === 'BMA-BUILDING-CODE-FFL')
  assert.ok(fflFinding)
  assert.equal(fflFinding?.status, 'pass')

  // Case 4: Ground Floor FFL below road crown (-0.10m -> FAIL)
  const r4 = evaluateSiteGradeAndDrainage({
    land_area_sq_m: 400,
    fill_height_m: 0,
    has_drainage_system: true,
    finished_floor_elevation_m: -0.10,
    road_crown_elevation_m: 0.00,
  })
  assert.equal(r4.overall_status, 'fail')
  const fflFailFinding = r4.findings.find((f) => f.rule_id === 'BMA-BUILDING-CODE-FFL')
  assert.ok(fflFailFinding)
  assert.equal(fflFailFinding?.status, 'fail')
})

test('Pillar 1: evaluateProjectSiteAndLegalCompliance executes all-in-one legal audit', () => {
  const dummyProject = {
    schema_version: 1,
    id: 'proj-legal-1',
    name: 'All-in-One Legal Test Project',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    levels: [
      { id: 'GF', name: 'Ground Floor', elevation_mm: 0 },
      { id: '2F', name: 'Second Floor', elevation_mm: 3200 },
    ],
    types: [
      {
        id: 'win-sliding',
        name: 'Sliding Window',
        object_type: 'door_window.window',
        parameters: { opening_operation: 'sliding', glazing_material: 'clear_glass' },
      },
    ],
    objects: {
      'wall-1': {
        id: 'wall-1',
        object_type: 'architecture.wall',
        owner_module: 'constructflow.architecture',
        schema_version: 1,
        created_phase: 'new_construction',
        removed_phase: null,
        level_refs: [{ level_id: 'GF' }],
        host_refs: [],
        connector_refs: [],
        status: 'active',
        module_data: {
          name: 'Front Facade Wall',
          start_point_mm: [0, 0],
          end_point_mm: [6000, 0],
          distance_to_boundary_m: 2.5,
          distance_to_road_edge_m: 3.0,
        },
        created_at: '',
        updated_at: '',
      },
      'roof-1': {
        id: 'roof-1',
        object_type: 'roof.hip',
        owner_module: 'constructflow.roof',
        schema_version: 1,
        created_phase: 'new_construction',
        removed_phase: null,
        level_refs: [{ level_id: '2F' }],
        host_refs: [],
        connector_refs: [],
        status: 'active',
        module_data: {
          name: 'Main Hip Roof',
          eaves_overhang_mm: 1000,
          distance_to_boundary_m: 1.5, // >= 0.50m PASS
          has_gutter: true,
        },
        created_at: '',
        updated_at: '',
      },
      'room-1': {
        id: 'room-1',
        object_type: 'architecture.room',
        owner_module: 'constructflow.architecture',
        schema_version: 1,
        created_phase: 'new_construction',
        removed_phase: null,
        level_refs: [{ level_id: 'GF' }],
        host_refs: [],
        connector_refs: [],
        status: 'active',
        module_data: {
          number: '101',
          name: 'Living Room',
          level_id: 'GF',
          area_mm2: 20_000_000,
          boundary_mm: [[0, 0], [6000, 0], [6000, 3500], [0, 3500]],
        },
        created_at: '',
        updated_at: '',
      },
      'win-1': {
        id: 'win-1',
        object_type: 'door_window.window',
        owner_module: 'constructflow.door_window',
        schema_version: 1,
        created_phase: 'new_construction',
        removed_phase: null,
        level_refs: [{ level_id: 'GF' }],
        host_refs: ['wall-1'],
        connector_refs: [],
        status: 'active',
        module_data: {
          mark: 'W1',
          wall_id: 'wall-1',
          location_mm: [3000, 0, 0],
          width_mm: 2400,
          height_mm: 2000,
          type_id: 'win-sliding',
          level_id: 'GF',
        },
        created_at: '',
        updated_at: '',
      },
    },
  }

  const report = evaluateProjectSiteAndLegalCompliance(dummyProject, {
    road_width_m: 6.0,
    land_fill_inputs: {
      land_area_sq_m: 300,
      fill_height_m: 0.5,
      has_drainage_system: true,
      finished_floor_elevation_m: 0.60,
      road_crown_elevation_m: 0.00,
    },
  })

  assert.equal(report.overall_status, 'pass')
  assert.ok(report.building_compliance)
  assert.ok(report.ventilation_compliance)
  assert.ok(report.site_grade_compliance)
  assert.ok(report.all_findings.length >= 4)
})

