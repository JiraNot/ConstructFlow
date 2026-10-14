import type { CabinetModuleData, MouldingModuleData, PipeRouteModuleData, StairModuleData } from '@constructflow/project-model'

export interface PlanCanvasDraggingObject {
  id: string
  kind: 'column' | 'wall' | 'opening' | 'opening-center' | 'grid' | 'column-corner' | 'foundation-corner' | 'wall-endpoint' | 'beam-endpoint' | 'grid-endpoint' | 'separator-endpoint' | 'pipe-endpoint' | 'pipe-node' | 'moulding-endpoint' | 'cabinet-rotation' | 'opening-edge' | 'polygon-vertex' | 'slab-edge' | 'slab-slope' | 'roof-ridge' | 'roof-seam' | 'object-move' | 'group-move' | 'stair-width' | 'stair-run' | 'stair-landing'
  startWorldMm: [number, number]
  startScreenPx: [number, number]
  endpointIndex?: number
  roofSeamEdgeIndices?: [number, number]
  roofSeamGripMm?: [number, number]
  startPointMm?: [number, number]
  endPointMm?: [number, number]
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
