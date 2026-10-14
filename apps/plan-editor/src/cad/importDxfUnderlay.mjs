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
  return collectLegacyPolylines(entities)
}

function collectLegacyPolylines(entities) {
  const collected = []
  for (let index = 0; index < entities.length; index += 1) {
    const entity = entities[index]
    if (entity.type !== 'POLYLINE') {
      if (entity.type !== 'VERTEX' && entity.type !== 'SEQEND') collected.push(entity)
      continue
    }
    const vertices = []
    let cursor = index + 1
    while (cursor < entities.length && entities[cursor].type === 'VERTEX') vertices.push(entities[cursor++])
    if (entities[cursor]?.type === 'SEQEND') cursor += 1
    collected.push({ ...entity, vertices })
    index = cursor - 1
  }
  return collected
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
          if (name) blocks.set(name.toUpperCase(), { base: [numberOf({ pairs: block.headerPairs }, 10) ?? 0, numberOf({ pairs: block.headerPairs }, 20) ?? 0], entities: collectLegacyPolylines(block.entities) })
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

function numbersOf(entity, code) {
  return entity.pairs.filter(pair => pair.code === code).map(pair => Number(pair.value))
}

function evaluateSplinePoint(controlPoints, knots, degree, parameter) {
  const lastControl = controlPoints.length - 1
  let span = lastControl
  if (parameter < knots[lastControl + 1]) {
    let low = degree, high = lastControl + 1
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2)
      if (parameter < knots[middle]) high = middle
      else low = middle
    }
    span = low
  }
  const work = []
  for (let index = 0; index <= degree; index += 1) {
    const control = controlPoints[span - degree + index]
    work.push([control[0] * control[2], control[1] * control[2], control[2]])
  }
  for (let level = 1; level <= degree; level += 1) {
    for (let index = degree; index >= level; index -= 1) {
      const knotIndex = span - degree + index
      const denominator = knots[knotIndex + degree - level + 1] - knots[knotIndex]
      const alpha = denominator === 0 ? 0 : (parameter - knots[knotIndex]) / denominator
      for (let axis = 0; axis < 3; axis += 1) {
        work[index][axis] = (1 - alpha) * work[index - 1][axis] + alpha * work[index][axis]
      }
    }
  }
  const weight = work[degree][2]
  return weight > 1e-12 ? [work[degree][0] / weight, work[degree][1] / weight] : null
}

function splineShape(entity) {
  const degree = numberOf(entity, 71)
  const declaredCount = numberOf(entity, 73)
  const declaredKnotCount = numberOf(entity, 72)
  const xs = numbersOf(entity, 10), ys = numbersOf(entity, 20), zs = numbersOf(entity, 30)
  const knots = numbersOf(entity, 40), weights = numbersOf(entity, 41)
  if (!Number.isInteger(degree) || degree < 1 || degree > 10 || xs.length < degree + 1 || xs.length > 2000 ||
    ys.length !== xs.length || (declaredCount !== null && declaredCount !== xs.length) ||
    knots.length !== xs.length + degree + 1 || (declaredKnotCount !== null && declaredKnotCount !== knots.length) || !knots.every(Number.isFinite) ||
    !xs.every(Number.isFinite) || !ys.every(Number.isFinite) ||
    (zs.length > 0 && (!zs.every(Number.isFinite) || zs.some(value => Math.abs(value) > 1e-6))) ||
    (weights.length > 0 && (weights.length !== xs.length || !weights.every(value => Number.isFinite(value) && value > 0))) ||
    knots.some((value, index) => index > 0 && value < knots[index - 1])) return null

  const controlPoints = xs.map((x, index) => [x, ys[index], weights[index] ?? 1])
  const start = knots[degree], end = knots[xs.length]
  if (!(end > start)) return null
  const segments = Math.max(16, Math.min(720, (xs.length - degree) * 24))
  const points = []
  for (let index = 0; index <= segments; index += 1) {
    const point = evaluateSplinePoint(controlPoints, knots, degree, start + (end - start) * index / segments)
    if (!point) return null
    points.push(point)
  }
  const closed = (Number(valueOf(entity, 70) ?? 0) & (1 | 2)) !== 0
  return points.length >= 2 ? { kind: 'polyline', points, closed } : null
}

function polylinePoints(entity) {
  const points = []
  let current = null
  for (const pair of entity.pairs) {
    if (pair.code === 10) {
      if (current && Number.isFinite(current[1])) points.push(current)
      const x = Number(pair.value)
      current = Number.isFinite(x) ? [x, NaN, 0] : null
    } else if (pair.code === 20 && current) {
      const y = Number(pair.value)
      if (Number.isFinite(y)) current[1] = y
    } else if (pair.code === 42 && current) {
      const bulge = Number(pair.value)
      if (Number.isFinite(bulge)) current[2] = bulge
    }
  }
  if (current && Number.isFinite(current[1])) points.push(current)
  return points
}

function approximateBulgedPolyline(vertices, closed) {
  if (vertices.length < 2) return []
  const points = []
  const edgeCount = closed ? vertices.length : vertices.length - 1
  for (let index = 0; index < edgeCount; index += 1) {
    const start = vertices[index]
    const end = vertices[(index + 1) % vertices.length]
    points.push([start[0], start[1]])
    const bulge = Number(start[2] ?? 0)
    if (!Number.isFinite(bulge) || Math.abs(bulge) < 1e-9) continue
    const dx = end[0] - start[0], dy = end[1] - start[1]
    const chord = Math.hypot(dx, dy)
    if (chord < 1e-9) continue
    const sweep = 4 * Math.atan(bulge)
    const radius = chord * (1 + bulge * bulge) / (4 * Math.abs(bulge))
    const offset = chord * (1 - bulge * bulge) / (4 * bulge)
    const centerX = (start[0] + end[0]) / 2 - dy / chord * offset
    const centerY = (start[1] + end[1]) / 2 + dx / chord * offset
    const startAngle = Math.atan2(start[1] - centerY, start[0] - centerX)
    const segments = Math.max(4, Math.ceil(Math.abs(sweep) / (Math.PI / 30)))
    for (let step = 1; step < segments; step += 1) {
      const angle = startAngle + sweep * step / segments
      points.push([centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius])
    }
  }
  if (!closed) points.push(vertices.at(-1).slice(0, 2))
  return points
}

function hatchPolylineBoundaries(entity) {
  const pairs = entity.pairs
  const paths = []
  let cursor = 0
  while (cursor < pairs.length) {
    while (cursor < pairs.length && pairs[cursor].code !== 92) cursor += 1
    if (cursor >= pairs.length) break
    const flags = Number(pairs[cursor]?.value)
    cursor += 1
    const nextPath = pairs.findIndex((pair, index) => index >= cursor && pair.code === 92)
    const pathEnd = nextPath < 0 ? pairs.length : nextPath
    const pathPairs = pairs.slice(cursor, pathEnd)
    cursor = pathEnd
    if (!Number.isFinite(flags) || (flags & 2) === 0) continue
    const closed = Number(pathPairs.find((pair, index) => index < 2 && pair.code === 73)?.value ?? 0) === 1
    const countPair = pathPairs.find(pair => pair.code === 93)
    const count = Math.floor(Number(countPair?.value))
    if (!Number.isFinite(count) || count < 2 || count > 10000) continue
    const countIndex = pathPairs.indexOf(countPair)
    const vertices = []
    let vertex = null
    for (const pair of pathPairs.slice(countIndex + 1)) {
      if (pair.code === 10) {
        if (vertex && Number.isFinite(vertex[1])) vertices.push(vertex)
        const x = Number(pair.value)
        vertex = Number.isFinite(x) ? [x, NaN, 0] : null
      } else if (pair.code === 20 && vertex) {
        const y = Number(pair.value)
        if (Number.isFinite(y)) vertex[1] = y
      } else if (pair.code === 42 && vertex) {
        const bulge = Number(pair.value)
        if (Number.isFinite(bulge)) vertex[2] = bulge
      }
      if (vertices.length >= count) break
    }
    if (vertex && Number.isFinite(vertex[1]) && vertices.length < count) vertices.push(vertex)
    if (vertices.length === count) {
      const points = approximateBulgedPolyline(vertices, closed)
      if (points.length >= 2) paths.push({ kind: 'polyline', points, closed })
    }
  }
  return paths
}

function hatchArcPoints(centerX, centerY, radius, startDegrees, endDegrees, counterClockwise) {
  if (![centerX, centerY, radius, startDegrees, endDegrees].every(Number.isFinite) || radius <= 0) return null
  const fullCircle = Math.abs(endDegrees - startDegrees) >= 360 - 1e-8
  const direction = counterClockwise ? 1 : -1
  let sweep = ((endDegrees - startDegrees) * direction % 360 + 360) % 360
  if (fullCircle) sweep = 360
  if (sweep < 1e-8) return null
  const segments = Math.max(4, Math.min(720, Math.ceil(sweep / 5)))
  return Array.from({ length: segments + 1 }, (_, index) => {
    const angle = (startDegrees + direction * sweep * index / segments) * Math.PI / 180
    return [centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius]
  })
}

function hatchEllipsePoints(centerX, centerY, majorX, majorY, ratio, start, end, counterClockwise) {
  if (![centerX, centerY, majorX, majorY, ratio, start, end].every(Number.isFinite) || ratio <= 0 || Math.hypot(majorX, majorY) < 1e-9) return null
  const fullEllipse = Math.abs(end - start) >= Math.PI * 2 - 1e-8
  const direction = counterClockwise ? 1 : -1
  let sweep = ((end - start) * direction % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
  if (fullEllipse) sweep = Math.PI * 2
  if (sweep < 1e-8) return null
  const segments = Math.max(8, Math.min(720, Math.ceil(sweep / (Math.PI / 36))))
  return Array.from({ length: segments + 1 }, (_, index) => {
    const angle = start + direction * sweep * index / segments
    const majorFactor = Math.cos(angle), minorFactor = Math.sin(angle) * ratio
    return [centerX + majorX * majorFactor - majorY * minorFactor, centerY + majorY * majorFactor + majorX * minorFactor]
  })
}

function hatchSplinePoints(edgePairs) {
  const splinePairs = []
  for (const pair of edgePairs) {
    if (pair.code === 94) splinePairs.push({ code: 71, value: pair.value })
    else if (pair.code === 95) splinePairs.push({ code: 72, value: pair.value })
    else if (pair.code === 96) splinePairs.push({ code: 73, value: pair.value })
    else if (pair.code === 74) splinePairs.push({ code: 70, value: Number(pair.value) === 1 ? '1' : '0' })
    else if (pair.code === 42) splinePairs.push({ code: 41, value: pair.value })
    else if ([10, 20, 40].includes(pair.code)) splinePairs.push(pair)
  }
  return splineShape({ pairs: splinePairs })?.points ?? null
}

function hatchEdgeBoundaries(pathPairs) {
  const countPair = pathPairs.find(pair => pair.code === 93)
  const count = Math.floor(Number(countPair?.value))
  if (!Number.isFinite(count) || count < 1 || count > 10000) return []
  const countIndex = pathPairs.indexOf(countPair)
  const edgeStarts = []
  for (let index = countIndex + 1; index < pathPairs.length; index += 1) {
    if (pathPairs[index].code === 72) edgeStarts.push(index)
  }
  if (edgeStarts.length !== count) return []

  const points = []
  for (let edgeIndex = 0; edgeIndex < edgeStarts.length; edgeIndex += 1) {
    const edgeStart = edgeStarts[edgeIndex]
    const edgeEnd = edgeStarts[edgeIndex + 1] ?? pathPairs.length
    const edgeType = Number(pathPairs[edgeStart].value)
    const edgePairs = pathPairs.slice(edgeStart + 1, edgeEnd)
    const value = code => {
      const pair = edgePairs.find(candidate => candidate.code === code)
      const parsed = pair ? Number(pair.value) : NaN
      return Number.isFinite(parsed) ? parsed : null
    }
    let edgePoints
    if (edgeType === 1) {
      const startX = value(10), startY = value(20), endX = value(11), endY = value(21)
      edgePoints = [startX, startY, endX, endY].every(Number.isFinite) ? [[startX, startY], [endX, endY]] : null
    } else if (edgeType === 2) {
      edgePoints = hatchArcPoints(value(10), value(20), value(40), value(50), value(51), value(73) !== 0)
    } else if (edgeType === 3) {
      edgePoints = hatchEllipsePoints(value(10), value(20), value(11), value(21), value(40), value(50), value(51), value(73) !== 0)
    } else if (edgeType === 4) {
      edgePoints = hatchSplinePoints(edgePairs)
    } else {
      return []
    }
    if (!edgePoints?.length) return []
    for (const point of edgePoints) {
      const previous = points.at(-1)
      if (!previous || Math.hypot(point[0] - previous[0], point[1] - previous[1]) > 1e-8) points.push(point)
    }
  }
  if (points.length < 3) return []
  const first = points[0], last = points.at(-1)
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= 1e-8) points.pop()
  return points.length >= 3 ? [{ kind: 'polyline', points, closed: true }] : []
}

function hatchBoundaries(entity) {
  const pairs = entity.pairs
  const paths = []
  let cursor = 0
  while (cursor < pairs.length) {
    while (cursor < pairs.length && pairs[cursor].code !== 92) cursor += 1
    if (cursor >= pairs.length) break
    const flags = Number(pairs[cursor]?.value)
    cursor += 1
    const nextPath = pairs.findIndex((pair, index) => index >= cursor && pair.code === 92)
    const pathEnd = nextPath < 0 ? pairs.length : nextPath
    const pathPairs = pairs.slice(cursor, pathEnd)
    cursor = pathEnd
    if (!Number.isFinite(flags)) continue
    const boundaries = (flags & 2) !== 0 ? hatchPolylineBoundaries({ pairs: [{ code: 92, value: String(flags) }, ...pathPairs] }) : hatchEdgeBoundaries(pathPairs)
    paths.push(...boundaries)
  }
  return paths
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
    const vertices = polylinePoints(entity)
    if (vertices.length < 2) return null
    const closed = (Number(valueOf(entity, 70) ?? 0) & 1) === 1
    return [{ kind: 'polyline', points: approximateBulgedPolyline(vertices, closed), closed }]
  }
  if (entity.type === 'POLYLINE') {
    const flags = Number(valueOf(entity, 70) ?? 0)
    if ((flags & (8 | 16 | 64)) !== 0) return null
    const vertices = (entity.vertices ?? []).map(vertex => {
      const x = numberOf(vertex, 10), y = numberOf(vertex, 20), bulge = numberOf(vertex, 42) ?? 0
      return Number.isFinite(x) && Number.isFinite(y) ? [x, y, bulge] : null
    }).filter(Boolean)
    if (vertices.length < 2) return null
    const closed = (flags & 1) === 1
    return [{ kind: 'polyline', points: approximateBulgedPolyline(vertices, closed), closed }]
  }
  if (entity.type === 'HATCH') {
    const boundaries = hatchBoundaries(entity)
    return boundaries.length ? boundaries : null
  }
  if (entity.type === 'SPLINE') {
    const shape = splineShape(entity)
    return shape ? [shape] : null
  }
  if (entity.type === 'ELLIPSE') {
    const centerX = numberOf(entity, 10), centerY = numberOf(entity, 20)
    const majorX = numberOf(entity, 11), majorY = numberOf(entity, 21), ratio = numberOf(entity, 40)
    if (![centerX, centerY, majorX, majorY, ratio].every(Number.isFinite) || ratio <= 0) return null
    const majorLength = Math.hypot(majorX, majorY)
    if (majorLength <= 1e-9) return null
    const start = numberOf(entity, 41) ?? 0
    const end = numberOf(entity, 42) ?? Math.PI * 2
    if (![start, end].every(Number.isFinite)) return null
    let sweep = (end - start) % (Math.PI * 2)
    if (sweep < 0) sweep += Math.PI * 2
    if (Math.abs(sweep) < 1e-9) sweep = Math.PI * 2
    const closed = Math.abs(sweep - Math.PI * 2) < 1e-9
    const segments = Math.max(8, Math.min(720, Math.ceil(sweep / (Math.PI / 36))))
    const points = Array.from({ length: segments + 1 }, (_, index) => {
      const angle = start + sweep * index / segments
      const majorFactor = Math.cos(angle), minorFactor = Math.sin(angle) * ratio
      return [centerX + majorX * majorFactor - majorY * minorFactor, centerY + majorY * majorFactor + majorX * minorFactor]
    })
    return [{ kind: 'polyline', points, closed }]
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

  if (!geometry.length) throw new Error('ไม่พบ LINE, POLYLINE, LWPOLYLINE, HATCH, SPLINE, ELLIPSE, CIRCLE, ARC หรือ INSERT ที่ใช้เป็น underlay ได้')
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
