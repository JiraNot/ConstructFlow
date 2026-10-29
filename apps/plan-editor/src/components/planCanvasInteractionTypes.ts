import type { CabinetModuleData, MouldingModuleData, PipeRouteModuleData, StairModuleData, WallCurveGeometry } from '@constructflow/project-model'
import type { WallPlacementStart } from './commitPlanCanvasLinePlacementPoint.js'

export interface WallTouchDrawGesture {
  pointerId: number
  startNode: WallPlacementStart
  startScreenPx: [number, number]
  hadExistingStart: boolean
  pathPointsMm: [number, number][]
  sampledPathMm: [number, number][]
  candidatePointMm: [number, number]
  activeHeadingDeg: number | null
  pendingHeadingDeg: number | null
  pendingHeadingDistanceMm: number
  pendingHeadingSamples: number
  lastSampleScreenPx: [number, number]
  lastSampleWorldMm: [number, number]
  latestRawWorldMm: [number, number]
}

export interface MeasureDragGesture {
  pointerId: number
  mode: 'distance' | 'rectangle'
  startWorldMm: [number, number]
  startScreenPx: [number, number]
  latestWorldMm: [number, number]
  hadStart: boolean
}

export type WallDrawMode = 'continuous-lines' | 'continuous-lines-and-arcs' | 'line-arc' | 'room-rectangle' | 'room-l-shape' | 'room-u-shape'
export type PlanSketchMode = 'line' | 'polyline' | 'freehand' | 'rectangle'
export interface PlanSketchGesture { pointerId: number; points: [number, number][]; lastScreenPx: [number, number] }
export type MeasureMode = 'distance' | 'angle' | 'rectangle' | 'polygon' | 'area-pick' | 'area-boundary' | 'fill-pick' | 'fill-boundary'

export interface PlanCanvasDraggingObject {
  id: string
  kind: 'column' | 'wall' | 'opening' | 'opening-center' | 'grid' | 'column-corner' | 'foundation-corner' | 'wall-endpoint' | 'beam-endpoint' | 'grid-endpoint' | 'separator-endpoint' | 'pipe-endpoint' | 'pipe-node' | 'moulding-endpoint' | 'cabinet-rotation' | 'opening-edge' | 'polygon-vertex' | 'slab-edge' | 'slab-slope' | 'roof-ridge' | 'roof-seam' | 'object-move' | 'group-move' | 'stair-width' | 'stair-run' | 'stair-landing' | 'stair-first-flight' | 'stair-second-flight'
  startWorldMm: [number, number]
  startScreenPx: [number, number]
  endpointIndex?: number
  roofSeamEdgeIndices?: [number, number]
  roofSeamGripMm?: [number, number]
  startPointMm?: [number, number]
  endPointMm?: [number, number]
  curveGeometry?: WallCurveGeometry
  nextCurveGeometry?: WallCurveGeometry
  boundaryPointsMm?: [number, number][]
  edgeStartMm?: [number, number]
  edgeNormalMm?: [number, number]
  centerMm?: [number, number]
  sectionMm?: [number, number]
  rotationDeg?: number
  objectIds?: string[]
  openingCenterOffsetMm?: number
  hostStartMm?: [number, number]
  hostEndMm?: [number, number]
  openingWidthMm?: number
  gridStartMm?: [number, number]
  gridEndMm?: [number, number]
  pipeRouteData?: PipeRouteModuleData
  mouldingData?: MouldingModuleData
  cabinetData?: CabinetModuleData
  stairData?: StairModuleData
}
