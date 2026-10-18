export type ToleranceStatus = 'pass' | 'warning' | 'defect'

export interface ToleranceCheckResult {
  objectId: string
  objectType: 'wall' | 'opening' | 'clearance' | 'setback'
  design_mm: number
  measured_mm: number
  deviation_mm: number
  percentage: number
  status: ToleranceStatus
  message_th: string
  is_within_standard: boolean
}

export interface ToleranceThresholds {
  passMaxMm: number      // Default <= 3 mm
  warningMaxMm: number   // Default <= 10 mm
}

export const DEFAULT_TOLERANCE_THRESHOLDS: ToleranceThresholds = {
  passMaxMm: 3,
  warningMaxMm: 10,
}

/**
 * Validates on-site laser measured dimension against architectural design dimension.
 * Applies Thai Engineering Institute (EIT / วสท.) construction tolerances.
 */
export function checkAsBuiltTolerance(
  objectId: string,
  objectType: 'wall' | 'opening' | 'clearance' | 'setback',
  design_mm: number,
  measured_mm: number,
  thresholds: ToleranceThresholds = DEFAULT_TOLERANCE_THRESHOLDS
): ToleranceCheckResult {
  const deviation_mm = measured_mm - design_mm
  const absDev = Math.abs(deviation_mm)
  const percentage = design_mm > 0 ? Number(((absDev / design_mm) * 100).toFixed(2)) : 0

  let status: ToleranceStatus = 'pass'
  let message_th = 'ระยะตรงตามแบบสถาปัตย์ (ผ่านเกณฑ์ วสท.)'

  if (absDev <= thresholds.passMaxMm) {
    status = 'pass'
    message_th = `คลาดเคลื่อน ${deviation_mm >= 0 ? '+' : ''}${deviation_mm} มม. (อยู่ในเกณฑ์มาตรฐาน EIT)`
  } else if (absDev <= thresholds.warningMaxMm) {
    status = 'warning'
    message_th = `คลาดเคลื่อน ${deviation_mm >= 0 ? '+' : ''}${deviation_mm} มม. (ควรตรวจสอบความหนาปูนฉาบหรือบานเปิด)`
  } else {
    status = 'defect'
    message_th = `คลาดเคลื่อน ${deviation_mm >= 0 ? '+' : ''}${deviation_mm} มม. เกินเกณฑ์มาตรฐาน! ต้องตรวจสอบหน้างานทันที`
  }

  return {
    objectId,
    objectType,
    design_mm,
    measured_mm,
    deviation_mm,
    percentage,
    status,
    message_th,
    is_within_standard: status === 'pass',
  }
}
