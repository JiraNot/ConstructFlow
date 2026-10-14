import {
  type DisplayLengthUnit,
  type ProjectDocument,
  type PipeRouteModuleData,
  type CabinetModuleData,
  type MouldingModuleData,
  type StairModuleData,
  isColumnObject,
  isFoundationObject,
  isGridObject,
  isBeamObject,
  isWallObject,
  isDoorObject,
  isWindowObject,
} from '@constructflow/project-model'
import { polygonEdgeGrip } from '@constructflow/geometry-kernel'
import { getRoofSeams } from '@constructflow/roof-engine'
import { cabinetRotationGripPoint, gridLineEndpoints, orientedRectangleCorners, slabSlopeArrow } from './PlanCanvasGeometry.js'
import { drawOpeningInspectionDimensions } from './drawPlanCanvasOpeningInspectionDimensions.js'
import { worldToScreen, type ViewportState } from '../viewport/viewportTransform.js'

interface SelectionManipulationPreview {
  project: ProjectDocument
  ids: string[]
  valid: boolean
}

export function drawPlanCanvasSelectionHandles(
  ctx: CanvasRenderingContext2D,
  editableSelectionIds: string[],
  planProject: ProjectDocument,
  viewport: ViewportState,
  displayUnit: DisplayLengthUnit,
  manipulationPreview: SelectionManipulationPreview | null,
) {
  const activeTool = 'select'
    if (activeTool === 'select') {
      ctx.save()
      for (const id of editableSelectionIds) {
        const object = planProject.objects[id]
        if (!object) continue
        const data = object.module_data as unknown as Record<string, unknown>
        const points: Array<[number, number, 'linear' | 'opening' | 'opening-center' | 'cabinet-rotation' | 'stair-width' | 'stair-run' | 'slab-edge' | 'slab-slope' | 'pipe-node']> = []
        let slabArrow: ReturnType<typeof slabSlopeArrow> = null
        let roofSeams: ReturnType<typeof getRoofSeams> = []
        if (isColumnObject(object)) {
          const [cx, cy] = object.module_data.location_mm, [w, d] = object.module_data.section_mm
          for (const [x, y] of orientedRectangleCorners([cx, cy], [w, d], object.module_data.rotation_deg)) points.push([x, y, 'linear'])
        } else if (isFoundationObject(object)) {
          const [cx, cy] = object.module_data.center_mm, [w, d] = object.module_data.size_mm
          for (const [x, y] of orientedRectangleCorners([cx, cy], [w, d])) points.push([x, y, 'linear'])
        } else if (isWallObject(object) || isBeamObject(object)) {
          const start = data.start_point_mm as [number, number] | undefined, end = data.end_point_mm as [number, number] | undefined
          if (start && end) { points.push([start[0], start[1], 'linear'], [end[0], end[1], 'linear']) }
        } else if (isGridObject(object) && !object.module_data.system_id) {
          const [start, end] = gridLineEndpoints(object)
          points.push([start[0], start[1], 'linear'], [end[0], end[1], 'linear'])
        } else if (object.object_type === 'architecture.room_separator') {
          const start = data.start_point_mm as [number, number], end = data.end_point_mm as [number, number]
          points.push([start[0], start[1], 'linear'], [end[0], end[1], 'linear'])
        } else if (object.object_type === 'drainage.pipe_route' || object.object_type === 'plumbing.pipe_route') {
          const route = object.module_data as unknown as PipeRouteModuleData
          if (route.nodes_mm.length >= 2) {
            if (!route.start_node_id) points.push([route.nodes_mm[0][0], route.nodes_mm[0][1], 'linear'])
            const last = route.nodes_mm.length - 1
            for (let nodeIndex = 1; nodeIndex < last; nodeIndex++)
              points.push([route.nodes_mm[nodeIndex][0], route.nodes_mm[nodeIndex][1], 'pipe-node'])
            if (!route.end_node_id) points.push([route.nodes_mm[last][0], route.nodes_mm[last][1], 'linear'])
          }
        } else if (object.object_type === 'decorative.moulding_run') {
          const moulding = object.module_data as unknown as MouldingModuleData
          if (!moulding.closed && moulding.path_mm.length >= 2) {
            const first = moulding.path_mm[0], last = moulding.path_mm[moulding.path_mm.length - 1]
            points.push([first[0], first[1], 'linear'], [last[0], last[1], 'linear'])
          }
        } else if (object.object_type === 'interior.cabinet_run') {
          const cabinet = object.module_data as unknown as CabinetModuleData
          const angle = cabinet.rotation_deg * Math.PI / 180
          const frontCenter: [number, number] = [
            cabinet.location_mm[0] + cabinet.width_mm / 2 * Math.cos(angle) + cabinet.board_mm * Math.sin(angle),
            cabinet.location_mm[1] + cabinet.width_mm / 2 * Math.sin(angle) - cabinet.board_mm * Math.cos(angle),
          ]
          const grip = cabinetRotationGripPoint(cabinet, viewport.zoom)
          const [fx, fy] = worldToScreen(frontCenter, viewport)
          const [gx, gy] = worldToScreen(grip, viewport)
          ctx.save()
          ctx.strokeStyle = '#8b5cf6'
          ctx.lineWidth = 1.25
          ctx.setLineDash([3, 2])
          ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(gx, gy); ctx.stroke()
          ctx.restore()
          points.push([grip[0], grip[1], 'cabinet-rotation'])
        } else if (isDoorObject(object) || isWindowObject(object)) {
          const host = planProject.objects[object.module_data.wall_id]
          if (host && isWallObject(host)) {
            const [sx, sy] = host.module_data.start_point_mm, [ex, ey] = host.module_data.end_point_mm
            const length = Math.hypot(ex - sx, ey - sy)
            if (length > 1) {
              const ux = (ex - sx) / length, uy = (ey - sy) / length, halfWidth = object.module_data.width_mm / 2
              const cx = sx + ux * object.module_data.offset_along_wall_mm
              const cy = sy + uy * object.module_data.offset_along_wall_mm
              points.push(
                [sx + ux * (object.module_data.offset_along_wall_mm - halfWidth), sy + uy * (object.module_data.offset_along_wall_mm - halfWidth), 'opening'],
                [sx + ux * (object.module_data.offset_along_wall_mm + halfWidth), sy + uy * (object.module_data.offset_along_wall_mm + halfWidth), 'opening'],
                [cx, cy, 'opening-center']
              )

              // Draw full architectural dimensioning and clearance verification
              drawOpeningInspectionDimensions(ctx, object, host, planProject, viewport, displayUnit)

              // Draw Flip Handing Icon Button for doors on opposite wall face
              if (isDoorObject(object)) {
                const nx = -uy, ny = ux
                const handing = object.module_data.handing || 'left_in'
                const swingSign = handing.endsWith('_out') ? -1 : 1
                const flipBtnX = cx - nx * (host.module_data.thickness_mm / 2 + 180) * swingSign
                const flipBtnY = cy - ny * (host.module_data.thickness_mm / 2 + 180) * swingSign
                const [sfx, sfy] = worldToScreen([flipBtnX, flipBtnY], viewport)
                ctx.save()
                ctx.fillStyle = '#ffffff'
                ctx.strokeStyle = '#16a34a'
                ctx.lineWidth = 2
                ctx.beginPath(); ctx.arc(sfx, sfy, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
                ctx.fillStyle = '#16a34a'
                ctx.font = 'bold 13px sans-serif'
                ctx.textAlign = 'center'
                ctx.textBaseline = 'middle'
                ctx.fillText('⇄', sfx, sfy)
                ctx.restore()
              }
            }
          }
        } else if (object.object_type === 'architecture.stair') {
          const stair = object.module_data as unknown as StairModuleData
          const [sx, sy] = stair.start_point_mm, angle = Number(stair.rotation_deg ?? 0) * Math.PI / 180
          const side = stair.turn_direction === 'left' && stair.stair_type !== 'straight' ? -1 : 1
          points.push([sx - Math.sin(angle) * stair.width_mm * side, sy + Math.cos(angle) * stair.width_mm * side, 'stair-width'])
          if (stair.stair_type === 'straight') {
            const run = Math.max(1, stair.num_risers - 1) * stair.tread_depth_mm
            points.push([sx + Math.cos(angle) * run, sy + Math.sin(angle) * run, 'stair-run'])
          }
        } else if (['structure.slab', 'architecture.floor', 'architecture.ceiling', 'roof.system'].includes(object.object_type)) {
          const boundary = data.boundary_mm as [number, number][] | undefined
          boundary?.forEach(point => points.push([point[0], point[1], 'linear']))
          if (object.object_type === 'structure.slab' && boundary) {
            for (const edgeIndex of boundary.map((_, index) => index)) {
              const grip = polygonEdgeGrip(boundary, edgeIndex)
              if (grip) points.push([grip.midpoint_mm[0], grip.midpoint_mm[1], 'slab-edge'])
            }
            const displayObject = manipulationPreview?.ids.includes(id) ? manipulationPreview.project.objects[id] : object
            const displayData = displayObject?.module_data as unknown as Record<string, unknown> | undefined
            const displayBoundary = displayData?.boundary_mm as [number, number][] | undefined
            if (displayData && displayBoundary) slabArrow = slabSlopeArrow(displayBoundary, Number(displayData.slope_ratio ?? 0), Number(displayData.drain_direction_deg ?? 0), viewport.zoom)
            if (slabArrow) points.push([slabArrow.end_mm[0], slabArrow.end_mm[1], 'slab-slope'])
          } else if (object.object_type === 'roof.system') {
            const displayObject = manipulationPreview?.ids.includes(id) ? manipulationPreview.project.objects[id] : object
            if (displayObject) roofSeams = getRoofSeams(displayObject.module_data as unknown as import('@constructflow/project-model').RoofModuleData)
          }
        }
        if (slabArrow) {
          const [ax, ay] = worldToScreen(slabArrow.start_mm, viewport), [bx, by] = worldToScreen(slabArrow.end_mm, viewport)
          const color = manipulationPreview?.ids.includes(id) ? (manipulationPreview.valid ? '#0284c7' : '#dc2626') : '#0f766e'
          const angle = Math.atan2(by - ay, bx - ax), head = 7
          ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.8
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - head * Math.cos(angle - Math.PI / 6), by - head * Math.sin(angle - Math.PI / 6)); ctx.lineTo(bx - head * Math.cos(angle + Math.PI / 6), by - head * Math.sin(angle + Math.PI / 6)); ctx.closePath(); ctx.fill()
          ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
          const labelX = (ax + bx) / 2, labelY = (ay + by) / 2 - 4, labelWidth = ctx.measureText(slabArrow.label).width + 7
          ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fillRect(labelX - labelWidth / 2, labelY - 12, labelWidth, 14)
          ctx.fillStyle = color; ctx.fillText(slabArrow.label, labelX, labelY - 1); ctx.restore()
        }
        if (roofSeams.length) {
          const previewColor = manipulationPreview?.ids.includes(id) ? (manipulationPreview.valid ? '#0284c7' : '#dc2626') : null
          for (const seam of roofSeams) {
            const [sx, sy] = worldToScreen(seam.start_mm, viewport), [ex, ey] = worldToScreen(seam.end_mm, viewport)
            const [gx, gy] = worldToScreen(seam.grip_mm, viewport)
            const color = previewColor ?? (seam.kind === 'valley' ? '#ea580c' : seam.kind === 'hip' ? '#2563eb' : '#0284c7')
            ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = '#ffffff'; ctx.lineWidth = seam.kind === 'ridge' ? 2 : 1.6
            ctx.setLineDash(seam.kind === 'ridge' ? [6, 3] : seam.kind === 'valley' ? [2, 3] : [4, 3])
            ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([])
            const label = seam.kind === 'ridge' ? 'สัน' : seam.kind === 'valley' ? 'ร่อง' : 'ตะเข้สัน'
            ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
            const labelWidth = ctx.measureText(label).width + 6
            ctx.fillStyle = 'rgba(255,255,255,.94)'; ctx.fillRect(gx - labelWidth / 2, gy - 22, labelWidth, 13)
            ctx.fillStyle = color; ctx.fillText(label, gx, gy - 15.5)
            if (seam.kind === 'valley') {
              ctx.beginPath(); ctx.moveTo(gx, gy - 6); ctx.lineTo(gx + 6, gy); ctx.lineTo(gx, gy + 6); ctx.lineTo(gx - 6, gy); ctx.closePath(); ctx.fill(); ctx.stroke()
            } else {
              ctx.fillRect(gx - 5, gy - 5, 10, 10); ctx.strokeRect(gx - 5, gy - 5, 10, 10)
            }
            ctx.restore()
          }
        }
        for (const [x, y, kind] of points) {
          const [sx, sy] = worldToScreen([x, y], viewport)
          if (kind === 'opening-center') {
            ctx.fillStyle = '#ea580c'
            ctx.strokeStyle = '#ffffff'
            ctx.lineWidth = 2
            ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
            ctx.fillStyle = '#ffffff'
            ctx.beginPath(); ctx.arc(sx, sy, 2.5, 0, Math.PI * 2); ctx.fill()
          } else if (kind === 'cabinet-rotation') {
            ctx.fillStyle = '#7c3aed'
            ctx.strokeStyle = '#ffffff'
            ctx.lineWidth = 2
            ctx.beginPath(); ctx.arc(sx, sy, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
            ctx.fillStyle = '#ffffff'
            ctx.font = 'bold 12px sans-serif'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText('↻', sx, sy)
          } else if (kind === 'stair-width' || kind === 'stair-run') {
            ctx.fillStyle = kind === 'stair-width' ? '#0d9488' : '#7c3aed'
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2
            ctx.beginPath(); ctx.arc(sx, sy, 7.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
            ctx.fillStyle = '#ffffff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
            ctx.fillText(kind === 'stair-width' ? 'W' : 'R', sx, sy)
          } else if (kind === 'slab-edge') {
            ctx.fillStyle = '#ecfeff'; ctx.strokeStyle = '#0891b2'; ctx.lineWidth = 1.6
            ctx.fillRect(sx - 4.5, sy - 4.5, 9, 9); ctx.strokeRect(sx - 4.5, sy - 4.5, 9, 9)
          } else if (kind === 'slab-slope') {
            ctx.fillStyle = '#ffffff'; ctx.strokeStyle = manipulationPreview?.valid === false ? '#dc2626' : '#0f766e'; ctx.lineWidth = 2
            ctx.beginPath(); ctx.arc(sx, sy, 6.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
            ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(sx, sy, 2, 0, Math.PI * 2); ctx.fill()
          } else if (kind === 'pipe-node') {
            ctx.fillStyle = manipulationPreview?.valid === false ? '#fee2e2' : '#ecfeff'
            ctx.strokeStyle = manipulationPreview?.valid === false ? '#dc2626' : '#0891b2'
            ctx.lineWidth = 1.7
            ctx.beginPath(); ctx.moveTo(sx, sy - 6); ctx.lineTo(sx + 6, sy); ctx.lineTo(sx, sy + 6); ctx.lineTo(sx - 6, sy); ctx.closePath(); ctx.fill(); ctx.stroke()
          } else {
            ctx.fillStyle = kind === 'opening' ? '#fff7ed' : '#ffffff'
            ctx.strokeStyle = kind === 'opening' ? '#f97316' : '#087cf0'
            ctx.lineWidth = 2
            ctx.beginPath(); ctx.arc(sx, sy, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
          }
        }
      }
      ctx.restore()
    }
}
