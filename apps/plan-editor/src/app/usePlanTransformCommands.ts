import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { BeamModuleData, DisplayLengthUnit, ProjectDocument } from '@constructflow/project-model'
import type { CommandBatchResult, CommandRequest } from '@constructflow/command-schema'
import type { AlignmentMode } from './transformOperations.mjs'

type TransformPreview = { project: ProjectDocument; ids: string[]; commands: CommandRequest[]; sourceIds: string[]; description: string }
type EditorView = 'plan' | 'framing' | 'roofplan' | 'north' | 'south' | 'east' | 'west' | 'rcp' | 'model3d'

interface UsePlanTransformCommandsOptions {
  project: ProjectDocument
  selectedIds: string[]
  displayUnit: DisplayLengthUnit
  dispatchCommandBatch: (commands: CommandRequest[]) => CommandBatchResult
  setSelectedIds: Dispatch<SetStateAction<string[]>>
  setSelectedId: Dispatch<SetStateAction<string | null>>
  setRightPanelTab: Dispatch<SetStateAction<'properties' | 'quantities' | 'objects' | 'field_forms' | 'coordination' | 'ai' | 'extensions' | 'integrations'>>
  setFileFeedback: (message: string) => void
  setViewMode: Dispatch<SetStateAction<EditorView>>
}

export function usePlanTransformCommands({ project, selectedIds, displayUnit, dispatchCommandBatch, setSelectedIds, setSelectedId, setRightPanelTab, setFileFeedback, setViewMode }: UsePlanTransformCommandsOptions) {
  const [alignmentPreview, setAlignmentPreview] = useState<TransformPreview | null>(null)
  useEffect(() => { setAlignmentPreview(null) }, [project])
  useEffect(() => {
    if (alignmentPreview && (alignmentPreview.sourceIds.length !== selectedIds.length || alignmentPreview.sourceIds.some((id, index) => id !== selectedIds[index]))) setAlignmentPreview(null)
  }, [selectedIds, alignmentPreview])

  const getHandlers = async () => {
    const { createPlanTransformCommandHandlers } = await import('./planTransformHandlers.js')
    return createPlanTransformCommandHandlers({ project, selectedIds, displayUnit, dispatchCommandBatch, setSelectedIds, setSelectedId, setRightPanelTab, setFileFeedback, setViewMode, alignmentPreview, setAlignmentPreview })
  }
  const invoke = (method: keyof Awaited<ReturnType<typeof getHandlers>>, ...args: unknown[]) => {
    void getHandlers().then(handlers => (handlers[method] as (...values: unknown[]) => void)(...args)).catch(error => setFileFeedback(error instanceof Error ? error.message : String(error)))
  }

  return {
    alignmentPreview, setAlignmentPreview,
    handlePreviewArrayObjects: (objectIds: string[], copies: number, deltaXmm: number, deltaYmm: number) => invoke('handlePreviewArrayObjects', objectIds, copies, deltaXmm, deltaYmm),
    handleMoveObjectsByDelta: (objectIds: string[], deltaXmm: number, deltaYmm: number) => invoke('handleMoveObjectsByDelta', objectIds, deltaXmm, deltaYmm),
    handlePreviewAlignment: (objectIds: string[], mode: AlignmentMode) => invoke('handlePreviewAlignment', objectIds, mode),
    handlePreviewOffset: (objectIds: string[], distanceMm: number, side: 'left' | 'right') => invoke('handlePreviewOffset', objectIds, distanceMm, side),
    handlePreviewMirror: (objectIds: string[], axis: 'vertical' | 'horizontal') => invoke('handlePreviewMirror', objectIds, axis),
    handlePreviewSplit: (objectId: string, ratio: number) => invoke('handlePreviewSplit', objectId, ratio),
    handlePreviewJoin: (objectIds: string[]) => invoke('handlePreviewJoin', objectIds),
    handlePreviewTrim: (objectIds: string[], removeEnd: 'start' | 'end') => invoke('handlePreviewTrim', objectIds, removeEnd),
    handleCommitAlignment: () => invoke('handleCommitAlignment'),
  }
}
