import React from 'react'
import { BeamModuleData, ProjectDocument, SmartObject, formatLengthMm, resolveBeamBaseElevation, type DisplayLengthUnit } from '@constructflow/project-model'
import { WorkbenchNumberInput } from './WorkbenchNumberInput.js'
type Props = { project: ProjectDocument; displayUnit: DisplayLengthUnit; beam: SmartObject<BeamModuleData> | null; onUpdateVerticalReference: (objectId: string, changes: { level_id?: string; base_offset_mm?: number }) => void; onOpenTypeManager: () => void }
const LengthInput: React.FC<{ value: number; unit: DisplayLengthUnit; onChange: (value: number) => void; style?: React.CSSProperties; 'aria-label'?: string }> = ({ value, unit, onChange, style, 'aria-label': ariaLabel }) => <WorkbenchNumberInput value={value} unit={unit} onChange={onChange} style={style} ariaLabel={ariaLabel} />
export const BeamPropertiesSection: React.FC<Props> = ({ project, displayUnit, beam: beamObj, onUpdateVerticalReference: onUpdateBeamVerticalReference, onOpenTypeManager }) => {
  if (!beamObj) return null
  const beamBaseElevation = resolveBeamBaseElevation(project, beamObj)
  const verticalSelectStyle: React.CSSProperties = { width: '100%', background: '#fff', border: '1px solid #dce4ed', borderRadius: 3, padding: 5, color: '#24364b' }
  return <>
      {/* Beam Dimensions & Span */}
      {beamObj && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
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
              <span>{beamObj.module_data.section_mm.map(value => formatLengthMm(value, displayUnit)).join(' × ')} {displayUnit}</span>
              <span style={{ fontSize: 10, color: '#53657b', fontWeight: 500 }}>Type {beamObj.module_data.mark}</span>
            </div>
          </div>

          <details className="cf-inspector-section">
            <summary>ระดับคาน · ท้อง +{formatLengthMm((beamBaseElevation ?? 0) - Number(beamObj.module_data.drop_mm ?? 0), displayUnit)} / หลัง +{formatLengthMm((beamBaseElevation ?? 0) + beamObj.module_data.section_mm[1] - Number(beamObj.module_data.drop_mm ?? 0), displayUnit)} {displayUnit}</summary>
            <section style={{ display: 'grid', gap: 5, padding: 6, background: '#f5f8fc', border: '1px solid #e5edf5', borderRadius: 3 }}>
            <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>อ้างอิงระดับ
              <select aria-label="ระดับอ้างอิงคาน" value={beamObj.module_data.level_id} onChange={event => onUpdateBeamVerticalReference(beamObj.id, { level_id: event.target.value })} style={verticalSelectStyle}>
                {project.levels.map(level => <option key={level.id} value={level.id}>{level.name} · {level.elevation_mm === 0 ? '±0' : `${level.elevation_mm > 0 ? '+' : ''}${formatLengthMm(level.elevation_mm, displayUnit)}`} {displayUnit}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>ระยะวางคานจากระดับ ({displayUnit})
              <LengthInput aria-label="ระยะเยื้องคานจากระดับ" value={beamObj.module_data.base_offset_mm ?? 0} unit={displayUnit} onChange={value => onUpdateBeamVerticalReference(beamObj.id, { base_offset_mm: value })} style={verticalSelectStyle} />
            </label>
              <span style={{ fontSize: 10, color: '#52677d' }}>ท้องคาน +{formatLengthMm((beamBaseElevation ?? 0) - Number(beamObj.module_data.drop_mm ?? 0), displayUnit)} {displayUnit} · หลังคาน +{formatLengthMm((beamBaseElevation ?? 0) + beamObj.module_data.section_mm[1] - Number(beamObj.module_data.drop_mm ?? 0), displayUnit)} {displayUnit}</span>
            </section>
          </details>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>
              SPAN LENGTH (ความยาวช่วงคาน)
            </label>
            <div style={{
              background: '#f5f8fc',
              padding: '5px 7px',
              borderRadius: 3,
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
  </>
}