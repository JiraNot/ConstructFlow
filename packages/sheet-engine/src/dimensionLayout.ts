export interface DimensionLabelBox {
  min_x: number
  min_y: number
  max_x: number
  max_y: number
}

export interface DimensionLayoutBounds {
  min_x: number
  min_y: number
  max_x: number
  max_y: number
}

export interface DimensionLabelPlacement {
  offset_mm: number
  tangent_offset_mm: number
  box: DimensionLabelBox
  has_collision: boolean
}

const overlaps = (a: DimensionLabelBox, b: DimensionLabelBox, gap: number) =>
  a.min_x < b.max_x + gap && a.max_x + gap > b.min_x &&
  a.min_y < b.max_y + gap && a.max_y + gap > b.min_y

const inside = (box: DimensionLabelBox, bounds: DimensionLayoutBounds) =>
  box.min_x >= bounds.min_x && box.min_y >= bounds.min_y &&
  box.max_x <= bounds.max_x && box.max_y <= bounds.max_y

/** Places sheet dimension text near its line while avoiding other dimension labels and the viewport edge. */
export function placeDimensionLabel(
  base: DimensionLabelBox,
  normal: [number, number],
  occupied: readonly DimensionLabelBox[],
  bounds: DimensionLayoutBounds,
  options: { locked?: boolean; max_offset_mm?: number; step_mm?: number; gap_mm?: number } = {},
): DimensionLabelPlacement {
  const maxOffset = Math.max(0, options.max_offset_mm ?? 24)
  const step = Math.max(0.5, options.step_mm ?? 3)
  const gap = Math.max(0, options.gap_mm ?? 0.8)
  const tangent: [number, number] = [normal[1], -normal[0]]
  const offsets = options.locked ? [0] : [0, ...Array.from(
    { length: Math.ceil(maxOffset / step) * 2 },
    (_, index) => ((index % 2 === 0 ? -1 : 1) * Math.ceil((index + 1) / 2) * step),
  ).filter(offset => Math.abs(offset) <= maxOffset)]
  const candidates = options.locked
    ? [[0, 0] as const]
    : offsets.flatMap(normalOffset => offsets.map(tangentOffset => [normalOffset, tangentOffset] as const))
      .sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]) ||
        Math.abs(a[1]) - Math.abs(b[1]) || a[0] - b[0] || a[1] - b[1])
  let best: DimensionLabelPlacement | null = null
  let bestScore = Number.POSITIVE_INFINITY
  for (const [offset, tangentOffset] of candidates) {
    const dx = normal[0] * offset + tangent[0] * tangentOffset
    const dy = normal[1] * offset + tangent[1] * tangentOffset
    const box = { min_x: base.min_x + dx, min_y: base.min_y + dy, max_x: base.max_x + dx, max_y: base.max_y + dy }
    const collisionCount = occupied.reduce((count, other) => count + Number(overlaps(box, other, gap)), 0)
    const hasCollision = !inside(box, bounds) || collisionCount > 0
    if (!hasCollision) return { offset_mm: offset, tangent_offset_mm: tangentOffset, box, has_collision: false }
    const score = collisionCount * 100 + Number(!inside(box, bounds)) * 10 + Math.hypot(offset, tangentOffset) / 100
    if (score < bestScore) {
      best = { offset_mm: offset, tangent_offset_mm: tangentOffset, box, has_collision: true }
      bestScore = score
    }
  }
  return best ?? { offset_mm: 0, tangent_offset_mm: 0, box: base, has_collision: true }
}
