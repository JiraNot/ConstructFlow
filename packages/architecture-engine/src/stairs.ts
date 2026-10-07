// ConstructFlow Stair & Railing Engineering Engine
// Automated Thai Building Code (กฎกระทรวงฉบับที่ 55 พ.ศ. 2543 ข้อ 23) Compliance & Parametric Modeling

import type {
  StairModuleData,
  StairCodeCheckResult,
  RailingModuleData,
  Point3Mm,
  Point2Mm,
} from "@constructflow/project-model";

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

    // Flight 2: Along Y (turned 90 deg)
    for (let j = 0; j < n2; j++) {
      const stepY = ly + landingDepth + j * t;
      step_lines.push([
        [lx, stepY],
        [lx + w, stepY],
      ]);
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
    }

    // Flight 2: Parallel return along X
    const returnY = y0 + w + gap;
    for (let j = 0; j < n2; j++) {
      const stepX = x0 + (n2 - 1 - j) * t;
      step_lines.push([
        [stepX, returnY],
        [stepX, returnY + w],
      ]);
    }

    const lx = x0 + Math.max(n1, n2) * t;
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
