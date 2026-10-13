import type { ProjectDocument } from '@constructflow/project-model'
import type { CommandRequest } from '@constructflow/command-schema'

export interface DirectManipulationPreviewResult {
  valid: boolean
  project: ProjectDocument
  affected_object_ids: string[]
  errors: string[]
}

export interface PlanDragGesture {
  id: string
  kind: string
  startWorldMm: [number, number]
  startScreenPx: [number, number]
  objectIds?: string[]
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
  openingCenterOffsetMm?: number
  hostStartMm?: [number, number]
  hostEndMm?: [number, number]
  openingWidthMm?: number
  gridStartMm?: [number, number]
  gridEndMm?: [number, number]
  pipeRouteData?: unknown
  mouldingData?: unknown
  cabinetData?: unknown
}

export function resizeOrientedRectangle(center: [number, number], size: [number, number], rotationDeg: number, cornerIndex: number, cursor: [number, number]): { center_mm: [number, number]; size_mm: [number, number] } | null
export function buildDirectManipulationCommands(project: ProjectDocument, gesture: PlanDragGesture, point: [number, number], options?: Record<string, unknown>): CommandRequest[]
export function optimisticManipulationProject(project: ProjectDocument, commands: CommandRequest[]): ProjectDocument
