import { useRef, useState } from 'react'
import { formatLengthMm, parseLengthMm, type DisplayLengthUnit, type ProjectDocument, wallArcEndpointsMm, wallCenterlineLengthMm, wallCurveWithLengthMm } from '@constructflow/project-model'
import type { PlanDragGesture } from '../directManipulation.mjs'
import { resolveDragDimensionTarget, resolveLineEndpointLengthTarget, resolveOpeningEdgeWidthTarget, resolveRectangleResizeTarget } from '../app/dragDimensionInput.mjs'
import { stairLandingGripPoint } from './stairLandingGripPoint.mjs'
import { stairFlightGripPoints } from './stairFlightGripPoints.mjs'

type PreviewDrag = (drag: PlanDragGesture, point: [number, number], ctrlKey: boolean, manual?: boolean) => Promise<{ commands: unknown[]; valid: boolean }>

function endpointSegment(points: number[][] | undefined, endpointIndex: number | undefined) {
  if (!points || points.length < 2 || endpointIndex === undefined) return null
  if (endpointIndex === 0) return { start: points[0] as [number, number], end: points[1] as [number, number], endpoint: 0 as const }
  if (endpointIndex === points.length - 1) return { start: points[points.length - 2] as [number, number], end: points[points.length - 1] as [number, number], endpoint: 1 as const }
  return null
}

export function usePlanCanvasDragDimensions(displayUnit: DisplayLengthUnit) {
  const [moveX, setMoveX] = useState('0')
  const [moveY, setMoveY] = useState('0')
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [length, setLength] = useState('')
  const [offset, setOffset] = useState('')
  const manualPointRef = useRef<[number, number] | null>(null)

  const updateMove = (drag: PlanDragGesture | null, axis: 'x' | 'y', value: string, previewAt: PreviewDrag) => {
    if (axis === 'x') setMoveX(value)
    else setMoveY(value)
    if (!drag) return
    const target = resolveDragDimensionTarget(drag.startWorldMm, axis === 'x' ? value : moveX, axis === 'y' ? value : moveY, displayUnit)
    if (!target) { manualPointRef.current = [Number.NaN, Number.NaN]; return }
    previewAt(drag, target.point_mm, true, true)
  }

  const updateResize = (drag: PlanDragGesture | null, axis: 'width' | 'height' | 'length' | 'offset', value: string, previewAt: PreviewDrag) => {
    if (axis === 'width') setWidth(value)
    else if (axis === 'height') setHeight(value)
    else if (axis === 'length') setLength(value)
    else setOffset(value)
    if (!drag) return
    let target: { point_mm: [number, number]; curveGeometry?: NonNullable<PlanDragGesture['curveGeometry']> } | null = null
    if ((drag.kind === 'column-corner' || drag.kind === 'foundation-corner') && drag.centerMm && drag.sectionMm && drag.endpointIndex !== undefined) {
      target = resolveRectangleResizeTarget(drag.centerMm, drag.sectionMm, drag.rotationDeg ?? 0, drag.endpointIndex, axis === 'width' ? value : width, axis === 'height' ? value : height, displayUnit)
    } else if ((drag.kind === 'wall-endpoint' || drag.kind === 'beam-endpoint' || drag.kind === 'grid-endpoint' || drag.kind === 'separator-endpoint') && drag.startPointMm && drag.endPointMm && drag.endpointIndex !== undefined && axis === 'length') {
      if (drag.kind === 'wall-endpoint' && drag.curveGeometry) {
        const desiredLength = parseLengthMm(value, displayUnit)
        const curveGeometry = desiredLength === null ? undefined : wallCurveWithLengthMm(drag.curveGeometry, drag.endpointIndex as 0 | 1, desiredLength)
        if (curveGeometry) {
          const [start, end] = wallArcEndpointsMm(curveGeometry)
          target = { point_mm: drag.endpointIndex === 0 ? [start[0], start[1]] : [end[0], end[1]], curveGeometry }
        }
      } else target = resolveLineEndpointLengthTarget(drag.startPointMm, drag.endPointMm, drag.endpointIndex as 0 | 1, value, displayUnit)
    } else if (drag.kind === 'pipe-endpoint' && drag.pipeRouteData && axis === 'length') {
      const routeData = drag.pipeRouteData as Record<string, unknown>
      const segment = endpointSegment(routeData.nodes_mm as number[][] | undefined, drag.endpointIndex)
      if (segment) target = resolveLineEndpointLengthTarget(segment.start, segment.end, segment.endpoint, value, displayUnit)
    } else if (drag.kind === 'moulding-endpoint' && drag.mouldingData && axis === 'length') {
      const mouldingData = drag.mouldingData as Record<string, unknown>
      const segment = endpointSegment(mouldingData.path_mm as number[][] | undefined, drag.endpointIndex)
      if (segment) target = resolveLineEndpointLengthTarget(segment.start, segment.end, segment.endpoint, value, displayUnit)
    } else if (drag.kind === 'opening-edge' && drag.hostStartMm && drag.hostEndMm && drag.openingCenterOffsetMm !== undefined && drag.openingWidthMm !== undefined && drag.endpointIndex !== undefined && axis === 'width') {
      target = resolveOpeningEdgeWidthTarget(drag.hostStartMm, drag.hostEndMm, drag.openingCenterOffsetMm, drag.openingWidthMm, drag.endpointIndex as 0 | 1, value, displayUnit)
    } else if (drag.kind === 'stair-width' && drag.stairData && axis === 'width') {
      const stair = drag.stairData, [sx, sy] = stair.start_point_mm
      const angle = Number(stair.rotation_deg ?? 0) * Math.PI / 180
      const side = stair.turn_direction === 'left' && stair.stair_type !== 'straight' ? -1 : 1
      const grip: [number, number] = [sx - Math.sin(angle) * stair.width_mm * side, sy + Math.cos(angle) * stair.width_mm * side]
      target = resolveLineEndpointLengthTarget([sx, sy], grip, 1, value, displayUnit)
    } else if (drag.kind === 'stair-run' && drag.stairData && axis === 'length') {
      const stair = drag.stairData, [sx, sy] = stair.start_point_mm
      const angle = Number(stair.rotation_deg ?? 0) * Math.PI / 180
      const run = Math.max(1, stair.num_risers - 1) * stair.tread_depth_mm
      const grip: [number, number] = [sx + Math.cos(angle) * run, sy + Math.sin(angle) * run]
      target = resolveLineEndpointLengthTarget([sx, sy], grip, 1, value, displayUnit)
    } else if (drag.kind === 'stair-landing' && drag.stairData && axis === 'length') {
      const stair = drag.stairData
      const landingDepth = parseLengthMm(value, displayUnit)
      const grip = stairLandingGripPoint(stair)
      if (landingDepth !== null && Number.isFinite(landingDepth) && grip) {
        const angle = Number(stair.rotation_deg ?? 0) * Math.PI / 180
        const delta = landingDepth - Number(stair.landing_depth_mm ?? stair.width_mm)
        target = { point_mm: [grip[0] + Math.cos(angle) * delta, grip[1] + Math.sin(angle) * delta] }
      }
    } else if ((drag.kind === 'stair-first-flight' || drag.kind === 'stair-second-flight') && drag.stairData && axis === 'length') {
      const flight = drag.kind === 'stair-first-flight' ? 'first' : 'second'
      const grip = stairFlightGripPoints(drag.stairData).find(item => item.flight === flight)
      const desiredRun = parseLengthMm(value, displayUnit)
      if (grip && desiredRun !== null && Number.isFinite(desiredRun)) target = {
        point_mm: [grip.point[0] + grip.direction[0] * (desiredRun - grip.run), grip.point[1] + grip.direction[1] * (desiredRun - grip.run)],
      }
    } else if (drag.kind === 'slab-edge' && drag.edgeStartMm && drag.edgeNormalMm && axis === 'offset') {
      const distance = parseLengthMm(value, displayUnit)
      if (distance !== null && Number.isFinite(distance)) target = {
        point_mm: [drag.edgeStartMm[0] + drag.edgeNormalMm[0] * distance, drag.edgeStartMm[1] + drag.edgeNormalMm[1] * distance],
      }
    }
    if (!target) { manualPointRef.current = [Number.NaN, Number.NaN]; return }
    manualPointRef.current = target.point_mm
    previewAt(target.curveGeometry ? { ...drag, nextCurveGeometry: target.curveGeometry } : drag, target.point_mm, true, true)
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
    } else if (data && (drag.kind === 'wall-endpoint' || drag.kind === 'beam-endpoint' || drag.kind === 'grid-endpoint' || drag.kind === 'separator-endpoint')) {
      const start = data.start_point_mm as [number, number] | undefined
      const end = data.end_point_mm as [number, number] | undefined
      if (start && end) setLength(formatLengthMm(object?.object_type === 'architecture.wall'
        ? wallCenterlineLengthMm(object.module_data as Parameters<typeof wallCenterlineLengthMm>[0])
        : Math.hypot(end[0] - start[0], end[1] - start[1]), displayUnit))
    } else if (data && drag.kind === 'pipe-endpoint') {
      const segment = endpointSegment(data.nodes_mm as number[][] | undefined, drag.endpointIndex)
      if (segment) setLength(formatLengthMm(Math.hypot(segment.end[0] - segment.start[0], segment.end[1] - segment.start[1]), displayUnit))
    } else if (data && drag.kind === 'moulding-endpoint') {
      const segment = endpointSegment(data.path_mm as number[][] | undefined, drag.endpointIndex)
      if (segment) setLength(formatLengthMm(Math.hypot(segment.end[0] - segment.start[0], segment.end[1] - segment.start[1]), displayUnit))
    } else if (data && drag.kind === 'stair-width') {
      setWidth(formatLengthMm(Number(data.width_mm), displayUnit))
    } else if (data && drag.kind === 'stair-run') {
      setLength(formatLengthMm(Math.max(1, Number(data.num_risers) - 1) * Number(data.tread_depth_mm), displayUnit))
    } else if (data && drag.kind === 'stair-landing') {
      setLength(formatLengthMm(Number(data.landing_depth_mm ?? data.width_mm), displayUnit))
    } else if (data && (drag.kind === 'stair-first-flight' || drag.kind === 'stair-second-flight')) {
      const flight = drag.kind === 'stair-first-flight' ? 'first' : 'second'
      const risers = Number(data.num_risers)
      const firstRisers = Number(data.first_flight_risers ?? Math.floor(risers / 2))
      const flightRisers = flight === 'first' ? firstRisers : risers - firstRisers
      const tread = flight === 'first' ? Number(data.tread_depth_mm) : Number(data.second_tread_depth_mm ?? data.tread_depth_mm)
      setLength(formatLengthMm(Math.max(1, flightRisers - 1) * tread, displayUnit))
    } else if (data && drag.kind === 'slab-edge' && drag.edgeStartMm && drag.edgeNormalMm) {
      const dx = point[0] - drag.edgeStartMm[0], dy = point[1] - drag.edgeStartMm[1]
      setOffset(formatLengthMm(dx * drag.edgeNormalMm[0] + dy * drag.edgeNormalMm[1], displayUnit))
    }
  }

  const clearResizeValues = () => { setWidth(''); setHeight(''); setLength(''); setOffset('') }

  return {
    moveX, moveY, width, height, length, offset,
    setWidth, setHeight, setLength, setOffset,
    manualPointRef,
    updateMove, updateResize, syncFromPreview, clearResizeValues,
  }
}
