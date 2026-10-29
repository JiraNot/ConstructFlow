import { useEffect, useRef, useState } from 'react'
import type { CommandEnvelope, ProjectCommandTransaction } from '@constructflow/command-schema'
import type { ProjectDocument } from '@constructflow/project-model'
import {
  enqueueLocalProjectCommandTransactions, getLocalCollaborationToken, getLocalDeviceId,
  loadLocalProjectCommandSyncState, LOCAL_COLLABORATION_TOKEN_CHANGED_EVENT, updateLocalProjectCommandSyncState,
  type LocalProjectCommandSyncState,
} from '../projectAutosave.js'
import { appendProjectCommandTransactions, ProjectCommandSyncError, pullProjectCommandTransactions } from '../projectCommandSync.js'
import { projectSyncFingerprint } from '../projectFingerprint.js'

type SyncPhase = 'idle' | 'connecting' | 'catching-up' | 'synced' | 'conflict' | 'baseline-required'
type CommandSyncStatus = {
  connected: boolean
  canWrite: boolean
  phase: SyncPhase
  cursor: number | null
  pendingCount: number
  message?: string
}

const initialStatus: CommandSyncStatus = { connected: false, canWrite: false, phase: 'idle', cursor: null, pendingCount: 0 }

export function useProjectCommandSync(
  projectId: string,
  enabled: boolean,
  localTransactions: ProjectCommandTransaction[],
  onPersistedLocalTransactions: (transactionIds: string[]) => void,
  onApplyRemoteTransaction: (envelopes: CommandEnvelope[], expectedFingerprint?: string) => { status: string; errors?: string[]; project?: ProjectDocument } | Promise<{ status: string; errors?: string[]; project?: ProjectDocument }>,
  currentRole: 'owner' | 'editor' | 'viewer' | null,
  historyTravelRevision: number,
  projectJson: string,
): CommandSyncStatus {
  const incomingRef = useRef(localTransactions)
  const onPersistedRef = useRef(onPersistedLocalTransactions)
  const applyRef = useRef(onApplyRemoteTransaction)
  const roleRef = useRef(currentRole)
  const historyTravelRef = useRef(historyTravelRevision)
  const historyBaselineRef = useRef<number | null>(null)
  const projectJsonRef = useRef(projectJson)
  const stateRef = useRef<LocalProjectCommandSyncState | null>(null)
  const refreshRef = useRef<(() => void) | null>(null)
  const [status, setStatus] = useState(initialStatus)
  incomingRef.current = localTransactions
  onPersistedRef.current = onPersistedLocalTransactions
  applyRef.current = onApplyRemoteTransaction
  roleRef.current = currentRole
  historyTravelRef.current = historyTravelRevision
  projectJsonRef.current = projectJson

  useEffect(() => {
    if (!enabled || !projectId) {
      stateRef.current = null
      setStatus(initialStatus)
      return
    }
    stateRef.current = null
    historyBaselineRef.current = null
    setStatus({ ...initialStatus, phase: 'connecting' })
    let active = true
    let inFlight = false
    let token = ''
    let deviceId = ''

    const setVisibleStatus = (next: Partial<CommandSyncStatus>) => {
      if (!active) return
      setStatus(current => ({
        ...current,
        ...next,
        cursor: stateRef.current?.cursor ?? current.cursor,
        pendingCount: stateRef.current?.pending.length ?? current.pendingCount,
      }))
    }

    const refresh = async () => {
      if (!active || document.visibilityState === 'hidden' || inFlight) return
      inFlight = true
      try {
        if (!stateRef.current) {
          const [storedState, localDeviceId, settings] = await Promise.all([
            loadLocalProjectCommandSyncState(projectId), getLocalDeviceId(), getLocalCollaborationToken(),
          ])
          if (!active) return
          stateRef.current = storedState
          historyBaselineRef.current = historyTravelRef.current
          deviceId = localDeviceId
          token = settings?.token ?? ''
        } else if (!token) {
          token = (await getLocalCollaborationToken())?.token ?? ''
        }
        if (!active) return
        if (!token) {
          setVisibleStatus({ connected: false, canWrite: false, phase: 'idle', message: undefined })
          return
        }

        // Move the in-memory session queue into IndexedDB before clearing it from React state.
        const queued = incomingRef.current
        if (queued.length) {
          const byProject = new Map<string, ProjectCommandTransaction[]>()
          for (const item of queued) {
            const commandProjects = [...new Set(item.commands.map(command => command.project_id))]
            if (commandProjects.length !== 1) continue
            const key = commandProjects[0]
            byProject.set(key, [...(byProject.get(key) ?? []), item])
          }
          const persistedIds: string[] = []
          for (const [commandProjectId, transactions] of byProject) {
            await enqueueLocalProjectCommandTransactions(commandProjectId, transactions)
            persistedIds.push(...transactions.map(item => item.transaction_id))
            if (commandProjectId === projectId) stateRef.current = await loadLocalProjectCommandSyncState(projectId)
          }
          if (persistedIds.length) onPersistedRef.current(persistedIds)
        }

        if (!stateRef.current!.joined) {
          const firstJoin = await pullProjectCommandTransactions(projectId, token, null, true)
          if (!active) return
          historyBaselineRef.current = historyTravelRef.current
          stateRef.current = await updateLocalProjectCommandSyncState(projectId, current => ({
            ...current, cursor: firstJoin.cursor, joined: true,
            project_fingerprint: projectSyncFingerprint(projectJsonRef.current),
            ...(firstJoin.head_fingerprint ? { baseline_expected_fingerprint: firstJoin.head_fingerprint } : {}),
            joined_head: firstJoin.head_sequence,
            ...(firstJoin.head_sequence > 0 && (current.pending.length || !firstJoin.head_fingerprint
              || firstJoin.head_fingerprint !== projectSyncFingerprint(projectJsonRef.current))
              ? { blocked_reason: 'baseline' } : { blocked_reason: undefined }),
          }))
          if (stateRef.current.pending.length) {
            setVisibleStatus({ connected: true, canWrite: firstJoin.can_write, phase: 'baseline-required', message: 'มีคำสั่งในคิวก่อนเริ่มซิงก์ ต้องเทียบหรือกู้คืนเวอร์ชันโครงการก่อนส่งคิวนี้' })
            return
          }
          if (firstJoin.head_sequence > 0 && (!firstJoin.head_fingerprint
            || firstJoin.head_fingerprint !== projectSyncFingerprint(projectJsonRef.current))) {
            setVisibleStatus({ connected: true, canWrite: firstJoin.can_write, phase: 'baseline-required', message: 'แบบในเครื่องไม่ตรงกับสถานะล่าสุดบน gateway กรุณาเปิดไฟล์หรือ revision ล่าสุดก่อนเริ่มซิงก์' })
            return
          }
        }

        const currentFingerprint = projectSyncFingerprint(projectJsonRef.current)
        const storedState = stateRef.current!
        if (['baseline', 'local-history', 'local-diverged'].includes(storedState.blocked_reason ?? '')) {
          const expected = storedState.blocked_reason === 'baseline'
            ? storedState.baseline_expected_fingerprint
            : storedState.project_fingerprint
          if (!storedState.pending.length && expected && currentFingerprint === expected) {
            historyBaselineRef.current = historyTravelRef.current
            stateRef.current = await updateLocalProjectCommandSyncState(projectId, current => ({
              ...current, blocked_reason: undefined, project_fingerprint: currentFingerprint,
            }))
          } else {
            setVisibleStatus({
              connected: true, canWrite: roleRef.current !== 'viewer',
              phase: storedState.blocked_reason === 'baseline' ? 'baseline-required' : 'conflict',
              message: storedState.blocked_reason === 'baseline' && storedState.pending.length
                ? 'มีคำสั่งในคิวก่อนเริ่มซิงก์ ต้องเทียบ revision ก่อนส่งคิวนี้'
                : storedState.blocked_reason === 'baseline'
                ? 'แบบในเครื่องไม่ตรงกับสถานะล่าสุดบน gateway กรุณาเปิดไฟล์หรือ revision ล่าสุดก่อนเริ่มซิงก์'
                : 'แบบถูกแก้ย้อนหลังหรืออยู่นอก CommandBus กรุณาเปิด revision ที่ตรงกับสถานะซิงก์ล่าสุด',
            })
            return
          }
        }

        const historyState = stateRef.current!
        if (historyBaselineRef.current === null) historyBaselineRef.current = historyTravelRef.current
        if (historyTravelRef.current > historyBaselineRef.current
          && (historyState.pending.length > 0 || historyState.cursor !== null || incomingRef.current.length > 0)) {
          stateRef.current = await updateLocalProjectCommandSyncState(projectId, current => ({ ...current, blocked_reason: 'local-history' }))
          setVisibleStatus({ connected: true, canWrite: roleRef.current !== 'viewer', phase: 'conflict', message: 'มีการ Undo/Redo หลังเริ่มซิงก์ จึงหยุดส่งและรับคำสั่งจนกว่าจะเทียบหรือเปิดเวอร์ชันที่ตรงกัน' })
          return
        }

        if (stateRef.current!.blocked_reason === 'local-history') {
          setVisibleStatus({ connected: true, canWrite: roleRef.current !== 'viewer', phase: 'conflict', message: 'มีการ Undo/Redo หลังเริ่มซิงก์ จึงหยุดส่งและรับคำสั่งจนกว่าจะเทียบหรือเปิดเวอร์ชันที่ตรงกัน' })
          return
        }
        if (stateRef.current!.blocked_reason === 'local-diverged') {
          setVisibleStatus({ connected: true, canWrite: roleRef.current !== 'viewer', phase: 'conflict', message: 'แบบในเครื่องไม่ตรงกับสถานะซิงก์ล่าสุด กรุณาเทียบ revision ก่อนซิงก์ต่อ' })
          return
        }

        if (!stateRef.current!.blocked_reason?.startsWith('apply:')
          && stateRef.current!.project_fingerprint && !stateRef.current!.pending.length && !incomingRef.current.length
          && stateRef.current!.project_fingerprint !== currentFingerprint) {
          stateRef.current = await updateLocalProjectCommandSyncState(projectId, current => ({ ...current, blocked_reason: 'local-diverged' }))
          setVisibleStatus({ connected: true, canWrite: roleRef.current !== 'viewer', phase: 'conflict', message: 'แบบในเครื่องไม่ตรงกับสถานะซิงก์ล่าสุด อาจเปิดไฟล์หรือแก้ข้อมูลนอก CommandBus กรุณาเทียบ revision ก่อนซิงก์ต่อ' })
          return
        }

        let liveState = stateRef.current!
        const pulled = await pullProjectCommandTransactions(projectId, token, liveState.cursor)
        if (!active) return
        if (pulled.reset_required) {
          stateRef.current = await updateLocalProjectCommandSyncState(projectId, current => ({ ...current, blocked_reason: 'reset' }))
          setVisibleStatus({ connected: true, canWrite: pulled.can_write, phase: 'conflict', message: 'cursor ซิงก์อยู่หลังหัวข้อมูลของเซิร์ฟเวอร์ กรุณาเปิดประวัติเวอร์ชันเพื่อตรวจสอบก่อนดำเนินการ' })
          return
        }

        for (const remote of pulled.transactions) {
          if (remote.source_device_id === deviceId) {
            liveState = await updateLocalProjectCommandSyncState(projectId, current => ({
              ...current,
              cursor: Math.max(current.cursor ?? 0, remote.sequence),
              pending: current.pending.filter(item => item.transaction_id !== remote.transaction_id),
              project_fingerprint: projectSyncFingerprint(projectJsonRef.current),
            }))
            stateRef.current = liveState
            continue
          }
          const result = await applyRef.current(remote.commands, remote.project_fingerprint)
          if (result.status !== 'success') {
            const reason = result.errors?.[0] ?? `เซิร์ฟเวอร์ transaction ${remote.sequence} ใช้กับแบบในเครื่องนี้ไม่ได้`
            stateRef.current = await updateLocalProjectCommandSyncState(projectId, current => ({ ...current, blocked_reason: `apply:${remote.sequence}:${reason}` }))
            setVisibleStatus({ connected: true, canWrite: pulled.can_write, phase: 'conflict', message: `หยุดที่ลำดับ ${remote.sequence}: ${reason}` })
            return
          }
          liveState = await updateLocalProjectCommandSyncState(projectId, current => ({
            ...current, cursor: remote.sequence,
            ...(result.project ? { project_fingerprint: projectSyncFingerprint(result.project) } : {}),
          }))
          stateRef.current = liveState
        }

        if (pulled.has_more) {
          setVisibleStatus({ connected: true, canWrite: pulled.can_write, phase: 'catching-up', message: 'กำลังรับคำสั่งจากทีมให้ครบก่อนส่งคิวในเครื่อง' })
          return
        }

        stateRef.current = await updateLocalProjectCommandSyncState(projectId, current => current.blocked_reason === 'outbox-conflict'
          ? current
          : { ...current, blocked_reason: undefined })
        liveState = stateRef.current

        if (liveState.blocked_reason === 'outbox-conflict') {
          setVisibleStatus({ connected: true, canWrite: pulled.can_write, phase: 'conflict', message: 'คิวในเครื่องอ้างอิงลำดับเก่าเกินไป เก็บคิวไว้แล้วและหยุดส่งอัตโนมัติ · ตรวจเทียบ revision ก่อนจัดการคิว' })
          return
        }

        const pending = liveState.pending
        if (pending.length && !pulled.can_write) {
          setVisibleStatus({ connected: true, canWrite: false, phase: 'conflict', message: 'สิทธิ์ผู้ชมอ่านคำสั่งได้ แต่ส่งคำสั่งที่ค้างไม่ได้' })
          return
        }
        if (pending.length) {
          let nextBase = liveState.cursor ?? 0
          const prepared = pending.map(item => {
            const base = item.base_sequence
            if (base === undefined) {
              const next = { ...item, source_device_id: deviceId, base_sequence: nextBase }
              nextBase += 1
              return next
            }
            nextBase = Math.max(nextBase, base + 1)
            return { ...item, source_device_id: item.source_device_id ?? deviceId }
          })
          stateRef.current = await updateLocalProjectCommandSyncState(projectId, current => ({ ...current, pending: prepared }))
          const firstBase = prepared[0]?.base_sequence
          if (typeof firstBase !== 'number' || firstBase !== (stateRef.current.cursor ?? 0)) {
            stateRef.current = await updateLocalProjectCommandSyncState(projectId, current => ({ ...current, blocked_reason: 'outbox-conflict' }))
            setVisibleStatus({ connected: true, canWrite: pulled.can_write, phase: 'conflict', message: 'คำสั่งในคิวอ้างอิงลำดับเก่ากว่าแบบบนเซิร์ฟเวอร์ เก็บคิวไว้แล้วและหยุดส่งอัตโนมัติ · ตรวจเทียบ revision ก่อนจัดการคิว' })
            return
          }
          const batch = prepared.slice(0, 100)
          const accepted = await appendProjectCommandTransactions(projectId, token, batch)
          if (!active) return
          const acceptedIds = new Set(accepted.accepted.map(item => item.transaction_id))
          stateRef.current = await updateLocalProjectCommandSyncState(projectId, current => ({
            ...current,
            cursor: Math.max(current.cursor ?? 0, ...accepted.accepted.map(item => item.sequence)),
            pending: current.pending.filter(item => !acceptedIds.has(item.transaction_id)),
            project_fingerprint: projectSyncFingerprint(projectJsonRef.current),
          }))
        }

        const joinHead = stateRef.current?.joined_head ?? 0
        setVisibleStatus({
          connected: true, canWrite: pulled.can_write, phase: 'synced',
          message: joinHead > 0 ? `เครื่องนี้เริ่มจากลำดับ ${joinHead} และไม่เล่นคำสั่งก่อนหน้า · เปิดไฟล์หรือ revision ล่าสุดก่อนเริ่มแก้แบบ` : undefined,
        })
      } catch (error) {
        if (!active) return
        if (error instanceof ProjectCommandSyncError && error.status === 409) {
          setVisibleStatus({ connected: true, canWrite: roleRef.current !== 'viewer', phase: 'conflict', message: `${error.message} คิวในเครื่องยังถูกเก็บไว้` })
        } else if (error instanceof ProjectCommandSyncError && [403, 413, 422].includes(error.status)) {
          setVisibleStatus({ connected: true, canWrite: roleRef.current !== 'viewer', phase: 'conflict', message: `${error.message} คิวในเครื่องยังถูกเก็บไว้` })
        } else {
          setVisibleStatus({ connected: false, canWrite: false, phase: 'connecting', message: error instanceof Error ? error.message : String(error) })
        }
      } finally {
        inFlight = false
      }
    }

    refreshRef.current = () => { void refresh() }
    void refresh()
    const interval = window.setInterval(() => { void refresh() }, 2500)
    const onWake = () => { void refresh() }
    const onTokenChanged = () => { token = ''; void refresh() }
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

  const localTransactionFingerprint = localTransactions.map(item => item.transaction_id).join('|')
  useEffect(() => { if (enabled && localTransactionFingerprint) refreshRef.current?.() }, [enabled, localTransactionFingerprint])

  useEffect(() => {
    if (!enabled || historyBaselineRef.current === null || historyTravelRevision <= historyBaselineRef.current) return
    void updateLocalProjectCommandSyncState(projectId, current => {
      if (['baseline', 'local-history', 'local-diverged'].includes(current.blocked_reason ?? '')) return current
      return current.pending.length || current.cursor !== null || incomingRef.current.length > 0
        ? { ...current, blocked_reason: 'local-history' }
        : current
    }).then(next => {
      stateRef.current = next
      if (next.blocked_reason === 'local-history') {
        setStatus({ connected: true, canWrite: roleRef.current !== 'viewer', phase: 'conflict', cursor: next.cursor,
          pendingCount: next.pending.length, message: 'มีการ Undo/Redo หลังเริ่มซิงก์ จึงหยุดส่งและรับคำสั่งจนกว่าจะเทียบหรือเปิดเวอร์ชันที่ตรงกัน' })
      }
    }).catch(() => undefined)
  }, [enabled, historyTravelRevision, projectId])

  return status
}
