import type {
  ProjectDocument,
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
  triangulate,
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
  const isFlat = !d.edges || !(d.edges as any[]).some((e) => e.defines_slope && e.slope_deg > 0);
  const allowConcave = Boolean(d.allow_concave || isFlat || d.voids_mm);
  const raw = list(d.boundary_mm, "boundary_mm", (v) => vec2(v, "boundary"), 3),
    boundary_mm = simplePolygon(raw, !allowConcave),
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
  return {
    ...placement(d, p),
    boundary_mm,
    voids_mm,
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

export function solveRoof(d: RoofModuleData): RoofFacet[] {
  const p = d.boundary_mm;
  const planes = d.edges.flatMap((e, i) => {
    if (!e.defines_slope) return [];
    const a = p[i],
      b = p[(i + 1) % p.length],
      L = length2(a, b),
      t = Math.tan((e.slope_deg * Math.PI) / 180),
      nx = -(b[1] - a[1]) / L,
      ny = (b[0] - a[0]) / L;
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

  // If mono-pitch or flat roof on a general (including concave) footprint, triangulate directly
  if (planes.length === 1) {
    const plane = planes[0];
    const tris = triangulate(p, d.elevation_mm).map((tri) => {
      return tri.map(
        (v) => [v[0], v[1], plane.a * v[0] + plane.b * v[1] + plane.c] as Vec3,
      ) as Triangle;
    });
    const vertices_mm = p.map(
      (v) => [v[0], v[1], plane.a * v[0] + plane.b * v[1] + plane.c] as Vec3,
    );
    const area_m2 = tris.reduce((s, t) => s + triangleArea(t), 0) / 1e6;

    let finalArea = area_m2;
    const voids = d.voids_mm;
    if (voids && voids.length > 0) {
      const totalVoidAreaM2 = voids.reduce(
        (sum: number, hole) => sum + Math.abs(signedArea(hole)) / 1e6,
        0,
      );
      finalArea = Math.max(0, finalArea - totalVoidAreaM2);
    }

    return [
      {
        edge_index: plane.i,
        vertices_mm,
        triangles: tris,
        area_m2: finalArea,
      },
    ];
  }

  // Multi-slope roof: solve intersecting half-planes
  const facets: RoofFacet[] = planes.flatMap((plane) => {
    let region = p.map((v) => [...v] as Vec2);
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
      triangles: Triangle[] = [];
    for (let i = 1; i < vertices_mm.length - 1; i++)
      triangles.push([vertices_mm[0], vertices_mm[i], vertices_mm[i + 1]]);
    return [
      {
        edge_index: plane.i,
        vertices_mm,
        triangles,
        area_m2: triangles.reduce((s, t) => s + triangleArea(t), 0) / 1e6,
      },
    ];
  });

  const voids = d.voids_mm;
  if (voids && voids.length > 0) {
    const totalVoidAreaM2 = voids.reduce(
      (sum: number, hole) => sum + Math.abs(signedArea(hole)) / 1e6,
      0,
    );
    const totalInitialArea = facets.reduce((s: number, f: RoofFacet) => s + f.area_m2, 0);
    if (totalInitialArea > 0) {
      const factor = Math.max(0, (totalInitialArea - totalVoidAreaM2) / totalInitialArea);
      for (const f of facets) {
        f.area_m2 *= factor;
      }
    }
  }
  return facets;
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
  const p = roof.boundary_mm;
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
  const p = roof.boundary_mm;
  const gutters: GutterRun[] = [];

  for (let i = 0; i < p.length; i++) {
    const edge = roof.edges[i];
    const p1_2d = p[i];
    const p2_2d = p[(i + 1) % p.length];
    const len_m = length2(p1_2d, p2_2d) / 1000;

    const hasGutter = edge?.defines_slope || roof.edges.length <= 4;
    if (hasGutter) {
      const p1: Vec3 = [p1_2d[0], p1_2d[1], roof.elevation_mm];
      const p2: Vec3 = [p2_2d[0], p2_2d[1], roof.elevation_mm];
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
    for (const g of gutters) {
      const pipesForThisGutter = Math.max(
        1,
        Math.round((g.length_m / Math.max(0.01, totalGutterLen)) * neededPipes),
      );
      for (let k = 1; k <= pipesForThisGutter; k++) {
        const ratio = k / (pipesForThisGutter + 1);
        const locX = g.start_point_mm[0] + (g.end_point_mm[0] - g.start_point_mm[0]) * ratio;
        const locY = g.start_point_mm[1] + (g.end_point_mm[1] - g.start_point_mm[1]) * ratio;
        downpipes.push({
          location_mm: [locX, locY, roof.elevation_mm],
          edge_index: g.edge_index,
          diameter_mm: 75, // 3-inch PVC downpipe
        });
      }
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
      out.meshes = f.flatMap((v) => v.triangles);
      out.paths = f.map((v) => [...v.vertices_mm, v.vertices_mm[0]]);
      if (d.voids_mm) {
        for (const hole of d.voids_mm) {
          out.paths.push([
            ...hole.map((pt) => [pt[0], pt[1], d.elevation_mm] as Vec3),
            [hole[0][0], hole[0][1], d.elevation_mm] as Vec3,
          ]);
        }
      }

      const totalRoofArea = f.reduce((a, v) => a + v.area_m2, 0);
      const totalGutterM = rw.gutters.reduce((s, g) => s + g.length_m, 0);

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

      out.schedule = {
        Facets: f.length,
        Area_m2: out.quantities[0].quantity,
        Material: d.material,
        Elevation_m: d.elevation_mm / 1000,
        Gutters_m: totalGutterM,
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
