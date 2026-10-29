import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { X, Undo2 } from 'lucide-react'
import type { ProposalDeviceSignatureInput } from '@constructflow/project-model'
import './proposalSignatureCapture.css'

interface ProposalSignatureCaptureModalProps {
  proposalTitle: string
  initialSignerName: string
  mode?: 'local' | 'recipient'
  decision?: 'accepted' | 'declined'
  onCancel: () => void
  onConfirm: (signature: ProposalDeviceSignatureInput, decision: 'accepted' | 'declined', note: string) => boolean | Promise<boolean>
}

type Point = ProposalDeviceSignatureInput['strokes'][number][number]

function drawSignature(canvas: HTMLCanvasElement, strokes: Point[][], activeStroke: Point[] | null) {
  const bounds = canvas.getBoundingClientRect()
  if (!bounds.width || !bounds.height) return
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  const pixelWidth = Math.round(bounds.width * ratio)
  const pixelHeight = Math.round(bounds.height * ratio)
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth
    canvas.height = pixelHeight
  }
  const context = canvas.getContext('2d')
  if (!context) return
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.clearRect(0, 0, bounds.width, bounds.height)
  context.strokeStyle = '#153e54'
  context.fillStyle = '#153e54'
  context.lineWidth = 2.6
  context.lineCap = 'round'
  context.lineJoin = 'round'
  for (const stroke of [...strokes, ...(activeStroke?.length ? [activeStroke] : [])]) {
    if (!stroke.length) continue
    const first = stroke[0]!
    context.beginPath()
    context.moveTo(first.x * bounds.width, first.y * bounds.height)
    for (const point of stroke.slice(1)) context.lineTo(point.x * bounds.width, point.y * bounds.height)
    if (stroke.length === 1) {
      context.arc(first.x * bounds.width, first.y * bounds.height, context.lineWidth / 2, 0, Math.PI * 2)
      context.fill()
    } else context.stroke()
  }
}

export const ProposalSignatureCaptureModal: React.FC<ProposalSignatureCaptureModalProps> = ({ proposalTitle, initialSignerName, mode = 'local', decision = 'accepted', onCancel, onConfirm }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const activeStrokeRef = useRef<Point[] | null>(null)
  const [strokes, setStrokes] = useState<Point[][]>([])
  const [signerName, setSignerName] = useState(initialSignerName)
  const [acknowledged, setAcknowledged] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [paintRevision, setPaintRevision] = useState(0)

  const repaint = useCallback(() => {
    if (canvasRef.current) drawSignature(canvasRef.current, strokes, activeStrokeRef.current)
  }, [strokes])

  useLayoutEffect(() => {
    repaint()
    const canvas = canvasRef.current
    if (!canvas || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(repaint)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [paintRevision, repaint])

  useEffect(() => { nameRef.current?.focus() }, [])

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    }
  }

  const finishStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeStrokeRef.current) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    const points = activeStrokeRef.current
    if (points.length === 1) points.push({ ...points[0]! })
    activeStrokeRef.current = null
    setStrokes(current => [...current, points])
  }

  const save = async () => {
    if (busy) return
    if (!signerName.trim()) { setError('กรอกชื่อผู้ลงนามก่อนบันทึก'); nameRef.current?.focus(); return }
    if (!strokes.length) { setError('ลงลายเซ็นในพื้นที่ด้านบนก่อนบันทึก'); return }
    if (!acknowledged) { setError('ยืนยันการบันทึกชื่อและลายเซ็นก่อนดำเนินการ'); return }
    setError('')
    setBusy(true)
    try {
      if (!await onConfirm({ signer_name: signerName.trim(), strokes: structuredClone(strokes) }, decision, note.trim())) setError('บันทึกการตอบกลับไม่สำเร็จ · โหลดสถานะล่าสุดแล้วลองอีกครั้ง')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'บันทึกการตอบกลับไม่สำเร็จ · ลองอีกครั้ง')
    } finally { setBusy(false) }
  }

  return <div className="cf-signature-backdrop" role="presentation" onMouseDown={event => { if (!busy && event.target === event.currentTarget) onCancel() }}>
    <section className="cf-signature-modal" role="dialog" aria-modal="true" aria-labelledby="cf-signature-title" onKeyDown={event => {
      if (event.key === 'Escape' && !busy) { event.preventDefault(); onCancel() }
      if (event.key === 'Tab') {
        const items = [...event.currentTarget.querySelectorAll<HTMLElement>('input:not(:disabled), textarea:not(:disabled), button:not(:disabled)')]
        const first = items[0]
        const last = items.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }}>
      <header className="cf-signature-heading">
        <div><h2 id="cf-signature-title">{mode === 'recipient' ? decision === 'accepted' ? 'ยืนยันตอบรับข้อเสนอ' : 'ยืนยันไม่รับข้อเสนอ' : 'ลงนามตอบรับบนอุปกรณ์'}</h2><p>{proposalTitle}</p></div>
        <button type="button" className="cf-signature-close" aria-label="ปิดหน้าต่าง" onClick={onCancel} disabled={busy}><X size={20} /></button>
      </header>
      <label className="cf-signature-name">ชื่อผู้ลงนาม<input ref={nameRef} value={signerName} onChange={event => setSignerName(event.target.value)} maxLength={120} autoComplete="name" /></label>
      <div className="cf-signature-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="cf-signature-canvas"
          role="img"
          aria-label="พื้นที่วาดลายเซ็น ใช้นิ้ว ปากกา หรือเมาส์ลากลงในกรอบ"
          onPointerDown={event => {
            event.preventDefault()
            const committedPoints = strokes.reduce((total, stroke) => total + stroke.length, 0)
            if (strokes.length >= 40 || committedPoints >= 4999) { setError('ลายเซ็นมีจำนวนเส้นหรือจุดสูงสุดแล้ว'); return }
            event.currentTarget.setPointerCapture(event.pointerId)
            activeStrokeRef.current = [pointFromEvent(event)]
            setPaintRevision(value => value + 1)
          }}
          onPointerMove={event => {
            const active = activeStrokeRef.current
            if (!active) return
            const point = pointFromEvent(event)
            const previous = active[active.length - 1]!
            if (Math.hypot(point.x - previous.x, point.y - previous.y) < 0.002) return
            const committedPoints = strokes.reduce((total, stroke) => total + stroke.length, 0)
            if (active.length < 2500 && committedPoints + active.length < 5000) active.push(point)
            drawSignature(event.currentTarget, strokes, active)
          }}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
        />
        {!strokes.length && !activeStrokeRef.current && <span className="cf-signature-hint" aria-hidden="true">ลงลายเซ็นที่นี่</span>}
        <span className="cf-signature-baseline" aria-hidden="true" />
      </div>
      {mode === 'recipient' && <label className="cf-signature-name">หมายเหตุ (ไม่บังคับ)<textarea value={note} onChange={event => setNote(event.target.value)} maxLength={1000} rows={3} placeholder={decision === 'declined' ? 'ระบุเหตุผลหรือข้อความถึงผู้เสนอราคา' : 'เพิ่มข้อความถึงผู้เสนอราคา'} /></label>}
      <div className="cf-signature-canvas-actions">
        <span>{strokes.length ? `ลายเส้น ${strokes.length} เส้น` : 'ใช้นิ้วหรือปากกาบนหน้าจอ'}</span>
        <div>
          <button type="button" className="cf-button cf-button-quiet" onClick={() => { setStrokes(current => current.slice(0, -1)); setError('') }} disabled={!strokes.length}><Undo2 size={17} />ย้อนเส้นล่าสุด</button>
          <button type="button" className="cf-button cf-button-quiet" onClick={() => { setStrokes([]); activeStrokeRef.current = null; repaint(); setError('') }} disabled={!strokes.length && !activeStrokeRef.current}>ล้างลายเซ็น</button>
        </div>
      </div>
      <label className="cf-signature-ack"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} /><span>{mode === 'recipient' ? `ฉันยืนยันว่าอ่านข้อเสนอและต้องการ${decision === 'accepted' ? 'ตอบรับ' : 'ไม่รับ'}ตามที่เลือก` : 'ฉันยืนยันว่าต้องการบันทึกชื่อและลายเซ็นนี้ในประวัติข้อเสนอ'}</span></label>
      <p className="cf-signature-disclosure">{mode === 'recipient' ? 'บันทึกการตอบกลับผ่านลิงก์ใช้ครั้งเดียว · ชื่อระบุด้วยตนเอง · ระบบไม่ยืนยันตัวบุคคลและไม่ใช่ผู้ให้บริการ e-signature' : 'บันทึกไว้ในโครงการนี้จากอุปกรณ์ · ชื่อระบุด้วยตนเอง · ไม่มีการยืนยันตัวบุคคลหรือผู้ให้บริการ e-signature'}</p>
      {error && <p className="cf-signature-error" role="alert">{error}</p>}
      <footer className="cf-signature-footer"><button type="button" className="cf-button cf-button-quiet" onClick={onCancel} disabled={busy}>ยกเลิก</button><button type="button" className="cf-button cf-button-primary" onClick={() => void save()} disabled={busy || !signerName.trim() || !strokes.length || !acknowledged}>{busy ? 'กำลังบันทึก…' : mode === 'recipient' ? decision === 'accepted' ? 'ยืนยันตอบรับ' : 'ยืนยันไม่รับ' : 'ลงนามและบันทึกการตอบรับ'}</button></footer>
    </section>
  </div>
}
