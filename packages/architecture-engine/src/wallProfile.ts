import { getDisplayPhase, resolveWallVerticalExtent, resolveOpeningVerticalExtent, type ProjectDocument, type SmartObject } from '@constructflow/project-model'
import { clipHalfPlane, type Vec2 } from '@constructflow/geometry-kernel'
import { computeStairGeometry, decodeStair } from './stairs.js'

export interface WallTopSegment { start_mm: number; end_mm: number; start_height_mm: number; end_height_mm: number }
const area = (p: Vec2[]) => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - a[1] * b[0] }, 0)) / 2

/** Derived constraint: moving/resizing a stair never writes a baked wall mesh into the model. */
export function resolveWallTopSegments(project: ProjectDocument, wall: SmartObject): WallTopSegment[] {
  const d = wall.module_data as Record<string, unknown>, a = d.start_point_mm as number[], b = d.end_point_mm as number[]
  const extent = resolveWallVerticalExtent(project, wall)
  if (!a || !b || !extent) return []
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]), height = extent.height_mm
  if (!length) return []
  if (!d.fit_to_stair) return [{ start_mm: 0, end_mm: length, start_height_mm: height, end_height_mm: height }]
  const ux = (b[0] - a[0]) / length, uy = (b[1] - a[1]) / length, half = Number(d.thickness_mm) / 2
  const lines: Array<{ lo: number; hi: number; m: number; c: number }> = []
  for (const stair of Object.values(project.objects)) {
    if (stair.object_type !== 'architecture.stair' || stair.status === 'archived') continue
    if ((getDisplayPhase(stair) === 'demolition') !== (getDisplayPhase(wall) === 'demolition')) continue
    const sd = decodeStair(stair.module_data as Record<string, unknown>, project)
    if (sd.start_point_mm[2] + sd.total_rise_mm <= extent.base_elevation_mm) continue
    const mesh = computeStairGeometry({ ...sd, has_handrail: false }).mesh3d
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const p = mesh.indices.slice(i, i + 3).map(index => {
        const v = mesh.vertices[index], dx = v[0] - a[0], dy = v[1] - a[1]
        return [dx * ux + dy * uy, -dx * uy + dy * ux, v[2] - extent.base_elevation_mm]
      })
      const dx1 = p[1][0] - p[0][0], dy1 = p[1][1] - p[0][1], dz1 = p[1][2] - p[0][2]
      const dx2 = p[2][0] - p[0][0], dy2 = p[2][1] - p[0][1], dz2 = p[2][2] - p[0][2]
      const det = dx1 * dy2 - dx2 * dy1
      if (Math.abs(det) < 1e-8) continue // Vertical risers are not a ceiling surface.
      const zx = (dz1 * dy2 - dz2 * dy1) / det, zy = (dx1 * dz2 - dx2 * dz1) / det
      const zc = p[0][2] - zx * p[0][0] - zy * p[0][1]
      let ring = p.map(v => [v[0], v[1]] as Vec2)
      for (const [x, y, c] of [[-1, 0, 0], [1, 0, -length], [0, 1, -half], [0, -1, -half]]) ring = clipHalfPlane(ring, x, y, c)
      if (ring.length < 3 || area(ring) < 1e-6) continue
      // The lower envelope across the complete wall thickness prevents the far face piercing the soffit.
      for (let k = 0; k < ring.length; k++) {
        const v = ring[k], w = ring[(k + 1) % ring.length]
        if (Math.abs(w[0] - v[0]) < 1e-8) continue
        const m = zx + zy * (w[1] - v[1]) / (w[0] - v[0])
        lines.push({ lo: Math.min(v[0], w[0]), hi: Math.max(v[0], w[0]), m, c: zc + zy * v[1] + (zx - m) * v[0] })
      }
    }
  }
  const cuts = [0, length, ...lines.flatMap(l => [l.lo, l.hi])]
  for (const l of lines) {
    if (Math.abs(l.m) > 1e-9) for (const z of [0, height]) { const x = (z - l.c) / l.m; if (x > l.lo && x < l.hi) cuts.push(x) }
  }
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const l = lines[i], r = lines[j]
    if (Math.abs(l.m - r.m) < 1e-9) continue
    const x = (r.c - l.c) / (l.m - r.m)
    if (x > Math.max(l.lo, r.lo) && x < Math.min(l.hi, r.hi)) cuts.push(x)
  }
  const xs = [...new Set(cuts.map(x => Math.round(x * 1e6) / 1e6))].sort((x, y) => x - y)
  const result: WallTopSegment[] = []
  for (let i = 1; i < xs.length; i++) {
    const lo = xs[i - 1], hi = xs[i], mid = (lo + hi) / 2
    const line = lines.filter(l => mid > l.lo - 1e-7 && mid < l.hi + 1e-7).sort((l, r) => l.m * mid + l.c - r.m * mid - r.c)[0]
    const z = (x: number) => Math.max(0, Math.min(height, line ? line.m * x + line.c : height))
    const next = { start_mm: lo, end_mm: hi, start_height_mm: z(lo), end_height_mm: z(hi) }
    const previous = result.at(-1)
    if (previous && Math.abs(previous.end_height_mm - next.start_height_mm) < 1e-5 &&
      Math.abs((previous.end_height_mm - previous.start_height_mm) / (previous.end_mm - previous.start_mm) -
        (next.end_height_mm - next.start_height_mm) / (next.end_mm - next.start_mm)) < 1e-8) {
      previous.end_mm = hi; previous.end_height_mm = next.end_height_mm
    } else result.push(next)
  }
  return result
}

/** Convex solid cells in wall-local (distance, height), with unioned hosted apertures removed. */
export function getWallSolidProfiles(project: ProjectDocument, wall: SmartObject, includeOpenings = true): Vec2[][] {
  const extent = resolveWallVerticalExtent(project, wall)
  if (!extent) return []
  const apertures = includeOpenings ? Object.values(project.objects).filter(o =>
    o.status !== 'archived' && (o.object_type === 'door_window.door' || o.object_type === 'door_window.window') &&
    (o.module_data as Record<string, unknown>).wall_id === wall.id).flatMap(o => {
      const d = o.module_data as Record<string, unknown>, v = resolveOpeningVerticalExtent(project, o)
      if (!v) return []
      const x = Number(d.offset_along_wall_mm), w = Number(d.width_mm)
      return [{ lo: x - w / 2, hi: x + w / 2, bottom: v.base_elevation_mm - extent.base_elevation_mm, top: v.top_elevation_mm - extent.base_elevation_mm }]
    }) : []
  const cells: Vec2[][] = []
  for (const segment of resolveWallTopSegments(project, wall)) {
    const { start_mm: lo, end_mm: hi, start_height_mm: z0, end_height_mm: z1 } = segment
    if (hi - lo < 1e-6 || Math.max(z0, z1) < 1e-6) continue
    const xs = [...new Set([lo, hi, ...apertures.flatMap(o => [o.lo, o.hi]).filter(x => x > lo && x < hi)])].sort((a, b) => a - b)
    for (let i = 1; i < xs.length; i++) {
      const x0 = xs[i - 1], x1 = xs[i], mid = (x0 + x1) / 2
      const openings = apertures.filter(o => mid > o.lo && mid < o.hi)
      const zs = [...new Set([0, extent.height_mm, ...openings.flatMap(o => [o.bottom, o.top]).filter(z => z > 0 && z < extent.height_mm)])].sort((a, b) => a - b)
      for (let j = 1; j < zs.length; j++) {
        const bottom = zs[j - 1], top = zs[j], zmid = (bottom + top) / 2
        if (openings.some(o => zmid > o.bottom && zmid < o.top)) continue
        const m = (z1 - z0) / (hi - lo), c = z0 - m * lo
        const p = clipHalfPlane([[x0, bottom], [x1, bottom], [x1, top], [x0, top]], -m, 1, -c)
        if (p.length >= 3 && area(p) > 1e-6) cells.push(p)
      }
    }
  }
  return cells
}

export function wallProfileAreaMm2(profiles: Vec2[][]): number { return profiles.reduce((sum, p) => sum + area(p), 0) }
