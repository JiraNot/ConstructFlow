import { serializeProject, type ProjectDocument } from '@constructflow/project-model'
import {
  createLocalProjectRevision, exportLocalProjectRevisionBundle, importLocalProjectRevisionBundle,
  listLocalProjectRevisions,
} from './projectAutosave.js'

export interface ProjectRevisionSyncResult {
  uploaded: number
  serverDeduplicated: number
  serverConflicts: number
  imported: number
  deduplicated: number
  conflicts: number
}

const activeSyncsByProject = new Map<string, Promise<ProjectRevisionSyncResult>>()

/** Exchange the local offline revision trail with the authenticated same-origin collaboration service. */
export function syncProjectRevisionHistory(project: ProjectDocument, token: string): Promise<ProjectRevisionSyncResult> {
  const projectId = project.project.id
  const active = activeSyncsByProject.get(projectId)
  if (active) return active
  const sync = syncProjectRevisionHistoryOnce(project, token).finally(() => {
    if (activeSyncsByProject.get(projectId) === sync) activeSyncsByProject.delete(projectId)
  })
  activeSyncsByProject.set(projectId, sync)
  return sync
}

async function syncProjectRevisionHistoryOnce(project: ProjectDocument, token: string): Promise<ProjectRevisionSyncResult> {
  const projectId = project.project.id
  const currentSnapshot = serializeProject(project)
  const revisions = await listLocalProjectRevisions(projectId)
  if (!revisions.some(revision => revision.project_json === currentSnapshot)) {
    await createLocalProjectRevision(project, 'ซิงค์กับทีม', { notifyChanged: false })
  }

  const bundle = await exportLocalProjectRevisionBundle(projectId)
  const response = await fetch(`/api/collaboration/projects/${encodeURIComponent(projectId)}/revisions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(bundle),
  })
  let payload: unknown
  try { payload = await response.json() } catch { payload = null }
  let uploaded = 0
  let serverDeduplicated = 0
  let serverConflicts = 0
  if (response.status === 403) {
    const pull = await fetch(`/api/collaboration/projects/${encodeURIComponent(projectId)}/revisions`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    try { payload = await pull.json() } catch { payload = null }
    if (!pull.ok) {
      const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : `เซิร์ฟเวอร์ตอบกลับ HTTP ${pull.status}`
      throw new Error(message)
    }
  } else if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : `เซิร์ฟเวอร์ตอบกลับ HTTP ${response.status}`
    throw new Error(message)
  } else if (payload && typeof payload === 'object' && 'imported' in payload && typeof payload.imported === 'number') {
    uploaded = payload.imported
    if ('deduplicated' in payload && typeof payload.deduplicated === 'number') serverDeduplicated = payload.deduplicated
    if ('conflicts' in payload && typeof payload.conflicts === 'number') serverConflicts = payload.conflicts
  }
  if (!payload || typeof payload !== 'object' || !('bundle' in payload)) throw new Error('เซิร์ฟเวอร์ส่งประวัติเวอร์ชันกลับมาไม่ครบ')
  const remote = payload as { bundle: unknown; imported?: number }
  const remoteBundle = remote.bundle
  const remoteRevisions = remoteBundle && typeof remoteBundle === 'object' && 'revisions' in remoteBundle && Array.isArray(remoteBundle.revisions)
    ? remoteBundle.revisions
    : null
  if (!remoteRevisions) throw new Error('ประวัติเวอร์ชันจากเซิร์ฟเวอร์มีรูปแบบไม่ถูกต้อง')
  const merged = remoteRevisions.length
    ? await importLocalProjectRevisionBundle(projectId, remote.bundle, { notifyChanged: false })
    : { imported: 0, deduplicated: 0, conflicts: 0 }
  return {
    uploaded,
    serverDeduplicated,
    serverConflicts,
    imported: merged.imported,
    deduplicated: merged.deduplicated,
    conflicts: merged.conflicts,
  }
}
