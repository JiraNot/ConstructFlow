import {
  getDisplayPhase,
  validateDrawingSettings,
  resolveCatalogType,
  resolveOpeningPlanSymbolX,
  resolveOpeningPlanSymbolY,
  resolveOpeningVerticalExtent,
  resolveArchitectureSurfaceElevation,
  isMasonryWallPlanHatch,
  type ProjectDocument,
  type SmartObject,
  type OpeningViewOverride,
  type DimensionViewOverride,
} from "@constructflow/project-model";
import { constructionOutputs } from "@constructflow/domain-providers";
import { resolveArchitecturalFloorPatternKind } from "@constructflow/architecture-engine";
import { buildProjectRepresentations3D, getElevationVisibleOpeningIds, getOpeningElevationLinework, getRepresentationTriangles, getVisibleElevationMeshEdges, isWallFacadeForElevation, resolveCeilingGridStyle, resolveElevationWallPhaseStyle, resolvePlanPhaseStyle } from "@constructflow/representation-engine";
import {
  type Vec2,
  type Vec3,
  type Triangle,
  clippedGridSegments,
  clippedStaggeredPlankSegments,
  polygonDiagonalHatchSegments,
  polygonSectionIntervals,
  wallMasonryHatchSegments,
  clippedCarpetSegments,
  clippedTerrazzoSegments
} from "@constructflow/geometry-kernel";
import { polygonInteriorPoint } from "@constructflow/geometry-kernel";
import { calculateBBS } from "@constructflow/structure-engine";
import { resolvedData } from "@constructflow/module-sdk";
import {
  recommendEITBreakerAndWire,
  balanceCircuitsPhase,
} from "@constructflow/electrical-engine";
import { evaluateRoomVentilationCompliance } from "@constructflow/clash-engine";

export const PERMIT_INDEX = [
  ["A-01", "ผังบริเวณ / Site & project information", 200],
  ["A-02", "แปลนชั้นล่าง / Phased ground plan", 100],
  ["A-03", "แปลนชั้นบน / Upper level plan", 100],
  ["A-04", "แปลนหลังคา / Roof & drainage", 100],
  // Each elevation occupies half an A3 sheet. Start at 1:50; the compiler
  // selects a smaller standard scale when the model does not fit.
  ["A-05", "รูปด้านเหนือและตะวันออก / North & east", 50],
  ["A-06", "รูปด้านใต้และตะวันตก / South & west", 50],
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
/** Dynamic level sheets use IDs such as A-02-L3 and S-02-L3. */
export type PermitSheetId = string;
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
      dimension_id?: string;
    };
export interface SheetViewport {
  scale_denominator: number;
  level_id?: string;
  center_mm?: Vec2;
  crop_bounds_mm?: [number, number, number, number];
  section_cut_mm?: number;
  opening_overrides?: Record<string, OpeningViewOverride>;
  dimension_overrides?: Record<string, DimensionViewOverride>;
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
function compilePermitDrawingSetBase(
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
      // A base-level datum owns a wall/opening in plan; its top-level reference
      // controls height and must not make the same wall appear on both floors.
      (!data(o).level_id && !data(o).base_level_id &&
        o.level_refs.some((r) => r.role !== 'top_level' && r.level_id === id)));
  const triangles = (id: string): Triangle[] => {
    const r = representations.find((v) => v.object_id === id);
    return r ? getRepresentationTriangles(r) : [];
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
      let viewport = options.viewports?.[id] ?? {
        scale_denominator: defaultScale,
      };
      const hasExplicitViewportScale = options.viewports?.[id]?.scale_denominator !== undefined;
      const planLevelId = id === 'A-02' || id === 'S-02'
        ? (viewport.level_id ?? ground)
        : id === 'A-03' || id === 'S-03'
          ? (viewport.level_id ?? upper)
          : id === 'A-10'
            ? (viewport.level_id ?? project.project.active_level_id ?? ground)
          : undefined;
      const displayTitle = id === "A-10" && planLevelId
        ? `${title} · ${project.levels.find(level => level.id === planLevelId)?.name ?? planLevelId}`
        : title;
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
              (belongs(o, planLevelId) || f === "architecture.stair") &&
              f !== "structure.foundation" &&
              f !== "architecture.bathroom" &&
              !f.startsWith("decorative.") &&
              !f.startsWith("electrical.") &&
              !f.startsWith("drainage.") &&
              !f.startsWith("plumbing.") &&
              !f.startsWith("roof.")
            );
          case "A-03":
            return (
              (belongs(o, planLevelId) || f === "architecture.stair") &&
              f !== "structure.foundation" &&
              f !== "architecture.bathroom" &&
              !f.startsWith("decorative.") &&
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
              belongs(o, planLevelId) &&
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
              belongs(o, planLevelId) &&
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
            const finishObject = (
              f.startsWith("decorative.") ||
              f.startsWith("interior.") ||
              f === "electrical.led_run" ||
              f === "electrical.fixture" ||
              f === "architecture.wall" ||
              f === "architecture.room" ||
              f === "architecture.floor" ||
              f === "architecture.ceiling"
            );
            const hasLevelReference =
              typeof d.level_id === "string" ||
              typeof d.base_level_id === "string" ||
              o.level_refs.some((ref) => ref.role !== "top_level");
            return finishObject && (!hasLevelReference || belongs(o, planLevelId));
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
      if (!hasExplicitViewportScale && (id === "A-02" || id === "A-03")) {
        const planPoints = selected.flatMap((object) => {
          const boundary = data(object).boundary_mm as Vec2[] | undefined;
          return [
            ...triangles(object.id).flat().map(([x, y]) => [x, y] as Vec2),
            ...(boundary ?? []),
            ...(object.object_type === "architecture.wall"
              ? [data(object).start_point_mm, data(object).end_point_mm].filter((point): point is Vec2 => Array.isArray(point) && point.length >= 2)
              : []),
          ];
        });
        if (planPoints.length) {
          const xs = planPoints.map(([x]) => x);
          const ys = planPoints.map(([, y]) => y);
          const requiredDenominator = Math.max(
            (Math.max(...xs) - Math.min(...xs)) / (375 * 0.96),
            (Math.max(...ys) - Math.min(...ys)) / (138 * 0.96),
          );
          const fittedScale = [20, 25, 50, 100, 200, 500].find(
            (denominator) => denominator >= requiredDenominator,
          );
          if (fittedScale) viewport = { ...viewport, scale_denominator: fittedScale };
        }
      }
      if (!hasExplicitViewportScale && (id === "A-05" || id === "A-06")) {
        const elevationPoints = selected
          .filter((object) => object.object_type !== "structure.foundation")
          .flatMap((object) => triangles(object.id).flat());
        if (elevationPoints.length) {
          const xs = elevationPoints.map((point) => point[0]);
          const ys = elevationPoints.map((point) => point[1]);
          const zs = elevationPoints.map((point) => point[2]);
          // Both elevations share a half-sheet viewport (180 × 138 mm). Pick
          // the largest standard scale that keeps the whole building inside
          // it, with room for dimensions and level leaders.
          const requiredDenominator = Math.max(
            (Math.max(...xs) - Math.min(...xs)) / (180 * 0.84),
            (Math.max(...ys) - Math.min(...ys)) / (180 * 0.84),
            (Math.max(...zs) - Math.min(...zs)) / (138 * 0.82),
          );
          const fittedScale = [20, 25, 50, 100, 200, 500].find(
            (denominator) => denominator >= requiredDenominator,
          );
          if (fittedScale) viewport = { ...viewport, scale_denominator: fittedScale };
        }
      }
      if (!hasExplicitViewportScale && id === "A-10") {
        const planPoints = selected.flatMap((object) => {
          const boundary = data(object).boundary_mm as Vec2[] | undefined;
          return [
            ...triangles(object.id).flat().map(([x, y]) => [x, y] as Vec2),
            ...(boundary ?? []),
          ];
        });
        if (planPoints.length) {
          const xs = planPoints.map(([x]) => x);
          const ys = planPoints.map(([, y]) => y);
          const requiredDenominator = Math.max(
            (Math.max(...xs) - Math.min(...xs)) / (180 * 0.84),
            (Math.max(...ys) - Math.min(...ys)) / (138 * 0.82),
          );
          const fittedScale = [20, 25, 50, 100, 200, 500].find(
            (denominator) => denominator >= requiredDenominator,
          );
          if (fittedScale) viewport = { ...viewport, scale_denominator: fittedScale };
        }
      }
      text(
        [275, 263],
        `Scale 1:${viewport.scale_denominator} | A3 420 x 297 mm`,
        2.6,
      );
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
      text([14, 22], displayTitle, 3.5, "#0f172a", 370);
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
          const items = [...unique.values()].slice(0, 5);
          const startX = 20;
          const startY = 135;
          const cardWidth = 72;
          const cardHeight = 100;

          text([startX, startY - 4], "แบบขยายฐานรากและเสา (FOOTING & COLUMN SCHEDULE DETAILS) · มาตราส่วน 1:25", 2.8, "#0f172a");

          for (const [i, o] of items.entries()) {
            const d = resolvedData(project, o);
            const isColumn = o.object_type === "structure.column";
            const isFooting = o.object_type === "structure.foundation";
            const mark = String(d.mark ?? (isColumn ? "C1" : "F1"));
            const s = (d.section_mm ?? d.size_mm ?? [200, 200, 300]) as number[];
            const cardX = startX + i * (cardWidth + 4);
            const cardY = startY;

            // Card container outline
            path(
              [
                [cardX, cardY],
                [cardX + cardWidth, cardY],
                [cardX + cardWidth, cardY + cardHeight],
                [cardX, cardY + cardHeight],
              ],
              "#cbd5e1",
              0.25,
              undefined,
              true,
              "#ffffff",
            );
            // Header banner
            path(
              [
                [cardX, cardY],
                [cardX + cardWidth, cardY],
                [cardX + cardWidth, cardY + 12],
                [cardX, cardY + 12],
              ],
              "#0284c7",
              0.25,
              undefined,
              true,
              "#f0f9ff",
            );
            text([cardX + 3, cardY + 5], `${isColumn ? "เสา" : "ฐานราก"} ${mark}`, 3.2, "#0369a1");
            const dimText = isColumn
              ? `${(s[0] / 1000).toFixed(2)} × ${(s[1] / 1000).toFixed(2)} m`
              : `${(s[0] / 1000).toFixed(2)} × ${(s[1] / 1000).toFixed(2)} × ${(s[2] / 1000).toFixed(2)} m`;
            text([cardX + 3, cardY + 10], dimText, 2.3, "#64748b");

            if (isColumn) {
              // Draw Column Section
              const isSteel = String(d.material).includes("steel") || mark.startsWith("SC");
              const boxW = Math.min(35, Math.max(20, s[0] / 10));
              const boxH = Math.min(35, Math.max(20, s[1] / 10));
              const cx = cardX + (cardWidth - boxW) / 2;
              const cy = cardY + 18 + (40 - boxH) / 2;

              if (isSteel) {
                // Steel H-Beam or Box
                path([[cx, cy], [cx + boxW, cy], [cx + boxW, cy + boxH], [cx, cy + boxH]], "#0284c7", 0.5, undefined, true, "#e0f2fe");
                text([cardX + 4, cardY + 68], `เสาเหล็ก ${mark} (Steel Column)`, 2.4, "#0f172a");
                text([cardX + 4, cardY + 74], `มอก. 107/1227 TIS Standard`, 2.2, "#475569");
                text([cardX + 4, cardY + 80], `หน้าตัด: ${s[0]}×${s[1]} mm`, 2.2, "#475569");
              } else {
                // Concrete column outer
                path([[cx, cy], [cx + boxW, cy], [cx + boxW, cy + boxH], [cx, cy + boxH]], "#0f172a", 0.35, undefined, true, "#f8fafc");
                // Inner tie
                const tiePad = 3;
                path([[cx + tiePad, cy + tiePad], [cx + boxW - tiePad, cy + tiePad], [cx + boxW - tiePad, cy + boxH - tiePad], [cx + tiePad, cy + boxH - tiePad]], "#475569", 0.25, undefined, true);
                // 4 Corner main bars
                const r = 1.0;
                for (const [bx, by] of [
                  [cx + tiePad + 1, cy + tiePad + 1],
                  [cx + boxW - tiePad - 1, cy + tiePad + 1],
                  [cx + boxW - tiePad - 1, cy + boxH - tiePad - 1],
                  [cx + tiePad + 1, cy + boxH - tiePad - 1],
                ]) {
                  path([[bx - r, by - r], [bx + r, by - r], [bx + r, by + r], [bx - r, by + r]], "#0f172a", 0.2, undefined, true, "#0f172a");
                }
                text([cardX + 4, cardY + 68], `เสา คสล. ${mark} (RC Column)`, 2.4, "#0f172a");
                text([cardX + 4, cardY + 74], `เหล็กยืน: 4-DB16 (SD40)`, 2.2, "#475569");
                text([cardX + 4, cardY + 80], `ปลอก: RB6 @ 0.15 ม.`, 2.2, "#475569");
                text([cardX + 4, cardY + 86], `คอนกรีต: 240 ksc cylinder`, 2.0, "#64748b");
              }
            } else if (isFooting) {
              // Draw Footing Plan
              const isEccentric = d.foundation_type === "eccentric_footing" || Boolean(d.eccentric_offset_mm);
              const isPileCap = d.foundation_type === "pile_cap";
              const boxW = Math.min(45, Math.max(30, s[0] / 25));
              const boxH = Math.min(45, Math.max(30, s[1] / 25));
              const cx = cardX + (cardWidth - boxW) / 2;
              const cy = cardY + 16 + (45 - boxH) / 2;

              // Footing outline
              path([[cx, cy], [cx + boxW, cy], [cx + boxW, cy + boxH], [cx, cy + boxH]], "#0f172a", 0.35, undefined, true, "#f8fafc");

              // Column stub position: centered or offset for eccentric footing
              const colW = 8;
              const colH = 8;
              const colX = isEccentric ? cx + 2 : cx + (boxW - colW) / 2;
              const colY = isEccentric ? cy + 2 : cy + (boxH - colH) / 2;
              path([[colX, colY], [colX + colW, colY], [colX + colW, colY + colH], [colX, colY + colH]], "#0f172a", 0.3, undefined, true, "#cbd5e1");

              // Rebar mesh indications (dashed lines)
              path([[cx + 4, cy + boxH / 2], [cx + boxW - 4, cy + boxH / 2]], "#94a3b8", 0.2, [2, 2]);
              path([[cx + boxW / 2, cy + 4], [cx + boxW / 2, cy + boxH - 4]], "#94a3b8", 0.2, [2, 2]);

              if (isPileCap && Array.isArray(d.pile_offsets_mm) && d.pile_offsets_mm.length) {
                // Micro-pile positions
                for (const off of d.pile_offsets_mm as [number, number][]) {
                  const px = cx + boxW / 2 + (off[0] / 25);
                  const py = cy + boxH / 2 + (off[1] / 25);
                  path([[px - 1.5, py], [px + 1.5, py]], "#ef4444", 0.3);
                  path([[px, py - 1.5], [px, py + 1.5]], "#ef4444", 0.3);
                }
              }

              if (isEccentric) {
                // Strap beam arrow
                path([[colX + colW, colY + colH / 2], [cardX + cardWidth - 6, colY + colH / 2]], "#0284c7", 0.4);
                text([cardX + 4, cardY + 68], `ฐานรากตีนเป็ดชิดเขต (${mark})`, 2.4, "#0f172a");
                text([cardX + 4, cardY + 74], `คานดึงรั้ง (Strap Beam) เชื่อมเข้าใน`, 2.2, "#0284c7");
                text([cardX + 4, cardY + 80], `เหล็กตะกร้อ: DB12 @ 0.15 ม.`, 2.2, "#475569");
                text([cardX + 4, cardY + 86], `ต้านโมเมนต์พลิกคว่ำ (Overturning)`, 2.0, "#64748b");
              } else {
                text([cardX + 4, cardY + 68], `${isPileCap ? "ฐานรากเสาเข็ม" : "ฐานรากแผ่"} ${mark}`, 2.4, "#0f172a");
                text([cardX + 4, cardY + 74], `เหล็กล่าง: DB12 @ 0.15 ม. 2 ทาง`, 2.2, "#475569");
                text([cardX + 4, cardY + 80], `ความหนาฐานราก: ${s[2] ?? 350} mm`, 2.2, "#475569");
                text([cardX + 4, cardY + 86], `${isPileCap ? (d.pile_type ?? "เข็มไมโครไพล์") : "รับน้ำหนักดินปลอดภัย >= 8 t/m²"}`, 2.0, "#64748b");
              }
            }
          }
        }
        if (id === "S-06" && rows.length <= 12) {
          const uniqueBeams = new Map<string, SmartObject>();
          for (const o of selected.filter(b => b.object_type === "structure.beam")) {
            const d = data(o);
            uniqueBeams.set(String(d.type_id ?? d.mark), o);
          }
          const beams = [...uniqueBeams.values()].slice(0, 2);
          const startX = 20;
          const startY = 88;
          const cardWidth = 182;
          const cardHeight = 150;

          text([startX, startY - 4], "แบบขยายคานและไดอะแกรมการเสริมเหล็ก 3 ตอน (BEAM DETAILS & 3-SECTION SCHEDULE) · มาตราส่วน 1:25", 2.8, "#0f172a");

          for (const [cardIndex, o] of beams.entries()) {
            const d = data(o);
            const mark = String(d.mark ?? "B1");
            const t = resolveCatalogType(project, o.object_type, String(d.type_id ?? d.mark));
            const section = (d.section_mm ?? t?.parameters.section_mm ?? [200, 400]) as number[];
            const widthMm = Number(section[0] ?? 200);
            const depthMm = Number(section[1] ?? 400);
            const spanM = Number((Number(d.span_mm ?? 4000) / 1000).toFixed(2));
            const isCantilever = d.beam_system === "cantilever" || mark.toLowerCase().startsWith("c-") || mark.toLowerCase().startsWith("cb");
            const isContinuous = d.beam_system === "continuous" || Boolean(d.middle_support_column_id) || spanM >= 6.0;
            const hasSkinRebar = depthMm >= 500 || d.skin_rebar_required === true;

            const cardX = startX + cardIndex * (cardWidth + 8);
            const cardY = startY;

            // 1. Card container outline
            path(
              [
                [cardX, cardY],
                [cardX + cardWidth, cardY],
                [cardX + cardWidth, cardY + cardHeight],
                [cardX, cardY + cardHeight],
              ],
              "#cbd5e1",
              0.25,
              undefined,
              true,
              "#ffffff",
            );

            // 2. Card Header Banner
            path(
              [
                [cardX, cardY],
                [cardX + cardWidth, cardY],
                [cardX + cardWidth, cardY + 12],
                [cardX, cardY + 12],
              ],
              "#0284c7",
              0.25,
              undefined,
              true,
              "#f0f9ff",
            );
            const systemDesc = isCantilever
              ? "คานยื่น (Cantilever Beam)"
              : isContinuous
                ? `คานต่อเนื่องช่วงยาว ${spanM.toFixed(2)} ม. (Middle Support)`
                : `คานช่วงเดียวสแปน ${spanM.toFixed(2)} ม.`;
            text([cardX + 3, cardY + 5], `แบบขยายคาน ${mark} (${widthMm} × ${depthMm} mm) · ${systemDesc}`, 3.0, "#0369a1");
            text([cardX + 3, cardY + 10], `ระยะฝาก/ทาบ 40db · คอนกรีต 240 ksc · เหล็กข้ออ้อย SD40 / เหล็กกลม RB6-RB9 SR24`, 2.2, "#64748b");

            // 3. Longitudinal Elevation Diagram (รูปตัดตามยาว L-Section)
            const elevX = cardX + 10;
            const elevY = cardY + 18;
            const elevW = 162;
            const elevH = 20;

            // Longitudinal Concrete outline
            path([[elevX, elevY], [elevX + elevW, elevY], [elevX + elevW, elevY + elevH], [elevX, elevY + elevH]], "#0f172a", 0.4, undefined, true, "#f8fafc");

            // Column supports
            const colW = 8;
            const colH = 12;
            // Left column
            path([[elevX, elevY + elevH], [elevX + colW, elevY + elevH], [elevX + colW, elevY + elevH + colH], [elevX, elevY + elevH + colH]], "#94a3b8", 0.3, undefined, true, "#e2e8f0");
            text([elevX + 1, elevY + elevH + 8], "เสา 1", 2.0, "#475569");

            if (isContinuous) {
              // Middle column support
              const midColX = elevX + (elevW - colW) / 2;
              path([[midColX, elevY + elevH], [midColX + colW, elevY + elevH], [midColX + colW, elevY + elevH + colH], [midColX, elevY + elevH + colH]], "#0284c7", 0.3, undefined, true, "#e0f2fe");
              text([midColX - 3, elevY + elevH + 8], "เสากลาง", 2.0, "#0369a1");
            }

            if (!isCantilever) {
              // Right column
              path([[elevX + elevW - colW, elevY + elevH], [elevX + elevW, elevY + elevH], [elevX + elevW, elevY + elevH + colH], [elevX + elevW - colW, elevY + elevH + colH]], "#94a3b8", 0.3, undefined, true, "#e2e8f0");
              text([elevX + elevW - colW + 1, elevY + elevH + 8], "เสา 2", 2.0, "#475569");
            } else {
              // Cantilever tip mark
              text([elevX + elevW - 14, elevY + elevH + 5], "ปลายคานยื่น", 2.0, "#ef4444");
            }

            // Longitudinal Rebars:
            // Top Main: line from left hook to right hook
            const topY = elevY + 3;
            const botY = elevY + elevH - 3;
            path([[elevX + 2, topY + 4], [elevX + 2, topY], [elevX + elevW - 2, topY], [elevX + elevW - 2, isCantilever ? topY + 6 : topY + 4]], "#0f172a", 0.45);

            // Top Extra Rebar (เหล็กเสริมพิเศษบน):
            const topExtraY = elevY + 5;
            if (isCantilever) {
              // Top tension bar runs across full cantilever
              path([[elevX + 2, topExtraY + 4], [elevX + 2, topExtraY], [elevX + elevW - 4, topExtraY], [elevX + elevW - 4, topExtraY + 5]], "#ef4444", 0.4);
              text([elevX + 15, topExtraY - 1.5], "เหล็กรับแรงดึงหลัก 4-DB20 วิ่งตลอดช่วงคานยื่น", 2.0, "#ef4444");
            } else if (isContinuous) {
              // Support 1 extra (L/3)
              path([[elevX + 2, topExtraY + 3], [elevX + 2, topExtraY], [elevX + 45, topExtraY]], "#0284c7", 0.35);
              // Middle support extra (0.35L to 0.65L)
              const midStart = elevX + (elevW * 0.35);
              const midEnd = elevX + (elevW * 0.65);
              path([[midStart, topExtraY], [midEnd, topExtraY]], "#0284c7", 0.4);
              text([midStart + 5, topExtraY - 1.5], "เสริมพิเศษบนเสากลาง 2-DB16", 2.0, "#0284c7");
              // Support 2 extra (L/3)
              path([[elevX + elevW - 45, topExtraY], [elevX + elevW - 2, topExtraY], [elevX + elevW - 2, topExtraY + 3]], "#0284c7", 0.35);
            } else {
              // Simple span extra on ends (L/4)
              path([[elevX + 2, topExtraY + 3], [elevX + 2, topExtraY], [elevX + 35, topExtraY]], "#0284c7", 0.35);
              path([[elevX + elevW - 35, topExtraY], [elevX + elevW - 2, topExtraY], [elevX + elevW - 2, topExtraY + 3]], "#0284c7", 0.35);
            }

            // Bottom Main: line from left hook to right hook
            path([[elevX + 2, botY - 4], [elevX + 2, botY], [elevX + elevW - 2, botY], [elevX + elevW - 2, botY - 4]], "#0f172a", 0.45);

            // Bottom Extra Rebar (เหล็กเสริมพิเศษล่างกลางคาน):
            const botExtraY = elevY + elevH - 5;
            if (!isCantilever) {
              const bStart = elevX + (elevW * 0.18);
              const bEnd = elevX + (elevW * 0.82);
              path([[bStart, botExtraY], [bEnd, botExtraY]], "#047857", 0.4);
              text([bStart + 10, botExtraY + 3.5], spanM >= 6.0 ? "เสริมพิเศษล่างกลางคาน 2-DB20 (สแปน 7 ม.)" : "เสริมพิเศษล่างกลางคาน 1-DB16", 2.0, "#047857");
            }

            // Side Skin Rebar (เหล็กข้างคาน / Skin reinforcement สำหรับคาน D >= 500 mm เช่น 25x60)
            if (hasSkinRebar) {
              const midSkinY = elevY + elevH / 2;
              path([[elevX + 2, midSkinY], [elevX + elevW - 2, midSkinY]], "#b45309", 0.3, [3, 2]);
              text([elevX + 35, midSkinY - 1.5], "เหล็กข้างคาน 2-DB12 (D >= 500 มม. ป้องกันรอยร้าวข้างคาน)", 2.0, "#b45309");
            }

            // Stirrup zone ticks & labels
            const zoneY = elevY + elevH + 16;
            const quarterW = elevW / 4;
            path([[elevX, zoneY], [elevX + elevW, zoneY]], "#64748b", 0.2);
            path([[elevX, zoneY - 2], [elevX, zoneY + 2]], "#64748b", 0.2);
            path([[elevX + quarterW, zoneY - 2], [elevX + quarterW, zoneY + 2]], "#64748b", 0.2);
            path([[elevX + elevW - quarterW, zoneY - 2], [elevX + elevW - quarterW, zoneY + 2]], "#64748b", 0.2);
            path([[elevX + elevW, zoneY - 2], [elevX + elevW, zoneY + 2]], "#64748b", 0.2);
            text([elevX + 4, zoneY + 4], "Zone 1 (ปลอกถี่ @0.10)", 2.0, "#475569");
            text([elevX + quarterW + 10, zoneY + 4], "Zone 2 (ปลอก @0.20)", 2.0, "#475569");
            text([elevX + elevW - quarterW + 4, zoneY + 4], "Zone 3 (ปลอกถี่ @0.10)", 2.0, "#475569");

            // 4. Three Detailed Cross Sections (รูปตัดขวาง 3 ตอน)
            const secBaseY = cardY + 68;
            const secW = 28;
            const secH = depthMm >= 500 ? 46 : 38;
            const secStartX = cardX + 12;
            const secGap = 52;

            const sectionsInfo = [
              {
                num: "1-1",
                locTitle: "หัวคาน (Support 1)",
                topBars: spanM >= 6.0 ? "2-DB20 + พิเศษ 2-DB16" : isCantilever ? "4-DB20 (ดึงหลัก)" : "2-DB16 + พิเศษ 1-DB16",
                botBars: spanM >= 6.0 ? "2-DB20" : isCantilever ? "2-DB12 (ประกอบ)" : "2-DB16",
                stirrup: "RB6 @ 0.10 ม.",
                topCount: spanM >= 6.0 ? 4 : isCantilever ? 4 : 3,
                botCount: 2,
              },
              {
                num: "2-2",
                locTitle: "กลางคาน (Mid-Span)",
                topBars: spanM >= 6.0 ? "2-DB20" : isCantilever ? "4-DB20" : "2-DB16",
                botBars: spanM >= 6.0 ? "2-DB20 + พิเศษ 2-DB20" : isCantilever ? "2-DB12" : "2-DB16 + พิเศษ 1-DB16",
                stirrup: isCantilever ? "RB6 @ 0.10 ม." : "RB6 @ 0.20 ม.",
                topCount: isCantilever ? 4 : 2,
                botCount: spanM >= 6.0 ? 4 : isCantilever ? 2 : 3,
              },
              {
                num: "3-3",
                locTitle: isCantilever ? "ปลายคานยื่น (Tip)" : isContinuous ? "เสากลาง (Middle Sup.)" : "ท้ายคาน (Support 2)",
                topBars: isCantilever ? "4-DB20 (ล้วงฝาก)" : spanM >= 6.0 ? "2-DB20 + พิเศษ 2-DB16" : "2-DB16 + พิเศษ 1-DB16",
                botBars: isCantilever ? "2-DB12" : spanM >= 6.0 ? "2-DB20" : "2-DB16",
                stirrup: "RB6 @ 0.10 ม.",
                topCount: spanM >= 6.0 ? 4 : isCantilever ? 4 : 3,
                botCount: 2,
              },
            ];

            for (const [secIdx, sInfo] of sectionsInfo.entries()) {
              const sx = secStartX + secIdx * secGap;
              const sy = secBaseY;

              // Outer concrete box
              path([[sx, sy], [sx + secW, sy], [sx + secW, sy + secH], [sx, sy + secH]], "#0f172a", 0.35, undefined, true, "#f8fafc");

              // Inner stirrup box
              const pad = 2.5;
              path([[sx + pad, sy + pad], [sx + secW - pad, sy + pad], [sx + secW - pad, sy + secH - pad], [sx + pad, sy + secH - pad]], "#475569", 0.25, undefined, true);

              // Top rebar dots
              const topDotY = sy + pad + 1.2;
              for (let k = 0; k < sInfo.topCount; k++) {
                const dotX = sx + pad + 1.2 + ((secW - 2 * pad - 2.4) * (sInfo.topCount === 1 ? 0.5 : k / (sInfo.topCount - 1)));
                path([[dotX - 0.7, topDotY - 0.7], [dotX + 0.7, topDotY - 0.7], [dotX + 0.7, topDotY + 0.7], [dotX - 0.7, topDotY + 0.7]], "#0f172a", 0.2, undefined, true, "#0f172a");
              }

              // Bottom rebar dots
              const botDotY = sy + secH - pad - 1.2;
              for (let k = 0; k < sInfo.botCount; k++) {
                const dotX = sx + pad + 1.2 + ((secW - 2 * pad - 2.4) * (sInfo.botCount === 1 ? 0.5 : k / (sInfo.botCount - 1)));
                path([[dotX - 0.7, botDotY - 0.7], [dotX + 0.7, botDotY - 0.7], [dotX + 0.7, botDotY + 0.7], [dotX - 0.7, botDotY + 0.7]], "#0f172a", 0.2, undefined, true, "#0f172a");
              }

              // Side Skin rebar dots (if deep beam >= 500mm e.g. 250x600)
              if (hasSkinRebar) {
                const midDotY = sy + secH / 2;
                const leftDotX = sx + pad + 1.2;
                const rightDotX = sx + secW - pad - 1.2;
                path([[leftDotX - 0.6, midDotY - 0.6], [leftDotX + 0.6, midDotY - 0.6], [leftDotX + 0.6, midDotY + 0.6], [leftDotX - 0.6, midDotY + 0.6]], "#b45309", 0.2, undefined, true, "#b45309");
                path([[rightDotX - 0.6, midDotY - 0.6], [rightDotX + 0.6, midDotY - 0.6], [rightDotX + 0.6, midDotY + 0.6], [rightDotX - 0.6, midDotY + 0.6]], "#b45309", 0.2, undefined, true, "#b45309");
              }

              // Section Titles and Specifications below
              text([sx - 2, sy + secH + 4], `รูปตัด ${sInfo.num} : ${sInfo.locTitle}`, 2.2, "#0369a1");
              text([sx - 2, sy + secH + 8], `บน: ${sInfo.topBars}`, 1.9, "#0f172a");
              text([sx - 2, sy + secH + 12], `ล่าง: ${sInfo.botBars}`, 1.9, "#0f172a");
              if (hasSkinRebar) {
                text([sx - 2, sy + secH + 16], `ข้าง: 2-DB12 (Skin)`, 1.8, "#b45309");
                text([sx - 2, sy + secH + 20], `ปลอก: ${sInfo.stirrup}`, 1.8, "#475569");
              } else {
                text([sx - 2, sy + secH + 16], `ปลอก: ${sInfo.stirrup}`, 1.8, "#475569");
              }
            }
          }
        }
        if (id === "A-08" && rows.length <= 12) {
          const unique = new Map<string, SmartObject>();
          for (const o of selected)
            unique.set(String(data(o).type_id ?? data(o).mark), o);

          const items = [...unique.values()];
          const maxOpeningCards = items.length <= 4 ? items.length : 4;
          const displayItems = items.slice(0, maxOpeningCards);
          const cardWidth = 59;
          const cardHeight = 115;
          const startX = 20;
          const startY = 145;

          text([startX, startY - 4], "แบบขยายประตูและหน้าต่าง (TYPE ELEVATIONS & SCHEDULE DETAILS) · มาตราส่วน 1:50", 2.8, "#0f172a");

          for (const [i, o] of displayItems.entries()) {
            const d = data(o);
            const mark = String(d.mark ?? "D1");
            const isDoor = o.object_type === "door_window.door";
            const count = selected.filter(item => String(data(item).type_id ?? data(item).mark) === String(d.type_id ?? d.mark)).length;
            const t = resolveCatalogType(project, o.object_type, String(d.type_id ?? d.mark));
            const over = d.instance_overrides as Record<string, unknown> | undefined;
            const rawW = Number(over?.width_mm ?? d.width_mm ?? t?.parameters.width_mm ?? 900);
            const rawH = Number(over?.height_mm ?? d.height_mm ?? t?.parameters.height_mm ?? 2000);
            const sillMm = Number(over?.sill_height_mm ?? d.sill_height_mm ?? (isDoor ? 0 : 900));

            const cardX = startX + i * (cardWidth + 4);
            const cardY = startY;

            // 1. Card container outline
            path(
              [
                [cardX, cardY],
                [cardX + cardWidth, cardY],
                [cardX + cardWidth, cardY + cardHeight],
                [cardX, cardY + cardHeight],
              ],
              "#cbd5e1",
              0.25,
              undefined,
              true,
              "#ffffff",
            );

            // Card Header Banner
            path(
              [
                [cardX, cardY],
                [cardX + cardWidth, cardY],
                [cardX + cardWidth, cardY + 9],
                [cardX, cardY + 9],
              ],
              "#e2e8f0",
              0.2,
              undefined,
              true,
              "#f1f5f9",
            );
            text([cardX + 2.5, cardY + 6.2], `[ ${mark} ]  ${isDoor ? "ประตู" : "หน้าต่าง"}`, 2.5, "#0f172a");
            text([cardX + cardWidth - 16, cardY + 6.2], `จำนวน ${count} บาน`, 2.0, "#475569");

            // 2. Elevation Drawing Sub-Box
            const drawBoxX = cardX + 3.5;
            const drawBoxY = cardY + 12;
            const drawBoxW = cardWidth - 7;
            const drawBoxH = 50;

            path(
              [
                [drawBoxX, drawBoxY],
                [drawBoxX + drawBoxW, drawBoxY],
                [drawBoxX + drawBoxW, drawBoxY + drawBoxH],
                [drawBoxX, drawBoxY + drawBoxH],
              ],
              "#e2e8f0",
              0.15,
              undefined,
              true,
              "#fafafa",
            );

            // Elevation Linework via Constraint Engine
            const shape = representations.find(r => r.object_id === o.id)?.shape;
            if (shape?.kind === "opening") {
              const lineworks = getOpeningElevationLinework(shape, { show_operation_indicator: true });
              const scale = Math.min((drawBoxW * 0.72) / rawW, (drawBoxH * 0.75) / rawH);
              const dw = rawW * scale;
              const dh = rawH * scale;
              const originX = drawBoxX + (drawBoxW - dw) / 2;
              const originY = drawBoxY + drawBoxH - 6;

              // Ground / Sill reference line
              path(
                [
                  [originX - 3, originY],
                  [originX + dw + 3, originY],
                ],
                "#94a3b8",
                0.3,
                [2, 1],
              );

              for (const lw of lineworks) {
                const pts: Vec2[] = lw.points_mm.map(([lx, lz]) => [
                  originX + lx * scale,
                  originY - lz * scale,
                ]);
                path(pts, "#0f172a", Math.max(0.15, lw.line_width_mm * 0.6), undefined, lw.closed, lw.fill);
              }

              // Dimension text
              text(
                [originX + dw / 2 - 5, originY + 4],
                `${(rawW / 1000).toFixed(2)} ม.`,
                1.9,
                "#1e293b",
              );
              text(
                [originX + dw + 1.5, originY - dh / 2],
                `${(rawH / 1000).toFixed(2)} ม.`,
                1.9,
                "#1e293b",
              );
              text(
                [drawBoxX + 1.5, originY - 1.5],
                sillMm === 0 ? "±0.00" : `+${(sillMm / 1000).toFixed(2)}`,
                1.7,
                "#64748b",
              );
            }

            // 3. Specification rows inside the card
            const specY = cardY + 65;
            const specRows = [
              ["ขนาดช่องเปิด", `${(rawW / 1000).toFixed(2)} × ${(rawH / 1000).toFixed(2)} ม.`],
              ["วงกบ (Frame)", isDoor ? (d.frame_material === "wood" ? "ไม้เนื้อแข็ง 2\"x4\"" : "อลูมิเนียม 1.5มม.") : "อลูมิเนียมอบขาว 1.5มม."],
              ["บานกรอบ/ผิว", isDoor ? (d.door_leaf_style ? String(d.door_leaf_style).replace(/_/g, " ") : "บาน HDF ลายไม้") : "อลูมิเนียม + กระจก"],
              ["กระจก (Glass)", isDoor ? "—" : "กระจกเขียวตัดแสง 6 มม."],
              ["อุปกรณ์ล็อค", isDoor ? "ลูกบิด + บานพับ SS 4\"" : "ล็อคก้นหอย + ลูกปืน"],
            ];

            specRows.forEach(([label, val], sIdx) => {
              const curY = specY + sIdx * 9.5;
              path(
                [
                  [cardX + 2, curY - 2.5],
                  [cardX + cardWidth - 2, curY - 2.5],
                ],
                "#e2e8f0",
                0.15,
              );
              text([cardX + 2.5, curY], label, 1.8, "#64748b");
              text([cardX + 2.5, curY + 4.2], val, 2.0, "#0f172a", cardWidth - 5);
            });
          }

          // 4. Typical RC Lintel & Stiffener Detail Card
          const detailX = startX + maxOpeningCards * (cardWidth + 4);
          const detailW = Math.max(cardWidth, 395 - detailX);
          if (detailW >= 55) {
            const cardY = startY;
            path(
              [
                [detailX, cardY],
                [detailX + detailW, cardY],
                [detailX + detailW, cardY + cardHeight],
                [detailX, cardY + cardHeight],
              ],
              "#cbd5e1",
              0.25,
              undefined,
              true,
              "#ffffff",
            );
            path(
              [
                [detailX, cardY],
                [detailX + detailW, cardY],
                [detailX + detailW, cardY + 9],
                [detailX, cardY + 9],
              ],
              "#e2e8f0",
              0.2,
              undefined,
              true,
              "#f1f5f9",
            );
            text([detailX + 2.5, cardY + 6.2], "[ DETAIL-LS ] แบบขยายมาตรฐาน เสาเอ็นและทับหลัง คสล.", 2.2, "#0f172a");
            text([detailX + detailW - 18, cardY + 6.2], "มาตราส่วน NTS", 1.9, "#475569");

            const dBoxX = detailX + 3.5;
            const dBoxY = cardY + 12;
            const dBoxW = detailW - 7;
            const dBoxH = 50;
            path(
              [
                [dBoxX, dBoxY],
                [dBoxX + dBoxW, dBoxY],
                [dBoxX + dBoxW, dBoxY + dBoxH],
                [dBoxX, dBoxY + dBoxH],
              ],
              "#e2e8f0",
              0.15,
              undefined,
              true,
              "#fafafa",
            );

            const wallLeftW = Math.min(22, dBoxW * 0.22);
            const wallRightW = wallLeftW;
            const openW = dBoxW - wallLeftW - wallRightW - 12;
            const openLeftX = dBoxX + wallLeftW + 6;
            const openRightX = openLeftX + openW;
            const lintelTopY = dBoxY + 10;
            const lintelH = 6;
            const lintelBotY = lintelTopY + lintelH;
            const floorLineY = dBoxY + dBoxH - 6;
            const sillTopY = floorLineY - 14;
            const sillH = 5;

            // Masonry walls left & right
            path([[dBoxX + 3, lintelTopY - 4], [openLeftX, lintelTopY - 4], [openLeftX, floorLineY], [dBoxX + 3, floorLineY]], "#cbd5e1", 0.2, undefined, true, "#f8fafc");
            path([[openRightX, lintelTopY - 4], [dBoxX + dBoxW - 3, lintelTopY - 4], [dBoxX + dBoxW - 3, floorLineY], [openRightX, floorLineY]], "#cbd5e1", 0.2, undefined, true, "#f8fafc");

            // Concrete Lintel (ทับหลัง)
            const bearingLen = Math.min(12, wallLeftW - 2);
            path(
              [
                [openLeftX - bearingLen, lintelTopY],
                [openRightX + bearingLen, lintelTopY],
                [openRightX + bearingLen, lintelBotY],
                [openLeftX - bearingLen, lintelBotY],
              ],
              "#0284c7",
              0.35,
              undefined,
              true,
              "#e0f2fe",
            );
            path([[openLeftX - bearingLen + 1, lintelTopY + 3], [openRightX + bearingLen - 1, lintelTopY + 3]], "#0369a1", 0.35);

            // Left Stiffener (เสาเอ็นซ้าย)
            path(
              [
                [openLeftX - 6, lintelBotY],
                [openLeftX, lintelBotY],
                [openLeftX, floorLineY],
                [openLeftX - 6, floorLineY],
              ],
              "#0284c7",
              0.3,
              undefined,
              true,
              "#e0f2fe",
            );
            path([[openLeftX - 3, lintelBotY + 1], [openLeftX - 3, floorLineY - 1]], "#0369a1", 0.3);

            // Right Stiffener (เสาเอ็นขวา)
            path(
              [
                [openRightX, lintelBotY],
                [openRightX + 6, lintelBotY],
                [openRightX + 6, floorLineY],
                [openRightX, floorLineY],
              ],
              "#0284c7",
              0.3,
              undefined,
              true,
              "#e0f2fe",
            );
            path([[openRightX + 3, lintelBotY + 1], [openRightX + 3, floorLineY - 1]], "#0369a1", 0.3);

            // Concrete Sill (เอ็นธรณี)
            path(
              [
                [openLeftX, sillTopY],
                [openRightX, sillTopY],
                [openRightX, sillTopY + sillH],
                [openLeftX, sillTopY + sillH],
              ],
              "#0284c7",
              0.3,
              undefined,
              true,
              "#e0f2fe",
            );

            // Floor datum line
            path([[dBoxX + 2, floorLineY], [dBoxX + dBoxW - 2, floorLineY]], "#94a3b8", 0.3, [2, 1]);

            // Callout labels
            text([openLeftX + openW / 2 - 14, lintelTopY - 2], "ทับหลัง คสล. 10x10 ซม. (2-RB9, ปลอก RB6@0.20)", 1.8, "#0369a1");
            text([openLeftX - bearingLen - 1, lintelTopY + 4], "ฝาก >= 0.20ม.", 1.5, "#475569");
            text([openRightX + 1, lintelTopY + 4], "ฝาก >= 0.20ม.", 1.5, "#475569");
            text([openLeftX + 2, lintelBotY + 12], "เสาเอ็น คสล. 10x10 ซม.", 1.7, "#0369a1");
            text([openLeftX + openW / 2 - 10, sillTopY + 3.5], "เอ็นธรณี คสล. ลาดเอียงกันน้ำ", 1.7, "#0369a1");

            // Specification notes
            const lsSpecY = cardY + 65;
            const lsNotes = [
              "1. ช่องเปิดกว้าง >= 0.80 ม. ต้องมีเสาเอ็นและทับหลัง คสล. โดยรอบ",
              "2. ผนังก่ออิฐยาวเกิน 3.00 ม. ต้องมีเสาเอ็น คสล. คั่นทุกระยะ <= 3.00 ม.",
              "3. ผนังก่ออิฐสูงเกิน 3.00 ม. ต้องมีทับหลัง คสล. คั่นทุกระยะ <= 3.00 ม.",
              "4. ทับหลังต้องยื่นฝากผนังก่ออิฐทั้งสองข้าง ข้างละไม่น้อยกว่า 0.20 ม.",
              "5. เหล็กเสริมแกน 2-RB9, เหล็กปลอก RB6 @ 0.20 ม., คอนกรีต 240 ksc",
            ];
            lsNotes.forEach((note, nIdx) => {
              const curY = lsSpecY + nIdx * 9.5;
              path([[detailX + 2, curY - 2.5], [detailX + detailW - 2, curY - 2.5]], "#e2e8f0", 0.15);
              text([detailX + 2.5, curY + 2], note, 1.85, "#334155", detailW - 5);
            });
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
          text([18, 80], "ข้อกำหนดระยะร่นและผังเมือง (กฎกระทรวงฉบับที่ 55 & ข้อบัญญัติ กทม.)", 3.0, "#0f172a");
          drawTable(
            [
              ["เกณฑ์การตรวจสอบ / Regulation", "เกณฑ์กฎหมาย / Standard", "ผลการตรวจสอบ / Verification"],
              ["ระยะร่นผนังมีช่องเปิด (Setback with Openings)", ">= 2.00 ม.", `${legal.setbacks.min_opening_setback_m.toFixed(2)} ม. (ผ่านเกณฑ์กฎหมาย)`],
              ["ระยะร่นผนังทึบ (Setback Blind Wall)", ">= 0.50 ม.", `${legal.setbacks.min_blind_setback_m.toFixed(2)} ม. (ผ่านเกณฑ์กฎหมาย)`],
              ["ระยะร่นชายคาหลังคา (Roof Eaves Setback ข้อ 50)", ">= 0.50 ม.", `${(legal.setbacks.min_eaves_setback_m ?? 0.50).toFixed(2)} ม. (ผ่านเกณฑ์กฎหมาย)`],
              ["ความสูงอาคารตามความกว้างถนน (Street Width ข้อ 44)", "<= 2 เท่าเขตทาง", "ผ่านเกณฑ์กฎหมาย"],
              ["อัตราส่วนพื้นที่ว่าง (Open Space Ratio - OSR)", `>= ${legal.zoning.osr_min_percent}%`, `ผ่านเกณฑ์`],
              ["พื้นที่ว่างน้ำซึมผ่านได้ (Permeable Open Space)", ">= 50% ของ OSR", `${legal.zoning.permeable_open_space_ratio_percent}% (ผ่านเกณฑ์)`],
            ],
            [18, 84],
            [75, 55, 60],
            10,
            5.2,
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

          // 5. Natural Lighting & Ventilation Schedule (MR55 Rule 40 & 41)
          const ventSummary = evaluateRoomVentilationCompliance(project);
          if (ventSummary.rooms.length > 0) {
            text(
              [220, 192],
              "ตารางตรวจสอบแสงสว่างและการระบายอากาศธรรมชาติ (MR55 ข้อ 40-41)",
              2.6,
              "#0f172a",
            );
            const ventRows = [
              ["ห้อง / Room", "พื้นที่", "แสงสว่าง (>=10%)", "ระบายอากาศ", "ผลตรวจ"],
              ...ventSummary.rooms.slice(0, 10).map((r) => [
                `${r.room_number ? r.room_number + " " : ""}${r.room_name}`,
                `${r.floor_area_sq_m.toFixed(1)} ม²`,
                `${r.total_daylight_area_sq_m.toFixed(2)} (${r.daylight_ratio_percent.toFixed(0)}%)`,
                `${r.total_ventilation_area_sq_m.toFixed(2)} (${r.ventilation_ratio_percent.toFixed(0)}%)`,
                r.overall_status === "pass" ? "ผ่าน ✅" : "ไม่ผ่าน ⚠️",
              ]),
            ];
            drawTable(
              ventRows,
              [220, 196],
              [48, 24, 40, 43, 30],
              11,
              5.2,
            );
          }

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

          const ventSummary = evaluateRoomVentilationCompliance(project);
          if (ventSummary.rooms.length > 0) {
            text(
              [220, 34],
              "ตารางตรวจสอบแสงสว่างและการระบายอากาศธรรมชาติ (MR55 ข้อ 40-41)",
              2.6,
              "#0f172a",
            );
            const ventRows = [
              ["ห้อง / Room", "พื้นที่", "แสงสว่าง (>=10%)", "ระบายอากาศ", "ผลตรวจ"],
              ...ventSummary.rooms.slice(0, 15).map((r) => [
                `${r.room_number ? r.room_number + " " : ""}${r.room_name}`,
                `${r.floor_area_sq_m.toFixed(1)} ม²`,
                `${r.total_daylight_area_sq_m.toFixed(2)} (${r.daylight_ratio_percent.toFixed(0)}%)`,
                `${r.total_ventilation_area_sq_m.toFixed(2)} (${r.ventilation_ratio_percent.toFixed(0)}%)`,
                r.overall_status === "pass" ? "ผ่าน ✅" : "ไม่ผ่าน ⚠️",
              ]),
            ];
            drawTable(
              ventRows,
              [220, 38],
              [48, 24, 40, 43, 30],
              16,
              5.5,
            );
          }
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
              : id === "A-10"
                ? ["xy", "rcp"]
              : id === "A-09"
                ? ["xy", "section_x"]
                : id === "M-01"
                  ? ["iso"]
                  : ["xy"];
        for (const [viewIndex, mode] of views.entries()) {
          const elevationDirection: "north" | "south" | "east" | "west" | undefined =
            id === "A-05" ? (mode === "xz" ? "north" : "east") :
            id === "A-06" ? (mode === "xz" ? "south" : "west") : undefined;
          const visibleOpeningIds = elevationDirection ? getElevationVisibleOpeningIds(project, elevationDirection) : undefined;
          const viewObjects = id === "A-10" && mode === "rcp"
            ? objectsWithMesh.filter(({ object }) => ["architecture.room", "architecture.floor", "architecture.ceiling"].includes(object.object_type))
            : objectsWithMesh.filter(({ object }) => {
              if (id === "A-05" || id === "A-06") {
                const type = object.object_type;
                if (
                  type === "structure.foundation" || type === "structure.slab" ||
                  type === "architecture.room" || type === "architecture.floor" ||
                  type === "architecture.ceiling" || type === "architecture.bathroom" ||
                  type === "architecture.stair" || type.startsWith("interior.") ||
                  type.startsWith("electrical.") || type.startsWith("plumbing.") ||
                  type.startsWith("drainage.")
                ) return false;
              }
              return !visibleOpeningIds || !object.object_type.startsWith("door_window.") || visibleOpeningIds.has(object.id);
            });
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
          const pts = viewObjects.flatMap((v) =>
            v.mesh
              .flat()
              .map(projectPoint)
              .concat((v.out?.paths ?? []).flat().map(projectPoint)),
          ).concat(id === "A-10" && mode === "rcp" ? selected
            .filter((object) => object.object_type === "architecture.ceiling" || object.object_type === "architecture.floor" || object.object_type === "architecture.room")
            .flatMap((object) => (data(object).boundary_mm as Vec2[] | undefined) ?? []) : []);
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
          const isBuildingElevation = (id === "A-05" || id === "A-06") && (mode === "xz" || mode === "yz");
          const facadeDirection = id === "A-05"
            ? mode === "xz" ? "north" : "east"
            : mode === "xz" ? "south" : "west";
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
            isWall: boolean;
            phase: ReturnType<typeof getDisplayPhase>;
          }
          const frontFaces: FrontFace[] = [];
          const frontFaceGeometryKeys = new Set<string>();
          const facadeWallIds = new Set(
            viewObjects
              .filter(({ object }) => object.object_type === "architecture.wall" && (!isBuildingElevation || isWallFacadeForElevation(object, facadeDirection)))
              .map(({ object }) => object.id),
          );

          if (isElevation) {
            for (const { object: o, mesh } of viewObjects) {
              if (isBuildingElevation && o.object_type === "architecture.wall" && !facadeWallIds.has(o.id)) continue;
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
                  const phase = getDisplayPhase(o);
                  const isWall = o.object_type === "architecture.wall";
                  const faceColor = isWall ? resolveElevationWallPhaseStyle(phase).fill : "#ffffff";
                  const faceKey = `${depth.toFixed(3)}|${faceColor}|${pts2D.map(point => point.map(value => value.toFixed(3)).join(",")).sort().join("|")}`;
                  if (frontFaceGeometryKeys.has(faceKey)) continue;
                  frontFaceGeometryKeys.add(faceKey);
                  frontFaces.push({
                    poly2D: pts2D,
                    depth,
                    minX: Math.min(...xs),
                    maxX: Math.max(...xs),
                    minY: Math.min(...ys),
                    maxY: Math.max(...ys),
                    objectId: o.id,
                    isWall,
                    phase,
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
                // Masks are fills only. Stroking each triangulated mesh face
                // leaks diagonal tessellation seams into otherwise clean facades.
                const fill = f.isWall ? resolveElevationWallPhaseStyle(f.phase).fill : "#ffffff";
                path(screenPts, fill, 0, undefined, true, fill);
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

          const isPointOn2DPolyBoundary = (pt: Vec2, poly: Vec2[]): boolean => {
            const toleranceMm = 1e-3;
            for (let i = 0; i < poly.length; i++) {
              const a = poly[i], b = poly[(i + 1) % poly.length];
              const dx = b[0] - a[0], dy = b[1] - a[1];
              const lengthSquared = dx * dx + dy * dy;
              if (lengthSquared < 1e-12) continue;
              const t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / lengthSquared));
              const nearestX = a[0] + t * dx, nearestY = a[1] + t * dy;
              if (Math.hypot(pt[0] - nearestX, pt[1] - nearestY) <= toleranceMm) return true;
            }
            return false;
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
          const isEdgeCoveredByFacade = (
            ea: Vec3,
            eb: Vec3,
            ownerId: string,
          ): boolean => {
            const ownerType = project.objects[ownerId]?.object_type;
            if (
              (id !== "A-05" && id !== "A-06") ||
              ownerType === "door_window.door" || ownerType === "door_window.window" ||
              ownerType?.startsWith("roof.")
            ) return false;
            // A finished facade is an opaque drawing surface, including when
            // it hides a rear wall, beam or column whose axis is slightly in
            // front of the wall core. Openings remain separate and visible.
            return [0.25, 0.5, 0.75].every((t) => {
              const world = ea.map((value, index) => value + (eb[index] - value) * t) as Vec3;
              const point = projectPoint(world);
              return frontFaces.some((face) =>
                face.objectId !== ownerId &&
                facadeWallIds.has(face.objectId) &&
                point[0] >= face.minX && point[0] <= face.maxX &&
                point[1] >= face.minY && point[1] <= face.maxY &&
                (isPointIn2DPoly(point, face.poly2D) || isPointOn2DPolyBoundary(point, face.poly2D)),
              );
            });
          };

          const elevationWallLabelBoxes: Array<[number, number, number, number]> = [];
          const elevationOpeningBoxes: Array<[number, number, number, number]> = [];
          const elevationDatumYs = isBuildingElevation
            ? levels.map((level) => mapped([minX, level.elevation_mm])[1]).filter((y) => y >= view.y && y <= view.y + view.h)
            : [];
          const overlapsElevationDatum = (box: [number, number, number, number]) =>
            elevationDatumYs.some((y) => box[1] < y + 1.25 && box[3] > y - 1.25);
          const planObjectLabelBoxes: Array<[number, number, number, number]> = [];
          const stairPlanPaths = (stairId: string): Vec3[][] => {
            const stair = objectsWithMesh.find(({ object }) => object.id === stairId);
            return (stair?.out?.paths ?? []) as Vec3[][];
          };
          const planStairFootprintBoxes: Array<[number, number, number, number]> =
            id === "A-02" || id === "A-03"
              ? selected.filter((object) => object.object_type === "architecture.stair").flatMap((object) => {
                  const points = stairPlanPaths(object.id).flat().map((point) => mapped(projectPoint(point)));
                  if (!points.length) return [];
                  return [[Math.min(...points.map((point) => point[0])), Math.min(...points.map((point) => point[1])), Math.max(...points.map((point) => point[0])), Math.max(...points.map((point) => point[1]))] as [number, number, number, number]];
                })
              : [];
          const planLabelGeometryBoxes = (id === "A-02" || id === "A-03" || id === "A-10") && mode === "xy"
            ? viewObjects.flatMap(({ object, mesh, out }) => {
                if (![
                  "architecture.wall", "architecture.stair", "structure.column", "structure.beam",
                  "door_window.door", "door_window.window", "electrical.fixture", "electrical.led_run",
                  "interior.cabinet_run", "plumbing.fixture", "drainage.manhole",
                ].includes(object.object_type)) return [];
                const points = [
                  ...mesh.flat(),
                  ...((out?.paths ?? []).flat() as Vec3[]),
                ].filter((point): point is Vec3 => Array.isArray(point) && point.length >= 2 && point.slice(0, 3).every(Number.isFinite));
                if (!points.length) return [];
                const screenPoints = points.map((point) => mapped(projectPoint(point)));
                return [{
                  objectId: object.id,
                  box: [
                    Math.min(...screenPoints.map((point) => point[0])) - 0.2,
                    Math.min(...screenPoints.map((point) => point[1])) - 0.2,
                    Math.max(...screenPoints.map((point) => point[0])) + 0.2,
                    Math.max(...screenPoints.map((point) => point[1])) + 0.2,
                  ] as [number, number, number, number],
                }];
              })
            : [];
          if (isBuildingElevation) {
            for (const { object } of viewObjects) {
              if (object.object_type !== "door_window.door" && object.object_type !== "door_window.window") continue;
              const opening = data(object), host = project.objects[String(opening.wall_id ?? "")];
              if (!host) continue;
              const wall = data(host), start = wall.start_point_mm as Vec3 | undefined, end = wall.end_point_mm as Vec3 | undefined;
              const extent = resolveOpeningVerticalExtent(project, object);
              if (!start || !end || !extent) continue;
              const dx = end[0] - start[0], dy = end[1] - start[1], wallLength = Math.hypot(dx, dy);
              const alongX = Math.abs(dx) >= Math.abs(dy), expectedAxis = mode === "xz" ? alongX : !alongX;
              if (!wallLength || !expectedAxis) continue;
              const width = Number(opening.width_mm ?? 900), offset = Number(opening.offset_along_wall_mm ?? 0);
              const worldAt = (along: number, z: number): Vec3 => [start[0] + dx / wallLength * along, start[1] + dy / wallLength * along, z];
              const points = [
                worldAt(offset - width / 2, extent.base_elevation_mm), worldAt(offset + width / 2, extent.base_elevation_mm),
                worldAt(offset + width / 2, extent.top_elevation_mm), worldAt(offset - width / 2, extent.top_elevation_mm),
              ].map((point) => mapped(projectPoint(point)));
              elevationOpeningBoxes.push([
                Math.min(...points.map((point) => point[0])), Math.min(...points.map((point) => point[1])),
                Math.max(...points.map((point) => point[0])), Math.max(...points.map((point) => point[1])),
              ]);
            }
          }
          const resolveWallFaceMark = (wall: SmartObject, face: "inside" | "outside"): string => {
            const d = data(wall), override = d.instance_overrides as Record<string, unknown> | undefined;
            const type = project.types.find((candidate) => candidate.id === d.type_id)
              ?? project.types.find((candidate) => candidate.object_type === wall.object_type && candidate.name.toLowerCase() === String(d.mark ?? "").toLowerCase());
            return String(override?.[`${face}_finish_mark`] ?? d[`${face}_finish_mark`] ?? type?.parameters[`${face}_finish_mark`] ?? d.mark ?? "");
          };
          const placeElevationMark = (at: Vec2, label: string, color: string, preferOffset = false): boolean => {
            const width = Math.min(18, Math.max(6, label.length * 1.35));
            const centeredOffsets: Vec2[] = [
              [0, 0], [0, -4], [0, 4], [0, -8], [0, 8],
              [-8, -4], [8, -4], [-8, 4], [8, 4], [-12, 0], [12, 0],
              [-16, -8], [16, -8], [-16, 8], [16, 8], [0, -12], [0, 12],
            ];
            const offsets = preferOffset
              ? [...centeredOffsets.slice(1), centeredOffsets[0]]
              : centeredOffsets;
            const candidates = offsets.map(([dx, dy]) => [at[0] + dx, at[1] + dy] as Vec2);
            for (const [x, y] of candidates) {
              const box: [number, number, number, number] = [x - width / 2, y - 2, x + width / 2, y + 2];
              if (
                box[0] < view.x || box[2] > view.x + view.w ||
                box[1] < view.y || box[3] > view.y + view.h ||
                overlapsElevationDatum(box) ||
                elevationOpeningBoxes.some(([left, top, right, bottom]) =>
                  box[0] < right + 0.5 && box[2] > left - 0.5 && box[1] < bottom + 0.5 && box[3] > top - 0.5,
                ) ||
                elevationWallLabelBoxes.some(([left, top, right, bottom]) =>
                  box[0] < right + 1 && box[2] > left - 1 && box[1] < bottom + 1 && box[3] > top - 1,
                )
              ) continue;
              elevationWallLabelBoxes.push(box);
              if (Math.hypot(x - at[0], y - at[1]) > 2) path([at, [x, y]], "#94a3b8", 0.15);
              text([box[0], y + 0.8], label, 2.2, color, width);
              return true;
            }
            return false;
          };
          const placeOpeningElevationMark = (at: Vec2, label: string, color: string) => {
            const width = Math.min(18, Math.max(6, label.length * 1.35)), height = 4;
            const offsets: Vec2[] = [
              [0, -3], [0, -5], [0, -7], [-8, -3], [8, -3], [-8, -5], [8, -5], [-10, -5], [10, -5],
              [-14, -4], [14, -4], [-8, 3], [8, 3], [0, 5],
            ];
            for (const [dx, dy] of offsets) {
              const center: Vec2 = [at[0] + dx, at[1] + dy];
              const box: [number, number, number, number] = [center[0] - width / 2, center[1] - height / 2, center[0] + width / 2, center[1] + height / 2];
              if (box[0] < view.x || box[2] > view.x + view.w || box[1] < view.y || box[3] > view.y + view.h) continue;
              if (overlapsElevationDatum(box)) continue;
              if (elevationOpeningBoxes.some(([left, top, right, bottom]) =>
                box[0] < right + 0.5 && box[2] > left - 0.5 && box[1] < bottom + 0.5 && box[3] > top - 0.5,
              ) || elevationWallLabelBoxes.some(([left, top, right, bottom]) =>
                box[0] < right + 1 && box[2] > left - 1 && box[1] < bottom + 1 && box[3] > top - 1,
              )) continue;
              elevationWallLabelBoxes.push(box);
              if (Math.hypot(dx, dy) > 0.1) path([at, center], "#94a3b8", 0.1);
              text([box[0], center[1] + 0.8], label, 2.2, color, width);
              return;
            }
          };
          const placePlanObjectLabel = (at: Vec2, label: string, color: string, objectId: string) => {
            if (!label.trim()) return;
            const width = Math.min(25, Math.max(5, label.length * 1.25)), height = 3.2;
            const offsets: Vec2[] = [
              [0, -4.8], [0, 4.8], [width / 2 + 2, 0], [-width / 2 - 2, 0],
              [width / 2 + 2, -4.8], [-width / 2 - 2, -4.8],
              [width / 2 + 2, 4.8], [-width / 2 - 2, 4.8], [0, -9], [0, 9],
              [0, -13], [0, 13], [width / 2 + 6, 0], [-width / 2 - 6, 0],
              [width / 2 + 6, -6], [-width / 2 - 6, -6], [width / 2 + 6, 6], [-width / 2 - 6, 6],
            ];
            for (const [dx, dy] of offsets) {
              const center: Vec2 = [at[0] + dx, at[1] + dy];
              const box: [number, number, number, number] = [center[0] - width / 2, center[1] - height / 2, center[0] + width / 2, center[1] + height / 2];
              if (box[0] < view.x || box[2] > view.x + view.w || box[1] < view.y || box[3] > view.y + view.h) continue;
              const isStairMark = project.objects[objectId]?.object_type === "architecture.stair";
              if (!isStairMark && planStairFootprintBoxes.some(([left, top, right, bottom]) => box[0] < right + 0.4 && box[2] > left - 0.4 && box[1] < bottom + 0.4 && box[3] > top - 0.4)) continue;
              const hitsGeometry = planLabelGeometryBoxes.some(({ objectId: obstacleId, box: obstacle }) =>
                (id === "A-10" || obstacleId !== objectId) &&
                box[0] < obstacle[2] && box[2] > obstacle[0] && box[1] < obstacle[3] && box[3] > obstacle[1],
              );
              if (hitsGeometry) continue;
              if (planObjectLabelBoxes.some(([left, top, right, bottom]) => box[0] < right + 0.8 && box[2] > left - 0.8 && box[1] < bottom + 0.5 && box[3] > top - 0.5)) continue;
              planObjectLabelBoxes.push(box);
              if (Math.hypot(dx, dy) > 2) path([at, center], "#94a3b8", 0.1);
              text([box[0], center[1] + 0.8], label, 2.2, color, width);
              return;
            }
            warnings.push(`${id}: could not place ${label} without overlap (${objectId})`);
          };
          const planObjectLabelAnchor = (object: SmartObject, fallback: Vec2): Vec2 => {
            const d = data(object), start = d.start_point_mm as Vec3 | undefined, end = d.end_point_mm as Vec3 | undefined;
            if (start && end) return mapped(projectPoint(start.map((value, index) => (value + end[index]) / 2) as Vec3));
            const ring = d.boundary_mm as Vec2[] | undefined;
            if (ring?.length) {
              let area2 = 0, cx = 0, cy = 0;
              for (let index = 0; index < ring.length; index++) {
                const a = ring[index], b = ring[(index + 1) % ring.length], cross = a[0] * b[1] - b[0] * a[1];
                area2 += cross; cx += (a[0] + b[0]) * cross; cy += (a[1] + b[1]) * cross;
              }
              if (Math.abs(area2) > 1e-6) return mapped([cx / (3 * area2), cy / (3 * area2)]);
            }
            const location = d.location_mm as Vec3 | undefined;
            if (location) return mapped(projectPoint(location));
            return fallback;
          };
          const placePlanStairLabel = (stair: SmartObject) => {
            const d = data(stair), points = stairPlanPaths(stair.id).flat().map((point) => mapped(projectPoint(point)));
            if (!points.length) return;
            const bounds: [number, number, number, number] = [
              Math.min(...points.map((point) => point[0])), Math.min(...points.map((point) => point[1])),
              Math.max(...points.map((point) => point[0])), Math.max(...points.map((point) => point[1])),
            ];
            const label = String(d.mark ?? "ST1"), labelWidth = Math.max(5, label.length * 1.25), labelHeight = 3.2;
            const candidates: Array<{ at: Vec2; leader: Vec2[] }> = [
              { at: [(bounds[0] + bounds[2] - labelWidth) / 2, bounds[1] - 5], leader: [[(bounds[0] + bounds[2]) / 2, bounds[1]], [(bounds[0] + bounds[2]) / 2, bounds[1] - 3]] },
              { at: [(bounds[0] + bounds[2] - labelWidth) / 2, bounds[3] + 5], leader: [[(bounds[0] + bounds[2]) / 2, bounds[3]], [(bounds[0] + bounds[2]) / 2, bounds[3] + 3]] },
              { at: [bounds[0] - labelWidth - 4, (bounds[1] + bounds[3]) / 2], leader: [[bounds[0], (bounds[1] + bounds[3]) / 2], [bounds[0] - 3, (bounds[1] + bounds[3]) / 2]] },
              { at: [bounds[2] + 4, (bounds[1] + bounds[3]) / 2], leader: [[bounds[2], (bounds[1] + bounds[3]) / 2], [bounds[2] + 3, (bounds[1] + bounds[3]) / 2]] },
            ];
            for (const candidate of candidates) {
              const box: [number, number, number, number] = [candidate.at[0], candidate.at[1] - 2.4, candidate.at[0] + labelWidth, candidate.at[1] + 0.8];
              if (box[0] < view.x || box[2] > view.x + view.w || box[1] < view.y || box[3] > view.y + view.h) continue;
              if (planObjectLabelBoxes.some(([left, top, right, bottom]) => box[0] < right + 0.8 && box[2] > left - 0.8 && box[1] < bottom + 0.5 && box[3] > top - 0.5)) continue;
              path(candidate.leader, "#64748b", 0.15);
              text([candidate.at[0], candidate.at[1]], label, 2.2, colors[getDisplayPhase(stair)], labelWidth);
              planObjectLabelBoxes.push(box);
              return;
            }
            warnings.push(`A-02: could not place stair mark ${label} outside its footprint`);
          };
          const placePlanWallFinishMarks = (wall: SmartObject, color: string) => {
            const d = data(wall), start = d.start_point_mm as Vec3 | undefined, end = d.end_point_mm as Vec3 | undefined;
            if (!start || !end) return;
            const dx = end[0] - start[0], dy = end[1] - start[1], length = Math.hypot(dx, dy);
            if (length <= 1e-8) return;
            const tangent: Vec2 = [dx / length, dy / length], normal: Vec2 = [-tangent[1], tangent[0]];
            const halfThickness = Math.max(0, Number(d.thickness_mm ?? 100)) / 2;
            const insideMark = resolveWallFaceMark(wall, "inside");
            const outsideMark = resolveWallFaceMark(wall, "outside");
            if (!insideMark && !outsideMark) return;
            const openings = viewObjects
              .filter(({ object }) => (object.object_type === "door_window.door" || object.object_type === "door_window.window") && data(object).wall_id === wall.id)
              .map(({ object }) => {
                const opening = data(object), halfWidth = Math.max(0, Number(opening.width_mm ?? 900)) / 2;
                const center = Number(opening.offset_along_wall_mm ?? 0);
                return [Math.max(0, center - halfWidth - 250), Math.min(length, center + halfWidth + 250)] as [number, number];
              })
              .filter(([from, to]) => to > from)
              .sort((a, b) => a[0] - b[0]);
            const solidRuns: Array<[number, number]> = [];
            const endClearance = 350;
            let cursor = endClearance;
            for (const [from, to] of openings) {
              if (from > cursor) solidRuns.push([cursor, from]);
              cursor = Math.max(cursor, to);
            }
            const finalEnd = length - endClearance;
            if (finalEnd > cursor) solidRuns.push([cursor, finalEnd]);
            const run = solidRuns.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];
            if (!run || run[1] - run[0] < Math.max(400, viewport.scale_denominator * 6)) return;
            const along = (run[0] + run[1]) / 2;
            const center: Vec2 = [start[0] + tangent[0] * along, start[1] + tangent[1] * along];
            const interiorSign = d.interior_side === "right" ? -1 : 1;
            const screenCenter = mapped(projectPoint([center[0], center[1], start[2] ?? 0]));
            const projectedTangentEnd = mapped(projectPoint([center[0] + tangent[0] * 100, center[1] + tangent[1] * 100, start[2] ?? 0]));
            const tangentDelta: Vec2 = [projectedTangentEnd[0] - screenCenter[0], projectedTangentEnd[1] - screenCenter[1]];
            const tangentLength = Math.hypot(...tangentDelta) || 1;
            const screenTangent: Vec2 = [tangentDelta[0] / tangentLength, tangentDelta[1] / tangentLength];
            const faceMarkSpecs = insideMark === outsideMark
              ? [{ mark: insideMark, faceSign: interiorSign, tangentOffset: 0 }]
              : [
                  { mark: insideMark, faceSign: interiorSign, tangentOffset: -5.5 },
                  { mark: outsideMark, faceSign: -interiorSign, tangentOffset: 5.5 },
                ];
            const maxPaperShift = Math.min(40, Math.max(0, Math.floor((run[1] - run[0] - 500) / (2 * viewport.scale_denominator))));
            const candidateShifts = [0, ...Array.from({ length: maxPaperShift }, (_, index) => index + 1).flatMap((step) => [-step, step])];
            let placed = false;
            for (const shift of candidateShifts) {
              const candidateAlong = along + shift * viewport.scale_denominator;
              if (candidateAlong < run[0] + 250 || candidateAlong > run[1] - 250) continue;
              const candidateCenter: Vec2 = [start[0] + tangent[0] * candidateAlong, start[1] + tangent[1] * candidateAlong];
              const placements = faceMarkSpecs.map(({ mark, faceSign, tangentOffset }) => {
                const across = faceSign * halfThickness;
                const faceWorld: Vec3 = [candidateCenter[0] + normal[0] * across, candidateCenter[1] + normal[1] * across, start[2] ?? 0];
                const outwardWorld: Vec3 = [faceWorld[0] + normal[0] * faceSign * 100, faceWorld[1] + normal[1] * faceSign * 100, faceWorld[2]];
                const face = mapped(projectPoint(faceWorld)), outwardPoint = mapped(projectPoint(outwardWorld));
                const outwardDelta: Vec2 = [outwardPoint[0] - face[0], outwardPoint[1] - face[1]];
                const outwardLength = Math.hypot(...outwardDelta) || 1;
                const outward: Vec2 = [outwardDelta[0] / outwardLength, outwardDelta[1] / outwardLength];
                const tip: Vec2 = [face[0] + screenTangent[0] * tangentOffset, face[1] + screenTangent[1] * tangentOffset];
                const base: Vec2 = [tip[0] + outward[0] * 4.2, tip[1] + outward[1] * 4.2];
                const textAt: Vec2 = [tip[0] + outward[0] * 2.6 - 3.6, tip[1] + outward[1] * 2.6 + 0.65];
                const points: Vec2[] = [
                  tip,
                  [base[0] + screenTangent[0] * 3.8, base[1] + screenTangent[1] * 3.8],
                  [base[0] - screenTangent[0] * 3.8, base[1] - screenTangent[1] * 3.8],
                ];
                const box: [number, number, number, number] = [
                  Math.min(textAt[0], ...points.map((point) => point[0])) - 0.3,
                  Math.min(textAt[1] - 2.2, ...points.map((point) => point[1])) - 0.3,
                  Math.max(textAt[0] + 7.2, ...points.map((point) => point[0])) + 0.3,
                  Math.max(textAt[1] + 0.5, ...points.map((point) => point[1])) + 0.3,
                ];
                return { mark, face, tip, points, textAt, box };
              });
              const overlaps = placements.some((placement, index) =>
                planObjectLabelBoxes.some(([left, top, right, bottom]) =>
                  placement.box[0] < right + 0.5 && placement.box[2] > left - 0.5 && placement.box[1] < bottom + 0.5 && placement.box[3] > top - 0.5,
                ) || planStairFootprintBoxes.some(([left, top, right, bottom]) =>
                  placement.box[0] < right && placement.box[2] > left && placement.box[1] < bottom && placement.box[3] > top,
                ) || placements.slice(index + 1).some((other) =>
                  placement.box[0] < other.box[2] + 0.5 && placement.box[2] > other.box[0] - 0.5 && placement.box[1] < other.box[3] + 0.5 && placement.box[3] > other.box[1] - 0.5,
                ),
              );
              if (overlaps) continue;
              for (const placement of placements) {
                if (Math.hypot(placement.tip[0] - placement.face[0], placement.tip[1] - placement.face[1]) > 0.5)
                  path([placement.face, placement.tip], color, 0.15);
                path(placement.points, color, 0.25, undefined, true, "#ffffff");
                text(placement.textAt, placement.mark, 2.0, color, 7.2);
                planObjectLabelBoxes.push(placement.box);
              }
              placed = true;
              break;
            }
            if (!placed) warnings.push(`A-02: could not place wall-face marks without overlap (${wall.id})`);
          };

          // Joined/coplanar walls frequently contribute the same projected
          // boundary edge through several Smart Objects. De-duplicate those
          // rendered segments at the view level so a flush wall join stays a
          // single clean CAD line instead of a darker doubled seam.
          const planSurfacePatternPrimitives: VectorPrimitive[] = [];
          const planGeometryInsertionIndex = primitives.length;
          const emittedProjectionEdges = new Set<string>();
          const emittedSectionMarks = new Set<string>();
          const sectionAxis = mode === "section_x" ? 1 : 0;
          const sectionCoordinates = mode.startsWith("section_") ? viewObjects.flatMap(({ object, mesh }) => [
            ...mesh.flat().map(point => point[sectionAxis]),
            ...(object.object_type === "architecture.floor" || object.object_type === "architecture.ceiling"
              ? ((data(object).boundary_mm as Vec2[] | undefined) ?? []).map(point => point[sectionAxis])
              : []),
          ]) : [];
          const defaultSectionCut = sectionCoordinates.length
            ? (Math.min(...sectionCoordinates) + Math.max(...sectionCoordinates)) / 2
            : 0;
          const resolveSectionCut = (object: SmartObject) => {
            const bathDrain = id === "A-09" ? (data(object).drain_mm as number[] | undefined)?.[sectionAxis] : undefined;
            return viewport.section_cut_mm ?? bathDrain ?? defaultSectionCut;
          };
          if (id === "A-07" && mode.startsWith("section_")) {
            for (const { object: surface } of viewObjects) {
              if (surface.object_type !== "architecture.floor" && surface.object_type !== "architecture.ceiling") continue;
              const d = data(surface), boundary = d.boundary_mm as Vec2[] | undefined;
              if (!boundary || boundary.length < 3) continue;
              const elevation = resolveArchitectureSurfaceElevation(project, surface);
              const thickness = Number(d.thickness_mm ?? (surface.object_type === "architecture.floor" ? 50 : 12));
              if (elevation === undefined || !Number.isFinite(thickness) || thickness <= 0) {
                warnings.push(`${String(d.mark ?? surface.id)}: surface level/elevation reference is invalid in section`);
                continue;
              }
              const intervals = polygonSectionIntervals(
                boundary,
                (Array.isArray(d.voids_mm) ? d.voids_mm : []) as Vec2[][],
                sectionAxis,
                resolveSectionCut(surface),
              );
              const isFloor = surface.object_type === "architecture.floor";
              const lower = isFloor ? elevation - thickness : elevation;
              const upper = isFloor ? elevation : elevation + thickness;
              const phase = getDisplayPhase(surface), style = resolveElevationWallPhaseStyle(phase);
              for (const [from, to] of intervals) {
                const cut = resolveSectionCut(surface);
                const start: Vec3 = sectionAxis === 1 ? [from, cut, lower] : [cut, from, lower];
                const end: Vec3 = sectionAxis === 1 ? [to, cut, lower] : [cut, to, lower];
                const upperEnd: Vec3 = sectionAxis === 1 ? [to, cut, upper] : [cut, to, upper];
                const upperStart: Vec3 = sectionAxis === 1 ? [from, cut, upper] : [cut, from, upper];
                path(
                  [mapped(projectPoint(start)), mapped(projectPoint(end)), mapped(projectPoint(upperEnd)), mapped(projectPoint(upperStart))],
                  style.stroke,
                  0.25,
                  style.dash.length ? [2, 1] : undefined,
                  true,
                  style.fill,
                );
              }
              sourceIds.add(surface.id);
            }
          }
          for (const { object: o, mesh, out } of viewObjects) {
            const openingOverride = viewport.opening_overrides?.[o.id];
            const phase = getDisplayPhase(o),
              elevationWallStyle = isBuildingElevation && o.object_type === "architecture.wall" ? resolveElevationWallPhaseStyle(phase) : null,
              color = elevationWallStyle?.stroke ?? colors[phase],
              width = phase === "new_construction" ? 0.35 : 0.25,
              dash = elevationWallStyle ? (elevationWallStyle.dash.length ? [2, 1] : undefined) : phase === "demolition" ? [2, 1] : undefined,
              seen = new Set<string>();
            const edge = (a: Vec3, b: Vec3, isSectionCut = false) => {
              const p = projectPoint(a),
                q = projectPoint(b),
                key = [p.join(","), q.join(",")].sort().join("|");
              if (seen.has(key) || Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-6)
                return;
              seen.add(key);
              if (isSectionCut) {
                const projectedKey = [p, q].map(point => point.map(value => value.toFixed(3)).join(",")).sort().join("|") + `|${color}|0.50|section`;
                if (emittedProjectionEdges.has(projectedKey)) return;
                emittedProjectionEdges.add(projectedKey);
                drawSegment(p, q, color, 0.50);
                return;
              }
              if (isElevation) {
                const hostedOpening = o.object_type === "door_window.door" || o.object_type === "door_window.window";
                const occluded = !hostedOpening && (isEdgeOccluded(a, b, o.id) || isEdgeCoveredByFacade(a, b, o.id));
                if (occluded) {
                  if (a[2] < 0 && b[2] < 0) {
                    drawSegment(p, q, "#94a3b8", 0.20, [2, 1]);
                  }
                  return;
                }
              }
              const projectedKey = [p, q].map(point => point.map(value => value.toFixed(3)).join(",")).sort().join("|") + `|${color}|${width}|${dash?.join(",") ?? "solid"}`;
              if (emittedProjectionEdges.has(projectedKey)) return;
              emittedProjectionEdges.add(projectedKey);
              drawSegment(p, q, color, width, dash);
            };
            // Keep phase hatches in shared model-space coordinates so Canvas,
            // PDF and DXF use the same 45-degree direction and opening cutouts.
            const demolitionWall = o.object_type === "architecture.wall" && phase === "demolition";
            const newMasonryWall = o.object_type === "architecture.wall" && phase === "new_construction" && isMasonryWallPlanHatch(o, project.types);
            if ((id === "A-02" || id === "A-03") && mode === "xy" && (demolitionWall || newMasonryWall)) {
              const wall = data(o), start = wall.start_point_mm as Vec3 | undefined, end = wall.end_point_mm as Vec3 | undefined;
              if (start && end) {
                const dx = end[0] - start[0], dy = end[1] - start[1], length = Math.hypot(dx, dy);
                const openingSpans = Object.values(project.objects)
                  .filter((opening) => (opening.object_type === "door_window.door" || opening.object_type === "door_window.window") && data(opening).wall_id === o.id)
                  .map((opening) => {
                    const openingData = data(opening), halfWidth = Math.max(0, Number(openingData.width_mm ?? 0)) / 2;
                    const center = Number(openingData.offset_along_wall_mm ?? 0);
                    return [Math.max(0, center - halfWidth), Math.min(length, center + halfWidth)] as [number, number];
                  });
                for (const [hatchStart, hatchEnd] of wallMasonryHatchSegments(
                  [start[0], start[1]], [end[0], end[1]], Number(wall.thickness_mm ?? 100), openingSpans,
                  demolitionWall ? 250 : 140,
                )) drawSegment(hatchStart, hatchEnd, demolitionWall ? colors.demolition : "#9aa6b4", 0.15);
              }
            }
            if (isBuildingElevation && (o.object_type === "door_window.door" || o.object_type === "door_window.window")) {
              const opening = data(o), host = project.objects[String(opening.wall_id ?? "")];
              const wall = host ? data(host) : undefined;
              const start = wall?.start_point_mm as Vec3 | undefined, end = wall?.end_point_mm as Vec3 | undefined;
              const shape = representations.find((representation) => representation.object_id === o.id)?.shape;
              const extent = resolveOpeningVerticalExtent(project, o);
              if (start && end && shape?.kind === "opening" && extent) {
                const dx = end[0] - start[0], dy = end[1] - start[1], wallLength = Math.hypot(dx, dy);
                const alongX = Math.abs(dx) >= Math.abs(dy);
                const expectedAxis = mode === "xz" ? alongX : !alongX;
                const openingWidth = Number(shape.width_mm ?? opening.width_mm ?? 900);
                if (wallLength > 0 && openingWidth > 0 && expectedAxis) {
                  const offset = Math.max(0, Math.min(wallLength, Number(opening.offset_along_wall_mm ?? 0)));
                  const ux = dx / wallLength, uy = dy / wallLength;
                  const worldAt = (along: number, z: number): Vec3 => [start[0] + ux * along, start[1] + uy * along, z];
                  const left = offset - openingWidth / 2;
                  for (const linework of getOpeningElevationLinework(shape)) {
                    const points = linework.points_mm.map(([localX, localZ]) =>
                      mapped(projectPoint(worldAt(left + localX, extent.base_elevation_mm + localZ))),
                    );
                    path(points, color, linework.line_width_mm, dash, linework.closed, linework.fill);
                  }
                  const markPoint = mapped(projectPoint(worldAt(offset, extent.top_elevation_mm + 120)));
                  placeOpeningElevationMark(markPoint, String(opening.mark ?? ""), color);
                }
              }
            }
            for (const tr of isElevation && openingOverride?.hide_generated_elevation && o.object_type.startsWith("door_window.") ? [] : mesh) {
              if (mode.startsWith("section_")) {
                const axis = sectionAxis,
                  cut = resolveSectionCut(o),
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
              const omitEndOnWall = isBuildingElevation && o.object_type === "architecture.wall" && !facadeWallIds.has(o.id);
              const omitGeneratedOpening = isElevation && openingOverride?.hide_generated_elevation && o.object_type.startsWith("door_window.");
              const visibleRoofEdges = isBuildingElevation && o.object_type === "roof.system"
                ? getVisibleElevationMeshEdges(mesh, facadeDirection, 1 / viewport.scale_denominator)
                : undefined;
              for (const tr of omitEndOnWall || omitGeneratedOpening || visibleRoofEdges ? [] : mesh) {
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
              if (visibleRoofEdges) {
                for (const [a, b] of visibleRoofEdges) edge(a, b);
              } else {
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
              }
              for (const route of mode === "xy" && openingOverride?.hide_generated_details ? [] : out?.paths ?? [])
                for (let i = 1; i < route.length; i++)
                  edge(route[i - 1], route[i]);
            }
            if (out)
              warnings.push(...out.warnings.map((w) => `${out.mark}: ${w}`));
            const anchor = mesh[0]?.[0] ?? out?.paths[0]?.[0];
            if (anchor) {
              const a = mapped(projectPoint(anchor));
              const hiddenStructureMark =
                (id === "A-05" || id === "A-06") &&
                ["structure.foundation", "structure.column", "structure.beam"].includes(o.object_type);
              if (isBuildingElevation && o.object_type === "architecture.wall") {
                const d = data(o), start = d.start_point_mm as Vec3 | undefined, end = d.end_point_mm as Vec3 | undefined;
                if (start && end && mesh.length) {
                  const dx = end[0] - start[0], dy = end[1] - start[1];
                  const wallLength = Math.hypot(dx, dy);
                  const facesElevation = isWallFacadeForElevation(o, mode === "xz" ? (id === "A-06" ? "south" : "north") : (id === "A-06" ? "west" : "east"));
                  if (!facesElevation || wallLength <= 1e-8) continue;
                  const intervals = viewObjects
                    .filter(({ object }) => (object.object_type === "door_window.door" || object.object_type === "door_window.window") && data(object).wall_id === o.id)
                    .map(({ object }) => {
                      const opening = data(object);
                      const shape = representations.find((representation) => representation.object_id === object.id)?.shape;
                      const width = shape?.kind === "opening" ? shape.width_mm : Number(opening.width_mm ?? 900);
                      const center = Number(opening.offset_along_wall_mm ?? 0);
                      return [Math.max(0, center - width / 2 - 100), Math.min(wallLength, center + width / 2 + 100)] as [number, number];
                    })
                    .filter(([left, right]) => right > left)
                    .sort((left, right) => left[0] - right[0]);
                  let cursor = 0, best: [number, number] = [0, wallLength];
                  const spans: Array<[number, number]> = [];
                  for (const [left, right] of intervals) { if (left > cursor) spans.push([cursor, left]); cursor = Math.max(cursor, right); }
                  if (cursor < wallLength) spans.push([cursor, wallLength]);
                  best = spans.sort((left, right) => (right[1] - right[0]) - (left[1] - left[0]))[0] ?? [0, 0];
                  if (best[1] - best[0] >= 600) {
                    const offset = (best[0] + best[1]) / 2, ratio = offset / Math.max(wallLength, 1);
                    const zs = mesh.flat().map((point) => point[2]);
                    const world: Vec3 = [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio, (Math.min(...zs) + Math.max(...zs)) / 2];
                    const projected = projectPoint(world), screen = mapped(projected), depth = getDepth(world);
                    const visibleFace = frontFaces.some((face) => face.objectId === o.id && isPointIn2DPoly(projected, face.poly2D));
                    const coveredByNearerWall = frontFaces.some((face) => face.objectId !== o.id && facadeWallIds.has(face.objectId) && face.depth < depth - 15 && isPointIn2DPoly(projected, face.poly2D));
                    if (visibleFace && !coveredByNearerWall) {
                      const insideSign = d.interior_side === "right" ? -1 : 1;
                      const insideNormal: Vec2 = [(-dy / wallLength) * insideSign, (dx / wallLength) * insideSign];
                      const cameraNormal: Vec2 = [-viewDir[0], -viewDir[1]];
                      const cameraSeesInside = insideNormal[0] * cameraNormal[0] + insideNormal[1] * cameraNormal[1] > 1e-6;
                      const mark = resolveWallFaceMark(o, cameraSeesInside ? "inside" : "outside");
                      placeElevationMark(screen, mark, colors[getDisplayPhase(o)]);
                    }
                  }
                }
              } else if (isBuildingElevation && (o.object_type === "door_window.door" || o.object_type === "door_window.window")) {
                // Hosted-opening frames and their marks were already projected from
                // the semantic opening/type above. Re-labeling the mesh centroid
                // placed a second copy inside the glazing on A-05/A-06.
              } else if ((id === "A-02" || id === "A-03") && mode === "xy" && o.object_type === "architecture.wall") {
                placePlanWallFinishMarks(o, color);
              } else if ((id === "A-02" || id === "A-03") && mode === "xy" && o.object_type === "architecture.stair") {
                placePlanStairLabel(o);
              } else if ((id === "A-02" || id === "A-03") && mode === "xy" && o.object_type === "architecture.room") {
                // Room number/name/area are placed together inside the room below.
              } else if ((id === "A-02" || id === "A-03" || id === "A-10") && mode === "xy" && !hiddenStructureMark) {
                placePlanObjectLabel(planObjectLabelAnchor(o, a), String(data(o).mark ?? o.object_type), color, o.id);
              } else if (id === "A-07" && mode.startsWith("section_") && !hiddenStructureMark && a[0] >= view.x && a[0] < view.x + view.w && a[1] >= view.y && a[1] < view.y + view.h) {
                const mark = String(data(o).mark ?? o.object_type);
                const key = `${mark}|${a.map(value => value.toFixed(2)).join(",")}`;
                if (!emittedSectionMarks.has(key)) {
                  emittedSectionMarks.add(key);
                  if (!placeElevationMark(a, mark, color, true)) warnings.push(`A-07: could not place section mark without overlap (${mark})`);
                }
              } else if (
                !isBuildingElevation &&
                !hiddenStructureMark &&
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
            if ((id === "A-02" || id === "A-03") && mode === "xy") {
              for (const { object: floor } of viewObjects.filter(({ object }) => object.object_type === "architecture.floor")) {
                const d = data(floor), ring = d.boundary_mm as Vec2[] | undefined;
                const layers = Array.isArray(d.finish_layers) ? d.finish_layers as Array<{ material?: string }> : [];
                if (!ring || ring.length < 3) continue;
                const phase = getDisplayPhase(floor), phaseStyle = resolvePlanPhaseStyle(phase);
                const voids = (Array.isArray(d.voids_mm) ? d.voids_mm : []) as Vec2[][];
                if (phase === "demolition") {
                  for (const [a, b] of polygonDiagonalHatchSegments(ring, 250, voids))
                    planSurfacePatternPrimitives.push({ kind: "path", points: [mapped(a), mapped(b)], color: phaseStyle.stroke, width: 0.15 });
                }
                const patternKind = resolveArchitecturalFloorPatternKind(layers);
                if (!patternKind) continue;
                const spacing = d.finish_pattern_mm as Vec2 | undefined;
                const origin = d.finish_pattern_origin_mm as Vec2 | undefined;
                const stepX = spacing?.[0] ?? 600, stepY = spacing?.[1] ?? 600;
                const pattern = patternKind === "staggered_plank"
                  ? clippedStaggeredPlankSegments(ring, stepX, stepY, voids, origin ?? [0, 0], Number(d.finish_pattern_rotation_deg ?? 0))
                  : clippedGridSegments(ring, stepX, stepY, voids, origin ?? [0, 0], Number(d.finish_pattern_rotation_deg ?? 0));
                for (const [a, b] of pattern)
                  planSurfacePatternPrimitives.push({ kind: "path", points: [mapped(a), mapped(b)], color: phase === "demolition" ? phaseStyle.stroke : "#cbd5e1", width: 0.1, dash: phase === "demolition" ? [2, 1] : undefined });
              }
              // Floor hatches and tile courses are surface underlays. Emit them
              // before wall, stair, opening, and structural linework so patterns
              // cannot print across foreground geometry and annotations.
              primitives.splice(planGeometryInsertionIndex, 0, ...planSurfacePatternPrimitives);
              const pointInRoom = (point: Vec2, ring: Vec2[]) => {
                let inside = false;
                for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
                  const a = ring[index], b = ring[previous];
                  if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
                }
                return inside;
              };
              for (const { object: room } of viewObjects.filter(({ object }) => object.object_type === "architecture.room")) {
                const d = data(room), ring = d.boundary_mm as Vec2[] | undefined;
                if (!ring || ring.length < 3) continue;
                const center: Vec2 = polygonInteriorPoint(ring)
                  ?? [ring.reduce((sum, point) => sum + point[0], 0) / ring.length, ring.reduce((sum, point) => sum + point[1], 0) / ring.length];
                const number = String(d.number ?? d.mark ?? "").trim();
                const name = String(d.name ?? "Room").trim();
                const boundaryOpen = d.boundary_status === "unclosed";
                if (boundaryOpen) warnings.push(`${String(d.mark ?? room.id)}: wall loop no longer closes; room area omitted from the plan tag`);
                const title = [number, name, boundaryOpen ? "วงผนังเปิด" : ""].filter(Boolean).join("  ");
                const area = Number(d.area_mm2);
                const areaText = !boundaryOpen && Number.isFinite(area) && area > 0 ? `${(area / 1e6).toFixed(2)} m²` : "";
                const titleWidth = Math.max(8, title.length * 1.15), areaWidth = Math.max(8, areaText.length * 1.05);
                const tagWidth = Math.max(titleWidth, areaWidth), tagHeight = areaText ? 6 : 3.8;
                const offsets: Vec2[] = [[0, 0], [0, 8], [0, -8], [-8, 0], [8, 0], [0, 14], [0, -14], [-12, 8], [12, 8], [-12, -8], [12, -8]];
                let placed = false;
                for (const [offsetX, offsetY] of offsets) {
                  const anchor: Vec2 = [mapped(center)[0] + offsetX, mapped(center)[1] + offsetY];
                  const candidateWorld: Vec2 = [center[0] + offsetX * viewport.scale_denominator, center[1] - offsetY * viewport.scale_denominator];
                  const box: [number, number, number, number] = [anchor[0] - tagWidth / 2, anchor[1] - tagHeight / 2, anchor[0] + tagWidth / 2, anchor[1] + tagHeight / 2];
                  const inView = box[0] >= view.x && box[2] <= view.x + view.w && box[1] >= view.y && box[3] <= view.y + view.h;
                  const hitsLabel = planObjectLabelBoxes.some(([left, top, right, bottom]) => box[0] < right + 0.8 && box[2] > left - 0.8 && box[1] < bottom + 0.5 && box[3] > top - 0.5);
                  const hitsStair = planStairFootprintBoxes.some(([left, top, right, bottom]) => box[0] < right + 0.4 && box[2] > left - 0.4 && box[1] < bottom + 0.4 && box[3] > top - 0.4);
                  if (!inView || !pointInRoom(candidateWorld, ring) || hitsLabel || hitsStair) continue;
                  text([anchor[0] - titleWidth / 2, anchor[1] - 0.3], title, 2.2, boundaryOpen ? "#b91c1c" : colors[getDisplayPhase(room)], titleWidth);
                  if (areaText) text([anchor[0] - areaWidth / 2, anchor[1] + 2.2], areaText, 1.8, "#475569", areaWidth);
                  planObjectLabelBoxes.push(box);
                  placed = true;
                  break;
                }
                if (!placed) warnings.push(`${String(d.mark ?? room.id)}: could not place room tag inside its plan boundary`);
              }
            }
          if ((mode === "xy" && id.startsWith("A-") || isElevation && (id === "A-05" || id === "A-06")) && viewport.opening_overrides) {
            for (const opening of selected.filter((o) => o.object_type === "door_window.door" || o.object_type === "door_window.window")) {
              const override = viewport.opening_overrides[opening.id];
              if (!override) continue;
              const d = data(opening), host = project.objects[String(d.wall_id ?? "")];
              if (!host) continue;
              const wall = data(host), start = wall.start_point_mm as number[] | undefined, end = wall.end_point_mm as number[] | undefined;
              if (!start || !end) continue;
              const dx = end[0] - start[0], dy = end[1] - start[1], length = Math.hypot(dx, dy);
              if (length <= 0) continue;
              const ux = dx / length, uy = dy / length;
              const representation = representations.find((r) => r.object_id === opening.id);
              const shape = representation?.shape.kind === "opening" ? representation.shape : undefined;
              const width = Number(shape?.width_mm ?? d.width_mm ?? resolveCatalogType(project, opening.object_type, String(d.type_id ?? d.mark ?? ""))?.parameters.width_mm ?? 900);
              const height = Number(shape?.height_mm ?? d.height_mm ?? resolveCatalogType(project, opening.object_type, String(d.type_id ?? d.mark ?? ""))?.parameters.height_mm ?? 1200);
              const center = Number(d.offset_along_wall_mm ?? 0), left = center - width / 2;
              if (mode === "xy") {
                for (const line of override.lines ?? []) {
                  const x1 = left + resolveOpeningPlanSymbolX(line.start, width), x2 = left + resolveOpeningPlanSymbolX(line.end, width);
                  const p1 = mapped([start[0] + ux * x1 - uy * line.start.y_mm, start[1] + uy * x1 + ux * line.start.y_mm]);
                  const p2 = mapped([start[0] + ux * x2 - uy * line.end.y_mm, start[1] + uy * x2 + ux * line.end.y_mm]);
                  path([p1, p2], colors[getDisplayPhase(opening)], 0.25);
                }
              } else if (isElevation && override.elevation_lines?.length) {
                const expectedMode = Math.abs(ux) >= Math.abs(uy) ? "xz" : "yz";
                if (mode !== expectedMode) continue;
                const sill = Number(shape?.sill_height_mm ?? d.sill_height_mm ?? 0);
                for (const line of override.elevation_lines) {
                  const x1 = left + resolveOpeningPlanSymbolX(line.start, width), x2 = left + resolveOpeningPlanSymbolX(line.end, width);
                  const z1 = sill + height / 2 + resolveOpeningPlanSymbolY(line.start, height), z2 = sill + height / 2 + resolveOpeningPlanSymbolY(line.end, height);
                  const p1 = mapped(projectPoint([start[0] + ux * x1, start[1] + uy * x1, z1]));
                  const p2 = mapped(projectPoint([start[0] + ux * x2, start[1] + uy * x2, z2]));
                  path([p1, p2], colors[getDisplayPhase(opening)], 0.25);
                }
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
          if (mode !== "xy" && mode !== "rcp") {
            const glPt = mapped([minX, 0]);
            const glY = glPt[1];
            if (glY >= view.y && glY <= view.y + view.h) {
              // Building elevations show finished grade and earth poche, not
              // footings or column tails drawn through the soil hatch. Sections
              // intentionally keep their below-grade structural geometry.
              if (id === "A-05" || id === "A-06")
                path(
                  [
                    [view.x, glY],
                    [view.x + view.w, glY],
                    [view.x + view.w, view.y + view.h],
                    [view.x, view.y + view.h],
                  ],
                  "#ffffff",
                  0,
                  undefined,
                  true,
                  "#ffffff",
                );
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
                [view.x + 2, glY - 5],
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
                text([datumX + 2, a[1] - 4], elevStr, 2.2, "#0f172a");
              }
            }
          }
          if (mode === "xy" && (id === "A-02" || id === "A-03")) {
            for (const { object: o } of viewObjects.filter(({ object }) => object.object_type === "architecture.stair")) {
              const sd = data(o);
              const routes = stairPlanPaths(o.id);
              if (routes.length < 2) continue;
              const stepRoutes = routes.slice(0, -1);
              const walkline = routes[routes.length - 1];
              if (!walkline.length) continue;
              const sn = Number(sd.num_risers ?? 17);
              const wStart = mapped(projectPoint(walkline[0]));
              const wEnd = mapped(projectPoint(walkline[walkline.length - 1]));
              const geometryPoints = routes.flat().map((point) => mapped(projectPoint(point)));
              const stairBounds: [number, number, number, number] = [
                Math.min(...geometryPoints.map((point) => point[0])), Math.min(...geometryPoints.map((point) => point[1])),
                Math.max(...geometryPoints.map((point) => point[0])), Math.max(...geometryPoints.map((point) => point[1])),
              ];
              if (geometryPoints.some((point) => point[0] >= view.x && point[0] <= view.x + view.w && point[1] >= view.y && point[1] <= view.y + view.h)) {
                const upperPlan = id === "A-03";
                const arrowPoint = upperPlan ? wStart : wEnd;
                const arrowPrevious = mapped(projectPoint(walkline[upperPlan ? Math.min(1, walkline.length - 1) : Math.max(0, walkline.length - 2)]));
                const arrowDx = arrowPoint[0] - arrowPrevious[0], arrowDy = arrowPoint[1] - arrowPrevious[1];
                const arrowLength = Math.hypot(arrowDx, arrowDy) || 1;
                const along: Vec2 = [arrowDx / arrowLength, arrowDy / arrowLength], across: Vec2 = [-along[1], along[0]];
                path(
                  [
                    [arrowPoint[0] - along[0] * 3 + across[0] * 1.7, arrowPoint[1] - along[1] * 3 + across[1] * 1.7],
                    arrowPoint,
                    [arrowPoint[0] - along[0] * 3 - across[0] * 1.7, arrowPoint[1] - along[1] * 3 - across[1] * 1.7],
                  ],
                  "#0f172a",
                  0.35,
                );
                const longestWalkSegment = walkline.slice(1).map((point, index) => ({
                  a: walkline[index], b: point,
                  length: Math.hypot(point[0] - walkline[index][0], point[1] - walkline[index][1]),
                })).sort((a, b) => b.length - a.length)[0];
                const upAt = longestWalkSegment
                  ? mapped(projectPoint([
                      (longestWalkSegment.a[0] + longestWalkSegment.b[0]) / 2,
                      (longestWalkSegment.a[1] + longestWalkSegment.b[1]) / 2,
                      (longestWalkSegment.a[2] + longestWalkSegment.b[2]) / 2,
                    ]))
                  : wStart;
                text([upAt[0] - 2.5, upAt[1] - 2], upperPlan ? "DN" : "UP", 2.2, "#0f172a");
                text([wStart[0] - 2, wStart[1] + 4], upperPlan ? `${sn}` : "1", 2.0, "#64748b");
                text([wEnd[0] - 4, wEnd[1] + 4], upperPlan ? "1" : `${sn}`, 2.0, "#64748b");

                if (id === "A-02") {
                  const cutStep = stepRoutes[Math.max(0, Math.min(stepRoutes.length - 1, Math.floor(sn / 2) - 1))];
                  if (!cutStep) continue;
                  const [cutStart, cutEnd] = cutStep;
                  const cutStart3: Vec3 = [cutStart[0] - 120, cutStart[1] - 80, cutStart[2]];
                  const cutEnd3: Vec3 = [cutEnd[0] + 120, cutEnd[1] + 80, cutEnd[2]];
                  const c1 = mapped(projectPoint(cutStart3));
                  const c2 = mapped(projectPoint(cutEnd3));
                  path([c1, c2], "#0f172a", 0.25, [2, 1]);
                  const label = "แนวตัดบันได 1FL", labelWidth = 21;
                  const labelCandidates: Array<{ at: Vec2; leader: Vec2[] }> = [
                    { at: [(stairBounds[0] + stairBounds[2] - labelWidth) / 2, stairBounds[3] + 5], leader: [[(c1[0] + c2[0]) / 2, (c1[1] + c2[1]) / 2], [(c1[0] + c2[0]) / 2, stairBounds[3] + 3]] },
                    { at: [(stairBounds[0] + stairBounds[2] - labelWidth) / 2, stairBounds[1] - 5], leader: [[(c1[0] + c2[0]) / 2, (c1[1] + c2[1]) / 2], [(c1[0] + c2[0]) / 2, stairBounds[1] - 3]] },
                    { at: [stairBounds[2] + 4, (stairBounds[1] + stairBounds[3]) / 2], leader: [[(c1[0] + c2[0]) / 2, (c1[1] + c2[1]) / 2], [stairBounds[2] + 3, (stairBounds[1] + stairBounds[3]) / 2]] },
                    { at: [stairBounds[0] - labelWidth - 4, (stairBounds[1] + stairBounds[3]) / 2], leader: [[(c1[0] + c2[0]) / 2, (c1[1] + c2[1]) / 2], [stairBounds[0] - 3, (stairBounds[1] + stairBounds[3]) / 2]] },
                  ];
                  let placedCutLabel = false;
                  for (const candidate of labelCandidates) {
                    const box: [number, number, number, number] = [candidate.at[0], candidate.at[1] - 2.1, candidate.at[0] + labelWidth, candidate.at[1] + 0.6];
                    if (box[0] < view.x || box[2] > view.x + view.w || box[1] < view.y || box[3] > view.y + view.h) continue;
                    if (planObjectLabelBoxes.some(([left, top, right, bottom]) => box[0] < right + 0.8 && box[2] > left - 0.8 && box[1] < bottom + 0.5 && box[3] > top - 0.5)) continue;
                    path(candidate.leader, "#94a3b8", 0.15);
                    text(candidate.at, label, 1.8, "#64748b", labelWidth);
                    planObjectLabelBoxes.push(box);
                    placedCutLabel = true;
                    break;
                  }
                  if (!placedCutLabel) warnings.push(`A-02: could not place stair cut label outside ST1`);
                }
              }
            }
          }
          if (id === "A-10" && mode === "rcp") {
            const ceilings = selected.filter(object => object.object_type === "architecture.ceiling");
            const rcpCeilingLabels: Array<{ box: Vec2[]; at: Vec2; text: string; size: number; color: string; maxWidth: number }> = [];
            for (const ceiling of ceilings) {
              const d = data(ceiling), ring = d.boundary_mm as Vec2[] | undefined;
              const phase = getDisplayPhase(ceiling), phaseStyle = resolvePlanPhaseStyle(phase);
              if (d.room_boundary_status === "unclosed") warnings.push(`${String(d.mark ?? ceiling.id)}: source room boundary is open; verify ceiling extent before issue`);
              if (!ring || ring.length < 3) continue;
              const voids = (d.voids_mm as Vec2[][] | undefined) ?? [];
              const phaseDash = phase === "demolition" ? [2, 1] : undefined;
              path(ring.map(mapped), phaseStyle.stroke, phase === "new_construction" ? 0.5 : phase === "demolition" ? 0.35 : 0.25,
                phaseDash, true, phase === "existing" ? "#ffffff" : phaseStyle.fill);
              // Knock the opening out of the ceiling poche before drawing its
              // outline. The grid is clipped around voids below, so leaving
              // the fill intact here made a shaft/skylight look like a solid
              // ceiling on A-10 even though the grid stopped at its boundary.
              for (const hole of voids) path(hole.map(mapped), phaseStyle.stroke, 0.25, [2, 1], true, "#ffffff");
              if (phase === "demolition") {
                for (const [a, b] of polygonDiagonalHatchSegments(ring, 250, voids))
                  path([mapped(a), mapped(b)], phaseStyle.stroke, 0.15);
              }
              const grid = d.grid_mm as Vec2 | undefined;
              if (grid && grid[0] > 0 && grid[1] > 0) {
                const gridStyle = resolveCeilingGridStyle(phase);
                for (const [a, b] of clippedGridSegments(ring, grid[0], grid[1], voids))
                  path([mapped(a), mapped(b)], gridStyle.stroke, 0.12, gridStyle.dash);
              }
              const center: Vec2 = polygonInteriorPoint(ring) ?? [ring.reduce((sum, point) => sum + point[0], 0) / ring.length, ring.reduce((sum, point) => sum + point[1], 0) / ring.length];
              const resolvedElevation = resolveArchitectureSurfaceElevation(project, ceiling);
              if (resolvedElevation === undefined) warnings.push(`${String(d.mark ?? ceiling.id)}: ceiling level/elevation reference is invalid`);
              const ceilingLabel = `${String(d.mark ?? "C")}: ${String(d.material ?? "ฝ้า")}  ${resolvedElevation === undefined ? "ระดับไม่ถูกต้อง" : `+${(resolvedElevation / 1000).toFixed(3)} m`}`;
              const labelSize = 2.1, labelMaxWidth = 55;
              const labelWidth = Math.min(labelMaxWidth, [...ceilingLabel].length * labelSize * 0.62);
              const labelWidthMm = labelWidth * viewport.scale_denominator;
              const labelHeightMm = (labelSize + 1.2) * viewport.scale_denominator;
              const gridStep = grid && grid[0] > 0 && grid[1] > 0 ? grid : [600, 600];
              const labelOffsets: Vec2[] = [[0, 0]];
              for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -2], [0, 2]])
                labelOffsets.push([dx * Math.max(gridStep[0], labelWidthMm * 0.7), dy * Math.max(gridStep[1], labelHeightMm)]);
              const voidBounds = voids.map(hole => ({
                left: Math.min(...hole.map(point => point[0])), right: Math.max(...hole.map(point => point[0])),
                bottom: Math.min(...hole.map(point => point[1])), top: Math.max(...hole.map(point => point[1])),
              }));
              const labelAnchor = labelOffsets
                .map(([dx, dy]) => [center[0] + dx, center[1] + dy] as Vec2)
                .find(([x, y]) => {
                  const left = x - labelWidthMm / 2, right = x + labelWidthMm / 2;
                  const bottom = y - labelHeightMm / 2, top = y + labelHeightMm / 2;
                  const corners: Vec2[] = [[left, bottom], [right, bottom], [right, top], [left, top]];
                  return corners.every(corner => isPointIn2DPoly(corner, ring)) &&
                    !voidBounds.some(hole => left < hole.right && right > hole.left && bottom < hole.top && top > hole.bottom);
                });
              if (!labelAnchor) warnings.push(`${String(d.mark ?? ceiling.id)}: no clear RCP label area outside ceiling openings`);
              const labelCenter = mapped(labelAnchor ?? center);
              const labelAt: Vec2 = [labelCenter[0] - labelWidth / 2, labelCenter[1]];
              const labelBox: Vec2[] = [
                [labelAt[0] - 0.8, labelAt[1] - labelSize - 0.4],
                [labelAt[0] + labelWidth + 0.8, labelAt[1] - labelSize - 0.4],
                [labelAt[0] + labelWidth + 0.8, labelAt[1] + 0.4],
                [labelAt[0] - 0.8, labelAt[1] + 0.4],
              ];
              // Draw every ceiling's outline, voids, and grid before any labels.
              // Otherwise a later adjacent ceiling can draw its grid over an
              // earlier label's white knockout and reduce print legibility.
              rcpCeilingLabels.push({ box: labelBox, at: labelAt, text: ceilingLabel, size: labelSize, color: phaseStyle.stroke, maxWidth: labelWidth });
              sourceIds.add(ceiling.id);
            }
            for (const label of rcpCeilingLabels) path(label.box, "#ffffff", 0, undefined, true, "#ffffff");
            for (const label of rcpCeilingLabels) text(label.at, label.text, label.size, label.color, label.maxWidth);
            for (const room of selected.filter(object => object.object_type === "architecture.room")) {
              const d = data(room), ring = d.boundary_mm as Vec2[] | undefined;
              const phase = getDisplayPhase(room), phaseStyle = resolvePlanPhaseStyle(phase);
              if (d.boundary_status === "unclosed") warnings.push(`${String(d.mark ?? room.id)}: wall loop no longer closes; displayed room area is last known`);
              if (!ring || ring.length < 3) continue;
              path(ring.map(mapped), phaseStyle.stroke, 0.18, phase === "demolition" ? [2, 1] : undefined, true);
            }
            for (const floor of selected.filter(object => object.object_type === "architecture.floor")) {
              const d = data(floor), ring = d.boundary_mm as Vec2[] | undefined;
              const phase = getDisplayPhase(floor), phaseStyle = resolvePlanPhaseStyle(phase);
              if (d.room_boundary_status === "unclosed") warnings.push(`${String(d.mark ?? floor.id)}: source room boundary is open; verify floor extent before issue`);
              if (ring && ring.length >= 3) path(ring.map(mapped), phaseStyle.stroke, 0.2, phase === "demolition" ? [2, 1] : [3, 1], true);
            }
            text([view.x + 2, view.y + view.h - 3], ceilings.length ? "RCP · ขอบเขตฝ้า ช่องเปิด และกริดตามค่าจริงของแต่ละฝ้า" : "RCP · ยังไม่มีวัตถุฝ้าในชั้นนี้", 2.1, "#475569", 240);
          }
          if ((id === "A-02" || id === "A-03") && mode === "xy") {
            const dimensionColor = "#475569";
            const drawDimension = (dimensionId: string, a: Vec2, b: Vec2, label: string, witnessA?: Vec2, witnessB?: Vec2) => {
              const override = viewport.dimension_overrides?.[dimensionId];
              const delta = override?.locked ? override.offset_mm : [0, 0];
              const baseA = mapped(a), baseB = mapped(b);
              const pa: Vec2 = [baseA[0] + delta[0], baseA[1] + delta[1]];
              const pb: Vec2 = [baseB[0] + delta[0], baseB[1] + delta[1]];
              if (witnessA) path([mapped(witnessA), pa], dimensionColor, 0.1);
              if (witnessB) path([mapped(witnessB), pb], dimensionColor, 0.1);
              const dx = pb[0] - pa[0], dy = pb[1] - pa[1], length = Math.hypot(dx, dy);
              if (length < 1e-6) return;
              const tangent: Vec2 = [dx / length, dy / length], normal: Vec2 = [-tangent[1], tangent[0]];
              const width = Math.max(5, [...label].length * 0.88), halfGap = width / 2 + 0.8;
              const center: Vec2 = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
              if (length / 2 > halfGap) {
                path([pa, [center[0] - tangent[0] * halfGap, center[1] - tangent[1] * halfGap]], dimensionColor, 0.14);
                path([[center[0] + tangent[0] * halfGap, center[1] + tangent[1] * halfGap], pb], dimensionColor, 0.14);
              } else path([pa, pb], dimensionColor, 0.14);
              for (const point of [pa, pb]) path([
                [point[0] - tangent[0] * 0.8 - normal[0] * 0.8, point[1] - tangent[1] * 0.8 - normal[1] * 0.8],
                [point[0] + tangent[0] * 0.8 + normal[0] * 0.8, point[1] + tangent[1] * 0.8 + normal[1] * 0.8],
              ], dimensionColor, 0.18);
              text([center[0] - width / 2, center[1] - 0.8], label, 1.7, dimensionColor, width);
              const labelPrimitive = primitives.at(-1);
              if (labelPrimitive?.kind === "text") labelPrimitive.dimension_id = dimensionId;
            };
            const planPoints = viewObjects.filter(({ object }) => object.object_type !== "structure.grid")
              .flatMap(({ mesh, out }) => [...mesh.flat(), ...((out?.paths ?? []).flat() as Vec3[])])
              .filter(point => Array.isArray(point) && point.length >= 2 && point.slice(0, 3).every(Number.isFinite))
              .map(projectPoint);
            if (planPoints.length) {
              const bounds = {
                minX: Math.min(...planPoints.map(point => point[0])), maxX: Math.max(...planPoints.map(point => point[0])),
                minY: Math.min(...planPoints.map(point => point[1])), maxY: Math.max(...planPoints.map(point => point[1])),
              };
              const gridObjects = viewObjects.filter(({ object }) => object.object_type === "structure.grid");
              const gridX = gridObjects.filter(({ object }) => data(object).orientation === "vertical")
                .map(({ object }) => ({ id: object.id, position: Number(data(object).position_mm) })).filter(item => Number.isFinite(item.position)).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
              const gridY = gridObjects.filter(({ object }) => data(object).orientation === "horizontal")
                .map(({ object }) => ({ id: object.id, position: Number(data(object).position_mm) })).filter(item => Number.isFinite(item.position)).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
              for (let index = 0; index + 1 < gridX.length; index++) {
                const from = gridX[index]!, to = gridX[index + 1]!, a = from.position, b = to.position, y = bounds.minY - 350;
                drawDimension(`grid-x:${from.id}:${to.id}`, [a, y], [b, y], `${((b - a) / 1000).toFixed(2)} m`, [a, bounds.minY], [b, bounds.minY]);
              }
              for (let index = 0; index + 1 < gridY.length; index++) {
                const from = gridY[index]!, to = gridY[index + 1]!, a = from.position, b = to.position, x = bounds.minX - 350;
                drawDimension(`grid-y:${from.id}:${to.id}`, [x, a], [x, b], `${((b - a) / 1000).toFixed(2)} m`, [bounds.minX, a], [bounds.minX, b]);
              }
              {
                const rows = new Map<number, Array<{ x: number; id: string }>>();
                for (const { object } of viewObjects.filter(({ object }) => object.object_type === "structure.column")) {
                  const location = data(object).location_mm as Vec3 | undefined;
                  if (!location || !location.slice(0, 2).every(Number.isFinite)) continue;
                  const key = Math.round(location[1]); rows.set(key, [...(rows.get(key) ?? []), { x: location[0], id: object.id }]);
                }
                const row = [...rows.entries()].sort((a, b) => b[1].length - a[1].length)[0];
                if (row && row[1].length > 1) {
                  const y = row[0] - (gridX.length > 1 ? 600 : 350), points = [...new Map(row[1].map(point => [`${point.x}:${point.id}`, point])).values()].sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
                  for (let index = 0; index + 1 < points.length; index++) {
                    const from = points[index]!, to = points[index + 1]!, a = from.x, b = to.x;
                    drawDimension(`columns-x:${from.id}:${to.id}`, [a, y], [b, y], `${((b - a) / 1000).toFixed(2)} m`, [a, row[0]], [b, row[0]]);
                  }
                }
              }
              {
                const columnsByLine = new Map<number, Array<{ y: number; id: string }>>();
                for (const { object } of viewObjects.filter(({ object }) => object.object_type === "structure.column")) {
                  const location = data(object).location_mm as Vec3 | undefined;
                  if (!location || !location.slice(0, 2).every(Number.isFinite)) continue;
                  const key = Math.round(location[0]); columnsByLine.set(key, [...(columnsByLine.get(key) ?? []), { y: location[1], id: object.id }]);
                }
                const column = [...columnsByLine.entries()].sort((a, b) => b[1].length - a[1].length)[0];
                if (column && column[1].length > 1) {
                  const x = column[0] - (gridY.length > 1 ? 600 : 350), points = [...new Map(column[1].map(point => [`${point.y}:${point.id}`, point])).values()].sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
                  for (let index = 0; index + 1 < points.length; index++) {
                    const from = points[index]!, to = points[index + 1]!, a = from.y, b = to.y;
                    drawDimension(`columns-y:${from.id}:${to.id}`, [x, a], [x, b], `${((b - a) / 1000).toFixed(2)} m`, [column[0], a], [column[0], b]);
                  }
                }
              }
              const boundIds = viewObjects.filter(({ object }) => object.object_type === "architecture.wall").map(({ object }) => object.id).sort().join(":");
              drawDimension(`overall-x:${boundIds}`, [bounds.minX, bounds.minY - 900], [bounds.maxX, bounds.minY - 900], `${((bounds.maxX - bounds.minX) / 1000).toFixed(2)} m`, [bounds.minX, bounds.minY], [bounds.maxX, bounds.minY]);
              drawDimension(`overall-y:${boundIds}`, [bounds.minX - 900, bounds.minY], [bounds.minX - 900, bounds.maxY], `${((bounds.maxY - bounds.minY) / 1000).toFixed(2)} m`, [bounds.minX, bounds.minY], [bounds.minX, bounds.maxY]);

              const openingOffsetByWall = new Map<string, number>();
              for (const { object: opening } of viewObjects.filter(({ object }) => object.object_type === "door_window.door" || object.object_type === "door_window.window")) {
                const openingData = resolvedData(project, opening), hostId = String(openingData.wall_id ?? ""), host = project.objects[hostId];
                if (!host || host.object_type !== "architecture.wall") continue;
                const wall = data(host), start = wall.start_point_mm as Vec3 | undefined, end = wall.end_point_mm as Vec3 | undefined;
                if (!start || !end) continue;
                const dx = end[0] - start[0], dy = end[1] - start[1], length = Math.hypot(dx, dy);
                const width = Number(openingData.width_mm ?? data(opening).width_mm), height = Number(openingData.height_mm ?? data(opening).height_mm);
                const offsetAlong = Number(openingData.offset_along_wall_mm ?? data(opening).offset_along_wall_mm);
                if (!(length > 0 && width > 0 && width <= length && Number.isFinite(offsetAlong))) continue;
                const tangent: Vec2 = [dx / length, dy / length], normal: Vec2 = [-tangent[1], tangent[0]];
                const center: Vec2 = [start[0] + tangent[0] * offsetAlong, start[1] + tangent[1] * offsetAlong];
                const half = width / 2;
                const planCenter: Vec2 = [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2];
                const sign = (center[0] - planCenter[0]) * normal[0] + (center[1] - planCenter[1]) * normal[1] < 0 ? 1 : -1;
                const offset = 450 + (openingOffsetByWall.get(hostId) ?? 0);
                openingOffsetByWall.set(hostId, (openingOffsetByWall.get(hostId) ?? 0) + 250);
                const jambA: Vec2 = [center[0] - tangent[0] * half, center[1] - tangent[1] * half];
                const jambB: Vec2 = [center[0] + tangent[0] * half, center[1] + tangent[1] * half];
                const dimA: Vec2 = [jambA[0] + normal[0] * sign * offset, jambA[1] + normal[1] * sign * offset];
                const dimB: Vec2 = [jambB[0] + normal[0] * sign * offset, jambB[1] + normal[1] * sign * offset];
                const mark = String(openingData.mark ?? data(opening).mark ?? "Opening");
                const label = `${mark} ${ (width / 1000).toFixed(2) }×${Number.isFinite(height) ? (height / 1000).toFixed(2) : "?"} m`;
                drawDimension(`opening:${opening.id}:width`, dimA, dimB, label, jambA, jambB);
              }
            }
          }
          text(
            [view.x, 35],
            id === "A-05"
              ? mode === "xz" ? "NORTH / ทิศเหนือ" : "EAST / ทิศตะวันออก"
              : id === "A-06"
                ? mode === "xz" ? "SOUTH / ทิศใต้" : "WEST / ทิศตะวันตก"
                : mode === "xy"
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
        // Model schedules belong on schedule/discipline sheets. Appending the
        // full object schedule to every geometric view crowds the drawing and
        // can produce misleading overflow warnings on elevations and plans.
        const hasDedicatedScheduleSheet = [
          "A-02", "A-03", "A-04", "A-05", "A-06", "A-07", "A-08",
          "A-09", "A-10", "S-01", "S-02", "S-03", "S-04", "S-05", "S-06",
        ].includes(id);
        if (schedules.length && !hasDedicatedScheduleSheet)
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

          const startY = 182;
          const cardH = 82;

          // Card 1: [ DETAIL-B1 ] แบบขยายรูปตัดพื้นลดระดับและธรณีกันน้ำ คสล. · 1:20
          const c1X = 18;
          const c1W = 124;
          path([[c1X, startY], [c1X + c1W, startY], [c1X + c1W, startY + cardH], [c1X, startY + cardH]], "#cbd5e1", 0.25, undefined, true, "#ffffff");
          path([[c1X, startY], [c1X + c1W, startY], [c1X + c1W, startY + 8], [c1X, startY + 8]], "#e2e8f0", 0.2, undefined, true, "#f1f5f9");
          text([c1X + 2.5, startY + 5.5], "[ DETAIL-B1 ] แบบขยายรูปตัดพื้นลดระดับและธรณีกันน้ำ คสล. · 1:20", 2.1, "#0f172a");

          // Sub-box for drawing
          const sb1X = c1X + 3;
          const sb1Y = startY + 10;
          const sb1W = c1W - 6;
          const sb1H = 46;
          path([[sb1X, sb1Y], [sb1X + sb1W, sb1Y], [sb1X + sb1W, sb1Y + sb1H], [sb1X, sb1Y + sb1H]], "#e2e8f0", 0.15, undefined, true, "#fafafa");

          // Profile of slab
          const slabY0 = sb1Y + 12; // Exterior floor
          const slabYDry = slabY0 + 6; // Dry zone (-50mm)
          const curbW = 10;
          const curbH = 6;
          const curbX = sb1X + 54;
          const slabYWet = slabYDry + 6; // Wet zone (-100mm)
          const baseThick = 12;

          // Concrete fill
          path([
            [sb1X + 3, slabY0],
            [sb1X + 25, slabY0],
            [sb1X + 25, slabYDry],
            [curbX, slabYDry],
            [curbX, slabYDry - curbH],
            [curbX + curbW, slabYDry - curbH],
            [curbX + curbW, slabYWet],
            [sb1X + sb1W - 3, slabYWet],
            [sb1X + sb1W - 3, slabYWet + baseThick],
            [sb1X + 3, slabY0 + baseThick + 12],
          ], "#0284c7", 0.35, undefined, true, "#e0f2fe");

          // Waterproof membrane (dashed blue line)
          path([
            [sb1X + 25, slabYDry - 8],
            [sb1X + 25, slabYDry + 1],
            [curbX - 1, slabYDry + 1],
            [curbX - 1, slabYDry - curbH + 1],
            [curbX + curbW + 1, slabYDry - curbH + 1],
            [curbX + curbW + 1, slabYWet + 1],
            [sb1X + sb1W - 3, slabYWet + 1],
            [sb1X + sb1W - 3, slabYWet - 18],
          ], "#0284c7", 0.3, [2, 1]);

          // Drain point
          const drainX = sb1X + sb1W - 14;
          path([[drainX - 3, slabYWet], [drainX + 3, slabYWet], [drainX + 3, slabYWet + 4], [drainX - 3, slabYWet + 4]], "#0f172a", 0.25, undefined, true, "#334155");
          path([[drainX - 1.5, slabYWet + 4], [drainX - 1.5, slabYWet + 10], [drainX + 1.5, slabYWet + 10], [drainX + 1.5, slabYWet + 4]], "#475569", 0.2);

          // Labels
          text([sb1X + 4, slabY0 - 2], "▲ ทางเดิน +0.00", 1.7, "#0f172a");
          text([sb1X + 28, slabYDry - 2], "▼ โซนแห้ง -0.05", 1.7, "#0369a1");
          text([curbX - 1, slabYDry - curbH - 2], "▲ ธรณี 10x5ซม.", 1.7, "#b45309");
          text([curbX + curbW + 4, slabYWet - 2], "▼ โซนเปียก -0.10", 1.7, "#0369a1");
          text([drainX - 10, slabYWet + 8], "FD (Slope 1:50)", 1.6, "#475569");
          text([sb1X + sb1W - 28, slabYWet - 19], "กันซึมสูง >= 1.80ม.", 1.5, "#0284c7");

          // Notes below sub-box
          const b1NoteY = startY + 59;
          text([c1X + 3, b1NoteY], "• พื้น คสล. ลดระดับ 50-100 มม. หล่อในที่ ป้องกันน้ำรั่วซึม", 1.7, "#334155");
          text([c1X + 3, b1NoteY + 4.5], "• ธรณีกันน้ำ คสล. 10x5 ซม. ปูกระเบื้องทับด้วยกาวซีเมนต์กันซึม", 1.7, "#334155");
          text([c1X + 3, b1NoteY + 9], "• ระบบกันซึมสูตรซีเมนต์ยืดหยุ่น ทาสูงรอบห้อง >= 30 ซม. (โซนอาบน้ำ >= 1.80 ม.)", 1.7, "#334155");
          text([c1X + 3, b1NoteY + 13.5], "• กระเบื้องปูพื้นเซรามิกกันลื่น (R10) ปูลาดเอียง 1:50 สู่ Floor Drain", 1.7, "#334155");

          // Card 2: [ DETAIL-B2 ] ข้อกำหนดระยะติดตั้งสุขภัณฑ์และท่อน้ำ (วสท.)
          const c2X = 146;
          const c2W = 126;
          path([[c2X, startY], [c2X + c2W, startY], [c2X + c2W, startY + cardH], [c2X, startY + cardH]], "#cbd5e1", 0.25, undefined, true, "#ffffff");
          path([[c2X, startY], [c2X + c2W, startY], [c2X + c2W, startY + 8], [c2X, startY + 8]], "#e2e8f0", 0.2, undefined, true, "#f1f5f9");
          text([c2X + 2.5, startY + 5.5], "[ DETAIL-B2 ] ข้อกำหนดระยะติดตั้งสุขภัณฑ์และท่อน้ำ (วสท.)", 2.1, "#0f172a");

          const toiletRoughIn = d ? Number(d.toilet_rough_in_mm) : 305;
          const slopeRatio = d ? Math.round(1 / Number(d.slope_ratio)) : 50;
          const b2Specs = [
            `1. โถสุขภัณฑ์ (WC): ท่อโสโครก Ø4" กึ่งกลางห่างผนัง ${toiletRoughIn} มม. (Rough-in)`,
            "2. สายฉีดชำระ (Bidet): กึ่งกลางก๊อกสูง +0.60 ม. (ด้านขวาโถสุขภัณฑ์)",
            "3. อ่างล้างหน้า (Basin): กึ่งกลางก๊อกสูง +0.80 ม. / ท่อน้ำทิ้ง Ø1.5\" สูง +0.50 ม.",
            "4. ฝักบัวอาบน้ำ (Shower): วาล์วผสมสูง +1.00 ม. / ฝักบัวก้านแข็งสูง +2.00 ม.",
            "5. ที่ใส่กระดาษชำระ: กึ่งกลางสูง +0.70 ม. จากพื้นกระเบื้อง",
            "6. ตะแกรงดักกลิ่น (FD): ตะแกรงสแตนเลส Ø2\"-3\" ดักกลิ่นด้วย P-Trap ลึก >= 50 มม.",
            `7. สโลปพื้นห้องน้ำ: ลาดเอียง 1:${slopeRatio} (2 ซม./เมตร) สู่ Floor Drain โดยไม่มีน้ำขัง`,
          ];
          b2Specs.forEach((spec, sIdx) => {
            const rowY = startY + 12 + sIdx * 9.8;
            path([[c2X + 2, rowY + 6.5], [c2X + c2W - 2, rowY + 6.5]], "#f1f5f9", 0.15);
            text([c2X + 3, rowY + 4], spec, 1.8, "#334155", c2W - 6);
          });

          // Card 3: [ DETAIL-RF ] รอยต่อกันซึมหลังคาชนผนังเดิม (Flashing & PU)
          const c3X = 276;
          const c3W = 119;
          path([[c3X, startY], [c3X + c3W, startY], [c3X + c3W, startY + cardH], [c3X, startY + cardH]], "#cbd5e1", 0.25, undefined, true, "#ffffff");
          path([[c3X, startY], [c3X + c3W, startY], [c3X + c3W, startY + 8], [c3X, startY + 8]], "#e2e8f0", 0.2, undefined, true, "#f1f5f9");
          text([c3X + 2.5, startY + 5.5], "[ DETAIL-RF ] รอยต่อกันซึมหลังคาชนผนังเดิม (Flashing & PU)", 2.1, "#0f172a");

          // Sub-box for drawing
          const sb3X = c3X + 3;
          const sb3Y = startY + 10;
          const sb3W = c3W - 6;
          const sb3H = 46;
          path([[sb3X, sb3Y], [sb3X + sb3W, sb3Y], [sb3X + sb3W, sb3Y + sb3H], [sb3X, sb3Y + sb3H]], "#e2e8f0", 0.15, undefined, true, "#fafafa");

          // Existing wall on the left
          const wallEndX = sb3X + 28;
          path([[sb3X + 2, sb3Y + 2], [wallEndX, sb3Y + 2], [wallEndX, sb3Y + sb3H - 2], [sb3X + 2, sb3Y + sb3H - 2]], "#94a3b8", 0.35, undefined, true, "#f1f5f9");

          // Chase groove in wall (25mm deep)
          const chaseY = sb3Y + 14;
          const chaseDepth = 6;
          path([
            [wallEndX, chaseY - 3],
            [wallEndX - chaseDepth, chaseY - 3],
            [wallEndX - chaseDepth, chaseY + 3],
            [wallEndX, chaseY + 3],
          ], "#475569", 0.3, undefined, true, "#0284c7");

          // Flashing sheet
          path([
            [wallEndX - chaseDepth + 1, chaseY],
            [wallEndX, chaseY],
            [wallEndX + 3, chaseY + 4],
            [wallEndX + 4, chaseY + 12],
            [sb3X + sb3W - 8, chaseY + 22],
          ], "#0284c7", 0.5);

          // Roof sheet
          path([
            [wallEndX + 6, chaseY + 14],
            [sb3X + sb3W - 4, chaseY + 25],
          ], "#0f172a", 0.45);

          // Fastener screw
          const screwX = wallEndX + 22;
          const screwY = chaseY + 16.5;
          path([[screwX, screwY - 3], [screwX, screwY + 4]], "#0f172a", 0.3);
          path([[screwX - 2, screwY - 2], [screwX + 2, screwY - 2]], "#b45309", 0.3);

          // Callouts
          text([sb3X + 4, sb3Y + 6], "ผนังอาคารเดิม", 1.7, "#475569");
          text([wallEndX - 20, chaseY + 9], "กรีดร่อง 25มม. + PU Sealant", 1.5, "#0284c7");
          text([screwX - 8, screwY - 5], "สกรู + ซีลยาง EPDM", 1.5, "#475569");
          text([sb3X + sb3W - 35, chaseY + 30], "หลังคาใหม่ (สโลป >= 5°)", 1.7, "#0f172a");

          // Notes below sub-box
          const rfNoteY = startY + 59;
          text([c3X + 3, rfNoteY], "• รอยต่อระหว่างอาคารเดิมและส่วนต่อเติมต้องแยกโครงสร้างขาดจากกัน", 1.7, "#334155");
          text([c3X + 3, rfNoteY + 4.5], "• แผ่น Flashing สเตนเลส/กัลวาไนซ์ 0.5 มม. พับปีกเสียบร่องลึก 25 มม.", 1.7, "#334155");
          text([c3X + 3, rfNoteY + 9], "• ยาแนวด้วย Polyurethane (PU) Sealant ป้องกันการแตกร้าวและน้ำซึม 100%", 1.7, "#334155");
          text([c3X + 3, rfNoteY + 13.5], "• รอยต่อ Flashing ทับซ้อนกันไม่น้อยกว่า 150 มม. พร้อมย้ำรีเวทและยาแนว", 1.7, "#334155");
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
      const s06Beams = id === "S-06"
        ? selected.filter((o) => o.object_type === "structure.beam")
        : [];
      const s06RebarRoles = new Map<string, Set<string>>();
      if (id === "S-06") for (const o of selected) {
        if (o.object_type !== "structure.rebar_set") continue;
        const d = data(o), hostId = d.host_id, role = d.role;
        if (typeof hostId !== "string" || typeof role !== "string") continue;
        const roles = s06RebarRoles.get(hostId) ?? new Set<string>();
        roles.add(role);
        s06RebarRoles.set(hostId, roles);
      }
      const s06RequiredRoles = ["top", "bottom", "stirrups"];
      const s06IncompleteBeams = s06Beams.filter((beam) => {
        const roles = s06RebarRoles.get(beam.id);
        return !roles || s06RequiredRoles.some((role) => !roles.has(role));
      });
      const s06BbsMissing = id === "S-06" && (
        s06Beams.length === 0 || s06IncompleteBeams.length > 0
      );
      if (s06BbsMissing) warnings.push(
        s06Beams.length === 0
          ? "BBS requires modeled beams with top, bottom, and stirrup reinforcement sets"
          : `BBS reinforcement is incomplete for ${s06IncompleteBeams.length} of ${s06Beams.length} modeled beams; add top, bottom, and stirrup sets to each beam`,
      );
      if (id === "A-10" && !selected.some(object => object.object_type === "architecture.ceiling"))
        warnings.push("RCP has no modeled ceiling objects for this level; add rooms/ceilings and set their grid and elevation");
      if (id === "A-07")
        warnings.push(
          "Sections show geometric intersections; annotation and construction detail review required",
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
        isA01Missing || (!selected.length && id !== "A-01") || missingRequired || s06BbsMissing
          ? "missing_data"
          : (project.legal_metadata?.signatories?.issue_approved ? "issued" : "draft");
      return {
        id,
        title: displayTitle,
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

/**
 * Compile the fixed permit package, then add one independent architectural and
 * structural plan for every level not already represented by the four legacy
 * A-02/A-03/S-02/S-03 viewports. Dynamic sheets are saved as normal viewports
 * (for example A-02-L3) and share the same vector generation path as the base
 * sheets.
 */
export function compilePermitDrawingSet(
  project: ProjectDocument,
  options: PermitOptions = {},
): PermitDrawingSet {
  const base = compilePermitDrawingSetBase(project, options);
  const levels = [...project.levels].sort(
    (a, b) => a.elevation_mm - b.elevation_mm,
  );
  const savedViewports = {
    ...project.drawing_settings?.viewports,
    ...options.viewports,
  };
  const represented = {
    architecture: new Set([
      savedViewports["A-02"]?.level_id ?? levels[0]?.id,
      savedViewports["A-03"]?.level_id ?? levels[1]?.id ?? levels[0]?.id,
    ].filter((id): id is string => Boolean(id))),
    structure: new Set([
      savedViewports["S-02"]?.level_id ?? levels[0]?.id,
      savedViewports["S-03"]?.level_id ?? levels[1]?.id ?? levels[0]?.id,
    ].filter((id): id is string => Boolean(id))),
  };
  const extras: PermitSheet[] = [];

  const compileLevelSheet = (
    level: ProjectDocument["levels"][number],
    levelIndex: number,
    baseId: "A-02" | "S-02",
  ) => {
    const id = `${baseId}-L${levelIndex + 1}`;
    const saved = savedViewports[id];
    const viewport: SheetViewport = {
      scale_denominator: saved?.scale_denominator ?? 100,
      ...saved,
      level_id: level.id,
    };
    const viewports = { ...savedViewports, [baseId]: viewport };
    const levelOptions: PermitOptions = { ...options, viewports };
    const template = compilePermitDrawingSetBase(project, levelOptions)
      .sheets.find((sheet) => sheet.id === baseId);
    if (!template) return;
    const title = `${template.title} · ${level.name}`;
    const primitives = template.primitives.map((primitive) =>
      primitive.kind === "text" && primitive.at[0] === 14 && primitive.at[1] === 22
        ? { ...primitive, text: title }
        : primitive,
    );
    extras.push({
      ...template,
      id,
      title,
      primitives,
      svg: primitivesToSvg(primitives),
      warnings: template.warnings.map((warning) =>
        warning.replaceAll(baseId, id),
      ),
      viewport,
    });
  };

  levels.forEach((level, index) => {
    if (!represented.architecture.has(level.id))
      compileLevelSheet(level, index, "A-02");
    if (!represented.structure.has(level.id))
      compileLevelSheet(level, index, "S-02");
  });

  const totalSheets = base.sheets.length + extras.length;
  const numberedExtras = extras.map((sheet) => {
    const primitives = sheet.primitives.map((primitive) => {
      if (primitive.kind !== "text") return primitive;
      if (primitive.at[0] === 372 && primitive.at[1] === 270)
        return { ...primitive, text: sheet.id };
      return primitive;
    });
    return { ...sheet, primitives, svg: primitivesToSvg(primitives) };
  });
  const sheets = [...base.sheets, ...numberedExtras].map((sheet, index) => {
    const primitives = sheet.primitives.map((primitive) =>
      primitive.kind === "text" && primitive.at[0] === 372 && primitive.at[1] === 282
        ? { ...primitive, text: `${index + 1} / ${totalSheets}` }
        : primitive,
    );
    return { ...sheet, primitives, svg: primitivesToSvg(primitives) };
  });
  return {
    ...base,
    sheets,
    warnings: sheets.flatMap((sheet) =>
      sheet.warnings.map((warning) => `${sheet.id}: ${warning}`),
    ),
    issue_ready: base.issue_ready && extras.every((sheet) => sheet.status !== "missing_data"),
  };
}

export function renderPermitDrawingSetHtml(
  project: ProjectDocument,
  options: PermitOptions = {},
): string {
  const set = compilePermitDrawingSet(project, options);
  return `<!doctype html><html lang="th"><meta charset="utf-8"><title>ConstructFlow ${set.sheets.length}-sheet drawing set</title><style>@font-face{font-family:Sarabun;src:url('/fonts/Sarabun-Regular.ttf')}@page{size:A3 landscape;margin:0}body{margin:0;background:#e2e8f0;font-family:Sarabun,sans-serif}header{padding:16px;background:#0f172a;color:white}.sheet{width:420mm;height:297mm;background:white;margin:12px auto;break-after:page}.sheet:last-child{break-after:auto}.sheet svg{width:100%;height:100%}@media print{header{display:none}.sheet{margin:0}body{background:white}}</style><header>ชุดแบบร่าง ${set.sheets.length} แผ่น รวมแปลนแยกตามชั้น - ต้องตรวจข้อมูลและลงนามก่อนออกแบบยื่นอนุญาต <button onclick="print()">Print</button></header>${set.sheets.map((s) => `<section class="sheet">${s.svg}</section>`).join("")}</html>`;
}
