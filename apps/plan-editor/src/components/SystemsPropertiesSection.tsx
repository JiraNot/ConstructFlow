import React from 'react'
import {
  ProjectDocument,
  SmartObject,
  type DisplayLengthUnit,
  type PipeRouteModuleData,
  type ElectricalFixtureModuleData,
  type CircuitModuleData,
  type CabinetModuleData,
  type MouldingModuleData,
} from '@constructflow/project-model'
import { WorkbenchNumberInput } from './WorkbenchNumberInput.js'

type SystemsPropertiesSectionProps = {
  project: ProjectDocument
  displayUnit: DisplayLengthUnit
  pipeObj: SmartObject | null
  fixtureObj: SmartObject | null
  cabinetObj: SmartObject | null
  mouldingObj: SmartObject | null
  onUpdatePipeRoute?: (objectId: string, changes: Partial<PipeRouteModuleData>) => void
  onUpdateElectricalFixture?: (objectId: string, changes: Partial<ElectricalFixtureModuleData>) => void
  onAssignElectricalFixtureToCircuit?: (fixtureId: string, circuitId: string | null) => void
  onUpdateCabinet?: (objectId: string, changes: Partial<CabinetModuleData>) => void
  onUpdateMoulding?: (objectId: string, changes: Partial<MouldingModuleData>) => void
}

const LengthInput: React.FC<{ value: number; unit: DisplayLengthUnit; onChange: (value: number) => void; disabled?: boolean; 'aria-label'?: string }> = ({ value, unit, onChange, disabled, 'aria-label': ariaLabel }) => <WorkbenchNumberInput value={value} unit={unit} onChange={onChange} disabled={disabled} ariaLabel={ariaLabel} />

export const SystemsPropertiesSection: React.FC<SystemsPropertiesSectionProps> = props => {
  const { project, displayUnit, pipeObj, fixtureObj, cabinetObj, mouldingObj, onUpdatePipeRoute, onUpdateElectricalFixture, onAssignElectricalFixtureToCircuit, onUpdateCabinet, onUpdateMoulding } = props
  return (
    <>
      {pipeObj && (() => {
        const data = pipeObj.module_data as unknown as PipeRouteModuleData
        const nodes = data.nodes_mm ?? []
        const gravity = ['waste', 'soil', 'rainwater'].includes(data.system)
        const gravityNodeElevationsDerived = gravity && data.start_invert_mm !== null && data.end_invert_mm !== null
        const update = (changes: Partial<PipeRouteModuleData>) => onUpdatePipeRoute?.(pipeObj.id, changes)
        const updateNodeElevation = (index: number, elevation: number) => {
          const next = nodes.map((node, nodeIndex) => nodeIndex === index ? [node[0], node[1], elevation] as [number, number, number] : [...node] as [number, number, number])
          update({ nodes_mm: next, ...(gravity ? index === 0 ? { start_invert_mm: elevation } : index === nodes.length - 1 ? { end_invert_mm: elevation } : {} : {}) })
        }
        const material = String(data.material ?? 'PVC')
        const compatibleNetworkNodes = Object.values(project.objects).filter(object => {
          if (object.removed_phase !== null) return false
          if (object.object_type === 'drainage.manhole') {
            const node = object.module_data as unknown as { system?: string }
            return data.system === 'vent' || node.system === data.system
          }
          if (object.object_type === 'drainage.septic_tank') return ['soil', 'waste', 'vent'].includes(data.system)
          return object.object_type === 'plumbing.pump_bypass' && ['cold_water', 'hot_water'].includes(data.system)
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
            {compatibleNetworkNodes.map(node => <option key={node.id} value={node.id}>{String((node.module_data as Record<string, unknown>).mark ?? node.id)} · {node.object_type === 'drainage.manhole' ? 'บ่อพัก' : node.object_type === 'drainage.septic_tank' ? 'ถังบำบัด' : 'ปั๊ม/บายพาส'}</option>)}
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
            <label className="cf-property-row">ระดับต้นทาง ({displayUnit})
              <LengthInput value={nodes[0][2]} unit={displayUnit} onChange={value => updateNodeElevation(0, value)} aria-label={`ระดับต้นทางท่อ (${displayUnit})`} />
            </label>
            <label className="cf-property-row">ระดับปลายทาง ({displayUnit})
              <LengthInput value={nodes[nodes.length - 1][2]} unit={displayUnit} onChange={value => updateNodeElevation(nodes.length - 1, value)} aria-label={`ระดับปลายทางท่อ (${displayUnit})`} />
            </label>
          </>}
          {gravity && <label className="cf-property-row">อัตราความลาดขั้นต่ำ (0.01 = 1:100)
            <input aria-label="อัตราความลาดขั้นต่ำของท่อแบบแรงโน้มถ่วง" type="number" min="0" max="1" step="0.001" value={data.minimum_slope_ratio} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= 0) update({ minimum_slope_ratio: value }) }} />
          </label>}
          {nodes.length > 2 && <div style={{ display: 'grid', gap: 5, padding: '6px 0', borderTop: '1px solid #e2e8f0' }}>
            <strong style={{ fontSize: 11, color: '#52677d' }}>จุดหักกลาง · ลากจุดสีฟ้าบนแปลนเพื่อปรับแนว</strong>
            {nodes.slice(1, -1).map((node, index) => {
              const nodeIndex = index + 1
              return <div key={nodeIndex} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 6 }}>
                <label className="cf-property-row">จุด {nodeIndex + 1} ระดับ ({displayUnit})
                  <LengthInput value={node[2]} unit={displayUnit} disabled={gravityNodeElevationsDerived} onChange={value => updateNodeElevation(nodeIndex, value)} aria-label={`ระดับจุดหักท่อ ${nodeIndex + 1} (${displayUnit})`} />
                </label>
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
      })()}

      {fixtureObj && (() => {
        const data = fixtureObj.module_data as unknown as ElectricalFixtureModuleData
        const update = (changes: Partial<ElectricalFixtureModuleData>) => onUpdateElectricalFixture?.(fixtureObj.id, changes)
        const circuits = Object.values(project.objects).filter(object => object.object_type === 'electrical.circuit' && object.removed_phase === null)
        const inferredCircuitId = circuits.find(circuit => (circuit.module_data as unknown as CircuitModuleData).device_ids.includes(fixtureObj.id))?.id
        const assignedCircuitId = data.circuit_id ?? inferredCircuitId ?? ''
        const circuitExists = circuits.some(circuit => circuit.id === assignedCircuitId)
        const lights = Object.values(project.objects).filter(object => object.object_type === 'electrical.fixture' && object.removed_phase === null && (object.module_data as unknown as ElectricalFixtureModuleData).kind === 'light')
        return <div style={{ display: 'grid', gap: 7 }}>
          <strong style={{ fontSize: 12, color: '#334155' }}>อุปกรณ์ไฟฟ้า · {data.mark}</strong>
          <label className="cf-property-row">ประเภท
            <select aria-label="ประเภทอุปกรณ์ไฟฟ้า" value={data.kind} onChange={event => { const kind = event.target.value as ElectricalFixtureModuleData['kind']; update({ kind, ...(kind !== 'switch' ? { controlled_ids: [] } : {}) }) }}>
              <option value="light">ดวงโคม</option><option value="switch">สวิตช์</option><option value="outlet">เต้ารับ</option><option value="panel">ตู้ไฟ</option>
            </select>
          </label>
          <label className="cf-property-row">วงจรไฟฟ้า
            <select aria-label="กำหนดวงจรไฟฟ้า" value={assignedCircuitId} disabled={data.kind === 'panel'} onChange={event => onAssignElectricalFixtureToCircuit?.(fixtureObj.id, event.target.value || null)}>
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
      })()}

      {cabinetObj && (() => {
        const data = cabinetObj.module_data as unknown as CabinetModuleData
        const update = (changes: Partial<CabinetModuleData>) => onUpdateCabinet?.(cabinetObj.id, changes)
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
      })()}

      {mouldingObj && (() => {
        const data = mouldingObj.module_data as unknown as MouldingModuleData
        const update = (changes: Partial<MouldingModuleData>) => onUpdateMoulding?.(mouldingObj.id, changes)
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
      })()}
    </>
  )
}
