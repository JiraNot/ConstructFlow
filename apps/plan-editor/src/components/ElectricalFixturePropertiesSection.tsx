import React from 'react'
import type { ProjectDocument, SmartObject, DisplayLengthUnit, ElectricalFixtureModuleData, CircuitModuleData } from '@constructflow/project-model'
import { WorkbenchNumberInput } from './WorkbenchNumberInput.js'

type Props = {
  project: ProjectDocument
  displayUnit: DisplayLengthUnit
  object: SmartObject | null
  onUpdate?: (objectId: string, changes: Partial<ElectricalFixtureModuleData>) => void
  onAssignToCircuit?: (fixtureId: string, circuitId: string | null) => void
}

const LengthInput: React.FC<{ value: number; unit: DisplayLengthUnit; onChange: (value: number) => void; 'aria-label'?: string }> = ({ value, unit, onChange, 'aria-label': ariaLabel }) => <WorkbenchNumberInput value={value} unit={unit} onChange={onChange} ariaLabel={ariaLabel} />

export const ElectricalFixturePropertiesSection: React.FC<Props> = ({ project, displayUnit, object, onUpdate, onAssignToCircuit }) => {
  if (!object) return null
  const data = object.module_data as unknown as ElectricalFixtureModuleData
  const update = (changes: Partial<ElectricalFixtureModuleData>) => onUpdate?.(object.id, changes)
  const circuits = Object.values(project.objects).filter(candidate => candidate.object_type === 'electrical.circuit' && candidate.removed_phase === null)
  const inferredCircuitId = circuits.find(circuit => (circuit.module_data as unknown as CircuitModuleData).device_ids.includes(object.id))?.id
  const assignedCircuitId = data.circuit_id ?? inferredCircuitId ?? ''
  const circuitExists = circuits.some(circuit => circuit.id === assignedCircuitId)
  const lights = Object.values(project.objects).filter(candidate => candidate.object_type === 'electrical.fixture' && candidate.removed_phase === null && (candidate.module_data as unknown as ElectricalFixtureModuleData).kind === 'light')
  return <div style={{ display: 'grid', gap: 7 }}>
    <strong style={{ fontSize: 12, color: '#334155' }}>อุปกรณ์ไฟฟ้า · {data.mark}</strong>
    <label className="cf-property-row">ประเภท
      <select aria-label="ประเภทอุปกรณ์ไฟฟ้า" value={data.kind} onChange={event => { const kind = event.target.value as ElectricalFixtureModuleData['kind']; update({ kind, ...(kind !== 'switch' ? { controlled_ids: [] } : {}) }) }}>
        <option value="light">ดวงโคม</option><option value="switch">สวิตช์</option><option value="outlet">เต้ารับ</option><option value="panel">ตู้ไฟ</option>
      </select>
    </label>
    <label className="cf-property-row">วงจรไฟฟ้า
      <select aria-label="กำหนดวงจรไฟฟ้า" value={assignedCircuitId} disabled={data.kind === 'panel'} onChange={event => onAssignToCircuit?.(object.id, event.target.value || null)}>
        <option value="">ไม่กำหนดวงจร</option>
        {assignedCircuitId && !circuitExists && <option value={assignedCircuitId}>{assignedCircuitId} · ไม่พบวงจร</option>}
        {circuits.map(circuit => {
          const circuitData = circuit.module_data as unknown as CircuitModuleData
          const panel = project.objects[circuitData.panel_id]
          const panelMark = panel ? String((panel.module_data as Record<string, unknown>).mark ?? circuitData.panel_id) : circuitData.panel_id
          const circuitMark = String((circuit.module_data as Record<string, unknown>).mark ?? circuit.id)
          return <option key={circuit.id} value={circuit.id}>{circuitMark} · {panelMark} · {circuitData.breaker_a} A</option>
        })}
      </select>
    </label>
    {data.kind === 'panel' && <small style={{ color: '#64748b' }}>ตู้ไฟเป็นต้นทางของวงจร จึงกำหนดวงจรให้ตู้ไฟไม่ได้</small>}
    <label className="cf-property-row">กำลังไฟฟ้า (W)
      <input aria-label="กำลังไฟฟ้าของอุปกรณ์ (วัตต์)" type="number" min="0" step="1" value={data.watts} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= 0) update({ watts: value }) }} />
    </label>
    <label className="cf-property-row">ระดับติดตั้ง ({displayUnit})
      <LengthInput value={data.location_mm[2]} unit={displayUnit} onChange={value => update({ location_mm: [data.location_mm[0], data.location_mm[1], value] })} aria-label={`ระดับติดตั้งอุปกรณ์ไฟฟ้า (${displayUnit})`} />
    </label>
    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}><input type="checkbox" checked={data.grounded} onChange={event => update({ grounded: event.target.checked })} /> ต่อสายดิน</label>
    {data.kind === 'switch' && <div style={{ display: 'grid', gap: 4, paddingTop: 5, borderTop: '1px solid #e2e8f0' }}>
      <strong style={{ fontSize: 11, color: '#52677d' }}>ดวงโคมที่สวิตช์ควบคุม</strong>
      {lights.length ? lights.map(light => {
        const lightData = light.module_data as unknown as ElectricalFixtureModuleData
        const checked = data.controlled_ids.includes(light.id)
        return <label key={light.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#334155' }}>
          <input type="checkbox" checked={checked} onChange={event => update({ controlled_ids: event.target.checked ? [...new Set([...data.controlled_ids, light.id])] : data.controlled_ids.filter(id => id !== light.id) })} />
          {lightData.mark} · {lightData.watts} W
        </label>
      }) : <small style={{ color: '#64748b' }}>ยังไม่มีดวงโคมในโครงการ</small>}
    </div>}
  </div>
}
