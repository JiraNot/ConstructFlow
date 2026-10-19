import { objectFamily } from '@constructflow/family-engine'
import { drawFamilyObject } from './familyRenderer.js'
import {
  ProjectDocument,
  SmartObject,
  isGridObject,
  isColumnObject,
  isFoundationObject,
  isBeamObject,
  isWallObject,
  isDoorObject,
  isWindowObject,
  WallModuleData,
  DoorModuleData,
  WindowModuleData,
  DoorHanding,
  SiteSurvey,
  isMasonryWallPlanHatch,
  getDisplayPhase,
  resolveCatalogType,
} from '@constructflow/project-model'
import { ViewportState, worldToScreen } from '../viewport/viewportTransform.js'
import { resolveArchitecturalFloorPatternKind, decodeStair, getStairPlanDrawing } from '@constructflow/architecture-engine'
import { SnapResult } from '@constructflow/snapping-engine'
import { constructionOutputs } from '@constructflow/domain-providers'
import { clippedGridSegments, clippedStaggeredPlankSegments, offsetPolygonOutward, polygonDiagonalHatchSegments, polygonInteriorPoint, wallMasonryHatchSegments , clippedCarpetSegments, clippedTerrazzoSegments, clippedGrassSegments} from "@constructflow/geometry-kernel"
import { formatRoomAreaM2 } from '../roomLabel.mjs'
import { getPlanWallLayerBoundaries, getPlanFinishBoundaries, structuralPlasterThickness, getPlanVisibleObjects, resolvePlanPhaseStyle, resolvePlanWallPhaseStyle } from '@constructflow/representation-engine'
import type { PlanDiscipline } from '@constructflow/representation-engine'
import { getRoofEaveBoundary, solveRoofFraming } from '@constructflow/roof-engine'
import type { RoofModuleData } from '@constructflow/project-model'
import { beginPlanLabels, queuePlanLabel, flushPlanLabels, planLabelScale } from './planLabels.js'
import { drawElectricalFixtureScreenSymbol, PLAN_GRID_BUBBLE_RADIUS_PX } from './planAnnotationSymbols.mjs'
import { DEFAULT_PLAN_LABEL_VISIBILITY, type CalibrationOverlay, type PlanLabelVisibility, type PlacementGhost, type UnderlayConfig } from './planRendererTypes.js'
export type { CalibrationOverlay, PlanLabelVisibility, PlacementGhost, UnderlayConfig } from './planRendererTypes.js'
export { DEFAULT_PLAN_LABEL_VISIBILITY } from './planRendererTypes.js'

interface CachedPlanSourceData {
  visibleObjectIds: Set<string>
  outputs: ReturnType<typeof constructionOutputs>
}

interface CachedPlanProjectGeometry {
  finishBoundaries: ReturnType<typeof getPlanFinishBoundaries>
  wallLayerBoundaries: ReturnType<typeof getPlanWallLayerBoundaries>
}

interface HostedOpeningSpan {
  width_mm: number
  center_mm: number
}

interface OpeningSpan {
  start_dist: number
  end_dist: number
}

const planSourceDataCache = new WeakMap<ProjectDocument, CachedPlanSourceData>()
const planProjectGeometryCache = new WeakMap<ProjectDocument, CachedPlanProjectGeometry>()
const hostedOpeningsByProject = new WeakMap<ProjectDocument, Map<string, HostedOpeningSpan[]>>()

function getHostedOpeningsByWall(project: ProjectDocument): Map<string, HostedOpeningSpan[]> {
  const cached = hostedOpeningsByProject.get(project)
  if (cached) return cached
  const openings = new Map<string, HostedOpeningSpan[]>()
  for (const object of Object.values(project.objects)) {
    if (!isDoorObject(object) && !isWindowObject(object)) continue
    const wallId = object.module_data.wall_id
    if (!wallId) continue
    const hosted = openings.get(wallId) ?? []
    hosted.push({ width_mm: object.module_data.width_mm, center_mm: object.module_data.offset_along_wall_mm })
    openings.set(wallId, hosted)
  }
  hostedOpeningsByProject.set(project, openings)
  return openings
}

function getCachedPlanSourceData(project: ProjectDocument): CachedPlanSourceData {
  const cached = planSourceDataCache.get(project)
  if (cached) return cached
  const value = {
    visibleObjectIds: new Set(getPlanVisibleObjects(project).map(object => object.id)),
    outputs: constructionOutputs(project),
  }
  planSourceDataCache.set(project, value)
  return value
}

function getCachedPlanProjectGeometry(project: ProjectDocument): CachedPlanProjectGeometry {
  const cached = planProjectGeometryCache.get(project)
  if (cached) return cached
  const value = {
    finishBoundaries: getPlanFinishBoundaries(project),
    wallLayerBoundaries: getPlanWallLayerBoundaries(project),
  }
  planProjectGeometryCache.set(project, value)
  return value
}

function areWorldPointsVisible(
  points: readonly (readonly number[])[],
  viewport: ViewportState,
  width: number,
  height: number,
  paddingPx = 64,
): boolean {
  if (!points.length) return false
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const point of points) {
    const [screenX, screenY] = worldToScreen([Number(point[0]), Number(point[1])], viewport)
    minX = Math.min(minX, screenX); maxX = Math.max(maxX, screenX)
    minY = Math.min(minY, screenY); maxY = Math.max(maxY, screenY)
  }
  return maxX >= -paddingPx && minX <= width + paddingPx && maxY >= -paddingPx && minY <= height + paddingPx
}

function openingValue(project: ProjectDocument, object: SmartObject, field: string, fallback: unknown) {
  const data = object.module_data as Record<string, unknown>
  const overrides = data.instance_overrides as Record<string, unknown> | undefined
  const typeId = typeof data.type_id === 'string' ? data.type_id : undefined
  const type = project.types.find(candidate => candidate.id === typeId)
    ?? project.types.find(candidate => candidate.object_type === object.object_type && candidate.name.toLowerCase() === String(data.mark ?? '').toLowerCase())
  return overrides?.[field] ?? data[field] ?? type?.parameters[field] ?? fallback
}

export function renderPlanView(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  project: ProjectDocument,
  viewport: ViewportState,
  selectedId: string | null | readonly string[],
  hoveredId: string | null,
  activeSnap: SnapResult | null,
  ghostObject: PlacementGhost | null,
  underlay?: UnderlayConfig | null,
  calibration?: CalibrationOverlay | null,
  sourceProject: ProjectDocument = project,
  labelMode: 'name' | 'name-size' = 'name-size',
  labelVisibility: PlanLabelVisibility = DEFAULT_PLAN_LABEL_VISIBILITY,
  clashes: any[] = [],
  discipline: PlanDiscipline = 'architecture'
) {
  const isSelected = (id: string) => Array.isArray(selectedId) ? selectedId.includes(id) : selectedId === id
  beginPlanLabels(ctx, viewport.zoom)
  // 1. Bright drafting canvas background
  ctx.fillStyle = '#fbfdff'
  ctx.fillRect(0, 0, width, height)

  // 2. Background CAD unit grid (1000mm major)
  drawBackgroundCadGrid(ctx, width, height, viewport)

  // 2.5 Underlay Image (Floor plan underlay / DWG with scale & opacity)
  if (underlay) {
    for (const layer of [underlay, ...(underlay.additional_layers ?? [])]) {
      if (layer.visible && layer.image) drawUnderlayImage(ctx, layer, viewport)
    }
  }

  // Site survey is the measured reference layer. Keep it above imported underlays and
  // below model geometry so parcel points remain visible without obscuring the design.
  if (sourceProject.site_survey) drawSiteSurveyOverlay(ctx, sourceProject.site_survey, width, height, viewport)

  // Active level room filtering and deduplication
  const activeLevelId = project.project.active_level_id
  const rawRooms = Object.values(project.objects).filter(obj => {
    if (obj.object_type !== 'architecture.room') return false
    const d = obj.module_data as Record<string, unknown>
    return !activeLevelId || !d.level_id || d.level_id === activeLevelId
  })
  const dedupedRoomMap = new Map<string, SmartObject>()
  for (const r of rawRooms) {
    const d = r.module_data as Record<string, unknown>
    const ring = d.boundary_mm as [number, number][] | undefined
    if (!ring || ring.length < 3) continue
    const centerKey = [
      Math.round(ring.reduce((s, p) => s + p[0], 0) / ring.length / 500) * 500,
      Math.round(ring.reduce((s, p) => s + p[1], 0) / ring.length / 500) * 500,
    ].join(',')
    const existing = dedupedRoomMap.get(centerKey)
    if (!existing) {
      dedupedRoomMap.set(centerKey, r)
    } else {
      const existingData = existing.module_data as Record<string, unknown>
      const isManual = d.boundary_source === 'manual' || (typeof d.name === 'string' && !d.name.startsWith('Room '))
      const isExistingManual = existingData.boundary_source === 'manual' || (typeof existingData.name === 'string' && !existingData.name.startsWith('Room '))
      if (isManual && !isExistingManual) {
        dedupedRoomMap.set(centerKey, r)
      }
    }
  }
  const visibleRooms = new Set(dedupedRoomMap.values())

  // Architectural finishes and room tags are separate semantic objects from structural slabs.
  for (const obj of Object.values(project.objects)) {
    const data = obj.module_data as Record<string, unknown>
    if (obj.object_type === 'architecture.room_separator') {
      const a=data.start_point_mm as [number,number],b=data.end_point_mm as [number,number]
      if(a?.length===2&&b?.length===2){const [ax,ay]=worldToScreen(a,viewport),[bx,by]=worldToScreen(b,viewport);ctx.save();ctx.strokeStyle=isSelected(obj.id)?'#087cf0':'#f59e0b';ctx.lineWidth=isSelected(obj.id)?2:1.4;ctx.setLineDash([5,3]);ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();ctx.restore()}
      continue
    }
    if (obj.object_type === 'architecture.room' && !visibleRooms.has(obj)) {
      continue
    }
    if (obj.object_type === 'architecture.floor' || obj.object_type === 'architecture.room') {
      const ring = data.boundary_mm as [number, number][] | undefined
      if (!ring || ring.length < 3) continue
      ctx.save(); ctx.beginPath()
      ring.forEach((point,index)=>{const [x,y]=worldToScreen(point,viewport);if(index===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)})
      ctx.closePath()
      if(obj.object_type==='architecture.floor'){
        const boundaryOpen=data.room_boundary_status==='unclosed',phase=getDisplayPhase(obj),phaseStyle=resolvePlanPhaseStyle(phase),voids=(Array.isArray(data.voids_mm)?data.voids_mm:[]) as [number,number][][]
        const layers = Array.isArray(data.finish_layers) ? data.finish_layers as Array<{ material?: string }> : []
        const patternKind = resolveArchitecturalFloorPatternKind(layers)
        const finishTint = patternKind === 'grass' ? 'rgba(74,139,72,.16)' : patternKind === 'staggered_plank' ? 'rgba(184,133,74,.10)' : patternKind === 'terrazzo' ? 'rgba(166,139,112,.10)' : patternKind ? 'rgba(148,163,184,.07)' : phaseStyle.fill
        ctx.fillStyle=boundaryOpen?'rgba(239,68,68,.12)':isSelected(obj.id)?'rgba(5,150,105,.22)':phase==='existing'?'rgba(148,163,184,.4)':finishTint;ctx.strokeStyle=boundaryOpen?'#dc2626':isSelected(obj.id)?'#059669':phaseStyle.stroke;ctx.lineWidth=phase==='demolition'?1.5:phase==='existing'?1:2
        ctx.setLineDash(boundaryOpen?[5,3]:phaseStyle.dash)
        for(const raw of voids){ctx.moveTo(...worldToScreen(raw[0],viewport));raw.slice(1).forEach(p=>ctx.lineTo(...worldToScreen(p,viewport)));ctx.closePath()}
        ctx.fill('evenodd');ctx.stroke();ctx.setLineDash([])
        if(phase==='demolition'){
          ctx.beginPath();ctx.strokeStyle='#ef4444';ctx.lineWidth=.75
          for(const [a,b] of polygonDiagonalHatchSegments(ring,250,voids)){const [ax,ay]=worldToScreen(a,viewport),[bx,by]=worldToScreen(b,viewport);ctx.moveTo(ax,ay);ctx.lineTo(bx,by)}
          ctx.stroke()
        }
        if (patternKind) {
          const spacing: [number, number] = Array.isArray(data.finish_pattern_mm) ? data.finish_pattern_mm as [number, number] : [600, 600]
          const origin: [number, number] = Array.isArray(data.finish_pattern_origin_mm) ? data.finish_pattern_origin_mm as [number, number] : [0, 0]
          const rotation = Number(data.finish_pattern_rotation_deg ?? 0)
          ctx.beginPath(); ctx.strokeStyle = isSelected(obj.id) ? 'rgba(5,150,105,.72)' : phase==='demolition'?'#ef4444':patternKind==='grass'?'#78956f':'#cbd5e1'; ctx.lineWidth = .7;ctx.setLineDash(phaseStyle.dash)
          const pattern = patternKind === 'grass'
              ? clippedGrassSegments(ring, Math.max(160, spacing[0] * 0.4), voids, origin, rotation)
              : patternKind === 'staggered_plank' || patternKind === 'concrete_block'
              ? clippedStaggeredPlankSegments(ring, spacing[0], spacing[1], voids, origin, rotation)
              : patternKind === 'carpet' ? clippedCarpetSegments(ring, spacing[0], voids)
              : patternKind === 'terrazzo' ? clippedTerrazzoSegments(ring, spacing[0], voids)
              : clippedGridSegments(ring, spacing[0], spacing[1], voids, origin, rotation + (patternKind === 'diagonal_tile' ? 45 : 0))
          for (const [a, b] of pattern) {
            const [ax, ay] = worldToScreen(a, viewport), [bx, by] = worldToScreen(b, viewport)
            ctx.moveTo(ax, ay); ctx.lineTo(bx, by)
          }
          ctx.stroke();ctx.setLineDash([])
        }
      }else{
        const boundaryOpen=data.boundary_status==='unclosed'
        ctx.fillStyle=boundaryOpen?'rgba(239,68,68,.08)':'rgba(148,163,184,.04)';ctx.fill();ctx.strokeStyle=boundaryOpen?'#dc2626':'#94a3b8';ctx.lineWidth=.8;ctx.setLineDash([4,3]);ctx.stroke();ctx.setLineDash([])
        const center=polygonInteriorPoint(ring) ?? [ring.reduce((s,p)=>s+p[0],0)/ring.length,ring.reduce((s,p)=>s+p[1],0)/ring.length]
        const areaLabel=formatRoomAreaM2(data.area_mm2,data.boundary_status)
        const [x,y]=worldToScreen(center,viewport)
        const labelText = `${String(data.number??'')} ${String(data.name??'Room')}${areaLabel?` · ${areaLabel} m²`:''}${boundaryOpen?' · วงผนังเปิด':''}`
        queuePlanLabel(ctx, x, y, labelText, boundaryOpen ? '#b91c1c' : '#334155', boundaryOpen ? '#fca5a5' : '#cbd5e1', isSelected(obj.id) ? 10 : 2, '#fbfdff', false, 'rect')
      }
      ctx.restore()
    }
  }

  // 3. Structural/architectural domain linework for the active level
  const { visibleObjectIds, outputs } = getCachedPlanSourceData(sourceProject)
  for (const out of outputs) {
    if (!project.objects[out.object_id] || !visibleObjectIds.has(out.object_id)) continue
    if (objectFamily(sourceProject, project.objects[out.object_id])) continue
    if (out.paths.length && !out.paths.some(path => areWorldPointsVisible(path, viewport, width, height))) continue
    const phase=out.removed_phase==='demolition'?'demolition':out.phase
    const outputObject = project.objects[out.object_id]
    const family = outputObject?.object_type ?? ''
    ctx.save();ctx.strokeStyle=isSelected(out.object_id)?'#fbbf24':phase==='demolition'?'#ef4444':phase==='existing'?'#94a3b8':family==='architecture.bathroom'?'#94a3b8':'#334155'
    ctx.lineWidth=family==='architecture.bathroom'?0.8:phase==='new_construction'?1.4:1;ctx.setLineDash(phase==='demolition'?[6,3]:[])
    if (family === 'structure.slab') {
      const data = outputObject?.module_data as Record<string, unknown> | undefined
      const boundary = data?.boundary_mm as [number, number][] | undefined
      const voids = (data?.voids_mm as [number, number][][] | undefined) ?? []
      if (boundary && boundary.length >= 3) {
        ctx.beginPath()
        for (const ring of [boundary, ...voids]) {
          ring.forEach((point, index) => {
            const [x, y] = worldToScreen(point, viewport)
            if (index === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          })
          ctx.closePath()
        }
        const finishLayers = Array.isArray(data?.finish_layers) ? data.finish_layers as Array<{ material?: string }> : []
        const patternKind = resolveArchitecturalFloorPatternKind(finishLayers)
        ctx.fillStyle = phase === 'demolition' ? 'rgba(239,68,68,.08)' : patternKind === 'grass' ? 'rgba(74,139,72,.16)' : 'rgba(148,163,184,.12)'
        ctx.fill('evenodd')
        if (patternKind) {
          const spacing: [number, number] = Array.isArray(data?.finish_pattern_mm) ? data.finish_pattern_mm as [number, number] : [600, 600]
          const origin: [number, number] = Array.isArray(data?.finish_pattern_origin_mm) ? data.finish_pattern_origin_mm as [number, number] : [0, 0]
          const rotation = Number(data?.finish_pattern_rotation_deg ?? 0)
          const segments = patternKind === 'grass'
            ? clippedGrassSegments(boundary, Math.max(160, spacing[0] * 0.4), voids, origin, rotation)
            : patternKind === 'staggered_plank' || patternKind === 'concrete_block'
            ? clippedStaggeredPlankSegments(boundary, spacing[0], spacing[1], voids, origin, rotation)
            : patternKind === 'carpet' ? clippedCarpetSegments(boundary, spacing[0], voids)
            : patternKind === 'terrazzo' ? clippedTerrazzoSegments(boundary, spacing[0], voids)
            : clippedGridSegments(boundary, spacing[0], spacing[1], voids, origin, rotation + (patternKind === 'diagonal_tile' ? 45 : 0))
          ctx.beginPath(); ctx.strokeStyle = isSelected(out.object_id) ? '#059669' : patternKind === 'grass' ? '#78956f' : '#cbd5e1'; ctx.lineWidth = .7
          for (const [a, b] of segments) { const [ax, ay] = worldToScreen(a, viewport), [bx, by] = worldToScreen(b, viewport); ctx.moveTo(ax, ay); ctx.lineTo(bx, by) }
          ctx.stroke()
        }
      }
    }
    // Triangle meshes are for 3D/quantity calculations. Projecting every triangle
    // edge into plan creates meaningless diagonals across slabs and stairs.
    let lines = out.paths
    if (outputObject?.object_type === 'structure.slab') {
      lines = out.paths.map(path => path.length ? [...path, path[0]] : path)
    }
    if (outputObject?.object_type === 'architecture.bathroom') {
      // The bathroom provider starts with one drain-to-edge slope ray per boundary
      // edge. Those rays belong in slope/3D analysis, not as plan linework. Keep the
      // actual room perimeter and tile joints in the plan.
      const data = outputObject.module_data as Record<string, unknown>
      const boundary = data.boundary_mm as [number, number][] | undefined
      const drain = data.drain_mm as [number, number] | undefined
      if (boundary?.length && drain?.length) {
        const z = Number(data.elevation_mm ?? 0) - Number(data.drop_mm ?? 0)
        const perimeter = [...boundary, boundary[0]].map(point => [point[0], point[1], z] as [number, number, number])
        const tileLines = out.paths.slice(boundary.length)
        lines = [perimeter, ...tileLines]
      }
    }
    const seen = new Set<string>()
    const drawPaths = (paths: typeof lines, color: string, width: number) => {
      ctx.strokeStyle = color
      ctx.lineWidth = width
      for (const points of paths) {
        const key = points.map(point => point.slice(0, 2).join(',')).join('|')
        if (seen.has(key)) continue
        seen.add(key)
        ctx.beginPath()
        points.forEach((point, index) => {
          const [x, y] = worldToScreen([point[0], point[1]], viewport)
          if (index) ctx.lineTo(x, y)
          else ctx.moveTo(x, y)
        })
        ctx.stroke()
      }
    }
    if (family === 'architecture.stair' && outputObject) {
      const stair = decodeStair(outputObject.module_data as Record<string, unknown>, sourceProject)
      const drawing = getStairPlanDrawing(stair, sourceProject.levels.find(l => l.id === activeLevelId)?.elevation_mm ?? stair.start_point_mm[2])
      const toPaths = (paths: [number, number][][]) => paths.map(path => path.map(([x, y]) => [x, y, stair.start_point_mm[2]] as [number, number, number]))
      ctx.setLineDash([5, 4])
      drawPaths(toPaths(drawing.overhead_paths_mm), '#94a3b8', 0.8)
      ctx.setLineDash([])
      drawPaths(toPaths(drawing.solid_paths_mm), isSelected(out.object_id) ? '#f59e0b' : '#334155', 1.2)
    } else if (family === 'architecture.bathroom' && lines.length > 0) {
      // Keep the tile layout subdued even when selected; selection belongs to the
      // room boundary, while the tile joints remain ordinary construction detail.
      drawPaths(lines.slice(0, 1), isSelected(out.object_id) ? '#f59e0b' : '#64748b', isSelected(out.object_id) ? 1.8 : 1)
      drawPaths(lines.slice(1), '#cbd5e1', 0.65)
    } else {
      drawPaths(lines, String(ctx.strokeStyle), ctx.lineWidth)
    }
    const anchor=lines[0]?.[0];if(anchor && labelVisibility.structure){const [x,y]=worldToScreen([anchor[0],anchor[1]],viewport);ctx.font='11px sans-serif';const shape=family.endsWith('.ceiling')?'ellipse':'rect';const data=outputObject?.module_data as Record<string,unknown>|undefined;const mark=family==='architecture.stair'?`${out.mark} · ${data?.level_id===activeLevelId?'ขึ้น':'ลง'}`:out.mark;queuePlanLabel(ctx,x+4,y-12,mark,isSelected(out.object_id)?'#f59e0b':String(ctx.strokeStyle),'#c7d3df',isSelected(out.object_id)?10:0,'#fbfdff',false,shape)}
    ctx.restore()
  }
  const standaloneGrids = Object.values(project.objects).filter(isGridObject).filter(object => !object.module_data.system_id)
  const autoGridTags = new Map<string, string>()
  const toAlphaTag = (index: number) => {
    let value = index + 1, tag = ''
    while (value > 0) { value--; tag = String.fromCharCode(65 + value % 26) + tag; value = Math.floor(value / 26) }
    return tag
  }
  for (const style of ['alpha', 'numeric'] as const) {
    const group = standaloneGrids.filter(object => object.module_data.bubble_visible !== false && object.module_data.auto_tag !== false && (object.module_data.sequence_style === style || (object.module_data.sequence_style !== 'alpha' && object.module_data.sequence_style !== 'numeric' && (object.module_data.orientation === 'vertical' ? 'alpha' : 'numeric') === style)))
      .sort((a, b) => {
        const point = (object: typeof a) => object.module_data.start_point_mm && object.module_data.end_point_mm
          ? [(object.module_data.start_point_mm[0] + object.module_data.end_point_mm[0]) / 2, (object.module_data.start_point_mm[1] + object.module_data.end_point_mm[1]) / 2]
          : object.module_data.orientation === 'vertical' ? [object.module_data.position_mm, (object.module_data.extent_mm[0] + object.module_data.extent_mm[1]) / 2] : [(object.module_data.extent_mm[0] + object.module_data.extent_mm[1]) / 2, object.module_data.position_mm]
        const pa = point(a), pb = point(b)
        return (a.module_data.orientation === 'vertical' ? pa[0] - pb[0] || pa[1] - pb[1] : pa[1] - pb[1] || pa[0] - pb[0]) || a.id.localeCompare(b.id)
      })
    group.forEach((object, index) => autoGridTags.set(object.id, style === 'alpha' ? toAlphaTag(index) : String(index + 1)))
  }
  for (const obj of Object.values(project.objects)) {
    if (isGridObject(obj)) {
      const displayTag = obj.module_data.system_id ? obj.module_data.tag : obj.module_data.auto_tag === false ? obj.module_data.tag : autoGridTags.get(obj.id) ?? obj.module_data.tag
      drawStructuralGrid(ctx, obj, viewport, isSelected(obj.id), hoveredId === obj.id, labelVisibility.grids && obj.module_data.bubble_visible !== false, displayTag)
    }
  }

  // 4. Foundations (rendered underneath beams and columns)
  for (const obj of Object.values(project.objects)) {
    if (isFoundationObject(obj)) {
      drawFoundation(ctx, obj, viewport, isSelected(obj.id), hoveredId === obj.id, labelVisibility.structure)
    }
  }

  // 5. Beams (rendered connecting columns/grids - enabled via beams toggle or framing plan)
  if (labelVisibility.beams) {
    for (const obj of Object.values(project.objects)) {
      if (isBeamObject(obj)) {
        drawBeam(ctx, obj, project, viewport, isSelected(obj.id), hoveredId === obj.id, labelMode, labelVisibility.structure)
      }
    }
  }

  // 6. Walls (rendered with opening cutouts)
  for (const obj of Object.values(project.objects)) {
    if (isWallObject(obj)) {
      const halfThicknessPx = Math.max(0, Number(obj.module_data.thickness_mm) * viewport.zoom / 2)
      if (!areWorldPointsVisible([obj.module_data.start_point_mm, obj.module_data.end_point_mm], viewport, width, height, 64 + halfThicknessPx)) continue
      drawWall(ctx, obj, project, viewport, isSelected(obj.id), hoveredId === obj.id, labelVisibility.walls)
    }
  }

  // 7. Windows & Doors (infill symbols on walls)
  for (const obj of Object.values(project.objects)) {
    if (isWindowObject(obj)) {
      drawWindow(ctx, obj, project, viewport, isSelected(obj.id), hoveredId === obj.id, labelVisibility.openings)
    } else if (isDoorObject(obj)) {
      drawDoor(ctx, obj, project, viewport, isSelected(obj.id), hoveredId === obj.id, labelVisibility.openings)
    }
  }

  // 8. Columns (rendered with cross hatch and human-readable mark)
  for (const obj of Object.values(project.objects)) {
    if (isColumnObject(obj)) {
      drawColumn(ctx, obj, project, viewport, isSelected(obj.id), hoveredId === obj.id, labelVisibility.structure)
    }
  }

  // 8.25 Interior cabinetry is drawn as a furniture plan symbol over the finish.
  for (const obj of Object.values(project.objects)) {
    if (obj.object_type !== 'interior.cabinet_run' || !visibleObjectIds.has(obj.id)) continue
    if (!drawFamilyObject(ctx, sourceProject, obj, viewport, isSelected(obj.id), hoveredId === obj.id)) drawCabinetPlanSymbol(ctx, obj, viewport, isSelected(obj.id), hoveredId === obj.id)
  }
  for (const obj of Object.values(project.objects)) {
    if (!objectFamily(sourceProject, obj) || obj.object_type === 'interior.cabinet_run' || !visibleObjectIds.has(obj.id)) continue
    drawFamilyObject(ctx, sourceProject, obj, viewport, isSelected(obj.id), hoveredId === obj.id)
  }

  // 8.5 Roof framing is an explicit structural plan discipline, so the roof
  // footprint can stay hidden while its rafters, purlins and trusses remain editable.
  if (discipline === 'framing') {
    for (const obj of Object.values(project.objects)) {
      if (obj.object_type === 'roof.system') {
        drawRoofFraming(ctx, obj, project, viewport, isSelected(obj.id), hoveredId === obj.id, labelVisibility.structure)
      }
    }
  }

  const { finishBoundaries, wallLayerBoundaries } = getCachedPlanProjectGeometry(project)
  for (const boundary of finishBoundaries) {
    const style = resolvePlanPhaseStyle(boundary.phase)
    ctx.save(); ctx.strokeStyle = style.stroke; ctx.lineWidth = boundary.phase === 'new_construction' ? 2 : 1.5; ctx.setLineDash(style.dash); ctx.beginPath()
    for (const [a, b] of boundary.segments_mm) { const [ax, ay] = worldToScreen(a, viewport), [bx, by] = worldToScreen(b, viewport); ctx.moveTo(ax, ay); ctx.lineTo(bx, by) }
    ctx.stroke(); ctx.restore()
  }
  for (const boundary of wallLayerBoundaries) {
    ctx.save(); ctx.strokeStyle = boundary.phase === 'demolition' ? '#fca5a5' : '#a3adb8'; ctx.lineWidth = 1; ctx.beginPath()
    for (const [a, b] of boundary.segments_mm) { const [ax, ay] = worldToScreen(a, viewport), [bx, by] = worldToScreen(b, viewport); ctx.moveTo(ax, ay); ctx.lineTo(bx, by) }
    ctx.stroke(); ctx.restore()
  }
  // 9. Placement Ghost Preview
  if (ghostObject) {
    drawPlacementGhost(ctx, ghostObject, viewport, project)
  }

  // 10. Snap Target Indicator
  if (activeSnap && activeSnap.kind !== 'free') {
    drawSnapMarker(ctx, activeSnap, viewport)
  }

  // 10.5 Render Hard & Soft Clashes
  if (clashes && clashes.length > 0) {
    for (const clash of clashes) {
      const objA = project.objects[clash.interaction.first.object_id]
      const objB = project.objects[clash.interaction.second.object_id]
      if (!objA || !objB) continue
      
      const isClearance = clash.severity === 'clearance'
      const blinkAlpha = 0.5 + 0.5 * Math.sin(Date.now() / 150)
      ctx.strokeStyle = isClearance ? `rgba(245, 158, 11, ${blinkAlpha})` : `rgba(239, 68, 68, ${blinkAlpha})`
      ctx.fillStyle = isClearance ? `rgba(245, 158, 11, 0.2)` : `rgba(239, 68, 68, 0.2)`
      ctx.lineWidth = 3

      // Draw bounding box overlap as clash indicator
      const boundsA = clash.interaction.first.bounds
      const boundsB = clash.interaction.second.bounds
      const minX = Math.max(boundsA.min[0], boundsB.min[0])
      const minY = Math.max(boundsA.min[1], boundsB.min[1])
      const maxX = Math.min(boundsA.max[0], boundsB.max[0])
      const maxY = Math.min(boundsA.max[1], boundsB.max[1])
      
      // Add padding to make it visible even if flat
      const [sx1, sy1] = worldToScreen([minX - 50, minY - 50], viewport)
      const [sx2, sy2] = worldToScreen([maxX + 50, maxY + 50], viewport)

      ctx.save()
      ctx.setLineDash([10, 5])
      ctx.beginPath()
      ctx.rect(sx1, sy1, sx2 - sx1, sy2 - sy1)
      ctx.fill()
      ctx.stroke()

      // Draw floating clash label
      ctx.fillStyle = isClearance ? 'rgba(217, 119, 6, 0.9)' : 'rgba(220, 38, 38, 0.9)'
      ctx.setLineDash([])
      ctx.fillRect(sx2, sy2 - 20, 160, 24)
      ctx.fillStyle = 'white'
      ctx.font = 'bold 10px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(isClearance ? '⚠️ CLEARANCE CLASH' : '🚨 HARD CLASH', sx2 + 8, sy2 - 8)
      ctx.restore()
    }
  }

  // Electrical symbols use screen-sized marks independent of model zoom.
  for (const obj of Object.values(project.objects)) {
    if (obj.object_type !== 'electrical.fixture' || obj.removed_phase !== null || obj.status === 'archived') continue
    const data = obj.module_data as Record<string, unknown>
    const location = data.location_mm
    if (!Array.isArray(location) || !Number.isFinite(Number(location[0])) || !Number.isFinite(Number(location[1]))) continue
    const [x, y] = worldToScreen([Number(location[0]), Number(location[1])], viewport)
    drawElectricalFixtureScreenSymbol(ctx, x, y, data.kind)
  }

  // 11. Calibration Overlay (Point-to-Point Scale Measure)
  if (calibration && (calibration.point1_mm || calibration.point2_mm)) {
    drawCalibrationOverlay(ctx, calibration, viewport)
  }
  flushPlanLabels(ctx, width, height)
}

function drawSiteSurveyOverlay(
  ctx: CanvasRenderingContext2D,
  survey: SiteSurvey,
  width: number,
  height: number,
  viewport: ViewportState,
) {
  const points = new Map(survey.points.map(point => [point.id, point]))
  const screenPoints = new Map(survey.points.map(point => [point.id, worldToScreen([point.x_mm, point.y_mm], viewport)]))
  const visible = ([x, y]: [number, number]) => x >= -24 && x <= width + 24 && y >= -24 && y <= height + 24

  ctx.save()
  for (const boundary of survey.boundaries) {
    const ring = boundary.point_ids.map(id => points.get(id)).filter((point): point is SiteSurvey['points'][number] => !!point)
    if (ring.length < 3) continue
    ctx.beginPath()
    ring.forEach((point, index) => {
      const [x, y] = worldToScreen([point.x_mm, point.y_mm], viewport)
      if (index === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.closePath()
    ctx.strokeStyle = ring.every(point => point.source_status === 'measured') ? '#0284c7' : '#d97706'
    ctx.lineWidth = 2
    ctx.setLineDash(ring.every(point => point.source_status === 'measured') ? [] : [8, 5])
    ctx.stroke()
    ctx.setLineDash([])
    const anchor = screenPoints.get(ring[0].id)
    if (anchor && visible(anchor)) {
      ctx.font = '600 11px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'bottom'
      ctx.fillStyle = '#0f172a'
      ctx.fillText(boundary.name, anchor[0] + 7, anchor[1] - 7)
    }
  }

  for (const point of survey.points) {
    const position = screenPoints.get(point.id)!
    if (!visible(position)) continue
    const measured = point.source_status === 'measured'
    const color = measured ? '#0284c7' : '#d97706'
    ctx.beginPath()
    if (measured) {
      ctx.arc(position[0], position[1], 5, 0, Math.PI * 2)
    } else {
      ctx.moveTo(position[0], position[1] - 6)
      ctx.lineTo(position[0] + 6, position[1] + 5)
      ctx.lineTo(position[0] - 6, position[1] + 5)
      ctx.closePath()
    }
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.fill()
    ctx.stroke()
    if (viewport.zoom >= 0.025) {
      const elevation = point.elevation_mm === undefined ? '' : ` · ${(point.elevation_mm / 1000).toFixed(3)} m`
      ctx.font = '11px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillStyle = '#0f172a'
      ctx.fillText(`${point.name}${elevation}`, position[0] + 8, position[1] + 7)
    }
  }

  ctx.fillStyle = 'rgba(255,255,255,.94)'
  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = 1
  ctx.fillRect(12, 12, 190, 42)
  ctx.strokeRect(12, 12, 190, 42)
  ctx.font = '600 11px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#334155'
  ctx.fillText('สำรวจ · วัดจริง', 24, 26)
  ctx.fillStyle = '#0284c7'
  ctx.beginPath(); ctx.arc(16, 26, 4, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#334155'
  ctx.fillText('ประมาณ · สมมติ', 24, 42)
  ctx.fillStyle = '#d97706'
  ctx.beginPath(); ctx.moveTo(16, 37); ctx.lineTo(21, 46); ctx.lineTo(11, 46); ctx.closePath(); ctx.fill()
  ctx.restore()
}

/** Draws a non-destructive drag candidate above the committed model geometry. */
export function drawDirectManipulationGhost(
  ctx: CanvasRenderingContext2D,
  project: ProjectDocument,
  candidate: ProjectDocument,
  objectIds: readonly string[],
  viewport: ViewportState,
  valid: boolean,
  discipline: PlanDiscipline = 'architecture',
) {
  const accent = valid ? '#0284c7' : '#dc2626'
  const ids = [...new Set(objectIds)]
  const point2 = (value: unknown): [number, number] => Array.isArray(value)
    ? [Number(value[0] ?? 0), Number(value[1] ?? 0)]
    : [0, 0]
  ctx.save()
  ctx.globalAlpha = 0.62
  ctx.strokeStyle = accent
  ctx.fillStyle = valid ? 'rgba(2,132,199,.17)' : 'rgba(220,38,38,.16)'
  ctx.lineWidth = 2.5
  ctx.setLineDash(valid ? [] : [7, 4])

  for (const id of ids) {
    const object = candidate.objects[id]
    if (!object || object.status === 'archived') continue
    if (drawFamilyObject(ctx, candidate, object, viewport, true, false)) continue
    if (isWallObject(object)) {
      drawWall(ctx, object, candidate, viewport, false, false, false)
    } else if (isColumnObject(object)) {
      drawColumn(ctx, object, candidate, viewport, false, false, false)
    } else if (isFoundationObject(object)) {
      drawFoundation(ctx, object, viewport, false, false, false)
    } else if (isBeamObject(object)) {
      drawBeam(ctx, object, candidate, viewport, false, false, 'name', false)
    } else if (isDoorObject(object)) {
      drawDoor(ctx, object, candidate, viewport, false, false, false)
    } else if (isWindowObject(object)) {
      drawWindow(ctx, object, candidate, viewport, false, false, false)
    }

    const data = object.module_data as Record<string, unknown>
    const drawRing = (ring: unknown, close = true, fill = true) => {
      if (!Array.isArray(ring) || ring.length < 2) return false
      ctx.beginPath()
      ring.forEach((raw, index) => {
        if (!Array.isArray(raw) || !Number.isFinite(Number(raw[0])) || !Number.isFinite(Number(raw[1]))) return
        const [x, y] = worldToScreen([Number(raw[0]), Number(raw[1])], viewport)
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      })
      if (close) ctx.closePath()
      if (close && fill) ctx.fill('evenodd')
      ctx.stroke()
      return true
    }

    if (isWallObject(object) || isBeamObject(object)) {
      const start = data.start_point_mm as number[] | undefined, end = data.end_point_mm as number[] | undefined
      if (start && end) {
        const [a, b] = [worldToScreen([start[0], start[1]], viewport), worldToScreen([end[0], end[1]], viewport)]
        ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.strokeStyle = accent
        ctx.lineWidth = Math.max(3, Number(isWallObject(object) ? data.thickness_mm : (data.section_mm as number[] | undefined)?.[0] ?? 100) * viewport.zoom + 2)
        ctx.globalAlpha = 0.36; ctx.stroke(); ctx.globalAlpha = 0.9
        ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke()
      }
    } else if (isColumnObject(object) || isFoundationObject(object)) {
      const center = point2(isColumnObject(object) ? data.location_mm : data.center_mm)
      const size = point2(isColumnObject(object) ? data.section_mm : data.size_mm)
      const rotation = Number(isColumnObject(object) ? data.rotation_deg ?? 0 : 0) * Math.PI / 180
      const ring = [[-size[0]/2,-size[1]/2],[size[0]/2,-size[1]/2],[size[0]/2,size[1]/2],[-size[0]/2,size[1]/2]].map(([x,y]) => [center[0]+x*Math.cos(rotation)-y*Math.sin(rotation),center[1]+x*Math.sin(rotation)+y*Math.cos(rotation)])
      drawRing(ring)
    } else if (isDoorObject(object) || isWindowObject(object)) {
      const host = candidate.objects[String(data.wall_id)]
      const hostData = host?.module_data as Record<string, unknown> | undefined
      const start = hostData?.start_point_mm as number[] | undefined, end = hostData?.end_point_mm as number[] | undefined
      const center = data.location_mm as number[] | undefined
      const width = Number(data.width_mm ?? 800)
      if (start && end && center) {
        const length = Math.hypot(end[0]-start[0],end[1]-start[1])
        if (length > 0) {
          const ux=(end[0]-start[0])/length,uy=(end[1]-start[1])/length,nx=-uy,ny=ux
          const half=width/2,thickness=Number(hostData?.thickness_mm??100)/2
          const ring=[[-half,-thickness],[half,-thickness],[half,thickness],[-half,thickness]].map(([x,y])=>[center[0]+ux*x+nx*y,center[1]+uy*x+ny*y])
          drawRing(ring)
        }
      }
    } else if (isGridObject(object)) {
      const grid = object.module_data
      const before = project.objects[id]
      if (before && isGridObject(before) && before.module_data.position_mm === grid.position_mm && JSON.stringify(before.module_data.start_point_mm) === JSON.stringify(grid.start_point_mm) && JSON.stringify(before.module_data.end_point_mm) === JSON.stringify(grid.end_point_mm)) continue
      const start = grid.start_point_mm ?? (grid.orientation === 'vertical' ? [grid.position_mm, grid.extent_mm[0]] : [grid.extent_mm[0], grid.position_mm])
      const end = grid.end_point_mm ?? (grid.orientation === 'vertical' ? [grid.position_mm, grid.extent_mm[1]] : [grid.extent_mm[1], grid.position_mm])
      ctx.strokeStyle = accent; ctx.lineWidth = 2.5
      drawRing([start, end], false, false)
    } else if (object.object_type === 'architecture.stair') {
      const stair = decodeStair(data, candidate)
      const levelElevation = candidate.levels.find(level => level.id === stair.level_id)?.elevation_mm ?? stair.start_point_mm[2]
      const drawing = getStairPlanDrawing(stair, levelElevation)
      for (const path of [...drawing.solid_paths_mm, ...drawing.overhead_paths_mm]) drawRing(path, false, false)
    } else if (object.object_type === 'roof.system' && discipline === 'framing') {
      drawRoofFraming(ctx, object, candidate, viewport, false, false, false, accent)
    } else if (Array.isArray(data.boundary_mm)) {
      const boundary = object.object_type === 'roof.system'
        ? offsetPolygonOutward(data.boundary_mm as [number, number][], Number(data.eaves_overhang_mm ?? 0)) ?? data.boundary_mm
        : data.boundary_mm
      drawRing(boundary)
      const voids = data.voids_mm
      if (Array.isArray(voids)) for (const ring of voids) drawRing(ring, true, false)
    } else if (object.object_type === 'interior.cabinet_run') {
      drawCabinetPlanSymbol(ctx, object, viewport, true, false)
    } else if (Array.isArray(data.start_point_mm) && Array.isArray(data.end_point_mm)) {
      drawRing([data.start_point_mm, data.end_point_mm], false)
    } else {
      const path = Array.isArray(data.path_mm) ? data.path_mm : Array.isArray(data.nodes_mm) ? data.nodes_mm : null
      if (path) drawRing(path, false)
      else if (Array.isArray(data.location_mm)) {
        const [x, y] = worldToScreen([Number(data.location_mm[0]), Number(data.location_mm[1])], viewport)
        ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      }
    }
  }
  ctx.setLineDash([])
  ctx.restore()
}

function drawRoofFraming(
  ctx: CanvasRenderingContext2D,
  object: SmartObject,
  project: ProjectDocument,
  viewport: ViewportState,
  selected: boolean,
  hovered: boolean,
  showLabel: boolean,
  accent?: string,
) {
  const data = object.module_data as Record<string, unknown>
  const roofType = resolveCatalogType(project, 'roof.system', typeof data.type_id === 'string' ? data.type_id : String(data.mark ?? ''))
  const overrides = data.instance_overrides && typeof data.instance_overrides === 'object'
    ? data.instance_overrides as Record<string, unknown>
    : {}
  // Module data owns the footprint and instance geometry; catalog dimensions feed
  // framing when there is no instance override, matching the property inspector.
  const roof = { ...data, ...roofType?.parameters, ...overrides } as unknown as RoofModuleData
  try {
    const boundary = getRoofEaveBoundary(roof)
    const members = solveRoofFraming(roof).members
    const colors: Record<string, string> = {
      rafter: '#0f766e', purlin: '#475569', truss_top_chord: '#1d4ed8',
      truss_bottom_chord: '#7c3aed', truss_web: '#9333ea',
    }
    ctx.save()
    ctx.globalAlpha = selected ? 0.95 : hovered ? 0.8 : 0.74
    ctx.strokeStyle = accent ?? (selected ? '#f59e0b' : '#64748b')
    ctx.lineWidth = selected ? 2 : 1
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    boundary.forEach((point, index) => {
      const [x, y] = worldToScreen(point, viewport)
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    })
    ctx.closePath(); ctx.stroke(); ctx.setLineDash([])
    for (const member of members) {
      const [a, b] = [
        worldToScreen([member.start_point_mm[0], member.start_point_mm[1]], viewport),
        worldToScreen([member.end_point_mm[0], member.end_point_mm[1]], viewport),
      ]
      ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b)
      ctx.strokeStyle = accent ?? colors[member.role] ?? '#334155'
      ctx.lineWidth = selected ? 2.25 : Math.max(0.8, Math.min(3, member.section_mm[0] * viewport.zoom))
      ctx.stroke()
    }
    ctx.restore()

    if (showLabel && boundary.length && members.length) {
      const center: [number, number] = [
        boundary.reduce((sum, point) => sum + point[0], 0) / boundary.length,
        boundary.reduce((sum, point) => sum + point[1], 0) / boundary.length,
      ]
      const [x, y] = worldToScreen(center, viewport)
      const rafters = members.filter(member => member.role === 'rafter').length
      const purlins = members.filter(member => member.role === 'purlin').length
      const trusses = new Set(members.filter(member => member.role === 'truss_bottom_chord').map(member => member.start_point_mm.join(','))).size
      queuePlanLabel(ctx, x, y, `${String(data.mark ?? 'R1')} · จันทัน ${rafters} · แป ${purlins}${trusses ? ` · ทรัส ${trusses}` : ''}`, selected ? '#b45309' : '#334155', '#c7d3df', selected ? 10 : 2, '#fbfdff', false, 'rect')
    }
  } catch {
    // A malformed legacy roof should not prevent the rest of the plan from drawing.
  }
}

function drawBackgroundCadGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  viewport: ViewportState
) {
  const step_mm = 1000 // 1 meter grid
  const screenStep = step_mm * viewport.zoom

  if (screenStep < 25) return // Too dense to render legibly

  const startWorldX = (-viewport.panX) / viewport.zoom
  const startWorldY = (-viewport.panY) / viewport.zoom
  const endWorldX = (width - viewport.panX) / viewport.zoom
  const endWorldY = (height - viewport.panY) / viewport.zoom

  const firstGridX = Math.floor(startWorldX / step_mm) * step_mm
  const firstGridY = Math.floor(startWorldY / step_mm) * step_mm

  ctx.strokeStyle = '#e5ebf2'
  ctx.lineWidth = 1
  ctx.beginPath()

  for (let x = firstGridX; x <= endWorldX; x += step_mm) {
    const [sx] = worldToScreen([x, 0], viewport)
    ctx.moveTo(sx, 0)
    ctx.lineTo(sx, height)
  }

  for (let y = firstGridY; y <= endWorldY; y += step_mm) {
    const [, sy] = worldToScreen([0, y], viewport)
    ctx.moveTo(0, sy)
    ctx.lineTo(width, sy)
  }

  ctx.stroke()
}

function drawUnderlayImage(
  ctx: CanvasRenderingContext2D,
  underlay: UnderlayConfig,
  viewport: ViewportState
) {
  if (!underlay.image || !underlay.visible) return

  ctx.save()
  ctx.globalAlpha = Math.max(0.05, Math.min(1, underlay.opacity))

  const [origX, origY] = underlay.origin_mm
  const [sx, sy] = worldToScreen([origX, origY], viewport)
  const imgW = underlay.image.naturalWidth || underlay.image.width
  const imgH = underlay.image.naturalHeight || underlay.image.height

  const screenW = imgW * underlay.scale_mm_per_px * viewport.zoom
  const screenH = imgH * underlay.scale_mm_per_px * viewport.zoom
  const rotation = -(underlay.rotation_deg ?? 0) * Math.PI / 180
  ctx.translate(sx, sy)
  ctx.rotate(rotation)
  ctx.drawImage(underlay.image, 0, 0, screenW, screenH)

  // Subtle boundary outline
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)'
  ctx.lineWidth = 1
  ctx.setLineDash([6, 6])
  ctx.strokeRect(0, 0, screenW, screenH)
  ctx.setLineDash([])

  // Header badge
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'
  ctx.fillRect(0, -20, 210, 20)
  ctx.fillStyle = '#38bdf8'
  ctx.font = 'bold 10px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(`📐 Underlay (1px = ${underlay.scale_mm_per_px.toFixed(2)} mm)`, 6, -10)

  ctx.restore()
}

function drawStructuralGrid(
  ctx: CanvasRenderingContext2D,
  obj: ReturnType<typeof isGridObject> extends true ? any : SmartObject<any>,
  viewport: ViewportState,
  isSelected: boolean,
  isHovered: boolean,
  showLabel: boolean,
  displayTag = obj.module_data.tag
) {
  const { tag, orientation, position_mm, extent_mm } = obj.module_data
  const extent = extent_mm || [-10000, 15000]

  ctx.save()
  ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2 : 1.2
  ctx.strokeStyle = isSelected ? '#38bdf8' : isHovered ? '#7dd3fc' : '#64748b'
  ctx.setLineDash([8, 4, 2, 4]) // Long-dash, dot, dash

  let bubbleX = 0
  let bubbleY = 0

  if (obj.module_data.start_point_mm && obj.module_data.end_point_mm) {
    const [x1, y1] = worldToScreen(obj.module_data.start_point_mm, viewport)
    const [x2, y2] = worldToScreen(obj.module_data.end_point_mm, viewport)
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    bubbleX = x1
    bubbleY = y1
  } else if (orientation === 'vertical') {
    const [sX] = worldToScreen([position_mm, 0], viewport)
    const [, sY1] = worldToScreen([0, extent[0]], viewport)
    const [, sY2] = worldToScreen([0, extent[1]], viewport)
    ctx.beginPath()
    ctx.moveTo(sX, sY1)
    ctx.lineTo(sX, sY2)
    ctx.stroke()

    bubbleX = sX
    bubbleY = Math.min(sY1, sY2) - 20
  } else {
    const [, sY] = worldToScreen([0, position_mm], viewport)
    const [sX1] = worldToScreen([extent[0], 0], viewport)
    const [sX2] = worldToScreen([extent[1], 0], viewport)
    ctx.beginPath()
    ctx.moveTo(sX1, sY)
    ctx.lineTo(sX2, sY)
    ctx.stroke()

    bubbleX = Math.min(sX1, sX2) - 20
    bubbleY = sY
  }

  ctx.setLineDash([])

  if (!showLabel) { ctx.restore(); return }
  // Draw the graphic and tag together on the screen-space layer.
  const radius = PLAN_GRID_BUBBLE_RADIUS_PX
  const baseTransform = ctx.getTransform()
  ctx.save()
  ctx.setTransform(baseTransform.a, baseTransform.b, baseTransform.c, baseTransform.d, baseTransform.e, baseTransform.f)
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = isSelected ? '#38bdf8' : '#94a3b8'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(bubbleX, bubbleY, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#33465b'
  ctx.font = 'bold 12px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(displayTag, bubbleX, bubbleY)
  ctx.restore()
  ctx.restore()
}

function drawFoundation(
  ctx: CanvasRenderingContext2D,
  obj: ReturnType<typeof isFoundationObject> extends true ? any : SmartObject<any>,
  viewport: ViewportState,
  isSelected: boolean,
  isHovered: boolean,
  showLabel: boolean
) {
  const { mark, center_mm, size_mm } = obj.module_data
  const [cx, cy] = center_mm
  const [w_mm, l_mm] = size_mm

  const half_w = w_mm / 2
  const half_l = l_mm / 2

  const [minX, minY] = worldToScreen([cx - half_w, cy - half_l], viewport)
  const [maxX, maxY] = worldToScreen([cx + half_w, cy + half_l], viewport)
  const screenW = maxX - minX
  const screenH = maxY - minY

  ctx.save()
  // Dashed structural footing outline
  ctx.setLineDash([5, 5])
  ctx.strokeStyle = isSelected ? '#38bdf8' : isHovered ? '#60a5fa' : '#64748b'
  ctx.lineWidth = isSelected ? 2 : 1.5
  ctx.fillStyle = 'rgba(226, 232, 240, 0.72)'

  ctx.beginPath()
  ctx.rect(minX, minY, screenW, screenH)
  ctx.fill()
  ctx.stroke()

  // Mark label (e.g. F1) at bottom-right or top-left of footing
  ctx.setLineDash([])
  ctx.fillStyle = isSelected ? '#0876d1' : '#64748b'
  ctx.font = 'bold 10px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  const text = mark || 'F1'
  // Tuck footing marks into the lower-left edge of the footing outline. This
  // keeps them beside their own footing instead of colliding with the column
  // mark directly above and being moved into a distant screen-space lane.
  if (showLabel) queuePlanLabel(ctx, minX + 8, maxY - 8, text, '#64748b', '#c7d3df', isSelected ? 10 : 3)

  ctx.restore()
}

function drawColumn(
  ctx: CanvasRenderingContext2D,
  obj: ReturnType<typeof isColumnObject> extends true ? any : SmartObject<any>,
  project: ProjectDocument,
  viewport: ViewportState,
  isSelected: boolean,
  isHovered: boolean,
  showLabel: boolean
) {
  const { mark, location_mm, section_mm } = obj.module_data
  const [cx, cy] = location_mm
  const [w_mm, d_mm] = section_mm

  const half_w = w_mm / 2
  const half_d = d_mm / 2

  const [minX, minY] = worldToScreen([cx - half_w, cy - half_d], viewport)
  const [maxX, maxY] = worldToScreen([cx + half_w, cy + half_d], viewport)
  const screenW = maxX - minX
  const screenH = maxY - minY

  ctx.save()

  const displayPhase = getDisplayPhase(obj)
  const phaseStyle = resolvePlanPhaseStyle(displayPhase)

  const plaster = structuralPlasterThickness(project, obj)
  if (plaster > 0) {
    const [px, py] = worldToScreen([cx - half_w - plaster, cy - half_d - plaster], viewport)
    const [qx, qy] = worldToScreen([cx + half_w + plaster, cy + half_d + plaster], viewport)
    ctx.fillStyle = phaseStyle.fill; ctx.fillRect(px, py, qx - px, qy - py)
  }
  // Column solid fill
  ctx.fillStyle = displayPhase === 'existing' ? 'rgba(148, 163, 184, 0.4)' : phaseStyle.fill
  ctx.fillRect(minX, minY, screenW, screenH)

  // Architectural cross hatch inside column
  ctx.strokeStyle = displayPhase === 'demolition' ? '#ef4444' : displayPhase === 'existing' ? '#94a3b8' : '#9aa6b4'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(minX, minY)
  ctx.lineTo(maxX, maxY)
  ctx.moveTo(maxX, minY)
  ctx.lineTo(minX, maxY)
  ctx.stroke()

  // Outline
  ctx.strokeStyle = isSelected ? '#1682e8' : isHovered ? '#60a5fa' : phaseStyle.stroke
  ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2 : displayPhase === 'demolition' ? 1.5 : displayPhase === 'existing' ? 1 : 2
  ctx.setLineDash(phaseStyle.dash)
  ctx.strokeRect(minX, minY, screenW, screenH)
  ctx.setLineDash([])

  // Human-readable Mark tag (e.g. "C01") rendered above column
  ctx.fillStyle = isSelected ? '#0876d1' : '#33465b'
  ctx.font = 'bold 11px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  const name = mark || 'วัตถุ'
  if (showLabel) queuePlanLabel(ctx, (minX + maxX) / 2, minY - 12, name, '#33465b', '#c7d3df', isSelected ? 10 : 2)

  ctx.restore()
}

function drawBeam(
  ctx: CanvasRenderingContext2D,
  obj: ReturnType<typeof isBeamObject> extends true ? any : SmartObject<any>,
  project: ProjectDocument,
  viewport: ViewportState,
  isSelected: boolean,
  isHovered: boolean,
  labelMode: 'name' | 'name-size',
  showLabel: boolean
) {
  const { mark, start_point_mm, end_point_mm, section_mm, span_mm } = obj.module_data
  const [w_mm, d_mm] = section_mm || [200, 400]

  const [sx1, sy1] = worldToScreen([start_point_mm[0], start_point_mm[1]], viewport)
  const [sx2, sy2] = worldToScreen([end_point_mm[0], end_point_mm[1]], viewport)

  const dx = sx2 - sx1
  const dy = sy2 - sy1
  const len = Math.hypot(dx, dy)
  if (len < 1) return

  const nx = -dy / len
  const ny = dx / len
  const half_w_px = (w_mm * viewport.zoom) / 2

  ctx.save()

  const displayPhase = getDisplayPhase(obj)
  const phaseStyle = resolvePlanPhaseStyle(displayPhase)

  // 1. Fill beam body
  ctx.beginPath()
  ctx.moveTo(sx1 + nx * half_w_px, sy1 + ny * half_w_px)
  ctx.lineTo(sx2 + nx * half_w_px, sy2 + ny * half_w_px)
  ctx.lineTo(sx2 - nx * half_w_px, sy2 - ny * half_w_px)
  ctx.lineTo(sx1 - nx * half_w_px, sy1 - ny * half_w_px)
  ctx.closePath()

  ctx.fillStyle = isSelected
    ? 'rgba(14, 165, 233, 0.35)'
    : isHovered
    ? 'rgba(56, 189, 248, 0.25)'
    : displayPhase === 'existing'
    ? 'rgba(148, 163, 184, 0.4)'
    : phaseStyle.fill
  ctx.fill()

  // 2. Stroke beam boundary
  ctx.strokeStyle = isSelected
    ? '#38bdf8'
    : isHovered
    ? '#7dd3fc'
    : phaseStyle.stroke
  ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2 : displayPhase === 'demolition' ? 1.5 : displayPhase === 'existing' ? 1 : 2
  ctx.setLineDash(phaseStyle.dash)
  ctx.stroke()
  ctx.setLineDash([])

  // 3. Centerline
  ctx.beginPath()
  ctx.setLineDash([4, 4])
  ctx.strokeStyle = isSelected ? '#0876d1' : '#8497aa'
  ctx.lineWidth = 1
  ctx.moveTo(sx1, sy1)
  ctx.lineTo(sx2, sy2)
  ctx.stroke()
  ctx.setLineDash([])

  // 4. Place the beam tag in the longest clear run, away from hosted doors
  // and windows. The opening cutout is drawn over the beam, so a midpoint tag
  // would otherwise sit directly on top of its frame and glazing lines.
  const label = mark || 'B1'
  const size = `${w_mm}×${d_mm}`
  const text = labelMode === 'name-size' ? `${label} ${size}` : label
  ctx.font = 'bold 10px monospace'
  const labelHalfWidthMm = (ctx.measureText(text).width / viewport.zoom) / 2 + 100
  const worldLength = Math.hypot(end_point_mm[0] - start_point_mm[0], end_point_mm[1] - start_point_mm[1])
  const uxWorld = (end_point_mm[0] - start_point_mm[0]) / worldLength
  const uyWorld = (end_point_mm[1] - start_point_mm[1]) / worldLength
  const blocked: Array<[number, number]> = []
  for (const opening of Object.values(project.objects)) {
    if (!isDoorObject(opening) && !isWindowObject(opening)) continue
    const openingData = opening.module_data as DoorModuleData | WindowModuleData
    const host = project.objects[openingData.wall_id]
    if (!host || !isWallObject(host)) continue
    const [hx, hy] = host.module_data.start_point_mm
    const [h2x, h2y] = host.module_data.end_point_mm
    const hostLength = Math.hypot(h2x - hx, h2y - hy)
    if (hostLength < 1) continue
    const centerX = hx + (h2x - hx) / hostLength * openingData.offset_along_wall_mm
    const centerY = hy + (h2y - hy) / hostLength * openingData.offset_along_wall_mm
    const deltaX = centerX - start_point_mm[0]
    const deltaY = centerY - start_point_mm[1]
    const along = deltaX * uxWorld + deltaY * uyWorld
    const lateral = Math.abs(deltaX * uyWorld - deltaY * uxWorld)
    if (lateral > Math.max(w_mm / 2 + 500, 600)) continue
    const halfOpening = Math.max(0, Number(openingData.width_mm) || 0) / 2
    const margin = halfOpening + labelHalfWidthMm
    const from = Math.max(0, along - margin)
    const to = Math.min(worldLength, along + margin)
    if (to > from) blocked.push([from, to])
  }
  blocked.sort((a, b) => a[0] - b[0])
  const clearRuns: Array<[number, number]> = []
  let cursor = 0
  for (const [from, to] of blocked) {
    if (from > cursor) clearRuns.push([cursor, from])
    cursor = Math.max(cursor, to)
  }
  if (cursor < worldLength) clearRuns.push([cursor, worldLength])
  const usableRuns = clearRuns.filter(([from, to]) => to - from >= labelHalfWidthMm * 2)
  const labelRun = usableRuns.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0]
  const labelT = labelRun ? ((labelRun[0] + labelRun[1]) / 2) / worldLength : 0.5
  const mx = sx1 + dx * labelT
  const my = sy1 + dy * labelT
  let angle = Math.atan2(dy, dx)
  if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
    angle += Math.PI
  }

  ctx.save()
  const base = ctx.getTransform()
  ctx.setTransform(base.a, base.b, base.c, base.d, base.e, base.f)
  ctx.translate(mx, my)
  ctx.rotate(angle)

  // Label badge
  if (showLabel) queuePlanLabel(ctx, 0, -18, text, isSelected ? '#0876d1' : '#33465b', isSelected ? '#1682e8' : '#c7d3df', isSelected ? 10 : isHovered ? 8 : 1, '#fbfdff', true)

  ctx.restore()
  ctx.restore()
}

function drawCabinetPlanSymbol(ctx: CanvasRenderingContext2D, object: SmartObject, viewport: ViewportState, selected: boolean, hovered: boolean) {
  const data = object.module_data as import('@constructflow/project-model').CabinetModuleData
  const [x, y] = data.location_mm
  const width = Number(data.width_mm), depth = Number(data.depth_mm), rotation = Number(data.rotation_deg ?? 0) * Math.PI / 180
  if (![x, y, width, depth, rotation].every(Number.isFinite) || width <= 0 || depth <= 0) return
  const c = Math.cos(rotation), s = Math.sin(rotation)
  const world = ([u, v]: [number, number]): [number, number] => [x + u * c - v * s, y + u * s + v * c]
  const screen = (point: [number, number]) => worldToScreen(world(point), viewport)
  const accent = selected ? '#0284c7' : hovered ? '#b45309' : '#795548'
  ctx.save()
  ctx.lineWidth = selected ? 2 : 1
  ctx.strokeStyle = accent
  ctx.fillStyle = selected ? 'rgba(2,132,199,.12)' : 'rgba(245,239,229,.82)'
  const outline: [number, number][] = [[0, 0], [width, 0], [width, depth], [0, depth]]
  ctx.beginPath(); outline.forEach((point, index) => { const p = screen(point); if (index) ctx.lineTo(...p); else ctx.moveTo(...p) }); ctx.closePath(); ctx.fill(); ctx.stroke()
  // Slight countertop overhang and a second carcass line give the run a clear plan symbol.
  const inset = Math.max(18, Math.min(35, depth * 0.06))
  const inner: [number, number][] = [[inset, inset], [width - inset, inset], [width - inset, depth - inset], [inset, depth - inset]]
  ctx.lineWidth = 0.75; ctx.strokeStyle = selected ? '#60a5fa' : '#b08968'
  ctx.beginPath(); inner.forEach((point, index) => { const p = screen(point); if (index) ctx.lineTo(...p); else ctx.moveTo(...p) }); ctx.closePath(); ctx.stroke()

  const modules = Array.isArray(data.modules_mm) ? data.modules_mm.map(value => Number(value)).filter(value => value > 0 && Number.isFinite(value)) : []
  const moduleWidths = modules.length ? modules : [width]
  const total = moduleWidths.reduce((sum, value) => sum + value, 0)
  let cursor = 0
  for (let index = 0; index < moduleWidths.length; index++) {
    const start = cursor, end = index === moduleWidths.length - 1 ? width : cursor + width * moduleWidths[index] / total
    if (index > 0) {
      ctx.beginPath(); ctx.moveTo(...screen([start, inset])); ctx.lineTo(...screen([start, depth - inset])); ctx.stroke()
    }
    const center = (start + end) / 2
    if (data.front === 'open') {
      const shelves = Math.max(1, Math.min(4, Math.floor(Number(data.shelves) || 1)))
      for (let shelf = 1; shelf <= shelves; shelf++) {
        const sy = inset + (depth - inset * 2) * shelf / (shelves + 1)
        ctx.beginPath(); ctx.moveTo(...screen([start + inset, sy])); ctx.lineTo(...screen([end - inset, sy])); ctx.stroke()
      }
    } else if (data.front === 'glass') {
      ctx.beginPath(); ctx.moveTo(...screen([start + inset, inset])); ctx.lineTo(...screen([end - inset, depth - inset])); ctx.moveTo(...screen([end - inset, inset])); ctx.lineTo(...screen([start + inset, depth - inset])); ctx.stroke()
    } else {
      const drawers = Math.max(0, Math.min(6, Math.floor(Number(data.drawers) || 0)))
      if (drawers > 1) for (let drawer = 1; drawer < drawers; drawer++) {
        const dy = inset + (depth - inset * 2) * drawer / drawers
        ctx.beginPath(); ctx.moveTo(...screen([start + inset, dy])); ctx.lineTo(...screen([end - inset, dy])); ctx.stroke()
      }
      const handleHalf = Math.min(22, Math.max(9, (end - start) * 0.035))
      const handleY = depth * 0.72
      ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(...screen([center - handleHalf, handleY])); ctx.lineTo(...screen([center + handleHalf, handleY])); ctx.stroke(); ctx.lineWidth = 0.75
    }
    cursor = end
  }
  ctx.restore()
}


function planHatchScreenSegments(
  segments: Array<[[number, number], [number, number]]>,
  viewport: ViewportState,
  markLengthPx: number,
): Array<[[number, number], [number, number]]> {
  const halfLengthMm = markLengthPx / (2 * viewport.zoom)
  return segments.flatMap(([start, end]) => {
    const dx = end[0] - start[0], dy = end[1] - start[1]
    const length = Math.hypot(dx, dy)
    if (length < halfLengthMm * 2) return []
    const middle: [number, number] = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]
    const alongX = dx / length * halfLengthMm, alongY = dy / length * halfLengthMm
    const [screenStart, screenEnd] = [
      worldToScreen([middle[0] - alongX, middle[1] - alongY], viewport),
      worldToScreen([middle[0] + alongX, middle[1] + alongY], viewport),
    ]
    return [[screenStart, screenEnd] as [[number, number], [number, number]]]
  })
}

function drawWall(
  ctx: CanvasRenderingContext2D,
  wall: SmartObject<WallModuleData>,
  project: ProjectDocument,
  viewport: ViewportState,
  isSelected: boolean,
  isHovered: boolean,
  showLabel: boolean
) {
  const { start_point_mm, end_point_mm, thickness_mm, mark } = wall.module_data
  const [x1, y1] = start_point_mm
  const [x2, y2] = end_point_mm
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy)
  if (len < 5) return

  const ux = dx / len
  const uy = dy / len
  const nx = -uy
  const ny = ux

  // Build the hosted-opening index once per project snapshot rather than scanning
  // every door and window for every wall on each redraw.
  const openings = (getHostedOpeningsByWall(project).get(wall.id) ?? []).map(opening => {
    const halfWidth = opening.width_mm / 2
    return {
      start_dist: Math.max(0, opening.center_mm - halfWidth),
      end_dist: Math.min(len, opening.center_mm + halfWidth),
    }
  })

  // Sort and merge openings
  openings.sort((a, b) => a.start_dist - b.start_dist)
  const mergedOpenings: OpeningSpan[] = []
  for (const op of openings) {
    if (mergedOpenings.length === 0) {
      mergedOpenings.push({ ...op })
    } else {
      const last = mergedOpenings[mergedOpenings.length - 1]
      if (op.start_dist <= last.end_dist) {
        last.end_dist = Math.max(last.end_dist, op.end_dist)
      } else {
        mergedOpenings.push({ ...op })
      }
    }
  }

  // Wall sub-segments
  interface WallSubSegment {
    s: number
    e: number
  }
  const subSegments: WallSubSegment[] = []
  let curr = 0
  for (const op of mergedOpenings) {
    if (op.start_dist > curr) {
      subSegments.push({ s: curr, e: op.start_dist })
    }
    curr = Math.max(curr, op.end_dist)
  }
  if (curr < len) {
    subSegments.push({ s: curr, e: len })
  }

  const half_thick = thickness_mm / 2
  const isDemolition = wall.created_phase === 'demolition' || wall.removed_phase === 'demolition'
  const isExisting = wall.created_phase === 'existing'
  const phaseStyle = resolvePlanWallPhaseStyle(getDisplayPhase(wall))

  // Render solid segments
  for (const seg of subSegments) {
    const p1_mm: [number, number] = [x1 + seg.s * ux, y1 + seg.s * uy]
    const p2_mm: [number, number] = [x1 + seg.e * ux, y1 + seg.e * uy]

    const c1_mm: [number, number] = [p1_mm[0] + nx * half_thick, p1_mm[1] + ny * half_thick]
    const c2_mm: [number, number] = [p2_mm[0] + nx * half_thick, p2_mm[1] + ny * half_thick]
    const c3_mm: [number, number] = [p2_mm[0] - nx * half_thick, p2_mm[1] - ny * half_thick]
    const c4_mm: [number, number] = [p1_mm[0] - nx * half_thick, p1_mm[1] - ny * half_thick]

    const [sc1x, sc1y] = worldToScreen(c1_mm, viewport)
    const [sc2x, sc2y] = worldToScreen(c2_mm, viewport)
    const [sc3x, sc3y] = worldToScreen(c3_mm, viewport)
    const [sc4x, sc4y] = worldToScreen(c4_mm, viewport)

    ctx.save()
    ctx.beginPath()
    ctx.moveTo(sc1x, sc1y)
    ctx.lineTo(sc2x, sc2y)
    ctx.lineTo(sc3x, sc3y)
    ctx.lineTo(sc4x, sc4y)
    ctx.closePath()

    ctx.fillStyle = isSelected
      ? 'rgba(56, 189, 248, 0.4)'
      : isHovered
      ? 'rgba(71, 85, 105, 0.85)'
      : phaseStyle.fill
    ctx.fill()

    ctx.strokeStyle = isSelected
      ? '#38bdf8'
      : isHovered
      ? '#94a3b8'
      : phaseStyle.stroke
    ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2 : isDemolition ? 1.5 : isExisting ? 1 : 2
    ctx.setLineDash(phaseStyle.dash)
    if (isSelected || isHovered) ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }

  // Generate wall hatching from the model footprint, then draw short screen-fixed marks.
  if (isDemolition || (!isExisting && isMasonryWallPlanHatch(wall, project.types))) {
    const hatchSegments = wallMasonryHatchSegments(
      [x1, y1], [x2, y2], thickness_mm,
      mergedOpenings.map(opening => [opening.start_dist, opening.end_dist]),
      isDemolition ? 250 : 140,
    )
    const marks = planHatchScreenSegments(hatchSegments, viewport, isDemolition ? 6 : 4)
    ctx.beginPath()
    for (const [a, b] of marks) { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]) }
    ctx.strokeStyle = isSelected ? 'rgba(3, 105, 161, 0.62)' : isDemolition ? '#ef4444' : '#9aa6b4'
    ctx.lineWidth = 0.75
    ctx.stroke()
  }

  // Draw centerline dashes along entire wall
  const [sx1, sy1] = worldToScreen([x1, y1], viewport)
  const [sx2, sy2] = worldToScreen([x2, y2], viewport)
  ctx.save()
  ctx.beginPath()
  ctx.setLineDash([3, 3])
  ctx.strokeStyle = isSelected ? '#38bdf8' : '#475569'
  ctx.lineWidth = 1
  ctx.moveTo(sx1, sy1)
  ctx.lineTo(sx2, sy2)
  ctx.stroke()
  ctx.restore()

  // W1/W2 identify the finish build-up on each face of the same shared wall
  // core, so render each face's own mark on that side of the wall.
  const wallType = project.types.find(type => type.id === wall.module_data.type_id)
    ?? project.types.find(type => type.object_type === 'architecture.wall' && type.name.toLowerCase() === mark.toLowerCase())
  const wallValue = (field: string, fallback: unknown) => wall.module_data.instance_overrides?.[field]
    ?? wall.module_data[field as keyof WallModuleData]
    ?? wallType?.parameters[field]
    ?? fallback
  const interiorSign = wallValue('interior_side', 'left') === 'right' ? -1 : 1
  const rawAngle = Math.atan2(sy2 - sy1, sx2 - sx1)
  let labelAngle = rawAngle
  if (labelAngle > Math.PI / 2 || labelAngle < -Math.PI / 2) labelAngle += Math.PI
  const orientationSign = Math.cos(labelAngle - rawAngle) < 0 ? -1 : 1
  const insideLocalSign = interiorSign * orientationSign
  const halfThicknessPx = thickness_mm * viewport.zoom / 2
  const triangleHalfHeight = 17
  const wallMark = mark || 'W1'
  const insideMark = String(wallValue('inside_finish_mark', wallMark) || wallMark)
  const outsideMark = String(wallValue('outside_finish_mark', wallMark) || wallMark)
  const priority = isSelected ? 10 : isHovered ? 8 : 2
  ctx.font = 'bold 10px monospace'
  const tagWidthPx = Math.max(30, ctx.measureText(insideMark).width + 10, ctx.measureText(outsideMark).width + 10)
  // Put the tag in the longest continuous solid run, never over a hosted
  // door/window opening. Hide it when every remaining run is too short.
  const labelSegment = subSegments
    .filter(segment => (segment.e - segment.s) * viewport.zoom >= tagWidthPx + 12)
    .sort((a, b) => (b.e - b.s) - (a.e - a.s))[0]
  if (labelSegment && showLabel) {
    const labelDistance = (labelSegment.s + labelSegment.e) / 2
    const [mx, my] = worldToScreen([x1 + labelDistance * ux, y1 + labelDistance * uy], viewport)
    ctx.save()
    ctx.translate(mx, my)
    ctx.rotate(labelAngle)
    queuePlanLabel(ctx, 0, insideLocalSign * (halfThicknessPx + triangleHalfHeight), insideMark, isSelected ? '#0876d1' : '#33465b', isSelected ? '#1682e8' : '#94a3b8', priority, '#fbfdff', true, insideLocalSign > 0 ? 'triangle' : 'triangle-down', [0, insideLocalSign * halfThicknessPx])
    queuePlanLabel(ctx, 0, -insideLocalSign * (halfThicknessPx + triangleHalfHeight), outsideMark, isSelected ? '#0876d1' : '#33465b', isSelected ? '#1682e8' : '#94a3b8', priority, '#fbfdff', true, insideLocalSign < 0 ? 'triangle' : 'triangle-down', [0, -insideLocalSign * halfThicknessPx])
    ctx.restore()
  }
}

function drawDoor(
  ctx: CanvasRenderingContext2D,
  door: SmartObject<DoorModuleData>,
  project: ProjectDocument,
  viewport: ViewportState,
  isSelected: boolean,
  isHovered: boolean,
  showLabel: boolean
) {
  if (objectFamily(project, door)) return
  const { mark, wall_id, offset_along_wall_mm, width_mm, handing } = door.module_data
  const hostWall = project.objects[wall_id]
  if (!hostWall || !isWallObject(hostWall)) return

  const [wx1, wy1] = hostWall.module_data.start_point_mm
  const [wx2, wy2] = hostWall.module_data.end_point_mm
  const wdx = wx2 - wx1
  const wdy = wy2 - wy1
  const wlen = Math.hypot(wdx, wdy)
  if (wlen < 1) return

  const ux = wdx / wlen
  const uy = wdy / wlen
  const nx = -uy
  const ny = ux

  const cx = wx1 + offset_along_wall_mm * ux
  const cy = wy1 + offset_along_wall_mm * uy
  const half_w = width_mm / 2

  const j1_mm: [number, number] = [cx - half_w * ux, cy - half_w * uy]
  const j2_mm: [number, number] = [cx + half_w * ux, cy + half_w * uy]

  const [sj1x, sj1y] = worldToScreen(j1_mm, viewport)
  const [sj2x, sj2y] = worldToScreen(j2_mm, viewport)
  const [scx, scy] = worldToScreen([cx, cy], viewport)

  ctx.save()
  const displayPhase = getDisplayPhase(door)
  const phaseStyle = resolvePlanPhaseStyle(displayPhase)
  const isDemolition = displayPhase === 'demolition'
  ctx.setLineDash(phaseStyle.dash)

  const thick_px = hostWall.module_data.thickness_mm * viewport.zoom
  const openingPx = width_mm * viewport.zoom
  const frameFaceWidthMm = Math.max(1, Number(openingValue(project, door, 'frame_face_width_mm', 50)) || 50)
  const leafThicknessMm = Math.max(1, Number(openingValue(project, door, 'door_leaf_thickness_mm', 40)) || 40)
  const jambFaceWidthPx = Math.max(1, Math.min(frameFaceWidthMm * viewport.zoom, openingPx * 0.25))
  const leafThicknessPx = Math.max(2.5, leafThicknessMm * viewport.zoom)
  const rebateDepthPx = Math.max(1.5, Math.min(jambFaceWidthPx * 0.35, 15 * viewport.zoom))
  const halfWall = thick_px / 2

  const jambStroke = isSelected ? '#1682e8' : isHovered ? '#0284c7' : phaseStyle.stroke
  ctx.strokeStyle = jambStroke
  ctx.lineWidth = isSelected ? 1.5 : 1.2

  const isLeft = handing.startsWith('left')
  const isOut = handing.endsWith('out')
  const swingSign = isOut ? -1 : 1

  // 1. Draw clean L-shaped rebated jambs on both ends (Left and Right)
  // Left Jamb
  ctx.fillStyle = isSelected ? 'rgba(56, 189, 248, 0.15)' : '#ffffff'
  ctx.beginPath()
  ctx.moveTo(sj1x - nx * halfWall, sj1y - ny * halfWall)
  ctx.lineTo(sj1x + nx * halfWall, sj1y + ny * halfWall)
  if (swingSign > 0) {
    // Door swings to +nx face: rebate cutout is on +nx face
    ctx.lineTo(sj1x + ux * (jambFaceWidthPx - rebateDepthPx) + nx * halfWall, sj1y + uy * (jambFaceWidthPx - rebateDepthPx) + ny * halfWall)
    ctx.lineTo(sj1x + ux * (jambFaceWidthPx - rebateDepthPx) + nx * (halfWall - leafThicknessPx), sj1y + uy * (jambFaceWidthPx - rebateDepthPx) + ny * (halfWall - leafThicknessPx))
    ctx.lineTo(sj1x + ux * jambFaceWidthPx + nx * (halfWall - leafThicknessPx), sj1y + uy * jambFaceWidthPx + ny * (halfWall - leafThicknessPx))
    ctx.lineTo(sj1x + ux * jambFaceWidthPx - nx * halfWall, sj1y + uy * jambFaceWidthPx - ny * halfWall)
  } else {
    // Door swings to -nx face: rebate cutout is on -nx face
    ctx.lineTo(sj1x + ux * jambFaceWidthPx + nx * halfWall, sj1y + uy * jambFaceWidthPx + ny * halfWall)
    ctx.lineTo(sj1x + ux * jambFaceWidthPx - nx * (halfWall - leafThicknessPx), sj1y + uy * jambFaceWidthPx - ny * (halfWall - leafThicknessPx))
    ctx.lineTo(sj1x + ux * (jambFaceWidthPx - rebateDepthPx) - nx * (halfWall - leafThicknessPx), sj1y + uy * (jambFaceWidthPx - rebateDepthPx) - ny * (halfWall - leafThicknessPx))
    ctx.lineTo(sj1x + ux * (jambFaceWidthPx - rebateDepthPx) - nx * halfWall, sj1y + uy * (jambFaceWidthPx - rebateDepthPx) - ny * halfWall)
  }
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Right Jamb
  ctx.beginPath()
  ctx.moveTo(sj2x - nx * halfWall, sj2y - ny * halfWall)
  ctx.lineTo(sj2x + nx * halfWall, sj2y + ny * halfWall)
  if (swingSign > 0) {
    // Door swings to +nx face: rebate cutout is on +nx face
    ctx.lineTo(sj2x - ux * (jambFaceWidthPx - rebateDepthPx) + nx * halfWall, sj2y - uy * (jambFaceWidthPx - rebateDepthPx) + ny * halfWall)
    ctx.lineTo(sj2x - ux * (jambFaceWidthPx - rebateDepthPx) + nx * (halfWall - leafThicknessPx), sj2y - uy * (jambFaceWidthPx - rebateDepthPx) + ny * (halfWall - leafThicknessPx))
    ctx.lineTo(sj2x - ux * jambFaceWidthPx + nx * (halfWall - leafThicknessPx), sj2y - uy * jambFaceWidthPx + ny * (halfWall - leafThicknessPx))
    ctx.lineTo(sj2x - ux * jambFaceWidthPx - nx * halfWall, sj2y - uy * jambFaceWidthPx - ny * halfWall)
  } else {
    // Door swings to -nx face: rebate cutout is on -nx face
    ctx.lineTo(sj2x - ux * jambFaceWidthPx + nx * halfWall, sj2y - uy * jambFaceWidthPx + ny * halfWall)
    ctx.lineTo(sj2x - ux * jambFaceWidthPx - nx * (halfWall - leafThicknessPx), sj2y - uy * jambFaceWidthPx - ny * (halfWall - leafThicknessPx))
    ctx.lineTo(sj2x - ux * (jambFaceWidthPx - rebateDepthPx) - nx * (halfWall - leafThicknessPx), sj2y - uy * (jambFaceWidthPx - rebateDepthPx) - ny * (halfWall - leafThicknessPx))
    ctx.lineTo(sj2x - ux * (jambFaceWidthPx - rebateDepthPx) - nx * halfWall, sj2y - uy * (jambFaceWidthPx - rebateDepthPx) - ny * halfWall)
  }
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // NOTICE: Clear opening is 100% open without any blocking horizontal lines across it.

  // 2. Door leaf and swing arc based on operation and panel count
  const operation = String(openingValue(project, door, 'opening_operation', 'hinged'))
  const panelCount = Math.max(1, Math.min(8, Number(openingValue(project, door, 'panel_count', 1)) || 1))
  const panelLayout = openingValue(project, door, 'panel_layout', Array.from({ length: panelCount }, () => operation)) as string[]
  const leafColor = isSelected ? '#1682e8' : isHovered ? '#0284c7' : phaseStyle.stroke
  let doorSwingTagPoint: [number, number] | null = null

  if (operation === 'sliding' || panelLayout.some(v => v === 'sliding')) {
    // Sliding door (2-panel or 4-panel)
    const trackGap = Math.max(2, Math.min(thick_px * 0.22, 10))
    const clearStart = [sj1x + ux * jambFaceWidthPx, sj1y + uy * jambFaceWidthPx] as const
    const clearEnd = [sj2x - ux * jambFaceWidthPx, sj2y - uy * jambFaceWidthPx] as const
    const clearSpan = Math.hypot(clearEnd[0] - clearStart[0], clearEnd[1] - clearStart[1])
    const count = panelCount >= 4 ? 4 : 2
    const stileWidthPx = Math.max(3, Math.min(45, clearSpan * 0.08))
    const overlapPx = Math.max(stileWidthPx, Math.min(30, clearSpan * 0.1))
    const panelLengthPx = (clearSpan + overlapPx * (count - 1)) / count
    const sashThickPx = Math.max(2.5, Math.min(30, thick_px * 0.3))

    // Continuous track lines
    ctx.beginPath()
    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = 0.7
    ctx.moveTo(clearStart[0] - nx * trackGap, clearStart[1] - ny * trackGap)
    ctx.lineTo(clearEnd[0] - nx * trackGap, clearEnd[1] - ny * trackGap)
    ctx.moveTo(clearStart[0] + nx * trackGap, clearStart[1] + ny * trackGap)
    ctx.lineTo(clearEnd[0] + nx * trackGap, clearEnd[1] + ny * trackGap)
    ctx.stroke()

    for (let i = 0; i < count; i++) {
      const trackIdx = count === 2 ? (i === 0 ? -1 : 1) : (i === 0 || i === 3 ? -1 : 1)
      const trackOffsetPx = trackIdx * trackGap
      const pStartX = clearStart[0] + ux * (i * (panelLengthPx - overlapPx)) + nx * trackOffsetPx
      const pStartY = clearStart[1] + uy * (i * (panelLengthPx - overlapPx)) + ny * trackOffsetPx
      const pEndX = pStartX + ux * panelLengthPx
      const pEndY = pStartY + uy * panelLengthPx

      // Start Stile Box (Left vertical profile)
      ctx.beginPath()
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = leafColor
      ctx.lineWidth = 1.2
      ctx.moveTo(pStartX - nx * (sashThickPx / 2), pStartY - ny * (sashThickPx / 2))
      ctx.lineTo(pStartX + ux * stileWidthPx - nx * (sashThickPx / 2), pStartY + uy * stileWidthPx - ny * (sashThickPx / 2))
      ctx.lineTo(pStartX + ux * stileWidthPx + nx * (sashThickPx / 2), pStartY + uy * stileWidthPx + ny * (sashThickPx / 2))
      ctx.lineTo(pStartX + nx * (sashThickPx / 2), pStartY + ny * (sashThickPx / 2))
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      // End Stile Box (Right vertical profile)
      ctx.beginPath()
      ctx.moveTo(pEndX - ux * stileWidthPx - nx * (sashThickPx / 2), pEndY - uy * stileWidthPx - ny * (sashThickPx / 2))
      ctx.lineTo(pEndX - nx * (sashThickPx / 2), pEndY - ny * (sashThickPx / 2))
      ctx.lineTo(pEndX + nx * (sashThickPx / 2), pEndY + ny * (sashThickPx / 2))
      ctx.lineTo(pEndX - ux * stileWidthPx + nx * (sashThickPx / 2), pEndY - uy * stileWidthPx + ny * (sashThickPx / 2))
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      // Glass line connecting the inner faces of both vertical stiles
      ctx.beginPath()
      ctx.strokeStyle = '#0284c7'
      ctx.lineWidth = 1.0
      ctx.moveTo(pStartX + ux * stileWidthPx, pStartY + uy * stileWidthPx)
      ctx.lineTo(pEndX - ux * stileWidthPx, pEndY - uy * stileWidthPx)
      ctx.stroke()

      // Direction arrow placed OUTSIDE door frame
      const arrDir = count === 2 ? (i === 0 ? 1 : -1) : (i === 1 ? -1 : i === 2 ? 1 : 0)
      if (arrDir !== 0) {
        const arrowOutDist = halfWall + 8
        const arrowSideSign = count === 2 ? (i === 0 ? 1 : -1) : -1
        const amx = (pStartX + pEndX) / 2 + nx * (arrowSideSign * arrowOutDist - trackOffsetPx)
        const amy = (pStartY + pEndY) / 2 + ny * (arrowSideSign * arrowOutDist - trackOffsetPx)
        const asz = Math.min(12, Math.max(7, panelLengthPx * 0.18))
        ctx.beginPath()
        ctx.strokeStyle = leafColor
        ctx.lineWidth = 1.0
        ctx.moveTo(amx - ux * asz * arrDir, amy - uy * asz * arrDir)
        ctx.lineTo(amx + ux * asz * arrDir, amy + uy * asz * arrDir)
        // AutoCAD 45-degree single barb
        ctx.moveTo(amx + ux * asz * arrDir, amy + uy * asz * arrDir)
        ctx.lineTo(amx + ux * asz * arrDir * 0.45 + nx * arrowSideSign * asz * 0.4, amy + uy * asz * arrDir * 0.45 + ny * arrowSideSign * asz * 0.4)
        ctx.stroke()
      }
    }
    doorSwingTagPoint = [scx + nx * (halfWall + 18), scy + ny * (halfWall + 18)]
  } else if (panelLayout.every(v => v === 'bifold')) {
    // Bifold door
    const clearStart = [sj1x + ux * jambFaceWidthPx, sj1y + uy * jambFaceWidthPx] as const
    const clearEnd = [sj2x - ux * jambFaceWidthPx, sj2y - uy * jambFaceWidthPx] as const
    const clearSpan = Math.hypot(clearEnd[0] - clearStart[0], clearEnd[1] - clearStart[1])
    const foldDepth = Math.max(12, Math.min(30, clearSpan * 0.2))
    ctx.strokeStyle = leafColor
    ctx.lineWidth = 1.8
    ctx.beginPath()
    ctx.moveTo(clearStart[0], clearStart[1])
    for (let i = 1; i < panelCount; i++) {
      const t = i / panelCount
      const px = clearStart[0] + (clearEnd[0] - clearStart[0]) * t
      const py = clearStart[1] + (clearEnd[1] - clearStart[1]) * t
      const foldSide = i % 2 === 1 ? swingSign : -swingSign
      ctx.lineTo(px + nx * foldDepth * foldSide, py + ny * foldDepth * foldSide)
    }
    ctx.lineTo(clearEnd[0], clearEnd[1])
    ctx.stroke()
    doorSwingTagPoint = [scx + nx * swingSign * (foldDepth + 15), scy + ny * swingSign * (foldDepth + 15)]
  } else if (panelCount === 2) {
    // Double Hinged Door (2 leaves swinging open 90° meeting in center)
    const clearStart = [sj1x + ux * (jambFaceWidthPx - rebateDepthPx), sj1y + uy * (jambFaceWidthPx - rebateDepthPx)] as const
    const clearEnd = [sj2x - ux * (jambFaceWidthPx - rebateDepthPx), sj2y - uy * (jambFaceWidthPx - rebateDepthPx)] as const
    const clearSpan = Math.hypot(clearEnd[0] - clearStart[0], clearEnd[1] - clearStart[1])
    const leafLen = clearSpan / 2
    const rebateNormalOffset = swingSign * (halfWall - leafThicknessPx)

    // Left Leaf
    const h1x = clearStart[0] + nx * rebateNormalOffset
    const h1y = clearStart[1] + ny * rebateNormalOffset
    const tip1x = h1x + nx * swingSign * leafLen
    const tip1y = h1y + ny * swingSign * leafLen

    // Draw Left Leaf Slab
    ctx.beginPath()
    ctx.fillStyle = isSelected ? 'rgba(56, 189, 248, 0.25)' : '#ffffff'
    ctx.strokeStyle = leafColor
    ctx.lineWidth = 1.4
    ctx.moveTo(h1x, h1y)
    ctx.lineTo(tip1x, tip1y)
    ctx.lineTo(tip1x + ux * leafThicknessPx, tip1y + uy * leafThicknessPx)
    ctx.lineTo(h1x + ux * leafThicknessPx, h1y + uy * leafThicknessPx)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // Left Swing Arc: from mid point to tip1
    const midX = (clearStart[0] + clearEnd[0]) / 2 + nx * rebateNormalOffset
    const midY = (clearStart[1] + clearEnd[1]) / 2 + ny * rebateNormalOffset
    const angleClose1 = Math.atan2(midY - h1y, midX - h1x)
    const angleOpen1 = angleClose1 + swingSign * (Math.PI / 2)
    ctx.beginPath()
    ctx.strokeStyle = leafColor
    ctx.lineWidth = 1
    if (isDemolition) ctx.setLineDash([4, 4])
    ctx.arc(h1x, h1y, leafLen, angleClose1, angleOpen1, swingSign < 0)
    ctx.stroke()
    ctx.setLineDash([])

    // Right Leaf
    const h2x = clearEnd[0] + nx * rebateNormalOffset
    const h2y = clearEnd[1] + ny * rebateNormalOffset
    const tip2x = h2x + nx * swingSign * leafLen
    const tip2y = h2y + ny * swingSign * leafLen

    // Draw Right Leaf Slab
    ctx.beginPath()
    ctx.fillStyle = isSelected ? 'rgba(56, 189, 248, 0.25)' : '#ffffff'
    ctx.strokeStyle = leafColor
    ctx.lineWidth = 1.4
    ctx.moveTo(h2x, h2y)
    ctx.lineTo(tip2x, tip2y)
    ctx.lineTo(tip2x - ux * leafThicknessPx, tip2y - uy * leafThicknessPx)
    ctx.lineTo(h2x - ux * leafThicknessPx, h2y - uy * leafThicknessPx)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // Right Swing Arc: from mid point to tip2
    const angleClose2 = Math.atan2(midY - h2y, midX - h2x)
    const angleOpen2 = angleClose2 - swingSign * (Math.PI / 2)
    ctx.beginPath()
    ctx.strokeStyle = leafColor
    ctx.lineWidth = 1
    if (isDemolition) ctx.setLineDash([4, 4])
    ctx.arc(h2x, h2y, leafLen, angleClose2, angleOpen2, swingSign > 0)
    ctx.stroke()
    ctx.setLineDash([])

    doorSwingTagPoint = [scx + nx * swingSign * (leafLen * 0.45), scy + ny * swingSign * (leafLen * 0.45)]
  } else {
    // Single Hinged Door (Standard 90° Swing Door)
    const clearStart = [sj1x + ux * (jambFaceWidthPx - rebateDepthPx), sj1y + uy * (jambFaceWidthPx - rebateDepthPx)] as const
    const clearEnd = [sj2x - ux * (jambFaceWidthPx - rebateDepthPx), sj2y - uy * (jambFaceWidthPx - rebateDepthPx)] as const
    const clearSpan = Math.hypot(clearEnd[0] - clearStart[0], clearEnd[1] - clearStart[1])
    const leafLen = clearSpan
    const rebateNormalOffset = swingSign * (halfWall - leafThicknessPx)

    const hx = (isLeft ? clearStart[0] : clearEnd[0]) + nx * rebateNormalOffset
    const hy = (isLeft ? clearStart[1] : clearEnd[1]) + ny * rebateNormalOffset
    const lx = (isLeft ? clearEnd[0] : clearStart[0]) + nx * rebateNormalOffset
    const ly = (isLeft ? clearEnd[1] : clearStart[1]) + ny * rebateNormalOffset

    const tipX = hx + nx * swingSign * leafLen
    const tipY = hy + ny * swingSign * leafLen
    const leafSideUx = isLeft ? ux : -ux
    const leafSideUy = isLeft ? uy : -uy

    // Draw Open Leaf Slab
    ctx.beginPath()
    ctx.fillStyle = isSelected ? 'rgba(56, 189, 248, 0.25)' : '#ffffff'
    ctx.strokeStyle = leafColor
    ctx.lineWidth = 1.4
    ctx.moveTo(hx, hy)
    ctx.lineTo(tipX, tipY)
    ctx.lineTo(tipX + leafSideUx * leafThicknessPx, tipY + leafSideUy * leafThicknessPx)
    ctx.lineTo(hx + leafSideUx * leafThicknessPx, hy + leafSideUy * leafThicknessPx)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // Draw Louver slats if louvered style
    if (String(openingValue(project, door, 'door_leaf_style', '')) === 'louvered') {
      ctx.beginPath()
      ctx.strokeStyle = leafColor
      ctx.lineWidth = 0.8
      const slatCount = Math.max(3, Math.min(6, Math.round(leafLen / 30)))
      for (let s = 1; s < slatCount; s++) {
        const st = s / slatCount
        const sx = hx + (tipX - hx) * st
        const sy = hy + (tipY - hy) * st
        ctx.moveTo(sx, sy)
        ctx.lineTo(sx + leafSideUx * leafThicknessPx, sy + leafSideUy * leafThicknessPx)
      }
      ctx.stroke()
    }

    // 90° Swing Arc: from latch point (lx, ly) to open tip (tipX, tipY)
    const angleClosed = Math.atan2(ly - hy, lx - hx)
    const angleOpen = angleClosed + (isLeft ? swingSign : -swingSign) * (Math.PI / 2)
    const counterClockwise = (isLeft ? swingSign : -swingSign) < 0
    ctx.beginPath()
    ctx.strokeStyle = leafColor
    ctx.lineWidth = 1
    if (isDemolition) ctx.setLineDash([4, 4])
    ctx.arc(hx, hy, leafLen, angleClosed, angleOpen, counterClockwise)
    ctx.stroke()
    ctx.setLineDash([])

    // Hinge pivot point dot
    ctx.beginPath()
    ctx.arc(hx, hy, 2, 0, Math.PI * 2)
    ctx.fillStyle = leafColor
    ctx.fill()

    // Door Tag Mark position: inside the 90° quadrant at 45° angle, distance 0.52 * leafLen
    const midAngle = (angleClosed + angleOpen) / 2
    const tagDist = leafLen * 0.52
    doorSwingTagPoint = [hx + Math.cos(midAngle) * tagDist, hy + Math.sin(midAngle) * tagDist]
  }

  // Badge mark
  const text = mark || 'D1'
  ctx.font = isSelected ? 'bold 10px monospace' : 'bold 9px monospace'
  ctx.save()
  const [tagX, tagY] = doorSwingTagPoint ?? [scx, scy]
  ctx.translate(tagX, tagY)
  if (showLabel) queuePlanLabel(ctx, 0, 0, text, '#15803d', isSelected ? '#1682e8' : '#22c55e', isSelected ? 10 : isHovered ? 8 : 5, '#fbfdff', true, 'circle')
  ctx.restore()

  ctx.restore()
}

function drawWindow(
  ctx: CanvasRenderingContext2D,
  win: SmartObject<WindowModuleData>,
  project: ProjectDocument,
  viewport: ViewportState,
  isSelected: boolean,
  isHovered: boolean,
  showLabel: boolean
) {
  if (objectFamily(project, win)) return
  const { mark, wall_id, offset_along_wall_mm, width_mm } = win.module_data
  const hostWall = project.objects[wall_id]
  if (!hostWall || !isWallObject(hostWall)) return

  const [wx1, wy1] = hostWall.module_data.start_point_mm
  const [wx2, wy2] = hostWall.module_data.end_point_mm
  const wdx = wx2 - wx1
  const wdy = wy2 - wy1
  const wlen = Math.hypot(wdx, wdy)
  if (wlen < 1) return

  const ux = wdx / wlen
  const uy = wdy / wlen
  const nx = -uy
  const ny = ux

  const cx = wx1 + offset_along_wall_mm * ux
  const cy = wy1 + offset_along_wall_mm * uy
  const half_w = width_mm / 2

  const p1_mm: [number, number] = [cx - half_w * ux, cy - half_w * uy]
  const p2_mm: [number, number] = [cx + half_w * ux, cy + half_w * uy]

  const [sp1x, sp1y] = worldToScreen(p1_mm, viewport)
  const [sp2x, sp2y] = worldToScreen(p2_mm, viewport)
  const [scx, scy] = worldToScreen([cx, cy], viewport)

  const thickPx = hostWall.module_data.thickness_mm * viewport.zoom
  const halfWall = thickPx / 2
  const openingPx = width_mm * viewport.zoom

  ctx.save()
  const displayPhase = getDisplayPhase(win)
  const phaseStyle = resolvePlanPhaseStyle(displayPhase)
  const isDemolition = displayPhase === 'demolition'
  ctx.setLineDash(phaseStyle.dash)

  // 1. Clean wall cutout background
  ctx.beginPath()
  ctx.moveTo(sp1x - nx * halfWall, sp1y - ny * halfWall)
  ctx.lineTo(sp2x - nx * halfWall, sp2y - ny * halfWall)
  ctx.lineTo(sp2x + nx * halfWall, sp2y + ny * halfWall)
  ctx.lineTo(sp1x + nx * halfWall, sp1y + ny * halfWall)
  ctx.closePath()
  ctx.fillStyle = isSelected ? 'rgba(56, 189, 248, 0.18)' : '#ffffff'
  ctx.fill()

  // 2. Window Jambs (Left & Right 50x100mm clean boxes)
  const frameFaceWidthMm = Math.max(1, Number(openingValue(project, win, 'frame_face_width_mm', 50)) || 50)
  const jambWidthPx = Math.max(1.5, Math.min(frameFaceWidthMm * viewport.zoom, openingPx * 0.22))
  const jambStroke = isSelected ? '#1682e8' : isHovered ? '#0284c7' : phaseStyle.stroke
  ctx.strokeStyle = jambStroke
  ctx.lineWidth = isSelected ? 1.5 : 1.2

  // Left Jamb
  ctx.beginPath()
  ctx.fillStyle = '#ffffff'
  ctx.moveTo(sp1x - nx * halfWall, sp1y - ny * halfWall)
  ctx.lineTo(sp1x + nx * halfWall, sp1y + ny * halfWall)
  ctx.lineTo(sp1x + ux * jambWidthPx + nx * halfWall, sp1y + uy * jambWidthPx + ny * halfWall)
  ctx.lineTo(sp1x + ux * jambWidthPx - nx * halfWall, sp1y + uy * jambWidthPx - ny * halfWall)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Right Jamb
  ctx.beginPath()
  ctx.moveTo(sp2x - nx * halfWall, sp2y - ny * halfWall)
  ctx.lineTo(sp2x + nx * halfWall, sp2y + ny * halfWall)
  ctx.lineTo(sp2x - ux * jambWidthPx + nx * halfWall, sp2y - uy * jambWidthPx + ny * halfWall)
  ctx.lineTo(sp2x - ux * jambWidthPx - nx * halfWall, sp2y - uy * jambWidthPx - ny * halfWall)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // 3. Exterior & Interior Sill Lines (เส้นธรณีคู่บาง)
  ctx.beginPath()
  ctx.strokeStyle = phaseStyle.stroke
  ctx.lineWidth = 0.9
  // Exterior sill
  ctx.moveTo(sp1x + ux * jambWidthPx + nx * halfWall, sp1y + uy * jambWidthPx + ny * halfWall)
  ctx.lineTo(sp2x - ux * jambWidthPx + nx * halfWall, sp2y - uy * jambWidthPx + ny * halfWall)
  // Interior sill
  ctx.moveTo(sp1x + ux * jambWidthPx - nx * halfWall, sp1y + uy * jambWidthPx - ny * halfWall)
  ctx.lineTo(sp2x - ux * jambWidthPx - nx * halfWall, sp2y - uy * jambWidthPx - ny * halfWall)
  ctx.stroke()

  // 4. Sashes and Glazing based on Window Type
  const operation = String(openingValue(project, win, 'opening_operation', 'sliding'))
  const panelCount = Math.max(1, Math.min(8, Number(openingValue(project, win, 'panel_count', 2)) || 2))
  const clearStart = [sp1x + ux * jambWidthPx, sp1y + uy * jambWidthPx] as const
  const clearEnd = [sp2x - ux * jambWidthPx, sp2y - uy * jambWidthPx] as const
  const clearSpan = Math.hypot(clearEnd[0] - clearStart[0], clearEnd[1] - clearStart[1])

  const sashColor = isSelected ? '#1682e8' : isHovered ? '#0284c7' : phaseStyle.stroke
  const glassColor = isSelected ? '#0284c7' : '#0ea5e9'

  // Wall interior/exterior orientation
  const wallType = project.types.find(type => type.id === hostWall.module_data.type_id)
    ?? project.types.find(type => type.object_type === 'architecture.wall' && type.name.toLowerCase() === (hostWall.module_data.mark || '').toLowerCase())
  const interiorSideVal = hostWall.module_data.instance_overrides?.interior_side ?? hostWall.module_data.interior_side ?? wallType?.parameters?.interior_side ?? 'left'
  const interiorSign = interiorSideVal === 'right' ? -1 : 1
  const exteriorSign = -interiorSign
  const outNx = nx * exteriorSign
  const outNy = ny * exteriorSign

  if (operation === 'sliding' && panelCount === 2) {
    // Standard 2-Panel Bypass Sliding Window (W1): Stile boxes at ends + crisp glass centerline
    const trackGap = Math.max(2, Math.min(thickPx * 0.2, 8))
    const sashThickPx = Math.max(2.5, Math.min(28, thickPx * 0.28))
    const stileWidthPx = Math.max(3, Math.min(32, clearSpan * 0.08))
    const overlapPx = Math.max(stileWidthPx * 1.2, Math.min(28, clearSpan * 0.12))
    const panelLen = (clearSpan + overlapPx) / 2

    // Continuous sill track lines
    ctx.beginPath()
    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = 0.7
    ctx.moveTo(clearStart[0] + nx * trackGap, clearStart[1] + ny * trackGap)
    ctx.lineTo(clearEnd[0] + nx * trackGap, clearEnd[1] + ny * trackGap)
    ctx.moveTo(clearStart[0] - nx * trackGap, clearStart[1] - ny * trackGap)
    ctx.lineTo(clearEnd[0] - nx * trackGap, clearEnd[1] - ny * trackGap)
    ctx.stroke()

    // Outer Sash (Left panel, track 1: +nx * trackGap)
    const oStartX = clearStart[0] + nx * trackGap
    const oStartY = clearStart[1] + ny * trackGap
    const oEndX = oStartX + ux * panelLen
    const oEndY = oStartY + uy * panelLen

    // Outer Sash - Left Stile Box
    ctx.beginPath()
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = sashColor
    ctx.lineWidth = 1.2
    ctx.moveTo(oStartX - nx * (sashThickPx / 2), oStartY - ny * (sashThickPx / 2))
    ctx.lineTo(oStartX + ux * stileWidthPx - nx * (sashThickPx / 2), oStartY + uy * stileWidthPx - ny * (sashThickPx / 2))
    ctx.lineTo(oStartX + ux * stileWidthPx + nx * (sashThickPx / 2), oStartY + uy * stileWidthPx + ny * (sashThickPx / 2))
    ctx.lineTo(oStartX + nx * (sashThickPx / 2), oStartY + ny * (sashThickPx / 2))
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // Outer Sash - Right Interlock Stile Box
    ctx.beginPath()
    ctx.moveTo(oEndX - ux * stileWidthPx - nx * (sashThickPx / 2), oEndY - uy * stileWidthPx - ny * (sashThickPx / 2))
    ctx.lineTo(oEndX - nx * (sashThickPx / 2), oEndY - ny * (sashThickPx / 2))
    ctx.lineTo(oEndX + nx * (sashThickPx / 2), oEndY + ny * (sashThickPx / 2))
    ctx.lineTo(oEndX - ux * stileWidthPx + nx * (sashThickPx / 2), oEndY - uy * stileWidthPx + ny * (sashThickPx / 2))
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // Outer Sash - Glass line connecting stiles
    ctx.beginPath()
    ctx.strokeStyle = glassColor
    ctx.lineWidth = 1.0
    ctx.moveTo(oStartX + ux * stileWidthPx, oStartY + uy * stileWidthPx)
    ctx.lineTo(oEndX - ux * stileWidthPx, oEndY - uy * stileWidthPx)
    ctx.stroke()

    // Inner Sash (Right panel, track 2: -nx * trackGap)
    const iEndX = clearEnd[0] - nx * trackGap
    const iEndY = clearEnd[1] - ny * trackGap
    const iStartX = iEndX - ux * panelLen
    const iStartY = iEndY - uy * panelLen

    // Inner Sash - Left Interlock Stile Box
    ctx.beginPath()
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = sashColor
    ctx.lineWidth = 1.2
    ctx.moveTo(iStartX - nx * (sashThickPx / 2), iStartY - ny * (sashThickPx / 2))
    ctx.lineTo(iStartX + ux * stileWidthPx - nx * (sashThickPx / 2), iStartY + uy * stileWidthPx - ny * (sashThickPx / 2))
    ctx.lineTo(iStartX + ux * stileWidthPx + nx * (sashThickPx / 2), iStartY + uy * stileWidthPx + ny * (sashThickPx / 2))
    ctx.lineTo(iStartX + nx * (sashThickPx / 2), iStartY + ny * (sashThickPx / 2))
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // Inner Sash - Right Stile Box
    ctx.beginPath()
    ctx.moveTo(iEndX - ux * stileWidthPx - nx * (sashThickPx / 2), iEndY - uy * stileWidthPx - ny * (sashThickPx / 2))
    ctx.lineTo(iEndX - nx * (sashThickPx / 2), iEndY - ny * (sashThickPx / 2))
    ctx.lineTo(iEndX + nx * (sashThickPx / 2), iEndY + ny * (sashThickPx / 2))
    ctx.lineTo(iEndX - ux * stileWidthPx + nx * (sashThickPx / 2), iEndY - uy * stileWidthPx + ny * (sashThickPx / 2))
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // Inner Sash - Glass line connecting stiles
    ctx.beginPath()
    ctx.strokeStyle = glassColor
    ctx.lineWidth = 1.0
    ctx.moveTo(iStartX + ux * stileWidthPx, iStartY + uy * stileWidthPx)
    ctx.lineTo(iEndX - ux * stileWidthPx, iEndY - uy * stileWidthPx)
    ctx.stroke()

    // Direction arrows placed OUTSIDE the window frame (per AutoCAD/Revit architectural standard)
    const arrowOutDist = halfWall + 8
    const asz = Math.min(14, Math.max(8, panelLen * 0.2))

    // Outer Sash arrow: placed outside wall on +nx side
    const oMidX = (oStartX + oEndX) / 2 + nx * (arrowOutDist - trackGap)
    const oMidY = (oStartY + oEndY) / 2 + ny * (arrowOutDist - trackGap)
    ctx.beginPath()
    ctx.strokeStyle = sashColor
    ctx.lineWidth = 1.0
    ctx.moveTo(oMidX - ux * asz, oMidY - uy * asz)
    ctx.lineTo(oMidX + ux * asz, oMidY + uy * asz)
    // 45-degree barb pointing in direction of movement (+ux) and angling outward (+nx)
    ctx.moveTo(oMidX + ux * asz, oMidY + uy * asz)
    ctx.lineTo(oMidX + ux * asz * 0.45 + nx * asz * 0.4, oMidY + uy * asz * 0.45 + ny * asz * 0.4)
    ctx.stroke()

    // Inner Sash arrow: placed outside wall on -nx side
    const iMidX = (iStartX + iEndX) / 2 - nx * (arrowOutDist - trackGap)
    const iMidY = (iStartY + iEndY) / 2 - ny * (arrowOutDist - trackGap)
    ctx.beginPath()
    ctx.moveTo(iMidX + ux * asz, iMidY + uy * asz)
    ctx.lineTo(iMidX - ux * asz, iMidY - uy * asz)
    // 45-degree barb pointing in direction of movement (-ux) and angling outward (-nx)
    ctx.moveTo(iMidX - ux * asz, iMidY - uy * asz)
    ctx.lineTo(iMidX - ux * asz * 0.45 - nx * asz * 0.4, iMidY - uy * asz * 0.45 - ny * asz * 0.4)
    ctx.stroke()
  } else if (operation === 'sliding' && panelCount >= 4) {
    // 4-Panel Sliding Window (W2): Center panels parting <- | ->
    const trackGap = Math.max(2, Math.min(thickPx * 0.2, 8))
    const sashThickPx = Math.max(2.5, Math.min(28, thickPx * 0.28))
    const stileWidthPx = Math.max(3, Math.min(30, clearSpan * 0.06))
    const overlapPx = Math.max(stileWidthPx * 1.2, Math.min(24, clearSpan * 0.08))
    const panelLen = (clearSpan + overlapPx * 3) / 4

    // Continuous sill track lines
    ctx.beginPath()
    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = 0.7
    ctx.moveTo(clearStart[0] + nx * trackGap, clearStart[1] + ny * trackGap)
    ctx.lineTo(clearEnd[0] + nx * trackGap, clearEnd[1] + ny * trackGap)
    ctx.moveTo(clearStart[0] - nx * trackGap, clearStart[1] - ny * trackGap)
    ctx.lineTo(clearEnd[0] - nx * trackGap, clearEnd[1] - ny * trackGap)
    ctx.stroke()

    for (let i = 0; i < 4; i++) {
      const isInner = i === 1 || i === 2
      const trackOffset = (isInner ? -1 : 1) * trackGap
      const pStartX = clearStart[0] + ux * (i * (panelLen - overlapPx)) + nx * trackOffset
      const pStartY = clearStart[1] + uy * (i * (panelLen - overlapPx)) + ny * trackOffset
      const pEndX = pStartX + ux * panelLen
      const pEndY = pStartY + uy * panelLen

      // Left Stile Box
      ctx.beginPath()
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = sashColor
      ctx.lineWidth = 1.2
      ctx.moveTo(pStartX - nx * (sashThickPx / 2), pStartY - ny * (sashThickPx / 2))
      ctx.lineTo(pStartX + ux * stileWidthPx - nx * (sashThickPx / 2), pStartY + uy * stileWidthPx - ny * (sashThickPx / 2))
      ctx.lineTo(pStartX + ux * stileWidthPx + nx * (sashThickPx / 2), pStartY + uy * stileWidthPx + ny * (sashThickPx / 2))
      ctx.lineTo(pStartX + nx * (sashThickPx / 2), pStartY + ny * (sashThickPx / 2))
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      // Right Stile Box
      ctx.beginPath()
      ctx.moveTo(pEndX - ux * stileWidthPx - nx * (sashThickPx / 2), pEndY - uy * stileWidthPx - ny * (sashThickPx / 2))
      ctx.lineTo(pEndX - nx * (sashThickPx / 2), pEndY - ny * (sashThickPx / 2))
      ctx.lineTo(pEndX + nx * (sashThickPx / 2), pEndY + ny * (sashThickPx / 2))
      ctx.lineTo(pEndX - ux * stileWidthPx + nx * (sashThickPx / 2), pEndY - uy * stileWidthPx + ny * (sashThickPx / 2))
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      // Glass line
      ctx.beginPath()
      ctx.strokeStyle = glassColor
      ctx.lineWidth = 1.0
      ctx.moveTo(pStartX + ux * stileWidthPx, pStartY + uy * stileWidthPx)
      ctx.lineTo(pEndX - ux * stileWidthPx, pEndY - uy * stileWidthPx)
      ctx.stroke()

      // Direction arrow for middle moving panels placed OUTSIDE the window frame
      const arrDir = i === 1 ? -1 : i === 2 ? 1 : 0
      if (arrDir !== 0) {
        const arrowOutDist = halfWall + 8
        const pmx = (pStartX + pEndX) / 2 - nx * (arrowOutDist + trackOffset)
        const pmy = (pStartY + pEndY) / 2 - ny * (arrowOutDist + trackOffset)
        const asz = Math.min(12, Math.max(6, panelLen * 0.16))
        ctx.beginPath()
        ctx.strokeStyle = sashColor
        ctx.lineWidth = 1.0
        ctx.moveTo(pmx - ux * asz * arrDir, pmy - uy * asz * arrDir)
        ctx.lineTo(pmx + ux * asz * arrDir, pmy + uy * asz * arrDir)
        ctx.moveTo(pmx + ux * asz * arrDir, pmy + uy * asz * arrDir)
        ctx.lineTo(pmx + ux * asz * arrDir * 0.45 - nx * asz * 0.4, pmy + uy * asz * arrDir * 0.45 - ny * asz * 0.4)
        ctx.stroke()
      }
    }
  } else if (operation === 'awning') {
    // Standard Architectural Awning Window (บานกระทุ้ง W2/W3): In-wall glass + projected sash frame + dashed swing lines
    // 1. In-wall frame glass line
    ctx.beginPath()
    ctx.strokeStyle = glassColor
    ctx.lineWidth = 1.0
    ctx.moveTo(clearStart[0], clearStart[1])
    ctx.lineTo(clearEnd[0], clearEnd[1])
    ctx.stroke()

    // 2. Projected outward sash frame
    const projDepthPx = Math.max(14, Math.min(200, clearSpan * 0.35))
    const frameProfilePx = Math.max(2.5, Math.min(30, 18))

    const pWall1 = [clearStart[0] + outNx * halfWall, clearStart[1] + outNy * halfWall] as const
    const pWall2 = [clearEnd[0] + outNx * halfWall, clearEnd[1] + outNy * halfWall] as const
    const pOut1 = [clearStart[0] + outNx * (halfWall + projDepthPx), clearStart[1] + outNy * (halfWall + projDepthPx)] as const
    const pOut2 = [clearEnd[0] + outNx * (halfWall + projDepthPx), clearEnd[1] + outNy * (halfWall + projDepthPx)] as const

    // Outer sash frame rectangle
    ctx.beginPath()
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = sashColor
    ctx.lineWidth = 1.2
    ctx.moveTo(pWall1[0], pWall1[1])
    ctx.lineTo(pOut1[0], pOut1[1])
    ctx.lineTo(pOut2[0], pOut2[1])
    ctx.lineTo(pWall2[0], pWall2[1])
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // Inner glass frame margin
    const ipWall1 = [pWall1[0] + ux * frameProfilePx + outNx * frameProfilePx, pWall1[1] + uy * frameProfilePx + outNy * frameProfilePx] as const
    const ipWall2 = [pWall2[0] - ux * frameProfilePx + outNx * frameProfilePx, pWall2[1] - uy * frameProfilePx + outNy * frameProfilePx] as const
    const ipOut1 = [pOut1[0] + ux * frameProfilePx - outNx * frameProfilePx, pOut1[1] + uy * frameProfilePx - outNy * frameProfilePx] as const
    const ipOut2 = [pOut2[0] - ux * frameProfilePx - outNx * frameProfilePx, pOut2[1] - uy * frameProfilePx - outNy * frameProfilePx] as const

    ctx.beginPath()
    ctx.strokeStyle = sashColor
    ctx.lineWidth = 0.8
    ctx.moveTo(ipWall1[0], ipWall1[1])
    ctx.lineTo(ipOut1[0], ipOut1[1])
    ctx.lineTo(ipOut2[0], ipOut2[1])
    ctx.lineTo(ipWall2[0], ipWall2[1])
    ctx.closePath()
    ctx.stroke()

    // 3. Dashed hinge swing lines from outer corners to frame center (per Thai standard A-01/A-08)
    const midWall = [(pWall1[0] + pWall2[0]) / 2, (pWall1[1] + pWall2[1]) / 2] as const
    ctx.beginPath()
    ctx.setLineDash([4, 3])
    ctx.strokeStyle = sashColor
    ctx.lineWidth = 0.9
    ctx.moveTo(pOut1[0], pOut1[1])
    ctx.lineTo(midWall[0], midWall[1])
    ctx.lineTo(pOut2[0], pOut2[1])
    ctx.stroke()
    ctx.setLineDash([])
  } else if (operation === 'casement' || operation === 'hinged') {
    // Casement / Hinged Window (บานเปิดข้าง)
    const sashThickPx = Math.max(3, Math.min(30, thickPx * 0.3))
    const pWall1 = [clearStart[0] + outNx * halfWall, clearStart[1] + outNy * halfWall] as const
    const pWall2 = [clearEnd[0] + outNx * halfWall, clearEnd[1] + outNy * halfWall] as const

    // 90-degree open sash leaf
    const leafTipX = pWall1[0] + outNx * clearSpan
    const leafTipY = pWall1[1] + outNy * clearSpan

    ctx.beginPath()
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = sashColor
    ctx.lineWidth = 1.2
    ctx.moveTo(pWall1[0], pWall1[1])
    ctx.lineTo(leafTipX, leafTipY)
    ctx.lineTo(leafTipX + ux * sashThickPx, leafTipY + uy * sashThickPx)
    ctx.lineTo(pWall1[0] + ux * sashThickPx, pWall1[1] + uy * sashThickPx)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // 90° Swing Arc
    const angleClosed = Math.atan2(pWall2[1] - pWall1[1], pWall2[0] - pWall1[0])
    const angleOpen = Math.atan2(leafTipY - pWall1[1], leafTipX - pWall1[0])
    ctx.beginPath()
    ctx.strokeStyle = sashColor
    ctx.lineWidth = 0.9
    ctx.setLineDash([4, 3])
    ctx.arc(pWall1[0], pWall1[1], clearSpan, angleClosed, angleOpen, exteriorSign < 0)
    ctx.stroke()
    ctx.setLineDash([])
  } else if (operation === 'louver') {
    // Louver Window (W5)
    ctx.beginPath()
    ctx.strokeStyle = sashColor
    ctx.lineWidth = 1.1
    const sashThickPx = Math.max(3, Math.min(18, thickPx * 0.35))
    ctx.rect(clearStart[0] - nx * (sashThickPx / 2), clearStart[1] - ny * (sashThickPx / 2), clearSpan, sashThickPx)
    ctx.stroke()

    // Slanted glass slats
    const slatStep = 24
    const numSlats = Math.floor(clearSpan / slatStep)
    ctx.beginPath()
    ctx.strokeStyle = glassColor
    ctx.lineWidth = 1
    for (let s = 1; s <= numSlats; s++) {
      const spx = clearStart[0] + ux * (s * slatStep)
      const spy = clearStart[1] + uy * (s * slatStep)
      ctx.moveTo(spx - ux * 4 - nx * (sashThickPx / 2), spy - uy * 4 - ny * (sashThickPx / 2))
      ctx.lineTo(spx + ux * 4 + nx * (sashThickPx / 2), spy + uy * 4 + ny * (sashThickPx / 2))
    }
    ctx.stroke()
  } else {
    // Fixed Picture Window (W6)
    const glassOffsetPx = 6
    ctx.beginPath()
    ctx.strokeStyle = glassColor
    ctx.lineWidth = 1
    ctx.moveTo(clearStart[0] + nx * glassOffsetPx, clearStart[1] + ny * glassOffsetPx)
    ctx.lineTo(clearEnd[0] + nx * glassOffsetPx, clearEnd[1] + ny * glassOffsetPx)
    ctx.moveTo(clearStart[0] - nx * glassOffsetPx, clearStart[1] - ny * glassOffsetPx)
    ctx.lineTo(clearEnd[0] - nx * glassOffsetPx, clearEnd[1] - ny * glassOffsetPx)
    ctx.stroke()
  }

  // 5. Window Tag Mark (W1, W2, etc.)
  const text = mark || 'W1'
  ctx.font = 'bold 9px monospace'
  ctx.save()
  ctx.translate(scx, scy)
  const windowTagOffset = halfWall + 18
  ctx.rotate(Math.atan2(-uy, ux))
  if (showLabel) queuePlanLabel(ctx, 0, -windowTagOffset, text, '#0369a1', isSelected ? '#1682e8' : '#0ea5e9', isSelected ? 10 : isHovered ? 8 : 5, '#fbfdff', true, 'hexagon', [0, -halfWall])
  ctx.restore()

  ctx.restore()
}

function drawPlacementGhost(
  ctx: CanvasRenderingContext2D,
  ghost: PlacementGhost,
  viewport: ViewportState,
  project?: ProjectDocument
) {
  ctx.save()

  if (ghost.type === 'beam' && ghost.target_location_mm) {
    const [sx1, sy1] = worldToScreen(ghost.location_mm, viewport)
    const [sx2, sy2] = worldToScreen(ghost.target_location_mm, viewport)
    const w_mm = ghost.size_mm?.[0] || 200
    const d_mm = ghost.size_mm?.[1] || 400
    const dx = sx2 - sx1
    const dy = sy2 - sy1
    const len = Math.hypot(dx, dy)
    if (len > 2) {
      const nx = -dy / len
      const ny = dx / len
      const half_w_px = (w_mm * viewport.zoom) / 2

      ctx.beginPath()
      ctx.moveTo(sx1 + nx * half_w_px, sy1 + ny * half_w_px)
      ctx.lineTo(sx2 + nx * half_w_px, sy2 + ny * half_w_px)
      ctx.lineTo(sx2 - nx * half_w_px, sy2 - ny * half_w_px)
      ctx.lineTo(sx1 - nx * half_w_px, sy1 - ny * half_w_px)
      ctx.closePath()

      ctx.fillStyle = 'rgba(56, 189, 248, 0.25)'
      ctx.fill()
      ctx.strokeStyle = '#38bdf8'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 4])
      ctx.stroke()
      ctx.setLineDash([])

      // Live span badge
      const span_mm = Math.round(Math.hypot(
        ghost.target_location_mm[0] - ghost.location_mm[0],
        ghost.target_location_mm[1] - ghost.location_mm[1]
      ))
      const mx = (sx1 + sx2) / 2
      const my = (sy1 + sy2) / 2
      ctx.fillStyle = '#0f172a'
      const badgeText = `${ghost.mark || 'B1'} (${(w_mm / 1000).toFixed(2)}×${(d_mm / 1000).toFixed(2)} m)  Span: ${(span_mm / 1000).toFixed(2)} m`
      ctx.font = 'bold 11px monospace'
      queuePlanLabel(ctx, mx, my, badgeText, '#38bdf8', '#38bdf8', 20, '#0f172a')
    }

    // Start anchor circle
    ctx.fillStyle = '#38bdf8'
    ctx.beginPath()
    const referenceStart = worldToScreen(ghost.reference_start_mm ?? ghost.location_mm, viewport)
    ctx.arc(referenceStart[0], referenceStart[1], 5, 0, Math.PI * 2)
    ctx.fill()

    ctx.restore()
    return
  }

  if (ghost.type === 'wall' && ghost.target_location_mm) {
    const [sx1, sy1] = worldToScreen(ghost.location_mm, viewport)
    const [sx2, sy2] = worldToScreen(ghost.target_location_mm, viewport)
    const thick_mm = ghost.size_mm?.[0] || 100
    const dx = sx2 - sx1
    const dy = sy2 - sy1
    const len = Math.hypot(dx, dy)
    if (len > 2) {
      const nx = -dy / len
      const ny = dx / len
      const half_thick_px = (thick_mm * viewport.zoom) / 2

      ctx.beginPath()
      ctx.moveTo(sx1 + nx * half_thick_px, sy1 + ny * half_thick_px)
      ctx.lineTo(sx2 + nx * half_thick_px, sy2 + ny * half_thick_px)
      ctx.lineTo(sx2 - nx * half_thick_px, sy2 - ny * half_thick_px)
      ctx.lineTo(sx1 - nx * half_thick_px, sy1 - ny * half_thick_px)
      ctx.closePath()

      ctx.fillStyle = 'rgba(148, 163, 184, 0.35)'
      ctx.fill()
      ctx.strokeStyle = '#94a3b8'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 4])
      ctx.stroke()
      ctx.setLineDash([])

      // Live length badge
      const length_mm = Math.round(Math.hypot(
        ghost.target_location_mm[0] - ghost.location_mm[0],
        ghost.target_location_mm[1] - ghost.location_mm[1]
      ))
      const mx = (sx1 + sx2) / 2
      const my = (sy1 + sy2) / 2
      ctx.fillStyle = '#0f172a'
      const badgeText = `${ghost.mark || 'W1'} (${(thick_mm / 1000).toFixed(2)} m)  L: ${(length_mm / 1000).toFixed(2)} m`
      ctx.font = 'bold 11px monospace'
      queuePlanLabel(ctx, mx, my, badgeText, '#e2e8f0', '#94a3b8', 20, '#0f172a')
    }

    ctx.fillStyle = '#94a3b8'
    ctx.beginPath()
    const referenceStart = worldToScreen(ghost.reference_start_mm ?? ghost.location_mm, viewport)
    ctx.arc(referenceStart[0], referenceStart[1], 5, 0, Math.PI * 2)
    ctx.fill()

    if (ghost.wall_junction_preview) {
      ctx.strokeStyle = '#0d9488'
      ctx.lineWidth = 2.5
      ctx.setLineDash([5, 3])
      ctx.beginPath()
      for (const [start, end] of ghost.wall_junction_preview.segments_mm) {
        const [x1, y1] = worldToScreen(start, viewport)
        const [x2, y2] = worldToScreen(end, viewport)
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
      }
      ctx.stroke()
      ctx.setLineDash([])

      const [junctionX, junctionY] = worldToScreen(ghost.wall_junction_preview.point_mm, viewport)
      ctx.fillStyle = '#0d9488'
      ctx.beginPath()
      ctx.arc(junctionX, junctionY, 5, 0, Math.PI * 2)
      ctx.fill()
      const marks = ghost.wall_junction_preview.target_marks.join(', ')
      queuePlanLabel(ctx, junctionX, junctionY, `ตัวอย่างรอยต่อ · ${marks}`, '#0d9488', '#0d9488', 22, '#f0fdfa')
    }

    ctx.restore()
    return
  }

  if (ghost.type === 'door' && ghost.wall_id && project) {
    const hostWall = project.objects[ghost.wall_id]
    if (hostWall && isWallObject(hostWall)) {
      const [wx1, wy1] = hostWall.module_data.start_point_mm
      const [wx2, wy2] = hostWall.module_data.end_point_mm
      const wdx = wx2 - wx1
      const wdy = wy2 - wy1
      const wlen = Math.hypot(wdx, wdy)
      if (wlen > 1) {
        const ux = wdx / wlen
        const uy = wdy / wlen
        const nx = -uy
        const ny = ux
        const offset = ghost.offset_along_wall_mm ?? (wlen / 2)
        const cx = wx1 + offset * ux
        const cy = wy1 + offset * uy
        const width_mm = ghost.size_mm?.[0] || 800
        const half_w = width_mm / 2
        const j1_mm: [number, number] = [cx - half_w * ux, cy - half_w * uy]
        const j2_mm: [number, number] = [cx + half_w * ux, cy + half_w * uy]
        const [sj1x, sj1y] = worldToScreen(j1_mm, viewport)
        const [sj2x, sj2y] = worldToScreen(j2_mm, viewport)
        const [scx, scy] = worldToScreen([cx, cy], viewport)

        const thick_px = hostWall.module_data.thickness_mm * viewport.zoom
        ctx.strokeStyle = '#4ade80'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(sj1x + nx * (thick_px / 2), sj1y + ny * (thick_px / 2))
        ctx.lineTo(sj1x - nx * (thick_px / 2), sj1y - ny * (thick_px / 2))
        ctx.moveTo(sj2x + nx * (thick_px / 2), sj2y + ny * (thick_px / 2))
        ctx.lineTo(sj2x - nx * (thick_px / 2), sj2y - ny * (thick_px / 2))
        ctx.stroke()

        const operation = ghost.operation || 'hinged'
        const panels = Math.max(1, Math.min(8, ghost.panel_count || 1))
        ctx.strokeStyle = '#4ade80'
        ctx.lineWidth = 2
        if (operation === 'fixed') {
          ctx.beginPath()
          ctx.moveTo(sj1x, sj1y); ctx.lineTo(sj2x, sj2y)
          ctx.moveTo(sj1x + nx * thick_px * 0.3, sj1y + ny * thick_px * 0.3)
          ctx.lineTo(sj2x + nx * thick_px * 0.3, sj2y + ny * thick_px * 0.3)
          ctx.moveTo(sj1x, sj1y); ctx.lineTo(sj2x + nx * thick_px * 0.3, sj2y + ny * thick_px * 0.3)
          ctx.stroke()
        } else if (operation === 'sliding') {
          ctx.beginPath()
          ctx.moveTo(sj1x, sj1y); ctx.lineTo(sj2x, sj2y)
          for (let i = 1; i < panels; i++) {
            const t = i / panels
            const px = sj1x + (sj2x - sj1x) * t, py = sj1y + (sj2y - sj1y) * t
            ctx.moveTo(px + nx * thick_px * 0.28, py + ny * thick_px * 0.28)
            ctx.lineTo(px - nx * thick_px * 0.28, py - ny * thick_px * 0.28)
          }
          ctx.stroke()
          ctx.strokeStyle = 'rgba(74, 222, 128, 0.55)'
          ctx.beginPath()
          ctx.moveTo(sj1x + nx * thick_px * 0.24, sj1y + ny * thick_px * 0.24)
          ctx.lineTo(sj2x + nx * thick_px * 0.24, sj2y + ny * thick_px * 0.24)
          ctx.stroke()
        } else if (operation === 'louver') {
          ctx.beginPath()
          ctx.moveTo(sj1x, sj1y); ctx.lineTo(sj2x, sj2y)
          for (let i = 1; i <= 4; i++) {
            const t = i / 5
            const px = sj1x + (sj2x - sj1x) * t, py = sj1y + (sj2y - sj1y) * t
            ctx.moveTo(px + nx * thick_px * 0.35, py + ny * thick_px * 0.35)
            ctx.lineTo(px - nx * thick_px * 0.35, py - ny * thick_px * 0.35)
          }
          ctx.stroke()
        } else {
          const isLeft = (ghost.handing || 'left_in').startsWith('left')
          const isOut = (ghost.handing || 'left_in').endsWith('out')
          const hinge_s = isLeft ? [sj1x, sj1y] : [sj2x, sj2y]
          const latch_s = isLeft ? [sj2x, sj2y] : [sj1x, sj1y]
          const normalSign = isOut ? -1 : 1
          const doorLeafLenPx = width_mm * viewport.zoom
          const leafEndX = hinge_s[0] + normalSign * nx * doorLeafLenPx
          const leafEndY = hinge_s[1] + normalSign * ny * doorLeafLenPx
          ctx.beginPath(); ctx.moveTo(hinge_s[0], hinge_s[1]); ctx.lineTo(leafEndX, leafEndY); ctx.stroke()
          const angleClosed = Math.atan2(latch_s[1] - hinge_s[1], latch_s[0] - hinge_s[0])
          const angleOpen = Math.atan2(leafEndY - hinge_s[1], leafEndX - hinge_s[0])
          const counterClockwise = (angleOpen - angleClosed + 2 * Math.PI) % (2 * Math.PI) > Math.PI
          ctx.beginPath(); ctx.strokeStyle = 'rgba(74, 222, 128, 0.7)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3])
          ctx.arc(hinge_s[0], hinge_s[1], doorLeafLenPx, angleClosed, angleOpen, counterClockwise)
          ctx.stroke(); ctx.setLineDash([])
        }

        const handingLabel = operation === 'hinged' ? ` · ${(ghost.handing || 'left_in').replace('_', ' ').toUpperCase()} · Space: Flip` : ''
        const operationLabel = operation === 'sliding' ? 'บานเลื่อน' : operation === 'louver' ? 'บานเกล็ด' : operation === 'fixed' ? 'ช่องแสง' : 'บานเปิด'
        const panelLabel = panels > 1 ? ` · ${panels} บาน` : ''
        const badgeText = `${ghost.mark || 'D1'} ${operationLabel}${panelLabel} (${(width_mm / 1000).toFixed(2)} m)${handingLabel}`
        ctx.font = 'bold 10px monospace'
        const bw = ctx.measureText(badgeText).width
        ctx.fillStyle = '#0f172a'
        ctx.fillRect(scx - bw / 2 - 4, scy - 8, bw + 8, 16)
        ctx.strokeStyle = '#22c55e'
        ctx.strokeRect(scx - bw / 2 - 4, scy - 8, bw + 8, 16)
        ctx.fillStyle = '#4ade80'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(badgeText, scx, scy)

        ctx.restore()
        return
      }
    }
  }

  if (ghost.type === 'window' && ghost.wall_id && project) {
    const hostWall = project.objects[ghost.wall_id]
    if (hostWall && isWallObject(hostWall)) {
      const [wx1, wy1] = hostWall.module_data.start_point_mm
      const [wx2, wy2] = hostWall.module_data.end_point_mm
      const wdx = wx2 - wx1
      const wdy = wy2 - wy1
      const wlen = Math.hypot(wdx, wdy)
      if (wlen > 1) {
        const ux = wdx / wlen
        const uy = wdy / wlen
        const nx = -uy
        const ny = ux
        const offset = ghost.offset_along_wall_mm ?? (wlen / 2)
        const cx = wx1 + offset * ux
        const cy = wy1 + offset * uy
        const width_mm = ghost.size_mm?.[0] || 1200
        const half_w = width_mm / 2
        const [scx, scy] = worldToScreen([cx, cy], viewport)

        const p1_mm: [number, number] = [cx - half_w * ux, cy - half_w * uy]
        const p2_mm: [number, number] = [cx + half_w * ux, cy + half_w * uy]
        const [sp1x, sp1y] = worldToScreen(p1_mm, viewport)
        const [sp2x, sp2y] = worldToScreen(p2_mm, viewport)
        const thick_px = hostWall.module_data.thickness_mm * viewport.zoom

        const operation = ghost.operation || 'sliding'
        const panels = Math.max(1, Math.min(8, ghost.panel_count || 2))
        ctx.strokeStyle = '#38bdf8'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(sp1x + nx * (thick_px / 2), sp1y + ny * (thick_px / 2))
        ctx.lineTo(sp1x - nx * (thick_px / 2), sp1y - ny * (thick_px / 2))
        ctx.moveTo(sp2x + nx * (thick_px / 2), sp2y + ny * (thick_px / 2))
        ctx.lineTo(sp2x - nx * (thick_px / 2), sp2y - ny * (thick_px / 2))
        ctx.moveTo(sp1x, sp1y)
        ctx.lineTo(sp2x, sp2y)
        for (let i = 1; i < panels; i++) {
          const t = i / panels
          const px = sp1x + (sp2x - sp1x) * t, py = sp1y + (sp2y - sp1y) * t
          ctx.moveTo(px + nx * thick_px * 0.32, py + ny * thick_px * 0.32)
          ctx.lineTo(px - nx * thick_px * 0.32, py - ny * thick_px * 0.32)
        }
        ctx.stroke()
        if (ghost.glazing_material && ghost.glazing_material !== 'none') {
          ctx.fillStyle = ghost.glazing_material === 'frosted_glass' ? 'rgba(186, 230, 253, 0.58)' : 'rgba(125, 211, 252, 0.3)'
          ctx.beginPath(); ctx.moveTo(sp1x, sp1y); ctx.lineTo(sp2x, sp2y); ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)'; ctx.lineWidth = Math.max(4, thick_px * 0.3); ctx.stroke()
          ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2
        }
        if (operation === 'louver') {
          ctx.beginPath()
          for (let i = 1; i <= 3; i++) {
            const t = i / 4
            const px = sp1x + (sp2x - sp1x) * t, py = sp1y + (sp2y - sp1y) * t
            ctx.moveTo(px + nx * thick_px * 0.36, py + ny * thick_px * 0.36)
            ctx.lineTo(px - nx * thick_px * 0.36, py - ny * thick_px * 0.36)
          }
          ctx.stroke()
        }

        const operationLabel = operation === 'sliding' ? 'บานเลื่อน' : operation === 'awning' ? 'บานกระทุ้ง' : operation === 'louver' ? 'บานเกล็ด' : 'ช่องแสง'
        const sillLabel = `${Math.round(ghost.sill_height_mm || 0)} mm`
        const badgeText = `${ghost.mark || 'W1'} ${operationLabel} · ${panels} บาน · ธรณี ${sillLabel} · ${(width_mm / 1000).toFixed(2)} m`
        ctx.font = 'bold 10px monospace'
        const bw = ctx.measureText(badgeText).width
        ctx.fillStyle = '#0f172a'
        ctx.fillRect(scx - bw / 2 - 4, scy - 8, bw + 8, 16)
        ctx.strokeStyle = '#0284c7'
        ctx.strokeRect(scx - bw / 2 - 4, scy - 8, bw + 8, 16)
        ctx.fillStyle = '#38bdf8'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(badgeText, scx, scy)

        ctx.restore()
        return
      }
    }
  }

  const [x, y] = worldToScreen(ghost.location_mm, viewport)

  if (ghost.type === 'stair') {
    if (!ghost.stair) { ctx.restore(); return }
    const drawing = getStairPlanDrawing(ghost.stair, ghost.stair.start_point_mm[2])
    ctx.strokeStyle = '#a855f7'
    ctx.lineWidth = 1.5
    for (const [paths, dash] of [[drawing.solid_paths_mm, []], [drawing.overhead_paths_mm, [5, 4]]] as const) for (const path of paths) {
      ctx.setLineDash([...dash])
      ctx.beginPath()
      path.forEach((p, i) => { const [px, py] = worldToScreen(p, viewport); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py) })
      ctx.stroke()
    }
    ctx.fillStyle = '#7e22ce'
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'left'
    ctx.fillText(`${ghost.stair.num_risers} ขั้น · ลูกนอน ${(ghost.stair.tread_depth_mm / 1000).toFixed(3)} m`, x + 8, y - 12)
    ctx.restore()
    return
  }

  if (ghost.type === 'foundation') {
    const w_mm = ghost.size_mm?.[0] || 800
    const l_mm = ghost.size_mm?.[1] || 800
    const w_px = w_mm * viewport.zoom
    const l_px = l_mm * viewport.zoom

    ctx.fillStyle = 'rgba(245, 158, 11, 0.25)' // Amber
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])

    ctx.fillRect(x - w_px / 2, y - l_px / 2, w_px, l_px)
    ctx.strokeRect(x - w_px / 2, y - l_px / 2, w_px, l_px)

    ctx.fillStyle = '#f59e0b'
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${ghost.mark || 'F1'} (${w_mm}×${l_mm})`, x, y)
  } else {
    const w_mm = ghost.size_mm?.[0] || 200
    const d_mm = ghost.size_mm?.[1] || 200
    const w_px = w_mm * viewport.zoom
    const d_px = d_mm * viewport.zoom

    ctx.fillStyle = 'rgba(56, 189, 248, 0.35)' // Cyan
    ctx.strokeStyle = '#38bdf8'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])

    ctx.fillRect(x - w_px / 2, y - d_px / 2, w_px, d_px)
    ctx.strokeRect(x - w_px / 2, y - d_px / 2, w_px, d_px)

    ctx.fillStyle = '#38bdf8'
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${ghost.mark || 'C1'} (${w_mm}×${d_mm})`, x, y)
  }
  ctx.restore()
}

function drawSnapMarker(
  ctx: CanvasRenderingContext2D,
  snap: SnapResult,
  viewport: ViewportState
) {
  const [x, y] = worldToScreen(snap.point_mm, viewport)
  ctx.save()

  if (snap.kind === 'grid_intersection') {
    // Yellow diamond for intersection
    const s = 7
    ctx.strokeStyle = '#eab308'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, y - s)
    ctx.lineTo(x + s, y)
    ctx.lineTo(x, y + s)
    ctx.lineTo(x - s, y)
    ctx.closePath()
    ctx.stroke()
  } else if (snap.kind === 'column_center') {
    // Green square for column center
    const s = 6
    ctx.strokeStyle = '#22c55e'
    ctx.lineWidth = 2
    ctx.strokeRect(x - s, y - s, s * 2, s * 2)
  } else if (snap.kind === 'parallel' || snap.kind === 'perpendicular') {
    const s = 7
    ctx.strokeStyle = snap.kind === 'parallel' ? '#f97316' : '#a855f7'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, y - s)
    ctx.lineTo(x + s, y)
    ctx.lineTo(x, y + s)
    ctx.lineTo(x - s, y)
    ctx.closePath()
    ctx.stroke()
  } else if (snap.kind.includes('endpoint') || snap.kind.includes('midpoint') || snap.kind === 'intersection') {
    // Node and midpoint marker
    ctx.strokeStyle = snap.kind === 'intersection' ? '#eab308' : '#c084fc'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y, snap.kind.includes('endpoint') ? 6 : 5, 0, Math.PI * 2)
    ctx.stroke()
  } else if (snap.kind === 'column_corner' || snap.kind === 'wall_corner') {
    ctx.strokeStyle = '#22c55e'
    ctx.lineWidth = 2
    ctx.strokeRect(x - 5, y - 5, 10, 10)
  } else if (snap.kind === 'column_face' || snap.kind === 'wall_face' || snap.kind === 'beam_edge' || snap.kind === 'object_edge' || snap.kind === 'wall_centerline' || snap.kind === 'beam_axis') {
    ctx.strokeStyle = '#06b6d4'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x - 6, y - 6)
    ctx.lineTo(x + 6, y + 6)
    ctx.moveTo(x + 6, y - 6)
    ctx.lineTo(x - 6, y + 6)
    ctx.stroke()
  } else if (snap.kind === 'wall_endpoint') {
    // Cyan triangle for wall endpoint
    const s = 6
    ctx.strokeStyle = '#38bdf8'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, y - s)
    ctx.lineTo(x + s, y + s)
    ctx.lineTo(x - s, y + s)
    ctx.closePath()
    ctx.stroke()
  } else if (snap.kind === 'grid_line') {
    // Cyan cross
    const s = 6
    ctx.strokeStyle = '#38bdf8'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x - s, y)
    ctx.lineTo(x + s, y)
    ctx.moveTo(x, y - s)
    ctx.lineTo(x, y + s)
    ctx.stroke()
  }

  // Keep the label legible on the light plan background.
  if (snap.kind !== 'free') {
  ctx.font = '11px system-ui, sans-serif'
  ctx.textAlign = 'left'
  const labelWidth = ctx.measureText(snap.description).width
  ctx.fillStyle = 'rgba(255,255,255,.96)'
  ctx.fillRect(x + 7, y - 24, labelWidth + 8, 19)
  ctx.strokeStyle = '#bae6fd'; ctx.lineWidth = 1
  ctx.strokeRect(x + 7, y - 24, labelWidth + 8, 19)
  ctx.fillStyle = '#075985'
  ctx.fillText(snap.description, x + 10, y - 10)
  }

  ctx.restore()
}

function drawCalibrationOverlay(
  ctx: CanvasRenderingContext2D,
  calibration: CalibrationOverlay,
  viewport: ViewportState
) {
  ctx.save()

  const p1 = calibration.point1_mm
  const p2 = calibration.point2_mm || calibration.mouse_mm

  if (p1) {
    const [sx1, sy1] = worldToScreen(p1, viewport)

    // P1 Marker (Bright red crosshair + ring)
    ctx.strokeStyle = '#ef4444'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(sx1, sy1, 9, 0, Math.PI * 2)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(sx1 - 14, sy1)
    ctx.lineTo(sx1 + 14, sy1)
    ctx.moveTo(sx1, sy1 - 14)
    ctx.lineTo(sx1, sy1 + 14)
    ctx.stroke()

    ctx.fillStyle = '#ef4444'
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText('Point 1', sx1 + 12, sy1 - 6)

    if (p2) {
      const [sx2, sy2] = worldToScreen(p2, viewport)

      // Dynamic measurement rubber-band
      ctx.strokeStyle = '#f59e0b' // Amber
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      ctx.moveTo(sx1, sy1)
      ctx.lineTo(sx2, sy2)
      ctx.stroke()
      ctx.setLineDash([])

      // P2 Marker
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(sx2, sy2, 9, 0, Math.PI * 2)
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(sx2 - 14, sy2)
      ctx.lineTo(sx2 + 14, sy2)
      ctx.moveTo(sx2, sy2 - 14)
      ctx.lineTo(sx2, sy2 + 14)
      ctx.stroke()

      ctx.fillStyle = '#f59e0b'
      ctx.font = 'bold 11px monospace'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'bottom'
      ctx.fillText('Point 2', sx2 + 12, sy2 - 6)

      // Live measurement badge at midpoint
      const mx = (sx1 + sx2) / 2
      const my = (sy1 + sy2) / 2
      const dist_mm = Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]))
      const badgeText = `📏 วัดเทียบระยะ: ${(dist_mm / 1000).toFixed(3)} m (${dist_mm} mm)`

      ctx.font = 'bold 12px monospace'
      const bw = ctx.measureText(badgeText).width
      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)'
      ctx.fillRect(mx - bw / 2 - 8, my - 13, bw + 16, 26)
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 1.5
      ctx.strokeRect(mx - bw / 2 - 8, my - 13, bw + 16, 26)

      ctx.fillStyle = '#fef08a'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(badgeText, mx, my)
    }
  }

  ctx.restore()
}

