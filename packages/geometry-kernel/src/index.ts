export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Triangle = [Vec3, Vec3, Vec3];
export type SegmentPlacementReference = 'centerline' | 'left_face' | 'right_face';
const EPS = 1e-8;

/**
 * Build 45-degree masonry hatch in wall-local model coordinates, clipped to
 * solid wall runs around hosted openings. The pattern is anchored at the wall
 * start and expressed in millimetres so Canvas, sheets and CAD share the same
 * linework regardless of viewport scale.
 */
export function wallMasonryHatchSegments(
  start: Vec2,
  end: Vec2,
  thicknessMm: number,
  openingSpans: readonly (readonly [number, number])[] = [],
  pitchMm = 140,
): Array<[Vec2, Vec2]> {
  if (![...start, ...end, thicknessMm, pitchMm].every(Number.isFinite) || !(thicknessMm > 0) || !(pitchMm > 0)) return []
  const dx = end[0] - start[0], dy = end[1] - start[1], length = Math.hypot(dx, dy)
  if (!(length > EPS)) return []
  const tangent: Vec2 = [dx / length, dy / length], normal: Vec2 = [-tangent[1], tangent[0]]
  const half = thicknessMm / 2
  const openings = openingSpans
    .filter(([from, to]) => Number.isFinite(from) && Number.isFinite(to))
    .map(([from, to]) => [Math.max(0, Math.min(length, Math.min(from, to))), Math.max(0, Math.min(length, Math.max(from, to)))] as [number, number])
    .filter(([from, to]) => to - from > EPS)
    .sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const span of openings) {
    const previous = merged.at(-1)
    if (previous && span[0] <= previous[1] + EPS) previous[1] = Math.max(previous[1], span[1])
    else merged.push([...span])
  }
  const solidRuns: Array<[number, number]> = []
  let cursor = 0
  for (const [from, to] of merged) {
    if (from > cursor + EPS) solidRuns.push([cursor, from])
    cursor = Math.max(cursor, to)
  }
  if (cursor < length - EPS) solidRuns.push([cursor, length])

  const toWorld = (along: number, across: number): Vec2 => [
    start[0] + tangent[0] * along + normal[0] * across,
    start[1] + tangent[1] * along + normal[1] * across,
  ]
  const firstIndex = Math.ceil((-half - EPS) / pitchMm)
  const lastIndex = Math.floor((length + half + EPS) / pitchMm)
  if (lastIndex - firstIndex > 10000) return []
  const segments: Array<[Vec2, Vec2]> = []
  for (const [from, to] of solidRuns) {
    for (let index = firstIndex; index <= lastIndex; index++) {
      // Local equation along - across = index * pitch. For an east-going wall
      // this slopes up to the right on plan, matching the Canvas convention.
      const c = index * pitchMm
      const hits: Vec2[] = []
      const offer = (along: number, across: number) => {
        if (along < from - EPS || along > to + EPS || across < -half - EPS || across > half + EPS) return
        if (!hits.some(([a, b]) => Math.hypot(a - along, b - across) <= 1e-6)) hits.push([along, across])
      }
      offer(from, from - c)
      offer(to, to - c)
      offer(c - half, -half)
      offer(c + half, half)
      if (hits.length >= 2) segments.push([toWorld(hits[0][0], hits[0][1]), toWorld(hits[1][0], hits[1][1])])
    }
  }
  return segments
}

/**
 * Create a rotated orthogonal grid clipped to a polygon and its void rings.
 * The origin and spacing are in model millimetres, so the result is stable
 * across Canvas zoom levels and sheet scales.
 */
export function clippedGridSegments(
  boundary: readonly Vec2[],
  stepX: number,
  stepY: number,
  voids: readonly (readonly Vec2[])[] = [],
  origin: Vec2 = [0, 0],
  rotationDeg = 0,
): Array<[Vec2, Vec2]> {
  if (boundary.length < 3 || !(stepX > 0) || !(stepY > 0) || !Number.isFinite(rotationDeg)) return []
  const radians = rotationDeg * Math.PI / 180, cos = Math.cos(radians), sin = Math.sin(radians)
  const toLocal = ([x, y]: Vec2): Vec2 => {
    const dx = x - origin[0], dy = y - origin[1]
    return [dx * cos + dy * sin, -dx * sin + dy * cos]
  }
  const toWorld = ([x, y]: Vec2): Vec2 => [origin[0] + x * cos - y * sin, origin[1] + x * sin + y * cos]
  const outer = boundary.map(toLocal), holes = voids.filter(ring => ring.length >= 3).map(ring => ring.map(toLocal))
  if ([...outer, ...holes.flat()].some(point => !Number.isFinite(point[0]) || !Number.isFinite(point[1]))) return []
  const inside = (point: Vec2, ring: readonly Vec2[]) => {
    let result = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j]
      if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result
    }
    return result
  }
  const minX = Math.min(...outer.map(point => point[0])), maxX = Math.max(...outer.map(point => point[0]))
  const minY = Math.min(...outer.map(point => point[1])), maxY = Math.max(...outer.map(point => point[1]))
  const segments: Array<[Vec2, Vec2]> = []
  const drawAxis = (vertical: boolean, fixed: number, lo: number, hi: number) => {
    const intersections = (ring: readonly Vec2[]) => {
      const values: number[] = []
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length]
        const av = vertical ? a[0] : a[1], bv = vertical ? b[0] : b[1]
        if ((av <= fixed && bv > fixed) || (bv <= fixed && av > fixed)) {
          const t = (fixed - av) / (bv - av)
          values.push((vertical ? a[1] : a[0]) + t * ((vertical ? b[1] : b[0]) - (vertical ? a[1] : a[0])))
        }
      }
      return values.sort((a, b) => a - b)
    }
    const spans = intersections(outer)
    for (let i = 1; i < spans.length; i++) {
      const start = spans[i - 1], end = spans[i]
      if (end <= start) continue
      const cuts = [start, ...holes.flatMap(intersections).filter(value => value > start + EPS && value < end - EPS), end].sort((a, b) => a - b)
      for (let j = 1; j < cuts.length; j++) {
        const aCoord = Math.max(cuts[j - 1], lo), bCoord = Math.min(cuts[j], hi), mid = (aCoord + bCoord) / 2
        const sample: Vec2 = vertical ? [fixed, mid] : [mid, fixed]
        if (bCoord - aCoord <= EPS || !inside(sample, outer) || holes.some(hole => inside(sample, hole))) continue
        const a: Vec2 = vertical ? [fixed, aCoord] : [aCoord, fixed]
        const b: Vec2 = vertical ? [fixed, bCoord] : [bCoord, fixed]
        segments.push([toWorld(a), toWorld(b)])
      }
    }
  }
  const firstX = Math.ceil((minX - EPS) / stepX), lastX = Math.floor((maxX + EPS) / stepX)
  const firstY = Math.ceil((minY - EPS) / stepY), lastY = Math.floor((maxY + EPS) / stepY)
  if (lastX - firstX > 10000 || lastY - firstY > 10000) return []
  for (let ix = firstX; ix <= lastX; ix++) drawAxis(true, ix * stepX, minY, maxY)
  for (let iy = firstY; iy <= lastY; iy++) drawAxis(false, iy * stepY, minX, maxX)
  return segments
}

/** Return a stable point strictly inside a simple polygon, including concave rings. */
export function polygonInteriorPoint(ring: readonly Vec2[]): Vec2 | undefined {
  if (ring.length < 3 || ring.some(point => !Number.isFinite(point[0]) || !Number.isFinite(point[1]))) return undefined
  const onSegment = (point: Vec2, a: Vec2, b: Vec2) => {
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const cross = (point[0] - a[0]) * dy - (point[1] - a[1]) * dx
    return Math.abs(cross) <= 1e-7 && (point[0] - a[0]) * (point[0] - b[0]) + (point[1] - a[1]) * (point[1] - b[1]) <= 1e-7
  }
  const isInside = (point: Vec2) => {
    let inside = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j]
      if (onSegment(point, a, b)) return false
      if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
    }
    return inside
  }
  const clearance = (point: Vec2) => Math.min(...ring.map((a, index) => {
    const b = ring[(index + 1) % ring.length], dx = b[0] - a[0], dy = b[1] - a[1]
    const lengthSquared = dx * dx + dy * dy
    const t = lengthSquared > EPS ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared)) : 0
    return Math.hypot(point[0] - (a[0] + dx * t), point[1] - (a[1] + dy * t))
  }))
  const candidates: Vec2[] = []
  let area2 = 0, centerX = 0, centerY = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], cross = a[0] * b[1] - b[0] * a[1]
    area2 += cross; centerX += (a[0] + b[0]) * cross; centerY += (a[1] + b[1]) * cross
  }
  if (Math.abs(area2) > EPS) candidates.push([centerX / (3 * area2), centerY / (3 * area2)])
  const levels = [...new Set(ring.map(point => point[1]))].sort((a, b) => a - b)
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] - levels[i - 1] <= EPS) continue
    const y = (levels[i] + levels[i - 1]) / 2
    const intersections: number[] = []
    for (let edge = 0; edge < ring.length; edge++) {
      const a = ring[edge], b = ring[(edge + 1) % ring.length]
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) intersections.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]))
    }
    intersections.sort((a, b) => a - b)
    for (let j = 1; j < intersections.length; j += 2) candidates.push([(intersections[j - 1] + intersections[j]) / 2, y])
  }
  return candidates.filter(isInside).sort((a, b) => clearance(b) - clearance(a))[0]
}

/** Adjust a segment centerline after a thickness change while keeping its referenced face fixed. */
export function preserveSegmentPlacementReference(
  start: Vec3,
  end: Vec3,
  reference: SegmentPlacementReference | undefined,
  previousThicknessMm: number,
  nextThicknessMm: number,
): { start: Vec3; end: Vec3; shift_mm: Vec2 } {
  if (reference === undefined || reference === 'centerline'
    || !Number.isFinite(previousThicknessMm) || !Number.isFinite(nextThicknessMm)) {
    return { start: [...start], end: [...end], shift_mm: [0, 0] };
  }
  const dx = end[0] - start[0], dy = end[1] - start[1]
  const length = Math.hypot(dx, dy)
  if (length < EPS) return { start: [...start], end: [...end], shift_mm: [0, 0] }
  const side = reference === 'left_face' ? -1 : 1
  const offset = (nextThicknessMm - previousThicknessMm) / 2 * side
  const nx = -dy / length, ny = dx / length
  const shiftX = nx * offset, shiftY = ny * offset
  return {
    start: [start[0] + shiftX, start[1] + shiftY, start[2]],
    end: [end[0] + shiftX, end[1] + shiftY, end[2]],
    shift_mm: [shiftX, shiftY],
  }
}

export function cross(a: Vec2, b: Vec2, c: Vec2): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
export function signedArea(points: readonly Vec2[]): number {
  return (
    points.reduce((s, p, i) => {
      const q = points[(i + 1) % points.length];
      return s + p[0] * q[1] - q[0] * p[1];
    }, 0) / 2
  );
}
export function length3(a: Vec3, b: Vec3): number {
  return Math.hypot(...a.map((v, i) => v - b[i]));
}
export function length2(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
export function simplePolygon(points: Vec2[], convex = false): Vec2[] {
  if (
    points.length < 3 ||
    points.some((p) => p.length !== 2 || p.some((v) => !Number.isFinite(v)))
  )
    throw new Error("Boundary requires at least three finite XY points");
  const p = points.map((v) => [...v] as Vec2);
  if (length2(p[0], p[p.length - 1]) < EPS) p.pop();
  if (p.length < 3 || Math.abs(signedArea(p)) < EPS)
    throw new Error("Boundary has zero area");
  for (let i = 0; i < p.length; i++) {
    if (length2(p[i], p[(i + 1) % p.length]) < EPS)
      throw new Error("Boundary has a duplicate adjacent point");
    for (let j = i + 1; j < p.length; j++) {
      if (j === i + 1 || (i === 0 && j === p.length - 1)) continue;
      const a = p[i],
        b = p[(i + 1) % p.length],
        c = p[j],
        d = p[(j + 1) % p.length];
      const intersects =
        cross(a, b, c) * cross(a, b, d) < -EPS &&
        cross(c, d, a) * cross(c, d, b) < -EPS;
      const on = (x: Vec2, y: Vec2, z: Vec2) =>
        Math.abs(cross(x, y, z)) < EPS &&
        z[0] >= Math.min(x[0], y[0]) - EPS &&
        z[0] <= Math.max(x[0], y[0]) + EPS &&
        z[1] >= Math.min(x[1], y[1]) - EPS &&
        z[1] <= Math.max(x[1], y[1]) + EPS;
      if (
        intersects ||
        on(a, b, c) ||
        on(a, b, d) ||
        on(c, d, a) ||
        on(c, d, b)
      )
        throw new Error("Boundary self-intersects or self-touches");
    }
  }
  if (signedArea(p) < 0) p.reverse();
  if (
    convex &&
    p.some(
      (v, i) => cross(v, p[(i + 1) % p.length], p[(i + 2) % p.length]) < -EPS,
    )
  )
    throw new Error(
      "This solver requires a convex footprint; concave boundaries are unsupported",
    );
  return p;
}
export function triangulate(polygon: Vec2[], z: number): Triangle[] {
  const p = simplePolygon(polygon),
    indices = p.map((_, i) => i),
    result: Triangle[] = [];
  while (indices.length > 3) {
    let found = false;
    for (let n = 0; n < indices.length; n++) {
      const a = indices[(n + indices.length - 1) % indices.length],
        b = indices[n],
        c = indices[(n + 1) % indices.length];
      if (cross(p[a], p[b], p[c]) <= EPS) continue;
      if (
        indices.some(
          (i) =>
            i !== a &&
            i !== b &&
            i !== c &&
            cross(p[a], p[b], p[i]) >= -EPS &&
            cross(p[b], p[c], p[i]) >= -EPS &&
            cross(p[c], p[a], p[i]) >= -EPS,
        )
      )
        continue;
      result.push([
        [...p[a], z],
        [...p[b], z],
        [...p[c], z],
      ]);
      indices.splice(n, 1);
      found = true;
      break;
    }
    if (!found) throw new Error("Boundary triangulation failed");
  }
  result.push(indices.map((i) => [...p[i], z]) as Triangle);
  return result;
}
export function extrude(
  polygon: Vec2[],
  bottom: number,
  top: number,
): Triangle[] {
  const p = simplePolygon(polygon),
    result = [
      ...triangulate(p, top),
      ...triangulate(p, bottom).map((t) => [t[2], t[1], t[0]] as Triangle),
    ];
  p.forEach((a, i) => {
    const b = p[(i + 1) % p.length];
    const x: Vec3 = [...a, bottom],
      y: Vec3 = [...b, bottom],
      u: Vec3 = [...a, top],
      v: Vec3 = [...b, top];
    result.push([x, y, v], [x, v, u]);
  });
  return result;
}
export function triangleArea([a, b, c]: Triangle): number {
  const u = b.map((v, i) => v - a[i]),
    v = c.map((x, i) => x - a[i]);
  return (
    Math.hypot(
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ) / 2
  );
}
export function clipHalfPlane(
  p: Vec2[],
  a: number,
  b: number,
  c: number,
): Vec2[] {
  const out: Vec2[] = [];
  p.forEach((s, i) => {
    const e = p[(i + 1) % p.length],
      ds = a * s[0] + b * s[1] + c,
      de = a * e[0] + b * e[1] + c;
    if (ds <= EPS) out.push(s);
    if ((ds < -EPS && de > EPS) || (ds > EPS && de < -EPS)) {
      const t = ds / (ds - de);
      out.push([s[0] + t * (e[0] - s[0]), s[1] + t * (e[1] - s[1])]);
    }
  });
  return out.filter((v, i) => i === 0 || length2(v, out[i - 1]) > EPS);
}
export function rectangle(
  origin: Vec2,
  width: number,
  depth: number,
  rotation = 0,
): Vec2[] {
  const c = Math.cos(rotation),
    s = Math.sin(rotation);
  return [
    [0, 0],
    [width, 0],
    [width, depth],
    [0, depth],
  ].map(([x, y]) => [origin[0] + x * c - y * s, origin[1] + x * s + y * c]);
}
export function box(origin: Vec3, size: Vec3, rotation = 0): Triangle[] {
  return extrude(
    rectangle([origin[0], origin[1]], size[0], size[1], rotation),
    origin[2],
    origin[2] + size[2],
  );
}

/** Circular swept segment; all axes supported, dimensions remain canonical mm. */
export function tube(a: Vec3, b: Vec3, radius: number, sides = 8): Triangle[] {
  const length = length3(a, b);
  if (!(length > 0) || !(radius > 0)) return [];
  const n: Vec3 = b.map((v, i) => (v - a[i]) / length) as Vec3;
  const seed: Vec3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u0: Vec3 = [
    n[1] * seed[2] - n[2] * seed[1],
    n[2] * seed[0] - n[0] * seed[2],
    n[0] * seed[1] - n[1] * seed[0],
  ];
  const norm = Math.hypot(...u0),
    u = u0.map((v) => v / norm) as Vec3;
  const v: Vec3 = [
    n[1] * u[2] - n[2] * u[1],
    n[2] * u[0] - n[0] * u[2],
    n[0] * u[1] - n[1] * u[0],
  ];
  const ring = (p: Vec3) =>
    Array.from(
      { length: sides },
      (_, i) =>
        p.map(
          (c, j) =>
            c +
            radius *
              (u[j] * Math.cos((i * 2 * Math.PI) / sides) +
                v[j] * Math.sin((i * 2 * Math.PI) / sides)),
        ) as Vec3,
    );
  const ra = ring(a),
    rb = ring(b),
    result: Triangle[] = [];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    result.push(
      [ra[i], rb[i], rb[j]],
      [ra[i], rb[j], ra[j]],
      [a, ra[j], ra[i]],
      [b, rb[i], rb[j]],
    );
  }
  return result;
}
