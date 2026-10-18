import type { Phase, WallModuleData, PlanDimension } from '@constructflow/project-model'

export interface AsBuiltWallMeasurement {
  wallId: string
  mark: string
  start_point_mm: [number, number, number]
  end_point_mm: [number, number, number]
  measured_length_mm: number
  thickness_mm: number
  height_mm: number
  level_id: string
  phase: Phase
  is_demolition?: boolean
}

export interface SetbackCheckResult {
  measured_distance_mm: number
  has_openings: boolean
  building_storeys: number
  required_distance_mm: number
  is_legal: boolean
  message_th: string
}

/**
 * Validates setback distance according to Thai Building Control Act (กฎกระทรวงฉบับที่ 55).
 * - Solid wall (ผนังทึบ): setback >= 500 mm (0.50 m)
 * - Wall with openings (ผนังมีช่องเปิด/หน้าต่าง):
 *   - Storeys <= 2: setback >= 2000 mm (2.00 m)
 *   - Storeys >= 3: setback >= 3000 mm (3.00 m)
 */
export function validateThaiBuildingLawSetback(
  measured_distance_mm: number,
  has_openings: boolean,
  building_storeys: number = 2
): SetbackCheckResult {
  let required_distance_mm = 500

  if (has_openings) {
    required_distance_mm = building_storeys >= 3 ? 3000 : 2000
  }

  const is_legal = measured_distance_mm >= required_distance_mm
  const diff_mm = measured_distance_mm - required_distance_mm

  let message_th = ''
  if (is_legal) {
    message_th = `ระยะร่น ${measured_distance_mm / 1000} ม. ผ่านตามกฎกระทรวงฉบับที่ 55 (เกณฑ์ขั้นต่ำ ${required_distance_mm / 1000} ม.)`
  } else {
    message_th = `ผิดระยะร่นตามกฎกระทรวงฉบับที่ 55! ขาดอีก ${Math.abs(diff_mm)} มม. (เกณฑ์ขั้นต่ำ ${required_distance_mm / 1000} ม. สำหรับ${has_openings ? 'ผนังมีช่องเปิด' : 'ผนังทึบ'})`
  }

  return {
    measured_distance_mm,
    has_openings,
    building_storeys,
    required_distance_mm,
    is_legal,
    message_th,
  }
}

/**
 * Converts on-site measured wall data into ConstructFlow WallModuleData.
 */
export function mapAsBuiltWallToModuleData(measurement: AsBuiltWallMeasurement): WallModuleData {
  return {
    mark: measurement.mark,
    start_point_mm: measurement.start_point_mm,
    end_point_mm: measurement.end_point_mm,
    thickness_mm: measurement.thickness_mm,
    height_mm: measurement.height_mm,
    length_mm: measurement.measured_length_mm,
    level_id: measurement.level_id,
    material: measurement.phase === 'existing' ? 'brick_masonry' : 'lightweight_block',
  }
}

/**
 * Creates a plan dimension entity corresponding to a measured wall.
 */
export function createAsBuiltPlanDimension(
  measurement: AsBuiltWallMeasurement,
  offset_mm: number = 250
): PlanDimension {
  return {
    id: `dim-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    level_id: measurement.level_id,
    created_phase: measurement.phase,
    start_mm: [measurement.start_point_mm[0], measurement.start_point_mm[1]],
    end_mm: [measurement.end_point_mm[0], measurement.end_point_mm[1]],
    offset_mm,
  }
}
