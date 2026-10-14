import React from 'react'
import type { ProjectDocument, SmartObject, DisplayLengthUnit, PipeRouteModuleData } from '@constructflow/project-model'
import { WorkbenchNumberInput } from './WorkbenchNumberInput.js'

type Props = {
  project: ProjectDocument
  displayUnit: DisplayLengthUnit
  object: SmartObject | null
  onUpdate?: (objectId: string, changes: Partial<PipeRouteModuleData>) => void
}

const LengthInput: React.FC<{ value: number; unit: DisplayLengthUnit; onChange: (value: number) => void; disabled?: boolean; 'aria-label'?: string }> = ({ value, unit, onChange, disabled, 'aria-label': ariaLabel }) => <WorkbenchNumberInput value={value} unit={unit} onChange={onChange} disabled={disabled} ariaLabel={ariaLabel} />

export const PipeRoutePropertiesSection: React.FC<Props> = ({ project, displayUnit, object, onUpdate }) => {
  if (!object) return null
  const data = object.module_data as unknown as PipeRouteModuleData
  const nodes = data.nodes_mm ?? []
  const gravity = ['waste', 'soil', 'rainwater'].includes(data.system)
  const gravityNodeElevationsDerived = gravity && data.start_invert_mm !== null && data.end_invert_mm !== null
  const update = (changes: Partial<PipeRouteModuleData>) => onUpdate?.(object.id, changes)
  const updateNodeElevation = (index: number, elevation: number) => {
    const next = nodes.map((node, nodeIndex) => nodeIndex === index ? [node[0], node[1], elevation] as [number, number, number] : [...node] as [number, number, number])
    update({ nodes_mm: next, ...(gravity ? index === 0 ? { start_invert_mm: elevation } : index === nodes.length - 1 ? { end_invert_mm: elevation } : {} : {}) })
  }
  const material = String(data.material ?? 'PVC')
  const compatibleNetworkNodes = Object.values(project.objects).filter(candidate => {
    if (candidate.removed_phase !== null) return false
    if (candidate.object_type === 'drainage.manhole') {
      const node = candidate.module_data as unknown as { system?: string }
      return data.system === 'vent' || node.system === data.system
    }
    if (candidate.object_type === 'drainage.septic_tank') return ['soil', 'waste', 'vent'].includes(data.system)
    return candidate.object_type === 'plumbing.pump_bypass' && ['cold_water', 'hot_water'].includes(data.system)
  })
  const addBend = (segmentIndex: number) => {
    const a = nodes[segmentIndex], b = nodes[segmentIndex + 1]
    if (!a || !b) return
    const next = nodes.map(node => [...node] as [number, number, number])
    next.splice(segmentIndex + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2])
    update({ nodes_mm: next })
  }
  const removeBend = (nodeIndex: number) => {
    if (nodeIndex <= 0 || nodeIndex >= nodes.length - 1) return
    update({ nodes_mm: nodes.filter((_, index) => index !== nodeIndex).map(node => [...node] as [number, number, number]) })
  }
  const connectionControl = (label: string, field: 'start_node_id' | 'end_node_id', value: string | undefined) => <label className="cf-property-row">{label}
    <select aria-label={label} value={value ?? ''} onChange={event => update({ [field]: event.target.value || undefined })}>
      <option value="">ไม่เชื่อมต่อ</option>
      {compatibleNetworkNodes.map(candidate => <option key={candidate.id} value={candidate.id}>{String((candidate.module_data as Record<string, unknown>).mark ?? candidate.id)} · {candidate.object_type === 'drainage.manhole' ? 'บ่อพัก' : candidate.object_type === 'drainage.septic_tank' ? 'ถังบำบัด' : 'ปั๊ม/บายพาส'}</option>)}
    </select>
  </label>
  return <div style={{ display: 'grid', gap: 7 }}>
    <strong style={{ fontSize: 12, color: '#334155' }}>แนวท่อ · {data.system}</strong>
    {connectionControl('จุดเชื่อมต้นทาง', 'start_node_id', data.start_node_id)}
    {connectionControl('จุดเชื่อมปลายทาง', 'end_node_id', data.end_node_id)}
    <label className="cf-property-row">เส้นผ่านศูนย์กลาง (มม.)
      <input aria-label="เส้นผ่านศูนย์กลางท่อ (มม.)" type="number" min="1" step="1" value={data.diameter_mm} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value) && value > 0) update({ diameter_mm: value }) }} />
    </label>
    {nodes.length > 1 && <>
      <label className="cf-property-row">ระดับต้นทาง ({displayUnit})<LengthInput value={nodes[0][2]} unit={displayUnit} onChange={value => updateNodeElevation(0, value)} aria-label={`ระดับต้นทางท่อ (${displayUnit})`} /></label>
      <label className="cf-property-row">ระดับปลายทาง ({displayUnit})<LengthInput value={nodes[nodes.length - 1][2]} unit={displayUnit} onChange={value => updateNodeElevation(nodes.length - 1, value)} aria-label={`ระดับปลายทางท่อ (${displayUnit})`} /></label>
    </>}
    {gravity && <label className="cf-property-row">อัตราความลาดขั้นต่ำ (0.01 = 1:100)
      <input aria-label="อัตราความลาดขั้นต่ำของท่อแบบแรงโน้มถ่วง" type="number" min="0" max="1" step="0.001" value={data.minimum_slope_ratio} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= 0) update({ minimum_slope_ratio: value }) }} />
    </label>}
    {nodes.length > 2 && <div style={{ display: 'grid', gap: 5, padding: '6px 0', borderTop: '1px solid #e2e8f0' }}>
      <strong style={{ fontSize: 11, color: '#52677d' }}>จุดหักกลาง · ลากจุดสีฟ้าบนแปลนเพื่อปรับแนว</strong>
      {nodes.slice(1, -1).map((node, index) => {
        const nodeIndex = index + 1
        return <div key={nodeIndex} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 6 }}>
          <label className="cf-property-row">จุด {nodeIndex + 1} ระดับ ({displayUnit})<LengthInput value={node[2]} unit={displayUnit} disabled={gravityNodeElevationsDerived} onChange={value => updateNodeElevation(nodeIndex, value)} aria-label={`ระดับจุดหักท่อ ${nodeIndex + 1} (${displayUnit})`} /></label>
          <button type="button" onClick={() => removeBend(nodeIndex)} aria-label={`ลบจุดหักท่อ ${nodeIndex + 1}`} title="ลบจุดหักนี้" style={{ border: '1px solid #d7e0e9', borderRadius: 4, background: '#fff', color: '#64748b', padding: '4px 7px', cursor: 'pointer' }}>ลบ</button>
        </div>
      })}
    </div>}
    {nodes.slice(0, -1).map((_, index) => <button key={`bend-${index}`} type="button" onClick={() => addBend(index)} aria-label={`เพิ่มจุดหักท่อช่วง ${index + 1} ถึง ${index + 2}`} style={{ border: '1px solid #bfdbfe', borderRadius: 4, background: '#eff6ff', color: '#1d4ed8', padding: '5px 7px', textAlign: 'left', cursor: 'pointer', fontSize: 11 }}>＋ เพิ่มจุดหักช่วง {index + 1}–{index + 2}</button>)}
    {nodes.length > 2 && gravityNodeElevationsDerived && <small style={{ color: '#64748b' }}>ระดับจุดหักคำนวณจากระดับต้นทาง/ปลายทางและความยาวแนวท่อ</small>}
    <label className="cf-property-row">วัสดุท่อ
      <select aria-label="วัสดุท่อ" value={material} onChange={event => update({ material: event.target.value })}>
        {!['PVC', 'PPR', 'HDPE', 'PE', 'Copper'].includes(material) && <option value={material}>{material} (ค่าปัจจุบัน)</option>}
        <option value="PVC">PVC</option><option value="PPR">PPR</option><option value="HDPE">HDPE</option><option value="PE">PE</option><option value="Copper">ทองแดง</option>
      </select>
    </label>
  </div>
}
