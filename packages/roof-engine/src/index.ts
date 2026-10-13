import type {
  ProjectDocument,
  RoofEdgeSlope,
  RoofModuleData,
} from "@constructflow/project-model";
import type {
  CommandHandlerContext,
  CommandBusResult,
} from "@constructflow/command-schema";
import {
  simplePolygon,
  signedArea,
  clipHalfPlane,
  triangleArea,
  length2,
  cross,
  triangulate,
  offsetPolygonOutward,
  subtractPolygonVoids,
  validatePolygonWithVoids,
  type Triangle,
  type Vec2,
  type Vec3,
} from "@constructflow/geometry-kernel";
import {
  domainCommand,
  output,
  placement,
  list,
  vec2,
  num,
  positive,
  text,
  record,
  resolvedData,
  type DomainOutput,
} from "@constructflow/module-sdk";

export function decodeRoof(
  d: Record<string, unknown>,
  p: ProjectDocument,
): RoofModuleData {
  const raw = list(d.boundary_mm, "boundary_mm", (v) => vec2(v, "boundary"), 3),
    boundary_mm = simplePolygon(raw, false),
    edges = list(
      d.edges,
      "edges",
      (v) => {
        const e = record(v);
        if (typeof e.defines_slope !== "boolean")
          throw new Error("defines_slope must be boolean");
        const slope_deg = num(e.slope_deg, "slope_deg", 0);
        if (slope_deg >= 89)
          throw new Error("Slope must be less than 89 degrees");
        return { defines_slope: e.defines_slope, slope_deg };
      },
      3,
    );
  if (edges.length !== boundary_mm.length)
    throw new Error("Every roof edge requires slope intent");
  const mapped =
    signedArea(raw) < 0
      ? edges.map(
          (_, i) => edges[(edges.length - 2 - i + edges.length) % edges.length],
        )
      : edges;
  if (
    mapped.some((e) => e.defines_slope && e.slope_deg === 0) &&
    mapped.some((e) => e.defines_slope && e.slope_deg > 0)
  )
    throw new Error(
      "Mixed zero/sloped edges are ambiguous; disable zero-slope edges",
    );
  const voids_mm = Array.isArray(d.voids_mm)
    ? (d.voids_mm as unknown[]).map((h) =>
        simplePolygon(list(h, "void", (v) => vec2(v, "void")), false),
      )
    : undefined;
  const eaves_overhang_mm = num(d.eaves_overhang_mm ?? 0, "eaves_overhang_mm", 0);
  if (eaves_overhang_mm > 3000)
    throw new Error("Eaves overhang must not exceed 3000 mm");
  const eavesBoundary = offsetPolygonOutward(boundary_mm, eaves_overhang_mm);
  if (!eavesBoundary)
    throw new Error("Eaves overhang produces an invalid or self-intersecting roof outline");
  const voidValidation = validatePolygonWithVoids(eavesBoundary, voids_mm ?? []);
  if (!voidValidation.valid) throw new Error(voidValidation.reason);
  return {
    ...placement(d, p),
    boundary_mm,
    voids_mm,
    eaves_overhang_mm,
    elevation_mm: num(d.elevation_mm, "elevation"),
    edges: mapped,
    material: text(d.material, "material"),
    thickness_mm: positive(d.thickness_mm, "thickness"),
  };
}

export interface RoofFacet {
  edge_index: number;
  vertices_mm: Vec3[];
  triangles: Triangle[];
  area_m2: number;
}

/** Return the actual outer roof edge after applying the uniform plan overhang. */
export function getRoofEaveBoundary(roof: Pick<RoofModuleData, "boundary_mm"> & { eaves_overhang_mm?: number }): Vec2[] {
  const expanded = offsetPolygonOutward(roof.boundary_mm, roof.eaves_overhang_mm ?? 0);
  if (!expanded) throw new Error("Eaves overhang produces an invalid or self-intersecting roof outline");
  return expanded;
}

function roofSurfaceHeightAt(roof: RoofModuleData, point: Vec2): number {
  const boundary = roof.boundary_mm;
  const winding = signedArea(boundary) >= 0 ? 1 : -1;
  const heights = roof.edges.flatMap((edge, index) => {
    if (!edge.defines_slope) return [];
    const a = boundary[index], b = boundary[(index + 1) % boundary.length];
    const length = length2(a, b), tangent = Math.tan(edge.slope_deg * Math.PI / 180);
    if (!(length > 0)) return [];
    const nx = -(b[1] - a[1]) / length * winding, ny = (b[0] - a[0]) / length * winding;
    const planeA = tangent * nx, planeB = tangent * ny;
    const planeC = roof.elevation_mm - tangent * (nx * a[0] + ny * a[1]);
    return [planeA * point[0] + planeB * point[1] + planeC];
  });
  return heights.length ? Math.min(...heights) : roof.elevation_mm;
}

export interface EditableRoofRidge {
  start_mm: Vec2;
  end_mm: Vec2;
  grip_mm: Vec2;
  edge_indices: [number, number];
  inward_normal: Vec2;
  width_mm: number;
  ridge_distance_mm: number;
  rise_mm: number;
}

export interface RoofSeam {
  kind: "ridge" | "hip" | "valley";
  start_mm: Vec2;
  end_mm: Vec2;
  grip_mm: Vec2;
  edge_indices: [number, number];
}

/** Locate the editable straight ridge of a two-slope gable or rectangular hip roof. */
export function getEditableRoofRidge(roof: RoofModuleData): EditableRoofRidge | null {
  const boundary = roof?.boundary_mm;
  if (!Array.isArray(boundary) || !Array.isArray(roof.edges) || boundary.length !== 4 || roof.edges.length !== 4 || Math.abs(signedArea(boundary)) < 1e-7) return null;
  const winding = signedArea(boundary) > 0 ? 1 : -1;
  const active = roof.edges.flatMap((edge, index) => edge.defines_slope && edge.slope_deg > 0 ? [index] : []);
  if (active.length === 4) {
    const seam = getRoofSeams(roof)
      .filter((candidate) => candidate.kind === "ridge" && Math.abs(candidate.edge_indices[0] - candidate.edge_indices[1]) === 2)
      .sort((left, right) => length2(right.start_mm, right.end_mm) - length2(left.start_mm, left.end_mm))[0];
    if (!seam) return null;
    let [first, second] = seam.edge_indices;
    let v1: Vec2 = [boundary[(first + 1) % 4][0] - boundary[first][0], boundary[(first + 1) % 4][1] - boundary[first][1]];
    let v2: Vec2 = [boundary[(second + 1) % 4][0] - boundary[second][0], boundary[(second + 1) % 4][1] - boundary[second][1]];
    const lengthA = Math.hypot(...v1), lengthB = Math.hypot(...v2);
    if (!(lengthA > 1e-6 && lengthB > 1e-6)) return null;
    const directionDot = (v1[0] * v2[0] + v1[1] * v2[1]) / (lengthA * lengthB);
    const parallelError = Math.abs(v1[0] * v2[1] - v1[1] * v2[0]) / (lengthA * lengthB);
    if (directionDot > -0.999 || parallelError > 0.001) return null;
    const normal = (vector: Vec2, length: number): Vec2 => [-vector[1] / length * winding, vector[0] / length * winding];
    let inward = normal(v1, lengthA);
    let origin = boundary[first];
    let oppositeOrigin = boundary[second];
    let width = (oppositeOrigin[0] - origin[0]) * inward[0] + (oppositeOrigin[1] - origin[1]) * inward[1];
    if (width < 0) {
      [first, second] = [second, first];
      [v1, v2] = [v2, v1];
      inward = normal(v1, Math.hypot(...v1));
      origin = boundary[first];
      oppositeOrigin = boundary[second];
      width = (oppositeOrigin[0] - origin[0]) * inward[0] + (oppositeOrigin[1] - origin[1]) * inward[1];
    }
    const ridgeDistance = (seam.grip_mm[0] - origin[0]) * inward[0] + (seam.grip_mm[1] - origin[1]) * inward[1];
    const rise = Math.tan(roof.edges[first].slope_deg * Math.PI / 180) * ridgeDistance;
    if (!(width > 200 && ridgeDistance > 0 && ridgeDistance < width && rise > 0)) return null;
    return {
      start_mm: seam.start_mm,
      end_mm: seam.end_mm,
      grip_mm: seam.grip_mm,
      edge_indices: [first, second],
      inward_normal: inward,
      width_mm: width,
      ridge_distance_mm: ridgeDistance,
      rise_mm: rise,
    };
  }
  if (active.length !== 2) return null;
  let [first, second] = active;
  const edgeVector = (index: number): Vec2 => [
    boundary[(index + 1) % 4][0] - boundary[index][0],
    boundary[(index + 1) % 4][1] - boundary[index][1],
  ];
  let [v1, v2] = [edgeVector(first), edgeVector(second)];
  const [l1, l2] = [Math.hypot(...v1), Math.hypot(...v2)];
  if (!(l1 > 1e-6 && l2 > 1e-6)) return null;
  const directionDot = (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2);
  const parallelError = Math.abs(v1[0] * v2[1] - v1[1] * v2[0]) / (l1 * l2);
  if (directionDot > -0.999 || parallelError > 0.001) return null;
  const normal = (v: Vec2, length: number): Vec2 => [-v[1] / length * winding, v[0] / length * winding];
  let inward = normal(v1, l1);
  const a = boundary[first];
  const b = boundary[second];
  let width = (b[0] - a[0]) * inward[0] + (b[1] - a[1]) * inward[1];
  if (width < 0) {
    [first, second] = [second, first];
    [v1, v2] = [v2, v1];
    inward = normal(v1, Math.hypot(...v1));
    const from = boundary[first], to = boundary[second];
    width = (to[0] - from[0]) * inward[0] + (to[1] - from[1]) * inward[1];
  }
  if (!(width > 200)) return null;
  const tangentA = Math.tan(roof.edges[first].slope_deg * Math.PI / 180);
  const tangentB = Math.tan(roof.edges[second].slope_deg * Math.PI / 180);
  if (!(tangentA > 0 && tangentB > 0)) return null;
  const ridgeDistance = width * tangentB / (tangentA + tangentB);
  const rise = tangentA * ridgeDistance;
  if (!(ridgeDistance > 0 && ridgeDistance < width && rise > 0)) return null;
  const origin = boundary[first];
  const scalar = (point: Vec2) => (point[0] - origin[0]) * inward[0] + (point[1] - origin[1]) * inward[1];
  const intersections: Vec2[] = [];
  for (let index = 0; index < boundary.length; index++) {
    const p = boundary[index], q = boundary[(index + 1) % boundary.length];
    const sp = scalar(p), sq = scalar(q);
    if (Math.abs(sp - ridgeDistance) <= 1e-6) intersections.push([p[0], p[1]]);
    if ((sp < ridgeDistance && sq > ridgeDistance) || (sp > ridgeDistance && sq < ridgeDistance)) {
      const t = (ridgeDistance - sp) / (sq - sp);
      intersections.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  const unique = intersections.filter((point, index) => intersections.findIndex(other => Math.hypot(other[0] - point[0], other[1] - point[1]) <= 1e-5) === index);
  if (unique.length < 2) return null;
  const tangent = [v1[0] / Math.hypot(...v1), v1[1] / Math.hypot(...v1)] as Vec2;
  unique.sort((left, right) => (left[0] - right[0]) * tangent[0] + (left[1] - right[1]) * tangent[1]);
  const start = unique[0], end = unique.at(-1)!;
  if (Math.hypot(end[0] - start[0], end[1] - start[1]) < 1) return null;
  return {
    start_mm: start,
    end_mm: end,
    grip_mm: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2],
    edge_indices: [first, second],
    inward_normal: inward,
    width_mm: width,
    ridge_distance_mm: ridgeDistance,
    rise_mm: rise,
  };
}

/** Move an editable roof ridge across its supporting pitches while preserving peak height. */
export function moveEditableRoofRidge(roof: RoofModuleData, point: Vec2): RoofEdgeSlope[] | null {
  const ridge = getEditableRoofRidge(roof);
  if (!ridge || !point.every(Number.isFinite)) return null;
  const first = ridge.edge_indices[0];
  const origin = roof.boundary_mm[first];
  const projected = (point[0] - origin[0]) * ridge.inward_normal[0] + (point[1] - origin[1]) * ridge.inward_normal[1];
  const minInset = Math.max(100, ridge.rise_mm / Math.tan(88.9 * Math.PI / 180));
  if (ridge.width_mm <= minInset * 2) return null;
  const distanceA = Math.max(minInset, Math.min(ridge.width_mm - minInset, projected));
  const distanceB = ridge.width_mm - distanceA;
  if (!(distanceA > 0 && distanceB > 0)) return null;
  const pitchA = Math.atan(ridge.rise_mm / distanceA) * 180 / Math.PI;
  const pitchB = Math.atan(ridge.rise_mm / distanceB) * 180 / Math.PI;
  if (!(pitchA > 0 && pitchA < 89 && pitchB > 0 && pitchB < 89)) return null;
  return roof.edges.map((edge, index) => index === ridge.edge_indices[0]
    ? { ...edge, slope_deg: pitchA }
    : index === ridge.edge_indices[1]
      ? { ...edge, slope_deg: pitchB }
      : { ...edge });
}

export function solveRoof(d: RoofModuleData): RoofFacet[] {
  const p = d.boundary_mm;
  const eaveBoundary = getRoofEaveBoundary(d);
  const winding = signedArea(p) >= 0 ? 1 : -1;
  const planes = d.edges.flatMap((e, i) => {
    if (!e.defines_slope) return [];
    const a = p[i],
      b = p[(i + 1) % p.length],
      L = length2(a, b),
      t = Math.tan((e.slope_deg * Math.PI) / 180),
      nx = -(b[1] - a[1]) / L * winding,
      ny = (b[0] - a[0]) / L * winding;
    return [
      {
        i,
        a: t * nx,
        b: t * ny,
        c: d.elevation_mm - t * (nx * a[0] + ny * a[1]),
      },
    ];
  });
  if (!planes.length) planes.push({ i: -1, a: 0, b: 0, c: d.elevation_mm });

  // If mono-pitch or flat roof on a general (including concave) footprint, triangulate directly.
  // Openings are removed from the returned mesh, not just from the reported area.
  if (planes.length === 1) {
    const plane = planes[0];
    const tris = subtractPolygonVoids(eaveBoundary, d.voids_mm ?? []).map((tri) => tri.map(
      (v) => [v[0], v[1], plane.a * v[0] + plane.b * v[1] + plane.c] as Vec3,
    ) as Triangle);
    const vertices_mm = eaveBoundary.map(
      (v) => [v[0], v[1], plane.a * v[0] + plane.b * v[1] + plane.c] as Vec3,
    );
    const area_m2 = tris.reduce((s, t) => s + triangleArea(t), 0) / 1e6;
    return [
      {
        edge_index: plane.i,
        vertices_mm,
        triangles: tris,
        area_m2,
      },
    ];
  }

  // Multi-slope roof: solve intersecting half-planes
  const footprintIsConvex = eaveBoundary.every((point, index) => {
    const previous = eaveBoundary[(index - 1 + eaveBoundary.length) % eaveBoundary.length]
    const next = eaveBoundary[(index + 1) % eaveBoundary.length]
    return cross(previous, point, next) * winding >= -1e-7
  })
  const sourceRegions = footprintIsConvex
    ? [eaveBoundary.map((point) => [...point] as Vec2)]
    : triangulate(eaveBoundary, 0).map((triangle) => triangle.map((point) => [point[0], point[1]] as Vec2))
  const facets: RoofFacet[] = planes.flatMap((plane) => sourceRegions.flatMap((sourceRegion) => {
    let region = sourceRegion.map((v) => [...v] as Vec2);
    for (const other of planes) {
      if (other === plane) continue;
      const A = plane.a - other.a,
        B = plane.b - other.b,
        C = plane.c - other.c;
      if (Math.abs(A) + Math.abs(B) < 1e-10 && Math.abs(C) < 1e-7) {
        if (other.i < plane.i) return [];
        continue;
      }
      region = clipHalfPlane(region, A, B, C);
      if (region.length < 3) return [];
    }
    if (region.length < 3 || Math.abs(signedArea(region)) < 1e-7) return [];
    const vertices_mm = region.map(
        (v) => [v[0], v[1], plane.a * v[0] + plane.b * v[1] + plane.c] as Vec3,
      ),
      triangles: Triangle[] = subtractPolygonVoids(region, d.voids_mm ?? []).map((tri) => tri.map(
        (v) => [v[0], v[1], plane.a * v[0] + plane.b * v[1] + plane.c] as Vec3,
      ) as Triangle);
    return [
      {
        edge_index: plane.i,
        vertices_mm,
        triangles,
        area_m2: triangles.reduce((s, t) => s + triangleArea(t), 0) / 1e6,
      },
    ];
  }));

  return facets;
}

/** Find the shared facet boundaries that form editable roof ridge, hip and valley lines. */
export function getRoofSeams(roof: RoofModuleData): RoofSeam[] {
  const boundary = roof?.boundary_mm;
  if (!Array.isArray(boundary) || boundary.length < 3 || !Array.isArray(roof.edges) || roof.edges.length !== boundary.length) return [];
  const facets = solveRoof(roof).filter((facet) => facet.edge_index >= 0 && facet.vertices_mm.length >= 3);
  const close = (left: Vec2, right: Vec2, tolerance = 0.5) => Math.hypot(left[0] - right[0], left[1] - right[1]) <= tolerance;
  const sharedSegment = (a: Vec2, b: Vec2, c: Vec2, d: Vec2): [Vec2, Vec2] | null => {
    const vx = b[0] - a[0], vy = b[1] - a[1], length = Math.hypot(vx, vy);
    if (length < 1) return null;
    const distanceFromLine = (point: Vec2) => Math.abs(vx * (point[1] - a[1]) - vy * (point[0] - a[0])) / length;
    if (distanceFromLine(c) > 0.5 || distanceFromLine(d) > 0.5) return null;
    const ux = vx / length, uy = vy / length;
    const cProjection = (c[0] - a[0]) * ux + (c[1] - a[1]) * uy;
    const dProjection = (d[0] - a[0]) * ux + (d[1] - a[1]) * uy;
    const low = Math.max(0, Math.min(cProjection, dProjection));
    const high = Math.min(length, Math.max(cProjection, dProjection));
    if (high - low < 1) return null;
    return [[a[0] + ux * low, a[1] + uy * low], [a[0] + ux * high, a[1] + uy * high]];
  };
  const reflexVertices = boundary.flatMap((point, index) => {
    const previous = boundary[(index - 1 + boundary.length) % boundary.length];
    const next = boundary[(index + 1) % boundary.length];
    const cross = (point[0] - previous[0]) * (next[1] - point[1]) - (point[1] - previous[1]) * (next[0] - point[0]);
    return cross * (signedArea(boundary) >= 0 ? 1 : -1) < -1e-6 ? [point] : [];
  });
  const seams: RoofSeam[] = [];
  const seen = new Set<string>();
  for (let firstFacet = 0; firstFacet < facets.length; firstFacet++) {
    const left = facets[firstFacet];
    for (let secondFacet = firstFacet + 1; secondFacet < facets.length; secondFacet++) {
      const right = facets[secondFacet];
      if (left.edge_index === right.edge_index) continue;
      for (let leftIndex = 0; leftIndex < left.vertices_mm.length; leftIndex++) {
        const a3 = left.vertices_mm[leftIndex], b3 = left.vertices_mm[(leftIndex + 1) % left.vertices_mm.length];
        const a: Vec2 = [a3[0], a3[1]], b: Vec2 = [b3[0], b3[1]];
        if (length2(a, b) < 1) continue;
        for (let rightIndex = 0; rightIndex < right.vertices_mm.length; rightIndex++) {
          const c3 = right.vertices_mm[rightIndex], d3 = right.vertices_mm[(rightIndex + 1) % right.vertices_mm.length];
          const c: Vec2 = [c3[0], c3[1]], d: Vec2 = [d3[0], d3[1]];
          const overlap = sharedSegment(a, b, c, d);
          if (!overlap) continue;
          const [overlapStart, overlapEnd] = overlap;
          const heightAt = (point: Vec2, start: Vec3, end: Vec3) => {
            const dx = end[0] - start[0], dy = end[1] - start[1];
            const lengthSquared = dx * dx + dy * dy;
            const t = lengthSquared > 0 ? ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared : 0;
            return start[2] + t * (end[2] - start[2]);
          };
          if ([overlapStart, overlapEnd].some((point) => Math.abs(heightAt(point, a3, b3) - heightAt(point, c3, d3)) > 0.5)) continue;
          const pair: [number, number] = [Math.min(left.edge_index, right.edge_index), Math.max(left.edge_index, right.edge_index)];
          const ordered = [overlapStart, overlapEnd].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
          const key = `${pair[0]}:${pair[1]}:${ordered.map((point) => `${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(":")}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const edgeGap = Math.min(pair[1] - pair[0], boundary.length - (pair[1] - pair[0]));
          const nonAdjacentEdges = edgeGap > 1;
          const oppositeEdges = boundary.length === 4 && nonAdjacentEdges;
          const touchesReflex = reflexVertices.some((point) => close(point, overlapStart) || close(point, overlapEnd));
          const kind: RoofSeam["kind"] = oppositeEdges || (boundary.length > 4 && nonAdjacentEdges && !touchesReflex)
            ? "ridge"
            : touchesReflex ? "valley" : "hip";
          const direction = overlapEnd[0] - overlapStart[0] || overlapEnd[1] - overlapStart[1];
          const start = direction >= 0 ? overlapStart : overlapEnd;
          const end = direction >= 0 ? overlapEnd : overlapStart;
          seams.push({ kind, start_mm: start, end_mm: end, grip_mm: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2], edge_indices: pair });
        }
      }
    }
  }
  return seams.sort((left, right) => left.edge_indices[0] - right.edge_indices[0] || left.edge_indices[1] - right.edge_indices[1] || left.start_mm[0] - right.start_mm[0] || left.start_mm[1] - right.start_mm[1]);
}

/** Move one selected roof seam grip by adjusting its two supporting pitches. */
export function moveRoofSeam(roof: RoofModuleData, edgeIndices: [number, number], point: Vec2, grip?: Vec2): RoofEdgeSlope[] | null {
  if (!point.every(Number.isFinite) || edgeIndices.length !== 2 || edgeIndices[0] === edgeIndices[1]) return null;
  const seams = getRoofSeams(roof).filter((candidate) => candidate.edge_indices[0] === Math.min(...edgeIndices) && candidate.edge_indices[1] === Math.max(...edgeIndices));
  const seam = grip
    ? seams.find((candidate) => Math.hypot(candidate.grip_mm[0] - grip[0], candidate.grip_mm[1] - grip[1]) <= 1)
    : seams[0];
  if (!seam) return null;
  const boundary = roof.boundary_mm;
  const winding = signedArea(boundary) >= 0 ? 1 : -1;
  const elevationAtGrip: number[] = [];
  const distanceAtPoint: number[] = [];
  for (const index of edgeIndices) {
    const start = boundary[index], end = boundary[(index + 1) % boundary.length];
    const edgeLength = length2(start, end);
    if (!(edgeLength > 1e-6)) return null;
    const inward: Vec2 = [-(end[1] - start[1]) / edgeLength * winding, (end[0] - start[0]) / edgeLength * winding];
    const pitch = roof.edges[index]?.slope_deg ?? 0;
    elevationAtGrip.push(Math.tan(pitch * Math.PI / 180) * ((seam.grip_mm[0] - start[0]) * inward[0] + (seam.grip_mm[1] - start[1]) * inward[1]));
    distanceAtPoint.push((point[0] - start[0]) * inward[0] + (point[1] - start[1]) * inward[1]);
  }
  const rise = (elevationAtGrip[0] + elevationAtGrip[1]) / 2;
  if (!(rise > 0) || distanceAtPoint.some((distance) => distance <= 100)) return null;
  const slopes = distanceAtPoint.map((distance) => Math.atan(rise / distance) * 180 / Math.PI);
  if (slopes.some((slope) => !(slope > 0 && slope < 89))) return null;
  return roof.edges.map((edge, index) => edgeIndices.includes(index)
    ? { ...edge, defines_slope: true, slope_deg: slopes[edgeIndices.indexOf(index)] }
    : { ...edge });
}

// -------------------------------------------------------------
// Automated Rainwater Catchment, Gutters and Downpipes (F09)
// -------------------------------------------------------------

export interface RoofCatchmentResult {
  catchment_area_m2: number;
  peak_flow_lps: number;
  recommended_downpipes: number;
  design_rainfall_mm_per_hr: number;
  runoff_coefficient: number;
}

export function calculateRoofCatchment(
  roof: RoofModuleData,
  design_rainfall_mm_per_hr = 120, // Standard Thai design rainfall
  runoff_coefficient = 0.9, // Metal sheet / concrete tile standard
  outlet_capacity_lps = 3.0, // Typical 3-inch downpipe capacity
): RoofCatchmentResult {
  const p = getRoofEaveBoundary(roof);
  let plan_area_m2 = Math.abs(signedArea(p)) / 1e6;
  if (roof.voids_mm) {
    for (const hole of roof.voids_mm) {
      plan_area_m2 -= Math.abs(signedArea(hole)) / 1e6;
    }
  }
  plan_area_m2 = Math.max(0, plan_area_m2);

  // peak_flow_lps = rainfall_mm_per_hr * catchment_area_m2 * runoff_coefficient / 3600
  const peak_flow_lps =
    Math.round(((design_rainfall_mm_per_hr * plan_area_m2 * runoff_coefficient) / 3600) * 100) / 100;
  const recommended_downpipes = Math.max(1, Math.ceil(peak_flow_lps / outlet_capacity_lps));

  return {
    catchment_area_m2: Math.round(plan_area_m2 * 100) / 100,
    peak_flow_lps,
    recommended_downpipes,
    design_rainfall_mm_per_hr,
    runoff_coefficient,
  };
}

export interface GutterRun {
  edge_index: number;
  start_point_mm: Vec3;
  end_point_mm: Vec3;
  length_m: number;
}

export interface DownpipeLocation {
  location_mm: Vec3;
  edge_index: number;
  diameter_mm: number;
}

export function solveEaveGuttersAndDownpipes(roof: RoofModuleData): {
  gutters: GutterRun[];
  downpipes: DownpipeLocation[];
  catchment: RoofCatchmentResult;
} {
  const catchment = calculateRoofCatchment(roof);
  const p = getRoofEaveBoundary(roof);
  const gutters: GutterRun[] = [];
  const hasSlopedEaves = roof.edges.some((edge) => edge.defines_slope);

  for (let i = 0; i < p.length; i++) {
    const edge = roof.edges[i];
    const p1_2d = p[i];
    const p2_2d = p[(i + 1) % p.length];
    const len_m = length2(p1_2d, p2_2d) / 1000;

    const hasGutter = hasSlopedEaves ? edge?.defines_slope : true;
    if (hasGutter) {
      const p1: Vec3 = [p1_2d[0], p1_2d[1], roofSurfaceHeightAt(roof, p1_2d)];
      const p2: Vec3 = [p2_2d[0], p2_2d[1], roofSurfaceHeightAt(roof, p2_2d)];
      gutters.push({
        edge_index: i,
        start_point_mm: p1,
        end_point_mm: p2,
        length_m: Math.round(len_m * 100) / 100,
      });
    }
  }

  const downpipes: DownpipeLocation[] = [];
  const totalGutterLen = gutters.reduce((s, g) => s + g.length_m, 0);
  const neededPipes = catchment.recommended_downpipes;

  if (gutters.length > 0 && neededPipes > 0) {
    for (let pipeIndex = 0; pipeIndex < neededPipes; pipeIndex++) {
      const target = totalGutterLen * (pipeIndex + 0.5) / neededPipes;
      let traversed = 0;
      const gutter = gutters.find((run) => {
        const containsTarget = target <= traversed + run.length_m;
        if (!containsTarget) traversed += run.length_m;
        return containsTarget;
      }) ?? gutters.at(-1)!;
      const ratio = Math.max(0.05, Math.min(0.95, (target - traversed) / Math.max(0.01, gutter.length_m)));
      const locX = gutter.start_point_mm[0] + (gutter.end_point_mm[0] - gutter.start_point_mm[0]) * ratio;
      const locY = gutter.start_point_mm[1] + (gutter.end_point_mm[1] - gutter.start_point_mm[1]) * ratio;
      downpipes.push({
        location_mm: [locX, locY, roofSurfaceHeightAt(roof, [locX, locY])],
        edge_index: gutter.edge_index,
        diameter_mm: 75, // 3-inch PVC downpipe
      });
    }
  }

  return {
    gutters,
    downpipes,
    catchment,
  };
}

export function executeRoofCommand(
  c: CommandHandlerContext,
): CommandBusResult | undefined {
  if (["GenerateRoof", "UpdateRoof"].includes(c.commandName))
    return domainCommand(c, "roof.system", "constructflow.roof", decodeRoof, {
      update: c.commandName === "UpdateRoof",
    });
  return undefined;
}

export function roofOutputs(p: ProjectDocument): DomainOutput[] {
  return Object.values(p.objects)
    .filter((o) => o.object_type === "roof.system")
    .map((o) => {
      const d = decodeRoof(resolvedData(p, o), p),
        f = solveRoof(d),
        rw = solveEaveGuttersAndDownpipes(d),
        out = output(o, d);
      const valleyRuns = getRoofSeams(d).filter((seam) => seam.kind === "valley");
      const valleyGutterMesh = valleyRuns.flatMap((seam) => {
        const dx = seam.end_mm[0] - seam.start_mm[0], dy = seam.end_mm[1] - seam.start_mm[1];
        const length = Math.hypot(dx, dy);
        if (length < 1) return [];
        const normal: Vec2 = [-dy / length, dx / length];
        const offsets = [-150, -60, 0, 60, 150], lifts = [20, 8, 4, 8, 20];
        const profile = (center: Vec2): Vec3[] => offsets.map((offset, index) => {
          const point: Vec2 = [center[0] + normal[0] * offset, center[1] + normal[1] * offset];
          return [point[0], point[1], roofSurfaceHeightAt(d, point) + lifts[index]];
        });
        const start = profile(seam.start_mm), end = profile(seam.end_mm), triangles: Triangle[] = [];
        for (let index = 0; index < offsets.length - 1; index++)
          triangles.push([start[index], end[index], end[index + 1]], [start[index], end[index + 1], start[index + 1]]);
        return triangles;
      });
      out.meshes = [...f.flatMap((v) => v.triangles), ...valleyGutterMesh];
      const eaves = getRoofEaveBoundary(d);
      out.paths = [[
        ...eaves.map((point) => [point[0], point[1], roofSurfaceHeightAt(d, point)] as Vec3),
        [eaves[0][0], eaves[0][1], roofSurfaceHeightAt(d, eaves[0])],
      ]];
      for (const seam of getRoofSeams(d)) {
        out.paths.push([
          [seam.start_mm[0], seam.start_mm[1], roofSurfaceHeightAt(d, seam.start_mm)],
          [seam.end_mm[0], seam.end_mm[1], roofSurfaceHeightAt(d, seam.end_mm)],
        ]);
      }
      if (d.voids_mm) {
        for (const hole of d.voids_mm) {
          out.paths.push([
            ...hole.map((pt) => [pt[0], pt[1], roofSurfaceHeightAt(d, pt)] as Vec3),
            [hole[0][0], hole[0][1], roofSurfaceHeightAt(d, hole[0])] as Vec3,
          ]);
        }
      }

      const totalRoofArea = f.reduce((a, v) => a + v.area_m2, 0);
      const totalGutterM = rw.gutters.reduce((s, g) => s + g.length_m, 0);
      const valleyFlashingM = valleyRuns.reduce((sum, seam) => {
        const startZ = roofSurfaceHeightAt(d, seam.start_mm), endZ = roofSurfaceHeightAt(d, seam.end_mm);
        return sum + Math.hypot(seam.end_mm[0] - seam.start_mm[0], seam.end_mm[1] - seam.start_mm[1], endZ - startZ) / 1000;
      }, 0);

      out.quantities = [
        {
          classification: "roof.covering",
          description: d.mark + " roof covering",
          quantity: Math.round(totalRoofArea * 100) / 100,
          unit: "m2",
          formula: "sum facet cross-product area / 1e6",
          material: d.material,
        },
      ];

      if (totalGutterM > 0) {
        out.quantities.push({
          classification: "roof.gutter",
          description: `${d.mark} Box Gutter & Flashing`,
          quantity: Math.round(totalGutterM * 100) / 100,
          unit: "m",
          formula: "sum eave gutter length",
          material: "stainless_steel",
        });
      }

      if (rw.downpipes.length > 0) {
        out.quantities.push({
          classification: "roof.downpipe",
          description: `${d.mark} Rainwater Downpipes`,
          quantity: rw.downpipes.length,
          unit: "pcs",
          formula: "rational_method_outlets",
          material: "pvc_pipe",
        });
      }

      if (valleyFlashingM > 0) {
        out.quantities.push({
          classification: "roof.valley_gutter",
          description: `${d.mark} Valley Gutter / Flashing`,
          quantity: Math.round(valleyFlashingM * 100) / 100,
          unit: "m",
          formula: "sum 3D valley seam length",
          material: "stainless_steel",
        });
      }

      out.schedule = {
        Facets: f.length,
        Area_m2: out.quantities[0].quantity,
        Material: d.material,
        Elevation_m: d.elevation_mm / 1000,
        Gutters_m: totalGutterM,
        ValleyGutter_m: Math.round(valleyFlashingM * 100) / 100,
        Downpipes_pcs: rw.downpipes.length,
        Catchment_lps: rw.catchment.peak_flow_lps,
      };
      return out;
    });
}

export function validateRoof(p: ProjectDocument): void {
  for (const o of Object.values(p.objects))
    if (o.object_type === "roof.system")
      solveRoof(decodeRoof(resolvedData(p, o), p));
}
