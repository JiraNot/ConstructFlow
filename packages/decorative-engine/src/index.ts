import type {
  ProjectDocument,
  MouldingModuleData,
  PanelLayoutModuleData,
} from "@constructflow/project-model";
import type {
  CommandHandlerContext,
  CommandBusResult,
} from "@constructflow/command-schema";
import {
  simplePolygon,
  length3,
  rectangle,
  box,
  triangulate,
  type Triangle,
  type Vec3,
} from "@constructflow/geometry-kernel";
import {
  domainCommand,
  placement,
  resolvedData,
  output,
  vec2,
  vec3,
  list,
  positive,
  num,
  integer,
  text,
  type DomainOutput,
} from "@constructflow/module-sdk";
export function decodeMoulding(
  d: Record<string, unknown>,
  p: ProjectDocument,
): MouldingModuleData {
  let path_mm = list(d.path_mm, "path_mm", (v) => vec3(v, "path point"), 2);
  const closed = d.closed === true;
  if (closed && length3(path_mm[0], path_mm[path_mm.length - 1]) < 1e-7)
    path_mm = path_mm.slice(0, -1);
  if (closed) {
    if (path_mm.length < 3) throw new Error("Closed path needs three corners");
    simplePolygon(sweepFrame(path_mm).points);
  }
  const result: MouldingModuleData = {
    ...placement(d, p),
    path_mm,
    profile_mm: simplePolygon(
      list(d.profile_mm, "profile_mm", (v) => vec2(v, "profile point"), 3),
    ),
    closed,
    miter_limit: positive(d.miter_limit, "miter_limit"),
    material: text(d.material, "material"),
    ...(typeof d.host_id === "string" ? { host_id: d.host_id } : {}),
  };
  sweepMoulding(result);
  return result;
}
// A deterministic planar frame supports horizontal, vertical and tilted runs.
// Profile X is the in-plane left offset; profile Y is normal to the path plane.
function sweepFrame(path: Vec3[]): { points: [number, number][]; u: Vec3; v: Vec3; normal: Vec3 } {
  const sub = (a: Vec3, b: Vec3): Vec3 => a.map((x, i) => x - b[i]) as Vec3;
  const dot = (a: Vec3, b: Vec3) => a.reduce((s, x, i) => s + x * b[i], 0);
  const cross = (a: Vec3, b: Vec3): Vec3 => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const unit = (a: Vec3): Vec3 => { const L = Math.hypot(...a); return a.map(x => x / L) as Vec3; };
  const origin = path[0], first = sub(path[1], origin);
  if (Math.hypot(...first) < 1e-8) throw new Error("Sweep path has zero length");
  let normal: Vec3 | undefined;
  for (const point of path.slice(2)) {
    const n = cross(unit(first), sub(point, origin));
    if (Math.hypot(...n) > 1e-7) { normal = unit(n); break; }
  }
  if (!normal) {
    const t = unit(first), axis: Vec3 = Math.abs(t[2]) < 0.99 ? [0,0,1] : [0,1,0];
    normal = unit(axis.map((x,i) => x - dot(axis,t)*t[i]) as Vec3);
  }
  const major = normal.reduce((best, x, i) => Math.abs(x) > Math.abs(normal![best]) ? i : best, 0);
  if (normal[major] < 0) normal = normal.map(x => -x) as Vec3;
  const axis: Vec3 = Math.abs(normal[0]) < 0.99 ? [1,0,0] : [0,1,0];
  const u = unit(axis.map((x,i) => x - dot(axis,normal!)*normal![i]) as Vec3), v = cross(normal,u);
  const points = path.map(point => {
    const delta = sub(point,origin);
    if (Math.abs(dot(delta,normal!)) > 1e-5) throw new Error("Sweep requires a planar path; non-planar compound runs are unsupported");
    return [dot(delta,u), dot(delta,v)] as [number,number];
  });
  return { points, u, v, normal };
}
export function sweepMoulding(d: MouldingModuleData): Triangle[] {
  const frame = sweepFrame(d.path_mm), n = d.path_mm.length,
    segments = d.closed ? n : n - 1,
    tangents = frame.points.slice(0, segments).map((a, i) => {
      const b = frame.points[(i + 1) % n],
        L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 1e-8) throw new Error("Sweep path has zero length");
      return [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    });
  const rings = d.path_mm.map((a, i) => {
    const prev = tangents[(i - 1 + segments) % segments],
      next = tangents[i % segments];
    const N = (t: number[]) => [-t[1], t[0]];
    let normal: number[];
    if (!d.closed && i === 0) normal = N(next);
    else if (!d.closed && i === n - 1) normal = N(prev);
    else {
      const x = N(prev),
        y = N(next),
        den = 1 + prev[0] * next[0] + prev[1] * next[1];
      if (den < 1e-7) throw new Error("Sweep path reverses at corner");
      normal = [(x[0] + y[0]) / den, (x[1] + y[1]) / den];
      if (Math.hypot(...normal) > d.miter_limit)
        throw new Error("Miter exceeds configured limit");
    }
    return d.profile_mm.map(
      ([offset, depth]) => a.map((coordinate, axis) =>
        coordinate + (frame.u[axis] * normal[0] + frame.v[axis] * normal[1]) * offset + frame.normal[axis] * depth,
      ) as Vec3,
    );
  });
  const result: Triangle[] = [];
  for (let i = 0; i < segments; i++)
    for (let j = 0; j < d.profile_mm.length; j++) {
      const next = (j + 1) % d.profile_mm.length,
        a = rings[i][j],
        b = rings[i][next],
        c = rings[(i + 1) % n][j],
        v = rings[(i + 1) % n][next];
      result.push([a, c, v], [a, v, b]);
    }
  if (!d.closed) {
    const face = triangulate(d.profile_mm, 0);
    for (const t of face) {
      const ids = t.map((v) =>
        d.profile_mm.findIndex((x) => x[0] === v[0] && x[1] === v[1]),
      );
      result.push(
        ids.map((i) => rings[0][i]).reverse() as Triangle,
        ids.map((i) => rings[n - 1][i]) as Triangle,
      );
    }
  }
  return result;
}
export function decodePanels(
  d: Record<string, unknown>,
  p: ProjectDocument,
): PanelLayoutModuleData {
  const host_id = text(d.host_id, "host_id");
  if (p.objects[host_id]?.object_type !== "architecture.wall")
    throw new Error("Panel layout requires a wall host");
  const result: PanelLayoutModuleData = {
    ...placement(d, p),
    host_id,
    rows: integer(d.rows, "rows"),
    columns: integer(d.columns, "columns"),
    margin_mm: num(d.margin_mm, "margin", 0),
    gap_mm: num(d.gap_mm, "gap", 0),
    depth_mm: positive(d.depth_mm, "depth"),
    material: text(d.material, "material"),
  };
  if (result.rows * result.columns > 10000)
    throw new Error("Panel count exceeds supported limit");
  panelRects(result, p);
  return result;
}
function panelRects(d: PanelLayoutModuleData, p: ProjectDocument): number[][] {
  const host = p.objects[d.host_id],
    wall = resolvedData(p, host),
    L = positive(wall.length_mm, "wall length"),
    H = positive(wall.height_mm, "wall height"),
    w = (L - 2 * d.margin_mm - (d.columns - 1) * d.gap_mm) / d.columns,
    h = (H - 2 * d.margin_mm - (d.rows - 1) * d.gap_mm) / d.rows;
  if (w <= 0 || h <= 0) throw new Error("Panel margins/gaps exceed host");
  const cuts = Object.values(p.objects)
    .filter(
      (o) =>
        o.host_refs.includes(d.host_id) &&
        ["door_window.door", "door_window.window"].includes(o.object_type) &&
        o.removed_phase === null,
    )
    .map((o) => {
      const v = resolvedData(p, o),
        x = num(v.offset_along_wall_mm, "opening offset"),
        ww = positive(v.width_mm, "opening width"),
        z = num(v.sill_height_mm ?? 0, "sill"),
        hh = positive(v.height_mm, "opening height");
      return [x - ww / 2, z, x + ww / 2, z + hh];
    });
  let rects: number[][] = [];
  for (let r = 0; r < d.rows; r++)
    for (let c = 0; c < d.columns; c++) {
      const x = d.margin_mm + c * (w + d.gap_mm),
        z = d.margin_mm + r * (h + d.gap_mm);
      rects.push([x, z, x + w, z + h]);
    }
  for (const [cx, cz, cX, cZ] of cuts)
    rects = rects.flatMap(([x, z, X, Z]) => {
      const a = Math.max(x, cx),
        b = Math.max(z, cz),
        A = Math.min(X, cX),
        B = Math.min(Z, cZ);
      if (a >= A || b >= B) return [[x, z, X, Z]];
      return [
        [x, z, a, Z],
        [A, z, X, Z],
        [a, z, A, b],
        [a, B, A, Z],
      ].filter((v) => v[2] - v[0] > 1e-6 && v[3] - v[1] > 1e-6);
    });
  return rects;
}
export function executeDecorativeCommand(
  c: CommandHandlerContext,
): CommandBusResult | undefined {
  if (["CreateMouldingRun", "UpdateMouldingRun"].includes(c.commandName))
    return domainCommand(
      c,
      "decorative.moulding_run",
      "constructflow.decorative",
      decodeMoulding,
      {
        update: c.commandName === "UpdateMouldingRun",
        hostFields: ["host_id"],
      },
    );
  if (["SetPanelLayout", "UpdatePanelLayout"].includes(c.commandName))
    return domainCommand(
      c,
      "decorative.panel_layout",
      "constructflow.decorative",
      decodePanels,
      {
        update: c.commandName === "UpdatePanelLayout",
        hostFields: ["host_id"],
      },
    );
  return undefined;
}
export function decorativeOutputs(p: ProjectDocument): DomainOutput[] {
  return Object.values(p.objects)
    .filter((o) => o.object_type.startsWith("decorative."))
    .flatMap((o) => {
      if (o.object_type === "decorative.moulding_run") {
        const d = decodeMoulding(resolvedData(p, o), p),
          out = output(o, d);
        out.meshes = sweepMoulding(d);
        out.paths = [[...d.path_mm, ...(d.closed ? [d.path_mm[0]] : [])]];
        const len =
          out.paths[0]
            .slice(1)
            .reduce((s, v, i) => s + length3(v, out.paths[0][i]), 0) / 1000;
        out.quantities = [
          {
            classification: "moulding.length",
            description: d.mark,
            quantity: len,
            unit: "m",
            formula: "sum path centerline length / 1000",
            material: d.material,
          },
        ];
        out.schedule = {
          Length_m: len,
          Closed: d.closed ? "yes" : "no",
          Material: d.material,
        };
        return [out];
      }
      if (o.object_type === "decorative.panel_layout") {
        const d = decodePanels(resolvedData(p, o), p),
          out = output(o, d),
          wall = resolvedData(p, p.objects[d.host_id]),
          a = vec3(wall.start_point_mm, "wall start"),
          b = vec3(wall.end_point_mm, "wall end"),
          angle = Math.atan2(b[1] - a[1], b[0] - a[0]),
          rects = panelRects(d, p),
          thick = positive(wall.thickness_mm, "wall thickness") / 2;
        out.meshes = rects.flatMap(([x, z, X, Z]) =>
          box(
            [
              a[0] + x * Math.cos(angle) - thick * Math.sin(angle),
              a[1] + x * Math.sin(angle) + thick * Math.cos(angle),
              a[2] + z,
            ],
            [X - x, d.depth_mm, Z - z],
            angle,
          ),
        );
        const area =
          rects.reduce((s, v) => s + (v[2] - v[0]) * (v[3] - v[1]), 0) / 1e6;
        out.quantities = [
          {
            classification: "panels.area",
            description: d.mark,
            quantity: area,
            unit: "m2",
            formula: "grid rectangles minus hosted opening intersections / 1e6",
            material: d.material,
          },
        ];
        out.schedule = { Pieces: rects.length, Area_m2: area, Host: d.host_id };
        return [out];
      }
      return [];
    });
}
export function validateDecorative(p: ProjectDocument): void {
  decorativeOutputs(p);
}
