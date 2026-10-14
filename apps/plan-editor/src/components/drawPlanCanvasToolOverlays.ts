import type { ProjectDocument } from '@constructflow/project-model'
import { isGridObject } from '@constructflow/project-model'
import type { DisplayLengthUnit } from '@constructflow/project-model'
import type { SnapResult, WallHostSnapResult } from '@constructflow/snapping-engine'
import type { ToolType } from './Toolbar.js'
import type { ViewportState } from '../viewport/viewportTransform.js'
import { worldToScreen } from '../viewport/viewportTransform.js'
import { gridLineEndpoints } from './PlanCanvasGeometry.js'
import { drawTapeMeasure, drawTemporaryDimensions, openingDimensionPoint, openingDimensionRefs } from './PlanCanvasTemporaryDimensions.js'
import { usesPlacementDimensions } from '../app/toolInteractionRegistry.mjs'

interface PlanCanvasToolOverlayOptions {
  ctx: CanvasRenderingContext2D
  activeTool: ToolType
  gridStartPoint: [number, number] | null
  activeSnap: SnapResult | null
  planProject: ProjectDocument
  viewport: ViewportState
  gridCopySourceId: string | null
  tapeMeasure: { start: [number, number]; end: [number, number]; complete: boolean } | null
  displayUnit: DisplayLengthUnit
  activeWallSnap: WallHostSnapResult | null
  project: ProjectDocument
  activeDoorTypeMark: string
  activeWindowTypeMark: string
  dimensionReferenceMode: 'center' | 'edge'
  selectionBox: { start: [number, number]; end: [number, number] } | null
  roomSeparatorStart: [number, number] | null
  pipeSystem: 'waste' | 'soil' | 'rainwater' | 'vent' | 'cold_water' | 'hot_water'
  fixtureKind: 'light' | 'switch' | 'outlet' | 'panel'
  slabBoundary: [number, number][]
}

export function drawPlanCanvasToolOverlays({
  ctx, activeTool, gridStartPoint, activeSnap, planProject, viewport, gridCopySourceId, tapeMeasure,
  displayUnit, activeWallSnap, project, activeDoorTypeMark, activeWindowTypeMark, dimensionReferenceMode,
  selectionBox, roomSeparatorStart, pipeSystem, fixtureKind, slabBoundary,
}: PlanCanvasToolOverlayOptions) {
    if (activeTool === 'grid' && gridStartPoint && activeSnap) {
      const [x1, y1] = worldToScreen(gridStartPoint, viewport)
      const [x2, y2] = worldToScreen(activeSnap.point_mm, viewport)
      ctx.save(); ctx.strokeStyle = '#0284c7'; ctx.lineWidth = 1.5; ctx.setLineDash([7, 4])
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
      ctx.setLineDash([]); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0284c7'
      for (const [x, y] of [[x1, y1], [x2, y2]]) { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke() }
      ctx.restore()
    }
    if (activeTool === 'gridCopy' && gridCopySourceId && activeSnap) {
      const source = planProject.objects[gridCopySourceId]
      if (source && isGridObject(source)) {
        const [start, end] = gridLineEndpoints(source)
      const dest = activeSnap.point_mm
        const a = worldToScreen(dest, viewport), b = worldToScreen([end[0] + dest[0] - start[0], end[1] + dest[1] - start[1]], viewport)
        ctx.save(); ctx.strokeStyle = '#0284c7'; ctx.lineWidth = 1.5; ctx.setLineDash([7, 4]); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); ctx.restore()
      }
    }
    if (activeTool === 'measure' && tapeMeasure) drawTapeMeasure(ctx, tapeMeasure.start, tapeMeasure.end, viewport, tapeMeasure.complete, displayUnit)
    if (activeSnap && usesPlacementDimensions(activeTool)) {
      const openingAxis = activeWallSnap
        ? Math.abs(activeWallSnap.wall_end_mm[0] - activeWallSnap.wall_start_mm[0]) >= Math.abs(activeWallSnap.wall_end_mm[1] - activeWallSnap.wall_start_mm[1]) ? 'x' : 'y'
        : undefined
      const openingRefs = activeWallSnap ? openingDimensionRefs(activeSnap.point_mm, planProject, activeWallSnap, dimensionReferenceMode) : undefined
      const openingWidth = activeTool === 'door' || activeTool === 'window'
        ? Number(project.types.find(type => type.object_type === (activeTool === 'door' ? 'door_window.door' : 'door_window.window') && type.name.toLowerCase() === (activeTool === 'door' ? activeDoorTypeMark : activeWindowTypeMark).toLowerCase())?.parameters?.width_mm ?? (activeTool === 'door' ? 800 : 1200))
        : 0
      const dimensionPoint = openingRefs && activeWallSnap ? openingDimensionPoint(activeWallSnap, openingRefs, openingWidth) : activeSnap.point_mm
      const copySource = activeTool === 'gridCopy' && gridCopySourceId ? planProject.objects[gridCopySourceId] : undefined
      const copyStart = copySource && isGridObject(copySource) ? gridLineEndpoints(copySource)[0] : undefined
      drawTemporaryDimensions(ctx, dimensionPoint, planProject, viewport, activeWallSnap?.wall_id, openingAxis, copyStart ? { refX: copyStart[0], refY: copyStart[1] } : openingRefs, dimensionReferenceMode, displayUnit)
    }
    if (selectionBox) {
      const left = Math.min(selectionBox.start[0], selectionBox.end[0]), top = Math.min(selectionBox.start[1], selectionBox.end[1])
      ctx.save(); ctx.strokeStyle = '#087cf0'; ctx.fillStyle = 'rgba(8,124,240,0.1)'; ctx.lineWidth = 1; ctx.setLineDash([5, 3])
      ctx.fillRect(left, top, Math.abs(selectionBox.end[0] - selectionBox.start[0]), Math.abs(selectionBox.end[1] - selectionBox.start[1]))
      ctx.strokeRect(left, top, Math.abs(selectionBox.end[0] - selectionBox.start[0]), Math.abs(selectionBox.end[1] - selectionBox.start[1])); ctx.restore()
    }
    if (['roomSeparator', 'pipe', 'cabinet', 'moulding'].includes(activeTool) && roomSeparatorStart && activeSnap) {
      const start = worldToScreen(roomSeparatorStart, viewport), end = worldToScreen(activeSnap.point_mm, viewport)
      const color = activeTool === 'pipe' ? (['cold_water', 'hot_water'].includes(pipeSystem) ? '#0284c7' : pipeSystem === 'rainwater' ? '#0891b2' : '#7c3aed') : activeTool === 'cabinet' ? '#92400e' : activeTool === 'moulding' ? '#a21caf' : '#d97706'
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = activeTool === 'cabinet' ? 2 : 1.8; ctx.setLineDash(activeTool === 'roomSeparator' ? [5, 3] : [7, 3]); ctx.beginPath(); ctx.moveTo(...start); ctx.lineTo(...end); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#fff'; ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(...start, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore()
    }
    if (activeTool === 'fixture' && activeSnap) {
      const [x, y] = worldToScreen(activeSnap.point_mm, viewport)
      ctx.save(); ctx.strokeStyle = '#7c3aed'; ctx.fillStyle = 'rgba(124, 58, 237, .12)'; ctx.lineWidth = 1.5; ctx.beginPath()
      if (fixtureKind === 'panel') ctx.rect(x - 7, y - 9, 14, 18)
      else { ctx.arc(x, y, fixtureKind === 'light' ? 7 : 6, 0, Math.PI * 2); if (fixtureKind === 'switch') { ctx.moveTo(x - 4, y + 4); ctx.lineTo(x + 4, y - 4) } else if (fixtureKind === 'outlet') { ctx.moveTo(x - 2, y - 2); ctx.lineTo(x - 2, y + 2); ctx.moveTo(x + 2, y - 2); ctx.lineTo(x + 2, y + 2) } }
      ctx.fill(); ctx.stroke(); ctx.restore()
    }
    if ((activeTool === 'slab' || activeTool === 'slabVoid' || activeTool === 'archFloor' || activeTool === 'ceiling' || activeTool === 'roof') && slabBoundary.length > 0) {
      ctx.save()
      ctx.strokeStyle = activeTool === 'slabVoid' ? '#dc2626' : activeTool === 'ceiling' ? '#7c3aed' : activeTool === 'archFloor' ? '#059669' : activeTool === 'roof' ? '#d97706' : '#0284c7'
      ctx.fillStyle = activeTool === 'slabVoid' ? 'rgba(239, 68, 68, 0.12)' : activeTool === 'ceiling' ? 'rgba(124, 58, 237, 0.12)' : activeTool === 'archFloor' ? 'rgba(5, 150, 105, 0.12)' : activeTool === 'roof' ? 'rgba(217, 119, 6, 0.12)' : 'rgba(14, 165, 233, 0.12)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      slabBoundary.forEach((point, index) => {
        const [x, y] = worldToScreen(point, viewport)
        if (index === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      if (activeSnap) {
        const [x, y] = worldToScreen(activeSnap.point_mm, viewport)
        ctx.lineTo(x, y)
        if (slabBoundary.length >= 2) { ctx.closePath(); ctx.fill() }
      }
      ctx.stroke()
      const [sx, sy] = worldToScreen(slabBoundary[0], viewport)
      ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke()
      ctx.restore()
    }
}
