import { useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { ProjectDocument } from '@constructflow/project-model'
import { isBeamObject, isDoorObject, isFoundationObject, isWindowObject } from '@constructflow/project-model'
import type { CommandRequest } from '@constructflow/command-schema'
import { optimisticManipulationProject, type DirectManipulationPreviewResult, type PlanDragGesture } from '../directManipulation.mjs'
import type { usePlanCanvasDragDimensions } from './usePlanCanvasDragDimensions.js'

type Point = [number, number]
type PreviewValidationState = { at: number; valid: boolean }

interface UsePlanCanvasManipulationPreviewOptions {
  planProject: ProjectDocument
  buildCommands: (drag: PlanDragGesture, point: Point, ctrlKey: boolean) => CommandRequest[]
  syncDimensions: ReturnType<typeof usePlanCanvasDragDimensions>['syncFromPreview']
  manualDragPointRef: MutableRefObject<Point | null>
  setDragPreviewPoint: Dispatch<SetStateAction<Point | null>>
  setManipulationPreview: Dispatch<SetStateAction<{ project: ProjectDocument; ids: string[]; valid: boolean } | null>>
  onPreviewManipulation: (commands: CommandRequest[]) => DirectManipulationPreviewResult
}

export function usePlanCanvasManipulationPreview({
  planProject, buildCommands, syncDimensions, manualDragPointRef, setDragPreviewPoint,
  setManipulationPreview, onPreviewManipulation,
}: UsePlanCanvasManipulationPreviewOptions) {
  const lastPreviewValidationRef = useRef<PreviewValidationState>({ at: 0, valid: true })

  const previewDragAt = (drag: PlanDragGesture, point: Point, ctrlKey: boolean, manual = false) => {
    manualDragPointRef.current = manual ? point : null
    setDragPreviewPoint(point)
    const commands = buildCommands(drag, point, ctrlKey)
    if (!commands.length) {
      setManipulationPreview(null)
      return { commands, valid: false }
    }

    const optimistic = optimisticManipulationProject(planProject, commands)
    syncDimensions(drag, point, optimistic, manual)
    const now = performance.now()
    const validation = manual || now - lastPreviewValidationRef.current.at >= 50 ? onPreviewManipulation(commands) : undefined
    if (validation) lastPreviewValidationRef.current = { at: now, valid: validation.valid }

    const commandIds = commands.map(command => String(command.input.object_id ?? command.input.id ?? '')).filter(Boolean)
    const relatedIds = new Set(commandIds)
    const changedRoomIds = new Set<string>()
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
    if (valid && validation && commands.some(command => command.name === 'MoveWall' || command.name === 'UpdateWallEndpoints')) {
      const linkedSurfacesByRoom = new Map<string, Array<{ id: string; before: Record<string, unknown>; next: Record<string, unknown> }>>()
      for (const [id, candidate] of Object.entries(validation.project.objects)) {
        const before = planProject.objects[id]
        if (!before) continue
        const beforeData = before?.module_data as Record<string, unknown> | undefined
        const nextData = candidate.module_data as Record<string, unknown>
        if (candidate.object_type === 'architecture.room') {
          if (JSON.stringify(beforeData?.boundary_mm) !== JSON.stringify(nextData.boundary_mm)
            || beforeData?.boundary_status !== nextData.boundary_status || beforeData?.area_mm2 !== nextData.area_mm2) {
            changedRoomIds.add(id)
          }
        } else if (candidate.object_type === 'architecture.floor' || candidate.object_type === 'architecture.ceiling') {
          const roomId = typeof nextData.room_id === 'string' ? nextData.room_id : ''
          if (!roomId) continue
          const linked = linkedSurfacesByRoom.get(roomId) ?? []
          linked.push({ id, before: beforeData ?? {}, next: nextData })
          linkedSurfacesByRoom.set(roomId, linked)
        }
      }
      for (const roomId of changedRoomIds) {
        relatedIds.add(roomId)
        for (const surface of linkedSurfacesByRoom.get(roomId) ?? []) {
          if (JSON.stringify(surface.before.boundary_mm) !== JSON.stringify(surface.next.boundary_mm)
            || surface.before.room_boundary_status !== surface.next.room_boundary_status) relatedIds.add(surface.id)
        }
      }
    }

    const ids = new Set(validation?.affected_object_ids?.length ? validation.affected_object_ids : [...relatedIds])
    for (const id of relatedIds) ids.add(id)
    setManipulationPreview({ project: valid && validation ? validation.project : optimistic, ids: [...ids], valid })
    return { commands, valid }
  }

  return { previewDragAt, lastPreviewValidationRef }
}
