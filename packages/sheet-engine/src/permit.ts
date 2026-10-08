import {
  getDisplayPhase,
  validateDrawingSettings,
  resolveCatalogType,
  type ProjectDocument,
  type SmartObject,
} from "@constructflow/project-model";
import { constructionOutputs } from "@constructflow/domain-providers";
import { buildProjectRepresentations3D } from "@constructflow/representation-engine";
import {
  box,
  type Vec2,
  type Vec3,
  type Triangle,
} from "@constructflow/geometry-kernel";
import { calculateBBS } from "@constructflow/structure-engine";
import { resolvedData } from "@constructflow/module-sdk";
import {
  recommendEITBreakerAndWire,
  balanceCircuitsPhase,
} from "@constructflow/electrical-engine";

export const PERMIT_INDEX = [
  ["A-01", "ผังบริเวณ / Site & project information", 200],
  ["A-02", "แปลนชั้นล่าง / Phased ground plan", 100],
  ["A-03", "แปลนชั้นบน / Upper level plan", 100],
  ["A-04", "แปลนหลังคา / Roof & drainage", 100],
  ["A-05", "รูปด้านเหนือและตะวันออก / North & east", 100],
  ["A-06", "รูปด้านใต้และตะวันตก / South & west", 100],
  ["A-07", "รูปตัด A และ B / Building sections", 100],
  ["A-08", "รายการประตูหน้าต่าง / Opening schedule", 50],
  ["A-09", "แบบขยายห้องน้ำ / Bathroom details", 25],
  ["A-10", "วัสดุและฝ้าเพดาน / Finishes & joinery", 50],
  ["S-01", "ผังฐานราก / Foundations & columns", 100],
  ["S-02", "ผังคานพื้นชั้นล่าง / Ground framing", 100],
  ["S-03", "ผังคานพื้นชั้นบน / Upper framing", 100],
  ["S-04", "โครงหลังคา / Roof framing", 100],
  ["S-05", "รายการเสาและฐานราก / Structural schedule", 25],
  ["S-06", "รายการคานและเหล็ก / Beam & BBS", 25],
  ["M-01", "น้ำดีและปั๊ม / Supply & pump bypass", 100],
  ["M-02", "สุขาภิบาล / Drainage & invert levels", 100],
  ["E-01", "แสงสว่าง / Lighting & switching", 100],
  ["E-02", "กำลังไฟฟ้า / Power & panel schedule", 100],
] as const;
export type PermitSheetId = (typeof PERMIT_INDEX)[number][0];
export type VectorPrimitive =
  | {
      kind: "path";
      points: Vec2[];
      color: string;
      width: number;
      dash?: number[];
      closed?: boolean;
      fill?: string;
    }
  | {
      kind: "text";
      at: Vec2;
      text: string;
      size: number;
      color: string;
      max_width?: number;
    };
export interface SheetViewport {
  scale_denominator: number;
  center_mm?: Vec2;
  crop_bounds_mm?: [number, number, number, number];
  section_cut_mm?: number;
}
export interface PermitOptions {
  viewports?: Partial<Record<PermitSheetId, SheetViewport>>;
  revision?: string;
  author?: string;
}
export interface PermitSheet {
  id: PermitSheetId;
  title: string;
  scale: string;
  svg: string;
  primitives: VectorPrimitive[];
  source_object_ids: string[];
  warnings: string[];
  status: "draft" | "missing_data" | "issued";
  viewport: SheetViewport;
}
export interface PermitDrawingSet {
  project_id: string;
  sheets: PermitSheet[];
  warnings: string[];
  issue_ready: boolean;
}
const esc = (s: unknown) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const colors = {
  existing: "#94a3b8",
  demolition: "#ef4444",
  new_construction: "#0f172a",
};
const data = (o: SmartObject) =>
  ((o.module_data ?? (o as unknown as { properties?: unknown }).properties ?? {}) as Record<string, unknown>);
const format = (v: unknown) =>
  typeof v === "number"
    ? Number.isInteger(v)
      ? String(v)
      : v.toFixed(3)
    : String(v ?? "");

export function primitivesToSvg(primitives: VectorPrimitive[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420mm" height="297mm" viewBox="0 0 420 297"><rect width="420" height="297" fill="white"/>${primitives.map((p) => (p.kind === "path" ? `<path d="${p.points.map((v, i) => `${i ? "L" : "M"}${v[0]} ${v[1]}`).join(" ")}${p.closed ? " Z" : ""}" fill="${p.fill ?? "none"}" stroke="${p.color}" stroke-width="${p.width}"${p.dash ? ` stroke-dasharray="${p.dash.join(",")}"` : ""}/>` : `<text x="${p.at[0]}" y="${p.at[1]}" font-family="Sarabun,sans-serif" font-size="${p.size}" fill="${p.color}"${p.max_width ? ` textLength="${Math.min(p.max_width, p.text.length * p.size * 0.52)}" lengthAdjust="spacingAndGlyphs"` : ""}>${esc(p.text)}</text>`)).join("")}</svg>`;
}

/** Fixed-scale vector compiler. Missing inputs and clipping remain visible on every affected page. */
export function compilePermitDrawingSet(
  project: ProjectDocument,
  options: PermitOptions = {},
): PermitDrawingSet {
  options = {
    ...project.drawing_settings,
    ...options,
    viewports: { ...project.drawing_settings?.viewports, ...options.viewports },
  };
  validateDrawingSettings({
    viewports: options.viewports,
    revision: options.revision,
    author: options.author,
  });
  const outputs = constructionOutputs(project),
    representations = buildProjectRepresentations3D(project).objects;
  const levels = [...project.levels].sort(
    (a, b) => a.elevation_mm - b.elevation_mm,
  );
  const all = Object.values(project.objects),
    ground = levels[0]?.id,
    upper = levels[1]?.id;
  const belongs = (o: SmartObject, id: string | undefined) =>
    !!id &&
    (data(o).level_id === id ||
      data(o).base_level_id === id ||
      o.level_refs.some((r) => r.level_id === id));
  const triangles = (id: string): Triangle[] => {
    const r = representations.find((v) => v.object_id === id);
    if (!r) return [];
    if (r.shape.kind === "triangle_mesh") return r.shape.triangles_mm;
    // Openings are negative space already subtracted from the host wall mesh.
    // Emitting a box here would fill the void again in downstream geometry.
    if (r.shape.kind === "opening") return [];
    if (r.shape.kind === "wall_extrusion") {
      const { length_mm: l, thickness_mm: t, height_mm: h, cutouts } = r.shape;
      const xs = [
          0,
          l,
          ...cutouts.flatMap((c) => [c.min_x_mm, c.max_x_mm]),
        ].sort((a, b) => a - b),
        zs = [0, h, ...cutouts.flatMap((c) => [c.min_z_mm, c.max_z_mm])].sort(
          (a, b) => a - b,
        );
      const mesh: Triangle[] = [];
      for (let i = 1; i < xs.length; i++)
        for (let j = 1; j < zs.length; j++)
          if (
            xs[i] > xs[i - 1] &&
            zs[j] > zs[j - 1] &&
            !cutouts.some(
              (c) =>
                (xs[i] + xs[i - 1]) / 2 > c.min_x_mm &&
                (xs[i] + xs[i - 1]) / 2 < c.max_x_mm &&
                (zs[j] + zs[j - 1]) / 2 > c.min_z_mm &&
                (zs[j] + zs[j - 1]) / 2 < c.max_z_mm,
            )
          )
            mesh.push(
              ...box(
                [xs[i - 1], -t / 2, zs[j - 1]],
                [xs[i] - xs[i - 1], t, zs[j] - zs[j - 1]],
              ),
            );
      return mesh.map(
        (tr) =>
          tr.map(
            (v) =>
              [
                r.position_mm[0] +
                  v[0] * Math.cos(r.rotation_rad) -
                  v[1] * Math.sin(r.rotation_rad),
                r.position_mm[1] +
                  v[0] * Math.sin(r.rotation_rad) +
                  v[1] * Math.cos(r.rotation_rad),
                r.position_mm[2] + v[2],
              ] as Vec3,
          ) as Triangle,
      );
    }
    const [w, d, h] = r.shape.size_mm;
    return box([-w / 2, -d / 2, -h / 2], [w, d, h]).map(
      (tr) =>
        tr.map(
          (v) =>
            [
              r.position_mm[0] +
                v[0] * Math.cos(r.rotation_rad) -
                v[1] * Math.sin(r.rotation_rad),
              r.position_mm[1] +
                v[0] * Math.sin(r.rotation_rad) +
                v[1] * Math.cos(r.rotation_rad),
              r.position_mm[2] + v[2],
            ] as Vec3,
        ) as Triangle,
    );
  };
  const sheets: PermitSheet[] = PERMIT_INDEX.map(
    ([id, title, defaultScale]) => {
      const primitives: VectorPrimitive[] = [],
        warnings: string[] = [],
        sourceIds = new Set<string>();
      const path = (
        points: Vec2[],
        color = "#0f172a",
        width = 0.25,
        dash?: number[],
        closed = false,
        fill?: string,
      ) =>
        primitives.push({ kind: "path", points, color, width, dash, closed, fill });
      const text = (
        at: Vec2,
        text: string,
        size = 2.6,
        color = "#0f172a",
        max_width?: number,
      ) => primitives.push({ kind: "text", at, text, size, color, max_width });
      const viewport = options.viewports?.[id] ?? {
        scale_denominator: defaultScale,
      };
      if (![20, 25, 50, 100, 200, 500].includes(viewport.scale_denominator))
        throw new Error("Unsupported drawing scale");
      if (
        viewport.center_mm?.some((v) => !Number.isFinite(v)) ||
        viewport.crop_bounds_mm?.some((v) => !Number.isFinite(v)) ||
        (viewport.section_cut_mm !== undefined &&
          !Number.isFinite(viewport.section_cut_mm))
      )
        throw new Error("Invalid viewport coordinates");
      if (
        viewport.crop_bounds_mm &&
        (viewport.crop_bounds_mm[2] <= viewport.crop_bounds_mm[0] ||
          viewport.crop_bounds_mm[3] <= viewport.crop_bounds_mm[1])
      )
        throw new Error("Invalid viewport crop");
      const filter = (o: SmartObject) => {
        const f = o.object_type,
          d = data(o);
        if (f === "structure.rebar_set") return id === "S-06";
        switch (id) {
          case "A-01":
            return f.startsWith("land.") || f.startsWith("site.");
          case "A-02":
            return (
              (belongs(o, ground) || f === "architecture.stair") &&
              !f.startsWith("electrical.") &&
              !f.startsWith("drainage.") &&
              !f.startsWith("plumbing.") &&
              !f.startsWith("roof.")
            );
          case "A-03":
            return (
              (belongs(o, upper) || f === "architecture.stair") &&
              !f.startsWith("electrical.") &&
              !f.startsWith("drainage.") &&
              !f.startsWith("plumbing.")
            );
          case "A-04":
            return (
              f.startsWith("roof.") ||
              (f === "drainage.pipe_route" && d.system === "rainwater")
            );
          case "S-01":
            return (
              f === "structure.foundation" ||
              f === "structure.column" ||
              f === "structure.grid"
            );
          case "S-02":
            return (
              belongs(o, ground) &&
              !(
                f === "structure.beam" &&
                (String(d.mark).startsWith("R") || d.roof_support === true)
              ) &&
              (f === "structure.beam" ||
                f === "structure.slab" ||
                f === "structure.column")
            );
          case "S-03":
            return (
              belongs(o, upper) &&
              !(
                f === "structure.beam" &&
                (String(d.mark).startsWith("R") || d.roof_support === true)
              ) &&
              (f === "structure.beam" ||
                f === "structure.slab" ||
                f === "structure.column")
            );
          case "S-04":
            return (
              f === "structure.beam" &&
              (String(d.mark).startsWith("R") || d.roof_support === true)
            );
          case "A-09":
            return f === "architecture.bathroom";
          case "A-10":
            return (
              f.startsWith("decorative.") ||
              f.startsWith("interior.") ||
              f === "electrical.led_run" ||
              f === "electrical.fixture" ||
              f === "architecture.wall"
            );
          case "M-01":
            return f.startsWith("plumbing.");
          case "M-02":
            return f.startsWith("drainage.");
          case "E-01":
            return (
              f === "electrical.led_run" ||
              (f === "electrical.fixture" &&
                ["light", "switch"].includes(String(d.kind)))
            );
          case "E-02":
            return (
              f === "electrical.circuit" ||
              (f === "electrical.fixture" &&
                ["panel", "outlet"].includes(String(d.kind)))
            );
          case "A-08":
            return f.startsWith("door_window.");
          case "S-05":
            return f === "structure.column" || f === "structure.foundation";
          case "S-06":
            return f === "structure.beam" || f === "structure.rebar_set";
          default:
            return (
              f !== "structure.grid" &&
              !f.startsWith("electrical.") &&
              !f.startsWith("drainage.") &&
              !f.startsWith("plumbing.")
            );
        }
      };
      const selected = all.filter(filter);
      selected.forEach((o) => sourceIds.add(o.id));
      path(
        [
          [7, 7],
          [413, 7],
          [413, 290],
          [7, 290],
        ],
        "#0f172a",
        0.35,
        undefined,
        true,
      );
      text(
        [14, 15],
        `CONSTRUCTFLOW | ${project.project.name}`,
        3.7,
        "#0f172a",
        370,
      );
      text([14, 22], title, 3.5, "#0f172a", 370);
      path([
        [7, 255],
        [413, 255],
      ]);
      path([
        [270, 255],
        [270, 290],
      ]);
      path([
        [365, 255],
        [365, 290],
      ]);
      text([14, 262], "อาคารเดิม / Existing", 2.6, colors.existing);
      text([14, 268], "รื้อถอน / Demolition", 2.6, colors.demolition);
      text([14, 274], "สร้างใหม่ / New construction", 2.6);

      const legal = project.legal_metadata;
      const isApproved = Boolean(legal?.signatories?.issue_approved);
      if (isApproved) {
        text(
          [14, 283],
          "PERMIT ISSUE SET (แบบขออนุญาตก่อสร้าง อ.1) - เอกสารรับรองสมบูรณ์",
          2.6,
          "#047857",
          245,
        );
      } else {
        text(
          [14, 283],
          "DRAFT - ต้องตรวจและลงนามโดยผู้ออกแบบก่อนออกแบบยื่นอนุญาต",
          2.6,
          "#b45309",
          245,
        );
      }
      text(
        [275, 263],
        `Scale 1:${viewport.scale_denominator} | A3 420 x 297 mm`,
        2.6,
      );
      const archSig = legal?.signatories?.architect_name
        ? `${legal.signatories.architect_name} (${legal.signatories.architect_license_no})`
        : options.author ?? "ConstructFlow";
      const engSig = legal?.signatories?.structural_engineer_name
        ? `${legal.signatories.structural_engineer_name} (${legal.signatories.structural_engineer_license_no})`
        : "วิศวกรโครงสร้าง";
      text(
        [275, 270],
        `สถาปนิก: ${archSig}`,
        2.2,
        "#475569",
        85,
      );
      text(
        [275, 276],
        `วิศวกร: ${engSig}`,
        2.2,
        "#475569",
        85,
      );
      text(
        [275, 282],
        `Revision ${options.revision ?? (isApproved ? "01" : "DRAFT")} | ${project.project.id}`,
        2.1,
        "#475569",
        85,
      );
      text([372, 270], id, 7);
      text(
        [372, 282],
        `${PERMIT_INDEX.findIndex((v) => v[0] === id) + 1} / 20`,
        3,
      );
      const tableSheet = ["A-08", "S-05", "S-06"].includes(id);
      const drawTable = (
        rows: string[][],
        at: Vec2 = [18, 38],
        widths = [32, 48, 96, 174],
        maxRows = 27,
        rowH = 7.0,
      ) => {
        const totalW = widths.reduce((s, w) => s + w, 0);
        const headerRow = rows[0] ?? [];
        const dataRows = rows.slice(1);
        const availableW = 390 - at[0];

        let effectiveWidths = widths;
        let effectiveTotalW = totalW;
        let effectiveMaxRows = maxRows;
        let effectiveRowH = rowH;
        let colGap = 10;

        if (rows.length > maxRows) {
          if (totalW > 185) {
            const targetColW = Math.min(180, Math.floor((availableW - colGap) / 2));
            const scale = targetColW / totalW;
            effectiveWidths = widths.map((w) => Math.max(16, Math.floor(w * scale)));
            effectiveTotalW = effectiveWidths.reduce((s, w) => s + w, 0);
          }
          if (dataRows.length > (maxRows - 1) * 2) {
            effectiveRowH = 5.5;
            effectiveMaxRows = Math.floor(189 / effectiveRowH);
          }
        }

        let colOffset = 0;
        let dataIndex = 0;
        let colIndex = 0;

        while (dataIndex < dataRows.length || colIndex === 0) {
          if (at[0] + colOffset + effectiveTotalW > 392) break;

          const currentHeader =
            colIndex === 0
              ? headerRow
              : [
                  headerRow[0] ? `${headerRow[0]} (ต่อ)` : "ต่อ",
                  ...headerRow.slice(1),
                ];

          let y = at[1];
          let hx = at[0] + colOffset;
          currentHeader.forEach((cell, i) => {
            const w = effectiveWidths[i] ?? 30;
            path(
              [
                [hx, y],
                [hx + w, y],
                [hx + w, y + effectiveRowH],
                [hx, y + effectiveRowH],
              ],
              "#64748b",
              0.25,
              undefined,
              true,
              "#f1f5f9",
            );
            text([hx + 1.5, y + effectiveRowH * 0.67], cell, 2.3, "#0f172a", w - 3);
            hx += w;
          });
          y += effectiveRowH;

          const chunkSize = effectiveMaxRows - 1;
          const chunk = dataRows.slice(dataIndex, dataIndex + chunkSize);
          for (const row of chunk) {
            let rx = at[0] + colOffset;
            row.forEach((cell, i) => {
              const w = effectiveWidths[i] ?? 30;
              path(
                [
                  [rx, y],
                  [rx + w, y],
                  [rx + w, y + effectiveRowH],
                  [rx, y + effectiveRowH],
                ],
                "#cbd5e1",
                0.15,
                undefined,
                true,
                undefined,
              );
              text([rx + 1.5, y + effectiveRowH * 0.67], cell, 2.2, "#0f172a", w - 3);
              rx += w;
            });
            y += effectiveRowH;
          }
          dataIndex += chunk.length;
          colOffset += effectiveTotalW + colGap;
          colIndex++;

          if (dataIndex >= dataRows.length) break;
        }

        if (dataIndex < dataRows.length) {
          const remaining = dataRows.length - dataIndex;
          const lastX = at[0] + (colIndex - 1) * (effectiveTotalW + colGap);
          const bannerY = at[1] + effectiveMaxRows * effectiveRowH + 2;
          path(
            [
              [lastX, bannerY],
              [lastX + effectiveTotalW, bannerY],
              [lastX + effectiveTotalW, bannerY + 6],
              [lastX, bannerY + 6],
            ],
            "#f59e0b",
            0.2,
            undefined,
            true,
            "#fffbeb",
          );
          text(
            [lastX + 2, bannerY + 4.2],
            `--- ตารางมีต่อในเอกสารแนบประกอบแบบ (ตารางต่ออีก ${remaining} รายการ) ---`,
            2.1,
            "#b45309",
            effectiveTotalW - 4,
          );
          warnings.push(
            `Schedule overflow: ${remaining} rows require secondary continuation sheet`,
          );
        }
      };
      if (tableSheet) {
        const rows = [
          ["Mark / Type", "Phase", "Dimensions / Quantity", "Source / Detail"],
        ];
        for (const o of selected) {
          const d = resolvedData(project, o),
            out = outputs.find((v) => v.object_id === o.id);
          if (o.object_type === "structure.rebar_set") {
            const b = calculateBBS(project, o);
            rows.push([
              b.mark,
              `${b.grade} ${b.grade === "SR24" ? "RB" : "DB"}${b.diameter_mm}`,
              `${b.count} x ${(b.cut_length_mm / 1000).toFixed(3)} m / ${b.mass_kg.toFixed(3)} kg`,
              `${b.shape} | host ${b.host_id}`,
            ]);
          } else
            rows.push([
              String(d.mark ?? o.object_type),
              getDisplayPhase(o),
              out
                ? Object.entries(out.schedule)
                    .map(([k, v]) => `${k}=${format(v)}`)
                    .join(" | ")
                : JSON.stringify(
                    d.section_mm ?? d.size_mm ?? [d.width_mm, d.height_mm],
                  ),
              o.id,
            ]);
        }
        drawTable(rows);
        if (id === "S-05" && rows.length <= 12) {
          const unique = new Map<string, SmartObject>();
          for (const o of selected)
            unique.set(
              `${o.object_type}:${String(data(o).type_id ?? data(o).mark)}`,
              o,
            );
          for (const [i, o] of [...unique.values()].slice(0, 5).entries()) {
            const d = resolvedData(project, o),
              s = (d.section_mm ?? d.size_mm) as number[];
            if (!s) continue;
            const x = 24 + i * 75,
              y = 150,
              w = s[0] / viewport.scale_denominator,
              h = s[1] / viewport.scale_denominator;
            path(
              [
                [x, y],
                [x + w, y],
                [x + w, y + h],
                [x, y + h],
              ],
              "#0f172a",
              0.35,
              undefined,
              true,
            );
            text([x, y - 5], String(d.mark) + " plan / section", 2.5);
            text(
              [x, y + h + 5],
              s.map((v) => (v / 1000).toFixed(2)).join(" x ") + " m",
              2.4,
            );
            if (
              d.foundation_type === "pile_cap" &&
              Array.isArray(d.pile_positions_mm)
            )
              for (const a of d.pile_positions_mm as number[][]) {
                const px = x + w / 2 + a[0] / viewport.scale_denominator,
                  py = y + h / 2 + a[1] / viewport.scale_denominator;
                path(
                  [
                    [px - 1, py - 1],
                    [px + 1, py - 1],
                    [px + 1, py + 1],
                    [px - 1, py + 1],
                  ],
                  "#475569",
                  0.2,
                  undefined,
                  true,
                );
              }
          }
        }
        if (id === "S-06" && rows.length <= 12) {
          const beams = selected.filter(
            (o) => o.object_type === "structure.beam",
          );
          for (const [i, o] of beams.slice(0, 6).entries()) {
            const d = data(o),
              section = (d.section_mm ??
                resolveCatalogType(
                  project,
                  o.object_type,
                  String(d.type_id ?? d.mark),
                )?.parameters.section_mm) as number[];
            if (!section) continue;
            const x = 25 + i * 62,
              y = 155,
              w = section[0] / viewport.scale_denominator,
              h = section[1] / viewport.scale_denominator;
            path(
              [
                [x, y],
                [x + w, y],
                [x + w, y + h],
                [x, y + h],
              ],
              "#0f172a",
              0.35,
              undefined,
              true,
            );
            text([x, y - 5], String(d.mark) + " section", 2.5);
            text(
              [x, y + h + 5],
              `${(section[0] / 1000).toFixed(2)} x ${(section[1] / 1000).toFixed(2)} m`,
              2.5,
            );
            text(
              [x, y + h + 10],
              `Drop ${(Number(d.drop_mm ?? 0) / 1000).toFixed(3)} m`,
              2.3,
            );
            for (const barObject of selected.filter(
              (b) =>
                b.object_type === "structure.rebar_set" &&
                data(b).host_id === o.id,
            )) {
              const bd = data(barObject),
                cover = Number(bd.cover_mm) / viewport.scale_denominator,
                count = calculateBBS(project, barObject).count;
              if (bd.role === "top" || bd.role === "bottom")
                for (let n = 0; n < Math.min(count, 20); n++) {
                  const px =
                      x +
                      cover +
                      (w - 2 * cover) * (count === 1 ? 0.5 : n / (count - 1)),
                    py = bd.role === "top" ? y + cover : y + h - cover;
                  path(
                    [
                      [px - 0.3, py - 0.3],
                      [px + 0.3, py - 0.3],
                      [px + 0.3, py + 0.3],
                      [px - 0.3, py + 0.3],
                    ],
                    "#0f172a",
                    0.2,
                    undefined,
                    true,
                  );
                }
            }
          }
        }
        if (id === "A-08" && rows.length <= 12) {
          const unique = new Map<string, SmartObject>();
          for (const o of selected)
            unique.set(String(data(o).type_id ?? data(o).mark), o);
          for (const [i, o] of [...unique.values()].slice(0, 6).entries()) {
            const d = data(o),
              t = resolveCatalogType(
                project,
                o.object_type,
                String(d.type_id ?? d.mark),
              ),
              over = d.instance_overrides as
                | Record<string, unknown>
                | undefined,
              w =
                Number(over?.width_mm ?? d.width_mm ?? t?.parameters.width_mm) /
                viewport.scale_denominator,
              h =
                Number(
                  over?.height_mm ?? d.height_mm ?? t?.parameters.height_mm,
                ) / viewport.scale_denominator,
              x = 25 + i * 62,
              y = 155;
            if (!Number.isFinite(w + h)) continue;
            path(
              [
                [x, y],
                [x + w, y],
                [x + w, y + h],
                [x, y + h],
              ],
              "#0f172a",
              0.3,
              undefined,
              true,
            );
            text([x, y - 5], String(d.mark), 2.5);
            text(
              [x, y + h + 5],
              `${((w * viewport.scale_denominator) / 1000).toFixed(2)} x ${((h * viewport.scale_denominator) / 1000).toFixed(2)} m`,
              2.4,
            );
          }
        }
      } else if (id === "A-01") {
        const legal = project.legal_metadata;
        if (legal && legal.deed_no) {
          // 1. Deed Information Table
          text([18, 34], "ข้อมูลโฉนดที่ดิน (น.ส. 4 จ.) / TITLE DEED & PROPERTY PARCEL", 3.0, "#0f172a");
          drawTable(
            [
              ["หัวข้อ / Item", "รายละเอียด / Details"],
              ["โฉนดที่ดินเลขที่ / Title Deed No.", legal.deed_no],
              ["หน้าสำรวจ / Survey Page", legal.survey_page || "-"],
              ["เลขที่ดิน / Land Parcel No.", legal.land_no || "-"],
              ["ที่ตั้งที่ดิน / Location", `${legal.subdistrict || ""} ${legal.district || ""} จ.${legal.province || ""}`],
              ["เนื้อที่ดิน / Parcel Area", `${legal.rai} ไร่ ${legal.ngan} งาน ${legal.sq_wa} ตร.ว. (${legal.total_area_sqm.toFixed(2)} ตร.ม.)`],
            ],
            [18, 38],
            [75, 115],
            10,
            6.0,
          );

          // 2. Thai Building Code Zoning & Compliance Table
          text([18, 82], "ข้อกำหนดระยะร่นและผังเมือง (กฎกระทรวงฉบับที่ 55 & ข้อบัญญัติ กทม.)", 3.0, "#0f172a");
          drawTable(
            [
              ["เกณฑ์การตรวจสอบ / Regulation", "เกณฑ์กฎหมาย / Standard", "ผลการตรวจสอบ / Verification"],
              ["ระยะร่นผนังมีช่องเปิด (Setback with Openings)", ">= 2.00 ม.", `${legal.setbacks.min_opening_setback_m.toFixed(2)} ม. (ผ่านเกณฑ์กฎหมาย)`],
              ["ระยะร่นผนังทึบ (Setback Blind Wall)", ">= 0.50 ม.", `${legal.setbacks.min_blind_setback_m.toFixed(2)} ม. (ผ่านเกณฑ์กฎหมาย)`],
              ["อัตราส่วนพื้นที่ว่าง (Open Space Ratio - OSR)", `>= ${legal.zoning.osr_min_percent}%`, `ผ่านเกณฑ์`],
              ["พื้นที่ว่างน้ำซึมผ่านได้ (Permeable Open Space)", ">= 50% ของ OSR", `${legal.zoning.permeable_open_space_ratio_percent}% (ผ่านเกณฑ์)`],
            ],
            [18, 86],
            [75, 55, 60],
            10,
            6.0,
          );

          // 3. Signatories Table
          text([18, 126], "ผู้รับผิดชอบและลงนามรับรองแบบ (AUTHORIZED SIGNATORIES)", 3.0, "#0f172a");
          drawTable(
            [
              ["บทบาท / Role", "ชื่อ-นามสกุล / Name", "ใบอนุญาต / License", "สถานะ / Status"],
              ["เจ้าของอาคาร (Owner)", legal.signatories.owner_name || "-", "-", "ยินยอมให้ดำเนินการ"],
              ["สถาปนิกผู้ออกแบบ (Architect)", legal.signatories.architect_name || "-", legal.signatories.architect_license_no || "-", "ลงนามรับรองแบบ"],
              ["วิศวกรโครงสร้าง (Engineer)", legal.signatories.structural_engineer_name || "-", legal.signatories.structural_engineer_license_no || "-", "ลงนามคำนวณและควบคุมงาน"],
            ],
            [18, 130],
            [50, 65, 45, 30],
            10,
            6.0,
          );

          // 4. Site Boundary Parcel Plot Viewport (Right half: 220, 38)
          text([220, 34], "ผังแนวเขตที่ดินและหลักเขต (PROPERTY BOUNDARY & SETBACKS)", 3.0, "#0f172a");
          // Boundary Box (420 - 220 - 15 = 185 wide, 120 high)
          path(
            [
              [220, 38],
              [405, 38],
              [405, 155],
              [220, 155],
            ],
            "#94a3b8",
            0.2,
            undefined,
            true,
          );

          // Pegs and Boundary Lines
          const pegs = legal.boundary_pegs && legal.boundary_pegs.length >= 3
            ? legal.boundary_pegs
            : [
                { peg_no: "1", coordinate_m: [0, 0] as [number, number] },
                { peg_no: "2", coordinate_m: [20, 0] as [number, number] },
                { peg_no: "3", coordinate_m: [20, 25] as [number, number] },
                { peg_no: "4", coordinate_m: [0, 25] as [number, number] },
              ];

          // Compute scale and center for boundary pegs plot
          const xs = pegs.map((p) => p.coordinate_m[0]);
          const ys = pegs.map((p) => p.coordinate_m[1]);
          const minPx = Math.min(...xs), maxPx = Math.max(...xs);
          const minPy = Math.min(...ys), maxPy = Math.max(...ys);
          const spanX = Math.max(maxPx - minPx, 1);
          const spanY = Math.max(maxPy - minPy, 1);
          const plotScale = Math.min(130 / spanX, 85 / spanY);
          const offsetX = 240 + (130 - spanX * plotScale) / 2;
          const offsetY = 50 + (85 - spanY * plotScale) / 2;

          const polyPts: Vec2[] = pegs.map((p) => [
            offsetX + (p.coordinate_m[0] - minPx) * plotScale,
            offsetY + (p.coordinate_m[1] - minPy) * plotScale,
          ]);

          // Draw Property Boundary Line
          path(polyPts, "#0f172a", 0.5, undefined, true);

          // Draw Setback Line (2.00m inward dashed red)
          const setbackPts: Vec2[] = pegs.map((p) => {
            const insetM = 2.0;
            const sx = p.coordinate_m[0] === minPx ? p.coordinate_m[0] + insetM : p.coordinate_m[0] - insetM;
            const sy = p.coordinate_m[1] === minPy ? p.coordinate_m[1] + insetM : p.coordinate_m[1] - insetM;
            return [
              offsetX + (sx - minPx) * plotScale,
              offsetY + (sy - minPy) * plotScale,
            ];
          });
          path(setbackPts, "#ef4444", 0.35, [3, 2], true);
          text([225, 148], "-- ระยะร่นแนวอาคาร 2.00 ม. (Setback line)", 2.2, "#ef4444");

          // Draw Peg Circles and Numbers
          pegs.forEach((p, idx) => {
            const pt = polyPts[idx];
            path(
              [
                [pt[0] - 1.5, pt[1]],
                [pt[0] + 1.5, pt[1]],
              ],
              "#2563eb",
              0.4,
            );
            path(
              [
                [pt[0], pt[1] - 1.5],
                [pt[0], pt[1] + 1.5],
              ],
              "#2563eb",
              0.4,
            );
            text([pt[0] + 2, pt[1] - 2], `หลักเขต ${p.peg_no}`, 2.2, "#2563eb");
          });

          // North Arrow
          path([[390, 48], [390, 42]], "#0f172a", 0.4);
          path([[388, 44], [390, 42], [392, 44]], "#0f172a", 0.4);
          text([389, 41], "N", 2.5, "#0f172a");

          // Levels table
          drawTable(
            [
              ["Level", "Datum (m)", "Height (m)", "Source"],
              ...levels.map((l) => [
                l.name,
                (l.elevation_mm / 1000).toFixed(3),
                format((l.height_mm ?? 0) / 1000),
                l.id,
              ]),
            ],
            [220, 160],
            [40, 35, 35, 75],
            6,
            5.5,
          );

          // 20-Sheet Master Index
          text([18, 162], "20-SHEET MASTER DRAWING INDEX", 3.0, "#0f172a");
          PERMIT_INDEX.forEach((entry, i) =>
            text(
              [18 + (i >= 10 ? 98 : 0), 170 + (i % 10) * 6.5],
              `${entry[0]}  ${entry[1]}`,
              2.2,
              "#0f172a",
              95,
            ),
          );
        } else {
          // Fallback when legal_metadata is not provided
          drawTable(
            [
              ["Level", "Datum (m)", "Height (m)", "Source"],
              ...levels.map((l) => [
                l.name,
                (l.elevation_mm / 1000).toFixed(3),
                format((l.height_mm ?? 0) / 1000),
                l.id,
              ]),
            ],
            [18, 38],
          );
          warnings.push(
            "Deed boundary, verified setbacks, zoning, project/signatory information required",
          );
          text([18, 110], "20-SHEET MASTER INDEX", 3.5);
          PERMIT_INDEX.forEach((entry, i) =>
            text(
              [18 + (i >= 10 ? 195 : 0), 120 + (i % 10) * 9],
              `${entry[0]}  ${entry[1]}`,
              2.5,
              "#0f172a",
              185,
            ),
          );
        }
      } else {
        const objectsWithMesh = selected.map((o) => ({
          object: o,
          mesh: triangles(o.id),
          out: outputs.find((v) => v.object_id === o.id),
        }));
        const views =
          id === "A-05" || id === "A-06"
            ? ["xz", "yz"]
            : id === "A-07"
              ? ["section_x", "section_y"]
              : id === "A-09"
                ? ["xy", "section_x"]
                : id === "M-01"
                  ? ["iso"]
                  : ["xy"];
        for (const [viewIndex, mode] of views.entries()) {
          const view = {
            x: 18 + viewIndex * 195,
            y: 40,
            w: views.length === 2 || id === "E-02" ? 180 : 375,
            h: 138,
          };
          const projectPoint = (v: Vec3): Vec2 =>
            mode === "xz" || mode === "section_x"
              ? [id === "A-06" ? -v[0] : v[0], v[2]]
              : mode === "yz" || mode === "section_y"
                ? [id === "A-06" ? -v[1] : v[1], v[2]]
                : mode === "iso"
                  ? [v[0] - v[1], v[2] + (v[0] + v[1]) * 0.35]
                  : [v[0], v[1]];
          const pts = objectsWithMesh.flatMap((v) =>
            v.mesh
              .flat()
              .map(projectPoint)
              .concat((v.out?.paths ?? []).flat().map(projectPoint)),
          );
          const minX = pts.length ? Math.min(...pts.map((v) => v[0])) : 0,
            maxX = pts.length ? Math.max(...pts.map((v) => v[0])) : 0,
            minY = pts.length ? Math.min(...pts.map((v) => v[1])) : 0,
            maxY = pts.length ? Math.max(...pts.map((v) => v[1])) : 0;
          const cx =
              viewport.center_mm?.[0] ??
              (viewport.crop_bounds_mm
                ? (viewport.crop_bounds_mm[0] + viewport.crop_bounds_mm[2]) / 2
                : (minX + maxX) / 2),
            cy =
              viewport.center_mm?.[1] ??
              (viewport.crop_bounds_mm
                ? (viewport.crop_bounds_mm[1] + viewport.crop_bounds_mm[3]) / 2
                : (minY + maxY) / 2),
            s = 1 / viewport.scale_denominator;
          const mapped = (v: Vec2): Vec2 => [
            view.x + view.w / 2 + (v[0] - cx) * s,
            view.y + view.h / 2 - (v[1] - cy) * s,
          ];
          const paperCrop = [
              cx - view.w / 2 / s,
              cy - view.h / 2 / s,
              cx + view.w / 2 / s,
              cy + view.h / 2 / s,
            ],
            requested = viewport.crop_bounds_mm ?? paperCrop;
          const crop = [
            Math.max(requested[0], paperCrop[0]),
            Math.max(requested[1], paperCrop[1]),
            Math.min(requested[2], paperCrop[2]),
            Math.min(requested[3], paperCrop[3]),
          ];
          let clipped = false;
          const drawSegment = (
            a: Vec2,
            b: Vec2,
            color: string,
            width: number,
            dash?: number[],
          ) => {
            const dx = b[0] - a[0],
              dy = b[1] - a[1];
            let t0 = 0,
              t1 = 1;
            for (const [p, q] of [
              [-dx, a[0] - crop[0]],
              [dx, crop[2] - a[0]],
              [-dy, a[1] - crop[1]],
              [dy, crop[3] - a[1]],
            ]) {
              if (p === 0 && q < 0) {
                clipped = true;
                return;
              }
              if (p !== 0) {
                const r = q / p;
                if (p < 0) t0 = Math.max(t0, r);
                else t1 = Math.min(t1, r);
              }
            }
            if (t0 > t1) {
              clipped = true;
              return;
            }
            if (t0 > 0 || t1 < 1) clipped = true;
            path(
              [
                mapped([a[0] + dx * t0, a[1] + dy * t0]),
                mapped([a[0] + dx * t1, a[1] + dy * t1]),
              ],
              color,
              width,
              dash,
            );
          };
          const isElevation = mode === "xz" || mode === "yz" || mode === "iso";
          const getDepth = (v: Vec3): number => {
            if (mode === "xz" || mode === "section_x") {
              return id === "A-06" ? -v[1] : v[1];
            } else if (mode === "yz" || mode === "section_y") {
              return id === "A-06" ? -v[0] : v[0];
            } else if (mode === "iso") {
              return v[0] + v[1];
            } else {
              return -v[2];
            }
          };

          const viewDir: Vec3 =
            mode === "xz" || mode === "section_x"
              ? id === "A-06"
                ? [0, -1, 0]
                : [0, 1, 0]
              : mode === "yz" || mode === "section_y"
                ? id === "A-06"
                  ? [-1, 0, 0]
                  : [1, 0, 0]
                : mode === "iso"
                  ? [0.7071, 0.7071, -0.247]
                  : [0, 0, -1];

          interface FrontFace {
            poly2D: Vec2[];
            depth: number;
            minX: number;
            maxX: number;
            minY: number;
            maxY: number;
            objectId: string;
          }
          const frontFaces: FrontFace[] = [];

          if (isElevation) {
            for (const { object: o, mesh } of objectsWithMesh) {
              for (const tr of mesh) {
                const a = [
                  tr[1][0] - tr[0][0],
                  tr[1][1] - tr[0][1],
                  tr[1][2] - tr[0][2],
                ];
                const b = [
                  tr[2][0] - tr[0][0],
                  tr[2][1] - tr[0][1],
                  tr[2][2] - tr[0][2],
                ];
                const n: Vec3 = [
                  a[1] * b[2] - a[2] * b[1],
                  a[2] * b[0] - a[0] * b[2],
                  a[0] * b[1] - a[1] * b[0],
                ];
                const norm = Math.hypot(...n);
                if (norm < 1e-9) continue;
                const dot =
                  (n[0] * viewDir[0] + n[1] * viewDir[1] + n[2] * viewDir[2]) /
                  norm;
                if (dot < -0.05) {
                  const pts2D = tr.map(projectPoint);
                  const xs = pts2D.map((p) => p[0]);
                  const ys = pts2D.map((p) => p[1]);
                  const depth =
                    (getDepth(tr[0]) + getDepth(tr[1]) + getDepth(tr[2])) / 3;
                  frontFaces.push({
                    poly2D: pts2D,
                    depth,
                    minX: Math.min(...xs),
                    maxX: Math.max(...xs),
                    minY: Math.min(...ys),
                    maxY: Math.max(...ys),
                    objectId: o.id,
                  });
                }
              }
            }
            frontFaces.sort((fa, fb) => fb.depth - fa.depth);
            for (const f of frontFaces) {
              const screenPts = f.poly2D.map(mapped);
              if (
                screenPts.some(
                  (pt) =>
                    pt[0] >= view.x - 20 &&
                    pt[0] <= view.x + view.w + 20 &&
                    pt[1] >= view.y - 20 &&
                    pt[1] <= view.y + view.h + 20,
                )
              ) {
                path(screenPts, "#f8fafc", 0.1, undefined, true, "#ffffff");
              }
            }
          }

          const isPointIn2DPoly = (pt: Vec2, poly: Vec2[]): boolean => {
            let inside = false;
            for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
              const xi = poly[i][0],
                yi = poly[i][1];
              const xj = poly[j][0],
                yj = poly[j][1];
              const intersect =
                yi > pt[1] !== yj > pt[1] &&
                pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
              if (intersect) inside = !inside;
            }
            return inside;
          };

          const isEdgeOccluded = (
            ea: Vec3,
            eb: Vec3,
            ownerId: string,
          ): boolean => {
            if (frontFaces.length === 0) return false;
            const dE = (getDepth(ea) + getDepth(eb)) / 2;
            const pa = projectPoint(ea),
              pb = projectPoint(eb);
            const m: Vec2 = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
            for (const f of frontFaces) {
              if (f.objectId === ownerId) continue;
              if (f.depth >= dE - 15) continue;
              if (
                m[0] < f.minX ||
                m[0] > f.maxX ||
                m[1] < f.minY ||
                m[1] > f.maxY
              )
                continue;
              if (isPointIn2DPoly(m, f.poly2D)) {
                return true;
              }
            }
            return false;
          };

          for (const { object: o, mesh, out } of objectsWithMesh) {
            const phase = getDisplayPhase(o),
              color = colors[phase],
              width = phase === "new_construction" ? 0.35 : 0.25,
              dash = phase === "demolition" ? [2, 1] : undefined,
              seen = new Set<string>();
            const edge = (a: Vec3, b: Vec3, isSectionCut = false) => {
              const p = projectPoint(a),
                q = projectPoint(b),
                key = [p.join(","), q.join(",")].sort().join("|");
              if (seen.has(key) || Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-6)
                return;
              seen.add(key);
              if (isSectionCut) {
                drawSegment(p, q, color, 0.50);
                return;
              }
              if (isElevation) {
                const occluded = isEdgeOccluded(a, b, o.id);
                if (occluded) {
                  if (a[2] < 0 && b[2] < 0) {
                    drawSegment(p, q, "#94a3b8", 0.20, [2, 1]);
                  }
                  return;
                }
              }
              drawSegment(p, q, color, width, dash);
            };
            for (const tr of mesh) {
              if (mode.startsWith("section_")) {
                const axis = mode === "section_x" ? 1 : 0,
                  world = objectsWithMesh.flatMap((v) =>
                    v.mesh.flat().map((v) => v[axis]),
                  ),
                  bathDrain =
                    id === "A-09"
                      ? (data(o).drain_mm as number[] | undefined)?.[axis]
                      : undefined,
                  cut =
                    viewport.section_cut_mm ??
                    bathDrain ??
                    (world.length
                      ? (Math.min(...world) + Math.max(...world)) / 2
                      : 0),
                  intersections: Vec3[] = [];
                for (let i = 0; i < 3; i++) {
                  const a = tr[i],
                    b = tr[(i + 1) % 3],
                    da = a[axis] - cut,
                    db = b[axis] - cut;
                  if (Math.abs(da) < 1e-7) intersections.push(a);
                  if (da * db < 0) {
                    const t = da / (da - db);
                    intersections.push(
                      a.map((v, j) => v + (b[j] - v) * t) as Vec3,
                    );
                  }
                }
                if (intersections.length >= 2)
                  edge(intersections[0], intersections[1], true);
              }
            }
            if (!mode.startsWith("section_")) {
              const edges = new Map<
                string,
                { a: Vec3; b: Vec3; normals: Vec3[] }
              >();
              for (const tr of mesh) {
                const a = tr[1].map((v, i) => v - tr[0][i]),
                  b = tr[2].map((v, i) => v - tr[0][i]),
                  n: Vec3 = [
                    a[1] * b[2] - a[2] * b[1],
                    a[2] * b[0] - a[0] * b[2],
                    a[0] * b[1] - a[1] * b[0],
                  ],
                  norm = Math.hypot(...n);
                if (norm < 1e-9) continue;
                for (let i = 0; i < 3; i++) {
                  const a = tr[i],
                    b = tr[(i + 1) % 3],
                    key = [
                      a.map((v) => v.toFixed(5)).join(","),
                      b.map((v) => v.toFixed(5)).join(","),
                    ]
                      .sort()
                      .join("|"),
                    e = edges.get(key) ?? { a, b, normals: [] };
                  e.normals.push(n.map((v) => v / norm) as Vec3);
                  edges.set(key, e);
                }
              }
              for (const e of edges.values())
                if (
                  e.normals.length === 1 ||
                  e.normals.some(
                    (n) =>
                      Math.abs(
                        n.reduce((s, v, i) => s + v * e.normals[0][i], 0),
                      ) <
                      1 - 1e-8,
                  )
                )
                  edge(e.a, e.b);
              for (const route of out?.paths ?? [])
                for (let i = 1; i < route.length; i++)
                  edge(route[i - 1], route[i]);
            }
            if (out)
              warnings.push(...out.warnings.map((w) => `${out.mark}: ${w}`));
            const anchor = mesh[0]?.[0] ?? out?.paths[0]?.[0];
            if (anchor) {
              const a = mapped(projectPoint(anchor));
              if (
                a[0] >= view.x &&
                a[0] < view.x + view.w &&
                a[1] >= view.y &&
                a[1] < view.y + view.h
              )
                text(
                  [a[0] + 1, a[1] - 1],
                  String(data(o).mark ?? o.object_type),
                  2.2,
                  color,
                  25,
                );
              if (
                id === "M-02" &&
                out &&
                a[0] >= view.x &&
                a[0] < view.x + view.w &&
                a[1] >= view.y &&
                a[1] < view.y + view.h - 4
              ) {
                const details =
                  o.object_type === "drainage.pipe_route"
                    ? `IL ${out.schedule.Start_IL} -> ${out.schedule.End_IL} m | slope ${out.schedule.Slope}`
                    : o.object_type === "drainage.manhole"
                      ? `IL ${out.schedule.Invert_m} m`
                      : "";
                if (details)
                  text(
                    [a[0] + 2, a[1] + 4],
                    details,
                    2.3,
                    color,
                    Math.min(130, view.x + view.w - a[0] - 2),
                  );
              }
            }
            if (
              id === "A-04" &&
              mode === "xy" &&
              o.object_type === "roof.system"
            ) {
              const d = data(o),
                boundary = d.boundary_mm as number[][],
                edges = d.edges as {
                  defines_slope: boolean;
                  slope_deg: number;
                }[];
              for (const [i, e] of edges.entries())
                if (e.defines_slope) {
                  const a = boundary[i],
                    b = boundary[(i + 1) % boundary.length],
                    mid = mapped([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
                  if (
                    mid[0] >= view.x &&
                    mid[0] < view.x + view.w - 24 &&
                    mid[1] >= view.y + 2 &&
                    mid[1] < view.y + view.h
                  )
                    text(
                      [mid[0] + 1, mid[1] - 2],
                      `${e.slope_deg} deg`,
                      2.3,
                      color,
                      24,
                    );
                }
            }
          }
          if (clipped)
            warnings.push(
              "Viewport clips model at fixed scale; adjust crop/center/scale before issue",
            );
          if (pts.length) {
            const a = mapped([minX, minY]),
              b = mapped([maxX, minY]);
            if (a[0] >= view.x && b[0] <= view.x + view.w) {
              const y = view.y + view.h + 7;
              path(
                [
                  [a[0], y],
                  [b[0], y],
                ],
                "#475569",
                0.2,
              );
              path(
                [
                  [a[0], y - 2],
                  [a[0], y + 2],
                ],
                "#475569",
                0.2,
              );
              path(
                [
                  [b[0], y - 2],
                  [b[0], y + 2],
                ],
                "#475569",
                0.2,
              );
              text(
                [(a[0] + b[0]) / 2 - 8, y - 1],
                ((maxX - minX) / 1000).toFixed(2) + " m",
                2.7,
              );
            }
            if (mode === "xy") {
              const a = mapped([maxX, minY]),
                b = mapped([maxX, maxY]),
                x = view.x + view.w - 4;
              if (a[1] <= view.y + view.h && b[1] >= view.y) {
                path(
                  [
                    [x, a[1]],
                    [x, b[1]],
                  ],
                  "#475569",
                  0.2,
                );
                for (const y of [a[1], b[1]])
                  path(
                    [
                      [x - 2, y],
                      [x + 2, y],
                    ],
                    "#475569",
                    0.2,
                  );
                text(
                  [x - 18, (a[1] + b[1]) / 2],
                  ((maxY - minY) / 1000).toFixed(2) + " m",
                  2.7,
                );
              }
              const xs = [
                ...new Set(
                  selected
                    .filter((o) => o.object_type === "structure.column")
                    .map((o) => (data(o).location_mm as number[])[0]),
                ),
              ].sort((a, b) => a - b);
              const y = view.y + view.h + 2;
              for (let i = 1; i < xs.length; i++) {
                const a = mapped([xs[i - 1], minY]),
                  b = mapped([xs[i], minY]);
                if (a[0] < view.x || b[0] > view.x + view.w) continue;
                path(
                  [
                    [a[0], y],
                    [b[0], y],
                  ],
                  "#475569",
                  0.2,
                );
                for (const x of [a[0], b[0]])
                  path(
                    [
                      [x, y - 1],
                      [x, y + 1],
                    ],
                    "#475569",
                    0.2,
                  );
                text(
                  [(a[0] + b[0]) / 2 - 6, y - 1],
                  ((xs[i] - xs[i - 1]) / 1000).toFixed(2),
                  2.3,
                );
              }
            }
          }
          if (mode !== "xy") {
            const glPt = mapped([minX, 0]);
            const glY = glPt[1];
            if (glY >= view.y && glY <= view.y + view.h) {
              path(
                [
                  [view.x, glY],
                  [view.x + view.w, glY],
                ],
                "#0f172a",
                0.7,
              );
              for (let gx = view.x; gx <= view.x + view.w; gx += 6) {
                path(
                  [
                    [gx, glY],
                    [gx - 3.5, glY + 3.5],
                  ],
                  "#475569",
                  0.3,
                );
                path(
                  [
                    [gx - 1.5, glY],
                    [gx - 3.5, glY + 2.0],
                  ],
                  "#64748b",
                  0.2,
                );
              }
              text(
                [view.x + 2, glY - 2],
                "±0.000 GL (ระดับดินเดิม)",
                2.3,
                "#0f172a",
              );
            }
            for (const level of levels) {
              const a = mapped([minX, level.elevation_mm]);
              if (a[1] >= view.y && a[1] <= view.y + view.h) {
                path(
                  [
                    [view.x, a[1]],
                    [view.x + view.w, a[1]],
                  ],
                  "#94a3b8",
                  0.18,
                  [4, 2, 1, 2],
                );
                const datumX = view.x + view.w - 24;
                path(
                  [
                    [datumX - 2.5, a[1] - 3.0],
                    [datumX + 2.5, a[1] - 3.0],
                    [datumX, a[1]],
                  ],
                  "#0f172a",
                  0.3,
                  undefined,
                  true,
                );
                path(
                  [
                    [datumX - 4, a[1]],
                    [datumX + 22, a[1]],
                  ],
                  "#0f172a",
                  0.3,
                );
                const elevStr = `${level.elevation_mm >= 0 ? "+" : ""}${(level.elevation_mm / 1000).toFixed(2)} ${level.name}`;
                text([datumX + 2, a[1] - 1.2], elevStr, 2.2, "#0f172a");
              }
            }
          }
          if (mode === "xy" && (id === "A-02" || id === "A-03")) {
            for (const o of selected.filter(
              (s) => s.object_type === "architecture.stair",
            )) {
              const sd = data(o);
              const [sx0, sy0] = (sd.start_point_mm as
                | number[]
                | undefined) ?? [0, 0, 0];
              const sw = Number(sd.width_mm ?? 1000);
              const st = Number(sd.tread_depth_mm ?? 250);
              const sn = Number(sd.num_risers ?? 17);
              const sLen = sn * st;

              const wStart = mapped([sx0 + st / 2, sy0 + sw / 2]);
              const wEnd = mapped([sx0 + sLen - st / 2, sy0 + sw / 2]);
              if (wStart[0] >= view.x && wEnd[0] <= view.x + view.w) {
                path(
                  [
                    [wStart[0] - 1, wStart[1]],
                    [wStart[0] + 1, wStart[1]],
                  ],
                  "#0f172a",
                  0.6,
                );
                path([wStart, wEnd], "#0f172a", 0.35);
                path(
                  [
                    [wEnd[0] - 3, wEnd[1] - 2],
                    wEnd,
                    [wEnd[0] - 3, wEnd[1] + 2],
                  ],
                  "#0f172a",
                  0.35,
                );
                text(
                  [(wStart[0] + wEnd[0]) / 2 - 3, wStart[1] - 2],
                  "UP",
                  2.2,
                  "#0f172a",
                );
                text([wStart[0] - 2, wStart[1] + 4], "1", 2.0, "#64748b");
                text([wEnd[0] - 4, wEnd[1] + 4], `${sn}`, 2.0, "#64748b");

                if (id === "A-02") {
                  const cutX = sx0 + 7 * st;
                  const c1 = mapped([cutX - 120, sy0 - 80]);
                  const c2 = mapped([cutX + 120, sy0 + sw + 80]);
                  path([c1, c2], "#0f172a", 0.45);
                  path(
                    [
                      mapped([cutX - 80, sy0 - 80]),
                      mapped([cutX + 160, sy0 + sw + 80]),
                    ],
                    "#0f172a",
                    0.45,
                  );
                  text(
                    [c1[0] + 2, c1[1] + 3],
                    "แนวตัดบันได 1FL",
                    1.8,
                    "#64748b",
                  );
                }
              }
            }
          }
          if (id === "A-10" && mode === "xy" && pts.length) {
            const stepGrid = 600;
            const startGx = Math.ceil(minX / stepGrid) * stepGrid;
            const startGy = Math.ceil(minY / stepGrid) * stepGrid;
            for (let gx = startGx; gx <= maxX; gx += stepGrid) {
              const p1 = mapped([gx, minY]);
              const p2 = mapped([gx, maxY]);
              if (p1[0] >= view.x && p1[0] <= view.x + view.w) {
                path([p1, p2], "#cbd5e1", 0.12, [2, 2]);
              }
            }
            for (let gy = startGy; gy <= maxY; gy += stepGrid) {
              const p1 = mapped([minX, gy]);
              const p2 = mapped([maxX, gy]);
              if (p1[1] >= view.y && p1[1] <= view.y + view.h) {
                path([p1, p2], "#cbd5e1", 0.12, [2, 2]);
              }
            }
            text(
              [view.x + 2, view.y + view.h - 3],
              "RCP: ฝ้าเพดานยิปซัมบอร์ด 9 มม. โครง C-Line @0.60 ม. ระดับ +2.70 ม. / Grid 600x600 mm",
              2.1,
              "#475569",
              240,
            );
          }
          text(
            [view.x, 35],
            mode === "xy"
              ? "PLAN"
              : mode === "section_x"
                ? "SECTION A"
                : mode === "section_y"
                  ? "SECTION B"
                  : mode.toUpperCase(),
            2.7,
          );
        }
        const schedules = selected.flatMap((o) => {
          const out = outputs.find((v) => v.object_id === o.id);
          return out
            ? [
                [
                  out.mark,
                  getDisplayPhase(o),
                  Object.keys(out.schedule).slice(0, 3).join(" / "),
                  Object.values(out.schedule)
                    .slice(0, 3)
                    .map(format)
                    .join(" / "),
                ],
              ]
            : [];
        });
        if (schedules.length)
          drawTable(
            [["Mark", "Phase", "Parameter", "Value"], ...schedules],
            [18, 188],
            [30, 38, 145, 162],
            7,
            6,
          );
        if (id === "A-09") {
          const bath = selected[0],
            d = bath ? data(bath) : undefined;
          if (d) {
            text(
              [18, 214],
              `Waterproof upstand ${Number(d.waterproof_upstand_mm) / 1000} m | Wet wall ${Number(d.wet_wall_height_mm) / 1000} m | WC rough-in ${Number(d.toilet_rough_in_mm) / 1000} m`,
              2.5,
              "#0f172a",
              370,
            );
            text(
              [18, 220],
              `Tile module ${((d.tile_mm ?? []) as number[]).map((v) => v / 1000).join(" x ")} m | Surface fall to drain | Slab detailing by structural model`,
              2.5,
              "#475569",
              370,
            );
          }
        }
        if (id === "M-01")
          text(
            [18, 225],
            "Isometric bypass schematic - inlet, outlet, bypass valves and one-way check valve. NTS.",
            2.5,
            "#475569",
            370,
          );
        if (id === "E-02") {
          const circuits = selected.filter(
            (o) => o.object_type === "electrical.circuit",
          );
          text([232, 42], "Single line diagram & Phase Schedule / NTS", 2.8);

          const circuitWatts = circuits.map((o) => {
            const d = resolvedData(project, o);
            const w = (d.device_ids as string[])
              .filter((loadId) => project.objects[loadId]?.removed_phase === null)
              .reduce(
                (s, loadId) =>
                  s +
                  Number(
                    resolvedData(project, project.objects[loadId])?.watts ?? 0,
                  ),
                0,
              );
            return { id: o.id, watts: w };
          });
          const balance = balanceCircuitsPhase(circuitWatts);

          for (const [i, o] of circuits.slice(0, 5).entries()) {
            const d = resolvedData(project, o),
              out = outputs.find((v) => v.object_id === o.id),
              y = 50 + i * 23,
              panel = project.objects[String(d.panel_id)],
              phaseName =
                balance.assignments[o.id] ??
                `Phase ${["A", "B", "C"][i % 3]}`,
              loadW =
                typeof out?.schedule.Watts === "number"
                  ? out.schedule.Watts
                  : 0,
              eit = recommendEITBreakerAndWire(
                loadW,
                Number(d.voltage) || 230,
              );
            text(
              [232, y],
              `${panel ? String(data(panel).mark) : "Panel"} -> ${d.mark} [${phaseName}]`,
              2.4,
              "#0f172a",
            );
            path(
              [
                [234, y + 4],
                [258, y + 4],
                [260, y + 2],
                [263, y + 6],
                [266, y + 4],
                [384, y + 4],
              ],
              "#0f172a",
              0.3,
            );
            text(
              [232, y + 10],
              `วสท.: ${eit.breaker_rating_at}AT/${eit.breaker_frame_af}AF | 2x${eit.cable_size_mm2} mm2 (${eit.cable_type}) | ${loadW} W`,
              2.2,
              "#0f172a",
            );
            text(
              [232, y + 15],
              `Loads: ${(d.device_ids as string[])
                .map((id) => String(data(project.objects[id])?.mark ?? id))
                .join(", ")}`,
              2.0,
              "#475569",
              160,
            );
          }

          text(
            [232, 172],
            `ตารางสมดุลเฟส วสท. (EIT Phase Balance): A: ${balance.phase_a_watts.toFixed(0)} W | B: ${balance.phase_b_watts.toFixed(0)} W | C: ${balance.phase_c_watts.toFixed(0)} W`,
            2.2,
            "#0f172a",
            175,
          );
          text(
            [232, 178],
            `Unbalance: ${balance.max_unbalance_pct.toFixed(1)}% (เกณฑ์ วสท. <= 15% ${balance.is_balanced ? "ผ่านเกณฑ์" : "ควรปรับโหลด"})`,
            2.2,
            balance.is_balanced ? "#047857" : "#b45309",
            175,
          );

          if (circuits.length > 5)
            warnings.push(
              "SLD overflow: add circuit continuation sheet; issue blocked",
            );
          if (!circuits.length)
            warnings.push(
              "Panel single line diagram requires circuit source objects",
            );
        }
        if (id === "E-01")
          for (const o of selected) {
            const d = data(o);
            if (d.kind === "switch")
              for (const loadId of (d.controlled_ids ?? []) as string[])
                if (project.objects[loadId])
                  text(
                    [18, 184],
                    `${String(d.mark)} -> ${String(data(project.objects[loadId]).mark)} (${d.switch_ways}-way)`,
                    2.4,
                  );
          }
      }
      if (!selected.length && id !== "A-01")
        warnings.push(
          `No modeled source objects for ${id}; confirm applicability or add data`,
        );
      const missingRequired =
        (id === "S-02" || id === "S-03") &&
        !selected.some((o) =>
          ["structure.beam", "structure.slab"].includes(o.object_type),
        );
      if (missingRequired)
        warnings.push(
          "Framing source is incomplete: add modeled beams/slabs or explicitly confirm this sheet is not applicable",
        );
      if (
        id === "S-06" &&
        !selected.some((o) => o.object_type === "structure.rebar_set")
      )
        warnings.push("BBS reinforcement source objects are missing");
      if (id === "A-10")
        warnings.push(
          "Finish/joinery geometry shown; reflected ceiling layout and finish annotations require project inputs",
        );
      if (id === "A-07")
        warnings.push(
          "Sections show geometric intersections; annotation and construction detail review required",
        );
      if (id === "A-05" || id === "A-06")
        warnings.push(
          "Projected vector edges; hidden-line / façade annotation review required",
        );
      for (const [i, w] of [...new Set(warnings)].slice(0, 3).entries())
        text([18, 235 + i * 5], w, 2.3, "#b45309", 375);
      const isLegalComplete = Boolean(
        project.legal_metadata?.deed_no &&
        project.legal_metadata?.signatories?.architect_license_no &&
        project.legal_metadata?.signatories?.structural_engineer_license_no
      );
      const isA01Missing = id === "A-01" && !isLegalComplete;
      const status: "draft" | "missing_data" | "issued" =
        isA01Missing || (!selected.length && id !== "A-01") || missingRequired
          ? "missing_data"
          : (project.legal_metadata?.signatories?.issue_approved ? "issued" : "draft");
      return {
        id,
        title,
        scale: `1:${viewport.scale_denominator}`,
        primitives,
        svg: primitivesToSvg(primitives),
        source_object_ids: [...sourceIds],
        warnings: [...new Set(warnings)],
        status,
        viewport,
      };
    },
  );
  const isApproved = Boolean(project.legal_metadata?.signatories?.issue_approved);
  const hasNoMissingSheets = !sheets.some((s) => s.status === "missing_data");
  const issue_ready = Boolean(
    isApproved &&
    hasNoMissingSheets &&
    project.legal_metadata?.deed_no &&
    project.legal_metadata?.signatories?.architect_license_no &&
    project.legal_metadata?.signatories?.structural_engineer_license_no
  );

  return {
    project_id: project.project.id,
    sheets,
    warnings: sheets.flatMap((s) => s.warnings.map((w) => `${s.id}: ${w}`)),
    issue_ready,
  };
}

export function renderPermitDrawingSetHtml(
  project: ProjectDocument,
  options: PermitOptions = {},
): string {
  const set = compilePermitDrawingSet(project, options);
  return `<!doctype html><html lang="th"><meta charset="utf-8"><title>ConstructFlow 20-sheet draft</title><style>@font-face{font-family:Sarabun;src:url('/fonts/Sarabun-Regular.ttf')}@page{size:A3 landscape;margin:0}body{margin:0;background:#e2e8f0;font-family:Sarabun,sans-serif}header{padding:16px;background:#0f172a;color:white}.sheet{width:420mm;height:297mm;background:white;margin:12px auto;break-after:page}.sheet:last-child{break-after:auto}.sheet svg{width:100%;height:100%}@media print{header{display:none}.sheet{margin:0}body{background:white}}</style><header>ชุดแบบร่าง 20 แผ่น - ต้องตรวจข้อมูลและลงนามก่อนออกแบบยื่นอนุญาต <button onclick="print()">Print</button></header>${set.sheets.map((s) => `<section class="sheet">${s.svg}</section>`).join("")}</html>`;
}
