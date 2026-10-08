import React, { useState, useEffect } from 'react'
import {
  ProjectDocument,
  SmartObject,
  FoundationModuleData,
  BeamModuleData,
  WallModuleData,
  DoorModuleData,
  WindowModuleData,
  isColumnObject,
  isFoundationObject,
  isGridObject,
  isBeamObject,
  isWallObject,
  isDoorObject,
  isWindowObject,
  Phase,
  RemovalPhase,
  resolveWallVerticalExtent,
  resolveOpeningVerticalExtent,
} from '@constructflow/project-model'
import { Trash2, PlusCircle, RefreshCw, SlidersHorizontal, MousePointer2 } from 'lucide-react'

interface PropertiesPanelProps {
  project: ProjectDocument
  selectedId: string | null
  onAssignType: (objectId: string, typeName: string) => void
  onUpdateColumnMark: (objectId: string, newMark: string) => void
  onUpdateFoundationMark: (objectId: string, newMark: string) => void
  onUpdateGridTag: (objectId: string, newTag: string) => void
  onUpdateGridSystem: (systemId: string, changes: { origin_mm?: number; spacing_mm?: number; count?: number; first_tag?: string }) => void
  onUpdateWallFace: (objectId: string, changes: { plaster_inside_thickness_mm?: number; plaster_outside_thickness_mm?: number; plaster_inside_material?: string; plaster_outside_material?: string; inside_finish_mark?: string; outside_finish_mark?: string; interior_side?: 'left' | 'right'; top_level_id?: string; base_offset_mm?: number; top_offset_mm?: number; vertical_constraint?: 'fixed_height' | 'top_level'; height_mm?: number }) => void
  onUpdateOpeningVertical: (objectId: string, changes: { sill_height_mm?: number; height_mm?: number; head_level_id?: string; head_offset_mm?: number; vertical_constraint?: 'fixed_height' | 'head_level' }) => void
  onUpdatePhase?: (objectId: string, newPhase: Phase) => void
  onUpdateRemovalPhase?: (objectId: string, removedPhase: RemovalPhase | null) => void
  onFlipDoorHanding?: (doorId: string) => void
  onOpenTypeManager: () => void
  onAddFoundation: (columnId: string) => void
  onDeleteObject: (objectId: string) => void
  onDrawSlabVoid: (slabId: string) => void
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  project,
  selectedId,
  onAssignType,
  onUpdateColumnMark,
  onUpdateFoundationMark,
  onUpdateGridTag,
  onUpdateGridSystem,
  onUpdateWallFace,
  onUpdateOpeningVertical,
  onUpdatePhase,
  onUpdateRemovalPhase,
  onFlipDoorHanding,
  onOpenTypeManager,
  onAddFoundation,
  onDeleteObject,
  onDrawSlabVoid,
}) => {
  const selectedObj = selectedId ? project.objects[selectedId] : null
  const [editingMark, setEditingMark] = useState('')

  const colObj = selectedObj && isColumnObject(selectedObj) ? selectedObj : null
  const fndObj = selectedObj && isFoundationObject(selectedObj) ? selectedObj : null
  const beamObj = selectedObj && isBeamObject(selectedObj) ? selectedObj : null
  const wallObj = selectedObj && isWallObject(selectedObj) ? selectedObj : null
  const doorObj = selectedObj && isDoorObject(selectedObj) ? selectedObj : null
  const winObj = selectedObj && isWindowObject(selectedObj) ? selectedObj : null
  const slabObj = selectedObj?.object_type === 'structure.slab' ? selectedObj : null
  const grdObj = selectedObj && isGridObject(selectedObj) ? selectedObj : null

  const currentMark = colObj
    ? colObj.module_data.mark
    : fndObj
      ? fndObj.module_data.mark
      : beamObj
        ? beamObj.module_data.mark
        : wallObj
          ? wallObj.module_data.mark
          : doorObj
            ? doorObj.module_data.mark
            : winObj
              ? winObj.module_data.mark
              : grdObj
                ? grdObj.module_data.tag
                : ''

  useEffect(() => {
    setEditingMark(currentMark)
  }, [selectedId, currentMark])

  const handleSaveMark = (preset?: string) => {
    const val = (preset !== undefined ? preset : editingMark).trim()
    if (!val) return
    if (colObj || fndObj || beamObj || wallObj || doorObj || winObj) {
      if (selectedObj) {
        onAssignType(selectedObj.id, val)
      }
    } else if (grdObj) {
      onUpdateGridTag(grdObj.id, val)
    }
    setEditingMark(val)
  }

  if (!selectedObj) {
    return (
      <div style={{
        padding: 16,
        color: '#53657b',
        fontSize: 13,
        textAlign: 'center',
        marginTop: 40,
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, color: '#1682e8' }}><MousePointer2 size={23} /></div>
        <div>ยังไม่ได้เลือกวัตถุ</div>
        <div style={{ fontSize: 11, marginTop: 4, color: '#53657b' }}>
          คลิกวัตถุบนแปลนเพื่อดูและแก้ไขข้อมูล BIM
        </div>
      </div>
    )
  }

  // Find hosted foundation if this is a column
  const hostedFoundation = colObj
    ? (Object.values(project.objects).find(
        (o) => isFoundationObject(o) && (o.module_data.supported_column_id === colObj.id || o.host_refs?.includes(colObj.id))
      ) as SmartObject<FoundationModuleData> | undefined)
    : undefined

  // Find hosted openings if this is a wall
  const hostedOpenings = wallObj
    ? Object.values(project.objects).filter(
        (o): o is SmartObject<DoorModuleData | WindowModuleData> =>
          (isDoorObject(o) || isWindowObject(o)) && (o.module_data as any).wall_id === wallObj.id
      )
    : []

  const columnPresets = project.types.filter(type => type.object_type === 'structure.column').map(type => type.name)
  const foundationPresets = project.types.filter(type => type.object_type === 'structure.foundation').map(type => type.name)
  const beamPresets = project.types.filter(type => type.object_type === 'structure.beam').map(type => type.name)
  const wallPresets = project.types.filter(type => type.object_type === 'architecture.wall').map(type => type.name)
  const doorPresets = (project.types || []).filter(type => type.object_type === 'door_window.door').map(type => type.name)
  const windowPresets = (project.types || []).filter(type => type.object_type === 'door_window.window').map(type => type.name)
  const wallCatalogType = wallObj
    ? project.types.find(type => type.id === wallObj.module_data.type_id)
      ?? project.types.find(type => type.object_type === 'architecture.wall' && type.name.toLowerCase() === wallObj.module_data.mark.toLowerCase())
    : undefined
  const wallLayerField = (field: string, fallback: number) => {
    if (!wallObj) return fallback
    const override = wallObj.module_data.instance_overrides?.[field]
    const instanceValue = wallObj.module_data[field as keyof WallModuleData]
    const typeValue = wallCatalogType?.parameters[field]
    const value = override ?? instanceValue ?? typeValue
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
  }
  const wallFaceField = (field: string, fallback: string) => {
    if (!wallObj) return fallback
    const override = wallObj.module_data.instance_overrides?.[field]
    const instanceValue = wallObj.module_data[field as keyof WallModuleData]
    const typeValue = wallCatalogType?.parameters[field]
    const value = override ?? instanceValue ?? typeValue
    return typeof value === 'string' && value.trim() ? value : fallback
  }
  const wallMasonryThickness = wallLayerField('masonry_thickness_mm', wallObj?.module_data.thickness_mm ?? 0)
  const wallInsidePlaster = wallLayerField('plaster_inside_thickness_mm', 0)
  const wallOutsidePlaster = wallLayerField('plaster_outside_thickness_mm', 0)
  const wallVertical = wallObj ? resolveWallVerticalExtent(project, wallObj) : undefined
  const doorVertical = doorObj ? resolveOpeningVerticalExtent(project, doorObj) : undefined
  const windowVertical = winObj ? resolveOpeningVerticalExtent(project, winObj) : undefined
  const verticalSelectStyle: React.CSSProperties = { width: '100%', background: '#fff', border: '1px solid #dce4ed', borderRadius: 5, padding: 7, color: '#24364b' }

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header with Type Badge */}
      <div style={{ borderBottom: '1px solid #dce4ed', paddingBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{
            fontSize: 10,
            textTransform: 'uppercase',
            fontWeight: 800,
            color: colObj
              ? '#0873c4'
              : fndObj
              ? '#996000'
              : beamObj
              ? '#7144ad'
              : wallObj
              ? '#52677d'
              : doorObj
              ? '#18764b'
              : winObj
              ? '#0873c4'
              : '#52677d',
            background: '#f5f8fc',
            padding: '2px 6px',
            borderRadius: 4,
            border: '1px solid #dce4ed',
          }}>
            {selectedObj.object_type}
          </span>
          <span style={{ fontSize: 10, color: '#53657b' }}>v{selectedObj.schema_version}</span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#24364b' }}>
          {colObj
            ? `Column ${colObj.module_data.mark}`
            : fndObj
            ? `Footing ${fndObj.module_data.mark}`
            : beamObj
            ? `Beam ${beamObj.module_data.mark}`
            : wallObj
            ? `Wall ${wallObj.module_data.mark}`
            : doorObj
            ? `Door ${doorObj.module_data.mark}`
            : winObj
            ? `Window ${winObj.module_data.mark}`
            : grdObj
            ? `Grid ${grdObj.module_data.tag}`
            : 'วัตถุ'}
        </div>
      </div>

      {/* Human-Readable Mark & Type Presets */}
      {(colObj || fndObj || beamObj || wallObj || doorObj || winObj) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>
            ชนิดของชิ้นนี้
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <select aria-label="ชนิดของชิ้นที่เลือก" value={currentMark} onChange={e=>handleSaveMark(e.target.value)} style={{width:'100%',background:'#fff',border:'1px solid #dce4ed',padding:8,color:'#24364b'}}>
              {project.types.filter(type=>type.object_type===selectedObj.object_type).map(type=><option key={type.id} value={type.name}>{type.name}</option>)}
            </select>
          </div>

          <button className="cf-button cf-button-quiet" onClick={onOpenTypeManager}>แก้ไขชนิด · ใช้กับ {Object.values(project.objects).filter(o=>o.object_type===selectedObj.object_type && ((selectedObj.module_data as any).type_id ? (o.module_data as any).type_id===(selectedObj.module_data as any).type_id : (o.module_data as any).mark===currentMark)).length} ชิ้น</button>
        </div>
      )}

      {/* Column Dimensions */}
      {colObj && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>หน้าตัด (มม.)</label>
            <button
              onClick={onOpenTypeManager}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#0873c4',
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
            padding: '7px 10px',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 700,
            color: '#0873c4',
            border: '1px solid #eef3f8',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span>{colObj.module_data.section_mm[0]} × {colObj.module_data.section_mm[1]} mm</span>
            <span style={{ fontSize: 10, color: '#53657b', fontWeight: 500 }}>Type {colObj.module_data.mark}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#52677d' }}>
            <span>ตำแหน่ง:</span>
            <span style={{ fontFamily: 'monospace' }}>
              ({(colObj.module_data.location_mm[0] / 1000).toFixed(3)} m, {(colObj.module_data.location_mm[1] / 1000).toFixed(3)} m)
            </span>
          </div>
        </div>
      )}

      {/* Footing Dimensions */}
      {fndObj && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>ขนาด (มม.)</label>
            <button
              onClick={onOpenTypeManager}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#996000',
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
            padding: '7px 10px',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 700,
            color: '#996000',
            border: '1px solid #eef3f8',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span>{fndObj.module_data.size_mm[0]} × {fndObj.module_data.size_mm[1]} × {fndObj.module_data.size_mm[2]} mm</span>
            <span style={{ fontSize: 10, color: '#53657b', fontWeight: 500 }}>Type {fndObj.module_data.mark}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#52677d' }}>
            <span>Center:</span>
            <span style={{ fontFamily: 'monospace' }}>
              ({(fndObj.module_data.center_mm[0] / 1000).toFixed(3)} m, {(fndObj.module_data.center_mm[1] / 1000).toFixed(3)} m)
            </span>
          </div>
        </div>
      )}

      {/* Beam Dimensions & Span */}
      {beamObj && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>หน้าตัด (มม.)</label>
              <button
                onClick={onOpenTypeManager}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#0873c4',
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
              padding: '7px 10px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 700,
              color: '#0873c4',
              border: '1px solid #eef3f8',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span>{beamObj.module_data.section_mm[0]} × {beamObj.module_data.section_mm[1]} mm</span>
              <span style={{ fontSize: 10, color: '#53657b', fontWeight: 500 }}>Type {beamObj.module_data.mark}</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>
              SPAN LENGTH (ความยาวช่วงคาน)
            </label>
            <div style={{
              background: '#f5f8fc',
              padding: '7px 10px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 700,
              color: '#34d399',
              border: '1px solid #eef3f8',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span>{(beamObj.module_data.span_mm / 1000).toFixed(2)} m</span>
              <span style={{ fontSize: 11, color: '#52677d', fontFamily: 'monospace' }}>
                {beamObj.module_data.span_mm.toLocaleString()} mm
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Wall Properties */}
      {wallObj && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>THICKNESS & HEIGHT (MM)</label>
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
              padding: '7px 10px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 700,
              color: '#40566e',
              border: '1px solid #eef3f8',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span>{wallObj.module_data.thickness_mm} mm · แกน/โครง {wallMasonryThickness} mm · ผิว {wallInsidePlaster}/{wallOutsidePlaster} mm · สูง {Math.round(wallVertical?.height_mm ?? wallObj.module_data.height_mm)} mm</span>
              <span style={{ fontSize: 10, color: '#53657b', fontWeight: 500 }}>Type {wallObj.module_data.mark}</span>
            </div>
          </div>

          <section style={{ display: 'grid', gap: 7, padding: 9, background: '#f5f8fc', border: '1px solid #e5edf5', borderRadius: 6 }}>
            <strong style={{ fontSize: 11, color: '#40566e' }}>ระดับและความสูงผนัง</strong>
            <label style={{ display: 'grid', gap: 4, fontSize: 11, color: '#52677d' }}>ขอบบนผนัง
              <select aria-label="ระดับขอบบนผนัง" style={verticalSelectStyle} value={wallObj.module_data.top_level_id ?? ''} onChange={e => e.target.value
                ? onUpdateWallFace(wallObj.id, { top_level_id: e.target.value, vertical_constraint: 'top_level' })
                : onUpdateWallFace(wallObj.id, { top_level_id: undefined, vertical_constraint: 'fixed_height', height_mm: wallVertical?.height_mm ?? wallObj.module_data.height_mm })}>
                <option value="">กำหนดความสูงเอง</option>
                {project.levels.filter(level => level.elevation_mm > (project.levels.find(item => item.id === wallObj.module_data.level_id)?.elevation_mm ?? 0)).map(level => <option key={level.id} value={level.id}>{level.name} · +{(level.elevation_mm / 1000).toFixed(3)} ม.</option>)}
              </select>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>ยกจากพื้น (มม.)<input aria-label="ระยะยกฐานผนัง" type="number" value={wallObj.module_data.base_offset_mm ?? 0} onChange={e => onUpdateWallFace(wallObj.id, { base_offset_mm: Number(e.target.value) })} style={verticalSelectStyle} /></label>
              <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>ลดจากระดับบน (มม.)<input aria-label="ระยะลดขอบบนผนัง" type="number" value={wallObj.module_data.top_offset_mm ?? 0} disabled={!wallObj.module_data.top_level_id} onChange={e => onUpdateWallFace(wallObj.id, { top_offset_mm: Number(e.target.value) })} style={verticalSelectStyle} /></label>
            </div>
            {!wallObj.module_data.top_level_id && <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>ความสูงผนัง (มม.)<input aria-label="ความสูงผนัง" type="number" min="1" value={wallObj.module_data.height_mm} onChange={e => onUpdateWallFace(wallObj.id, { vertical_constraint: 'fixed_height', height_mm: Number(e.target.value) })} style={verticalSelectStyle} /></label>}
          </section>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#52677d', fontWeight: 600 }}>
              ผิวด้านใน
              <span style={{ fontWeight: 500 }}><input type="checkbox" checked={wallInsidePlaster > 0} onChange={e => onUpdateWallFace(wallObj.id, { plaster_inside_thickness_mm: e.target.checked ? 15 : 0 })} /> เปิดชั้นผิว</span>
              <input aria-label="รหัสป้ายผิวด้านใน" list="cf-wall-marks" value={wallFaceField('inside_finish_mark', wallObj.module_data.mark)} onChange={e => onUpdateWallFace(wallObj.id, { inside_finish_mark: e.target.value })} placeholder="เช่น W1" style={{ width: '100%', background: '#fff', border: '1px solid #dce4ed', borderRadius: 5, padding: 7, color: '#24364b' }} />
              <select aria-label="ผิวผนังด้านใน" value={wallFaceField('plaster_inside_material', 'cement_plaster')} onChange={e => onUpdateWallFace(wallObj.id, { plaster_inside_material: e.target.value })} style={{ width: '100%', background: '#fff', border: '1px solid #dce4ed', borderRadius: 5, padding: 7, color: '#24364b' }}>
                <option value="cement_plaster">ฉาบปูน</option><option value="interior_paint">สีภายใน</option><option value="ceramic_tile">กระเบื้อง</option><option value="stone_cladding">กรุหิน</option><option value="timber_cladding">กรุไม้</option><option value="wallpaper">วอลล์เปเปอร์</option><option value="exposed_masonry">โชว์ผิวก่อ</option><option value="smartboard">สมาร์ทบอร์ด</option><option value="fiber_cement_board">ไฟเบอร์ซีเมนต์บอร์ด</option><option value="gypsum_board">ยิปซัมบอร์ด</option><option value="composite_panel">แผ่นคอมโพซิต</option><option value="faux_wood_panel">แผ่นลายไม้เทียม</option><option value="none">ไม่ตกแต่ง</option>
              </select>
              <input aria-label="ความหนาผิวด้านใน (มม.)" type="number" min="0" step="1" disabled={wallInsidePlaster <= 0} value={wallInsidePlaster} onChange={e => onUpdateWallFace(wallObj.id, { plaster_inside_thickness_mm: Number(e.target.value) })} style={{ width: '100%', background: '#fff', border: '1px solid #dce4ed', borderRadius: 5, padding: 7, color: '#24364b' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#52677d', fontWeight: 600 }}>
              ผิวด้านนอก
              <span style={{ fontWeight: 500 }}><input type="checkbox" checked={wallOutsidePlaster > 0} onChange={e => onUpdateWallFace(wallObj.id, { plaster_outside_thickness_mm: e.target.checked ? 15 : 0 })} /> เปิดชั้นผิว</span>
              <input aria-label="รหัสป้ายผิวด้านนอก" list="cf-wall-marks" value={wallFaceField('outside_finish_mark', wallObj.module_data.mark)} onChange={e => onUpdateWallFace(wallObj.id, { outside_finish_mark: e.target.value })} placeholder="เช่น W2" style={{ width: '100%', background: '#fff', border: '1px solid #dce4ed', borderRadius: 5, padding: 7, color: '#24364b' }} />
              <select aria-label="ผิวผนังด้านนอก" value={wallFaceField('plaster_outside_material', 'cement_plaster')} onChange={e => onUpdateWallFace(wallObj.id, { plaster_outside_material: e.target.value })} style={{ width: '100%', background: '#fff', border: '1px solid #dce4ed', borderRadius: 5, padding: 7, color: '#24364b' }}>
                <option value="cement_plaster">ฉาบปูน</option><option value="exterior_paint">สีภายนอก</option><option value="ceramic_tile">กระเบื้อง</option><option value="stone_cladding">กรุหิน</option><option value="timber_cladding">กรุไม้</option><option value="exposed_masonry">โชว์ผิวก่อ</option><option value="smartboard">สมาร์ทบอร์ด</option><option value="fiber_cement_board">ไฟเบอร์ซีเมนต์บอร์ด</option><option value="gypsum_board">ยิปซัมบอร์ด</option><option value="composite_panel">แผ่นคอมโพซิต</option><option value="faux_wood_panel">แผ่นลายไม้เทียม</option><option value="none">ไม่ตกแต่ง</option>
              </select>
              <input aria-label="ความหนาผิวด้านนอก (มม.)" type="number" min="0" step="1" disabled={wallOutsidePlaster <= 0} value={wallOutsidePlaster} onChange={e => onUpdateWallFace(wallObj.id, { plaster_outside_thickness_mm: Number(e.target.value) })} style={{ width: '100%', background: '#fff', border: '1px solid #dce4ed', borderRadius: 5, padding: 7, color: '#24364b' }} />
            </label>
          </div>
          <datalist id="cf-wall-marks">{wallPresets.map(mark => <option key={mark} value={mark} />)}</datalist>
          <button type="button" className="cf-button cf-button-quiet" onClick={() => onUpdateWallFace(wallObj.id, { interior_side: wallObj.module_data.interior_side === 'right' ? 'left' : 'right' })}>
            สลับด้านใน/นอก · ด้านในอยู่ฝั่ง {(wallObj.module_data.interior_side ?? 'left') === 'left' ? 'ซ้าย' : 'ขวา'} ของแนวเริ่ม→จบ
          </button>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>
              WALL LENGTH (ความยาวผนัง)
            </label>
            <div style={{
              background: '#f5f8fc',
              padding: '7px 10px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 700,
              color: '#0873c4',
              border: '1px solid #eef3f8',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span>{(wallObj.module_data.length_mm / 1000).toFixed(2)} m</span>
              <span style={{ fontSize: 11, color: '#52677d', fontFamily: 'monospace' }}>
                {wallObj.module_data.length_mm.toLocaleString()} mm
              </span>
            </div>
          </div>

          {/* Hosted Openings Status */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>
              HOSTED OPENINGS ({hostedOpenings.length})
            </label>
            {hostedOpenings.length > 0 ? (
              <div style={{
                background: '#f5f8fc',
                padding: '6px 8px',
                borderRadius: 6,
                border: '1px solid #eef3f8',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
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
                        {(offset / 1000).toFixed(2)}m from start
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
        </div>
      )}

      {/* Door Properties */}
      {doorObj && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>ขนาด (เมตร)</label>
              <button
                onClick={onOpenTypeManager}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#18764b',
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
              padding: '7px 10px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 700,
              color: '#18764b',
              border: '1px solid #eef3f8',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span>{(doorObj.module_data.width_mm / 1000).toFixed(2)} × {(doorObj.module_data.height_mm / 1000).toFixed(2)} m</span>
              <span style={{ fontSize: 10, color: '#53657b', fontWeight: 500 }}>Type {doorObj.module_data.mark}</span>
            </div>
          </div>

          <section style={{ display: 'grid', gap: 7, padding: 9, background: '#f5f8fc', border: '1px solid #e5edf5', borderRadius: 6 }}>
            <strong style={{ fontSize: 11, color: '#40566e' }}>ระดับประตู</strong>
            <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>ธรณี/ยกจากพื้น (มม.)<input aria-label="ระดับธรณีประตู" type="number" min="0" value={doorObj.module_data.sill_height_mm ?? 0} onChange={e => onUpdateOpeningVertical(doorObj.id, { sill_height_mm: Number(e.target.value) })} style={verticalSelectStyle} /></label>
            <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>หัวประตูจบที่ระดับ
              <select aria-label="ระดับหัวประตู" value={doorObj.module_data.head_level_id ?? ''} onChange={e => e.target.value
                ? onUpdateOpeningVertical(doorObj.id, { head_level_id: e.target.value, head_offset_mm: 0 })
                : onUpdateOpeningVertical(doorObj.id, { head_level_id: undefined, vertical_constraint: 'fixed_height', height_mm: doorVertical?.height_mm ?? doorObj.module_data.height_mm })} style={verticalSelectStyle}>
                <option value="">กำหนดความสูงบานเอง</option>
                {project.levels.filter(level => level.elevation_mm > (project.levels.find(item => item.id === doorObj.module_data.level_id)?.elevation_mm ?? 0)).map(level => <option key={level.id} value={level.id}>{level.name} · +{(level.elevation_mm / 1000).toFixed(3)} ม.</option>)}
              </select>
            </label>
            {doorObj.module_data.head_level_id ? <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>ระยะหัวประตูจากระดับ (มม.)<input aria-label="ระยะหัวประตูจากระดับ" type="number" value={doorObj.module_data.head_offset_mm ?? 0} onChange={e => onUpdateOpeningVertical(doorObj.id, { head_offset_mm: Number(e.target.value) })} style={verticalSelectStyle} /></label> : <div style={{ fontSize: 10, color: '#52677d' }}>ความสูงช่อง {Math.round(doorVertical?.height_mm ?? doorObj.module_data.height_mm)} มม.</div>}
          </section>

          {/* Door Handing with Flip button */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>HANDING & SWING</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{
                background: '#f5f8fc',
                padding: '6px 10px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                color: '#24364b',
                flex: 1,
                border: '1px solid #eef3f8',
                textTransform: 'uppercase',
              }}>
                {doorObj.module_data.handing.replace('_', ' ')}
              </div>
              <button
                onClick={() => onFlipDoorHanding && onFlipDoorHanding(doorObj.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  background: '#eef3f8',
                  color: '#18764b',
                  border: '1px solid #16a34a',
                  padding: '6px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                <RefreshCw size={12} /> Flip
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#52677d' }}>
            <span>Offset along wall:</span>
            <span style={{ fontFamily: 'monospace' }}>{(doorObj.module_data.offset_along_wall_mm / 1000).toFixed(2)} m</span>
          </div>
        </div>
      )}

      {/* Window Properties */}
      {winObj && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>ขนาด (เมตร)</label>
              <button
                onClick={onOpenTypeManager}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#0873c4',
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
              padding: '7px 10px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 700,
              color: '#0873c4',
              border: '1px solid #eef3f8',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span>{(winObj.module_data.width_mm / 1000).toFixed(2)} × {(winObj.module_data.height_mm / 1000).toFixed(2)} m</span>
              <span style={{ fontSize: 10, color: '#53657b', fontWeight: 500 }}>Type {winObj.module_data.mark}</span>
            </div>
          </div>

          <section style={{ display: 'grid', gap: 7, padding: 9, background: '#f5f8fc', border: '1px solid #e5edf5', borderRadius: 6 }}>
            <strong style={{ fontSize: 11, color: '#40566e' }}>ระดับหน้าต่าง</strong>
            <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>ธรณีหน้าต่างจากพื้น (มม.)<input aria-label="ระดับธรณีหน้าต่าง" type="number" min="0" value={winObj.module_data.sill_height_mm} onChange={e => onUpdateOpeningVertical(winObj.id, { sill_height_mm: Number(e.target.value) })} style={verticalSelectStyle} /></label>
            <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>หัวหน้าต่างจบที่ระดับ
              <select aria-label="ระดับหัวหน้าต่าง" value={winObj.module_data.head_level_id ?? ''} onChange={e => e.target.value
                ? onUpdateOpeningVertical(winObj.id, { head_level_id: e.target.value, head_offset_mm: 0 })
                : onUpdateOpeningVertical(winObj.id, { head_level_id: undefined, vertical_constraint: 'fixed_height', height_mm: windowVertical?.height_mm ?? winObj.module_data.height_mm })} style={verticalSelectStyle}>
                <option value="">กำหนดความสูงเอง</option>
                {project.levels.filter(level => level.elevation_mm > (project.levels.find(item => item.id === winObj.module_data.level_id)?.elevation_mm ?? 0)).map(level => <option key={level.id} value={level.id}>{level.name} · +{(level.elevation_mm / 1000).toFixed(3)} ม.</option>)}
              </select>
            </label>
            {winObj.module_data.head_level_id ? <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>ระยะหัวหน้าต่างจากระดับ (มม.)<input aria-label="ระยะหัวหน้าต่างจากระดับ" type="number" value={winObj.module_data.head_offset_mm ?? 0} onChange={e => onUpdateOpeningVertical(winObj.id, { head_offset_mm: Number(e.target.value) })} style={verticalSelectStyle} /></label> : <div style={{ fontSize: 10, color: '#52677d' }}>ความสูงช่อง {Math.round(windowVertical?.height_mm ?? winObj.module_data.height_mm)} มม.</div>}
          </section>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#52677d' }}>
            <span>Sill Height:</span>
            <span style={{ fontFamily: 'monospace' }}>{(winObj.module_data.sill_height_mm / 1000).toFixed(2)} m</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#52677d' }}>
            <span>Offset along wall:</span>
            <span style={{ fontFamily: 'monospace' }}>{(winObj.module_data.offset_along_wall_mm / 1000).toFixed(2)} m</span>
          </div>
        </div>
      )}

      {/* Grid Coordinates */}
      {grdObj && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>
            GRID LINE POSITION
          </label>
          <div style={{ background: '#f5f8fc', padding: '6px 8px', borderRadius: 6, fontSize: 12 }}>
            {grdObj.module_data.orientation === 'vertical' ? 'X = ' : 'Y = '}
            <b>{(grdObj.module_data.position_mm / 1000).toFixed(3)} m</b>{' '}
            <span style={{ color: '#53657b', fontSize: 11 }}>({grdObj.module_data.position_mm} mm)</span>
          </div>
          {grdObj.module_data.system_id && <section key={`${grdObj.module_data.system_id}:${selectedId}`} style={{ display: 'grid', gap: 7, marginTop: 7, padding: 9, background: '#f5f8fc', border: '1px solid #e5edf5', borderRadius: 6 }}>
            <strong style={{ fontSize: 12 }}>ระบบกริด · {grdObj.module_data.system_count} เส้น</strong>
            <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>ตำแหน่งเส้นแรก (มม.)
              <input aria-label="ตำแหน่งเริ่มต้นระบบกริด" type="number" defaultValue={grdObj.module_data.system_origin_mm ?? grdObj.module_data.position_mm} onBlur={event => {
                const value = Number(event.target.value); if (Number.isFinite(value)) onUpdateGridSystem(grdObj.module_data.system_id!, { origin_mm: value })
              }} style={verticalSelectStyle} />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>ระยะห่าง (มม.)
                <input aria-label="ระยะห่างระบบกริด" type="number" min="1" defaultValue={grdObj.module_data.system_spacing_mm ?? 4000} onBlur={event => {
                  const value = Number(event.target.value); if (Number.isFinite(value) && value > 0) onUpdateGridSystem(grdObj.module_data.system_id!, { spacing_mm: value })
                }} style={verticalSelectStyle} />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>จำนวนเส้น
                <input aria-label="จำนวนเส้นในระบบกริด" type="number" min="1" max="100" defaultValue={grdObj.module_data.system_count ?? 1} onBlur={event => {
                  const value = Math.max(1, Math.min(100, Math.floor(Number(event.target.value)))); if (Number.isFinite(value)) onUpdateGridSystem(grdObj.module_data.system_id!, { count: value })
                }} style={verticalSelectStyle} />
              </label>
            </div>
            <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>ป้ายเส้นแรก
              <input aria-label="ป้ายกริดเส้นแรกในชุด" defaultValue={grdObj.module_data.system_first_tag ?? grdObj.module_data.tag} onBlur={event => {
                const value = event.target.value.trim(); if (value) onUpdateGridSystem(grdObj.module_data.system_id!, { first_tag: value })
              }} style={verticalSelectStyle} />
            </label>
            <small style={{ fontSize: 10, color: '#64748b' }}>แก้ข้อมูลจากเส้นใดก็ได้ในชุดนี้ ระบบจะจัดตำแหน่งและป้ายทุกเส้นใหม่</small>
          </section>}
        </div>
      )}

      {slabObj && (
        (() => {
          const slabData = slabObj.module_data as Record<string, unknown>
          return <section style={{ display: 'grid', gap: 8, padding: 10, border: '1px solid #dbe3ed', borderRadius: 8 }}>
            <strong style={{ fontSize: 12 }}>พื้น {String(slabData.mark ?? '')}</strong>
            <span style={{ fontSize: 11, color: '#52677d' }}>
              ระดับ {project.levels.find(level => level.id === slabData.level_id)?.name ?? String(slabData.level_id ?? '')} · หนา {String(slabData.thickness_mm ?? '')} มม. · ช่องเจาะ {Array.isArray(slabData.voids_mm) ? slabData.voids_mm.length : 0} ช่อง
            </span>
            <button type="button" onClick={() => onDrawSlabVoid(slabObj.id)} style={verticalSelectStyle}>วาดช่องเจาะพื้น</button>
          </section>
        })()
      )}

      {/* Level and Phase */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>ระดับฐาน</label>
          <div style={{ background: '#f5f8fc', padding: '5px 8px', borderRadius: 4, fontSize: 12, marginTop: 4 }}>
            {selectedObj.level_refs?.[0]?.level_id || 'Ground Floor'}
          </div>
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>เฟสสร้าง</label>
          <select
            value={selectedObj.created_phase}
            onChange={(e) => onUpdatePhase && onUpdatePhase(selectedObj.id, e.target.value as Phase)}
            style={{
              width: '100%',
              background:
                selectedObj.created_phase === 'existing'
                  ? '#dce4ed'
                  : selectedObj.created_phase === 'demolition'
                  ? '#991b1b'
                  : '#0369a1',
              color: selectedObj.created_phase === 'existing' ? '#24394d' : '#ffffff',
              border: '1px solid #53657b',
              borderRadius: 4,
              padding: '5px 8px',
              fontSize: 11,
              fontWeight: 600,
              marginTop: 4,
              cursor: 'pointer',
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
          value={selectedObj.removed_phase ?? 'none'}
          onChange={(e) => onUpdateRemovalPhase && onUpdateRemovalPhase(selectedObj.id, e.target.value === 'none' ? null : e.target.value as RemovalPhase)}
          style={{
            width: '100%',
            background: selectedObj.removed_phase === 'demolition' ? '#991b1b' : '#f5f8fc',
            color: selectedObj.removed_phase === 'demolition' ? '#ffffff' : '#24394d',
            border: '1px solid #53657b',
            borderRadius: 4,
            padding: '5px 8px',
            fontSize: 11,
            marginTop: 4,
            cursor: 'pointer',
          }}
        >
          <option value="none">ไม่รื้อถอน</option>
          <option value="demolition">รื้อถอน</option>
        </select>
      </div>

      {/* Hosted Foundation Status / Action for Columns */}
      {colObj && (
        <div style={{ borderTop: '1px solid #dce4ed', paddingTop: 10 }}>
          <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>ฐานรากของเสานี้</label>
          {hostedFoundation ? (
            <div style={{
              background: '#f5f8fc',
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid #dce4ed',
              marginTop: 6,
              fontSize: 12,
            }}>
              <div style={{ color: '#0873c4', fontWeight: 600 }}>
                Footing {hostedFoundation.module_data.mark} ({hostedFoundation.module_data.size_mm.join(' × ')} mm)
              </div>
              <div style={{ color: '#53657b', fontSize: 10, marginTop: 2 }}>
                ฐานรากที่เชื่อมกับเสานี้
              </div>
            </div>
          ) : (
            <button
              onClick={() => onAddFoundation(colObj.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: '#eef3f8',
                color: '#0873c4',
                border: '1px solid #0284c7',
                padding: '6px 12px',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                marginTop: 6,
                width: '100%',
                justifyContent: 'center',
              }}
            >
              <PlusCircle size={14} /> Add Hosted Footing (800×800)
            </button>
          )}
        </div>
      )}

      {/* ลบชิ้นงาน Action */}
      <div style={{ borderTop: '1px solid #dce4ed', paddingTop: 10 }}>
        <button
          onClick={() => onDeleteObject(selectedObj.id)}
          title="ลบชิ้นงาน (Delete / Backspace)"
          aria-label="ลบชิ้นงาน (Delete / Backspace)"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(239, 68, 68, 0.1)',
            color: '#ef4444',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            padding: '6px 12px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            width: '100%',
            justifyContent: 'center',
          }}
        >
          <Trash2 size={14} /> ลบชิ้นงาน
        </button>
      </div>
    </div>
  )
}
