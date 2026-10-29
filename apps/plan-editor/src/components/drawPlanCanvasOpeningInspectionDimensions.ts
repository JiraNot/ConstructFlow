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

  // Keep the dimension badge opposite the door's flip control, which sits on
  // the swing side. This gives both controls their own clear hit area.
  const isDoor = isDoorObject(opening)
  const swingSign = isDoor ? ((opening.module_data.handing || 'left_in').endsWith('_out') ? -1 : 1) : 1
  const dimSide = isDoor ? swingSign : 1
  const badgeOffsetPx = Math.max(28, Math.min(48, (hostWall.module_data.thickness_mm / 2 + 400) * viewport.zoom))
  const badgeOffsetMm = hostWall.module_data.thickness_mm / 2 + badgeOffsetPx / viewport.zoom
  const openingCenter: [number, number] = [sx + ux * offset, sy + uy * offset]
  const badgeCenter = worldToScreen([
    openingCenter[0] + nx * badgeOffsetMm * dimSide,
    openingCenter[1] + ny * badgeOffsetMm * dimSide,
  ], viewport)
  const sizeText = `${formatLengthMm(w, displayUnit)} × ${formatLengthMm(opening.module_data.height_mm || (isDoor ? 2000 : 1200), displayUnit)} ${displayUnit}`
  const clearanceText = `← ${formatLengthMm(clearanceStart, displayUnit)} · ${formatLengthMm(clearanceEnd, displayUnit)} ${displayUnit} →`

  ctx.save()
  ctx.font = '600 10px sans-serif'
  const width = Math.min(240, Math.max(ctx.measureText(sizeText).width, ctx.measureText(clearanceText).width) + 16)
  const height = 34
  const x = badgeCenter[0] - width / 2
  const y = badgeCenter[1] - height / 2
  ctx.fillStyle = 'rgba(255,255,255,0.96)'
  ctx.strokeStyle = '#94a3b8'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, 5)
  ctx.fill()
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#334155'
  ctx.fillText(sizeText, x + width / 2, y + 10, width - 10)
  ctx.font = '500 9px sans-serif'
  ctx.fillStyle = isStartWarn || isEndWarn ? '#b91c1c' : '#64748b'
  ctx.fillText(clearanceText, x + width / 2, y + 24, width - 10)
  ctx.restore()
}
