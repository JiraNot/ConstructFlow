import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, ExternalLink, RefreshCw, Share2, X } from 'lucide-react'
import type { ProjectDocument, ProposalDraft, ProposalRecipientSignature, ProposalStatusTarget } from '@constructflow/project-model'
import { createProposalApprovalLink, listProposalApprovalLinks, revokeProposalApprovalLink, type ProposalApprovalLink } from '../integrations/proposalApproval.js'

interface ProposalApprovalLinkModalProps {
  project: ProjectDocument
  proposal: ProposalDraft
  onClose: () => void
  onApplyDecision: (target: ProposalStatusTarget, signature: ProposalRecipientSignature, note: string) => boolean
}

const statusLabels: Record<ProposalApprovalLink['status'], string> = { pending: 'รอคำตอบ', accepted: 'ตอบรับแล้ว', declined: 'ไม่รับข้อเสนอ', revoked: 'ยกเลิกแล้ว', expired: 'หมดอายุ' }

export const ProposalApprovalLinkModal: React.FC<ProposalApprovalLinkModalProps> = ({ project, proposal, onClose, onApplyDecision }) => {
  const [links, setLinks] = useState<ProposalApprovalLink[]>([])
  const [createdUrl, setCreatedUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)
  const projectId = project.project.id
  const activeLink = links.find(link => link.status === 'pending')

  const refreshLinks = useCallback(async () => {
    try {
      const result = await listProposalApprovalLinks(projectId, proposal.id)
      setLinks(result)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'อ่านสถานะลิงก์ไม่สำเร็จ')
    } finally { setLoading(false) }
  }, [projectId, proposal.id])

  useEffect(() => {
    void refreshLinks()
    const timer = window.setInterval(() => { if (!document.hidden) void refreshLinks() }, 10000)
    return () => window.clearInterval(timer)
  }, [refreshLinks])

  const appliedLinkIds = useMemo(() => new Set((proposal.status_events ?? []).flatMap(event => event.recipient_signature ? [event.recipient_signature.approval_link_id] : [])), [proposal.status_events])

  const makeLink = async () => {
    if (activeLink && !window.confirm('ลิงก์เดิมจะถูกยกเลิกทันทีและใช้งานไม่ได้ ต้องการสร้างลิงก์ใหม่หรือไม่?')) return
    setBusy(true); setError(''); setMessage(''); setCopied(false)
    try {
      const created = await createProposalApprovalLink(project, proposal)
      setCreatedUrl(created.url)
      setMessage(`สร้างลิงก์แล้ว · หมดอายุ ${new Date(created.expires_at).toLocaleDateString('th-TH')}`)
      await refreshLinks()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'สร้างลิงก์ไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  const copyLink = async () => {
    if (!createdUrl) return
    try {
      await navigator.clipboard.writeText(createdUrl)
      setCopied(true); setMessage('คัดลอกลิงก์แล้ว · ส่งให้ลูกค้าผ่าน LINE หรืออีเมลได้')
    } catch {
      setError('เบราว์เซอร์ไม่อนุญาตให้คัดลอก · เลือกและคัดลอกจากช่องลิงก์แทน')
    }
  }

  const shareLink = async () => {
    if (!createdUrl) return
    if (!navigator.share) { await copyLink(); return }
    try { await navigator.share({ title: proposal.title, text: `ข้อเสนอราคา ${proposal.title}`, url: createdUrl }) }
    catch (cause) { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError('เปิดเมนูแชร์ไม่สำเร็จ · คัดลอกลิงก์แทนได้') }
  }

  const revoke = async (link: ProposalApprovalLink) => {
    if (!window.confirm('ยกเลิกลิงก์นี้หรือไม่? ลูกค้าจะเปิดหรือตอบกลับไม่ได้')) return
    setBusy(true); setError(''); setMessage('')
    try {
      await revokeProposalApprovalLink(projectId, proposal.id, link.id)
      setCreatedUrl(''); setMessage('ยกเลิกลิงก์แล้ว'); await refreshLinks()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'ยกเลิกลิงก์ไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  const applyDecision = (link: ProposalApprovalLink) => {
    const response = link.decision
    if (!response || !response.signature || (response.status !== 'accepted' && response.status !== 'declined')) return
    const signature: ProposalRecipientSignature = {
      approval_link_id: link.id,
      signer_name: response.signer_name,
      strokes: structuredClone(response.signature.strokes),
      captured_at: response.decided_at,
    }
    const saved = onApplyDecision(response.status, signature, response.note)
    if (saved) setMessage(`นำผล “${statusLabels[response.status]}” ของ ${response.signer_name} เข้า Project แล้ว`)
    else setError('นำผลเข้าประวัติ Project ไม่สำเร็จ · ตรวจสอบสถานะข้อเสนอก่อนลองอีกครั้ง')
  }

  return createPortal(<div className="cf-approval-link-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="cf-approval-link-modal" role="dialog" aria-modal="true" aria-labelledby="cf-approval-link-title" onKeyDown={event => { if (event.key === 'Escape' && !busy) onClose() }}>
      <header><div><span className="cf-approval-link-icon"><Share2 size={18} /></span><div><h2 id="cf-approval-link-title">ลิงก์ตอบรับข้อเสนอ</h2><p>{proposal.title} · ฿{proposal.grand_total_thb.toLocaleString('th-TH', { maximumFractionDigits: 2 })}</p></div></div><button type="button" aria-label="ปิด" onClick={onClose} disabled={busy}><X size={20} /></button></header>
      <div className="cf-approval-link-body">
        <div className="cf-approval-link-notice"><strong>แชร์ให้ลูกค้าตรวจและตอบกลับ</strong><span>ลิงก์มีอายุ 14 วันและใช้ตอบกลับได้ครั้งเดียว · รายการราคาจะคงตาม snapshot ตอนสร้าง</span><span>ชื่อและลายเซ็นลูกค้าระบุด้วยตนเอง · ไม่มีการยืนยันตัวตนหรือผู้ให้บริการ e-signature</span></div>
        {activeLink && !createdUrl && <p className="cf-approval-link-warning">ลิงก์ที่สร้างก่อนหน้านี้ยังใช้งานได้ แต่ระบบเก็บ token แบบกู้คืนไม่ได้ หากต้องการแชร์อีกครั้งต้องออกลิงก์ใหม่</p>}
        {createdUrl && <div className="cf-approval-link-share"><label>ลิงก์นี้แสดงได้ครั้งเดียว คัดลอกหรือแชร์ก่อนปิดหน้าต่าง<input aria-label="ลิงก์ตอบรับลูกค้า" readOnly value={createdUrl} onFocus={event => event.currentTarget.select()} /></label><div><button type="button" onClick={() => void copyLink()}><Copy size={16} />{copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}</button><button type="button" onClick={() => void shareLink()}><ExternalLink size={16} />แชร์…</button></div></div>}
        {loading && <p>กำลังอ่านสถานะลิงก์…</p>}
        {!loading && <div className="cf-approval-link-list"><div className="cf-approval-link-list-heading"><strong>ประวัติลิงก์ล่าสุด</strong><button type="button" onClick={() => void refreshLinks()} aria-label="โหลดสถานะล่าสุด"><RefreshCw size={15} />รีเฟรช</button></div>
          {links.length === 0 && <p>ยังไม่มีลิงก์ตอบรับสำหรับข้อเสนอนี้</p>}
          {links.map(link => <article key={link.id}>
            <div><span className={`cf-approval-link-status is-${link.status}`}>{statusLabels[link.status]}</span><small>สร้าง {new Date(link.created_at).toLocaleString('th-TH')} · หมดอายุ {new Date(link.expires_at).toLocaleDateString('th-TH')}</small>
              {link.decision && <small>{link.decision.signer_name} · {new Date(link.decision.decided_at).toLocaleString('th-TH')}{link.decision.note ? ` · ${link.decision.note}` : ''}</small>}</div>
            {link.status === 'pending' && <button type="button" className="is-quiet" disabled={busy} onClick={() => void revoke(link)}>ยกเลิก</button>}
            {(link.status === 'accepted' || link.status === 'declined') && (appliedLinkIds.has(link.id)
              ? <span className="cf-approval-link-applied"><Check size={15} />อยู่ใน Project แล้ว</span>
              : proposal.status === 'sent' ? <button type="button" disabled={busy} onClick={() => applyDecision(link)}>บันทึกผลเข้า Project</button>
                : <small className="cf-approval-link-warning">สถานะข้อเสนอใน Project เปลี่ยนแล้ว · ใช้ผลนี้เปลี่ยนสถานะซ้ำไม่ได้</small>)}
          </article>)}
        </div>}
        {error && <p className="cf-approval-link-error" role="alert">{error}</p>}
        {message && <p className="cf-approval-link-message" role="status">{message}</p>}
      </div>
      <footer><button type="button" className="cf-button cf-button-quiet" onClick={onClose} disabled={busy}>ปิด</button><button type="button" className="cf-button cf-button-primary" onClick={() => void makeLink()} disabled={busy}>{busy ? 'กำลังดำเนินการ…' : activeLink ? 'ออกลิงก์ใหม่' : 'สร้างลิงก์ตอบรับ'}</button></footer>
    </section>
  </div>, document.body)
}
