import { ProjectDocument, SmartObject, DoorModuleData, WindowModuleData, WallModuleData, isColumnObject, isDoorObject, formatLengthMm, type DisplayLengthUnit } from '@constructflow/project-model'
import { ViewportState, worldToScreen } from '../viewport/viewportTransform.js'

export function drawOpeningInspectionDimensions(
  ctx: CanvasRenderingContext2D,
  opening: SmartObject<DoorModuleData | WindowModuleData>,
  hostWall: SmartObject<WallModuleData>,
  project: ProjectDocument,
  viewport: ViewportState,
  displayUnit: DisplayLengthUnit
) {
  const [sx, sy] = hostWall.module_data.start_point_mm
  const [ex, ey] = hostWall.module_data.end_point_mm
  const length = Math.hypot(ex - sx, ey - sy)
  if (length < 1) return

  const ux = (ex - sx) / length, uy = (ey - sy) / length
  const nx = -uy, ny = ux
  const offset = opening.module_data.offset_along_wall_mm
  const w = opening.module_data.width_mm
  const halfWidth = w / 2

  const jambStart = offset - halfWidth
  const jambEnd = offset + halfWidth

  // Check for column faces at start and end of wall
  let startColFace = 0
  let endColFace = 0
  for (const other of Object.values(project.objects)) {
    if (isColumnObject(other)) {
      const [colX, colY] = other.module_data.location_mm
      const [cw, cd] = other.module_data.section_mm
      const colHalf = Math.max(cw, cd) / 2
      if (Math.hypot(colX - sx, colY - sy) <= colHalf + 60) startColFace = Math.max(startColFace, colHalf)
      if (Math.hypot(colX - ex, colY - ey) <= colHalf + 60) endColFace = Math.max(endColFace, colHalf)
    }
  }

  const clearanceStart = Math.max(0, jambStart - startColFace)
  const clearanceEnd = Math.max(0, length - endColFace - jambEnd)
  const isStartWarn = clearanceStart < 100
  const isEndWarn = clearanceEnd < 100

  // Dimension line side: opposite door swing, or side +1 for window
  const isDoor = isDoorObject(opening)
  const swingSign = isDoor ? ((opening.module_data.handing || 'left_in').endsWith('_out') ? -1 : 1) : 1
  const dimSide = isDoor ? -swingSign : 1
  const dimOffsetMm = (hostWall.module_data.thickness_mm / 2 + 380) * dimSide

  // 4 witness points along the wall line (at wall surface)
  const pStartFace: [number, number] = [sx + ux * startColFace, sy + uy * startColFace]
  const pJamb1: [number, number] = [sx + ux * jambStart, sy + uy * jambStart]
  const pJamb2: [number, number] = [sx + ux * jambEnd, sy + uy * jambEnd]
  const pEndFace: [number, number] = [ex - ux * endColFace, ey - uy * endColFace]

  // Projected points on the dimension line
  const dStartFace: [number, number] = [pStartFace[0] + nx * dimOffsetMm, pStartFace[1] + ny * dimOffsetMm]
  const dJamb1: [number, number] = [pJamb1[0] + nx * dimOffsetMm, pJamb1[1] + ny * dimOffsetMm]
  const dJamb2: [number, number] = [pJamb2[0] + nx * dimOffsetMm, pJamb2[1] + ny * dimOffsetMm]
  const dEndFace: [number, number] = [pEndFace[0] + nx * dimOffsetMm, pEndFace[1] + ny * dimOffsetMm]

  // Screen conversions
  const [sPStart, sPJamb1, sPJamb2, sPEnd] = [
    worldToScreen(pStartFace, viewport),
    worldToScreen(pJamb1, viewport),
    worldToScreen(pJamb2, viewport),
    worldToScreen(pEndFace, viewport),
  ]
  const [sDStart, sDJamb1, sDJamb2, sDEnd] = [
    worldToScreen(dStartFace, viewport),
    worldToScreen(dJamb1, viewport),
    worldToScreen(dJamb2, viewport),
    worldToScreen(dEndFace, viewport),
  ]

  ctx.save()

  // 1. Extension Witness Lines
  ctx.strokeStyle = '#94a3b8'
  ctx.lineWidth = 1
  ctx.setLineDash([3, 3])
  const witnessOverrun = 6
  for (const [[pBaseX, pBaseY], [pDimX, pDimY]] of [
    [sPStart, sDStart],
    [sPJamb1, sDJamb1],
    [sPJamb2, sDJamb2],
    [sPEnd, sDEnd],
  ]) {
    const wvx = pDimX - pBaseX, wvy = pDimY - pBaseY
    const wlen = Math.hypot(wvx, wvy)
    if (wlen > 1) {
      const wdx = wvx / wlen, wdy = wvy / wlen
      ctx.beginPath()
      ctx.moveTo(pBaseX, pBaseY)
      ctx.lineTo(pDimX + wdx * witnessOverrun, pDimY + wdy * witnessOverrun)
      ctx.stroke()
    }
  }
  ctx.setLineDash([])

  // 2. Dimension Line Segments
  const drawInterval = (
    p1: [number, number],
    p2: [number, number],
    valueMm: number,
    isWarning: boolean,
    labelPrefix?: string
  ) => {
    ctx.beginPath()
    ctx.strokeStyle = isWarning ? '#dc2626' : '#0284c7'
    ctx.lineWidth = isWarning ? 1.8 : 1.2
    ctx.moveTo(p1[0], p1[1])
    ctx.lineTo(p2[0], p2[1])
    ctx.stroke()

    // 45° Architectural Slashes at endpoints
    const tickLen = 5
    for (const pt of [p1, p2]) {
      ctx.beginPath()
      ctx.strokeStyle = isWarning ? '#dc2626' : '#0369a1'
      ctx.lineWidth = 1.6
      ctx.moveTo(pt[0] - tickLen, pt[1] + tickLen)
      ctx.lineTo(pt[0] + tickLen, pt[1] - tickLen)
      ctx.stroke()
    }

    // Text Label
    const midX = (p1[0] + p2[0]) / 2
    const midY = (p1[1] + p2[1]) / 2
    const distText = `${formatLengthMm(valueMm, displayUnit)} ${displayUnit}`
    const text = labelPrefix ? `${labelPrefix} ${distText}` : distText

    ctx.font = isWarning ? 'bold 11px sans-serif' : '600 11px sans-serif'
    const textWidth = ctx.measureText(text).width + 10
    ctx.fillStyle = isWarning ? '#fef2f2' : 'rgba(255, 255, 255, 0.95)'
    ctx.strokeStyle = isWarning ? '#f87171' : '#bae6fd'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(midX - textWidth / 2, midY - 9, textWidth, 18, 4)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = isWarning ? '#b91c1c' : '#0369a1'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, midX, midY)
  }

  // Draw 3 intervals: Start clearance, Opening width, End clearance
  drawInterval(sDStart, sDJamb1, clearanceStart, isStartWarn, isStartWarn ? '⚠️ เอ็น' : 'ริมเสา')
  drawInterval(sDJamb1, sDJamb2, w, false, 'ช่องกว้าง')
  drawInterval(sDJamb2, sDEnd, clearanceEnd, isEndWarn, isEndWarn ? '⚠️ เอ็น' : 'ริมเสา')

  // 3. Opening Specification Pill Tag (Centered above opening width)
  const midJambX = (sDJamb1[0] + sDJamb2[0]) / 2
  const midJambY = (sDJamb1[1] + sDJamb2[1]) / 2
  const specText = isDoor
    ? `🚪 ${opening.module_data.mark || 'D1'}: ${formatLengthMm(w, displayUnit)} × ${formatLengthMm(opening.module_data.height_mm || 2000, displayUnit)} ${displayUnit} · ธรณี +0.00`
    : `🪟 ${opening.module_data.mark || 'W1'}: ${formatLengthMm(w, displayUnit)} × ${formatLengthMm(opening.module_data.height_mm || 1200, displayUnit)} ${displayUnit} (ธรณี +${formatLengthMm(opening.module_data.sill_height_mm ?? 900, displayUnit)})`
  
  ctx.font = '600 11px sans-serif'
  const specWidth = ctx.measureText(specText).width + 14
  const specYOffset = dimSide > 0 ? 22 : -22
  ctx.fillStyle = '#0f172a'
  ctx.strokeStyle = '#38bdf8'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.roundRect(midJambX - specWidth / 2, midJambY + specYOffset - 10, specWidth, 20, 5)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(specText, midJambX, midJambY + specYOffset)

  // 4. Stiffener Compliance Indicator Badge
  if (!isStartWarn && !isEndWarn) {
    const okText = '✓ ระยะเสาเอ็น-ทับหลัง ผ่านเกณฑ์ (≥ 100 มม.)'
    ctx.font = '500 10px sans-serif'
    const okWidth = ctx.measureText(okText).width + 12
    const okYOffset = dimSide > 0 ? 44 : -44
    ctx.fillStyle = '#f0fdf4'
    ctx.strokeStyle = '#86efac'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(midJambX - okWidth / 2, midJambY + okYOffset - 9, okWidth, 18, 4)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#15803d'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(okText, midJambX, midJambY + okYOffset)
  }

  ctx.restore()
}
