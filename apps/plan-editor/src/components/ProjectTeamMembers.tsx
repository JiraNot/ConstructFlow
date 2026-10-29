import React, { useEffect, useState } from 'react'
import { Check, Copy, LoaderCircle, Shield, UserPlus, Users, X } from 'lucide-react'

type TeamRole = 'owner' | 'editor' | 'viewer'
interface ProjectTeamMember {
  member_id: string
  user_id: string
  role: TeamRole
  source: 'environment' | 'server'
  created_at: string | null
}

interface ProjectTeamMembersProps {
  projectId: string
  token: string
  enabled: boolean
}

const roleLabel: Record<TeamRole, string> = { owner: 'เจ้าของ', editor: 'แก้ไขได้', viewer: 'ดูได้' }

async function requestTeam<T>(url: string, token: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  let payload: unknown
  try { payload = response.status === 204 ? null : await response.json() } catch { payload = null }
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : `เซิร์ฟเวอร์ตอบกลับ HTTP ${response.status}`
    throw new Error(message)
  }
  return payload as T
}

export const ProjectTeamMembers: React.FC<ProjectTeamMembersProps> = ({ projectId, token, enabled }) => {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [members, setMembers] = useState<ProjectTeamMember[]>([])
  const [canManage, setCanManage] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState<TeamRole>('editor')
  const [roleDrafts, setRoleDrafts] = useState<Record<string, TeamRole>>({})
  const [oneTimeToken, setOneTimeToken] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const endpoint = `/api/collaboration/projects/${encodeURIComponent(projectId)}/members`

  useEffect(() => {
    setLoaded(false); setMembers([]); setCanManage(false); setRoleDrafts({})
    if (!enabled) { setOpen(false); setOneTimeToken(''); setError(''); setMessage('') }
  }, [enabled, projectId, token])

  const loadMembers = async () => {
    if (!enabled || !token) return
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await requestTeam<{ members: ProjectTeamMember[]; can_manage: boolean }>(endpoint, token)
      setMembers(result.members)
      setCanManage(result.can_manage)
      setRoleDrafts(Object.fromEntries(result.members.map(member => [member.member_id, member.role])))
      setLoaded(true)
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && !loaded) void loadMembers()
  }

  const invite = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!userId.trim() || !canManage || busy) return
    setBusy(true); setError(''); setMessage(''); setOneTimeToken('')
    try {
      const result = await requestTeam<{ member: ProjectTeamMember; token: string }>(endpoint, token, 'POST', { user_id: userId.trim(), role })
      setOneTimeToken(result.token)
      setUserId('')
      await loadMembers()
      setMessage(`เพิ่ม ${result.member.user_id} แล้ว · token แสดงครั้งนี้ครั้งเดียว`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }

  const updateRole = async (member: ProjectTeamMember) => {
    const nextRole = roleDrafts[member.member_id]
    if (!canManage || member.source !== 'server' || nextRole === member.role || busy) return
    setBusy(true); setError(''); setMessage('')
    try {
      await requestTeam(endpoint + `/${encodeURIComponent(member.member_id)}`, token, 'PATCH', { role: nextRole })
      await loadMembers()
      setMessage(`เปลี่ยนสิทธิ์ ${member.user_id} เป็น “${roleLabel[nextRole]}” แล้ว`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }

  const revoke = async (member: ProjectTeamMember) => {
    if (!canManage || member.source !== 'server' || busy) return
    if (!window.confirm(`เพิกถอนสิทธิ์ของ ${member.user_id}? token นี้จะใช้เข้าถึงโครงการไม่ได้อีก`)) return
    setBusy(true); setError(''); setMessage(''); setOneTimeToken('')
    try {
      await requestTeam(endpoint + `/${encodeURIComponent(member.member_id)}`, token, 'DELETE')
      await loadMembers()
      setMessage(`เพิกถอนสิทธิ์ ${member.user_id} แล้ว`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(oneTimeToken)
      setMessage('คัดลอก token แล้ว · ส่งให้สมาชิกผ่านช่องทางที่องค์กรอนุมัติ')
    } catch { setError('คัดลอกไม่ได้ · เลือก token ด้านล่างแล้วคัดลอกด้วยตนเอง') }
  }

  return <section className="cf-team-members" aria-label="สมาชิกและสิทธิ์โครงการ">
    <button className="cf-team-members-toggle" type="button" aria-expanded={open} aria-controls="cf-team-members-content" disabled={!enabled || busy && !open} onClick={toggle}>
      <span><Users size={15} /> สมาชิกและสิทธิ์ <small>{loaded ? members.length : ''}</small></span>
      {busy && open ? <LoaderCircle className="cf-version-spinner" size={15} /> : <span>{open ? 'ซ่อน' : 'จัดการสมาชิก'}</span>}
    </button>
    {open && <div id="cf-team-members-content" className="cf-team-members-content">
      {!loaded && busy ? <p className="cf-team-members-loading"><LoaderCircle className="cf-version-spinner" size={15} /> กำลังโหลดสมาชิก…</p> : <>
        {loaded && <>
          <div className="cf-team-members-list" aria-label="รายชื่อสมาชิกโครงการ">
            {members.length ? members.map(member => <article className="cf-team-member" key={member.member_id}>
              <div className="cf-team-member-identity"><strong>{member.user_id}</strong><span><Shield size={12} /> {member.source === 'environment' ? 'ตั้งค่าจาก server' : roleLabel[member.role]}</span></div>
              {member.source === 'server' && canManage ? <div className="cf-team-member-actions">
                <label className="cf-team-sr-only" htmlFor={`cf-team-role-${member.member_id}`}>สิทธิ์ของ {member.user_id}</label>
                <select id={`cf-team-role-${member.member_id}`} value={roleDrafts[member.member_id] ?? member.role} disabled={busy} onChange={event => setRoleDrafts(current => ({ ...current, [member.member_id]: event.target.value as TeamRole }))}>
                  <option value="owner">เจ้าของ</option><option value="editor">แก้ไขได้</option><option value="viewer">ดูได้</option>
                </select>
                <button type="button" disabled={busy || (roleDrafts[member.member_id] ?? member.role) === member.role} onClick={() => void updateRole(member)} aria-label={`บันทึกสิทธิ์ ${member.user_id}`} title="บันทึกสิทธิ์"><Check size={15} /></button>
                <button type="button" className="is-danger" disabled={busy} onClick={() => void revoke(member)} aria-label={`เพิกถอนสิทธิ์ ${member.user_id}`} title="เพิกถอนสิทธิ์"><X size={15} /></button>
              </div> : <span className="cf-team-member-role">{roleLabel[member.role]}</span>}
            </article>) : <p className="cf-team-members-empty">ยังไม่มีสมาชิกที่กำหนดในโครงการนี้</p>}
          </div>
          {canManage && <form className="cf-team-invite" onSubmit={event => void invite(event)}>
            <label>ชื่อสมาชิก<input value={userId} maxLength={120} onChange={event => setUserId(event.target.value)} placeholder="ชื่อหรือรหัสสมาชิก" /></label>
            <label>สิทธิ์<select value={role} onChange={event => setRole(event.target.value as TeamRole)}><option value="editor">แก้ไขได้</option><option value="viewer">ดูได้</option><option value="owner">เจ้าของ</option></select></label>
            <button type="submit" disabled={busy || !userId.trim()}>{busy ? <LoaderCircle className="cf-version-spinner" size={15} /> : <UserPlus size={15} />} เพิ่มสมาชิก</button>
          </form>}
        </>}
        {oneTimeToken && <div className="cf-team-token-result"><strong>คัดลอก token นี้ให้สมาชิกตอนนี้</strong><code>{oneTimeToken}</code><button type="button" onClick={() => void copyToken()}><Copy size={14} /> คัดลอก token</button></div>}
      </>}
      {message && <p className="cf-team-members-message" role="status">{message}</p>}
      {error && <p className="cf-team-members-error" role="alert">{error}</p>}
      <p className="cf-team-members-note">token ออกให้ครั้งเดียวและเก็บเฉพาะ hash บน server · ผู้ใช้จะไม่เห็น token เก่าหลังปิดหน้าต่างนี้ · เพิกถอนแล้วมีผลทันที</p>
    </div>}
  </section>
}
