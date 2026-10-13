import { useRef, useState } from 'react'
import { formatLengthMm, type DisplayLengthUnit, type ProjectDocument } from '@constructflow/project-model'
import type { PlanDragGesture } from '../directManipulation.mjs'
import { resolveDragDimensionTarget, resolveLineEndpointLengthTarget, resolveOpeningEdgeWidthTarget, resolveRectangleResizeTarget } from '../app/dragDimensionInput.mjs'

type PreviewDrag = (drag: PlanDragGesture, point: [number, number], ctrlKey: boolean, manual?: boolean) => { commands: unknown[]; valid: boolean }

export function usePlanCanvasDragDimensions(displayUnit: DisplayLengthUnit) {
  const [moveX, setMoveX] = useState('0')
  const [moveY, setMoveY] = useState('0')
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [length, setLength] = useState('')
  const manualPointRef = useRef<[number, number] | null>(null)

  const updateMove = (drag: PlanDragGesture | null, axis: 'x' | 'y', value: string, previewAt: PreviewDrag) => {
    if (axis === 'x') setMoveX(value)
    else setMoveY(value)
    if (!drag) return
    const target = resolveDragDimensionTarget(drag.startWorldMm, axis === 'x' ? value : moveX, axis === 'y' ? value : moveY, displayUnit)
    if (!target) { manualPointRef.current = null; return }
    previewAt(drag, target.point_mm, true, true)
  }

  const updateResize = (drag: PlanDragGesture | null, axis: 'width' | 'height' | 'length', value: string, previewAt: PreviewDrag) => {
    if (axis === 'width') setWidth(value)
    else if (axis === 'height') setHeight(value)
    else setLength(value)
    if (!drag) return
    let target: { point_mm: [number, number] } | null = null
    if ((drag.kind === 'column-corner' || drag.kind === 'foundation-corner') && drag.centerMm && drag.sectionMm && drag.endpointIndex !== undefined) {
      target = resolveRectangleResizeTarget(drag.centerMm, drag.sectionMm, drag.rotationDeg ?? 0, drag.endpointIndex, axis === 'width' ? value : width, axis === 'height' ? value : height, displayUnit)
    } else if ((drag.kind === 'wall-endpoint' || drag.kind === 'beam-endpoint') && drag.startPointMm && drag.endPointMm && drag.endpointIndex !== undefined && axis === 'length') {
      target = resolveLineEndpointLengthTarget(drag.startPointMm, drag.endPointMm, drag.endpointIndex as 0 | 1, value, displayUnit)
    } else if (drag.kind === 'opening-edge' && drag.hostStartMm && drag.hostEndMm && drag.openingCenterOffsetMm !== undefined && drag.openingWidthMm !== undefined && drag.endpointIndex !== undefined && axis === 'width') {
      target = resolveOpeningEdgeWidthTarget(drag.hostStartMm, drag.hostEndMm, drag.openingCenterOffsetMm, drag.openingWidthMm, drag.endpointIndex as 0 | 1, value, displayUnit)
    }
    if (!target) { manualPointRef.current = null; return }
    previewAt(drag, target.point_mm, true, true)
  }

  const syncFromPreview = (drag: PlanDragGesture, point: [number, number], project: ProjectDocument, manual: boolean) => {
    if (manual) return
    setMoveX(formatLengthMm(point[0] - drag.startWorldMm[0], displayUnit))
    setMoveY(formatLengthMm(point[1] - drag.startWorldMm[1], displayUnit))
    const object = project.objects[drag.id]
    const data = object?.module_data as Record<string, unknown> | undefined
    if (data && (drag.kind === 'column-corner' || drag.kind === 'foundation-corner')) {
      const size = (object?.object_type === 'structure.column' ? data.section_mm : data.size_mm) as [number, number] | undefined
      if (size) { setWidth(formatLengthMm(Number(size[0]), displayUnit)); setHeight(formatLengthMm(Number(size[1]), displayUnit)) }
    } else if (data && drag.kind === 'opening-edge') {
      setWidth(formatLengthMm(Number(data.width_mm), displayUnit))
    } else if (data && (drag.kind === 'wall-endpoint' || drag.kind === 'beam-endpoint')) {
      const start = data.start_point_mm as [number, number] | undefined
      const end = data.end_point_mm as [number, number] | undefined
      if (start && end) setLength(formatLengthMm(Math.hypot(end[0] - start[0], end[1] - start[1]), displayUnit))
    }
  }

  const clearResizeValues = () => { setWidth(''); setHeight(''); setLength('') }

  return {
    moveX, moveY, width, height, length,
    setWidth, setHeight, setLength,
    manualPointRef,
    updateMove, updateResize, syncFromPreview, clearResizeValues,
  }
}
