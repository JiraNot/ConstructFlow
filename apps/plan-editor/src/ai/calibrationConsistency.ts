export interface PointScaleReference {
  points: [[number, number], [number, number]]
  distance_mm: number
}

/** Compares measured mm-per-source-pixel across references on the same page. */
export function scaleReferenceSpreadPercent(references: PointScaleReference[], width: number, height: number): number | null {
  if (references.length < 2 || !(width > 0) || !(height > 0)) return null
  const scales = references.map(reference => {
    const dx = (reference.points[1][0] - reference.points[0][0]) * width
    const dy = (reference.points[1][1] - reference.points[0][1]) * height
    const pixelLength = Math.hypot(dx, dy)
    return pixelLength > 0 && reference.distance_mm > 0 ? reference.distance_mm / pixelLength : NaN
  }).filter(Number.isFinite).sort((a, b) => a - b)
  if (scales.length < 2) return null
  const middle = Math.floor(scales.length / 2)
  const median = scales.length % 2 ? scales[middle] : (scales[middle - 1] + scales[middle]) / 2
  if (!(median > 0)) return null
  return Math.max(...scales.map(scale => Math.abs(scale - median) / median)) * 100
}
