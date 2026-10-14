import React, { useEffect, useMemo, useState } from 'react'
import {
  CATALOG_PARAMETER_FIELDS,
  DoorModuleData,
  ProjectDocument,
  SmartObject,
  WindowModuleData,
  WallModuleData,
  formatLengthMm,
  resolveCatalogType,
  resolveOpeningVerticalExtent,
  type DisplayLengthUnit,
} from '@constructflow/project-model'
import { buildOpeningRepresentationShapeFromObject } from '@constructflow/representation-engine'
import { OpeningElevationThumbnail } from './OpeningElevationThumbnail.js'
import { WorkbenchNumberInput } from './WorkbenchNumberInput.js'
import { CatalogField } from './CatalogField.js'
import { RefreshCw } from 'lucide-react'

type OpeningPropertiesSectionProps = {
  project: ProjectDocument
  displayUnit: DisplayLengthUnit
  door: SmartObject<DoorModuleData> | null
  window: SmartObject<WindowModuleData> | null
  onUpdateOpeningVertical: (objectId: string, changes: { sill_height_mm?: number; height_mm?: number; head_level_id?: string; head_offset_mm?: number; vertical_constraint?: 'fixed_height' | 'head_level' }) => void
  onRehostOpening?: (objectId: string, wallId: string, offsetAlongWallMm: number) => void
  onUpdateOpeningInstanceParameters?: (objectId: string, parameters: Record<string, unknown | null>) => void
  onFlipDoorHanding?: (doorId: string) => void
  onOpenTypeManager: () => void
}

const LengthInput: React.FC<{ value: number; unit: DisplayLengthUnit; onChange: (value: number) => void; style?: React.CSSProperties; 'aria-label'?: string }> = ({ value, unit, onChange, style, 'aria-label': ariaLabel }) => <WorkbenchNumberInput value={value} unit={unit} onChange={onChange} style={style} ariaLabel={ariaLabel} />

export const OpeningPropertiesSection: React.FC<OpeningPropertiesSectionProps> = ({ project, displayUnit, door: doorObj, window: winObj, onUpdateOpeningVertical, onRehostOpening, onUpdateOpeningInstanceParameters, onFlipDoorHanding, onOpenTypeManager }) => {
  const openingObj = doorObj ?? winObj
  const openingData = openingObj?.module_data as DoorModuleData | WindowModuleData | undefined
  const currentHostId = openingData?.wall_id ?? ''
  const openingLevelId = openingData?.level_id ?? openingObj?.level_refs.find(reference => reference.role === 'base_level')?.level_id
  const hostWalls = useMemo(() => Object.values(project.objects).filter((object): object is SmartObject<WallModuleData> => {
    if (object.object_type !== 'architecture.wall' || object.status === 'archived' || object.removed_phase) return false
    const data = object.module_data as WallModuleData
    return !openingLevelId || data.level_id === openingLevelId || object.level_refs.some(reference => reference.role === 'base_level' && reference.level_id === openingLevelId)
  },
  ), [project.objects, openingLevelId])
  const [targetWallId, setTargetWallId] = useState(currentHostId)
  const [targetOffsetMm, setTargetOffsetMm] = useState(openingData?.offset_along_wall_mm ?? 0)
  useEffect(() => {
    setTargetWallId(currentHostId)
    setTargetOffsetMm(openingData?.offset_along_wall_mm ?? 0)
  }, [openingObj?.id, currentHostId, openingData?.offset_along_wall_mm])
  const openingType = openingObj ? resolveCatalogType(project, openingObj.object_type, openingObj.module_data.type_id ?? openingObj.module_data.mark) : undefined
  const verticalSelectStyle: React.CSSProperties = { width: '100%', background: '#fff', border: '1px solid #dce4ed', borderRadius: 3, padding: 5, color: '#24364b' }
  const currentHost = project.objects[currentHostId]
  const openingParameterFields = openingObj && openingType
    ? (CATALOG_PARAMETER_FIELDS[openingObj.object_type] ?? []).filter(field => openingType.parameters[field] !== undefined)
    : []
  const openingInstanceEditor = openingObj && openingType ? (
    <details style={{ border: '1px solid #e5edf5', borderRadius: 3, padding: '6px 6px', background: '#fbfdff' }}>
      <summary style={{ cursor: 'pointer', color: '#40566e', fontSize: 11, fontWeight: 700 }}>
        พารามิเตอร์รายชิ้น · {Object.keys(openingObj.module_data.instance_overrides ?? {}).length} ค่า override
      </summary>
      <div style={{ display: 'grid', gap: 6, marginTop: 9 }}>
        {openingParameterFields.map(field => {
          const overrides = openingObj.module_data.instance_overrides ?? {}
          const isOverridden = Object.hasOwn(overrides, field)
          const value = isOverridden ? overrides[field] : (openingObj.module_data as unknown as Record<string, unknown>)[field] ?? openingType.parameters[field]
          return <div key={field} style={{ padding: 5, border: '1px solid #e8eef5', borderRadius: 3, background: '#fff' }}>
            <CatalogField name={field} value={value} displayUnit={displayUnit} onChange={next => onUpdateOpeningInstanceParameters?.(openingObj.id, { [field]: next })} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginTop: 4 }}>
              <span style={{ fontSize: 10, color: isOverridden ? '#a65b00' : '#64748b' }}>{isOverridden ? 'กำหนดเฉพาะชิ้นนี้' : `สืบทอดจาก ${openingType.name}`}</span>
              {isOverridden && <button type="button" className="cf-button cf-button-quiet" onClick={() => onUpdateOpeningInstanceParameters?.(openingObj.id, { [field]: null })}>คืนค่าตามชนิด</button>}
            </div>
          </div>
        })}
      </div>
    </details>
  ) : null
  const openingHostEditor = openingObj && onRehostOpening ? (
    <details className="cf-inspector-section">
      <summary>ผนัง Host · {currentHost?.object_type === 'architecture.wall' ? (currentHost.module_data as WallModuleData).mark : currentHostId.slice(0, 8)}</summary>
      <section style={{ display: 'grid', gap: 6, padding: 6, background: '#f5f8fc', border: '1px solid #e5edf5', borderRadius: 3 }}>
        <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>ผนังปลายทาง
          <select aria-label="ผนัง Host ปลายทาง" value={targetWallId} onChange={event => {
            const wallId = event.target.value
            setTargetWallId(wallId)
            const wall = project.objects[wallId]
            if (!wall || wall.object_type !== 'architecture.wall') return
            const data = wall.module_data as WallModuleData
            const start = data.start_point_mm, end = data.end_point_mm
            const dx = end[0] - start[0], dy = end[1] - start[1]
            const length = Math.hypot(dx, dy)
            if (length <= 0) return
            const location = openingData!.location_mm
            const projected = ((location[0] - start[0]) * dx + (location[1] - start[1]) * dy) / length
            const width = Number(openingData!.instance_overrides?.width_mm ?? openingData!.width_mm)
            setTargetOffsetMm(Math.max(width / 2, Math.min(length - width / 2, projected)))
          }} style={verticalSelectStyle}>
            {hostWalls.map(wall => <option key={wall.id} value={wall.id}>{wall.module_data.mark} · {wall.id.slice(0, 8)}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>Offset จากต้นผนัง ({displayUnit})
          <LengthInput aria-label="ระยะช่องเปิดจากต้นผนังปลายทาง" value={targetOffsetMm} unit={displayUnit} onChange={setTargetOffsetMm} style={verticalSelectStyle} />
        </label>
        <button type="button" disabled={!targetWallId} onClick={() => onRehostOpening(openingObj.id, targetWallId, targetOffsetMm)}>
          เปลี่ยนผนัง Host · Undo ได้
        </button>
        <small style={{ color: '#64748b' }}>ระบบตรวจความกว้างช่องเปิด ระดับ และช่องเปิดอื่นบนผนังปลายทางก่อนย้าย</small>
      </section>
    </details>
  ) : null
  const doorVertical = doorObj ? resolveOpeningVerticalExtent(project, doorObj) : undefined
  const windowVertical = winObj ? resolveOpeningVerticalExtent(project, winObj) : undefined
  const doorShape = doorObj ? buildOpeningRepresentationShapeFromObject(project, doorObj) : undefined
  const winShape = winObj ? buildOpeningRepresentationShapeFromObject(project, winObj) : undefined
  return (
    <>
      {/* Door Properties */}
      {doorObj && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
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
              padding: '5px 7px',
              borderRadius: 3,
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
          {openingHostEditor}
          {doorShape && <OpeningElevationThumbnail shape={doorShape} />}

          <details className="cf-inspector-section">
            <summary>ระดับประตู · ธรณี {formatLengthMm(doorObj.module_data.sill_height_mm ?? 0, displayUnit)} · สูง {formatLengthMm(doorVertical?.height_mm ?? doorObj.module_data.height_mm, displayUnit)} {displayUnit}</summary>
            <section style={{ display: 'grid', gap: 5, padding: 6, background: '#f5f8fc', border: '1px solid #e5edf5', borderRadius: 3 }}>
            <strong style={{ fontSize: 11, color: '#40566e' }}>ระดับประตู</strong>
            <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>ธรณี/ยกจากพื้น ({displayUnit})<LengthInput aria-label="ระดับธรณีประตู" value={doorObj.module_data.sill_height_mm ?? 0} unit={displayUnit} onChange={value => onUpdateOpeningVertical(doorObj.id, { sill_height_mm: value })} style={verticalSelectStyle} /></label>
            <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>หัวประตูจบที่ระดับ
              <select aria-label="ระดับหัวประตู" value={doorObj.module_data.head_level_id || ''} onChange={e => e.target.value
                ? onUpdateOpeningVertical(doorObj.id, { head_level_id: e.target.value, head_offset_mm: 0, vertical_constraint: 'head_level' })
                : onUpdateOpeningVertical(doorObj.id, { head_level_id: '', vertical_constraint: 'fixed_height', height_mm: doorVertical?.height_mm ?? doorObj.module_data.height_mm })} style={verticalSelectStyle}>
                <option value="">กำหนดความสูงบานเอง (Fixed Height)</option>
                {project.levels.filter(level => level.elevation_mm > (project.levels.find(item => item.id === (doorObj.module_data.level_id || doorObj.level_refs?.[0]?.level_id))?.elevation_mm ?? 0)).map(level => <option key={level.id} value={level.id}>{level.name} · +{formatLengthMm(level.elevation_mm, displayUnit)} {displayUnit}</option>)}
              </select>
            </label>
            {doorObj.module_data.head_level_id ? (
              <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>
                ระยะหัวประตูจากระดับ ({displayUnit})
                <LengthInput aria-label="ระยะหัวประตูจากระดับ" value={doorObj.module_data.head_offset_mm ?? 0} unit={displayUnit} onChange={value => onUpdateOpeningVertical(doorObj.id, { head_offset_mm: value })} style={verticalSelectStyle} />
              </label>
            ) : (
              <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>
                ความสูงประตู ({displayUnit})
                <LengthInput aria-label="ความสูงประตู" value={doorObj.module_data.height_mm} unit={displayUnit} onChange={value => onUpdateOpeningVertical(doorObj.id, { vertical_constraint: 'fixed_height', height_mm: value })} style={verticalSelectStyle} />
              </label>
            )}
            </section>
          </details>

          {/* Door Handing with Flip button */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>HANDING & SWING</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <div style={{
                background: '#f5f8fc',
                padding: '4px 7px',
                borderRadius: 3,
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
                  gap: 3,
                  background: '#eef3f8',
                  color: '#18764b',
                  border: '1px solid #16a34a',
                  padding: '4px 7px',
                  borderRadius: 3,
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
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
              <span>{formatLengthMm(winObj.module_data.width_mm, displayUnit)} × {formatLengthMm(winObj.module_data.height_mm, displayUnit)} {displayUnit}</span>
              <span style={{ fontSize: 10, color: '#53657b', fontWeight: 500 }}>Type {winObj.module_data.mark}</span>
            </div>
          </div>

          {openingInstanceEditor}
          {openingHostEditor}
          {winShape && <OpeningElevationThumbnail shape={winShape} />}

          <details className="cf-inspector-section">
            <summary>ระดับหน้าต่าง · ธรณี {formatLengthMm(winObj.module_data.sill_height_mm, displayUnit)} · สูง {formatLengthMm(windowVertical?.height_mm ?? winObj.module_data.height_mm, displayUnit)} {displayUnit}</summary>
            <section style={{ display: 'grid', gap: 5, padding: 6, background: '#f5f8fc', border: '1px solid #e5edf5', borderRadius: 3 }}>
            <strong style={{ fontSize: 11, color: '#40566e' }}>ระดับหน้าต่าง</strong>
            <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>ธรณีหน้าต่างจากพื้น ({displayUnit})<LengthInput aria-label="ระดับธรณีหน้าต่าง" value={winObj.module_data.sill_height_mm} unit={displayUnit} onChange={value => onUpdateOpeningVertical(winObj.id, { sill_height_mm: value })} style={verticalSelectStyle} /></label>
            <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>หัวหน้าต่างจบที่ระดับ
              <select aria-label="ระดับหัวหน้าต่าง" value={winObj.module_data.head_level_id || ''} onChange={e => e.target.value
                ? onUpdateOpeningVertical(winObj.id, { head_level_id: e.target.value, head_offset_mm: 0, vertical_constraint: 'head_level' })
                : onUpdateOpeningVertical(winObj.id, { head_level_id: '', vertical_constraint: 'fixed_height', height_mm: windowVertical?.height_mm ?? winObj.module_data.height_mm })} style={verticalSelectStyle}>
                <option value="">กำหนดความสูงเอง (Fixed Height)</option>
                {project.levels.filter(level => level.elevation_mm > (project.levels.find(item => item.id === (winObj.module_data.level_id || winObj.level_refs?.[0]?.level_id))?.elevation_mm ?? 0)).map(level => <option key={level.id} value={level.id}>{level.name} · +{formatLengthMm(level.elevation_mm, displayUnit)} {displayUnit}</option>)}
              </select>
            </label>
            {winObj.module_data.head_level_id ? (
              <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>
                ระยะหัวหน้าต่างจากระดับ ({displayUnit})
                <LengthInput aria-label="ระยะหัวหน้าต่างจากระดับ" value={winObj.module_data.head_offset_mm ?? 0} unit={displayUnit} onChange={value => onUpdateOpeningVertical(winObj.id, { head_offset_mm: value })} style={verticalSelectStyle} />
              </label>
            ) : (
              <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>
                ความสูงหน้าต่าง ({displayUnit})
                <LengthInput aria-label="ความสูงหน้าต่าง" value={winObj.module_data.height_mm} unit={displayUnit} onChange={value => onUpdateOpeningVertical(winObj.id, { vertical_constraint: 'fixed_height', height_mm: value })} style={verticalSelectStyle} />
              </label>
            )}
            </section>
          </details>

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
    </>
  )
}
