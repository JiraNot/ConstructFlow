import React, { useState, useEffect } from "react";
import type { ProjectDocument } from "@constructflow/project-model";
import { WorkbenchNumberInput } from "./WorkbenchNumberInput";
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
  renderPermitDrawingSetHtml,
  PERMIT_INDEX,
  type PermitSheetId,
  type PermitOptions,
} from "@constructflow/sheet-engine";

type Payload = Record<string, unknown>;
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
    label: "Phase 2 · พื้น Slab",
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
    label: "Phase 2 · เหล็กบน/ล่าง/ปลอก",
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
    label: "Phase 2 · คานลดระดับ",
    create: "SetBeamDrop",
    update: "SetBeamDrop",
    family: "structure.beam",
    data: { id: "", drop_mm: 75 },
  },
  {
    label: "Phase 2 · เสาและเหล็กปลอก",
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
    label: "Phase 2 · ฐานรากและตะแกรงล่าง",
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
    label: "Phase 3 · Roof footprint",
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
    label: "Phase 3 · บันได คสล. & ราวกันตก",
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
    label: "Phase 3 · บัวต่อเนื่อง",
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
    label: "Phase 3 · ลูกฟักผนัง",
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
    label: "Phase 4 · บ่อพัก",
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
    label: "Phase 4 · ท่อสุขาภิบาล",
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
    label: "Phase 4 · ท่อน้ำดี",
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
    label: "Phase 4 · ปั๊ม 3-valve bypass",
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
    label: "Phase 4 · ถังบำบัด / PE",
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
    label: "Phase 4 · ห้องน้ำ",
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
    label: "Phase 5 · ตู้และวัสดุแยกชิ้น",
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
    label: "Phase 5 · LED และ Driver",
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
  type_id: "ชนิดใน Catalog",
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
};
const enums: Record<string, string[]> = {
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
const fieldStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
  padding: "5px 0",
  fontSize: 12,
};
const inputStyle: React.CSSProperties = {
  background: "#0f172a",
  color: "#e2e8f0",
  border: "1px solid #475569",
  borderRadius: 4,
  padding: 7,
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
    unit = mm ? " (m)" : "";
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
                {String((o.module_data as Payload).mark ?? o.object_type)} ·{" "}
                {o.object_type} · {o.id.slice(0, 8)}
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
        style={{ border: "1px solid #334155", margin: "6px 0", padding: 8 }}
      >
        <legend>
          {label}
          {unit}
        </legend>
        <div style={{ display: "flex", gap: 8 }}>
          {tupleLabels[name].map((axis, i) => (
            <label key={axis} style={{ flex: 1, fontSize: 11 }}>
              {axis}
              <WorkbenchNumberInput
                style={inputStyle}
                value={Number(value[i])}
                unit={mm ? "mm" : undefined}
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
        style={{ border: "1px solid #334155", margin: "6px 0", padding: 8 }}
      >
        <legend>
          {label}
          {unit}
        </legend>
        {value.map((v, i) => (
          <div
            key={i}
            style={{ display: "flex", gap: 8, alignItems: "center" }}
          >
            <span>{i + 1}</span>
            <div style={{ flex: 1 }}>
              {Array.isArray(v) ? (
                <div style={{ display: "flex", gap: 4 }}>
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
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
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
                  type={typeof v === "number" ? "number" : "text"}
                  value={
                    typeof v === "number" ? v / (mm ? 1000 : 1) : String(v)
                  }
                  step="any"
                  onChange={(e) =>
                    onChange(
                      value.map((p, k) =>
                        k === i
                          ? typeof v === "number"
                            ? Number(e.target.value) * (mm ? 1000 : 1)
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
      <fieldset style={{ border: "1px solid #334155", margin: "6px 0" }}>
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
          {enums[name].map((v) => (
            <option key={v}>{v}</option>
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
          unit={mm ? "mm" : undefined}
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
}: {
  project: ProjectDocument;
  onClose: () => void;
  onExecute: (c: CommandRequest[]) => CommandBatchResult;
}) {
  const [tab, setTab] = useState<"model" | "catalog" | "sheets">("model"),
    [templateIndex, setTemplateIndex] = useState(0),
    [payload, setPayload] = useState<Payload>(
      structuredClone(templates[0].data),
    ),
    [editId, setEditId] = useState(""),
    [feedback, setFeedback] = useState("");
  const [catalogId, setCatalogId] = useState(
      project.types.find((t) => t.object_type === "structure.slab")?.id ?? "",
    ),
    [catalogDraft, setCatalogDraft] = useState<Payload>({
      thickness_mm: 120,
      topping_mm: 0,
      slab_system: "slab_on_ground",
      material: "reinforced_concrete",
    });
  const [sheetId, setSheetId] = useState<PermitSheetId>("A-02"),
    [scale, setScale] = useState(100),
    [center, setCenter] = useState<[number, number]>([0, 0]),
    [useCenter, setUseCenter] = useState(false),
    [crop, setCrop] = useState<[number, number, number, number]>([
      -5, -5, 5, 5,
    ]),
    [useCrop, setUseCrop] = useState(false),
    [sheetPreview, setSheetPreview] = useState("");
  const viewportOptions: PermitOptions = project.drawing_settings ?? {};
  useEffect(() => {
    if (tab === "sheets") {
      const saved = project.drawing_settings?.viewports[sheetId];
      setScale(
        saved?.scale_denominator ??
          PERMIT_INDEX.find((s) => s[0] === sheetId)![2],
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
      setSheetPreview(
        compilePermitDrawingSet(project).sheets.find((s) => s.id === sheetId)!
          .svg,
      );
    }
  }, [project, sheetId, tab]);
  const [newCatalogName, setNewCatalogName] = useState(""),
    [newCatalogFamily, setNewCatalogFamily] = useState("structure.slab");
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
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ConstructFlow Phase 1–6"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "#0009",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <section
        style={{
          width: "min(1000px,96vw)",
          height: "92vh",
          background: "#1e293b",
          color: "#e2e8f0",
          borderRadius: 8,
          display: "flex",
          flexDirection: "column",
          padding: 18,
        }}
      >
        <header style={{ display: "flex", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>ConstructFlow · Phase 1–6</h2>
          <button onClick={onClose}>ปิด</button>
        </header>
        <nav style={{ display: "flex", gap: 8, margin: "12px 0" }}>
          <button onClick={() => setTab("catalog")}>
            1 · Beam / Slab Catalog
          </button>
          <button onClick={() => setTab("model")}>
            2–5 · สร้าง/แก้ชิ้นงาน
          </button>
          <button onClick={() => setTab("sheets")}>6 · ชุดแบบ 20 แผ่น</button>
        </nav>
        <div style={{ overflow: "auto", flex: 1 }}>
          {tab === "model" && (
            <>
              <p style={{ fontSize: 12 }}>
                ขนาดงานเป็นเมตร
                ข้อมูลเหล็กและระบบเป็นข้อมูลออกแบบที่ต้องตรวจสอบก่อนก่อสร้าง
                เลือกชิ้นงานเดิมเพื่อแก้ด้วย UUID เดิม
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
                {templates.map((t, i) => (
                  <option key={`${t.create}:${t.family}`} value={i}>
                    {t.label}
                  </option>
                ))}
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
                        {String((o.module_data as Payload).mark)} ·{" "}
                        {o.id.slice(0, 8)}
                      </option>
                    ))}
                </select>
              </label>
              {template.family === "structure.slab" && (
                <label style={fieldStyle}>
                  Slab Catalog
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
                    style={{ background: "#0f172a" }}
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
                        fill="white"
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
                  gap: 12,
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
              <button onClick={create} style={{ padding: 10, marginTop: 12 }}>
                บันทึกชิ้นงาน / จัดเหล็กทั้งชุด
              </button>
              <button
                style={{ padding: 10, marginLeft: 8 }}
                onClick={() => execute(planPhaseProof(project))}
              >
                เพิ่มตัวอย่าง Phase 1–6 เพื่อทดสอบ
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
                          "Part UUID",
                          "Object UUID",
                          "Phase",
                          "Part",
                          "Material",
                          "Cut width (m)",
                          "Cut height (m)",
                          "Thickness (m)",
                          "Edge band (m)",
                        ],
                        ...rows.map((p) => [
                          p.id,
                          p.object_id,
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
                      <p key={w} style={{ color: "#fbbf24" }}>
                        {w}
                      </p>
                    ))}
                  </details>
                ))}
            </>
          )}
          {tab === "catalog" && (
            <>
              <details>
                <summary>เพิ่ม Beam / Slab Type</summary>
                <select
                  value={newCatalogFamily}
                  onChange={(e) => {
                    const f = e.target.value;
                    setNewCatalogFamily(f);
                    setCatalogDraft(
                      f === "structure.slab"
                        ? {
                            thickness_mm: 120,
                            topping_mm: 0,
                            slab_system: "slab_on_ground",
                            material: "reinforced_concrete",
                          }
                        : {
                            section_mm: [200, 400],
                            material: "reinforced_concrete",
                            drop_mm: 0,
                          },
                    );
                  }}
                >
                  <option value="structure.slab">Slab</option>
                  <option value="structure.beam">Beam</option>
                </select>
                <input
                  value={newCatalogName}
                  placeholder="ชื่อชนิดใหม่"
                  onChange={(e) => setNewCatalogName(e.target.value)}
                />
                <button
                  onClick={() =>
                    execute([
                      {
                        name: "DefineStructuralType",
                        input: {
                          object_type: newCatalogFamily,
                          name: newCatalogName,
                          parameters: catalogDraft,
                        },
                      },
                    ])
                  }
                >
                  สร้างชนิดใหม่จากค่าด้านล่าง
                </button>
              </details>
              <p>
                แก้ชนิดคาน/พื้นครั้งเดียว อัปเดตชิ้นงานที่อ้าง UUID เดียวกัน
                พร้อม 3D, BOQ และแบบ
              </p>
              <select
                style={inputStyle}
                value={catalogId}
                onChange={(e) => {
                  const id = e.target.value,
                    t = project.types.find((t) => t.id === id)!;
                  setCatalogId(id);
                  setCatalogDraft(structuredClone(t.parameters));
                }}
              >
                {project.types
                  .filter((t) =>
                    ["structure.slab", "structure.beam"].includes(
                      t.object_type,
                    ),
                  )
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {t.object_type}
                    </option>
                  ))}
              </select>
              {Object.entries(catalogDraft).map(([k, v]) => (
                <Field
                  key={k}
                  name={k}
                  value={v}
                  project={project}
                  onChange={(next) =>
                    setCatalogDraft((p) => ({ ...p, [k]: next }))
                  }
                />
              ))}
              <button
                onClick={() =>
                  execute([
                    {
                      name: "UpdateStructuralTypeDimensions",
                      input: {
                        type_id_or_name: catalogId,
                        parameters: catalogDraft,
                      },
                    },
                  ])
                }
              >
                บันทึก Catalog และ Cascade
              </button>
              <button
                onClick={() => {
                  const t = project.types.find((t) => t.id === catalogId);
                  if (t?.object_type === "structure.beam")
                    setCatalogDraft((p) => ({
                      ...p,
                      drop_mm: 0,
                      rebar_type: {
                        top: bar,
                        bottom: bar,
                        stirrups: {
                          ...bar,
                          grade: "SR24",
                          diameter_mm: 6,
                          bend_radius_mm: 12,
                          hook_angle_deg: 135,
                          hook_extension_mm: 60,
                          spacing_zones: [
                            {
                              start_ratio: 0,
                              end_ratio: 0.25,
                              spacing_mm: 100,
                            },
                            {
                              start_ratio: 0.25,
                              end_ratio: 0.75,
                              spacing_mm: 150,
                            },
                            {
                              start_ratio: 0.75,
                              end_ratio: 1,
                              spacing_mm: 100,
                            },
                          ],
                        },
                      },
                    }));
                }}
              >
                เพิ่มรายละเอียดเหล็กใน Beam Type
              </button>
            </>
          )}
          {tab === "sheets" && (
            <>
              <p>
                ชุดแบบร่าง 20 แผ่นจากโมเดล ข้อมูลที่ขาดและ viewport
                ที่ตัดชิ้นงานจะแสดงคำเตือนในแผ่น
              </p>
              <select
                value={sheetId}
                onChange={(e) => setSheetId(e.target.value as PermitSheetId)}
              >
                {PERMIT_INDEX.map(([id, title]) => (
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
              <button
                onClick={() => {
                  const options = {
                    ...viewportOptions,
                    viewports: {
                      ...viewportOptions.viewports,
                      [sheetId]: {
                        scale_denominator: scale,
                        ...(useCenter
                          ? {
                              center_mm: center.map((v) => v * 1000) as [
                                number,
                                number,
                              ],
                            }
                          : {}),
                        ...(useCrop
                          ? {
                              crop_bounds_mm: crop.map((v) => v * 1000) as [
                                number,
                                number,
                                number,
                                number,
                              ],
                            }
                          : {}),
                      },
                    },
                  };
                  try {
                    if (
                      !execute([
                        {
                          name: "UpdateSheetViewport",
                          input: {
                            sheet_id: sheetId,
                            viewport: options.viewports![sheetId],
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
              <button
                onClick={() =>
                  download(
                    renderPermitDrawingSetHtml(project, viewportOptions),
                    `${project.project.id}-20-sheets.html`,
                    "text/html",
                  )
                }
              >
                HTML / SVG 20 แผ่น
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
                      `${project.project.id}-20-sheets.pdf`,
                      "application/pdf",
                    );
                    setFeedback(
                      "สร้าง Vector PDF 20 หน้า A3 พร้อมฝัง Sarabun แล้ว",
                    );
                  } catch (e) {
                    setFeedback(String(e));
                  }
                }}
              >
                ดาวน์โหลด Vector PDF
              </button>
              {sheetPreview && (
                <div
                  style={{ background: "white", marginTop: 16 }}
                  dangerouslySetInnerHTML={{ __html: sheetPreview.replace('width="420mm" height="297mm"','style="width:100%;height:auto;display:block"') }}
                />
              )}
            </>
          )}
        </div>
        <pre
          aria-live="polite"
          style={{
            whiteSpace: "pre-wrap",
            maxHeight: 120,
            overflow: "auto",
            color: "#fbbf24",
            fontSize: 12,
          }}
        >
          {feedback}
        </pre>
      </section>
    </div>
  );
}
