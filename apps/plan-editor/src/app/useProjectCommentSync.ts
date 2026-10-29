import { useEffect, useRef, useState } from 'react'
import type { ProjectComment } from '@constructflow/project-model'
import type { CommandRequest } from '@constructflow/command-schema'
import { getLocalCollaborationToken, LOCAL_COLLABORATION_TOKEN_CHANGED_EVENT } from '../projectAutosave.js'
import { mergeProjectComments, validateProjectComments } from '@constructflow/project-model'
import { reconcileProjectComments, type ProjectCommentSyncSnapshot } from '../projectCommentSync.js'

function fingerprint(comments: ProjectComment[]): string {
  return JSON.stringify(mergeProjectComments([], comments))
}

export function useProjectCommentSync(
  projectId: string,
  enabled: boolean,
  comments: ProjectComment[],
  onExecute: (commands: CommandRequest[]) => { status: string },
): { connected: boolean; canWrite: boolean } {
  const commentsRef = useRef(comments)
  const executeRef = useRef(onExecute)
  const refreshRef = useRef<(() => void) | null>(null)
  const remoteSnapshotRef = useRef<ProjectCommentSyncSnapshot | undefined>(undefined)
  const [syncStatus, setSyncStatus] = useState({ connected: false, canWrite: false })
  commentsRef.current = comments
  executeRef.current = onExecute

  useEffect(() => {
    if (!enabled || !projectId) {
      setSyncStatus({ connected: false, canWrite: false })
      return
    }
    remoteSnapshotRef.current = undefined
    let active = true
    let inFlight = false

    const refresh = async () => {
      if (!active || document.visibilityState === 'hidden' || inFlight) return
      inFlight = true
      try {
        const settings = await getLocalCollaborationToken()
        if (!active || !settings?.token) {
          if (active) setSyncStatus({ connected: false, canWrite: false })
          return
        }
        const snapshot = await reconcileProjectComments(projectId, settings.token, commentsRef.current, remoteSnapshotRef.current)
        if (!active) return
        remoteSnapshotRef.current = snapshot
        setSyncStatus({ connected: true, canWrite: snapshot.canWrite })
        const current = commentsRef.current
        const merged = mergeProjectComments(current, snapshot.comments)
        validateProjectComments(merged)
        if (fingerprint(current) !== fingerprint(merged)) {
          executeRef.current([{ name: 'MergeProjectComments', input: { comments: merged } }])
        }
      } catch {
        // Keep local comments available offline; the next focus or poll retries the merge.
        if (active) setSyncStatus({ connected: false, canWrite: false })
      } finally {
        inFlight = false
      }
    }

    refreshRef.current = () => { void refresh() }
    void refresh()
    const interval = window.setInterval(() => { void refresh() }, 4000)
    const onWake = () => { void refresh() }
    const onTokenChanged = () => { remoteSnapshotRef.current = undefined; void refresh() }
    window.addEventListener('focus', onWake)
    window.addEventListener(LOCAL_COLLABORATION_TOKEN_CHANGED_EVENT, onTokenChanged)
    document.addEventListener('visibilitychange', onWake)
    return () => {
      active = false
      refreshRef.current = null
      window.clearInterval(interval)
      window.removeEventListener('focus', onWake)
      window.removeEventListener(LOCAL_COLLABORATION_TOKEN_CHANGED_EVENT, onTokenChanged)
      document.removeEventListener('visibilitychange', onWake)
    }
  }, [enabled, projectId])

  const commentsFingerprint = fingerprint(comments)
  useEffect(() => {
    if (enabled) refreshRef.current?.()
  }, [enabled, commentsFingerprint])
  return syncStatus
}
