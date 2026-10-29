import React, { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Download, History, LoaderCircle, Trash2, X } from 'lucide-react'
import type { ProjectDocument } from '@constructflow/project-model'
import {
  createLocalProjectRevision, loadLocalProjectCommandSyncState, updateLocalProjectCommandSyncState,
  type LocalProjectCommandSyncState,
} from '../projectAutosave.js'

interface ProjectCommandOutboxModalProps {
  project: ProjectDocument
  projectId: string
  syncMessage?: string
  onClose: () => void
  onOpenVersionHistory: () => void
}

const shortId = (value: string) => value.length > 13 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value

const uniqueCommandNames = (commands: LocalProjectCommandSyncState['pending'][number]['commands']) =>
  [...new Set(commands.map(command => command.name))]

const blockedStateLabel = (reason?: string) => {
  if (!reason) return 'คำสั่งล่าสุดถูกส่งหรือไม่มีคำสั่งที่ต้องส่ง'
  if (reason === 'baseline') return 'ต้องเทียบกับ revision ล่าสุดก่อนเริ่มส่งคิว'
  if (reason === 'outbox-conflict') return 'คิวอ้างอิงลำดับเก่า · เทียบ revision ก่อนจัดการคิว'
  if (reason === 'local-history') return 'ประวัติในเครื่องต่างจากสถานะ sync · เทียบ revision ก่อนทำต่อ'
  if (reason === 'local-diverged') return 'แบบในเครื่องต่างจากสถานะ sync ล่าสุด'
  if (reason.startsWith('apply:')) return 'มีคำสั่งจากทีมที่ยังใช้กับแบบนี้ไม่ได้'
  return 'มีสถานะ sync ที่ต้องตรวจสอบก่อนทำต่อ'
}

export const ProjectCommandOutboxModal: React.FC<ProjectCommandOutboxModalProps> = ({
  project, projectId, syncMessage, onClose, onOpenVersionHistory,
}) => {
  const [state, setState] = useState<LocalProjectCommandSyncState | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [backupDownloaded, setBackupDownloaded] = useState(false)
  const [backupTransactionIds, setBackupTransactionIds] = useState<string[]>([])
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const busyRef = useRef(busy)
  const confirmDiscardRef = useRef(confirmDiscard)
  const onCloseRef = useRef(onClose)
  busyRef.current = busy
  confirmDiscardRef.current = confirmDiscard
  onCloseRef.current = onClose

  useEffect(() => {
    let active = true
    void loadLocalProjectCommandSyncState(projectId).then(next => {
      if (active) setState(next)
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason))
    })
    return () => { active = false }
  }, [projectId])

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeButtonRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault()
        if (confirmDiscardRef.current) setConfirmDiscard(false)
        else onCloseRef.current()
      }
      if (event.key !== 'Tab') return
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [])

  const downloadBackup = async () => {
    if (!state?.pending.length || busy) return
    setBusy(true)
    setError('')
    try {
      const current = await loadLocalProjectCommandSyncState(projectId)
      setState(current)
      if (!current.pending.length) {
        setBackupDownloaded(false)
        setBackupTransactionIds([])
        setNotice('คิวถูกส่งหรือจัดการไปแล้ว · ไม่มี transaction ให้สำรอง')
        return
      }
      const contents = JSON.stringify({
        schema_version: 1,
        type: 'constructflow-command-outbox',
        project_id: projectId,
        exported_at: new Date().toISOString(),
        transactions: current.pending,
      }, null, 2)
      const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `constructflow-outbox-${projectId}.json`
      anchor.style.display = 'none'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      setBackupDownloaded(true)
      setBackupTransactionIds(current.pending.map(transaction => transaction.transaction_id))
      setNotice(`สร้างไฟล์สำรอง ${current.pending.length} transaction แล้ว · ตรวจสอบว่าอุปกรณ์ดาวน์โหลดไฟล์เรียบร้อยก่อนลบคิว`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const discardOutbox = async () => {
    if (!backupDownloaded || !state?.pending.length || busy) return
    setBusy(true)
    setError('')
    try {
      const backedUpIds = new Set(backupTransactionIds)
      const latest = await loadLocalProjectCommandSyncState(projectId)
      const queuedBackedUpCount = latest.pending.filter(transaction => backedUpIds.has(transaction.transaction_id)).length
      if (!queuedBackedUpCount) {
        setState(latest)
        setBackupDownloaded(false)
        setBackupTransactionIds([])
        setConfirmDiscard(false)
        setNotice('รายการในไฟล์สำรองถูกส่งหรือจัดการไปแล้ว · คิวปัจจุบันไม่ได้ถูกลบ')
        return
      }
      const checkpoint = await createLocalProjectRevision(project, `ก่อนจัดการคิวคำสั่ง · ${new Date().toLocaleString('th-TH')}`)
      let removedCount = 0
      const next = await updateLocalProjectCommandSyncState(projectId, current => {
        removedCount = current.pending.filter(transaction => backedUpIds.has(transaction.transaction_id)).length
        const pending = current.pending.filter(transaction => !backedUpIds.has(transaction.transaction_id))
        const nextBlock = pending.length
          ? current.blocked_reason
          : current.blocked_reason === 'baseline' ? 'baseline'
            : ['outbox-conflict', 'local-history', 'local-diverged'].includes(current.blocked_reason ?? '') ? 'local-diverged'
              : current.blocked_reason
        return { ...current, pending, ...(nextBlock ? { blocked_reason: nextBlock } : { blocked_reason: undefined }) }
      })
      setState(next)
      setConfirmDiscard(false)
      setBackupDownloaded(false)
      setBackupTransactionIds([])
      setNotice(`สร้าง checkpoint “${checkpoint.label}” แล้ว · ลบ ${removedCount} รายการที่สำรองไว้ · เหลือ ${next.pending.length} transaction · model ยังอยู่เหมือนเดิม`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  return <div className="cf-command-outbox-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section ref={dialogRef} className="cf-command-outbox-dialog" role="dialog" aria-modal="true" aria-labelledby="cf-command-outbox-title" tabIndex={-1}>
      <header className="cf-command-outbox-header">
        <div><span>COLLABORATION</span><h2 id="cf-command-outbox-title">คิวคำสั่งที่ยังไม่ส่ง</h2></div>
        <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="ปิดหน้าต่างคิวคำสั่ง" disabled={busy}><X size={20}/></button>
      </header>

      <div className="cf-command-outbox-summary" role="status">
        <AlertTriangle size={17} aria-hidden="true"/>
        <div>
          <strong>{state?.pending.length ?? 0} transaction ในคิวที่อ่านล่าสุด</strong>
          <span>{syncMessage ?? 'คิวนี้เก็บไว้ในอุปกรณ์และยังไม่ถูกส่งขึ้น gateway'}</span>
        </div>
      </div>

      {error && <p className="cf-command-outbox-error" role="alert">{error}</p>}
      {notice && <p className="cf-command-outbox-notice" role="status">{notice}</p>}

      {!state ? <div className="cf-command-outbox-loading"><LoaderCircle size={18} className="cf-command-outbox-spin"/>กำลังอ่านคิวจากอุปกรณ์…</div>
        : state.pending.length === 0 ? <div className="cf-command-outbox-empty"><strong>ไม่มี transaction ค้างใน outbox</strong><span>{blockedStateLabel(state.blocked_reason)}</span></div>
          : <div className="cf-command-outbox-list">
            {state.pending.map((transaction, index) => {
              const names = uniqueCommandNames(transaction.commands)
              return <article key={transaction.transaction_id} className="cf-command-outbox-item">
                <div className="cf-command-outbox-item-heading"><strong>รายการ {index + 1}</strong><span>{transaction.commands.length} คำสั่ง</span></div>
                <dl>
                  <div><dt>transaction</dt><dd>{shortId(transaction.transaction_id)}</dd></div>
                  <div><dt>อ้างอิงลำดับ</dt><dd>{typeof transaction.base_sequence === 'number' ? transaction.base_sequence : 'ยังไม่ได้กำหนด'}</dd></div>
                </dl>
                <p>{names.slice(0, 4).join(' · ')}{names.length > 4 ? ` · และอีก ${names.length - 4} ประเภท` : ''}</p>
              </article>
            })}
          </div>}

      <div className="cf-command-outbox-guidance">
        <strong>การลบคิวไม่ย้อนการแก้ในแบบ</strong>
        <span>ก่อนลบ ระบบบันทึก model ปัจจุบันเป็น checkpoint ในประวัติเวอร์ชัน และไฟล์สำรองมีรายละเอียดคำสั่งที่ค้าง จากนั้นจึงลบเฉพาะคิวที่สำรอง โดยไม่เขียนทับ model</span>
      </div>

      {confirmDiscard && <div className="cf-command-outbox-confirm" role="group" aria-label="ยืนยันการลบคิวส่ง">
        <strong>ลบ {backupTransactionIds.length} transaction ที่สำรองแล้วออกจาก outbox หรือไม่?</strong>
        <span>ระบบจะบันทึก checkpoint ของ model ก่อน แล้วลบเฉพาะรายการในไฟล์สำรอง · transaction ใหม่จะยังอยู่ในคิว</span>
        <div>
          <button type="button" onClick={() => setConfirmDiscard(false)} disabled={busy}>กลับไปตรวจ</button>
          <button type="button" className="is-danger" onClick={() => void discardOutbox()} disabled={busy || !backupDownloaded}>
            {busy ? <LoaderCircle size={15} className="cf-command-outbox-spin"/> : <Trash2 size={15}/>}ลบคิวที่สำรองแล้ว
          </button>
        </div>
      </div>}

      <footer className="cf-command-outbox-actions">
        <button type="button" className="cf-command-outbox-history" onClick={onOpenVersionHistory}><History size={16}/>เปิดประวัติเวอร์ชัน</button>
        <span/>
        <button type="button" onClick={() => void downloadBackup()} disabled={!state?.pending.length || busy}>{busy ? <LoaderCircle size={16} className="cf-command-outbox-spin"/> : <Download size={16}/>}ดาวน์โหลด outbox</button>
        <button type="button" className="is-danger" onClick={() => setConfirmDiscard(true)} disabled={!state?.pending.length || !backupDownloaded || busy}><Trash2 size={16}/>ลบคิวส่ง</button>
      </footer>
    </section>
  </div>
}
