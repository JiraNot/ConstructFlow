import React, { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, Download, ExternalLink, FileText, LoaderCircle, RefreshCw, Share2, Trash2, X } from 'lucide-react'
import type { ProjectDocument } from '@constructflow/project-model'
import {
  createProjectDrawingDownloadLink, listProjectDrawingDownloadLinks,
  revokeProjectDrawingDownloadLink, type DrawingDownloadLink,
} from '../integrations/drawingDownloadLinks.js'

interface ProjectDrawingDownloadLinkModalProps {
  project: ProjectDocument
  onClose: () => void
}

const statusLabels: Record<DrawingDownloadLink['status'], string> = { active: 'ใช้งานได้', revoked: 'เพิกถอนแล้ว', expired: 'หมดอายุ' }
const formatBytes = (value: number) => value < 1_000_000 ? `${Math.max(1, Math.round(value / 1000))} KB` : `${(value / 1_000_000).toFixed(1)} MB`

export const ProjectDrawingDownloadLinkModal: React.FC<ProjectDrawingDownloadLinkModalProps> = ({ project, onClose }) => {
  const [links, setLinks] = useState<DrawingDownloadLink[]>([])
  const [ttlDays, setTtlDays] = useState(14)
  const [createdUrl, setCreatedUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)
  const activeCount = links.filter(link => link.status === 'active').length

  const refresh = useCallback(async () => {
    try {
      setLinks(await listProjectDrawingDownloadLinks(project.project.id))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'อ่านรายการลิงก์ไม่สำเร็จ')
    } finally { setLoading(false) }
  }, [project.project.id])

  useEffect(() => { void refresh() }, [refresh])

  const makeLink = async () => {
    setBusy(true); setError(''); setMessage(''); setCopied(false)
    try {
      const created = await createProjectDrawingDownloadLink(project, ttlDays)
      setCreatedUrl(created.url)
      setMessage(`สร้าง Vector PDF ${formatBytes(created.byte_length)} แล้ว · หมดอายุ ${new Date(created.expires_at).toLocaleDateString('th-TH')}`)
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'สร้างลิงก์ดาวน์โหลดไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  const copyLink = async () => {
    if (!createdUrl) return
    try {
      await navigator.clipboard.writeText(createdUrl)
      setCopied(true); setMessage('คัดลอกแล้ว · ส่งลิงก์ให้ลูกค้าหรือทีมผ่าน LINE หรืออีเมลได้')
    } catch { setError('คัดลอกอัตโนมัติไม่ได้ · เลือกและคัดลอกจากช่องลิงก์แทน') }
  }

  const shareLink = async () => {
    if (!createdUrl) return
    if (!navigator.share) { await copyLink(); return }
    try { await navigator.share({ title: project.project.name, text: `ดาวน์โหลดชุดแบบ A3 · ${project.project.name}`, url: createdUrl }) }
    catch (cause) { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError('เปิดเมนูแชร์ไม่สำเร็จ · คัดลอกลิงก์แทนได้') }
  }

  const revoke = async (link: DrawingDownloadLink) => {
    if (!window.confirm('เพิกถอนลิงก์นี้หรือไม่? ผู้ที่มีลิงก์จะดาวน์โหลดไม่ได้ และระบบจะล้าง PDF ออกจากรายการบน gateway')) return
    setBusy(true); setError(''); setMessage('')
    try {
      await revokeProjectDrawingDownloadLink(project.project.id, link.id)
      if (createdUrl) setCreatedUrl('')
      setMessage('เพิกถอนลิงก์และล้าง PDF ออกจากรายการบน gateway แล้ว')
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'เพิกถอนลิงก์ไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  return createPortal(<div className="cf-drawing-share-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="cf-drawing-share-modal" role="dialog" aria-modal="true" aria-labelledby="cf-drawing-share-title" onKeyDown={event => { if (event.key === 'Escape' && !busy) onClose() }}>
      <header>
        <div><span className="cf-drawing-share-icon"><Share2 size={18} /></span><div><h2 id="cf-drawing-share-title">แชร์ชุดแบบ A3</h2><p>{project.project.name} · PDF เวกเตอร์</p></div></div>
        <button type="button" aria-label="ปิด" onClick={onClose} disabled={busy}><X size={20} /></button>
      </header>
      <div className="cf-drawing-share-body">
        <div className="cf-drawing-share-notice">
          <strong>ส่งลิงก์ดาวน์โหลดให้ลูกค้าหรือทีม</strong>
          <span>ระบบจะสร้าง Vector PDF จากโมเดลปัจจุบัน แล้วเก็บ snapshot ไว้บน gateway ของทีมจนกว่าลิงก์จะหมดอายุหรือถูกเพิกถอน</span>
          <span>ทุกคนที่มีลิงก์ดาวน์โหลดได้ · ลิงก์ไม่เปิดสิทธิ์แก้ไขโมเดล และไม่มีข้อมูลบัญชีผู้ใช้</span>
        </div>
        {activeCount > 0 && !createdUrl && <p className="cf-drawing-share-warning">ลิงก์เดิมยังดาวน์โหลดได้ แต่ระบบไม่เก็บ token ไว้กู้คืน หากต้องส่งลิงก์ใหม่ ให้เพิกถอนลิงก์เดิมหรือสร้างลิงก์ใหม่แล้วคัดลอกทันที</p>}
        <label className="cf-drawing-share-expiry">อายุลิงก์
          <select value={ttlDays} onChange={event => setTtlDays(Number(event.target.value))} disabled={busy}>
            <option value={7}>7 วัน</option><option value={14}>14 วัน</option><option value={30}>30 วัน</option>
          </select>
        </label>
        {createdUrl && <div className="cf-drawing-share-created">
          <label>คัดลอกหรือแชร์ลิงก์นี้ก่อนปิดหน้าต่าง<input aria-label="ลิงก์ดาวน์โหลดชุดแบบ" readOnly value={createdUrl} onFocus={event => event.currentTarget.select()} /></label>
          <div><button type="button" onClick={() => void copyLink()}><Copy size={16} />{copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}</button><button type="button" onClick={() => void shareLink()}><ExternalLink size={16} />แชร์…</button></div>
        </div>}
        {loading ? <p className="cf-drawing-share-loading"><LoaderCircle className="cf-drawing-share-spin" size={17} /> กำลังอ่านรายการลิงก์…</p> : <div className="cf-drawing-share-list">
          <div className="cf-drawing-share-list-heading"><strong>ลิงก์ล่าสุด</strong><span>{activeCount} ลิงก์ใช้งานได้</span><button type="button" aria-label="รีเฟรชรายการลิงก์" onClick={() => void refresh()} disabled={busy}><RefreshCw size={15} />รีเฟรช</button></div>
          {links.length === 0 && <p className="cf-drawing-share-empty">ยังไม่มีลิงก์ดาวน์โหลดสำหรับโครงการนี้</p>}
          {links.map(link => <article key={link.id}>
            <span className="cf-drawing-share-file"><FileText size={17} /><span><strong>{link.display_name}</strong><small>{formatBytes(link.byte_length)} · ดาวน์โหลด {link.download_count} ครั้ง</small><small>สร้าง {new Date(link.created_at).toLocaleString('th-TH')} · หมดอายุ {new Date(link.expires_at).toLocaleDateString('th-TH')}</small></span></span>
            <span className={`cf-drawing-share-status is-${link.status}`}>{statusLabels[link.status]}</span>
            {link.status === 'active' && <button type="button" className="cf-drawing-share-revoke" disabled={busy} onClick={() => void revoke(link)}><Trash2 size={15} />เพิกถอน</button>}
          </article>)}
        </div>}
        {error && <p className="cf-drawing-share-error" role="alert">{error}</p>}
        {message && <p className="cf-drawing-share-message" role="status">{message}</p>}
      </div>
      <footer><button type="button" onClick={onClose} disabled={busy}>ปิด</button><button type="button" className="is-primary" onClick={() => void makeLink()} disabled={busy}>{busy ? <><LoaderCircle size={16} className="cf-drawing-share-spin" />กำลังสร้าง PDF และลิงก์…</> : <><Download size={16} />สร้างลิงก์ดาวน์โหลด</>}</button></footer>
    </section>
  </div>, document.body)
}
