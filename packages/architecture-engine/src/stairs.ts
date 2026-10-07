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
    riser_height_mm: stair.riser_height_mm,
    tread_depth_mm: stair.tread_depth_mm,
    total_rise_mm: stair.total_rise_mm,
    landing_depth_mm: stair.landing_depth_mm,
    handrail_height_mm: stair.handrail_height_mm,
  });

  const [x0, y0, z0] = stair.start_point_mm;
  const w = stair.width_mm;
  const t = stair.tread_depth_mm;
  const r = stair.riser_height_mm;
  const n = stair.num_risers;

  const step_lines: Array<[Point2Mm, Point2Mm]> = [];
  const walkline: Point2Mm[] = [];
  const vertices: Point3Mm[] = [];
  const indices: number[] = [];

  if (stair.stair_type === "straight") {
    // Straight Flight
    for (let i = 0; i < n; i++) {
      const stepX = x0 + i * t;
      step_lines.push([
        [stepX, y0],
        [stepX, y0 + w],
      ]);

      // 3D step geometry (tread box)
      const currentZ = z0 + i * r;
      const vBase = vertices.length;
      vertices.push(
        [stepX, y0, currentZ],
        [stepX + t, y0, currentZ],
        [stepX + t, y0 + w, currentZ],
        [stepX, y0 + w, currentZ],
      );
      indices.push(vBase, vBase + 1, vBase + 2, vBase, vBase + 2, vBase + 3);
    }

    const totalLength = n * t;
    const outline: Point2Mm[] = [
      [x0, y0],
      [x0 + totalLength, y0],
      [x0 + totalLength, y0 + w],
      [x0, y0 + w],
    ];

    walkline.push([x0 + t / 2, y0 + w / 2], [x0 + totalLength - t / 2, y0 + w / 2]);

    return {
      geometry2d: {
        step_lines_mm: step_lines,
        outline_polygon_mm: outline,
        walkline_path_mm: walkline,
        up_arrow_tip_mm: [x0 + totalLength - t / 2, y0 + w / 2],
        annotation_text: `ขึ้น UP (${n} Risers @ ${r.toFixed(1)} mm)`,
      },
      mesh3d: { vertices, indices },
      code_check,
    };
  } else if (stair.stair_type === "l_shape") {
    // L-Shape with 90-degree landing
    const n1 = Math.floor(n / 2);
    const n2 = n - n1;
    const landingDepth = stair.landing_depth_mm ?? w;

    // Flight 1: Along X
    for (let i = 0; i < n1; i++) {
      const stepX = x0 + i * t;
      step_lines.push([
        [stepX, y0],
        [stepX, y0 + w],
      ]);
      const currentZ = z0 + i * r;
      const vBase = vertices.length;
      vertices.push(
        [stepX, y0, currentZ],
        [stepX + t, y0, currentZ],
        [stepX + t, y0 + w, currentZ],
        [stepX, y0 + w, currentZ],
      );
      indices.push(vBase, vBase + 1, vBase + 2, vBase, vBase + 2, vBase + 3);
    }

    // Landing
    const lx = x0 + n1 * t;
    const ly = y0;
    const landingBounds: Point2Mm[] = [
      [lx, ly],
      [lx + landingDepth, ly],
      [lx + landingDepth, ly + landingDepth],
      [lx, ly + landingDepth],
    ];

    const landingZ = z0 + n1 * r;
    const lBase = vertices.length;
    vertices.push(
      [lx, ly, landingZ],
      [lx + landingDepth, ly, landingZ],
      [lx + landingDepth, ly + landingDepth, landingZ],
      [lx, ly + landingDepth, landingZ],
    );
    indices.push(lBase, lBase + 1, lBase + 2, lBase, lBase + 2, lBase + 3);

    // Flight 2: Along Y (turned 90 deg)
    for (let j = 0; j < n2; j++) {
      const stepY = ly + landingDepth + j * t;
      step_lines.push([
        [lx, stepY],
        [lx + w, stepY],
      ]);
      const currentZ = landingZ + (j + 1) * r;
      const vBase = vertices.length;
      vertices.push(
        [lx, stepY, currentZ],
        [lx + w, stepY, currentZ],
        [lx + w, stepY + t, currentZ],
        [lx, stepY + t, currentZ],
      );
      indices.push(vBase, vBase + 1, vBase + 2, vBase, vBase + 2, vBase + 3);
    }

    walkline.push(
      [x0 + t / 2, y0 + w / 2],
      [lx + landingDepth / 2, y0 + w / 2],
      [lx + w / 2, ly + landingDepth + n2 * t - t / 2],
    );

    const outline: Point2Mm[] = [
      [x0, y0],
      [lx + landingDepth, y0],
      [lx + landingDepth, ly + landingDepth + n2 * t],
      [lx, ly + landingDepth + n2 * t],
      [lx, ly + w],
      [x0, ly + w],
    ];

    return {
      geometry2d: {
        step_lines_mm: step_lines,
        outline_polygon_mm: outline,
        walkline_path_mm: walkline,
        landing_bounds_mm: landingBounds,
        up_arrow_tip_mm: [lx + w / 2, ly + landingDepth + n2 * t - t / 2],
        annotation_text: `L-Shape UP (${n} Risers)`,
      },
      mesh3d: { vertices, indices },
      code_check,
    };
  } else {
    // U-Shape (Dog-leg 180-degree turn)
    const n1 = Math.floor(n / 2);
    const n2 = n - n1;
    const landingDepth = stair.landing_depth_mm ?? w;
    const gap = 100; // Well hole gap

    // Flight 1: Along X
    for (let i = 0; i < n1; i++) {
      const stepX = x0 + i * t;
      step_lines.push([
        [stepX, y0],
        [stepX, y0 + w],
      ]);
      const currentZ = z0 + i * r;
      const vBase = vertices.length;
      vertices.push(
        [stepX, y0, currentZ],
        [stepX + t, y0, currentZ],
        [stepX + t, y0 + w, currentZ],
        [stepX, y0 + w, currentZ],
      );
      indices.push(vBase, vBase + 1, vBase + 2, vBase, vBase + 2, vBase + 3);
    }

    const lx = x0 + Math.max(n1, n2) * t;
    const returnY = y0 + w + gap;

    // Landing Box
    const landingZ = z0 + n1 * r;
    const lBase = vertices.length;
    vertices.push(
      [lx, y0, landingZ],
      [lx + landingDepth, y0, landingZ],
      [lx + landingDepth, returnY + w, landingZ],
      [lx, returnY + w, landingZ],
    );
    indices.push(lBase, lBase + 1, lBase + 2, lBase, lBase + 2, lBase + 3);

    // Flight 2: Parallel return along X
    for (let j = 0; j < n2; j++) {
      const stepX = x0 + (n2 - 1 - j) * t;
      step_lines.push([
        [stepX, returnY],
        [stepX, returnY + w],
      ]);
      const currentZ = landingZ + (j + 1) * r;
      const vBase = vertices.length;
      vertices.push(
        [stepX, returnY, currentZ],
        [stepX + t, returnY, currentZ],
        [stepX + t, returnY + w, currentZ],
        [stepX, returnY + w, currentZ],
      );
      indices.push(vBase, vBase + 1, vBase + 2, vBase, vBase + 2, vBase + 3);
    }

    const landingBounds: Point2Mm[] = [
      [lx, y0],
      [lx + landingDepth, y0],
      [lx + landingDepth, returnY + w],
      [lx, returnY + w],
    ];

    walkline.push(
      [x0 + t / 2, y0 + w / 2],
      [lx + landingDepth / 2, y0 + w / 2],
      [lx + landingDepth / 2, returnY + w / 2],
      [x0 + t / 2, returnY + w / 2],
    );

    const outline: Point2Mm[] = [
      [x0, y0],
      [lx + landingDepth, y0],
      [lx + landingDepth, returnY + w],
      [x0, returnY + w],
      [x0, returnY],
      [lx, returnY],
      [lx, y0 + w],
      [x0, y0 + w],
    ];

    return {
      geometry2d: {
        step_lines_mm: step_lines,
        outline_polygon_mm: outline,
        walkline_path_mm: walkline,
        landing_bounds_mm: landingBounds,
        up_arrow_tip_mm: [x0 + t / 2, returnY + w / 2],
        annotation_text: `U-Shape Dogleg UP (${n} Risers)`,
      },
      mesh3d: { vertices, indices },
      code_check,
    };
  }
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
  const total_rise_mm = Number(d.total_rise_mm ?? 3000);
  const width_mm = Number(d.width_mm ?? 1000);
  const riser_height_mm = Number(d.riser_height_mm ?? 176.5);
  const tread_depth_mm = Number(d.tread_depth_mm ?? 250);
  const num_risers = Number(d.num_risers ?? Math.round(total_rise_mm / riser_height_mm));
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
    total_rise_mm,
    width_mm,
    num_risers,
    riser_height_mm,
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
      out.paths = [
        ...geom.geometry2d.step_lines_mm.map(([p1, p2]) => [
          [p1[0], p1[1], z0] as Vec3,
          [p2[0], p2[1], z0] as Vec3,
        ]),
        geom.geometry2d.walkline_path_mm.map((pt) => [pt[0], pt[1], z0] as Vec3),
      ];

      const approxVol_m3 = (d.num_risers * (d.tread_depth_mm * d.riser_height_mm / 2) * d.width_mm + (d.num_risers * d.tread_depth_mm * 100 * d.width_mm)) / 1e9;
      out.quantities = [
        {
          classification: "stair.concrete",
          description: `${d.mark} Stair Concrete`,
          quantity: Math.max(0.5, Math.round(approxVol_m3 * 100) / 100),
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
          quantity: Math.round(Math.hypot(d.num_risers * d.tread_depth_mm, d.total_rise_mm) / 1000 * 10) / 10,
          unit: "m",
          formula: "hypot(run, rise) / 1000",
          material: "stainless_steel",
        });
      }

      if (d.stair_type === "l_shape" || d.stair_type === "u_shape") {
        const landingDepth_m = (d.landing_depth_mm ?? d.width_mm) / 1000;
        const landingWidth_m = (d.stair_type === "l_shape" ? d.width_mm : d.width_mm * 2 + 100) / 1000;
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
        Riser_mm: d.riser_height_mm,
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

