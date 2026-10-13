import { parseLengthMm } from '@constructflow/project-model'

export function resolveDragDimensionTarget(startPointMm, xValue, yValue, displayUnit) {
  const dx = parseLengthMm(xValue, displayUnit)
  const dy = parseLengthMm(yValue, displayUnit)
  if (dx === null || dy === null || !Number.isFinite(dx) || !Number.isFinite(dy)) return null
  return {
    delta_mm: [dx, dy],
    point_mm: [startPointMm[0] + dx, startPointMm[1] + dy],
  }
}

export function resolveRectangleResizeTarget(centerMm, sizeMm, rotationDeg, cornerIndex, widthValue, heightValue, displayUnit) {
  const width = parseLengthMm(widthValue, displayUnit)
  const height = parseLengthMm(heightValue, displayUnit)
  const signs = [[-1, -1], [1, -1], [1, 1], [-1, 1]][cornerIndex]
  const center = [Number(centerMm?.[0]), Number(centerMm?.[1])]
  const size = [Number(sizeMm?.[0]), Number(sizeMm?.[1])]
  const angle = Number(rotationDeg ?? 0) * Math.PI / 180
  if (!signs || !center.every(Number.isFinite) || !size.every(Number.isFinite) || !Number.isFinite(angle) || width === null || height === null || width < 100 || height < 100) return null
  const localX = -signs[0] * size[0] / 2 + signs[0] * width
  const localY = -signs[1] * size[1] / 2 + signs[1] * height
  return {
    point_mm: [center[0] + localX * Math.cos(angle) - localY * Math.sin(angle), center[1] + localX * Math.sin(angle) + localY * Math.cos(angle)],
    width_mm: width,
    height_mm: height,
  }
}

export function resolveLineEndpointLengthTarget(startPointMm, endPointMm, endpointIndex, lengthValue, displayUnit) {
  const requestedLength = parseLengthMm(lengthValue, displayUnit)
  const start = [Number(startPointMm?.[0]), Number(startPointMm?.[1])]
  const end = [Number(endPointMm?.[0]), Number(endPointMm?.[1])]
  const dx = end[0] - start[0], dy = end[1] - start[1]
  const length = Math.hypot(dx, dy)
  if (![...start, ...end, length].every(Number.isFinite) || length < 1 || requestedLength === null || requestedLength < 1 || (endpointIndex !== 0 && endpointIndex !== 1)) return null
  const ux = dx / length, uy = dy / length
  return {
    point_mm: endpointIndex === 0
      ? [end[0] - ux * requestedLength, end[1] - uy * requestedLength]
      : [start[0] + ux * requestedLength, start[1] + uy * requestedLength],
    length_mm: requestedLength,
  }
}

export function resolveOpeningEdgeWidthTarget(hostStartMm, hostEndMm, centerOffsetMm, currentWidthMm, endpointIndex, widthValue, displayUnit) {
  const width = parseLengthMm(widthValue, displayUnit)
  const start = [Number(hostStartMm?.[0]), Number(hostStartMm?.[1])]
  const end = [Number(hostEndMm?.[0]), Number(hostEndMm?.[1])]
  const centerOffset = Number(centerOffsetMm), currentWidth = Number(currentWidthMm)
  const dx = end[0] - start[0], dy = end[1] - start[1]
  const hostLength = Math.hypot(dx, dy)
  if (![...start, ...end, centerOffset, currentWidth, hostLength].every(Number.isFinite) || hostLength < 1 || width === null || width < 100 || (endpointIndex !== 0 && endpointIndex !== 1)) return null
  const edgeOffset = endpointIndex === 0
    ? centerOffset + currentWidth / 2 - width
    : centerOffset - currentWidth / 2 + width
  if (edgeOffset < width / 2 || edgeOffset > hostLength - width / 2) return null
  return {
    point_mm: [start[0] + dx / hostLength * edgeOffset, start[1] + dy / hostLength * edgeOffset],
    width_mm: width,
  }
}
