// Coordination Overlay (canvas half)
//
// Planning lives in `coordinationOverlayPlan.mjs` so it can be asserted without a canvas; this
// module only paints the primitives it produces. Both the plan and elevation canvases share it,
// which is what keeps a clash marker in an elevation identical to the same marker in plan.

import {
  COORDINATION_SEVERITY_STYLE,
  coordinationFindingsForObject,
  coordinationFixText,
  coordinationMeasureText,
  planCoordinationOverlay,
  type CoordinationOverlayOptions,
  type CoordinationPrimitive,
} from '../coordinationOverlayPlan.mjs'

export {
  COORDINATION_SEVERITY_STYLE,
  coordinationFindingsForObject,
  coordinationFixText,
  coordinationMeasureText,
  planCoordinationOverlay,
}
export type { CoordinationOverlayOptions, CoordinationPrimitive }

/** Draw a plan produced by {@link planCoordinationOverlay}. Safe to call with an empty plan. */
export function drawCoordinationPrimitives(
  ctx: CanvasRenderingContext2D,
  primitives: readonly CoordinationPrimitive[],
  pulse = 1,
): void {
  const alpha = Math.max(0.25, Math.min(1, pulse))
  ctx.save()
  for (const primitive of primitives) {
    const style = COORDINATION_SEVERITY_STYLE[primitive.severity]
    ctx.globalAlpha = alpha
    if (primitive.kind === 'rect') {
      if (primitive.tone === 'impact') {
        ctx.setLineDash([])
        ctx.fillStyle = style.fill
        ctx.fillRect(primitive.x, primitive.y, primitive.width, primitive.height)
        ctx.strokeStyle = style.stroke
        ctx.lineWidth = 2
        ctx.strokeRect(primitive.x, primitive.y, primitive.width, primitive.height)
      } else {
        ctx.setLineDash([4, 4])
        ctx.strokeStyle = style.stroke
        ctx.lineWidth = 1
        ctx.strokeRect(primitive.x, primitive.y, primitive.width, primitive.height)
      }
      continue
    }
    if (primitive.kind === 'measure') {
      ctx.setLineDash([6, 4])
      ctx.strokeStyle = style.stroke
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(primitive.x1, primitive.y1)
      ctx.lineTo(primitive.x2, primitive.y2)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = style.badge
      const textWidth = primitive.text.length * 6.2 + 10
      ctx.fillRect(primitive.x2 + 4, primitive.y2 - 18, textWidth, 16)
      ctx.fillStyle = '#ffffff'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(primitive.text, primitive.x2 + 9, primitive.y2 - 10)
      continue
    }
    ctx.setLineDash([])
    ctx.fillStyle = style.badge
    ctx.fillRect(primitive.x + 6, primitive.y - primitive.height - 4, primitive.width, primitive.height)
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    primitive.lines.forEach((line, index) => {
      ctx.font = index === 0 ? 'bold 10px sans-serif' : '10px sans-serif'
      ctx.fillText(line, primitive.x + 12, primitive.y - primitive.height + 6 + index * 13)
    })
  }
  ctx.restore()
}
