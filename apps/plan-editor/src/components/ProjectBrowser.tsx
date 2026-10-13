import React, { useMemo, useState } from 'react'
import type { ProjectDocument, ProjectViewTemplate, SmartObject } from '@constructflow/project-model'
import { Eye, EyeOff, Search } from 'lucide-react'
import type { AlignmentMode } from '../app/transformOperations.mjs'

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
  viewTemplates: readonly ProjectViewTemplate[]
  onSelectLevel: (levelId: string) => void
  onSelectView: (viewId: string) => void
  onSaveViewTemplate: (name: string) => boolean
  onApplyViewTemplate: (template: ProjectViewTemplate) => boolean
  onDeleteViewTemplate: (templateId: string) => boolean
  onSelectObjects: (ids: string[]) => void
  onToggleVisibility: (objectId: string) => void
  onShowAll: () => void
  onPreviewArray: (objectIds: string[], copies: number, deltaXmm: number, deltaYmm: number) => void
  onMoveObjects: (objectIds: string[], deltaXmm: number, deltaYmm: number) => void
  onPreviewAlignment: (objectIds: string[], mode: AlignmentMode) => void
  onPreviewOffset: (objectIds: string[], distanceMm: number, side: 'left' | 'right') => void
  onPreviewMirror: (objectIds: string[], axis: 'vertical' | 'horizontal') => void
  onPreviewSplit: (objectId: string, ratio: number) => void
  onPreviewJoin: (objectIds: string[]) => void
  onPreviewTrim: (objectIds: string[], removeEnd: 'start' | 'end') => void
  onCommitAlignment: () => void
  onCancelAlignment: () => void
  alignmentPreviewActive: boolean
}

export const ProjectBrowser: React.FC<ProjectBrowserProps> = ({ project, selectedIds, hiddenObjectIds, activeLevelId, activeViewId, viewTemplates, onSelectLevel, onSelectView, onSaveViewTemplate, onApplyViewTemplate, onDeleteViewTemplate, onSelectObjects, onToggleVisibility, onShowAll, onPreviewArray, onMoveObjects, onPreviewAlignment, onPreviewOffset, onPreviewMirror, onPreviewSplit, onPreviewJoin, onPreviewTrim, onCommitAlignment, onCancelAlignment, alignmentPreviewActive }) => {
  const [query, setQuery] = useState('')
  const [viewTemplateName, setViewTemplateName] = useState('')
  const [viewTemplateFeedback, setViewTemplateFeedback] = useState('')
  const [scope, setScope] = useState<'level' | 'all'>('level')
  const [copies, setCopies] = useState('2')
  const [spacingX, setSpacingX] = useState('1')
  const [spacingY, setSpacingY] = useState('0')
  const [moveX, setMoveX] = useState('0')
  const [moveY, setMoveY] = useState('0')
  const [alignmentMode, setAlignmentMode] = useState<AlignmentMode>('left')
  const [offsetDistance, setOffsetDistance] = useState('0.25')
  const [offsetSide, setOffsetSide] = useState<'left' | 'right'>('left')
  const [mirrorAxis, setMirrorAxis] = useState<'vertical' | 'horizontal'>('vertical')
  const [splitPosition, setSplitPosition] = useState('50')
  const [trimEnd, setTrimEnd] = useState<'start' | 'end'>('start')
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
    <section className="cf-browser-view-templates" aria-label="แม่แบบมุมมอง">
      <form onSubmit={event => {
        event.preventDefault()
        const name = viewTemplateName.trim()
        if (!name) return
        const saved = onSaveViewTemplate(name)
        setViewTemplateFeedback(saved ? `บันทึกแม่แบบ “${name}” แล้ว` : 'บันทึกแม่แบบไม่สำเร็จ')
        if (saved) setViewTemplateName('')
      }}>
        <label>บันทึกมุมมองปัจจุบัน<input aria-label="ชื่อแม่แบบมุมมอง" maxLength={80} value={viewTemplateName} onChange={event => setViewTemplateName(event.target.value)} placeholder="เช่น แปลนงานระบบ ชั้น 1" /></label>
        <button type="submit" disabled={!viewTemplateName.trim()}>บันทึกแม่แบบ</button>
      </form>
      {viewTemplateFeedback && <small role="status">{viewTemplateFeedback}</small>}
      {viewTemplates.length > 0 && <ul aria-label="แม่แบบมุมมองที่บันทึกไว้">
        {viewTemplates.map(template => <li key={template.id} data-view-template-id={template.id}>
          <span>{template.name}<small>{template.view_id} · {project.levels.find(level => level.id === template.level_id)?.name ?? template.level_id}</small></span>
          <button type="button" aria-label={`ใช้แม่แบบ ${template.name}`} onClick={() => setViewTemplateFeedback(onApplyViewTemplate(template) ? `ใช้แม่แบบ “${template.name}” แล้ว` : 'ใช้แม่แบบไม่สำเร็จ')}>ใช้</button>
          <button type="button" aria-label={`ลบแม่แบบ ${template.name}`} onClick={() => setViewTemplateFeedback(onDeleteViewTemplate(template.id) ? `ลบแม่แบบ “${template.name}” แล้ว` : 'ลบแม่แบบไม่สำเร็จ')}>ลบ</button>
        </li>)}
      </ul>}
    </section>
    {selectedIds.length > 0 && !alignmentPreviewActive && <details className="cf-browser-edit-tools">
      <summary>แก้ไขและทำสำเนา · {selectedIds.length} ชิ้น</summary>
    {selectedIds.length > 0 && <form className="cf-browser-array" onSubmit={event => {
      event.preventDefault()
      const count = Math.trunc(Number(copies)), dx = Number(spacingX) * 1000, dy = Number(spacingY) * 1000
      if (Number.isInteger(count) && count >= 1 && count <= 100 && Number.isFinite(dx) && Number.isFinite(dy) && Math.hypot(dx, dy) > 0) onPreviewArray(selectedIds, count, Math.round(dx), Math.round(dy))
    }}>
      <strong>อาร์เรย์ชุดที่เลือก</strong>
      <div><label>สำเนา<input aria-label="จำนวนสำเนาในอาร์เรย์" type="number" min="1" max="100" step="1" value={copies} onChange={event => setCopies(event.target.value)} /></label><label>ΔX (m)<input aria-label="ระยะอาร์เรย์แกน X เมตร" type="number" step="0.1" value={spacingX} onChange={event => setSpacingX(event.target.value)} /></label><label>ΔY (m)<input aria-label="ระยะอาร์เรย์แกน Y เมตร" type="number" step="0.1" value={spacingY} onChange={event => setSpacingY(event.target.value)} /></label></div>
      <button type="submit" disabled={!selectedIds.some(id => project.objects[id])}>แสดงตัวอย่างอาร์เรย์</button>
      <small>ตรวจตำแหน่งก่อนยืนยัน · ทุกสำเนารวมอยู่ใน Undo เดียว</small>
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
    {selectedIds.length > 1 && <form className="cf-browser-array cf-browser-align" onSubmit={event => {
      event.preventDefault()
      onPreviewAlignment(selectedIds, alignmentMode)
    }}>
      <strong>จัดแนวกับวัตถุที่เลือกชิ้นแรก</strong>
      <label>แนวจัดวาง<select aria-label="แนวจัดวัตถุที่เลือก" value={alignmentMode} onChange={event => setAlignmentMode(event.target.value as AlignmentMode)}>
        <option value="left">ชิดซ้าย</option><option value="center-x">กึ่งกลางแนวตั้ง</option><option value="right">ชิดขวา</option>
        <option value="top">ชิดด้านบน</option><option value="middle-y">กึ่งกลางแนวนอน</option><option value="bottom">ชิดด้านล่าง</option>
      </select></label>
      <button type="submit">แสดงตัวอย่างการจัดแนว</button>
      <small>ชิ้นแรกเป็นวัตถุอ้างอิง · preview ก่อนแก้โมเดล</small>
    </form>}
    {selectedIds.length > 0 && <form className="cf-browser-array cf-browser-align" onSubmit={event => {
      event.preventDefault()
      const distanceMm = Number(offsetDistance) * 1000
      if (Number.isFinite(distanceMm) && Math.abs(distanceMm) >= 1) onPreviewOffset(selectedIds, Math.round(distanceMm), offsetSide)
    }}>
      <strong>Offset เส้นที่เลือก</strong>
      <div className="cf-browser-offset-fields"><label>ระยะ (m)<input aria-label="ระยะ Offset เมตร" type="number" step="0.01" value={offsetDistance} onChange={event => setOffsetDistance(event.target.value)} /></label><label>ด้าน<select aria-label="ด้าน Offset" value={offsetSide} onChange={event => setOffsetSide(event.target.value as 'left' | 'right')}><option value="left">ซ้ายตามทิศวาด</option><option value="right">ขวาตามทิศวาด</option></select></label></div>
      <button type="submit">แสดงตัวอย่าง Offset</button>
      <small>รองรับผนัง คาน กริด และเส้นแบ่งห้อง · ระยะวัดตั้งฉากจากเส้นเดิม</small>
    </form>}
    {selectedIds.length > 1 && <form className="cf-browser-array cf-browser-align" onSubmit={event => {
      event.preventDefault()
      onPreviewMirror(selectedIds, mirrorAxis)
    }}>
      <strong>Mirror รอบแนวแกนผ่านชิ้นแรก</strong>
      <label>แนวแกน<select aria-label="แนวแกน Mirror" value={mirrorAxis} onChange={event => setMirrorAxis(event.target.value as 'vertical' | 'horizontal')}><option value="vertical">แกนตั้ง · กลับซ้าย/ขวา</option><option value="horizontal">แกนนอน · กลับบน/ล่าง</option></select></label>
      <button type="submit">แสดงตัวอย่าง Mirror</button>
      <small>คง UUID เดิม · รองรับเส้นที่ไม่มี host หรือ grid system</small>
    </form>}
    {selectedIds.length === 1 && <form className="cf-browser-array cf-browser-align" onSubmit={event => {
      event.preventDefault()
      const ratio = Number(splitPosition) / 100
      if (Number.isFinite(ratio) && ratio > 0 && ratio < 1) onPreviewSplit(selectedIds[0], ratio)
    }}>
      <strong>Split เส้นที่เลือก</strong>
      <label>ตำแหน่งจากจุดเริ่ม (%)<input aria-label="ตำแหน่ง Split เปอร์เซ็นต์" type="number" min="1" max="99" step="1" value={splitPosition} onChange={event => setSplitPosition(event.target.value)} /></label>
      <button type="submit">แสดงตัวอย่าง Split</button>
      <small>ผนัง คาน และเส้นแบ่งห้อง · รักษา UUID ของช่วงเดิม · Undo เป็นรายการเดียว</small>
    </form>}
    {selectedIds.length === 2 && <form className="cf-browser-array cf-browser-align" onSubmit={event => {
      event.preventDefault()
      onPreviewJoin(selectedIds)
    }}>
      <strong>Join สองเส้นที่เลือก</strong>
      <button type="submit">แสดงตัวอย่าง Join</button>
      <small>ต้องเป็นชนิดและข้อมูลเดียวกัน แนวเดียวกัน และปลายเส้นแตะกัน · คง UUID ของชิ้นแรก</small>
    </form>}
    {selectedIds.length === 2 && <form className="cf-browser-array cf-browser-align" onSubmit={event => {
      event.preventDefault()
      onPreviewTrim(selectedIds, trimEnd)
    }}>
      <strong>Trim เส้นแรกด้วยเส้นที่สอง</strong>
      <label>ตัดด้าน<select aria-label="ด้านเส้นที่จะ Trim" value={trimEnd} onChange={event => setTrimEnd(event.target.value as 'start' | 'end')}><option value="start">จุดเริ่มของเส้นแรก</option><option value="end">จุดจบของเส้นแรก</option></select></label>
      <button type="submit">แสดงตัวอย่าง Trim</button>
      <small>เลือกเส้นเป้าหมายก่อน แล้วเลือกเส้นตัด · UUID ของเส้นแรกคงเดิม</small>
    </form>}
    </details>}
    {alignmentPreviewActive && <div className="cf-browser-array cf-browser-align">
      <strong>Preview การแปลง</strong><small>เส้นโครงสีฟ้าคือ preview · ยืนยันจะบันทึกเป็น Undo รายการเดียว</small>
      <div className="cf-browser-transform-actions"><button type="button" onClick={onCommitAlignment}>ยืนยัน · Undo ได้</button><button type="button" onClick={onCancelAlignment}>ยกเลิก</button></div>
    </div>}
    <div className="cf-browser-tree" role="tree" aria-label="รายการวัตถุ">
      {!groups.length && <p className="cf-browser-empty">ไม่พบวัตถุ</p>}
      {groups.map(([family, members]) => <details key={family} open>
        <summary role="treeitem" aria-expanded="true"><span>{familyLabels[family] ?? family}</span><small>{members.length}</small></summary>
        <ul role="group">{members.map(object => {
          const hidden = hiddenObjectIds.has(object.id)
          const selected = selectedIds.includes(object.id)
          return <li key={object.id} data-object-id={object.id} data-object-type={object.object_type} className={selected ? 'is-selected' : ''}>
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
