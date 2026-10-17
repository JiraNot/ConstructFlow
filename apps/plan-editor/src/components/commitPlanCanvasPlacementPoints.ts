import type { Dispatch, SetStateAction } from 'react'
import type { DisplayLengthUnit, InteriorFurnitureKind } from '@constructflow/project-model'
import { parseLengthMm } from '@constructflow/project-model'

type Point = [number, number]
type ConnectedPlacementTool = 'roomSeparator' | 'pipe' | 'cabinet' | 'furniture' | 'moulding'
type PipeSystem = 'waste' | 'soil' | 'rainwater' | 'vent' | 'cold_water' | 'hot_water'

interface CommitPlanCanvasConnectedPlacementPointOptions {
  activeTool: ConnectedPlacementTool
  point: Point
  startPoint: Point | null
  pipeSystem: PipeSystem
  furnitureKind: InteriorFurnitureKind
  onStartPointChange: Dispatch<SetStateAction<Point | null>>
  onDrawLengthChange: Dispatch<SetStateAction<string>>
  onDrawAngleChange: Dispatch<SetStateAction<string>>
  clearDimensionOverrides: () => void
  onCommitRoomSeparator?: (start: Point, end: Point) => void
  onCommitPipeRoute?: (start: Point, end: Point, system: PipeSystem) => void
  onCommitCabinet?: (start: Point, end: Point) => void
  onCommitFurniture?: (start: Point, end: Point, kind: InteriorFurnitureKind) => void
  onCommitMoulding?: (start: Point, end: Point) => void
}

export function commitPlanCanvasConnectedPlacementPoint({
  activeTool,
  point,
  startPoint,
  pipeSystem,
  furnitureKind,
  onStartPointChange,
  onDrawLengthChange,
  onDrawAngleChange,
  clearDimensionOverrides,
  onCommitRoomSeparator,
  onCommitPipeRoute,
  onCommitCabinet,
  onCommitFurniture,
  onCommitMoulding,
}: CommitPlanCanvasConnectedPlacementPointOptions) {
  if (!startPoint) {
    onStartPointChange(point)
    onDrawLengthChange('')
    onDrawAngleChange('')
    clearDimensionOverrides()
    return
  }

  if (activeTool === 'roomSeparator') onCommitRoomSeparator?.(startPoint, point)
  else if (activeTool === 'pipe') onCommitPipeRoute?.(startPoint, point, pipeSystem)
  else if (activeTool === 'cabinet') onCommitCabinet?.(startPoint, point)
  else if (activeTool === 'furniture') onCommitFurniture?.(startPoint, point, furnitureKind)
  else if (activeTool === 'moulding') onCommitMoulding?.(startPoint, point)
  onStartPointChange(null)
  onDrawLengthChange('')
  onDrawAngleChange('')
  clearDimensionOverrides()
}

export function commitPlanCanvasGridPoint({
  point,
  startPoint,
  sequenceStyle,
  onStartPointChange,
  onDrawLengthChange,
  onDrawAngleChange,
  clearDimensionOverrides,
  onCommitGrid,
}: {
  point: Point
  startPoint: Point | null
  sequenceStyle: 'auto' | 'alpha' | 'numeric'
  onStartPointChange: Dispatch<SetStateAction<Point | null>>
  onDrawLengthChange: Dispatch<SetStateAction<string>>
  onDrawAngleChange: Dispatch<SetStateAction<string>>
  clearDimensionOverrides: () => void
  onCommitGrid: (tag: string, start: Point, end: Point, sequenceStyle?: 'auto' | 'alpha' | 'numeric') => void
}) {
  if (!startPoint) {
    onStartPointChange(point)
    clearDimensionOverrides()
    return
  }
  if (Math.hypot(point[0] - startPoint[0], point[1] - startPoint[1]) >= 100) onCommitGrid('A', startPoint, point, sequenceStyle)
  onStartPointChange(null)
  onDrawLengthChange('')
  onDrawAngleChange('')
  clearDimensionOverrides()
}

export function commitPlanCanvasGridSystemPoint({
  point,
  displayUnit,
  xIntervalsText,
  yIntervalsText,
  xFirstTag,
  yFirstTag,
  setError,
  onCommit,
  clearDimensionOverrides,
}: {
  point: Point
  displayUnit: DisplayLengthUnit
  xIntervalsText: string
  yIntervalsText: string
  xFirstTag: string
  yFirstTag: string
  setError: Dispatch<SetStateAction<string>>
  onCommit: (origin: Point, xIntervalsMm: number[], yIntervalsMm: number[], xFirstTag: string, yFirstTag: string) => void
  clearDimensionOverrides: () => void
}) {
  const parseIntervals = (value: string) => value.split(/[,;]+/).map(item => item.trim()).filter(Boolean).map(item => parseLengthMm(item, displayUnit))
  const xIntervals = parseIntervals(xIntervalsText)
  const yIntervals = parseIntervals(yIntervalsText)
  const allIntervals = [...xIntervals, ...yIntervals]
  if (!allIntervals.length) {
    setError('กรอกระยะอย่างน้อยหนึ่งแนว')
    return
  }
  if (xIntervals.length > 99 || yIntervals.length > 99 || allIntervals.some(value => value === null || !Number.isFinite(value) || value <= 0)) {
    setError('ระยะแต่ละช่วงต้องมากกว่า 0 และแต่ละแนวสร้างได้ไม่เกิน 100 เส้น')
    return
  }
  setError('')
  onCommit(point, xIntervals as number[], yIntervals as number[], xFirstTag.trim() || 'A', yFirstTag.trim() || '1')
  clearDimensionOverrides()
}
