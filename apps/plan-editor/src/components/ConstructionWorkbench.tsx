import { Dialog } from "./ui/Dialog.js";
import React, { useState, useEffect, useMemo } from "react";
import { resolveCatalogType } from "@constructflow/project-model";
import type { ProjectDocument } from "@constructflow/project-model";
import { WorkbenchNumberInput } from "./WorkbenchNumberInput";
import { formatLengthMm, parseLengthMm, type DisplayLengthUnit } from "@constructflow/project-model";
import { OpeningPlanSymbolEditor } from "./OpeningPlanSymbolEditor.js";
import type { OpeningPlanSymbolLine } from "@constructflow/project-model";
import type { SavedSheetSubviewport, SheetViewKind } from "@constructflow/project-model";
import { SheetViewportComposerPreview } from "./SheetViewportComposerPreview.js";
import type {
  CommandRequest,
  CommandBatchResult,
} from "@constructflow/command-schema";
import {
  constructionOutputs,
  generateProjectCutList,
} from "@constructflow/domain-providers";
import { planPhaseProof } from "@constructflow/extension-engine";
import {
  compilePermitDrawingSet,
  compilePermitPdf,
  getPermitViewportPaperFrame,
  renderPermitDrawingSetHtml,
  type PermitSheetId,
  type PermitOptions,
} from "@constructflow/sheet-engine";

type Payload = Record<string, unknown>;
const EMPTY_PERMIT_OPTIONS: PermitOptions = Object.freeze({});
const SHEET_VIEW_OPTIONS: Array<{ value: SheetViewKind; label: string }> = [
  { value: 'plan', label: 'แปลน' }, { value: 'rcp', label: 'แปลนฝ้า RCP' },
  { value: 'north', label: 'รูปด้านเหนือ' }, { value: 'south', label: 'รูปด้านใต้' },
  { value: 'east', label: 'รูปด้านตะวันออก' }, { value: 'west', label: 'รูปด้านตะวันตก' },
  { value: 'section_x', label: 'รูปตัด X' }, { value: 'section_y', label: 'รูปตัด Y' },
  { value: 'isometric', label: 'ภาพสามมิติ' },
];
function standardSheetViewLayout(sheetId: string): SheetViewKind[] {
  if (sheetId === 'A-05') return ['north', 'east'];
  if (sheetId === 'A-06') return ['south', 'west'];
  if (sheetId === 'A-07') return ['section_x', 'section_y'];
  if (sheetId === 'A-10') return ['plan', 'rcp'];
  if (sheetId === 'A-09') return ['plan', 'section_x'];
  if (sheetId === 'M-01') return ['isometric'];
  return ['plan'];
}
const sheetViewLabel = (kind: SheetViewKind) => SHEET_VIEW_OPTIONS.find(option => option.value === kind)?.label ?? kind;
const polygon = [
  [0, 0],
  [4000, 0],
  [4000, 2500],
  [0, 2500],
];
const bar = {
  grade: "SD40",
  diameter_mm: 12,
  cover_mm: 30,
  count: 2,
  bend_radius_mm: 24,
  hook_angle_deg: 0,
  hook_extension_mm: 0,
  lap_mm: 0,
  legs_mm: [],
  spacing_zones: [],
};
const templates: {
  label: string;
  create: string;
  update: string;
  family: string;
  data: Payload;
}[] = [
  {
    label: "พื้น Slab",
    create: "CreateSlab",
    update: "UpdateSlab",
    family: "structure.slab",
    data: {
      mark: "GS",
      boundary_mm: polygon,
      elevation_mm: 0,
      thickness_mm: 120,
      topping_mm: 0,
      slab_system: "slab_on_ground",
      material: "reinforced_concrete",
      slope_ratio: 0,
      drain_direction_deg: 0,
    },
  },
  {
    label: "เหล็กบน/ล่าง/ปลอก",
    create: "ConfigureBeamReinforcement",
    update: "ConfigureBeamReinforcement",
    family: "structure.beam",
    data: {
      host_id: "",
      inherit_host_type: false,
      reinforcement: {
        top: bar,
        bottom: bar,
        stirrups: {
          ...bar,
          grade: "SR24",
          diameter_mm: 6,
          bend_radius_mm: 12,
          hook_angle_deg: 135,
          hook_extension_mm: 60,
          spacing_zones: [{ start_mm: 0, end_mm: 3940, spacing_mm: 150 }],
        },
      },
    },
  },
  {
    label: "คานลดระดับ",
    create: "SetBeamDrop",
    update: "SetBeamDrop",
    family: "structure.beam",
    data: { id: "", drop_mm: 75 },
  },
  {
    label: "เสาและเหล็กปลอก",
    create: "ConfigureColumnReinforcement",
    update: "ConfigureColumnReinforcement",
    family: "structure.column",
    data: {
      host_id: "",
      inherit_host_type: false,
      reinforcement: {
        main: {
          ...bar,
          grade: "SD40",
          diameter_mm: 16,
          cover_mm: 30,
          count: 4,
          lap_mm: 640,
        },
        ties: {
          ...bar,
          grade: "SR24",
          diameter_mm: 6,
          cover_mm: 25,
          count: 1,
          bend_radius_mm: 12,
          hook_angle_deg: 135,
          hook_extension_mm: 75,
          spacing_zones: [
            { start_mm: 0, end_mm: 500, spacing_mm: 100 },
            { start_mm: 500, end_mm: 2500, spacing_mm: 200 },
            { start_mm: 2500, end_mm: 2950, spacing_mm: 100 },
          ],
        },
      },
    },
  },
  {
    label: "ฐานรากและตะแกรงล่าง",
    create: "ConfigureFoundationReinforcement",
    update: "ConfigureFoundationReinforcement",
    family: "structure.foundation",
    data: {
      host_id: "",
      inherit_host_type: false,
      reinforcement: {
        bottom_x: {
          ...bar,
          grade: "SD40",
          diameter_mm: 12,
          cover_mm: 50,
          count: 5,
          hook_angle_deg: 90,
          hook_extension_mm: 144,
        },
        bottom_y: {
          ...bar,
          grade: "SD40",
          diameter_mm: 12,
          cover_mm: 50,
          count: 5,
          hook_angle_deg: 90,
          hook_extension_mm: 144,
        },
      },
    },
  },
  {
    label: "หลังคาจากแนวขอบ",
    create: "GenerateRoof",
    update: "UpdateRoof",
    family: "roof.system",
    data: {
      mark: "R1",
      boundary_mm: polygon,
      voids_mm: [],
      elevation_mm: 3000,
      edges: polygon.map(() => ({ defines_slope: true, slope_deg: 20 })),
      thickness_mm: 30,
      material: "metal_sheet",
    },
  },
  {
    label: "บันได คสล. & ราวกันตก",
    create: "CreateStair",
    update: "UpdateStair",
    family: "architecture.stair",
    data: {
      mark: "ST1",
      stair_type: "straight",
      structure_type: "rc_monolithic",
      start_point_mm: [0, 0, 0],
      total_rise_mm: 3000,
      width_mm: 1000,
      num_risers: 17,
      riser_height_mm: 176.5,
      tread_depth_mm: 250,
      landing_depth_mm: 1000,
      has_handrail: true,
      handrail_height_mm: 900,
    },
  },
  {
    label: "บัวต่อเนื่อง",
    create: "CreateMouldingRun",
    update: "UpdateMouldingRun",
    family: "decorative.moulding_run",
    data: {
      mark: "SK1",
      path_mm: [
        [0, 0, 80],
        [4000, 0, 80],
        [4000, 2500, 80],
        [0, 2500, 80],
      ],
      profile_mm: [
        [0, 0],
        [15, 0],
        [15, 80],
        [0, 80],
      ],
      closed: true,
      miter_limit: 4,
      material: "painted_wood",
    },
  },
  {
    label: "ลูกฟักผนัง",
    create: "SetPanelLayout",
    update: "UpdatePanelLayout",
    family: "decorative.panel_layout",
    data: {
      mark: "PN1",
      host_id: "",
      rows: 2,
      columns: 3,
      margin_mm: 100,
      gap_mm: 50,
      depth_mm: 18,
      material: "painted_mdf",
    },
  },
  {
    label: "บ่อพัก",
    create: "PlaceManhole",
    update: "UpdateManhole",
    family: "drainage.manhole",
    data: {
      mark: "MH1",
      location_mm: [0, 0, 0],
      size_mm: [400, 500, 600],
      invert_mm: null,
      system: "waste",
    },
  },
  {
    label: "ท่อสุขาภิบาล",
    create: "CreatePipeRoute",
    update: "EditPipeRoute",
    family: "drainage.pipe_route",
    data: {
      mark: "P1",
      system: "waste",
      nodes_mm: [
        [0, 0, -300],
        [4000, 0, -400],
      ],
      diameter_mm: 50,
      start_node_id: "",
      end_node_id: "",
      start_invert_mm: null,
      end_invert_mm: null,
      minimum_slope_ratio: 0.01,
      material: "PVC",
    },
  },
  {
    label: "ท่อน้ำดี",
    create: "CreatePipeRoute",
    update: "EditPipeRoute",
    family: "plumbing.pipe_route",
    data: {
      mark: "CW1",
      system: "cold_water",
      nodes_mm: [
        [0, 0, 1000],
        [4000, 0, 1000],
      ],
      diameter_mm: 25,
      start_invert_mm: null,
      end_invert_mm: null,
      minimum_slope_ratio: 0,
      material: "PPR",
    },
  },
  {
    label: "ปั๊ม 3-valve bypass",
    create: "CreatePumpBypass",
    update: "UpdatePumpBypass",
    family: "plumbing.pump_bypass",
    data: {
      mark: "PUMP1",
      location_mm: [0, 0, 0],
      span_mm: 2000,
      diameter_mm: 25,
      mode: "pump",
      valve_states: { inlet: true, outlet: true, bypass: false },
    },
  },
  {
    label: "ถังบำบัด / PE",
    create: "CreateSepticTank",
    update: "UpdateSepticTank",
    family: "drainage.septic_tank",
    data: {
      mark: "ST1",
      location_mm: [0, 0, 0],
      people: 4,
      litres_per_person: 200,
      reserve_ratio: 0.2,
      capacity_litres: 1200,
      rule_source: "",
    },
  },
  {
    label: "ห้องน้ำ",
    create: "CreateBathroom",
    update: "UpdateBathroom",
    family: "architecture.bathroom",
    data: {
      mark: "BATH1",
      boundary_mm: [
        [0, 0],
        [2000, 0],
        [2000, 1500],
        [0, 1500],
      ],
      elevation_mm: 0,
      drop_mm: 75,
      slope_ratio: 0.02,
      drain_mm: [1500, 1000],
      waterproof_upstand_mm: 300,
      wet_wall_height_mm: 1800,
      wet_wall_length_mm: 3500,
      tile_mm: [300, 300],
      toilet_rough_in_mm: 305,
    },
  },
  {
    label: "ตู้และวัสดุแยกชิ้น",
    create: "CreateCabinetRun",
    update: "UpdateCabinetRun",
    family: "interior.cabinet_run",
    data: {
      mark: "CB1",
      location_mm: [0, 0, 0],
      width_mm: 2400,
      height_mm: 850,
      depth_mm: 600,
      board_mm: 18,
      back_mm: 9,
      plinth_mm: 100,
      rotation_deg: 0,
      modules_mm: [800, 800, 800],
      shelves: 1,
      drawers: 1,
      front: "solid",
      carcass_material: "melamine",
      front_material: "laminate",
      back_material: "plywood",
      countertop_material: "quartz",
      countertop_mm: 20,
    },
  },
  {
    label: "LED และ Driver",
    create: "CreateLEDRun",
    update: "UpdateLEDRun",
    family: "electrical.led_run",
    data: {
      mark: "LED1",
      path_mm: [
        [0, 0, 800],
        [2400, 0, 800],
      ],
      watts_per_m: 9.6,
      voltage: 24,
      driver_watts: 40,
      derating_ratio: 0.8,
      material: "aluminium_diffuser",
    },
  },
  {
    label: "ไฟฟ้า · ดวงโคม/สวิตช์/ปลั๊ก",
    create: "PlaceElectricalFixture",
    update: "UpdateElectricalFixture",
    family: "electrical.fixture",
    data: {
      mark: "L1",
      kind: "light",
      location_mm: [0, 0, 2700],
      watts: 18,
      grounded: true,
      controlled_ids: [],
      switch_ways: 1,
    },
  },
  {
    label: "ไฟฟ้า · วงจรและ Panel load",
    create: "CreateCircuit",
    update: "UpdateCircuit",
    family: "electrical.circuit",
    data: {
      mark: "CKT1",
      panel_id: "",
      device_ids: [],
      voltage: 230,
      breaker_a: 16,
      cable_mm2: 2.5,
      allowable_current_a: 20,
    },
  },
];
const labels: Record<string, string> = {
  boundary_mm: "แนวขอบ X/Y",
  path_mm: "แนววิ่ง X/Y/Z",
  profile_mm: "หน้าตัดบัว X/Y",
  nodes_mm: "จุดเดินท่อ X/Y/Z",
  location_mm: "ตำแหน่ง X/Y/Z",
  elevation_mm: "ระดับ",
  thickness_mm: "ความหนา",
  topping_mm: "ทับหน้า",
  slab_system: "ระบบพื้น",
  mark: "ชื่อชิ้นงาน",
  material: "วัสดุ",
  type_id: "ชนิดในคลัง",
  host_id: "ชิ้นงานเจ้าบ้าน",
  drop_mm: "ระยะลดระดับ",
  edges: "Slope ของขอบแต่ละเส้น",
  defines_slope: "กำหนดความลาด",
  slope_deg: "มุมลาด (องศา)",
  start_invert_mm: "IL ต้นท่อ",
  end_invert_mm: "IL ปลายท่อ",
  invert_mm: "ระดับก้นบ่อ",
  minimum_slope_ratio: "ความลาดขั้นต่ำ (เช่น 0.01 = 1:100)",
  rule_source: "ที่มาของเกณฑ์ขนาดถัง",
  top: "เหล็กบน",
  bottom: "เหล็กล่าง",
  stirrups: "เหล็กปลอก",
  reinforcement: "การจัดเหล็ก",
  spacing_zones: "โซนเรียงปลอก",
  closed: "ปิดแนววิ่ง",
  carcass_material: "วัสดุโครงตู้",
  front_material: "วัสดุหน้าบาน",
  back_material: "วัสดุหลังตู้",
  countertop_material: "วัสดุท็อป",
  modules_mm: "ความกว้างแต่ละช่อง",
  watts_per_m: "กำลังไฟต่อเมตร (W/m)",
  derating_ratio: "สัดส่วนกำลังใช้งาน Driver",
  allowable_current_a: "กระแสสายที่ผู้ออกแบบกำหนด (A)",
  stair_type: "รูปแบบบันได",
  structure_type: "โครงสร้างบันได",
  total_rise_mm: "ความสูงรวมบันได",
  num_risers: "จำนวนขั้น (ลูกตั้ง)",
  riser_height_mm: "ความสูงลูกตั้ง",
  tread_depth_mm: "ระยะลูกนอน",
  landing_depth_mm: "ความยาวชานพัก",
  has_handrail: "ติดตั้งราวกันตก",
  handrail_height_mm: "ความสูงราวกันตก",
  main: "เหล็กแกนหลัก",
  ties: "เหล็กปลอกเสา",
  bottom_x: "เหล็กล่างแกน X",
  bottom_y: "เหล็กล่างแกน Y",
  voids_mm: "ช่องเปิด/เจาะหลังคา (X/Y)",
  slope_ratio: "ความลาด (เช่น 0.01 = 1:100)",
  drain_direction_deg: "ทิศทางระบายน้ำ (องศา)",
};
const enums: Record<string, string[]> = {
  material: ["reinforced_concrete", "steel", "timber", "generic"],
  slab_system: ["slab_on_ground", "suspended", "precast_plank", "hollow_core"],
  grade: ["SR24", "SD40", "SD50"],
  hook_angle_deg: ["0", "90", "135"],
  mode: ["pump", "bypass", "isolated"],
  system: ["waste", "soil", "rainwater", "vent", "cold_water", "hot_water"],
  kind: ["light", "switch", "outlet", "panel"],
  front: ["solid", "glass", "open"],
  stair_type: ["straight", "l_shaped", "u_shaped"],
  structure_type: ["rc_monolithic", "steel_stringer", "wood"],
};
const enumLabels: Record<string,string> = {reinforced_concrete:'คอนกรีตเสริมเหล็ก',steel:'เหล็ก',timber:'ไม้',generic:'ทั่วไป',slab_on_ground:'พื้นวางบนดิน',suspended:'พื้นหล่อบนคาน',precast_plank:'พื้นสำเร็จรูป',hollow_core:'พื้น Hollow Core',pump:'ใช้ปั๊ม',bypass:'ใช้เมนตรง',isolated:'แยกระบบ',waste:'น้ำเสีย',soil:'โสโครก',rainwater:'น้ำฝน',vent:'อากาศ',cold_water:'น้ำดี',hot_water:'น้ำร้อน',light:'โคมไฟ',switch:'สวิตช์',outlet:'เต้ารับ',panel:'ตู้ไฟ',solid:'บานทึบ',glass:'กระจก',open:'ช่องเปิด',straight:'ตรง',l_shaped:'รูปตัว L',u_shaped:'รูปตัว U',rc_monolithic:'คอนกรีตเสริมเหล็ก',steel_stringer:'แม่บันไดเหล็ก',wood:'ไม้'};
const fieldStyle: React.CSSProperties = {
  display: "grid",
  alignContent: "start",
  gap: 3,
  padding: "5px 0",
  fontSize: 12,
};
const inputStyle: React.CSSProperties = {
  background: "#ffffff",
  color: "#33465b",
  border: "1px solid #dce4ed",
  borderRadius: 2,
  padding: 5,
  width: "100%",
};

function Field({
  name,
  value,
  onChange,
  project,
}: {
  name: string;
  value: unknown;
  onChange: (v: unknown) => void;
  project: ProjectDocument;
}) {
  const label = labels[name] ?? name.replaceAll("_", " "),
    mm = name.endsWith("_mm"),
    displayUnit: DisplayLengthUnit = project.project.display_unit ?? 'm',
    unit = mm ? ` (${displayUnit})` : "";
  const selector = name.endsWith("_id") || name === "id";
  if (selector) {
    const family =
      name === "panel_id"
        ? "electrical.fixture"
        : name.includes("node")
          ? "drainage.manhole"
          : name === "host_id"
            ? ""
            : name === "id"
              ? "structure.beam"
              : "";
    return (
      <label style={fieldStyle}>
        {label}
        <select
          style={inputStyle}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">เลือก / ไม่เชื่อมต่อ</option>
          {Object.values(project.objects)
            .filter((o) => !family || o.object_type === family)
            .map((o) => (
              <option key={o.id} value={o.id}>
                {String((o.module_data as Payload).mark ?? o.object_type)} · {o.object_type}
              </option>
            ))}
        </select>
      </label>
    );
  }
  const tupleLabels: Record<string, string[]> = {
    center: ["X (m)", "Y (m)"],
    crop: ["Min X (m)", "Min Y (m)", "Max X (m)", "Max Y (m)"],
    location_mm: ["X", "Y", "Z"],
    size_mm: ["Width", "Depth", "Height"],
    section_mm: ["Width", "Depth"],
    drain_mm: ["X", "Y"],
    tile_mm: ["Width", "Length"],
  };
  if (Array.isArray(value) && tupleLabels[name])
    return (
      <fieldset
        style={{ border: "1px solid #dce4ed", margin: "6px 0", padding: 6 }}
      >
        <legend>
          {label}
          {unit}
        </legend>
        <div style={{ display: "flex", gap: 6 }}>
          {tupleLabels[name].map((axis, i) => (
            <label key={axis} style={{ flex: 1, fontSize: 11 }}>
              {axis}
              <WorkbenchNumberInput
                style={inputStyle}
                value={Number(value[i])}
                unit={mm ? displayUnit : undefined}
                onChange={(next) => onChange(value.map((v, j) => j === i ? next : v))}
              />
            </label>
          ))}
        </div>
      </fieldset>
    );
  if (Array.isArray(value))
    return (
      <fieldset
        className={value.every(v=>Array.isArray(v)) ? "cf-coordinate-list" : undefined}
        style={{ border: "1px solid #dce4ed", margin: "6px 0", padding: 6, gridColumn: "1 / -1" }}
      >
        <legend>
          {label}
          {unit}
        </legend>
        {value.map((v, i) => (
          <div
            key={i}
            style={{ display: "flex", gap: 6, alignItems: "center" }}
          >
            <span>{i + 1}</span>
            <div style={{ flex: 1 }}>
              {Array.isArray(v) ? (
                <div style={{ display: "flex", gap: 3 }}>
                  {v.map((n, j) => (
                    <label key={j} style={{ flex: 1, fontSize: 11 }}>
                      {["X", "Y", "Z"][j] ?? j + 1}
                      <input
                        style={inputStyle}
                        type="number"
                        step={mm ? 0.001 : 1}
                        value={Number(n) / (mm ? 1000 : 1)}
                        onChange={(e) =>
                          onChange(
                            value.map((p, k) =>
                              k === i
                                ? (v as number[]).map((a, b) =>
                                    b === j
                                      ? Number(e.target.value) * (mm ? 1000 : 1)
                                      : a,
                                  )
                                : p,
                            ),
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
              ) : typeof v === "object" && v !== null ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {Object.entries(v).map(([k, x]) => (
                    <div key={k} style={{ flex: "1 1 160px" }}>
                      <Field
                        name={k}
                        value={x}
                        project={project}
                        onChange={(next) =>
                          onChange(
                            value.map((p, k2) =>
                              k2 === i ? { ...v, [k]: next } : p,
                            ),
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
              ) : name === "device_ids" || name === "controlled_ids" ? (
                <Field
                  name="host_id"
                  value={v}
                  project={project}
                  onChange={(next) =>
                    onChange(value.map((p, k) => (k === i ? next : p)))
                  }
                />
              ) : (
                <input
                  style={inputStyle}
                  type={typeof v === "number" && mm ? "text" : typeof v === "number" ? "number" : "text"}
                  inputMode={typeof v === "number" && mm ? "decimal" : undefined}
                  value={typeof v === "number" ? (mm ? formatLengthMm(v, displayUnit) : v) : String(v)}
                  step="any"
                  onChange={(e) =>
                    onChange(
                      value.map((p, k) =>
                        k === i
                          ? typeof v === "number"
                            ? mm ? parseLengthMm(e.target.value, displayUnit) ?? 0 : Number(e.target.value)
                            : e.target.value
                          : p,
                      ),
                    )
                  }
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => onChange(value.filter((_, k) => k !== i))}
            >
              ลบ
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            onChange([
              ...value,
              structuredClone(
                value.at(-1) ??
                  (name.endsWith("_ids")
                    ? ""
                    : name === "spacing_zones"
                      ? { start_mm: 0, end_mm: 1000, spacing_mm: 150 }
                      : name === "legs_mm"
                        ? 1000
                        : 0),
              ),
            ])
          }
        >
          เพิ่มรายการ
        </button>
      </fieldset>
    );
  if (value !== null && typeof value === "object")
    return (
      <fieldset style={{ border: "1px solid #dce4ed", margin: "6px 0" }}>
        <legend>{label}</legend>
        {Object.entries(value).map(([k, v]) => (
          <Field
            key={k}
            name={k}
            value={v}
            project={project}
            onChange={(next) => onChange({ ...value, [k]: next })}
          />
        ))}
      </fieldset>
    );
  if (typeof value === "boolean")
    return (
      <label style={fieldStyle}>
        <span>
          <input
            type="checkbox"
            checked={value}
            onChange={(e) => onChange(e.target.checked)}
          />{" "}
          {label}
        </span>
      </label>
    );
  if (enums[name])
    return (
      <label style={fieldStyle}>
        {label}
        <select
          style={inputStyle}
          value={String(value)}
          onChange={(e) =>
            onChange(
              typeof value === "number"
                ? Number(e.target.value)
                : e.target.value,
            )
          }
        >
          {!enums[name].includes(String(value)) && <option value={String(value)}>{String(value)}</option>}
          {enums[name].map((v) => (
            <option key={v} value={v}>{enumLabels[v] ?? v}</option>
          ))}
        </select>
      </label>
    );
  const nullable = name.includes("invert");
  return (
    <label style={fieldStyle}>
      {label}
      {unit}
      {nullable && (
        <span>
          <input
            type="checkbox"
            checked={value === null}
            onChange={(e) => onChange(e.target.checked ? null : 0)}
          />{" "}
          ยังไม่ทราบ / ตรวจหน้างาน
        </span>
      )}
      {typeof value === "number" || nullable ? (
        <WorkbenchNumberInput
          style={inputStyle}
          disabled={value === null}
          value={value as number | null}
          unit={mm ? (project.project.display_unit ?? 'm') : undefined}
          onChange={onChange}
        />
      ) : (
        <input style={inputStyle} type="text" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

export function ConstructionWorkbench({
  project,
  onClose,
  onExecute,
  onOpenCatalog,
  initialTab = "model",
}: {
  project: ProjectDocument;
  initialTab?: "model" | "sheets";
  onOpenCatalog: () => void;
  onClose: () => void;
  onExecute: (c: CommandRequest[]) => CommandBatchResult;
}) {
  const [tab, setTab] = useState<"model" | "sheets">(initialTab),
    [templateIndex, setTemplateIndex] = useState(0),
    [payload, setPayload] = useState<Payload>(
      structuredClone(templates[0].data),
    ),
    [editId, setEditId] = useState(""),
    [feedback, setFeedback] = useState("");
  const [sheetId, setSheetId] = useState<PermitSheetId>("A-02"),
    [scale, setScale] = useState(100),
    [planLevelId, setPlanLevelId] = useState(project.project.active_level_id),
    [center, setCenter] = useState<[number, number]>([0, 0]),
    [useCenter, setUseCenter] = useState(false),
    [crop, setCrop] = useState<[number, number, number, number]>([
      -5, -5, 5, 5,
    ]),
    [useCrop, setUseCrop] = useState(false),
    [sheetPreview, setSheetPreview] = useState("");
  const [sheetViewLayout, setSheetViewLayout] = useState<SheetViewKind[]>(() => standardSheetViewLayout('A-02'));
  const [subviewViewports, setSubviewViewports] = useState<SavedSheetSubviewport[]>([]);
  const [newSheetViewKind, setNewSheetViewKind] = useState<SheetViewKind>('north');
  const [sheetLayoutTemplateName, setSheetLayoutTemplateName] = useState("");
  const [selectedSheetLayoutTemplateId, setSelectedSheetLayoutTemplateId] = useState("");
  const [selectedDimensionId, setSelectedDimensionId] = useState(""),
    [dimensionOffsetMm, setDimensionOffsetMm] = useState<[number, number]>([0, 0]);
  const viewportOptions: PermitOptions = project.drawing_settings ?? EMPTY_PERMIT_OPTIONS;
  const availableSheets = useMemo(
    () => compilePermitDrawingSet(project, viewportOptions).sheets,
    [project, viewportOptions],
  );
  const selectedSheet = availableSheets.find((sheet) => sheet.id === sheetId);
  const dimensionLabels = (selectedSheet?.primitives ?? []).filter((primitive) => primitive.kind === "text" && primitive.dimension_id);
  const planOpenings = Object.values(project.objects).filter((o) => o.object_type === "door_window.door" || o.object_type === "door_window.window");
  const [selectedOpeningId, setSelectedOpeningId] = useState("");
  const [openingLines, setOpeningLines] = useState<OpeningPlanSymbolLine[]>([]);
  const [openingElevationLines, setOpeningElevationLines] = useState<OpeningPlanSymbolLine[]>([]);
  const openingViewKind: "plan" | "elevation" = sheetId === "A-05" || sheetId === "A-06" ? "elevation" : "plan";
  const selectedOpening = planOpenings.find((o) => o.id === selectedOpeningId);
  const selectedOpeningData = (selectedOpening?.module_data ?? {}) as Record<string, unknown>;
  const selectedOpeningType = selectedOpening ? resolveCatalogType(project, selectedOpening.object_type, String(selectedOpeningData.type_id ?? selectedOpeningData.mark ?? "")) : undefined;
  const selectedOpeningWidth = Number((selectedOpeningData.instance_overrides as Record<string, unknown> | undefined)?.width_mm ?? selectedOpeningData.width_mm ?? selectedOpeningType?.parameters.width_mm ?? 900);
  const selectedOpeningHeight = Number((selectedOpeningData.instance_overrides as Record<string, unknown> | undefined)?.height_mm ?? selectedOpeningData.height_mm ?? selectedOpeningType?.parameters.height_mm ?? 1200);
  const openingHost = selectedOpening ? project.objects[String(selectedOpeningData.wall_id ?? "")] : undefined;
  const openingReferenceDepth = Number((openingHost?.module_data as Record<string, unknown> | undefined)?.thickness_mm ?? 100);
  useEffect(() => {
    if (!selectedOpening) { setOpeningLines([]); return; }
    const saved = project.drawing_settings?.viewports[sheetId]?.opening_overrides?.[selectedOpening.id];
    setOpeningLines(saved?.lines ?? []);
    setOpeningElevationLines(saved?.elevation_lines ?? []);
  }, [project, selectedOpeningId, sheetId]);
  useEffect(() => {
    const saved = selectedDimensionId
      ? project.drawing_settings?.viewports[sheetId]?.dimension_overrides?.[selectedDimensionId]
      : undefined;
    setDimensionOffsetMm(saved?.offset_mm ?? [0, 0]);
  }, [project, selectedDimensionId, sheetId]);
  useEffect(() => {
    if (tab === "sheets") {
      const saved = project.drawing_settings?.viewports[sheetId];
      if (/^(A-02|A-03|S-02|S-03)$/.test(sheetId)) {
        const ordered = [...project.levels].sort((a, b) => a.elevation_mm - b.elevation_mm);
        const defaultLevel = sheetId === 'A-02' || sheetId === 'S-02' ? ordered[0]?.id : ordered[1]?.id ?? ordered[0]?.id;
        setPlanLevelId(saved?.level_id ?? defaultLevel ?? project.project.active_level_id);
      } else if (/^(A-02|S-02)-L\d+$/.test(sheetId)) {
        setPlanLevelId(selectedSheet?.viewport.level_id ?? project.project.active_level_id);
      }
      setScale(
        saved?.scale_denominator ??
          Number(selectedSheet?.scale.split(":")[1] ?? 100),
      );
      setUseCenter(!!saved?.center_mm);
      setCenter(
        (saved?.center_mm?.map((v) => v / 1000) as [number, number]) ?? [0, 0],
      );
      setUseCrop(!!saved?.crop_bounds_mm);
      setCrop(
        (saved?.crop_bounds_mm?.map((v) => v / 1000) as [
          number,
          number,
          number,
          number,
        ]) ?? [-5, -5, 5, 5],
      );
      const viewLayout = saved?.view_layout ?? standardSheetViewLayout(sheetId);
      setSheetViewLayout(viewLayout);
      setSubviewViewports(viewLayout.slice(1).map((_, index) => saved?.subviews?.[index] ?? { scale_denominator: saved?.scale_denominator ?? Number(selectedSheet?.scale.split(":")[1] ?? 100) }));
      setSheetPreview(
        selectedSheet?.svg ?? "",
      );
    }
  }, [project, sheetId, tab, selectedSheet]);
  const template = templates[templateIndex];
  const execute = (commands: CommandRequest[]) => {
    try {
      const r = onExecute(commands);
      setFeedback(
        r.status === "success"
          ? "บันทึกแล้ว · Undo/Redo ได้ทั้งชุด"
          : (r.errors ?? []).join("\n"),
      );
      return r.status === "success";
    } catch (e) {
      setFeedback(String(e));
      return false;
    }
  };
  const commitSheetViewportCenter = (center_mm: [number, number]) => {
    const saved = project.drawing_settings?.viewports[sheetId] ?? { scale_denominator: scale };
    const viewport = {
      ...saved,
      scale_denominator: scale,
      view_layout: sheetViewLayout,
      ...(subviewViewports.length ? { subviews: subviewViewports } : {}),
      ...((/^(A-02|A-03|S-02|S-03)$/.test(sheetId) || /^(A-02|S-02)-L\d+$/.test(sheetId)) ? { level_id: planLevelId } : {}),
      center_mm,
      ...(useCrop ? { crop_bounds_mm: crop.map(value => value * 1000) as [number, number, number, number] } : {}),
    };
    if (!execute([{ name: "UpdateSheetViewport", input: { sheet_id: sheetId, viewport } }])) return false;
    setUseCenter(true);
    setCenter([center_mm[0] / 1000, center_mm[1] / 1000]);
    const options = { ...viewportOptions, viewports: { ...viewportOptions.viewports, [sheetId]: viewport } };
    setSheetPreview(compilePermitDrawingSet(project, options).sheets.find(sheet => sheet.id === sheetId)!.svg);
    return true;
  };
  const commitSheetSubviewportCenter = (index: number, center_mm: [number, number]) => {
    const saved = project.drawing_settings?.viewports[sheetId] ?? { scale_denominator: scale };
    const subviews = [...subviewViewports];
    while (subviews.length <= index) subviews.push({ scale_denominator: scale });
    subviews[index] = { ...subviews[index], ...subviewViewports[index], center_mm };
    const viewport = { ...saved, view_layout: sheetViewLayout, subviews };
    if (!execute([{ name: "UpdateSheetViewport", input: { sheet_id: sheetId, viewport } }])) return false;
    setSubviewViewports(subviews);
    const options = { ...viewportOptions, viewports: { ...viewportOptions.viewports, [sheetId]: viewport } };
    const preview = compilePermitDrawingSet(project, options).sheets.find(sheet => sheet.id === sheetId);
    if (preview) setSheetPreview(preview.svg);
    return true;
  };
  const buildSelectedSheetViewport = () => ({
    scale_denominator: scale,
    view_layout: sheetViewLayout,
    ...(subviewViewports.length ? { subviews: subviewViewports } : {}),
    ...((/^(A-02|A-03|S-02|S-03)$/.test(sheetId) || /^(A-02|S-02)-L\d+$/.test(sheetId)) ? { level_id: planLevelId } : {}),
    ...(project.drawing_settings?.viewports[sheetId]?.opening_overrides ? { opening_overrides: project.drawing_settings.viewports[sheetId].opening_overrides } : {}),
    ...(project.drawing_settings?.viewports[sheetId]?.dimension_overrides ? { dimension_overrides: project.drawing_settings.viewports[sheetId].dimension_overrides } : {}),
    ...(useCenter ? { center_mm: center.map(value => value * 1000) as [number, number] } : {}),
    ...(useCrop ? { crop_bounds_mm: crop.map(value => value * 1000) as [number, number, number, number] } : {}),
  });
  const setSubviewViewport = (index: number, update: (viewport: SavedSheetSubviewport) => SavedSheetSubviewport) => {
    setSubviewViewports(current => current.map((viewport, itemIndex) => itemIndex === index ? update(viewport) : viewport));
  };
  const moveAdditionalViewport = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (index < 1 || target < 1 || target >= sheetViewLayout.length) return;
    setSheetViewLayout(current => { const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; });
    setSubviewViewports(current => { const next = [...current]; [next[index - 1], next[target - 1]] = [next[target - 1], next[index - 1]]; return next; });
  };
  const removeViewport = (index: number) => {
    if (index < 1) return;
    setSheetViewLayout(current => current.filter((_, itemIndex) => itemIndex !== index));
    setSubviewViewports(current => current.filter((_, itemIndex) => itemIndex !== index - 1));
  };
  const addViewport = () => {
    if (sheetViewLayout.length >= 4) return;
    setSheetViewLayout(current => [...current, newSheetViewKind]);
    setSubviewViewports(current => [...current, { scale_denominator: scale }]);
  };
  const sheetLayoutTemplates = project.drawing_settings?.layout_templates ?? [];
  const saveSheetLayoutTemplate = () => {
    if (!sheetLayoutTemplateName.trim()) { setFeedback("กรุณาตั้งชื่อ layout template"); return; }
    const viewports = { ...viewportOptions.viewports, [sheetId]: buildSelectedSheetViewport() };
    const id = selectedSheetLayoutTemplateId || crypto.randomUUID();
    const result = execute([{ name: "SaveSheetLayoutTemplate", input: { template: {
      id,
      name: sheetLayoutTemplateName,
      viewports,
    } } }]);
    if (result) {
      setSelectedSheetLayoutTemplateId(id);
      setFeedback("บันทึก Sheet Layout Template แล้ว · Undo/Redo ได้");
    }
  };
  const applySheetLayoutTemplate = () => {
    const template = sheetLayoutTemplates.find(item => item.id === selectedSheetLayoutTemplateId);
    if (!template) { setFeedback("เลือก Sheet Layout Template ก่อน"); return; }
    const viewportEntries = Object.entries(template.viewports).map(([id, viewport]) => {
      const existing = viewportOptions.viewports?.[id];
      return [id, {
        ...viewport,
        ...(existing?.opening_overrides ? { opening_overrides: existing.opening_overrides } : {}),
        ...(existing?.dimension_overrides ? { dimension_overrides: existing.dimension_overrides } : {}),
      }] as const;
    });
    const commands = viewportEntries.map(([id, viewport]) => ({ name: "UpdateSheetViewport", input: { sheet_id: id, viewport } }));
    if (!commands.length || !execute(commands)) return;
    const nextViewports = Object.fromEntries(viewportEntries);
    const options = { ...viewportOptions, viewports: { ...viewportOptions.viewports, ...nextViewports } };
    const preview = compilePermitDrawingSet(project, options).sheets.find(sheet => sheet.id === sheetId);
    if (preview) setSheetPreview(preview.svg);
    setFeedback(`ใช้ layout template “${template.name}” แล้ว · ${commands.length} แผ่นใน Undo เดียว`);
  };
  const download = (bytes: BlobPart, name: string, type: string) => {
    const url = URL.createObjectURL(new Blob([bytes], { type })),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const create = () => {
    const input = {
      ...payload,
      level_id: payload.level_id ?? project.project.active_level_id,
    };
    for (const k of ["start_node_id", "end_node_id", "host_id"])
      if (input[k as keyof typeof input] === "") delete (input as Payload)[k];
    execute([
      {
        name: editId ? template.update : template.create,
        input: { ...input, ...(editId ? { id: editId } : {}) },
      },
    ]);
  };
  const outputs = constructionOutputs(project);
  return (
    <Dialog title={tab === "sheets" ? "แบบและตาราง" : "เครื่องมืองานอาคาร"} subtitle="สร้างชิ้นงาน แก้รายละเอียด และจัดชุดแบบจากโครงการเดียวกัน" onClose={onClose} className="cf-workbench">
      <section
        style={{
          width: "100%",
          flex: 1,
          minHeight: 0,
          background: "#ffffff",
          color: "#33465b",
          borderRadius: 4,
          display: "flex",
          flexDirection: "column",
          padding: 12,
        }}
      >
        <nav style={{ display: "flex", gap: 6, margin: "12px 0" }}>
          <button onClick={onOpenCatalog}>
            คลังชนิด
          </button>
          <button aria-pressed={tab === "model"} onClick={() => setTab("model")}>
            สร้าง / แก้ไขชิ้นงาน
          </button>
          <button aria-pressed={tab === "sheets"} onClick={() => setTab("sheets")}>แบบและตาราง</button>
        </nav>
        <div style={{ overflow: "auto", flex: 1 }}>
          {tab === "model" && (
            <>
              <p style={{ fontSize: 12 }}>
                ขนาดระยะตามหน่วยโครงการ ({project.project.display_unit ?? 'm'})
                ข้อมูลเหล็กและระบบเป็นข้อมูลออกแบบที่ต้องตรวจสอบก่อนก่อสร้าง
                เลือกชิ้นงานเดิมเพื่อแก้ไขโดยคงการเชื่อมโยงกับแบบ
              </p>
              <select
                style={inputStyle}
                value={templateIndex}
                onChange={(e) => {
                  const i = Number(e.target.value);
                  setTemplateIndex(i);
                  setEditId("");
                  setPayload(structuredClone(templates[i].data));
                  setFeedback("");
                }}
              >
                {[
                  ['โครงสร้าง', ['structure.']], ['สถาปัตยกรรม', ['architecture.','roof.','decorative.']],
                  ['งานระบบ', ['drainage.','plumbing.','electrical.']], ['ภายใน', ['interior.']],
                  ['เพิ่มเติม', ['door_window.','mep.','surface.','site.','stair.']],
                ].map(([group,prefixes]) => <optgroup key={String(group)} label={String(group)}>{templates.map((t,i) =>
                  (prefixes as string[]).some(prefix=>t.family.startsWith(prefix)) ? <option key={`${t.create}:${t.family}`} value={i}>{t.label}</option> : null
                )}</optgroup>)}

              </select>
              <label style={fieldStyle}>
                สร้างใหม่ / แก้ชิ้นงาน
                <select
                  style={inputStyle}
                  value={editId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setEditId(id);
                    if (id && template.create === "ConfigureBeamReinforcement")
                      setPayload({
                        ...structuredClone(template.data),
                        host_id: id,
                      });
                    else if (id && template.create === "SetBeamDrop")
                      setPayload({
                        id,
                        drop_mm:
                          (project.objects[id].module_data as Payload)
                            .drop_mm ?? 0,
                      });
                    else
                      setPayload(
                        id
                          ? structuredClone(
                              project.objects[id].module_data as Payload,
                            )
                          : structuredClone(template.data),
                      );
                  }}
                >
                  <option value="">ชิ้นงานใหม่</option>
                  {Object.values(project.objects)
                    .filter((o) => o.object_type === template.family)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {String((o.module_data as Payload).mark)}
                      </option>
                    ))}
                </select>
              </label>
              {template.family === "structure.slab" && (
                <label style={fieldStyle}>
                  ชนิดพื้น
                  <select
                    style={inputStyle}
                    value={String(payload.type_id ?? "")}
                    onChange={(e) => {
                      const t = project.types.find(
                        (t) => t.id === e.target.value,
                      );
                      setPayload((p) => ({
                        ...p,
                        ...t?.parameters,
                        type_id: e.target.value || undefined,
                        instance_overrides: {},
                      }));
                    }}
                  >
                    <option value="">กำหนดเฉพาะชิ้นงาน</option>
                    {project.types
                      .filter((t) => t.object_type === "structure.slab")
                      .map((t) => (
                        <option value={t.id} key={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {template.create === "GenerateRoof" &&
                Array.isArray(payload.boundary_mm) && (
                  <svg
                    width="100%"
                    height="170"
                    viewBox="-1000 -1000 7000 4500"
                    style={{ background: "#ffffff" }}
                  >
                    <polygon
                      points={(payload.boundary_mm as number[][])
                        .map((v) => `${v[0]},${2500 - v[1]}`)
                        .join(" ")}
                      fill="#38bdf822"
                      stroke="#38bdf8"
                      strokeWidth="20"
                    />
                    {(payload.boundary_mm as number[][]).map((v, i) => (
                      <text
                        key={i}
                        x={v[0]}
                        y={2500 - v[1]}
                        fill="#33465b"
                        fontSize="180"
                      >
                        {i + 1}
                      </text>
                    ))}
                  </svg>
                )}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
                  gap: 8,
                }}
              >
                {Object.entries(payload)
                  .filter(
                    ([k]) =>
                      ![
                        "level_id",
                        "created_phase",
                        "instance_overrides",
                        "type_id",
                      ].includes(k),
                  )
                  .map(([k, v]) => (
                    <Field
                      key={k}
                      name={k}
                      value={v}
                      project={project}
                      onChange={(next) =>
                        setPayload((p) => {
                          const n = { ...p, [k]: next };
                          if (
                            k === "boundary_mm" &&
                            template.create === "GenerateRoof" &&
                            Array.isArray(next)
                          ) {
                            const old = Array.isArray(p.edges) ? p.edges : [];
                            n.edges = next.map(
                              (_, i) =>
                                old[i] ?? {
                                  defines_slope: true,
                                  slope_deg: 20,
                                },
                            );
                          }
                          return n;
                        })
                      }
                    />
                  ))}
              </div>
              <button onClick={create} style={{ padding: 7, marginTop: 12 }}>
                บันทึกชิ้นงาน / จัดเหล็กทั้งชุด
              </button>
              <button
                style={{ padding: 7, marginLeft: 8 }}
                onClick={() => execute(planPhaseProof(project))}
              >
                เพิ่มโครงการตัวอย่างทุกหมวด
              </button>
              <h3>ผลคำนวณจากโมเดล</h3>
              <button
                onClick={() => {
                  const rows = generateProjectCutList(project),
                    quote = (v: unknown) =>
                      '"' + String(v ?? "").replaceAll('"', '""') + '"';
                  download(
                    "\ufeff" +
                      [
                        [
                          "Phase",
                          "Part",
                          "Material",
                          "Cut width (m)",
                          "Cut height (m)",
                          "Thickness (m)",
                          "Edge band (m)",
                        ],
                        ...rows.map((p) => [
                          p.phase,
                          p.name,
                          p.material,
                          p.cut_mm[0] / 1000,
                          p.cut_mm[1] / 1000,
                          p.thickness_mm / 1000,
                          p.edge_band_m,
                        ]),
                      ]
                        .map((r) => r.map(quote).join(","))
                        .join("\r\n"),
                    `${project.project.id}-joinery-cut-list.csv`,
                    "text/csv;charset=utf-8",
                  );
                }}
              >
                ส่งออก Joinery cut-list CSV
              </button>
              {outputs
                .filter((o) => !editId || o.object_id === editId)
                .map((o) => (
                  <details key={o.object_id}>
                    <summary>
                      {o.mark} · {o.family} · {o.phase}
                    </summary>
                    <dl>
                      {Object.entries(o.schedule).map(([k, v]) => (
                        <div key={k}>
                          {k}: {String(v)}
                        </div>
                      ))}
                    </dl>
                    {o.warnings.map((w) => (
                      <p key={w} style={{ color: "#805200" }}>
                        {w}
                      </p>
                    ))}
                  </details>
                ))}
            </>
          )}
          {tab === "sheets" && (
            <>
              <p>
                ชุดแบบร่าง {availableSheets.length} แผ่น · สร้างแปลนสถาปัตย์และผังคานแยกให้อัตโนมัติครบทุกชั้น
                ข้อมูลที่ขาดและ viewport ที่ตัดชิ้นงานจะแสดงคำเตือนในแผ่น
              </p>
              <select
                value={sheetId}
                onChange={(e) => setSheetId(e.target.value as PermitSheetId)}
              >
                {availableSheets.map(({ id, title }) => (
                  <option key={id} value={id}>
                    {id} · {title}
                  </option>
                ))}
              </select>
              <label style={fieldStyle}>
                มาตราส่วน
                <select
                  value={scale}
                  onChange={(e) => setScale(Number(e.target.value))}
                >
                  {[20, 25, 50, 100, 200, 500].map((v) => (
                    <option key={v} value={v}>
                      1:{v}
                    </option>
                  ))}
                </select>
              </label>
              {(['A-02', 'A-03', 'S-02', 'S-03'].includes(sheetId)) && <label style={fieldStyle}>
                ชั้นของแปลน
                <select aria-label="ชั้นที่แสดงในแผ่นแปลน" value={planLevelId} onChange={e => setPlanLevelId(e.target.value)}>
                  {[...project.levels].sort((a, b) => a.elevation_mm - b.elevation_mm).map(level => <option key={level.id} value={level.id}>{level.name} · {level.elevation_mm / 1000} ม.</option>)}
                </select>
              </label>}
              <label>
                <input
                  type="checkbox"
                  checked={useCenter}
                  onChange={(e) => setUseCenter(e.target.checked)}
                />{" "}
                กำหนดจุดกึ่งกลาง (m)
              </label>
              <Field
                name="center"
                value={center}
                project={project}
                onChange={(v) => setCenter(v as [number, number])}
              />
              <label>
                <input
                  type="checkbox"
                  checked={useCrop}
                  onChange={(e) => setUseCrop(e.target.checked)}
                />{" "}
                กำหนด Crop min X/Y, max X/Y (m)
              </label>
              <Field
                name="crop"
                value={crop}
                project={project}
                onChange={(v) => setCrop(v as [number, number, number, number])}
              />
              <section aria-label="จัดวาง viewports" style={{ marginTop: 14, borderTop: "1px solid #dbe3ed", paddingTop: 10 }}>
                <h3>จัดวาง Viewports บนแผ่น</h3>
                <p>เลือกมุมมอง เพิ่ม/ลบ และเรียงลำดับได้สูงสุด 4 ช่อง กรอบและศูนย์กลางแต่ละช่องบันทึกแยกกัน</p>
                {sheetViewLayout.map((kind, index) => <section key={`${index}-${kind}`} aria-label={`ตั้งค่า viewport ${index + 1}`} style={{ border: '1px solid #dbe3ed', borderRadius: 4, padding: 8, marginTop: 8 }}>
                  <strong>Viewport {index + 1}</strong>
                  <label style={fieldStyle}>มุมมอง
                    <select aria-label={`ประเภท viewport ${index + 1}`} value={kind} onChange={event => setSheetViewLayout(current => current.map((entry, itemIndex) => itemIndex === index ? event.target.value as SheetViewKind : entry))}>
                      {SHEET_VIEW_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  {index === 0 ? <>
                    <span>{sheetViewLabel(kind)} · มาตราส่วนหลัก 1:{scale}</span>
                    {sheetViewLayout.length > 1 && <button type="button" aria-label="ลบ viewport 1" onClick={() => {
                      const promoted = subviewViewports[0] ?? { scale_denominator: scale };
                      setScale(promoted.scale_denominator);
                      setCenter(promoted.center_mm ? [promoted.center_mm[0] / 1000, promoted.center_mm[1] / 1000] : [0, 0]);
                      setUseCenter(!!promoted.center_mm);
                      setSheetViewLayout(current => current.slice(1));
                      setSubviewViewports(current => current.slice(1));
                    }}>ลบ viewport 1</button>}
                  </> : (() => {
                    const view = subviewViewports[index - 1] ?? { scale_denominator: scale };
                    const centerMm = view.center_mm ?? [0, 0];
                    return <>
                      <label style={fieldStyle}>มาตราส่วน viewport {index + 1}
                        <select aria-label={index === 1 ? 'มาตราส่วน viewport ที่สอง' : `มาตราส่วน viewport ที่ ${index + 1}`} value={view.scale_denominator} onChange={event => setSubviewViewport(index - 1, current => ({ ...current, scale_denominator: Number(event.target.value) }))}>
                          {[20, 25, 50, 100, 200, 500].map(value => <option key={value} value={value}>1:{value}</option>)}
                        </select>
                      </label>
                      <label style={fieldStyle}><input type="checkbox" aria-label={`กำหนดจุดกึ่งกลาง viewport ${index + 1}`} checked={!!view.center_mm} onChange={event => setSubviewViewport(index - 1, current => {
                        if (event.target.checked) return { ...current, center_mm: current.center_mm ?? [0, 0] };
                        const { center_mm: _center, ...rest } = current; return rest;
                      })} /> กำหนดจุดกึ่งกลาง (m)</label>
                      {view.center_mm && <Field name={`center viewport ${index + 1}`} value={[centerMm[0] / 1000, centerMm[1] / 1000]} project={project} onChange={value => setSubviewViewport(index - 1, current => ({ ...current, center_mm: (value as [number, number]).map(item => item * 1000) as [number, number] }))} />}
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" aria-label={`เลื่อน viewport ${index + 1} ขึ้น`} disabled={index <= 1} onClick={() => moveAdditionalViewport(index, -1)}>ขึ้น</button>
                        <button type="button" aria-label={`เลื่อน viewport ${index + 1} ลง`} disabled={index >= sheetViewLayout.length - 1} onClick={() => moveAdditionalViewport(index, 1)}>ลง</button>
                        <button type="button" aria-label={`ลบ viewport ${index + 1}`} onClick={() => removeViewport(index)}>ลบ</button>
                      </div>
                    </>;
                  })()}
                </section>)}
                <label style={fieldStyle}>เพิ่มมุมมอง
                  <select aria-label="ชนิด viewport ใหม่" value={newSheetViewKind} onChange={event => setNewSheetViewKind(event.target.value as SheetViewKind)}>
                    {SHEET_VIEW_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <button type="button" disabled={sheetViewLayout.length >= 4} onClick={addViewport}>เพิ่ม Viewport</button>
              </section>
              {(/^A-(02|03)(-L\d+)?$/.test(sheetId)) && <section style={{ marginTop: 18, borderTop: "1px solid #dbe3ed", paddingTop: 12 }}>
                <h3>ตำแหน่งมิติอัตโนมัติ</h3>
                <p>เลื่อนตำแหน่งเส้นและข้อความเป็นมม. ค่าระยะยังคำนวณจากโมเดลเสมอ</p>
                <select aria-label="มิติที่ต้องการล็อกตำแหน่ง" value={selectedDimensionId} onChange={(event) => setSelectedDimensionId(event.target.value)}>
                  <option value="">เลือกมิติในแผ่นนี้</option>
                  {dimensionLabels.map((primitive) => primitive.kind === "text" && primitive.dimension_id ? <option key={primitive.dimension_id} value={primitive.dimension_id}>{primitive.text} · {primitive.dimension_id}</option> : null)}
                </select>
                {selectedDimensionId && <>
                  <label style={fieldStyle}>Offset X (mm)<input aria-label="ตำแหน่งมิติ Offset X มม." type="number" value={dimensionOffsetMm[0]} onChange={(event) => setDimensionOffsetMm([Number(event.target.value), dimensionOffsetMm[1]])} /></label>
                  <label style={fieldStyle}>Offset Y (mm)<input aria-label="ตำแหน่งมิติ Offset Y มม." type="number" value={dimensionOffsetMm[1]} onChange={(event) => setDimensionOffsetMm([dimensionOffsetMm[0], Number(event.target.value)])} /></label>
                  <button onClick={() => {
                    const saved = project.drawing_settings?.viewports[sheetId] ?? { scale_denominator: scale };
                    const dimension_overrides = { ...saved.dimension_overrides, [selectedDimensionId]: { offset_mm: dimensionOffsetMm, locked: true as const } };
                    const viewport = { ...saved, dimension_overrides };
                    if (!execute([{ name: "UpdateSheetViewport", input: { sheet_id: sheetId, viewport } }])) return;
                    setSheetPreview(compilePermitDrawingSet(project, { ...viewportOptions, viewports: { ...viewportOptions.viewports, [sheetId]: viewport } }).sheets.find((sheet) => sheet.id === sheetId)!.svg);
                  }}>ล็อกตำแหน่งมิติ</button>
                  <button onClick={() => {
                    const saved = project.drawing_settings?.viewports[sheetId] ?? { scale_denominator: scale };
                    const dimension_overrides = { ...saved.dimension_overrides };
                    delete dimension_overrides[selectedDimensionId];
                    const viewport = { ...saved, dimension_overrides };
                    if (!execute([{ name: "UpdateSheetViewport", input: { sheet_id: sheetId, viewport } }])) return;
                    setDimensionOffsetMm([0, 0]);
                    setSheetPreview(compilePermitDrawingSet(project, { ...viewportOptions, viewports: { ...viewportOptions.viewports, [sheetId]: viewport } }).sheets.find((sheet) => sheet.id === sheetId)!.svg);
                  }}>คืนตำแหน่งอัตโนมัติ</button>
                </>}
              </section>}
              {(/^A-(02|03)(-L\d+)?$/.test(sheetId) || ["A-05", "A-06"].includes(sheetId)) && <section style={{ marginTop: 18, borderTop: "1px solid #dbe3ed", paddingTop: 12 }}>
                <h3>แก้เส้น 2D ช่องเปิดในแผ่นนี้</h3>
                <p>กำลังแก้{openingViewKind === "plan" ? "แปลน" : "รูปด้าน"} · เส้นฉายจากโมเดลเป็นค่าเริ่มต้น เส้นที่แก้มีผลเฉพาะแผ่นนี้ และผูกตำแหน่งกับขนาดช่องเปิด</p>
                <select aria-label="ช่องเปิดที่จะแก้เส้น" value={selectedOpeningId} onChange={(e) => setSelectedOpeningId(e.target.value)}>
                  <option value="">เลือกประตูหรือหน้าต่าง</option>
                  {planOpenings.map((o) => { const d = o.module_data as Record<string, unknown>; return <option key={o.id} value={o.id}>{String(d.mark ?? (o.object_type === "door_window.door" ? "ประตู" : "หน้าต่าง"))} · {o.object_type === "door_window.door" ? "ประตู" : "หน้าต่าง"} · {String(d.level_id ?? "")}</option>; })}
                </select>
                {selectedOpening && <>
                  <OpeningPlanSymbolEditor viewKind={openingViewKind} displayUnit={project.project.display_unit ?? 'm'} lines={openingViewKind === "plan" ? openingLines : openingElevationLines} openingWidthMm={Math.max(1, selectedOpeningWidth)} referenceDepthMm={openingViewKind === "plan" ? openingReferenceDepth : Math.max(1, selectedOpeningHeight)} onChange={openingViewKind === "plan" ? setOpeningLines : setOpeningElevationLines} onReferenceDepthChange={() => {}} onReturnToAutomatic={() => openingViewKind === "plan" ? setOpeningLines([]) : setOpeningElevationLines([])} />
                  <button onClick={() => {
                    const saved = project.drawing_settings?.viewports[sheetId] ?? { scale_denominator: scale };
                    const opening_overrides = { ...saved.opening_overrides };
                    if (openingLines.length || openingElevationLines.length) opening_overrides[selectedOpening.id] = { hide_generated_details: openingLines.length > 0, hide_generated_elevation: openingElevationLines.length > 0, lines: openingLines, elevation_lines: openingElevationLines };
                    else delete opening_overrides[selectedOpening.id];
                    const viewport = { ...saved, opening_overrides };
                    if (!execute([{ name: "UpdateSheetViewport", input: { sheet_id: sheetId, viewport } }])) return;
                    setSheetPreview(compilePermitDrawingSet(project, { ...viewportOptions, viewports: { ...viewportOptions.viewports, [sheetId]: viewport } }).sheets.find((s) => s.id === sheetId)!.svg);
                  }}>บันทึกเส้นแก้เฉพาะแผ่นนี้</button>
                </>}
              </section>}
              <button
                onClick={() => {
                  const viewport = buildSelectedSheetViewport();
                  const options = { ...viewportOptions, viewports: { ...viewportOptions.viewports, [sheetId]: viewport } };
                  try {
                    if (
                      !execute([
                        {
                          name: "UpdateSheetViewport",
                          input: {
                            sheet_id: sheetId,
                            viewport,
                          },
                        },
                      ])
                    )
                      return;
                    const set = compilePermitDrawingSet(project, options);
                    setSheetPreview(
                      set.sheets.find((s) => s.id === sheetId)!.svg,
                    );
                    setFeedback(set.warnings.join("\n"));
                  } catch (e) {
                    setFeedback(String(e));
                  }
                }}
              >
                อัปเดต Viewport / Preview
              </button>
              <section aria-label="Sheet layout templates" style={{ marginTop: 18, borderTop: "1px solid #dbe3ed", paddingTop: 12 }}>
                <h3>Sheet Layout Templates</h3>
                <p>บันทึกและใช้ซ้ำการจัด viewport ของทุกแผ่นที่ตั้งค่าแล้ว; เส้นช่องเปิดและตำแหน่งมิติที่แก้เฉพาะแผ่นจะคงเดิม</p>
                <label style={fieldStyle}>ชื่อ Template<input aria-label="ชื่อ Sheet Layout Template" value={sheetLayoutTemplateName} onChange={event => setSheetLayoutTemplateName(event.target.value)} maxLength={80} /></label>
                <button onClick={saveSheetLayoutTemplate}>บันทึก Layout Template</button>
                <label style={fieldStyle}>Template ที่บันทึกไว้
                  <select aria-label="Sheet Layout Template ที่เลือก" value={selectedSheetLayoutTemplateId} onChange={event => {
                    setSelectedSheetLayoutTemplateId(event.target.value);
                    const selected = sheetLayoutTemplates.find(item => item.id === event.target.value);
                    if (selected) setSheetLayoutTemplateName(selected.name);
                  }}>
                    <option value="">เลือก Template</option>
                    {sheetLayoutTemplates.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
                <button disabled={!selectedSheetLayoutTemplateId} onClick={applySheetLayoutTemplate}>ใช้ Layout Template</button>
                <button disabled={!selectedSheetLayoutTemplateId} onClick={() => {
                  if (!execute([{ name: "DeleteSheetLayoutTemplate", input: { template_id: selectedSheetLayoutTemplateId } }])) return;
                  setSelectedSheetLayoutTemplateId("");
                  setSheetLayoutTemplateName("");
                }}>ลบ Layout Template</button>
              </section>
              <button
                onClick={() =>
                  download(
                    renderPermitDrawingSetHtml(project, viewportOptions),
                    `${project.project.id}-${availableSheets.length}-sheets.html`,
                    "text/html",
                  )
                }
              >
                HTML / SVG ครบทุกชั้น ({availableSheets.length} แผ่น)
              </button>
              <button
                onClick={async () => {
                  try {
                    const r = await fetch("/fonts/Sarabun-Regular.ttf");
                    if (!r.ok) throw new Error("Sarabun font unavailable");
                    const bytes = await compilePermitPdf(
                      compilePermitDrawingSet(project, viewportOptions),
                      new Uint8Array(await r.arrayBuffer()),
                    );
                    download(
                      bytes as BlobPart,
                      `${project.project.id}-${availableSheets.length}-sheets.pdf`,
                      "application/pdf",
                    );
                    setFeedback(
                      `สร้าง Vector PDF ${compilePermitDrawingSet(project, viewportOptions).sheets.length} หน้า A3 พร้อมฝัง Sarabun แล้ว`,
                    );
                  } catch (e) {
                    setFeedback(String(e));
                  }
                }}
              >
                ดาวน์โหลด Vector PDF
              </button>
              <SheetViewportComposerPreview
                svg={sheetPreview}
                manualCenter={useCenter}
                centerMm={[center[0] * 1000, center[1] * 1000]}
                scaleDenominator={scale}
                onCommitCenter={commitSheetViewportCenter}
                additionalViewports={sheetViewLayout.slice(1).map((_, index) => {
                  const viewport = subviewViewports[index] ?? { scale_denominator: scale };
                  return {
                    frame: getPermitViewportPaperFrame(sheetId, index + 1, sheetViewLayout.length),
                    manualCenter: !!viewport.center_mm,
                    centerMm: viewport.center_mm ?? [0, 0],
                    scaleDenominator: viewport.scale_denominator,
                  };
                })}
                onCommitAdditionalCenter={commitSheetSubviewportCenter}
              />
            </>
          )}
        </div>
        <pre
          aria-live="polite"
          style={{
            whiteSpace: "pre-wrap",
            maxHeight: 120,
            overflow: "auto",
            color: "#805200",
            fontSize: 12,
          }}
        >
          {feedback}
        </pre>
      </section>
    </Dialog>
  );
}
