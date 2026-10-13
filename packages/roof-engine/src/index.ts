import type {
  ProjectDocument,
  RainwaterDesignSettings,
  RoofEdgeSlope,
  RoofModuleData,
} from "@constructflow/project-model";
import { DEFAULT_RAINWATER_DESIGN } from "@constructflow/project-model";
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
  const framing_system = d.framing_system;
  if (framing_system !== undefined && !["none", "rafter_purlin", "truss_purlin", "rafter_truss_purlin"].includes(String(framing_system)))
    throw new Error("framing_system must be none, rafter_purlin, truss_purlin or rafter_truss_purlin");
  const section = (value: unknown, label: string): [number, number] | undefined => {
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || value.length !== 2) throw new Error(`${label} must have width and depth`);
    return [positive(value[0], `${label}[0]`), positive(value[1], `${label}[1]`)];
  };
  return {
    ...placement(d, p),
    boundary_mm,
    voids_mm,
    eaves_overhang_mm,
    elevation_mm: num(d.elevation_mm, "elevation"),
    edges: mapped,
    material: text(d.material, "material"),
    thickness_mm: positive(d.thickness_mm, "thickness"),
    ...(framing_system !== undefined ? { framing_system: framing_system as RoofModuleData["framing_system"] } : {}),
    ...(d.rafter_spacing_mm !== undefined ? { rafter_spacing_mm: positive(d.rafter_spacing_mm, "rafter_spacing_mm") } : {}),
    ...(d.purlin_spacing_mm !== undefined ? { purlin_spacing_mm: positive(d.purlin_spacing_mm, "purlin_spacing_mm") } : {}),
    ...(d.truss_spacing_mm !== undefined ? { truss_spacing_mm: positive(d.truss_spacing_mm, "truss_spacing_mm") } : {}),
    ...(section(d.rafter_section_mm, "rafter_section_mm") ? { rafter_section_mm: section(d.rafter_section_mm, "rafter_section_mm") } : {}),
    ...(section(d.purlin_section_mm, "purlin_section_mm") ? { purlin_section_mm: section(d.purlin_section_mm, "purlin_section_mm") } : {}),
    ...(section(d.truss_chord_section_mm, "truss_chord_section_mm") ? { truss_chord_section_mm: section(d.truss_chord_section_mm, "truss_chord_section_mm") } : {}),
    ...(section(d.truss_web_section_mm, "truss_web_section_mm") ? { truss_web_section_mm: section(d.truss_web_section_mm, "truss_web_section_mm") } : {}),
    ...(d.truss_depth_mm !== undefined ? { truss_depth_mm: positive(d.truss_depth_mm, "truss_depth_mm") } : {}),
    ...(d.framing_material !== undefined ? { framing_material: text(d.framing_material, "framing_material") } : {}),
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
// Parametric Roof Framing (Rafters, Purlins and Trusses)
// -------------------------------------------------------------

export type RoofFramingRole = "rafter" | "purlin" | "truss_top_chord" | "truss_bottom_chord" | "truss_web";

export interface RoofFramingMember {
  role: RoofFramingRole;
  start_point_mm: Vec3;
  end_point_mm: Vec3;
  section_mm: [number, number];
  material: string;
  length_m: number;
}

export interface RoofFramingResult {
  members: RoofFramingMember[];
  truss_count: number;
  warnings: string[];
}

const DEFAULT_ROOF_FRAMING = {
  framing_system: "rafter_purlin" as const,
  rafter_spacing_mm: 1000,
  purlin_spacing_mm: 1000,
  truss_spacing_mm: 1200,
  rafter_section_mm: [50, 100] as [number, number],
  purlin_section_mm: [45, 75] as [number, number],
  truss_chord_section_mm: [50, 100] as [number, number],
  truss_web_section_mm: [40, 40] as [number, number],
  truss_depth_mm: 500,
  framing_material: "steel",
};

function roofFrameParams(roof: RoofModuleData) {
  return {
    framing_system: roof.framing_system ?? DEFAULT_ROOF_FRAMING.framing_system,
    rafter_spacing_mm: roof.rafter_spacing_mm ?? DEFAULT_ROOF_FRAMING.rafter_spacing_mm,
    purlin_spacing_mm: roof.purlin_spacing_mm ?? DEFAULT_ROOF_FRAMING.purlin_spacing_mm,
    truss_spacing_mm: roof.truss_spacing_mm ?? DEFAULT_ROOF_FRAMING.truss_spacing_mm,
    rafter_section_mm: roof.rafter_section_mm ?? DEFAULT_ROOF_FRAMING.rafter_section_mm,
    purlin_section_mm: roof.purlin_section_mm ?? DEFAULT_ROOF_FRAMING.purlin_section_mm,
    truss_chord_section_mm: roof.truss_chord_section_mm ?? DEFAULT_ROOF_FRAMING.truss_chord_section_mm,
    truss_web_section_mm: roof.truss_web_section_mm ?? DEFAULT_ROOF_FRAMING.truss_web_section_mm,
    truss_depth_mm: roof.truss_depth_mm ?? DEFAULT_ROOF_FRAMING.truss_depth_mm,
    framing_material: roof.framing_material ?? DEFAULT_ROOF_FRAMING.framing_material,
  };
}

function mergeIntervals(intervals: Array<[number, number]>, tolerance = 2): Array<[number, number]> {
  const sorted = intervals.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b - a > 1)
    .map(([a, b]) => [Math.min(a, b), Math.max(a, b)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (previous && interval[0] <= previous[1] + tolerance) previous[1] = Math.max(previous[1], interval[1]);
    else merged.push([...interval]);
  }
  return merged;
}

/** Intersect a line at one local coordinate with a convex projected roof facet. */
function polygonIntervalsAt(vertices: Vec3[], origin: Vec2, tangent: Vec2, normal: Vec2, fixedAxis: "u" | "n", fixed: number): Array<[number, number]> {
  const local = vertices.map(([x, y]) => {
    const dx = x - origin[0], dy = y - origin[1];
    return [dx * tangent[0] + dy * tangent[1], dx * normal[0] + dy * normal[1]] as Vec2;
  });
  const fixedIndex = fixedAxis === "u" ? 0 : 1, varyingIndex = 1 - fixedIndex;
  const hits: number[] = [];
  for (let index = 0; index < local.length; index++) {
    const a = local[index], b = local[(index + 1) % local.length];
    const qa = a[fixedIndex], qb = b[fixedIndex], va = a[varyingIndex], vb = b[varyingIndex];
    if (Math.abs(qa - fixed) < 0.5) hits.push(va);
    if ((qa < fixed && qb > fixed) || (qb < fixed && qa > fixed))
      hits.push(va + (vb - va) * (fixed - qa) / (qb - qa));
  }
  hits.sort((a, b) => a - b);
  const unique = hits.filter((value, index) => index === 0 || Math.abs(value - hits[index - 1]) > 0.5);
  const intervals: Array<[number, number]> = [];
  for (let index = 0; index + 1 < unique.length; index += 2) {
    if (unique[index + 1] - unique[index] > 1) intervals.push([unique[index], unique[index + 1]]);
  }
  return intervals;
}

function stations(length: number, spacing: number): number[] {
  const result = [0];
  for (let at = spacing; at < length - 1; at += spacing) result.push(at);
  if (length > 1 && Math.abs(result.at(-1)! - length) > 1) result.push(length);
  return result;
}

function makeFramingMember(role: RoofFramingRole, start: Vec3, end: Vec3, section: [number, number], material: string): RoofFramingMember | null {
  const length_m = Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]) / 1000;
  if (length_m < 0.05) return null;
  const halfDepth = section[1] / 2;
  return {
    role,
    start_point_mm: [start[0], start[1], start[2] - halfDepth],
    end_point_mm: [end[0], end[1], end[2] - halfDepth],
    section_mm: [...section],
    material,
    length_m,
  };
}

function findOpposingEavePair(roof: RoofModuleData): [number, number] | null {
  const boundary = getRoofEaveBoundary(roof), candidates: Array<{ indices: [number, number]; score: number }> = [];
  for (let first = 0; first < boundary.length; first++) {
    if (!roof.edges[first]?.defines_slope) continue;
    const a = boundary[first], b = boundary[(first + 1) % boundary.length], dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    if (length < 1000) continue;
    const u: Vec2 = [dx / length, dy / length], midpoint: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    for (let second = first + 1; second < boundary.length; second++) {
      if (!roof.edges[second]?.defines_slope) continue;
      const c = boundary[second], d = boundary[(second + 1) % boundary.length], ex = d[0] - c[0], ey = d[1] - c[1], otherLength = Math.hypot(ex, ey);
      if (otherLength < 1000 || Math.abs((dx * ex + dy * ey) / (length * otherLength)) < 0.995) continue;
      const separation = Math.abs((c[0] - midpoint[0]) * (-u[1]) + (c[1] - midpoint[1]) * u[0]);
      if (separation < 1000) continue;
      candidates.push({ indices: [first, second], score: Math.min(length, otherLength) * separation });
    }
  }
  return candidates.sort((a, b) => b.score - a.score || a.indices[0] - b.indices[0])[0]?.indices ?? null;
}

function segmentSeamParameters(start: Vec2, end: Vec2, seams: RoofSeam[]): number[] {
  const rx = end[0] - start[0], ry = end[1] - start[1], values = [0, 1];
  for (const seam of seams) {
    const sx = seam.end_mm[0] - seam.start_mm[0], sy = seam.end_mm[1] - seam.start_mm[1];
    const denominator = rx * sy - ry * sx;
    if (Math.abs(denominator) < 1e-8) continue;
    const qx = seam.start_mm[0] - start[0], qy = seam.start_mm[1] - start[1];
    const t = (qx * sy - qy * sx) / denominator, u = (qx * ry - qy * rx) / denominator;
    if (t > 1e-5 && t < 1 - 1e-5 && u >= -1e-5 && u <= 1 + 1e-5) values.push(t);
  }
  return [...new Set(values.map(value => Math.round(value * 1e7) / 1e7))].sort((a, b) => a - b);
}

/** Generate framing geometry from roof facets and the selected roof type's spacing/sections. */
export function solveRoofFraming(roof: RoofModuleData): RoofFramingResult {
  const settings = roofFrameParams(roof), members: RoofFramingMember[] = [], warnings: string[] = [];
  if (settings.framing_system === "none") return { members, truss_count: 0, warnings };
  const boundary = getRoofEaveBoundary(roof), winding = signedArea(roof.boundary_mm) >= 0 ? 1 : -1;
  const facets = solveRoof(roof).filter(facet => facet.edge_index >= 0 && facet.vertices_mm.length >= 3);
  if (settings.framing_system === "rafter_purlin" || settings.framing_system === "rafter_truss_purlin") {
    for (let edgeIndex = 0; edgeIndex < boundary.length; edgeIndex++) {
      if (!roof.edges[edgeIndex]?.defines_slope) continue;
      const a = boundary[edgeIndex], b = boundary[(edgeIndex + 1) % boundary.length], length = length2(a, b);
      if (length < 1) continue;
      const tangent: Vec2 = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
      const normal: Vec2 = [-tangent[1] * winding, tangent[0] * winding];
      const edgeFacets = facets.filter(facet => facet.edge_index === edgeIndex);
      const project = (point: Vec3): Vec2 => {
        const dx = point[0] - a[0], dy = point[1] - a[1];
        return [dx * tangent[0] + dy * tangent[1], dx * normal[0] + dy * normal[1]];
      };
      for (const u of stations(length, settings.rafter_spacing_mm)) {
        const intervals = mergeIntervals(edgeFacets.flatMap(facet => polygonIntervalsAt(facet.vertices_mm, a, tangent, normal, "u", u)));
        for (const [fromN, toN] of intervals) {
          const xy0: Vec2 = [a[0] + tangent[0] * u + normal[0] * fromN, a[1] + tangent[1] * u + normal[1] * fromN];
          const xy1: Vec2 = [a[0] + tangent[0] * u + normal[0] * toN, a[1] + tangent[1] * u + normal[1] * toN];
          const member = makeFramingMember("rafter", [...xy0, roofSurfaceHeightAt(roof, xy0)], [...xy1, roofSurfaceHeightAt(roof, xy1)], settings.rafter_section_mm, settings.framing_material);
          if (member) members.push(member);
        }
      }
      const maxN = Math.max(0, ...edgeFacets.flatMap(facet => facet.vertices_mm.map(point => project(point)[1])));
      for (let n = settings.purlin_spacing_mm; n < maxN - 1; n += settings.purlin_spacing_mm) {
        const intervals = mergeIntervals(edgeFacets.flatMap(facet => polygonIntervalsAt(facet.vertices_mm, a, tangent, normal, "n", n)));
        for (const [fromU, toU] of intervals) {
          const xy0: Vec2 = [a[0] + tangent[0] * fromU + normal[0] * n, a[1] + tangent[1] * fromU + normal[1] * n];
          const xy1: Vec2 = [a[0] + tangent[0] * toU + normal[0] * n, a[1] + tangent[1] * toU + normal[1] * n];
          const member = makeFramingMember("purlin", [...xy0, roofSurfaceHeightAt(roof, xy0)], [...xy1, roofSurfaceHeightAt(roof, xy1)], settings.purlin_section_mm, settings.framing_material);
          if (member) members.push(member);
        }
      }
    }
  }
  let truss_count = 0;
  if (settings.framing_system === "truss_purlin" || settings.framing_system === "rafter_truss_purlin") {
    const pair = findOpposingEavePair(roof);
    if (!pair) warnings.push("ไม่พบแนวชายคาคู่ขนานตรงข้าม จึงยังจัดวางทรัสอัตโนมัติไม่ได้");
    else {
      const [edgeA, edgeB] = pair, a0 = boundary[edgeA], a1 = boundary[(edgeA + 1) % boundary.length];
      const b0 = boundary[edgeB], b1 = boundary[(edgeB + 1) % boundary.length];
      const aLength = length2(a0, a1), u: Vec2 = [(a1[0] - a0[0]) / aLength, (a1[1] - a0[1]) / aLength];
      const projection = (point: Vec2) => (point[0] - a0[0]) * u[0] + (point[1] - a0[1]) * u[1];
      const bRange: [number, number] = [projection(b0), projection(b1)].sort((x, y) => x - y) as [number, number];
      const from = Math.max(0, bRange[0]), to = Math.min(aLength, bRange[1]);
      const bottomElevation = Math.min(roofSurfaceHeightAt(roof, a0), roofSurfaceHeightAt(roof, a1), roofSurfaceHeightAt(roof, b0), roofSurfaceHeightAt(roof, b1)) - settings.truss_depth_mm;
      const seams = getRoofSeams(roof);
      const pointOnB = (target: number): Vec2 => {
        const t = (target - projection(b0)) / (projection(b1) - projection(b0));
        return [b0[0] + (b1[0] - b0[0]) * t, b0[1] + (b1[1] - b0[1]) * t];
      };
      for (const station of stations(to - from, settings.truss_spacing_mm)) {
        const s = from + station, pointA: Vec2 = [a0[0] + u[0] * s, a0[1] + u[1] * s], pointB = pointOnB(s);
        const breaks = segmentSeamParameters(pointA, pointB, seams);
        const topAt = (t: number): Vec3 => {
          const xy: Vec2 = [pointA[0] + (pointB[0] - pointA[0]) * t, pointA[1] + (pointB[1] - pointA[1]) * t];
          return [xy[0], xy[1], roofSurfaceHeightAt(roof, xy)];
        };
        for (let index = 0; index + 1 < breaks.length; index++) {
          const member = makeFramingMember("truss_top_chord", topAt(breaks[index]), topAt(breaks[index + 1]), settings.truss_chord_section_mm, settings.framing_material);
          if (member) members.push(member);
        }
        const bottomAt = (t: number): Vec3 => [pointA[0] + (pointB[0] - pointA[0]) * t, pointA[1] + (pointB[1] - pointA[1]) * t, bottomElevation];
        const bottom = makeFramingMember("truss_bottom_chord", bottomAt(0), bottomAt(1), settings.truss_chord_section_mm, settings.framing_material);
        if (bottom) members.push(bottom);
        for (const [topT, bottomT] of [[0, 0], [1, 1], [0.5, 0.5], [0.5, 0.25], [0.5, 0.75]] as const) {
          const web = makeFramingMember("truss_web", bottomAt(bottomT), topAt(topT), settings.truss_web_section_mm, settings.framing_material);
          if (web) members.push(web);
        }
        truss_count++;
      }
    }
  }
  return { members, truss_count, warnings };
}

function framingMemberTriangles(member: RoofFramingMember): Triangle[] {
  const start = member.start_point_mm, end = member.end_point_mm;
  const axisLength = Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
  if (axisLength < 1e-6) return [];
  const axis: Vec3 = [(end[0] - start[0]) / axisLength, (end[1] - start[1]) / axisLength, (end[2] - start[2]) / axisLength];
  const reference: Vec3 = Math.abs(axis[2]) > 0.9 ? [0, 1, 0] : [0, 0, 1];
  const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const normalize = (v: Vec3): Vec3 => { const n = Math.hypot(...v); return n ? [v[0] / n, v[1] / n, v[2] / n] : [1, 0, 0]; };
  const side = normalize(cross3(axis, reference)), up = normalize(cross3(axis, side));
  const corners = (center: Vec3): Vec3[] => {
    const halfSide = member.section_mm[0] / 2, halfUp = member.section_mm[1] / 2;
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, v]) => [
      center[0] + side[0] * halfSide * s + up[0] * halfUp * v,
      center[1] + side[1] * halfSide * s + up[1] * halfUp * v,
      center[2] + side[2] * halfSide * s + up[2] * halfUp * v,
    ] as Vec3);
  };
  const a = corners(start), b = corners(end), triangles: Triangle[] = [];
  triangles.push([a[0], a[2], a[1]], [a[0], a[3], a[2]], [b[0], b[1], b[2]], [b[0], b[2], b[3]]);
  for (let index = 0; index < 4; index++) {
    const next = (index + 1) % 4;
    triangles.push([a[index], b[index], b[next]], [a[index], b[next], a[next]]);
  }
  return triangles;
}

// -------------------------------------------------------------
// Automated Rainwater Catchment, Gutters and Downpipes (F09)
// -------------------------------------------------------------

export interface RoofCatchmentResult {
  catchment_area_m2: number;
  peak_flow_lps: number;
  recommended_downpipes: number;
  design_rainfall_mm_per_hr: number;
  design_return_period_years: number;
  design_source: string;
  design_location: string;
  runoff_coefficient: number;
  outlet_capacity_lps: number;
}

export function calculateRoofCatchment(
  roof: RoofModuleData,
  design: RainwaterDesignSettings | number = DEFAULT_RAINWATER_DESIGN,
  runoff_coefficient?: number,
  outlet_capacity_lps?: number,
): RoofCatchmentResult {
  // Numeric arguments remain supported for older callers; production project output always passes
  // the saved project settings so no location-independent value silently drives roof sizing.
  const settings: RainwaterDesignSettings = typeof design === "number"
    ? { ...DEFAULT_RAINWATER_DESIGN, design_rainfall_mm_per_hr: design,
        ...(runoff_coefficient !== undefined ? { runoff_coefficient } : {}),
        ...(outlet_capacity_lps !== undefined ? { outlet_capacity_lps } : {}) }
    : { ...DEFAULT_RAINWATER_DESIGN, ...design };
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
    Math.round(((settings.design_rainfall_mm_per_hr * plan_area_m2 * settings.runoff_coefficient) / 3600) * 100) / 100;
  const recommended_downpipes = Math.max(1, Math.ceil(peak_flow_lps / settings.outlet_capacity_lps));

  return {
    catchment_area_m2: Math.round(plan_area_m2 * 100) / 100,
    peak_flow_lps,
    recommended_downpipes,
    design_rainfall_mm_per_hr: settings.design_rainfall_mm_per_hr,
    design_return_period_years: settings.design_return_period_years,
    design_source: settings.source,
    design_location: settings.location ?? '',
    runoff_coefficient: settings.runoff_coefficient,
    outlet_capacity_lps: settings.outlet_capacity_lps,
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

export function solveEaveGuttersAndDownpipes(roof: RoofModuleData, settings: RainwaterDesignSettings = DEFAULT_RAINWATER_DESIGN): {
  gutters: GutterRun[];
  downpipes: DownpipeLocation[];
  catchment: RoofCatchmentResult;
} {
  const catchment = calculateRoofCatchment(roof, settings);
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
        diameter_mm: settings.downpipe_diameter_mm,
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
        rainDesign = p.rainwater_design ?? DEFAULT_RAINWATER_DESIGN,
        rw = solveEaveGuttersAndDownpipes(d, rainDesign),
        framing = solveRoofFraming(d),
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
      const coveringMesh = f.flatMap((facet) => facet.triangles);
      const framingMesh = framing.members.flatMap(framingMemberTriangles);
      out.mesh_groups = {
        roof_covering: coveringMesh,
        valley_gutters: valleyGutterMesh,
        roof_framing: framingMesh,
      };
      out.meshes = [...coveringMesh, ...valleyGutterMesh, ...framingMesh];
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

      const framingQuantities: Array<{ role: RoofFramingRole; classification: string; description: string }> = [
        { role: "rafter", classification: "roof.rafter", description: "Roof rafters" },
        { role: "purlin", classification: "roof.purlin", description: "Roof purlins" },
        { role: "truss_top_chord", classification: "roof.truss_chord", description: "Roof truss top chords" },
        { role: "truss_bottom_chord", classification: "roof.truss_chord", description: "Roof truss bottom chords" },
        { role: "truss_web", classification: "roof.truss_web", description: "Roof truss webs" },
      ];
      for (const item of framingQuantities) {
        const members = framing.members.filter(member => member.role === item.role);
        const quantity = members.reduce((sum, member) => sum + member.length_m, 0);
        if (quantity > 0) out.quantities.push({
          classification: item.classification,
          description: `${d.mark} ${item.description} (${d.framing_material ?? DEFAULT_ROOF_FRAMING.framing_material})`,
          quantity: Math.round(quantity * 100) / 100,
          unit: "m",
          formula: `sum ${item.role} member centerline lengths from roof type spacing`,
          material: d.framing_material ?? DEFAULT_ROOF_FRAMING.framing_material,
        });
      }

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
        Rainfall_mm_h: rw.catchment.design_rainfall_mm_per_hr,
        Rainfall_return_period_years: rw.catchment.design_return_period_years,
        Rainfall_source: rw.catchment.design_source,
        Rainfall_location: rw.catchment.design_location,
        Runoff_coefficient: rw.catchment.runoff_coefficient,
        Rafters_pcs: framing.members.filter(member => member.role === "rafter").length,
        Purlins_pcs: framing.members.filter(member => member.role === "purlin").length,
        Trusses_pcs: framing.truss_count,
      };
      out.warnings.push(...framing.warnings);
      if (rainDesign.source.includes("ชั่วคราว") || !rainDesign.location?.trim()) out.warnings.push("ต้องยืนยันตำแหน่งพื้นที่และข้อมูลความเข้มฝนจากแหล่งอ้างอิงของโครงการก่อนใช้คำนวณขั้นสุดท้าย");
      return out;
    });
}

export function validateRoof(p: ProjectDocument): void {
  for (const o of Object.values(p.objects))
    if (o.object_type === "roof.system")
      solveRoof(decodeRoof(resolvedData(p, o), p));
}
