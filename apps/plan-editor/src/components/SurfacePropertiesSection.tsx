import React from 'react'
import {
  ProjectDocument,
  SmartObject,
  formatLengthMm,
  resolveArchitectureSurfaceElevation,
  resolveSlabElevation,
  type DisplayLengthUnit,
  type SlabModuleData,
} from '@constructflow/project-model'
import { WorkbenchNumberInput } from './WorkbenchNumberInput.js'

type SurfacePropertiesSectionProps = {
  project: ProjectDocument
  displayUnit: DisplayLengthUnit
  slab: SmartObject | null
  architectureSurface: SmartObject | null
  onUpdateSlab?: (objectId: string, changes: Partial<SlabModuleData>) => void
  onUpdateArchitectureSurface?: (objectId: string, changes: { level_id?: string; elevation_offset_mm?: number; thickness_mm?: number; material?: string; finish_layers?: Array<{ material: string; thickness_mm: number; mark?: string; quantity_unit?: 'm2' | 'm3' }>; finish_pattern_mm?: [number, number]; finish_pattern_origin_mm?: [number, number]; finish_pattern_rotation_deg?: number; grid_mm?: [number, number] }) => void
  onDrawSurfaceVoid: (surfaceId: string) => void
  onOpenTypeManager: () => void
}

const LengthInput: React.FC<{ value: number; unit: DisplayLengthUnit; onChange: (value: number) => void; style?: React.CSSProperties; 'aria-label'?: string }> = ({ value, unit, onChange, style, 'aria-label': ariaLabel }) => <WorkbenchNumberInput value={value} unit={unit} onChange={onChange} style={style} ariaLabel={ariaLabel} />

export const SurfacePropertiesSection: React.FC<SurfacePropertiesSectionProps> = ({ project, displayUnit, slab: slabObj, architectureSurface: architectureSurfaceObj, onUpdateSlab, onUpdateArchitectureSurface, onDrawSurfaceVoid, onOpenTypeManager }) => {
  const verticalSelectStyle: React.CSSProperties = { width: '100%', background: '#fff', border: '1px solid #dce4ed', borderRadius: 3, padding: 5, color: '#24364b' }
  return (
    <>
      {slabObj && (
        (() => {
          const slabData = slabObj.module_data as Record<string, unknown>
          const levelId = typeof slabData.level_id === 'string' ? slabData.level_id : project.project.active_level_id
          const level = project.levels.find(item => item.id === levelId)
          const resolvedElevation = resolveSlabElevation(project, slabObj)
          const currentOffset = resolvedElevation !== undefined && level ? resolvedElevation - level.elevation_mm : Number(slabData.elevation_offset_mm ?? 0)
          const thickness = Number(slabData.thickness_mm ?? 120)
          const finishLayers = Array.isArray(slabData.finish_layers) ? slabData.finish_layers as Array<{ material?: string; thickness_mm?: number; offset_mm?: number; mark?: string; quantity_unit?: 'm2' | 'm3' }> : []
          const updateSlab = (changes: Parameters<NonNullable<typeof onUpdateSlab>>[1]) => onUpdateSlab?.(slabObj.id, changes)
          const writeFinishLayers = (layers: typeof finishLayers) => updateSlab({ finish_layers: layers.map(layer => ({ material: String(layer.material ?? 'tile'), thickness_mm: Number(layer.thickness_mm ?? 10), offset_mm: Number(layer.offset_mm ?? 0), ...(layer.mark ? { mark: layer.mark } : {}), quantity_unit: layer.quantity_unit ?? 'm2' })) })
          return (
            <section style={{ display: 'grid', gap: 6, padding: 7, border: '1px solid #dbe3ed', borderRadius: 4, background: '#f8fafc' }}>
              <strong style={{ fontSize: 12 }}>แผ่นพื้นโครงสร้าง {String(slabData.mark ?? '')}</strong>
              <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>
                อ้างอิงระดับชั้น
                <select
                  aria-label="ระดับอ้างอิงพื้นโครงสร้าง"
                  value={levelId}
                  onChange={event => onUpdateSlab?.(slabObj.id, { level_id: event.target.value })}
                  style={verticalSelectStyle}
                >
                  {project.levels.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {(item.elevation_mm / 1000).toFixed(3)} m
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>
                เยื้องจากระดับชั้น (Offset) ({displayUnit})
                <LengthInput
                  aria-label={`ระยะเยื้องพื้นโครงสร้าง (${displayUnit})`}
                  value={currentOffset}
                  unit={displayUnit}
                  onChange={value => onUpdateSlab?.(slabObj.id, { elevation_offset_mm: value })}
                  style={verticalSelectStyle}
                />
              </label>
              <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>
                ความหนาพื้น ({displayUnit})
                <LengthInput
                  aria-label={`ความหนาพื้นโครงสร้าง (${displayUnit})`}
                  value={thickness}
                  unit={displayUnit}
                  onChange={value => onUpdateSlab?.(slabObj.id, { thickness_mm: value })}
                  style={verticalSelectStyle}
                />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>ความลาด (%)
                  <input aria-label="ความลาดพื้น เปอร์เซ็นต์" type="number" min="0" max="100" step="0.1" value={(Number(slabData.slope_ratio ?? 0) * 100).toFixed(1)} onChange={event => updateSlab({ slope_ratio: Math.max(0, Number(event.target.value) || 0) / 100 })} style={verticalSelectStyle} />
                </label>
                <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>ทิศระบายน้ำ (° จากแกน X)
                  <input aria-label="ทิศระบายน้ำของพื้น องศา" type="number" step="1" value={Number(slabData.drain_direction_deg ?? 0)} onChange={event => updateSlab({ drain_direction_deg: Number(event.target.value) || 0 })} style={verticalSelectStyle} />
                </label>
              </div>
              <small style={{ fontSize: 10, color: '#64748b' }}>ลากลูกศรบนแปลนเพื่อเปลี่ยนทิศ · ลากสี่เหลี่ยมกลางขอบเพื่อเยื้องขอบ · 0° = ตะวันออก, 90° = เหนือ · 1.0% = ลาด 1:100</small>
              <details className="cf-inspector-section">
                <summary>ชั้นปิดผิว · {finishLayers.length} ชั้น{finishLayers.length ? ` · ผิวสำเร็จ +${formatLengthMm((resolvedElevation ?? 0) + Number(slabData.topping_mm ?? 0) + finishLayers.reduce((sum, layer) => sum + Number(layer.offset_mm ?? 0) + Number(layer.thickness_mm ?? 0), 0), displayUnit)} ${displayUnit}` : ''}</summary>
              <strong style={{ fontSize: 11, marginTop: 3 }}>ชั้นปิดผิวในพื้นชิ้นนี้</strong>
              {finishLayers.length > 0 && <small style={{ fontSize: 9, color: '#64748b' }}>วัสดุ · ความหนา · Offset จากชั้นก่อน · หน่วยปริมาณ</small>}
              {finishLayers.map((layer, index) => <div key={`${slabObj.id}:finish:${index}`} style={{ display: 'grid', gridTemplateColumns: '1fr 0.7fr 0.7fr 0.6fr auto', gap: 4, alignItems: 'center' }}>
                <input aria-label={`วัสดุปิดผิวพื้น ${index + 1}`} value={String(layer.material ?? '')} onChange={event => writeFinishLayers(finishLayers.map((item, i) => i === index ? { ...item, material: event.target.value } : item))} style={verticalSelectStyle} />
                <LengthInput aria-label={`ความหนาชั้นปิดผิว ${index + 1} (${displayUnit})`} value={Number(layer.thickness_mm ?? 10)} unit={displayUnit} onChange={value => writeFinishLayers(finishLayers.map((item, i) => i === index ? { ...item, thickness_mm: value } : item))} style={verticalSelectStyle} />
                <LengthInput aria-label={`ระยะ offset ชั้นปิดผิว ${index + 1} (${displayUnit})`} value={Number(layer.offset_mm ?? 0)} unit={displayUnit} onChange={value => writeFinishLayers(finishLayers.map((item, i) => i === index ? { ...item, offset_mm: value } : item))} style={verticalSelectStyle} />
                <select aria-label={`หน่วยถอดปริมาณชั้นปิดผิว ${index + 1}`} value={layer.quantity_unit ?? 'm2'} onChange={event => writeFinishLayers(finishLayers.map((item, i) => i === index ? { ...item, quantity_unit: event.target.value as 'm2' | 'm3' } : item))} style={verticalSelectStyle}><option value="m2">ตร.ม.</option><option value="m3">ลบ.ม.</option></select>
                <button type="button" aria-label={`ลบชั้นปิดผิว ${index + 1}`} onClick={() => writeFinishLayers(finishLayers.filter((_, i) => i !== index))} style={{ ...verticalSelectStyle, color: '#b91c1c', padding: 4 }}>×</button>
              </div>)}
              <button type="button" onClick={() => writeFinishLayers([...finishLayers, { material: 'porcelain_tile', thickness_mm: 10, mark: `Tile ${finishLayers.length + 1}`, quantity_unit: 'm2' }])} style={verticalSelectStyle}>+ เพิ่มชั้นกระเบื้อง / วัสดุปิดผิว</button>
              <div style={{ fontSize: 10, color: '#52677d', display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span>หลังพื้นโครงสร้าง: +{formatLengthMm((resolvedElevation ?? 0) + Number(slabData.topping_mm ?? 0), displayUnit)} {displayUnit}</span>
                <span>ท้องพื้น: +{formatLengthMm((resolvedElevation ?? 0) - thickness, displayUnit)} {displayUnit}</span>
              </div>
              {finishLayers.length > 0 && <small style={{ fontSize: 10, color: '#64748b' }}>ผิวสำเร็จ: +{formatLengthMm((resolvedElevation ?? 0) + Number(slabData.topping_mm ?? 0) + finishLayers.reduce((sum, layer) => sum + Number(layer.offset_mm ?? 0) + Number(layer.thickness_mm ?? 0), 0), displayUnit)} {displayUnit}</small>}
              </details>
              <button type="button" onClick={() => onDrawSurfaceVoid(slabObj.id)} style={verticalSelectStyle}>วาดช่องเจาะพื้น</button>
            </section>
          )
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
        return <section style={{ display: 'grid', gap: 6, padding: 7, border: '1px solid #dbe3ed', borderRadius: 4 }}>
          <strong style={{ fontSize: 12 }}>{isFloor ? 'พื้นสถาปัตย์' : 'ฝ้าเพดาน'} {String(data.mark ?? '')}</strong>
          <button type="button" onClick={onOpenTypeManager} style={verticalSelectStyle}>{data.type_id ? 'เลือก / แก้ไขชนิดในคลัง' : 'เลือกชนิดจากคลัง'}</button>
          <button type="button" onClick={() => onDrawSurfaceVoid(architectureSurfaceObj.id)} style={verticalSelectStyle}>{isFloor ? 'วาดช่องเจาะพื้นสถาปัตย์' : 'วาดช่องเจาะฝ้า'}</button>
          <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>อ้างอิงระดับชั้น
            <select aria-label="ระดับอ้างอิงพื้นหรือฝ้า" value={levelId} disabled={!onUpdateArchitectureSurface || (data.follows_room_boundary === true && typeof data.room_id === 'string')} onChange={event => update({ level_id: event.target.value })} style={verticalSelectStyle}>
              {project.levels.map(item => <option key={item.id} value={item.id}>{item.name} · {(item.elevation_mm / 1000).toFixed(3)} m</option>)}
            </select>
            {data.follows_room_boundary === true && typeof data.room_id === 'string' && <small>ระดับตามห้องที่ผูกอยู่</small>}
          </label>
          <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>เยื้องจากระดับชั้น ({displayUnit})
            <LengthInput aria-label={`ระยะเยื้องพื้นหรือฝ้า (${displayUnit})`} value={offset} unit={displayUnit} onChange={value => update({ elevation_offset_mm: value })} style={verticalSelectStyle} />
          </label>
          <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>ความหนา ({displayUnit})
            <LengthInput aria-label={`ความหนาพื้นหรือฝ้า (${displayUnit})`} value={Number(data.thickness_mm ?? 0)} unit={displayUnit} onChange={value => update({ thickness_mm: value })} style={verticalSelectStyle} />
          </label>
          {!isFloor && <>
            <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>วัสดุฝ้า
              <input aria-label="วัสดุฝ้า" defaultValue={String(data.material ?? '')} key={`${architectureSurfaceObj.id}:${String(data.material ?? '')}`} onBlur={event => { const value = event.currentTarget.value.trim(); if (value) update({ material: value }) }} style={verticalSelectStyle} />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
              <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>กริด X ({displayUnit})
                <LengthInput aria-label={`ระยะกริดฝ้า X (${displayUnit})`} value={Number((data.grid_mm as number[] | undefined)?.[0] ?? 600)} unit={displayUnit} onChange={value => update({ grid_mm: [value, Number((data.grid_mm as number[] | undefined)?.[1] ?? 600)] })} style={verticalSelectStyle} />
              </label>
              <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>กริด Y ({displayUnit})
                <LengthInput aria-label={`ระยะกริดฝ้า Y (${displayUnit})`} value={Number((data.grid_mm as number[] | undefined)?.[1] ?? 600)} unit={displayUnit} onChange={value => update({ grid_mm: [Number((data.grid_mm as number[] | undefined)?.[0] ?? 600), value] })} style={verticalSelectStyle} />
              </label>
            </div>
          </>}
          {isFloor && <>
            <details className="cf-inspector-section">
            <summary>รายละเอียดผิวพื้น · {layers.length} ชั้น · ลาย {Number((data.finish_pattern_mm as number[] | undefined)?.[0] ?? 600)} × {Number((data.finish_pattern_mm as number[] | undefined)?.[1] ?? 600)} มม.</summary>
            <strong style={{ fontSize: 11, marginTop: 3 }}>ชั้นวัสดุปูพื้น</strong>
            {layers.map((layer, index) => <div key={`${architectureSurfaceObj.id}:layer:${index}`} style={{ display: 'grid', gridTemplateColumns: '1fr 0.65fr 0.55fr auto', gap: 4, alignItems: 'center' }}>
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
              <button type="button" aria-label={`ลบชั้นพื้น ${index + 1}`} onClick={() => update({ finish_layers: layers.filter((_, i) => i !== index).map(current => ({ material: String(current.material ?? 'unspecified'), thickness_mm: Number(current.thickness_mm ?? 0), ...(current.mark ? { mark: current.mark } : {}), ...(current.quantity_unit ? { quantity_unit: current.quantity_unit } : {}) })) })} style={{ ...verticalSelectStyle, color: '#b91c1c', padding: 4 }}>×</button>
            </div>)}
            <button type="button" onClick={() => update({ finish_layers: [...layers, { material: 'tile', thickness_mm: 10, mark: `ชั้น ${layers.length + 1}`, quantity_unit: 'm2' as const }].map(layer => ({ material: String(layer.material ?? 'unspecified'), thickness_mm: Number(layer.thickness_mm ?? 0), ...(layer.mark ? { mark: layer.mark } : {}), ...(layer.quantity_unit === 'm2' || layer.quantity_unit === 'm3' ? { quantity_unit: layer.quantity_unit } : {}) })) })} style={verticalSelectStyle}>+ เพิ่มชั้นวัสดุ</button>
            <strong style={{ fontSize: 11, marginTop: 3 }}>แนวลายปูวัสดุ</strong>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
              <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>ขนาด X ({displayUnit})
                <LengthInput aria-label={`ขนาดลายพื้น X (${displayUnit})`} value={Number((data.finish_pattern_mm as number[] | undefined)?.[0] ?? 600)} unit={displayUnit} onChange={value => update({ finish_pattern_mm: [value, Number((data.finish_pattern_mm as number[] | undefined)?.[1] ?? 600)] })} style={verticalSelectStyle} />
              </label>
              <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>ขนาด Y ({displayUnit})
                <LengthInput aria-label={`ขนาดลายพื้น Y (${displayUnit})`} value={Number((data.finish_pattern_mm as number[] | undefined)?.[1] ?? 600)} unit={displayUnit} onChange={value => update({ finish_pattern_mm: [Number((data.finish_pattern_mm as number[] | undefined)?.[0] ?? 600), value] })} style={verticalSelectStyle} />
              </label>
              <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>จุดเริ่ม X ({displayUnit})
                <LengthInput aria-label={`จุดเริ่มลายพื้น X (${displayUnit})`} value={Number((data.finish_pattern_origin_mm as number[] | undefined)?.[0] ?? 0)} unit={displayUnit} onChange={value => update({ finish_pattern_origin_mm: [value, Number((data.finish_pattern_origin_mm as number[] | undefined)?.[1] ?? 0)] })} style={verticalSelectStyle} />
              </label>
              <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>จุดเริ่ม Y ({displayUnit})
                <LengthInput aria-label={`จุดเริ่มลายพื้น Y (${displayUnit})`} value={Number((data.finish_pattern_origin_mm as number[] | undefined)?.[1] ?? 0)} unit={displayUnit} onChange={value => update({ finish_pattern_origin_mm: [Number((data.finish_pattern_origin_mm as number[] | undefined)?.[0] ?? 0), value] })} style={verticalSelectStyle} />
              </label>
            </div>
            <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>หมุนแนวลาย (องศา)
              <input aria-label="หมุนแนวลายพื้น องศา" type="number" step="1" value={Number(data.finish_pattern_rotation_deg ?? 0)} onChange={event => update({ finish_pattern_rotation_deg: Number(event.target.value) })} style={verticalSelectStyle} />
            </label>
            </details>
          </>}
          <small style={{ fontSize: 10, color: '#64748b' }}>ระดับจริง {resolvedElevation === undefined ? 'ไม่ถูกต้อง' : `${formatLengthMm(resolvedElevation, displayUnit)} ${displayUnit}`} · ช่องเจาะ {Array.isArray(data.voids_mm) ? data.voids_mm.length : 0}</small>
        </section>
      })()}
    </>
  )
}
