import type { CommandBatchResult, CommandRequest } from '@constructflow/command-schema'
import { isGridObject, type ProjectDocument } from '@constructflow/project-model'

interface UseGridAuthoringCommandsOptions {
  project: ProjectDocument
  dispatchCommandBatch: (commands: CommandRequest[]) => CommandBatchResult
  setFileFeedback: (message: string) => void
}

/** Owns reference-grid geometry and sends each user action through one project-session transaction. */
export function useGridAuthoringCommands({ project, dispatchCommandBatch, setFileFeedback }: UseGridAuthoringCommandsOptions) {
  const commit = (name: string, input: Record<string, unknown>) => {
    const result = dispatchCommandBatch([{ name, input }])
    if (result.status !== 'success') setFileFeedback(result.errors?.join(' · ') ?? 'สร้างกริดไม่สำเร็จ')
  }

  const handleCommitGrid = (
    tag: string,
    start_mm: [number, number],
    end_mm: [number, number],
    sequenceStyle: 'auto' | 'alpha' | 'numeric' = 'auto',
  ) => {
    const dx = end_mm[0] - start_mm[0], dy = end_mm[1] - start_mm[1]
    const orientation = Math.abs(dx) <= Math.abs(dy) ? 'vertical' : 'horizontal'
    const position_mm = orientation === 'vertical' ? (start_mm[0] + end_mm[0]) / 2 : (start_mm[1] + end_mm[1]) / 2
    const extent_mm: [number, number] = orientation === 'vertical'
      ? [Math.min(start_mm[1], end_mm[1]), Math.max(start_mm[1], end_mm[1])]
      : [Math.min(start_mm[0], end_mm[0]), Math.max(start_mm[0], end_mm[0])]
    commit('CreateGrid', {
      id: crypto.randomUUID(), tag, orientation, position_mm, extent_mm,
      start_point_mm: start_mm, end_point_mm: end_mm, sequence_style: sequenceStyle,
    })
  }

  const handleCopyGrid = (sourceId: string, start_mm: [number, number], end_mm: [number, number]) => {
    const source = project.objects[sourceId]
    if (!source || !isGridObject(source) || source.module_data.system_id) return
    const dx = end_mm[0] - start_mm[0], dy = end_mm[1] - start_mm[1]
    const orientation = Math.abs(dx) <= Math.abs(dy) ? 'vertical' : 'horizontal'
    const position_mm = orientation === 'vertical' ? (start_mm[0] + end_mm[0]) / 2 : (start_mm[1] + end_mm[1]) / 2
    const extent_mm: [number, number] = orientation === 'vertical'
      ? [Math.min(start_mm[1], end_mm[1]), Math.max(start_mm[1], end_mm[1])]
      : [Math.min(start_mm[0], end_mm[0]), Math.max(start_mm[0], end_mm[0])]
    commit('CreateGrid', {
      id: crypto.randomUUID(), tag: source.module_data.tag, orientation, position_mm, extent_mm,
      start_point_mm: start_mm, end_point_mm: end_mm,
      sequence_style: source.module_data.sequence_style ?? 'auto', auto_tag: true, bubble_visible: true,
    })
  }

  const handleCommitGridSystem = (
    origin_mm: [number, number],
    xIntervals_mm: number[],
    yIntervals_mm: number[],
    xFirstTag: string,
    yFirstTag: string,
  ) => {
    const commands: CommandRequest[] = []
    const createAxis = (orientation: 'vertical' | 'horizontal', origin: number, intervals: number[], first_tag: string) => {
      if (!intervals.length) return
      const positions_mm = [origin]
      for (const interval of intervals) positions_mm.push(positions_mm[positions_mm.length - 1]! + interval)
      commands.push({ name: 'CreateGridSystem', input: {
        id: crypto.randomUUID(), grid_ids: positions_mm.map(() => crypto.randomUUID()), orientation,
        origin_mm: origin, spacing_mm: intervals[0]!, count: positions_mm.length, positions_mm, first_tag,
      } })
    }
    createAxis('vertical', origin_mm[0], xIntervals_mm, xFirstTag)
    createAxis('horizontal', origin_mm[1], yIntervals_mm, yFirstTag)
    if (!commands.length) return
    const result = dispatchCommandBatch(commands)
    if (result.status !== 'success') setFileFeedback(result.errors?.join(' · ') ?? 'สร้างชุดกริดไม่สำเร็จ')
  }

  return { handleCommitGrid, handleCopyGrid, handleCommitGridSystem }
}
