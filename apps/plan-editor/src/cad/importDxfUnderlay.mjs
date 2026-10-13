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

function readSectionPairs(pairs, targetName) {
  let section = ''
  let target = null
  for (let index = 0; index < pairs.length; index += 1) {
    const pair = pairs[index]
    if (pair.code === 0 && pair.value === 'SECTION') {
      section = pairs[index + 1]?.code === 2 ? pairs[index + 1].value : ''
      index += 1
      target = section === targetName ? [] : null
      continue
    }
    if (pair.code === 0 && pair.value === 'ENDSEC') {
      section = ''
      if (target) return target
      target = null
      continue
    }
    if (section === targetName && target) target.push(pair)
  }
  return target ?? []
}

function parseEntities(pairs) {
  const entities = []
  let entity = null
  for (const pair of pairs) {
    if (pair.code === 0) {
      if (entity) entities.push(entity)
      entity = { type: pair.value, pairs: [] }
    } else if (entity) entity.pairs.push(pair)
  }
  if (entity) entities.push(entity)
  return entities
}

function readBlocks(pairs) {
  const blocks = new Map()
  let block = null
  let entity = null
  const finishEntity = () => {
    if (entity && block) block.entities.push(entity)
    entity = null
  }
  for (const pair of pairs) {
    if (pair.code === 0) {
      finishEntity()
      if (pair.value === 'BLOCK') block = { headerPairs: [], entities: [] }
      else if (pair.value === 'ENDBLK') {
        if (block) {
          const name = valueOf({ pairs: block.headerPairs }, 2) ?? valueOf({ pairs: block.headerPairs }, 3)
          if (name) blocks.set(name.toUpperCase(), { base: [numberOf({ pairs: block.headerPairs }, 10) ?? 0, numberOf({ pairs: block.headerPairs }, 20) ?? 0], entities: block.entities })
        }
        block = null
      } else if (block) entity = { type: pair.value, pairs: [] }
    } else if (!block) continue
    else if (entity) entity.pairs.push(pair)
    else block.headerPairs.push(pair)
  }
  finishEntity()
  return blocks
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

const IDENTITY = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }
function multiplyTransforms(parent, child) {
  return {
    a: parent.a * child.a + parent.c * child.b,
    b: parent.b * child.a + parent.d * child.b,
    c: parent.a * child.c + parent.c * child.d,
    d: parent.b * child.c + parent.d * child.d,
    tx: parent.a * child.tx + parent.c * child.ty + parent.tx,
    ty: parent.b * child.tx + parent.d * child.ty + parent.ty,
  }
}

function transformPoint([x, y], transform) {
  return [transform.a * x + transform.c * y + transform.tx, transform.b * x + transform.d * y + transform.ty]
}

function shapesForEntity(entity) {
  if (entity.type === 'LINE') {
    const x1 = numberOf(entity, 10), y1 = numberOf(entity, 20), x2 = numberOf(entity, 11), y2 = numberOf(entity, 21)
    return [x1, y1, x2, y2].every(Number.isFinite) ? [{ kind: 'polyline', points: [[x1, y1], [x2, y2]], closed: false }] : null
  }
  if (entity.type === 'LWPOLYLINE') {
    const points = polylinePoints(entity)
    return points.length >= 2 ? [{ kind: 'polyline', points, closed: (Number(valueOf(entity, 70) ?? 0) & 1) === 1 }] : null
  }
  if (entity.type === 'CIRCLE' || entity.type === 'ARC') {
    const x = numberOf(entity, 10), y = numberOf(entity, 20), radius = numberOf(entity, 40)
    if (![x, y, radius].every(Number.isFinite) || radius <= 0) return null
    const start = entity.type === 'ARC' ? numberOf(entity, 50) ?? 0 : 0
    const end = entity.type === 'ARC' ? numberOf(entity, 51) ?? 360 : 360
    let sweep = (end - start + 360) % 360
    if (entity.type === 'CIRCLE') sweep = 360
    const segments = entity.type === 'CIRCLE' ? 64 : Math.max(8, Math.ceil(sweep / 6))
    const points = Array.from({ length: segments + 1 }, (_, index) => {
      const angle = (start + sweep * index / segments) * Math.PI / 180
      return [x + Math.cos(angle) * radius, y + Math.sin(angle) * radius]
    })
    return [{ kind: 'polyline', points, closed: entity.type === 'CIRCLE' }]
  }
  return null
}

function insertTransform(entity, block, column = 0, row = 0) {
  const x = numberOf(entity, 10) ?? 0, y = numberOf(entity, 20) ?? 0
  const scaleX = numberOf(entity, 41) ?? 1, scaleY = numberOf(entity, 42) ?? 1
  const radians = (numberOf(entity, 50) ?? 0) * Math.PI / 180
  const cos = Math.cos(radians), sin = Math.sin(radians)
  const a = cos * scaleX, b = sin * scaleX, c = -sin * scaleY, d = cos * scaleY
  const baseX = block.base[0], baseY = block.base[1]
  const countX = Math.max(1, Math.floor(numberOf(entity, 70) ?? 1))
  const countY = Math.max(1, Math.floor(numberOf(entity, 71) ?? 1))
  const spacedX = (numberOf(entity, 44) ?? 0) * column
  const spacedY = (numberOf(entity, 45) ?? 0) * row
  return {
    a, b, c, d,
    tx: x + a * spacedX + c * spacedY - a * baseX - c * baseY,
    ty: y + b * spacedX + d * spacedY - b * baseX - d * baseY,
    countX, countY,
  }
}

function expandEntities(entities, blocks, transform, geometry, onUnsupported, stack = new Set(), depth = 0) {
  for (const entity of entities) {
    if (entity.type === 'INSERT') {
      const name = valueOf(entity, 2)?.toUpperCase()
      const block = name ? blocks.get(name) : null
      if (!block || stack.has(name) || depth >= 16) { onUnsupported(); continue }
      const base = insertTransform(entity, block)
      const count = base.countX * base.countY
      if (count > 1000) { onUnsupported(); continue }
      const nextStack = new Set(stack)
      nextStack.add(name)
      for (let row = 0; row < base.countY; row += 1) for (let column = 0; column < base.countX; column += 1) {
        const local = insertTransform(entity, block, column, row)
        expandEntities(block.entities, blocks, multiplyTransforms(transform, local), geometry, onUnsupported, nextStack, depth + 1)
      }
      continue
    }
    const shapes = shapesForEntity(entity)
    if (shapes) {
      for (const shape of shapes) geometry.push({ ...shape, points: shape.points.map(point => transformPoint(point, transform)) })
    } else if (!['ATTRIB', 'SEQEND', 'ENDBLK', 'BLOCK', 'ENDSEC', 'EOF'].includes(entity.type)) onUnsupported()
  }
}

/** Parses common model-space vector entities into a lightweight, calibrated SVG underlay. */
export function importDxfUnderlay(source, { maxImageDimension = 4096 } = {}) {
  const pairs = readPairs(source)
  if (!pairs.length) throw new Error('ไฟล์ DXF ไม่มีข้อมูล group code ที่อ่านได้')
  const [unitName, millimetersPerUnit] = resolveDrawingUnits(pairs)
  const entities = parseEntities(readSectionPairs(pairs, 'ENTITIES'))
  const blocks = readBlocks(readSectionPairs(pairs, 'BLOCKS'))
  const geometry = []
  let unsupportedEntities = 0
  expandEntities(entities, blocks, IDENTITY, geometry, () => { unsupportedEntities += 1 })

  if (!geometry.length) throw new Error('ไม่พบ LINE, LWPOLYLINE, CIRCLE, ARC หรือ INSERT ที่ใช้เป็น underlay ได้')
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
