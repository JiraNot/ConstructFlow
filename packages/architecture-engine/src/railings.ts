// ConstructFlow Parametric Railing Engine (F05)
// Implements code-compliant handrails and guardrails (กฎกระทรวงฉบับที่ 55)
// Supports vertical balusters, glass panels, horizontal rails, and wrought iron profiles.

import type {
  ProjectDocument,
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

export interface RailingCodeCheckResult {
  passed: boolean;
  violations: string[];
  height_ok: boolean; // height >= 900 mm (0.90 m)
  spacing_ok: boolean; // baluster spacing <= 100 mm (child safety)
}

export function validateRailingCode(railing: RailingModuleData): RailingCodeCheckResult {
  const violations: string[] = [];

  const height_ok = railing.height_mm >= 900;
  if (!height_ok) {
    violations.push(
      `ราวกันตกสูง ${railing.height_mm} มม. น้อยกว่าเกณฑ์ความปลอดภัยขั้นต่ำ 900 มม. (กฎกระทรวงฉบับที่ 55)`,
    );
  }

  const spacing_ok = railing.style !== "vertical_balusters" || railing.baluster_spacing_mm <= 100;
  if (!spacing_ok) {
    violations.push(
      `ระยะห่างลูกกรง ${railing.baluster_spacing_mm} มม. เกินเกณฑ์ความปลอดภัยเด็ก 100 มม.`,
    );
  }

  return {
    passed: violations.length === 0,
    violations,
    height_ok,
    spacing_ok,
  };
}

export interface Railing2DGeometry {
  centerline_path_mm: Point2Mm[];
  post_locations_mm: Point2Mm[];
  annotation_text: string;
}

export interface Railing3DMeshData {
  vertices: Point3Mm[];
  indices: number[];
  handrail_length_m: number;
  post_count: number;
  baluster_count: number;
}

/**
 * Computes 2D plan and 3D mesh geometry for a parametric railing run.
 */
export function computeRailingGeometry(railing: RailingModuleData): {
  geometry2d: Railing2DGeometry;
  mesh3d: Railing3DMeshData;
  code_check: RailingCodeCheckResult;
} {
  const code_check = validateRailingCode(railing);
  const path = railing.path_mm;

  if (!path || path.length < 2) {
    return {
      geometry2d: { centerline_path_mm: [], post_locations_mm: [], annotation_text: "Empty Railing" },
      mesh3d: { vertices: [], indices: [], handrail_length_m: 0, post_count: 0, baluster_count: 0 },
      code_check,
    };
  }

  const vertices: Point3Mm[] = [];
  const indices: number[] = [];
  const postLocations2d: Point2Mm[] = [];
  let totalLengthMm = 0;
  let totalBalusters = 0;
  let postCount = 0;

  const h = railing.height_mm;
  const postSize = 40; // 40x40 mm post
  const railProfile = 50; // 50mm handrail width

  // 1. Generate Posts at every vertex
  for (let i = 0; i < path.length; i++) {
    const pt = path[i];
    postLocations2d.push([pt[0], pt[1]]);
    postCount++;

    // 3D Post box
    const px = pt[0] - postSize / 2;
    const py = pt[1] - postSize / 2;
    const pz = pt[2];

    const vBase = vertices.length;
    // 4 bottom vertices, 4 top vertices
    vertices.push(
      [px, py, pz],
      [px + postSize, py, pz],
      [px + postSize, py + postSize, pz],
      [px, py + postSize, pz],
      [px, py, pz + h],
      [px + postSize, py, pz + h],
      [px + postSize, py + postSize, pz + h],
      [px, py + postSize, pz + h],
    );

    // Front, Back, Left, Right faces
    indices.push(
      vBase, vBase + 1, vBase + 5, vBase, vBase + 5, vBase + 4, // front
      vBase + 1, vBase + 2, vBase + 6, vBase + 1, vBase + 6, vBase + 5, // right
      vBase + 2, vBase + 3, vBase + 7, vBase + 2, vBase + 7, vBase + 6, // back
      vBase + 3, vBase, vBase + 4, vBase + 3, vBase + 4, vBase + 7, // left
      vBase + 4, vBase + 5, vBase + 6, vBase + 4, vBase + 6, vBase + 7, // top
    );
  }

  // 2. Generate Handrail runs and intermediate balusters between consecutive vertices
  for (let i = 0; i < path.length - 1; i++) {
    const p1 = path[i];
    const p2 = path[i + 1];

    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const dz = p2[2] - p1[2];
    const segLen = Math.hypot(dx, dy);
    totalLengthMm += Math.hypot(segLen, dz);

    if (segLen < 1) continue;

    // Normal vector perpendicular to segment in XY plane
    const nx = (-dy / segLen) * (railProfile / 2);
    const ny = (dx / segLen) * (railProfile / 2);

    // Top Handrail strip
    const vBase = vertices.length;
    const z1Top = p1[2] + h;
    const z2Top = p2[2] + h;

    vertices.push(
      [p1[0] - nx, p1[1] - ny, z1Top],
      [p1[0] + nx, p1[1] + ny, z1Top],
      [p2[0] + nx, p2[1] + ny, z2Top],
      [p2[0] - nx, p2[1] - ny, z2Top],
    );
    indices.push(vBase, vBase + 1, vBase + 2, vBase, vBase + 2, vBase + 3);

    // Intermediate Balusters (if vertical_balusters)
    if (railing.style === "vertical_balusters") {
      const spacing = Math.max(50, railing.baluster_spacing_mm || 100);
      const numBalusters = Math.max(0, Math.floor(segLen / spacing) - 1);
      totalBalusters += numBalusters;

      const balusterSize = 15; // 15x15mm baluster rod
      for (let b = 1; b <= numBalusters; b++) {
        const tRatio = b / (numBalusters + 1);
        const bx = p1[0] + dx * tRatio;
        const by = p1[1] + dy * tRatio;
        const bz = p1[2] + dz * tRatio;
        const bzTop = bz + h - 20;

        const bBase = vertices.length;
        vertices.push(
          [bx - balusterSize / 2, by - balusterSize / 2, bz],
          [bx + balusterSize / 2, by - balusterSize / 2, bz],
          [bx + balusterSize / 2, by + balusterSize / 2, bzTop],
          [bx - balusterSize / 2, by + balusterSize / 2, bzTop],
        );
        indices.push(bBase, bBase + 1, bBase + 2, bBase, bBase + 2, bBase + 3);
      }
    } else if (railing.style === "glass_panel") {
      // Single continuous glass pane
      const gBase = vertices.length;
      const bottomZ = p1[2] + 50;
      const topZ = p1[2] + h - 50;
      vertices.push(
        [p1[0], p1[1], bottomZ],
        [p2[0], p2[1], p2[2] + 50],
        [p2[0], p2[1], p2[2] + h - 50],
        [p1[0], p1[1], topZ],
      );
      indices.push(gBase, gBase + 1, gBase + 2, gBase, gBase + 2, gBase + 3);
    }
  }

  const handrail_length_m = Math.round((totalLengthMm / 1000) * 100) / 100;

  return {
    geometry2d: {
      centerline_path_mm: path.map((pt) => [pt[0], pt[1]]),
      post_locations_mm: postLocations2d,
      annotation_text: `Railing H=${h}mm (L=${handrail_length_m}m)`,
    },
    mesh3d: {
      vertices,
      indices,
      handrail_length_m,
      post_count: postCount,
      baluster_count: totalBalusters,
    },
    code_check,
  };
}

export function decodeRailing(
  d: Record<string, unknown>,
  _p: ProjectDocument,
): RailingModuleData {
  const mark = String(d.mark ?? "R1");
  const path_mm = (Array.isArray(d.path_mm) && d.path_mm.length >= 2
    ? d.path_mm.map((pt: any) => [Number(pt[0]), Number(pt[1]), Number(pt[2] ?? 0)] as Point3Mm)
    : [
        [0, 0, 0],
        [3000, 0, 0],
      ]) as Point3Mm[];
  const height_mm = Number(d.height_mm ?? 900);
  const style = (d.style as any) || "vertical_balusters";
  const baluster_spacing_mm = Number(d.baluster_spacing_mm ?? 100);
  const material = String(d.material ?? "stainless_steel");

  return {
    mark,
    level_id: String(d.level_id ?? _p.project.active_level_id ?? "GF"),
    path_mm,
    height_mm,
    style,
    baluster_spacing_mm,
    material,
  };
}

export function railingOutputs(p: ProjectDocument): DomainOutput[] {
  return Object.values(p.objects)
    .filter((o) => o.object_type === "architecture.railing")
    .map((o) => {
      const d = decodeRailing(resolvedData(p, o), p);
      const out = output(o, d);
      const geom = computeRailingGeometry(d);

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

      out.paths = [
        geom.geometry2d.centerline_path_mm.map((pt) => [pt[0], pt[1], 0] as Vec3),
      ];

      out.quantities = [
        {
          classification: "railing.handrail",
          description: `${d.mark} Handrail (${d.style})`,
          quantity: geom.mesh3d.handrail_length_m,
          unit: "m",
          formula: "path_length_3d",
          material: d.material,
        },
        {
          classification: "railing.posts",
          description: `${d.mark} Guardrail Posts`,
          quantity: geom.mesh3d.post_count,
          unit: "pcs",
          formula: "vertex_posts_count",
          material: d.material,
        },
      ];

      if (geom.mesh3d.baluster_count > 0) {
        out.quantities.push({
          classification: "railing.balusters",
          description: `${d.mark} Vertical Baluster Rods`,
          quantity: geom.mesh3d.baluster_count,
          unit: "pcs",
          formula: "balusters_count",
          material: d.material,
        });
      }

      out.schedule = {
        Mark: d.mark,
        Height_mm: d.height_mm,
        Length_m: geom.mesh3d.handrail_length_m,
        Style: d.style,
        Posts: geom.mesh3d.post_count,
        Balusters: geom.mesh3d.baluster_count,
        Code_Passed: geom.code_check.passed ? "PASS" : "VIOLATION",
      };

      if (!geom.code_check.passed) {
        out.warnings = geom.code_check.violations;
      }

      return out;
    });
}
