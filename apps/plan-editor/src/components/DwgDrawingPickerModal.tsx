import React, { useMemo, useRef, useState } from 'react'
import { Check, Crop, FileText, Plus, Trash2, X } from 'lucide-react'
import type { DwgDrawingCandidate } from '../cad/importDwgUnderlay.js'
import { useLegacyModalAccessibility } from './useLegacyModalAccessibility.js'

export interface DwgDrawingSelection {
  candidate: DwgDrawingCandidate
  region?: [number, number, number, number]
  level_id: string
  display_name: string
}

interface DwgDrawingPickerModalProps {
  file: File
  candidates: DwgDrawingCandidate[]
  levels: { id: string; name: string }[]
  activeLevelId: string
  onClose: () => void
  onImport: (selections: DwgDrawingSelection[]) => void
}

interface QueuedDrawing extends DwgDrawingSelection { queueId: string }

const getViewBox = (svg: string) => {
  const root = svg.match(/<svg\b[^>]*>/i)?.[0]
  const text = root?.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1]
  const values = text?.trim().split(/[\s,]+/).map(Number)
  return values?.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0 ? values as [number, number, number, number] : [100, 70, 1000, 700] as [number, number, number, number]
}

const normalizedFileBase = (name: string) => name.replace(/\.[^.]+$/, '')

export const DwgDrawingPickerModal: React.FC<DwgDrawingPickerModalProps> = ({ file, candidates, levels, activeLevelId, onClose, onImport }) => {
  useLegacyModalAccessibility(true, onClose)
  const [selectedId, setSelectedId] = useState(candidates[0]?.id ?? '')
  const [region, setRegion] = useState<[number, number, number, number]>([0, 0, 1, 1])
  const [hasRegionSelection, setHasRegionSelection] = useState(false)
  const [queued, setQueued] = useState<QueuedDrawing[]>([])
  const [draftName, setDraftName] = useState('')
  const [draftLevelId, setDraftLevelId] = useState(activeLevelId)
  const [feedback, setFeedback] = useState('')
  const dragStart = useRef<[number, number] | null>(null)
  const candidate = candidates.find(item => item.id === selectedId) ?? candidates[0]
  const viewBox = useMemo(() => candidate ? getViewBox(candidate.svg) : [0, 0, 1, 1] as [number, number, number, number], [candidate])
  if (!candidate) return null
  const imageRatio = viewBox[2] / viewBox[3]
  const previewUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(candidate.svg)}`

  const pointFromPointer = (event: React.PointerEvent<HTMLDivElement>): [number, number] => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return [Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))]
  }
  const beginCrop = (event: React.PointerEvent<HTMLDivElement>) => {
    if (candidate.kind !== 'model_space') return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragStart.current = pointFromPointer(event)
    setHasRegionSelection(true)
    setRegion([dragStart.current[0], dragStart.current[1], 0, 0])
  }
  const updateCrop = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current || candidate.kind !== 'model_space') return
    const point = pointFromPointer(event)
    const [x, y] = dragStart.current
    setRegion([Math.min(x, point[0]), Math.min(y, point[1]), Math.abs(point[0] - x), Math.abs(point[1] - y)])
  }
  const finishCrop = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return
    updateCrop(event)
    dragStart.current = null
  }
  const addCurrent = () => {
    if (candidate.kind === 'model_space' && !hasRegionSelection) {
      setFeedback('ลากครอบแปลน หรือกด “ทั้งแบบ” ก่อนเพิ่มรายการ')
      return
    }
    const name = draftName.trim() || (candidate.kind === 'paper_space' ? candidate.name : `${normalizedFileBase(file.name)} · แปลน ${queued.filter(item => item.candidate.id === candidate.id).length + 1}`)
    setQueued(current => [...current, {
      queueId: `${candidate.id}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
      candidate,
      ...(candidate.kind === 'model_space' ? { region: [...region] as [number, number, number, number] } : {}),
      level_id: draftLevelId,
      display_name: name,
    }])
    setDraftName('')
    setHasRegionSelection(false)
    setRegion([0, 0, 1, 1])
    setFeedback('')
  }
  const updateQueued = (queueId: string, changes: Partial<Pick<QueuedDrawing, 'level_id' | 'display_name'>>) => {
    setQueued(current => current.map(item => item.queueId === queueId ? { ...item, ...changes } : item))
  }

  return <div className="cf-legacy-dialog" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, zIndex: 2100, background: 'rgba(15,23,42,.62)', display: 'grid', placeItems: 'center', padding: 14 }}>
    <section className="cf-dwg-picker-panel" role="dialog" aria-modal="true" aria-label="เลือกแปลนจาก DWG หรือ DXF" tabIndex={-1} style={{ width: 'min(980px, 100%)', maxHeight: 'min(94dvh, 940px)', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#fff', color: '#0f172a', borderRadius: 14, boxShadow: '0 24px 80px rgba(15,23,42,.28)' }}>
      <header style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #e2e8f0' }}>
        <span style={{ width: 38, height: 38, borderRadius: 11, background: '#e0f2fe', color: '#0369a1', display: 'grid', placeItems: 'center' }}><FileText size={20}/></span>
        <div style={{ flex: 1, minWidth: 0 }}><h2 style={{ margin: 0, fontSize: 17 }}>แยกแปลนจากไฟล์</h2><div style={{ color: '#64748b', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name} · {candidates.length} Layout/พื้นที่</div></div>
        <button type="button" onClick={onClose} aria-label="ปิด" style={{ border: 0, background: 'transparent', color: '#64748b', padding: 8 }}><X size={20}/></button>
      </header>
      <div className="cf-dwg-picker-body" style={{ padding: 16, gap: 16, minHeight: 0, overflow: 'auto' }}>
        <nav className="cf-dwg-picker-list" aria-label="รายการ Model Space และ Layout" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {candidates.map(item => <button key={item.id} type="button" aria-pressed={selectedId === item.id} onClick={() => { setSelectedId(item.id); setRegion([0, 0, 1, 1]); setHasRegionSelection(false); setDraftName(''); setFeedback('') }} style={{ textAlign: 'left', borderRadius: 10, border: selectedId === item.id ? '2px solid #0284c7' : '1px solid #cbd5e1', background: selectedId === item.id ? '#f0f9ff' : '#fff', padding: '10px 12px', color: '#0f172a', minHeight: 58 }}>
            <strong style={{ display: 'block', fontSize: 14 }}>{item.name}</strong><span style={{ color: '#64748b', fontSize: 12 }}>{item.kind === 'model_space' ? 'Model Space · ครอบได้หลายแปลน' : 'Paper Space Layout'} · {item.entityCount} เส้น · {item.layers?.length ?? 0} layers{item.unsupportedEntities ? ` · ข้าม ${item.unsupportedEntities}` : ''}</span>
          </button>)}
          <p style={{ margin: '4px 2px', color: '#64748b', fontSize: 12, lineHeight: 1.5 }}>เลือก Layout หรือครอบพื้นที่ใน Model Space แล้วเพิ่มเป็นรายการแยก กำหนดชั้นให้แต่ละแปลนได้</p>
        </nav>
        <div className="cf-dwg-picker-stage" style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: '#475569', fontSize: 13 }}>
            <Crop size={16}/><span>{candidate.kind === 'model_space' ? 'ลากครอบแปลนที่ต้องการ' : 'เลือก Layout นี้เพื่อเพิ่มเป็นแปลนแยก'}</span>
            {candidate.kind === 'model_space' && <button type="button" onClick={() => { setRegion([0, 0, 1, 1]); setHasRegionSelection(true) }} style={{ marginLeft: 'auto', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', borderRadius: 7, padding: '6px 9px' }}>ทั้งแบบ</button>}
          </div>
          <div className="cf-dwg-picker-preview" style={{ aspectRatio: `${Math.max(.1, Math.min(10, imageRatio))}` }} onPointerDown={beginCrop} onPointerMove={updateCrop} onPointerUp={finishCrop} onPointerCancel={finishCrop}>
            <img src={previewUrl} alt={`ตัวอย่าง ${candidate.name}`} draggable={false} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'fill', userSelect: 'none', pointerEvents: 'none' }}/>
            {candidate.kind === 'model_space' && hasRegionSelection && <div aria-hidden="true" style={{ position: 'absolute', left: `${region[0] * 100}%`, top: `${region[1] * 100}%`, width: `${Math.max(region[2], .002) * 100}%`, height: `${Math.max(region[3], .002) * 100}%`, border: '2px solid #0284c7', background: 'rgba(14,165,233,.08)', boxSizing: 'border-box', pointerEvents: 'none' }}/>} 
          </div>
          {!!candidate.layers?.length && <div aria-label="ชั้นข้อมูลในแปลน" style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>{candidate.layers.slice(0, 12).map(layer => <span key={layer} style={{ border: '1px solid #dbe4ee', background: '#f8fafc', borderRadius: 99, padding: '3px 8px', color: '#475569', fontSize: 11 }}>{layer}</span>)}{candidate.layers.length > 12 && <span style={{ padding: 3, color: '#64748b', fontSize: 11 }}>+{candidate.layers.length - 12} layers</span>}</div>}
          {!!candidate.unsupportedEntities && <p role="status" style={{ margin: '8px 0 0', padding: '7px 9px', borderRadius: 8, background: '#fff7ed', color: '#9a3412', fontSize: 12 }}>รายการที่อ่านไม่ได้ {candidate.unsupportedEntities} รายการจะไม่ปรากฏในแบบอ้างอิง</p>}
          <div className="cf-dwg-picker-add-row">
            <label>ชื่อแปลน<input aria-label="ชื่อแปลนที่นำเข้า" value={draftName} onChange={event => setDraftName(event.target.value)} placeholder={candidate.name}/></label>
            <label>ผูกกับชั้น<select aria-label="ชั้นของแปลนที่นำเข้า" value={draftLevelId} onChange={event => setDraftLevelId(event.target.value)}>{levels.map(level => <option key={level.id} value={level.id}>{level.name}</option>)}</select></label>
            <button type="button" onClick={addCurrent}><Plus size={15}/>เพิ่มแปลนนี้</button>
          </div>
          {feedback && <p role="status" style={{ margin: '8px 0 0', color: '#b45309', fontSize: 12 }}>{feedback}</p>}
          <section className="cf-dwg-queued-plans" aria-label="แปลนที่เลือกนำเข้า">
            <strong>รายการที่จะนำเข้า ({queued.length})</strong>
            {!queued.length && <p>ยังไม่มีแปลน · เพิ่มได้หลาย Layout หรือครอบหลายพื้นที่ใน Model Space</p>}
            {queued.map((item, index) => <div className="cf-dwg-queued-plan" key={item.queueId}>
              <span className="cf-dwg-queued-index">{index + 1}</span>
              <label>ชื่อ<input aria-label={`ชื่อแปลน ${index + 1}`} value={item.display_name} onChange={event => updateQueued(item.queueId, { display_name: event.target.value })}/></label>
              <label>ชั้น<select aria-label={`ชั้นของแปลน ${index + 1}`} value={item.level_id} onChange={event => updateQueued(item.queueId, { level_id: event.target.value })}>{levels.map(level => <option key={level.id} value={level.id}>{level.name}</option>)}</select></label>
              <small>{item.candidate.kind === 'paper_space' ? item.candidate.name : 'Model Space · พื้นที่ที่ครอบ'}</small>
              <button type="button" aria-label={`นำแปลน ${index + 1} ออกจากรายการ`} onClick={() => setQueued(current => current.filter(row => row.queueId !== item.queueId))}><Trash2 size={15}/></button>
            </div>)}
          </section>
        </div>
      </div>
      <footer style={{ padding: '12px 16px', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ color: '#64748b', fontSize: 12 }}>แต่ละแปลนเก็บแยกกัน · เปลี่ยนชั้นและเปิด/ปิดได้ภายหลัง</span>
        <div style={{ display: 'flex', gap: 8 }}><button type="button" onClick={onClose} style={{ minHeight: 44, border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', color: '#334155', padding: '9px 14px' }}>ยกเลิก</button><button type="button" disabled={!queued.length || queued.some(item => !item.display_name.trim())} onClick={() => onImport(queued.map(({ queueId: _queueId, ...item }) => item))} style={{ minHeight: 44, display: 'flex', gap: 7, alignItems: 'center', border: 0, borderRadius: 8, background: queued.length ? '#0369a1' : '#94a3b8', color: '#fff', padding: '9px 14px', fontWeight: 700 }}><Check size={16}/>นำเข้า {queued.length} แปลน</button></div>
      </footer>
    </section>
  </div>
}
