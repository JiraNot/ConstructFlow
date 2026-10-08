export type OpeningPlanSymbolAnchor = 'left' | 'right' | 'center' | 'ratio'

/** An endpoint in real millimetres, positioned from a stable opening anchor. */
export interface OpeningPlanSymbolPoint {
  x_anchor: OpeningPlanSymbolAnchor
  /** Offset from the anchor in mm; ignored for ratio anchors. */
  x_offset_mm: number
  /** Width fraction for ratio anchors. */
  x_ratio?: number
  /** Offset across the host wall centreline in real mm. */
  y_mm: number
  /** Optional vertical anchor used by elevation symbols. */
  y_anchor?: 'bottom' | 'top' | 'center' | 'ratio'
  y_ratio?: number
}

/** A user-authored, parametric 2D plan line. */
export interface OpeningPlanSymbolLine {
  id: string
  start: OpeningPlanSymbolPoint
  end: OpeningPlanSymbolPoint
}

export function validateOpeningPlanSymbolLines(value: unknown): asserts value is OpeningPlanSymbolLine[] {
  if (!Array.isArray(value) || value.length > 120) throw new Error('plan_symbol_lines must contain at most 120 lines')
  for (const [index, raw] of value.entries()) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Invalid plan symbol line ${index + 1}`)
    const line = raw as Record<string, unknown>
    if (typeof line.id !== 'string' || !line.id || line.id.length > 80) throw new Error(`Invalid plan symbol line id at ${index + 1}`)
    for (const key of ['start', 'end'] as const) {
      const point = line[key]
      if (!point || typeof point !== 'object' || Array.isArray(point)) throw new Error(`Invalid plan symbol ${key} point at line ${index + 1}`)
      const p = point as Record<string, unknown>
      if (!['left', 'right', 'center', 'ratio'].includes(String(p.x_anchor))) throw new Error(`Invalid plan symbol x anchor at line ${index + 1}`)
      if (typeof p.x_offset_mm !== 'number' || !Number.isFinite(p.x_offset_mm) || Math.abs(p.x_offset_mm) > 10000) throw new Error(`Invalid plan symbol x offset at line ${index + 1}`)
      if (p.x_anchor === 'ratio' && (typeof p.x_ratio !== 'number' || !Number.isFinite(p.x_ratio) || p.x_ratio < 0 || p.x_ratio > 1)) throw new Error(`Invalid plan symbol x ratio at line ${index + 1}`)
      if (typeof p.y_mm !== 'number' || !Number.isFinite(p.y_mm) || Math.abs(p.y_mm) > 1000) throw new Error(`Invalid plan symbol y coordinate at line ${index + 1}`)
      if (p.y_anchor !== undefined && !['bottom', 'top', 'center', 'ratio'].includes(String(p.y_anchor))) throw new Error(`Invalid opening symbol y anchor at line ${index + 1}`)
      if (p.y_anchor === 'ratio' && (typeof p.y_ratio !== 'number' || !Number.isFinite(p.y_ratio) || p.y_ratio < 0 || p.y_ratio > 1)) throw new Error(`Invalid opening symbol y ratio at line ${index + 1}`)
    }
  }
}

/** Resolve a point vertically from the sill-relative opening bounds. */
export function resolveOpeningPlanSymbolY(point: OpeningPlanSymbolPoint, openingHeightMm: number): number {
  const h = Math.max(0, openingHeightMm)
  if (point.y_anchor === 'bottom') return -h / 2 + point.y_mm
  if (point.y_anchor === 'top') return h / 2 + point.y_mm
  if (point.y_anchor === 'ratio') return h * (Number(point.y_ratio ?? 0.5) - 0.5) + point.y_mm
  return point.y_mm
}

/** Clean, editable starting profile for a two-panel sliding window. */
export function makeSlidingWindowPlanSymbol(): OpeningPlanSymbolLine[] {
  const point = (x_anchor: OpeningPlanSymbolAnchor, x_offset_mm: number, y_mm: number, x_ratio?: number): OpeningPlanSymbolPoint => ({ x_anchor, x_offset_mm, y_mm, ...(x_ratio === undefined ? {} : { x_ratio }) })
  const line = (id: string, start: OpeningPlanSymbolPoint, end: OpeningPlanSymbolPoint): OpeningPlanSymbolLine => ({ id, start, end })
  return [
    // Frame jambs are 50 mm wide in the opening direction. Both boundaries
    // are explicit so resizing the opening changes only the clear span.
    line('left-frame-outer', point('left', 0, -50), point('left', 0, 50)),
    line('left-frame-inner', point('left', 50, -50), point('left', 50, 50)),
    line('right-frame-inner', point('right', -50, -50), point('right', -50, 50)),
    line('right-frame-outer', point('right', 0, -50), point('right', 0, 50)),
    line('center-meeting-left', point('center', -25, -50), point('center', -25, 50)),
    line('center-meeting-right', point('center', 25, -50), point('center', 25, 50)),
    line('outer-track-top', point('left', 50, -38), point('right', -50, -38)),
    line('outer-track-bottom', point('left', 50, 38), point('right', -50, 38)),
    line('left-sash-top', point('left', 50, -24), point('center', -25, -24)),
    line('left-sash-bottom', point('left', 50, -12), point('center', -25, -12)),
    line('right-sash-top', point('center', 25, 12), point('right', -50, 12)),
    line('right-sash-bottom', point('center', 25, 24), point('right', -50, 24)),
  ]
}

export function resolveOpeningPlanSymbolX(point: OpeningPlanSymbolPoint, openingWidthMm: number): number {
  if (point.x_anchor === 'right') return openingWidthMm + point.x_offset_mm
  if (point.x_anchor === 'center') return openingWidthMm / 2 + point.x_offset_mm
  if (point.x_anchor === 'ratio') return openingWidthMm * Number(point.x_ratio ?? 0) + point.x_offset_mm
  return point.x_offset_mm
}
