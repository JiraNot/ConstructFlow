import React from 'react'
import { formatLengthMm, type DisplayLengthUnit, type FoundationModuleData, type Phase, type ProjectDocument, type RemovalPhase, type SmartObject } from '@constructflow/project-model'
import { PlusCircle, Trash2 } from 'lucide-react'

interface ObjectLifecyclePropertiesProps {
  object: SmartObject
  project: ProjectDocument
  displayUnit: DisplayLengthUnit
  hostedFoundation?: SmartObject<FoundationModuleData>
  onUpdatePhase?: (objectId: string, phase: Phase) => void
  onUpdateRemovalPhase?: (objectId: string, phase: RemovalPhase | null) => void
  onAddFoundation: (columnId: string) => void
  onDeleteObject: (objectId: string) => void
}

export const ObjectLifecycleProperties: React.FC<ObjectLifecyclePropertiesProps> = ({
  object, project, displayUnit, hostedFoundation, onUpdatePhase, onUpdateRemovalPhase, onAddFoundation, onDeleteObject,
}) => <>
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
    <div>
      <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>ระดับฐาน</label>
      <div style={{ background: '#f5f8fc', padding: '4px 6px', borderRadius: 2, fontSize: 12, marginTop: 4 }}>
        {object.level_refs?.[0]?.level_id || 'Ground Floor'}
      </div>
    </div>
    <div>
      <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>เฟสสร้าง</label>
      <select
        value={object.created_phase}
        onChange={event => onUpdatePhase?.(object.id, event.target.value as Phase)}
        style={{
          width: '100%',
          background: object.created_phase === 'existing' ? '#dce4ed' : object.created_phase === 'demolition' ? '#991b1b' : '#0369a1',
          color: object.created_phase === 'existing' ? '#24394d' : '#ffffff',
          border: '1px solid #53657b', borderRadius: 2, padding: '4px 6px', fontSize: 11, fontWeight: 600, marginTop: 4, cursor: 'pointer',
        }}
      >
        <option value="existing">อาคารเดิม</option>
        <option value="demolition">รื้อถอน</option>
        <option value="new_construction">สร้างใหม่</option>
      </select>
    </div>
  </div>

  <div style={{ marginTop: 8 }}>
    <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>เฟสรื้อถอน</label>
    <select
      value={object.removed_phase ?? 'none'}
      onChange={event => onUpdateRemovalPhase?.(object.id, event.target.value === 'none' ? null : event.target.value as RemovalPhase)}
      style={{
        width: '100%', background: object.removed_phase === 'demolition' ? '#991b1b' : '#f5f8fc',
        color: object.removed_phase === 'demolition' ? '#ffffff' : '#24394d',
        border: '1px solid #53657b', borderRadius: 2, padding: '4px 6px', fontSize: 11, marginTop: 4, cursor: 'pointer',
      }}
    >
      <option value="none">ไม่รื้อถอน</option>
      <option value="demolition">รื้อถอน</option>
    </select>
  </div>

  {object.object_type === 'structure.column' && <div style={{ borderTop: '1px solid #dce4ed', paddingTop: 10 }}>
    <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>ฐานรากของเสานี้</label>
    {hostedFoundation ? <div style={{
      background: '#f5f8fc', padding: '6px 7px', borderRadius: 3, border: '1px solid #dce4ed', marginTop: 6, fontSize: 12,
    }}>
      <div style={{ color: '#0873c4', fontWeight: 600 }}>
        Footing {hostedFoundation.module_data.mark} ({hostedFoundation.module_data.size_mm.map(value => formatLengthMm(value, displayUnit)).join(' × ')} {displayUnit})
      </div>
      <div style={{ color: '#53657b', fontSize: 10, marginTop: 2 }}>ฐานรากที่เชื่อมกับเสานี้</div>
    </div> : <button
      type="button"
      onClick={() => onAddFoundation(object.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 4, background: '#eef3f8', color: '#0873c4', border: '1px solid #0284c7',
        padding: '4px 8px', borderRadius: 3, cursor: 'pointer', fontSize: 12, fontWeight: 600, marginTop: 6, width: '100%', justifyContent: 'center',
      }}
    ><PlusCircle size={14} /> Add Hosted Footing (800×800)</button>}
  </div>}

  <div style={{ borderTop: '1px solid #dce4ed', paddingTop: 10 }}>
    <button
      type="button"
      onClick={() => onDeleteObject(object.id)}
      title="ลบชิ้นงาน (Delete / Backspace)"
      aria-label="ลบชิ้นงาน (Delete / Backspace)"
      style={{
        display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444',
        border: '1px solid rgba(239, 68, 68, 0.3)', padding: '4px 8px', borderRadius: 3, cursor: 'pointer', fontSize: 12,
        fontWeight: 600, width: '100%', justifyContent: 'center',
      }}
    ><Trash2 size={14} /> ลบชิ้นงาน</button>
  </div>
</>
