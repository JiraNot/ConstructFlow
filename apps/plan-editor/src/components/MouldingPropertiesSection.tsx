import React from 'react'
import type { SmartObject, DisplayLengthUnit, MouldingModuleData } from '@constructflow/project-model'
import { WorkbenchNumberInput } from './WorkbenchNumberInput.js'

type Props = { object: SmartObject | null; displayUnit: DisplayLengthUnit; onUpdate?: (objectId: string, changes: Partial<MouldingModuleData>) => void }
const LengthInput: React.FC<{ value: number; unit: DisplayLengthUnit; onChange: (value: number) => void; 'aria-label'?: string }> = ({ value, unit, onChange, 'aria-label': ariaLabel }) => <WorkbenchNumberInput value={value} unit={unit} onChange={onChange} ariaLabel={ariaLabel} />

export const MouldingPropertiesSection: React.FC<Props> = ({ object, displayUnit, onUpdate }) => {
  if (!object) return null
  const data = object.module_data as unknown as MouldingModuleData
  const update = (changes: Partial<MouldingModuleData>) => onUpdate?.(object.id, changes)
  const material = String(data.material ?? 'painted_wood')
  return <div style={{ display: 'grid', gap: 7 }}>
    <strong style={{ fontSize: 12, color: '#334155' }}>แนวบัว · {data.mark}</strong>
    <label className="cf-property-row">ระดับติดตั้ง ({displayUnit})
      <LengthInput value={data.path_mm[0]?.[2] ?? 0} unit={displayUnit} onChange={value => update({ path_mm: data.path_mm.map(point => [point[0], point[1], value]) })} aria-label={`ระดับติดตั้งแนวบัว (${displayUnit})`} />
    </label>
    <label className="cf-property-row">วัสดุ<select aria-label="วัสดุแนวบัว" value={material} onChange={event => update({ material: event.target.value })}>
      {!['painted_wood', 'MDF', 'gypsum', 'PU'].includes(material) && <option value={material}>{material} (ค่าปัจจุบัน)</option>}
      <option value="painted_wood">ไม้ทำสี</option><option value="MDF">MDF</option><option value="gypsum">ยิปซัม</option><option value="PU">โพลียูรีเทน</option>
    </select></label>
  </div>
}
