import { useEffect, useRef, useState } from 'react'
import {
  getLocalCollaborationToken, LOCAL_COLLABORATION_TOKEN_CHANGED_EVENT,
} from '../projectAutosave.js'
import { closeProjectPresence, heartbeatProjectPresence, type ActiveProjectCollaborator, type ProjectPresenceSession } from '../projectPresence.js'

const isDocumentHidden = () => document.visibilityState === 'hidden'

function createSessionId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function useProjectPresence(
  projectId: string,
  enabled: boolean,
  activity: { selectedObjectIds: string[]; cursorMm: [number, number]; cursorUpdatedAt: number },
) {
  const sessionRef = useRef<{ projectId: string; sessionId: string } | null>(null)
  const activityRef = useRef(activity)
  activityRef.current = activity
  const [users, setUsers] = useState<ActiveProjectCollaborator[]>([])
  const [sessions, setSessions] = useState<ProjectPresenceSession[]>([])
  const [currentUser, setCurrentUser] = useState<string | null>(null)
  const [currentRole, setCurrentRole] = useState<'owner' | 'editor' | 'viewer' | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!enabled || !projectId) {
      setUsers([])
      setSessions([])
      setCurrentUser(null)
      setCurrentRole(null)
      setConnected(false)
      return
    }

    const sessionId = sessionRef.current?.projectId === projectId
      ? sessionRef.current.sessionId
      : createSessionId()
    sessionRef.current = { projectId, sessionId }
    let active = true
    let inFlight = false
    let currentToken = ''

    const leave = () => {
      if (!currentToken) return
      closeProjectPresence(projectId, currentToken, sessionId)
      currentToken = ''
    }

    const refreshPresence = async () => {
      if (!active || isDocumentHidden()) {
        setConnected(false)
        leave()
        return
      }
      if (inFlight) return
      inFlight = true
      try {
        const settings = await getLocalCollaborationToken()
        if (!active) return
        if (!settings) {
          leave()
          setUsers([])
          setConnected(false)
          return
        }
        if (isDocumentHidden()) {
          leave()
          setConnected(false)
          return
        }
        currentToken = settings.token
        const currentActivity = activityRef.current
        const cursorMm = Date.now() - currentActivity.cursorUpdatedAt <= 5000 ? currentActivity.cursorMm : null
        const snapshot = await heartbeatProjectPresence(projectId, settings.token, sessionId, {
          selectedObjectIds: currentActivity.selectedObjectIds.slice(0, 50), cursorMm,
        })
        if (!active) {
          closeProjectPresence(projectId, settings.token, sessionId)
          return
        }
        setUsers(snapshot.users)
        const activeSessions = snapshot.sessions ?? []
        setSessions(activeSessions.filter(session => session.session_id !== sessionId).map(session => {
          const cursorIsFresh = session.cursor_updated_at
            && Date.now() - Date.parse(session.cursor_updated_at) <= 5000
          return cursorIsFresh ? session : { ...session, cursor_mm: undefined, cursor_updated_at: undefined }
        }))
        setCurrentUser(snapshot.current_user ?? null)
        setCurrentRole(snapshot.current_role ?? null)
        setConnected(true)
      } catch {
        if (active) setConnected(false)
      } finally {
        inFlight = false
      }
    }

    const handleVisibility = () => { void refreshPresence() }
    const handleTokenChange = () => { void refreshPresence() }
    void refreshPresence()
    const interval = window.setInterval(() => { if (currentToken) void refreshPresence() }, 1500)
    window.addEventListener('focus', handleVisibility)
    window.addEventListener(LOCAL_COLLABORATION_TOKEN_CHANGED_EVENT, handleTokenChange)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      active = false
      window.clearInterval(interval)
      window.removeEventListener('focus', handleVisibility)
      window.removeEventListener(LOCAL_COLLABORATION_TOKEN_CHANGED_EVENT, handleTokenChange)
      document.removeEventListener('visibilitychange', handleVisibility)
      leave()
    }
  }, [enabled, projectId])

  return {
    users: connected ? users : [], sessions: connected ? sessions : [],
    currentUser: connected ? currentUser : null, currentRole: connected ? currentRole : null, connected,
  }
}
