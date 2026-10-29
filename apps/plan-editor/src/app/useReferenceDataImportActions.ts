import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { UnderlayConfig } from '../rendering/planRenderer.js'
import type { useProjectSession } from './useProjectSession.js'
import type { DwgDrawingCandidate } from '../cad/importDwgUnderlay.js'
import type { DwgDrawingSelection } from '../components/DwgDrawingPickerModal.js'
import type { ProjectUnderlay, ProjectViewId } from '@constructflow/project-model'
import type { PdfPageAlignment, PdfPageScaleCalibration } from '../cad/renderPdfUnderlayPage.js'

interface UseReferenceDataImportActionsOptions {
  underlayKey: string
  hydratedUnderlayRef: MutableRefObject<string | null>
  setUnderlay: Dispatch<SetStateAction<UnderlayConfig>>
  setFileFeedback: Dispatch<SetStateAction<string>>
  dispatchCommandBatch: ReturnType<typeof useProjectSession>['dispatchCommandBatch']
  onChoosePdf: (file: File) => void
  onImportPdfUnderlay: (underlays: ProjectUnderlay[]) => void
  activeLevelId: string
  onChooseDwgCandidates: (file: File, candidates: DwgDrawingCandidate[]) => void
  onImportDwgDrawings: (drawings: Array<{ key: string; underlay: ProjectUnderlay }>) => void
  viewId: ProjectViewId
}

/** Owns reference-file parsing while project mutations remain on the shared session command path. */
export function useReferenceDataImportActions({
  underlayKey, hydratedUnderlayRef, setUnderlay, setFileFeedback, dispatchCommandBatch, onChoosePdf, onImportPdfUnderlay, activeLevelId, onChooseDwgCandidates, onImportDwgDrawings, viewId,
}: UseReferenceDataImportActionsOptions) {
  const openUnderlayImage = (file: File, dataUrl: string, originMm: [number, number], scaleMmPerPx: number, scaleSource: 'declared_units' | 'assumed_units' = 'assumed_units', source: { source_kind?: 'image' | 'dxf' | 'dwg'; source_layout?: string; source_region?: [number, number, number, number] } = {}) => {
      const image = new Image()
      image.onload = () => {
        image.dataset.projectSrc = dataUrl
        hydratedUnderlayRef.current = `${underlayKey}:${dataUrl}`
        setUnderlay(current => {
          const priorLayers = [...(current.additional_layers ?? []), ...(current.drawing_id ? [current] : [])]
          return { image, additional_layers: priorLayers, source_file: file.name, source_kind: source.source_kind, source_layout: source.source_layout, source_region: source.source_region, scale_source: scaleSource, origin_mm: originMm, scale_mm_per_px: scaleMmPerPx, rotation_deg: 0, opacity: 0.6, visible: true }
        })
      }
      image.onerror = () => setFileFeedback('เปิดไฟล์อ้างอิงไม่สำเร็จ')
      image.src = dataUrl
  }

  const handleUploadUnderlayImage = (file: File) => {

    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
      if (file.size > 100 * 1024 * 1024) { setFileFeedback('PDF เกิน 100 MB · แยกไฟล์หรือส่งออกเฉพาะหน้าแปลนก่อนนำเข้า'); return }
      onChoosePdf(file)
      return
    }

    if (/\.(dwg|dxf)$/i.test(file.name)) {
      setFileFeedback(`กำลังอ่าน ${file.name} และแยก Model Space / Layout…`)
      void import('../cad/importDwgUnderlay.js').then(({ importDwgUnderlayCandidates }) => importDwgUnderlayCandidates(file)).then(candidates => {
        onChooseDwgCandidates(file, candidates)
      }).catch(error => setFileFeedback(error instanceof Error ? error.message : 'อ่านไฟล์ DWG/DXF ไม่สำเร็จ'))
      return
    }

    const reader = new FileReader()
    reader.onerror = () => setFileFeedback('อ่านไฟล์ภาพอ้างอิงไม่สำเร็จ')
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '')
      if (!dataUrl.startsWith('data:image/')) { setFileFeedback('ไฟล์ที่เลือกไม่ใช่ภาพที่รองรับ'); return }
      openUnderlayImage(file, dataUrl, [0, 0], 10, 'assumed_units', { source_kind: 'image' })
    }
    reader.readAsDataURL(file)
  }

  const handleImportPdfUnderlay = async (
    file: File,
    pageNumbers: number[],
    calibrations: PdfPageScaleCalibration[],
    alignments: PdfPageAlignment[] = [],
  ) => {
    if (!pageNumbers.length) { setFileFeedback('เลือกหน้า PDF อย่างน้อยหนึ่งหน้าก่อนนำเข้า'); return false }
    const requests = pageNumbers.map(pageNumber => {
      const calibration = calibrations.find(item => item.filename === file.name && item.source_page_number === pageNumber)
      return { pageNumber, calibration, alignment: alignments.find(item => item.filename === file.name && item.source_page_number === pageNumber) }
    })
    const missingCalibration = requests.find(item => !item.calibration)
    if (missingCalibration) { setFileFeedback(`ตั้งสเกลหน้า ${missingCalibration.pageNumber} จากมิติที่ทราบค่าก่อนนำเข้า`); return false }
    try {
      const { renderPdfUnderlayPages } = await import('../cad/renderPdfUnderlayPage.js')
      const underlays = await renderPdfUnderlayPages({
        file,
        pages: requests.map(item => ({ pageNumber: item.pageNumber, calibration: item.calibration!, ...(item.alignment ? { alignment: item.alignment } : {}) })),
        viewId, activeLevelId,
      })
      onImportPdfUnderlay(underlays)
      setFileFeedback(`นำเข้า ${file.name} ${underlays.length} หน้าเป็นแบบอ้างอิงแล้ว · ตั้งสเกลแยกต่อหน้า · เลือกชั้นได้ในตำแหน่งอ้างอิง`)
      return true
    } catch (error) {
      setFileFeedback(error instanceof Error ? error.message : 'แปลงหน้า PDF เป็นแบบอ้างอิงไม่สำเร็จ')
      return false
    }
  }

  const handleImportDwgCandidates = async (file: File, selections: DwgDrawingSelection[]) => {
    try {
      const { materializeDwgUnderlay } = await import('../cad/importDwgUnderlay.js')
      const drawings = selections.map(selection => {
        const imported = materializeDwgUnderlay(selection.candidate, selection.region)
        const id = crypto.randomUUID()
        return {
          key: `drawing:${id}`,
          underlay: {
            drawing_id: id,
            display_name: selection.display_name,
            view_id: viewId,
            level_id: selection.level_id,
            data_url: imported.dataUrl,
            source_file: file.name,
            source_kind: file.name.toLowerCase().endsWith('.dxf') ? 'dxf' as const : 'dwg' as const,
            ...(imported.source_layout ? { source_layout: imported.source_layout } : {}),
            ...(imported.source_region ? { source_region: imported.source_region } : {}),
            scale_source: ['unitless', 'unknown'].includes(imported.drawing_units) ? 'assumed_units' as const : 'declared_units' as const,
            origin_mm: imported.origin_mm,
            scale_mm_per_px: imported.scale_mm_per_px,
            rotation_deg: 0,
            opacity: 0.6,
            visible: true,
          },
          candidate: selection.candidate,
          imported,
        }
      })
      onImportDwgDrawings(drawings.map(({ key, underlay }) => ({ key, underlay })))
      const unknownUnits = drawings.filter(({ imported }) => ['unitless', 'unknown'].includes(imported.drawing_units)).length
      const skipped = drawings.reduce((sum, { imported }) => sum + imported.skipped_entities, 0)
      setFileFeedback(`เพิ่ม ${drawings.length} แปลนจาก ${file.name} แยกตามชั้นแล้ว${unknownUnits ? ` · ${unknownUnits} รายการต้องปรับเทียบสเกล` : ''}${skipped ? ` · ข้าม entity ที่อ่านไม่ได้ ${skipped} รายการ` : ''}`)
    } catch (error) {
      setFileFeedback(error instanceof Error ? error.message : 'นำเข้าแปลนจาก DWG ไม่สำเร็จ')
    }
  }

  const handleImportSiteSurvey = (file: File) => {
    void file.text().then(async source => {
      try {
        const { importSiteSurveyCsv } = await import('../cad/importSiteSurveyCsv.mjs')
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

  return { handleUploadUnderlayImage, handleImportPdfUnderlay, handleImportDwgCandidates, handleImportSiteSurvey }
}
