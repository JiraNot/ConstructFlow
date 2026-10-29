import { drawFamilyObject } from '../rendering/familyRenderer.js'
import type { InteriorFurnitureKind, ProjectDocument } from '@constructflow/project-model'
import { formatLengthMm, isGridObject, resolveFamilyParameters } from '@constructflow/project-model'
import { availableFamilies } from '@constructflow/family-engine'
import type { DisplayLengthUnit } from '@constructflow/project-model'
import type { SnapResult, WallHostSnapResult } from '@constructflow/snapping-engine'
import type { ToolType } from './Toolbar.js'
import type { ViewportState } from '../viewport/viewportTransform.js'
import { worldToScreen } from '../viewport/viewportTransform.js'
import { gridLineEndpoints } from './PlanCanvasGeometry.js'
import { angleAtVertexDegrees, polygonArea2D } from '@constructflow/geometry-kernel'
import type { MeasureMode, PlanSketchMode } from './planCanvasInteractionTypes.js'
import type { PlanCanvasPreferences } from '../app/planCanvasPreferences.mjs'
import { drawOpeningNearbyDimensions, drawTapeMeasure, drawTemporaryDimensions } from './PlanCanvasTemporaryDimensions.js'
import { usesPlacementDimensions } from '../app/toolInteractionRegistry.mjs'

interface PlanCanvasToolOverlayOptions {
  ctx: CanvasRenderingContext2D
  activeFamilyId?: string
  activeFamilyTypeId?: string
  activeTool: ToolType
  supplierBundleVisualType?: 'shape' | 'length' | 'area'
  bundleStartPoint?: [number, number] | null
  gridStartPoint: [number, number] | null
  activeSnap: SnapResult | null
  wallStartNode?: { point_mm: [number, number] } | null
  beamStartNode?: { point_mm: [number, number] } | null
  lineDrawingMode?: PlanCanvasPreferences['lineDrawingMode']
  planProject: ProjectDocument
  viewport: ViewportState
  gridCopySourceId: string | null
  tapeMeasure: { start: [number, number]; end: [number, number]; complete: boolean } | null
  measureMode?: MeasureMode
  measurePoints?: [number, number][]
  measureComplete?: boolean
  displayUnit: DisplayLengthUnit
  showRealtimeDimensions?: boolean
  lengthPrecision?: number
  anglePrecision?: number
  activeWallSnap: WallHostSnapResult | null
  project: ProjectDocument
  activeDoorTypeMark: string
  activeWindowTypeMark: string
  dimensionReferenceMode: 'center' | 'edge'
  selectionBox: { start: [number, number]; end: [number, number] } | null
  roomSeparatorStart: [number, number] | null
  pipeSystem: 'waste' | 'soil' | 'rainwater' | 'vent' | 'cold_water' | 'hot_water'
  fixtureKind: 'light' | 'switch' | 'outlet' | 'panel'
  furnitureKind: InteriorFurnitureKind
  slabBoundary: [number, number][]
  sketchMode?: PlanSketchMode
  sketchPoints?: [number, number][]
}

export function drawPlanCanvasToolOverlays({
  ctx, activeTool, supplierBundleVisualType, bundleStartPoint, activeFamilyId, activeFamilyTypeId, gridStartPoint, activeSnap, wallStartNode, beamStartNode,
  lineDrawingMode = 'orthogonal', planProject, viewport, gridCopySourceId, tapeMeasure,
  measureMode = 'distance', measurePoints = [], measureComplete = false,
  displayUnit, activeWallSnap, project, activeDoorTypeMark, activeWindowTypeMark, dimensionReferenceMode, showRealtimeDimensions = true, lengthPrecision = 3, anglePrecision = 0,
  selectionBox, roomSeparatorStart, pipeSystem, fixtureKind, furnitureKind, slabBoundary, sketchMode = 'polyline', sketchPoints = [],
}: PlanCanvasToolOverlayOptions) {
    const lineStart = activeTool === 'wall' ? wallStartNode?.point_mm : activeTool === 'beam' ? beamStartNode?.point_mm : undefined
    if (lineStart && activeSnap) {
      const start = worldToScreen(lineStart, viewport), end = worldToScreen(activeSnap.point_mm, viewport)
      const dx = end[0] - start[0], dy = end[1] - start[1]
      const length = Math.hypot(dx, dy)
      if (length >= 14) {
        const ux = dx / length, uy = dy / length, nx = -uy, ny = ux
        const screenAngle = (Math.atan2(-dy, dx) * 180 / Math.PI + 360) % 360
        const angleText = `${screenAngle.toFixed(lineDrawingMode === 'orthogonal' ? 0 : Math.max(0, Math.min(2, anglePrecision)))}°`
        ctx.save()
        ctx.strokeStyle = 'rgba(2,132,199,.68)'
        ctx.fillStyle = '#fff'
        ctx.lineWidth = 1.25
        ctx.setLineDash([5, 4])
        ctx.beginPath()
        ctx.moveTo(start[0] - ux * 18, start[1] - uy * 18)
        ctx.lineTo(end[0] + ux * 22, end[1] + uy * 22)
        ctx.moveTo(end[0] - nx * 5, end[1] - ny * 5)
        ctx.lineTo(end[0] + nx * 5, end[1] + ny * 5)
        ctx.stroke()
        ctx.setLineDash([])
        for (const point of [start, end]) {
          ctx.beginPath(); ctx.arc(point[0], point[1], 3.25, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
        }
        ctx.font = '600 10px system-ui, sans-serif'
        const labelWidth = ctx.measureText(angleText).width + 10
        const labelX = (start[0] + end[0]) / 2 + nx * 14
        const labelY = (start[1] + end[1]) / 2 + ny * 14
        ctx.beginPath(); ctx.roundRect(labelX - labelWidth / 2, labelY - 9, labelWidth, 18, 5)
        ctx.fillStyle = 'rgba(255,255,255,.96)'; ctx.strokeStyle = '#7dd3fc'; ctx.fill(); ctx.stroke()
        ctx.fillStyle = '#075985'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(angleText, labelX, labelY)
        ctx.restore()
      }
    }
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
    if (activeTool === 'draw' && sketchPoints.length) {
      let points = sketchPoints
      let closed = false
      if (sketchMode === 'rectangle' && activeSnap) {
        const [x0, y0] = sketchPoints[0]!
        const [x1, y1] = activeSnap.point_mm
        points = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
        closed = true
      } else if (activeSnap && sketchMode !== 'freehand') points = [...sketchPoints, activeSnap.point_mm]
      ctx.save()
      ctx.strokeStyle = '#0284c7'
      ctx.fillStyle = 'rgba(2,132,199,.07)'
      ctx.lineWidth = 1.8
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      points.forEach((point, index) => {
        const screen = worldToScreen(point, viewport)
        if (index === 0) ctx.moveTo(...screen)
        else ctx.lineTo(...screen)
      })
      if (closed) ctx.closePath()
      ctx.stroke()
      if (closed) ctx.fill()
      ctx.setLineDash([])
      sketchPoints.forEach(point => {
        const screen = worldToScreen(point, viewport)
        ctx.beginPath(); ctx.arc(...screen, 3, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke()
      })
      ctx.restore()
    }
    if (activeTool === 'measure' && measureMode === 'distance' && tapeMeasure) drawTapeMeasure(ctx, tapeMeasure.start, tapeMeasure.end, viewport, tapeMeasure.complete, displayUnit, lengthPrecision)
    if ((activeTool === 'measure' || activeTool === 'fill') && measureMode !== 'distance') drawMeasurementDraft(ctx, measureMode, measurePoints, activeSnap?.point_mm ?? null, measureComplete, viewport, displayUnit, lengthPrecision, anglePrecision)
    const openingNeedsHost = activeTool === 'door' || activeTool === 'window'
    if (showRealtimeDimensions && activeSnap && usesPlacementDimensions(activeTool) && (!openingNeedsHost || activeWallSnap)) {
      if (openingNeedsHost && activeWallSnap) {
        const openingWidth = Number(project.types.find(type => type.object_type === (activeTool === 'door' ? 'door_window.door' : 'door_window.window') && type.name.toLowerCase() === (activeTool === 'door' ? activeDoorTypeMark : activeWindowTypeMark).toLowerCase())?.parameters?.width_mm ?? (activeTool === 'door' ? 800 : 1200))
        drawOpeningNearbyDimensions(ctx, planProject, activeWallSnap, openingWidth, viewport, displayUnit, lengthPrecision)
      } else {
        const copySource = activeTool === 'gridCopy' && gridCopySourceId ? planProject.objects[gridCopySourceId] : undefined
        const copyStart = copySource && isGridObject(copySource) ? gridLineEndpoints(copySource)[0] : undefined
        drawTemporaryDimensions(ctx, activeSnap.point_mm, planProject, viewport, activeSnap.target_id, undefined, copyStart ? { refX: copyStart[0], refY: copyStart[1] } : undefined, dimensionReferenceMode, displayUnit, lengthPrecision)
      }
    }
    if (activeTool === 'furniture' && activeFamilyId && activeSnap) {
      const family = availableFamilies(project).find(candidate => candidate.id === activeFamilyId)
      if (family) {
        try {
          const values = resolveFamilyParameters(family, activeFamilyTypeId)
          const center = activeSnap.point_mm
          const location: [number, number, number] = [center[0] - (values.W ?? 0) / 2, center[1] - (values.D ?? 0) / 2, 0]
          const preview = { id: 'family-placement-preview', object_type: 'family.instance', module_data: { family_id: family.id, family_type_id: activeFamilyTypeId, location_mm: location, rotation_deg: 0 }, created_phase: 'new_construction' } as unknown as import('@constructflow/project-model').SmartObject
          ctx.save(); ctx.globalAlpha = 0.62
          drawFamilyObject(ctx, project, preview, viewport, false, true)
          ctx.restore()
          const [x, y] = worldToScreen(center, viewport)
          ctx.save(); ctx.strokeStyle = '#b45309'; ctx.fillStyle = '#fff'; ctx.lineWidth = 1.6
          ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y); ctx.moveTo(x, y - 7); ctx.lineTo(x, y + 7); ctx.stroke()
          ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore()
        } catch { /* Keep the cursor usable if an imported family has invalid parameters. */ }
      }
    }
    if (selectionBox) {
      const left = Math.min(selectionBox.start[0], selectionBox.end[0]), top = Math.min(selectionBox.start[1], selectionBox.end[1])
      ctx.save(); ctx.strokeStyle = '#087cf0'; ctx.fillStyle = 'rgba(8,124,240,0.1)'; ctx.lineWidth = 1; ctx.setLineDash([5, 3])
      ctx.fillRect(left, top, Math.abs(selectionBox.end[0] - selectionBox.start[0]), Math.abs(selectionBox.end[1] - selectionBox.start[1]))
      ctx.strokeRect(left, top, Math.abs(selectionBox.end[0] - selectionBox.start[0]), Math.abs(selectionBox.end[1] - selectionBox.start[1])); ctx.restore()
    }
    if (['roomSeparator', 'pipe', 'cabinet', 'moulding'].includes(activeTool) && roomSeparatorStart && activeSnap) {
      const start = worldToScreen(roomSeparatorStart, viewport), end = worldToScreen(activeSnap.point_mm, viewport)
      const color = activeTool === 'pipe' ? (['cold_water', 'hot_water'].includes(pipeSystem) ? '#0284c7' : pipeSystem === 'rainwater' ? '#0891b2' : '#7c3aed') : activeTool === 'furniture' ? '#7c3aed' : activeTool === 'cabinet' ? '#92400e' : activeTool === 'moulding' ? '#a21caf' : '#d97706'
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = activeTool === 'cabinet' || activeTool === 'furniture' ? 2 : 1.8; ctx.setLineDash(activeTool === 'roomSeparator' ? [5, 3] : [7, 3]); ctx.beginPath(); ctx.moveTo(...start); ctx.lineTo(...end); ctx.stroke(); ctx.setLineDash([])
      if (activeTool === 'furniture' && activeFamilyId) {
        const family = project.families?.find(family => family.id === activeFamilyId)
        const width = Math.hypot(activeSnap.point_mm[0]-roomSeparatorStart[0],activeSnap.point_mm[1]-roomSeparatorStart[1])
        if (family && width > 1) {
          const overrides = family.parameters.some(p=>p.name==='W'&&p.scope==='instance'&&!p.formula)?{W:width}:{}
          drawFamilyObject(ctx, project, {id:'preview',object_type:'family.instance',module_data:{family_id:activeFamilyId,family_type_id:activeFamilyTypeId,family_parameters:overrides,location_mm:[...roomSeparatorStart,0],rotation_deg:Math.atan2(activeSnap.point_mm[1]-roomSeparatorStart[1],activeSnap.point_mm[0]-roomSeparatorStart[0])*180/Math.PI},created_phase:'new_construction'} as unknown as import('@constructflow/project-model').SmartObject,viewport,true,false)
        }
      } else if (activeTool === 'furniture') {
        const delta: [number, number] = [activeSnap.point_mm[0] - roomSeparatorStart[0], activeSnap.point_mm[1] - roomSeparatorStart[1]], length = Math.hypot(...delta)
        if (length > 1) {
          const depth = ({ sofa: 900, chair: 550, dining_table: 900, coffee_table: 600, desk: 700, bed_single: 2000, bed_double: 2000, toilet: 700, washbasin: 500, bathtub: 750 } as const)[furnitureKind]
          const n: [number, number] = [-delta[1] / length * depth, delta[0] / length * depth]
          const farStart = worldToScreen([roomSeparatorStart[0] + n[0], roomSeparatorStart[1] + n[1]], viewport)
          const farEnd = worldToScreen([activeSnap.point_mm[0] + n[0], activeSnap.point_mm[1] + n[1]], viewport)
          ctx.fillStyle = 'rgba(124,58,237,.12)'; ctx.beginPath(); ctx.moveTo(...start); ctx.lineTo(...end); ctx.lineTo(...farEnd); ctx.lineTo(...farStart); ctx.closePath(); ctx.fill(); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(...farStart); ctx.lineTo(...farEnd); ctx.stroke()
        }
      }
      ctx.fillStyle = '#fff'; ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(...start, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore()
    }
    if (activeTool === 'fixture' && activeSnap) {
      const [x, y] = worldToScreen(activeSnap.point_mm, viewport)
      ctx.save(); ctx.strokeStyle = '#7c3aed'; ctx.fillStyle = 'rgba(124, 58, 237, .12)'; ctx.lineWidth = 1.5; ctx.beginPath()
      if (fixtureKind === 'panel') ctx.rect(x - 7, y - 9, 14, 18)
      else { ctx.arc(x, y, fixtureKind === 'light' ? 7 : 6, 0, Math.PI * 2); if (fixtureKind === 'switch') { ctx.moveTo(x - 4, y + 4); ctx.lineTo(x + 4, y - 4) } else if (fixtureKind === 'outlet') { ctx.moveTo(x - 2, y - 2); ctx.lineTo(x - 2, y + 2); ctx.moveTo(x + 2, y - 2); ctx.lineTo(x + 2, y + 2) } }
      ctx.fill(); ctx.stroke(); ctx.restore()
    }
    if (activeTool === 'bundle' && activeSnap && supplierBundleVisualType === 'shape') {
      const [x, y] = worldToScreen(activeSnap.point_mm, viewport)
      ctx.save(); ctx.strokeStyle = '#d97706'; ctx.fillStyle = 'rgba(217, 119, 6, .14)'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(x - 5, y - 2); ctx.lineTo(x + 5, y - 2); ctx.lineTo(x + 5, y + 4); ctx.lineTo(x - 5, y + 4); ctx.closePath(); ctx.stroke()
      ctx.restore()
    }
    if (activeTool === 'bundle' && supplierBundleVisualType === 'length' && bundleStartPoint && activeSnap) {
      const start = worldToScreen(bundleStartPoint, viewport), end = worldToScreen(activeSnap.point_mm, viewport)
      const length = Math.hypot(activeSnap.point_mm[0] - bundleStartPoint[0], activeSnap.point_mm[1] - bundleStartPoint[1])
      ctx.save(); ctx.strokeStyle = '#d97706'; ctx.fillStyle = '#fff'; ctx.lineWidth = 2; ctx.setLineDash([7, 4])
      ctx.beginPath(); ctx.moveTo(...start); ctx.lineTo(...end); ctx.stroke(); ctx.setLineDash([])
      for (const [x, y] of [start, end]) { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke() }
      const label = formatLengthMm(length, displayUnit)
      const mx = (start[0] + end[0]) / 2, my = (start[1] + end[1]) / 2
      ctx.font = '12px sans-serif'; const width = ctx.measureText(label).width + 14
      ctx.fillStyle = 'rgba(255,255,255,.96)'; ctx.fillRect(mx - width / 2, my - 20, width, 20)
      ctx.fillStyle = '#b45309'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, mx, my - 10); ctx.restore()
    }
    if ((activeTool === 'slab' || activeTool === 'slabVoid' || activeTool === 'archFloor' || activeTool === 'ceiling' || activeTool === 'roof'
      || (activeTool === 'bundle' && supplierBundleVisualType === 'area')) && slabBoundary.length > 0) {
      ctx.save()
      ctx.strokeStyle = activeTool === 'bundle' || activeTool === 'roof' ? '#d97706' : activeTool === 'slabVoid' ? '#dc2626' : activeTool === 'ceiling' ? '#7c3aed' : activeTool === 'archFloor' ? '#059669' : '#0284c7'
      ctx.fillStyle = activeTool === 'bundle' || activeTool === 'roof' ? 'rgba(217, 119, 6, 0.12)' : activeTool === 'slabVoid' ? 'rgba(239, 68, 68, 0.12)' : activeTool === 'ceiling' ? 'rgba(124, 58, 237, 0.12)' : activeTool === 'archFloor' ? 'rgba(5, 150, 105, 0.12)' : 'rgba(14, 165, 233, 0.12)'
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

function drawMeasurementDraft(
  ctx: CanvasRenderingContext2D,
  mode: MeasureMode,
  committedPoints: [number, number][],
  pointer: [number, number] | null,
  complete: boolean,
  viewport: ViewportState,
  displayUnit: DisplayLengthUnit,
  precision: number,
  anglePrecision: number,
) {
  const previewPoint = !complete && mode !== 'area-pick' ? pointer : null
  const points = previewPoint ? [...committedPoints, previewPoint] : committedPoints
  if (!points.length) return
  const screen = points.map(point => worldToScreen(point, viewport))
  const color = mode === 'angle' ? '#7c3aed' : '#16803c'
  const labelAt = (text: string, x: number, y: number) => {
    ctx.font = '600 12px system-ui, sans-serif'
    const width = ctx.measureText(text).width + 14
    ctx.fillStyle = 'rgba(255,255,255,.96)'
    ctx.strokeStyle = mode === 'angle' ? '#c4b5fd' : '#86efac'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x - width / 2, y - 12, width, 24, 6); ctx.fill(); ctx.stroke()
    ctx.fillStyle = mode === 'angle' ? '#5b21b6' : '#166534'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y)
  }
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = mode === 'angle' ? 'rgba(124,58,237,.10)' : 'rgba(22,128,60,.10)'
  ctx.lineWidth = 2
  ctx.setLineDash(complete ? [] : [6, 4])
  if (mode === 'angle') {
    if (screen.length >= 2) {
      const vertex = screen[1] ?? screen[0]
      const start = screen[0]
      const end = screen[2]
      if (start && vertex) { ctx.beginPath(); ctx.moveTo(...start); ctx.lineTo(...vertex); ctx.stroke() }
      if (end && vertex) {
        ctx.beginPath(); ctx.moveTo(...vertex); ctx.lineTo(...end); ctx.stroke()
        if (screen.length >= 3) {
          const a = Math.atan2(start[1] - vertex[1], start[0] - vertex[0])
          const b = Math.atan2(end[1] - vertex[1], end[0] - vertex[0])
          const delta = ((b - a) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
          ctx.setLineDash([]); ctx.beginPath(); ctx.arc(vertex[0], vertex[1], 24, a, b, delta > Math.PI); ctx.stroke()
          labelAt(`${angleAtVertexDegrees(points[0], points[1], points[2]).toFixed(anglePrecision)}°`, vertex[0] + 37, vertex[1] - 24)
        }
      }
    }
  } else if (mode === 'rectangle') {
    if (points.length >= 2) {
      const a = points[0], b = points[1], aScreen = screen[0], bScreen = screen[1]
      const left = Math.min(aScreen[0], bScreen[0]), top = Math.min(aScreen[1], bScreen[1])
      const width = Math.abs(a[0] - b[0]), height = Math.abs(a[1] - b[1])
      ctx.setLineDash([]); ctx.fillRect(left, top, Math.abs(bScreen[0] - aScreen[0]), Math.abs(bScreen[1] - aScreen[1]))
      ctx.strokeRect(left, top, Math.abs(bScreen[0] - aScreen[0]), Math.abs(bScreen[1] - aScreen[1]))
      labelAt(`${formatLengthMm(width, displayUnit, precision)} × ${formatLengthMm(height, displayUnit, precision)} ${displayUnit} · ${(width * height / 1_000_000).toFixed(2)} m²`, left + Math.abs(bScreen[0] - aScreen[0]) / 2, top - 18)
    } else {
      ctx.beginPath(); ctx.arc(...screen[0], 4, 0, Math.PI * 2); ctx.fill()
    }
  } else {
    if (screen.length === 1) { ctx.beginPath(); ctx.arc(...screen[0], 4, 0, Math.PI * 2); ctx.fill() }
    else {
      ctx.beginPath(); screen.forEach(([x,y], index) => index ? ctx.lineTo(x,y) : ctx.moveTo(x,y))
      const closed = complete || mode === 'area-pick'
      if (closed && screen.length >= 3) { ctx.closePath(); ctx.setLineDash([]); ctx.fill() }
      ctx.stroke()
      if (closed && screen.length >= 3) {
        const perimeter = points.reduce((sum, point, index) => {
          const next = points[(index + 1) % points.length]
          return sum + Math.hypot(next[0] - point[0], next[1] - point[1])
        }, 0)
        const area = polygonArea2D(points) / 1_000_000
        const center = screen.reduce((sum, point) => [sum[0] + point[0] / screen.length, sum[1] + point[1] / screen.length], [0, 0])
        labelAt(`${area.toFixed(2)} m² · รอบ ${formatLengthMm(perimeter, displayUnit, precision)} ${displayUnit}`, center[0], center[1])
      }
    }
  }
  ctx.setLineDash([])
  for (const [x, y] of screen) { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke() }
  ctx.restore()
}
