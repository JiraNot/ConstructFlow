import React from "react";
import { openingMaterialAppearance, openingHandlePlacement } from "@constructflow/representation-engine";
import { formatLengthMm } from "@constructflow/project-model";
import type { DisplayLengthUnit, TypeDefinition } from "@constructflow/project-model";
import {
  resolveOpeningMuntinGrid,
  muntinGridPositions,
  type OpeningGridZone,
  measureOpeningRegions,
} from "@constructflow/architecture-engine";
type OpeningOperation = "hinged" | "sliding" | "fixed" | "awning" | "louver" | "bifold" | "pocket" | "surface_sliding";
type GlazingMaterial =
  | "none"
  | "clear_glass"
  | "frosted_glass"
  | "tinted_glass";

export const CATALOG_FAMILIES = [
  ["structure.column", "เสา"],
  ["structure.foundation", "ฐานราก"],
  ["structure.beam", "คาน"],
  ["structure.slab", "พื้น"],
  ["architecture.wall", "ผนัง"],
  ["architecture.floor", "พื้นสถาปัตย์"],
  ["architecture.ceiling", "ฝ้าเพดาน"],
  ["door_window.door", "ประตู"],
  ["door_window.window", "หน้าต่าง"],
] as const;
export const OPERATION_LABELS: Record<string, string> = {
  hinged: "บานเปิด",
  sliding: "บานเลื่อน",
  bifold: "บานเฟี้ยม",
  pocket: "บานเลื่อนซ่อนผนัง",
  surface_sliding: "บานเลื่อนรางลอย",
  fixed: "บานติดตาย",
  awning: "บานกระทุ้ง",
  louver: "บานเกล็ด",
};
export const TOOL_FAMILIES: Record<string, string> = {
  column: "structure.column",
  foundation: "structure.foundation",
  beam: "structure.beam",
  wall: "architecture.wall",
  door: "door_window.door",
  window: "door_window.window",
  slab: "structure.slab",
};

export function typeDescription(type: TypeDefinition): string {
  const p = type.parameters;
  const family =
    CATALOG_FAMILIES.find(([id]) => id === type.object_type)?.[1] ??
    type.object_type;
  if (type.object_type.startsWith("door_window.")) {
    const allLouver = (p.panel_layout?.length ? p.panel_layout : [p.opening_operation]).every(operation => operation === "louver");
    const operations = [
      ...new Set(p.panel_layout ?? [p.opening_operation ?? "hinged"]),
    ]
      .map((value) => OPERATION_LABELS[value])
      .join(" + ");
    return [
      family + operations,
      `${p.panel_count ?? 1} บาน`,
      type.object_type.endsWith(".door") && p.glazing_material === "none"
        ? ({ flush: "หน้าบานเรียบ", raised_2_panel: "ลูกฟัก 2 ช่อง", raised_4_panel: "ลูกฟัก 4 ช่อง", raised_6_panel: "ลูกฟัก 6 ช่อง", horizontal_grooves_3: "เซาะร่องแนวนอน 3 เส้น", horizontal_grooves_5: "เซาะร่องแนวนอน 5 เส้น", vertical_grooves_3: "เซาะร่องแนวตั้ง 3 เส้น", louvered: "หน้าบานเกล็ด" } as Record<string,string>)[String(allLouver ? "louvered" : p.door_leaf_style ?? "raised_2_panel")] ?? "ลูกฟัก 2 ช่อง"
        : "",
      p.opening_handle_style && p.opening_handle_style !== "lever"
        ? ({ round_knob: "ลูกบิดกลม", pull_handle: "มือจับก้านดึง", recessed_pull: "มือจับฝัง", none: "ไม่แสดงมือจับ" } as Record<string,string>)[String(p.opening_handle_style)] ?? "มือจับก้านโยก"
        : "",
      p.transom_height_mm ? "ช่องแสงบน" : "",
      p.bottom_light_height_mm ? "ช่องแสงล่าง" : "",
      !allLouver && ((p.muntin_rows ?? 1) > 1 || (p.muntin_columns ?? 1) > 1)
        ? `ลูกฟักต่อบาน นอน ${(p.muntin_rows ?? 1) - 1} / ตั้ง ${(p.muntin_columns ?? 1) - 1} เส้น`
        : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (type.object_type === "architecture.wall") {
    const systems: Record<string, string> = {
      masonry: "ผนังก่อฉาบ",
      c_stud_smartboard: "โครงซีไลน์ + สมาร์ทบอร์ด",
      steel_frame_board: "โครงเหล็ก + แผ่นบอร์ด",
      composite_panel: "ผนังคอมโพซิต",
      faux_wood_cladding: "ผนังลายไม้เทียม",
    };
    return systems[String(p.wall_system)] ?? "ผนังประกอบหลายชั้น";
  }
  const materials: Record<string, string> = {
    reinforced_concrete: "คอนกรีตเสริมเหล็ก",
    steel: "เหล็ก",
    timber: "ไม้",
    generic: "ทั่วไป",
  };
  return [family, materials[String(p.material)] ?? ""]
    .filter(Boolean)
    .join(" · ");
}
export function typeSizeLabel(type: TypeDefinition, unit: DisplayLengthUnit = "mm"): string {
  const p = type.parameters;
  const label = (value: number) => formatLengthMm(value, unit);
  if (p.section_mm) return p.section_mm.map(label).join(" × ") + ` ${unit}`;
  if (p.size_mm) return p.size_mm.map(label).join(" × ") + ` ${unit}`;
  if (p.width_mm && p.height_mm) return `${label(p.width_mm)} × ${label(p.height_mm)} ${unit}`;
  return p.thickness_mm ? `หนา ${label(p.thickness_mm)} ${unit}` : "";
}
export type OpeningPreviewPart =
  | "all"
  | "transom"
  | "bottom_light"
  | `leaf-${number}`;
interface PreviewControls {
  showDimensions?: boolean;
  selectedPart?: OpeningPreviewPart;
  onSelectPart?: (part: OpeningPreviewPart) => void;
}
export function TypeThumbnail({
  type,
  ...controls
}: { type: TypeDefinition } & PreviewControls) {
  if (type.object_type.startsWith("door_window."))
    return (
      <OpeningPreview
        openingType={type.object_type.endsWith(".door") ? "door" : "window"}
        {...type.parameters}
        {...controls}
      />
    );
  const wall = type.object_type === "architecture.wall",
    slab = type.object_type === "structure.slab",
    footing = type.object_type === "structure.foundation";
  return (
    <svg
      role="img"
      aria-label={`ตัวอย่าง${typeDescription(type)}`}
      viewBox="0 0 160 104"
    >
      <rect width="160" height="104" rx="8" fill="#f2f7fb" />
      {wall ? (
        <>
          <rect
            x="20"
            y="34"
            width="120"
            height="36"
            fill="#e3e9ee"
            stroke="#839bac"
          />
          <rect
            x="20"
            y="40"
            width="120"
            height="24"
            fill="#b8d8e8"
            stroke="#839bac"
          />
        </>
      ) : slab ? (
        <path
          d="M 20 42 L 110 22 L 142 54 L 53 80 Z M 20 42 L 20 52 L 53 90 L 142 64 L 142 54 M 53 80 L 53 90"
          fill="#c9e2ef"
          stroke="#7599b1"
        />
      ) : (
        <>
          <rect
            x={footing ? 28 : 50}
            y={footing ? 26 : 16}
            width={footing ? 104 : 60}
            height={footing ? 54 : 72}
            fill="#c9e2ef"
            stroke="#7599b1"
            strokeWidth="2"
          />
          <path
            d={
              footing
                ? "M 28 26 L 132 80 M 132 26 L 28 80"
                : "M 50 16 L 110 88 M 110 16 L 50 88"
            }
            stroke="#fff"
          />
        </>
      )}
    </svg>
  );
}
interface OpeningTypeParameters {
  width_mm?: number;
  height_mm?: number;
  sill_height_mm?: number;
  opening_operation?: OpeningOperation;
  panel_count?: number;
  panel_layout?: OpeningOperation[];
  panel_width_ratios?: number[];
  transom_height_mm?: number;
  bottom_light_height_mm?: number;
  muntin_rows?: number;
  muntin_columns?: number;
  transom_muntin_rows?: number;
  transom_muntin_columns?: number;
  bottom_light_muntin_rows?: number;
  bottom_light_muntin_columns?: number;
  frame_depth_mm?: number;
  frame_material?: string;
  panel_material?: string;
  door_leaf_style?: string;
  door_face_components?: Array<{ kind: 'panel' | 'grooves'; contour: 'rectangle' | 'arch' | 'capsule' | 'ellipse'; x: number; y: number; width: number; height: number; count?: number; direction?: 'horizontal' | 'vertical' }>;
  opening_handle_style?: string;
  opening_hardware_finish?: string;
  glazing_material?: GlazingMaterial;
  glazing_transmission?: number;
}

export const OpeningPreview: React.FC<
  OpeningTypeParameters & { openingType: "door" | "window" } & PreviewControls
> = ({
  width_mm = 1200,
  height_mm = 2000,
  openingType,
  panel_count = 2,
  transom_height_mm = 0,
  bottom_light_height_mm = 0,
  muntin_rows = 1,
  muntin_columns = 1,
  transom_muntin_rows = 1,
  transom_muntin_columns = 1,
  bottom_light_muntin_rows = 1,
  bottom_light_muntin_columns = 1,
  opening_operation = "sliding",
  panel_layout = [],
  panel_width_ratios = [],
  frame_material = "aluminium",
  panel_material = "timber",
  door_leaf_style = "raised_2_panel",
  door_face_components = [],
  opening_handle_style = "lever",
  opening_hardware_finish = "stainless",
  glazing_material = "clear_glass",
  showDimensions = false,
  selectedPart = "all",
  onSelectPart,
}) => {
  const dimensions = measureOpeningRegions({
    width_mm,
    height_mm,
    transom_height_mm,
    bottom_light_height_mm,
  });
  if (!dimensions)
    return (
      <svg role="img" aria-label="ขนาดช่องเปิดไม่ถูกต้อง" viewBox="0 0 160 104">
        <text x="80" y="50" textAnchor="middle" fontSize="9" fill="#b42318">
          ตรวจขนาดและความสูงช่องแสง
        </text>
      </svg>
    );
  const ratio = Math.max(0.15, Math.min(6, width_mm / Math.max(height_mm, 1)));
  const w = Math.min(132, 86 * ratio),
    h = Math.min(86, 132 / ratio),
    x = (160 - w) / 2,
    y = 8 + (86 - h) / 2;
  const top = (h * dimensions.transom_height_mm) / dimensions.height_mm;
  const bottom = (h * dimensions.bottom_light_height_mm) / dimensions.height_mm;
  const mainTop = y + top,
    mainBottom = y + h - bottom;
  const panels = Math.max(1, Math.min(panel_count, 6));
  const ratios =
    panel_width_ratios.length === panels &&
    Math.abs(panel_width_ratios.reduce((sum, value) => sum + value, 0) - 1) <
      0.001
      ? panel_width_ratios
      : Array.from({ length: panels }, () => 1 / panels);
  const line = openingMaterialAppearance(frame_material).color;
  const leafColor = openingMaterialAppearance(panel_material).color;
  const glass =
    glazing_material === "frosted_glass"
      ? "#d6e9ec"
      : glazing_material === "tinted_glass"
        ? "#8ab3c4"
        : "#b8e7ef";
  const lengthLabel = (mm: number) =>
    `${(mm / 1000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} ม.`;
  const partTarget = (
    part: OpeningPreviewPart,
    label: string,
    left: number,
    topY: number,
    width: number,
    height: number,
  ) => (
    <g
      key={part}
      data-opening-part={part}
      role="button"
      tabIndex={0}
      aria-label={`เลือก${label}`}
      aria-pressed={selectedPart === part}
      onClick={() => onSelectPart?.(part)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectPart?.(part);
        }
      }}
      className="cf-opening-part-target"
    >
      <title>{label}</title>
      <rect
        x={left}
        y={topY}
        width={width}
        height={height}
        fill={selectedPart === part ? "#1687ee" : "transparent"}
        fillOpacity={selectedPart === part ? 0.15 : 1}
        stroke={selectedPart === part ? "#087ff5" : "transparent"}
        strokeWidth="1.5"
      />
    </g>
  );
  const verticalDimension = (
    atX: number,
    start: number,
    end: number,
    mm: number,
    id: string,
    label: string,
    overall = false,
  ) => (
    <g
      data-dimension={id}
      data-value-mm={mm}
      stroke="#526d82"
      strokeWidth="0.7"
      fill="none"
    >
      <line x1={atX} y1={start} x2={atX} y2={end} />
      {[start, end].map((position, i) => (
        <path
          key={i}
          d={`M ${atX - 2.5} ${position + 2.5} l 5 -5 M ${atX - 4} ${position} H ${overall ? x - 3 : x + w + 3}`}
        />
      ))}
      <text
        stroke="none"
        fill="#36546d"
        fontSize="9"
        textAnchor={overall ? "middle" : "start"}
        x={overall ? atX - 5 : atX + 5}
        y={overall ? (start + end) / 2 : (start + end) / 2 + 3}
        transform={
          overall ? `rotate(-90 ${atX - 5} ${(start + end) / 2})` : undefined
        }
      >
        {label} {lengthLabel(mm)}
      </text>
    </g>
  );
  const drawGrid = (
    left: number,
    topY: number,
    width: number,
    height: number,
    zone: OpeningGridZone = "leaf",
  ) => {
    const grid = muntinGridPositions(
      resolveOpeningMuntinGrid(
        {
          muntin_rows,
          muntin_columns,
          transom_muntin_rows,
          transom_muntin_columns,
          bottom_light_muntin_rows,
          bottom_light_muntin_columns,
        },
        zone,
      ),
    );
    return (
      <g stroke="#607f94" strokeWidth="1.4">
        {grid.vertical.map((fraction, index) => (
          <line
            key={`v${index}`}
            x1={left + width * fraction}
            y1={topY}
            x2={left + width * fraction}
            y2={topY + height}
          />
        ))}
        {grid.horizontal.map((fraction, index) => (
          <line
            key={`h${index}`}
            x1={left}
            y1={topY + height * fraction}
            x2={left + width}
            y2={topY + height * fraction}
          />
        ))}
      </g>
    );
  };
  return (
    <svg
      role={onSelectPart ? "group" : "img"}
      aria-label={
        showDimensions
          ? "รูปด้านช่องเปิดพร้อมเส้นวัดขนาด คลิกส่วนที่ต้องการแก้ไข"
          : "ตัวอย่างรูปแบบประตูหรือหน้าต่าง"
      }
      viewBox={
        showDimensions
          ? `${x - 36} ${y - 12} ${w + 132} ${h + 48}`
          : "0 0 160 104"
      }
      style={{
        width: "100%",
        height: showDimensions ? "auto" : "100%",
        maxHeight: showDimensions ? 320 : 260,
        background: "#f2f7fb",
        borderRadius: 4,
      }}
    >
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill={glazing_material === "none" ? leafColor : glass}
        stroke={line}
        strokeWidth="4"
      />
      {top > 0 && (
        <>
          <line
            x1={x}
            y1={mainTop}
            x2={x + w}
            y2={mainTop}
            stroke={line}
            strokeWidth="3"
          />
          {drawGrid(x + 2, y + 2, w - 4, Math.max(0, top - 3), "transom")}
        </>
      )}
      {bottom > 0 && (
        <>
          <line
            x1={x}
            y1={mainBottom}
            x2={x + w}
            y2={mainBottom}
            stroke={line}
            strokeWidth="3"
          />
          {drawGrid(
            x + 2,
            mainBottom + 2,
            w - 4,
            Math.max(0, bottom - 4),
            "bottom_light",
          )}
        </>
      )}
      {Array.from({ length: panels - 1 }, (_, index) => {
        const dividerX =
          x +
          w * ratios.slice(0, index + 1).reduce((sum, value) => sum + value, 0);
        return (
          <line
            key={index}
            x1={dividerX}
            y1={mainTop + 1}
            x2={dividerX}
            y2={mainBottom - 1}
            stroke={line}
            strokeWidth={opening_operation === "sliding" ? 3 : 2}
          />
        );
      })}
      {openingType === "door" && glazing_material === "none" && Array.from({ length: panels }, (_, index) => {
        if ((panel_layout[index] ?? opening_operation) === "louver") return null;
        const left = x + w * ratios.slice(0, index).reduce((sum, value) => sum + value, 0);
        const leafWidth = w * ratios[index];
        const insetX = Math.min(leafWidth * 0.13, 4);
        const insetY = Math.min((mainBottom - mainTop) * 0.1, 5);
        const gx = left + insetX, gy = mainTop + insetY;
        const gw = Math.max(0, leafWidth - insetX * 2), gh = Math.max(0, mainBottom - mainTop - insetY * 2);
        const grids: Record<string, [number, number]> = { raised_2_panel: [2, 1], raised_4_panel: [2, 2], raised_6_panel: [3, 2] };
        const grid = grids[door_leaf_style];
        const customFace = door_face_components.length > 0;
        return <g key={`door-face-${index}`} data-leaf-style={door_leaf_style} fill="none" stroke="#806348" strokeWidth="1.4" pointerEvents="none">
          {customFace && door_face_components.map((component, componentIndex) => {
            const cx = left + leafWidth * (component.x + component.width / 2), cy = mainBottom - (mainBottom - mainTop) * (component.y + component.height / 2);
            const cw = leafWidth * component.width, ch = (mainBottom - mainTop) * component.height;
            if (component.kind === "grooves") {
              const count = Math.max(1, component.count ?? 1);
              return Array.from({ length: count }, (_, groove) => component.direction === "vertical"
                ? <line key={`${componentIndex}-v-${groove}`} x1={left + leafWidth * (component.x + component.width * (groove + 1) / (count + 1))} x2={left + leafWidth * (component.x + component.width * (groove + 1) / (count + 1))} y1={cy - ch / 2} y2={cy + ch / 2} />
                : <line key={`${componentIndex}-h-${groove}`} x1={cx - cw / 2} x2={cx + cw / 2} y1={cy + ch / 2 - ch * (groove + 1) / (count + 1)} y2={cy + ch / 2 - ch * (groove + 1) / (count + 1)} />);
            }
            const rx = component.contour === "ellipse" ? cw / 2 : component.contour === "capsule" ? Math.min(cw, ch) / 2 : component.contour === "arch" ? Math.min(cw / 2, ch * .32) : 1;
            return <rect key={`${componentIndex}-panel`} x={cx - cw / 2} y={cy - ch / 2} width={cw} height={ch} rx={rx} />;
          })}
          {!customFace && (grid ? Array.from({length:grid[0]*grid[1]},(_,cell)=>{
            const row=Math.floor(cell/grid![1]), col=cell%grid![1];
            return <rect key={cell} x={gx+gw*col/grid![1]+1} y={gy+gh*row/grid![0]+1} width={Math.max(0,gw/grid![1]-2)} height={Math.max(0,gh/grid![0]-2)} rx="1" />;
          }) : door_leaf_style.startsWith("horizontal_grooves_") ? Array.from({length:door_leaf_style.endsWith("5")?5:3},(_,groove)=><line key={groove} x1={gx} x2={gx+gw} y1={gy+gh*(groove+1)/((door_leaf_style.endsWith("5")?5:3)+1)} y2={gy+gh*(groove+1)/((door_leaf_style.endsWith("5")?5:3)+1)} />)
          : door_leaf_style === "vertical_grooves_3" ? Array.from({length:3},(_,groove)=><line key={groove} y1={gy} y2={gy+gh} x1={gx+gw*(groove+1)/4} x2={gx+gw*(groove+1)/4} />)
          : door_leaf_style === "louvered" ? Array.from({length:7},(_,groove)=><line key={groove} x1={gx} x2={gx+gw} y1={gy+gh*(groove+1)/8} y2={gy+gh*(groove+1)/8} />)
          : [])}
        </g>;
      })}
      {Array.from({ length: panels }, (_, index) => {
        const operation = panel_layout[index] ?? opening_operation;
        const left =
          x + w * ratios.slice(0, index).reduce((sum, value) => sum + value, 0);
        const panelWidth = w * ratios[index];
        const center = left + panelWidth / 2;
        if (operation === "hinged" || operation === "awning") {
          // This preview is an elevation. The apex marks the hinge side;
          // a plan swing arc would misrepresent a casement in this view.
          const inset = Math.min(
            5,
            panelWidth * 0.12,
            (mainBottom - mainTop) * 0.12,
          );
          const sashLeft = left + inset,
            sashRight = left + panelWidth - inset;
          const sashTop = mainTop + inset,
            sashBottom = mainBottom - inset;
          const hingeOnRight = index % 2 === 1;
          return (
            <g
              key={`op${index}`}
              stroke="#42687e"
              strokeWidth="1.4"
              strokeDasharray="3 2"
              fill="none"
            >
              {operation === "hinged" ? (
                <path
                  d={
                    hingeOnRight
                      ? `M ${sashLeft} ${sashTop} L ${sashRight} ${(sashTop + sashBottom) / 2} L ${sashLeft} ${sashBottom}`
                      : `M ${sashRight} ${sashTop} L ${sashLeft} ${(sashTop + sashBottom) / 2} L ${sashRight} ${sashBottom}`
                  }
                />
              ) : (
                <path
                  d={`M ${sashLeft} ${sashBottom} L ${center} ${sashTop} L ${sashRight} ${sashBottom}`}
                />
              )}
            </g>
          );
        }
        if (operation === "louver")
          return (
            <g key={`op${index}`} stroke="#647d8b" strokeWidth="2">
              {Array.from({ length: 7 }, (_, i) => (
                <line
                  key={i}
                  x1={left + 3}
                  x2={left + panelWidth - 3}
                  y1={mainTop + ((mainBottom - mainTop) * (i + 1)) / 8}
                  y2={mainTop + ((mainBottom - mainTop) * (i + 1)) / 8}
                />
              ))}
            </g>
          );
        if (operation === "sliding")
          return (
            <path
              key={`op${index}`}
              d={`M ${left + panelWidth * 0.25} ${(mainTop + mainBottom) / 2} H ${left + panelWidth * 0.75} l -4 -3 m 4 3 l -4 3`}
              fill="none"
              stroke="#42687e"
              strokeWidth="1"
            />
          );
        return null;
      })}
      {opening_handle_style !== "none" &&
        Array.from({ length: panels }, (_, index) => {
          const operation = panel_layout[index] ?? opening_operation;
          if (!["hinged", "sliding", "awning", "louver"].includes(operation)) return null;
          const left = x + w * ratios.slice(0, index).reduce((sum, value) => sum + value, 0);
          const panelWidth = w * ratios[index];
          const placement = openingHandlePlacement(operation, index, width_mm * ratios[index], height_mm - dimensions.transom_height_mm - dimensions.bottom_light_height_mm, glazing_material !== "none");
          if (!placement) return null;
          const handleX = left + panelWidth * placement.x;
          const handleY = mainTop + (mainBottom - mainTop) * placement.y;
          const finish = opening_hardware_finish === "matte_black" ? "#27313b" : opening_hardware_finish === "satin_brass" ? "#9f7943" : opening_hardware_finish === "bronze" ? "#75533a" : "#738594";
          return (
            <g key={`handle-${index}`} data-handle-style={opening_handle_style} transform={`translate(${handleX} ${handleY}) scale(${placement.direction} 1)`} stroke={finish} fill="#d3dce2" pointerEvents="none">
              {opening_handle_style === "round_knob" ? <circle r="1.7" /> : opening_handle_style === "pull_handle" ? <path d="M -1.5 -4 Q -4 -4 -4 -2 V 3 Q -4 5 -1.5 5 M 1.5 -4 Q 4 -4 4 -2 V 3 Q 4 5 1.5 5" fill="none" /> : opening_handle_style === "recessed_pull" ? openingType === "window" ? <rect x={-10 * w / width_mm} y={-42.5 * h / height_mm} width={20 * w / width_mm} height={85 * h / height_mm} rx="0.3" strokeWidth="0.5" fill="#36434b" /> : <rect x="-2.5" y="-4" width="5" height="8" rx="1" /> : <><circle r="1.4" /><line x1="1" y1="0" x2="5" y2="0" strokeWidth="1.6" /></>}
            </g>
          );
        })}
      {Array.from({ length: panels }, (_, index) => {
        if ((panel_layout[index] ?? opening_operation) === "louver") return null;
        const left =
          x + w * ratios.slice(0, index).reduce((sum, value) => sum + value, 0);
        return (
          <g
            key={`grid${index}`}
            data-muntin-zone="leaf"
            data-panel-index={index}
          >
            {drawGrid(
              left + 2,
              mainTop + 2,
              Math.max(0, w * ratios[index] - 4),
              Math.max(0, mainBottom - mainTop - 4),
            )}
          </g>
        );
      })}
      {onSelectPart && (
        <>
          {top > 0 && partTarget("transom", "ช่องแสงบน", x, y, w, top)}
          {bottom > 0 &&
            partTarget("bottom_light", "ช่องแสงล่าง", x, mainBottom, w, bottom)}
          {ratios.map((fraction, index) =>
            partTarget(
              `leaf-${index}`,
              `บาน ${index + 1}`,
              x +
                w *
                  ratios.slice(0, index).reduce((sum, value) => sum + value, 0),
              mainTop,
              w * fraction,
              mainBottom - mainTop,
            ),
          )}
        </>
      )}
      {showDimensions ? (
        <>
          <g
            data-dimension="width"
            data-value-mm={width_mm}
            stroke="#526d82"
            strokeWidth="0.7"
            fill="none"
          >
            <line x1={x} y1={y + h + 13} x2={x + w} y2={y + h + 13} />
            {[x, x + w].map((position, i) => (
              <path
                key={i}
                d={`M ${position} ${y + h + 3} V ${y + h + 17} M ${position - 2.5} ${y + h + 15.5} l 5 -5`}
              />
            ))}
            <text
              x={x + w / 2}
              y={y + h + 26}
              stroke="none"
              fill="#36546d"
              fontSize="9"
              textAnchor="middle"
            >
              กว้าง {lengthLabel(width_mm)}
            </text>
          </g>
          {verticalDimension(
            x - 15,
            y,
            y + h,
            height_mm,
            "height",
            "สูงรวม",
            true,
          )}
          {(top > 0 || bottom > 0) && (
            <>
              {top > 0 &&
                verticalDimension(
                  x + w + 15,
                  y,
                  mainTop,
                  transom_height_mm,
                  "transom",
                  "บน",
                )}
              {verticalDimension(
                x + w + 15,
                mainTop,
                mainBottom,
                dimensions.main_height_mm,
                "main",
                "บาน",
              )}
              {bottom > 0 &&
                verticalDimension(
                  x + w + 15,
                  mainBottom,
                  y + h,
                  bottom_light_height_mm,
                  "bottom_light",
                  "ล่าง",
                )}
            </>
          )}
        </>
      ) : (
        <text x="80" y="102" textAnchor="middle" fill="#9fb4c4" fontSize="6">
          {width_mm}×{height_mm} มม.
        </text>
      )}
    </svg>
  );
};
