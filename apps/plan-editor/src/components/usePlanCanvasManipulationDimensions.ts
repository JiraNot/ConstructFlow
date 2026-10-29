import { useMemo, type RefObject } from 'react'
import { RTree } from '@constructflow/clash-engine'
import type { DisplayLengthUnit, ProjectDocument } from '@constructflow/project-model'
import type { CommandRequest } from '@constructflow/command-schema'
import { formatLengthMm, isGridObject, isWallObject, wallCenterlineLengthMm } from '@constructflow/project-model'
import type { ViewportState } from '../viewport/viewportTransform.js'
import { worldToScreen } from '../viewport/viewportTransform.js'
import type { DragDimensionMode } from './PlanCanvasDragDimensions.js'
import type { PlanCanvasDraggingObject } from './planCanvasInteractionTypes.js'
import type { usePlanCanvasDragDimensions } from './usePlanCanvasDragDimensions.js'
import type { usePlanCanvasManipulationPreview } from './usePlanCanvasManipulationPreview.js'
import { getPlanObjectBounds } from './PlanCanvasGeometry.js'

interface UsePlanCanvasManipulationDimensionsOptions {
  containerRef: RefObject<HTMLDivElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  planProject: ProjectDocument
  viewport: ViewportState
  displayUnit: DisplayLengthUnit
  precision?: number
  dragDimensions: ReturnType<typeof usePlanCanvasDragDimensions>
  draggingObject: PlanCanvasDraggingObject | null
  dragPreviewPoint: [number, number] | null
  manipulationPreview: { project: ProjectDocument; ids: string[]; valid: boolean } | null
  setDraggingObject: (drag: PlanCanvasDraggingObject | null) => void
  setDimensionEdit: (edit: { drag: PlanCanvasDraggingObject; point: [number, number] } | null) => void
  setDragPreviewPoint: (point: [number, number] | null) => void
  setManipulationPreview: (preview: { project: ProjectDocument; ids: string[]; valid: boolean } | null) => void
  cancelPendingPreview: () => void
  previewDragAt: ReturnType<typeof usePlanCanvasManipulationPreview>['previewDragAt']
  onCommitManipulation: (commands: CommandRequest[]) => { status: string; errors?: string[] }
  onManipulationRejected?: (errors: string[]) => void
}

function planObjectLevelId(object: ProjectDocument['objects'][string], fallback: string): string {
  const data = object.module_data as unknown as Record<string, unknown>
  if (typeof data.level_id === 'string') return data.level_id
  return object.level_refs.find(reference => reference.role === 'host_level')?.level_id
    ?? object.level_refs.find(reference => reference.role === 'base_level')?.level_id
    ?? object.level_refs[0]?.level_id
    ?? fallback
}

export function usePlanCanvasManipulationDimensions({
  containerRef, canvasRef, planProject, viewport, displayUnit, precision = 3, dragDimensions, draggingObject,
  dragPreviewPoint, manipulationPreview, setDraggingObject, setDimensionEdit, setDragPreviewPoint,
  setManipulationPreview, previewDragAt, cancelPendingPreview, onCommitManipulation, onManipulationRejected,
}: UsePlanCanvasManipulationDimensionsOptions) {
  const nearbyObjectIndex = useMemo(() => new RTree(Object.values(planProject.objects).flatMap(object => {
    const bounds = getPlanObjectBounds(object)
    return bounds ? [{
      bounds: { min: [bounds[0], bounds[1], 0] as [number, number, number], max: [bounds[2], bounds[3], 0] as [number, number, number] },
      value: object.id,
    }] : []
  })), [planProject])

  const updateMoveDimension = (axis: 'x' | 'y', value: string) =>
    dragDimensions.updateMove(draggingObject, axis, value, previewDragAt)
  const updateResizeDimension = (axis: 'width' | 'height' | 'length' | 'offset', value: string) =>
    dragDimensions.updateResize(draggingObject, axis, value, previewDragAt)

  const commitDragDimensions = async () => {
    if (!draggingObject || !dragDimensions.manualPointRef.current) return
    const { commands, valid } = await previewDragAt(draggingObject, dragDimensions.manualPointRef.current, true, true)
    if (!commands.length || !valid) {
      onManipulationRejected?.(['ไม่สามารถใช้มิติที่ระบุได้'])
      return
    }
    cancelPendingPreview()
    const result = onCommitManipulation(commands)
    if (result.status !== 'success') {
      onManipulationRejected?.(result.errors ?? ['ไม่สามารถใช้มิติที่ระบุได้'])
      return
    }
    dragDimensions.manualPointRef.current = null
    setDraggingObject(null)
    setDimensionEdit(null)
    setDragPreviewPoint(null)
    setManipulationPreview(null)
    dragDimensions.clearResizeValues()
    canvasRef.current?.focus({ preventScroll: true })
  }

  const cancelDragDimensions = () => {
    cancelPendingPreview()
    dragDimensions.manualPointRef.current = null
    setDraggingObject(null)
    setDimensionEdit(null)
    setDragPreviewPoint(null)
    setManipulationPreview(null)
    dragDimensions.clearResizeValues()
    canvasRef.current?.focus({ preventScroll: true })
  }

  const dimensions = draggingObject && dragPreviewPoint
    ? (() => {
        const original = planProject.objects[draggingObject.id]
        const preview = manipulationPreview?.project.objects[draggingObject.id] ?? original
        if (!original || !preview) return null
        const dx = dragPreviewPoint[0] - draggingObject.startWorldMm[0]
        const dy = dragPreviewPoint[1] - draggingObject.startWorldMm[1]
        const bounds = getPlanObjectBounds(preview)
        const data = preview.module_data as unknown as Record<string, unknown>
        const start = data.start_point_mm as [number, number] | undefined
        const end = data.end_point_mm as [number, number] | undefined
        const length = start && end
          ? isWallObject(preview) ? wallCenterlineLengthMm(preview.module_data) : Math.hypot(end[0] - start[0], end[1] - start[1])
          : null
        const excluded = new Set(manipulationPreview?.ids ?? [draggingObject.id])
        const nearby = bounds && (draggingObject.kind === 'object-move' || draggingObject.kind === 'group-move')
          ? nearbyObjectIndex.search({
              min: [bounds[0] - 12000, bounds[1] - 12000, 0],
              max: [bounds[2] + 12000, bounds[3] + 12000, 0],
            }).map(entry => planProject.objects[entry.value]).filter((object): object is NonNullable<typeof object> => Boolean(object)
              && planObjectLevelId(object, planProject.project.active_level_id) === planObjectLevelId(original, planProject.project.active_level_id)
              && !excluded.has(object.id)).flatMap(object => {
              const other = getPlanObjectBounds(object)
              if (!other) return []
              const verticalOverlap = other[1] <= bounds[3] && other[3] >= bounds[1]
              const horizontalOverlap = other[0] <= bounds[2] && other[2] >= bounds[0]
              const candidates = [
                verticalOverlap && other[2] <= bounds[0] ? { direction: 'ซ้าย', gap: bounds[0] - other[2] } : null,
                verticalOverlap && other[0] >= bounds[2] ? { direction: 'ขวา', gap: other[0] - bounds[2] } : null,
                horizontalOverlap && other[1] >= bounds[3] ? { direction: 'บน', gap: other[1] - bounds[3] } : null,
                horizontalOverlap && other[3] <= bounds[1] ? { direction: 'ล่าง', gap: bounds[1] - other[3] } : null,
              ]
              return candidates.filter((candidate): candidate is { direction: string; gap: number } => Boolean(candidate) && candidate!.gap >= 0)
            }).reduce((nearest, candidate) => {
              if (!nearest[candidate.direction] || candidate.gap < nearest[candidate.direction]!) nearest[candidate.direction] = candidate.gap
              return nearest
            }, {} as Record<string, number>)
          : null
        return { dx, dy, width: bounds ? bounds[2] - bounds[0] : null, height: bounds ? bounds[3] - bounds[1] : null, length, nearby }
      })()
    : null

  const rectangle = draggingObject?.kind === 'column-corner' || draggingObject?.kind === 'foundation-corner'
  const openingWidth = draggingObject?.kind === 'opening-edge'
  const stairWidth = draggingObject?.kind === 'stair-width'
  const stairRun = draggingObject?.kind === 'stair-run'
  const stairLanding = draggingObject?.kind === 'stair-landing'
  const stairFirstFlight = draggingObject?.kind === 'stair-first-flight'
  const stairSecondFlight = draggingObject?.kind === 'stair-second-flight'
  const slabEdgeOffset = draggingObject?.kind === 'slab-edge'
  const lineLength = draggingObject?.kind === 'wall-endpoint' || draggingObject?.kind === 'beam-endpoint' || draggingObject?.kind === 'grid-endpoint' || draggingObject?.kind === 'separator-endpoint' || draggingObject?.kind === 'pipe-endpoint' || draggingObject?.kind === 'moulding-endpoint'
  const gridCandidate = draggingObject?.kind === 'grid' ? manipulationPreview?.project.objects[draggingObject.id] ?? planProject.objects[draggingObject.id] : undefined
  const gridData = gridCandidate && isGridObject(gridCandidate) ? gridCandidate.module_data : undefined
  const mode: DragDimensionMode = gridData?.system_id ? gridData.orientation === 'vertical' ? 'axis-x' : 'axis-y' : rectangle ? 'rectangle' : openingWidth ? 'opening-width' : stairWidth ? 'stair-width' : stairRun ? 'stair-run' : stairLanding ? 'stair-landing' : stairFirstFlight ? 'stair-first-flight' : stairSecondFlight ? 'stair-second-flight' : slabEdgeOffset ? 'edge-offset' : lineLength ? 'line-length' : 'move'
  const nearbyReadout = dimensions?.nearby ? Object.entries(dimensions.nearby).map(([direction, gap]) => `${direction} ${formatLengthMm(gap, displayUnit, precision)}`).join(' · ') : ''
  const readout = gridData?.system_id ? `กริด ${gridData.tag} · ${gridData.orientation === 'vertical' ? 'X' : 'Y'} = ${formatLengthMm(gridData.position_mm, displayUnit, precision)} ${displayUnit}` : slabEdgeOffset
    ? `ระยะขอบ ${dragDimensions.offset || '0'} ${displayUnit}`
    : dimensions?.length !== null && dimensions?.length !== undefined
    ? `L ${formatLengthMm(dimensions.length, displayUnit, precision)} ${displayUnit}`
    : dimensions?.width !== null && dimensions?.width !== undefined && dimensions?.height !== null && dimensions?.height !== undefined
      ? `W×H ${formatLengthMm(dimensions.width, displayUnit, precision)} × ${formatLengthMm(dimensions.height, displayUnit, precision)} ${displayUnit}`
      : null
  const completeReadout = [readout, nearbyReadout ? `ระยะรอบข้าง · ${nearbyReadout} ${displayUnit}` : ''].filter(Boolean).join('  |  ') || null
  const screenPoint = dragPreviewPoint ? worldToScreen(dragPreviewPoint, viewport) : null
  const style = screenPoint ? {
    left: Math.max(8, Math.min(screenPoint[0] + 16, (containerRef.current?.clientWidth ?? 800) - 220)),
    top: Math.max(8, Math.min(screenPoint[1] + 16, (containerRef.current?.clientHeight ?? 600) - 92)),
  } : undefined

  return {
    dimensions,
    mode,
    values: { x: dragDimensions.moveX, y: dragDimensions.moveY, width: dragDimensions.width, height: dragDimensions.height, length: dragDimensions.length, offset: dragDimensions.offset },
    readout: completeReadout,
    style,
    updateMoveDimension,
    updateResizeDimension,
    commitDragDimensions,
    cancelDragDimensions,
  }
}
