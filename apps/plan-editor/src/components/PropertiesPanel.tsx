import React, { useState, useEffect } from 'react'
import {
  ProjectDocument,
  DEFAULT_RAINWATER_DESIGN,
  RainwaterDesignSettings,
  SmartObject,
  FoundationModuleData,
  isColumnObject,
  isFoundationObject,
  isGridObject,
  isBeamObject,
  isWallObject,
  isDoorObject,
  isWindowObject,
  Phase,
  RemovalPhase,
  formatLengthMm,
  type DisplayLengthUnit,
  type StairModuleData,
  type RoofModuleData,
  type PipeRouteModuleData,
  type ElectricalFixtureModuleData,
  type CircuitModuleData,
  type CabinetModuleData,
  type MouldingModuleData,
} from '@constructflow/project-model'
import { Trash2, PlusCircle } from 'lucide-react'
import { WorkbenchNumberInput } from './WorkbenchNumberInput.js'
import { StairProperties } from './StairProperties.js'
import { EmptySelectionProperties, MultiSelectionProperties } from './SelectionProperties.js'
import { WallPropertiesSection } from './WallPropertiesSection.js'
import { RoofPropertiesSection } from './RoofPropertiesSection.js'
import { SystemsPropertiesSection } from './SystemsPropertiesSection.js'
import { StructurePropertiesSection } from './StructurePropertiesSection.js'
import { SurfacePropertiesSection } from './SurfacePropertiesSection.js'
import { OpeningPropertiesSection } from './OpeningPropertiesSection.js'
import { RoomPropertiesSection } from './RoomPropertiesSection.js'
import { GridPropertiesSection } from './GridPropertiesSection.js'

const LengthInput: React.FC<{ value: number; unit: DisplayLengthUnit; onChange: (value: number) => void; style?: React.CSSProperties; disabled?: boolean; 'aria-label'?: string }> = ({ value, unit, onChange, style, disabled, 'aria-label': ariaLabel }) => <WorkbenchNumberInput value={value} unit={unit} onChange={onChange} style={style} disabled={disabled} ariaLabel={ariaLabel} />

interface PropertiesPanelProps {
  project: ProjectDocument
  displayUnit: DisplayLengthUnit
  selectedId: string | null
  selectedIds?: string[]
  onAssignType: (objectId: string, typeName: string) => void
  onAssignTypeMany?: (objectIds: string[], typeId: string) => void
  onUpdateLevelMany?: (objectIds: string[], levelId: string) => void
  onDeleteObjects?: (objectIds: string[]) => void
  onUpdateColumnMark: (objectId: string, newMark: string) => void
  onUpdateColumnVerticalReference: (objectId: string, changes: { base_level_id?: string; top_level_id?: string | null; base_offset_mm?: number; top_offset_mm?: number }) => void
  onUpdateBeamVerticalReference: (objectId: string, changes: { level_id?: string; base_offset_mm?: number }) => void
  onUpdateArchitectureSurface?: (objectId: string, changes: { level_id?: string; elevation_offset_mm?: number; thickness_mm?: number; material?: string; finish_layers?: Array<{ material: string; thickness_mm: number; mark?: string; quantity_unit?: 'm2' | 'm3' }>; finish_pattern_mm?: [number, number]; finish_pattern_origin_mm?: [number, number]; finish_pattern_rotation_deg?: number; grid_mm?: [number, number] }) => void
  onUpdateSlab?: (objectId: string, changes: { level_id?: string; elevation_offset_mm?: number; thickness_mm?: number; slab_system?: string; material?: string; slope_ratio?: number; drain_direction_deg?: number; finish_layers?: Array<{ material: string; thickness_mm: number; offset_mm?: number; mark?: string; quantity_unit?: 'm2' | 'm3' }>; finish_pattern_mm?: [number, number]; finish_pattern_origin_mm?: [number, number]; finish_pattern_rotation_deg?: number }) => void
  onUpdateRoof?: (objectId: string, changes: Partial<RoofModuleData>) => void
  onUpdateRainwaterDesign?: (settings: RainwaterDesignSettings) => void
  onUpdatePipeRoute?: (objectId: string, changes: Partial<PipeRouteModuleData>) => void
  onUpdateElectricalFixture?: (objectId: string, changes: Partial<ElectricalFixtureModuleData>) => void
  onAssignElectricalFixtureToCircuit?: (fixtureId: string, circuitId: string | null) => void
  onUpdateCabinet?: (objectId: string, changes: Partial<CabinetModuleData>) => void
  onUpdateMoulding?: (objectId: string, changes: Partial<MouldingModuleData>) => void
  onUpdateStair?: (objectId: string, changes: Partial<StairModuleData>) => void
  onUpdateFoundationMark: (objectId: string, newMark: string) => void
  onUpdateGridTag: (objectId: string, newTag: string) => void
  onModifyGrid: (objectId: string, changes: { start_point_mm?: [number, number]; end_point_mm?: [number, number]; bubble_visible?: boolean; auto_tag?: boolean; sequence_style?: 'auto' | 'alpha' | 'numeric' }) => void
  onUpdateGridSystem: (systemId: string, changes: { positions_mm?: number[]; first_tag?: string }) => void
  onUpdateWallFace: (objectId: string, changes: { fit_to_stair?: boolean; plaster_inside_thickness_mm?: number; plaster_outside_thickness_mm?: number; plaster_inside_material?: string; plaster_outside_material?: string; inside_finish_mark?: string; outside_finish_mark?: string; inside_finish_type_id?: string; outside_finish_type_id?: string; interior_side?: 'left' | 'right'; top_level_id?: string; base_offset_mm?: number; top_offset_mm?: number; vertical_constraint?: 'fixed_height' | 'top_level'; height_mm?: number }) => void
  onDefineWallFinish?: (name: string, parameters: Record<string, unknown>) => void
  onUpdateWallFinish?: (typeId: string, name: string, parameters: Record<string, unknown>) => void
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
  onUpdateLevelMany,
  onDeleteObjects,
  onUpdateColumnMark,
  onUpdateColumnVerticalReference,
  onUpdateBeamVerticalReference,
  onUpdateArchitectureSurface,
  onUpdateSlab,
  onUpdateRoof,
  onUpdateRainwaterDesign,
  onUpdatePipeRoute,
  onUpdateElectricalFixture,
  onAssignElectricalFixtureToCircuit,
  onUpdateCabinet,
  onUpdateMoulding,
  onUpdateStair,
  onUpdateFoundationMark,
  onUpdateGridTag,
  onModifyGrid,
  onUpdateGridSystem,
  onUpdateWallFace,
  onDefineWallFinish,
  onUpdateWallFinish,
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
  const [newWallFinishName, setNewWallFinishName] = useState('')
  const [newWallFinishDescription, setNewWallFinishDescription] = useState('')
  const [newWallFinishMaterial, setNewWallFinishMaterial] = useState('wall_paint')
  const [newWallFinishThickness, setNewWallFinishThickness] = useState(2)
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
  const bulkLevelObjects = selectedObjects.filter(object => isBeamObject(object) || isColumnObject(object) || object.object_type === 'structure.slab' || object.object_type === 'architecture.floor' || object.object_type === 'architecture.ceiling')
  const canBulkUpdateLevel = selectedObjects.length > 1 && bulkLevelObjects.length === selectedObjects.length
  const [editingMark, setEditingMark] = useState('')

  const colObj = selectedObj && isColumnObject(selectedObj) ? selectedObj : null
  const fndObj = selectedObj && isFoundationObject(selectedObj) ? selectedObj : null
  const beamObj = selectedObj && isBeamObject(selectedObj) ? selectedObj : null
  const wallObj = selectedObj && isWallObject(selectedObj) ? selectedObj : null
  const doorObj = selectedObj && isDoorObject(selectedObj) ? selectedObj : null
  const winObj = selectedObj && isWindowObject(selectedObj) ? selectedObj : null
  const slabObj = selectedObj?.object_type === 'structure.slab' ? selectedObj : null
  const architectureSurfaceObj = selectedObj && (selectedObj.object_type === 'architecture.floor' || selectedObj.object_type === 'architecture.ceiling') ? selectedObj : null
  const roomObj = selectedObj?.object_type === 'architecture.room' ? selectedObj : null
  const grdObj = selectedObj && isGridObject(selectedObj) ? selectedObj : null
  const roofObj = selectedObj && selectedObj.object_type.startsWith('roof.') ? selectedObj : null
  const pipeObj = selectedObj && ['plumbing.pipe_route', 'drainage.pipe_route'].includes(selectedObj.object_type) ? selectedObj : null
  const fixtureObj = selectedObj?.object_type === 'electrical.fixture' ? selectedObj : null
  const cabinetObj = selectedObj?.object_type === 'interior.cabinet_run' ? selectedObj : null
  const mouldingObj = selectedObj?.object_type === 'decorative.moulding_run' ? selectedObj : null

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
    return <EmptySelectionProperties />
  }

  // Find hosted foundation if this is a column
  const hostedFoundation = colObj
    ? (Object.values(project.objects).find(
        (o) => isFoundationObject(o) && (o.module_data.supported_column_id === colObj.id || o.host_refs?.includes(colObj.id))
      ) as SmartObject<FoundationModuleData> | undefined)
    : undefined

  const verticalSelectStyle: React.CSSProperties = { width: '100%', background: '#fff', border: '1px solid #dce4ed', borderRadius: 3, padding: 5, color: '#24364b' }

  if (selectedObjects.length > 1) {
    return <MultiSelectionProperties project={project} selectedObjects={selectedObjects} family={selectedObjectFamily}
      familyTypes={selectedFamilyTypes} commonTypeId={selectedCommonTypeId} canBulkUpdateLevel={canBulkUpdateLevel}
      onAssignTypeMany={onAssignTypeMany} onUpdateLevelMany={onUpdateLevelMany} onDeleteObjects={onDeleteObjects} />
  }

  return (
    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
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
            padding: '2px 4px',
            borderRadius: 2,
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
            : roofObj
            ? `Roof ${String((roofObj.module_data as Record<string, unknown>).name ?? roofObj.id)}`
            : 'วัตถุ'}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px', marginTop: 5, color: '#64748b', fontSize: 10 }}>
          <span>ระดับ: {project.levels.find(level => level.id === selectedObj.level_refs?.[0]?.level_id)?.name ?? 'Ground Floor'}</span>
          <span>Phase: {selectedObj.created_phase === 'existing' ? 'เดิม' : selectedObj.created_phase === 'demolition' ? 'รื้อถอน' : 'ก่อสร้างใหม่'}</span>
        </div>
      </div>

      {/* Human-Readable Mark & Type Presets */}
      {(colObj || fndObj || beamObj || wallObj || doorObj || winObj) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>
            เปลี่ยนชนิดของชิ้นนี้
          </label>
          <div style={{ display: 'flex', gap: 4 }}>
            <select aria-label="ชนิดของชิ้นที่เลือก" value={currentMark} onChange={e=>handleSaveMark(e.target.value)} style={{width:'100%',background:'#fff',border:'1px solid #dce4ed',padding: 6,color:'#24364b'}}>
              {project.types.filter(type=>type.object_type===selectedObj.object_type).map(type=><option key={type.id} value={type.name}>{type.name}</option>)}
            </select>
          </div>

          <small style={{ color: '#64748b', fontSize: 10 }}>เปลี่ยนค่าเฉพาะ instance นี้</small>
          <button className="cf-button cf-button-quiet" onClick={onOpenTypeManager}>แก้ไข Type ในแค็ตตาล็อก · ใช้กับ {Object.values(project.objects).filter(o=>o.object_type===selectedObj.object_type && ((selectedObj.module_data as any).type_id ? (o.module_data as any).type_id===(selectedObj.module_data as any).type_id : (o.module_data as any).mark===currentMark)).length} ชิ้น</button>
        </div>
      )}

      <StructurePropertiesSection project={project} displayUnit={displayUnit} column={colObj} foundation={fndObj} beam={beamObj}
        onUpdateColumnVerticalReference={onUpdateColumnVerticalReference} onUpdateBeamVerticalReference={onUpdateBeamVerticalReference} onOpenTypeManager={onOpenTypeManager} />

      {wallObj && <WallPropertiesSection wall={wallObj} project={project} displayUnit={displayUnit}
        onUpdateWallFace={onUpdateWallFace} onUpdateWallFinish={onUpdateWallFinish}
        onDefineWallFinish={onDefineWallFinish} onOpenTypeManager={onOpenTypeManager} />}

      {roofObj && <RoofPropertiesSection roof={roofObj} project={project} displayUnit={displayUnit}
        onUpdateRoof={onUpdateRoof} onUpdateRainwaterDesign={onUpdateRainwaterDesign} onDrawSurfaceVoid={onDrawSurfaceVoid} />}

      <SystemsPropertiesSection project={project} displayUnit={displayUnit} pipeObj={pipeObj} fixtureObj={fixtureObj} cabinetObj={cabinetObj} mouldingObj={mouldingObj}
        onUpdatePipeRoute={onUpdatePipeRoute} onUpdateElectricalFixture={onUpdateElectricalFixture} onAssignElectricalFixtureToCircuit={onAssignElectricalFixtureToCircuit}
        onUpdateCabinet={onUpdateCabinet} onUpdateMoulding={onUpdateMoulding} />

      <OpeningPropertiesSection project={project} displayUnit={displayUnit} door={doorObj} window={winObj}
        onUpdateOpeningVertical={onUpdateOpeningVertical} onUpdateOpeningInstanceParameters={onUpdateOpeningInstanceParameters} onFlipDoorHanding={onFlipDoorHanding} onOpenTypeManager={onOpenTypeManager} />

      <GridPropertiesSection project={project} grid={grdObj} selectedId={selectedId} displayUnit={displayUnit} onUpdateGridTag={onUpdateGridTag} onModifyGrid={onModifyGrid} onUpdateGridSystem={onUpdateGridSystem} />

      {selectedObj.object_type === 'architecture.stair' && <StairProperties project={project} data={selectedObj.module_data as Record<string, unknown>} unit={displayUnit} onUpdate={changes => onUpdateStair?.(selectedObj.id, changes)} />}

      <SurfacePropertiesSection project={project} displayUnit={displayUnit} slab={slabObj} architectureSurface={architectureSurfaceObj}
        onUpdateSlab={onUpdateSlab} onUpdateArchitectureSurface={onUpdateArchitectureSurface} onDrawSurfaceVoid={onDrawSurfaceVoid} onOpenTypeManager={onOpenTypeManager} />

      <RoomPropertiesSection project={project} room={roomObj} onCreateRoomFinish={onCreateRoomFinish} />

      {/* Level and Phase */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <div>
          <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>ระดับฐาน</label>
          <div style={{ background: '#f5f8fc', padding: '4px 6px', borderRadius: 2, fontSize: 12, marginTop: 4 }}>
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
              borderRadius: 2,
              padding: '4px 6px',
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
            borderRadius: 2,
            padding: '4px 6px',
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
              padding: '6px 7px',
              borderRadius: 3,
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
                gap: 4,
                background: '#eef3f8',
                color: '#0873c4',
                border: '1px solid #0284c7',
                padding: '4px 8px',
                borderRadius: 3,
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
            gap: 4,
            background: 'rgba(239, 68, 68, 0.1)',
            color: '#ef4444',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            padding: '4px 8px',
            borderRadius: 3,
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
