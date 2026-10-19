import React, { useEffect, useRef, useState } from 'react'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import type { PDFDocumentLoadingTask } from 'pdfjs-dist/types/src/display/api'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export interface DrawingTraceSegment { filename: string; source_page_number: number; kind: 'wall' | 'opening'; points: [[number, number], [number, number]]; confidence: 'high' | 'medium' | 'low'; evidence: string }
interface Props {
  file: File
  pageNumber: number
  regions: Array<{ region: [number, number, number, number]; label: string }>
  trace?: Array<{ segment: DrawingTraceSegment; traceIndex: number }>
  onTracePointChange?: (traceIndex: number, pointIndex: number, point: [number, number]) => void
}

export function DrawingEvidencePreview({ file, pageNumber, regions, trace = [], onTracePointChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)
  const dragRef = useRef<{ traceIndex: number; pointIndex: number } | null>(null)
  useEffect(() => {
    let active = true
    let task: PDFDocumentLoadingTask | null = null
    const canvas = canvasRef.current
    if (!canvas) return
    setFailed(false)
    if (file.type.startsWith('image/')) {
      const objectUrl = URL.createObjectURL(file)
      const image = new Image()
      image.onload = () => {
        if (!active) return
        const scale = Math.min(420 / image.naturalWidth, 300 / image.naturalHeight, 1)
        const width = Math.max(1, Math.ceil(image.naturalWidth * scale))
        const height = Math.max(1, Math.ceil(image.naturalHeight * scale))
        const ratio = Math.min(window.devicePixelRatio || 1, 1.5)
        canvas.width = Math.ceil(width * ratio); canvas.height = Math.ceil(height * ratio)
        canvas.style.width = `${width}px`; canvas.style.height = `${height}px`
        const context = canvas.getContext('2d')
        if (!context) { setFailed(true); return }
        context.setTransform(ratio, 0, 0, ratio, 0, 0)
        context.drawImage(image, 0, 0, width, height)
      }
      image.onerror = () => { if (active) setFailed(true) }
      image.src = objectUrl
      return () => { active = false; URL.revokeObjectURL(objectUrl) }
    }
    void file.arrayBuffer().then(bytes => {
      task = getDocument({ data: new Uint8Array(bytes) })
      return task.promise
    }).then(document => document.getPage(pageNumber)).then(page => {
      if (!active) return
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: Math.min(420 / base.width, 300 / base.height) })
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.ceil(viewport.width * ratio); canvas.height = Math.ceil(viewport.height * ratio)
      canvas.style.width = `${Math.ceil(viewport.width)}px`; canvas.style.height = `${Math.ceil(viewport.height)}px`
      const context = canvas.getContext('2d')
      if (!context) { setFailed(true); return }
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      return page.render({ canvas, canvasContext: context, viewport }).promise
    }).catch(() => { if (active) setFailed(true) })
    return () => { active = false; if (task) void task.destroy() }
  }, [file, pageNumber])

  const updateTracePoint = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || !onTracePointChange) return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return
    onTracePointChange(dragRef.current.traceIndex, dragRef.current.pointIndex, [
      Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    ])
  }

  return <figure className="cf-ai-evidence-preview">
    <figcaption>กรอบที่ AI อ้าง · หน้า {pageNumber}</figcaption>
    {failed ? <small>เปิดภาพหลักฐานไม่ได้</small> : <div className="cf-ai-evidence-page"><canvas ref={canvasRef} />{regions.map((item, index) => <i key={index} title={item.label} style={{ left: `${item.region[0] * 100}%`, top: `${item.region[1] * 100}%`, width: `${(item.region[2] - item.region[0]) * 100}%`, height: `${(item.region[3] - item.region[1]) * 100}%` }} />)}{trace.length > 0 && <div className={`cf-ai-trace-overlay${onTracePointChange ? ' is-editable' : ''}`} onPointerMove={updateTracePoint} onPointerUp={() => { dragRef.current = null }} onPointerCancel={() => { dragRef.current = null }}>
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
        {trace.map(({ segment, traceIndex }) => <g key={traceIndex} className={`cf-ai-trace-segment is-${segment.kind} confidence-${segment.confidence}`}>
          <line x1={segment.points[0][0]} y1={segment.points[0][1]} x2={segment.points[1][0]} y2={segment.points[1][1]} vectorEffect="non-scaling-stroke"><title>{segment.kind === 'wall' ? 'แนวผนัง' : 'แนวช่องเปิด'} · มั่นใจ{segment.confidence === 'high' ? 'สูง' : segment.confidence === 'medium' ? 'ปานกลาง' : 'ต่ำ'}{segment.evidence ? ` · ${segment.evidence}` : ''}</title></line>
        </g>)}
      </svg>
      {onTracePointChange && trace.flatMap(({ segment, traceIndex }) => segment.points.map((point, pointIndex) => <button key={`${traceIndex}-${pointIndex}`} type="button" className={`cf-ai-trace-point is-${segment.kind}`} style={{ left: `${point[0] * 100}%`, top: `${point[1] * 100}%` }} aria-label={`${segment.kind === 'wall' ? 'แนวผนัง' : 'แนวช่องเปิด'} จุด ${pointIndex + 1}`} title="ลากหรือใช้ปุ่มลูกศรปรับจุด" onPointerDown={event => { event.preventDefault(); dragRef.current = { traceIndex, pointIndex }; event.currentTarget.setPointerCapture(event.pointerId) }} onKeyDown={event => { if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); const step = event.shiftKey ? 0.01 : 0.002; onTracePointChange(traceIndex, pointIndex, [Math.max(0, Math.min(1, point[0] + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0))), Math.max(0, Math.min(1, point[1] + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0)))]) }} />))}
    </div>}</div>}
  </figure>
}
