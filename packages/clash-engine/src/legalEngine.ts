// ConstructFlow Legal & Site Compliance Engine (F03)
// Implements Title Deed parcel processing, Thai Land measurement units,
// Thai Building Code (กฎกระทรวงฉบับที่ 55 พ.ศ. 2543), and BMA Municipal Regulations (ข้อบัญญัติ กทม.).

import {
  type ProjectDocument,
  type SmartObject,
  resolveCatalogType,
} from '@constructflow/project-model'

export interface SurveyPeg {
  name: string // e.g. "1ก 1234"
  x_m?: number
  y_m?: number
  azimuth_deg?: number // bearing in degrees from North (0 - 360)
  distance_m?: number
}

export interface TitleDeedParcel {
  deed_number?: string
  subdistrict?: string // แขวง/ตำบล
  district?: string // เขต/อำเภอ
  province?: string // จังหวัด
  pegs: SurveyPeg[]
  coordinates_m?: [number, number][]
  road_frontage_width_m?: number
  road_width_m?: number
}

export interface ThaiLandArea {
  rai: number
  ngan: number
  sqWa: number
  totalSqMeters: number
  formatted: string // e.g. "1 ไร่ 2 งาน 35.5 ตร.ว."
}

export interface ParcelCalculationResult {
  area_sq_m: number
  perimeter_m: number
  closure_error_m: number
  coordinates_m: [number, number][]
  land_area: ThaiLandArea
}

/**
 * Converts square meters into Thai Land Units: ไร่, งาน, ตารางวา.
 * 1 ไร่ = 4 งาน = 400 ตร.ว. = 1,600 ตร.ม.
 * 1 งาน = 100 ตร.ว. = 400 ตร.ม.
 * 1 ตร.ว. = 4 ตร.ม.
 */
export function convertSqMetersToThaiLand(sqMeters: number): ThaiLandArea {
  const total = Math.max(0, sqMeters)
  const totalSqWa = total / 4.0

  const rai = Math.floor(totalSqWa / 400)
  const remainderAfterRai = totalSqWa % 400

  const ngan = Math.floor(remainderAfterRai / 100)
  const sqWa = Math.round((remainderAfterRai % 100) * 10) / 10

  const formatted = `${rai} ไร่ ${ngan} งาน ${sqWa.toFixed(1)} ตร.ว.`

  return {
    rai,
    ngan,
    sqWa,
    totalSqMeters: total,
    formatted,
  }
}

/**
 * Formats a square meter value into Thai Land string.
 */
export function formatThaiLandArea(sqMeters: number): string {
  return convertSqMetersToThaiLand(sqMeters).formatted
}

/**
 * Calculates parcel polygon geometry, area (Shoelace formula), perimeter,
 * closure error and Thai land units from survey pegs.
 */
export function calculateParcelFromPegs(parcel: TitleDeedParcel): ParcelCalculationResult {
  let coords: [number, number][] = []

  if (parcel.coordinates_m && parcel.coordinates_m.length >= 3) {
    coords = parcel.coordinates_m
  } else if (parcel.pegs && parcel.pegs.length >= 3) {
    // If pegs have direct x_m, y_m
    const allHaveCoords = parcel.pegs.every((p) => p.x_m !== undefined && p.y_m !== undefined)
    if (allHaveCoords) {
      coords = parcel.pegs.map((p) => [p.x_m!, p.y_m!])
    } else {
      // Traverse from bearings and distances
      let currX = 0
      let currY = 0
      coords.push([currX, currY])
      for (const peg of parcel.pegs) {
        if (peg.azimuth_deg !== undefined && peg.distance_m !== undefined) {
          const rad = (peg.azimuth_deg * Math.PI) / 180.0
          // Azimuth: 0 = North (+Y), 90 = East (+X)
          currX += peg.distance_m * Math.sin(rad)
          currY += peg.distance_m * Math.cos(rad)
          coords.push([currX, currY])
        }
      }
    }
  }

  if (coords.length < 3) {
    return {
      area_sq_m: 0,
      perimeter_m: 0,
      closure_error_m: 0,
      coordinates_m: coords,
      land_area: convertSqMetersToThaiLand(0),
    }
  }

  // Calculate closure error (distance between first and last coordinate)
  const first = coords[0]
  const last = coords[coords.length - 1]
  const closure_error_m = Math.sqrt(Math.pow(last[0] - first[0], 2) + Math.pow(last[1] - first[1], 2))

  // Perimeter
  let perimeter = 0
  for (let i = 0; i < coords.length - 1; i++) {
    const dx = coords[i + 1][0] - coords[i][0]
    const dy = coords[i + 1][1] - coords[i][1]
    perimeter += Math.sqrt(dx * dx + dy * dy)
  }

  // Shoelace formula for area
  let areaSum = 0
  for (let i = 0; i < coords.length; i++) {
    const j = (i + 1) % coords.length
    areaSum += coords[i][0] * coords[j][1]
    areaSum -= coords[j][0] * coords[i][1]
  }
  const area_sq_m = Math.abs(areaSum) / 2.0

  return {
    area_sq_m,
    perimeter_m: perimeter,
    closure_error_m,
    coordinates_m: coords,
    land_area: convertSqMetersToThaiLand(area_sq_m),
  }
}

// -------------------------------------------------------------
// Thai Building Code (กฎกระทรวง 55) & BMA Regulations Compliance
// -------------------------------------------------------------

export interface WallSetbackEvaluationItem {
  wall_id: string
  wall_name?: string
  has_openings: boolean
  distance_to_boundary_m: number
  neighbor_consent?: boolean
  distance_to_road_center_m?: number
  distance_to_road_edge_m?: number
}

export interface ThaiComplianceInputs {
  building_height_m: number
  road_width_m?: number
  walls: WallSetbackEvaluationItem[]
}

export type ComplianceStatus = 'pass' | 'fail' | 'warning' | 'insufficient_data'

export interface ComplianceFinding {
  rule_id: string
  title: string
  title_th: string
  status: ComplianceStatus
  actual: string | number
  required: string | number
  citation: string
  description_th: string
}

export interface ThaiComplianceResult {
  overall_status: ComplianceStatus
  findings: ComplianceFinding[]
}

/**
 * Evaluates building setbacks according to Thai Building Code (กฎกระทรวงฉบับที่ 55 พ.ศ. 2543 ข้อ 41, 42, 50).
 */
export function evaluateThaiBuildingCompliance(inputs: ThaiComplianceInputs): ThaiComplianceResult {
  const findings: ComplianceFinding[] = []
  const { building_height_m, road_width_m, walls } = inputs

  if (!walls || walls.length === 0) {
    findings.push({
      rule_id: 'TH-MR55-GENERAL',
      title: 'Missing Building Walls Data',
      title_th: 'ไม่พบข้อมูลแนวผนังอาคาร',
      status: 'insufficient_data',
      actual: 0,
      required: '>= 1 wall',
      citation: 'กฎกระทรวง ฉบับที่ 55 (พ.ศ. 2543)',
      description_th: 'จำเป็นต้องระบุแนวผนังอาคารเพื่อตรวจระยะร่น',
    })
    return { overall_status: 'insufficient_data', findings }
  }

  // Setback requirements by height
  const isUnder9m = building_height_m <= 9.0
  const isUnder23m = building_height_m <= 23.0
  const requiredOpeningSetback = isUnder9m ? 2.0 : isUnder23m ? 3.0 : 6.0
  const requiredBlindSetback = 0.50

  for (const wall of walls) {
    const wallLabel = wall.wall_name ? `${wall.wall_name} [${wall.wall_id}]` : wall.wall_id

    if (wall.has_openings) {
      // ผนังมีช่องเปิด (ประตู, หน้าต่าง, ช่องแสง, ระเบียง)
      const pass = wall.distance_to_boundary_m >= requiredOpeningSetback
      findings.push({
        rule_id: 'TH-MR55-RULE-50-OPENING',
        title: `Wall with Openings Setback (${wallLabel})`,
        title_th: `ระยะร่นผนังมีช่องเปิด (${wallLabel})`,
        status: pass ? 'pass' : 'fail',
        actual: `${wall.distance_to_boundary_m.toFixed(2)} ม.`,
        required: `>= ${requiredOpeningSetback.toFixed(2)} ม.`,
        citation: isUnder9m
          ? 'กฎกระทรวง ฉบับที่ 55 (พ.ศ. 2543) ข้อ 50 วรรคหนึ่ง'
          : 'กฎกระทรวง ฉบับที่ 55 (พ.ศ. 2543) ข้อ 50 วรรคสอง',
        description_th: `อาคารสูง ${building_height_m.toFixed(2)} ม. ผนังที่มีช่องเปิดต้องร่นห่างเขตที่ดินไม่น้อยกว่า ${requiredOpeningSetback.toFixed(2)} ม. (วัดได้ ${wall.distance_to_boundary_m.toFixed(2)} ม.)`,
      })
    } else {
      // ผนังทึบ (Blind Wall)
      if (wall.distance_to_boundary_m >= requiredBlindSetback) {
        findings.push({
          rule_id: 'TH-MR55-RULE-50-BLIND',
          title: `Blind Wall Setback (${wallLabel})`,
          title_th: `ระยะร่นผนังทึบ (${wallLabel})`,
          status: 'pass',
          actual: `${wall.distance_to_boundary_m.toFixed(2)} ม.`,
          required: `>= ${requiredBlindSetback.toFixed(2)} ม.`,
          citation: 'กฎกระทรวง ฉบับที่ 55 (พ.ศ. 2543) ข้อ 50 วรรคสาม',
          description_th: `ผนังทึบร่นห่างเขตที่ดิน $\\ge 0.50$ ม. ถูกต้องตามกฎกระทรวง`,
        })
      } else {
        // ระยะร่นน้อยกว่า 0.50 ม. (เช่น ชิดเขต 0.00 ม.)
        if (wall.neighbor_consent === true) {
          findings.push({
            rule_id: 'TH-MR55-RULE-50-CONSENT',
            title: `Blind Wall on Boundary with Consent (${wallLabel})`,
            title_th: `ผนังทึบชิดเขตที่ดินโดยได้รับความยินยอม (${wallLabel})`,
            status: 'pass',
            actual: `${wall.distance_to_boundary_m.toFixed(2)} ม. (มีหนังสือยินยอม)`,
            required: '0.00 ม. (พร้อมหนังสือยินยอม)',
            citation: 'กฎกระทรวง ฉบับที่ 55 (พ.ศ. 2543) ข้อ 50 วรรคสาม',
            description_th: `สร้างชิดแนวเขตที่ดินได้เนื่องจากมีหนังสือยินยอมเป็นลายลักษณ์อักษรจากเจ้าของที่ดินข้างเคียง`,
          })
        } else {
          findings.push({
            rule_id: 'TH-MR55-RULE-50-BLIND-VIOLATION',
            title: `Blind Wall Setback Violation (${wallLabel})`,
            title_th: `ระยะร่นผนังทึบผิดกฎหมาย (${wallLabel})`,
            status: 'fail',
            actual: `${wall.distance_to_boundary_m.toFixed(2)} ม. (ไม่มีหนังสือยินยอม)`,
            required: `>= ${requiredBlindSetback.toFixed(2)} ม. หรือหนังสือยินยอมข้างเคียง`,
            citation: 'กฎกระทรวง ฉบับที่ 55 (พ.ศ. 2543) ข้อ 50 วรรคสาม',
            description_th: `ผนังทึบร่นห่างเขตที่ดินน้อยกว่า 0.50 ม. ต้องมีหนังสือยินยอมเป็นลายลักษณ์อักษรจากเจ้าของที่ดินข้างเคียง`,
          })
        }
      }
    }

    // Road setback check
    if (road_width_m !== undefined) {
      if (road_width_m < 6.0) {
        // ถนนกว้างน้อยกว่า 6.00 ม. ร่นจากกึ่งกลางถนน >= 3.00 ม.
        if (wall.distance_to_road_center_m !== undefined) {
          const passRoad = wall.distance_to_road_center_m >= 3.0
          findings.push({
            rule_id: 'TH-MR55-RULE-41-ROAD',
            title: `Setback from Road Centerline (${wallLabel})`,
            title_th: `ระยะร่นจากกึ่งกลางถนนสาธารณะ (${wallLabel})`,
            status: passRoad ? 'pass' : 'fail',
            actual: `${wall.distance_to_road_center_m.toFixed(2)} ม.`,
            required: '>= 3.00 ม.',
            citation: 'กฎกระทรวง ฉบับที่ 55 (พ.ศ. 2543) ข้อ 41',
            description_th: `ถนนกว้าง ${road_width_m.toFixed(2)} ม. (< 6.00 ม.) อาคารต้องร่นห่างจากกึ่งกลางถนนสาธารณะอย่างน้อย 3.00 ม.`,
          })
        }
      } else {
        // ถนนกว้าง >= 6.00 ม. ร่นจากเขตถนน >= 2.00 ม.
        if (wall.distance_to_road_edge_m !== undefined) {
          const passRoad = wall.distance_to_road_edge_m >= 2.0
          findings.push({
            rule_id: 'TH-MR55-RULE-42-ROAD',
            title: `Setback from Road Boundary (${wallLabel})`,
            title_th: `ระยะร่นจากแนวเขตถนนสาธารณะ (${wallLabel})`,
            status: passRoad ? 'pass' : 'fail',
            actual: `${wall.distance_to_road_edge_m.toFixed(2)} ม.`,
            required: '>= 2.00 ม.',
            citation: 'กฎกระทรวง ฉบับที่ 55 (พ.ศ. 2543) ข้อ 42',
            description_th: `ถนนกว้าง ${road_width_m.toFixed(2)} ม. (>= 6.00 ม.) อาคารต้องร่นห่างจากเขตถนนสาธารณะอย่างน้อย 2.00 ม.`,
          })
        }
      }
    }
  }

  const hasFail = findings.some((f) => f.status === 'fail')
  const hasWarning = findings.some((f) => f.status === 'warning')

  return {
    overall_status: hasFail ? 'fail' : hasWarning ? 'warning' : 'pass',
    findings,
  }
}

// -------------------------------------------------------------
// BMA Town Planning Zoning (ผังเมืองรวม กทม.)
// -------------------------------------------------------------

export interface BmaZoningRule {
  zone_code: string // e.g. "Y1", "Y2", "Y3", "Y4", "Y5"
  zone_name_th: string
  max_far: number
  min_osr_percent: number
}

export const BMA_ZONING_STANDARDS: Record<string, BmaZoningRule> = {
  Y1: { zone_code: 'Y1', zone_name_th: 'ที่อยู่อาศัยหนาแน่นน้อย ย.1', max_far: 1.0, min_osr_percent: 40.0 },
  Y2: { zone_code: 'Y2', zone_name_th: 'ที่อยู่อาศัยหนาแน่นน้อย ย.2', max_far: 1.5, min_osr_percent: 30.0 },
  Y3: { zone_code: 'Y3', zone_name_th: 'ที่อยู่อาศัยหนาแน่นน้อย ย.3', max_far: 2.5, min_osr_percent: 20.0 },
  Y4: { zone_code: 'Y4', zone_name_th: 'ที่อยู่อาศัยหนาแน่นปานกลาง ย.4', max_far: 3.0, min_osr_percent: 15.0 },
  Y5: { zone_code: 'Y5', zone_name_th: 'ที่อยู่อาศัยหนาแน่นปานกลาง ย.5', max_far: 4.0, min_osr_percent: 10.0 },
  Y6: { zone_code: 'Y6', zone_name_th: 'ที่อยู่อาศัยหนาแน่นมาก ย.6', max_far: 5.0, min_osr_percent: 10.0 },
  Y7: { zone_code: 'Y7', zone_name_th: 'ที่อยู่อาศัยหนาแน่นมาก ย.7', max_far: 6.0, min_osr_percent: 7.5 },
}

export interface BmaZoningEvaluationInputs {
  zone_code: string // e.g. "Y2"
  total_land_area_sq_m: number
  building_footprint_area_sq_m: number
  total_floor_area_sq_m: number
  permeable_surface_area_sq_m?: number
}

export interface BmaZoningEvaluationResult {
  zone: BmaZoningRule
  actual_far: number
  far_status: ComplianceStatus
  open_space_sq_m: number
  actual_osr_percent: number
  osr_status: ComplianceStatus
  permeable_percent: number
  permeable_status: ComplianceStatus
  overall_status: ComplianceStatus
  findings: ComplianceFinding[]
}

/**
 * Evaluates Bangkok Municipal Area (BMA) Town Planning FAR, OSR and permeable surface ratios.
 */
export function evaluateBmaZoning(inputs: BmaZoningEvaluationInputs): BmaZoningEvaluationResult {
  const zone = BMA_ZONING_STANDARDS[inputs.zone_code] ?? BMA_ZONING_STANDARDS.Y2
  const findings: ComplianceFinding[] = []

  const landArea = Math.max(0.001, inputs.total_land_area_sq_m)
  const floorArea = inputs.total_floor_area_sq_m
  const footprint = inputs.building_footprint_area_sq_m
  const openSpace = Math.max(0, landArea - footprint)

  // FAR = Floor Area / Land Area
  const actualFar = Math.round((floorArea / landArea) * 100) / 100
  const farPass = actualFar <= zone.max_far
  findings.push({
    rule_id: 'BMA-ZONING-FAR',
    title: 'Floor Area Ratio (FAR)',
    title_th: 'อัตราส่วนพื้นที่อาคารรวมต่อพื้นที่ดิน (FAR)',
    status: farPass ? 'pass' : 'fail',
    actual: `${actualFar.toFixed(2)} : 1`,
    required: `<= ${zone.max_far.toFixed(2)} : 1`,
    citation: `กฎกระทรวงผังเมืองรวมกรุงเทพมหานคร โซน ${zone.zone_code}`,
    description_th: `พื้นที่อาคารรวม ${floorArea} ตร.ม. ต่อที่ดิน ${landArea} ตร.ม. คำนวณ FAR ได้ ${actualFar} (เกณฑ์สูงสุด ${zone.max_far})`,
  })

  // OSR = (Open Space / Floor Area) * 100%
  const actualOsr = Math.round((openSpace / Math.max(0.001, floorArea)) * 1000) / 10
  const osrPass = actualOsr >= zone.min_osr_percent
  findings.push({
    rule_id: 'BMA-ZONING-OSR',
    title: 'Open Space Ratio (OSR)',
    title_th: 'อัตราส่วนพื้นที่ว่างต่อพื้นที่อาคารรวม (OSR)',
    status: osrPass ? 'pass' : 'fail',
    actual: `${actualOsr.toFixed(1)}%`,
    required: `>= ${zone.min_osr_percent.toFixed(1)}%`,
    citation: `กฎกระทรวงผังเมืองรวมกรุงเทพมหานคร โซน ${zone.zone_code}`,
    description_th: `พื้นที่ว่าง ${openSpace.toFixed(1)} ตร.ม. คิดเป็น ${actualOsr.toFixed(1)}% ของพื้นที่อาคารรวม (เกณฑ์ขั้นต่ำ ${zone.min_osr_percent}%)`,
  })

  // Permeable surface check (ต้องมีพื้นที่น้ำซึมผ่านได้ >= 50% ของพื้นที่ว่าง)
  let permeablePercent = 100
  let permeablePass = true
  if (inputs.permeable_surface_area_sq_m !== undefined && openSpace > 0) {
    permeablePercent = Math.round((inputs.permeable_surface_area_sq_m / openSpace) * 1000) / 10
    permeablePass = permeablePercent >= 50.0
    findings.push({
      rule_id: 'BMA-ZONING-PERMEABLE',
      title: 'Permeable Green Surface Area',
      title_th: 'พื้นที่น้ำซึมผ่านได้เพื่อปลูกต้นไม้',
      status: permeablePass ? 'pass' : 'fail',
      actual: `${permeablePercent.toFixed(1)}%`,
      required: '>= 50.0%',
      citation: 'ข้อกำหนดผังเมืองรวม กทม. การซึมน้ำของพื้นที่ว่าง',
      description_th: `พื้นที่น้ำซึมผ่านได้ ${inputs.permeable_surface_area_sq_m.toFixed(1)} ตร.ม. คิดเป็น ${permeablePercent.toFixed(1)}% ของพื้นที่ว่างเปิดโล่ง (เกณฑ์ขั้นต่ำ 50%)`,
    })
  }

  const overallPass = farPass && osrPass && permeablePass

  return {
    zone,
    actual_far: actualFar,
    far_status: farPass ? 'pass' : 'fail',
    open_space_sq_m: openSpace,
    actual_osr_percent: actualOsr,
    osr_status: osrPass ? 'pass' : 'fail',
    permeable_percent: permeablePercent,
    permeable_status: permeablePass ? 'pass' : 'fail',
    overall_status: overallPass ? 'pass' : 'fail',
    findings,
  }
}

// -------------------------------------------------------------
// Natural Lighting & Ventilation Compliance (กฎกระทรวง ฉบับที่ 55 ข้อ 40, 41)
// -------------------------------------------------------------

export interface RoomVentilationOpeningItem {
  opening_id: string
  mark: string
  object_type: 'door_window.door' | 'door_window.window'
  width_m: number
  height_m: number
  gross_area_sq_m: number
  operation: string // e.g. 'sliding', 'hinged', 'awning', 'fixed'
  daylight_ratio: number
  ventilation_ratio: number
  effective_daylight_area_sq_m: number
  effective_ventilation_area_sq_m: number
  wall_id: string
  is_exterior: boolean
}

export interface RoomVentilationResult {
  room_id: string
  room_number: string
  room_name: string
  level_id: string
  room_type: 'habitable' | 'bathroom'
  floor_area_sq_m: number
  exterior_openings: RoomVentilationOpeningItem[]
  total_daylight_area_sq_m: number
  daylight_ratio_percent: number
  required_daylight_percent: number
  daylight_status: ComplianceStatus
  total_ventilation_area_sq_m: number
  ventilation_ratio_percent: number
  required_ventilation_percent: number
  min_ventilation_area_sq_m: number
  ventilation_status: ComplianceStatus
  overall_status: ComplianceStatus
  findings: ComplianceFinding[]
}

export interface ProjectVentilationComplianceSummary {
  overall_status: ComplianceStatus
  rooms: RoomVentilationResult[]
  total_rooms: number
  passed_rooms: number
  failed_rooms: number
  findings: ComplianceFinding[]
}

function pointInPolygon2D(p: [number, number], polygon: [number, number][]): boolean {
  if (!polygon || polygon.length < 3) return false
  let inside = false
  const [x, y] = p
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0]
    const yi = polygon[i][1]
    const xj = polygon[j][0]
    const yj = polygon[j][1]
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function pointToSegmentDist2D(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  if (l2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

function minDistanceToPolygon2D(p: [number, number], polygon: [number, number][]): number {
  if (!polygon || polygon.length < 2) return Infinity
  let minD = Infinity
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    const d = pointToSegmentDist2D(p, a, b)
    if (d < minD) minD = d
  }
  return minD
}

function polygonAreaSqM2D(polygon: [number, number][]): number {
  if (!polygon || polygon.length < 3) return 0
  let areaSum = 0
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length
    areaSum += polygon[i][0] * polygon[j][1] - polygon[j][0] * polygon[i][1]
  }
  return Math.abs(areaSum) / 2.0 / 1_000_000
}

/**
 * Evaluates Natural Daylighting and Natural Ventilation compliance under
 * Thai Building Code (กฎกระทรวงฉบับที่ 55 พ.ศ. 2543 ข้อ 40 และข้อ 41).
 */
export function evaluateRoomVentilationCompliance(
  project: ProjectDocument,
  targetRoomId?: string,
): ProjectVentilationComplianceSummary {
  const allRooms = Object.values(project.objects).filter((obj): obj is SmartObject => {
    if (obj.status === 'archived' || obj.removed_phase) return false
    return obj.object_type === 'architecture.room'
  })

  const allWalls = Object.values(project.objects).filter((obj): obj is SmartObject => {
    if (obj.status === 'archived' || obj.removed_phase) return false
    return obj.object_type === 'architecture.wall'
  })

  const allOpenings = Object.values(project.objects).filter((obj): obj is SmartObject => {
    if (obj.status === 'archived' || obj.removed_phase) return false
    return obj.object_type === 'door_window.door' || obj.object_type === 'door_window.window'
  })

  const roomsToEvaluate = targetRoomId ? allRooms.filter((r) => r.id === targetRoomId) : allRooms
  const roomResults: RoomVentilationResult[] = []
  const allFindings: ComplianceFinding[] = []

  for (const room of roomsToEvaluate) {
    const roomData = (room.module_data ?? {}) as Record<string, unknown>
    const levelId = String(roomData.level_id ?? (room.level_refs?.[0]?.level_id ?? ''))
    const roomNumber = String(roomData.number ?? '')
    const roomName = String(roomData.name ?? 'Room')
    const boundary = (roomData.boundary_mm as [number, number][]) ?? []

    const floorAreaSqM =
      typeof roomData.area_mm2 === 'number' && roomData.area_mm2 > 0
        ? Math.round((roomData.area_mm2 / 1_000_000) * 100) / 100
        : Math.round(polygonAreaSqM2D(boundary) * 100) / 100

    const isBathroom = /bath|toilet|wc|w\.c\.|powder|restroom|ห้องน้ำ|สุขา|ส้วม/i.test(
      `${roomName} ${roomNumber}`,
    )
    const roomType: 'habitable' | 'bathroom' = isBathroom ? 'bathroom' : 'habitable'

    const requiredDaylightPercent = isBathroom ? 0 : 10.0
    const requiredVentilationPercent = 10.0
    const minVentilationAreaSqM = isBathroom ? 0.2 : 0

    // Find openings on this level that border this room and face the exterior
    const levelRooms = allRooms.filter((r) => {
      const rd = (r.module_data ?? {}) as Record<string, unknown>
      return (rd.level_id ?? r.level_refs?.[0]?.level_id) === levelId
    })

    const levelOpenings = allOpenings.filter((o) => {
      const od = (o.module_data ?? {}) as Record<string, unknown>
      const oLevel = od.level_id ?? o.level_refs?.[0]?.level_id
      return oLevel === levelId || !oLevel
    })

    const exteriorOpenings: RoomVentilationOpeningItem[] = []

    for (const op of levelOpenings) {
      const opData = (op.module_data ?? {}) as Record<string, unknown>
      const wallId = String(opData.wall_id ?? '')
      const hostWall = allWalls.find((w) => w.id === wallId)

      let loc: [number, number] | undefined = Array.isArray(opData.location_mm)
        ? [Number(opData.location_mm[0]), Number(opData.location_mm[1])]
        : undefined

      if (!loc && hostWall) {
        const hwData = (hostWall.module_data ?? {}) as Record<string, unknown>
        const start = hwData.start_point_mm as number[] | undefined
        const end = hwData.end_point_mm as number[] | undefined
        if (start && end) {
          const dx = end[0] - start[0]
          const dy = end[1] - start[1]
          const len = Math.hypot(dx, dy)
          const offset =
            typeof opData.offset_along_wall_mm === 'number'
              ? opData.offset_along_wall_mm
              : len / 2
          if (len > 0) loc = [start[0] + (dx / len) * offset, start[1] + (dy / len) * offset]
        }
      }

      if (!loc) continue

      // Test adjacency to this room's boundary
      let adjacentToThisRoom = false
      if (boundary.length >= 3) {
        const dist = minDistanceToPolygon2D(loc, boundary)
        adjacentToThisRoom = dist <= 450 // mm tolerance for wall offset + thickness
      } else if (opData.room_id === room.id) {
        adjacentToThisRoom = true
      }

      if (!adjacentToThisRoom) continue

      // Determine if opening faces the outdoor exterior
      let isExterior = false
      if (hostWall) {
        const hwData = (hostWall.module_data ?? {}) as Record<string, unknown>
        if (
          hwData.plaster_outside_material === 'exterior_paint' ||
          Boolean(hwData.outside_finish_mark)
        ) {
          isExterior = true
        }

        const start = hwData.start_point_mm as number[] | undefined
        const end = hwData.end_point_mm as number[] | undefined
        if (start && end) {
          const dx = end[0] - start[0]
          const dy = end[1] - start[1]
          const len = Math.hypot(dx, dy)
          if (len > 0) {
            const nx = -dy / len
            const ny = dx / len
            const p1: [number, number] = [loc[0] + 350 * nx, loc[1] + 350 * ny]
            const p2: [number, number] = [loc[0] - 350 * nx, loc[1] - 350 * ny]
            const r1 = levelRooms.filter((r) =>
              pointInPolygon2D(
                p1,
                ((r.module_data ?? {}) as Record<string, unknown>).boundary_mm as [number, number][],
              ),
            )
            const r2 = levelRooms.filter((r) =>
              pointInPolygon2D(
                p2,
                ((r.module_data ?? {}) as Record<string, unknown>).boundary_mm as [number, number][],
              ),
            )

            if ((r1.length > 0 && r2.length === 0) || (r2.length > 0 && r1.length === 0)) {
              isExterior = true
            } else if (r1.length > 0 && r2.length > 0) {
              isExterior = false // Partition between indoor rooms
            }
          }
        }
      } else if (op.object_type === 'door_window.window') {
        isExterior = true
      }

      if (!isExterior) continue

      // Calculate gross and effective areas
      const widthMm = Number(opData.width_mm ?? 1000)
      const heightMm = Number(opData.height_mm ?? 1200)
      const widthM = widthMm / 1000
      const heightM = heightMm / 1000
      const grossAreaSqM = Math.round(widthM * heightM * 1000) / 1000

      const typeId = String(
        opData.type_id ?? opData.door_type_id ?? opData.window_type_id ?? '',
      )
      const typeDef =
        Array.isArray(project.types) && typeId
          ? resolveCatalogType(project, op.object_type, typeId)
          : undefined
      const params = {
        ...(typeDef?.parameters ?? {}),
        ...((opData.instance_overrides as Record<string, unknown>) ?? {}),
      }

      const operation = String(
        params.opening_operation ?? (op.object_type === 'door_window.window' ? 'sliding' : 'hinged'),
      )
      const glazing = String(
        params.glazing_material ?? (op.object_type === 'door_window.window' ? 'clear_glass' : 'none'),
      )
      const leafStyle = String(params.door_leaf_style ?? '')

      // Daylight ratio
      let daylightRatio = 0
      if (op.object_type === 'door_window.window') {
        daylightRatio = glazing === 'none' || leafStyle === 'louvered' ? 0 : 1.0
      } else {
        if (
          glazing !== 'none' ||
          leafStyle.includes('french') ||
          leafStyle.includes('glass') ||
          operation === 'sliding'
        ) {
          daylightRatio = 0.8
        } else {
          daylightRatio = 0
        }
      }

      // Ventilation ratio
      let ventilationRatio = 0.5
      switch (operation) {
        case 'fixed':
          ventilationRatio = 0.0
          break
        case 'sliding':
          ventilationRatio = 0.5
          break
        case 'louvered':
        case 'jalousie':
          ventilationRatio = 0.7
          break
        case 'bifold':
          ventilationRatio = 0.9
          break
        case 'hinged':
        case 'casement':
        case 'awning':
        case 'pivoted':
          ventilationRatio = 1.0
          break
        default:
          ventilationRatio = op.object_type === 'door_window.window' ? 0.5 : 1.0
      }

      const effectiveDaylight = Math.round(grossAreaSqM * daylightRatio * 1000) / 1000
      const effectiveVentilation = Math.round(grossAreaSqM * ventilationRatio * 1000) / 1000

      exteriorOpenings.push({
        opening_id: op.id,
        mark: String(opData.mark ?? (op.object_type === 'door_window.window' ? 'W' : 'D')),
        object_type: op.object_type as 'door_window.door' | 'door_window.window',
        width_m: widthM,
        height_m: heightM,
        gross_area_sq_m: grossAreaSqM,
        operation,
        daylight_ratio: daylightRatio,
        ventilation_ratio: ventilationRatio,
        effective_daylight_area_sq_m: effectiveDaylight,
        effective_ventilation_area_sq_m: effectiveVentilation,
        wall_id: wallId,
        is_exterior: true,
      })
    }

    // Totals for room
    const totalDaylightAreaSqM =
      Math.round(
        exteriorOpenings.reduce((sum, o) => sum + o.effective_daylight_area_sq_m, 0) * 1000,
      ) / 1000
    const totalVentilationAreaSqM =
      Math.round(
        exteriorOpenings.reduce((sum, o) => sum + o.effective_ventilation_area_sq_m, 0) * 1000,
      ) / 1000

    const daylightRatioPercent =
      floorAreaSqM > 0
        ? Math.round((totalDaylightAreaSqM / floorAreaSqM) * 1000) / 10
        : 0
    const ventilationRatioPercent =
      floorAreaSqM > 0
        ? Math.round((totalVentilationAreaSqM / floorAreaSqM) * 1000) / 10
        : 0

    // Evaluation
    let daylightStatus: ComplianceStatus = 'pass'
    if (roomType === 'habitable') {
      daylightStatus = daylightRatioPercent >= requiredDaylightPercent ? 'pass' : 'fail'
    } else {
      daylightStatus = 'pass' // bathrooms use mechanical or artificial illumination
    }

    let ventilationStatus: ComplianceStatus = 'pass'
    if (roomType === 'bathroom') {
      ventilationStatus =
        totalVentilationAreaSqM >= minVentilationAreaSqM ||
        ventilationRatioPercent >= requiredVentilationPercent
          ? 'pass'
          : 'fail'
    } else {
      ventilationStatus =
        ventilationRatioPercent >= requiredVentilationPercent ? 'pass' : 'fail'
    }

    const roomOverall: ComplianceStatus =
      daylightStatus === 'pass' && ventilationStatus === 'pass' ? 'pass' : 'fail'

    // Formulate Thai findings
    const roomFindings: ComplianceFinding[] = []

    // Rule 41 Daylighting
    const daylightTitle = `Natural Daylighting (${roomName} ${roomNumber})`
    const daylightTitleTh = `ระบบแสงสว่างธรรมชาติ (${roomName} ${roomNumber})`
    const requiredDaylightSqM = (floorAreaSqM * (requiredDaylightPercent / 100)).toFixed(2)
    roomFindings.push({
      rule_id: 'TH-MR55-RULE-41-DAYLIGHT',
      title: daylightTitle,
      title_th: daylightTitleTh,
      status: daylightStatus,
      actual: `${totalDaylightAreaSqM.toFixed(2)} ตร.ม. (${daylightRatioPercent.toFixed(1)}%)`,
      required:
        requiredDaylightPercent > 0
          ? `>= ${requiredDaylightSqM} ตร.ม. (>= ${requiredDaylightPercent.toFixed(0)}%)`
          : 'ตามความเหมาะสม (ไฟส่องสว่าง)',
      citation: 'กฎกระทรวง ฉบับที่ 55 (พ.ศ. 2543) ข้อ 41',
      description_th:
        roomType === 'bathroom'
          ? `ห้องน้ำ/ส้วม อนุโลมให้ใช้ระบบไฟฟ้าแสงสว่างได้ตามมาตรฐานความปลอดภัย`
          : `ห้อง ${roomName} พื้นที่ ${floorAreaSqM.toFixed(2)} ตร.ม. มีช่องรับแสงธรรมชาติรวม ${totalDaylightAreaSqM.toFixed(2)} ตร.ม. (${daylightRatioPercent.toFixed(1)}%) ${
              daylightStatus === 'pass'
                ? `ถูกต้องตามเกณฑ์กฎกระทรวง (>= 10%)`
                : `ต่ำกว่าเกณฑ์กฎกระทรวง (ต้องมีช่องรับแสงไม่น้อยกว่า 10% หรือ >= ${requiredDaylightSqM} ตร.ม.)`
            }`,
    })

    // Rule 40 Ventilation
    const ventTitle = `Natural Ventilation (${roomName} ${roomNumber})`
    const ventTitleTh = `ระบบระบายอากาศธรรมชาติ (${roomName} ${roomNumber})`
    const requiredVentSqM =
      roomType === 'bathroom'
        ? `${minVentilationAreaSqM.toFixed(2)} ตร.ม. หรือ >= 10%`
        : `>= ${(floorAreaSqM * 0.1).toFixed(2)} ตร.ม. (>= 10%)`
    roomFindings.push({
      rule_id: 'TH-MR55-RULE-40-VENTILATION',
      title: ventTitle,
      title_th: ventTitleTh,
      status: ventilationStatus,
      actual: `${totalVentilationAreaSqM.toFixed(2)} ตร.ม. (${ventilationRatioPercent.toFixed(1)}%)`,
      required: requiredVentSqM,
      citation:
        roomType === 'bathroom'
          ? 'กฎกระทรวง ฉบับที่ 55 (พ.ศ. 2543) ข้อ 40 วรรคสอง'
          : 'กฎกระทรวง ฉบับที่ 55 (พ.ศ. 2543) ข้อ 40 วรรคหนึ่ง',
      description_th:
        roomType === 'bathroom'
          ? `ห้องน้ำ/ส้วม ${roomName} พื้นที่ ${floorAreaSqM.toFixed(2)} ตร.ม. มีช่องเปิดระบายอากาศสู่ภายนอก ${totalVentilationAreaSqM.toFixed(2)} ตร.ม. (${ventilationRatioPercent.toFixed(1)}%) ${
              ventilationStatus === 'pass'
                ? `ถูกต้องตามเกณฑ์กฎกระทรวง (>= 0.20 ตร.ม. หรือ >= 10%)`
                : `ต่ำกว่าเกณฑ์กฎกระทรวง (ต้องมีช่องระบายอากาศไม่น้อยกว่า 0.20 ตร.ม. หรือ 10% ของพื้นที่ห้อง)`
            }`
          : `ห้อง ${roomName} พื้นที่ ${floorAreaSqM.toFixed(2)} ตร.ม. มีช่องระบายอากาศธรรมชาติรวม ${totalVentilationAreaSqM.toFixed(2)} ตร.ม. (${ventilationRatioPercent.toFixed(1)}%) ${
              ventilationStatus === 'pass'
                ? `ถูกต้องตามเกณฑ์กฎกระทรวง (>= 10%)`
                : `ต่ำกว่าเกณฑ์กฎกระทรวง (ต้องมีช่องระบายอากาศไม่น้อยกว่า 10% หรือ >= ${(floorAreaSqM * 0.1).toFixed(2)} ตร.ม.)`
            }`,
    })

    roomResults.push({
      room_id: room.id,
      room_number: roomNumber,
      room_name: roomName,
      level_id: levelId,
      room_type: roomType,
      floor_area_sq_m: floorAreaSqM,
      exterior_openings: exteriorOpenings,
      total_daylight_area_sq_m: totalDaylightAreaSqM,
      daylight_ratio_percent: daylightRatioPercent,
      required_daylight_percent: requiredDaylightPercent,
      daylight_status: daylightStatus,
      total_ventilation_area_sq_m: totalVentilationAreaSqM,
      ventilation_ratio_percent: ventilationRatioPercent,
      required_ventilation_percent: requiredVentilationPercent,
      min_ventilation_area_sq_m: minVentilationAreaSqM,
      ventilation_status: ventilationStatus,
      overall_status: roomOverall,
      findings: roomFindings,
    })

    allFindings.push(...roomFindings)
  }

  const passedCount = roomResults.filter((r) => r.overall_status === 'pass').length
  const failedCount = roomResults.filter((r) => r.overall_status === 'fail').length
  const overallStatus: ComplianceStatus =
    failedCount > 0 ? 'fail' : roomResults.length > 0 ? 'pass' : 'insufficient_data'

  return {
    overall_status: overallStatus,
    rooms: roomResults,
    total_rooms: roomResults.length,
    passed_rooms: passedCount,
    failed_rooms: failedCount,
    findings: allFindings,
  }
}
