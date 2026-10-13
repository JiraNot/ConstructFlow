import { ProjectDocument, isBeamObject, isColumnObject, isDoorObject, isFoundationObject, isGridObject, isWallObject, isWindowObject, type CabinetModuleData, type MouldingModuleData, type PipeRouteModuleData, type StairModuleData } from '@constructflow/project-model'
import { polygonEdgeGrip } from '@constructflow/geometry-kernel'
import { getEditableRoofRidge, getRoofSeams } from '@constructflow/roof-engine'
import { ViewportState, worldToScreen } from '../viewport/viewportTransform.js'
import { cabinetRotationGripPoint, gridLineEndpoints, orientedRectangleCorners, slabSlopeArrow } from './PlanCanvasGeometry.js'

interface FindPlanCanvasEditHandleOptions {
  planProject: ProjectDocument
  editableSelectionIds: readonly string[]
  viewport: ViewportState
  screenPoint: [number, number]
  onFlipDoorHanding?: (doorId: string) => void
}

export function findPlanCanvasEditHandle({ planProject, editableSelectionIds, viewport, screenPoint, onFlipDoorHanding }: FindPlanCanvasEditHandleOptions) {
  const tolerance = 13
  for (const id of editableSelectionIds) {
    const object = planProject.objects[id]
    if (!object) continue
    const data = object.module_data as unknown as Record<string, unknown>
    if (isColumnObject(object)) {
      const center = object.module_data.location_mm, [w, d] = object.module_data.section_mm
      const corners = orientedRectangleCorners([center[0], center[1]], [w, d], object.module_data.rotation_deg)
      for (const [cornerIndex, point] of corners.entries()) {
        const [x, y] = worldToScreen(point as [number, number], viewport)
        if (Math.hypot(screenPoint[0] - x, screenPoint[1] - y) <= tolerance) return { id, kind: 'column-corner' as const, endpointIndex: cornerIndex, centerMm: [center[0], center[1]] as [number, number], sectionMm: [w, d] as [number, number], rotationDeg: object.module_data.rotation_deg }
      }
    } else if (isFoundationObject(object)) {
      const center = object.module_data.center_mm, [w, d] = object.module_data.size_mm
      for (const [cornerIndex, point] of orientedRectangleCorners([center[0], center[1]], [w, d]).entries()) {
        const [x, y] = worldToScreen(point as [number, number], viewport)
        if (Math.hypot(screenPoint[0] - x, screenPoint[1] - y) <= tolerance) return { id, kind: 'foundation-corner' as const, endpointIndex: cornerIndex, centerMm: [center[0], center[1]] as [number, number], sectionMm: [w, d] as [number, number] }
      }
    } else if (isWallObject(object) || isBeamObject(object)) {
      const start = data.start_point_mm as [number, number] | undefined
      const end = data.end_point_mm as [number, number] | undefined
      if (!start || !end) continue
      for (const [endpointIndex, point] of [start, end].entries()) {
        const [x, y] = worldToScreen(point, viewport)
        if (Math.hypot(screenPoint[0] - x, screenPoint[1] - y) <= tolerance) return {
          id, kind: isWallObject(object) ? 'wall-endpoint' as const : 'beam-endpoint' as const,
          endpointIndex: endpointIndex as 0 | 1, startPointMm: [...start] as [number, number], endPointMm: [...end] as [number, number],
        }
      }
    } else if (isGridObject(object) && !object.module_data.system_id) {
      const [start, end] = gridLineEndpoints(object)
      for (const [endpointIndex, point] of [start, end].entries()) {
        const [x, y] = worldToScreen(point, viewport)
        if (Math.hypot(screenPoint[0] - x, screenPoint[1] - y) <= tolerance) return {
          id, kind: 'grid-endpoint' as const, endpointIndex: endpointIndex as 0 | 1,
          startPointMm: [...start] as [number, number], endPointMm: [...end] as [number, number],
        }
      }
    } else if (object.object_type === 'architecture.room_separator') {
      const start = data.start_point_mm as [number, number] | undefined, end = data.end_point_mm as [number, number] | undefined
      if (!start || !end) continue
      for (const [endpointIndex, point] of [start, end].entries()) {
        const [x, y] = worldToScreen(point, viewport)
        if (Math.hypot(screenPoint[0] - x, screenPoint[1] - y) <= tolerance) return {
          id, kind: 'separator-endpoint' as const, endpointIndex: endpointIndex as 0 | 1,
          startPointMm: [...start] as [number, number], endPointMm: [...end] as [number, number],
        }
      }
    } else if (object.object_type === 'drainage.pipe_route' || object.object_type === 'plumbing.pipe_route') {
      const route = object.module_data as unknown as PipeRouteModuleData
      if (route.nodes_mm.length < 2) continue
      for (const endpointIndex of route.nodes_mm.map((_, index) => index)) {
        const isStart = endpointIndex === 0
        const isEnd = endpointIndex === route.nodes_mm.length - 1
        if ((isStart && route.start_node_id) || (isEnd && route.end_node_id)) continue
        const point = route.nodes_mm[endpointIndex]
        const [x, y] = worldToScreen([point[0], point[1]], viewport)
        if (Math.hypot(screenPoint[0] - x, screenPoint[1] - y) <= tolerance) return {
          id, kind: isStart || isEnd ? 'pipe-endpoint' as const : 'pipe-node' as const, endpointIndex,
          pipeRouteData: structuredClone(route),
        }
      }
    } else if (object.object_type === 'architecture.stair') {
      const stair = object.module_data as unknown as StairModuleData
      const [sx, sy] = stair.start_point_mm, angle = Number(stair.rotation_deg ?? 0) * Math.PI / 180
      const side = stair.turn_direction === 'left' && stair.stair_type !== 'straight' ? -1 : 1
      const widthGrip: [number, number] = [sx - Math.sin(angle) * stair.width_mm * side, sy + Math.cos(angle) * stair.width_mm * side]
      const [wx, wy] = worldToScreen(widthGrip, viewport)
      if (Math.hypot(screenPoint[0] - wx, screenPoint[1] - wy) <= tolerance) return { id, kind: 'stair-width' as const, endpointIndex: 0 }
      if (stair.stair_type === 'straight') {
        const run = Math.max(1, stair.num_risers - 1) * stair.tread_depth_mm
        const runGrip: [number, number] = [sx + Math.cos(angle) * run, sy + Math.sin(angle) * run]
        const [rx, ry] = worldToScreen(runGrip, viewport)
        if (Math.hypot(screenPoint[0] - rx, screenPoint[1] - ry) <= tolerance) return { id, kind: 'stair-run' as const, endpointIndex: 0 }
      }
    } else if (object.object_type === 'decorative.moulding_run') {
      const moulding = object.module_data as unknown as MouldingModuleData
      if (moulding.closed || moulding.path_mm.length < 2) continue
      for (const endpointIndex of [0, moulding.path_mm.length - 1]) {
        const point = moulding.path_mm[endpointIndex]
        const [x, y] = worldToScreen([point[0], point[1]], viewport)
        if (Math.hypot(screenPoint[0] - x, screenPoint[1] - y) <= tolerance) return {
          id, kind: 'moulding-endpoint' as const, endpointIndex,
          mouldingData: structuredClone(moulding),
        }
      }
    } else if (object.object_type === 'interior.cabinet_run') {
      const cabinet = object.module_data as unknown as CabinetModuleData
      const [x, y] = worldToScreen(cabinetRotationGripPoint(cabinet, viewport.zoom), viewport)
      if (Math.hypot(screenPoint[0] - x, screenPoint[1] - y) <= tolerance) return {
        id, kind: 'cabinet-rotation' as const,
        cabinetData: structuredClone(cabinet),
      }
    } else if (isDoorObject(object) || isWindowObject(object)) {
      const host = planProject.objects[object.module_data.wall_id]
      if (!host || !isWallObject(host)) continue
      const [sx, sy] = host.module_data.start_point_mm, [ex, ey] = host.module_data.end_point_mm
      const length = Math.hypot(ex - sx, ey - sy)
      if (length < 1) continue
      const ux = (ex - sx) / length, uy = (ey - sy) / length
      const halfWidth = object.module_data.width_mm / 2
      const cx = sx + ux * object.module_data.offset_along_wall_mm
      const cy = sy + uy * object.module_data.offset_along_wall_mm

      // Door Flip Handing Button hit test
      if (isDoorObject(object) && onFlipDoorHanding) {
        const nx = -uy, ny = ux
        const handing = object.module_data.handing || 'left_in'
        const swingSign = handing.endsWith('_out') ? -1 : 1
        const flipBtnX = cx - nx * (host.module_data.thickness_mm / 2 + 180) * swingSign
        const flipBtnY = cy - ny * (host.module_data.thickness_mm / 2 + 180) * swingSign
        const [sfx, sfy] = worldToScreen([flipBtnX, flipBtnY], viewport)
        if (Math.hypot(screenPoint[0] - sfx, screenPoint[1] - sfy) <= 18) {
          onFlipDoorHanding(object.id)
          return null
        }
      }

      // Center Move Handle hit test
      const [scx, scy] = worldToScreen([cx, cy], viewport)
      if (Math.hypot(screenPoint[0] - scx, screenPoint[1] - scy) <= tolerance) {
        return {
          id, kind: 'opening-center' as const,
          hostStartMm: [sx, sy] as [number, number], hostEndMm: [ex, ey] as [number, number],
          openingWidthMm: object.module_data.width_mm, openingCenterOffsetMm: object.module_data.offset_along_wall_mm,
        }
      }

      // Edge Resize Handles hit test
      for (const [endpointIndex, offset] of [[0, object.module_data.offset_along_wall_mm - halfWidth], [1, object.module_data.offset_along_wall_mm + halfWidth]] as const) {
        const [x, y] = worldToScreen([sx + ux * offset, sy + uy * offset], viewport)
        if (Math.hypot(screenPoint[0] - x, screenPoint[1] - y) <= tolerance) return {
          id, kind: 'opening-edge' as const, endpointIndex,
          hostStartMm: [sx, sy] as [number, number], hostEndMm: [ex, ey] as [number, number],
          openingWidthMm: object.module_data.width_mm, openingCenterOffsetMm: object.module_data.offset_along_wall_mm,
        }
      }
    } else if (['structure.slab', 'architecture.floor', 'architecture.ceiling', 'roof.system'].includes(object.object_type)) {
      const boundary = data.boundary_mm as [number, number][] | undefined
      if (!boundary || boundary.length < 3) continue
      for (const [vertexIndex, point] of boundary.entries()) {
        const [x, y] = worldToScreen(point, viewport)
        if (Math.hypot(screenPoint[0] - x, screenPoint[1] - y) <= tolerance) return {
          id, kind: 'polygon-vertex' as const, endpointIndex: vertexIndex,
          boundaryPointsMm: structuredClone(boundary),
        }
      }
      if (object.object_type === 'structure.slab') {
        for (const edgeIndex of boundary.map((_, index) => index)) {
          const grip = polygonEdgeGrip(boundary, edgeIndex)
          if (!grip) continue
          const [x, y] = worldToScreen(grip.midpoint_mm, viewport)
          if (Math.hypot(screenPoint[0] - x, screenPoint[1] - y) <= tolerance) return {
            id, kind: 'slab-edge' as const, endpointIndex: edgeIndex,
            boundaryPointsMm: structuredClone(boundary), edgeStartMm: grip.midpoint_mm,
            edgeNormalMm: grip.inward_normal,
          }
        }
        const arrow = slabSlopeArrow(boundary, Number(data.slope_ratio ?? 0), Number(data.drain_direction_deg ?? 0), viewport.zoom)
        if (arrow) {
          const [x, y] = worldToScreen(arrow.end_mm, viewport)
          if (Math.hypot(screenPoint[0] - x, screenPoint[1] - y) <= tolerance) return {
            id, kind: 'slab-slope' as const, edgeStartMm: arrow.start_mm,
          }
        }
      } else if (object.object_type === 'roof.system') {
        const roofData = data as unknown as import('@constructflow/project-model').RoofModuleData
        const editableRidge = getEditableRoofRidge(roofData)
        for (const seam of getRoofSeams(roofData)) {
          const [x, y] = worldToScreen(seam.grip_mm, viewport)
          if (Math.hypot(screenPoint[0] - x, screenPoint[1] - y) > tolerance) continue
          const isEditableRidge = editableRidge && seam.edge_indices[0] === Math.min(...editableRidge.edge_indices) && seam.edge_indices[1] === Math.max(...editableRidge.edge_indices)
          return {
            id,
            kind: isEditableRidge ? 'roof-ridge' as const : 'roof-seam' as const,
            roofSeamEdgeIndices: seam.edge_indices,
            roofSeamGripMm: seam.grip_mm,
          }
        }
      }
    }
  }
  return null
}
