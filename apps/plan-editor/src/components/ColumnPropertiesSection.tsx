import React from 'react'
import { ColumnModuleData, ProjectDocument, SmartObject, formatLengthMm, resolveColumnVerticalExtent, type DisplayLengthUnit } from '@constructflow/project-model'
import { WorkbenchNumberInput } from './WorkbenchNumberInput.js'

type Props = { project: ProjectDocument; displayUnit: DisplayLengthUnit; column: SmartObject<ColumnModuleData> | null; onUpdateVerticalReference: (objectId: string, changes: { base_level_id?: string; top_level_id?: string | null; base_offset_mm?: number; top_offset_mm?: number }) => void; onOpenTypeManager: () => void }
const LengthInput: React.FC<{ value: number; unit: DisplayLengthUnit; onChange: (value: number) => void; style?: React.CSSProperties; 'aria-label'?: string }> = ({ value, unit, onChange, style, 'aria-label': ariaLabel }) => <WorkbenchNumberInput value={value} unit={unit} onChange={onChange} style={style} ariaLabel={ariaLabel} />
export const ColumnPropertiesSection: React.FC<Props> = ({ project, displayUnit, column: colObj, onUpdateVerticalReference: onUpdateColumnVerticalReference, onOpenTypeManager }) => {
  if (!colObj) return null
  const columnVertical = resolveColumnVerticalExtent(project, colObj)
  const verticalSelectStyle: React.CSSProperties = { width: '100%', background: '#fff', border: '1px solid #dce4ed', borderRadius: 3, padding: 5, color: '#24364b' }
  return <>
      {/* Column Dimensions */}
      {colObj && (
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
            <span>{colObj.module_data.section_mm.map(value => formatLengthMm(value, displayUnit)).join(' × ')} {displayUnit}</span>
            <span style={{ fontSize: 10, color: '#53657b', fontWeight: 500 }}>Type {colObj.module_data.mark}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#52677d' }}>
            <span>ตำแหน่ง:</span>
            <span style={{ fontFamily: 'monospace' }}>
              ({formatLengthMm(colObj.module_data.location_mm[0], displayUnit)} {displayUnit}, {formatLengthMm(colObj.module_data.location_mm[1], displayUnit)} {displayUnit})
            </span>
          </div>
          <details className="cf-inspector-section">
            <summary>ระดับเสา · สูง {formatLengthMm(columnVertical?.height_mm ?? 0, displayUnit)} {displayUnit}</summary>
            <section style={{ display: 'grid', gap: 5, padding: 6, background: '#f5f8fc', border: '1px solid #e5edf5', borderRadius: 3 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
              <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>ระดับฐาน
                <select aria-label="ระดับฐานเสา" value={colObj.module_data.base_level_id} onChange={event => {
                  const baseLevelId = event.target.value
                  const base = project.levels.find(level => level.id === baseLevelId)
                  const next = base ? [...project.levels].filter(level => level.elevation_mm > base.elevation_mm).sort((a, b) => a.elevation_mm - b.elevation_mm)[0] : undefined
                  onUpdateColumnVerticalReference(colObj.id, { base_level_id: baseLevelId, top_level_id: next?.id ?? null })
                }} style={verticalSelectStyle}>
                  {project.levels.map(level => <option key={level.id} value={level.id}>{level.name} · +{formatLengthMm(level.elevation_mm, displayUnit)} {displayUnit}</option>)}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>ระดับยอด
                <select aria-label="ระดับยอดเสา" value={colObj.module_data.top_level_id ?? (() => {
                  const base = project.levels.find(level => level.id === colObj.module_data.base_level_id)
                  return base ? [...project.levels].filter(level => level.elevation_mm > base.elevation_mm).sort((a, b) => a.elevation_mm - b.elevation_mm)[0]?.id ?? '' : ''
                })()} onChange={event => onUpdateColumnVerticalReference(colObj.id, { top_level_id: event.target.value || null })} style={verticalSelectStyle}>
                  <option value="">ใช้ระดับถัดไป / สำรองเดิม</option>
                  {project.levels.filter(level => level.elevation_mm > (project.levels.find(item => item.id === colObj.module_data.base_level_id)?.elevation_mm ?? -Infinity)).map(level => <option key={level.id} value={level.id}>{level.name} · +{formatLengthMm(level.elevation_mm, displayUnit)} {displayUnit}</option>)}
                </select>
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
              <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>เยื้องฐาน ({displayUnit})<LengthInput aria-label="ระยะเยื้องฐานเสา" value={colObj.module_data.base_offset_mm ?? 0} unit={displayUnit} onChange={value => onUpdateColumnVerticalReference(colObj.id, { base_offset_mm: value })} style={verticalSelectStyle} /></label>
              <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>เยื้องยอด ({displayUnit})<LengthInput aria-label="ระยะเยื้องยอดเสา" value={colObj.module_data.top_offset_mm ?? 0} unit={displayUnit} onChange={value => onUpdateColumnVerticalReference(colObj.id, { top_offset_mm: value })} style={verticalSelectStyle} /></label>
            </div>
              <span style={{ fontSize: 10, color: '#52677d' }}>สูง {formatLengthMm(columnVertical?.height_mm ?? 0, displayUnit)} {displayUnit} · +{formatLengthMm(columnVertical?.base_elevation_mm ?? 0, displayUnit)} ถึง +{formatLengthMm(columnVertical?.top_elevation_mm ?? 0, displayUnit)} {displayUnit}</span>
            </section>
          </details>
        </div>
      )}
  </>
}
