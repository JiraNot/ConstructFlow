import type { CommandBatchResult, CommandRequest } from '@constructflow/command-schema'
import type { ProjectDocument, StairModuleData } from '@constructflow/project-model'

interface UsePlanAuthoringCommandsOptions {
  project: ProjectDocument
  activeDoorType: string
  activeWindowType: string
  dispatchCommandBatch: (commands: CommandRequest[]) => CommandBatchResult
  setSelectedId: (id: string | null) => void
  setSelectedIds: (ids: string[]) => void
  setFileFeedback: (message: string) => void
}

type DeferredHandlers = Omit<ReturnType<typeof import('./planAuthoringHandlers').createPlanAuthoringHandlers>, 'handleCommitStair'>

/** Keep the less common authoring workflows out of the editor's initial JavaScript payload. */
export function usePlanAuthoringCommands(options: UsePlanAuthoringCommandsOptions) {
  const invoke = <K extends keyof DeferredHandlers>(key: K) => (...args: Parameters<DeferredHandlers[K]>) => {
    void import('./planAuthoringHandlers')
      .then(({ createPlanAuthoringHandlers }) => {
        const handler = createPlanAuthoringHandlers(options)[key] as (...values: unknown[]) => unknown
        handler(...args)
      })
      .catch(() => options.setFileFeedback('โหลดเครื่องมือเขียนแบบไม่สำเร็จ'))
  }

  // Stair placement reports success synchronously so the canvas can finish its placement step.
  const handleCommitStair = (stair: StairModuleData): boolean => {
    const stairId = crypto.randomUUID()
    const result = options.dispatchCommandBatch([{
      name: 'CreateStair',
      input: { ...stair, id: stairId, created_phase: options.project.project.active_phase || 'new_construction' },
    }])
    if (result.status !== 'success') {
      options.setFileFeedback(result.errors?.join(' · ') ?? 'วางบันไดไม่สำเร็จ')
      return false
    }
    options.setSelectedId(stairId)
    options.setSelectedIds([stairId])
    return true
  }

  return {
    runArchitectureCommand: invoke('runArchitectureCommand'),
    handleCommitPipeRoute: invoke('handleCommitPipeRoute'),
    handleCommitFixture: invoke('handleCommitFixture'),
    handleCommitCabinet: invoke('handleCommitCabinet'),
    handleCommitFurniture: invoke('handleCommitFurniture'),
    handleCommitMoulding: invoke('handleCommitMoulding'),
    handleCommitArchitecturalFloor: invoke('handleCommitArchitecturalFloor'),
    handleCommitCeiling: invoke('handleCommitCeiling'),
    handleCommitRoomSeparator: invoke('handleCommitRoomSeparator'),
    handleDetectRooms: invoke('handleDetectRooms'),
    handleCreateRoomFinish: invoke('handleCreateRoomFinish'),
    handleCommitSurfaceVoid: invoke('handleCommitSurfaceVoid'),
    handleCommitDoor: invoke('handleCommitDoor'),
    handleCommitWindow: invoke('handleCommitWindow'),
    handleCommitStair,
    handleFlipDoorHanding: invoke('handleFlipDoorHanding'),
  }
}

export const preloadPlanAuthoringHandlers = () => import('./planAuthoringHandlers')
