import type { TypeParameters } from './project.js'
import { DOOR_FACE_DESIGNS } from './doorFaceDesigns.js'

/** Design starting points; copied into a new catalog type through CommandBus. */
export interface OpeningDesign {
  key: string
  name: string
  collection: 'modern' | 'classic' | 'natural' | 'utility'
  description: string
  object_type: 'door_window.door' | 'door_window.window'
  parameters: TypeParameters
}

const door: TypeParameters = {
  width_mm: 900, height_mm: 2100, opening_operation: 'hinged', panel_count: 1,
  frame_depth_mm: 90, frame_material: 'timber', panel_material: 'timber',
  door_leaf_style: 'flush', opening_handle_style: 'lever', opening_hardware_finish: 'matte_black',
  glazing_material: 'none', glazing_transmission: 0, transom_height_mm: 0,
  muntin_rows: 1, muntin_columns: 1,
}
const window: TypeParameters = {
  width_mm: 1500, height_mm: 1200, sill_height_mm: 900, opening_operation: 'sliding', panel_count: 2,
  frame_depth_mm: 75, frame_material: 'aluminium', opening_handle_style: 'recessed_pull',
  opening_hardware_finish: 'stainless', glazing_material: 'clear_glass', glazing_transmission: 0.72,
  transom_height_mm: 0, bottom_light_height_mm: 0, muntin_rows: 1, muntin_columns: 1,
}
function design(key: string, name: string, collection: OpeningDesign['collection'], description: string,
  object_type: OpeningDesign['object_type'], overrides: TypeParameters): OpeningDesign {
  const p = { ...(object_type === 'door_window.door' ? door : window), ...overrides }
  const count = p.panel_count ?? 1
  return { key, name, collection, description, object_type, parameters: {
    ...p, panel_layout: p.panel_layout ?? Array.from({ length: count }, () => p.opening_operation!),
    panel_width_ratios: p.panel_width_ratios ?? Array.from({ length: count }, () => 1 / count),
  } }
}

export const OPENING_DESIGNS: readonly OpeningDesign[] = [
  design('D-M01', 'โมเดิร์นไม้เรียบ', 'modern', 'บานไม้เรียบเต็มแผ่น · มือจับดำด้าน', 'door_window.door', {}),
  design('D-M02', 'เส้นนอนร่วมสมัย', 'modern', 'เซาะร่อง 5 เส้น · ก้านดึงยาว', 'door_window.door', { width_mm: 1000, height_mm: 2400, door_leaf_style: 'horizontal_grooves_5', opening_handle_style: 'pull_handle' }),
  design('D-N01', 'ไม้เส้นตั้ง', 'natural', 'จังหวะร่องตั้ง · อุปกรณ์บรอนซ์', 'door_window.door', { door_leaf_style: 'vertical_grooves_3', opening_hardware_finish: 'bronze' }),
  design('D-C01', 'คลาสสิกสองลูกฟัก', 'classic', 'บาน HDF · ก้านโยกทองเหลืองซาติน', 'door_window.door', { panel_material: 'hdf', door_leaf_style: 'raised_2_panel', opening_hardware_finish: 'satin_brass' }),
  design('D-C02', 'ประตูคู่หกลูกฟัก', 'classic', 'ทางเข้าบานคู่ · ลูกฟักนูนสองด้าน', 'door_window.door', { width_mm: 1800, height_mm: 2400, panel_count: 2, door_leaf_style: 'raised_6_panel', opening_hardware_finish: 'bronze' }),
  design('D-C03', 'เฟรนช์กระจกคู่', 'classic', 'กรอบไม้ · กระจกแบ่งช่องรายบาน', 'door_window.door', { width_mm: 1600, height_mm: 2400, panel_count: 2, glazing_material: 'clear_glass', glazing_transmission: 0.75, muntin_rows: 4, muntin_columns: 2, opening_hardware_finish: 'satin_brass' }),
  design('D-M03', 'กระจกเลื่อนพาโนรามา', 'modern', 'กระจกใส 3 บาน · มือจับฝัง', 'door_window.door', { width_mm: 3000, height_mm: 2400, panel_count: 3, opening_operation: 'sliding', frame_material: 'aluminium', panel_material: 'aluminium', frame_depth_mm: 120, glazing_material: 'clear_glass', glazing_transmission: 0.8, opening_handle_style: 'recessed_pull' }),
  design('D-U01', 'บานเกล็ดไม้', 'utility', 'หน้าบานเกล็ด · ลูกบิดบรอนซ์', 'door_window.door', { width_mm: 800, door_leaf_style: 'louvered', opening_handle_style: 'round_knob', opening_hardware_finish: 'bronze' }),
  design('W-M01', 'เลื่อนกระจกใส', 'modern', 'สองบาน · กรอบอะลูมิเนียม', 'door_window.window', {}),
  design('W-M02', 'ภาพวิวเต็มช่อง', 'modern', 'กระจกติดตายเต็มบาน · ไม่มีมือจับ', 'door_window.window', { width_mm: 1800, height_mm: 1600, sill_height_mm: 600, opening_operation: 'fixed', panel_count: 1, opening_handle_style: 'none' }),
  design('W-C01', 'บานเปิดคอตเทจ', 'classic', 'กรอบไม้ · ลูกฟัก 6 ช่องต่อบาน', 'door_window.window', { opening_operation: 'hinged', frame_material: 'timber', muntin_rows: 3, muntin_columns: 2, opening_handle_style: 'lever', opening_hardware_finish: 'satin_brass' }),
  design('W-N01', 'กรอบไม้ช่องบน', 'natural', 'บานเปิดคู่ · ช่องแสงบนแบ่ง 3 ช่อง', 'door_window.window', { width_mm: 1600, height_mm: 1600, opening_operation: 'hinged', frame_material: 'timber', transom_height_mm: 300, transom_muntin_columns: 3, opening_handle_style: 'lever', opening_hardware_finish: 'bronze' }),
  design('W-U01', 'กระทุ้งกระจกฝ้า', 'utility', 'ช่องขนาดกะทัดรัด · กระจกฝ้า', 'door_window.window', { width_mm: 800, height_mm: 600, sill_height_mm: 1500, opening_operation: 'awning', panel_count: 1, glazing_material: 'frosted_glass', glazing_transmission: 0.4, opening_handle_style: 'lever' }),
  design('W-M03', 'กระจกผสมสามส่วน', 'modern', 'บานเปิดข้าง · กระจกติดตายกลาง', 'door_window.window', { width_mm: 2400, height_mm: 1500, panel_count: 3, opening_operation: 'fixed', panel_layout: ['hinged', 'fixed', 'hinged'], panel_width_ratios: [0.25, 0.5, 0.25], opening_handle_style: 'lever' }),
  design('W-C02', 'กระจกกริดติดตาย', 'classic', 'กรอบไม้ · ตารางกระจก 3 × 3', 'door_window.window', { width_mm: 1500, height_mm: 1500, panel_count: 1, opening_operation: 'fixed', frame_material: 'timber', muntin_rows: 3, muntin_columns: 3, opening_handle_style: 'none' }),
  design('W-M04', 'เลื่อนพร้อมช่องแสง', 'modern', 'ช่องบน–ล่างแยกจากบานเลื่อน', 'door_window.window', { width_mm: 1800, height_mm: 1800, sill_height_mm: 600, transom_height_mm: 300, bottom_light_height_mm: 300, transom_muntin_columns: 2, bottom_light_muntin_columns: 2 }),
]

// Apply the reusable face recipes to the display-oriented timber door presets.
for (const design of OPENING_DESIGNS) {
  if (design.object_type !== 'door_window.door') continue
  const recipe = DOOR_FACE_DESIGNS.find(item =>
    (design.key === 'D-M01' && item.key === 'tall-panel') ||
    (design.key === 'D-M02' && item.key === 'plank-8') ||
    (design.key === 'D-N01' && item.key === 'reeded-frame') ||
    (design.key === 'D-C01' && item.key === 'classic-three') ||
    (design.key === 'D-C02' && item.key === 'five-panel') ||
    (design.key === 'D-C03' && item.key === 'classic-three') ||
    (design.key === 'D-U01' && item.key === 'reeded-full'))
  if (recipe) design.parameters.door_face_components = structuredClone(recipe.components)
}
