// ConstructFlow Coordination Model
//
// Turns smart objects into *exact* convex solids (oriented boxes along the real element axis,
// swept-sphere pipe chains, plan sectors for door swings, extruded boundaries) instead of the
// inflated axis-aligned envelopes used by the broad phase. Doors, windows and demolition rules
// also need parameters that are not solids, so wall openings and route data are exported too.

import {
  resolveArchitectureSurfaceElevation,
  resolveBeamBaseElevation,
  resolveCatalogType,
  resolveColumnVerticalExtent,
  resolveOpeningVerticalExtent,
  resolveSlabElevation,
  resolveWallVerticalExtent,
  type Phase,
  type ProjectDocument,
  type SmartObject,
} from '@constructflow/project-model'
import { constructionOutputs } from '@constructflow/domain-providers'
import {
  axisBox,
  capsuleSegments,
  boundsOf,
  obbFromAxis,
  prismFromBoundary,
  type ConvexSolid,
} from './exactContact.js'
import type { SpatialBounds, Vec3 } from './spatial.js'

export type CoordinationRole =
  | 'structure'
  | 'wall'
  | 'slab'
  | 'ceiling'
  | 'opening'
  | 'door_swing'
  | 'mep_pipe'
  | 'fixture'
  | 'cabinet'
  | 'roof'
  | 'other'

export interface CoordinationProxy {
  object_id: string
  object_type: string
  mark: string
  level_id?: string
  created_phase: Phase
  removed_phase: 'demolition' | null
  role: CoordinationRole
  /** Primary solids: door/window = 1 volume, pipe = per-segment capsules, sector = 1 prism. */
  solids: ConvexSolid[]
  /** Secondary solid set used only by door-swing rules (the quarter-circle envelope). */
  swing_solids?: ConvexSolid[]
  bounds: SpatialBounds
  /** True when the proxy is a conservative stand-in (hull of a mesh, slope ignored, ...). */
  approximate: boolean
  notes: string[]
  /** Discriminator for rules that target one variant, e.g. `light` downlights. */
  kind?: string
}

export interface WallOpeningParameter {
  object_id: string
  wall_id: string
  offset_mm: number
  width_mm: number
  z_min_mm: number
  z_max_mm: number
}

export interface RouteParameter {
  object_id: string
  system: string
  diameter_mm: number
  /** Drainage/soil/waste routes cannot claim clearance until invert levels exist. */
  invert_known: boolean
}

export interface CoordinationModel {
  proxies: CoordinationProxy[]
  openings: WallOpeningParameter[]
  routes: RouteParameter[]
  warnings: string[]
}

type Data = Record<string, unknown>

const record = (value: unknown): Data | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Data : undefined

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const positiveNumber = (value: unknown): value is number => isFiniteNumber(value) && value > 0
const tuple3 = (value: unknown): Vec3 | undefined =>
  Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber) ? value as Vec3 : undefined
const tuple2 = (value: unknown): [number, number] | undefined =>
  Array.isArray(value) && value.length >= 2 && value.slice(0, 2).every(isFiniteNumber)
    ? [value[0] as number, value[1] as number]
    : undefined

/** instance override → instance value → catalog type parameter (same order as the rest of the engine). */
function valueFor(project: ProjectDocument, object: SmartObject, data: Data, field: string): unknown {
  const overrides = record(data.instance_overrides)
  if (overrides?.[field] !== undefined) return overrides[field]
  if (data[field] !== undefined) return data[field]
  const reference = typeof data.type_id === 'string' ? data.type_id : typeof data.mark === 'string' ? data.mark : undefined
  return resolveCatalogType(project, object.object_type, reference)?.parameters[field]
}

function rotationAxes(rotationDeg: number): [Vec3, Vec3, Vec3] {
  const angle = (isFiniteNumber(rotationDeg) ? rotationDeg : 0) * Math.PI / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return [[cos, sin, 0], [-sin, cos, 0], [0, 0, 1]]
}

/** Quarter-circle swing envelope of a hinged door leaf, in plan, extruded to the opening height. */
function doorSwingSolid(project: ProjectDocument, door: SmartObject): ConvexSolid | undefined {
  const data = door.module_data as Data
  const host = typeof data.wall_id === 'string' ? project.objects[data.wall_id] : undefined
  if (!host || host.object_type !== 'architecture.wall') return undefined
  const hostData = host.module_data as Data
  const start = tuple3(hostData.start_point_mm)
  const end = tuple3(hostData.end_point_mm)
  const wallThickness = valueFor(project, host, hostData, 'thickness_mm')
  const width = valueFor(project, door, data, 'width_mm')
  const vertical = resolveOpeningVerticalExtent(project, door)
  if (!start || !end || !positiveNumber(width) || !vertical) return undefined
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const length = Math.hypot(dx, dy)
  if (length < 1) return undefined
  const ux = dx / length
  const uy = dy / length
  const offset = isFiniteNumber(data.offset_along_wall_mm) ? data.offset_along_wall_mm : length / 2
  const halfWidth = width / 2
  const handing = typeof data.handing === 'string' ? data.handing : 'left_in'
  const isLeft = handing.startsWith('left')
  const hingeOffset = isLeft ? offset - halfWidth : offset + halfWidth
  const hinge: [number, number] = [start[0] + ux * hingeOffset, start[1] + uy * hingeOffset]
  const leaf = Math.max(200, width - 50)
  // Closed leaf direction runs from the hinge jamb toward the opposite jamb.
  const closedAngle = Math.atan2(isLeft ? uy : -uy, isLeft ? ux : -ux)
  // Swing side: `_in` opens toward the room (wall interior face), `_out` toward the outside.
  const interiorSign = hostData.interior_side === 'right' ? -1 : 1
  const normalAngle = Math.atan2(ux * interiorSign, -uy * interiorSign)
  const towardInterior = handing.endsWith('_in')
  const targetAngle = towardInterior ? normalAngle : normalAngle + Math.PI
  const clockwise = normalizedDelta(closedAngle, targetAngle) > Math.PI
  const startDeg = closedAngle * 180 / Math.PI
  const sweepDeg = clockwise ? -90 : 90
  return {
    kind: 'sector_prism',
    hinge,
    radius: Math.max(leaf, 100),
    start_deg: sweepDeg > 0 ? startDeg : startDeg - 90,
    sweep_deg: 90,
    z_min: vertical.base_elevation_mm,
    z_max: vertical.top_elevation_mm,
  }
}

const normalizedDelta = (from: number, to: number): number => {
  let delta = (to - from) % (2 * Math.PI)
  if (delta < 0) delta += 2 * Math.PI
  return delta
}

function openingSolid(project: ProjectDocument, object: SmartObject): ConvexSolid | undefined {
  const data = object.module_data as Data
  const host = typeof data.wall_id === 'string' ? project.objects[data.wall_id] : undefined
  if (!host || host.object_type !== 'architecture.wall') return undefined
  const hostData = host.module_data as Data
  const start = tuple3(hostData.start_point_mm)
  const end = tuple3(hostData.end_point_mm)
  const thickness = valueFor(project, host, hostData, 'thickness_mm')
  const width = valueFor(project, object, data, 'width_mm')
  const vertical = resolveOpeningVerticalExtent(project, object)
  if (!start || !end || !positiveNumber(width) || !positiveNumber(thickness) || !vertical) return undefined
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const length = Math.hypot(dx, dy)
  if (length < 1) return undefined
  const ux = dx / length
  const uy = dy / length
  const offset = isFiniteNumber(data.offset_along_wall_mm) ? data.offset_along_wall_mm : length / 2
  const half = width / 2
  const jambA: [number, number] = [start[0] + ux * (offset - half), start[1] + uy * (offset - half)]
  const jambB: [number, number] = [start[0] + ux * (offset + half), start[1] + uy * (offset + half)]
  const centerZ = (vertical.base_elevation_mm + vertical.top_elevation_mm) / 2
  return obbFromAxis([jambA[0], jambA[1], 0], [jambB[0], jambB[1], 0], thickness, vertical.height_mm, centerZ)
}

function meshFallbackSolids(output: { meshes: Vec3[][]; paths: Vec3[][] }, data: Data): { solids: ConvexSolid[]; approximate: boolean; notes: string[] } {
  const points: Vec3[] = output.meshes.flat().map(point => [point[0], point[1], point[2]] as Vec3)
  if (points.length >= 4) return { solids: [{ kind: 'points', points }], approximate: true, notes: ['ใช้ hull ของ mesh จาก domain output (ยังไม่ใช่ CSG แม่นยำ)'] }
  const radius = positiveNumber(data.diameter_mm) ? (data.diameter_mm as number) / 2 : 25
  const solids: ConvexSolid[] = []
  for (const path of output.paths) solids.push(...capsuleSegments(path, radius))
  return { solids, approximate: true, notes: solids.length ? ['ใช้แนวเส้นจาก domain output แทนภาคตัดจริง'] : [] }
}

/** Build every coordination proxy once; the engine reuses the result for all rule pairs. */
export function buildCoordinationModel(project: ProjectDocument): CoordinationModel {
  const warnings: string[] = []
  const proxies: CoordinationProxy[] = []
  const openings: WallOpeningParameter[] = []
  const routes: RouteParameter[] = []
  const outputsByObject = new Map(constructionOutputs(project).map(output => [output.object_id, output]))

  for (const object of Object.values(project.objects).sort((a, b) => a.id.localeCompare(b.id))) {
    const data = record(object.module_data)
    if (!data) {
      warnings.push(`${object.id}: module data is not an object; coordination skipped`)
      continue
    }
    const proxy = buildProxy(project, object, data, outputsByObject, warnings)
    if (!proxy) continue
    proxies.push(proxy)

    if ((object.object_type === 'door_window.door' || object.object_type === 'door_window.window') && typeof data.wall_id === 'string' && proxy.solids.length) {
      const vertical = resolveOpeningVerticalExtent(project, object)
      const width = valueFor(project, object, data, 'width_mm')
      if (vertical && positiveNumber(width)) {
        openings.push({
          object_id: object.id,
          wall_id: data.wall_id,
          offset_mm: isFiniteNumber(data.offset_along_wall_mm) ? data.offset_along_wall_mm : 0,
          width_mm: width,
          z_min_mm: vertical.base_elevation_mm,
          z_max_mm: vertical.top_elevation_mm,
        })
      }
    }

    if (object.object_type === 'drainage.pipe_route' || object.object_type === 'plumbing.pipe_route') {
      const system = typeof data.system === 'string' ? data.system : 'unknown'
      const diameter = valueFor(project, object, data, 'diameter_mm')
      const gravity = ['soil', 'waste', 'rainwater'].includes(system)
      routes.push({
        object_id: object.id,
        system,
        diameter_mm: positiveNumber(diameter) ? diameter : 0,
        invert_known: !gravity || (isFiniteNumber(data.start_invert_mm) && isFiniteNumber(data.end_invert_mm)),
      })
    }
  }

  return { proxies, openings, routes, warnings }
}

function buildProxy(
  project: ProjectDocument,
  object: SmartObject,
  data: Data,
  outputsByObject: Map<string, { meshes: Vec3[][]; paths: Vec3[][]; warnings: string[] }>,
  warnings: string[],
): CoordinationProxy | undefined {
  const base = {
    object_id: object.id,
    object_type: object.object_type,
    mark: typeof data.mark === 'string' && data.mark.trim() ? data.mark : object.object_type,
    ...(typeof data.level_id === 'string' ? { level_id: data.level_id } : {}),
    created_phase: object.created_phase,
    removed_phase: object.removed_phase ?? null,
  }
  const finish = (
    role: CoordinationRole,
    solids: ConvexSolid[],
    approximate: boolean,
    notes: string[],
    kind?: string,
    swing_solids?: ConvexSolid[],
  ): CoordinationProxy | undefined => {
    if (!solids.length) return undefined
    const all = [...solids, ...(swing_solids ?? [])]
    const bounds = all.map(boundsOf).reduce((acc, item) => ({
      min: [0, 1, 2].map(axis => Math.min(acc.min[axis], item.min[axis])) as Vec3,
      max: [0, 1, 2].map(axis => Math.max(acc.max[axis], item.max[axis])) as Vec3,
    }))
    return {
      ...base,
      role,
      solids,
      ...(swing_solids?.length ? { swing_solids } : {}),
      bounds,
      approximate,
      notes,
      ...(kind ? { kind } : {}),
    }
  }

  switch (object.object_type) {
    case 'structure.column': {
      const location = tuple3(data.location_mm)
      const section = tuple2(valueFor(project, object, data, 'section_mm'))
      const vertical = resolveColumnVerticalExtent(project, object)
      if (!location || !section || !vertical) {
        warnings.push(`${object.id}: column geometry is incomplete; coordination skipped`)
        return undefined
      }
      const half = vertical.height_mm / 2
      return finish('structure', [{
        kind: 'obb',
        center: [location[0], location[1], vertical.base_elevation_mm + half],
        half: [section[0] / 2, section[1] / 2, half],
        axes: rotationAxes(isFiniteNumber(data.rotation_deg) ? data.rotation_deg : 0),
      }], false, [])
    }
    case 'structure.beam': {
      const start = tuple3(data.start_point_mm)
      const end = tuple3(data.end_point_mm)
      const section = tuple2(valueFor(project, object, data, 'section_mm'))
      const baseElevation = resolveBeamBaseElevation(project, object)
      if (!start || !end || !section || baseElevation === undefined) {
        warnings.push(`${object.id}: beam endpoints or section are invalid; coordination skipped`)
        return undefined
      }
      const drop = isFiniteNumber(data.drop_mm) ? data.drop_mm : 0
      const bottom = baseElevation - drop
      return finish('structure', [
        obbFromAxis([start[0], start[1], 0], [end[0], end[1], 0], section[0], section[1], bottom + section[1] / 2),
      ], false, [])
    }
    case 'structure.foundation': {
      const center = tuple3(data.center_mm)
      const size = data.size_mm
      if (!center || !Array.isArray(size) || size.length !== 3 || !size.every(positiveNumber)) {
        warnings.push(`${object.id}: foundation center or size is invalid; coordination skipped`)
        return undefined
      }
      const [width, length, thickness] = size as [number, number, number]
      const top = isFiniteNumber(data.top_elevation_mm) ? data.top_elevation_mm : center[2]
      return finish('structure', [axisBox([center[0], center[1], top - thickness / 2], [width, length, thickness])], false, [])
    }
    case 'structure.slab': {
      const boundary = boundaryOf(data.boundary_mm)
      const elevation = resolveSlabElevation(project, object)
      const thickness = valueFor(project, object, data, 'thickness_mm')
      const topping = valueFor(project, object, data, 'topping_mm')
      if (!boundary || elevation === undefined || !positiveNumber(thickness)) {
        warnings.push(`${object.id}: slab boundary or thickness is invalid; coordination skipped`)
        return undefined
      }
      const zMax = elevation + (isFiniteNumber(topping) ? topping : 0)
      return finish('slab', [prismFromBoundary(boundary, elevation - thickness, zMax)], (data.slope_ratio !== undefined), data.slope_ratio !== undefined ? ['ไม่ได้รวมสโลปพื้นในรุ่นนี้ — ใช้ระดับอ้างอิง'] : [])
    }
    case 'architecture.floor':
    case 'architecture.ceiling': {
      const boundary = boundaryOf(data.boundary_mm)
      const elevation = resolveArchitectureSurfaceElevation(project, object)
      const thickness = valueFor(project, object, data, 'thickness_mm')
      if (!boundary || elevation === undefined || !positiveNumber(thickness)) {
        warnings.push(`${object.id}: surface boundary or thickness is invalid; coordination skipped`)
        return undefined
      }
      const isCeiling = object.object_type === 'architecture.ceiling'
      return finish(isCeiling ? 'ceiling' : 'slab', [
        prismFromBoundary(boundary, isCeiling ? elevation - thickness : elevation, isCeiling ? elevation : elevation + thickness),
      ], true, [isCeiling ? 'ฝ้าเพดานใช้ระนาบท้องฝ้าถึงระดับฝ้า' : 'พื้นตกแต่งใช้ระดับอ้างอิงถึงความหนาผิวสำเร็จ'])
    }
    case 'architecture.wall': {
      const start = tuple3(data.start_point_mm)
      const end = tuple3(data.end_point_mm)
      const thickness = valueFor(project, object, data, 'thickness_mm')
      const vertical = resolveWallVerticalExtent(project, object)
      if (!start || !end || !positiveNumber(thickness) || !vertical) {
        warnings.push(`${object.id}: wall endpoints, thickness or height are invalid; coordination skipped`)
        return undefined
      }
      return finish('wall', [
        obbFromAxis([start[0], start[1], 0], [end[0], end[1], 0], thickness, vertical.height_mm, (vertical.base_elevation_mm + vertical.top_elevation_mm) / 2),
      ], false, [])
    }
    case 'door_window.door':
    case 'door_window.window': {
      const solid = openingSolid(project, object)
      if (!solid) {
        warnings.push(`${object.id}: host or opening dimensions are invalid; coordination skipped`)
        return undefined
      }
      let swingSolids: ConvexSolid[] | undefined
      if (object.object_type === 'door_window.door') {
        const swing = doorSwingSolid(project, object)
        if (swing) swingSolids = [swing]
        else warnings.push(`${object.id}: door swing envelope is unavailable; swing conflicts cannot be verified`)
      }
      return finish('opening', [solid], false, [], undefined, swingSolids)
    }
    case 'electrical.fixture': {
      const location = tuple3(data.location_mm)
      if (!location) {
        warnings.push(`${object.id}: fixture location is invalid; coordination skipped`)
        return undefined
      }
      const kind = typeof data.kind === 'string' ? data.kind : 'device'
      if (kind === 'light') {
        const diameter = valueFor(project, object, data, 'diameter_mm')
        const radius = positiveNumber(diameter) ? diameter / 2 : 75
        return finish('fixture', [{ kind: 'disc_prism', center: [location[0], location[1]], radius, z_min: location[2] - 25, z_max: location[2] + 25 }], true, ['ดวงโคมจำลองเป็นทรงกระบอกแนวตั้ง'], kind)
      }
      const size: Vec3 = kind === 'panel' ? [400, 150, 600] : [86, 86, 40]
      return finish('fixture', [axisBox([location[0], location[1], location[2]], size)], true, [], kind)
    }
    case 'interior.cabinet_run': {
      const location = tuple3(data.location_mm)
      const width = valueFor(project, object, data, 'width_mm')
      const height = valueFor(project, object, data, 'height_mm')
      const depth = valueFor(project, object, data, 'depth_mm')
      if (!location || !positiveNumber(width) || !positiveNumber(height) || !positiveNumber(depth)) {
        warnings.push(`${object.id}: cabinet dimensions are invalid; coordination skipped`)
        return undefined
      }
      const angle = isFiniteNumber(data.rotation_deg) ? data.rotation_deg : 0
      const axes = rotationAxes(angle)
      const center: Vec3 = [
        location[0] + axes[0][0] * 0 - axes[1][0] * depth / 2,
        location[1] + axes[0][1] * 0 - axes[1][1] * depth / 2,
        location[2] + height / 2,
      ]
      return finish('cabinet', [{ kind: 'obb', center, half: [width / 2, depth / 2, height / 2], axes }], false, [])
    }
    case 'drainage.pipe_route':
    case 'plumbing.pipe_route': {
      const rawNodes = arrayOfPoints3(data.nodes_mm)
      const diameter = valueFor(project, object, data, 'diameter_mm')
      if (!rawNodes || rawNodes.length < 2 || !positiveNumber(diameter)) {
        warnings.push(`${object.id}: pipe route nodes or diameter are invalid; coordination skipped`)
        return undefined
      }
      // Gravity routes take their elevation from the invert levels, and endpoints snap to their
      // network nodes; the domain output already owns that conversion, so reuse it verbatim.
      const output = outputsByObject.get(object.id)
      const centerline = output?.paths?.find(path => path.length >= 2) ?? rawNodes
      const gravity = ['soil', 'waste', 'rainwater'].includes(String(data.system))
      const invertKnown = !gravity || (isFiniteNumber(data.start_invert_mm) && isFiniteNumber(data.end_invert_mm))
      const notes = invertKnown ? [] : ['ไม่ทราบระดับก้นท่อ (Invert Level) — ไม่สามารถยืนยันระยะปลอดภัยได้ ต้องสำรวจหน้างาน']
      if (!invertKnown) warnings.push(`${object.id}: unknown invert level; pipe clearance cannot be verified`)
      return finish('mep_pipe', capsuleSegments(centerline.map(point => [point[0], point[1], point[2]] as Vec3), diameter / 2), !invertKnown, notes, String(data.system ?? ''))
    }
    case 'plumbing.pump_bypass':
    case 'drainage.manhole':
    case 'drainage.septic_tank':
    case 'decorative.moulding_run':
    case 'decorative.panel_layout':
    case 'electrical.led_run':
    case 'roof.system':
    case 'architecture.stair':
    case 'architecture.railing':
    case 'architecture.bathroom': {
      const output = outputsByObject.get(object.id)
      if (output?.warnings.length) for (const warning of output.warnings) warnings.push(`${object.id}: ${warning}`)
      if (object.object_type === 'architecture.bathroom') {
        const boundary = boundaryOf(data.boundary_mm)
        const elevation = data.elevation_mm
        if (boundary && isFiniteNumber(elevation)) {
          const drop = isFiniteNumber(data.drop_mm) ? data.drop_mm : 0
          return finish('slab', [prismFromBoundary(boundary, elevation - drop, elevation)], true, ['โซนห้องน้ำใช้ระนาบพื้นลดระดับ'])
        }
      }
      if (object.object_type === 'electrical.led_run') {
        const path = arrayOfPoints3(data.path_mm)
        if (path && path.length >= 2) return finish('fixture', capsuleSegments(path, 15), true, ['รางไฟ LED จำลองเป็นท่อขนาดเล็ก'], 'led_run')
      }
      if (!output) {
        warnings.push(`${object.id}: no coordination geometry available for ${object.object_type}`)
        return undefined
      }
      const fallback = meshFallbackSolids(output, data)
      if (!fallback.solids.length) {
        warnings.push(`${object.id}: domain output has no mesh or path; coordination skipped`)
        return undefined
      }
      return finish(object.object_type === 'roof.system' ? 'roof' : 'other', fallback.solids, true, fallback.notes)
    }
    default:
      return undefined
  }
}

function boundaryOf(value: unknown): Array<[number, number]> | undefined {
  if (!Array.isArray(value) || value.length < 3) return undefined
  const points: Array<[number, number]> = []
  for (const entry of value) {
    const point = tuple2(entry)
    if (!point) return undefined
    points.push(point)
  }
  return points
}

function arrayOfPoints3(value: unknown): Vec3[] | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined
  const points: Vec3[] = []
  for (const entry of value) {
    const point = tuple3(entry)
    if (!point) return undefined
    points.push(point)
  }
  return points
}
