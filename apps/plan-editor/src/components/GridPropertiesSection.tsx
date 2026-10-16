import React from 'react'
import { ProjectDocument, SmartObject, formatLengthMm, isGridObject, parseLengthMm, type DisplayLengthUnit } from '@constructflow/project-model'

type GridPropertiesSectionProps = {
  project: ProjectDocument
  grid: SmartObject | null
  selectedId: string | null
  displayUnit: DisplayLengthUnit
  onUpdateGridTag: (objectId: string, tag: string) => void
  onModifyGrid: (objectId: string, changes: { start_point_mm?: [number, number]; end_point_mm?: [number, number]; bubble_visible?: boolean; auto_tag?: boolean; sequence_style?: 'auto' | 'alpha' | 'numeric' }) => void
  onUpdateGridSystem: (systemId: string, changes: { positions_mm?: number[]; first_tag?: string }) => void
}

export const GridPropertiesSection: React.FC<GridPropertiesSectionProps> = ({ project, grid, selectedId, displayUnit, onUpdateGridTag, onModifyGrid, onUpdateGridSystem }) => {
  const grdObj = grid && isGridObject(grid) ? grid : null
  const verticalSelectStyle: React.CSSProperties = { width: '100%', background: '#fff', border: '1px solid #dce4ed', borderRadius: 3, padding: 5, color: '#24364b' }
  return (
    <>
      {grdObj && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={{ fontSize: 11, color: '#52677d', fontWeight: 600 }}>
            GRID LINE POSITION
          </label>
          <div style={{ background: '#f5f8fc', padding: '4px 6px', borderRadius: 3, fontSize: 12 }}>
            {grdObj.module_data.start_point_mm && grdObj.module_data.end_point_mm
              ? <>แนวอ้างอิงจาก {grdObj.module_data.start_point_mm.map(value => formatLengthMm(value, displayUnit)).join(', ')} ถึง {grdObj.module_data.end_point_mm.map(value => formatLengthMm(value, displayUnit)).join(', ')} {displayUnit}</>
              : <>{grdObj.module_data.orientation === 'vertical' ? 'X = ' : 'Y = '}<b>{formatLengthMm(grdObj.module_data.position_mm, displayUnit)} {displayUnit}</b></>}
          </div>
          {grdObj.module_data.system_id && (() => {
            const members = Object.values(project.objects).filter(isGridObject).filter(object => object.module_data.system_id === grdObj.module_data.system_id).sort((a, b) => (a.module_data.system_index ?? 0) - (b.module_data.system_index ?? 0))
            const positions = members.map(member => member.module_data.position_mm)
            return <section key={`${grdObj.module_data.system_id}:${selectedId}`} style={{ display: 'grid', gap: 5, marginTop: 7, padding: 6, background: '#f5f8fc', border: '1px solid #e5edf5', borderRadius: 3 }}>
            <strong style={{ fontSize: 12 }}>ระบบ Grid Line · {members.length} เส้น</strong>
            <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>ตำแหน่งทุกเส้น ({displayUnit} คั่นด้วยจุลภาค)
              <input aria-label={`ตำแหน่งทุกเส้นในระบบกริด (${displayUnit})`} defaultValue={positions.map(value => formatLengthMm(value, displayUnit)).join(', ')} onBlur={event => {
                const tokens = event.target.value.split(/[\s,;]+/).filter(value => value.trim() !== '')
                const values = tokens.map(value => parseLengthMm(value.trim(), displayUnit))
                if (values.length && values.length <= 100 && values.every(value => value !== null && Number.isFinite(value)) && values.every((value, index) => index === 0 || value! > values[index - 1]!)) onUpdateGridSystem(grdObj.module_data.system_id!, { positions_mm: values as number[] })
              }} style={verticalSelectStyle} />
            </label>
            <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>ป้ายเส้นแรก
              <input aria-label="ป้ายกริดเส้นแรกในชุด" defaultValue={grdObj.module_data.system_first_tag ?? grdObj.module_data.tag} onBlur={event => {
                const value = event.target.value.trim(); if (value) onUpdateGridSystem(grdObj.module_data.system_id!, { first_tag: value })
              }} style={verticalSelectStyle} />
            </label>
            <small style={{ fontSize: 10, color: '#64748b' }}>ลากเส้นบนแปลนเพื่อปรับช่วงระยะ · ไม่ข้ามเส้นข้างเคียง · Ctrl วางอิสระ · Esc ยกเลิก</small>
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
            return <section style={{ display: 'grid', gap: 6, marginTop: 7, padding: 6, background: '#f5f8fc', border: '1px solid #e5edf5', borderRadius: 3 }}>
              <strong style={{ fontSize: 12 }}>เส้นกริดอ้างอิง</strong>
              <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>มุมเอียง (องศา)
                <input aria-label="มุมเอียงเส้นกริดองศา" aria-describedby="grid-angle-key-help" type="number" step="0.1" defaultValue={Number(angle.toFixed(1))} key={`${grdObj.id}:${Math.round(angle * 10) / 10}`} onFocus={event => event.currentTarget.select()} onKeyDown={event => {
                  if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() }
                  if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.value = angle.toFixed(1); event.currentTarget.blur() }
                }} onBlur={event => rotateTo(Number(event.target.value))} style={verticalSelectStyle} />
                <small id="grid-angle-key-help" style={{ fontSize: 10, color: '#64748b' }}>0° ไปทางขวา · 90° ขึ้น · Enter บันทึก · Esc คืนค่าเดิม</small>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#52677d' }}><input type="checkbox" checked={data.bubble_visible !== false} onChange={event => onModifyGrid(grdObj.id, { bubble_visible: event.target.checked })} />แสดง Bubble</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#52677d' }}><input type="checkbox" checked={data.auto_tag !== false} onChange={event => onModifyGrid(grdObj.id, { auto_tag: event.target.checked })} />รันป้ายอัตโนมัติ</label>
              {data.auto_tag === false && <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>ป้ายกำกับ
                <input aria-label="ป้ายกำกับกริด" defaultValue={data.tag} onBlur={event => { if (event.target.value.trim()) onUpdateGridTag(grdObj.id, event.target.value) }} style={verticalSelectStyle} />
              </label>}
              <label style={{ display: 'grid', gap: 3, fontSize: 10, color: '#52677d' }}>รูปแบบเลข/ตัวอักษร
                <select aria-label="รูปแบบลำดับป้ายกริด" value={data.sequence_style ?? 'auto'} onChange={event => onModifyGrid(grdObj.id, { sequence_style: event.target.value as 'auto' | 'alpha' | 'numeric' })} style={verticalSelectStyle}>
                  <option value="auto">อัตโนมัติ (ตั้ง A / นอน 1)</option><option value="alpha">ตัวอักษร A, B, C</option><option value="numeric">ตัวเลข 1, 2, 3</option>
                </select>
              </label>
              <small style={{ fontSize: 10, color: '#64748b' }}>เส้นที่ปิด Bubble จะไม่ถูกนับในลำดับอัตโนมัติ · ลากเส้นบนแปลนเพื่อย้าย</small>
            </section>
          })()}
        </div>
      )}
    </>
  )
}
