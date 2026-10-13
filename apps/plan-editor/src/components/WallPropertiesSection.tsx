import React, { useState } from 'react'
import {
  ProjectDocument, SmartObject, WallModuleData, DoorModuleData, WindowModuleData,
  isDoorObject, isWindowObject, resolveWallVerticalExtent, formatLengthMm,
  type DisplayLengthUnit,
} from '@constructflow/project-model'
import { WorkbenchNumberInput } from './WorkbenchNumberInput.js'

const LengthInput: React.FC<{ value: number; unit: DisplayLengthUnit; onChange: (value: number) => void; style?: React.CSSProperties; disabled?: boolean; 'aria-label'?: string }> = ({ value, unit, onChange, style, disabled, 'aria-label': ariaLabel }) => <WorkbenchNumberInput value={value} unit={unit} onChange={onChange} style={style} disabled={disabled} ariaLabel={ariaLabel} />
const wallFinishMaterials: Array<[string, string]> = [['wall_paint', 'สีทาผนัง'], ['ceramic_tile', 'กระเบื้องเซรามิก'], ['cement_plaster', 'ฉาบปูน'], ['stone_cladding', 'กรุหิน'], ['timber_cladding', 'กรุไม้'], ['wallpaper', 'วอลล์เปเปอร์'], ['smartboard', 'สมาร์ทบอร์ด'], ['gypsum_board', 'ยิปซัมบอร์ด'], ['none', 'ไม่ตกแต่ง']]
const neutralWallFaceMaterial = (material: string) => material === 'interior_paint' || material === 'exterior_paint' ? 'wall_paint' : material

type WallFaceChanges = { fit_to_stair?: boolean; plaster_inside_thickness_mm?: number; plaster_outside_thickness_mm?: number; plaster_inside_material?: string; plaster_outside_material?: string; inside_finish_mark?: string; outside_finish_mark?: string; inside_finish_type_id?: string; outside_finish_type_id?: string; interior_side?: 'left' | 'right'; top_level_id?: string; base_offset_mm?: number; top_offset_mm?: number; vertical_constraint?: 'fixed_height' | 'top_level'; height_mm?: number }
interface WallPropertiesSectionProps {
  wall: SmartObject<WallModuleData>
  project: ProjectDocument
  displayUnit: DisplayLengthUnit
  onUpdateWallFace: (objectId: string, changes: WallFaceChanges) => void
  onDefineWallFinish?: (name: string, parameters: Record<string, unknown>) => void
  onUpdateWallFinish?: (typeId: string, name: string, parameters: Record<string, unknown>) => void
  onOpenTypeManager: () => void
}

export const WallPropertiesSection: React.FC<WallPropertiesSectionProps> = ({ wall: wallObj, project, displayUnit, onUpdateWallFace, onDefineWallFinish, onUpdateWallFinish, onOpenTypeManager }) => {
  const [newWallFinishName, setNewWallFinishName] = useState('')
  const [newWallFinishDescription, setNewWallFinishDescription] = useState('')
  const [newWallFinishMaterial, setNewWallFinishMaterial] = useState('wall_paint')
  const [newWallFinishThickness, setNewWallFinishThickness] = useState(2)
  const wallFinishes = project.types.filter(type => type.object_type === 'architecture.wall_finish')
  const wallPresets = project.types.filter(type => type.object_type === 'architecture.wall').map(type => type.name)
  const wallCatalogType = project.types.find(type => type.id === wallObj.module_data.type_id)
    ?? project.types.find(type => type.object_type === 'architecture.wall' && type.name.toLowerCase() === wallObj.module_data.mark.toLowerCase())
  const wallLayerField = (field: string, fallback: number) => {
    const override = wallObj.module_data.instance_overrides?.[field]
    const instanceValue = wallObj.module_data[field as keyof WallModuleData]
    const typeValue = wallCatalogType?.parameters[field]
    const value = override ?? instanceValue ?? typeValue
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
  }
  const wallFaceField = (field: string, fallback: string) => {
    const override = wallObj.module_data.instance_overrides?.[field]
    const instanceValue = wallObj.module_data[field as keyof WallModuleData]
    const typeValue = wallCatalogType?.parameters[field]
    const value = override ?? instanceValue ?? typeValue
    return typeof value === 'string' && value.trim() ? value : fallback
  }
  const wallMasonryThickness = wallLayerField('masonry_thickness_mm', wallObj.module_data.thickness_mm)
  const wallInsidePlaster = wallLayerField('plaster_inside_thickness_mm', 0)
  const wallOutsidePlaster = wallLayerField('plaster_outside_thickness_mm', 0)
  const wallVertical = resolveWallVerticalExtent(project, wallObj)
  const hostedOpenings = Object.values(project.objects).filter(
    (object): object is SmartObject<DoorModuleData | WindowModuleData> =>
      (isDoorObject(object) || isWindowObject(object)) && object.module_data.wall_id === wallObj.id,
  )
  const verticalSelectStyle: React.CSSProperties = { width: '100%', background: '#fff', border: '1px solid #dce4ed', borderRadius: 3, padding: 5, color: '#24364b' }
  const pickWallFinish = (wallId: string, side: 'inside' | 'outside', typeId: string) => {
    const finish = wallFinishes.find(item => item.id === typeId)
    if (!finish) return
    onUpdateWallFace(wallId, side === 'inside'
      ? { inside_finish_mark: finish.name, inside_finish_type_id: finish.id, plaster_inside_material: String(finish.parameters.material ?? 'wall_paint'), plaster_inside_thickness_mm: Number(finish.parameters.thickness_mm ?? 2) }
      : { outside_finish_mark: finish.name, outside_finish_type_id: finish.id, plaster_outside_material: String(finish.parameters.material ?? 'wall_paint'), plaster_outside_thickness_mm: Number(finish.parameters.thickness_mm ?? 2) })
  }
  const wallFaceSelect = (wallId: string, side: 'inside' | 'outside', aria: string, currentMark: string, currentMaterial: string) => <select aria-label={aria} value={wallFinishes.find(f => f.name === currentMark && neutralWallFaceMaterial(String(f.parameters.material ?? 'wall_paint')) === neutralWallFaceMaterial(currentMaterial))?.id ?? ''} onChange={event => pickWallFinish(wallId, side, event.target.value)} style={{ width: '100%', background: '#fff', border: '1px solid #dce4ed', borderRadius: 3, padding: 5, color: '#24364b' }}>
    <option value="">ชนิดผิวเดิม · {currentMark} · {neutralWallFaceMaterial(currentMaterial)}</option>
    {wallFinishes.map(f => <option key={f.id} value={f.id}>{f.name} · {String(f.parameters.description_th ?? f.parameters.material ?? '')}</option>)}
  </select>
  return <>
      {wallObj && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>ความหนาและความสูง ({displayUnit})</label>
              <button
                onClick={onOpenTypeManager}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#40566e',
                  fontSize: 11,
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                แก้ไขชนิด
              </button>
            </div>
            <div style={{
              background: '#f5f8fc',
              padding: '5px 7px',
              borderRadius: 3,
              fontSize: 13,
              fontWeight: 700,
              color: '#40566e',
              border: '1px solid #eef3f8',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span>{formatLengthMm(wallObj.module_data.thickness_mm, displayUnit)} {displayUnit} · แกน/โครง {formatLengthMm(wallMasonryThickness, displayUnit)} · ผิว {formatLengthMm(wallInsidePlaster, displayUnit)}/{formatLengthMm(wallOutsidePlaster, displayUnit)} · สูง {formatLengthMm(wallVertical?.height_mm ?? wallObj.module_data.height_mm, displayUnit)}</span>
              <span style={{ fontSize: 10, color: '#53657b', fontWeight: 500 }}>Type {wallObj.module_data.mark}</span>
            </div>
          </div>

          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            <span><input type="checkbox" aria-label="ตัดผนังตามท้องบันไดอัตโนมัติ" checked={wallObj.module_data.fit_to_stair === true} onChange={e => onUpdateWallFace(wallObj.id, { fit_to_stair: e.target.checked })} /> ตัดขอบบนตามท้องบันไดอัตโนมัติ</span>
            <small style={{ color: '#52677d' }}>ติดตามบันไดและชานพักที่ทับแนวผนังเมื่อย้ายหรือปรับขนาด · ปิดเพื่อคืนความสูงเดิม</small>
          </label>
          <section style={{ display: 'grid', gap: 5, padding: 6, background: '#f5f8fc', border: '1px solid #e5edf5', borderRadius: 3 }}>
            <strong style={{ fontSize: 11, color: '#40566e' }}>ระดับและความสูงผนัง</strong>
            <label style={{ display: 'grid', gap: 3, fontSize: 11, color: '#52677d' }}>ขอบบนผนัง
              <select aria-label="ระดับขอบบนผนัง" style={verticalSelectStyle} value={wallObj.module_data.top_level_id ?? ''} onChange={e => e.target.value
                ? onUpdateWallFace(wallObj.id, { top_level_id: e.target.value, vertical_constraint: 'top_level' })
                : onUpdateWallFace(wallObj.id, { top_level_id: undefined, vertical_constraint: 'fixed_height', height_mm: wallVertical?.height_mm ?? wallObj.module_data.height_mm })}>
                <option value="">กำหนดความสูงเอง</option>
                {project.levels.filter(level => level.elevation_mm > (project.levels.find(item => item.id === wallObj.module_data.level_id)?.elevation_mm ?? 0)).map(level => <option key={level.id} value={level.id}>{level.name} · +{formatLengthMm(level.elevation_mm, displayUnit)} {displayUnit}</option>)}
              </select>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
              <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>ยกจากพื้น ({displayUnit})<LengthInput aria-label="ระยะยกฐานผนัง" value={wallObj.module_data.base_offset_mm ?? 0} unit={displayUnit} onChange={value => onUpdateWallFace(wallObj.id, { base_offset_mm: value })} style={verticalSelectStyle} /></label>
              <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>ลดจากระดับบน ({displayUnit})<LengthInput aria-label="ระยะลดขอบบนผนัง" value={wallObj.module_data.top_offset_mm ?? 0} unit={displayUnit} disabled={!wallObj.module_data.top_level_id} onChange={value => onUpdateWallFace(wallObj.id, { top_offset_mm: value })} style={verticalSelectStyle} /></label>
            </div>
            {!wallObj.module_data.top_level_id && <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>ความสูงผนัง ({displayUnit})<LengthInput aria-label="ความสูงผนัง" value={wallObj.module_data.height_mm} unit={displayUnit} onChange={value => onUpdateWallFace(wallObj.id, { vertical_constraint: 'fixed_height', height_mm: value })} style={verticalSelectStyle} /></label>}
          </section>

          <details className="cf-inspector-section">
            <summary>วัสดุผิวและผิวสำเร็จ · A {formatLengthMm(wallInsidePlaster, displayUnit)} / B {formatLengthMm(wallOutsidePlaster, displayUnit)} {displayUnit}</summary>
            <div style={{ display: 'grid', gap: 6, marginTop: 7 }}>
          <div style={{ fontSize: 10, color: '#667b91' }}>เลือกชนิดผิวจากรายการวัสดุในโครงการ แยกแต่ละด้านของผนังได้</div>
          {(() => {
            return <section aria-label="ตารางวัสดุผิวผนังของโครงการ" style={{ display: 'grid', gap: 5, padding: 7, background: '#f5f8fc', border: '1px solid #dce4ed', borderRadius: 3 }}>
              <strong style={{ fontSize: 11 }}>ตารางชนิดผิวผนัง · ใช้ซ้ำในโครงการ</strong>
              {wallFinishes.map(f => <div key={f.id} style={{ display: 'grid', gridTemplateColumns: '48px 1fr 58px', gap: 4, alignItems: 'center' }}>
                <input aria-label={`รหัสชนิดผิว ${f.name}`} value={f.name} onChange={e => onUpdateWallFinish?.(f.id, e.target.value, { ...f.parameters })} style={verticalSelectStyle} />
                <select aria-label={`วัสดุชนิดผิว ${f.name}`} value={String(f.parameters.material ?? 'wall_paint')} onChange={e => onUpdateWallFinish?.(f.id, f.name, { ...f.parameters, material: e.target.value })} style={verticalSelectStyle}>{wallFinishMaterials.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                <LengthInput aria-label={`ความหนาชนิดผิว ${f.name} (mm)`} value={Number(f.parameters.thickness_mm ?? 0)} unit="mm" onChange={value => onUpdateWallFinish?.(f.id, f.name, { ...f.parameters, thickness_mm: value })} style={verticalSelectStyle} />
                <input aria-label={`รายละเอียดชนิดผิว ${f.name}`} value={String(f.parameters.description_th ?? '')} placeholder="คำอธิบาย เช่น สีภายใน" onChange={e => onUpdateWallFinish?.(f.id, f.name, { ...f.parameters, description_th: e.target.value })} style={{ ...verticalSelectStyle, gridColumn: '1 / -1' }} />
              </div>)}
              <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr 58px', gap: 4 }}>
                <input aria-label="รหัสชนิดผิวใหม่" placeholder="W3" value={newWallFinishName} onChange={e => setNewWallFinishName(e.target.value)} style={verticalSelectStyle} />
                <select aria-label="วัสดุชนิดผิวใหม่" value={newWallFinishMaterial} onChange={e => setNewWallFinishMaterial(e.target.value)} style={verticalSelectStyle}>{wallFinishMaterials.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                <LengthInput aria-label="ความหนาชนิดผิวใหม่ (mm)" value={newWallFinishThickness} unit="mm" onChange={setNewWallFinishThickness} style={verticalSelectStyle} />
                <input aria-label="รายละเอียดชนิดผิวใหม่" placeholder="คำอธิบายวัสดุผิว" value={newWallFinishDescription} onChange={e => setNewWallFinishDescription(e.target.value)} style={{ ...verticalSelectStyle, gridColumn: '1 / -1' }} />
                <button type="button" className="cf-button cf-button-quiet" disabled={!newWallFinishName.trim() || !onDefineWallFinish} onClick={() => { onDefineWallFinish?.(newWallFinishName.trim(), { material: newWallFinishMaterial, thickness_mm: newWallFinishThickness, description_th: newWallFinishDescription }); setNewWallFinishName(''); setNewWallFinishDescription('') }} style={{ gridColumn: '1 / -1' }}>+ เพิ่มชนิดผิวลงตาราง</button>
              </div>
            </section>
          })()}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#52677d', fontWeight: 600 }}>
              ผิวด้าน A
              <span style={{ fontWeight: 500 }}><input type="checkbox" checked={wallInsidePlaster > 0} onChange={e => onUpdateWallFace(wallObj.id, { plaster_inside_thickness_mm: e.target.checked ? 15 : 0 })} /> เปิดชั้นผิว</span>
              {wallFaceSelect(wallObj.id, 'inside', 'ชนิดผิวด้าน A', wallFaceField('inside_finish_mark', wallObj.module_data.mark), wallFaceField('plaster_inside_material', 'cement_plaster'))}
              <LengthInput aria-label={`ความหนาผิวด้าน A (${displayUnit})`} disabled={wallInsidePlaster <= 0} value={wallInsidePlaster} unit={displayUnit} onChange={value => onUpdateWallFace(wallObj.id, { plaster_inside_thickness_mm: value })} style={{ width: '100%', background: '#fff', border: '1px solid #dce4ed', borderRadius: 3, padding: 5, color: '#24364b' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#52677d', fontWeight: 600 }}>
              ผิวด้าน B
              <span style={{ fontWeight: 500 }}><input type="checkbox" checked={wallOutsidePlaster > 0} onChange={e => onUpdateWallFace(wallObj.id, { plaster_outside_thickness_mm: e.target.checked ? 15 : 0 })} /> เปิดชั้นผิว</span>
              {wallFaceSelect(wallObj.id, 'outside', 'ชนิดผิวด้าน B', wallFaceField('outside_finish_mark', wallObj.module_data.mark), wallFaceField('plaster_outside_material', 'cement_plaster'))}
              <LengthInput aria-label={`ความหนาผิวด้าน B (${displayUnit})`} disabled={wallOutsidePlaster <= 0} value={wallOutsidePlaster} unit={displayUnit} onChange={value => onUpdateWallFace(wallObj.id, { plaster_outside_thickness_mm: value })} style={{ width: '100%', background: '#fff', border: '1px solid #dce4ed', borderRadius: 3, padding: 5, color: '#24364b' }} />
            </label>
          </div>
          <datalist id="cf-wall-marks">{wallPresets.map(mark => <option key={mark} value={mark} />)}</datalist>
          <button type="button" className="cf-button cf-button-quiet" onClick={() => onUpdateWallFace(wallObj.id, { interior_side: wallObj.module_data.interior_side === 'right' ? 'left' : 'right' })}>
            สลับด้าน A/B · ด้าน A อยู่ฝั่ง{(wallObj.module_data.interior_side ?? 'left') === 'left' ? 'ซ้าย' : 'ขวา'} ของแนวเริ่ม→จบ
          </button>
            </div>
          </details>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>
              WALL LENGTH (ความยาวผนัง)
            </label>
            <div style={{
              background: '#f5f8fc',
              padding: '5px 7px',
              borderRadius: 3,
              fontSize: 13,
              fontWeight: 700,
              color: '#0873c4',
              border: '1px solid #eef3f8',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span>{formatLengthMm(wallObj.module_data.length_mm, displayUnit)} {displayUnit}</span>
              <span style={{ fontSize: 11, color: '#52677d', fontFamily: 'monospace' }}>
                {formatLengthMm(wallObj.module_data.length_mm, displayUnit)} {displayUnit}
              </span>
            </div>
          </div>

          {/* Hosted Openings Status */}
          <details className="cf-inspector-section">
            <summary>ช่องเปิดบนผนัง · {hostedOpenings.length} ช่อง</summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 7 }}>
            {hostedOpenings.length > 0 ? (
              <div style={{
                background: '#f5f8fc',
                padding: '4px 6px',
                borderRadius: 3,
                border: '1px solid #eef3f8',
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
              }}>
                {hostedOpenings.map((op) => {
                  const isDoor = isDoorObject(op)
                  const mark = isDoor ? op.module_data.mark : isWindowObject(op) ? op.module_data.mark : ''
                  const offset = isDoor ? op.module_data.offset_along_wall_mm : isWindowObject(op) ? op.module_data.offset_along_wall_mm : 0
                  return (
                    <div key={op.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                      <span style={{ color: isDoor ? '#18764b' : '#0873c4', fontWeight: 600 }}>
                        {isDoor ? `Door ${mark}` : `Window ${mark}`}
                      </span>
              <span style={{ color: '#52677d' }}>
                        {formatLengthMm(offset, displayUnit)} {displayUnit} from start
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ fontSize: 10, color: '#53657b' }}>
                No openings. Select Door (D) or Window (N) tool to place on this wall.
              </div>
            )}
            </div>
          </details>

          {/* Thai Building Code Rule 50 Setback Info */}
          <details className="cf-inspector-section">
            <summary>ตรวจระยะร่น · กฎกระทรวง 55 ข้อ 50</summary>
            <div style={{
            background: '#ffffff',
            padding: 6,
            borderRadius: 3,
            border: '1px solid #e2e8f0',
            display: 'grid',
            gap: 3,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>
                ระยะร่นแนวอาคาร (กฎกระทรวง 55 ข้อ 50)
              </span>
              <span style={{
                fontSize: 10,
                padding: '1px 4px',
                borderRadius: 2,
                fontWeight: 600,
                background: hostedOpenings.length > 0 ? '#e0f2fe' : '#f1f5f9',
                color: hostedOpenings.length > 0 ? '#0284c7' : '#475569',
              }}>
                {hostedOpenings.length > 0 ? 'ผนังมีช่องเปิด' : 'ผนังทึบ'}
              </span>
            </div>
            <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.4 }}>
              {hostedOpenings.length > 0
                ? '• อาคารสูง ≤ 9.00 ม. ต้องร่นห่างแนวเขตที่ดิน ≥ 2.00 ม. (อาคารสูงเกิน 9 ม. ร่น ≥ 3.00 ม.)'
                : '• ผนังทึบต้องร่นห่างแนวเขตที่ดิน ≥ 0.50 ม. (สร้างชิดเขต 0.00 ม. ได้เมื่อมีหนังสือยินยอมข้างเคียง)'}
            </div>
            </div>
          </details>
        </div>
      )}

  </>
}
