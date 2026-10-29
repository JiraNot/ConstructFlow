import React, { useState } from 'react'
import { Check, Copy, MoreHorizontal, MoveHorizontal, Rows3, Trash2, X } from 'lucide-react'

interface SelectionActionDockProps {
  selectedIds: string[]
  arrayObjectCount: number
  previewActive: boolean
  offsetSupported: boolean
  mirrorSupported: boolean
  onDeselect: () => void
  onDuplicate: () => void
  onDelete: () => void
  onPreviewArray: (objectIds: string[], copies: number, deltaXmm: number, deltaYmm: number) => void
  onPreviewOffset: (objectIds: string[], distanceMm: number, side: 'left' | 'right') => void
  onPreviewMirror: (objectIds: string[], axis: 'vertical' | 'horizontal') => void
  onCommitPreview: () => void
  onCancelPreview: () => void
}

/** Tablet-first canvas actions kept within thumb reach of the current selection. */
export const SelectionActionDock: React.FC<SelectionActionDockProps> = ({
  selectedIds, arrayObjectCount, previewActive, offsetSupported, mirrorSupported,
  onDeselect, onDuplicate, onDelete, onPreviewArray, onPreviewOffset, onPreviewMirror,
  onCommitPreview, onCancelPreview,
}) => {
  const [moreOpen, setMoreOpen] = useState(false)
  const [copies, setCopies] = useState('2')
  const [spacingX, setSpacingX] = useState('1')
  const [spacingY, setSpacingY] = useState('0')
  const [offsetDistance, setOffsetDistance] = useState('0.25')
  const [offsetSide, setOffsetSide] = useState<'left' | 'right'>('left')
  const [mirrorAxis, setMirrorAxis] = useState<'vertical' | 'horizontal'>('vertical')
  const maxCopies = Math.max(0, Math.min(100, Math.floor(500 / Math.max(1, arrayObjectCount))))
  const parsedCopies = Number(copies)
  const deltaXmm = Number(spacingX) * 1000
  const deltaYmm = Number(spacingY) * 1000
  const canPreviewArray = Number.isInteger(parsedCopies) && parsedCopies >= 1 && parsedCopies <= maxCopies
    && Number.isFinite(deltaXmm) && Number.isFinite(deltaYmm) && Math.hypot(deltaXmm, deltaYmm) > 0

  return <div
    className="cf-selection-dock"
    role="toolbar"
    aria-label={previewActive ? 'ยืนยันหรือยกเลิกการแปลง' : `คำสั่งวัตถุที่เลือก ${selectedIds.length} ชิ้น`}
    onPointerDown={event => event.stopPropagation()}
    onPointerMove={event => event.stopPropagation()}
    onPointerUp={event => event.stopPropagation()}
    onWheel={event => event.stopPropagation()}
  >
    {previewActive ? <>
      <span className="cf-selection-dock-label">Preview การเปลี่ยนแปลง</span>
      <button type="button" className="is-primary" onClick={onCommitPreview}><Check size={16} aria-hidden="true" />ยืนยัน · Undo ได้</button>
      <button type="button" onClick={onCancelPreview}><X size={16} aria-hidden="true" />ยกเลิก</button>
    </> : <>
      <span className="cf-selection-dock-count">เลือก {selectedIds.length} ชิ้น</span>
      <button type="button" aria-label="ยกเลิกการเลือก" title="ยกเลิกการเลือก" onClick={onDeselect}><X size={17} aria-hidden="true" /><span>ยกเลิกเลือก</span></button>
      <button type="button" aria-label="ทำสำเนาวัตถุที่เลือก" title="ทำสำเนาเยื้อง 0.5 เมตร · Undo ได้" onClick={onDuplicate}><Copy size={17} aria-hidden="true" /><span>ทำสำเนา</span></button>
      <div className="cf-selection-dock-more">
        <button
          type="button"
          aria-label="คำสั่งแปลงวัตถุเพิ่มเติม"
          aria-expanded={moreOpen}
          aria-controls="cf-selection-transform-tools"
          title="อาร์เรย์และ Offset"
          onClick={() => setMoreOpen(open => !open)}
        ><MoreHorizontal size={18} aria-hidden="true" /><span>เพิ่มเติม</span></button>
        {moreOpen && <section id="cf-selection-transform-tools" className="cf-selection-transform-popover" aria-label="อาร์เรย์และ Offset">
          <header><strong>แปลงวัตถุที่เลือก</strong><button type="button" aria-label="ปิดเครื่องมือเพิ่มเติม" onClick={() => setMoreOpen(false)}><X size={16} /></button></header>
          <form onSubmit={event => {
            event.preventDefault()
            if (canPreviewArray && parsedCopies * arrayObjectCount <= 500) {
              setMoreOpen(false)
              onPreviewArray(selectedIds, parsedCopies, Math.round(deltaXmm), Math.round(deltaYmm))
            }
          }}>
            <strong><Rows3 size={15} aria-hidden="true" /> อาร์เรย์</strong>
            <div className="cf-selection-transform-fields">
              <label>จำนวนสำเนา<input aria-label="จำนวนสำเนาในอาร์เรย์" type="number" min="1" max={Math.max(1, maxCopies)} step="1" value={copies} onChange={event => setCopies(event.target.value)} /></label>
              <label>ระยะ X (m)<input aria-label="ระยะอาร์เรย์แกน X เมตร" type="number" step="0.1" value={spacingX} onChange={event => setSpacingX(event.target.value)} /></label>
              <label>ระยะ Y (m)<input aria-label="ระยะอาร์เรย์แกน Y เมตร" type="number" step="0.1" value={spacingY} onChange={event => setSpacingY(event.target.value)} /></label>
            </div>
            <small>หนึ่งชุดมี {arrayObjectCount} ชิ้น รวมประตู/หน้าต่างบนผนัง · ทำซ้ำได้สูงสุด {maxCopies} ชุด (ไม่เกิน 500 ชิ้น) · preview ก่อน Undo เดียว</small>
            <button type="submit" className="cf-selection-transform-submit" disabled={!canPreviewArray}>แสดงตัวอย่างอาร์เรย์</button>
          </form>
          {offsetSupported && <form onSubmit={event => {
            event.preventDefault()
            const distance = Number(offsetDistance) * 1000
            if (Number.isFinite(distance) && Math.abs(distance) >= 1) {
              setMoreOpen(false)
              onPreviewOffset(selectedIds, Math.round(distance), offsetSide)
            }
          }}>
            <strong><MoveHorizontal size={15} aria-hidden="true" /> ทำสำเนา Offset ตามแนวเส้น</strong>
            <div className="cf-selection-transform-fields cf-selection-offset-fields">
              <label>ระยะตั้งฉาก (m)<input aria-label="ระยะ Offset เมตร" type="number" step="0.01" value={offsetDistance} onChange={event => setOffsetDistance(event.target.value)} /></label>
              <label>ด้าน<select aria-label="ด้าน Offset" value={offsetSide} onChange={event => setOffsetSide(event.target.value as 'left' | 'right')}><option value="left">ซ้ายตามแนววาด</option><option value="right">ขวาตามแนววาด</option></select></label>
            </div>
            <small>รองรับผนังตรง คานอิสระ กริดอิสระ และเส้นแบ่งห้อง</small>
            <button type="submit" className="cf-selection-transform-submit">แสดงตัวอย่างสำเนา</button>
          </form>}
          {mirrorSupported && <form onSubmit={event => {
            event.preventDefault()
            setMoreOpen(false)
            onPreviewMirror(selectedIds, mirrorAxis)
          }}>
            <strong><MoveHorizontal size={15} aria-hidden="true" /> Mirror รอบแนวแกน</strong>
            <div className="cf-selection-transform-fields cf-selection-offset-fields">
              <label>แนวแกน<select aria-label="แนวแกน Mirror" value={mirrorAxis} onChange={event => setMirrorAxis(event.target.value as 'vertical' | 'horizontal')}><option value="vertical">แกนตั้ง · กลับซ้าย/ขวา</option><option value="horizontal">แกนนอน · กลับบน/ล่าง</option></select></label>
            </div>
            <small>ใช้วัตถุชิ้นแรกเป็นแนวแกน · คง UUID เดิม</small>
            <button type="submit" className="cf-selection-transform-submit">แสดงตัวอย่าง Mirror</button>
          </form>}
        </section>}
      </div>
      <button type="button" className="is-danger" aria-label="ลบวัตถุที่เลือก" title="ลบวัตถุที่เลือก" onClick={onDelete}><Trash2 size={17} aria-hidden="true" /><span>ลบ</span></button>
    </>}
  </div>
}
