type Point = readonly number[]

export function distanceToSegment2D(point: Point, start: Point, end: Point): number {
  const dx = end[0] - start[0], dy = end[1] - start[1]
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq ? Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSq)) : 0
  return Math.hypot(point[0] - start[0] - t * dx, point[1] - start[1] - t * dy)
}

export function distanceToPath2D(point: Point, path: readonly Point[], closed = false): number {
  let distance = path.length === 1 ? Math.hypot(point[0] - path[0][0], point[1] - path[0][1]) : Infinity
  for (let index = 1; index < path.length; index++) distance = Math.min(distance, distanceToSegment2D(point, path[index - 1], path[index]))
  if (closed && path.length > 2) distance = Math.min(distance, distanceToSegment2D(point, path[path.length - 1], path[0]))
  return distance
}

export function pointInPolygon2D(point: Point, ring: readonly Point[]): boolean {
  if (ring.length < 3) return false
  if (distanceToPath2D(point, ring, true) < 1e-6) return true
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const a = ring[index], b = ring[previous]
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}

export function rectangleCorners2D(center: Point, width: number, depth: number, rotationDeg = 0): [number, number][] {
  const angle = rotationDeg * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle)
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => [
    center[0] + x * width / 2 * cos - y * depth / 2 * sin,
    center[1] + x * width / 2 * sin + y * depth / 2 * cos,
  ])
}

export function distanceToArc2D(point: Point, center: Point, radius: number, startDeg: number, sweepDeg: number): number {
  const tau = 2 * Math.PI
  const start = startDeg * Math.PI / 180, sweep = sweepDeg * Math.PI / 180
  const angle = Math.atan2(point[1] - center[1], point[0] - center[0])
  const relative = ((sweep < 0 ? start - angle : angle - start) % tau + tau) % tau
  if (relative <= Math.abs(sweep) || Math.abs(sweep) >= tau) return Math.abs(Math.hypot(point[0] - center[0], point[1] - center[1]) - radius)
  return Math.min(...[start, start + sweep].map(a => Math.hypot(point[0] - center[0] - radius * Math.cos(a), point[1] - center[1] - radius * Math.sin(a))))
}
