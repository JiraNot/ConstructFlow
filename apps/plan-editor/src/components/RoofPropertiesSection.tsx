import React, { useEffect, useState } from 'react'
import {
  DEFAULT_RAINWATER_DESIGN,
  ProjectDocument,
  RainwaterDesignSettings,
  RoofModuleData,
  SmartObject,
  formatLengthMm,
  resolveCatalogType,
  type DisplayLengthUnit,
} from '@constructflow/project-model'
import { getRoofEaveBoundary, getRoofSeams, solveEaveGuttersAndDownpipes, solveRoofFraming } from '@constructflow/roof-engine'
import { evaluateProjectSiteAndLegalCompliance } from '@constructflow/clash-engine'
import { WorkbenchNumberInput } from './WorkbenchNumberInput.js'

type RoofPropertiesSectionProps = {
  roof: SmartObject
  project: ProjectDocument
  displayUnit: DisplayLengthUnit
  onUpdateRoof?: (objectId: string, changes: Partial<RoofModuleData>) => void
  onUpdateRainwaterDesign?: (settings: RainwaterDesignSettings) => void
  onDrawSurfaceVoid: (surfaceId: string) => void
}

const LengthInput: React.FC<{ value: number; unit: DisplayLengthUnit; onChange: (value: number) => void; 'aria-label'?: string }> = ({ value, unit, onChange, 'aria-label': ariaLabel }) => <WorkbenchNumberInput value={value} unit={unit} onChange={onChange} ariaLabel={ariaLabel} />

export const RoofPropertiesSection: React.FC<RoofPropertiesSectionProps> = ({ roof: roofObj, project, displayUnit, onUpdateRoof, onUpdateRainwaterDesign, onDrawSurfaceVoid }) => {
  const [rainwaterDraft, setRainwaterDraft] = useState<Record<keyof RainwaterDesignSettings, string>>(() => {
    const settings = project.rainwater_design ?? DEFAULT_RAINWATER_DESIGN
    return Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, String(value)])) as Record<keyof RainwaterDesignSettings, string>
  })
  useEffect(() => {
    const settings = project.rainwater_design ?? DEFAULT_RAINWATER_DESIGN
    setRainwaterDraft(Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, String(value)])) as Record<keyof RainwaterDesignSettings, string>)
  }, [project.rainwater_design])
  const verticalSelectStyle: React.CSSProperties = { width: '100%', background: '#fff', border: '1px solid #dce4ed', borderRadius: 3, padding: 5, color: '#24364b' }
  return (
    <>
      {/* Roof Properties */}
      {roofObj && (() => {
        const rData = (roofObj.module_data ?? {}) as Record<string, unknown>
        const roofType = resolveCatalogType(project, 'roof.system', typeof rData.type_id === 'string' ? rData.type_id : String(rData.mark ?? ''))
        const instanceOverrides = rData.instance_overrides && typeof rData.instance_overrides === 'object' ? rData.instance_overrides as Record<string, unknown> : {}
        const resolvedRoof = { ...rData, ...roofType?.parameters, ...instanceOverrides } as unknown as RoofModuleData
        const boundary = Array.isArray(rData.boundary_mm) ? rData.boundary_mm as [number, number][] : []
        const edges = Array.isArray(rData.edges) ? rData.edges as RoofModuleData['edges'] : []
        let eavesBoundary = boundary
        try { eavesBoundary = getRoofEaveBoundary(resolvedRoof) } catch { /* Keep malformed legacy roof data inspectable. */ }
        const definedSlopes = edges.filter(edge => edge.defines_slope)
        const roofSeams = getRoofSeams(resolvedRoof)
        const seamCounts = {
          ridge: roofSeams.filter(seam => seam.kind === 'ridge').length,
          hip: roofSeams.filter(seam => seam.kind === 'hip').length,
          valley: roofSeams.filter(seam => seam.kind === 'valley').length,
        }
        const slopeDeg = definedSlopes.length ? definedSlopes.reduce((total, edge) => total + edge.slope_deg, 0) / definedSlopes.length : 0
        const footprintArea = eavesBoundary.length >= 3 ? Math.abs(eavesBoundary.reduce((area, point, index) => {
          const next = eavesBoundary[(index + 1) % eavesBoundary.length]
          return area + point[0] * next[1] - next[0] * point[1]
        }, 0)) / 2_000_000 : 0
        const rainSettings = project.rainwater_design ?? DEFAULT_RAINWATER_DESIGN
        const rainwater = solveEaveGuttersAndDownpipes(resolvedRoof, rainSettings)
        const framing = solveRoofFraming(resolvedRoof)
        const rainwaterNumbers = ['design_rainfall_mm_per_hr', 'design_return_period_years', 'runoff_coefficient', 'outlet_capacity_lps', 'downpipe_diameter_mm'] as const
        const validRainwaterDraft = rainwaterNumbers.every(key => Number.isFinite(Number(rainwaterDraft[key])) && Number(rainwaterDraft[key]) > 0)
          && Number(rainwaterDraft.runoff_coefficient) <= 1
          && Number(rainwaterDraft.design_rainfall_mm_per_hr) <= 1000
          && Number(rainwaterDraft.design_return_period_years) <= 1000
          && Number(rainwaterDraft.outlet_capacity_lps) <= 10000
          && Number(rainwaterDraft.downpipe_diameter_mm) <= 1000
          && String(rainwaterDraft.location ?? '').trim().length >= 2
          && rainwaterDraft.source.trim().length >= 3
        const saveRainwaterDesign = () => {
          if (!validRainwaterDraft) return
          onUpdateRainwaterDesign?.({
            design_rainfall_mm_per_hr: Number(rainwaterDraft.design_rainfall_mm_per_hr),
            design_return_period_years: Number(rainwaterDraft.design_return_period_years),
            location: String(rainwaterDraft.location ?? '').trim(),
            source: rainwaterDraft.source.trim(),
            runoff_coefficient: Number(rainwaterDraft.runoff_coefficient),
            outlet_capacity_lps: Number(rainwaterDraft.outlet_capacity_lps),
            downpipe_diameter_mm: Number(rainwaterDraft.downpipe_diameter_mm),
          })
        }
        const update = (changes: Partial<RoofModuleData>) => onUpdateRoof?.(roofObj.id, changes)
        const updateEdge = (index: number, changes: Partial<RoofModuleData['edges'][number]>) => {
          const next = edges.map((edge, edgeIndex) => edgeIndex === index ? { ...edge, ...changes } : edge)
          update({ edges: next })
        }
        const material = String(rData.material ?? 'metal_sheet')
        const knownMaterials = ['metal_sheet', 'pu_metal_sheet', 'concrete_tile', 'clay_tile', 'reinforced_concrete', 'polycarbonate']
        const hasParcelBoundary = (project.legal_metadata?.boundary_pegs?.length ?? 0) >= 3
        const hasManualSetback = typeof rData.distance_to_boundary_m === 'number' || typeof rData.eaves_setback_m === 'number'
        const eavesFinding = hasParcelBoundary || hasManualSetback
          ? evaluateProjectSiteAndLegalCompliance(project).building_compliance.findings.find(finding => finding.rule_id.startsWith('TH-MR55-RULE-50-EAVES') && finding.title.includes(`[${roofObj.id}]`))
          : undefined
        const setbackStatusLabel = eavesFinding?.status === 'pass' ? 'ผ่าน' : eavesFinding?.status === 'fail' ? 'ไม่ผ่าน' : eavesFinding?.status === 'warning' ? 'ตรวจรางน้ำ' : eavesFinding?.status === 'insufficient_data' ? 'ข้อมูลไม่ครบ' : 'ยังตรวจไม่ได้'
        const setbackStatusColor = eavesFinding?.status === 'pass' ? '#15803d' : eavesFinding?.status === 'fail' ? '#b91c1c' : '#a16207'

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={{
              background: '#f8fafc',
              padding: '6px 7px',
              borderRadius: 3,
              border: '1px solid #e2e8f0',
              display: 'grid',
              gap: 4,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#475569' }}>ความลาดชัน (Slope):</span>
                <strong style={{ color: '#0f172a' }}>{slopeDeg.toFixed(1)}&deg;</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#475569' }}>พื้นที่ฉายหลังคารวมชายคา:</span>
                <strong style={{ color: '#0873c4' }}>{footprintArea.toFixed(2)} ตร.ม.</strong>
              </div>
            </div>
            {roofSeams.length > 0 && <small style={{ fontSize: 10, color: '#64748b' }}>
              เส้นหลังคา: สัน {seamCounts.ridge} · ตะเข้สัน {seamCounts.hip} · ร่อง {seamCounts.valley} — ลากจุดกึ่งกลางเส้นในแปลนเพื่อปรับแนว
            </small>}
            <details className="cf-inspector-section" open>
              <summary>โครงจันทัน / แป / ทรัส · Type {roofType?.name ?? 'ค่าเริ่มต้น'}</summary>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 10, color: '#475569', paddingTop: 5 }}>
                <span>จันทัน {framing.members.filter(member => member.role === 'rafter').length} ชิ้น</span>
                <span>แป {framing.members.filter(member => member.role === 'purlin').length} ชิ้น</span>
                <span>ทรัส {framing.truss_count} ชุด</span>
                <span>วัสดุ {String(resolvedRoof.framing_material ?? 'steel')}</span>
              </div>
              {framing.warnings.map(warning => <small key={warning} role="status" style={{ color: '#a16207' }}>{warning}</small>)}
              <small style={{ color: '#64748b' }}>แก้หน้าตัดและระยะจัดวางผ่านปุ่ม Type Catalog ของหลังคา · ตรวจตำแหน่งจริงในมุม “แปลนคาน” และ 3D</small>
            </details>
            <details className="cf-inspector-section" open>
              <summary>น้ำฝนโครงการ · {rainSettings.location || [project.legal_metadata?.district, project.legal_metadata?.province].filter(Boolean).join(' ') || 'ยังไม่ระบุพื้นที่'}</summary>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, paddingTop: 6 }}>
                <label style={{ display: 'grid', gap: 2, fontSize: 10, color: '#52677d', gridColumn: '1 / -1' }}>ตำแหน่งพื้นที่โครงการ
                  <input aria-label="ตำแหน่งพื้นที่โครงการสำหรับข้อมูลฝน" value={rainwaterDraft.location ?? ''} onChange={event => setRainwaterDraft(current => ({ ...current, location: event.target.value }))} placeholder="เขต / อำเภอ / จังหวัด" />
                </label>
                <label style={{ display: 'grid', gap: 2, fontSize: 10, color: '#52677d' }}>ความเข้มฝน (มม./ชม.)
                  <input aria-label="ความเข้มฝนออกแบบของโครงการ" type="number" min="0.1" max="1000" step="any" value={rainwaterDraft.design_rainfall_mm_per_hr} onChange={event => setRainwaterDraft(current => ({ ...current, design_rainfall_mm_per_hr: event.target.value }))} />
                </label>
                <label style={{ display: 'grid', gap: 2, fontSize: 10, color: '#52677d' }}>รอบอุบัติ (ปี)
                  <input aria-label="รอบอุบัติฝนออกแบบของโครงการ" type="number" min="0.1" max="1000" step="any" value={rainwaterDraft.design_return_period_years} onChange={event => setRainwaterDraft(current => ({ ...current, design_return_period_years: event.target.value }))} />
                </label>
                <label style={{ display: 'grid', gap: 2, fontSize: 10, color: '#52677d' }}>Runoff coefficient
                  <input aria-label="สัมประสิทธิ์น้ำไหลนองของโครงการ" type="number" min="0.01" max="1" step="0.01" value={rainwaterDraft.runoff_coefficient} onChange={event => setRainwaterDraft(current => ({ ...current, runoff_coefficient: event.target.value }))} />
                </label>
                <label style={{ display: 'grid', gap: 2, fontSize: 10, color: '#52677d' }}>กำลังรับต่อจุด (ลิตร/วินาที)
                  <input aria-label="กำลังระบายต่อท่อของโครงการ" type="number" min="0.01" max="10000" step="any" value={rainwaterDraft.outlet_capacity_lps} onChange={event => setRainwaterDraft(current => ({ ...current, outlet_capacity_lps: event.target.value }))} />
                </label>
                <label style={{ display: 'grid', gap: 2, fontSize: 10, color: '#52677d' }}>เส้นผ่านศูนย์กลางท่อ (มม.)
                  <input aria-label="เส้นผ่านศูนย์กลางท่อน้ำฝนของโครงการ" type="number" min="25" max="1000" step="any" value={rainwaterDraft.downpipe_diameter_mm} onChange={event => setRainwaterDraft(current => ({ ...current, downpipe_diameter_mm: event.target.value }))} />
                </label>
                <label style={{ display: 'grid', gap: 2, fontSize: 10, color: '#52677d', gridColumn: '1 / -1' }}>แหล่งข้อมูลฝน / หน่วยงาน / สถานี
                  <input aria-label="แหล่งอ้างอิงข้อมูลฝนโครงการ" value={rainwaterDraft.source} onChange={event => setRainwaterDraft(current => ({ ...current, source: event.target.value }))} />
                </label>
              </div>
              <button type="button" className="cf-button" disabled={!validRainwaterDraft} onClick={saveRainwaterDesign}>บันทึกค่าคำนวณน้ำฝนทั้งโครงการ</button>
              <div style={{ background: '#f8fafc', padding: '6px 7px', borderRadius: 3, fontSize: 10, display: 'grid', gap: 2 }}>
                <span>หลังคารับน้ำ {rainwater.catchment.catchment_area_m2.toFixed(2)} ตร.ม. · อัตราไหล {rainwater.catchment.peak_flow_lps.toFixed(2)} ลิตร/วินาที</span>
                <strong>แนะนำ {rainwater.downpipes.length} จุด · Ø{rainSettings.downpipe_diameter_mm} มม. · ราง {rainwater.gutters.reduce((sum, gutter) => sum + gutter.length_m, 0).toFixed(2)} ม.</strong>
                {(rainSettings.source.includes('ชั่วคราว') || !rainSettings.location?.trim()) && <span role="status" style={{ color: '#a16207' }}>ค่า 120 มม./ชม. เป็นค่าเริ่มต้นชั่วคราว · ระบุตำแหน่งโครงการและแหล่งข้อมูลฝน/รอบอุบัติก่อนใช้คำนวณขั้นสุดท้าย</span>}
              </div>
            </details>
            <label className="cf-property-row">ระดับอ้างอิงหลังคา ({displayUnit})
              <LengthInput value={Number(rData.elevation_mm ?? 0)} unit={displayUnit} onChange={value => update({ elevation_mm: value })} aria-label={`ระดับอ้างอิงหลังคา (${displayUnit})`} />
            </label>
            <label className="cf-property-row">ความหนาหลังคา ({displayUnit})
              <LengthInput value={Number(rData.thickness_mm ?? 30)} unit={displayUnit} onChange={value => update({ thickness_mm: Math.max(1, value) })} aria-label={`ความหนาหลังคา (${displayUnit})`} />
            </label>
            <label className="cf-property-row">ระยะชายคายื่นรอบด้าน ({displayUnit})
              <LengthInput value={Number(rData.eaves_overhang_mm ?? 0)} unit={displayUnit} onChange={value => update({ eaves_overhang_mm: Math.max(0, Math.min(3000, value)) })} aria-label={`ระยะชายคายื่นรอบด้าน (${displayUnit})`} />
            </label>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 3, padding: '5px 7px', display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}>
              <span style={{ color: '#475569' }}>ระยะร่นชายคาถึงเขตที่ดิน</span>
              <strong style={{ color: setbackStatusColor, textAlign: 'right' }}>{setbackStatusLabel}{eavesFinding ? ` · ${String(eavesFinding.actual)}` : ' · ระบุหลักเขตอย่างน้อย 3 จุด'}</strong>
            </div>
            <label className="cf-property-row">วัสดุมุง
              <select aria-label="วัสดุมุงหลังคา" value={material} onChange={event => update({ material: event.target.value })}>
                {!knownMaterials.includes(material) && <option value={material}>{material} (ค่าปัจจุบัน)</option>}
                <option value="metal_sheet">เมทัลชีท</option><option value="pu_metal_sheet">เมทัลชีท PU</option>
                <option value="concrete_tile">กระเบื้องคอนกรีต</option><option value="clay_tile">กระเบื้องดินเผา</option>
                <option value="reinforced_concrete">คอนกรีตเสริมเหล็ก</option><option value="polycarbonate">โพลีคาร์บอเนต</option>
              </select>
            </label>
            <details className="cf-inspector-section" open>
              <summary>ความลาดชันรายด้าน</summary>
              <div style={{ display: 'grid', gap: 4, paddingTop: 5 }}>
                {edges.map((edge, index) => <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr auto 64px', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: '#475569' }}>ด้าน {index + 1}</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10 }}>
                    <input type="checkbox" aria-label={`กำหนดความลาดชันด้าน ${index + 1}`} checked={edge.defines_slope} onChange={event => updateEdge(index, event.target.checked ? { defines_slope: true, slope_deg: edge.slope_deg || 25 } : { defines_slope: false, slope_deg: 0 })} /> ลาด
                  </label>
                  <input aria-label={`องศาความลาดชันด้าน ${index + 1}`} type="number" min="0.5" max="88" step="0.5" disabled={!edge.defines_slope} value={edge.slope_deg} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) updateEdge(index, { slope_deg: Math.max(0.5, Math.min(88, value)) }) }} />
                </div>)}
                <small style={{ color: '#64748b' }}>เปิดความลาดชันเฉพาะด้านที่กำหนด · ด้านที่ปิดจะใช้เป็นแนวสัน/หน้าจั่ว</small>
              </div>
            </details>
            <button type="button" onClick={() => onDrawSurfaceVoid(roofObj.id)} style={verticalSelectStyle}>วาดช่องเจาะหลังคา ({Array.isArray(rData.voids_mm) ? rData.voids_mm.length : 0})</button>
            <small style={{ color: '#64748b', lineHeight: 1.4 }}>ระยะร่นชายคาต้องตรวจเทียบแนวเขตที่ดินและระยะยื่นจริงของแบบหลังคา</small>
          </div>
        )
      })()}
    </>
  )
}
