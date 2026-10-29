import React, { useMemo, useState } from 'react'
import { Check, CornerDownRight, MapPin, MessageSquare, RotateCcw, Send, X } from 'lucide-react'
import type { ProjectComment, ProjectDocument } from '@constructflow/project-model'
import type { CommandRequest } from '@constructflow/command-schema'

type Point = [number, number]
type ExecuteResult = { status: string; errors?: string[] }

export interface ProjectCommentsPanelProps {
  project: ProjectDocument
  activeLevelId: string
  selectedObjectId: string | null
  cursorMm: Point
  author: string
  selectedCommentId?: string | null
  syncStatus?: { connected: boolean; canWrite: boolean }
  readOnly?: boolean
  onExecute: (commands: CommandRequest[]) => ExecuteResult
  onClose: () => void
  onJumpTo: (comment: ProjectComment) => void
}

const buttonStyle: React.CSSProperties = { minHeight: 40, padding: '8px 11px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', color: '#334155', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, font: 'inherit', cursor: 'pointer' }

export function ProjectCommentsPanel({ project, activeLevelId, selectedObjectId, cursorMm, author, selectedCommentId, syncStatus, readOnly = false, onExecute, onClose, onJumpTo }: ProjectCommentsPanelProps) {
  const [body, setBody] = useState('')
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<'open' | 'all'>('open')
  const [error, setError] = useState('')
  const comments = useMemo(() => [...(project.comments ?? [])]
    .filter(comment => filter === 'all' || comment.status === 'open')
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)), [project.comments, filter])

  const createComment = () => {
    if (readOnly) return
    const message = body.trim()
    if (!message) { setError('เขียนความเห็นก่อนปักหมุด'); return }
    const now = new Date().toISOString()
    const comment: ProjectComment = {
      id: crypto.randomUUID(), level_id: activeLevelId, point_mm: [...cursorMm],
      ...(selectedObjectId && project.objects[selectedObjectId] ? { object_id: selectedObjectId } : {}),
      author: author || 'สมาชิกทีม', body: message, status: 'open', status_updated_at: now, replies: [], created_at: now, updated_at: now,
    }
    const result = onExecute([{ name: 'CreateProjectComment', input: { comment } }])
    if (result.status === 'success') { setBody(''); setError('') }
    else setError(result.errors?.[0] ?? 'บันทึกความเห็นไม่สำเร็จ')
  }

  const addReply = (comment: ProjectComment) => {
    if (readOnly) return
    const message = (replyDrafts[comment.id] ?? '').trim()
    if (!message) return
    const reply = { id: crypto.randomUUID(), author: author || 'สมาชิกทีม', body: message, created_at: new Date().toISOString() }
    const result = onExecute([{ name: 'AddProjectCommentReply', input: { comment_id: comment.id, reply } }])
    if (result.status === 'success') setReplyDrafts(current => ({ ...current, [comment.id]: '' }))
    else setError(result.errors?.[0] ?? 'ส่งข้อความตอบกลับไม่สำเร็จ')
  }

  const changeStatus = (comment: ProjectComment) => {
    if (readOnly) return
    const result = onExecute([{ name: 'SetProjectCommentStatus', input: { comment_id: comment.id, status: comment.status === 'open' ? 'resolved' : 'open' } }])
    setError(result.status === 'success' ? '' : result.errors?.[0] ?? 'เปลี่ยนสถานะไม่สำเร็จ')
  }

  return <div role="presentation" style={{ position: 'fixed', inset: 0, zIndex: 1500, pointerEvents: 'none' }}>
    <aside role="dialog" aria-modal="false" aria-labelledby="cf-project-comments-title" className="cf-project-comments-panel" style={{ position: 'absolute', top: 14, right: 14, bottom: 14, width: 420, maxWidth: 'calc(100vw - 28px)', display: 'flex', flexDirection: 'column', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 14, boxShadow: '0 18px 48px rgba(15,23,42,.24)', color: '#0f172a', overflow: 'hidden', pointerEvents: 'auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
        <MessageSquare size={19} color="#7c3aed" />
        <div style={{ flex: 1, minWidth: 0 }}><strong id="cf-project-comments-title">ความเห็นบนแบบ</strong><div style={{ color: '#64748b', fontSize: 12 }}>{(project.comments ?? []).filter(comment => comment.status === 'open').length} รายการเปิด · บันทึกในโครงการ</div><div role="status" style={{ marginTop: 2, color: syncStatus?.connected ? (syncStatus.canWrite ? '#15803d' : '#475569') : '#b45309', fontSize: 11 }}>{syncStatus?.connected ? (syncStatus.canWrite ? '● ซิงค์กับทีมแล้ว' : '● รับความเห็นทีม · อ่านอย่างเดียว') : '○ ออฟไลน์ · ความเห็นใหม่อยู่ในโครงการนี้'}</div></div>
        <button type="button" aria-label="ปิดความเห็น" onClick={onClose} style={{ ...buttonStyle, minHeight: 36, width: 36, padding: 0 }}><X size={17} /></button>
      </header>

      <div style={{ padding: 14, borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
        <label htmlFor="cf-project-comment-draft" style={{ display: 'block', marginBottom: 7, fontSize: 12, fontWeight: 650 }}>ปักหมุดความเห็นใหม่</label>
        <textarea id="cf-project-comment-draft" value={body} onChange={event => setBody(event.target.value)} disabled={readOnly} maxLength={3000} rows={3} placeholder={readOnly ? 'สิทธิ์อ่านอย่างเดียว' : 'ระบุสิ่งที่ต้องตรวจหรือแก้ไข…'} style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box', padding: 10, border: '1px solid #cbd5e1', borderRadius: 9, color: '#0f172a', font: 'inherit', fontSize: 13 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7, color: '#64748b', fontSize: 11 }}><MapPin size={13} /> แตะแปลนเพื่อเลือกจุดปัก · {selectedObjectId && project.objects[selectedObjectId] ? 'เชื่อมกับวัตถุที่เลือก' : 'ยังไม่เชื่อมกับวัตถุ'}</div>
        {error && <div role="alert" style={{ marginTop: 7, color: '#b91c1c', fontSize: 12 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 9 }}><button type="button" disabled={readOnly || !body.trim()} onClick={createComment} style={{ ...buttonStyle, background: '#7c3aed', color: '#fff', borderColor: '#7c3aed', opacity: readOnly || !body.trim() ? .5 : 1 }}><MapPin size={15} /> ปักหมุด</button></div>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '10px 14px 0' }}>
        <button type="button" aria-pressed={filter === 'open'} onClick={() => setFilter('open')} style={{ ...buttonStyle, minHeight: 34, padding: '5px 10px', background: filter === 'open' ? '#ede9fe' : '#fff', borderColor: filter === 'open' ? '#c4b5fd' : '#cbd5e1', color: filter === 'open' ? '#5b21b6' : '#475569' }}>เปิด</button>
        <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')} style={{ ...buttonStyle, minHeight: 34, padding: '5px 10px', background: filter === 'all' ? '#ede9fe' : '#fff', borderColor: filter === 'all' ? '#c4b5fd' : '#cbd5e1', color: filter === 'all' ? '#5b21b6' : '#475569' }}>ทั้งหมด</button>
      </div>

      <div style={{ overflow: 'auto', padding: 14, display: 'grid', alignContent: 'start', gap: 10 }}>
        {comments.length === 0 && <div style={{ padding: 18, textAlign: 'center', border: '1px dashed #cbd5e1', borderRadius: 10, color: '#64748b', fontSize: 13 }}>ยังไม่มีความเห็นที่เปิดอยู่</div>}
        {comments.map(comment => <article key={comment.id} id={`cf-comment-${comment.id}`} style={{ padding: 12, border: `1px solid ${selectedCommentId === comment.id ? '#a78bfa' : '#e2e8f0'}`, borderRadius: 11, background: selectedCommentId === comment.id ? '#faf5ff' : '#fff', boxShadow: selectedCommentId === comment.id ? '0 0 0 2px rgba(124,58,237,.08)' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'start', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', fontSize: 11, color: '#64748b' }}><strong style={{ color: '#334155' }}>{comment.author}</strong><time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</time>{comment.status === 'resolved' && <span style={{ color: '#15803d' }}>ปิดแล้ว</span>}</div><p style={{ margin: '7px 0', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{comment.body}</p>
              {comment.object_id && <div style={{ marginBottom: 7, color: project.objects[comment.object_id] ? '#6d28d9' : '#64748b', fontSize: 11 }}>{project.objects[comment.object_id] ? 'เชื่อมกับวัตถุ' : 'วัตถุที่อ้างถึงถูกลบ'} · {comment.object_id.slice(0, 8)}</div>}
            </div>
            <button type="button" title="ซูมไปยังหมุด" aria-label="ซูมไปยังความเห็น" onClick={() => onJumpTo(comment)} style={{ ...buttonStyle, minHeight: 34, width: 34, padding: 0 }}><MapPin size={15} /></button>
            <button type="button" disabled={readOnly} title={comment.status === 'open' ? 'ปิดประเด็น' : 'เปิดประเด็นอีกครั้ง'} aria-label={comment.status === 'open' ? 'ปิดประเด็น' : 'เปิดประเด็นอีกครั้ง'} onClick={() => changeStatus(comment)} style={{ ...buttonStyle, minHeight: 34, width: 34, padding: 0, color: comment.status === 'open' ? '#15803d' : '#7c3aed', opacity: readOnly ? .45 : 1 }}>{comment.status === 'open' ? <Check size={16} /> : <RotateCcw size={15} />}</button>
          </div>
          {!!comment.replies.length && <div style={{ display: 'grid', gap: 6, margin: '8px 0 8px 10px', paddingLeft: 11, borderLeft: '2px solid #e2e8f0' }}>{comment.replies.map(reply => <div key={reply.id} style={{ fontSize: 12 }}><div style={{ color: '#64748b', fontSize: 10 }}><strong style={{ color: '#475569' }}>{reply.author}</strong> · {new Date(reply.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</div><div style={{ marginTop: 2, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{reply.body}</div></div>)}</div>}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}><CornerDownRight size={15} color="#94a3b8" style={{ flexShrink: 0, marginTop: 9 }} /><input aria-label="ตอบกลับความเห็น" value={replyDrafts[comment.id] ?? ''} disabled={readOnly} maxLength={2000} placeholder={readOnly ? 'สิทธิ์อ่านอย่างเดียว' : 'ตอบกลับ…'} onChange={event => setReplyDrafts(current => ({ ...current, [comment.id]: event.target.value }))} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); addReply(comment) } }} style={{ flex: 1, minWidth: 0, height: 36, boxSizing: 'border-box', padding: '0 9px', border: '1px solid #cbd5e1', borderRadius: 8, font: 'inherit', fontSize: 12 }} /><button type="button" aria-label="ส่งคำตอบ" disabled={readOnly || !(replyDrafts[comment.id] ?? '').trim()} onClick={() => addReply(comment)} style={{ ...buttonStyle, minHeight: 36, width: 38, padding: 0, opacity: !readOnly && (replyDrafts[comment.id] ?? '').trim() ? 1 : .45 }}><Send size={14} /></button></div>
        </article>)}
      </div>
    </aside>
  </div>
}
