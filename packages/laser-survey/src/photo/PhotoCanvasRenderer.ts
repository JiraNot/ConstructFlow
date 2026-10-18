import type { PhotoDimensionLine, PhotoDimensionSession, PhotoAreaBox } from './PhotoMarkupModel.js'

export interface RenderOptions {
  selectedLineId?: string | null
  unit?: 'm' | 'mm'
  showLabels?: boolean
  lineWidth?: number
}

export interface AreaRenderOptions {
  selectedAreaId?: string | null
  showLabels?: boolean
  lineWidth?: number
}

/**
 * Draws dimension lines, intermediate chain ticks, engineering arrowheads,
 * and high-contrast callout badges onto a 2D HTML Canvas context.
 */
export function renderDimensionOverlays(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dimensions: PhotoDimensionLine[],
  options: RenderOptions = {}
): void {
  const {
    selectedLineId = null,
    unit = 'm',
    showLabels = true,
    lineWidth = 2.5,
  } = options

  for (const line of dimensions) {
    const isSelected = line.id === selectedLineId
    const x1 = line.start_ratio[0] * width
    const y1 = line.start_ratio[1] * height
    const x2 = line.end_ratio[0] * width
    const y2 = line.end_ratio[1] * height

    const lineColor = isSelected
      ? '#FF3B30' // Laser Red for selected line
      : line.color ?? '#00E5FF' // Blueprint Cyan default

    ctx.save()
    ctx.lineWidth = isSelected ? lineWidth + 1.5 : lineWidth
    ctx.strokeStyle = lineColor
    ctx.fillStyle = lineColor

    // 1. Draw Main Dimension Line
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()

    // 2. Draw Arrow Heads & Ticks
    drawArrowHead(ctx, x1, y1, x2, y2, 12)
    drawArrowHead(ctx, x2, y2, x1, y1, 12)

    // 3. Draw End Tick Lines (Perpendicular)
    drawPerpendicularTick(ctx, x1, y1, x2, y2, 8)
    drawPerpendicularTick(ctx, x2, y2, x1, y1, 8)

    const dx = x2 - x1
    const dy = y2 - y1
    const lineLen = Math.hypot(dx, dy)
    const angle = Math.atan2(dy, dx)
    // Perpendicular unit vector (points "above" the line)
    const perpX = -Math.sin(angle)
    const perpY = Math.cos(angle)

    // Check if line has sub-segments (Continuous Multi-Segment Dimension Chain)
    const subSegments = line.sub_segments && line.sub_segments.length > 0
      ? [...line.sub_segments].sort((a, b) => a.ratio - b.ratio)
      : []

    if (subSegments.length > 0) {
      // Draw intermediate division ticks and sub-segment labels
      let prevRatio = 0
      let prevX = x1
      let prevY = y1

      for (let i = 0; i < subSegments.length; i++) {
        const seg = subSegments[i]
        const currX = x1 + dx * seg.ratio
        const currY = y1 + dy * seg.ratio

        // Draw intermediate tick
        drawPerpendicularTick(ctx, currX, currY, currX + dx, currY + dy, 10)

        // Draw segment dimension badge along this span (offset slightly above)
        const segMidX = (prevX + currX) / 2 + perpX * 18
        const segMidY = (prevY + currY) / 2 + perpY * 18
        const segText = seg.distance_m > 0
          ? `${seg.distance_m.toFixed(3)} m`
          : `${(seg.distance_mm / 1000).toFixed(3)} m`
        const segDisplay = seg.label ? `${seg.label}: ${segText}` : segText
        drawMiniBadge(ctx, segMidX, segMidY, segDisplay, isSelected, lineColor)

        prevRatio = seg.ratio
        prevX = currX
        prevY = currY
      }

      // Final segment from last division to end
      if (prevRatio < 0.999) {
        const finalMidX = (prevX + x2) / 2 + perpX * 18
        const finalMidY = (prevY + y2) / 2 + perpY * 18
        const remainderDistMm = Math.max(0, line.distance_mm - subSegments.reduce((sum, s) => sum + s.distance_mm, 0))
        const finalDisplay = `${(remainderDistMm / 1000).toFixed(3)} m`
        drawMiniBadge(ctx, finalMidX, finalMidY, finalDisplay, isSelected, lineColor)
      }

      // Draw Cumulative Total Badge below the line
      const totalMidX = (x1 + x2) / 2 - perpX * 22
      const totalMidY = (y1 + y2) / 2 - perpY * 22
      const totalValue = unit === 'm'
        ? `${line.distance_m.toFixed(3)} m`
        : `${line.distance_mm.toLocaleString()} mm`
      const displayTotal = showLabels && line.label
        ? `[รวม] ${line.label}: ${totalValue}`
        : `[รวม] ${totalValue}`
      drawDimensionBadge(ctx, totalMidX, totalMidY, displayTotal, isSelected, lineColor)
    } else {
      // 4. Draw Center Dimension Badge (Single span)
      const midX = (x1 + x2) / 2
      const midY = (y1 + y2) / 2

      const textValue = unit === 'm'
        ? `${line.distance_m.toFixed(3)} m`
        : `${line.distance_mm.toLocaleString()} mm`

      const displayLabel = showLabels && line.label
        ? `${line.label}: ${textValue}`
        : textValue

      drawDimensionBadge(ctx, midX, midY, displayLabel, isSelected, lineColor)
    }

    ctx.restore()
  }
}

/**
 * Draws surface area boxes (for Paint, Tile, Wallpaper, Masonry)
 * with translucent fill, boundary dashed stroke, width/height markers,
 * and calculated net m² callouts.
 */
export function renderAreaOverlays(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  areas: PhotoAreaBox[],
  options: AreaRenderOptions = {}
): void {
  const {
    selectedAreaId = null,
    showLabels = true,
    lineWidth = 2.0,
  } = options

  for (const area of areas) {
    const isSelected = area.id === selectedAreaId
    const [rx, ry, rw, rh] = area.bounds_ratio
    const x = rx * width
    const y = ry * height
    const w = rw * width
    const h = rh * height

    const boxColor = isSelected ? '#FF3B30' : area.color ?? '#10B981'
    const fillColor = isSelected
      ? 'rgba(255, 59, 48, 0.22)'
      : 'rgba(16, 185, 129, 0.16)'

    ctx.save()

    // 1. Semi-transparent surface fill
    ctx.fillStyle = fillColor
    ctx.fillRect(x, y, w, h)

    // 1.1 Tile Layout Grid Preview (if category is tile)
    if (area.category === 'tile' && area.tile_config && area.tile_config.show_grid !== false) {
      drawTileGridLines(
        ctx,
        x,
        y,
        w,
        h,
        area.width_mm,
        area.height_mm,
        area.tile_config.tile_width_cm,
        area.tile_config.tile_length_cm,
        isSelected
      )
    }

    // 2. Dashed bounding border
    ctx.strokeStyle = boxColor
    ctx.lineWidth = isSelected ? lineWidth + 1 : lineWidth
    ctx.setLineDash([6, 4])
    ctx.strokeRect(x, y, w, h)
    ctx.setLineDash([])


    // 3. Corner architectural brackets
    drawCornerBrackets(ctx, x, y, w, h, 10, boxColor, 2.5)

    // 4. Width badge along top edge
    const topMidX = x + w / 2
    const topMidY = y - 10
    const widthText = `กว้าง ${(area.width_mm / 1000).toFixed(2)} m`
    drawMiniBadge(ctx, topMidX, topMidY, widthText, isSelected, boxColor)

    // 5. Height badge along right edge
    const rightMidX = x + w + 12
    const rightMidY = y + h / 2
    const heightText = `สูง ${(area.height_mm / 1000).toFixed(2)} m`
    drawMiniBadge(ctx, rightMidX, rightMidY, heightText, isSelected, boxColor)

    // 6. Center callout badge with gross and net m²
    const centerX = x + w / 2
    const centerY = y + h / 2
    drawAreaCenterBadge(ctx, centerX, centerY, area, isSelected, boxColor)

    ctx.restore()
  }
}

function drawCornerBrackets(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  len: number,
  color: string,
  bracketWidth: number
): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = bracketWidth
  ctx.beginPath()

  // Top-Left
  ctx.moveTo(x, y + len)
  ctx.lineTo(x, y)
  ctx.lineTo(x + len, y)

  // Top-Right
  ctx.moveTo(x + w - len, y)
  ctx.lineTo(x + w, y)
  ctx.lineTo(x + w, y + len)

  // Bottom-Left
  ctx.moveTo(x, y + h - len)
  ctx.lineTo(x, y + h)
  ctx.lineTo(x + len, y + h)

  // Bottom-Right
  ctx.moveTo(x + w - len, y + h)
  ctx.lineTo(x + w, y + h)
  ctx.lineTo(x + w, y + h - len)

  ctx.stroke()
  ctx.restore()
}

function drawAreaCenterBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  area: PhotoAreaBox,
  isSelected: boolean,
  color: string
): void {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const isTile = area.category === 'tile' && !!area.tile_result
  const tileResult = area.tile_result

  if (isTile && tileResult) {
    const boxWidth = 240
    const boxHeight = 74
    const radius = 6

    // Badge background
    ctx.fillStyle = isSelected ? '#1E293B' : '#0B0F17'
    ctx.strokeStyle = color
    ctx.lineWidth = 1.6

    ctx.beginPath()
    ctx.roundRect(x - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight, radius)
    ctx.fill()
    ctx.stroke()

    // Title & Size
    ctx.font = 'bold 11px system-ui, sans-serif'
    ctx.fillStyle = '#FFFFFF'
    ctx.fillText(`${area.label} (${tileResult.tile_width_cm}x${tileResult.tile_length_cm} ซม.)`, x, y - 24)

    // Net Area
    ctx.font = 'bold 12px "JetBrains Mono", monospace'
    ctx.fillStyle = '#38BDF8'
    ctx.fillText(`พื้นที่สุทธิ: ${area.net_area_sqm.toFixed(2)} m²`, x, y - 8)

    // Tile Pieces & Boxes Highlight
    ctx.font = 'bold 12px "JetBrains Mono", monospace'
    ctx.fillStyle = '#10B981'
    ctx.fillText(`🧱 ใช้ ${tileResult.total_pieces} แผ่น (${tileResult.total_boxes} กล่อง · เผื่อ ${tileResult.waste_percent}%)`, x, y + 10)

    // Mortar & Grout
    ctx.font = '10px system-ui, sans-serif'
    ctx.fillStyle = '#94A3B8'
    ctx.fillText(`ปูนกาว: ${tileResult.mortar_bags_20kg} ถุง · ยาแนว: ${tileResult.grout_bags_1kg} ถุง`, x, y + 25)
    return
  }

  const titleText = area.label || 'พื้นที่'
  const grossText = `พื้นที่: ${area.area_sqm.toFixed(2)} m²`
  const deductionText = area.deductions_sqm > 0
    ? `หักช่องเปิด -${area.deductions_sqm.toFixed(2)} m²`
    : null
  const netText = area.deductions_sqm > 0
    ? `สุทธิ: ${area.net_area_sqm.toFixed(2)} m²`
    : null

  const boxWidth = 160
  const boxHeight = deductionText ? 62 : 44
  const radius = 6

  // Badge background
  ctx.fillStyle = isSelected ? '#1E293B' : '#0B0F17'
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5

  ctx.beginPath()
  ctx.roundRect(x - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight, radius)
  ctx.fill()
  ctx.stroke()

  // Title
  ctx.font = 'bold 11px system-ui, sans-serif'
  ctx.fillStyle = '#FFFFFF'
  ctx.fillText(titleText, x, y - (deductionText ? 18 : 10))

  // Area text
  ctx.font = 'bold 13px "JetBrains Mono", monospace'
  ctx.fillStyle = color
  ctx.fillText(grossText, x, y + (deductionText ? -2 : 8))

  // Deduction & Net
  if (deductionText && netText) {
    ctx.font = '10px system-ui, monospace'
    ctx.fillStyle = '#94A3B8'
    ctx.fillText(`${deductionText} · ${netText}`, x, y + 16)
  }
}

function drawTileGridLines(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  width_mm: number,
  height_mm: number,
  tile_w_cm: number,
  tile_l_cm: number,
  isSelected: boolean
): void {
  const tile_w_mm = tile_w_cm * 10
  const tile_h_mm = tile_l_cm * 10
  if (tile_w_mm <= 0 || tile_h_mm <= 0 || width_mm <= 0 || height_mm <= 0) return

  const cols = width_mm / tile_w_mm
  const rows = height_mm / tile_h_mm
  const stepX = w / cols
  const stepY = h / rows

  if (stepX < 8 || stepY < 8) return

  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()

  ctx.strokeStyle = isSelected ? 'rgba(255, 59, 48, 0.40)' : 'rgba(56, 189, 248, 0.32)'
  ctx.lineWidth = 1

  ctx.beginPath()
  for (let gx = x + stepX; gx < x + w - 1; gx += stepX) {
    ctx.moveTo(gx, y)
    ctx.lineTo(gx, y + h)
  }
  for (let gy = y + stepY; gy < y + h - 1; gy += stepY) {
    ctx.moveTo(x, gy)
    ctx.lineTo(x + w, gy)
  }
  ctx.stroke()
  ctx.restore()
}


function drawMiniBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  isSelected: boolean,
  borderColor: string
): void {
  ctx.font = 'bold 11px "JetBrains Mono", "Roboto Mono", monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const metrics = ctx.measureText(text)
  const paddingX = 6
  const paddingY = 3
  const boxWidth = metrics.width + paddingX * 2
  const boxHeight = 18
  const radius = 3

  ctx.fillStyle = isSelected ? '#1E293B' : '#0B0F17'
  ctx.strokeStyle = borderColor
  ctx.lineWidth = 1.2

  ctx.beginPath()
  ctx.roundRect(x - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight, radius)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = isSelected ? '#FFFFFF' : '#F8FAFC'
  ctx.fillText(text, x, y)
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  headLength: number
): void {
  const dx = toX - fromX
  const dy = toY - fromY
  const angle = Math.atan2(dy, dx)

  ctx.beginPath()
  ctx.moveTo(fromX, fromY)
  ctx.lineTo(
    fromX + headLength * Math.cos(angle - Math.PI / 6),
    fromY + headLength * Math.sin(angle - Math.PI / 6)
  )
  ctx.lineTo(
    fromX + headLength * Math.cos(angle + Math.PI / 6),
    fromY + headLength * Math.sin(angle + Math.PI / 6)
  )
  ctx.closePath()
  ctx.fill()
}

function drawPerpendicularTick(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  targetX: number,
  targetY: number,
  tickLength: number
): void {
  const dx = targetX - x
  const dy = targetY - y
  const angle = Math.atan2(dy, dx) + Math.PI / 2

  ctx.beginPath()
  ctx.moveTo(x - tickLength * Math.cos(angle), y - tickLength * Math.sin(angle))
  ctx.lineTo(x + tickLength * Math.cos(angle), y + tickLength * Math.sin(angle))
  ctx.stroke()
}

function drawDimensionBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  isSelected: boolean,
  borderColor: string
): void {
  ctx.font = 'bold 13px "JetBrains Mono", "Roboto Mono", monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const metrics = ctx.measureText(text)
  const paddingX = 8
  const paddingY = 4
  const boxWidth = metrics.width + paddingX * 2
  const boxHeight = 22
  const radius = 4

  // Badge background (Deep slate with border)
  ctx.fillStyle = isSelected ? '#1E293B' : '#0B0F17'
  ctx.strokeStyle = borderColor
  ctx.lineWidth = 1.5

  ctx.beginPath()
  ctx.roundRect(x - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight, radius)
  ctx.fill()
  ctx.stroke()

  // Badge Text
  ctx.fillStyle = isSelected ? '#FFFFFF' : '#00E5FF'
  ctx.fillText(text, x, y)
}

/**
 * Exports the entire photo with stamped dimensions and surface area boxes as a high-resolution image data URL.
 */
export async function exportAnnotatedPhotoImage(
  session: PhotoDimensionSession,
  unit: 'm' | 'mm' = 'm'
): Promise<string> {
  const canvas = document.createElement('canvas')
  const width = session.image_natural_width || 1920
  const height = session.image_natural_height || 1080
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get 2d context')

  // Load and draw base image
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = session.image_data_url

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = reject
  })

  ctx.drawImage(img, 0, 0, width, height)

  // 1. Render Area Overlays if present
  if (session.areas && session.areas.length > 0) {
    renderAreaOverlays(ctx, width, height, session.areas, {
      lineWidth: 2.5,
      showLabels: true,
    })
  }

  // 2. Render Vector Dimensions on top
  renderDimensionOverlays(ctx, width, height, session.dimensions, {
    unit,
    showLabels: true,
    lineWidth: 3,
  })

  // 3. Render Stamp Footer
  ctx.fillStyle = 'rgba(11, 15, 23, 0.88)'
  ctx.fillRect(0, height - 36, width, 36)

  ctx.fillStyle = '#FFFFFF'
  ctx.font = '12px "Inter", sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const title = session.title || 'Site Survey Laser Inspection'
  const time = session.captured_at ? new Date(session.captured_at).toLocaleString('th-TH') : ''
  const dimCount = session.dimensions.length
  const areaCount = session.areas ? session.areas.length : 0
  const metaText = `ConstructFlow Site Survey | ${title} | ${dimCount} ระยะ · ${areaCount} ผนังคำนวณ m² | ${time}`
  ctx.fillText(metaText, 16, height - 18)

  return canvas.toDataURL('image/jpeg', 0.92)
}
