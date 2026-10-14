import React from 'react'
import type { SmartObject, DisplayLengthUnit, CabinetModuleData } from '@constructflow/project-model'
import { WorkbenchNumberInput } from './WorkbenchNumberInput.js'

type Props = { object: SmartObject | null; displayUnit: DisplayLengthUnit; onUpdate?: (objectId: string, changes: Partial<CabinetModuleData>) => void }
const LengthInput: React.FC<{ value: number; unit: DisplayLengthUnit; onChange: (value: number) => void; 'aria-label'?: string }> = ({ value, unit, onChange, 'aria-label': ariaLabel }) => <WorkbenchNumberInput value={value} unit={unit} onChange={onChange} ariaLabel={ariaLabel} />

export const CabinetPropertiesSection: React.FC<Props> = ({ object, displayUnit, onUpdate }) => {
  if (!object) return null
  const data = object.module_data as unknown as CabinetModuleData
  const update = (changes: Partial<CabinetModuleData>) => onUpdate?.(object.id, changes)
  const resizeWidth = (width: number) => {
    if (!Number.isFinite(width) || width <= 0) return
    const previous = data.width_mm
    const source = data.modules_mm.length ? data.modules_mm : [previous]
    const scaled = source.map(value => value * width / previous)
    scaled[scaled.length - 1] += width - scaled.reduce((sum, value) => sum + value, 0)
    update({ width_mm: width, modules_mm: scaled })
  }
  return <div style={{ display: 'grid', gap: 7 }}>
    <strong style={{ fontSize: 12, color: '#334155' }}>บิลท์อิน · {data.mark}</strong>
    <label className="cf-property-row">กว้าง ({displayUnit})<LengthInput value={data.width_mm} unit={displayUnit} onChange={resizeWidth} aria-label={`ความกว้างบิลท์อิน (${displayUnit})`} /></label>
    <label className="cf-property-row">สูง ({displayUnit})<LengthInput value={data.height_mm} unit={displayUnit} onChange={value => update({ height_mm: Math.max(value, data.plinth_mm + data.board_mm * 5) })} aria-label={`ความสูงบิลท์อิน (${displayUnit})`} /></label>
    <label className="cf-property-row">ลึก ({displayUnit})<LengthInput value={data.depth_mm} unit={displayUnit} onChange={value => update({ depth_mm: Math.max(value, 2 * data.board_mm + data.back_mm + 1) })} aria-label={`ความลึกบิลท์อิน (${displayUnit})`} /></label>
    <label className="cf-property-row">หมุน (องศา)<input aria-label="องศาหมุนบิลท์อิน" type="number" step="1" value={data.rotation_deg} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) update({ rotation_deg: value }) }} /></label>
    <label className="cf-property-row">หน้าบาน<select aria-label="รูปแบบหน้าบานบิลท์อิน" value={data.front} onChange={event => update({ front: event.target.value as CabinetModuleData['front'] })}><option value="solid">ทึบ</option><option value="glass">กระจก</option><option value="open">เปิดโล่ง</option></select></label>
  </div>
}
