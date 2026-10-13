export const ALIGNMENT_MODES = Object.freeze([
  'left', 'center-x', 'right', 'top', 'middle-y', 'bottom',
])

export function computeAlignmentDelta(anchorBounds, objectBounds, mode) {
  if (!anchorBounds || !objectBounds || !ALIGNMENT_MODES.includes(mode)) return null
  const anchorCenterX = (anchorBounds[0] + anchorBounds[2]) / 2
  const anchorCenterY = (anchorBounds[1] + anchorBounds[3]) / 2
  const objectCenterX = (objectBounds[0] + objectBounds[2]) / 2
  const objectCenterY = (objectBounds[1] + objectBounds[3]) / 2
  switch (mode) {
    case 'left': return [anchorBounds[0] - objectBounds[0], 0]
    case 'center-x': return [anchorCenterX - objectCenterX, 0]
    case 'right': return [anchorBounds[2] - objectBounds[2], 0]
    case 'top': return [0, anchorBounds[3] - objectBounds[3]]
    case 'middle-y': return [0, anchorCenterY - objectCenterY]
    case 'bottom': return [0, anchorBounds[1] - objectBounds[1]]
    default: return null
  }
}

export function computeOffsetDelta(startPointMm, endPointMm, distanceMm, side = 'left') {
  const dx = Number(endPointMm?.[0]) - Number(startPointMm?.[0])
  const dy = Number(endPointMm?.[1]) - Number(startPointMm?.[1])
  const length = Math.hypot(dx, dy)
  const distance = Number(distanceMm)
  if (!(length > 1) || !Number.isFinite(distance) || Math.abs(distance) < 1 || !['left', 'right'].includes(side)) return null
  const direction = side === 'left' ? 1 : -1
  const x = Math.round(-dy / length * distance * direction)
  const y = Math.round(dx / length * distance * direction)
  return [Object.is(x, -0) ? 0 : x, Object.is(y, -0) ? 0 : y]
}

export function reflectPlanPoint(pointMm, axis, coordinateMm) {
  const x = Number(pointMm?.[0])
  const y = Number(pointMm?.[1])
  const coordinate = Number(coordinateMm)
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(coordinate) || !['vertical', 'horizontal'].includes(axis)) return null
  return axis === 'vertical' ? [Math.round(2 * coordinate - x), Math.round(y)] : [Math.round(x), Math.round(2 * coordinate - y)]
}

export function splitLineAtRatio(startPointMm, endPointMm, ratio) {
  const sx = Number(startPointMm?.[0])
  const sy = Number(startPointMm?.[1])
  const ex = Number(endPointMm?.[0])
  const ey = Number(endPointMm?.[1])
  const t = Number(ratio)
  const length = Math.hypot(ex - sx, ey - sy)
  if (![sx, sy, ex, ey, t, length].every(Number.isFinite) || length < 2 || t <= 0 || t >= 1) return null
  const split = [Math.round(sx + (ex - sx) * t), Math.round(sy + (ey - sy) * t)]
  if (Math.hypot(split[0] - sx, split[1] - sy) < 1 || Math.hypot(ex - split[0], ey - split[1]) < 1) return null
  return { start: [sx, sy], split, end: [ex, ey] }
}

export function trimLineAtIntersection(targetStartMm, targetEndMm, cutterStartMm, cutterEndMm, removeEnd = 'start') {
  const points = [targetStartMm, targetEndMm, cutterStartMm, cutterEndMm].map(point => [Number(point?.[0]), Number(point?.[1])])
  if (!points.flat().every(Number.isFinite) || !['start', 'end'].includes(removeEnd)) return null
  const [[ax, ay], [bx, by], [cx, cy], [dx, dy]] = points
  const rx = bx - ax, ry = by - ay
  const sx = dx - cx, sy = dy - cy
  const denominator = rx * sy - ry * sx
  if (Math.abs(denominator) < 1) return null
  const qx = cx - ax, qy = cy - ay
  const targetRatio = (qx * sy - qy * sx) / denominator
  const cutterRatio = (qx * ry - qy * rx) / denominator
  if (!(targetRatio > 0 && targetRatio < 1 && cutterRatio >= 0 && cutterRatio <= 1)) return null
  const intersection = [Math.round(ax + targetRatio * rx), Math.round(ay + targetRatio * ry)]
  if (Math.hypot(intersection[0] - ax, intersection[1] - ay) < 1 || Math.hypot(bx - intersection[0], by - intersection[1]) < 1) return null
  return removeEnd === 'start'
    ? { start: intersection, end: [bx, by], intersection }
    : { start: [ax, ay], end: intersection, intersection }
}

export function joinLineSegments(firstStartMm, firstEndMm, secondStartMm, secondEndMm, toleranceMm = 1) {
  const points = [firstStartMm, firstEndMm, secondStartMm, secondEndMm].map(point => [Number(point?.[0]), Number(point?.[1])])
  const tolerance = Number(toleranceMm)
  if (!points.flat().every(Number.isFinite) || !Number.isFinite(tolerance) || tolerance < 0) return null
  const [[ax, ay], [bx, by], [cx, cy], [dx, dy]] = points
  const firstLength = Math.hypot(bx - ax, by - ay)
  const secondLength = Math.hypot(dx - cx, dy - cy)
  if (firstLength < 1 || secondLength < 1) return null
  const endpointPairs = [
    { gap: Math.hypot(bx - cx, by - cy), start: [ax, ay], end: [dx, dy] },
    { gap: Math.hypot(bx - dx, by - dy), start: [ax, ay], end: [cx, cy] },
    { gap: Math.hypot(ax - cx, ay - cy), start: [bx, by], end: [dx, dy] },
    { gap: Math.hypot(ax - dx, ay - dy), start: [bx, by], end: [cx, cy] },
  ].filter(candidate => candidate.gap <= tolerance)
  if (endpointPairs.length !== 1) return null
  const candidate = endpointPairs[0]
  const dxLine = candidate.end[0] - candidate.start[0]
  const dyLine = candidate.end[1] - candidate.start[1]
  const lineLength = Math.hypot(dxLine, dyLine)
  if (lineLength < 1) return null
  // Test each original endpoint against the resulting joined axis; allow only the
  // same tolerance as endpoint coincidence to avoid combining angled segments.
  const distanceToAxis = ([x, y]) => Math.abs((x - candidate.start[0]) * dyLine - (y - candidate.start[1]) * dxLine) / lineLength
  const endpoints = [[ax, ay], [bx, by], [cx, cy], [dx, dy]]
  if (endpoints.some(point => distanceToAxis(point) > tolerance)) return null
  return { start: candidate.start, end: candidate.end }
}
