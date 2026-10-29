import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import type { ProjectUnderlay, ProjectViewId } from '@constructflow/project-model'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export interface PdfPageScaleCalibration {
  filename: string
  source_page_number: number
  points: [[number, number], [number, number]]
  distance_mm: number
}

export interface PdfPageAlignment {
  filename: string
  source_page_number: number
  anchor_normalized: [number, number]
  target_origin_mm: [number, number]
  rotation_deg: number
  level_id: string
}

export interface PdfUnderlayPageRequest {
  pageNumber: number
  calibration: PdfPageScaleCalibration
  alignment?: PdfPageAlignment
}

const MAX_PDF_UNDERLAY_PAGES_PER_IMPORT = 20

/** Rasterize selected calibrated pages in one PDF session for the project underlay pipeline. */
export async function renderPdfUnderlayPages(options: {
  file: File
  pages: PdfUnderlayPageRequest[]
  viewId: ProjectViewId
  activeLevelId: string
}): Promise<ProjectUnderlay[]> {
  const { file, pages, viewId, activeLevelId } = options
  if (!pages.length) throw new Error('เลือกหน้า PDF อย่างน้อยหนึ่งหน้าก่อนนำเข้า')
  if (pages.length > MAX_PDF_UNDERLAY_PAGES_PER_IMPORT) throw new Error(`นำเข้า PDF ได้ครั้งละไม่เกิน ${MAX_PDF_UNDERLAY_PAGES_PER_IMPORT} หน้า`)
  if (new Set(pages.map(item => item.pageNumber)).size !== pages.length) throw new Error('หน้าที่เลือกมีรายการซ้ำ')
  for (const { pageNumber, calibration, alignment } of pages) {
    if (!Number.isInteger(pageNumber) || pageNumber < 1) throw new Error('หมายเลขหน้า PDF ไม่ถูกต้อง')
    if (calibration.filename !== file.name || calibration.source_page_number !== pageNumber || !Number.isFinite(calibration.distance_mm) || calibration.distance_mm <= 0)
      throw new Error(`ตั้งค่ามาตราส่วนของหน้า ${pageNumber} ใหม่ก่อนนำเข้า`)
    if (alignment && (alignment.filename !== file.name || alignment.source_page_number !== pageNumber || !alignment.level_id))
      throw new Error(`ตำแหน่งอ้างอิงของหน้า ${pageNumber} ไม่สมบูรณ์`)
  }

  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  try {
    const pdf = await loadingTask.promise
    const underlays: ProjectUnderlay[] = []
    for (const { pageNumber, calibration, alignment } of pages) {
      if (pageNumber > pdf.numPages) throw new Error(`ไม่พบหน้า ${pageNumber} ในไฟล์ PDF`)
      const page = await pdf.getPage(pageNumber)
      const base = page.getViewport({ scale: 1 })
      const rasterScale = Math.min(2.4, 1600 / base.width, 1600 / base.height)
      const viewport = page.getViewport({ scale: rasterScale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) throw new Error(`เตรียมภาพหน้า ${pageNumber} จาก PDF ไม่สำเร็จ`)
      await page.render({ canvas, canvasContext: context, viewport }).promise

      const [first, second] = calibration.points
      const dxPx = (second[0] - first[0]) * canvas.width
      const dyPx = (second[1] - first[1]) * canvas.height
      const distancePx = Math.hypot(dxPx, dyPx)
      const scale_mm_per_px = calibration.distance_mm / distancePx
      if (!Number.isFinite(distancePx) || distancePx < 1 || !Number.isFinite(scale_mm_per_px) || scale_mm_per_px <= 0 || scale_mm_per_px > 1000)
        throw new Error(`สเกลหน้า ${pageNumber} ไม่ถูกต้อง · เลือกปลายมิติที่ห่างกันมากขึ้น`)

      const rotation_deg = alignment?.rotation_deg ?? 0
      let origin_mm: [number, number] = [0, 0]
      if (alignment) {
        const theta = rotation_deg * Math.PI / 180
        const localX = alignment.anchor_normalized[0] * canvas.width * scale_mm_per_px
        // Underlay image Y grows down the page; plan world Y grows upward.
        const localY = -alignment.anchor_normalized[1] * canvas.height * scale_mm_per_px
        const rotatedX = localX * Math.cos(theta) - localY * Math.sin(theta)
        const rotatedY = localX * Math.sin(theta) + localY * Math.cos(theta)
        origin_mm = [alignment.target_origin_mm[0] - rotatedX, alignment.target_origin_mm[1] - rotatedY]
      }

      underlays.push({
        data_url: canvas.toDataURL('image/jpeg', 0.88),
        drawing_id: crypto.randomUUID(),
        display_name: `${file.name} · หน้า ${pageNumber}`,
        view_id: viewId,
        level_id: alignment?.level_id ?? activeLevelId,
        source_file: file.name,
        source_kind: 'pdf',
        source_layout: `หน้า ${pageNumber}`,
        scale_source: 'calibrated',
        origin_mm,
        scale_mm_per_px,
        rotation_deg,
        opacity: 0.6,
        visible: true,
      })
      canvas.width = 0
      canvas.height = 0
      page.cleanup()
    }
    return underlays
  } finally {
    await loadingTask.destroy()
  }
}

/** Backward-compatible single-page helper. */
export async function renderPdfUnderlayPage(options: {
  file: File
  pageNumber: number
  calibration: PdfPageScaleCalibration
  alignment?: PdfPageAlignment
  viewId: ProjectViewId
  activeLevelId: string
}): Promise<ProjectUnderlay> {
  const [underlay] = await renderPdfUnderlayPages({ ...options, pages: [{ pageNumber: options.pageNumber, calibration: options.calibration, alignment: options.alignment }] })
  return underlay!
}
