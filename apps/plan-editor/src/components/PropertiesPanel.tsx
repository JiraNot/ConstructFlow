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
  CATALOG_PARAMETER_FIELDS,
  resolveCatalogType,
  resolveWallVerticalExtent,
  resolveOpeningVerticalExtent,
  resolveColumnVerticalExtent,
  resolveBeamBaseElevation,
  resolveArchitectureSurfaceElevation,
  formatLengthMm,
  parseLengthMm,
  type DisplayLengthUnit,
} from '@constructflow/project-model'
import { Trash2, PlusCircle, RefreshCw, SlidersHorizontal, MousePointer2 } from 'lucide-react'
import { OpeningElevationThumbnail } from './OpeningElevationThumbnail.js'
import { buildOpeningRepresentationShapeFromObject } from '@constructflow/representation-engine'
import { WorkbenchNumberInput } from './WorkbenchNumberInput.js'
import { CatalogField } from './CatalogField.js'
import { formatRoomAreaM2 } from '../roomLabel.mjs'
import { evaluateRoomVentilationCompliance } from '@constructflow/clash-engine'

const LengthInput: React.FC<{ value: number; unit: DisplayLengthUnit; onChange: (value: number) => void; style?: React.CSSProperties; disabled?: boolean; 'aria-label'?: string }> = ({ value, unit, onChange, style, disabled, 'aria-label': ariaLabel }) => <WorkbenchNumberInput value={value} unit={unit} onChange={onChange} style={style} disabled={disabled} ariaLabel={ariaLabel} />

const wallFaceMaterialOptions: Array<[string, string]> = [
  ['cement_plaster', 'ฉาบปูน'], ['wall_paint', 'สีทาผนัง'],
  // Keep old project values selectable while presenting them as neutral face finishes.
  ['interior_paint', 'สีทาผนัง (ข้อมูลเดิม)'], ['exterior_paint', 'สีทาผนัง (ข้อมูลเดิม)'],
  ['ceramic_tile', 'กระเบื้อง'], ['stone_cladding', 'กรุหิน'], ['timber_cladding', 'กรุไม้'],
  ['wallpaper', 'วอลล์เปเปอร์'], ['exposed_masonry', 'โชว์ผิวก่อ'], ['smartboard', 'สมาร์ทบอร์ด'],
  ['fiber_cement_board', 'ไฟเบอร์ซีเมนต์บอร์ด'], ['gypsum_board', 'ยิปซัมบอร์ด'],
  ['composite_panel', 'แผ่นคอมโพซิต'], ['faux_wood_panel', 'แผ่นลายไม้เทียม'], ['none', 'ไม่ตกแต่ง'],
]

const neutralWallFaceMaterial = (material: string) => material === 'interior_paint' || material === 'exterior_paint' ? 'wall_paint' : material

interface PropertiesPanelProps {
  project: ProjectDocument
  displayUnit: DisplayLengthUnit
  selectedId: string | null
  selectedIds?: string[]
  onAssignType: (objectId: string, typeName: string) => void
  onAssignTypeMany?: (objectIds: string[], typeId: string) => void
  onDeleteObjects?: (objectIds: string[]) => void
  onUpdateColumnMark: (objectId: string, newMark: string) => void
  onUpdateColumnVerticalReference: (objectId: string, changes: { base_level_id?: string; top_level_id?: string | null; base_offset_mm?: number; top_offset_mm?: number }) => void
  onUpdateBeamVerticalReference: (objectId: string, changes: { level_id?: string; base_offset_mm?: number }) => void
  onUpdateArchitectureSurface?: (objectId: string, changes: { level_id?: string; elevation_offset_mm?: number; thickness_mm?: number; material?: string; finish_layers?: Array<{ material: string; thickness_mm: number; mark?: string; quantity_unit?: 'm2' | 'm3' }>; finish_pattern_mm?: [number, number]; finish_pattern_origin_mm?: [number, number]; finish_pattern_rotation_deg?: number; grid_mm?: [number, number] }) => void
  onUpdateFoundationMark: (objectId: string, newMark: string) => void
  onUpdateGridTag: (objectId: string, newTag: string) => void
  onModifyGrid: (objectId: string, changes: { start_point_mm?: [number, number]; end_point_mm?: [number, number]; bubble_visible?: boolean; auto_tag?: boolean; sequence_style?: 'auto' | 'alpha' | 'numeric' }) => void
  onUpdateGridSystem: (systemId: string, changes: { positions_mm?: number[]; first_tag?: string }) => void
  onUpdateWallFace: (objectId: string, changes: { plaster_inside_thickness_mm?: number; plaster_outside_thickness_mm?: number; plaster_inside_material?: string; plaster_outside_material?: string; inside_finish_mark?: string; outside_finish_mark?: string; interior_side?: 'left' | 'right'; top_level_id?: string; base_offset_mm?: number; top_offset_mm?: number; vertical_constraint?: 'fixed_height' | 'top_level'; height_mm?: number }) => void
  onUpdateOpeningVertical: (objectId: string, changes: { sill_height_mm?: number; height_mm?: number; head_level_id?: string; head_offset_mm?: number; vertical_constraint?: 'fixed_height' | 'head_level' }) => void
  onUpdateOpeningInstanceParameters?: (objectId: string, parameters: Record<string, unknown | null>) => void
  onUpdatePhase?: (objectId: string, newPhase: Phase) => void
  onUpdateRemovalPhase?: (objectId: string, removedPhase: RemovalPhase | null) => void
  onFlipDoorHanding?: (doorId: string) => void
  onOpenTypeManager: () => void
  onAddFoundation: (columnId: string) => void
  onDeleteObject: (objectId: string) => void
  onDrawSurfaceVoid: (surfaceId: string) => void
  onCreateRoomFinish?: (kind: 'floor' | 'ceiling', roomId: string) => void
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  project,
  displayUnit,
  selectedId,
  selectedIds = selectedId ? [selectedId] : [],
  onAssignType,
  onAssignTypeMany,
  onDeleteObjects,
  onUpdateColumnMark,
  onUpdateColumnVerticalReference,
  onUpdateBeamVerticalReference,
  onUpdateArchitectureSurface,
  onUpdateFoundationMark,
  onUpdateGridTag,
  onModifyGrid,
  onUpdateGridSystem,
  onUpdateWallFace,
  onUpdateOpeningVertical,
  onUpdateOpeningInstanceParameters,
  onUpdatePhase,
  onUpdateRemovalPhase,
  onFlipDoorHanding,
  onOpenTypeManager,
  onAddFoundation,
  onDeleteObject,
  onDrawSurfaceVoid,
  onCreateRoomFinish,
}) => {
  const selectedObj = selectedId ? project.objects[selectedId] : null
  const selectedObjects = [...new Set(selectedIds)].map(id => project.objects[id]).filter((object): object is SmartObject => Boolean(object))
  const selectedObjectFamily = selectedObjects.length > 1 && selectedObjects.every(object => object.object_type === selectedObjects[0].object_type)
    ? selectedObjects[0].object_type
    : null
  const selectedFamilyTypes = selectedObjectFamily
    ? project.types.filter(type => type.object_type === selectedObjectFamily)
    : []
  const selectedResolvedTypeIds = selectedObjects.map(object => {
    const data = object.module_data as Record<string, unknown>
    return project.types.find(type => type.object_type === object.object_type && (type.id === data.type_id || type.name === data.mark))?.id ?? ''
  })
  const selectedCommonTypeId = selectedObjects.length > 1 && selectedResolvedTypeIds[0] && selectedResolvedTypeIds.every(id => id === selectedResolvedTypeIds[0])
    ? selectedResolvedTypeIds[0]
    : ''
  const [editingMark, setEditingMark] = useState('')

  const colObj = selectedObj && isColumnObject(selectedObj) ? selectedObj : null
  const columnVertical = colObj ? resolveColumnVerticalExtent(project, colObj) : undefined
  const fndObj = selectedObj && isFoundationObject(selectedObj) ? selectedObj : null
  const beamObj = selectedObj && isBeamObject(selectedObj) ? selectedObj : null
  const beamBaseElevation = beamObj ? resolveBeamBaseElevation(project, beamObj) : undefined
  const wallObj = selectedObj && isWallObject(selectedObj) ? selectedObj : null
  const doorObj = selectedObj && isDoorObject(selectedObj) ? selectedObj : null
  const winObj = selectedObj && isWindowObject(selectedObj) ? selectedObj : null
  const openingObj = doorObj ?? winObj
  const openingType = openingObj ? resolveCatalogType(project, openingObj.object_type, openingObj.module_data.type_id ?? openingObj.module_data.mark) : undefined
  const openingParameterFields = openingObj && openingType
    ? (CATALOG_PARAMETER_FIELDS[openingObj.object_type] ?? []).filter(field => openingType.parameters[field] !== undefined)
    : []
  const slabObj = selectedObj?.object_type === 'structure.slab' ? selectedObj : null
  const architectureSurfaceObj = selectedObj && (selectedObj.object_type === 'architecture.floor' || selectedObj.object_type === 'architecture.ceiling') ? selectedObj : null
  const roomObj = selectedObj?.object_type === 'architecture.room' ? selectedObj : null
  const roomData = roomObj?.module_data as Record<string, unknown> | undefined
  const roomBoundaryOpen = roomData?.boundary_status === 'unclosed'
  const roomAreaLabel = formatRoomAreaM2(roomData?.area_mm2, roomData?.boundary_status)
  const roomLastKnownAreaLabel = roomBoundaryOpen ? formatRoomAreaM2(roomData?.area_mm2, 'closed') : roomAreaLabel
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

  const openingInstanceEditor = openingObj && openingType ? (
    <details style={{ border: '1px solid #e5edf5', borderRadius: 6, padding: '8px 9px', background: '#fbfdff' }}>
      <summary style={{ cursor: 'pointer', color: '#40566e', fontSize: 11, fontWeight: 700 }}>
        พารามิเตอร์รายชิ้น · {Object.keys(openingObj.module_data.instance_overrides ?? {}).length} ค่า override
      </summary>
      <div style={{ display: 'grid', gap: 8, marginTop: 9 }}>
        {openingParameterFields.map(field => {
          const overrides = openingObj.module_data.instance_overrides ?? {}
          const isOverridden = Object.hasOwn(overrides, field)
          const value = isOverridden ? overrides[field] : (openingObj.module_data as unknown as Record<string, unknown>)[field] ?? openingType.parameters[field]
          return <div key={field} style={{ padding: 7, border: '1px solid #e8eef5', borderRadius: 5, background: '#fff' }}>
            <CatalogField
              name={field}
              value={value}
              displayUnit={displayUnit}
              onChange={next => onUpdateOpeningInstanceParameters?.(openingObj.id, { [field]: next })}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: 10, color: isOverridden ? '#a65b00' : '#64748b' }}>{isOverridden ? 'กำหนดเฉพาะชิ้นนี้' : `สืบทอดจาก ${openingType.name}`}</span>
              {isOverridden && <button type="button" className="cf-button cf-button-quiet" onClick={() => onUpdateOpeningInstanceParameters?.(openingObj.id, { [field]: null })}>คืนค่าตามชนิด</button>}
            </div>
          </div>
        })}
      </div>
    </details>
  ) : null

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
  const doorShape = doorObj ? buildOpeningRepresentationShapeFromObject(project, doorObj) : undefined
  const winShape = winObj ? buildOpeningRepresentationShapeFromObject(project, winObj) : undefined
  const verticalSelectStyle: React.CSSProperties = { width: '100%', background: '#fff', border: '1px solid #dce4ed', borderRadius: 5, padding: 7, color: '#24364b' }

  if (selectedObjects.length > 1) {
    const familyLabels: Record<string, string> = {
      'structure.beam': 'คาน', 'structure.column': 'เสา', 'structure.foundation': 'ฐานราก',
      'architecture.wall': 'ผนัง', 'door_window.door': 'ประตู', 'door_window.window': 'หน้าต่าง',
    }
    const typeLabel = selectedObjectFamily ? familyLabels[selectedObjectFamily] ?? selectedObjectFamily : ''
    return <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ borderBottom: '1px solid #dce4ed', paddingBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#24364b' }}>เลือก {selectedObjects.length} ชิ้น</div>
        <div style={{ fontSize: 11, color: '#53657b', marginTop: 4 }}>
          {selectedObjectFamily ? `ชนิดวัตถุเดียวกัน · ${typeLabel}` : 'มีวัตถุต่างชนิดกัน · เลือกลบพร้อมกันได้ แต่เปลี่ยน Type พร้อมกันไม่ได้'}
        </div>
        {selectedObjectFamily && <div style={{ fontSize: 11, color: '#53657b', marginTop: 3 }}>กด Shift ค้างแล้วคลิกเพิ่ม หรือลากกรอบครอบวัตถุที่ต้องการ</div>}
      </div>
      {selectedObjectFamily && selectedFamilyTypes.length > 0 && <label style={{ display: 'grid', gap: 5, fontSize: 11, color: '#52677d', fontWeight: 600 }}>
        เปลี่ยน Type/Mark ให้ทั้ง {selectedObjects.length} ชิ้น
        <select aria-label="เปลี่ยน Type ให้หลายวัตถุ" value={selectedCommonTypeId} onChange={event => {
          if (event.target.value) onAssignTypeMany?.(selectedObjects.map(object => object.id), event.target.value)
        }} style={{ width: '100%', background: '#fff', border: '1px solid #dce4ed', borderRadius: 5, padding: 8, color: '#24364b' }}>
          <option value="">เลือก Type{selectedCommonTypeId ? '' : ' (หลายค่า)'}</option>
          {selectedFamilyTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
        </select>
      </label>}
      <button type="button" className="cf-button" onClick={() => onDeleteObjects?.(selectedObjects.map(object => object.id))} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, color: '#dc2626', borderColor: '#fecaca', background: '#fff7f7' }}>
        <Trash2 size={14} /> ลบที่เลือก {selectedObjects.length} ชิ้น
      </button>
    </div>
  }

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
            <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>หน้าตัด ({displayUnit})</label>
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
            <span>{colObj.module_data.section_mm.map(value => formatLengthMm(value, displayUnit)).join(' × ')} {displayUnit}</span>
            <span style={{ fontSize: 10, color: '#53657b', fontWeight: 500 }}>Type {colObj.module_data.mark}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#52677d' }}>
            <span>ตำแหน่ง:</span>
            <span style={{ fontFamily: 'monospace' }}>
              ({formatLengthMm(colObj.module_data.location_mm[0], displayUnit)} {displayUnit}, {formatLengthMm(colObj.module_data.location_mm[1], displayUnit)} {displayUnit})
            </span>
          </div>
          <section style={{ display: 'grid', gap: 7, padding: 9, background: '#f5f8fc', border: '1px solid #e5edf5', borderRadius: 6 }}>
            <strong style={{ fontSize: 11, color: '#40566e' }}>ระดับและความสูงเสา</strong>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>ระดับฐาน
                <select aria-label="ระดับฐานเสา" value={colObj.module_data.base_level_id} onChange={event => {
                  const baseLevelId = event.target.value
                  const base = project.levels.find(level => level.id === baseLevelId)
                  const next = base ? [...project.levels].filter(level => level.elevation_mm > base.elevation_mm).sort((a, b) => a.elevation_mm - b.elevation_mm)[0] : undefined
                  onUpdateColumnVerticalReference(colObj.id, { base_level_id: baseLevelId, top_level_id: next?.id ?? null })
                }} style={verticalSelectStyle}>
                  {project.levels.map(level => <option key={level.id} value={level.id}>{level.name} · +{formatLengthMm(level.elevation_mm, displayUnit)} {displayUnit}</option>)}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>ระดับยอด
                <select aria-label="ระดับยอดเสา" value={colObj.module_data.top_level_id ?? (() => {
                  const base = project.levels.find(level => level.id === colObj.module_data.base_level_id)
                  return base ? [...project.levels].filter(level => level.elevation_mm > base.elevation_mm).sort((a, b) => a.elevation_mm - b.elevation_mm)[0]?.id ?? '' : ''
                })()} onChange={event => onUpdateColumnVerticalReference(colObj.id, { top_level_id: event.target.value || null })} style={verticalSelectStyle}>
                  <option value="">ใช้ระดับถัดไป / สำรองเดิม</option>
                  {project.levels.filter(level => level.elevation_mm > (project.levels.find(item => item.id === colObj.module_data.base_level_id)?.elevation_mm ?? -Infinity)).map(level => <option key={level.id} value={level.id}>{level.name} · +{formatLengthMm(level.elevation_mm, displayUnit)} {displayUnit}</option>)}
                </select>
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>เยื้องฐาน ({displayUnit})<LengthInput aria-label="ระยะเยื้องฐานเสา" value={colObj.module_data.base_offset_mm ?? 0} unit={displayUnit} onChange={value => onUpdateColumnVerticalReference(colObj.id, { base_offset_mm: value })} style={verticalSelectStyle} /></label>
              <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>เยื้องยอด ({displayUnit})<LengthInput aria-label="ระยะเยื้องยอดเสา" value={colObj.module_data.top_offset_mm ?? 0} unit={displayUnit} onChange={value => onUpdateColumnVerticalReference(colObj.id, { top_offset_mm: value })} style={verticalSelectStyle} /></label>
            </div>
            <span style={{ fontSize: 10, color: '#52677d' }}>สูง {formatLengthMm(columnVertical?.height_mm ?? 0, displayUnit)} {displayUnit} · +{formatLengthMm(columnVertical?.base_elevation_mm ?? 0, displayUnit)} ถึง +{formatLengthMm(columnVertical?.top_elevation_mm ?? 0, displayUnit)} {displayUnit}</span>
          </section>
        </div>
      )}

      {/* Footing Dimensions */}
      {fndObj && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>ขนาด ({displayUnit})</label>
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
            <span>{fndObj.module_data.size_mm.map(value => formatLengthMm(value, displayUnit)).join(' × ')} {displayUnit}</span>
            <span style={{ fontSize: 10, color: '#53657b', fontWeight: 500 }}>Type {fndObj.module_data.mark}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#52677d' }}>
            <span>Center:</span>
            <span style={{ fontFamily: 'monospace' }}>
              ({formatLengthMm(fndObj.module_data.center_mm[0], displayUnit)} {displayUnit}, {formatLengthMm(fndObj.module_data.center_mm[1], displayUnit)} {displayUnit})
            </span>
          </div>
        </div>
      )}

      {/* Beam Dimensions & Span */}
      {beamObj && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>หน้าตัด ({displayUnit})</label>
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
              <span>{beamObj.module_data.section_mm.map(value => formatLengthMm(value, displayUnit)).join(' × ')} {displayUnit}</span>
              <span style={{ fontSize: 10, color: '#53657b', fontWeight: 500 }}>Type {beamObj.module_data.mark}</span>
            </div>
          </div>

          <section style={{ display: 'grid', gap: 7, padding: 9, background: '#f5f8fc', border: '1px solid #e5edf5', borderRadius: 6 }}>
            <strong style={{ fontSize: 11, color: '#40566e' }}>ระดับวางคาน</strong>
            <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>อ้างอิงระดับ
              <select aria-label="ระดับอ้างอิงคาน" value={beamObj.module_data.level_id} onChange={event => onUpdateBeamVerticalReference(beamObj.id, { level_id: event.target.value })} style={verticalSelectStyle}>
                {project.levels.map(level => <option key={level.id} value={level.id}>{level.name} · {level.elevation_mm === 0 ? '±0' : `${level.elevation_mm > 0 ? '+' : ''}${formatLengthMm(level.elevation_mm, displayUnit)}`} {displayUnit}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>ระยะวางคานจากระดับ ({displayUnit})
              <LengthInput aria-label="ระยะเยื้องคานจากระดับ" value={beamObj.module_data.base_offset_mm ?? 0} unit={displayUnit} onChange={value => onUpdateBeamVerticalReference(beamObj.id, { base_offset_mm: value })} style={verticalSelectStyle} />
            </label>
            <span style={{ fontSize: 10, color: '#52677d' }}>ท้องคาน +{formatLengthMm((beamBaseElevation ?? 0) - Number(beamObj.module_data.drop_mm ?? 0), displayUnit)} {displayUnit} · หลังคาน +{formatLengthMm((beamBaseElevation ?? 0) + beamObj.module_data.section_mm[1] - Number(beamObj.module_data.drop_mm ?? 0), displayUnit)} {displayUnit}</span>
          </section>

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
              <span>{formatLengthMm(beamObj.module_data.span_mm, displayUnit)} {displayUnit}</span>
              <span style={{ fontSize: 11, color: '#52677d', fontFamily: 'monospace' }}>
                {formatLengthMm(beamObj.module_data.span_mm, displayUnit)} {displayUnit}
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
              <span>{formatLengthMm(wallObj.module_data.thickness_mm, displayUnit)} {displayUnit} · แกน/โครง {formatLengthMm(wallMasonryThickness, displayUnit)} · ผิว {formatLengthMm(wallInsidePlaster, displayUnit)}/{formatLengthMm(wallOutsidePlaster, displayUnit)} · สูง {formatLengthMm(wallVertical?.height_mm ?? wallObj.module_data.height_mm, displayUnit)}</span>
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
                {project.levels.filter(level => level.elevation_mm > (project.levels.find(item => item.id === wallObj.module_data.level_id)?.elevation_mm ?? 0)).map(level => <option key={level.id} value={level.id}>{level.name} · +{formatLengthMm(level.elevation_mm, displayUnit)} {displayUnit}</option>)}
              </select>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>ยกจากพื้น ({displayUnit})<LengthInput aria-label="ระยะยกฐานผนัง" value={wallObj.module_data.base_offset_mm ?? 0} unit={displayUnit} onChange={value => onUpdateWallFace(wallObj.id, { base_offset_mm: value })} style={verticalSelectStyle} /></label>
              <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>ลดจากระดับบน ({displayUnit})<LengthInput aria-label="ระยะลดขอบบนผนัง" value={wallObj.module_data.top_offset_mm ?? 0} unit={displayUnit} disabled={!wallObj.module_data.top_level_id} onChange={value => onUpdateWallFace(wallObj.id, { top_offset_mm: value })} style={verticalSelectStyle} /></label>
            </div>
            {!wallObj.module_data.top_level_id && <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>ความสูงผนัง ({displayUnit})<LengthInput aria-label="ความสูงผนัง" value={wallObj.module_data.height_mm} unit={displayUnit} onChange={value => onUpdateWallFace(wallObj.id, { vertical_constraint: 'fixed_height', height_mm: value })} style={verticalSelectStyle} /></label>}
          </section>

          <div style={{ fontSize: 10, color: '#667b91' }}>กำหนดรหัสและวัสดุผิวแยกสองฝั่งของผนัง เช่น W1/W2 ทั้งสองฝั่งอาจเป็นผิวภายในอาคารได้</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#52677d', fontWeight: 600 }}>
              ผิวด้าน A
              <span style={{ fontWeight: 500 }}><input type="checkbox" checked={wallInsidePlaster > 0} onChange={e => onUpdateWallFace(wallObj.id, { plaster_inside_thickness_mm: e.target.checked ? 15 : 0 })} /> เปิดชั้นผิว</span>
              <input aria-label="รหัสผิวด้าน A" list="cf-wall-marks" value={wallFaceField('inside_finish_mark', wallObj.module_data.mark)} onChange={e => onUpdateWallFace(wallObj.id, { inside_finish_mark: e.target.value })} placeholder="เช่น W1" style={{ width: '100%', background: '#fff', border: '1px solid #dce4ed', borderRadius: 5, padding: 7, color: '#24364b' }} />
              <select aria-label="วัสดุผิวด้าน A" value={neutralWallFaceMaterial(wallFaceField('plaster_inside_material', 'cement_plaster'))} onChange={e => onUpdateWallFace(wallObj.id, { plaster_inside_material: e.target.value })} style={{ width: '100%', background: '#fff', border: '1px solid #dce4ed', borderRadius: 5, padding: 7, color: '#24364b' }}>
                {wallFaceMaterialOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <LengthInput aria-label={`ความหนาผิวด้าน A (${displayUnit})`} disabled={wallInsidePlaster <= 0} value={wallInsidePlaster} unit={displayUnit} onChange={value => onUpdateWallFace(wallObj.id, { plaster_inside_thickness_mm: value })} style={{ width: '100%', background: '#fff', border: '1px solid #dce4ed', borderRadius: 5, padding: 7, color: '#24364b' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#52677d', fontWeight: 600 }}>
              ผิวด้าน B
              <span style={{ fontWeight: 500 }}><input type="checkbox" checked={wallOutsidePlaster > 0} onChange={e => onUpdateWallFace(wallObj.id, { plaster_outside_thickness_mm: e.target.checked ? 15 : 0 })} /> เปิดชั้นผิว</span>
              <input aria-label="รหัสผิวด้าน B" list="cf-wall-marks" value={wallFaceField('outside_finish_mark', wallObj.module_data.mark)} onChange={e => onUpdateWallFace(wallObj.id, { outside_finish_mark: e.target.value })} placeholder="เช่น W2" style={{ width: '100%', background: '#fff', border: '1px solid #dce4ed', borderRadius: 5, padding: 7, color: '#24364b' }} />
              <select aria-label="วัสดุผิวด้าน B" value={neutralWallFaceMaterial(wallFaceField('plaster_outside_material', 'cement_plaster'))} onChange={e => onUpdateWallFace(wallObj.id, { plaster_outside_material: e.target.value })} style={{ width: '100%', background: '#fff', border: '1px solid #dce4ed', borderRadius: 5, padding: 7, color: '#24364b' }}>
                {wallFaceMaterialOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <LengthInput aria-label={`ความหนาผิวด้าน B (${displayUnit})`} disabled={wallOutsidePlaster <= 0} value={wallOutsidePlaster} unit={displayUnit} onChange={value => onUpdateWallFace(wallObj.id, { plaster_outside_thickness_mm: value })} style={{ width: '100%', background: '#fff', border: '1px solid #dce4ed', borderRadius: 5, padding: 7, color: '#24364b' }} />
            </label>
          </div>
          <datalist id="cf-wall-marks">{wallPresets.map(mark => <option key={mark} value={mark} />)}</datalist>
          <button type="button" className="cf-button cf-button-quiet" onClick={() => onUpdateWallFace(wallObj.id, { interior_side: wallObj.module_data.interior_side === 'right' ? 'left' : 'right' })}>
            สลับด้าน A/B · ด้าน A อยู่ฝั่ง{(wallObj.module_data.interior_side ?? 'left') === 'left' ? 'ซ้าย' : 'ขวา'} ของแนวเริ่ม→จบ
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
              <span>{formatLengthMm(wallObj.module_data.length_mm, displayUnit)} {displayUnit}</span>
              <span style={{ fontSize: 11, color: '#52677d', fontFamily: 'monospace' }}>
                {formatLengthMm(wallObj.module_data.length_mm, displayUnit)} {displayUnit}
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
        </div>
      )}

      {/* Door Properties */}
      {doorObj && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>ขนาด ({displayUnit})</label>
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
              <span>{formatLengthMm(doorObj.module_data.width_mm, displayUnit)} × {formatLengthMm(doorObj.module_data.height_mm, displayUnit)} {displayUnit}</span>
              <span style={{ fontSize: 10, color: '#53657b', fontWeight: 500 }}>Type {doorObj.module_data.mark}</span>
            </div>
          </div>

          {openingInstanceEditor}
          {doorShape && <OpeningElevationThumbnail shape={doorShape} />}

          <section style={{ display: 'grid', gap: 7, padding: 9, background: '#f5f8fc', border: '1px solid #e5edf5', borderRadius: 6 }}>
            <strong style={{ fontSize: 11, color: '#40566e' }}>ระดับประตู</strong>
            <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>ธรณี/ยกจากพื้น ({displayUnit})<LengthInput aria-label="ระดับธรณีประตู" value={doorObj.module_data.sill_height_mm ?? 0} unit={displayUnit} onChange={value => onUpdateOpeningVertical(doorObj.id, { sill_height_mm: value })} style={verticalSelectStyle} /></label>
            <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>หัวประตูจบที่ระดับ
              <select aria-label="ระดับหัวประตู" value={doorObj.module_data.head_level_id ?? ''} onChange={e => e.target.value
                ? onUpdateOpeningVertical(doorObj.id, { head_level_id: e.target.value, head_offset_mm: 0 })
                : onUpdateOpeningVertical(doorObj.id, { head_level_id: undefined, vertical_constraint: 'fixed_height', height_mm: doorVertical?.height_mm ?? doorObj.module_data.height_mm })} style={verticalSelectStyle}>
                <option value="">กำหนดความสูงบานเอง</option>
                {project.levels.filter(level => level.elevation_mm > (project.levels.find(item => item.id === doorObj.module_data.level_id)?.elevation_mm ?? 0)).map(level => <option key={level.id} value={level.id}>{level.name} · +{formatLengthMm(level.elevation_mm, displayUnit)} {displayUnit}</option>)}
              </select>
            </label>
            {doorObj.module_data.head_level_id ? <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>ระยะหัวประตูจากระดับ ({displayUnit})<LengthInput aria-label="ระยะหัวประตูจากระดับ" value={doorObj.module_data.head_offset_mm ?? 0} unit={displayUnit} onChange={value => onUpdateOpeningVertical(doorObj.id, { head_offset_mm: value })} style={verticalSelectStyle} /></label> : <div style={{ fontSize: 10, color: '#52677d' }}>ความสูงช่อง {formatLengthMm(doorVertical?.height_mm ?? doorObj.module_data.height_mm, displayUnit)} {displayUnit}</div>}
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
            <span style={{ fontFamily: 'monospace' }}>{formatLengthMm(doorObj.module_data.offset_along_wall_mm, displayUnit)} {displayUnit}</span>
          </div>
        </div>
      )}

      {/* Window Properties */}
      {winObj && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>ขนาด ({displayUnit})</label>
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
              <span>{formatLengthMm(winObj.module_data.width_mm, displayUnit)} × {formatLengthMm(winObj.module_data.height_mm, displayUnit)} {displayUnit}</span>
              <span style={{ fontSize: 10, color: '#53657b', fontWeight: 500 }}>Type {winObj.module_data.mark}</span>
            </div>
          </div>

          {openingInstanceEditor}
          {winShape && <OpeningElevationThumbnail shape={winShape} />}

          <section style={{ display: 'grid', gap: 7, padding: 9, background: '#f5f8fc', border: '1px solid #e5edf5', borderRadius: 6 }}>
            <strong style={{ fontSize: 11, color: '#40566e' }}>ระดับหน้าต่าง</strong>
            <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>ธรณีหน้าต่างจากพื้น ({displayUnit})<LengthInput aria-label="ระดับธรณีหน้าต่าง" value={winObj.module_data.sill_height_mm} unit={displayUnit} onChange={value => onUpdateOpeningVertical(winObj.id, { sill_height_mm: value })} style={verticalSelectStyle} /></label>
            <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>หัวหน้าต่างจบที่ระดับ
              <select aria-label="ระดับหัวหน้าต่าง" value={winObj.module_data.head_level_id ?? ''} onChange={e => e.target.value
                ? onUpdateOpeningVertical(winObj.id, { head_level_id: e.target.value, head_offset_mm: 0 })
                : onUpdateOpeningVertical(winObj.id, { head_level_id: undefined, vertical_constraint: 'fixed_height', height_mm: windowVertical?.height_mm ?? winObj.module_data.height_mm })} style={verticalSelectStyle}>
                <option value="">กำหนดความสูงเอง</option>
                {project.levels.filter(level => level.elevation_mm > (project.levels.find(item => item.id === winObj.module_data.level_id)?.elevation_mm ?? 0)).map(level => <option key={level.id} value={level.id}>{level.name} · +{formatLengthMm(level.elevation_mm, displayUnit)} {displayUnit}</option>)}
              </select>
            </label>
            {winObj.module_data.head_level_id ? <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>ระยะหัวหน้าต่างจากระดับ ({displayUnit})<LengthInput aria-label="ระยะหัวหน้าต่างจากระดับ" value={winObj.module_data.head_offset_mm ?? 0} unit={displayUnit} onChange={value => onUpdateOpeningVertical(winObj.id, { head_offset_mm: value })} style={verticalSelectStyle} /></label> : <div style={{ fontSize: 10, color: '#52677d' }}>ความสูงช่อง {formatLengthMm(windowVertical?.height_mm ?? winObj.module_data.height_mm, displayUnit)} {displayUnit}</div>}
          </section>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#52677d' }}>
            <span>Sill Height:</span>
            <span style={{ fontFamily: 'monospace' }}>{formatLengthMm(winObj.module_data.sill_height_mm, displayUnit)} {displayUnit}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#52677d' }}>
            <span>Offset along wall:</span>
            <span style={{ fontFamily: 'monospace' }}>{formatLengthMm(winObj.module_data.offset_along_wall_mm, displayUnit)} {displayUnit}</span>
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
            {grdObj.module_data.start_point_mm && grdObj.module_data.end_point_mm
              ? <>แนวอ้างอิงจาก {grdObj.module_data.start_point_mm.map(value => formatLengthMm(value, displayUnit)).join(', ')} ถึง {grdObj.module_data.end_point_mm.map(value => formatLengthMm(value, displayUnit)).join(', ')} {displayUnit}</>
              : <>{grdObj.module_data.orientation === 'vertical' ? 'X = ' : 'Y = '}<b>{formatLengthMm(grdObj.module_data.position_mm, displayUnit)} {displayUnit}</b></>}
          </div>
          {grdObj.module_data.system_id && (() => {
            const members = Object.values(project.objects).filter(isGridObject).filter(object => object.module_data.system_id === grdObj.module_data.system_id).sort((a, b) => (a.module_data.system_index ?? 0) - (b.module_data.system_index ?? 0))
            const positions = members.map(member => member.module_data.position_mm)
            return <section key={`${grdObj.module_data.system_id}:${selectedId}`} style={{ display: 'grid', gap: 7, marginTop: 7, padding: 9, background: '#f5f8fc', border: '1px solid #e5edf5', borderRadius: 6 }}>
            <strong style={{ fontSize: 12 }}>ระบบ Grid Line · {members.length} เส้น</strong>
            <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>ตำแหน่งทุกเส้น ({displayUnit} คั่นด้วยจุลภาค)
              <input aria-label={`ตำแหน่งทุกเส้นในระบบกริด (${displayUnit})`} defaultValue={positions.map(value => formatLengthMm(value, displayUnit)).join(', ')} onBlur={event => {
                const tokens = event.target.value.split(/[\s,;]+/).filter(value => value.trim() !== '')
                const values = tokens.map(value => parseLengthMm(value.trim(), displayUnit))
                if (values.length && values.length <= 100 && values.every(value => value !== null && Number.isFinite(value)) && values.every((value, index) => index === 0 || value! > values[index - 1]!)) onUpdateGridSystem(grdObj.module_data.system_id!, { positions_mm: values as number[] })
              }} style={verticalSelectStyle} />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>ป้ายเส้นแรก
              <input aria-label="ป้ายกริดเส้นแรกในชุด" defaultValue={grdObj.module_data.system_first_tag ?? grdObj.module_data.tag} onBlur={event => {
                const value = event.target.value.trim(); if (value) onUpdateGridSystem(grdObj.module_data.system_id!, { first_tag: value })
              }} style={verticalSelectStyle} />
            </label>
            <small style={{ fontSize: 10, color: '#64748b' }}>แก้ชุดระยะและป้ายได้จากเส้นใดก็ได้ในระบบ</small>
          </section>
          })()}
          {!grdObj.module_data.system_id && (() => {
            const data = grdObj.module_data
            const start: [number, number] = data.start_point_mm ?? (data.orientation === 'vertical' ? [data.position_mm, data.extent_mm[0]] : [data.extent_mm[0], data.position_mm])
            const end: [number, number] = data.end_point_mm ?? (data.orientation === 'vertical' ? [data.position_mm, data.extent_mm[1]] : [data.extent_mm[1], data.position_mm])
            const angle = Math.atan2(start[1] - end[1], end[0] - start[0]) * 180 / Math.PI
            const rotateTo = (degrees: number) => {
              if (!Number.isFinite(degrees)) return
              const midpoint: [number, number] = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]
              const length = Math.hypot(end[0] - start[0], end[1] - start[1])
              const radians = degrees * Math.PI / 180, dx = Math.cos(radians) * length / 2, dy = Math.sin(radians) * length / 2
              onModifyGrid(grdObj.id, { start_point_mm: [midpoint[0] - dx, midpoint[1] + dy], end_point_mm: [midpoint[0] + dx, midpoint[1] - dy] })
            }
            return <section style={{ display: 'grid', gap: 8, marginTop: 7, padding: 9, background: '#f5f8fc', border: '1px solid #e5edf5', borderRadius: 6 }}>
              <strong style={{ fontSize: 12 }}>เส้นกริดอ้างอิง</strong>
              <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>มุมเอียง (องศา)
                <input aria-label="มุมเอียงเส้นกริดองศา" aria-describedby="grid-angle-key-help" type="number" step="0.1" defaultValue={Number(angle.toFixed(1))} key={`${grdObj.id}:${Math.round(angle * 10) / 10}`} onFocus={event => event.currentTarget.select()} onKeyDown={event => {
                  if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() }
                  if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.value = angle.toFixed(1); event.currentTarget.blur() }
                }} onBlur={event => rotateTo(Number(event.target.value))} style={verticalSelectStyle} />
                <small id="grid-angle-key-help" style={{ fontSize: 10, color: '#64748b' }}>0° ไปทางขวา · 90° ขึ้น · Enter บันทึก · Esc คืนค่าเดิม</small>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: '#52677d' }}><input type="checkbox" checked={data.bubble_visible !== false} onChange={event => onModifyGrid(grdObj.id, { bubble_visible: event.target.checked })} />แสดง Bubble</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: '#52677d' }}><input type="checkbox" checked={data.auto_tag !== false} onChange={event => onModifyGrid(grdObj.id, { auto_tag: event.target.checked })} />รันป้ายอัตโนมัติ</label>
              {data.auto_tag === false && <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>ป้ายกำกับ
                <input aria-label="ป้ายกำกับกริด" defaultValue={data.tag} onBlur={event => { if (event.target.value.trim()) onUpdateGridTag(grdObj.id, event.target.value) }} style={verticalSelectStyle} />
              </label>}
              <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>รูปแบบเลข/ตัวอักษร
                <select aria-label="รูปแบบลำดับป้ายกริด" value={data.sequence_style ?? 'auto'} onChange={event => onModifyGrid(grdObj.id, { sequence_style: event.target.value as 'auto' | 'alpha' | 'numeric' })} style={verticalSelectStyle}>
                  <option value="auto">อัตโนมัติ (ตั้ง A / นอน 1)</option><option value="alpha">ตัวอักษร A, B, C</option><option value="numeric">ตัวเลข 1, 2, 3</option>
                </select>
              </label>
              <small style={{ fontSize: 10, color: '#64748b' }}>เส้นที่ปิด Bubble จะไม่ถูกนับในลำดับอัตโนมัติ · ลากเส้นบนแปลนเพื่อย้าย</small>
            </section>
          })()}
        </div>
      )}

      {slabObj && (
        (() => {
          const slabData = slabObj.module_data as Record<string, unknown>
          return <section style={{ display: 'grid', gap: 8, padding: 10, border: '1px solid #dbe3ed', borderRadius: 8 }}>
            <strong style={{ fontSize: 12 }}>พื้น {String(slabData.mark ?? '')}</strong>
            <span style={{ fontSize: 11, color: '#52677d' }}>
              ระดับ {project.levels.find(level => level.id === slabData.level_id)?.name ?? String(slabData.level_id ?? '')} · หนา {formatLengthMm(Number(slabData.thickness_mm ?? 0), displayUnit)} {displayUnit} · ช่องเจาะ {Array.isArray(slabData.voids_mm) ? slabData.voids_mm.length : 0} ช่อง
            </span>
            <button type="button" onClick={() => onDrawSurfaceVoid(slabObj.id)} style={verticalSelectStyle}>วาดช่องเจาะพื้น</button>
          </section>
        })()
      )}
      {architectureSurfaceObj && (() => {
        const isFloor = architectureSurfaceObj.object_type === 'architecture.floor'
        const data = architectureSurfaceObj.module_data as Record<string, unknown>
        const levelId = typeof data.level_id === 'string' ? data.level_id : project.project.active_level_id
        const level = project.levels.find(item => item.id === levelId)
        const resolvedElevation = resolveArchitectureSurfaceElevation(project, architectureSurfaceObj)
        const offset = resolvedElevation !== undefined && level ? resolvedElevation - level.elevation_mm : Number(data.elevation_offset_mm ?? 0)
        const layers = Array.isArray(data.finish_layers) ? data.finish_layers as Array<{ material?: string; thickness_mm?: number; mark?: string; quantity_unit?: 'm2' | 'm3' }> : []
        const update = (changes: Parameters<NonNullable<typeof onUpdateArchitectureSurface>>[1]) => onUpdateArchitectureSurface?.(architectureSurfaceObj.id, changes)
        return <section style={{ display: 'grid', gap: 8, padding: 10, border: '1px solid #dbe3ed', borderRadius: 8 }}>
          <strong style={{ fontSize: 12 }}>{isFloor ? 'พื้นสถาปัตย์' : 'ฝ้าเพดาน'} {String(data.mark ?? '')}</strong>
          <button type="button" onClick={onOpenTypeManager} style={verticalSelectStyle}>{data.type_id ? 'เลือก / แก้ไขชนิดในคลัง' : 'เลือกชนิดจากคลัง'}</button>
          <button type="button" onClick={() => onDrawSurfaceVoid(architectureSurfaceObj.id)} style={verticalSelectStyle}>{isFloor ? 'วาดช่องเจาะพื้นสถาปัตย์' : 'วาดช่องเจาะฝ้า'}</button>
          <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>อ้างอิงระดับชั้น
            <select aria-label="ระดับอ้างอิงพื้นหรือฝ้า" value={levelId} disabled={!onUpdateArchitectureSurface || (data.follows_room_boundary === true && typeof data.room_id === 'string')} onChange={event => update({ level_id: event.target.value })} style={verticalSelectStyle}>
              {project.levels.map(item => <option key={item.id} value={item.id}>{item.name} · {(item.elevation_mm / 1000).toFixed(3)} m</option>)}
            </select>
            {data.follows_room_boundary === true && typeof data.room_id === 'string' && <small>ระดับตามห้องที่ผูกอยู่</small>}
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>เยื้องจากระดับชั้น ({displayUnit})
            <LengthInput aria-label={`ระยะเยื้องพื้นหรือฝ้า (${displayUnit})`} value={offset} unit={displayUnit} onChange={value => update({ elevation_offset_mm: value })} style={verticalSelectStyle} />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>ความหนา ({displayUnit})
            <LengthInput aria-label={`ความหนาพื้นหรือฝ้า (${displayUnit})`} value={Number(data.thickness_mm ?? 0)} unit={displayUnit} onChange={value => update({ thickness_mm: value })} style={verticalSelectStyle} />
          </label>
          {!isFloor && <>
            <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>วัสดุฝ้า
              <input aria-label="วัสดุฝ้า" defaultValue={String(data.material ?? '')} key={`${architectureSurfaceObj.id}:${String(data.material ?? '')}`} onBlur={event => { const value = event.currentTarget.value.trim(); if (value) update({ material: value }) }} style={verticalSelectStyle} />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>กริด X ({displayUnit})
                <LengthInput aria-label={`ระยะกริดฝ้า X (${displayUnit})`} value={Number((data.grid_mm as number[] | undefined)?.[0] ?? 600)} unit={displayUnit} onChange={value => update({ grid_mm: [value, Number((data.grid_mm as number[] | undefined)?.[1] ?? 600)] })} style={verticalSelectStyle} />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>กริด Y ({displayUnit})
                <LengthInput aria-label={`ระยะกริดฝ้า Y (${displayUnit})`} value={Number((data.grid_mm as number[] | undefined)?.[1] ?? 600)} unit={displayUnit} onChange={value => update({ grid_mm: [Number((data.grid_mm as number[] | undefined)?.[0] ?? 600), value] })} style={verticalSelectStyle} />
              </label>
            </div>
          </>}
          {isFloor && <>
            <strong style={{ fontSize: 11, marginTop: 3 }}>ชั้นวัสดุปูพื้น</strong>
            {layers.map((layer, index) => <div key={`${architectureSurfaceObj.id}:layer:${index}`} style={{ display: 'grid', gridTemplateColumns: '1fr 0.65fr 0.55fr auto', gap: 5, alignItems: 'center' }}>
              <input aria-label={`วัสดุชั้นพื้น ${index + 1}`} defaultValue={String(layer.material ?? '')} key={`${architectureSurfaceObj.id}:layer-material:${index}:${String(layer.material ?? '')}`} onBlur={event => {
                const finish_layers = layers.map((current, i) => i === index ? { ...current, material: event.currentTarget.value.trim() || 'unspecified' } : current)
                update({ finish_layers: finish_layers.map(current => ({ material: String(current.material ?? 'unspecified'), thickness_mm: Number(current.thickness_mm ?? 0), ...(current.mark ? { mark: current.mark } : {}), ...(current.quantity_unit ? { quantity_unit: current.quantity_unit } : {}) })) })
              }} style={verticalSelectStyle} />
              <LengthInput aria-label={`ความหนาชั้นพื้น ${index + 1} (${displayUnit})`} value={Number(layer.thickness_mm ?? 0)} unit={displayUnit} onChange={value => {
                const finish_layers = layers.map((current, i) => i === index ? { ...current, thickness_mm: value } : current)
                update({ finish_layers: finish_layers.map(current => ({ material: String(current.material ?? 'unspecified'), thickness_mm: Number(current.thickness_mm ?? 0), ...(current.mark ? { mark: current.mark } : {}), ...(current.quantity_unit ? { quantity_unit: current.quantity_unit } : {}) })) })
              }} style={verticalSelectStyle} />
              <select aria-label={`หน่วยถอดปริมาณชั้นพื้น ${index + 1}`} value={layer.quantity_unit ?? 'm2'} onChange={event => {
                const finish_layers = layers.map((current, i) => i === index ? { ...current, quantity_unit: event.target.value as 'm2' | 'm3' } : current)
                update({ finish_layers: finish_layers.map(current => ({ material: String(current.material ?? 'unspecified'), thickness_mm: Number(current.thickness_mm ?? 0), ...(current.mark ? { mark: current.mark } : {}), ...(current.quantity_unit ? { quantity_unit: current.quantity_unit } : {}) })) })
              }} style={verticalSelectStyle}><option value="m2">ตร.ม.</option><option value="m3">ลบ.ม.</option></select>
              <button type="button" aria-label={`ลบชั้นพื้น ${index + 1}`} onClick={() => update({ finish_layers: layers.filter((_, i) => i !== index).map(current => ({ material: String(current.material ?? 'unspecified'), thickness_mm: Number(current.thickness_mm ?? 0), ...(current.mark ? { mark: current.mark } : {}), ...(current.quantity_unit ? { quantity_unit: current.quantity_unit } : {}) })) })} style={{ ...verticalSelectStyle, color: '#b91c1c', padding: 6 }}>×</button>
            </div>)}
            <button type="button" onClick={() => update({ finish_layers: [...layers, { material: 'tile', thickness_mm: 10, mark: `ชั้น ${layers.length + 1}`, quantity_unit: 'm2' as const }].map(layer => ({ material: String(layer.material ?? 'unspecified'), thickness_mm: Number(layer.thickness_mm ?? 0), ...(layer.mark ? { mark: layer.mark } : {}), ...(layer.quantity_unit === 'm2' || layer.quantity_unit === 'm3' ? { quantity_unit: layer.quantity_unit } : {}) })) })} style={verticalSelectStyle}>+ เพิ่มชั้นวัสดุ</button>
            <strong style={{ fontSize: 11, marginTop: 3 }}>แนวลายปูวัสดุ</strong>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>ขนาด X ({displayUnit})
                <LengthInput aria-label={`ขนาดลายพื้น X (${displayUnit})`} value={Number((data.finish_pattern_mm as number[] | undefined)?.[0] ?? 600)} unit={displayUnit} onChange={value => update({ finish_pattern_mm: [value, Number((data.finish_pattern_mm as number[] | undefined)?.[1] ?? 600)] })} style={verticalSelectStyle} />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>ขนาด Y ({displayUnit})
                <LengthInput aria-label={`ขนาดลายพื้น Y (${displayUnit})`} value={Number((data.finish_pattern_mm as number[] | undefined)?.[1] ?? 600)} unit={displayUnit} onChange={value => update({ finish_pattern_mm: [Number((data.finish_pattern_mm as number[] | undefined)?.[0] ?? 600), value] })} style={verticalSelectStyle} />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>จุดเริ่ม X ({displayUnit})
                <LengthInput aria-label={`จุดเริ่มลายพื้น X (${displayUnit})`} value={Number((data.finish_pattern_origin_mm as number[] | undefined)?.[0] ?? 0)} unit={displayUnit} onChange={value => update({ finish_pattern_origin_mm: [value, Number((data.finish_pattern_origin_mm as number[] | undefined)?.[1] ?? 0)] })} style={verticalSelectStyle} />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>จุดเริ่ม Y ({displayUnit})
                <LengthInput aria-label={`จุดเริ่มลายพื้น Y (${displayUnit})`} value={Number((data.finish_pattern_origin_mm as number[] | undefined)?.[1] ?? 0)} unit={displayUnit} onChange={value => update({ finish_pattern_origin_mm: [Number((data.finish_pattern_origin_mm as number[] | undefined)?.[0] ?? 0), value] })} style={verticalSelectStyle} />
              </label>
            </div>
            <label style={{ display: 'grid', gap: 4, fontSize: 10, color: '#52677d' }}>หมุนแนวลาย (องศา)
              <input aria-label="หมุนแนวลายพื้น องศา" type="number" step="1" value={Number(data.finish_pattern_rotation_deg ?? 0)} onChange={event => update({ finish_pattern_rotation_deg: Number(event.target.value) })} style={verticalSelectStyle} />
            </label>
          </>}
          <small style={{ fontSize: 10, color: '#64748b' }}>ระดับจริง {resolvedElevation === undefined ? 'ไม่ถูกต้อง' : `${formatLengthMm(resolvedElevation, displayUnit)} ${displayUnit}`} · ช่องเจาะ {Array.isArray(data.voids_mm) ? data.voids_mm.length : 0}</small>
        </section>
      })()}
      {roomObj && (() => {
        const ventSummary = evaluateRoomVentilationCompliance(project, roomObj.id)
        const roomVent = ventSummary.rooms[0]

        return (
          <section style={{ display: 'grid', gap: 10, padding: 10, border: '1px solid #dbe3ed', borderRadius: 8, background: '#fafcff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 13, color: '#0f172a' }}>ห้อง {String((roomObj.module_data as Record<string,unknown>).number ?? '')} · {String((roomObj.module_data as Record<string,unknown>).name ?? '')}</strong>
              <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: roomVent?.overall_status === 'pass' ? '#dcfce7' : '#fee2e2', color: roomVent?.overall_status === 'pass' ? '#15803d' : '#b91c1c', fontWeight: 600 }}>
                {roomVent?.overall_status === 'pass' ? 'ผ่านเกณฑ์ ✅' : 'ไม่ผ่านเกณฑ์ ⚠️'}
              </span>
            </div>

            <span style={{ fontSize: 11, color: roomBoundaryOpen ? '#b91c1c' : '#52677d' }}>
              {roomBoundaryOpen ? `วงผนังเปิด · พื้นที่ล่าสุด ${roomLastKnownAreaLabel ?? 'ไม่ระบุ'} ตร.ม. ใช้เป็นค่าปัจจุบันไม่ได้` : `พื้นที่ ${roomAreaLabel ?? 'ไม่ระบุ'} ตร.ม. · ขอบเขตตามผนัง/เส้นแบ่งห้อง`}
            </span>

            {/* Thai Building Code MR55 Natural Light & Ventilation Gauge */}
            {roomVent && (
              <div style={{ display: 'grid', gap: 8, background: '#ffffff', padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>
                  การระบายอากาศและแสงสว่าง (กฎกระทรวง ฉบับที่ 55)
                </div>

                {/* Daylighting */}
                <div style={{ display: 'grid', gap: 3 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: '#475569' }}>☀️ แสงสว่างธรรมชาติ:</span>
                    <strong style={{ color: roomVent.daylight_status === 'pass' ? '#15803d' : '#b91c1c' }}>
                      {roomVent.total_daylight_area_sq_m.toFixed(2)} ตร.ม. ({roomVent.daylight_ratio_percent.toFixed(1)}%)
                    </strong>
                  </div>
                  <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(100, (roomVent.daylight_ratio_percent / 10) * 100)}%`,
                      height: '100%',
                      background: roomVent.daylight_status === 'pass' ? '#22c55e' : '#f59e0b',
                      borderRadius: 3,
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b' }}>
                    <span>เกณฑ์: &ge; {roomVent.required_daylight_percent}% ({((roomVent.floor_area_sq_m * roomVent.required_daylight_percent) / 100).toFixed(2)} ตร.ม.)</span>
                    <span>{roomVent.daylight_status === 'pass' ? '✅ ผ่าน' : '⚠️ ต่ำกว่าเกณฑ์'}</span>
                  </div>
                </div>

                {/* Ventilation */}
                <div style={{ display: 'grid', gap: 3 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: '#475569' }}>💨 ระบายอากาศธรรมชาติ:</span>
                    <strong style={{ color: roomVent.ventilation_status === 'pass' ? '#15803d' : '#b91c1c' }}>
                      {roomVent.total_ventilation_area_sq_m.toFixed(2)} ตร.ม. ({roomVent.ventilation_ratio_percent.toFixed(1)}%)
                    </strong>
                  </div>
                  <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(100, roomVent.room_type === 'bathroom' ? (roomVent.total_ventilation_area_sq_m / 0.2) * 100 : (roomVent.ventilation_ratio_percent / 10) * 100)}%`,
                      height: '100%',
                      background: roomVent.ventilation_status === 'pass' ? '#22c55e' : '#f59e0b',
                      borderRadius: 3,
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b' }}>
                    <span>
                      {roomVent.room_type === 'bathroom'
                        ? 'เกณฑ์ห้องน้ำ: &ge; 0.20 ตร.ม. หรือ 10%'
                        : `เกณฑ์: &ge; ${roomVent.required_ventilation_percent}% (${((roomVent.floor_area_sq_m * roomVent.required_ventilation_percent) / 100).toFixed(2)} ตร.ม.)`}
                    </span>
                    <span>{roomVent.ventilation_status === 'pass' ? '✅ ผ่าน' : '⚠️ ต่ำกว่าเกณฑ์'}</span>
                  </div>
                </div>

                {/* Openings list */}
                {roomVent.exterior_openings.length > 0 ? (
                  <div style={{ fontSize: 10, color: '#64748b', borderTop: '1px solid #f1f5f9', paddingTop: 4 }}>
                    <span style={{ fontWeight: 600 }}>ช่องเปิดสู่ภายนอก ({roomVent.exterior_openings.length} ช่อง):</span>
                    {roomVent.exterior_openings.map((op) => (
                      <div key={op.opening_id} style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                        <span>• {op.mark} ({op.width_m.toFixed(2)}&times;{op.height_m.toFixed(2)} ม.)</span>
                        <span>ระบาย {(op.ventilation_ratio * 100).toFixed(0)}% / แสง {(op.daylight_ratio * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic', borderTop: '1px solid #f1f5f9', paddingTop: 4 }}>
                    ไม่มีช่องเปิดสู่ภายนอกอาคาร
                  </div>
                )}
              </div>
            )}

            <button type="button" disabled={roomBoundaryOpen} title={roomBoundaryOpen ? 'ปิดวงผนังและตรวจพื้นที่ก่อนสร้างพื้นตามห้อง' : undefined} onClick={() => onCreateRoomFinish?.('floor', roomObj.id)} style={verticalSelectStyle}>สร้างพื้นสถาปัตย์ตามห้อง</button>
            <button type="button" disabled={roomBoundaryOpen} title={roomBoundaryOpen ? 'ปิดวงผนังและตรวจพื้นที่ก่อนสร้างฝ้าตามห้อง' : undefined} onClick={() => onCreateRoomFinish?.('ceiling', roomObj.id)} style={verticalSelectStyle}>สร้างฝ้าตามห้อง</button>
          </section>
        )
      })()}

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
                Footing {hostedFoundation.module_data.mark} ({hostedFoundation.module_data.size_mm.map(value => formatLengthMm(value, displayUnit)).join(' × ')} {displayUnit})
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
          type="button"
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
