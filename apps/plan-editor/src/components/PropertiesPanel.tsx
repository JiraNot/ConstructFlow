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
} from '@constructflow/project-model'
import { Copy, Check, Trash2, PlusCircle, RefreshCw, SlidersHorizontal, MousePointer2 } from 'lucide-react'

interface PropertiesPanelProps {
  project: ProjectDocument
  selectedId: string | null
  onAssignType: (objectId: string, typeName: string) => void
  onUpdateColumnMark: (objectId: string, newMark: string) => void
  onUpdateFoundationMark: (objectId: string, newMark: string) => void
  onUpdateGridTag: (objectId: string, newTag: string) => void
  onUpdatePhase?: (objectId: string, newPhase: Phase) => void
  onUpdateRemovalPhase?: (objectId: string, removedPhase: RemovalPhase | null) => void
  onFlipDoorHanding?: (doorId: string) => void
  onOpenTypeManager: () => void
  onAddFoundation: (columnId: string) => void
  onDeleteObject: (objectId: string) => void
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  project,
  selectedId,
  onAssignType,
  onUpdateColumnMark,
  onUpdateFoundationMark,
  onUpdateGridTag,
  onUpdatePhase,
  onUpdateRemovalPhase,
  onFlipDoorHanding,
  onOpenTypeManager,
  onAddFoundation,
  onDeleteObject,
}) => {
  const selectedObj = selectedId ? project.objects[selectedId] : null
  const [copied, setคัดลอกแล้ว] = useState(false)
  const [editingMark, setEditingMark] = useState('')

  const colObj = selectedObj && isColumnObject(selectedObj) ? selectedObj : null
  const fndObj = selectedObj && isFoundationObject(selectedObj) ? selectedObj : null
  const beamObj = selectedObj && isBeamObject(selectedObj) ? selectedObj : null
  const wallObj = selectedObj && isWallObject(selectedObj) ? selectedObj : null
  const doorObj = selectedObj && isDoorObject(selectedObj) ? selectedObj : null
  const winObj = selectedObj && isWindowObject(selectedObj) ? selectedObj : null
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

  const handleCopyUUID = () => {
    if (!selectedId) return
    navigator.clipboard.writeText(selectedId)
    setคัดลอกแล้ว(true)
    setTimeout(() => setคัดลอกแล้ว(false), 1500)
  }

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
  const wallMasonryThickness = wallLayerField('masonry_thickness_mm', wallObj?.module_data.thickness_mm ?? 0)
  const wallInsidePlaster = wallLayerField('plaster_inside_thickness_mm', 0)
  const wallOutsidePlaster = wallLayerField('plaster_outside_thickness_mm', 0)

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
            : selectedObj.id.slice(0, 8)}
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
              <span>{wallObj.module_data.thickness_mm} mm · ก่อ {wallMasonryThickness} mm · ฉาบ {wallInsidePlaster}/{wallOutsidePlaster} mm · สูง {wallObj.module_data.height_mm} mm</span>
              <span style={{ fontSize: 10, color: '#53657b', fontWeight: 500 }}>Type {wallObj.module_data.mark}</span>
            </div>
          </div>

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
        </div>
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
                UUID: {hostedFoundation.id.slice(0, 8)}...
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

<details className="cf-system-info"><summary>ข้อมูลระบบ</summary>      {/* UUID Section (Immutable Core Identity) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>รหัสวัตถุ (UUID)</label>
          <button
            onClick={handleCopyUUID}
            style={{
              background: 'transparent',
              border: 'none',
              color: copied ? '#22c55e' : '#0873c4',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              padding: 0,
            }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            <span>{copied ? 'คัดลอกแล้ว' : 'คัดลอก'}</span>
          </button>
        </div>
        <div style={{
          background: '#f5f8fc',
          padding: '6px 8px',
          borderRadius: 6,
          fontFamily: 'monospace',
          fontSize: 10,
          color: '#40566e',
          wordBreak: 'break-all',
          border: '1px solid #eef3f8',
        }}>
          {selectedObj.id}
        </div>
      </div>

</details>
      {/* ลบชิ้นงาน Action */}
      <div style={{ borderTop: '1px solid #dce4ed', paddingTop: 10 }}>
        <button
          onClick={() => onDeleteObject(selectedObj.id)}
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
