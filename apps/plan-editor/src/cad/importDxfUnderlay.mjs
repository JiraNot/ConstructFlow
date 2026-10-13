const UNIT_TO_MM = new Map([
  [0, ['unitless', 1]], [1, ['inches', 25.4]], [2, ['feet', 304.8]], [3, ['miles', 1_609_344]],
  [4, ['millimeters', 1]], [5, ['centimeters', 10]], [6, ['meters', 1000]], [7, ['kilometers', 1_000_000]],
])

function readPairs(source) {
  const lines = source.replace(/^\uFEFF/, '').split(/\r?\n/)
  const pairs = []
  for (let index = 0; index + 1 < lines.length; index += 2) {
    const code = lines[index].trim()
    if (!/^\d+$/.test(code)) continue
    pairs.push({ code: Number(code), value: lines[index + 1].trim() })
  }
  return pairs
}

function readEntities(pairs) {
  const entities = []
  let section = ''
  let entity = null
  for (let index = 0; index < pairs.length; index += 1) {
    const pair = pairs[index]
    if (pair.code === 0 && pair.value === 'SECTION') {
      section = pairs[index + 1]?.code === 2 ? pairs[index + 1].value : ''
      index += 1
      entity = null
      continue
    }
    if (pair.code === 0 && pair.value === 'ENDSEC') {
      if (section === 'ENTITIES' && entity) entities.push(entity)
      section = ''
      entity = null
      continue
    }
    if (section !== 'ENTITIES') continue
    if (pair.code === 0) {
      if (entity) entities.push(entity)
      entity = { type: pair.value, pairs: [] }
    } else if (entity) entity.pairs.push(pair)
  }
  if (section === 'ENTITIES' && entity) entities.push(entity)
  return entities
}

function valueOf(entity, code) {
  return entity.pairs.find(pair => pair.code === code)?.value
}

function numberOf(entity, code) {
  const value = Number(valueOf(entity, code))
  return Number.isFinite(value) ? value : null
}

function polylinePoints(entity) {
  const points = []
  let current = null
  for (const pair of entity.pairs) {
    if (pair.code === 10) {
      if (current && Number.isFinite(current[1])) points.push(current)
      const x = Number(pair.value)
      current = Number.isFinite(x) ? [x, NaN] : null
    } else if (pair.code === 20 && current) {
      const y = Number(pair.value)
      if (Number.isFinite(y)) current[1] = y
    }
  }
  if (current && Number.isFinite(current[1])) points.push(current)
  return points
}

function resolveDrawingUnits(pairs) {
  for (let index = 0; index < pairs.length; index += 1) {
    if (pairs[index].code !== 9 || pairs[index].value !== '$INSUNITS') continue
    const unitPair = pairs.slice(index + 1).find(pair => pair.code === 70)
    if (unitPair) return UNIT_TO_MM.get(Number(unitPair.value)) ?? UNIT_TO_MM.get(0)
  }
  return UNIT_TO_MM.get(0)
}

/** Parses common model-space vector entities into a lightweight, calibrated SVG underlay. */
export function importDxfUnderlay(source, { maxImageDimension = 4096 } = {}) {
  const pairs = readPairs(source)
  if (!pairs.length) throw new Error('ไฟล์ DXF ไม่มีข้อมูล group code ที่อ่านได้')
  const [unitName, millimetersPerUnit] = resolveDrawingUnits(pairs)
  const entities = readEntities(pairs)
  const geometry = []
  let unsupportedEntities = 0
  const addPolyline = (points, closed = false) => {
    if (points.length < 2) return false
    geometry.push({ kind: 'polyline', points, closed })
    return true
  }

  for (const entity of entities) {
    if (entity.type === 'LINE') {
      const x1 = numberOf(entity, 10), y1 = numberOf(entity, 20), x2 = numberOf(entity, 11), y2 = numberOf(entity, 21)
      if ([x1, y1, x2, y2].every(Number.isFinite)) addPolyline([[x1, y1], [x2, y2]])
      else unsupportedEntities += 1
    } else if (entity.type === 'LWPOLYLINE') {
      const closed = (Number(valueOf(entity, 70) ?? 0) & 1) === 1
      if (!addPolyline(polylinePoints(entity), closed)) unsupportedEntities += 1
    } else if (entity.type === 'CIRCLE' || entity.type === 'ARC') {
      const x = numberOf(entity, 10), y = numberOf(entity, 20), radius = numberOf(entity, 40)
      if (![x, y, radius].every(Number.isFinite) || radius <= 0) { unsupportedEntities += 1; continue }
      const start = entity.type === 'ARC' ? numberOf(entity, 50) ?? 0 : 0
      const end = entity.type === 'ARC' ? numberOf(entity, 51) ?? 360 : 360
      let sweep = (end - start + 360) % 360
      if (entity.type === 'CIRCLE') sweep = 360
      const segments = entity.type === 'CIRCLE' ? 64 : Math.max(8, Math.ceil(sweep / 6))
      const points = Array.from({ length: segments + 1 }, (_, index) => {
        const angle = (start + sweep * index / segments) * Math.PI / 180
        return [x + Math.cos(angle) * radius, y + Math.sin(angle) * radius]
      })
      addPolyline(points, entity.type === 'CIRCLE')
    } else if (!['ENDSEC', 'EOF'].includes(entity.type)) unsupportedEntities += 1
  }

  if (!geometry.length) throw new Error('ไม่พบ LINE, LWPOLYLINE, CIRCLE หรือ ARC ที่ใช้เป็น underlay ได้')
  const points = geometry.flatMap(shape => shape.points)
  const minX = Math.min(...points.map(point => point[0]))
  const maxX = Math.max(...points.map(point => point[0]))
  const minY = Math.min(...points.map(point => point[1]))
  const maxY = Math.max(...points.map(point => point[1]))
  const margin = Math.max(maxX - minX, maxY - minY, 1) * 0.015
  const left = minX - margin, bottom = minY - margin, right = maxX + margin, top = maxY + margin
  const spanX = Math.max(right - left, 1), spanY = Math.max(top - bottom, 1)
  const pixelsPerUnit = Math.min(1, maxImageDimension / Math.max(spanX, spanY))
  const width = Math.max(1, Math.ceil(spanX * pixelsPerUnit))
  const height = Math.max(1, Math.ceil(spanY * pixelsPerUnit))
  const shapes = geometry.map(shape => {
    const points = shape.points.map(([x, y]) => [((x - left) * pixelsPerUnit).toFixed(2), ((y - bottom) * pixelsPerUnit).toFixed(2)])
    const path = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x} ${y}`).join(' ')
    return `<path d="${path}${shape.closed ? ' Z' : ''}"/>`
  }).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}px" height="${height}px" viewBox="0 0 ${width} ${height}"><g transform="translate(0 ${height}) scale(1 -1)" fill="none" stroke="#24394b" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round">${shapes}</g></svg>`
  return {
    dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    origin_mm: [left * millimetersPerUnit, top * millimetersPerUnit],
    scale_mm_per_px: millimetersPerUnit / pixelsPerUnit,
    width_px: width,
    height_px: height,
    drawing_units: unitName,
    imported_entities: geometry.length,
    skipped_entities: unsupportedEntities,
  }
}
