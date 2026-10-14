import type { Vec2 } from './index.js'

type Bounds = [number, number, number, number]
interface SpatialEntry<T> { bounds: Bounds; value: T; index: number }
interface SpatialNode<T> { bounds: Bounds; entries?: SpatialEntry<T>[]; left?: SpatialNode<T>; right?: SpatialNode<T> }

function boundsOfRing(ring: readonly Vec2[]): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of ring) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y) }
  return [minX, minY, maxX, maxY]
}

function joinBounds(a: Bounds, b: Bounds): Bounds {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]
}

function overlaps(a: Bounds, b: Bounds, tolerance = 0): boolean {
  return a[0] <= b[2] + tolerance && a[2] + tolerance >= b[0] &&
    a[1] <= b[3] + tolerance && a[3] + tolerance >= b[1]
}

/** Static BVH used to restrict segment/ring checks to geometries with overlapping bounds. */
function buildSpatialIndex<T>(entries: SpatialEntry<T>[]): { search(bounds: Bounds, tolerance?: number): SpatialEntry<T>[] } {
  const build = (items: SpatialEntry<T>[]): SpatialNode<T> => {
    let bounds = items[0].bounds
    for (let i = 1; i < items.length; i++) bounds = joinBounds(bounds, items[i].bounds)
    if (items.length <= 8) return { bounds, entries: items.sort((a, b) => a.index - b.index) }
    const axis = bounds[2] - bounds[0] >= bounds[3] - bounds[1] ? 0 : 1
    const sorted = [...items].sort((a, b) =>
      (a.bounds[axis] + a.bounds[axis + 2] - b.bounds[axis] - b.bounds[axis + 2]) || a.index - b.index)
    const middle = sorted.length >>> 1
    return { bounds, left: build(sorted.slice(0, middle)), right: build(sorted.slice(middle)) }
  }
  const root = entries.length ? build(entries) : null
  return {
    search(bounds, tolerance = 0) {
      if (!root) return []
      const result: SpatialEntry<T>[] = []
      const visit = (node: SpatialNode<T>) => {
        if (!overlaps(node.bounds, bounds, tolerance)) return
        if (node.entries) {
          for (const entry of node.entries) if (overlaps(entry.bounds, bounds, tolerance)) result.push(entry)
          return
        }
        if (node.left) visit(node.left)
        if (node.right) visit(node.right)
      }
      visit(root)
      result.sort((a, b) => a.index - b.index)
      return result
    },
  }
}

/** Split a line at polygon edges and retain only the portions outside their interiors. */
export function segmentOutsidePolygons(segment: [Vec2, Vec2], polygons: readonly (readonly Vec2[])[]): Array<[Vec2, Vec2]> {
  const [a, b] = segment, r: Vec2 = [b[0] - a[0], b[1] - a[1]], cuts = [0, 1]
  const cross = (u: Vec2, v: Vec2) => u[0] * v[1] - u[1] * v[0]
  for (const ring of polygons) for (let i = 0; i < ring.length; i++) {
    const c = ring[i], d = ring[(i + 1) % ring.length], s: Vec2 = [d[0] - c[0], d[1] - c[1]], q: Vec2 = [c[0] - a[0], c[1] - a[1]], det = cross(r, s)
    if (Math.abs(det) < 1e-8) continue
    const t = cross(q, s) / det, u = cross(q, r) / det
    if (t > 0 && t < 1 && u >= -1e-8 && u <= 1 + 1e-8) cuts.push(t)
  }
  cuts.sort((x, y) => x - y)
  const at = (t: number): Vec2 => [a[0] + r[0] * t, a[1] + r[1] * t]
  const inside = (p: Vec2, ring: readonly Vec2[]) => {
    let result = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const c = ring[i], d = ring[j], dx = d[0] - c[0], dy = d[1] - c[1], l = Math.hypot(dx, dy)
      if (l && Math.abs(dx * (p[1] - c[1]) - dy * (p[0] - c[0])) / l < 1e-6 &&
        (p[0] - c[0]) * (p[0] - d[0]) + (p[1] - c[1]) * (p[1] - d[1]) <= 1e-6) return false
      if ((c[1] > p[1]) !== (d[1] > p[1]) && p[0] < dx * (p[1] - c[1]) / dy + c[0]) result = !result
    }
    return result
  }
  const result: Array<[Vec2, Vec2]> = []
  for (let i = 1; i < cuts.length; i++) {
    if (cuts[i] - cuts[i - 1] < 1e-9) continue
    if (!polygons.some(ring => inside(at((cuts[i] + cuts[i - 1]) / 2), ring))) result.push([at(cuts[i - 1]), at(cuts[i])])
  }
  return result
}

/** Boundary of a polygon union, preserving steps, holes and partial edge contacts. */
export function polygonUnionBoundary(polygons: readonly (readonly Vec2[])[]): Array<[Vec2, Vec2]> {
  const rings = polygons.filter(p => p.length >= 3)
  const inside = (p: Vec2, ring: readonly Vec2[]) => {
    let result = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j]
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result
    }
    return result
  }
  const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0]
  const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]]
  const edges = rings.flatMap(ring => ring.map((a, i) => [a, ring[(i + 1) % ring.length]] as [Vec2, Vec2]))
  const edgeEntries = edges.map((edge, index) => ({
    bounds: [Math.min(edge[0][0], edge[1][0]), Math.min(edge[0][1], edge[1][1]), Math.max(edge[0][0], edge[1][0]), Math.max(edge[0][1], edge[1][1])] as Bounds,
    value: edge,
    index,
  }))
  const edgeIndex = buildSpatialIndex(edgeEntries)
  const ringIndex = buildSpatialIndex(rings.map((ring, index) => ({ bounds: boundsOfRing(ring), value: ring, index })))
  const result = new Map<string, [Vec2, Vec2]>()
  for (let edgeIndexInList = 0; edgeIndexInList < edges.length; edgeIndexInList++) {
    const [a, b] = edges[edgeIndexInList]
    const r = sub(b, a), length = Math.hypot(...r)
    if (length < 1e-6) continue
    const cuts = [0, 1]
    for (const candidate of edgeIndex.search(edgeEntries[edgeIndexInList].bounds, 1e-6)) {
      if (candidate.index === edgeIndexInList) continue
      const [c, d] = candidate.value
      const s = sub(d, c), q = sub(c, a), denominator = cross(r, s)
      if (Math.abs(denominator) > 1e-8) {
        const t = cross(q, s) / denominator, u = cross(q, r) / denominator
        if (t > 0 && t < 1 && u >= -1e-8 && u <= 1 + 1e-8) cuts.push(t)
      } else if (Math.abs(cross(q, r)) / length < 1e-6) {
        for (const p of [c, d]) { const v = sub(p, a), t = (v[0] * r[0] + v[1] * r[1]) / (length * length); if (t > 0 && t < 1) cuts.push(t) }
      }
    }
    cuts.sort((x, y) => x - y)
    for (let i = 1; i < cuts.length; i++) {
      const lo = cuts[i - 1], hi = cuts[i]
      if ((hi - lo) * length < 1e-6) continue
      const t = (lo + hi) / 2, mid: Vec2 = [a[0] + r[0] * t, a[1] + r[1] * t]
      const epsilon = Math.min(0.001, (hi - lo) * length / 100)
      const n: Vec2 = [-r[1] / length * epsilon, r[0] / length * epsilon]
      const leftPoint: Vec2 = [mid[0] + n[0], mid[1] + n[1]], rightPoint: Vec2 = [mid[0] - n[0], mid[1] - n[1]]
      const left = ringIndex.search([leftPoint[0], leftPoint[1], leftPoint[0], leftPoint[1]]).some(entry => inside(leftPoint, entry.value))
      const right = ringIndex.search([rightPoint[0], rightPoint[1], rightPoint[0], rightPoint[1]]).some(entry => inside(rightPoint, entry.value))
      if (left === right) continue
      const start: Vec2 = [a[0] + r[0] * lo, a[1] + r[1] * lo], end: Vec2 = [a[0] + r[0] * hi, a[1] + r[1] * hi]
      const key = [start, end].map(p => p.map(x => Math.round(x * 1e6)).join(',')).sort().join('|')
      result.set(key, [start, end])
    }
  }
  return [...result.values()]
}
