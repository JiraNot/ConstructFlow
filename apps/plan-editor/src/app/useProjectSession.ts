import { useRef, useState } from 'react'
import type { ProjectDocument } from '@constructflow/project-model'
import type { CommandActorKind, CommandEnvelope, CommandRequest } from '@constructflow/command-schema'
import { CommandBus, ProjectCommandSession } from '../commands/CommandBus.js'

/**
 * Owns the live semantic document and its transactional command history.
 * Browser persistence, view state and presentation feedback stay with App.
 */
export function useProjectSession(initialProject: ProjectDocument | (() => ProjectDocument)) {
  const [project, setProjectState] = useState<ProjectDocument>(initialProject)
  const [commandQueue, setCommandQueue] = useState<CommandEnvelope[]>([])
  const sessionRef = useRef<ProjectCommandSession | null>(null)

  if (!sessionRef.current) sessionRef.current = new ProjectCommandSession(project)

  const setProject = (next: ProjectDocument | ((current: ProjectDocument) => ProjectDocument)) => {
    const updated = typeof next === 'function' ? next(project) : next
    sessionRef.current!.commit(updated)
    setProjectState(updated)
  }

  const dispatchCommandBatch = (commands: CommandRequest[], actorKind: CommandActorKind = 'human') => {
    const result = sessionRef.current!.execute(commands, actorKind)
    if (result.status === 'success') {
      setProjectState(result.updatedProject)
      if (result.emittedEnvelopes.length > 0) {
        setCommandQueue(queue => [...queue, ...result.emittedEnvelopes])
      }
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
  }

  const undo = () => {
    if (!sessionRef.current!.canUndo) return false
    setProjectState(sessionRef.current!.undo())
    setCommandQueue([])
    return true
  }

  const redo = () => {
    if (!sessionRef.current!.canRedo) return false
    setProjectState(sessionRef.current!.redo())
    setCommandQueue([])
    return true
  }

  return {
    project,
    setProjectState,
    setProject,
    commandQueue,
    setCommandQueue,
    sessionRef,
    dispatchCommandBatch,
    previewCommands,
    reset,
    undo,
    redo,
  }
}
