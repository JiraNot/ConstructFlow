// ConstructFlow Stair & Railing Engineering Engine
// Automated Thai Building Code (กฎกระทรวงฉบับที่ 55 พ.ศ. 2543 ข้อ 23) Compliance & Parametric Modeling

import type {
  ProjectDocument,
  StairModuleData,
  StairCodeCheckResult,
  RailingModuleData,
  Point3Mm,
  Point2Mm,
} from "@constructflow/project-model";
import { extrude } from "@constructflow/geometry-kernel";
import { resolveStairVerticalExtent } from "@constructflow/project-model";
import { computeRailingGeometry } from "./railings.js";
import {
  output,
  resolvedData,
  type DomainOutput,
  type Vec3,
  type Triangle,
} from "@constructflow/module-sdk";

/**
 * Validates residential stair dimensions against Thai Building Code (กฎกระทรวงฉบับที่ 55 พ.ศ. 2543 ข้อ 23).
 */
export function validateStairThaiBuildingCode(params: {
  width_mm: number;
  riser_height_mm: number;
  tread_depth_mm: number;
  total_rise_mm: number;
  landing_depth_mm?: number;
  handrail_height_mm?: number;
}): StairCodeCheckResult {
  const violations: string[] = [];

  // 1. Clear width: >= 900 mm (0.90 m)
  const width_ok = params.width_mm >= 900;
  if (!width_ok) {
    violations.push(
      `ความกว้างบันไดสุทธิ ${params.width_mm} มม. น้อยกว่าเกณฑ์ขั้นต่ำ 900 มม. (กฎกระทรวงฉบับที่ 55 ข้อ 23)`,
    );
  }

  // 2. Riser height: <= 200 mm (20 cm)
  const riser_ok = params.riser_height_mm <= 200 && params.riser_height_mm > 0;
  if (!riser_ok) {
    violations.push(
      `ลูกตั้งสูง ${params.riser_height_mm.toFixed(1)} มม. เกินเกณฑ์สูงสุด 200 มม. (กฎกระทรวงฉบับที่ 55 ข้อ 23)`,
    );
  }

  // 3. Tread depth: >= 220 mm (22 cm)
  const tread_ok = params.tread_depth_mm >= 220;
  if (!tread_ok) {
    violations.push(
      `ลูกนอนกว้าง ${params.tread_depth_mm.toFixed(1)} มม. น้อยกว่าเกณฑ์ขั้นต่ำ 220 มม. (กฎกระทรวงฉบับที่ 55 ข้อ 23)`,
    );
  }

  // 4. Intermediate Landing: Required if rise >= 3000 mm, with landing depth >= stair width
  let landing_ok = true;
  if (params.total_rise_mm >= 3000) {
    if (!params.landing_depth_mm || params.landing_depth_mm < params.width_mm) {
      landing_ok = false;
      violations.push(
        `บันไดสูงเกิน 3.00 ม. ต้องมีชานพัก และความลึกชานพักต้องไม่น้อยกว่าความกว้างบันได (${params.width_mm} มม.)`,
      );
    }
  }

  // 5. Railing height: >= 900 mm (0.90 m)
  const railing_height = params.handrail_height_mm ?? 900;
  const railing_ok = railing_height >= 900;
  if (!railing_ok) {
    violations.push(
      `ราวกันตกสูง ${railing_height} มม. น้อยกว่าเกณฑ์ความปลอดภัย 900 มม.`,
    );
  }

  return {
    passed: violations.length === 0,
    violations,
    width_ok,
    riser_ok,
    tread_ok,
    landing_ok,
    railing_ok,
  };
}

export interface Stair2DGeometry {
  step_lines_mm: Array<[Point2Mm, Point2Mm]>;
  outline_polygon_mm: Point2Mm[];
  walkline_path_mm: Point2Mm[];
  landing_bounds_mm?: Point2Mm[];
  up_arrow_tip_mm: Point2Mm;
  annotation_text: string;
}

export interface Stair3DMeshData {
  vertices: Point3Mm[];
  indices: number[]; // triangle vertex indices
  concrete_volume_m3: number;
  handrail_length_m: number;
}

export interface StairPlacementOptions {
  stair_type: StairModuleData['stair_type'];
  width_mm: number;
  landing_depth_mm: number;
  turn_direction: 'left' | 'right';
  num_risers: number;
  first_flight_risers?: number;
  flight_gap_mm?: number;
  top_level_id: string;
}

/** The two picked points define the first flight's lower edge and its run. */
export function stairFromRun(project: ProjectDocument, start: Point2Mm, end: Point2Mm, options: StairPlacementOptions): StairModuleData {
  const base = project.levels.find(l => l.id === project.project.active_level_id);
  const top = project.levels.find(l => l.id === options.top_level_id);
  if (!base || !top || top.elevation_mm <= base.elevation_mm) throw new Error('เลือกระดับจบบันไดที่สูงกว่าระดับเริ่ม');
  const run = Math.hypot(end[0] - start[0], end[1] - start[1]);
  if (!Number.isFinite(run) || run < 100) throw new Error('เลือกปลายเที่ยวบันไดให้ห่างจากจุดเริ่มอย่างน้อย 0.10 m');
  const n = options.num_risers;
  const n1 = options.stair_type === 'straight' ? n : options.first_flight_risers ?? Math.floor(n / 2);
  if (!Number.isInteger(n) || !Number.isInteger(n1) || n1 < 2 || (options.stair_type !== 'straight' && n - n1 < 2)) throw new Error('แต่ละเที่ยวต้องมีลูกตั้งอย่างน้อย 2 ขั้น');
  if (![...start, ...end, options.width_mm, options.landing_depth_mm, options.flight_gap_mm ?? 100].every(Number.isFinite) || options.width_mm <= 0 || options.landing_depth_mm <= 0 || (options.flight_gap_mm ?? 100) < 0) throw new Error('ความกว้างและชานพักต้องเป็นค่าบวก ช่องกลางต้องไม่ติดลบ');
  const rise = top.elevation_mm - base.elevation_mm;
  return {
    mark: 'ST1', level_id: base.id, top_level_id: top.id, base_offset_mm: 0, top_offset_mm: 0,
    stair_type: options.stair_type, structure_type: 'rc_monolithic', start_point_mm: [start[0], start[1], base.elevation_mm],
    rotation_deg: Math.atan2(end[1] - start[1], end[0] - start[0]) * 180 / Math.PI,
    total_rise_mm: rise, width_mm: options.width_mm, num_risers: n, riser_height_mm: rise / n,
    tread_depth_mm: run / (n1 - 1), landing_depth_mm: options.landing_depth_mm,
    ...(options.stair_type !== 'straight' ? { first_flight_risers: n1, flight_gap_mm: options.flight_gap_mm ?? 100 } : {}),
    turn_direction: options.turn_direction, has_handrail: true, handrail_height_mm: 900,
  };
}

/**
 * Computes 2D plan linework and 3D mesh geometry for Straight, L-Shape, and U-Shape stairs.
 */
export function computeStairGeometry(stair: StairModuleData): {
  geometry2d: Stair2DGeometry;
  mesh3d: Stair3DMeshData;
  code_check: StairCodeCheckResult;
} {
  const code_check = validateStairThaiBuildingCode({
    width_mm: stair.width_mm,
    riser_height_mm: stair.total_rise_mm / stair.num_risers,
    tread_depth_mm: stair.stair_type === 'straight' ? stair.tread_depth_mm : Math.min(stair.tread_depth_mm, stair.second_tread_depth_mm ?? stair.tread_depth_mm),
    total_rise_mm: stair.total_rise_mm,
    landing_depth_mm: stair.landing_depth_mm,
    handrail_height_mm: stair.handrail_height_mm,
  });

  const [x0, y0, z0] = stair.start_point_mm;
  const w = stair.width_mm, t = stair.tread_depth_mm, n = stair.num_risers;
  // The stated total rise is the datum. Avoid rounding each riser and missing FFL.
  const r = stair.total_rise_mm / n;
  const landingDepth = stair.landing_depth_mm ?? w;
  const step_lines: Array<[Point2Mm, Point2Mm]> = [];
  const vertices: Point3Mm[] = [];
  const indices: number[] = [];
  let concreteVolume = 0;
  const append = (triangles: Triangle[]) => {
    for (const triangle of triangles) {
      const base = vertices.length;
      vertices.push(...triangle.map(p => [...p] as Point3Mm));
      indices.push(base, base + 1, base + 2);
    }
  };
  const flight = (origin: Point3Mm, direction: Point2Mm, risers: number, t = stair.tread_depth_mm) => {
    // A flight with k risers has k-1 treads; its final riser meets the landing.
    // Extrude a stepped side profile across the width, including the sloping
    // soffit and vertical risers, rather than disconnected horizontal sheets.
    const run = (risers - 1) * t;
    const profile: Point2Mm[] = [[0, -150], [run, (risers - 1) * r - 150]];
    for (let i = risers - 1; i >= 1; i--) {
      profile.push([i * t, i * r], [(i - 1) * t, i * r]);
    }
    const [dx, dy] = direction, nx = -dy, ny = dx;
    const localMesh = run > 0 ? extrude(profile, 0, w) : [];
    append(localMesh.map(triangle => {
      const mapped = triangle.map(([u, z, v]) => [origin[0] + dx * u + nx * v,
        origin[1] + dy * u + ny * v, origin[2] + z]) as Triangle;
      // Local profile Z becomes world Y: that axis swap reverses handedness.
      return [mapped[0], mapped[2], mapped[1]] as Triangle;
    }));
    const end = (v: number, z: number): Vec3 => [origin[0] + dx * run + nx * v,
      origin[1] + dy * run + ny * v, origin[2] + z];
    append([[end(0, (risers - 1) * r), end(w, (risers - 1) * r), end(w, risers * r)],
      [end(0, (risers - 1) * r), end(w, risers * r), end(0, risers * r)]]);
    concreteVolume += (run * 150 + (risers - 1) * t * r / 2) * w / 1e9;
    for (let i = 0; i < risers; i++) {
      const x = origin[0] + dx * i * t, y = origin[1] + dy * i * t;
      step_lines.push([[x, y], [x + nx * w, y + ny * w]]);
    }
    return run;
  };
  const slab = (ring: Point2Mm[], z: number) => {
    append(extrude(ring, z - 150, z));
    let area = 0;
    ring.forEach((p, i) => { const q = ring[(i + 1) % ring.length]; area += p[0] * q[1] - q[0] * p[1]; });
    concreteVolume += Math.abs(area) / 2 * 150 / 1e9;
  };
  let outline: Point2Mm[], walkline: Point2Mm[], landing: Point2Mm[] | undefined;
  const railPaths: Point3Mm[][] = [];
  const topZ = z0 + stair.total_rise_mm;
  if (stair.stair_type === "straight") {
    const run = flight([x0, y0, z0], [1, 0], n);
    outline = [[x0, y0], [x0 + run, y0], [x0 + run, y0 + w], [x0, y0 + w]];
    walkline = [[x0, y0 + w / 2], [x0 + run, y0 + w / 2]];
    railPaths.push([[x0, y0, z0], [x0 + run, y0, topZ]], [[x0, y0 + w, z0], [x0 + run, y0 + w, topZ]]);
  } else {
    const n1 = stair.first_flight_risers ?? Math.floor(n / 2), n2 = n - n1;
    const secondTread = stair.second_tread_depth_mm ?? t;
    const run1 = flight([x0, y0, z0], [1, 0], n1);
    const lx = x0 + run1, landingZ = z0 + n1 * r;
    if (stair.stair_type === "u_shape") {
      const returnY = y0 + w + (stair.flight_gap_mm ?? 100);
      const run2 = (n2 - 1) * secondTread;
      landing = [[lx, y0], [lx + landingDepth, y0], [lx + landingDepth, returnY + w], [lx, returnY + w]];
      slab(landing, landingZ);
      // -X travel has a -Y width normal; place its origin at the upper edge.
      flight([lx, returnY + w, landingZ], [-1, 0], n2, secondTread);
      const endX = lx - run2;
      outline = [[x0, y0], [lx + landingDepth, y0], [lx + landingDepth, returnY + w],
        [endX, returnY + w], [endX, returnY], [lx, returnY], [lx, y0 + w], [x0, y0 + w]];
      walkline = [[x0, y0 + w / 2], [lx + landingDepth / 2, y0 + w / 2],
        [lx + landingDepth / 2, returnY + w / 2], [endX, returnY + w / 2]];
      railPaths.push([[x0, y0, z0], [lx, y0, landingZ], [lx + landingDepth, y0, landingZ],
        [lx + landingDepth, returnY + w, landingZ], [lx, returnY + w, landingZ], [endX, returnY + w, topZ]],
        [[x0, y0 + w, z0], [lx, y0 + w, landingZ]],
        [[lx, returnY, landingZ], [endX, returnY, topZ]]);
    } else {
      landing = [[lx, y0], [lx + landingDepth, y0], [lx + landingDepth, y0 + landingDepth], [lx, y0 + landingDepth]];
      slab(landing, landingZ);
      const run2 = flight([lx + w, y0 + landingDepth, landingZ], [0, 1], n2, secondTread);
      const endY = y0 + landingDepth + run2;
      outline = [[x0, y0], [lx + landingDepth, y0], [lx + landingDepth, y0 + landingDepth], [lx + w, y0 + landingDepth], [lx + w, endY],
        [lx, endY], [lx, y0 + w], [x0, y0 + w]];
      walkline = [[x0, y0 + w / 2], [lx + w / 2, y0 + w / 2], [lx + w / 2, endY]];
      railPaths.push([[x0, y0, z0], [lx + landingDepth, y0, landingZ], [lx + landingDepth, y0 + landingDepth, landingZ], [lx + w, endY, topZ]],
        [[x0, y0 + w, z0], [lx, y0 + w, landingZ], [lx, y0 + landingDepth, landingZ], [lx, endY, topZ]]);
    }
  }
  // Left turns mirror the entire stair, including solid geometry and guards.
  if (stair.turn_direction === "left" && stair.stair_type !== "straight") {
    const flip = (p: Point2Mm): Point2Mm => [p[0], 2 * y0 + w - p[1]];
    outline = outline.map(flip); walkline = walkline.map(flip); landing = landing?.map(flip);
    for (let i = 0; i < step_lines.length; i++) step_lines[i] = step_lines[i].map(flip) as [Point2Mm, Point2Mm];
    for (const v of vertices) v[1] = 2 * y0 + w - v[1];
    for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
    for (const path of railPaths) for (const p of path) p[1] = 2 * y0 + w - p[1];
  }
  let handrailLength = 0;
  if (stair.has_handrail) for (const path of railPaths) {
    const railing = computeRailingGeometry({ mark: `${stair.mark}-RAIL`, level_id: stair.level_id,
      path_mm: path, height_mm: stair.handrail_height_mm ?? 900,
      style: "vertical_balusters", baluster_spacing_mm: 100, material: "stainless_steel" });
    const v = railing.mesh3d.vertices, idx = railing.mesh3d.indices;
    const triangles: Triangle[] = [];
    for (let i = 0; i < idx.length; i += 3) triangles.push([v[idx[i]], v[idx[i + 1]], v[idx[i + 2]]]);
    append(triangles);
    handrailLength += railing.mesh3d.handrail_length_m;
  }
  // Rotate the completed solid and guards together; rebuilding tube profiles
  // after rotation would change their tessellation frame and vertex ordering.
  const angle = (stair.rotation_deg ?? 0) * Math.PI / 180;
  if (angle) {
    const rotate = (p: Point2Mm): Point2Mm => [x0 + (p[0] - x0) * Math.cos(angle) - (p[1] - y0) * Math.sin(angle),
      y0 + (p[0] - x0) * Math.sin(angle) + (p[1] - y0) * Math.cos(angle)];
    outline = outline.map(rotate); walkline = walkline.map(rotate); landing = landing?.map(rotate);
    for (let i = 0; i < step_lines.length; i++) step_lines[i] = step_lines[i].map(rotate) as [Point2Mm, Point2Mm];
    for (const v of vertices) [v[0], v[1]] = rotate([v[0], v[1]]);
  }
  return {
    geometry2d: { step_lines_mm: step_lines, outline_polygon_mm: outline, walkline_path_mm: walkline,
      landing_bounds_mm: landing, up_arrow_tip_mm: walkline[walkline.length - 1],
      annotation_text: `ขึ้น UP (${n} Risers @ ${r.toFixed(1)} mm)` },
    mesh3d: { vertices, indices, concrete_volume_m3: concreteVolume, handrail_length_m: handrailLength },
    code_check,
  };
}

/** Floor-plan graphics use the view cut plane, while the physical stair stays whole. */
export function getStairPlanDrawing(stair: StairModuleData, viewElevationMm: number, cutHeightMm = 1200): {
  solid_paths_mm: Point2Mm[][];
  overhead_paths_mm: Point2Mm[][];
  direction: 'up' | 'down';
} {
  const g = computeStairGeometry({ ...stair, has_handrail: false }).geometry2d;
  const lower = viewElevationMm < stair.start_point_mm[2] + stair.total_rise_mm - 1;
  const split = stair.stair_type === 'straight' ? stair.num_risers : stair.first_flight_risers ?? Math.floor(stair.num_risers / 2);
  const r = stair.total_rise_mm / stair.num_risers;
  const solid: Point2Mm[][] = [[...g.outline_polygon_mm, g.outline_polygon_mm[0]]];
  const overhead: Point2Mm[][] = [];
  g.step_lines_mm.forEach((line, i) => {
    const visible = lower ? i < split && i * r <= cutHeightMm : i >= split;
    (visible ? solid : overhead).push(line);
  });
  const walk = lower ? g.walkline_path_mm : [...g.walkline_path_mm].reverse();
  const a = walk[0], b = walk[1];
  const fraction = lower ? Math.min(1, Math.floor(cutHeightMm / r) * stair.tread_depth_mm / Math.hypot(b[0] - a[0], b[1] - a[1])) : 1;
  const tip: Point2Mm = [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
  solid.push([a, tip]);
  overhead.push([tip, ...walk.slice(1)]);
  const angle = Math.atan2(tip[1] - a[1], tip[0] - a[0]);
  solid.push([[tip[0] - Math.cos(angle - .45) * 180, tip[1] - Math.sin(angle - .45) * 180], tip,
    [tip[0] - Math.cos(angle + .45) * 180, tip[1] - Math.sin(angle + .45) * 180]]);
  if (lower && fraction < 1) {
    const normal: Point2Mm = [-Math.sin(angle), Math.cos(angle)];
    solid.push([[tip[0] - normal[0] * stair.width_mm / 2 - Math.cos(angle) * 80, tip[1] - normal[1] * stair.width_mm / 2 - Math.sin(angle) * 80],
      [tip[0] + normal[0] * stair.width_mm / 2 + Math.cos(angle) * 80, tip[1] + normal[1] * stair.width_mm / 2 + Math.sin(angle) * 80]]);
  }
  return { solid_paths_mm: solid, overhead_paths_mm: overhead, direction: lower ? 'up' : 'down' };
}

export function decodeStair(
  d: Record<string, unknown>,
  _p: ProjectDocument,
): StairModuleData {
  const mark = String(d.mark ?? "ST1");
  const stair_type = (d.stair_type as any) || "straight";
  const structure_type = (d.structure_type as any) || "rc_monolithic";
  const start_point_mm = (Array.isArray(d.start_point_mm) && d.start_point_mm.length === 3
    ? d.start_point_mm.map(Number)
    : [0, 0, 0]) as Point3Mm;
  const vertical = resolveStairVerticalExtent(_p, d);
  if (vertical) start_point_mm[2] = vertical.base_elevation_mm;
  const total_rise_mm = vertical?.height_mm ?? Number(d.total_rise_mm ?? 3000);
  const width_mm = Number(d.width_mm ?? 1000);
  const requestedRiser = Number(d.riser_height_mm ?? 176.5);
  const tread_depth_mm = Number(d.tread_depth_mm ?? 250);
  const num_risers = Number(d.num_risers ?? Math.round(total_rise_mm / requestedRiser));
  const riser_height_mm = total_rise_mm / num_risers;
  const landing_depth_mm = d.landing_depth_mm !== undefined ? Number(d.landing_depth_mm) : undefined;
  const turn_direction = d.turn_direction as any;
  const has_handrail = d.has_handrail !== false;
  const handrail_height_mm = Number(d.handrail_height_mm ?? 900);

  const code_check = validateStairThaiBuildingCode({
    width_mm,
    riser_height_mm,
    tread_depth_mm,
    total_rise_mm,
    landing_depth_mm,
    handrail_height_mm,
  });

  return {
    mark,
    level_id: String(d.level_id ?? _p.project.active_level_id ?? "GF"),
    stair_type,
    structure_type,
    start_point_mm,
    rotation_deg: Number(d.rotation_deg ?? 0),
    base_offset_mm: vertical?.base_offset_mm,
    top_level_id: typeof d.top_level_id === 'string' ? d.top_level_id : undefined,
    top_offset_mm: Number(d.top_offset_mm ?? 0),
    total_rise_mm,
    width_mm,
    num_risers,
    riser_height_mm,
    ...(d.first_flight_risers !== undefined ? { first_flight_risers: Number(d.first_flight_risers) } : {}),
    ...(d.second_tread_depth_mm !== undefined ? { second_tread_depth_mm: Number(d.second_tread_depth_mm) } : {}),
    ...(d.flight_gap_mm !== undefined ? { flight_gap_mm: Number(d.flight_gap_mm) } : {}),
    tread_depth_mm,
    landing_depth_mm,
    turn_direction,
    has_handrail,
    handrail_height_mm,
    code_check,
  };
}

export function stairOutputs(p: ProjectDocument): DomainOutput[] {
  return Object.values(p.objects)
    .filter((o) => o.object_type === "architecture.stair")
    .map((o) => {
      const d = decodeStair(resolvedData(p, o), p);
      const out = output(o, d);
      const geom = computeStairGeometry(d);

      const triangles: Triangle[] = [];
      const v = geom.mesh3d.vertices;
      for (let i = 0; i < geom.mesh3d.indices.length; i += 3) {
        const i0 = geom.mesh3d.indices[i];
        const i1 = geom.mesh3d.indices[i + 1];
        const i2 = geom.mesh3d.indices[i + 2];
        if (v[i0] && v[i1] && v[i2]) {
          triangles.push([v[i0] as Vec3, v[i1] as Vec3, v[i2] as Vec3]);
        }
      }
      out.meshes = triangles;

      const z0 = d.start_point_mm[2];
      const outline = geom.geometry2d.outline_polygon_mm;
      const walk = geom.geometry2d.walkline_path_mm;
      const tip = walk[walk.length - 1], before = walk[walk.length - 2];
      const angle = Math.atan2(tip[1] - before[1], tip[0] - before[0]);
      const arrow = [angle - 0.45, angle + 0.45].map(a => [tip[0] - Math.cos(a) * 180, tip[1] - Math.sin(a) * 180, z0] as Vec3);
      out.paths = [
        [...outline, outline[0]].map(pt => [pt[0], pt[1], z0] as Vec3),
        ...geom.geometry2d.step_lines_mm.map(([p1, p2]) => [
          [p1[0], p1[1], z0] as Vec3,
          [p2[0], p2[1], z0] as Vec3,
        ]),
        geom.geometry2d.walkline_path_mm.map((pt) => [pt[0], pt[1], z0] as Vec3),
        [arrow[0], [tip[0], tip[1], z0] as Vec3, arrow[1]],
      ];

      const approxVol_m3 = geom.mesh3d.concrete_volume_m3;
      out.quantities = [
        {
          classification: "stair.concrete",
          description: `${d.mark} Stair Concrete`,
          quantity: Math.round(approxVol_m3 * 100) / 100,
          unit: "m3",
          formula: "waist_slab + step_triangles",
          material: "concrete",
        },
        {
          classification: "stair.steps",
          description: `${d.mark} Step Risers`,
          quantity: d.num_risers,
          unit: "pcs",
          formula: "count",
        },
      ];
      if (d.has_handrail) {
        out.quantities.push({
          classification: "stair.handrail",
          description: `${d.mark} Handrail`,
          quantity: Math.round(geom.mesh3d.handrail_length_m * 10) / 10,
          unit: "m",
          formula: "sum(actual_guard_path_lengths) / 1000",
          material: "stainless_steel",
        });
      }

      if (d.stair_type === "l_shape" || d.stair_type === "u_shape") {
        const landingDepth_m = (d.landing_depth_mm ?? d.width_mm) / 1000;
        const landingWidth_m = (d.stair_type === "l_shape" ? d.landing_depth_mm ?? d.width_mm : d.width_mm * 2 + (d.flight_gap_mm ?? 100)) / 1000;
        const landingArea_m2 = Math.round(landingDepth_m * landingWidth_m * 100) / 100;
        out.quantities.push({
          classification: "stair.landing",
          description: `${d.mark} Intermediate Landing Slab`,
          quantity: landingArea_m2,
          unit: "m2",
          formula: "landing_width * landing_depth",
          material: "concrete",
        });
      }

      out.schedule = {
        Type: d.stair_type,
        Width_m: d.width_mm / 1000,
        Total_rise_m: d.total_rise_mm / 1000,
        Risers: d.num_risers,
        Riser_mm: d.total_rise_mm / d.num_risers,
        Tread_mm: d.tread_depth_mm,
        Code_Passed: geom.code_check.passed ? "PASS" : "VIOLATION",
      };

      if (!geom.code_check.passed) {
        out.warnings = geom.code_check.violations;
      }

      return out;
    });
}

export function validateStairs(p: ProjectDocument): void {
  for (const o of Object.values(p.objects)) {
    if (o.object_type === "architecture.stair") {
      decodeStair(resolvedData(p, o), p);
    }
  }
}

