// ConstructFlow Exact Convex Contact Kernel
//
// Coordination must report real geometry, not inflated axis-aligned boxes. Every supported object
// family is reduced to a *convex* solid that exposes a support function; two solids are then tested
// with GJK (closest distance + witness points) and EPA (penetration depth + normal).
//
// The result is the number a builder can act on: `penetration_mm` while the solids overlap and
// `distance_mm` while they are apart, plus the unit direction that resolves the condition.
// Everything is canonical millimeters and fully deterministic (no randomness, no worker state).

import type { SpatialBounds, Vec3 } from './spatial.js'

const EPS = 1e-9

export const vec = {
  add: (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a: Vec3, scalar: number): Vec3 => [a[0] * scalar, a[1] * scalar, a[2] * scalar],
  neg: (a: Vec3): Vec3 => [-a[0], -a[1], -a[2]],
  dot: (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ],
  len: (a: Vec3): number => Math.hypot(a[0], a[1], a[2]),
  dist: (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
}

const unit = (a: Vec3): Vec3 => {
  const l = vec.len(a)
  return l < EPS ? [0, 0, 0] : vec.mul(a, 1 / l)
}

/**
 * Renderer-neutral convex primitive. Support functions are the only geometric knowledge the
 * narrow phase needs, so new families stay cheap to add:
 * - `points`   : point cloud (support = the cloud's convex hull, no hull algorithm required)
 * - `obb`      : oriented box (beams, columns, walls, cabinets, devices)
 * - `capsule`  : swept sphere along a segment (pipes, LED runs, moulding runs)
 * - `disc_prism`: vertical cylinder between two elevations (downlights, round fixtures)
 * - `sector_prism`: vertical prism over a plan-sector (door swing envelopes)
 */
export type ConvexSolid =
  | { kind: 'points'; points: Vec3[] }
  | { kind: 'obb'; center: Vec3; half: Vec3; axes: [Vec3, Vec3, Vec3] }
  | { kind: 'capsule'; a: Vec3; b: Vec3; radius: number }
  | { kind: 'disc_prism'; center: [number, number]; radius: number; z_min: number; z_max: number }
  | { kind: 'sector_prism'; hinge: [number, number]; radius: number; start_deg: number; sweep_deg: number; z_min: number; z_max: number }

const DEG = Math.PI / 180

const sectorPoint = (solid: Extract<ConvexSolid, { kind: 'sector_prism' }>, angleRad: number): [number, number] => [
  solid.hinge[0] + Math.cos(angleRad) * solid.radius,
  solid.hinge[1] + Math.sin(angleRad) * solid.radius,
]

const normalizedAngleDelta = (from: number, to: number): number => {
  let delta = (to - from) % (2 * Math.PI)
  if (delta < 0) delta += 2 * Math.PI
  return delta
}

/** Support point: the extreme point of the solid along `direction`. */
export function supportOf(solid: ConvexSolid, direction: Vec3): Vec3 {
  switch (solid.kind) {
    case 'points': {
      if (!solid.points.length) return [0, 0, 0]
      let best = solid.points[0]
      let bestDot = vec.dot(best, direction)
      for (const point of solid.points) {
        const value = vec.dot(point, direction)
        if (value > bestDot) { bestDot = value; best = point }
      }
      return [best[0], best[1], best[2]]
    }
    case 'obb': {
      let point: Vec3 = [solid.center[0], solid.center[1], solid.center[2]]
      for (let axis = 0; axis < 3; axis++) {
        const sign = vec.dot(direction, solid.axes[axis]) >= 0 ? 1 : -1
        point = vec.add(point, vec.mul(solid.axes[axis], sign * solid.half[axis]))
      }
      return point
    }
    case 'capsule': {
      const base = vec.dot(direction, vec.sub(solid.b, solid.a)) >= 0 ? solid.b : solid.a
      return vec.add(base, vec.mul(unit(direction), solid.radius))
    }
    case 'disc_prism': {
      const radial = Math.hypot(direction[0], direction[1])
      const point: [number, number] = radial < EPS
        ? solid.center
        : [solid.center[0] + (direction[0] / radial) * solid.radius, solid.center[1] + (direction[1] / radial) * solid.radius]
      return [point[0], point[1], direction[2] >= 0 ? solid.z_max : solid.z_min]
    }
    case 'sector_prism': {
      const z = direction[2] >= 0 ? solid.z_max : solid.z_min
      const radial = Math.hypot(direction[0], direction[1])
      const startRad = solid.start_deg * DEG
      const sweepRad = Math.max(0, solid.sweep_deg) * DEG
      let angle: number
      if (radial < EPS) {
        angle = startRad + sweepRad / 2
      } else {
        const target = Math.atan2(direction[1], direction[0])
        const inside = normalizedAngleDelta(startRad, target) <= sweepRad + EPS
        if (inside) {
          angle = target
        } else {
          const endRad = startRad + sweepRad
          const toStart = Math.min(normalizedAngleDelta(target, startRad), normalizedAngleDelta(startRad, target))
          const toEnd = Math.min(normalizedAngleDelta(target, endRad), normalizedAngleDelta(endRad, target))
          angle = toStart <= toEnd ? startRad : endRad
        }
      }
      const candidate = sectorPoint(solid, angle)
      const towardCandidate: Vec3 = [candidate[0] - solid.hinge[0], candidate[1] - solid.hinge[1], 0]
      if (radial >= EPS && vec.dot(towardCandidate, [direction[0], direction[1], 0]) < 0) {
        return [solid.hinge[0], solid.hinge[1], z]
      }
      return [candidate[0], candidate[1], z]
    }
    default: {
      const exhaustive: never = solid
      throw new Error(`Unsupported coordination solid: ${JSON.stringify(exhaustive)}`)
    }
  }
}

/** Centroid used to seed GJK and to orient penetration normals. */
export function centroidOf(solid: ConvexSolid): Vec3 {
  switch (solid.kind) {
    case 'points': {
      if (!solid.points.length) return [0, 0, 0]
      const sum = solid.points.reduce((acc, point) => vec.add(acc, point), [0, 0, 0] as Vec3)
      return vec.mul(sum, 1 / solid.points.length)
    }
    case 'obb': return [solid.center[0], solid.center[1], solid.center[2]]
    case 'capsule': return vec.mul(vec.add(solid.a, solid.b), 0.5)
    case 'disc_prism': return [solid.center[0], solid.center[1], (solid.z_min + solid.z_max) / 2]
    case 'sector_prism': {
      const mid = (solid.start_deg + solid.sweep_deg / 2) * DEG
      return [
        solid.hinge[0] + Math.cos(mid) * solid.radius * 0.5,
        solid.hinge[1] + Math.sin(mid) * solid.radius * 0.5,
        (solid.z_min + solid.z_max) / 2,
      ]
    }
    default: {
      const exhaustive: never = solid
      throw new Error(`Unsupported coordination solid: ${JSON.stringify(exhaustive)}`)
    }
  }
}

/** Exact axis-aligned bounds of a convex solid: the extreme support along each signed axis. */
export function boundsOf(solid: ConvexSolid): SpatialBounds {
  const min: Vec3 = [0, 0, 0]
  const max: Vec3 = [0, 0, 0]
  for (let axis = 0; axis < 3; axis++) {
    const positive: Vec3 = [0, 0, 0]
    positive[axis] = 1
    const negative: Vec3 = [0, 0, 0]
    negative[axis] = -1
    max[axis] = supportOf(solid, positive)[axis]
    min[axis] = supportOf(solid, negative)[axis]
  }
  return { min, max }
}

interface MinkowskiPoint {
  /** support(A, d) - support(B, -d) */
  m: Vec3
  a: Vec3
  b: Vec3
}

interface SimplexClosest {
  point: Vec3
  weights: number[]
  indices: number[]
  inside: boolean
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

function closestOnSegment(a: Vec3, b: Vec3): SimplexClosest {
  const ab = vec.sub(b, a)
  const denom = vec.dot(ab, ab)
  const t = denom < EPS ? 0 : clamp(-vec.dot(a, ab) / denom, 0, 1)
  return { point: vec.add(a, vec.mul(ab, t)), weights: [1 - t, t], indices: [0, 1], inside: false }
}

/** Ericson's closest point on triangle, evaluated against the origin. */
function closestOnTriangle(a: Vec3, b: Vec3, c: Vec3): SimplexClosest {
  const ab = vec.sub(b, a)
  const ac = vec.sub(c, a)
  const ap = vec.neg(a)
  const d1 = vec.dot(ab, ap)
  const d2 = vec.dot(ac, ap)
  if (d1 <= 0 && d2 <= 0) return { point: [...a], weights: [1, 0, 0], indices: [0, 1, 2], inside: false }
  const bp = vec.neg(b)
  const d3 = vec.dot(ab, bp)
  const d4 = vec.dot(ac, bp)
  if (d3 >= 0 && d4 <= d3) return { point: [...b], weights: [0, 1, 0], indices: [0, 1, 2], inside: false }
  const vc = d1 * d4 - d3 * d2
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3)
    return { point: vec.add(a, vec.mul(ab, v)), weights: [1 - v, v, 0], indices: [0, 1, 2], inside: false }
  }
  const cp = vec.neg(c)
  const d5 = vec.dot(ab, cp)
  const d6 = vec.dot(ac, cp)
  if (d6 >= 0 && d5 <= d6) return { point: [...c], weights: [0, 0, 1], indices: [0, 1, 2], inside: false }
  const vb = d5 * d2 - d1 * d6
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6)
    return { point: vec.add(a, vec.mul(ac, w)), weights: [1 - w, 0, w], indices: [0, 1, 2], inside: false }
  }
  const va = d3 * d6 - d5 * d4
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6))
    return { point: vec.add(b, vec.mul(vec.sub(c, b), w)), weights: [0, 1 - w, w], indices: [0, 1, 2], inside: false }
  }
  const denom = va + vb + vc
  if (denom < EPS) return { point: [...a], weights: [1, 0, 0], indices: [0, 1, 2], inside: false }
  const v = vb / denom
  const w = vc / denom
  return {
    point: vec.add(a, vec.add(vec.mul(ab, v), vec.mul(ac, w))),
    weights: [1 - v - w, v, w],
    indices: [0, 1, 2],
    inside: false,
  }
}

const TETRA_FACES: Array<[number, number, number, number]> = [[0, 1, 2, 3], [0, 2, 3, 1], [0, 3, 1, 2], [1, 3, 2, 0]]

function closestOnTetrahedron(points: Vec3[]): SimplexClosest {
  let best: SimplexClosest | null = null
  let bestDistance = Infinity
  for (const [i, j, k, opposite] of TETRA_FACES) {
    const normal = vec.cross(vec.sub(points[j], points[i]), vec.sub(points[k], points[i]))
    const normalLength = vec.len(normal)
    if (normalLength < EPS) continue
    const unitNormal = vec.mul(normal, 1 / normalLength)
    // Only faces the origin is *outside* of can carry the closest point.
    if (vec.dot(unitNormal, vec.neg(points[i])) <= 0) continue
    const candidate = closestOnTriangle(points[i], points[j], points[k])
    const distance = vec.len(candidate.point)
    if (distance >= bestDistance) continue
    const weights = [0, 0, 0, 0]
    weights[i] = candidate.weights[0]
    weights[j] = candidate.weights[1]
    weights[k] = candidate.weights[2]
    bestDistance = distance
    best = { point: candidate.point, weights, indices: [0, 1, 2, 3], inside: false }
  }
  if (!best) return { point: [0, 0, 0], weights: [0.25, 0.25, 0.25, 0.25], indices: [0, 1, 2, 3], inside: true }
  return best
}

function closestOnSimplex(simplex: MinkowskiPoint[]): SimplexClosest {
  if (simplex.length === 1) return { point: [...simplex[0].m], weights: [1], indices: [0], inside: false }
  if (simplex.length === 2) return closestOnSegment(simplex[0].m, simplex[1].m)
  if (simplex.length === 3) return closestOnTriangle(simplex[0].m, simplex[1].m, simplex[2].m)
  return closestOnTetrahedron(simplex.map(point => point.m))
}

export interface ContactOptions {
  max_iterations?: number
  /** Absolute tolerance in millimeters; distances below this read as touching. */
  tolerance_mm?: number
  /** Required free space in millimeters; the result then reports the shortfall. */
  clearance_mm?: number
}

export interface ContactResult {
  intersecting: boolean
  /**
   * Overlap depth in mm (0 when the solids are apart), bracketed by the two independent
   * estimators so the reported number is auditable: `[lower, upper]` with lower ≤ depth ≤ upper.
   */
  penetration_mm: number
  penetration_range_mm: [number, number]
  /** Surface-to-surface distance in mm (0 when the solids overlap). */
  distance_mm: number
  /** Distance when apart, negative overlap depth when penetrating. */
  signed_separation_mm: number
  /** Required clearance minus measured clearance, when a requirement was supplied. */
  clearance_shortfall_mm: number | null
  /** Unit direction from the B witness point toward the A witness point (moving A resolves it). */
  direction: Vec3
  /**
   * Equally cheap alternatives (within 0.5 mm) for overlapping solids. Symmetric configurations
   * such as a pipe through the centre of a beam tie on both vertical exits, so the caller can
   * offer the engineer either direction instead of picking one arbitrarily.
   */
  alternatives_mm: Vec3[]
  point_a_mm: Vec3
  point_b_mm: Vec3
  method: 'gjk_epa' | 'sampled'
  iterations: number
  converged: boolean
  tolerance_mm: number
}

export interface GjkResult {
  intersecting: boolean
  distance_mm: number
  point_a_mm: Vec3
  point_b_mm: Vec3
  simplex: MinkowskiPoint[]
  iterations: number
  converged: boolean
}

const supportMinkowski = (a: ConvexSolid, b: ConvexSolid, direction: Vec3): MinkowskiPoint => {
  const pointA = supportOf(a, direction)
  const pointB = supportOf(b, vec.neg(direction))
  return { m: vec.sub(pointA, pointB), a: pointA, b: pointB }
}

/** GJK: closest distance between two convex solids, with witness points on both surfaces. */
export function gjkDistance(a: ConvexSolid, b: ConvexSolid, options: ContactOptions = {}): GjkResult {
  const maxIterations = Math.max(8, Math.floor(options.max_iterations ?? 96))
  const tolerance = Math.max(1e-9, options.tolerance_mm ?? 1e-4)
  let v = vec.sub(centroidOf(a), centroidOf(b))
  if (vec.len(v) < 1e-6) v = [1, 0, 0]
  let simplex: MinkowskiPoint[] = []
  let pointA: Vec3 = centroidOf(a)
  let pointB: Vec3 = centroidOf(b)
  let distance = Infinity

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const direction = vec.neg(v)
    const w = supportMinkowski(a, b, direction)
    const gap = vec.dot(v, v) - vec.dot(v, w.m)
    const threshold = 1e-10 * Math.max(1, vec.dot(v, v)) + 1e-9
    // `v` is the closest point of the current simplex, so |v| is the live distance estimate.
    if (gap <= threshold) {
      return { intersecting: false, distance_mm: vec.len(v), point_a_mm: pointA, point_b_mm: pointB, simplex, iterations: iteration, converged: true }
    }

    const candidate = [...simplex, w]
    const closest = closestOnSimplex(candidate)
    distance = vec.len(closest.point)

    // Keep only the support points that actually carry the closest point.
    const kept: MinkowskiPoint[] = []
    const keptWeights: number[] = []
    for (const [index, weight] of closest.weights.entries()) {
      if (weight <= 1e-9) continue
      kept.push(candidate[index])
      keptWeights.push(weight)
    }
    if (!kept.length) kept.push(w), keptWeights.push(1)
    const weightSum = keptWeights.reduce((sum, weight) => sum + weight, 0)
    const normalizedWeights = keptWeights.map(weight => weight / weightSum)
    pointA = kept.reduce((acc, point, index) => vec.add(acc, vec.mul(point.a, normalizedWeights[index])), [0, 0, 0] as Vec3)
    pointB = kept.reduce((acc, point, index) => vec.add(acc, vec.mul(point.b, normalizedWeights[index])), [0, 0, 0] as Vec3)

    if (closest.inside || distance <= tolerance) {
      // The origin now lies inside the simplex hull: the solids overlap.
      return { intersecting: true, distance_mm: 0, point_a_mm: pointA, point_b_mm: pointB, simplex: candidate, iterations: iteration, converged: true }
    }
    simplex = kept
    v = closest.point
  }

  return { intersecting: distance <= tolerance, distance_mm: distance === Infinity ? vec.len(v) : distance, point_a_mm: pointA, point_b_mm: pointB, simplex, iterations: maxIterations, converged: false }
}

interface EpaFace {
  indices: [number, number, number]
  /** Outward unit normal of the face (pointing away from the polytope interior). */
  normal: Vec3
  /** Distance of the face plane from the origin; positive when the origin is inside. */
  distance: number
  valid: boolean
}

const FACE_INDEX_TRIPLES: Array<[number, number, number, number]> = [[0, 1, 2, 3], [0, 2, 3, 1], [0, 3, 1, 2], [1, 3, 2, 0]]

/** Is the origin strictly inside this tetrahedron? Faces are oriented away from the opposite vertex. */
function originInsideTetrahedron(points: MinkowskiPoint[]): boolean {
  for (const [i, j, k, opposite] of FACE_INDEX_TRIPLES) {
    const normal = vec.cross(vec.sub(points[j].m, points[i].m), vec.sub(points[k].m, points[i].m))
    if (vec.len(normal) < 1e-9) return false
    const outward = vec.dot(normal, vec.sub(points[opposite].m, points[i].m)) < 0 ? normal : vec.neg(normal)
    if (vec.dot(outward, points[i].m) <= 1e-9) return false
  }
  return true
}

/**
 * Build an EPA seed tetrahedron that actually contains the origin. GJK's terminating simplex may
 * be a single point, edge or triangle (or a tetra whose origin containment is not established), so
 * candidate support points are pooled and the first origin-containing combination is used.
 */
function buildTetrahedron(a: ConvexSolid, b: ConvexSolid, simplex: MinkowskiPoint[]): MinkowskiPoint[] | null {
  const pool: MinkowskiPoint[] = []
  const add = (point: MinkowskiPoint): void => {
    if (pool.some(existing => vec.dist(existing.m, point.m) <= 1e-7)) return
    pool.push(point)
  }
  for (const point of simplex.slice(0, 4)) add(point)
  add(supportMinkowski(a, b, unit(vec.sub(centroidOf(a), centroidOf(b)))))
  for (const direction of SAMPLE_DIRECTIONS) add(supportMinkowski(a, b, direction))
  if (pool.length < 4) return null
  for (let i = 0; i < pool.length - 3; i++) {
    for (let j = i + 1; j < pool.length - 2; j++) {
      for (let k = j + 1; k < pool.length - 1; k++) {
        for (let l = k + 1; l < pool.length; l++) {
          const tetra = [pool[i], pool[j], pool[k], pool[l]]
          if (originInsideTetrahedron(tetra)) return tetra
        }
      }
    }
  }
  return null
}

/** EPA: overlap depth and resolving normal, expanded from an intersecting GJK simplex. */
export function epaPenetration(
  a: ConvexSolid,
  b: ConvexSolid,
  simplex: MinkowskiPoint[],
  options: ContactOptions = {},
): { depth_mm: number; direction: Vec3; point_a_mm: Vec3; point_b_mm: Vec3; iterations: number; converged: boolean } | null {
  const maxIterations = Math.max(8, Math.floor(options.max_iterations ?? 96))
  const tolerance = Math.max(1e-6, options.tolerance_mm ?? 1e-3)
  const points = buildTetrahedron(a, b, simplex)
  if (!points) return null

  const faces: EpaFace[] = []
  const makeFace = (i: number, j: number, k: number, opposite?: number): EpaFace => {
    const normal = vec.cross(vec.sub(points[j].m, points[i].m), vec.sub(points[k].m, points[i].m))
    const length = vec.len(normal)
    if (length < 1e-9) return { indices: [i, j, k], normal: [0, 0, 0], distance: Infinity, valid: false }
    let unitNormal = vec.mul(normal, 1 / length)
    if (opposite !== undefined) {
      // Orient away from the opposite vertex so the normal is the outward face normal.
      if (vec.dot(unitNormal, vec.sub(points[opposite].m, points[i].m)) > 0) unitNormal = vec.neg(unitNormal)
    } else if (vec.dot(unitNormal, points[i].m) < 0) {
      unitNormal = vec.neg(unitNormal)
    }
    return { indices: [i, j, k], normal: unitNormal, distance: Math.abs(vec.dot(unitNormal, points[i].m)), valid: true }
  }
  faces.push(...FACE_INDEX_TRIPLES.map(([i, j, k, opposite]) => makeFace(i, j, k, opposite)))

  let best = faces.filter(face => face.valid).sort((left, right) => left.distance - right.distance)[0]
  let iterations = 0
  for (; iterations < maxIterations; iterations++) {
    const face = faces.filter(candidate => candidate.valid).sort((left, right) => left.distance - right.distance)[0]
    if (!face) return null
    best = face
    const w = supportMinkowski(a, b, face.normal)
    const supportDistance = vec.dot(face.normal, w.m)
    if (supportDistance - face.distance <= tolerance || points.some(point => vec.dist(point.m, w.m) <= tolerance * 0.1)) {
      // The true depth lies between the face plane and the new support point.
      return witnessFromFace(points, face, (face.distance + Math.max(face.distance, supportDistance)) / 2, iterations + 1, true)
    }

    // Expand: drop every face the new point can see, then re-stitch the horizon.
    const newIndex = points.push(w) - 1
    const removed: EpaFace[] = []
    const kept: EpaFace[] = []
    for (const candidate of faces) {
      if (!candidate.valid) { removed.push(candidate); continue }
      const [i, j, k] = candidate.indices
      const visible = vec.dot(candidate.normal, vec.sub(w.m, points[i].m)) > tolerance * 0.1
      if (visible) removed.push(candidate)
      else kept.push(candidate)
    }
    const horizon: Array<[number, number]> = []
    for (const face of removed) {
      if (!face.valid) continue
      for (const edge of [[face.indices[0], face.indices[1]], [face.indices[1], face.indices[2]], [face.indices[2], face.indices[0]]] as Array<[number, number]>) {
        const reversed = horizon.findIndex(([from, to]) => from === edge[1] && to === edge[0])
        if (reversed >= 0) horizon.splice(reversed, 1)
        else horizon.push(edge)
      }
    }
    faces.length = 0
    faces.push(...kept)
    // Horizon faces stay outside the polytope; the distance-positive orientation keeps them outward.
    for (const [from, to] of horizon) faces.push(makeFace(from, to, newIndex))
    if (!faces.some(candidate => candidate.valid)) return null
  }

  return witnessFromFace(points, best, best.distance, iterations, false)
}

function witnessFromFace(
  points: MinkowskiPoint[],
  face: EpaFace,
  depth: number,
  iterations: number,
  converged: boolean,
): { depth_mm: number; direction: Vec3; point_a_mm: Vec3; point_b_mm: Vec3; iterations: number; converged: boolean } {
  const [i, j, k] = face.indices
  const barycentric = barycentricOnPlane(points[i].m, points[j].m, points[k].m)
  const blend = (selector: (point: MinkowskiPoint) => Vec3): Vec3 => vec.add(
    vec.add(vec.mul(selector(points[i]), barycentric[0]), vec.mul(selector(points[j]), barycentric[1])),
    vec.mul(selector(points[k]), barycentric[2]),
  )
  const pointA = blend(point => point.a)
  const pointB = blend(point => point.b)
  let direction = unit(vec.sub(pointA, pointB))
  if (vec.len(direction) < 0.5) direction = vec.len(face.normal) > 0.5 ? [...face.normal] as Vec3 : [0, 0, 1]
  return { depth_mm: Math.max(0, depth), direction, point_a_mm: pointA, point_b_mm: pointB, iterations, converged }
}

function barycentricOnPlane(a: Vec3, b: Vec3, c: Vec3): [number, number, number] {
  const v0 = vec.sub(b, a)
  const v1 = vec.sub(c, a)
  const target = vec.neg(a)
  const d00 = vec.dot(v0, v0)
  const d01 = vec.dot(v0, v1)
  const d11 = vec.dot(v1, v1)
  const d20 = vec.dot(target, v0)
  const d21 = vec.dot(target, v1)
  const denom = d00 * d11 - d01 * d01
  if (Math.abs(denom) < 1e-12) return [1, 0, 0]
  const v = (d11 * d20 - d01 * d21) / denom
  const w = (d00 * d21 - d01 * d20) / denom
  const u = 1 - v - w
  return [clamp(u, 0, 1), clamp(v, 0, 1), clamp(w, 0, 1)]
}

const SAMPLE_DIRECTIONS: Vec3[] = (() => {
  const directions: Vec3[] = []
  for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) {
    if (x === 0 && y === 0 && z === 0) continue
    const direction = unit([x, y, z])
    if (direction[0] || direction[1] || direction[2]) directions.push(direction)
  }
  return directions
})()

/**
 * Deterministic fallback when GJK/EPA cannot converge (degenerate or near-flat contacts).
 * It minimizes `h_A(d) + h_B(-d)` over a fixed direction set with local refinement, which is the
 * exact penetration depth / separation distance when the minimizing direction is found.
 */
export interface AxisMinimum {
  /** min over tested directions of h_A(d) + h_B(-d): > 0 means the solids overlap. */
  value_mm: number
  /** The minimizing direction, pointing from B toward A. */
  direction: Vec3
  point_a_mm: Vec3
  point_b_mm: Vec3
  samples: number
  /** Other tested directions within 0.5 mm of the minimum. */
  alternatives: Array<{ direction: Vec3; value_mm: number }>
}

/**
 * Sound separating-axis test. For convex sets, `h_A(d) + h_B(-d) < 0` certifies separation along `d`
 * and `> 0` for every direction certifies overlap, so a positive minimum can never be a false hit.
 * The direction set is the 26 principal directions plus a deterministic pattern-search refinement.
 */
export function sampledAxisMinimum(a: ConvexSolid, b: ConvexSolid): AxisMinimum {
  const evaluate = (direction: Vec3): AxisMinimum => {
    const pointA = supportOf(a, direction)
    const pointB = supportOf(b, vec.neg(direction))
    return {
      value_mm: vec.dot(pointA, direction) + vec.dot(pointB, vec.neg(direction)),
      direction,
      point_a_mm: pointA,
      point_b_mm: pointB,
      samples: 1,
      alternatives: [],
    }
  }
  const seed = unit(vec.sub(centroidOf(a), centroidOf(b)))
  let best = evaluate(vec.len(seed) > 0.5 ? seed : [1, 0, 0])
  let samples = 1
  const tested: Array<{ direction: Vec3; value_mm: number }> = [{ direction: best.direction, value_mm: best.value_mm }]
  const consider = (candidate: AxisMinimum): void => {
    samples += 1
    tested.push({ direction: candidate.direction, value_mm: candidate.value_mm })
    if (candidate.value_mm < best.value_mm) best = candidate
  }
  for (const direction of SAMPLE_DIRECTIONS) consider(evaluate(direction))
  let step = Math.PI / 6
  for (let round = 0; round < 10 && step > 1e-4; round++) {
    let improved = false
    for (const axis of [[1, 0, 0], [0, 1, 0], [0, 0, 1]] as Vec3[]) {
      for (const angle of [step, -step]) {
        const candidate = evaluate(rotateAroundAxis(best.direction, axis, angle))
        consider(candidate)
        if (candidate.value_mm < best.value_mm - 1e-9) improved = true
      }
    }
    if (!improved) step /= 2
  }
  const alternatives: Array<{ direction: Vec3; value_mm: number }> = []
  for (const entry of tested) {
    if (entry.value_mm > best.value_mm + 0.5) continue
    if (vec.len(vec.sub(entry.direction, best.direction)) < 1e-6) continue
    if (Math.abs(vec.dot(entry.direction, best.direction) - 1) < 1e-9) continue
    if (alternatives.some(existing => vec.dist(existing.direction, entry.direction) < 1e-6)) continue
    alternatives.push({ direction: entry.direction, value_mm: entry.value_mm })
    if (alternatives.length >= 3) break
  }
  return { ...best, samples, alternatives }
}

/** Sampled fallback: separation or overlap derived only from the axis search (no GJK/EPA). */
export function sampledContact(a: ConvexSolid, b: ConvexSolid, options: ContactOptions = {}): ContactResult {
  const clearance = options.clearance_mm
  const axis = sampledAxisMinimum(a, b)
  const penetrating = axis.value_mm > (options.tolerance_mm ?? 1e-3)
  const witnessDirection = unit(vec.sub(axis.point_a_mm, axis.point_b_mm))
  const direction: Vec3 = penetrating
    ? (vec.len(witnessDirection) > 0.5 ? vec.neg(witnessDirection) : vec.neg(axis.direction))
    : (vec.len(witnessDirection) > 0.5 ? witnessDirection : axis.direction)
  const depth = Math.max(0, axis.value_mm)
  const distance = penetrating ? 0 : Math.max(0, -axis.value_mm)
  return {
    intersecting: penetrating,
    penetration_mm: depth,
    penetration_range_mm: [0, depth],
    alternatives_mm: axis.alternatives.map(alternative => vec.neg(alternative.direction)),
    distance_mm: distance,
    signed_separation_mm: penetrating ? -depth : distance,
    clearance_shortfall_mm: clearance === undefined ? null : Math.max(0, clearance + (penetrating ? depth : -distance)),
    direction,
    point_a_mm: axis.point_a_mm,
    point_b_mm: axis.point_b_mm,
    method: 'sampled',
    iterations: axis.samples,
    converged: false,
    tolerance_mm: options.tolerance_mm ?? 1e-3,
  }
}

function rotateAroundAxis(direction: Vec3, axis: Vec3, angle: number): Vec3 {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const k = unit(axis)
  const cross = vec.cross(k, direction)
  const dot = vec.dot(k, direction)
  return unit([
    direction[0] * cos + cross[0] * sin + k[0] * dot * (1 - cos),
    direction[1] * cos + cross[1] * sin + k[1] * dot * (1 - cos),
    direction[2] * cos + cross[2] * sin + k[2] * dot * (1 - cos),
  ])
}

/**
 * Exact contact between two convex solids: penetration depth or clearance distance in mm.
 *
 * Decision order:
 * 1. sampled separating-axis minimum — a sound classifier for convex pairs (never a false hit);
 * 2. overlap  → EPA for the face-distance lower bound, bracketed against the axis upper bound;
 * 3. apart    → GJK for the exact distance and surface witness points.
 */
export function contactBetweenSolids(a: ConvexSolid, b: ConvexSolid, options: ContactOptions = {}): ContactResult {
  const tolerance = options.tolerance_mm ?? 1e-3
  const clearance = options.clearance_mm
  const axis = sampledAxisMinimum(a, b)

  if (axis.value_mm > tolerance) {
    const epa = epaPenetration(a, b, [], { ...options, tolerance_mm: Math.min(tolerance, 1e-2) })
    const lower = epa && Number.isFinite(epa.depth_mm) ? Math.max(0, Math.min(epa.depth_mm, axis.value_mm)) : 0
    const upper = Math.max(lower, axis.value_mm)
    const depth = (lower + upper) / 2
    // Minimum translation vector for A: t* = -n* · depth, where n* is the minimizing axis.
    const direction: Vec3 = vec.neg(axis.direction)
    return {
      intersecting: true,
      penetration_mm: depth,
      penetration_range_mm: [lower, upper],
      alternatives_mm: axis.alternatives.map(alternative => vec.neg(alternative.direction)),
      distance_mm: 0,
      signed_separation_mm: -depth,
      clearance_shortfall_mm: clearance === undefined ? null : clearance + depth,
      direction,
      point_a_mm: axis.point_a_mm,
      point_b_mm: axis.point_b_mm,
      method: 'gjk_epa',
      iterations: axis.samples + (epa?.iterations ?? 0),
      converged: epa?.converged ?? false,
      tolerance_mm: tolerance,
    }
  }

  const gjk = gjkDistance(a, b, { ...options, tolerance_mm: tolerance })
  const distance = gjk.converged ? gjk.distance_mm : Math.max(gjk.distance_mm, Math.max(0, -axis.value_mm))
  if (distance <= tolerance) {
    // Touching surfaces: report contact without a fabricated overlap depth.
    const witnessDirection = unit(vec.sub(axis.point_a_mm, axis.point_b_mm))
    return {
      intersecting: false,
      penetration_mm: 0,
      penetration_range_mm: [0, 0],
      alternatives_mm: [],
      distance_mm: 0,
      signed_separation_mm: 0,
      clearance_shortfall_mm: clearance === undefined ? null : clearance,
      direction: vec.neg(axis.direction),
      point_a_mm: axis.point_a_mm,
      point_b_mm: axis.point_b_mm,
      method: 'gjk_epa',
      iterations: axis.samples + gjk.iterations,
      converged: gjk.converged,
      tolerance_mm: tolerance,
    }
  }

  const witnessDirection = unit(vec.sub(gjk.point_a_mm, gjk.point_b_mm))
  const fallbackDirection = vec.neg(axis.direction)
  const resolvedDirection = vec.len(witnessDirection) > 0.5 ? witnessDirection : fallbackDirection
  return {
    intersecting: false,
    penetration_mm: 0,
    penetration_range_mm: [0, 0],
    alternatives_mm: [],
    distance_mm: distance,
    signed_separation_mm: distance,
    clearance_shortfall_mm: clearance === undefined ? null : Math.max(0, clearance - distance),
    direction: vec.len(resolvedDirection) > 0.5 ? resolvedDirection : [0, 0, 1],
    point_a_mm: gjk.point_a_mm,
    point_b_mm: gjk.point_b_mm,
    method: 'gjk_epa',
    iterations: axis.samples + gjk.iterations,
    converged: gjk.converged,
    tolerance_mm: tolerance,
  }
}

/** Build an oriented box from a segment axis and a cross-section (width x height). */
export function obbFromAxis(start: Vec3, end: Vec3, width_mm: number, height_mm: number, verticalCenter_mm: number): ConvexSolid {
  const axisX = unit(vec.sub(end, start))
  const fallback: Vec3 = Math.abs(axisX[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
  let axisY = unit(vec.cross(fallback, axisX))
  if (vec.len(axisY) < 0.5) axisY = unit(vec.cross([1, 0, 0], axisX))
  const axisZ = unit(vec.cross(axisX, axisY))
  const center = vec.add(vec.mul(vec.add(start, end), 0.5), vec.mul(axisZ, verticalCenter_mm))
  return { kind: 'obb', center, half: [vec.dist(start, end) / 2, width_mm / 2, height_mm / 2], axes: [axisX, axisY, axisZ] }
}

/** Axis-aligned box helper (foundations, devices, panels). */
export function axisBox(center: Vec3, size: Vec3): ConvexSolid {
  return { kind: 'obb', center, half: [size[0] / 2, size[1] / 2, size[2] / 2], axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] }
}

/** Extruded boundary (slabs, ceilings, walls drawn as polygons). */
export function prismFromBoundary(boundary_mm: Array<[number, number]>, z_min: number, z_max: number): ConvexSolid {
  const points: Vec3[] = []
  for (const [x, y] of boundary_mm) {
    points.push([x, y, z_min], [x, y, z_max])
  }
  return { kind: 'points', points }
}

/** Swept-sphere chain for routed pipes, cables and LED runs. Split per segment for exactness. */
export function capsuleSegments(points_mm: Vec3[], radius_mm: number): ConvexSolid[] {
  const segments: ConvexSolid[] = []
  for (let index = 1; index < points_mm.length; index++) {
    const from = points_mm[index - 1]
    const to = points_mm[index]
    if (vec.dist(from, to) < 1e-6) continue
    segments.push({ kind: 'capsule', a: [...from], b: [...to], radius: radius_mm })
  }
  return segments
}
