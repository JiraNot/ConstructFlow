import type { Vec2 } from './index.js'

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
  const result = new Map<string, [Vec2, Vec2]>()
  for (const [a, b] of edges) {
    const r = sub(b, a), length = Math.hypot(...r)
    if (length < 1e-6) continue
    const cuts = [0, 1]
    for (const [c, d] of edges) {
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
      const left = rings.some(p => inside([mid[0] + n[0], mid[1] + n[1]], p))
      const right = rings.some(p => inside([mid[0] - n[0], mid[1] - n[1]], p))
      if (left === right) continue
      const start: Vec2 = [a[0] + r[0] * lo, a[1] + r[1] * lo], end: Vec2 = [a[0] + r[0] * hi, a[1] + r[1] * hi]
      const key = [start, end].map(p => p.map(x => Math.round(x * 1e6)).join(',')).sort().join('|')
      result.set(key, [start, end])
    }
  }
  return [...result.values()]
}
