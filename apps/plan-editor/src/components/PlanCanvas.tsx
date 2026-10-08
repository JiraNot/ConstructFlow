import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import {
  ProjectDocument,
  isColumnObject,
  isFoundationObject,
  isGridObject,
  isBeamObject,
  isWallObject,
  isDoorObject,
  isWindowObject,
  DoorHanding,
  PlacementReference,
} from '@constructflow/project-model'
import { projectPointToWallOffsetMm } from '@constructflow/architecture-engine'
import { getPlanVisibleObjects } from '@constructflow/representation-engine'
import { constructionOutputs } from '@constructflow/domain-providers'
import { TypePicker } from './TypePicker.js'
import { TOOL_FAMILIES } from './catalogPresentation.js'
import { ToolType } from './Toolbar.js'
import {
  ViewportState,
  screenToWorld,
  worldToScreen,
  zoomAtScreenPoint,
} from '../viewport/viewportTransform.js'
import { constrainPointToReference, DEFAULT_SNAP_MODES, findNearestLinearReference, inferLinearConstraint, LinearReference, SnapMode, SnapResult, snapPoint, snapToWallHost, WallHostSnapResult } from '@constructflow/snapping-engine'
import { renderPlanView, PlacementGhost, UnderlayConfig, PlanLabelVisibility } from '../rendering/planRenderer.js'
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react'

const PLACEMENT_DIMENSION_TOOLS = new Set<ToolType>(['column', 'foundation', 'beam', 'wall', 'door', 'window', 'grid', 'stair', 'slab'])

interface PlanCanvasProps {
  project: ProjectDocument
  activeTool: ToolType
  activeColumnTypeMark: string
  activeFoundationTypeMark: string
  activeBeamTypeMark: string
  activeWallTypeMark: string
  activeDoorTypeMark: string
  activeWindowTypeMark: string
  activeSlabTypeMark: string
  labelMode: 'name' | 'name-size'
  labelVisibility: PlanLabelVisibility
  onOpenTypeManager: () => void
  onChangeActiveTypeMark: (typeMark: string) => void
  selectedId: string | null
  selectedIds?: string[]
  underlay?: UnderlayConfig | null
  onSelectObject: (id: string | null) => void
  onSelectionChange?: (ids: string[], primaryId: string | null) => void
  onDeleteObjects?: (ids: string[]) => void
  onCommitColumn: (location_mm: [number, number]) => void
  onCommitFoundation: (opts: { columnId?: string; location_mm?: [number, number] }) => void
  onCommitBeam: (start: [number, number], end: [number, number], startColId?: string, endColId?: string, placementReference?: PlacementReference) => void
  onCommitWall: (start: [number, number], end: [number, number], placementReference?: PlacementReference) => void
  onCommitDoor: (wallId: string, point_mm: [number, number], offset_mm: number, handing: DoorHanding) => void
  onCommitWindow: (wallId: string, point_mm: [number, number], offset_mm: number) => void
  onCommitSlab: (boundary_mm: [number, number][]) => void
  onCommitSlabVoid: (hostId: string, boundary_mm: [number, number][]) => void
  onCommitGrid: (orientation: 'vertical' | 'horizontal', position_mm: number, system: { spacing_mm: number; count: number; first_tag: string }) => void
  onCommitStair?: (location_mm: [number, number]) => void
  onMoveColumn: (id: string, newLocation_mm: [number, number]) => void
  onMoveWall: (id: string, delta_mm: [number, number]) => void
  onMoveOpening: (id: string, offset_along_wall_mm: number) => void
  onFlipDoorHanding?: (doorId: string) => void
  onStartCalibrationModal?: (measuredDist_mm: number) => void
  onCursorChange: (coords_mm: [number, number], snapKind: string) => void
}

function getPlanObjectBounds(object: ProjectDocument['objects'][string]): [number, number, number, number] | null {
  if (isGridObject(object)) {
    const [a, b] = object.module_data.extent_mm
    return object.module_data.orientation === 'vertical'
      ? [object.module_data.position_mm - 1, Math.min(a, b), object.module_data.position_mm + 1, Math.max(a, b)]
      : [Math.min(a, b), object.module_data.position_mm - 1, Math.max(a, b), object.module_data.position_mm + 1]
  }
  const data = object.module_data as unknown as Record<string, unknown>
  const points: [number, number][] = []
  for (const key of ['location_mm', 'center_mm', 'start_point_mm', 'end_point_mm', 'origin_mm']) {
    const value = data[key]
    if (Array.isArray(value) && Number.isFinite(value[0]) && Number.isFinite(value[1])) points.push([Number(value[0]), Number(value[1])])
  }
  for (const key of ['boundary_mm', 'vertices_mm', 'outline_mm', 'points_mm', 'path_mm']) {
    const value = data[key]
    if (!Array.isArray(value)) continue
    for (const point of value) {
      if (Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1])) points.push([Number(point[0]), Number(point[1])])
    }
  }
  const center = data.center_mm, size = data.size_mm ?? data.section_mm
  if (Array.isArray(center) && Array.isArray(size) && Number.isFinite(center[0]) && Number.isFinite(center[1])) {
    points.push([Number(center[0]) - Number(size[0]) / 2, Number(center[1]) - Number(size[1]) / 2])
    points.push([Number(center[0]) + Number(size[0]) / 2, Number(center[1]) + Number(size[1]) / 2])
  }
  if (!points.length) return null
  const radius = Math.max(Number(data.thickness_mm ?? 0), Array.isArray(data.section_mm) ? Number(data.section_mm[0] ?? 0) : 0, 100) / 2
  return [Math.min(...points.map(point => point[0])) - radius, Math.min(...points.map(point => point[1])) - radius,
    Math.max(...points.map(point => point[0])) + radius, Math.max(...points.map(point => point[1])) + radius]
}

function findTemporaryDimensionRefs(point: [number, number], project: ProjectDocument, skipObjectId?: string, mode: 'center' | 'edge' = 'center') {
  const xs: number[] = [], ys: number[] = []
  for (const object of Object.values(project.objects)) {
    if (object.id === skipObjectId) continue
    const data = object.module_data as unknown as Record<string, unknown>
    if (isGridObject(object)) {
      ;(object.module_data.orientation === 'vertical' ? xs : ys).push(object.module_data.position_mm)
      continue
    }
    if (isDoorObject(object) || isWindowObject(object)) {
      const opening = object.module_data
      const host = project.objects[opening.wall_id]
      if (host && isWallObject(host)) {
        const [sx, sy] = host.module_data.start_point_mm, [ex, ey] = host.module_data.end_point_mm
        const dx = ex - sx, dy = ey - sy, length = Math.hypot(dx, dy)
        if (length > 1) {
          const ux = dx / length, uy = dy / length
          const center: [number, number] = [sx + ux * opening.offset_along_wall_mm, sy + uy * opening.offset_along_wall_mm]
          const halfWidth = opening.width_mm / 2
          const jambA: [number, number] = [center[0] - ux * halfWidth, center[1] - uy * halfWidth]
          const jambB: [number, number] = [center[0] + ux * halfWidth, center[1] + uy * halfWidth]
          if (mode === 'center') { xs.push(center[0]); ys.push(center[1]) }
          else { xs.push(jambA[0], jambB[0]); ys.push(jambA[1], jambB[1]) }
          continue
        }
      }
      // Do not treat an opening's center point as a 50 mm-wide bounding box.
      // If its wall is unavailable, keep the center usable but omit false edges.
      const location = opening.location_mm
      if (Array.isArray(location) && Number.isFinite(location[0]) && Number.isFinite(location[1]) && mode === 'center') {
        xs.push(Number(location[0])); ys.push(Number(location[1]))
      }
      continue
    }
    const centerPoints: [number, number][] = []
    const edgePoints: [number, number][] = []
    for (const key of ['location_mm', 'center_mm']) {
      const value = data[key]
      if (Array.isArray(value) && Number.isFinite(value[0]) && Number.isFinite(value[1])) centerPoints.push([Number(value[0]), Number(value[1])])
    }
    const start = data.start_point_mm, end = data.end_point_mm
    if (Array.isArray(start) && Array.isArray(end) && [start[0], start[1], end[0], end[1]].every(Number.isFinite)) {
      const a: [number, number] = [Number(start[0]), Number(start[1])], b: [number, number] = [Number(end[0]), Number(end[1])]
      edgePoints.push(a, b)
      centerPoints.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])
    }
    for (const key of ['boundary_mm', 'vertices_mm', 'outline_mm', 'points_mm', 'path_mm']) {
      const value = data[key]
      if (!Array.isArray(value)) continue
      for (const vertex of value) if (Array.isArray(vertex) && Number.isFinite(vertex[0]) && Number.isFinite(vertex[1])) edgePoints.push([Number(vertex[0]), Number(vertex[1])])
    }
    const bounds = getPlanObjectBounds(object)
    if (bounds) {
      edgePoints.push([bounds[0], bounds[1]], [bounds[2], bounds[1]], [bounds[0], bounds[3]], [bounds[2], bounds[3]])
      centerPoints.push([(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2])
    }
    for (const [x, y] of mode === 'center' ? centerPoints : edgePoints) { xs.push(x); ys.push(y) }
  }
  const nearest = (values: number[], target: number) => values.filter(value => Math.abs(target - value) > 25 && Math.abs(target - value) < 12000).sort((a, b) => Math.abs(target - a) - Math.abs(target - b))[0]
  return { refX: nearest(xs, point[0]), refY: nearest(ys, point[1]) }
}

function openingDimensionRefs(point: [number, number], project: ProjectDocument, wallSnap: WallHostSnapResult, mode: 'center' | 'edge'): { refX?: number; refY?: number; axis: 'x' | 'y' } {
  const axis = Math.abs(wallSnap.wall_end_mm[0] - wallSnap.wall_start_mm[0]) >= Math.abs(wallSnap.wall_end_mm[1] - wallSnap.wall_start_mm[1]) ? 'x' : 'y'
  const refs = findTemporaryDimensionRefs(point, project, wallSnap.wall_id, mode)
  // Openings are located along their host wall. If no other object/grid is nearby,
  // use a longitudinal wall reference, never a side face or its thickness.
  const fallback: [number, number] = mode === 'center'
    ? [(wallSnap.wall_start_mm[0] + wallSnap.wall_end_mm[0]) / 2, (wallSnap.wall_start_mm[1] + wallSnap.wall_end_mm[1]) / 2]
    : wallSnap.wall_start_mm
  if (axis === 'x') return { refX: refs.refX ?? fallback[0], refY: undefined, axis }
  return { refX: undefined, refY: refs.refY ?? fallback[1], axis }
}

function openingDimensionPoint(wallSnap: WallHostSnapResult, refs: { refX?: number; refY?: number; axis: 'x' | 'y' }, openingWidthMm: number): [number, number] {
  const dx = wallSnap.wall_end_mm[0] - wallSnap.wall_start_mm[0]
  const dy = wallSnap.wall_end_mm[1] - wallSnap.wall_start_mm[1]
  const length = Math.hypot(dx, dy)
  if (length < 1) return wallSnap.point_mm
  const ux = dx / length, uy = dy / length
  const center: [number, number] = [
    wallSnap.wall_start_mm[0] + ux * wallSnap.offset_along_wall_mm,
    wallSnap.wall_start_mm[1] + uy * wallSnap.offset_along_wall_mm,
  ]
  const coordinate = refs.axis === 'x' ? center[0] : center[1]
  const anchor = refs.axis === 'x' ? refs.refX : refs.refY
  if (anchor === undefined) return center
  const direction = coordinate < anchor ? -1 : 1
  return [center[0] - direction * ux * openingWidthMm / 2, center[1] - direction * uy * openingWidthMm / 2]
}

function drawTemporaryDimensions(ctx: CanvasRenderingContext2D, point: [number, number], project: ProjectDocument, viewport: ViewportState, skipObjectId?: string, axisOnly?: 'x' | 'y', suppliedRefs?: { refX?: number; refY?: number }, mode: 'center' | 'edge' = 'center') {
  const refs = findTemporaryDimensionRefs(point, project, skipObjectId, mode)
  const refX = suppliedRefs?.refX ?? refs.refX
  const refY = suppliedRefs?.refY ?? refs.refY
  const [px, py] = worldToScreen(point, viewport)
  ctx.save(); ctx.strokeStyle = '#ea580c'; ctx.fillStyle = '#9a3412'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.font = '11px sans-serif'
  const label = (text: string, x: number, y: number) => {
    const width = ctx.measureText(text).width + 10
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillRect(x - width / 2, y - 10, width, 18)
    ctx.strokeStyle = '#fdba74'; ctx.setLineDash([]); ctx.strokeRect(x - width / 2, y - 10, width, 18)
    ctx.fillStyle = '#9a3412'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y - 1)
  }
  if (refX !== undefined && axisOnly !== 'y') {
    const [x1] = worldToScreen([refX, point[1]], viewport)
    ctx.beginPath(); ctx.moveTo(x1, py - 16); ctx.lineTo(px, py - 16); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x1, py - 21); ctx.lineTo(x1, py - 9); ctx.moveTo(px, py - 21); ctx.lineTo(px, py - 9); ctx.stroke()
    label(`${Math.abs(point[0] - refX).toFixed(0)} mm`, (x1 + px) / 2, py - 28)
  }
  if (refY !== undefined && axisOnly !== 'x') {
    const [, y1] = worldToScreen([point[0], refY], viewport)
    ctx.beginPath(); ctx.moveTo(px + 16, y1); ctx.lineTo(px + 16, py); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(px + 10, y1); ctx.lineTo(px + 22, y1); ctx.moveTo(px + 10, py); ctx.lineTo(px + 22, py); ctx.stroke()
    label(`${Math.abs(point[1] - refY).toFixed(0)} mm`, px + 54, (y1 + py) / 2)
  }
  ctx.restore()
}

function drawTapeMeasure(ctx: CanvasRenderingContext2D, start: [number, number], end: [number, number], viewport: ViewportState, complete: boolean) {
  const [x1, y1] = worldToScreen(start, viewport), [x2, y2] = worldToScreen(end, viewport)
  const distanceMm = Math.hypot(end[0] - start[0], end[1] - start[1])
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const nx = -Math.sin(angle), ny = Math.cos(angle)
  ctx.save()
  ctx.strokeStyle = complete ? '#0f766e' : '#7c3aed'
  ctx.fillStyle = complete ? '#0f766e' : '#7c3aed'
  ctx.lineWidth = 1.5
  ctx.setLineDash(complete ? [] : [5, 3])
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  ctx.setLineDash([])
  for (const [x, y] of [[x1, y1], [x2, y2]]) {
    ctx.beginPath(); ctx.moveTo(x - nx * 6, y - ny * 6); ctx.lineTo(x + nx * 6, y + ny * 6); ctx.stroke()
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill()
  }
  const text = `${Math.round(distanceMm).toLocaleString()} mm  ·  ${(distanceMm / 1000).toFixed(3)} m`
  ctx.font = '600 11px sans-serif'
  const width = ctx.measureText(text).width + 12
  const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2 - 12
  ctx.fillStyle = 'rgba(255,255,255,0.96)'; ctx.strokeStyle = complete ? '#5eead4' : '#c4b5fd'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.roundRect(midX - width / 2, midY - 10, width, 20, 4); ctx.fill(); ctx.stroke()
  ctx.fillStyle = complete ? '#115e59' : '#5b21b6'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, midX, midY)
  ctx.restore()
}

export const PlanCanvas: React.FC<PlanCanvasProps> = ({
  project,
  activeTool,
  activeColumnTypeMark,
  activeFoundationTypeMark,
  activeBeamTypeMark,
  activeWallTypeMark,
  activeDoorTypeMark,
  activeWindowTypeMark,
  activeSlabTypeMark,
  labelMode,
  labelVisibility,
  onChangeActiveTypeMark,
  onOpenTypeManager,
  selectedId,
  selectedIds = selectedId ? [selectedId] : [],
  underlay,
  onSelectObject,
  onSelectionChange,
  onDeleteObjects,
  onCommitColumn,
  onCommitFoundation,
  onCommitBeam,
  onCommitWall,
  onCommitDoor,
  onCommitWindow,
  onCommitSlab,
  onCommitSlabVoid,
  onCommitGrid,
  onCommitStair,
  onMoveColumn,
  onMoveWall,
  onMoveOpening,
  onFlipDoorHanding,
  onStartCalibrationModal,
  onCursorChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hasInitialFitRef = useRef(false)
  const planVisibleObjects = useMemo(() => getPlanVisibleObjects(project), [project])
  const planProject = useMemo<ProjectDocument>(() => ({
    ...project,
    objects: Object.fromEntries(planVisibleObjects.map(object => [object.id, object])) as ProjectDocument['objects'],
  }), [project, planVisibleObjects])

  // Viewport state: 0.08 zoom = 1000mm -> 80px on screen.
  const [viewport, setViewport] = useState<ViewportState>({
    panX: 400,
    panY: 300,
    zoom: 0.08,
  })
  const [placementReference, setPlacementReference] = useState<'centerline' | 'left_face' | 'right_face'>('centerline')
  const [gridOrientation, setGridOrientation] = useState<'vertical' | 'horizontal'>('vertical')
  const [gridSpacing, setGridSpacing] = useState('4000')
  const [gridCount, setGridCount] = useState('4')
  const [gridFirstTag, setGridFirstTag] = useState('A')
  const [snapModes, setSnapModes] = useState<SnapMode[]>(DEFAULT_SNAP_MODES)
  const [lineConstraintMode, setLineConstraintMode] = useState<'auto' | 'none' | 'parallel' | 'perpendicular'>('auto')
  const [drawLengthMeters, setDrawLengthMeters] = useState('')
  const [dimensionInputX, setDimensionInputX] = useState('')
  const [dimensionInputY, setDimensionInputY] = useState('')
  const [dimensionAnchorX, setDimensionAnchorX] = useState<number | null>(null)
  const [dimensionAnchorY, setDimensionAnchorY] = useState<number | null>(null)
  const [dimensionKeyboardAxis, setDimensionKeyboardAxis] = useState<'x' | 'y'>('x')
  const [dimensionReferenceMode, setDimensionReferenceMode] = useState<'center' | 'edge'>('center')
  const enabledSnapModes = useMemo(() => new Set(snapModes), [snapModes])

  const applyPlacementDimensions = (point: [number, number], refs: { refX?: number; refY?: number }, rawPoint: [number, number] = point): [number, number] => {
    const result: [number, number] = [...point]
    for (const axis of ['x', 'y'] as const) {
      const valueText = axis === 'x' ? dimensionInputX : dimensionInputY
      const anchor = axis === 'x' ? dimensionAnchorX ?? refs.refX : dimensionAnchorY ?? refs.refY
      const value = Number(valueText)
      if (!valueText.trim() || anchor === undefined || anchor === null || !Number.isFinite(value) || value < 0) continue
      const coordinate = axis === 'x' ? rawPoint[0] : rawPoint[1]
      const sign = coordinate < anchor ? -1 : 1
      if (axis === 'x') result[0] = Math.round(anchor + sign * value)
      else result[1] = Math.round(anchor + sign * value)
    }
    return result
  }

  const clearDimensionOverrides = () => {
    setDimensionInputX(''); setDimensionInputY(''); setDimensionAnchorX(null); setDimensionAnchorY(null)
  }
  useEffect(() => {
    setDimensionInputX(''); setDimensionInputY(''); setDimensionAnchorX(null); setDimensionAnchorY(null)
    setDimensionReferenceMode(activeTool === 'door' || activeTool === 'window' ? 'edge' : 'center')
  }, [activeTool])

  const toggleDimensionReferenceMode = () => {
    setDimensionReferenceMode(mode => mode === 'center' ? 'edge' : 'center')
    // Keep the entered distance and re-anchor it to the chosen center/edge reference.
    setDimensionAnchorX(null); setDimensionAnchorY(null)
  }

  const applyOpeningDistance = (wallSnap: WallHostSnapResult, rawPoint: [number, number], openingWidthMm: number): WallHostSnapResult => {
    const refs = openingDimensionRefs(wallSnap.point_mm, planProject, wallSnap, dimensionReferenceMode)
    const point: [number, number] = [...wallSnap.point_mm]
    const valueText = refs.axis === 'x' ? dimensionInputX : dimensionInputY
    const anchor = refs.axis === 'x' ? dimensionAnchorX ?? refs.refX : dimensionAnchorY ?? refs.refY
    const value = Number(valueText)
    if (valueText.trim() && anchor !== undefined && Number.isFinite(value) && value >= 0) {
      const rawCoordinate = refs.axis === 'x' ? rawPoint[0] : rawPoint[1]
      const direction = rawCoordinate < anchor ? -1 : 1
      const center = anchor + direction * (value + openingWidthMm / 2)
      if (refs.axis === 'x') point[0] = Math.round(center)
      else point[1] = Math.round(center)
    }
    const offset = projectPointToWallOffsetMm(point, wallSnap.wall_start_mm, wallSnap.wall_end_mm, openingWidthMm)
    if (offset === undefined) return wallSnap
    const dx = wallSnap.wall_end_mm[0] - wallSnap.wall_start_mm[0], dy = wallSnap.wall_end_mm[1] - wallSnap.wall_start_mm[1]
    const length = Math.hypot(dx, dy)
    const adjustedPoint: [number, number] = [Math.round(wallSnap.wall_start_mm[0] + dx / length * offset), Math.round(wallSnap.wall_start_mm[1] + dy / length * offset)]
    const axis = refs.axis
    return { ...wallSnap, point_mm: adjustedPoint, offset_along_wall_mm: Math.round(offset), description: `${wallSnap.description}${point[axis === 'x' ? 0 : 1] !== wallSnap.point_mm[axis === 'x' ? 0 : 1] ? ' · ระยะกำหนดเอง' : ''}` }
  }
  useEffect(() => {
    if (!activeSnap || !PLACEMENT_DIMENSION_TOOLS.has(activeTool)) return
    if ((activeTool === 'door' || activeTool === 'window') && activeWallSnap) {
      const typeId = activeTool === 'door' ? 'door_window.door' : 'door_window.window'
      const mark = activeTool === 'door' ? activeDoorTypeMark : activeWindowTypeMark
      const type = project.types.find(candidate => candidate.object_type === typeId && candidate.name.toLowerCase() === mark.toLowerCase())
      const width = Number(type?.parameters?.width_mm ?? (activeTool === 'door' ? 800 : 1200))
      const adjusted = applyOpeningDistance(activeWallSnap, activeSnap.point_mm, width)
      setActiveWallSnap(adjusted); setActiveSnap({ ...activeSnap, point_mm: adjusted.point_mm, description: adjusted.description })
    } else {
      const point = applyPlacementDimensions(activeSnap.point_mm, findTemporaryDimensionRefs(activeSnap.point_mm, planProject, undefined, dimensionReferenceMode), activeSnap.point_mm)
      if (point[0] !== activeSnap.point_mm[0] || point[1] !== activeSnap.point_mm[1]) setActiveSnap({ ...activeSnap, point_mm: point, kind: 'free', target_id: undefined, description: `${activeSnap.description} · ระยะกำหนดเอง` })
    }
  }, [dimensionInputX, dimensionInputY, dimensionAnchorX, dimensionAnchorY, dimensionReferenceMode, activeTool])

  const resolveReferencePath = useCallback((start: [number, number], end: [number, number], widthMm: number): [[number, number], [number, number]] => {
    if (placementReference === 'centerline') return [start, end]
    const dx = end[0] - start[0], dy = end[1] - start[1]
    const length = Math.hypot(dx, dy)
    if (length < 1) return [start, end]
    const side = placementReference === 'left_face' ? -1 : 1
    const offsetX = (-dy / length) * widthMm / 2 * side
    const offsetY = (dx / length) * widthMm / 2 * side
    return [[start[0] + offsetX, start[1] + offsetY], [end[0] + offsetX, end[1] + offsetY]]
  }, [placementReference])

  const constrainLineSnap = useCallback((snap: SnapResult, pointerPoint: [number, number], start: [number, number], lockAxis: boolean, reference?: LinearReference): SnapResult => {
    let constrainedSnap = snap
    const inferredMode = !lockAxis && lineConstraintMode === 'auto' && reference
      ? inferLinearConstraint(pointerPoint, start, reference, 12 / Math.max(viewport.zoom, 0.0001))
      : null
    const appliedMode = lineConstraintMode === 'auto' ? inferredMode : lineConstraintMode === 'none' ? null : lineConstraintMode
    if (!lockAxis && appliedMode && reference) {
      constrainedSnap = constrainPointToReference(snap.point_mm, start, reference, appliedMode)
    }
    let dx = constrainedSnap.point_mm[0] - start[0], dy = constrainedSnap.point_mm[1] - start[1]
    if (lockAxis) {
      if (Math.abs(dx) >= Math.abs(dy)) dy = 0
      else dx = 0
    }
    const targetLengthMm = Number.parseFloat(drawLengthMeters) * 1000
    if (Number.isFinite(targetLengthMm) && targetLengthMm > 0) {
      const length = Math.hypot(dx, dy)
      if (length > 0) {
        dx = dx / length * targetLengthMm
        dy = dy / length * targetLengthMm
      }
    }
    const point_mm: [number, number] = [Math.round(start[0] + dx), Math.round(start[1] + dy)]
    const changed = Math.hypot(point_mm[0] - snap.point_mm[0], point_mm[1] - snap.point_mm[1]) >= 1
    const constraintApplied = !lockAxis && !!appliedMode && !!reference
    return {
      ...snap,
      point_mm,
      kind: constraintApplied ? constrainedSnap.kind : snap.kind,
      target_id: constraintApplied ? reference?.target_id : changed ? undefined : snap.target_id,
      description: `${constraintApplied ? constrainedSnap.description : snap.description}${!lockAxis && lineConstraintMode !== 'none' && !reference ? ' · ไม่พบแนวอ้างอิงใกล้จุดเริ่ม' : ''}${lineConstraintMode === 'auto' && reference && !inferredMode && !lockAxis ? ' · Auto: เล็งใกล้แนวขนาน/ตั้งฉากเพื่อจัดแนว' : ''}${lockAxis ? ' · Ortho' : ''}${Number.isFinite(targetLengthMm) && targetLengthMm > 0 ? ` · ${(targetLengthMm / 1000).toFixed(2)} m` : ''}`,
    }
  }, [drawLengthMeters, lineConstraintMode, viewport.zoom])

  const fitView = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const points: [number, number][] = []
    const pointKeys = ['location_mm', 'center_mm', 'start_point_mm', 'end_point_mm', 'origin_mm']
    const polygonKeys = ['boundary_mm', 'vertices_mm', 'outline_mm', 'points_mm', 'path_mm']
    for (const object of planVisibleObjects) {
      if (isGridObject(object)) continue
      const data = object.module_data as Record<string, unknown>
      for (const key of pointKeys) {
        const value = data[key]
        if (Array.isArray(value) && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
          points.push([value[0], value[1]])
        }
      }
      for (const key of polygonKeys) {
        const value = data[key]
        if (!Array.isArray(value)) continue
        for (const point of value) {
          if (Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1])) {
            points.push([point[0], point[1]])
          }
        }
      }
      const center = data.center_mm
      const size = data.size_mm
      if (Array.isArray(center) && Array.isArray(size) && Number.isFinite(center[0]) && Number.isFinite(center[1])) {
        points.push([center[0] - size[0] / 2, center[1] - size[1] / 2])
        points.push([center[0] + size[0] / 2, center[1] + size[1] / 2])
      }
    }
    if (points.length === 0) return
    const bounds = points.reduce((result, point) => ({
      minX: Math.min(result.minX, point[0]),
      maxX: Math.max(result.maxX, point[0]),
      minY: Math.min(result.minY, point[1]),
      maxY: Math.max(result.maxY, point[1]),
    }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity })
    const { minX, maxX, minY, maxY } = bounds
    const spanX = Math.max(1000, maxX - minX)
    const spanY = Math.max(1000, maxY - minY)
    const zoom = Math.max(0.005, Math.min(0.16,
      (container.clientWidth - 112) / (spanX + 1600),
      (container.clientHeight - 112) / (spanY + 1600),
    ))
    setViewport({
      zoom,
      panX: container.clientWidth / 2 - ((minX + maxX) / 2) * zoom,
      panY: container.clientHeight / 2 - ((minY + maxY) / 2) * zoom,
    })
  }, [planVisibleObjects])

  useEffect(() => {
    if (hasInitialFitRef.current || planVisibleObjects.length === 0) return
    const frame = requestAnimationFrame(() => {
      fitView()
      hasInitialFitRef.current = true
    })
    return () => cancelAnimationFrame(frame)
  }, [fitView, planVisibleObjects.length])

  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [pickCandidates, setPickCandidates] = useState<string[]>([])
  const pickCandidatesRef = useRef<string[]>([])
  const setCandidates = (ids: string[]) => {
    if (ids.join('|') !== pickCandidatesRef.current.join('|')) {
      pickCandidatesRef.current = ids
      setPickCandidates(ids)
    }
  }
  const cyclePick = useCallback((reverse = false) => {
    const ids = pickCandidatesRef.current.filter(id => !!planProject.objects[id])
    if (ids.length < 2) return
    const current = ids.indexOf(hoveredId ?? selectedId ?? '')
    const next = ids[(current + (reverse ? -1 : 1) + ids.length) % ids.length]
    setHoveredId(next)
    onSelectionChange?.([next], next)
    onSelectObject(next)
  }, [hoveredId, selectedId, onSelectObject, onSelectionChange, planProject])
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || activeTool !== 'select' || pickCandidatesRef.current.length < 2) return
      if (document.querySelector('[role="dialog"]')) return
      if (event.target instanceof HTMLElement && (event.target.matches('input,select,textarea,button,a') || event.target.isContentEditable)) return
      event.preventDefault()
      cyclePick(event.shiftKey)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [cyclePick, activeTool])
  useEffect(() => { setCandidates([]) }, [activeTool, planProject])
  const [activeSnap, setActiveSnap] = useState<SnapResult | null>(null)
  const [activeWallSnap, setActiveWallSnap] = useState<WallHostSnapResult | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [selectionBox, setSelectionBox] = useState<{ start: [number, number]; end: [number, number] } | null>(null)
  const panStartRef = useRef<[number, number]>([0, 0])
  const selectionStartRef = useRef<[number, number] | null>(null)
  const pointerPositionsRef = useRef(new Map<number, [number, number]>())
  const pinchRef = useRef<{ distance: number; center: [number, number] } | null>(null)
  const pinchActiveRef = useRef(false)
  const longPressTimerRef = useRef<number | null>(null)
  const longPressStartRef = useRef<{ pointerId: number; point: [number, number] } | null>(null)
  const eraseActiveRef = useRef(false)
  const erasedIdsRef = useRef(new Set<string>())
  const selectionAdditiveRef = useRef(false)
  const currentViewportRef = useRef(viewport)
  currentViewportRef.current = viewport

  // Direct-manipulation state for objects whose geometry can move in plan.
  const [draggingObject, setDraggingObject] = useState<{
    id: string
    kind: 'column' | 'wall' | 'opening'
    startWorldMm: [number, number]
    startScreenPx: [number, number]
    hostStartMm?: [number, number]
    hostEndMm?: [number, number]
    openingWidthMm?: number
  } | null>(null)

  // 2-click beam placement state (start node -> end node)
  const [beamStartNode, setBeamStartNode] = useState<{ point_mm: [number, number]; columnId?: string; reference?: LinearReference } | null>(null)

  // 2-click wall placement state (start node -> end node)
  const [wallStartNode, setWallStartNode] = useState<{ point_mm: [number, number]; reference?: LinearReference } | null>(null)
  const [slabBoundary, setSlabBoundary] = useState<[number, number][]>([])

  // Calibration state (P1 -> mouse move -> P2 -> modal)
  const [calibrationP1, setCalibrationP1] = useState<[number, number] | null>(null)
  const [calibrationMousePoint, setCalibrationMousePoint] = useState<[number, number] | null>(null)
  const [tapeMeasure, setTapeMeasure] = useState<{ start: [number, number]; end: [number, number]; complete: boolean } | null>(null)

  // Door handing state (can cycle with Spacebar)
  const [doorHanding, setDoorHanding] = useState<DoorHanding>('left_in')

  useEffect(() => {
    if (activeTool !== 'beam') {
      setBeamStartNode(null)
    }
    if (activeTool !== 'wall') {
      setWallStartNode(null)
    }
    if (activeTool !== 'slab') setSlabBoundary([])
    if (activeTool !== 'calibrate') {
      setCalibrationP1(null)
      setCalibrationMousePoint(null)
    }
    if (activeTool !== 'measure') setTapeMeasure(null)
    setDrawLengthMeters('')
  }, [activeTool])

  // Space cycles the active placement reference for linear elements, or door handing.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      if (e.code === 'Space') {
        if (activeTool === 'door') {
          e.preventDefault()
          setDoorHanding((prev) => {
            const cycle: Record<DoorHanding, DoorHanding> = {
              left_in: 'left_out',
              left_out: 'right_out',
              right_out: 'right_in',
              right_in: 'left_in',
            }
            return cycle[prev] || 'left_in'
          })
        } else if (activeTool === 'wall' || activeTool === 'beam') {
          e.preventDefault()
          setPlacementReference((prev) => {
            const cycle = { centerline: 'left_face', left_face: 'right_face', right_face: 'centerline' } as const
            return cycle[prev]
          })
        } else if (selectedId && project.objects[selectedId] && isDoorObject(project.objects[selectedId])) {
          e.preventDefault()
          if (onFlipDoorHanding) {
            onFlipDoorHanding(selectedId)
          }
        }
      } else if (e.key === 'Escape') {
        if (activeTool === 'beam') setBeamStartNode(null)
        if (activeTool === 'wall') setWallStartNode(null)
        if (activeTool === 'slab' || activeTool === 'slabVoid') setSlabBoundary([])
        setDrawLengthMeters('')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTool, selectedId, project.objects, onFlipDoorHanding])

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let ghost: PlacementGhost | null = null
    if (activeTool === 'column' && activeSnap) {
      const typeDef = project.types?.find(
        (t) => t.object_type === 'structure.column' && t.name.toLowerCase() === activeColumnTypeMark.toLowerCase()
      )
      ghost = {
        type: 'column',
        location_mm: activeSnap.point_mm,
        size_mm: typeDef?.parameters?.section_mm || [200, 200],
        mark: activeColumnTypeMark,
      }
    } else if (activeTool === 'foundation' && activeSnap) {
      const typeDef = project.types?.find(
        (t) => t.object_type === 'structure.foundation' && t.name.toLowerCase() === activeFoundationTypeMark.toLowerCase()
      )
      ghost = {
        type: 'foundation',
        location_mm: activeSnap.point_mm,
        size_mm: typeDef?.parameters?.size_mm || [800, 800, 300],
        mark: activeFoundationTypeMark,
      }
    } else if (activeTool === 'beam' && activeSnap && beamStartNode) {
      const typeDef = project.types?.find(
        (t) => t.object_type === 'structure.beam' && t.name.toLowerCase() === activeBeamTypeMark.toLowerCase()
      )
      const [alignedStart, alignedEnd] = resolveReferencePath(beamStartNode.point_mm, activeSnap.point_mm, typeDef?.parameters?.section_mm?.[0] || 200)
      ghost = {
        type: 'beam',
        location_mm: alignedStart,
        reference_start_mm: beamStartNode.point_mm,
        target_location_mm: alignedEnd,
        size_mm: typeDef?.parameters?.section_mm || [200, 400],
        mark: activeBeamTypeMark,
      }
    } else if (activeTool === 'wall' && activeSnap && wallStartNode) {
      const typeDef = project.types?.find(
        (t) => t.object_type === 'architecture.wall' && t.name.toLowerCase() === activeWallTypeMark.toLowerCase()
      )
      const [alignedStart, alignedEnd] = resolveReferencePath(wallStartNode.point_mm, activeSnap.point_mm, typeDef?.parameters?.thickness_mm || 100)
      ghost = {
        type: 'wall',
        location_mm: alignedStart,
        reference_start_mm: wallStartNode.point_mm,
        target_location_mm: alignedEnd,
        size_mm: [typeDef?.parameters?.thickness_mm || 100, 0],
        mark: activeWallTypeMark,
      }
    } else if (activeTool === 'door' && activeWallSnap) {
      const typeDef = project.types?.find(
        (t) => t.object_type === 'door_window.door' && t.name.toLowerCase() === activeDoorTypeMark.toLowerCase()
      )
      ghost = {
        type: 'door',
        location_mm: activeWallSnap.point_mm,
        wall_id: activeWallSnap.wall_id,
        offset_along_wall_mm: activeWallSnap.offset_along_wall_mm,
        size_mm: [typeDef?.parameters?.width_mm || 800, typeDef?.parameters?.height_mm || 2000],
        mark: activeDoorTypeMark,
        handing: doorHanding,
        operation: typeDef?.parameters?.opening_operation,
        panel_count: typeDef?.parameters?.panel_count,
      }
    } else if (activeTool === 'window' && activeWallSnap) {
      const typeDef = project.types?.find(
        (t) => t.object_type === 'door_window.window' && t.name.toLowerCase() === activeWindowTypeMark.toLowerCase()
      )
      ghost = {
        type: 'window',
        location_mm: activeWallSnap.point_mm,
        wall_id: activeWallSnap.wall_id,
        offset_along_wall_mm: activeWallSnap.offset_along_wall_mm,
        size_mm: [typeDef?.parameters?.width_mm || 1200, typeDef?.parameters?.height_mm || 1200],
        mark: activeWindowTypeMark,
        operation: typeDef?.parameters?.opening_operation,
        panel_count: typeDef?.parameters?.panel_count,
        sill_height_mm: typeDef?.parameters?.sill_height_mm,
        glazing_material: typeDef?.parameters?.glazing_material,
      }
    } else if (activeTool === 'stair' && activeSnap) {
      ghost = {
        type: 'stair',
        location_mm: activeSnap.point_mm,
        size_mm: [1000, 4000],
        mark: 'ST1',
      }
    }

    const calibrationOverlay =
      activeTool === 'calibrate'
        ? {
            point1_mm: calibrationP1,
            point2_mm: null,
            mouse_mm: calibrationMousePoint,
          }
        : null

    renderPlanView(
      ctx,
      canvas.width,
      canvas.height,
      planProject,
      viewport,
      selectedIds,
      hoveredId,
      activeSnap,
      ghost,
      underlay,
      calibrationOverlay,
      project,
      labelMode,
      labelVisibility,
    )
    if (activeTool === 'measure' && tapeMeasure) drawTapeMeasure(ctx, tapeMeasure.start, tapeMeasure.end, viewport, tapeMeasure.complete)
    if (activeSnap && PLACEMENT_DIMENSION_TOOLS.has(activeTool)) {
      const openingAxis = activeWallSnap
        ? Math.abs(activeWallSnap.wall_end_mm[0] - activeWallSnap.wall_start_mm[0]) >= Math.abs(activeWallSnap.wall_end_mm[1] - activeWallSnap.wall_start_mm[1]) ? 'x' : 'y'
        : undefined
      const openingRefs = activeWallSnap ? openingDimensionRefs(activeSnap.point_mm, planProject, activeWallSnap, dimensionReferenceMode) : undefined
      const openingWidth = activeTool === 'door' || activeTool === 'window'
        ? Number(project.types.find(type => type.object_type === (activeTool === 'door' ? 'door_window.door' : 'door_window.window') && type.name.toLowerCase() === (activeTool === 'door' ? activeDoorTypeMark : activeWindowTypeMark).toLowerCase())?.parameters?.width_mm ?? (activeTool === 'door' ? 800 : 1200))
        : 0
      const dimensionPoint = openingRefs && activeWallSnap ? openingDimensionPoint(activeWallSnap, openingRefs, openingWidth) : activeSnap.point_mm
      drawTemporaryDimensions(ctx, dimensionPoint, planProject, viewport, activeWallSnap?.wall_id, openingAxis, openingRefs, dimensionReferenceMode)
    }
    if (selectionBox) {
      const left = Math.min(selectionBox.start[0], selectionBox.end[0]), top = Math.min(selectionBox.start[1], selectionBox.end[1])
      ctx.save(); ctx.strokeStyle = '#087cf0'; ctx.fillStyle = 'rgba(8,124,240,0.1)'; ctx.lineWidth = 1; ctx.setLineDash([5, 3])
      ctx.fillRect(left, top, Math.abs(selectionBox.end[0] - selectionBox.start[0]), Math.abs(selectionBox.end[1] - selectionBox.start[1]))
      ctx.strokeRect(left, top, Math.abs(selectionBox.end[0] - selectionBox.start[0]), Math.abs(selectionBox.end[1] - selectionBox.start[1])); ctx.restore()
    }
    if ((activeTool === 'slab' || activeTool === 'slabVoid') && slabBoundary.length > 0) {
      ctx.save()
      ctx.strokeStyle = activeTool === 'slabVoid' ? '#dc2626' : '#0284c7'
      ctx.fillStyle = activeTool === 'slabVoid' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(14, 165, 233, 0.12)'
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
  }, [
    project,
    labelMode,
    labelVisibility,
    planProject,
    viewport,
    selectedIds,
    hoveredId,
    activeSnap,
    activeWallSnap,
    activeTool,
    activeColumnTypeMark,
    activeFoundationTypeMark,
    activeBeamTypeMark,
    activeWallTypeMark,
    activeDoorTypeMark,
    activeWindowTypeMark,
    activeSlabTypeMark,
    slabBoundary,
    beamStartNode,
    wallStartNode,
    resolveReferencePath,
    doorHanding,
    underlay,
    calibrationP1,
    calibrationMousePoint,
    selectionBox,
    dimensionReferenceMode,
    tapeMeasure,
  ])

  useEffect(() => {
    redraw()
  }, [redraw])

  const redrawRef = useRef(redraw)
  redrawRef.current = redraw

  // Observe the drawing area, including changes from collapsing the inspector.
  // Canvas bitmap dimensions must not contribute to the flex item's minimum size.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const resizeCanvas = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = container.getBoundingClientRect()
      const width = Math.round(rect.width), height = Math.round(rect.height)
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height
      redrawRef.current()
    }

    const observer = new ResizeObserver(resizeCanvas)
    observer.observe(container)
    resizeCanvas()
    return () => observer.disconnect()
  }, [])

  const findHitObject = (worldPoint_mm: [number, number], preferWall = false, excluded = new Set<string>()): string | null => {
    const [wx, wy] = worldPoint_mm
    const pickObjects = Object.values(planProject.objects).filter(obj => !excluded.has(obj.id))

    const openingTol = Math.max(150, 16 / viewport.zoom)

    // Shift-click/drag can target an architectural wall beneath a coincident beam.
    if (preferWall) {
      for (const obj of pickObjects) {
        if (!isWallObject(obj)) continue
        const [x1, y1] = obj.module_data.start_point_mm
        const [x2, y2] = obj.module_data.end_point_mm
        const hitTol = Math.max(obj.module_data.thickness_mm / 2, 12 / viewport.zoom)
        const lengthSquared = (x2 - x1) ** 2 + (y2 - y1) ** 2
        if (lengthSquared <= 0) continue
        const t = Math.max(0, Math.min(1, ((wx - x1) * (x2 - x1) + (wy - y1) * (y2 - y1)) / lengthSquared))
        const nearestX = x1 + t * (x2 - x1)
        const nearestY = y1 + t * (y2 - y1)
        if ((wx - nearestX) ** 2 + (wy - nearestY) ** 2 <= hitTol * hitTol) return obj.id
      }
    }

    // 1. Doors (highest pick priority for openings: wall span + swing arc)
    for (const obj of pickObjects) {
      if (isDoorObject(obj)) {
        const [cx, cy] = obj.module_data.location_mm
        const w = obj.module_data.width_mm
        const dist = Math.hypot(wx - cx, wy - cy)
        if (dist <= w + openingTol) {
          return obj.id
        }
      }
    }

    // 2. Windows
    for (const obj of pickObjects) {
      if (isWindowObject(obj)) {
        const [cx, cy] = obj.module_data.location_mm
        const w = obj.module_data.width_mm
        const dist = Math.hypot(wx - cx, wy - cy)
        if (dist <= w / 2 + openingTol) {
          return obj.id
        }
      }
    }

    // 3. Columns
    for (const obj of pickObjects) {
      if (isColumnObject(obj)) {
        const [cx, cy] = obj.module_data.location_mm
        const [w, d] = obj.module_data.section_mm
        if (
          wx >= cx - w / 2 &&
          wx <= cx + w / 2 &&
          wy >= cy - d / 2 &&
          wy <= cy + d / 2
        ) {
          return obj.id
        }
      }
    }

    // 4. Foundations
    for (const obj of pickObjects) {
      if (isFoundationObject(obj)) {
        const [cx, cy] = obj.module_data.center_mm
        const [w, l] = obj.module_data.size_mm
        if (
          wx >= cx - w / 2 &&
          wx <= cx + w / 2 &&
          wy >= cy - l / 2 &&
          wy <= cy + l / 2
        ) {
          return obj.id
        }
      }
    }

    // 5. Beams
    for (const obj of pickObjects) {
      if (isBeamObject(obj)) {
        const [x1, y1] = obj.module_data.start_point_mm
        const [x2, y2] = obj.module_data.end_point_mm
        const [bw] = obj.module_data.section_mm
        const hitTol = Math.max(bw / 2, 12 / viewport.zoom)
        const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2
        if (l2 > 0) {
          let t = ((wx - x1) * (x2 - x1) + (wy - y1) * (y2 - y1)) / l2
          t = Math.max(0, Math.min(1, t))
          const px = x1 + t * (x2 - x1)
          const py = y1 + t * (y2 - y1)
          const distSq = (wx - px) ** 2 + (wy - py) ** 2
          if (distSq <= hitTol * hitTol) {
            return obj.id
          }
        }
      }
    }

    // 6. Walls
    for (const obj of pickObjects) {
      if (isWallObject(obj)) {
        const [x1, y1] = obj.module_data.start_point_mm
        const [x2, y2] = obj.module_data.end_point_mm
        const thick = obj.module_data.thickness_mm
        const hitTol = Math.max(thick / 2, 12 / viewport.zoom)
        const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2
        if (l2 > 0) {
          let t = ((wx - x1) * (x2 - x1) + (wy - y1) * (y2 - y1)) / l2
          t = Math.max(0, Math.min(1, t))
          const px = x1 + t * (x2 - x1)
          const py = y1 + t * (y2 - y1)
          const distSq = (wx - px) ** 2 + (wy - py) ** 2
          if (distSq <= hitTol * hitTol) {
            return obj.id
          }
        }
      }
    }

    // 7. Grids
    for (const obj of pickObjects) {
      if (isGridObject(obj)) {
        const { orientation, position_mm } = obj.module_data
        const tol = 12 / viewport.zoom
        if (orientation === 'vertical' && Math.abs(wx - position_mm) <= tol) {
          return obj.id
        }
        if (orientation === 'horizontal' && Math.abs(wy - position_mm) <= tol) {
          return obj.id
        }
      }
    }

    for(const out of constructionOutputs(project).filter(v=>!!planProject.objects[v.object_id] && !excluded.has(v.object_id)).reverse()){
      const near=(a:number[],b:number[])=>{const dx=b[0]-a[0],dy=b[1]-a[1],len=dx*dx+dy*dy,t=len?Math.max(0,Math.min(1,((wx-a[0])*dx+(wy-a[1])*dy)/len)):0;return Math.hypot(wx-a[0]-t*dx,wy-a[1]-t*dy)<12/viewport.zoom}
      if(out.paths.some(path=>path.slice(1).some((v,i)=>near(path[i],v))))return out.object_id
      for(const tr of out.meshes){const signs=tr.map((a,i)=>{const b=tr[(i+1)%3];return (b[0]-a[0])*(wy-a[1])-(b[1]-a[1])*(wx-a[0])});if(Math.abs((tr[1][0]-tr[0][0])*(tr[2][1]-tr[0][1])-(tr[1][1]-tr[0][1])*(tr[2][0]-tr[0][0]))>1&& (signs.every(v=>v>=0)||signs.every(v=>v<=0)))return out.object_id}
    }
    return null
  }

  const findCandidates = (point: [number, number], preferWall = false) => {
    const excluded = new Set<string>()
    for (let index = 0; index < Object.keys(planProject.objects).length; index++) {
      const id = findHitObject(point, preferWall, excluded)
      if (!id) break
      excluded.add(id)
    }
    const ids = [...excluded]
    // Walls are drawn over beams; match that visible order when picking.
    return ids.sort((a, b) => {
      const rank = (id: string) => isWallObject(planProject.objects[id]) ? 2 : isBeamObject(planProject.objects[id]) ? 3 : isFoundationObject(planProject.objects[id]) ? 4 : isGridObject(planProject.objects[id]) ? 5 : 1
      return rank(a) - rank(b)
    })
  }

  // Pointer move handler
  const handlePointerMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    if (activeTool !== 'select' && activeTool !== 'erase' && e.pointerType === 'mouse' && document.activeElement !== canvasRef.current) {
      canvasRef.current?.focus({ preventScroll: true })
    }

    if (e.pointerType === 'touch' && pointerPositionsRef.current.has(e.pointerId)) {
      pointerPositionsRef.current.set(e.pointerId, [screenX, screenY])
      if (pointerPositionsRef.current.size >= 2) {
        const points = [...pointerPositionsRef.current.values()]
        const center: [number, number] = [(points[0][0] + points[1][0]) / 2, (points[0][1] + points[1][1]) / 2]
        const distance = Math.max(1, Math.hypot(points[0][0] - points[1][0], points[0][1] - points[1][1]))
        const previous = pinchRef.current
        if (previous) setViewport(value => {
          const zoomed = zoomAtScreenPoint(value, previous.center, distance / previous.distance)
          return { ...zoomed, panX: zoomed.panX + center[0] - previous.center[0], panY: zoomed.panY + center[1] - previous.center[1] }
        })
        pinchRef.current = { distance, center }
        return
      }
      if (longPressStartRef.current?.pointerId === e.pointerId && Math.hypot(screenX - longPressStartRef.current.point[0], screenY - longPressStartRef.current.point[1]) > 8 && longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null
      }
    }

    if (selectionStartRef.current) {
      setSelectionBox({ start: selectionStartRef.current, end: [screenX, screenY] })
      return
    }

    if (eraseActiveRef.current) {
      const point = screenToWorld([screenX, screenY], viewport)
      for (const id of findCandidates(point, true)) {
        if (erasedIdsRef.current.has(id)) continue
        erasedIdsRef.current.add(id)
      }
      return
    }

    if (isPanning) {
      const dx = screenX - panStartRef.current[0]
      const dy = screenY - panStartRef.current[1]
      panStartRef.current = [screenX, screenY]
      setViewport((v) => ({ ...v, panX: v.panX + dx, panY: v.panY + dy }))
      return
    }

    const rawWorld = screenToWorld([screenX, screenY], viewport)

    if (activeTool === 'door' || activeTool === 'window') {
      const typeDef = project.types?.find(
        (t) =>
          t.object_type === (activeTool === 'door' ? 'door_window.door' : 'door_window.window') &&
          t.name.toLowerCase() === (activeTool === 'door' ? activeDoorTypeMark : activeWindowTypeMark).toLowerCase()
      )
      const openingW = typeDef?.parameters?.width_mm || (activeTool === 'door' ? 800 : 1200)
      const hostSnap = snapToWallHost(rawWorld, planProject, viewport, openingW)
      const wallSnap = hostSnap ? applyOpeningDistance(hostSnap, rawWorld, openingW) : null
      setActiveWallSnap(wallSnap)
      if (wallSnap) {
        setActiveSnap({
          point_mm: wallSnap.point_mm,
          kind: 'free',
          description: wallSnap.description,
        })
        onCursorChange(wallSnap.point_mm, wallSnap.description)
      } else {
        const snap = e.ctrlKey
          ? { point_mm: rawWorld, kind: 'free' as const, description: 'Free / อิสระ (Ctrl)' }
          : snapPoint(rawWorld, planProject, viewport, 16, enabledSnapModes)
        setActiveSnap(snap)
        onCursorChange(snap.point_mm, snap.description)
      }
    } else {
      setActiveWallSnap(null)
      let snap = e.ctrlKey
        ? { point_mm: rawWorld, kind: 'free' as const, description: 'Free / อิสระ (Ctrl)' }
        : snapPoint(rawWorld, planProject, viewport, 16, enabledSnapModes)
      if (activeTool === 'beam' && beamStartNode) snap = constrainLineSnap(snap, rawWorld, beamStartNode.point_mm, e.shiftKey, beamStartNode.reference)
      if (activeTool === 'wall' && wallStartNode) snap = constrainLineSnap(snap, rawWorld, wallStartNode.point_mm, e.shiftKey, wallStartNode.reference)
      const point_mm = PLACEMENT_DIMENSION_TOOLS.has(activeTool)
        ? applyPlacementDimensions(snap.point_mm, findTemporaryDimensionRefs(snap.point_mm, planProject, undefined, dimensionReferenceMode), rawWorld)
        : snap.point_mm
      if (point_mm[0] !== snap.point_mm[0] || point_mm[1] !== snap.point_mm[1]) {
        snap = { ...snap, point_mm, kind: 'free', target_id: undefined, description: `${snap.description} · ระยะกำหนดเอง` }
      }
      setActiveSnap(snap)
      onCursorChange(snap.point_mm, snap.description)
      if (activeTool === 'measure') setTapeMeasure(current => current && !current.complete ? { ...current, end: snap.point_mm } : current)
    }

    if (activeTool === 'calibrate') {
      setCalibrationMousePoint(rawWorld)
    }

    // Check hover
    const candidates = findCandidates(rawWorld)
    if (activeTool === 'select' && !draggingObject) setCandidates(candidates)
    setHoveredId(candidates.includes(hoveredId ?? '') ? hoveredId : candidates[0] ?? null)

    // Redraw during direct manipulation so the pointer feedback remains responsive.
    if (draggingObject) {
      redraw()
    }
  }

  // Pointer down
  const handlePointerDown = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top

    if (e.pointerType === 'touch') {
      pointerPositionsRef.current.set(e.pointerId, [screenX, screenY])
      try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
      if (pointerPositionsRef.current.size >= 2) {
        if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
        selectionStartRef.current = null; setSelectionBox(null)
        setDraggingObject(null); setIsPanning(false)
        const points = [...pointerPositionsRef.current.values()]
        pinchRef.current = { distance: Math.max(1, Math.hypot(points[0][0] - points[1][0], points[0][1] - points[1][1])), center: [(points[0][0] + points[1][0]) / 2, (points[0][1] + points[1][1]) / 2] }
        pinchActiveRef.current = true
        return
      }
      if (activeTool === 'select') {
        longPressStartRef.current = { pointerId: e.pointerId, point: [screenX, screenY] }
        longPressTimerRef.current = window.setTimeout(() => {
          const point = longPressStartRef.current?.point
          if (!point) return
          setDraggingObject(null); selectionStartRef.current = null; setSelectionBox(null)
          panStartRef.current = point; setIsPanning(true)
        }, 500)
      }
    }

    // Middle click or Alt+Left triggers pan
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true)
      panStartRef.current = [screenX, screenY]
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }

    if (e.button === 0) {
      const rawWorld = screenToWorld([screenX, screenY], viewport)
      let snap = e.ctrlKey
        ? { point_mm: rawWorld, kind: 'free' as const, description: 'Free / อิสระ (Ctrl)' }
        : snapPoint(rawWorld, planProject, viewport, 16, enabledSnapModes)
      if (activeTool === 'beam' && beamStartNode) snap = constrainLineSnap(snap, rawWorld, beamStartNode.point_mm, e.shiftKey, beamStartNode.reference)
      if (activeTool === 'wall' && wallStartNode) snap = constrainLineSnap(snap, rawWorld, wallStartNode.point_mm, e.shiftKey, wallStartNode.reference)

      if (activeTool === 'erase') {
        eraseActiveRef.current = true
        erasedIdsRef.current.clear()
        for (const id of findCandidates(rawWorld, true)) {
          erasedIdsRef.current.add(id)
        }
        e.currentTarget.setPointerCapture(e.pointerId)
      } else if (activeTool === 'select') {
        const candidates = findCandidates(rawWorld, e.shiftKey)
        setCandidates(candidates)
        const hitId = e.shiftKey ? findHitObject(rawWorld, true) : candidates.includes(hoveredId ?? '') ? hoveredId : candidates[0] ?? null
        setHoveredId(hitId)
        if (hitId && e.shiftKey) {
          const next = selectedIds.includes(hitId) ? selectedIds.filter(id => id !== hitId) : [...selectedIds, hitId]
          onSelectionChange?.(next, next.at(-1) ?? null)
          onSelectObject(next.at(-1) ?? null)
        } else if (hitId) {
          onSelectionChange?.([hitId], hitId)
          onSelectObject(hitId)
        } else {
          selectionStartRef.current = [screenX, screenY]
          selectionAdditiveRef.current = e.shiftKey
          e.currentTarget.setPointerCapture(e.pointerId)
        }

        if (hitId && !e.shiftKey) {
          const object = project.objects[hitId]
          const startScreenPx: [number, number] = [screenX, screenY]
          if (isColumnObject(object)) {
            setDraggingObject({ id: hitId, kind: 'column', startWorldMm: rawWorld, startScreenPx })
            e.currentTarget.setPointerCapture(e.pointerId)
          } else if (isWallObject(object)) {
            setDraggingObject({
              id: hitId,
              kind: 'wall',
              startWorldMm: rawWorld,
              startScreenPx,
            })
            e.currentTarget.setPointerCapture(e.pointerId)
          } else if (isDoorObject(object) || isWindowObject(object)) {
            const host = project.objects[object.module_data.wall_id]
            if (host && isWallObject(host) && Number.isFinite(object.module_data.width_mm) && object.module_data.width_mm > 0) {
              setDraggingObject({
                id: hitId,
                kind: 'opening',
                startWorldMm: rawWorld,
                startScreenPx,
                hostStartMm: [host.module_data.start_point_mm[0], host.module_data.start_point_mm[1]],
                hostEndMm: [host.module_data.end_point_mm[0], host.module_data.end_point_mm[1]],
                openingWidthMm: object.module_data.width_mm,
              })
              e.currentTarget.setPointerCapture(e.pointerId)
            }
          }
        }
      } else if (activeTool === 'column') {
        onCommitColumn(snap.point_mm)
      } else if (activeTool === 'foundation') {
        const colHit = Object.values(planProject.objects).find((o) => {
          if (!isColumnObject(o)) return false
          const [cx, cy] = o.module_data.location_mm
          const [cw, cd] = o.module_data.section_mm
          const tol = Math.max(cw, cd, 400)
          return Math.abs(rawWorld[0] - cx) <= tol && Math.abs(rawWorld[1] - cy) <= tol
        })

        if (colHit) {
          const existingFnd = Object.values(planProject.objects).find(
            (o) => isFoundationObject(o) && (o.module_data.supported_column_id === colHit.id || o.host_refs?.includes(colHit.id))
          )
          if (existingFnd) {
            onSelectionChange?.([existingFnd.id], existingFnd.id)
            onSelectObject(existingFnd.id)
          } else {
            onCommitFoundation({ columnId: colHit.id })
          }
        } else {
          onCommitFoundation({ location_mm: snap.point_mm })
        }
      } else if (activeTool === 'beam') {
        const clickedCol = Object.values(planProject.objects).find((o) => {
          if (!isColumnObject(o)) return false
          const [cx, cy] = o.module_data.location_mm
          const [cw, cd] = o.module_data.section_mm
          const tol = Math.max(cw, cd, 400)
          return Math.abs(rawWorld[0] - cx) <= tol && Math.abs(rawWorld[1] - cy) <= tol
        })
        const colId = clickedCol ? clickedCol.id : (snap.kind === 'column_center' ? snap.target_id : undefined)

        if (!beamStartNode) {
          setBeamStartNode({ point_mm: snap.point_mm, columnId: colId, reference: findNearestLinearReference(planProject, snap.point_mm) ?? undefined })
          setDrawLengthMeters('')
        } else {
          const dist = Math.hypot(
            snap.point_mm[0] - beamStartNode.point_mm[0],
            snap.point_mm[1] - beamStartNode.point_mm[1]
          )
          if (dist >= 100) {
            const typeDef = project.types?.find(type => type.object_type === 'structure.beam' && type.name.toLowerCase() === activeBeamTypeMark.toLowerCase())
            const [alignedStart, alignedEnd] = resolveReferencePath(beamStartNode.point_mm, snap.point_mm, typeDef?.parameters?.section_mm?.[0] || 200)
            onCommitBeam(alignedStart, alignedEnd, beamStartNode.columnId, colId, placementReference)
          }
          setBeamStartNode({ point_mm: snap.point_mm, columnId: colId, reference: findNearestLinearReference(planProject, snap.point_mm) ?? undefined })
          setDrawLengthMeters('')
        }
      } else if (activeTool === 'wall') {
        if (!wallStartNode) {
          setWallStartNode({ point_mm: snap.point_mm, reference: findNearestLinearReference(planProject, snap.point_mm) ?? undefined })
          setDrawLengthMeters('')
        } else {
          const dist = Math.hypot(
            snap.point_mm[0] - wallStartNode.point_mm[0],
            snap.point_mm[1] - wallStartNode.point_mm[1]
          )
          if (dist >= 100) {
            const typeDef = project.types?.find(type => type.object_type === 'architecture.wall' && type.name.toLowerCase() === activeWallTypeMark.toLowerCase())
            const [alignedStart, alignedEnd] = resolveReferencePath(wallStartNode.point_mm, snap.point_mm, typeDef?.parameters?.thickness_mm || 100)
            onCommitWall(alignedStart, alignedEnd, placementReference)
          }
          setWallStartNode({ point_mm: snap.point_mm, reference: findNearestLinearReference(planProject, snap.point_mm) ?? undefined })
          setDrawLengthMeters('')
        }
      } else if (activeTool === 'door') {
        const typeDef = project.types?.find(
          (t) => t.object_type === 'door_window.door' && t.name.toLowerCase() === activeDoorTypeMark.toLowerCase()
        )
        const openingW = typeDef?.parameters?.width_mm || 800
        const hostSnap = snapToWallHost(rawWorld, planProject, viewport, openingW) || activeWallSnap
        const wallSnap = hostSnap ? applyOpeningDistance(hostSnap, rawWorld, openingW) : null
        if (wallSnap) {
          onCommitDoor(
            wallSnap.wall_id,
            wallSnap.point_mm,
            wallSnap.offset_along_wall_mm,
            doorHanding
          )
          clearDimensionOverrides()
        }
      } else if (activeTool === 'window') {
        const typeDef = project.types?.find(
          (t) => t.object_type === 'door_window.window' && t.name.toLowerCase() === activeWindowTypeMark.toLowerCase()
        )
        const openingW = typeDef?.parameters?.width_mm || 1200
        const hostSnap = snapToWallHost(rawWorld, planProject, viewport, openingW) || activeWallSnap
        const wallSnap = hostSnap ? applyOpeningDistance(hostSnap, rawWorld, openingW) : null
        if (wallSnap) {
          onCommitWindow(
            wallSnap.wall_id,
            wallSnap.point_mm,
            wallSnap.offset_along_wall_mm
          )
          clearDimensionOverrides()
        }
      } else if (activeTool === 'slab' || activeTool === 'slabVoid') {
        const closeDistance = Math.max(150, 18 / viewport.zoom)
        const closesAtStart = slabBoundary.length >= 3 && Math.hypot(snap.point_mm[0] - slabBoundary[0][0], snap.point_mm[1] - slabBoundary[0][1]) <= closeDistance
        if ((e.detail >= 2 || closesAtStart) && slabBoundary.length >= 3) {
          if (activeTool === 'slab') onCommitSlab(slabBoundary)
          else if (selectedId && planProject.objects[selectedId]?.object_type === 'structure.slab') onCommitSlabVoid(selectedId, slabBoundary)
          setSlabBoundary([])
        } else if (e.detail < 2) setSlabBoundary(current => [...current, snap.point_mm])
      } else if (activeTool === 'grid') {
        const orientation = e.shiftKey
          ? (gridOrientation === 'vertical' ? 'horizontal' : 'vertical')
          : gridOrientation
        const pos = orientation === 'vertical' ? Math.round(snap.point_mm[0] / 500) * 500 : Math.round(snap.point_mm[1] / 500) * 500
        onCommitGrid(orientation, pos, {
          spacing_mm: Number(gridSpacing),
          count: Math.max(1, Math.min(100, Math.floor(Number(gridCount) || 1))),
          first_tag: gridFirstTag.trim() || (orientation === 'vertical' ? 'A' : '1'),
        })
      } else if (activeTool === 'measure') {
        if (!tapeMeasure || tapeMeasure.complete) setTapeMeasure({ start: snap.point_mm, end: snap.point_mm, complete: false })
        else setTapeMeasure({ ...tapeMeasure, end: snap.point_mm, complete: true })
      } else if (activeTool === 'calibrate') {
        if (!calibrationP1) {
          setCalibrationP1(snap.point_mm)
        } else {
          const dist = Math.hypot(
            snap.point_mm[0] - calibrationP1[0],
            snap.point_mm[1] - calibrationP1[1]
          )
          if (dist >= 10 && onStartCalibrationModal) {
            onStartCalibrationModal(dist)
          }
          setCalibrationP1(null)
          setCalibrationMousePoint(null)
        }
      } else if (activeTool === 'stair') {
        if (onCommitStair) {
          onCommitStair(snap.point_mm)
        }
      }
    }
  }

  // Pointer up
  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') {
      if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null; longPressStartRef.current = null
      pointerPositionsRef.current.delete(e.pointerId)
      if (pinchActiveRef.current) {
        if (pointerPositionsRef.current.size === 0) { pinchActiveRef.current = false; pinchRef.current = null }
        else {
          const point = [...pointerPositionsRef.current.values()][0]
          pinchRef.current = { distance: 1, center: point }
        }
        return
      }
    }

    if (isPanning) {
      setIsPanning(false)
      try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
      return
    }

    if (selectionStartRef.current) {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (rect) {
        const end: [number, number] = [e.clientX - rect.left, e.clientY - rect.top]
        const start = selectionStartRef.current
        selectionStartRef.current = null; setSelectionBox(null)
        if (Math.hypot(end[0] - start[0], end[1] - start[1]) >= 5) {
          const a = screenToWorld(start, viewport), b = screenToWorld(end, viewport)
          const box = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]
          const contained = Object.values(planProject.objects).filter(object => {
            const bounds = getPlanObjectBounds(object)
            return bounds && bounds[0] <= box[2] && bounds[2] >= box[0] && bounds[1] <= box[3] && bounds[3] >= box[1]
          }).map(object => object.id)
          const next = selectionAdditiveRef.current ? [...new Set([...selectedIds, ...contained])] : contained
          onSelectionChange?.(next, next.at(-1) ?? null)
          onSelectObject(next.at(-1) ?? null)
        } else if (!selectionAdditiveRef.current) {
          onSelectionChange?.([], null); onSelectObject(null)
        }
      }
      return
    }

    if (eraseActiveRef.current) {
      if (erasedIdsRef.current.size) onDeleteObjects?.([...erasedIdsRef.current])
      eraseActiveRef.current = false; erasedIdsRef.current.clear()
      return
    }

    if (draggingObject) {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (rect) {
        const screenX = e.clientX - rect.left
        const screenY = e.clientY - rect.top
        const rawWorld = screenToWorld([screenX, screenY], viewport)
        const movedPixels = Math.hypot(screenX - draggingObject.startScreenPx[0], screenY - draggingObject.startScreenPx[1])
        if (movedPixels >= 3) {
          if (draggingObject.kind === 'column') {
            const snap = e.ctrlKey
              ? { point_mm: rawWorld, kind: 'free' as const, description: 'Free / อิสระ (Ctrl)' }
              : snapPoint(rawWorld, planProject, viewport, 16, enabledSnapModes)
            onMoveColumn(draggingObject.id, snap.point_mm)
          } else if (draggingObject.kind === 'wall') {
            const delta: [number, number] = [
              rawWorld[0] - draggingObject.startWorldMm[0],
              rawWorld[1] - draggingObject.startWorldMm[1],
            ]
            if (Math.hypot(...delta) >= 1) onMoveWall(draggingObject.id, delta)
          } else if (draggingObject.hostStartMm && draggingObject.hostEndMm && draggingObject.openingWidthMm) {
            const offset = projectPointToWallOffsetMm(rawWorld, draggingObject.hostStartMm, draggingObject.hostEndMm, draggingObject.openingWidthMm)
            if (offset !== undefined) onMoveOpening(draggingObject.id, offset)
          }
        }
      }
      setDraggingObject(null)
      try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
    }
  }

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85
    setViewport((v) => zoomAtScreenPoint(v, [screenX, screenY], zoomFactor))
  }

  const dimensionHostAxis = activeWallSnap
    ? Math.abs(activeWallSnap.wall_end_mm[0] - activeWallSnap.wall_start_mm[0]) >= Math.abs(activeWallSnap.wall_end_mm[1] - activeWallSnap.wall_start_mm[1]) ? 'x' : 'y'
    : null
  const dimensionReferences = activeSnap
    ? activeWallSnap ? openingDimensionRefs(activeSnap.point_mm, planProject, activeWallSnap, dimensionReferenceMode) : findTemporaryDimensionRefs(activeSnap.point_mm, planProject, undefined, dimensionReferenceMode)
    : { refX: undefined, refY: undefined }
  const showXDimension = !!activeSnap && (dimensionHostAxis ? dimensionHostAxis === 'x' : dimensionReferences.refX !== undefined)
  const showYDimension = !!activeSnap && (dimensionHostAxis ? dimensionHostAxis === 'y' : dimensionReferences.refY !== undefined)
  const xDimensionAnchor = dimensionAnchorX ?? dimensionReferences.refX
  const yDimensionAnchor = dimensionAnchorY ?? dimensionReferences.refY
  const activeOpeningWidth = activeWallSnap
    ? Number(project.types.find(type => type.object_type === (activeTool === 'door' ? 'door_window.door' : 'door_window.window') && type.name.toLowerCase() === (activeTool === 'door' ? activeDoorTypeMark : activeWindowTypeMark).toLowerCase())?.parameters?.width_mm ?? (activeTool === 'door' ? 800 : 1200))
    : 0
  const dimensionPoint = activeSnap && activeWallSnap ? openingDimensionPoint(activeWallSnap, dimensionReferences as { refX?: number; refY?: number; axis: 'x' | 'y' }, activeOpeningWidth) : activeSnap?.point_mm
  const xDimensionDisplay = dimensionInputX || (dimensionPoint && xDimensionAnchor !== undefined ? String(Math.round(Math.abs(dimensionPoint[0] - xDimensionAnchor))) : '')
  const yDimensionDisplay = dimensionInputY || (dimensionPoint && yDimensionAnchor !== undefined ? String(Math.round(Math.abs(dimensionPoint[1] - yDimensionAnchor))) : '')
  const dimensionOverlayPosition = activeSnap ? worldToScreen(activeSnap.point_mm, viewport) : null
  const supportsPlacementDimensions = PLACEMENT_DIMENSION_TOOLS.has(activeTool)

  const handleCanvasDimensionKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!PLACEMENT_DIMENSION_TOOLS.has(activeTool)) return
    const axis = dimensionHostAxis ?? dimensionKeyboardAxis
    const anchor = axis === 'x' ? dimensionAnchorX ?? dimensionReferences.refX : dimensionAnchorY ?? dimensionReferences.refY
    if (event.key === 'Tab' && (showXDimension || showYDimension)) {
      event.preventDefault()
      if (event.shiftKey) setDimensionKeyboardAxis(axis === 'x' ? 'y' : 'x')
      else toggleDimensionReferenceMode()
      return
    }
    if (/^\d$/.test(event.key) || (event.key === '.' && !(axis === 'x' ? dimensionInputX : dimensionInputY).includes('.'))) {
      if (anchor === undefined) return
      event.preventDefault()
      if (axis === 'x') { setDimensionAnchorX(anchor); setDimensionInputX(value => value + event.key) }
      else { setDimensionAnchorY(anchor); setDimensionInputY(value => value + event.key) }
    } else if (event.key === 'Backspace' && anchor !== undefined) {
      event.preventDefault()
      if (axis === 'x') setDimensionInputX(value => value.slice(0, -1))
      else setDimensionInputY(value => value.slice(0, -1))
    }
  }

  const handleDimensionInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation()
    if (event.key === 'Enter') event.currentTarget.blur()
    if (event.key === 'Tab') {
      event.preventDefault()
      if (event.shiftKey) setDimensionKeyboardAxis(axis => axis === 'x' ? 'y' : 'x')
      else toggleDimensionReferenceMode()
    }
  }

  return (
    <div
      className="cf-plan-canvas"
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#fbfdff',
        cursor: isPanning ? 'grabbing' : activeTool === 'select' ? 'default' : activeTool === 'erase' ? 'not-allowed' : 'crosshair',
      }}
    >
      <canvas
        ref={canvasRef}
        tabIndex={0}
        aria-label="แปลน: กด Tab เพื่อสลับวัตถุที่ซ้อนกัน และ Shift Tab เพื่อย้อนกลับ"
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        onKeyDown={handleCanvasDimensionKeyDown}
        onPointerCancel={handlePointerUp}
        style={{ position: 'absolute', inset: 0, display: 'block', width: '100%', height: '100%', touchAction: 'none' }}
      />
      {activeTool === 'measure' && <div className="cf-tape-measure-hint" aria-live="polite">
        ตลับเมตร · {tapeMeasure?.complete ? 'คลิกเพื่อเริ่มวัดเส้นใหม่' : tapeMeasure ? 'คลิกจุดปลาย' : 'คลิกจุดเริ่ม'} · Esc ออก
      </div>}
      {supportsPlacementDimensions && dimensionOverlayPosition && (showXDimension || showYDimension) && <div className="cf-dynamic-dimensions" role="group" aria-label="ระยะอ้างอิงระหว่างวางวัตถุ" onPointerDown={event => event.stopPropagation()} style={{
        left: Math.max(8, Math.min(dimensionOverlayPosition[0] + 14, (containerRef.current?.clientWidth ?? 800) - 300)),
        top: Math.max(8, Math.min(dimensionOverlayPosition[1] + 20, (containerRef.current?.clientHeight ?? 600) - 70)),
      }}>
        {showXDimension && <label><span>X</span><input aria-label="ระยะจากแนวอ้างอิง X มิลลิเมตร" type="number" min="0" step="1" value={xDimensionDisplay} onFocus={event => { if (dimensionReferences.refX !== undefined) setDimensionAnchorX(dimensionAnchorX ?? dimensionReferences.refX); setDimensionKeyboardAxis('x'); event.currentTarget.select() }} onChange={event => { setDimensionAnchorX(dimensionAnchorX ?? dimensionReferences.refX ?? null); setDimensionInputX(event.target.value) }} onKeyDown={handleDimensionInputKeyDown} /></label>}
        {showYDimension && <label><span>Y</span><input aria-label="ระยะจากแนวอ้างอิง Y มิลลิเมตร" type="number" min="0" step="1" value={yDimensionDisplay} onFocus={event => { if (dimensionReferences.refY !== undefined) setDimensionAnchorY(dimensionAnchorY ?? dimensionReferences.refY); setDimensionKeyboardAxis('y'); event.currentTarget.select() }} onChange={event => { setDimensionAnchorY(dimensionAnchorY ?? dimensionReferences.refY ?? null); setDimensionInputY(event.target.value) }} onKeyDown={handleDimensionInputKeyDown} /></label>}
        <button type="button" className="cf-dimension-reference-toggle" aria-label="สลับวัดจากกึ่งกลางหรือขอบวัตถุ" aria-pressed={dimensionReferenceMode === 'edge'} onClick={toggleDimensionReferenceMode}>วัดจาก {dimensionReferenceMode === 'center' ? 'กึ่งกลาง' : 'ขอบ'}</button>
        <small>พิมพ์ระยะแล้วคลิก · Tab กลาง/ขอบ · Shift+Tab สลับแกน</small>
      </div>}
      {activeTool === 'select' && pickCandidates.length > 1 && <div className="cf-pick-stack" role="group" aria-label="วัตถุซ้อนกัน" onPointerDown={event => event.stopPropagation()}>
        <span>วัตถุซ้อนกัน {pickCandidates.length} ชิ้น</span>
          <button type="button" onClick={() => cyclePick(true)} aria-label="เลือกวัตถุก่อนหน้า">‹</button>
        <select aria-label="เลือกวัตถุที่ซ้อนกัน" value={pickCandidates.includes(hoveredId ?? '') ? hoveredId! : pickCandidates[0]} onChange={event => { setHoveredId(event.target.value); onSelectionChange?.([event.target.value], event.target.value); onSelectObject(event.target.value) }}>
          {pickCandidates.map(id => {
            const object = planProject.objects[id]
            if (!object) return null
            const family = object.object_type === 'architecture.wall' ? 'ผนัง' : object.object_type === 'structure.beam' ? 'คาน' : object.object_type === 'structure.column' ? 'เสา' : object.object_type === 'structure.foundation' ? 'ฐานราก' : object.object_type === 'door_window.door' ? 'ประตู' : object.object_type === 'door_window.window' ? 'หน้าต่าง' : object.object_type
            const data = object.module_data as unknown as Record<string, unknown>
            return <option key={id} value={id}>{family} {String(data.mark ?? data.type_mark ?? 'ไม่มีรหัสแบบ')}</option>
          })}
        </select>
        <button type="button" onClick={() => cyclePick()} aria-label="เลือกวัตถุถัดไป">›</button>
        <small>Tab / Shift+Tab · iPad แตะลูกศรหรือเลือกจากรายการ</small>
      </div>}
      <div className="cf-authoring-controls" onPointerDown={(event) => event.stopPropagation()}>
        {activeTool === 'grid' && <div className="cf-grid-orientation-control" role="group" aria-label="แนวกริดที่จะสร้าง">
          <span>แนวกริด</span>
          <button type="button" aria-pressed={gridOrientation === 'vertical'} onClick={() => { setGridOrientation('vertical'); setGridFirstTag('A') }}>แนวตั้ง · A/B</button>
          <button type="button" aria-pressed={gridOrientation === 'horizontal'} onClick={() => { setGridOrientation('horizontal'); setGridFirstTag('1') }}>แนวนอน · 1/2</button>
          <label>ระยะ (มม.)<input aria-label="ระยะห่างระหว่างกริด" type="number" min="1" step="100" value={gridSpacing} onChange={event => setGridSpacing(event.target.value)} /></label>
          <label>จำนวนเส้น<input aria-label="จำนวนเส้นกริด" type="number" min="1" max="100" value={gridCount} onChange={event => setGridCount(event.target.value)} /></label>
          <label>ป้ายเส้นแรก<input aria-label="ป้ายกริดเส้นแรก" value={gridFirstTag} onChange={event => setGridFirstTag(event.target.value)} /></label>
          <small>คลิกแปลนเพื่อสร้างทั้งชุด · แก้ระยะ จำนวน และป้ายได้ภายหลังเมื่อเลือกเส้นในชุด</small>
        </div>}
        {(['column', 'foundation', 'beam', 'wall', 'door', 'window', 'slab'] as ToolType[]).includes(activeTool) && (() => {
          const familyByTool: Partial<Record<ToolType, string>> = {
            column: 'structure.column', foundation: 'structure.foundation', beam: 'structure.beam',
            wall: 'architecture.wall', door: 'door_window.door', window: 'door_window.window', slab: 'structure.slab',
          }
          const activeTypeMark = activeTool === 'column' ? activeColumnTypeMark
            : activeTool === 'foundation' ? activeFoundationTypeMark
              : activeTool === 'beam' ? activeBeamTypeMark
                : activeTool === 'wall' ? activeWallTypeMark
                  : activeTool === 'door' ? activeDoorTypeMark : activeTool === 'window' ? activeWindowTypeMark : activeSlabTypeMark
          const availableTypes = project.types.filter(type => type.object_type === familyByTool[activeTool])
          const label = activeTool === 'column' ? 'เสา' : activeTool === 'foundation' ? 'ฐานราก'
            : activeTool === 'beam' ? 'คาน' : activeTool === 'wall' ? 'ผนัง'
              : activeTool === 'door' ? 'ประตู' : activeTool === 'window' ? 'หน้าต่าง' : 'พื้น'
          return <TypePicker types={availableTypes} value={activeTypeMark} label={label} onChange={onChangeActiveTypeMark} onOpenCatalog={onOpenTypeManager}/>
        })()}
        {(activeTool === 'wall' || activeTool === 'beam') && <label className="cf-reference-control">
          <span>แนวอ้างอิง</span>
          <select aria-label="แนวอ้างอิงการวาง" value={placementReference} onChange={(event) => setPlacementReference(event.target.value as typeof placementReference)}>
            <option value="centerline">กึ่งกลาง</option>
            <option value="left_face">ริมซ้ายตามทิศลาก</option>
            <option value="right_face">ริมขวาตามทิศลาก</option>
          </select>
        </label>}
        {(activeTool === 'wall' || activeTool === 'beam') && <label className="cf-reference-control">
          <span>จัดแนวช่วงที่วาด</span>
          <select aria-label="ข้อจำกัดแนวการวาด" value={lineConstraintMode} onChange={(event) => setLineConstraintMode(event.target.value as typeof lineConstraintMode)}>
            <option value="auto">อัตโนมัติ: ขนาน/ตั้งฉาก</option>
            <option value="none">อิสระ</option>
            <option value="parallel">ขนานกับแนวใกล้จุดเริ่ม</option>
            <option value="perpendicular">ตั้งฉากกับแนวใกล้จุดเริ่ม</option>
          </select>
          {lineConstraintMode !== 'none' && <span className="cf-snap-hint">
            {(activeTool === 'beam' ? beamStartNode?.reference : wallStartNode?.reference)?.description
              ? `อ้างอิง: ${(activeTool === 'beam' ? beamStartNode?.reference : wallStartNode?.reference)?.description}`
              : 'เริ่มจากหรือใกล้แนวผนัง/คาน ภายใน 150 มม.'}
          </span>}
        </label>}
        {(beamStartNode || wallStartNode) && <label className="cf-reference-control">
          <span>กำหนดความยาว (ม.)</span>
          <input
            aria-label="ความยาวช่วงที่วาดเป็นเมตร"
            type="number"
            min="0.1"
            step="0.01"
            value={drawLengthMeters}
            placeholder="ตามตำแหน่งเมาส์"
            onChange={(event) => setDrawLengthMeters(event.target.value)}
          />
          <span className="cf-snap-hint">Shift ล็อกแกนนอน/ตั้ง · คลิกต่อวาดช่วงถัดไป · Esc ยกเลิก</span>
        </label>}
        <details className="cf-snap-details"><summary>Snap · {snapModes.length ? `เปิด ${snapModes.length} ประเภท` : 'วางอิสระ'} · ตั้งค่า</summary><div className="cf-snap-controls" role="group" aria-label="ประเภทจุด Snap">
          <span>Snap</span>
          {([
            ['grid', 'กริด'], ['endpoint', 'ปลาย/มุม'], ['midpoint', 'กึ่งกลาง'], ['center', 'ศูนย์กลาง'],
            ['face', 'ขอบ'], ['centerline', 'แนว'], ['intersection', 'จุดตัด'],
          ] as [SnapMode, string][]).map(([mode, label]) => <button
            key={mode}
            type="button"
            aria-pressed={snapModes.includes(mode)}
            className={snapModes.includes(mode) ? 'is-enabled' : ''}
            title={`${snapModes.includes(mode) ? 'ปิด' : 'เปิด'} Snap ${label}`}
            onClick={() => setSnapModes(current => current.includes(mode) ? current.filter(value => value !== mode) : [...current, mode])}
          >{label}</button>)}
          <span className="cf-snap-hint">Ctrl วางอิสระ · {activeTool === 'wall' || activeTool === 'beam' ? `Space เปลี่ยนแนวอ้างอิง (ขณะนี้: ${placementReference === 'centerline' ? 'กึ่งกลาง' : placementReference === 'left_face' ? 'ชิดซ้าย' : 'ชิดขวา'})` : 'เลื่อนเมาส์ให้เห็นสัญลักษณ์ก่อนคลิก'}</span>
        </div></details>
      </div>
      <div className="cf-canvas-zoom" aria-label="ควบคุมมุมมองแปลน">
        <button type="button" aria-label="ซูมออก" title="ซูมออก" onPointerDown={(event) => event.stopPropagation()} onClick={() => {
          const box = containerRef.current
          if (box) setViewport((current) => zoomAtScreenPoint(current, [box.clientWidth / 2, box.clientHeight / 2], 0.8))
        }}><ZoomOut size={16} /></button>
        <span aria-live="polite">{Math.round((viewport.zoom / 0.08) * 100)}%</span>
        <button type="button" aria-label="ซูมเข้า" title="ซูมเข้า" onPointerDown={(event) => event.stopPropagation()} onClick={() => {
          const box = containerRef.current
          if (box) setViewport((current) => zoomAtScreenPoint(current, [box.clientWidth / 2, box.clientHeight / 2], 1.25))
        }}><ZoomIn size={16} /></button>
        <button type="button" aria-label="จัดแปลนให้อยู่ในหน้าจอ" title="จัดแปลนให้อยู่ในหน้าจอ" onPointerDown={(event) => event.stopPropagation()} onClick={fitView}><Maximize2 size={15} /></button>
      </div>
    </div>
  )
}
