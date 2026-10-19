interface PlanLabel {
  x: number; y: number; anchorX: number; anchorY: number; text: string; width: number; height: number
  font: string; color: string; background: string; border: string; priority: number; angle: number
  shape: 'rect' | 'circle' | 'hexagon' | 'pentagon' | 'ellipse' | 'triangle' | 'triangle-down'
}
export type PlanLabelShape = PlanLabel['shape']

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

export function queuePlanLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string, border: string, priority = 0, background = '#fbfdff', rotateWithObject = false, shape: PlanLabelShape = 'rect', leaderAnchor?: [number, number]) {
  const transform = ctx.getTransform()
  let angle = rotateWithObject ? Math.atan2(transform.b, transform.a) : 0
  if (angle > Math.PI / 2) angle -= Math.PI
  if (angle < -Math.PI / 2) angle += Math.PI
  const baseWidth = ctx.measureText(text).width + 10
  const baseHeight = shape === 'triangle' || shape === 'triangle-down' ? 34 : shape === 'hexagon' ? 26 : 18
  const labelWidth = shape === 'circle' ? Math.max(baseWidth, baseHeight) : shape === 'hexagon' ? Math.max(baseWidth, 48) : shape === 'triangle' || shape === 'triangle-down' ? Math.max(baseWidth, 46) : baseWidth
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
    font: ctx.font, color, border, background, priority, angle, shape,
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
  for (const label of labels.sort((a, b) => b.priority - a.priority)) {
    if (label.x < 0 || label.x > width || label.y < 0 || label.y > height) continue
    const labelWidth = label.width
    const labelHeight = label.height
    const boxWidth = Math.abs(Math.cos(label.angle)) * labelWidth + Math.abs(Math.sin(label.angle)) * labelHeight
    const boxHeight = Math.abs(Math.sin(label.angle)) * labelWidth + Math.abs(Math.cos(label.angle)) * labelHeight
    let position: { x: number; y: number; width: number; height: number } | null = null
    const gap = labelHeight + 5
    const offsets: Array<[number, number]> = [[0, 0]]
    // Tags clustered around columns or openings need more than one local nudge.
    // Search outward in screen space and let the existing leader connect the
    // displaced label to its model anchor.
    for (let ring = 1; ring <= 5; ring++) {
      offsets.push([0, -ring], [0, ring], [-ring, 0], [ring, 0])
      offsets.push([-ring, -ring], [ring, -ring], [-ring, ring], [ring, ring])
    }
    for (const [dx, dy] of offsets) {
      const candidate = {
        x: Math.max(boxWidth / 2 + 4, Math.min(width - boxWidth / 2 - 4, label.x + dx * gap)),
        y: label.y + dy * gap,
        width: boxWidth,
        height: boxHeight,
      }
      if (candidate.y < 12 || candidate.y > height - 12) continue
      if (placed.some(other => Math.abs(other.x - candidate.x) < (other.width + candidate.width) / 2 + 4 && Math.abs(other.y - candidate.y) < (other.height + candidate.height) / 2 + 4)) continue
      position = candidate
      break
    }
    if (!position) continue
    placed.push(position)
    if (Math.hypot(position.x - label.anchorX, position.y - label.anchorY) > 5) {
      ctx.strokeStyle = label.border
      ctx.lineWidth = 0.7
      ctx.beginPath()
      ctx.moveTo(label.anchorX, label.anchorY)
      ctx.lineTo(position.x, position.y)
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
    ctx.font = label.font
    ctx.fillStyle = label.color
    ctx.fillText(label.text, 0, 0)
    ctx.restore()
  }
  ctx.restore()
  frames.delete(ctx)
  baseTransforms.delete(ctx)
}
