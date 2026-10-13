import React from 'react'
import { ProjectDocument, SmartObject, isBeamObject, isColumnObject, isDoorObject, isFoundationObject, isWallObject, isWindowObject } from '@constructflow/project-model'

interface ObjectSelectionHeaderProps {
  project: ProjectDocument
  object: SmartObject
  title: string
  currentMark: string
  onAssignType: (objectId: string, typeName: string) => void
  onOpenTypeManager: () => void
}

export const ObjectSelectionHeader: React.FC<ObjectSelectionHeaderProps> = ({ project, object, title, currentMark, onAssignType, onOpenTypeManager }) => {
  const data = object.module_data as Record<string, unknown>
  const typeId = typeof data.type_id === 'string' ? data.type_id : null
  const objectTypes = project.types.filter(type => type.object_type === object.object_type)
  const supportsTypePicker = objectTypes.length > 0
  const assignedInstances = Object.values(project.objects).filter(candidate => {
    if (candidate.object_type !== object.object_type) return false
    const candidateData = candidate.module_data as Record<string, unknown>
    return typeId ? candidateData.type_id === typeId : candidateData.mark === currentMark
  }).length

  return <>
    <div style={{ borderBottom: '1px solid #dce4ed', paddingBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{
          fontSize: 10,
          textTransform: 'uppercase',
          fontWeight: 800,
          color: isColumnObject(object) ? '#0873c4' : isFoundationObject(object) ? '#996000' : isBeamObject(object) ? '#7144ad' : isDoorObject(object) ? '#18764b' : isWindowObject(object) ? '#0873c4' : '#52677d',
          background: '#f5f8fc',
          padding: '2px 4px',
          borderRadius: 2,
          border: '1px solid #dce4ed',
        }}>{object.object_type}</span>
        <span style={{ fontSize: 10, color: '#53657b' }}>v{object.schema_version}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#24364b' }}>{title}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px', marginTop: 5, color: '#64748b', fontSize: 10 }}>
        <span>ระดับ: {project.levels.find(level => level.id === object.level_refs?.[0]?.level_id)?.name ?? 'Ground Floor'}</span>
        <span>Phase: {object.created_phase === 'existing' ? 'เดิม' : object.created_phase === 'demolition' ? 'รื้อถอน' : 'ก่อสร้างใหม่'}</span>
      </div>
    </div>

    {supportsTypePicker && <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>เปลี่ยนชนิดของชิ้นนี้</label>
      <select aria-label="ชนิดของชิ้นที่เลือก" value={currentMark} onChange={event => onAssignType(object.id, event.target.value)} style={{ width: '100%', background: '#fff', border: '1px solid #dce4ed', padding: 6, color: '#24364b' }}>
        {objectTypes.map(type => <option key={type.id} value={type.name}>{type.name}</option>)}
      </select>
      <small style={{ color: '#64748b', fontSize: 10 }}>เปลี่ยนค่าเฉพาะ instance นี้</small>
      <button className="cf-button cf-button-quiet" onClick={onOpenTypeManager}>แก้ไข Type ในแค็ตตาล็อก · ใช้กับ {assignedInstances} ชิ้น</button>
    </div>}
  </>
}
