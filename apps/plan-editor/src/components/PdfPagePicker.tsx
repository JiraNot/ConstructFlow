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
  alignments?: Array<{ filename: string; source_page_number: number; anchor_normalized: [number, number]; target_origin_mm: [number, number]; rotation_deg: number; level_id: string }>
  levels?: Array<{ id: string; name: string }>
  onClose: () => void
  onUpdate?: (pages: number[], calibrations: Array<{ filename: string; source_page_number: number; points: [[number, number], [number, number]]; distance_mm: number }>, alignments?: Props["alignments"]) => void
  onConfirm: (pages: number[], calibrations: Array<{ filename: string; source_page_number: number; points: [[number, number], [number, number]]; distance_mm: number }>, alignments?: Props["alignments"]) => void
}

type DrawingAlignment = NonNullable<Props["alignments"]>[number]

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

export function PdfPagePicker({ file, selectedPages, suggestedPages = [], scaleCalibrations = [], alignments = [], levels = [], onClose, onUpdate, onConfirm }: Props) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [selected, setSelected] = useState<Set<number>>(new Set(selectedPages ?? []))
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [pageOffset, setPageOffset] = useState(0)
  const [calibrationPage, setCalibrationPage] = useState<number | null>(null)
  const [modalMode, setModalMode] = useState<"scale" | "align">("scale")
  const [calibrationPoints, setCalibrationPoints] = useState<Array<[number, number]>>([])
  const [calibrationDistance, setCalibrationDistance] = useState("")
  const [alignmentTargetX, setAlignmentTargetX] = useState("0")
  const [alignmentTargetY, setAlignmentTargetY] = useState("0")
  const [alignmentRotation, setAlignmentRotation] = useState("0")
  const [alignmentLevelId, setAlignmentLevelId] = useState(alignments[0]?.level_id || levels[0]?.id || "")
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
  }, [file])

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
    if (!rect || rect.width <= 0 || rect.height <= 0) return
    const point: [number, number] = [Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))]
    setCalibrationPoints(current => modalMode === "align" ? [point] : current.length === 2 ? [point] : [...current, point])
  }
  const saveCalibration = () => {
    if (calibrationPage === null || calibrationPoints.length !== 2 || Number(calibrationDistance) <= 0) return
    const pages = [...new Set([...selected, calibrationPage])].sort((a, b) => a - b)
    setSelected(new Set(pages))
    onUpdate?.(pages, [...scaleCalibrations, { filename: file.name, source_page_number: calibrationPage, points: calibrationPoints as [[number, number], [number, number]], distance_mm: Number(calibrationDistance) }].filter(item => pages.includes(item.source_page_number)), alignments.filter(item => pages.includes(item.source_page_number)))
    setCalibrationPage(null)
  }
  const saveAlignment = () => {
    if (calibrationPage === null || !calibrationPoints[0] || !alignmentLevelId) return
    const nextAlignment = { filename: file.name, source_page_number: calibrationPage, anchor_normalized: calibrationPoints[0], target_origin_mm: [Number(alignmentTargetX), Number(alignmentTargetY)] as [number, number], rotation_deg: Number(alignmentRotation), level_id: alignmentLevelId }
    const pages = [...new Set([...selected, calibrationPage])].sort((a, b) => a - b)
    setSelected(new Set(pages))
    onUpdate?.(pages, scaleCalibrations.filter(item => pages.includes(item.source_page_number)), [...alignments.filter(item => item.source_page_number !== calibrationPage), nextAlignment].filter(item => pages.includes(item.source_page_number)))
    setCalibrationPage(null)
  }
  const confirmSelection = () => {
    const pages = [...selected].sort((a, b) => a - b)
    const includesPage = (page: number) => pages.length === 0 || pages.includes(page)
    onConfirm(pages, scaleCalibrations.filter(item => includesPage(item.source_page_number)), alignments.filter(item => includesPage(item.source_page_number)))
  }

  return <div className="cf-pdf-picker-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="cf-pdf-picker" role="dialog" aria-modal="true" aria-labelledby="cf-pdf-picker-title">
      <header className="cf-pdf-picker-header">
        <div><strong id="cf-pdf-picker-title">เลือกหน้าแปลน</strong><small title={file.name}>{file.name} · {busy ? 'กำลังอ่าน PDF…' : `${pageCount} หน้า`}</small></div>
        <button type="button" className="cf-icon-button" aria-label="ปิดตัวเลือกหน้า" onClick={onClose}><X size={18} /></button>
      </header>
      {busy ? <div className="cf-pdf-picker-loading"><LoaderCircle className="cf-ai-spin" size={20} /> กำลังเตรียมตัวอย่างหน้า</div> : error ? <p className="cf-ai-error" role="alert">{error}</p> : <>
        <p className="cf-pdf-picker-help">แตะหน้าเพื่อเลือก · สีแนะนำคือหน้าแปลนที่ AI แยกได้ · ตั้งสเกลโดยแตะปลายมิติที่ทราบค่า 2 จุด</p>
        <div className="cf-pdf-page-grid">{visiblePages.map(page => { const pageAlignment = alignments.find(item => item.source_page_number === page); return <div className={`cf-pdf-page-option${suggestedPages.includes(page) ? " is-suggested" : ""}`} key={page}><PdfPageCard document={document!} pageNumber={page} selected={selected.has(page)} onToggle={() => togglePage(page)} />{suggestedPages.includes(page) && <small>AI แนะนำ</small>}<button type="button" className="cf-button cf-pdf-calibrate" onClick={() => { setModalMode("scale"); setCalibrationPage(page); setCalibrationPoints([]); setCalibrationDistance("") }}>{scaleCalibrations.some(item => item.source_page_number === page) ? `เพิ่มสเกล (${scaleCalibrations.filter(item => item.source_page_number === page).length})` : "ตั้งสเกล"}</button><button type="button" className="cf-button cf-pdf-calibrate" onClick={() => { setModalMode("align"); setCalibrationPage(page); setCalibrationPoints(pageAlignment ? [pageAlignment.anchor_normalized] : []); setAlignmentTargetX(String(pageAlignment?.target_origin_mm[0] ?? 0)); setAlignmentTargetY(String(pageAlignment?.target_origin_mm[1] ?? 0)); setAlignmentRotation(String(pageAlignment?.rotation_deg ?? 0)); setAlignmentLevelId(pageAlignment?.level_id || levels[0]?.id || "") }}>{pageAlignment ? "ปรับตำแหน่งแล้ว" : "จัดตำแหน่ง"}</button></div> })}</div>
        <nav className="cf-pdf-picker-pages" aria-label="เปลี่ยนหน้าตัวอย่าง PDF">
          <button type="button" className="cf-icon-button" aria-label="ดูหน้าก่อน" disabled={pageOffset === 0} onClick={() => setPageOffset(value => Math.max(0, value - pagesPerView))}><ChevronLeft size={18} /></button>
          <span>หน้า {pageOffset + 1}–{Math.min(pageOffset + visiblePages.length, pageCount)} จาก {pageCount}</span>
          <button type="button" className="cf-icon-button" aria-label="ดูหน้าถัดไป" disabled={pageOffset + pagesPerView >= pageCount} onClick={() => setPageOffset(value => Math.min(Math.max(0, pageCount - pagesPerView), value + pagesPerView))}><ChevronRight size={18} /></button>
        </nav>
      </>}
      <footer className="cf-pdf-picker-footer">
          <span>{selected.size ? `เลือก ${selected.size} หน้า` : 'ส่ง PDF ทั้งเล่ม'}</span>
        <div><button type="button" className="cf-button" disabled={busy || !!error || !selected.size} onClick={clearSelection}>ล้างที่เลือก</button><button type="button" className="cf-button cf-button-primary" disabled={busy || !!error} onClick={confirmSelection}>ใช้หน้านี้</button></div>
      </footer>
      {calibrationPage !== null && <div className="cf-pdf-calibration-backdrop"><section className="cf-pdf-calibration" role="dialog" aria-modal="true" aria-label={modalMode === "scale" ? "ปรับสเกลจากมิติที่ทราบ" : "จัดตำแหน่งแปลนกับโครงการ"}><header><strong>{modalMode === "scale" ? "ปรับสเกล" : "จัดตำแหน่งแปลน"} · หน้า {calibrationPage}</strong><button type="button" className="cf-icon-button" aria-label="ปิดหน้าต่าง" onClick={() => setCalibrationPage(null)}><X size={18} /></button></header><p>{modalMode === "scale" ? "แตะปลายเส้นมิติที่ทราบระยะจริง 2 จุด แล้วกรอกระยะตามตัวเลขบนแบบ" : "แตะจุดอ้างอิงบนแปลน แล้วระบุพิกัดโครงการของจุดนั้น เพื่อวางแปลนลงบนชั้นที่ถูกต้อง"}</p><div ref={calibrationWrapRef} className="cf-pdf-calibration-page" onClick={captureCalibrationPoint}><canvas ref={calibrationCanvasRef} />{calibrationPoints.map((point, index) => <i key={index} style={{ left: `${point[0] * 100}%`, top: `${point[1] * 100}%` }}>{modalMode === "scale" ? index + 1 : "จุด"}</i>)}</div>{modalMode === "scale" ? <label>ระยะจริง (มม.)<input type="number" min="1" value={calibrationDistance} onChange={event => setCalibrationDistance(event.target.value)} placeholder="เช่น 4000" /></label> : <div className="cf-pdf-alignment-fields"><label>พิกัด X (มม.)<input type="number" value={alignmentTargetX} onChange={event => setAlignmentTargetX(event.target.value)} /></label><label>พิกัด Y (มม.)<input type="number" value={alignmentTargetY} onChange={event => setAlignmentTargetY(event.target.value)} /></label><label>หมุน (องศา)<input type="number" value={alignmentRotation} onChange={event => setAlignmentRotation(event.target.value)} /></label><label>ชั้น<select value={alignmentLevelId} onChange={event => setAlignmentLevelId(event.target.value)}>{levels.map(level => <option key={level.id} value={level.id}>{level.name}</option>)}</select></label></div>}<footer><button type="button" className="cf-button" onClick={() => setCalibrationPage(null)}>ยกเลิก</button><button type="button" className="cf-button cf-button-primary" disabled={modalMode === "scale" ? calibrationPoints.length !== 2 || (calibrationPoints[0]?.[0] === calibrationPoints[1]?.[0] && calibrationPoints[0]?.[1] === calibrationPoints[1]?.[1]) || Number(calibrationDistance) <= 0 : calibrationPoints.length !== 1 || !alignmentLevelId || !alignmentTargetX.trim() || !alignmentTargetY.trim() || !alignmentRotation.trim() || !Number.isFinite(Number(alignmentTargetX)) || !Number.isFinite(Number(alignmentTargetY)) || !Number.isFinite(Number(alignmentRotation))} onClick={modalMode === "scale" ? saveCalibration : saveAlignment}>{modalMode === "scale" ? "ใช้สเกลนี้" : "ใช้ตำแหน่งนี้"}</button></footer></section></div>}
    </section>
  </div>
}
