import React, { useMemo } from 'react'
import type { ProjectDocument } from '@constructflow/project-model'
import { calculatePhasedBOQ, calculateTakeoff } from '@constructflow/takeoff-engine'

const headerActionStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, background: '#1e293b', color: '#e2e8f0',
  border: '1px solid #334155', borderRadius: 4, padding: '4px 7px', fontSize: 11, cursor: 'pointer',
}

const takeoffCostCenterLabels: Record<string, string> = {
  demolition_site_prep: 'รื้อถอน/เตรียมพื้นที่',
  new_construction: 'งานสร้างใหม่',
  remodeling_joint_treatment: 'รอยต่อเดิม–ใหม่',
}

interface TakeoffPanelProps {
  project: ProjectDocument
  onOpenConstruction: () => void
  onExportTakeoff: () => void
  onExportBOQ: () => void
}

/** Load and calculate quantities only when the user opens the quantity tab. */
export const TakeoffPanel: React.FC<TakeoffPanelProps> = ({ project, onOpenConstruction, onExportTakeoff, onExportBOQ }) => {
  const takeoff = useMemo(() => calculateTakeoff(project), [project])
  const boq = useMemo(() => calculatePhasedBOQ(project), [project])

  return <section className="cf-takeoff-panel">
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
      <strong style={{ color: '#e2e8f0', fontSize: 12 }}>ประมาณราคา & BOQ (ไทย)</strong>
      <div style={{ display: 'flex', gap: 4 }}>
        <button type="button" onClick={onOpenConstruction} title="เปิด viewport และส่งออกชุดแบบ A3 20 แผ่น" style={{ ...headerActionStyle, fontSize: 10 }}>A3 · 20 Sheets</button>
        <button type="button" onClick={onExportTakeoff} title="ส่งออกตารางถอดปริมาณ Net/Gross CSV" style={{ ...headerActionStyle, fontSize: 10 }}>Net CSV</button>
        <button type="button" onClick={onExportBOQ} title="ส่งออกตาราง BOQ แยก 3 หมวด พร้อม Factor F และ VAT 7%" style={{ ...headerActionStyle, fontSize: 10, background: '#0284c7', color: '#fff' }}>BOQ (฿)</button>
      </div>
    </div>
    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6, padding: '7px 9px', marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>ยอดรวมค่าก่อสร้าง (รวม Factor F & VAT 7%)</span>
        <b style={{ fontSize: 13, color: '#38bdf8' }}>฿{boq.grand_total_thb.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</b>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b' }}>
        <span>ต้นทุนตรง: ฿{boq.total_direct_cost_thb.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</span>
        <span>เตรียมการ: ฿{boq.preliminaries_cost_thb.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</span>
        <span>Factor F: {boq.factor_f.factor_f.toFixed(4)}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginTop: 6, paddingTop: 6, borderTop: '1px solid #1e293b', fontSize: 9 }}>
        <div style={{ color: '#ef4444' }} title="งานรื้อถอนและเตรียมพื้นที่">รื้อถอน: ฿{boq.cost_centers.demolition_site_prep.total_direct_cost_thb.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</div>
        <div style={{ color: '#38bdf8' }} title="งานโครงสร้าง สถาปัตย์ และระบบสร้างใหม่">สร้างใหม่: ฿{boq.cost_centers.new_construction.total_direct_cost_thb.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</div>
        <div style={{ color: '#f0abfc' }} title="งานเชื่อมต่อรอยต่อเดิม-ใหม่">รอยต่อ: ฿{boq.cost_centers.remodeling_joint_treatment.total_direct_cost_thb.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</div>
      </div>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 180, overflowY: 'auto' }}>
      {takeoff.lines.length === 0 ? <span style={{ color: '#64748b', fontSize: 11 }}>ยังไม่มีรายการถอดปริมาณ</span> : takeoff.lines.slice(0, 15).map(line => (
        <div key={line.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 10, color: '#94a3b8' }}>
          <span title={`${line.cost_center} · ${line.formula} ${line.waste_percent ? `(เผื่อเศษ ${line.waste_percent}%)` : ''}`}>
            <b style={{ color: line.cost_center === 'remodeling_joint_treatment' ? '#f0abfc' : line.cost_center === 'demolition_site_prep' ? '#ef4444' : '#94a3b8' }}>{takeoffCostCenterLabels[line.cost_center] ?? line.cost_center}</b>{' '}{line.mark} · {line.phase}
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {line.waste_percent ? <span style={{ fontSize: 9, color: '#64748b' }}>+{line.waste_percent}%</span> : null}
            <b style={{ color: '#cbd5e1', whiteSpace: 'nowrap' }}>{line.quantity.toFixed(3)} {line.unit}</b>
          </div>
        </div>
      ))}
    </div>
    {takeoff.warnings.length > 0 && <div title={takeoff.warnings.join('\n')} style={{ color: '#fbbf24', fontSize: 10, marginTop: 7 }}>ต้องตรวจสอบ {takeoff.warnings.length} รายการ</div>}
  </section>
}
