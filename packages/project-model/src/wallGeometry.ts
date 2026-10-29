import type { Point3Mm, WallCurveGeometry, WallModuleData } from './types.js'

export type WallPoint2Mm = [number, number]
export interface WallProjection {
  point_mm: WallPoint2Mm
  offset_along_wall_mm: number
  distance_mm: number
  tangent_angle_deg: number
}

export interface WallPathSegmentMm {
  start_mm: WallPoint2Mm
  end_mm: WallPoint2Mm
  curve_geometry?: WallCurveGeometry
}

const TAU = Math.PI * 2
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const radians = (degrees: number) => degrees * Math.PI / 180
const degrees = (value: number) => value * 180 / Math.PI
const positiveModulo = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor

export function isValidWallCurveGeometry(value: unknown): value is WallCurveGeometry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const curve = value as Partial<WallCurveGeometry>
  return curve.kind === 'circular_arc'
    && Array.isArray(curve.center_mm) && curve.center_mm.length === 2 && curve.center_mm.every(Number.isFinite)
    && Number.isFinite(curve.radius_mm) && Number(curve.radius_mm) > 0
    && Number.isFinite(curve.start_angle_deg)
    && Number.isFinite(curve.sweep_angle_deg) && Math.abs(Number(curve.sweep_angle_deg)) > 1e-6 && Math.abs(Number(curve.sweep_angle_deg)) < 360 - 1e-6
}

export function wallArcEndpointsMm(curve: WallCurveGeometry, startZ = 0, endZ = startZ): [Point3Mm, Point3Mm] {
  const start = radians(curve.start_angle_deg)
  const end = radians(curve.start_angle_deg + curve.sweep_angle_deg)
  return [
    [curve.center_mm[0] + curve.radius_mm * Math.cos(start), curve.center_mm[1] + curve.radius_mm * Math.sin(start), startZ],
    [curve.center_mm[0] + curve.radius_mm * Math.cos(end), curve.center_mm[1] + curve.radius_mm * Math.sin(end), endZ],
  ]
}

export function wallCenterlineLengthMm(wall: Pick<WallModuleData, 'start_point_mm' | 'end_point_mm' | 'curve_geometry'>): number {
  const curve = wall.curve_geometry
  if (curve && isValidWallCurveGeometry(curve)) return curve.radius_mm * Math.abs(radians(curve.sweep_angle_deg))
  return Math.hypot(wall.end_point_mm[0] - wall.start_point_mm[0], wall.end_point_mm[1] - wall.start_point_mm[1])
}

export function wallCenterlinePointAtOffsetMm(
  wall: Pick<WallModuleData, 'start_point_mm' | 'end_point_mm' | 'curve_geometry'>,
  offsetMm: number,
): { point_mm: Point3Mm; tangent_angle_deg: number } {
  const length = wallCenterlineLengthMm(wall)
  const offset = clamp(offsetMm, 0, length)
  const curve = wall.curve_geometry
  if (curve && isValidWallCurveGeometry(curve)) {
    const direction = Math.sign(curve.sweep_angle_deg)
    const angle = radians(curve.start_angle_deg) + direction * offset / curve.radius_mm
    return {
      point_mm: [
        curve.center_mm[0] + curve.radius_mm * Math.cos(angle),
        curve.center_mm[1] + curve.radius_mm * Math.sin(angle),
        wall.start_point_mm[2] + (wall.end_point_mm[2] - wall.start_point_mm[2]) * (length > 0 ? offset / length : 0),
      ],
      tangent_angle_deg: degrees(angle + direction * Math.PI / 2),
    }
  }
  const dx = wall.end_point_mm[0] - wall.start_point_mm[0]
  const dy = wall.end_point_mm[1] - wall.start_point_mm[1]
  const ratio = length > 0 ? offset / length : 0
  return {
    point_mm: [wall.start_point_mm[0] + dx * ratio, wall.start_point_mm[1] + dy * ratio, wall.start_point_mm[2] + (wall.end_point_mm[2] - wall.start_point_mm[2]) * ratio],
    tangent_angle_deg: degrees(Math.atan2(dy, dx)),
  }
}

/** Samples the canonical centerline for renderers while retaining analytic arc data in the model. */
export function wallCenterlinePointsMm(
  wall: Pick<WallModuleData, 'start_point_mm' | 'end_point_mm' | 'curve_geometry'>,
  maxSagittaMm = 5,
): Point3Mm[] {
  const curve = wall.curve_geometry
  if (!curve || !isValidWallCurveGeometry(curve)) return [wall.start_point_mm, wall.end_point_mm]
  const radius = curve.radius_mm
  const sagitta = clamp(maxSagittaMm, 0.25, radius)
  const maxStep = 2 * Math.acos(clamp(1 - sagitta / radius, -1, 1))
  const steps = clamp(Math.ceil(Math.abs(radians(curve.sweep_angle_deg)) / Math.max(maxStep, radians(0.25))), 1, 1024)
  const points = Array.from({ length: steps + 1 }, (_, index) => wallCenterlinePointAtOffsetMm(wall, wallCenterlineLengthMm(wall) * index / steps).point_mm)
  points[0] = wall.start_point_mm
  points[points.length - 1] = wall.end_point_mm
  return points
}

/** Samples a distance range on the exact centerline for plan and model renderers. */
export function wallCenterlinePointsBetweenOffsetsMm(
  wall: Pick<WallModuleData, 'start_point_mm' | 'end_point_mm' | 'curve_geometry'>,
  startOffsetMm: number,
  endOffsetMm: number,
  maxSagittaMm = 5,
): Point3Mm[] {
  const length = wallCenterlineLengthMm(wall)
  const start = clamp(Math.min(startOffsetMm, endOffsetMm), 0, length)
  const end = clamp(Math.max(startOffsetMm, endOffsetMm), 0, length)
  const curve = wall.curve_geometry
  if (!curve || !isValidWallCurveGeometry(curve)) {
    return [wallCenterlinePointAtOffsetMm(wall, start).point_mm, wallCenterlinePointAtOffsetMm(wall, end).point_mm]
  }
  const sweep = (end - start) / curve.radius_mm
  const sagitta = clamp(maxSagittaMm, 0.25, curve.radius_mm)
  const maxStep = 2 * Math.acos(clamp(1 - sagitta / curve.radius_mm, -1, 1))
  const steps = clamp(Math.ceil(sweep / Math.max(maxStep, radians(0.25))), 1, 1024)
  return Array.from({ length: steps + 1 }, (_, index) => wallCenterlinePointAtOffsetMm(wall, start + (end - start) * index / steps).point_mm)
}

export function projectPointToWallCenterlineMm(
  pointMm: WallPoint2Mm,
  wall: Pick<WallModuleData, 'start_point_mm' | 'end_point_mm' | 'curve_geometry'>,
): WallProjection | undefined {
  if (![...pointMm, ...wall.start_point_mm, ...wall.end_point_mm].every(Number.isFinite)) return undefined
  const curve = wall.curve_geometry
  if (curve && isValidWallCurveGeometry(curve)) {
    const startAngle = radians(curve.start_angle_deg)
    const sweep = radians(curve.sweep_angle_deg)
    const length = wallCenterlineLengthMm(wall)
    const pointAngle = Math.atan2(pointMm[1] - curve.center_mm[1], pointMm[0] - curve.center_mm[0])
    const directedDelta = positiveModulo(Math.sign(sweep) * (pointAngle - startAngle), TAU)
    if (directedDelta <= Math.abs(sweep)) {
      const offset = curve.radius_mm * directedDelta
      const projected = wallCenterlinePointAtOffsetMm(wall, offset)
      return { point_mm: [projected.point_mm[0], projected.point_mm[1]], offset_along_wall_mm: offset, distance_mm: Math.abs(Math.hypot(pointMm[0] - curve.center_mm[0], pointMm[1] - curve.center_mm[1]) - curve.radius_mm), tangent_angle_deg: projected.tangent_angle_deg }
    }
    const first = wallCenterlinePointAtOffsetMm(wall, 0)
    const last = wallCenterlinePointAtOffsetMm(wall, length)
    const firstDistance = Math.hypot(pointMm[0] - first.point_mm[0], pointMm[1] - first.point_mm[1])
    const lastDistance = Math.hypot(pointMm[0] - last.point_mm[0], pointMm[1] - last.point_mm[1])
    return firstDistance <= lastDistance
      ? { point_mm: [first.point_mm[0], first.point_mm[1]], offset_along_wall_mm: 0, distance_mm: firstDistance, tangent_angle_deg: first.tangent_angle_deg }
      : { point_mm: [last.point_mm[0], last.point_mm[1]], offset_along_wall_mm: length, distance_mm: lastDistance, tangent_angle_deg: last.tangent_angle_deg }
  }
  const dx = wall.end_point_mm[0] - wall.start_point_mm[0]
  const dy = wall.end_point_mm[1] - wall.start_point_mm[1]
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared <= 1e-12) return undefined
  const rawRatio = ((pointMm[0] - wall.start_point_mm[0]) * dx + (pointMm[1] - wall.start_point_mm[1]) * dy) / lengthSquared
  const ratio = clamp(rawRatio, 0, 1)
  const projected: WallPoint2Mm = [wall.start_point_mm[0] + dx * ratio, wall.start_point_mm[1] + dy * ratio]
  return { point_mm: projected, offset_along_wall_mm: Math.sqrt(lengthSquared) * ratio, distance_mm: Math.hypot(pointMm[0] - projected[0], pointMm[1] - projected[1]), tangent_angle_deg: degrees(Math.atan2(dy, dx)) }
}

/** Builds an exact circular arc from the user's start, through, and end points. */
export function wallArcFromThreePoints(start: WallPoint2Mm, through: WallPoint2Mm, end: WallPoint2Mm): WallCurveGeometry | undefined {
  if (![...start, ...through, ...end].every(Number.isFinite)) return undefined
  const b: WallPoint2Mm = [through[0] - start[0], through[1] - start[1]]
  const c: WallPoint2Mm = [end[0] - start[0], end[1] - start[1]]
  const determinant = 2 * (b[0] * c[1] - b[1] * c[0])
  if (Math.abs(determinant) < 1e-6) return undefined
  const throughSquare = b[0] ** 2 + b[1] ** 2
  const endSquare = c[0] ** 2 + c[1] ** 2
  const center: WallPoint2Mm = [
    start[0] + (throughSquare * c[1] - endSquare * b[1]) / determinant,
    start[1] + (b[0] * endSquare - c[0] * throughSquare) / determinant,
  ]
  const radius = Math.hypot(start[0] - center[0], start[1] - center[1])
  if (!Number.isFinite(radius) || radius < 1) return undefined
  const startAngle = degrees(Math.atan2(start[1] - center[1], start[0] - center[0]))
  const throughAngle = degrees(Math.atan2(through[1] - center[1], through[0] - center[0]))
  const endAngle = degrees(Math.atan2(end[1] - center[1], end[0] - center[0]))
  const throughCcw = positiveModulo(throughAngle - startAngle, 360)
  const endCcw = positiveModulo(endAngle - startAngle, 360)
  const sweep = throughCcw <= endCcw ? endCcw : endCcw - 360
  const curve: WallCurveGeometry = { kind: 'circular_arc', center_mm: center, radius_mm: radius, start_angle_deg: startAngle, sweep_angle_deg: sweep }
  return isValidWallCurveGeometry(curve) ? curve : undefined
}

/** Refit a circular wall after moving one endpoint while preserving its prior midpoint and other endpoint. */
export function wallCurveWithEndpointMm(
  curve: WallCurveGeometry,
  endpointIndex: 0 | 1,
  targetMm: WallPoint2Mm,
): WallCurveGeometry | undefined {
  if (!isValidWallCurveGeometry(curve) || !targetMm.every(Number.isFinite)) return undefined
  const [start, end] = wallArcEndpointsMm(curve)
  const wall = {
    start_point_mm: start,
    end_point_mm: end,
    curve_geometry: curve,
  }
  const midpoint = wallCenterlinePointAtOffsetMm(wall, wallCenterlineLengthMm(wall) / 2).point_mm
  return endpointIndex === 0
    ? wallArcFromThreePoints(targetMm, [midpoint[0], midpoint[1]], [end[0], end[1]])
    : wallArcFromThreePoints([start[0], start[1]], [midpoint[0], midpoint[1]], targetMm)
}

/** Adjust an arc's measured length while keeping its radius, turn direction, and opposite endpoint fixed. */
export function wallCurveWithLengthMm(
  curve: WallCurveGeometry,
  endpointIndex: 0 | 1,
  lengthMm: number,
): WallCurveGeometry | undefined {
  if (!isValidWallCurveGeometry(curve) || !Number.isFinite(lengthMm) || lengthMm < 1) return undefined
  const sweepSign = Math.sign(curve.sweep_angle_deg)
  const sweep = sweepSign * lengthMm / curve.radius_mm * 180 / Math.PI
  if (Math.abs(sweep) >= 360 - 1e-6) return undefined
  const endAngle = curve.start_angle_deg + curve.sweep_angle_deg
  const next: WallCurveGeometry = endpointIndex === 0
    ? { ...curve, start_angle_deg: endAngle - sweep, sweep_angle_deg: sweep }
    : { ...curve, sweep_angle_deg: sweep }
  return isValidWallCurveGeometry(next) ? next : undefined
}
