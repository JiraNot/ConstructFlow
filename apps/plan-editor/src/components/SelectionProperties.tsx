import React from 'react'
import { MousePointer2, Trash2 } from 'lucide-react'
import type { ProjectDocument, SmartObject, TypeDefinition } from '@constructflow/project-model'

export const EmptySelectionProperties: React.FC = () => <div style={{ padding: 11, color: '#53657b', fontSize: 13, textAlign: 'center', marginTop: 40 }}>
  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, color: '#1682e8' }}><MousePointer2 size={23} /></div>
  <div>ยังไม่ได้เลือกวัตถุ</div>
  <div style={{ fontSize: 11, marginTop: 4, color: '#53657b' }}>คลิกวัตถุบนแปลนเพื่อดูและแก้ไขข้อมูล BIM</div>
</div>

interface MultiSelectionPropertiesProps {
  project: ProjectDocument
  selectedObjects: SmartObject[]
  family: string | null
  familyTypes: TypeDefinition[]
  commonTypeId: string
  canBulkUpdateLevel: boolean
  onAssignTypeMany?: (objectIds: string[], typeId: string) => void
  onUpdateLevelMany?: (objectIds: string[], levelId: string) => void
  onDeleteObjects?: (objectIds: string[]) => void
}

const familyLabels: Record<string, string> = {
  'structure.beam': 'คาน', 'structure.column': 'เสา', 'structure.foundation': 'ฐานราก',
  'architecture.wall': 'ผนัง', 'door_window.door': 'ประตู', 'door_window.window': 'หน้าต่าง',
}

export const MultiSelectionProperties: React.FC<MultiSelectionPropertiesProps> = ({
  project, selectedObjects, family, familyTypes, commonTypeId, canBulkUpdateLevel,
  onAssignTypeMany, onUpdateLevelMany, onDeleteObjects,
}) => {
  const objectIds = selectedObjects.map(object => object.id)
  const typeLabel = family ? familyLabels[family] ?? family : ''
  return <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
    <div style={{ position: 'sticky', top: 0, zIndex: 3, background: '#fff', borderBottom: '1px solid #dce4ed', paddingTop: 4, paddingBottom: 10 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#24364b' }}>เลือก {selectedObjects.length} ชิ้น</div>
      <div style={{ fontSize: 11, color: '#53657b', marginTop: 4 }}>
        {family ? `ชนิดวัตถุเดียวกัน · ${typeLabel}` : 'มีวัตถุต่างชนิดกัน · เลือกลบพร้อมกันได้ แต่เปลี่ยน Type พร้อมกันไม่ได้'}
      </div>
      {family && <div style={{ fontSize: 11, color: '#53657b', marginTop: 3 }}>กด Shift ค้างแล้วคลิกเพิ่ม หรือลากกรอบครอบวัตถุที่ต้องการ</div>}
    </div>
    {family && familyTypes.length > 0 && <label style={{ display: 'grid', gap: 4, fontSize: 11, color: '#52677d', fontWeight: 600 }}>
      เปลี่ยน Type/Mark ให้ทั้ง {selectedObjects.length} ชิ้น
      <select aria-label="เปลี่ยน Type ให้หลายวัตถุ" value={commonTypeId} onChange={event => {
        if (event.target.value) onAssignTypeMany?.(objectIds, event.target.value)
      }} style={{ width: '100%', background: '#fff', border: '1px solid #dce4ed', borderRadius: 3, padding: 6, color: '#24364b' }}>
        <option value="">เลือก Type{commonTypeId ? '' : ' (หลายค่า)'}</option>
        {familyTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
      </select>
    </label>}
    {canBulkUpdateLevel && <label style={{ display: 'grid', gap: 4, fontSize: 11, color: '#52677d', fontWeight: 600 }}>
      ย้ายระดับอ้างอิงให้ทั้ง {selectedObjects.length} ชิ้น
      <select aria-label="ย้ายระดับให้วัตถุที่เลือก" value="" onChange={event => {
        if (event.target.value) onUpdateLevelMany?.(objectIds, event.target.value)
      }} style={{ width: '100%', background: '#fff', border: '1px solid #dce4ed', borderRadius: 3, padding: 6, color: '#24364b' }}>
        <option value="">เลือกระดับปลายทาง…</option>
        {project.levels.map(level => <option key={level.id} value={level.id}>{level.name} · {(level.elevation_mm / 1000).toFixed(3)} m</option>)}
      </select>
    </label>}
    <button type="button" className="cf-button" onClick={() => onDeleteObjects?.(objectIds)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, color: '#dc2626', borderColor: '#fecaca', background: '#fff7f7' }}>
      <Trash2 size={14} /> ลบที่เลือก {selectedObjects.length} ชิ้น
    </button>
  </div>
}
