import React, { useMemo, useState } from 'react'
import type { ProjectDocument, SmartObject } from '@constructflow/project-model'
import { Eye, EyeOff, Search } from 'lucide-react'

const familyLabels: Record<string, string> = {
  'structure.grid': 'กริด', 'structure.column': 'เสา', 'structure.foundation': 'ฐานราก',
  'structure.beam': 'คาน', 'structure.slab': 'พื้นโครงสร้าง', 'architecture.wall': 'ผนัง',
  'architecture.floor': 'พื้นสถาปัตย์', 'architecture.ceiling': 'ฝ้า', 'architecture.room': 'ห้อง',
  'architecture.room_separator': 'เส้นแบ่งห้อง', 'architecture.stair': 'บันได',
  'door_window.door': 'ประตู', 'door_window.window': 'หน้าต่าง', 'roof.system': 'หลังคา',
  'plumbing.pipe_route': 'แนวท่อ', 'drainage.pipe_route': 'แนวท่อระบายน้ำ',
  'electrical.fixture': 'อุปกรณ์ไฟฟ้า', 'interior.cabinet_run': 'บิลท์อิน',
  'decorative.moulding_run': 'แนวบัว',
}

const objectLabel = (object: SmartObject) => {
  const data = object.module_data as Record<string, unknown>
  const mark = data.mark ?? data.tag ?? data.name ?? data.type_mark
  return `${familyLabels[object.object_type] ?? object.object_type} · ${String(mark ?? object.id.slice(0, 8))}`
}

interface ProjectBrowserProps {
  project: ProjectDocument
  selectedIds: string[]
  hiddenObjectIds: ReadonlySet<string>
  activeLevelId: string
  activeViewId: string
  onSelectLevel: (levelId: string) => void
  onSelectView: (viewId: string) => void
  onSelectObjects: (ids: string[]) => void
  onToggleVisibility: (objectId: string) => void
  onShowAll: () => void
  onArrayObjects: (objectIds: string[], copies: number, deltaXmm: number, deltaYmm: number) => void
  onMoveObjects: (objectIds: string[], deltaXmm: number, deltaYmm: number) => void
}

export const ProjectBrowser: React.FC<ProjectBrowserProps> = ({ project, selectedIds, hiddenObjectIds, activeLevelId, activeViewId, onSelectLevel, onSelectView, onSelectObjects, onToggleVisibility, onShowAll, onArrayObjects, onMoveObjects }) => {
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<'level' | 'all'>('level')
  const [copies, setCopies] = useState('2')
  const [spacingX, setSpacingX] = useState('1')
  const [spacingY, setSpacingY] = useState('0')
  const [moveX, setMoveX] = useState('0')
  const [moveY, setMoveY] = useState('0')
  const objects = useMemo(() => Object.values(project.objects)
    .filter(object => scope === 'all' || object.level_refs?.some(reference => reference.level_id === activeLevelId) || !object.level_refs?.length)
    .filter(object => !query.trim() || `${objectLabel(object)} ${object.id}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.object_type.localeCompare(b.object_type) || objectLabel(a).localeCompare(objectLabel(b))),
  [project.objects, activeLevelId, scope, query])
  const groups = useMemo(() => {
    const grouped = new Map<string, SmartObject[]>()
    for (const object of objects) grouped.set(object.object_type, [...(grouped.get(object.object_type) ?? []), object])
    return [...grouped.entries()]
  }, [objects])

  return <section className="cf-project-browser" aria-label="Project Browser">
    <div className="cf-browser-toolbar">
      <label className="cf-browser-search"><Search size={14} /><input aria-label="ค้นหาวัตถุในโครงการ" value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหาวัตถุ…" /></label>
      <button type="button" onClick={onShowAll} disabled={!hiddenObjectIds.size} title="แสดงวัตถุทั้งหมด">แสดงทั้งหมด</button>
    </div>
    <div className="cf-browser-scope" role="group" aria-label="ขอบเขตรายการวัตถุ">
      <button type="button" className={scope === 'level' ? 'is-active' : ''} onClick={() => setScope('level')}>ชั้นปัจจุบัน</button>
      <button type="button" className={scope === 'all' ? 'is-active' : ''} onClick={() => setScope('all')}>ทั้งโครงการ</button>
    </div>
    <nav className="cf-browser-levels" aria-label="ระดับอาคาร">
      {project.levels.map(level => <button key={level.id} type="button" className={activeLevelId === level.id ? 'is-active' : ''} onClick={() => onSelectLevel(level.id)}>{level.name}</button>)}
    </nav>
    <nav className="cf-browser-views" aria-label="มุมมองโครงการ">
      {([['plan', 'แปลน'], ['framing', 'แปลนคาน'], ['roofplan', 'แปลนหลังคา'], ['north', 'เหนือ'], ['south', 'ใต้'], ['east', 'ตะวันออก'], ['west', 'ตะวันตก'], ['rcp', 'RCP'], ['model3d', '3D']] as const).map(([id, label]) => <button key={id} type="button" className={activeViewId === id ? 'is-active' : ''} onClick={() => onSelectView(id)}>{label}</button>)}
    </nav>
    {selectedIds.length > 0 && <form className="cf-browser-array" onSubmit={event => {
      event.preventDefault()
      const count = Math.trunc(Number(copies)), dx = Number(spacingX) * 1000, dy = Number(spacingY) * 1000
      if (Number.isInteger(count) && count >= 1 && count <= 100 && Number.isFinite(dx) && Number.isFinite(dy) && Math.hypot(dx, dy) > 0) onArrayObjects(selectedIds, count, Math.round(dx), Math.round(dy))
    }}>
      <strong>อาร์เรย์ชุดที่เลือก</strong>
      <div><label>สำเนา<input aria-label="จำนวนสำเนาในอาร์เรย์" type="number" min="1" max="100" step="1" value={copies} onChange={event => setCopies(event.target.value)} /></label><label>ΔX (m)<input aria-label="ระยะอาร์เรย์แกน X เมตร" type="number" step="0.1" value={spacingX} onChange={event => setSpacingX(event.target.value)} /></label><label>ΔY (m)<input aria-label="ระยะอาร์เรย์แกน Y เมตร" type="number" step="0.1" value={spacingY} onChange={event => setSpacingY(event.target.value)} /></label></div>
      <button type="submit" disabled={!selectedIds.some(id => project.objects[id])}>สร้างสำเนา</button>
      <small>ทุกสำเนารวมอยู่ใน Undo เดียว · UUID ใหม่อัตโนมัติ</small>
    </form>}
    {selectedIds.length > 0 && <form className="cf-browser-array cf-browser-move" onSubmit={event => {
      event.preventDefault()
      const dx = Number(moveX) * 1000, dy = Number(moveY) * 1000
      if (Number.isFinite(dx) && Number.isFinite(dy) && Math.hypot(dx, dy) > 0) onMoveObjects(selectedIds, Math.round(dx), Math.round(dy))
    }}>
      <strong>ย้ายที่เลือกด้วยระยะกำหนด</strong>
      <div><label>ΔX (m)<input aria-label="ระยะย้ายแกน X เมตร" type="number" step="0.001" value={moveX} onChange={event => setMoveX(event.target.value)} /></label><label>ΔY (m)<input aria-label="ระยะย้ายแกน Y เมตร" type="number" step="0.001" value={moveY} onChange={event => setMoveY(event.target.value)} /></label></div>
      <button type="submit">ย้ายตามระยะ · Undo ได้</button>
      <small>ย้ายวัตถุที่เลือกพร้อมความสัมพันธ์แบบ host ในคำสั่งเดียว</small>
    </form>}
    <div className="cf-browser-tree" role="tree" aria-label="รายการวัตถุ">
      {!groups.length && <p className="cf-browser-empty">ไม่พบวัตถุ</p>}
      {groups.map(([family, members]) => <details key={family} open>
        <summary role="treeitem" aria-expanded="true"><span>{familyLabels[family] ?? family}</span><small>{members.length}</small></summary>
        <ul role="group">{members.map(object => {
          const hidden = hiddenObjectIds.has(object.id)
          const selected = selectedIds.includes(object.id)
          return <li key={object.id} className={selected ? 'is-selected' : ''}>
            <button type="button" className="cf-browser-object" role="treeitem" aria-selected={selected} title={`${objectLabel(object)} · ${object.id} · Ctrl/⌘-คลิกเพื่อเลือกหลายชิ้น`} onClick={event => {
              if (event.ctrlKey || event.metaKey || event.shiftKey) onSelectObjects(selected ? selectedIds.filter(id => id !== object.id) : [...selectedIds, object.id])
              else onSelectObjects([object.id])
            }}>
              <span className={`cf-browser-phase phase-${object.created_phase}`}></span><span>{objectLabel(object).split(' · ').slice(1).join(' · ')}</span>
            </button>
            <button type="button" className="cf-browser-visibility" aria-label={`${hidden ? 'แสดง' : 'ซ่อน'} ${objectLabel(object)}`} title={hidden ? 'แสดงวัตถุ' : 'ซ่อนวัตถุ'} onClick={() => onToggleVisibility(object.id)}>{hidden ? <EyeOff size={14} /> : <Eye size={14} />}</button>
          </li>
        })}</ul>
      </details>)}
    </div>
  </section>
}
