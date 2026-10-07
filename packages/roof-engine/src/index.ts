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
    boundary_mm = simplePolygon(raw, true),
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
  return {
    ...placement(d, p),
    boundary_mm,
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
  return planes.flatMap((plane) => {
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
        out = output(o, d);
      out.meshes = f.flatMap((v) => v.triangles);
      out.paths = f.map((v) => [...v.vertices_mm, v.vertices_mm[0]]);
      out.quantities = [
        {
          classification: "roof.covering",
          description: d.mark + " roof covering",
          quantity: f.reduce((a, v) => a + v.area_m2, 0),
          unit: "m2",
          formula: "sum facet cross-product area / 1e6",
          material: d.material,
        },
      ];
      out.schedule = {
        Facets: f.length,
        Area_m2: out.quantities[0].quantity,
        Material: d.material,
        Elevation_m: d.elevation_mm / 1000,
      };
      return out;
    });
}
export function validateRoof(p: ProjectDocument): void {
  for (const o of Object.values(p.objects))
    if (o.object_type === "roof.system")
      solveRoof(decodeRoof(resolvedData(p, o), p));
}
