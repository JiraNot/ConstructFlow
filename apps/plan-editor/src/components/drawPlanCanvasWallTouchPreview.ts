import { formatLengthMm, wallCenterlinePointsMm, type DisplayLengthUnit } from '@constructflow/project-model'
import type { WallDrawMode } from './planCanvasInteractionTypes.js'
import { fitWallStrokeArc } from './wallDrawGeometry.js'
import type { ViewportState } from '../viewport/viewportTransform.js'
import { worldToScreen } from '../viewport/viewportTransform.js'

type Point = [number, number]

/** Draws a touch wall stroke as a clean arc preview, without exposing every pen sample. */
export function drawPlanCanvasWallTouchPreview(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  viewport: ViewportState,
  displayUnit: DisplayLengthUnit,
  lengthPrecision: number,
  anglePrecision: number,
  angleSnapDeg = 45,
  wallDrawMode: WallDrawMode = 'continuous-lines',
) {
  if (points.length < 2) return

  const isArcMode = wallDrawMode === 'continuous-lines-and-arcs' || wallDrawMode === 'line-arc'
  const fittedArc = isArcMode ? fitWallStrokeArc(points, wallDrawMode === 'line-arc') : undefined
  const curve = fittedArc?.curve_geometry
  const displayPoints: Point[] = curve && fittedArc
    ? wallCenterlinePointsMm({
      start_point_mm: [fittedArc.start_mm[0], fittedArc.start_mm[1], 0],
      end_point_mm: [fittedArc.end_mm[0], fittedArc.end_mm[1], 0],
      curve_geometry: curve,
    }, Math.max(0.25, 0.5 / Math.max(viewport.zoom, 0.001))).map(point => [point[0], point[1]])
    : points
  const screenPoints = displayPoints.map(point => worldToScreen(point, viewport))
  if (screenPoints.length < 2) return

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(...screenPoints[0]!)
  if (isArcMode && !curve && screenPoints.length > 2) {
    // A quadratic midpoint pass keeps the live hand stroke visually calm while
    // the analytic arc fitter waits for enough samples to identify its radius.
    for (let index = 1; index < screenPoints.length - 1; index += 1) {
      const point = screenPoints[index]!
      const next = screenPoints[index + 1]!
      const midpoint: Point = [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2]
      ctx.quadraticCurveTo(point[0], point[1], midpoint[0], midpoint[1])
    }
    ctx.lineTo(...screenPoints.at(-1)!)
  } else {
    screenPoints.slice(1).forEach(point => ctx.lineTo(...point))
  }
  ctx.strokeStyle = 'rgba(234, 88, 12, 0.18)'
  ctx.lineWidth = 12
  ctx.stroke()
  ctx.strokeStyle = '#ea580c'
  ctx.lineWidth = 2.5
  ctx.setLineDash(isArcMode ? [] : [7, 5])
  ctx.stroke()
  ctx.setLineDash([])

  const drawEndpoint = (point: Point) => {
    const [x, y] = worldToScreen(point, viewport)
    ctx.beginPath()
    ctx.arc(x, y, 4, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = '#ea580c'
    ctx.stroke()
  }
  if (isArcMode) {
    drawEndpoint(points[0]!)
    drawEndpoint(points.at(-1)!)
  } else {
    for (const point of points.slice(1, -1)) drawEndpoint(point)
  }

  const drawLabel = (text: string, x: number, y: number) => {
    ctx.font = '600 11px system-ui, sans-serif'
    const width = ctx.measureText(text).width + 16
    ctx.fillStyle = 'rgba(255,255,255,.97)'
    ctx.strokeStyle = '#7dd3fc'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(x - width / 2, y - 11, width, 22, 5)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#075985'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x, y)
  }

  if (isArcMode) {
    const totalLengthMm = curve
      ? curve.radius_mm * Math.abs(curve.sweep_angle_deg) * Math.PI / 180
      : points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point[0] - points[index]![0], point[1] - points[index]![1]), 0)
    if (totalLengthMm > 1) {
      const middle = screenPoints[Math.floor(screenPoints.length / 2)]!
      let labelPoint: Point = [middle[0] + 24, middle[1] - 24]
      if (curve) {
        const center = worldToScreen(curve.center_mm, viewport)
        const dx = middle[0] - center[0], dy = middle[1] - center[1]
        const radius = Math.hypot(dx, dy) || 1
        labelPoint = [middle[0] + dx / radius * 26, middle[1] + dy / radius * 26]
      }
      const arcLabel = curve ? ` · โค้ง ${Math.abs(curve.sweep_angle_deg).toFixed(Math.max(0, Math.min(2, anglePrecision)))}°` : ' · แนวโค้ง'
      drawLabel(`L ${formatLengthMm(totalLengthMm, displayUnit, lengthPrecision)} ${displayUnit}${arcLabel}`, labelPoint[0], labelPoint[1])
    }
    ctx.restore()
    return
  }

  const start = points.at(-2)!
  const end = points.at(-1)!
  const lengthMm = Math.hypot(end[0] - start[0], end[1] - start[1])
  const startScreen = worldToScreen(start, viewport)
  const endScreen = worldToScreen(end, viewport)
  const dx = endScreen[0] - startScreen[0]
  const dy = endScreen[1] - startScreen[1]
  const screenLength = Math.hypot(dx, dy)

  if (lengthMm > 1 && screenLength >= 20) {
    const ux = dx / screenLength
    const uy = dy / screenLength
    const nx = -dy / screenLength
    const ny = dx / screenLength
    const offset = 16
    const ax = startScreen[0] + nx * offset
    const ay = startScreen[1] + ny * offset
    const bx = endScreen[0] + nx * offset
    const by = endScreen[1] + ny * offset
    const angle = (Math.atan2(end[1] - start[1], end[0] - start[0]) * 180 / Math.PI + 360) % 360
    const angleText = angle.toFixed(Math.max(0, Math.min(4, anglePrecision)))
    const snappedAngle = angleSnapDeg > 0 ? (Math.round(angle / angleSnapDeg) * angleSnapDeg) % 360 : null
    const snapDifference = snappedAngle === null ? Infinity : Math.abs(((angle - snappedAngle + 540) % 360) - 180)
    const snapLabel = snapDifference <= 3 ? ` · ${snappedAngle}° SNAP` : ` · ${angleText}°`
    const label = `${formatLengthMm(lengthMm, displayUnit, lengthPrecision)} ${displayUnit}${snapLabel}`

    ctx.beginPath()
    ctx.moveTo(startScreen[0] - ux * 18, startScreen[1] - uy * 18)
    ctx.lineTo(endScreen[0] + ux * 112, endScreen[1] + uy * 112)
    ctx.moveTo(endScreen[0] - nx * 13, endScreen[1] - ny * 13)
    ctx.lineTo(endScreen[0] + nx * 13, endScreen[1] + ny * 13)
    ctx.strokeStyle = 'rgba(2, 132, 199, 0.78)'
    ctx.lineWidth = 1.25
    ctx.setLineDash([4, 5])
    ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(startScreen[0], startScreen[1]); ctx.lineTo(ax, ay)
    ctx.moveTo(endScreen[0], endScreen[1]); ctx.lineTo(bx, by)
    ctx.moveTo(ax, ay); ctx.lineTo(bx, by)
    ctx.strokeStyle = '#0284c7'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    ctx.stroke()
    ctx.setLineDash([])
    drawLabel(label, (ax + bx) / 2, (ay + by) / 2)
  }

  ctx.restore()
}
