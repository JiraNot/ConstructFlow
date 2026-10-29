import { mergeProjectComments, validateProjectComments, type ProjectComment } from '@constructflow/project-model'

export interface ProjectCommentSyncSnapshot {
  comments: ProjectComment[]
  /** Last server snapshot, kept separate so viewer-only local records aren't mistaken for uploaded data. */
  serverComments?: ProjectComment[]
  canWrite: boolean
  etag?: string
}

function fingerprint(comments: ProjectComment[]): string {
  return JSON.stringify(mergeProjectComments([], comments))
}

async function readSnapshot(response: Response, unchanged?: ProjectCommentSyncSnapshot): Promise<ProjectCommentSyncSnapshot> {
  if (response.status === 304 && unchanged) {
    const serverComments = unchanged.serverComments ?? unchanged.comments
    return { ...unchanged, comments: serverComments, serverComments, etag: response.headers.get('ETag') ?? unchanged.etag }
  }
  let payload: unknown
  try { payload = await response.json() } catch { payload = null }
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : `เซิร์ฟเวอร์ตอบกลับ HTTP ${response.status}`
    throw new Error(message)
  }
  if (!payload || typeof payload !== 'object' || !('comments' in payload) || !Array.isArray(payload.comments)) {
    throw new Error('ข้อมูลความเห็นจากเซิร์ฟเวอร์ไม่ถูกต้อง')
  }
  validateProjectComments(payload.comments)
  return {
    comments: payload.comments,
    serverComments: payload.comments,
    canWrite: 'can_write' in payload && payload.can_write === true,
    etag: response.headers.get('ETag') ?? ('etag' in payload && typeof payload.etag === 'string' ? payload.etag : undefined),
  }
}

/** Reconcile append-only discussion records while keeping the project document authoritative offline. */
export async function reconcileProjectComments(
  projectId: string,
  token: string,
  localComments: ProjectComment[],
  knownRemote?: ProjectCommentSyncSnapshot,
): Promise<ProjectCommentSyncSnapshot> {
  const endpoint = `/api/collaboration/projects/${encodeURIComponent(projectId)}/comments`
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (knownRemote?.etag) headers['If-None-Match'] = knownRemote.etag
  const remote = await readSnapshot(await fetch(endpoint, { headers }), knownRemote)
  let canonical = remote
  const merged = mergeProjectComments(localComments, remote.comments)
  if (remote.canWrite && fingerprint(merged) !== fingerprint(remote.comments)) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ comments: merged }),
    })
    if (response.status === 403) {
      canonical = await readSnapshot(await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } }))
    } else {
      canonical = await readSnapshot(response)
    }
  }
  const serverComments = canonical.serverComments ?? canonical.comments
  return {
    comments: mergeProjectComments(localComments, serverComments),
    serverComments,
    canWrite: canonical.canWrite,
    etag: canonical.etag,
  }
}
