import type { DisplayLengthUnit, ProjectDocument, StairModuleData } from '@constructflow/project-model'
import { decodeStair, computeStairGeometry } from '@constructflow/architecture-engine'
import { WorkbenchNumberInput } from './WorkbenchNumberInput.js'

export function StairProperties({ project, data, unit, onUpdate }: {
  project: ProjectDocument; data: Record<string, unknown>; unit: DisplayLengthUnit;
  onUpdate: (changes: Partial<StairModuleData>) => void;
}) {
  const stair = decodeStair(data, project)
  const check = computeStairGeometry({ ...stair, has_handrail: false }).code_check
  const style = { width: '100%', background: '#fff', border: '1px solid #dce4ed', borderRadius: 3, padding: 5, color: '#24364b' }
  const length = (label: string, value: number, change: (value: number) => void, disabled = false) =>
    <label style={{ display: 'grid', gap: 3 }}>{label} ({unit})<WorkbenchNumberInput ariaLabel={label} value={value} unit={unit} onChange={change} disabled={disabled} style={style} /></label>
  const levelOptions = project.levels.map(l => <option key={l.id} value={l.id}>{l.name} · {(l.elevation_mm / 1000).toFixed(3)} m</option>)
  return <section aria-label="คุณสมบัติบันได" style={{ display: 'grid', gap: 10, fontSize: 11, color: '#52677d', padding: 8, background: '#f5f8fc', border: '1px solid #dce4ed' }}>
    <strong>บันได {stair.mark}</strong>
    <label>รูปแบบ<select aria-label="รูปแบบบันได" value={stair.stair_type} onChange={e => onUpdate({ stair_type: e.target.value as StairModuleData['stair_type'] })} style={style}>
      <option value="straight">ตรง</option><option value="l_shape">กลับตัว L</option><option value="u_shape">กลับตัว U</option>
    </select></label>
    <label>ระดับเริ่ม<select aria-label="ระดับเริ่มบันได" value={stair.level_id} onChange={e => onUpdate({ level_id: e.target.value })} style={style}>{levelOptions}</select></label>
    {length('เยื้องระดับเริ่มบันได', stair.base_offset_mm ?? 0, v => onUpdate({ base_offset_mm: v }))}
    <label>ระดับจบ<select aria-label="ระดับจบบันได" value={stair.top_level_id ?? ''} onChange={e => onUpdate({ top_level_id: e.target.value })} style={style}>
      <option value="">กำหนดความสูงเอง</option>{levelOptions}
    </select></label>
    {stair.top_level_id ? length('เยื้องระดับจบบันได', stair.top_offset_mm ?? 0, v => onUpdate({ top_offset_mm: v }))
      : length('ความสูงรวมบันได', stair.total_rise_mm, v => onUpdate({ total_rise_mm: v }))}
    <small>เริ่ม {(stair.start_point_mm[2] / 1000).toFixed(3)} → จบ {((stair.start_point_mm[2] + stair.total_rise_mm) / 1000).toFixed(3)} m</small>
    {length('ความกว้างบันได', stair.width_mm, v => onUpdate({ width_mm: v }))}
    <label>จำนวนลูกตั้ง<WorkbenchNumberInput ariaLabel="จำนวนลูกตั้งบันได" value={stair.num_risers} onChange={v => onUpdate({ num_risers: v })} style={style} /></label>
    {length('ความสูงลูกตั้งจริง', stair.total_rise_mm / stair.num_risers, () => {}, true)}
    <small>ความสูงลูกตั้ง = ความสูงรวม ÷ จำนวนลูกตั้ง</small>
    {length('ระยะลูกนอนบันได', stair.tread_depth_mm, v => onUpdate({ tread_depth_mm: v }))}
    {stair.stair_type !== 'straight' && <>
      <label>จำนวนลูกตั้งเที่ยวแรก<WorkbenchNumberInput ariaLabel="จำนวนลูกตั้งเที่ยวแรก" value={stair.first_flight_risers ?? Math.floor(stair.num_risers / 2)} onChange={v => onUpdate({ first_flight_risers: v })} style={style} /></label>
      <small>เที่ยวที่สอง {stair.num_risers - (stair.first_flight_risers ?? Math.floor(stair.num_risers / 2))} ขั้น · ชานพัก +{((stair.start_point_mm[2] + (stair.first_flight_risers ?? Math.floor(stair.num_risers / 2)) * stair.total_rise_mm / stair.num_risers) / 1000).toFixed(3)} m</small>
      {length('ระยะลูกนอนเที่ยวที่สอง', stair.second_tread_depth_mm ?? stair.tread_depth_mm, v => onUpdate({ second_tread_depth_mm: v }))}
      {stair.stair_type === 'u_shape' && length('ช่องกลางระหว่างเที่ยวบันได', stair.flight_gap_mm ?? 100, v => onUpdate({ flight_gap_mm: v }))}
      {length('ความลึกชานพักบันได', stair.landing_depth_mm ?? stair.width_mm, v => onUpdate({ landing_depth_mm: v }))}
      <label>ทิศกลับตัว<select aria-label="ทิศกลับตัวบันได" value={stair.turn_direction ?? 'right'} onChange={e => onUpdate({ turn_direction: e.target.value as 'left' | 'right' })} style={style}><option value="right">ขวา</option><option value="left">ซ้าย</option></select></label>
    </>}
    <label>มุมหมุน (องศา)<WorkbenchNumberInput ariaLabel="มุมหมุนบันได" value={stair.rotation_deg ?? 0} onChange={v => onUpdate({ rotation_deg: v })} style={style} /></label>
    {(['X', 'Y'] as const).map((axis, i) => <div key={axis}>{length(`ตำแหน่งบันได ${axis}`, stair.start_point_mm[i], v => {
      const point: [number, number, number] = [...stair.start_point_mm]; point[i] = v; onUpdate({ start_point_mm: point })
    })}</div>)}
    <label><input aria-label="ราวกันตกบันได" type="checkbox" checked={stair.has_handrail} onChange={e => onUpdate({ has_handrail: e.target.checked })} /> ราวกันตก</label>
    {stair.has_handrail && length('ความสูงราวบันได', stair.handrail_height_mm, v => onUpdate({ handrail_height_mm: v }))}
    {!check.passed && <ul style={{ color: '#a16207', margin: 0, paddingLeft: 16 }}>{check.violations.map(v => <li key={v}>{v}</li>)}</ul>}
  </section>
}
