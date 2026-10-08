export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Triangle = [Vec3, Vec3, Vec3];
export type SegmentPlacementReference = 'centerline' | 'left_face' | 'right_face';
const EPS = 1e-8;

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
