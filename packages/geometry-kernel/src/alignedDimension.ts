type Point = [number, number]

/** Signed normal offset, independent of screen zoom and pointer distance along the baseline. */
export function alignedDimensionOffset(start: Point, end: Point, pointer: Point): number {
  const length = Math.hypot(end[0] - start[0], end[1] - start[1])
  if (length < 1) return 0
  return ((pointer[0] - start[0]) * -(end[1] - start[1]) + (pointer[1] - start[1]) * (end[0] - start[0])) / length
}

export function alignedDimensionGeometry(start: Point, end: Point, offset: number) {
  const length = Math.hypot(end[0] - start[0], end[1] - start[1])
  if (!Number.isFinite(length) || length < 1 || !Number.isFinite(offset)) return null
  const normal: Point = [-(end[1] - start[1]) / length, (end[0] - start[0]) / length]
  const a: Point = [start[0] + normal[0] * offset, start[1] + normal[1] * offset]
  const b: Point = [end[0] + normal[0] * offset, end[1] + normal[1] * offset]
  return { start_mm: a, end_mm: b, normal, length_mm: length, label_mm: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Point }
}
