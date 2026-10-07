import type {
  ProjectDocument,
  BathroomModuleData,
} from "@constructflow/project-model";
import type {
  CommandHandlerContext,
  CommandBusResult,
} from "@constructflow/command-schema";
import {
  simplePolygon,
  signedArea,
  length2,
  cross,
  type Vec3,
  type Triangle,
} from "@constructflow/geometry-kernel";
import {
  domainCommand,
  placement,
  resolvedData,
  output,
  vec2,
  list,
  positive,
  num,
  type DomainOutput,
} from "@constructflow/module-sdk";
export function decodeBathroom(
  d: Record<string, unknown>,
  p: ProjectDocument,
): BathroomModuleData {
  const boundary_mm = simplePolygon(
      list(d.boundary_mm, "boundary", (v) => vec2(v, "point"), 3),
      true,
    ),
    drain_mm = vec2(d.drain_mm, "drain point");
  if (
    boundary_mm.some(
      (a, i) =>
        cross(a, boundary_mm[(i + 1) % boundary_mm.length], drain_mm) <= 1e-7,
    )
  )
    throw new Error("Floor drain must be inside the bathroom boundary");
  const result: BathroomModuleData = {
    ...placement(d, p),
    boundary_mm,
    drain_mm,
    elevation_mm: num(d.elevation_mm, "elevation"),
    drop_mm: num(d.drop_mm, "drop", 0),
    slope_ratio: positive(d.slope_ratio, "floor slope"),
    waterproof_upstand_mm: positive(d.waterproof_upstand_mm, "upstand"),
    wet_wall_height_mm: positive(d.wet_wall_height_mm, "wet wall height"),
    wet_wall_length_mm: num(d.wet_wall_length_mm, "wet wall length", 0),
    tile_mm: vec2(d.tile_mm, "tile module"),
    toilet_rough_in_mm: positive(d.toilet_rough_in_mm, "toilet rough-in"),
  };
  if (result.tile_mm.some((v) => v <= 0))
    throw new Error("Tile dimensions must be positive");
  const xs = boundary_mm.map((v) => v[0]),
    ys = boundary_mm.map((v) => v[1]);
  if (
    (Math.max(...xs) - Math.min(...xs)) / result.tile_mm[0] +
      (Math.max(...ys) - Math.min(...ys)) / result.tile_mm[1] >
    5000
  )
    throw new Error("Tile grid exceeds supported line count");
  const perimeter = boundary_mm.reduce(
    (s, a, i) => s + length2(a, boundary_mm[(i + 1) % boundary_mm.length]),
    0,
  );
  if (
    result.wet_wall_length_mm > perimeter ||
    result.wet_wall_height_mm < result.waterproof_upstand_mm
  )
    throw new Error("Waterproof wet zone exceeds wall constraints");
  return result;
}
export function executeBathroomCommand(
  c: CommandHandlerContext,
): CommandBusResult | undefined {
  if (["CreateBathroom", "UpdateBathroom"].includes(c.commandName))
    return domainCommand(
      c,
      "architecture.bathroom",
      "constructflow.architecture",
      decodeBathroom,
      { update: c.commandName === "UpdateBathroom" },
    );
  return undefined;
}
export function bathroomOutputs(p: ProjectDocument): DomainOutput[] {
  return Object.values(p.objects)
    .filter((o) => o.object_type === "architecture.bathroom")
    .map((o) => {
      const d = decodeBathroom(resolvedData(p, o), p),
        out = output(o, d),
        z = d.elevation_mm - d.drop_mm,
        drain: Vec3 = [...d.drain_mm, z],
        edge = d.boundary_mm.map(
          (a) => [...a, z + d.slope_ratio * length2(a, d.drain_mm)] as Vec3,
        ),
        area = Math.abs(signedArea(d.boundary_mm)) / 1e6,
        perimeter = d.boundary_mm.reduce(
          (s, a, i) =>
            s + length2(a, d.boundary_mm[(i + 1) % d.boundary_mm.length]),
          0,
        );
      out.meshes = edge.map(
        (a, i) => [drain, a, edge[(i + 1) % edge.length]] as Triangle,
      );
      out.paths = edge.map((a) => [a, drain]);
      const floorTriangles = [...out.meshes];
      let wetRemaining = d.wet_wall_length_mm;
      for (let i = 0; i < edge.length; i++) {
        const a = edge[i],
          b = edge[(i + 1) % edge.length],
          length = length2(
            d.boundary_mm[i],
            d.boundary_mm[(i + 1) % edge.length],
          ),
          fraction = Math.min(1, wetRemaining / length),
          mid = a.map((v, j) => v + (b[j] - v) * fraction) as Vec3;
        const membrane = (p: Vec3, q: Vec3, h: number) => {
          if (length2([p[0], p[1]], [q[0], q[1]]) < 1e-6) return;
          const pt: Vec3 = [p[0], p[1], p[2] + h],
            qt: Vec3 = [q[0], q[1], q[2] + h];
          out.meshes.push([p, q, qt], [p, qt, pt]);
        };
        if (fraction > 0) membrane(a, mid, d.wet_wall_height_mm);
        if (fraction < 1) membrane(mid, b, d.waterproof_upstand_mm);
        wetRemaining = Math.max(0, wetRemaining - length);
      }
      const floorZ = (v: [number, number]) => {
        for (const tr of floorTriangles) {
          const a: [number, number] = [tr[0][0], tr[0][1]],
            b: [number, number] = [tr[1][0], tr[1][1]],
            c: [number, number] = [tr[2][0], tr[2][1]],
            area = cross(a, b, c),
            u = cross(v, b, c) / area,
            w = cross(a, v, c) / area,
            t = 1 - u - w;
          if (Math.min(u, w, t) >= -1e-7)
            return u * tr[0][2] + w * tr[1][2] + t * tr[2][2];
        }
        throw new Error("Tile endpoint falls outside floor boundary");
      };
      for (const axis of [0, 1] as const) {
        const other = axis === 0 ? 1 : 0,
          coordinates = d.boundary_mm.map((v) => v[axis]),
          min = Math.min(...coordinates),
          max = Math.max(...coordinates),
          step = d.tile_mm[axis];
        for (
          let line = Math.ceil(min / step) * step;
          line < max;
          line += step
        ) {
          if (line <= min + 1e-6) continue;
          const hits: number[] = [];
          for (let i = 0; i < d.boundary_mm.length; i++) {
            const a = d.boundary_mm[i],
              b = d.boundary_mm[(i + 1) % d.boundary_mm.length];
            if (Math.abs(b[axis] - a[axis]) < 1e-6) continue;
            const t = (line - a[axis]) / (b[axis] - a[axis]);
            if (t >= 0 && t <= 1)
              hits.push(a[other] + (b[other] - a[other]) * t);
          }
          if (hits.length >= 2) {
            const points = [Math.min(...hits), Math.max(...hits)].map((n) =>
              axis === 0
                ? ([line, n] as [number, number])
                : ([n, line] as [number, number]),
            );
            out.paths.push(points.map((v) => [...v, floorZ(v)] as Vec3));
          }
        }
      }
      const waterproof =
        area +
        (perimeter * d.waterproof_upstand_mm +
          d.wet_wall_length_mm *
            (d.wet_wall_height_mm - d.waterproof_upstand_mm)) /
          1e6;
      out.quantities = [
        {
          classification: "bathroom.floor_tile",
          description: d.mark + " floor tiling",
          quantity: area,
          unit: "m2",
          formula: "boundary area / 1e6",
        },
        {
          classification: "bathroom.waterproof",
          description: d.mark + " membrane",
          quantity: waterproof,
          unit: "m2",
          formula:
            "floor + perimeter upstand + incremental wet wall zone / 1e6",
        },
      ];
      out.schedule = {
        Area_m2: area,
        Drop_m: d.drop_mm / 1000,
        Slope: "1:" + 1 / d.slope_ratio,
        Drain_IL_m: z / 1000,
        Upstand_m: d.waterproof_upstand_mm / 1000,
        Wet_wall_m: d.wet_wall_height_mm / 1000,
        Toilet_rough_in_m: d.toilet_rough_in_mm / 1000,
        Tile: d.tile_mm.join("×") + " mm",
      };
      return out;
    });
}
export function validateBathroom(p: ProjectDocument): void {
  bathroomOutputs(p);
}
