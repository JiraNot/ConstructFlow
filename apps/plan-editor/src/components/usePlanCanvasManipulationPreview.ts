import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { ProjectDocument } from '@constructflow/project-model'
import { isBeamObject, isDoorObject, isFoundationObject, isWindowObject } from '@constructflow/project-model'
import type { CommandRequest } from '@constructflow/command-schema'
import type { DirectManipulationPreviewResult, PlanDragGesture } from '../directManipulation.mjs'
import { loadDirectManipulation } from '../directManipulationLoader.js'
import type { usePlanCanvasDragDimensions } from './usePlanCanvasDragDimensions.js'

type Point = [number, number]
type PreviewValidationState = { at: number; valid: boolean }

interface UsePlanCanvasManipulationPreviewOptions {
  planProject: ProjectDocument
  buildCommands: (drag: PlanDragGesture, point: Point, ctrlKey: boolean) => Promise<CommandRequest[]>
  dragging: boolean
  syncDimensions: ReturnType<typeof usePlanCanvasDragDimensions>['syncFromPreview']
  manualDragPointRef: MutableRefObject<Point | null>
  setDragPreviewPoint: Dispatch<SetStateAction<Point | null>>
  setManipulationPreview: Dispatch<SetStateAction<{ project: ProjectDocument; ids: string[]; valid: boolean } | null>>
  onPreviewManipulation: (commands: CommandRequest[]) => DirectManipulationPreviewResult
}

export function usePlanCanvasManipulationPreview({
  planProject, buildCommands, dragging, syncDimensions, manualDragPointRef, setDragPreviewPoint,
  setManipulationPreview, onPreviewManipulation,
}: UsePlanCanvasManipulationPreviewOptions) {
  const lastPreviewValidationRef = useRef<PreviewValidationState>({ at: 0, valid: true })
  const previewSequenceRef = useRef(0)
  const cancelPendingPreview = () => { previewSequenceRef.current += 1 }

  useEffect(() => {
    if (!dragging) cancelPendingPreview()
  }, [dragging])

  const previewDragAt = async (drag: PlanDragGesture, point: Point, ctrlKey: boolean, manual = false) => {
    const previewSequence = ++previewSequenceRef.current
    try {
      manualDragPointRef.current = manual ? point : null
      setDragPreviewPoint(point)
      const commands = await buildCommands(drag, point, ctrlKey)
      if (previewSequence !== previewSequenceRef.current) return { commands: [], valid: false }
      if (!commands.length) {
        setManipulationPreview(null)
        return { commands, valid: false }
      }

      const { optimisticManipulationProject } = await loadDirectManipulation()
      if (previewSequence !== previewSequenceRef.current) return { commands: [], valid: false }
      const optimistic = optimisticManipulationProject(planProject, commands)
      syncDimensions(drag, point, optimistic, manual)
      const now = performance.now()
      const validation = manual || now - lastPreviewValidationRef.current.at >= 50 ? onPreviewManipulation(commands) : undefined
      if (validation) lastPreviewValidationRef.current = { at: now, valid: validation.valid }

      const commandIds = commands.map(command => String(command.input.object_id ?? command.input.id ?? '')).filter(Boolean)
      const relatedIds = new Set(commandIds)
      for (const command of commands) {
      const id = String(command.input.object_id ?? command.input.id ?? '')
      const object = planProject.objects[id]
      if (command.name === 'MoveWall' || command.name === 'UpdateWallEndpoints') {
        for (const child of Object.values(planProject.objects)) {
          if ((isDoorObject(child) || isWindowObject(child)) && child.module_data.wall_id === id) relatedIds.add(child.id)
        }
      }
      if (command.name === 'MoveColumn' && object) {
        for (const child of Object.values(planProject.objects)) {
          if ((isBeamObject(child) && (child.module_data.start_column_id === id || child.module_data.end_column_id === id))
            || (isFoundationObject(child) && (child.module_data.supported_column_id === id || child.host_refs.includes(id)))) relatedIds.add(child.id)
        }
      }
      }

      const valid = validation?.valid ?? lastPreviewValidationRef.current.valid
      const affectedIds = validation?.affected_object_ids?.length ? validation.affected_object_ids : []
      const ids = new Set([...affectedIds, ...relatedIds].filter(id => Boolean(planProject.objects[id])))
      setManipulationPreview({ project: valid && validation ? validation.project : optimistic, ids: [...ids], valid })
      return { commands, valid }
    } catch {
      if (previewSequence === previewSequenceRef.current) setManipulationPreview(null)
      return { commands: [], valid: false }
    }
  }

  return { previewDragAt, lastPreviewValidationRef, cancelPendingPreview }
}
