import type { ProjectDocument } from '@constructflow/project-model'
function downloadTextFile(filename: string, content: string, mimeType: string, revokeDelayMs = 0) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  if (revokeDelayMs > 0) window.setTimeout(() => URL.revokeObjectURL(url), revokeDelayMs)
  else URL.revokeObjectURL(url)
}

function quoteCsvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`
}

function csvDocument(rows: Array<Array<string | number>>) {
  return `\uFEFF${rows.map(row => row.map(quoteCsvCell).join(',')).join('\r\n')}`
}

/** Owns file compilation, downloads, and export feedback for the workbench. */
export function createWorkbenchExportActions(
  project: ProjectDocument,
  setFileFeedback: (message: string) => void,
) {
  const handleExportTakeoff = async () => {
    try {
    const { calculateTakeoff } = await import('@constructflow/takeoff-engine')
    const takeoff = calculateTakeoff(project)
    const rows: Array<Array<string | number>> = [
      ['Cost center', 'Phase', 'Mark', 'Object type', 'Material', 'Quantity', 'Unit', 'Waste %', 'Gross Quantity', 'Formula'],
      ...takeoff.lines.map(line => [
        line.cost_center, line.phase, line.mark, line.object_type, line.material ?? '',
        line.quantity.toFixed(3), line.unit, `${line.waste_percent ?? 0}%`,
        (line.gross_quantity ?? line.quantity).toFixed(3), line.formula,
      ]),
    ]
    downloadTextFile(`${project.project.id || 'project'}-takeoff.csv`, csvDocument(rows), 'text/csv;charset=utf-8')
    } catch (error) {
      setFileFeedback(`ส่งออกปริมาณไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleExportBOQ = async () => {
    try {
    const { calculatePhasedBOQ } = await import('@constructflow/takeoff-engine')
    const boq = calculatePhasedBOQ(project)
    const rows: Array<Array<string | number>> = [[
      'หมวดงาน / Cost Center', 'สถานะ / Phase', 'สัญลักษณ์ / Mark', 'ประเภทวัตถุ', 'วัสดุ',
      'ปริมาณสุทธิ', 'หน่วย', 'เผื่อเศษ (%)', 'ปริมาณรวมเศษ', 'ราคาวัสดุ/หน่วย (บาท)',
      'รวมค่าวัสดุ (บาท)', 'ค่าแรง/หน่วย (บาท)', 'รวมค่าแรง (บาท)', 'รวมต้นทุนตรง (บาท)', 'สูตรคำนวณ',
    ]]
    for (const [, costCenter] of Object.entries(boq.cost_centers)) {
      for (const item of costCenter.items) {
        rows.push([
          costCenter.cost_center_label_th, item.phase, item.mark, item.object_type, item.material ?? '',
          item.net_quantity.toFixed(3), item.unit, `${item.waste_percent}%`, item.gross_quantity.toFixed(3),
          item.unit_material_cost_thb.toFixed(2), item.total_material_cost_thb.toFixed(2),
          item.unit_labor_cost_thb.toFixed(2), item.total_labor_cost_thb.toFixed(2),
          item.total_direct_cost_thb.toFixed(2), item.formula,
        ])
      }
    }
    rows.push([])
    rows.push(['--- หมวดงานเตรียมการและงานชั่วคราว (Preliminaries) ---', '', '', '', '', '', '', '', '', '', '', '', '', '', ''])
    for (const preliminary of boq.preliminaries.items) {
      rows.push([
        'งานเตรียมการและงานชั่วคราว', 'new_construction', preliminary.code, preliminary.category,
        preliminary.description, preliminary.quantity.toFixed(2), preliminary.unit, '0%',
        preliminary.quantity.toFixed(2), preliminary.rate_thb.toFixed(2), preliminary.amount_thb.toFixed(2),
        '0.00', '0.00', preliminary.amount_thb.toFixed(2), preliminary.notes,
      ])
    }
    rows.push([])
    rows.push(['--- สรุปประมาณการค่างานทั้งโครงการ (BOQ Summary) ---', '', '', '', '', '', '', '', '', '', '', '', '', '', ''])
    rows.push(['สรุปต้นทุนตรงค่าวัสดุ (Direct Material)', '', '', '', '', '', '', '', '', '', boq.total_direct_material_thb.toFixed(2), '', '', '', ''])
    rows.push(['สรุปต้นทุนตรงค่าแรง (Direct Labor)', '', '', '', '', '', '', '', '', '', '', '', boq.total_direct_labor_thb.toFixed(2), '', ''])
    rows.push(['รวมต้นทุนตรงค่างาน (Direct Cost)', '', '', '', '', '', '', '', '', '', '', '', '', boq.total_direct_cost_thb.toFixed(2), ''])
    rows.push(['รวมงานเตรียมการและงานชั่วคราว (Preliminaries)', '', '', '', '', '', '', '', '', '', '', '', '', boq.preliminaries_cost_thb.toFixed(2), ''])
    rows.push(['รวมต้นทุนตรงรวมงานเตรียมการ', '', '', '', '', '', '', '', '', '', '', '', '', boq.total_direct_with_preliminaries_thb.toFixed(2), ''])
    rows.push([`Factor F (งานอาคาร กรมบัญชีกลาง - กำไร ดอกเบี้ย ภาษี 7%)`, '', '', '', '', '', '', '', '', '', '', '', '', boq.factor_f.factor_f.toFixed(4), ''])
    rows.push(['ยอดรวมค่าก่อสร้างสุทธิ (Grand Total THB)', '', '', '', '', '', '', '', '', '', '', '', '', boq.grand_total_thb.toFixed(2), ''])
    downloadTextFile(`${project.project.id || 'project'}-boq-thailand.csv`, csvDocument(rows), 'text/csv;charset=utf-8')
    } catch (error) {
      setFileFeedback(`ส่งออก BOQ ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleExportDrawingSet = async () => {
    try {
      const { renderPermitDrawingSetHtml } = await import('@constructflow/sheet-engine')
      const html = renderPermitDrawingSetHtml(project)
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
      const preview = window.open(url, '_blank')
      if (!preview) {
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `${project.project.id || 'project'}-A02-S01-A08.html`
        anchor.click()
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (error) {
      setFileFeedback(`ส่งออกชุดแบบไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleExportDxf = async () => {
    try {
      const { exportProjectToDxf } = await import('@constructflow/cad-adapter')
      const result = exportProjectToDxf(project, {
        projectName: project.project.name,
        architectName: project.legal_metadata?.signatories?.architect_name,
        engineerLicense: project.legal_metadata?.signatories?.structural_engineer_license_no,
      })
      downloadTextFile(`${project.project.id || 'ConstructFlow'}_20Layouts.dxf`, result.dxfContent, 'application/dxf', 1000)
      setFileFeedback('ส่งออก DXF 20 แผ่นแล้ว')
    } catch (error) {
      setFileFeedback(`ส่งออก DXF ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleExportIfc = async () => {
    try {
      const { exportProjectToIfc } = await import('@constructflow/bim-adapter')
      const result = exportProjectToIfc(project, {
        projectName: project.project.name,
        authorName: project.legal_metadata?.signatories?.architect_name,
      })
      downloadTextFile(`${project.project.id || 'ConstructFlow'}.ifc`, result.ifcContent, 'application/x-step', 1000)
      setFileFeedback('ส่งออก IFC 4.3 แล้ว')
    } catch (error) {
      setFileFeedback(`ส่งออก IFC ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return { handleExportTakeoff, handleExportBOQ, handleExportDrawingSet, handleExportDxf, handleExportIfc }
}
