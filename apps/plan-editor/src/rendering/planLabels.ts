interface PlanLabel {
  x: number; y: number; anchorX: number; anchorY: number; text: string; width: number; height: number
  font: string; color: string; background: string; border: string; priority: number; angle: number
  layout?: { kind: 'wall-symbol'; maxAlong: number }
  shape: 'rect' | 'circle' | 'hexagon' | 'pentagon' | 'ellipse' | 'triangle' | 'triangle-down' | 'room-tag'
}
export type PlanLabelShape = PlanLabel['shape']
export type PlanLabelLayout = NonNullable<PlanLabel['layout']>

export const PLAN_SYMBOL_TAG_MIN_ZOOM_PERCENT = 70

/** Keep enabled object tags readable at overview scales without hiding the selected or hovered target. */
export function shouldShowPlanSymbolTag(zoomPercent: number, manuallyVisible = true, isSelected = false, isHovered = false): boolean {
  return manuallyVisible && (zoomPercent >= PLAN_SYMBOL_TAG_MIN_ZOOM_PERCENT || isSelected || isHovered)
}

/** Split room identity from its level and area details for a compact plan-table tag. */
export function formatPlanRoomTag(text: string): string {
  const [identity, ...details] = text.split(' · ')
  return details.length ? `${identity}\n${details.join(' · ')}` : text
}

export function planLabelScale(_zoom: number) {
  return 1
}

const frames = new WeakMap<CanvasRenderingContext2D, PlanLabel[]>()
const baseTransforms = new WeakMap<CanvasRenderingContext2D, DOMMatrix>()

function toScreenPoint(x: number, y: number, transform: DOMMatrix) {
  const determinant = transform.a * transform.d - transform.b * transform.c
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return [x, y] as [number, number]
  const translatedX = x - transform.e
  const translatedY = y - transform.f
  return [
    (transform.d * translatedX - transform.c * translatedY) / determinant,
    (transform.a * translatedY - transform.b * translatedX) / determinant,
  ] as [number, number]
}

export function beginPlanLabels(ctx: CanvasRenderingContext2D, _zoom: number) {
  frames.set(ctx, [])
  baseTransforms.set(ctx, ctx.getTransform())
}

export function queuePlanLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string, border: string, priority = 0, background = '#fbfdff', rotateWithObject = false, shape: PlanLabelShape = 'rect', leaderAnchor?: [number, number], layout?: PlanLabelLayout) {
  const transform = ctx.getTransform()
  let angle = rotateWithObject ? Math.atan2(transform.b, transform.a) : 0
  if (angle > Math.PI / 2) angle -= Math.PI
  if (angle < -Math.PI / 2) angle += Math.PI
  const textLines = text.split('\n')
  const baseWidth = Math.max(...textLines.map(line => ctx.measureText(line).width)) + (shape === 'room-tag' ? 12 : 10)
  const baseHeight = shape === 'room-tag' ? Math.max(18, textLines.length * 11 + 8) : shape === 'triangle' || shape === 'triangle-down' ? 24 : shape === 'hexagon' ? 26 : 18
  const labelWidth = shape === 'circle' ? Math.max(baseWidth, baseHeight) : shape === 'hexagon' ? Math.max(baseWidth, 48) : shape === 'triangle' || shape === 'triangle-down' ? Math.max(baseWidth, 36) : baseWidth
  const anchor = leaderAnchor ?? [x, y]
  const baseTransform = baseTransforms.get(ctx) ?? transform
  const [screenX, screenY] = toScreenPoint(transform.a * x + transform.c * y + transform.e, transform.b * x + transform.d * y + transform.f, baseTransform)
  const [anchorScreenX, anchorScreenY] = toScreenPoint(transform.a * anchor[0] + transform.c * anchor[1] + transform.e, transform.b * anchor[0] + transform.d * anchor[1] + transform.f, baseTransform)
  frames.get(ctx)?.push({
    x: screenX,
    y: screenY,
    anchorX: anchorScreenX,
    anchorY: anchorScreenY,
    text, width: labelWidth, height: baseHeight,
    font: ctx.font, color, border, background, priority, angle, shape, layout,
  })
}

/** Screen-space annotation layout; geometry and picking stay at their model coordinates. */
export function flushPlanLabels(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const labels = frames.get(ctx) ?? []
  const baseTransform = baseTransforms.get(ctx) ?? ctx.getTransform()
  const placed: Array<{ x: number; y: number; width: number; height: number }> = []
  ctx.save()
  ctx.setTransform(baseTransform.a, baseTransform.b, baseTransform.c, baseTransform.d, baseTransform.e, baseTransform.f)
  ctx.setLineDash([])
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const label of labels.sort((a, b) => b.priority - a.priority || a.anchorY - b.anchorY || a.anchorX - b.anchorX || a.text.localeCompare(b.text))) {
    if (label.x < 0 || label.x > width || label.y < 0 || label.y > height) continue
    const labelWidth = label.width
    const labelHeight = label.height
    const boxWidth = Math.abs(Math.cos(label.angle)) * labelWidth + Math.abs(Math.sin(label.angle)) * labelHeight
    const boxHeight = Math.abs(Math.sin(label.angle)) * labelWidth + Math.abs(Math.cos(label.angle)) * labelHeight
    let position: { x: number; y: number; width: number; height: number } | null = null
    const offsets: Array<[number, number]> = []
    if (label.layout?.kind === 'wall-symbol') {
      // A wall type triangle must remain attached to its wall. Only slide it
      // along that wall's axis, within the clear solid run; never send it into
      // another room or across a nearby opening to resolve a collision.
      offsets.push([0, 0])
      const step = Math.max(18, Math.min(30, boxWidth * 0.62))
      for (let distance = step; distance <= label.layout.maxAlong + 0.01; distance += step) {
        offsets.push([-distance, 0], [distance, 0])
      }
    } else {
      // Object marks and room tags stay exactly on their source geometry.
      // Hiding an obstructed label is less misleading than relocating it to
      // another object or room.
      offsets.push([0, 0])
    }
    const alongX = Math.cos(label.angle)
    const alongY = Math.sin(label.angle)
    for (const [dx, dy] of offsets) {
      const candidate = {
        x: label.layout?.kind === 'wall-symbol'
          ? label.x + dx * alongX
          : label.x + dx,
        y: label.layout?.kind === 'wall-symbol'
          ? label.y + dx * alongY
          : label.y + dy,
        width: boxWidth,
        height: boxHeight,
      }
      if (candidate.x < boxWidth / 2 + 4 || candidate.x > width - boxWidth / 2 - 4) continue
      if (candidate.y < boxHeight / 2 + 12 || candidate.y > height - boxHeight / 2 - 12) continue
      if (placed.some(other => Math.abs(other.x - candidate.x) < (other.width + candidate.width) / 2 + 4 && Math.abs(other.y - candidate.y) < (other.height + candidate.height) / 2 + 4)) continue
      position = candidate
      break
    }
    if (!position) continue
    placed.push(position)
    if (label.layout?.kind === 'wall-symbol' && Math.hypot(position.x - label.x, position.y - label.y) > 2) {
      // The triangle's point faces its wall, so the connector ends at that
      // point and runs along the wall face when we slide the symbol locally.
      const apexY = label.shape === 'triangle' ? -label.height / 2 : label.height / 2
      const apexX = position.x - Math.sin(label.angle) * apexY
      const apexScreenY = position.y + Math.cos(label.angle) * apexY
      ctx.strokeStyle = label.border
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.moveTo(label.anchorX, label.anchorY)
      ctx.lineTo(apexX, apexScreenY)
      ctx.stroke()
    }
    ctx.save()
    ctx.translate(position.x, position.y)
    ctx.rotate(label.angle)
    ctx.strokeStyle = label.border
    ctx.lineWidth = 0.8
    ctx.fillStyle = label.background
    ctx.beginPath()
    if (label.shape === 'circle') {
      ctx.ellipse(0, 0, label.width / 2, label.height / 2, 0, 0, Math.PI * 2)
    } else if (label.shape === 'ellipse') {
      ctx.ellipse(0, 0, label.width / 2 + 2, label.height / 2, 0, 0, Math.PI * 2)
    } else if (label.shape === 'hexagon') {
      // Window type tag: flat top and bottom with pointed left and right ends.
      ctx.moveTo(-label.width * 0.25, -label.height / 2)
      ctx.lineTo(label.width * 0.25, -label.height / 2)
      ctx.lineTo(label.width / 2, 0)
      ctx.lineTo(label.width * 0.25, label.height / 2)
      ctx.lineTo(-label.width * 0.25, label.height / 2)
      ctx.lineTo(-label.width / 2, 0)
      ctx.closePath()
    } else if (label.shape === 'pentagon') {
      ctx.moveTo(-label.width / 2, -label.height / 2)
      ctx.lineTo(label.width / 2, -label.height / 2)
      ctx.lineTo(label.width / 2, label.height * 0.12)
      ctx.lineTo(0, label.height / 2)
      ctx.lineTo(-label.width / 2, label.height * 0.12)
      ctx.closePath()
    } else if (label.shape === 'triangle') {
      ctx.moveTo(0, -label.height / 2)
      ctx.lineTo(label.width / 2, label.height / 2)
      ctx.lineTo(-label.width / 2, label.height / 2)
      ctx.closePath()
    } else if (label.shape === 'triangle-down') {
      ctx.moveTo(0, label.height / 2)
      ctx.lineTo(label.width / 2, -label.height / 2)
      ctx.lineTo(-label.width / 2, -label.height / 2)
      ctx.closePath()
    } else {
      ctx.rect(-label.width / 2, -label.height / 2, label.width, label.height)
    }
    ctx.fill()
    ctx.stroke()
    if (label.shape === 'room-tag' && label.text.includes('\n')) {
      ctx.beginPath()
      ctx.moveTo(-label.width / 2 + 3, 0)
      ctx.lineTo(label.width / 2 - 3, 0)
      ctx.lineWidth = 0.55
      ctx.stroke()
    }
    ctx.font = label.font
    ctx.fillStyle = label.color
    const textLines = label.text.split('\n')
    const lineHeight = label.shape === 'room-tag' ? 11 : 12
    textLines.forEach((line, index) => ctx.fillText(line, 0, (index - (textLines.length - 1) / 2) * lineHeight))
    ctx.restore()
  }
  ctx.restore()
  frames.delete(ctx)
  baseTransforms.delete(ctx)
}
