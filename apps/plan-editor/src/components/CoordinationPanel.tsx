// Coordination Inspector — the human side of the clash engine.
//
// Every row answers the five questions a site engineer actually asks: which rule, how bad, which
// objects, by how many millimetres, and what to do about it. Rule overrides are written back as
// project settings through the CommandBus so they stay inside undo/redo.

import { useMemo, useState } from 'react'
import type { CoordinationFinding, CoordinationReport } from '@constructflow/clash-engine'
import type { CoordinationSettings, ProjectDocument } from '@constructflow/project-model'
import { COORDINATION_SEVERITY_STYLE, coordinationFixText, coordinationMeasureText } from '../rendering/coordinationOverlay.js'

interface Props {
  project: ProjectDocument
  report: CoordinationReport | null
  error: string | null
  selectedIds: readonly string[]
  onSelectObjects: (ids: string[]) => void
  onSubmitSettings: (settings: CoordinationSettings) => void
}

const severityOrder: Array<CoordinationFinding['severity']> = ['hard', 'clearance', 'soft']

const chip = (active: boolean, color: string): React.CSSProperties => ({
  border: `1px solid ${active ? color : '#334155'}`,
  background: active ? `${color}22` : 'transparent',
  color: active ? color : '#94a3b8',
  borderRadius: 500,
  padding: '2px 6px',
  fontSize: 10,
  cursor: 'pointer',
})

export function CoordinationPanel({ project, report, error, selectedIds, onSelectObjects, onSubmitSettings }: Props) {
  const [severities, setSeverities] = useState<Set<CoordinationFinding['severity']>>(new Set(severityOrder))
  const [onlySelected, setOnlySelected] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [draftMm, setDraftMm] = useState('')

  const findings = useMemo(() => {
    if (!report) return []
    const selected = new Set(selectedIds)
    return report.findings.filter(finding =>
      severities.has(finding.severity)
      && (!onlySelected || finding.objects.some(object => selected.has(object.object_id))))
  }, [report, severities, onlySelected, selectedIds])

  const overrides = project.coordination_settings?.overrides ?? []

  const toggleSeverity = (severity: CoordinationFinding['severity']) => {
    setSeverities(current => {
      const next = new Set(current)
      if (next.has(severity)) next.delete(severity)
      else next.add(severity)
      return next
    })
  }

  const applyOverride = (finding: CoordinationFinding, required_mm: number | null) => {
    const current = project.coordination_settings ?? {}
    const others = overrides.filter(override => override.rule_id !== finding.rule_id)
    const next: CoordinationSettings = {
      ...current,
      overrides: required_mm === null
        ? others
        : [...others, { rule_id: finding.rule_id, required_clearance_mm: required_mm, note: `ปรับจากแผงตรวจสอบ: ${finding.title_th}` }],
    }
    onSubmitSettings(next)
    setEditing(null)
    setDraftMm('')
  }

  if (error) return <section className="cf-takeoff-panel"><div style={{ color: '#f87171', fontSize: 11 }}>ตรวจสอบระยะไม่สำเร็จ: {error}</div></section>
  if (!report) return <section className="cf-takeoff-panel"><span style={{ color: '#64748b', fontSize: 11 }}>กำลังตรวจสอบระยะ…</span></section>

  const summary = report.summary
  return (
    <section className="cf-takeoff-panel">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <strong style={{ color: '#e2e8f0', fontSize: 12 }}>ตรวจสอบระยะชน & ความสัมพันธ์</strong>
        <span style={{ fontSize: 9, color: '#64748b' }} title={`rule set ${report.rule_set.id} v${report.rule_set.version} rev ${report.rule_set.revision} · ใช้กับ ${report.rule_set.jurisdiction.join('/')}`}>
          {report.rule_set.id} v{report.rule_set.version} · {report.rule_set.effective_date}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 7, flexWrap: 'wrap', alignItems: 'center' }}>
        {severityOrder.map(severity => (
          <button key={severity} type="button" onClick={() => toggleSeverity(severity)} style={chip(severities.has(severity), COORDINATION_SEVERITY_STYLE[severity].stroke)}>
            {COORDINATION_SEVERITY_STYLE[severity].label_th} {summary.by_severity[severity] ?? 0}
          </button>
        ))}
        <button type="button" onClick={() => setOnlySelected(value => !value)} style={chip(onlySelected, '#38bdf8')} title="แสดงเฉพาะรายการที่เกี่ยวกับวัตถุที่เลือกอยู่">
          เฉพาะที่เลือก
        </button>
      </div>

      <div style={{ fontSize: 9, color: '#64748b', marginBottom: 8 }} title="จำนวนวัตถุที่พิจารณา / ตัวแทนทรงเรขาคณิต / คู่ที่ตรวจแบบละเอียด">
        พิจารณา {summary.objects_considered} ชิ้น · ตัวแทน {summary.proxies_built} · ตรวจละเอียด {summary.pairs_narrow_phased}/{summary.pairs_broad_phased} คู่
        {summary.suppressed_intentional ? ` · ข้ามจุดต่อตั้งใจ ${summary.suppressed_intentional}` : ''}
        {summary.suppressed_non_coexisting ? ` · ข้ามงานต่างช่วงเวลา ${summary.suppressed_non_coexisting}` : ''}
      </div>

      {findings.length === 0 ? (
        <div style={{ color: '#4ade80', fontSize: 11 }}>✅ ไม่พบระยะชนตามกฎที่เปิดใช้ในเฟสปัจจุบัน</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 300, overflowY: 'auto' }}>
          {findings.map(finding => {
            const style = COORDINATION_SEVERITY_STYLE[finding.severity]
            const override = overrides.find(candidate => candidate.rule_id === finding.rule_id)
            return (
              <div key={finding.id} style={{ border: `1px solid ${style.stroke}55`, borderLeft: `3px solid ${style.stroke}`, borderRadius: 3, padding: '4px 6px', background: '#0f172a' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                  <b style={{ fontSize: 11, color: '#e2e8f0' }}>{finding.title_th}</b>
                  <span style={{ fontSize: 9, color: style.stroke, whiteSpace: 'nowrap' }}>{style.label_th}</span>
                </div>
                <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }} title={`${finding.rule_id} rev ${finding.rule_revision} · ${finding.source.standard}`}>
                  {finding.rule_id} · {finding.source.standard}{finding.source.clause ? ` ${finding.source.clause}` : ''} · {finding.basis === 'code' ? 'ตามกฎหมาย/มาตรฐาน' : 'ค่าออกแบบเริ่มต้น (แก้ได้ต่อโครงการ)'}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, margin: '5px 0' }}>
                  {finding.objects.map(object => (
                    <button key={object.object_id} type="button" onClick={() => onSelectObjects([object.object_id])}
                      title={`${object.label_th} (${object.object_type}) · ${object.created_phase}`}
                      style={{ background: '#1e293b', border: '1px solid #334155', color: '#cbd5e1', borderRadius: 2, fontSize: 9, padding: '1px 4px', cursor: 'pointer' }}>
                      {object.subject === 'a' ? 'A' : 'B'}: {object.mark}{object.role ? ` · ${object.role}` : ''}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: '#fbbf24' }}>{coordinationMeasureText(finding)}</div>
                <div style={{ fontSize: 10, color: '#38bdf8', marginTop: 2 }}>💡 {coordinationFixText(finding)}</div>
                {finding.suggestion.alternatives.length > 0 && (
                  <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>
                    ทางเลือก: {finding.suggestion.alternatives.map(alternative => alternative.phrase_th).join(' · ')}
                  </div>
                )}
                {finding.requires_engineer_review && (
                  <div style={{ fontSize: 9, color: '#f87171', marginTop: 2 }}>ต้องให้วิศวกรตรวจและออกแบบขยายก่อนดำเนินการ</div>
                )}
                {finding.phase_context.coexistence !== 'same_phase' && (
                  <div style={{ fontSize: 9, color: '#a78bfa', marginTop: 2 }}>ช่วงเวลา: {finding.phase_context.coexistence === 'sequential' ? 'ทำงานต่างช่วงเวลา (เดิม↔ใหม่)' : finding.phase_context.coexistence === 'existing_vs_new' ? 'ของเดิมกับของใหม่' : 'คละเฟส'}</div>
                )}
                <div style={{ display: 'flex', gap: 4, marginTop: 5, alignItems: 'center' }}>
                  {editing === finding.id ? (
                    <>
                      <input value={draftMm} onChange={event => setDraftMm(event.target.value)} placeholder="ระยะที่ต้องการ (มม.)" inputMode="numeric"
                        style={{ width: 110, background: '#0b1329', border: '1px solid #334155', color: '#e2e8f0', fontSize: 10, borderRadius: 2, padding: '2px 4px' }} />
                      <button type="button" onClick={() => { const parsed = Number(draftMm); if (Number.isFinite(parsed) && parsed >= 0) applyOverride(finding, parsed) }}
                        style={{ ...chip(true, '#0284c7') }}>บันทึก</button>
                      <button type="button" onClick={() => { setEditing(null); setDraftMm('') }} style={chip(false, '#94a3b8')}>ยกเลิก</button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => { setEditing(finding.id); setDraftMm(String(finding.interaction.required_clearance_mm ?? finding.suggestion.recommended_mm ?? '')) }}
                        style={chip(false, '#94a3b8')} title="กำหนดระยะที่ต้องการเฉพาะโครงการนี้ (บันทึกในไฟล์ .cfproj ผ่าน CommandBus)">
                        {override ? 'แก้ระยะที่กำหนดไว้' : 'กำหนดระยะเอง'}
                      </button>
                      {override && (
                        <>
                          <span style={{ fontSize: 9, color: '#38bdf8' }}>ใช้ค่าโครงการ: {override.required_clearance_mm} มม.</span>
                          <button type="button" onClick={() => applyOverride(finding, null)} style={chip(false, '#f87171')}>คืนค่ามาตรฐาน</button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {report.warnings.length > 0 && (
        <div title={report.warnings.join('\n')} style={{ color: '#fbbf24', fontSize: 10, marginTop: 7 }}>
          ต้องสำรวจ/ยืนยันเพิ่มเติม {report.warnings.length} รายการ (เช่น ระดับก้นท่อ)
        </div>
      )}
    </section>
  )
}
