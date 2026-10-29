import { useRef, useState } from 'react'
import type { ProjectDocument } from '@constructflow/project-model'
import type { CommandActorKind, CommandEnvelope, CommandRequest, ProjectCommandTransaction } from '@constructflow/command-schema'
import { buildProjectHistoryDeltaInput, CommandBus, matchesProjectHistoryTarget, ProjectCommandSession } from '../commands/CommandBus.js'
import { projectSyncFingerprint } from '../projectFingerprint.js'

/**
 * Owns the live semantic document and its transactional command history.
 * Local snapshot persistence, view state and presentation feedback are owned by their editor-level hooks/components.
 */
export function useProjectSession(initialProject: ProjectDocument | (() => ProjectDocument)) {
  const [project, setProjectState] = useState<ProjectDocument>(initialProject)
  const [commandQueue, setCommandQueue] = useState<CommandEnvelope[]>([])
  const [localCommandTransactions, setLocalCommandTransactions] = useState<ProjectCommandTransaction[]>([])
  const [historyTravelRevision, setHistoryTravelRevision] = useState(0)
  const sessionRef = useRef<ProjectCommandSession | null>(null)

  if (!sessionRef.current) sessionRef.current = new ProjectCommandSession(project)

  const captureLocalCommands = (result: ReturnType<ProjectCommandSession['execute']>, actorKind: CommandActorKind) => {
    if (actorKind === 'sync' || result.status !== 'success') return
    const commands = result.committedEnvelopes.filter(envelope => ![
      'CreateProjectComment', 'AddProjectCommentReply', 'SetProjectCommentStatus', 'MergeProjectComments', 'RestoreProjectRevision',
    ].includes(envelope.name))
    if (commands.length) setLocalCommandTransactions(queue => [...queue, {
      transaction_id: result.transaction_id, commands,
      project_fingerprint: projectSyncFingerprint(result.updatedProject),
    }])
  }

  const setProject = (next: ProjectDocument | ((current: ProjectDocument) => ProjectDocument)) => {
    const current = sessionRef.current!.project
    const updated = typeof next === 'function' ? next(current) : next
    try {
      const input = buildProjectHistoryDeltaInput(current, updated)
      const result = CommandBus.executeBatch(current, [{ name: 'ApplyProjectHistoryDelta', input: input as unknown as Record<string, unknown> }], 'human')
      if (result.status === 'success' && matchesProjectHistoryTarget(result.updatedProject, updated)) {
        sessionRef.current!.commit(result.updatedProject)
        setProjectState(result.updatedProject)
        captureLocalCommands(result, 'human')
        return
      }
    } catch {
      // Unsupported, oversized, or non-serializable direct edits retain local behavior and pause live sync.
    }
    sessionRef.current!.commit(updated)
    setProjectState(updated)
    setHistoryTravelRevision(revision => revision + 1)
  }

  const dispatchCommandBatch = (commands: CommandRequest[], actorKind: CommandActorKind = 'human') => {
    const result = sessionRef.current!.execute(commands, actorKind)
    if (result.status === 'success') {
      setProjectState(result.updatedProject)
      captureLocalCommands(result, actorKind)
      if (result.emittedEnvelopes.length > 0) {
        setCommandQueue(queue => [...queue, ...result.emittedEnvelopes])
      }
    }
    return result
  }

  const dispatchAsyncCommandBatch = async (commands: CommandRequest[], actorKind: CommandActorKind = 'human') => {
    const result = await sessionRef.current!.executeAsync(commands, actorKind)
    if (result.status === 'success') {
      setProjectState(result.updatedProject)
      captureLocalCommands(result, actorKind)
      if (result.emittedEnvelopes.length > 0) setCommandQueue(queue => [...queue, ...result.emittedEnvelopes])
    }
    return result
  }

  const previewCommands = (commands: CommandRequest[], actorKind: CommandActorKind = 'human') => {
    const result = CommandBus.executeBatch(project, commands, actorKind)
    return {
      valid: result.status === 'success',
      project: result.updatedProject,
      affected_object_ids: [...new Set(result.results.flatMap(item => item.affected_object_ids))],
      errors: result.errors ?? [],
    }
  }

  const reset = (next: ProjectDocument, envelopes: CommandEnvelope[] = []) => {
    sessionRef.current!.reset(next)
    setProjectState(next)
    setCommandQueue(envelopes)
    setHistoryTravelRevision(revision => revision + 1)
  }

  const undo = () => {
    const travel = sessionRef.current!.undoWithHistoryDelta()
    if (!travel) return false
    setProjectState(travel.project)
    setCommandQueue([])
    if (travel.commandResult) captureLocalCommands(travel.commandResult, 'human')
    else setHistoryTravelRevision(revision => revision + 1)
    return true
  }

  const redo = () => {
    const travel = sessionRef.current!.redoWithHistoryDelta()
    if (!travel) return false
    setProjectState(travel.project)
    setCommandQueue([])
    if (travel.commandResult) captureLocalCommands(travel.commandResult, 'human')
    else setHistoryTravelRevision(revision => revision + 1)
    return true
  }

  const recordHistoryTravel = () => setHistoryTravelRevision(revision => revision + 1)

  return {
    project,
    setProjectState,
    setProject,
    commandQueue,
    setCommandQueue,
    localCommandTransactions,
    setLocalCommandTransactions,
    historyTravelRevision,
    recordHistoryTravel,
    sessionRef,
    dispatchCommandBatch,
    dispatchAsyncCommandBatch,
    previewCommands,
    reset,
    undo,
    redo,
  }
}
