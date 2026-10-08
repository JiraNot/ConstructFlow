import React from "react";
const labels: Record<string, string> = {
  section_mm: "หน้าตัด",
  size_mm: "ขนาดฐานราก",
  width_mm: "กว้าง",
  height_mm: "สูง",
  thickness_mm: "ความหนารวม",
  plaster_thickness_mm: "ความหนาฉาบเสา",
  masonry_thickness_mm: "ความหนาแกน / โครง",
  plaster_inside_thickness_mm: "ชั้นผิวด้านใน",
  plaster_outside_thickness_mm: "ชั้นผิวด้านนอก",
  wall_system: "ระบบผนัง",
  sill_height_mm: "ระดับธรณี",
  transom_height_mm: "ช่องแสงบน",
  bottom_light_height_mm: "ช่องแสงล่าง",
  muntin_rows: "ลูกฟักแนวนอน",
  muntin_columns: "ลูกฟักแนวตั้ง",
  frame_depth_mm: "ความลึกวงกบ",
  frame_face_width_mm: "หน้ากว้างวงกบ",
  sash_face_width_mm: "หน้ากว้างบาน / กรอบบาน",
  door_leaf_thickness_mm: "ความหนาบานประตู",
  frame_material: "วงกบ",
  panel_material: "วัสดุบาน",
  glazing_material: "กระจก",
  door_leaf_style: "ลายหน้าบาน",
  opening_handle_style: "มือจับ",
  opening_hardware_finish: "สีมือจับ",
  glazing_transmission: "ความโปร่ง (0–1)",
  material: "วัสดุ",
  topping_mm: "คอนกรีตทับหน้า",
  slab_system: "ระบบพื้น",
  drop_mm: "ระยะลดระดับ",
  mass_per_m_kg: "น้ำหนักต่อเมตร (กก.)",
  foundation_type: "ระบบฐานราก",
  pile_type: "ชนิดเข็ม",
  pile_length_mm: "ความยาวเข็ม",
  pile_offsets_mm: "ตำแหน่งเข็ม",
  rebar_type: "เหล็กเสริม",
  top: "เหล็กบน",
  bottom: "เหล็กล่าง",
  stirrups: "เหล็กปลอก",
  grade: "เกรดเหล็ก",
  diameter_mm: "เส้นผ่านศูนย์กลาง",
  cover_mm: "คอนกรีตหุ้ม",
  count: "จำนวนเส้น",
  bend_radius_mm: "รัศมีดัด",
  hook_angle_deg: "มุมขอ (องศา)",
  hook_extension_mm: "ระยะขอ",
  lap_mm: "ระยะทาบ",
  legs_mm: "ความยาวช่วง",
  spacing_zones: "โซนเรียงปลอก",
  start_ratio: "เริ่มช่วง (0–1)",
  end_ratio: "จบช่วง (0–1)",
  spacing_mm: "ระยะเรียง",
  plaster_inside_material: "ผิวสำเร็จด้านใน",
  plaster_outside_material: "ผิวสำเร็จด้านนอก",
};
const options: Record<string, [string, string][]> = {
  door_leaf_style: [
    ["flush", "บานเรียบ"],
    ["raised_2_panel", "ลูกฟัก 2 ช่อง"],
    ["raised_4_panel", "ลูกฟัก 4 ช่อง"],
    ["raised_6_panel", "ลูกฟัก 6 ช่อง"],
    ["horizontal_grooves_3", "เซาะร่องแนวนอน 3 เส้น"],
    ["horizontal_grooves_5", "เซาะร่องแนวนอน 5 เส้น"],
    ["vertical_grooves_3", "เซาะร่องแนวตั้ง 3 เส้น"],
    ["louvered", "บานเกล็ด"],
  ],
  opening_handle_style: [
    ["lever", "ก้านโยก"],
    ["round_knob", "ลูกบิดกลม"],
    ["pull_handle", "มือจับก้านดึง"],
    ["recessed_pull", "มือจับฝัง / มือจับหลุม"],
    ["none", "ไม่แสดงมือจับ"],
  ],
  opening_hardware_finish: [
    ["stainless", "สเตนเลส / เงิน"],
    ["matte_black", "ดำด้าน"],
    ["satin_brass", "ทองเหลืองซาติน"],
    ["bronze", "บรอนซ์"],
  ],
  frame_material: [
    ["aluminium", "อะลูมิเนียม"],
    ["timber", "ไม้"],
    ["uPVC", "uPVC"],
  ],
  panel_material: [
    ["timber", "ไม้จริง/ไม้ประกอบ"],
    ["hdf", "HDF"],
    ["mdf", "MDF"],
    ["wpc", "WPC"],
    ["pvc", "PVC"],
    ["uPVC", "uPVC"],
    ["aluminium", "อะลูมิเนียม"],
    ["steel", "เหล็ก"],
    ["flush", "ไม่ระบุวัสดุ · ค่าเดิม"],
  ],
  glazing_material: [
    ["none", "บานทึบ"],
    ["clear_glass", "กระจกใส"],
    ["frosted_glass", "กระจกฝ้า"],
    ["tinted_glass", "กระจกสี"],
  ],
  slab_system: [
    ["slab_on_ground", "พื้นวางบนดิน"],
    ["suspended", "พื้นหล่อบนคาน"],
    ["precast_plank", "พื้นสำเร็จรูป"],
    ["hollow_core", "พื้น Hollow Core"],
  ],
  plaster_inside_material: [
    ["cement_plaster", "ฉาบปูน"], ["interior_paint", "สีภายใน"], ["ceramic_tile", "กระเบื้อง"],
    ["stone_cladding", "กรุหิน"], ["timber_cladding", "กรุไม้"], ["wallpaper", "วอลล์เปเปอร์"],
    ["exposed_masonry", "โชว์ผิวก่อ"], ["smartboard", "สมาร์ทบอร์ด"], ["fiber_cement_board", "ไฟเบอร์ซีเมนต์บอร์ด"], ["gypsum_board", "ยิปซัมบอร์ด"], ["composite_panel", "แผ่นคอมโพซิต"], ["faux_wood_panel", "แผ่นลายไม้เทียม"], ["none", "ไม่ตกแต่ง"],
  ],
  plaster_outside_material: [
    ["cement_plaster", "ฉาบปูน"], ["exterior_paint", "สีภายนอก"], ["ceramic_tile", "กระเบื้อง"],
    ["stone_cladding", "กรุหิน"], ["timber_cladding", "กรุไม้"], ["exposed_masonry", "โชว์ผิวก่อ"], ["smartboard", "สมาร์ทบอร์ด"], ["fiber_cement_board", "ไฟเบอร์ซีเมนต์บอร์ด"], ["gypsum_board", "ยิปซัมบอร์ด"], ["composite_panel", "แผ่นคอมโพซิต"], ["faux_wood_panel", "แผ่นลายไม้เทียม"], ["none", "ไม่ตกแต่ง"],
  ],
  wall_system: [["masonry", "ผนังก่ออิฐ / อิฐมวลเบา"], ["c_stud_smartboard", "โครงซีไลน์ + สมาร์ทบอร์ด"], ["steel_frame_board", "โครงเหล็ก + แผ่นบอร์ด"], ["composite_panel", "ผนังแผ่นคอมโพซิต"], ["faux_wood_cladding", "ผนังลายไม้เทียม"], ["custom", "ระบบผนังอื่น · กำหนดเอง"]],
  material: [
    ["reinforced_concrete", "คอนกรีตเสริมเหล็ก"],
    ["lightweight_block", "อิฐมวลเบา"],
    ["brick_masonry", "อิฐก่อ"],
    ["steel_stud", "โครงคร่าวเหล็ก"],
    ["steel", "เหล็ก"],
    ["timber", "ไม้"],
    ["generic", "ทั่วไป"],
  ],
  foundation_type: [
    ["spread_footing", "ฐานรากแผ่"],
    ["pile_cap", "ฐานรากเสาเข็ม"],
  ],
  grade: [
    ["SR24", "SR24"],
    ["SD40", "SD40"],
    ["SD50", "SD50"],
  ],
};
/** UI drafts only; command validation owns the meaning and validity of parameters. */
export function CatalogField({
  name,
  value,
  onChange,
}: {
  name: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const label =
    (labels[name] ?? name.replaceAll("_", " ")) +
    (name.endsWith("_mm") ? " (มม.)" : "");
  if (Array.isArray(value))
    return (
      <fieldset className="cf-form-section">
        <legend>{label}</legend>
        <div className="cf-field-grid">
          {value.map((item, i) => (
            <div key={i}>
              <CatalogField
                name={
                  ["section_mm", "size_mm"].includes(name)
                    ? ["กว้าง", "ลึก / ยาว", "หนา"][i]
                    : String(i + 1)
                }
                value={item}
                onChange={(next) =>
                  onChange(value.map((v, j) => (i === j ? next : v)))
                }
              />
              {!["section_mm", "size_mm"].includes(name) && (
                <button
                  type="button"
                  className="cf-button"
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                >
                  ลบ {i + 1}
                </button>
              )}
            </div>
          ))}
        </div>
        {!["section_mm", "size_mm"].includes(name) && (
          <button
            type="button"
            className="cf-button cf-button-quiet"
            onClick={() =>
              onChange([...value, structuredClone(value.at(-1) ?? 0)])
            }
          >
            เพิ่มรายการ
          </button>
        )}
      </fieldset>
    );
  if (value && typeof value === "object")
    return (
      <fieldset className="cf-form-section">
        <legend>{label}</legend>
        <div className="cf-field-grid">
          {Object.entries(value).map(([key, item]) => (
            <CatalogField
              key={key}
              name={key}
              value={item}
              onChange={(next) => onChange({ ...value, [key]: next })}
            />
          ))}
        </div>
      </fieldset>
    );
  if (typeof value === "boolean")
    return (
      <label className="cf-field">
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
  const choices = options[name];
  const customWallSystem = name === "wall_system" && (value === "custom" || !choices?.some(([id]) => id === String(value)));
  return (
    <>
    <label className="cf-field">
      <span>{label}</span>
      {choices ? (
        <select
          aria-label={label}
          value={customWallSystem ? "custom" : String(value ?? "")}
          onChange={(e) => onChange(name === "wall_system" && e.target.value === "custom" ? "custom" : e.target.value)}
        >
          {!choices.some(([id]) => id === String(value)) && (
            <option value={String(value ?? "")}>
              {String(value ?? "เลือก")}
            </option>
          )}
          {choices.map(([id, text]) => (
            <option key={id} value={id}>
              {text}
            </option>
          ))}
        </select>
      ) : (
        <input
          aria-label={label}
          type={typeof value === "number" ? "number" : "text"}
          step="any"
          value={value == null ? "" : String(value)}
          onChange={(e) =>
            onChange(
              typeof value === "number"
                ? Number(e.target.value)
                : e.target.value,
            )
          }
        />
      )}
    </label>
    {customWallSystem && <label className="cf-field"><span>ชื่อระบบผนัง</span><input aria-label="ชื่อระบบผนัง" value={value === "custom" ? "" : String(value ?? "")} placeholder="เช่น โครงไม้ + แผ่นไฟเบอร์ซีเมนต์" onChange={e => onChange(e.target.value || "custom")} /></label>}
    </>
  );
}
