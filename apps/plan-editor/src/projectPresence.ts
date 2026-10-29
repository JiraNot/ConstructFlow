export interface ActiveProjectCollaborator {
  user_id: string
  active_sessions: number
  last_seen: string
}

export interface ProjectPresenceSnapshot {
  project_id: string
  users: ActiveProjectCollaborator[]
  sessions?: ProjectPresenceSession[]
  current_user?: string
  current_role?: 'owner' | 'editor' | 'viewer'
  expires_in_seconds: number
}

export interface ProjectPresenceSession {
  session_id: string
  user_id: string
  last_seen: string
  selected_object_ids: string[]
  cursor_mm?: [number, number]
  cursor_updated_at?: string
}

async function readPresenceResponse(response: Response): Promise<ProjectPresenceSnapshot> {
  let payload: unknown
  try { payload = await response.json() } catch { payload = null }
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : `เซิร์ฟเวอร์ตอบกลับ HTTP ${response.status}`
    throw new Error(message)
  }
  if (!payload || typeof payload !== 'object' || !('users' in payload) || !Array.isArray(payload.users)) {
    throw new Error('ข้อมูลผู้ร่วมงานจากเซิร์ฟเวอร์ไม่ถูกต้อง')
  }
  return payload as ProjectPresenceSnapshot
}

export async function heartbeatProjectPresence(
  projectId: string,
  token: string,
  sessionId: string,
  activity: { selectedObjectIds: string[]; cursorMm: [number, number] | null },
): Promise<ProjectPresenceSnapshot> {
  const response = await fetch(`/api/collaboration/projects/${encodeURIComponent(projectId)}/presence`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, selected_object_ids: activity.selectedObjectIds, cursor_mm: activity.cursorMm }),
  })
  return readPresenceResponse(response)
}

export function closeProjectPresence(projectId: string, token: string, sessionId: string): void {
  void fetch(`/api/collaboration/projects/${encodeURIComponent(projectId)}/presence/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
    keepalive: true,
  }).catch(() => undefined)
}
