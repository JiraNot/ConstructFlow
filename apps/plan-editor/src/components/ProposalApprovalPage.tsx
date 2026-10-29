import React, { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Clock3, FileText, ShieldAlert, XCircle } from 'lucide-react'
import type { ProposalApprovalSnapshot, PublicProposalApproval } from '../integrations/proposalApproval.js'
import { getPublicProposalApproval, submitPublicProposalDecision } from '../integrations/proposalApproval.js'
import { ProposalSignatureCaptureModal } from './ProposalSignatureCaptureModal.js'

const money = (value: number) => `฿${value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const phases: Record<string, string> = { existing: 'อาคารเดิม', demolition: 'รื้อถอน', new_construction: 'สร้างใหม่' }
const costCenters: Record<string, string> = { demolition_site_prep: 'รื้อถอนและเตรียมพื้นที่', new_construction: 'งานสร้างใหม่', remodeling_joint_treatment: 'งานเชื่อมต่อเดิม–ใหม่' }

function ApprovalStatus({ approval }: { approval: PublicProposalApproval }) {
  if (approval.status === 'accepted') return <div className="cf-approval-state is-success"><CheckCircle2 /><div><strong>ตอบรับข้อเสนอแล้ว</strong><span>{approval.decision?.signer_name}{approval.decision?.decided_at ? ` · ${new Date(approval.decision.decided_at).toLocaleString('th-TH')}` : ''}</span></div></div>
  if (approval.status === 'declined') return <div className="cf-approval-state is-declined"><XCircle /><div><strong>บันทึกว่าไม่รับข้อเสนอแล้ว</strong><span>{approval.decision?.signer_name}{approval.decision?.decided_at ? ` · ${new Date(approval.decision.decided_at).toLocaleString('th-TH')}` : ''}</span>{approval.decision?.note && <small>{approval.decision.note}</small>}</div></div>
  if (approval.status === 'expired' || approval.status === 'revoked') return <div className="cf-approval-state is-inactive"><Clock3 /><div><strong>{approval.status === 'expired' ? 'ลิงก์นี้หมดอายุแล้ว' : 'ลิงก์นี้ถูกยกเลิกแล้ว'}</strong><span>ติดต่อผู้เสนอราคาเพื่อขอลิงก์ใหม่</span></div></div>
  return null
}

export const ProposalApprovalPage: React.FC<{ token: string }> = ({ token }) => {
  const [approval, setApproval] = useState<PublicProposalApproval | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [decision, setDecision] = useState<'accepted' | 'declined' | null>(null)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    void getPublicProposalApproval(token).then(result => {
      if (!active) return
      setApproval(result)
      setError('')
    }).catch(cause => {
      if (!active) return
      setError(cause instanceof Error ? cause.message : 'เปิดข้อเสนอไม่สำเร็จ')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token, refresh])

  const snapshot = approval?.snapshot as ProposalApprovalSnapshot | undefined
  const grandTotal = snapshot?.totals.grand_total_thb ?? 0
  const groupedLines = useMemo(() => {
    const groups = new Map<string, ProposalApprovalSnapshot['lines']>()
    for (const line of snapshot?.lines ?? []) {
      const key = `${line.phase}::${line.cost_center}`
      groups.set(key, [...(groups.get(key) ?? []), line])
    }
    return [...groups.entries()]
  }, [snapshot])

  return <main className="cf-approval-page">
    <header className="cf-approval-brand"><span className="cf-approval-mark"><FileText size={21} /></span><span>ConstructFlow <small>ข้อเสนอราคา</small></span></header>
    <div className="cf-approval-shell">
      {loading && <section className="cf-approval-card cf-approval-loading" aria-live="polite">กำลังเปิดข้อเสนอ…</section>}
      {!loading && error && <section className="cf-approval-card cf-approval-error"><ShieldAlert /><h1>เปิดลิงก์ไม่สำเร็จ</h1><p>{error}</p><button type="button" onClick={() => setRefresh(value => value + 1)}>ลองอีกครั้ง</button></section>}
      {!loading && approval && !snapshot && <section className="cf-approval-card cf-approval-action-card"><ApprovalStatus approval={approval} /><p>ลิงก์นี้ไม่สามารถแสดงรายละเอียดหรือรับคำตอบได้แล้ว</p></section>}
      {!loading && approval && snapshot && <>
        <section className="cf-approval-card cf-approval-intro">
          <p className="cf-approval-eyebrow">ข้อเสนอจาก {snapshot.project_name}</p>
          <h1>{snapshot.title}</h1>
          <p>เรียน {snapshot.recipient_name || 'ลูกค้า'}</p>
          <div className="cf-approval-meta"><span>ใช้ได้ถึง {snapshot.valid_until ? new Date(`${snapshot.valid_until}T00:00:00`).toLocaleDateString('th-TH') : 'ไม่ระบุวันหมดอายุ'}</span><span>ลิงก์หมดอายุ {new Date(approval.expires_at).toLocaleDateString('th-TH')}</span></div>
        </section>
        <section className="cf-approval-card">
          <div className="cf-approval-section-heading"><div><p className="cf-approval-eyebrow">รายละเอียดราคา</p><h2>ขอบเขตและรายการงาน</h2></div><b>หน่วยเงิน: บาท</b></div>
          {groupedLines.length ? groupedLines.map(([key, lines]) => <div className="cf-approval-group" key={key}>
            <h3>{phases[lines[0]?.phase ?? ''] ?? lines[0]?.phase} · {costCenters[lines[0]?.cost_center ?? ''] ?? lines[0]?.cost_center}</h3>
            <div className="cf-approval-lines">{lines.map((line, index) => <article className="cf-approval-line" key={`${key}-${line.mark}-${index}`}>
              <div><strong>{line.description}</strong><small>{line.mark}{line.formula ? ` · ${line.formula}` : ''}</small></div>
              <span>{line.quantity.toLocaleString('th-TH', { maximumFractionDigits: 3 })} {line.unit}</span><span>{money(line.unit_rate_thb)} / {line.unit}</span><b>{money(line.amount_thb)}</b>
            </article>)}</div>
          </div>) : <p className="cf-approval-empty">ไม่มีรายการ BOQ แยกในข้อเสนอนี้</p>}
          <dl className="cf-approval-totals">
            <div><dt>ต้นทุนตรง</dt><dd>{money(snapshot.totals.direct_cost_thb)}</dd></div>
            <div><dt>เตรียมการ</dt><dd>{money(snapshot.totals.preliminaries_thb)}</dd></div>
            <div><dt>Factor F</dt><dd>×{snapshot.totals.factor_f.toLocaleString('th-TH', { maximumFractionDigits: 4 })}</dd></div>
            {snapshot.totals.product_margin_amount_thb !== 0 && <div><dt>ส่วนเพิ่มจากสินค้า</dt><dd>{money(snapshot.totals.product_margin_amount_thb)}</dd></div>}
            {snapshot.totals.gross_margin_amount_thb !== 0 && <div><dt>ส่วนเพิ่มราคา</dt><dd>{money(snapshot.totals.gross_margin_amount_thb)}</dd></div>}
            {snapshot.totals.discount_amount_thb !== 0 && <div><dt>ส่วนลด</dt><dd>−{money(snapshot.totals.discount_amount_thb)}</dd></div>}
            <div><dt>VAT {(snapshot.totals.vat_rate * 100).toLocaleString('th-TH')}%</dt><dd>{money(snapshot.totals.vat_amount_thb)}</dd></div>
            <div className="is-grand"><dt>ยอดสุทธิ</dt><dd>{money(grandTotal)}</dd></div>
          </dl>
        </section>
        {(snapshot.conditional_texts.length > 0 || snapshot.notes || snapshot.terms) && <section className="cf-approval-card cf-approval-notes">
          {snapshot.conditional_texts.map((text, index) => <p key={`conditional-${index}`}>{text}</p>)}
          {snapshot.notes && <div><h2>หมายเหตุ</h2><p>{snapshot.notes}</p></div>}
          {snapshot.terms && <div><h2>เงื่อนไข</h2><p>{snapshot.terms}</p></div>}
        </section>}
        <section className="cf-approval-card cf-approval-action-card">
          <ApprovalStatus approval={approval} />
          {approval.status === 'pending' && <>
            <h2>ตอบกลับข้อเสนอนี้</h2><p>ตรวจสอบรายการและยอดสุทธิก่อนเลือกคำตอบ</p>
            <div className="cf-approval-actions"><button type="button" className="is-decline" onClick={() => setDecision('declined')}>ไม่รับข้อเสนอ</button><button type="button" className="is-accept" onClick={() => setDecision('accepted')}>ตอบรับข้อเสนอ</button></div>
            <small>ลิงก์นี้ใช้ตอบกลับได้ครั้งเดียว หากข้อมูลไม่ถูกต้องให้ติดต่อผู้เสนอราคา</small>
          </>}
        </section>
        <p className="cf-approval-disclosure">ชื่อและลายเซ็นเป็นข้อมูลที่ผู้กรอกระบุเอง ระบบบันทึกการตอบกลับจากลิงก์ใช้ครั้งเดียว แต่ไม่ได้ยืนยันตัวตนและไม่ใช่ผู้ให้บริการ e-signature</p>
      </>}
    </div>
    {decision && approval?.snapshot_hash && snapshot && <ProposalSignatureCaptureModal
      proposalTitle={snapshot.title}
      initialSignerName={snapshot.recipient_name}
      mode="recipient"
      decision={decision}
      onCancel={() => setDecision(null)}
      onConfirm={async (signature, target, note) => {
        await submitPublicProposalDecision(token, target, approval.snapshot_hash!, signature, note)
        setDecision(null)
        setRefresh(value => value + 1)
        return true
      }}
    />}
  </main>
}
