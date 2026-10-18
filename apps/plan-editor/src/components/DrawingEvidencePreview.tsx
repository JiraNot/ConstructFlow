import React, { useEffect, useRef, useState } from 'react'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import type { PDFDocumentLoadingTask } from 'pdfjs-dist/types/src/display/api'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

interface Props { file: File; pageNumber: number; regions: Array<{ region: [number, number, number, number]; label: string }> }

export function DrawingEvidencePreview({ file, pageNumber, regions }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    let task: PDFDocumentLoadingTask | null = null
    const canvas = canvasRef.current
    if (!canvas) return
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

  return <figure className="cf-ai-evidence-preview">
    <figcaption>กรอบที่ AI อ้าง · หน้า {pageNumber}</figcaption>
    {failed ? <small>เปิดภาพหลักฐานไม่ได้</small> : <div className="cf-ai-evidence-page"><canvas ref={canvasRef} />{regions.map((item, index) => <i key={index} title={item.label} style={{ left: `${item.region[0] * 100}%`, top: `${item.region[1] * 100}%`, width: `${(item.region[2] - item.region[0]) * 100}%`, height: `${(item.region[3] - item.region[1]) * 100}%` }} />)}</div>}
  </figure>
}
