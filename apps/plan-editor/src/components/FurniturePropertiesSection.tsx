import React from 'react'
import type { DisplayLengthUnit, InteriorFurnitureModuleData, SmartObject } from '@constructflow/project-model'
import { WorkbenchNumberInput } from './WorkbenchNumberInput.js'

const names: Record<InteriorFurnitureModuleData['kind'], string> = {
  sofa: 'โซฟา', chair: 'เก้าอี้', dining_table: 'โต๊ะอาหาร', coffee_table: 'โต๊ะกลาง', desk: 'โต๊ะทำงาน',
  bed_single: 'เตียงเดี่ยว', bed_double: 'เตียงคู่', toilet: 'โถสุขภัณฑ์', washbasin: 'อ่างล้างหน้า', bathtub: 'อ่างอาบน้ำ',
}
const LengthInput: React.FC<{ value: number; unit: DisplayLengthUnit; label: string; onChange: (value: number) => void }> = ({ value, unit, label, onChange }) => <WorkbenchNumberInput value={value} unit={unit} onChange={onChange} ariaLabel={label} />

export function FurniturePropertiesSection({ object, displayUnit, onUpdate }: {
  object: SmartObject | null; displayUnit: DisplayLengthUnit; onUpdate?: (objectId: string, changes: Partial<InteriorFurnitureModuleData>) => void
}) {
  if (!object) return null
  const data = object.module_data as InteriorFurnitureModuleData
  const update = (changes: Partial<InteriorFurnitureModuleData>) => onUpdate?.(object.id, changes)
  return <section style={{ display: 'grid', gap: 7, padding: 8, border: '1px solid #e2e8f0', borderRadius: 5 }}>
    <strong style={{ fontSize: 12 }}>เฟอร์นิเจอร์ · {data.mark}</strong>
    <label className="cf-property-row">รหัส<input aria-label="รหัสเฟอร์นิเจอร์" value={data.mark} onChange={event => update({ mark: event.target.value })} /></label>
    <label className="cf-property-row">ชนิด<select aria-label="ชนิดเฟอร์นิเจอร์" value={data.kind} onChange={event => update({ kind: event.target.value as InteriorFurnitureModuleData['kind'] })}>
      {(Object.keys(names) as InteriorFurnitureModuleData['kind'][]).map(kind => <option key={kind} value={kind}>{names[kind]}</option>)}
    </select></label>
    <label className="cf-property-row">กว้าง ({displayUnit})<LengthInput value={data.width_mm} unit={displayUnit} label={`ความกว้างเฟอร์นิเจอร์ (${displayUnit})`} onChange={value => update({ width_mm: Math.max(200, value) })} /></label>
    <label className="cf-property-row">ลึก ({displayUnit})<LengthInput value={data.depth_mm} unit={displayUnit} label={`ความลึกเฟอร์นิเจอร์ (${displayUnit})`} onChange={value => update({ depth_mm: Math.max(200, value) })} /></label>
    <label className="cf-property-row">สูง ({displayUnit})<LengthInput value={data.height_mm} unit={displayUnit} label={`ความสูงเฟอร์นิเจอร์ (${displayUnit})`} onChange={value => update({ height_mm: Math.max(200, value) })} /></label>
    <label className="cf-property-row">หมุน (องศ)<input aria-label="องศาหมุนเฟอร์นิเจอร์" type="number" step="1" value={data.rotation_deg} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) update({ rotation_deg: value }) }} /></label>
    <small style={{ color: '#64748b' }}>ลากวางเพื่อกำหนดความกว้างและทิศ · ปรับชนิดและขนาดได้ที่นี่</small>
  </section>
}
