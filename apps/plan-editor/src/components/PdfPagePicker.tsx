import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, LoaderCircle, X } from 'lucide-react'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

interface Props {
  file: File
  selectedPages?: number[]
  suggestedPages?: number[]
  scaleCalibrations?: Array<{ filename: string; source_page_number: number; points: [[number, number], [number, number]]; distance_mm: number }>
  onClose: () => void
  onConfirm: (pages: number[], calibrations: Array<{ filename: string; source_page_number: number; points: [[number, number], [number, number]]; distance_mm: number }>) => void
}

function PdfPageCard({ document, pageNumber, selected, onToggle }: {
  document: PDFDocumentProxy
  pageNumber: number
  selected: boolean
  onToggle: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    const canvas = canvasRef.current
    if (!canvas) return
    void document.getPage(pageNumber).then(page => {
      if (!active) return
      const base = page.getViewport({ scale: 1 })
      const scale = Math.min(190 / base.width, 128 / base.height)
      const viewport = page.getViewport({ scale })
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.ceil(viewport.width * ratio)
      canvas.height = Math.ceil(viewport.height * ratio)
      canvas.style.width = `${Math.ceil(viewport.width)}px`
      canvas.style.height = `${Math.ceil(viewport.height)}px`
      const context = canvas.getContext('2d')
      if (!context) { setError(true); return }
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      return page.render({ canvas, canvasContext: context, viewport }).promise
    }).catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [document, pageNumber])

  return <button type="button" className={`cf-pdf-page-card${selected ? ' is-selected' : ''}`} aria-pressed={selected} aria-label={`หน้า ${pageNumber}${selected ? ' เลือกแล้ว' : ''}`} onClick={onToggle}>
    <span className="cf-pdf-page-preview">{error ? <span>ดูตัวอย่างไม่ได้</span> : <canvas ref={canvasRef} aria-hidden="true" />}</span>
    <span className="cf-pdf-page-label"><span className="cf-pdf-page-check" aria-hidden="true">{selected ? '✓' : ''}</span> หน้า {pageNumber}</span>
  </button>
}

export function PdfPagePicker({ file, selectedPages, suggestedPages = [], scaleCalibrations = [], onClose, onConfirm }: Props) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [selected, setSelected] = useState<Set<number>>(new Set(selectedPages ?? []))
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [pageOffset, setPageOffset] = useState(0)
  const [calibrationPage, setCalibrationPage] = useState<number | null>(null)
  const [calibrationPoints, setCalibrationPoints] = useState<Array<[number, number]>>([])
  const [calibrationDistance, setCalibrationDistance] = useState("")
  const calibrationCanvasRef = useRef<HTMLCanvasElement>(null)
  const calibrationWrapRef = useRef<HTMLDivElement>(null)
  const pagesPerView = 12
  const visiblePages = useMemo(() => Array.from({ length: Math.min(pagesPerView, Math.max(0, pageCount - pageOffset)) }, (_, index) => pageOffset + index + 1), [pageCount, pageOffset])

  useEffect(() => {
    let active = true
    let loadingTask: PDFDocumentLoadingTask | null = null
    void file.arrayBuffer().then(data => {
      loadingTask = getDocument({ data: new Uint8Array(data) })
      return loadingTask.promise
    }).then(pdf => {
      if (!active) { void loadingTask?.destroy(); return }
      setDocument(pdf)
      setPageCount(pdf.numPages)
      if (selectedPages === undefined) setSelected(new Set())
      setBusy(false)
    }).catch(cause => {
      if (active) {
        setError(cause instanceof Error ? `เปิด PDF ไม่ได้: ${cause.message}` : 'เปิด PDF ไม่ได้')
        setBusy(false)
      }
    })
    return () => { active = false; if (loadingTask) void loadingTask.destroy() }
  }, [file, selectedPages])

  const togglePage = (page: number) => setSelected(current => {
    const next = new Set(current)
    if (next.has(page)) next.delete(page); else next.add(page)
    return next
  })
  const selectVisible = () => setSelected(current => new Set([...current, ...visiblePages]))
  const clearSelection = () => setSelected(new Set())

  useEffect(() => {
    let active = true
    const canvas = calibrationCanvasRef.current
    if (!document || calibrationPage === null || !canvas) return
    void document.getPage(calibrationPage).then(page => {
      if (!active) return
      const base = page.getViewport({ scale: 1 })
      const scale = Math.min(1100 / base.width, 720 / base.height)
      const viewport = page.getViewport({ scale })
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.ceil(viewport.width * ratio); canvas.height = Math.ceil(viewport.height * ratio)
      canvas.style.width = `${Math.ceil(viewport.width)}px`; canvas.style.height = `${Math.ceil(viewport.height)}px`
      const context = canvas.getContext("2d")
      if (!context) return
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      return page.render({ canvas, canvasContext: context, viewport }).promise
    }).catch(() => { if (active) setError("เปิดหน้าเพื่อปรับสเกลไม่ได้") })
    return () => { active = false }
  }, [document, calibrationPage])

  const captureCalibrationPoint = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = calibrationCanvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const point: [number, number] = [Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))]
    setCalibrationPoints(current => current.length === 2 ? [point] : [...current, point])
  }
  const saveCalibration = () => {
    if (calibrationPage === null || calibrationPoints.length !== 2 || Number(calibrationDistance) <= 0) return
    const existing = scaleCalibrations.filter(item => item.source_page_number !== calibrationPage)
    onConfirm([...new Set([...selected, calibrationPage])].sort((a, b) => a - b), [...existing, { filename: file.name, source_page_number: calibrationPage, points: calibrationPoints as [[number, number], [number, number]], distance_mm: Number(calibrationDistance) }])
  }

  return <div className="cf-pdf-picker-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="cf-pdf-picker" role="dialog" aria-modal="true" aria-labelledby="cf-pdf-picker-title">
      <header className="cf-pdf-picker-header">
        <div><strong id="cf-pdf-picker-title">เลือกหน้าแปลน</strong><small title={file.name}>{file.name} · {busy ? 'กำลังอ่าน PDF…' : `${pageCount} หน้า`}</small></div>
        <button type="button" className="cf-icon-button" aria-label="ปิดตัวเลือกหน้า" onClick={onClose}><X size={18} /></button>
      </header>
      {busy ? <div className="cf-pdf-picker-loading"><LoaderCircle className="cf-ai-spin" size={20} /> กำลังเตรียมตัวอย่างหน้า</div> : error ? <p className="cf-ai-error" role="alert">{error}</p> : <>
        <p className="cf-pdf-picker-help">แตะหน้าเพื่อเลือก · สีแนะนำคือหน้าแปลนที่ AI แยกได้ · ตั้งสเกลโดยแตะปลายมิติที่ทราบค่า 2 จุด</p>
        <div className="cf-pdf-page-grid">{visiblePages.map(page => <div className={`cf-pdf-page-option${suggestedPages.includes(page) ? " is-suggested" : ""}`} key={page}><PdfPageCard document={document!} pageNumber={page} selected={selected.has(page)} onToggle={() => togglePage(page)} />{suggestedPages.includes(page) && <small>AI แนะนำ</small>}<button type="button" className="cf-button cf-pdf-calibrate" onClick={() => { setCalibrationPage(page); setCalibrationPoints([]); setCalibrationDistance("") }}>{scaleCalibrations.some(item => item.source_page_number === page) ? "ปรับสเกลแล้ว" : "ตั้งสเกล"}</button></div>)}</div>
        <nav className="cf-pdf-picker-pages" aria-label="เปลี่ยนหน้าตัวอย่าง PDF">
          <button type="button" className="cf-icon-button" aria-label="ดูหน้าก่อน" disabled={pageOffset === 0} onClick={() => setPageOffset(value => Math.max(0, value - pagesPerView))}><ChevronLeft size={18} /></button>
          <span>หน้า {pageOffset + 1}–{Math.min(pageOffset + visiblePages.length, pageCount)} จาก {pageCount}</span>
          <button type="button" className="cf-icon-button" aria-label="ดูหน้าถัดไป" disabled={pageOffset + pagesPerView >= pageCount} onClick={() => setPageOffset(value => Math.min(Math.max(0, pageCount - pagesPerView), value + pagesPerView))}><ChevronRight size={18} /></button>
        </nav>
      </>}
      <footer className="cf-pdf-picker-footer">
        <span>{selected.size ? `เลือก ${selected.size} หน้า` : 'ส่ง PDF ทั้งเล่ม'}</span>
        <div><button type="button" className="cf-button" disabled={busy || !!error || !selected.size} onClick={clearSelection}>ล้างที่เลือก</button><button type="button" className="cf-button cf-button-primary" disabled={busy || !!error} onClick={() => onConfirm([...selected].sort((a, b) => a - b), scaleCalibrations)}>ใช้หน้านี้</button></div>
      </footer>
      {calibrationPage !== null && <div className="cf-pdf-calibration-backdrop"><section className="cf-pdf-calibration" role="dialog" aria-modal="true" aria-label="ปรับสเกลจากมิติที่ทราบ"><header><strong>ปรับสเกล · หน้า {calibrationPage}</strong><button type="button" className="cf-icon-button" aria-label="ปิดปรับสเกล" onClick={() => setCalibrationPage(null)}><X size={18} /></button></header><p>แตะปลายเส้นมิติที่ทราบระยะจริง 2 จุด แล้วกรอกระยะตามตัวเลขบนแบบ</p><div ref={calibrationWrapRef} className="cf-pdf-calibration-page" onClick={captureCalibrationPoint}><canvas ref={calibrationCanvasRef} />{calibrationPoints.map((point, index) => <i key={index} style={{ left: `${point[0] * 100}%`, top: `${point[1] * 100}%` }}>{index + 1}</i>)}</div><label>ระยะจริง (มม.)<input type="number" min="1" value={calibrationDistance} onChange={event => setCalibrationDistance(event.target.value)} placeholder="เช่น 4000" /></label><footer><button type="button" className="cf-button" onClick={() => setCalibrationPage(null)}>ยกเลิก</button><button type="button" className="cf-button cf-button-primary" disabled={calibrationPoints.length !== 2 || Number(calibrationDistance) <= 0} onClick={saveCalibration}>ใช้สเกลนี้</button></footer></section></div>}
    </section>
  </div>
}
