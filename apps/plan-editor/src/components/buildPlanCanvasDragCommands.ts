import { ProjectDocument, isColumnObject, type CabinetModuleData, type PipeRouteModuleData } from '@constructflow/project-model'
import { projectPointToWallOffsetMm } from '@constructflow/architecture-engine'
import { movePipeRouteEndpoint, movePipeRouteNode } from '@constructflow/drainage-engine'
import { snapOpeningOffsetBimAware, resizeOpeningFromEdge, type SnapResult } from '@constructflow/snapping-engine'
import type { CommandRequest } from '@constructflow/command-schema'
import { buildDirectManipulationCommands, type PlanDragGesture } from '../directManipulation.mjs'
import type { ViewportState } from '../viewport/viewportTransform.js'
import { cabinetRotationFromGrip } from './PlanCanvasGeometry.js'

interface BuildPlanCanvasDragCommandsOptions {
  planProject: ProjectDocument
  drag: PlanDragGesture
  rawWorld: [number, number]
  ctrlKey: boolean
  viewport: ViewportState
  snapPlanPoint: (point: [number, number], distancePx?: number, excludedObjectId?: string) => SnapResult
}

export function buildPlanCanvasDragCommands({ planProject, drag, rawWorld, ctrlKey, viewport, snapPlanPoint }: BuildPlanCanvasDragCommandsOptions): CommandRequest[] {
  const snap = ctrlKey
    ? { point_mm: rawWorld, target_id: undefined }
    : snapPlanPoint(rawWorld, 16, drag.id)
  let point = ['slab-edge', 'slab-slope', 'roof-ridge', 'roof-seam', 'stair-landing', 'stair-first-flight', 'stair-second-flight'].includes(drag.kind) ? rawWorld : snap.point_mm
  const options: Record<string, unknown> = {}

  if (drag.kind === 'beam-endpoint') {
    const target = snap.target_id ? planProject.objects[snap.target_id] : undefined
    if (target && isColumnObject(target)) {
      point = [target.module_data.location_mm[0], target.module_data.location_mm[1]]
      options.targetColumnId = target.id
    }
  } else if (drag.kind === 'opening-edge' && drag.hostStartMm && drag.hostEndMm && drag.openingCenterOffsetMm !== undefined && drag.openingWidthMm !== undefined) {
    const edgeOffset = projectPointToWallOffsetMm(rawWorld, drag.hostStartMm, drag.hostEndMm, 1)
    const hostLength = Math.hypot(drag.hostEndMm[0] - drag.hostStartMm[0], drag.hostEndMm[1] - drag.hostStartMm[1])
    const resize = edgeOffset === undefined ? null : resizeOpeningFromEdge(edgeOffset, drag.endpointIndex === 0 ? 0 : 1, drag.openingCenterOffsetMm, drag.openingWidthMm, hostLength, { snap: !ctrlKey })
    if (!resize) return []
    options.openingResize = resize
    point = rawWorld
  } else if ((drag.kind === 'opening' || drag.kind === 'opening-center') && drag.hostStartMm && drag.hostEndMm && drag.openingWidthMm) {
    const hostLength = Math.hypot(drag.hostEndMm[0] - drag.hostStartMm[0], drag.hostEndMm[1] - drag.hostStartMm[1])
    const rawOffset = projectPointToWallOffsetMm(rawWorld, drag.hostStartMm, drag.hostEndMm, drag.openingWidthMm)
    if (rawOffset === undefined) return []
    let startColumnWidth: number | undefined, endColumnWidth: number | undefined
    for (const column of Object.values(planProject.objects)) {
      if (!isColumnObject(column)) continue
      const [cx, cy] = column.module_data.location_mm
      const width = Math.max(...column.module_data.section_mm)
      if (Math.hypot(cx - drag.hostStartMm[0], cy - drag.hostStartMm[1]) <= width) startColumnWidth = width
      if (Math.hypot(cx - drag.hostEndMm[0], cy - drag.hostEndMm[1]) <= width) endColumnWidth = width
    }
    options.openingOffsetMm = ctrlKey ? Math.round(rawOffset) : snapOpeningOffsetBimAware(rawOffset, hostLength, drag.openingWidthMm, {
      startColumnWidth_mm: startColumnWidth, endColumnWidth_mm: endColumnWidth, minClearance_mm: 100,
    }).offset_along_wall_mm
    point = rawWorld
  } else if (drag.kind === 'pipe-endpoint' && drag.pipeRouteData && drag.endpointIndex !== undefined) {
    const route = drag.pipeRouteData as unknown as PipeRouteModuleData
    const endpointIndex = drag.endpointIndex
    try { drag = { ...drag, pipeRouteData: movePipeRouteEndpoint(route, endpointIndex === 0 ? 'start' : 'end', point) as unknown as Record<string, unknown> } }
    catch {
      const candidate = structuredClone(route)
      candidate.nodes_mm[endpointIndex][0] = point[0]
      candidate.nodes_mm[endpointIndex][1] = point[1]
      drag = { ...drag, pipeRouteData: candidate as unknown as Record<string, unknown> }
    }
  } else if (drag.kind === 'pipe-node' && drag.pipeRouteData && drag.endpointIndex !== undefined) {
    const route = drag.pipeRouteData as unknown as PipeRouteModuleData
    const nodeIndex = drag.endpointIndex
    try { drag = { ...drag, pipeRouteData: movePipeRouteNode(route, nodeIndex, point) as unknown as Record<string, unknown> } }
    catch {
      const candidate = structuredClone(route)
      candidate.nodes_mm[nodeIndex][0] = point[0]
      candidate.nodes_mm[nodeIndex][1] = point[1]
      drag = { ...drag, pipeRouteData: candidate as unknown as Record<string, unknown> }
    }
  } else if (drag.kind === 'cabinet-rotation' && drag.cabinetData) {
    options.cabinetRotationDeg = cabinetRotationFromGrip(drag.cabinetData as unknown as CabinetModuleData, point, viewport.zoom)
  }

  return buildDirectManipulationCommands(planProject, drag, point, options)
}
