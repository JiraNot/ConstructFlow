import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { UnderlayConfig } from '../rendering/planRenderer.js'
import type { useProjectSession } from './useProjectSession.js'
import { importDxfUnderlay } from '../cad/importDxfUnderlay.mjs'
import { importSiteSurveyCsv } from '../cad/importSiteSurveyCsv.mjs'

interface UseReferenceDataImportActionsOptions {
  underlayKey: string
  hydratedUnderlayRef: MutableRefObject<string | null>
  setUnderlay: Dispatch<SetStateAction<UnderlayConfig>>
  setFileFeedback: Dispatch<SetStateAction<string>>
  dispatchCommandBatch: ReturnType<typeof useProjectSession>['dispatchCommandBatch']
}

/** Owns reference-file parsing while project mutations remain on the shared session command path. */
export function useReferenceDataImportActions({
  underlayKey, hydratedUnderlayRef, setUnderlay, setFileFeedback, dispatchCommandBatch,
}: UseReferenceDataImportActionsOptions) {
  const handleUploadUnderlayImage = (file: File) => {
    const openUnderlayImage = (dataUrl: string, originMm: [number, number], scaleMmPerPx: number) => {
      const image = new Image()
      image.onload = () => {
        image.dataset.projectSrc = dataUrl
        hydratedUnderlayRef.current = `${underlayKey}:${dataUrl}`
        setUnderlay(current => ({ ...current, image, origin_mm: originMm, scale_mm_per_px: scaleMmPerPx, rotation_deg: 0, visible: true }))
      }
      image.onerror = () => setFileFeedback('เปิดไฟล์อ้างอิงไม่สำเร็จ')
      image.src = dataUrl
    }

    if (file.name.toLowerCase().endsWith('.dxf')) {
      void file.text().then(source => {
        try {
          const imported = importDxfUnderlay(source)
          openUnderlayImage(imported.dataUrl, imported.origin_mm, imported.scale_mm_per_px)
          const assumedUnits = imported.drawing_units === 'unitless' ? ' · ไม่ระบุหน่วย จึงสมมติเป็นมม.' : ` · หน่วย ${imported.drawing_units}`
          const skipped = imported.skipped_entities ? ` · ข้าม ${imported.skipped_entities} รายการที่ไม่รองรับ` : ''
          setFileFeedback(`นำเข้า DXF ${imported.imported_entities} รายการแล้ว${assumedUnits}${skipped} · ปรับเทียบได้ด้วยเครื่องมือไม้บรรทัด`)
        } catch (error) {
          setFileFeedback(error instanceof Error ? error.message : 'อ่านไฟล์ DXF ไม่สำเร็จ')
        }
      }).catch(() => setFileFeedback('อ่านไฟล์ DXF ไม่สำเร็จ'))
      return
    }

    const reader = new FileReader()
    reader.onerror = () => setFileFeedback('อ่านไฟล์ภาพอ้างอิงไม่สำเร็จ')
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '')
      if (!dataUrl.startsWith('data:image/')) { setFileFeedback('ไฟล์ที่เลือกไม่ใช่ภาพที่รองรับ'); return }
      openUnderlayImage(dataUrl, [0, 0], 10)
    }
    reader.readAsDataURL(file)
  }

  const handleImportSiteSurvey = (file: File) => {
    void file.text().then(source => {
      try {
        const survey = importSiteSurveyCsv(source, { fileName: file.name })
        const result = dispatchCommandBatch([{ name: 'UpdateSiteSurvey', input: { survey } }])
        setFileFeedback(result.status === 'success'
          ? `นำเข้าข้อมูลสำรวจ ${survey.points.length} จุด · วัดจริง ${survey.points.filter(point => point.source_status === 'measured').length} · สมมติ ${survey.points.filter(point => point.source_status === 'assumed').length}`
          : (result.errors ?? []).join('\n'))
      } catch (error) {
        setFileFeedback(error instanceof Error ? error.message : 'อ่านข้อมูลสำรวจ CSV ไม่สำเร็จ')
      }
    }).catch(() => setFileFeedback('อ่านข้อมูลสำรวจ CSV ไม่สำเร็จ'))
  }

  return { handleUploadUnderlayImage, handleImportSiteSurvey }
}
