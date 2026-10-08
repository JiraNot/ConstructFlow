interface PlanLabel {
  x: number; y: number; anchorX: number; anchorY: number; text: string; width: number; height: number
  font: string; color: string; background: string; border: string; priority: number; angle: number
  shape: 'rect' | 'circle' | 'hexagon' | 'pentagon' | 'ellipse' | 'triangle' | 'triangle-down'
}
export type PlanLabelShape = PlanLabel['shape']

export function planLabelScale(zoom: number) {
  const safeZoom = Math.max(zoom, 0.0001)
  // Keep the standard tag size at 100%; grow only gradually on closer views,
  // with a readable floor when zoomed far out and a cap for detailed plans.
  return safeZoom < 0.1
    ? Math.max(0.85, safeZoom / 0.1)
    : Math.min(1.35, 1 + (safeZoom - 0.1) * 1.25)
}

const frames = new WeakMap<CanvasRenderingContext2D, PlanLabel[]>()
const frameZooms = new WeakMap<CanvasRenderingContext2D, number>()

export function beginPlanLabels(ctx: CanvasRenderingContext2D, zoom: number) {
  frames.set(ctx, [])
  frameZooms.set(ctx, zoom)
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
  frames.get(ctx)?.push({
    x: transform.a * x + transform.c * y + transform.e,
    y: transform.b * x + transform.d * y + transform.f,
    anchorX: transform.a * anchor[0] + transform.c * anchor[1] + transform.e,
    anchorY: transform.b * anchor[0] + transform.d * anchor[1] + transform.f,
    text, width: labelWidth, height: baseHeight,
    font: ctx.font, color, border, background, priority, angle, shape,
  })
}

/** Screen-space annotation layout; geometry and picking stay at their model coordinates. */
export function flushPlanLabels(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const labels = frames.get(ctx) ?? []
  const zoom = frameZooms.get(ctx) ?? 0.08
  // Labels grow modestly as the plan is zoomed out, then stop at a readable cap.
  const labelScale = planLabelScale(zoom)
  const placed: Array<{ x: number; y: number; width: number; height: number }> = []
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.setLineDash([])
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const label of labels.sort((a, b) => b.priority - a.priority)) {
    if (label.x < 0 || label.x > width || label.y < 0 || label.y > height) continue
    const labelWidth = label.width * labelScale
    const labelHeight = label.height * labelScale
    const boxWidth = Math.abs(Math.cos(label.angle)) * labelWidth + Math.abs(Math.sin(label.angle)) * labelHeight
    const boxHeight = Math.abs(Math.sin(label.angle)) * labelWidth + Math.abs(Math.cos(label.angle)) * labelHeight
    let position: { x: number; y: number; width: number; height: number } | null = null
    const gap = labelHeight + 5
    const offsets: Array<[number, number]> = [
      [0, 0], [0, -1], [0, 1], [-1, 0], [1, 0],
      [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -2], [0, 2], [-2, 0], [2, 0],
    ]
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
    ctx.scale(labelScale, labelScale)
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
  frameZooms.delete(ctx)
}
