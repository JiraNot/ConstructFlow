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
  status: "draft" | "missing_data";
  viewport: SheetViewport;
}
export interface PermitDrawingSet {
  project_id: string;
  sheets: PermitSheet[];
  warnings: string[];
  issue_ready: false;
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
const data = (o: SmartObject) => o.module_data as Record<string, unknown>;
const format = (v: unknown) =>
  typeof v === "number"
    ? Number.isInteger(v)
      ? String(v)
      : v.toFixed(3)
    : String(v ?? "");

export function primitivesToSvg(primitives: VectorPrimitive[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420mm" height="297mm" viewBox="0 0 420 297"><rect width="420" height="297" fill="white"/>${primitives.map((p) => (p.kind === "path" ? `<path d="${p.points.map((v, i) => `${i ? "L" : "M"}${v[0]} ${v[1]}`).join(" ")}${p.closed ? " Z" : ""}" fill="none" stroke="${p.color}" stroke-width="${p.width}"${p.dash ? ` stroke-dasharray="${p.dash.join(",")}"` : ""}/>` : `<text x="${p.at[0]}" y="${p.at[1]}" font-family="Sarabun,sans-serif" font-size="${p.size}" fill="${p.color}"${p.max_width ? ` textLength="${Math.min(p.max_width, p.text.length * p.size * 0.52)}" lengthAdjust="spacingAndGlyphs"` : ""}>${esc(p.text)}</text>`)).join("")}</svg>`;
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
      ) =>
        primitives.push({ kind: "path", points, color, width, dash, closed });
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
              belongs(o, ground) &&
              !f.startsWith("electrical.") &&
              !f.startsWith("drainage.") &&
              !f.startsWith("plumbing.") &&
              !f.startsWith("roof.")
            );
          case "A-03":
            return (
              belongs(o, upper) &&
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
              f === "electrical.led_run"
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
      text(
        [14, 283],
        "DRAFT - ต้องตรวจและลงนามโดยผู้ออกแบบก่อนออกแบบยื่นอนุญาต",
        2.6,
        "#b45309",
        245,
      );
      text(
        [275, 263],
        `Scale 1:${viewport.scale_denominator} | A3 420 x 297 mm`,
        2.6,
      );
      text(
        [275, 271],
        `Revision ${options.revision ?? "DRAFT"} | ${options.author ?? "ConstructFlow"}`,
        2.4,
        "#475569",
        85,
      );
      text([275, 282], project.project.id, 2.1, "#475569", 85);
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
        let y = at[1];
        for (const row of rows.slice(0, maxRows)) {
          let x = at[0];
          row.forEach((cell, i) => {
            path(
              [
                [x, y],
                [x + widths[i], y],
                [x + widths[i], y + rowH],
                [x, y + rowH],
              ],
              "#94a3b8",
              0.15,
              undefined,
              true,
            );
            text([x + 1.5, y + 4.7], cell, 2.3, "#0f172a", widths[i] - 3);
            x += widths[i];
          });
          y += rowH;
        }
        if (rows.length > maxRows)
          warnings.push(
            `Schedule overflow: ${rows.length - maxRows} rows need a continuation sheet; issue blocked`,
          );
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
          for (const { object: o, mesh, out } of objectsWithMesh) {
            const phase = getDisplayPhase(o),
              color = colors[phase],
              width = phase === "new_construction" ? 0.35 : 0.25,
              dash = phase === "demolition" ? [2, 1] : undefined,
              seen = new Set<string>();
            const edge = (a: Vec3, b: Vec3) => {
              const p = projectPoint(a),
                q = projectPoint(b),
                key = [p.join(","), q.join(",")].sort().join("|");
              if (seen.has(key) || Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-6)
                return;
              seen.add(key);
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
                  edge(intersections[0], intersections[1]);
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
          if (mode !== "xy")
            for (const level of levels) {
              const a = mapped([minX, level.elevation_mm]);
              if (a[1] >= view.y && a[1] <= view.y + view.h) {
                path(
                  [
                    [view.x, a[1]],
                    [view.x + view.w, a[1]],
                  ],
                  "#94a3b8",
                  0.15,
                  [2, 1],
                );
                text(
                  [view.x, a[1] - 1],
                  `${level.name} ${(level.elevation_mm / 1000).toFixed(3)} m`,
                  2.3,
                );
              }
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
          text([232, 42], "Single line diagram / NTS", 2.8);
          for (const [i, o] of circuits.slice(0, 5).entries()) {
            const d = resolvedData(project, o),
              out = outputs.find((v) => v.object_id === o.id),
              y = 52 + i * 25,
              panel = project.objects[String(d.panel_id)];
            text(
              [232, y],
              `${panel ? String(data(panel).mark) : "Panel"} -> ${d.mark}`,
              2.5,
            );
            path(
              [
                [234, y + 5],
                [260, y + 5],
                [262, y + 3],
                [265, y + 7],
                [268, y + 5],
                [384, y + 5],
              ],
              "#0f172a",
              0.3,
            );
            text(
              [232, y + 12],
              `${d.breaker_a} A | ${d.cable_mm2} mm2 | ${out?.schedule.Watts ?? "?"} W / ${d.voltage} V`,
              2.4,
            );
            text(
              [232, y + 18],
              (d.device_ids as string[])
                .map((id) => String(data(project.objects[id]).mark))
                .join(", "),
              2.3,
              "#475569",
              160,
            );
          }
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
      const status =
        id === "A-01" || !selected.length || missingRequired
          ? "missing_data"
          : "draft";
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
  return {
    project_id: project.project.id,
    sheets,
    warnings: sheets.flatMap((s) => s.warnings.map((w) => `${s.id}: ${w}`)),
    issue_ready: false,
  };
}

export function renderPermitDrawingSetHtml(
  project: ProjectDocument,
  options: PermitOptions = {},
): string {
  const set = compilePermitDrawingSet(project, options);
  return `<!doctype html><html lang="th"><meta charset="utf-8"><title>ConstructFlow 20-sheet draft</title><style>@font-face{font-family:Sarabun;src:url('/fonts/Sarabun-Regular.ttf')}@page{size:A3 landscape;margin:0}body{margin:0;background:#e2e8f0;font-family:Sarabun,sans-serif}header{padding:16px;background:#0f172a;color:white}.sheet{width:420mm;height:297mm;background:white;margin:12px auto;break-after:page}.sheet:last-child{break-after:auto}.sheet svg{width:100%;height:100%}@media print{header{display:none}.sheet{margin:0}body{background:white}}</style><header>ชุดแบบร่าง 20 แผ่น - ต้องตรวจข้อมูลและลงนามก่อนออกแบบยื่นอนุญาต <button onclick="print()">Print</button></header>${set.sheets.map((s) => `<section class="sheet">${s.svg}</section>`).join("")}</html>`;
}
