import type { WallDrawMode, WallTouchDrawGesture } from './planCanvasInteractionTypes.js'
import { wallArcFromThreePoints, type WallPathSegmentMm } from '@constructflow/project-model'

type Point = [number, number]

const wallTurnSamplePx = 7
const wallMinimumTurnMm = 250
const wallInitialHeadingConfirmMm = 120
const wallTurnConfirmMm = 200
const wallHeadingConfirmSamples = 2

function snapWallHeading(degrees: number, stepDeg: number) {
  return stepDeg > 0 ? Math.round(degrees / stepDeg) * stepDeg : degrees
}

function angleDifference(a: number, b: number) {
  return Math.abs(((a - b + 540) % 360) - 180)
}

function clearPendingWallHeading(gesture: WallTouchDrawGesture) {
  gesture.pendingHeadingDeg = null
  gesture.pendingHeadingDistanceMm = 0
  gesture.pendingHeadingSamples = 0
}

function trackPendingWallHeading(gesture: WallTouchDrawGesture, headingDeg: number, distanceMm: number, angleSnapDeg: number) {
  const headingToleranceDeg = angleSnapDeg > 0 ? 0.1 : 12
  const currentHeading = gesture.pendingHeadingDeg
  if (currentHeading === null || angleDifference(currentHeading, headingDeg) > headingToleranceDeg) {
    gesture.pendingHeadingDeg = headingDeg
    gesture.pendingHeadingDistanceMm = distanceMm
    gesture.pendingHeadingSamples = 1
    return
  }

  const previousDistance = gesture.pendingHeadingDistanceMm
  const previousHeadingRadians = currentHeading * Math.PI / 180
  const nextHeadingRadians = headingDeg * Math.PI / 180
  gesture.pendingHeadingDeg = Math.atan2(
    Math.sin(previousHeadingRadians) * previousDistance + Math.sin(nextHeadingRadians) * distanceMm,
    Math.cos(previousHeadingRadians) * previousDistance + Math.cos(nextHeadingRadians) * distanceMm,
  ) * 180 / Math.PI
  gesture.pendingHeadingDistanceMm += distanceMm
  gesture.pendingHeadingSamples += 1
}

function isPendingWallHeadingStable(gesture: WallTouchDrawGesture, minimumDistanceMm: number) {
  return gesture.pendingHeadingDeg !== null
    && gesture.pendingHeadingDistanceMm >= minimumDistanceMm
    && gesture.pendingHeadingSamples >= wallHeadingConfirmSamples
}

function wallPointAlongHeading(start: Point, raw: Point, headingDeg: number): Point {
  const radians = headingDeg * Math.PI / 180
  const ux = Math.cos(radians), uy = Math.sin(radians)
  const distance = Math.max(0, (raw[0] - start[0]) * ux + (raw[1] - start[1]) * uy)
  return [Math.round(start[0] + ux * distance), Math.round(start[1] + uy * distance)]
}

function snapPolylineToAngleStep(points: Point[], angleStepDeg: number): Point[] {
  if (points.length < 2 || angleStepDeg <= 0) return points
  const angleStep = angleStepDeg * Math.PI / 180
  const result: Point[] = [points[0]!]
  for (const rawEnd of points.slice(1)) {
    const start = result.at(-1)!
    const dx = rawEnd[0] - start[0], dy = rawEnd[1] - start[1]
    const length = Math.hypot(dx, dy)
    if (length < 1) continue
    const angle = Math.atan2(dy, dx)
    const snappedAngle = Math.round(angle / angleStep) * angleStep
    const ux = Math.cos(snappedAngle), uy = Math.sin(snappedAngle)
    const projectedLength = Math.max(0, dx * ux + dy * uy)
    result.push([Math.round(start[0] + ux * projectedLength), Math.round(start[1] + uy * projectedLength)])
  }
  return result
}

export function buildWallTemplatePath(mode: WallDrawMode, start: Point, end: Point): Point[] {
  const left = Math.min(start[0], end[0]), right = Math.max(start[0], end[0])
  const top = Math.min(start[1], end[1]), bottom = Math.max(start[1], end[1])
  const width = right - left, height = bottom - top
  if (width < 300 || height < 300) return []
  const topLeft: Point = [left, top]
  const topRight: Point = [right, top]
  const bottomRight: Point = [right, bottom]
  const bottomLeft: Point = [left, bottom]
  if (mode === 'room-rectangle') return [topLeft, topRight, bottomRight, bottomLeft, topLeft]
  if (mode === 'room-l-shape') {
    const midX = Math.round(left + width / 2), midY = Math.round(top + height / 2)
    return [topLeft, topRight, [right, midY], [midX, midY], [midX, bottom], bottomLeft, topLeft]
  }
  if (mode === 'room-u-shape') {
    const inset = Math.round(Math.min(width, height) / 3)
    return [topLeft, topRight, bottomRight, [right - inset, bottom], [right - inset, top + inset], [left + inset, top + inset], [left + inset, bottom], bottomLeft, topLeft]
  }
  return []
}

export function updateTouchWallPath(
  gesture: WallTouchDrawGesture,
  screenPoint: Point,
  rawWorld: Point,
  snapPoint: Point,
  mode: WallDrawMode,
  angleSnapDeg = 45,
): Point[] {
  gesture.latestRawWorldMm = rawWorld
  if (mode.startsWith('room-')) {
    gesture.candidatePointMm = rawWorld
    return buildWallTemplatePath(mode, gesture.startNode.point_mm, rawWorld)
  }

  if (mode === 'continuous-lines-and-arcs' || mode === 'line-arc') {
    const movementPx = Math.hypot(screenPoint[0] - gesture.lastSampleScreenPx[0], screenPoint[1] - gesture.lastSampleScreenPx[1])
    const snapped = Math.hypot(rawWorld[0] - snapPoint[0], rawWorld[1] - snapPoint[1]) <= 140 ? snapPoint : rawWorld
    if (movementPx >= 5) {
      const previous = gesture.sampledPathMm.at(-1)!
      if (Math.hypot(snapped[0] - previous[0], snapped[1] - previous[1]) >= 20) gesture.sampledPathMm.push(snapped)
      gesture.lastSampleScreenPx = screenPoint
      gesture.lastSampleWorldMm = rawWorld
    }
    gesture.candidatePointMm = snapped
    return [...gesture.sampledPathMm, gesture.candidatePointMm]
  }

  const movementPx = Math.hypot(screenPoint[0] - gesture.lastSampleScreenPx[0], screenPoint[1] - gesture.lastSampleScreenPx[1])
  if (movementPx >= wallTurnSamplePx) {
    const dx = rawWorld[0] - gesture.lastSampleWorldMm[0]
    const dy = rawWorld[1] - gesture.lastSampleWorldMm[1]
    const movementMm = Math.hypot(dx, dy)
    const currentStart = gesture.pathPointsMm.at(-1)!
    const movementHeading = snapWallHeading(Math.atan2(dy, dx) * 180 / Math.PI, angleSnapDeg)
    const turnThresholdDeg = angleSnapDeg > 0 ? Math.min(40, Math.max(10, angleSnapDeg * 0.9)) : 40
    if (movementMm >= 8) {
      if (gesture.activeHeadingDeg === null) {
        const initialDx = rawWorld[0] - currentStart[0]
        const initialDy = rawWorld[1] - currentStart[1]
        const initialDistanceMm = Math.hypot(initialDx, initialDy)
        const initialHeading = snapWallHeading(Math.atan2(initialDy, initialDx) * 180 / Math.PI, angleSnapDeg)
        if (initialDistanceMm >= 8 && angleSnapDeg > 0 && initialDistanceMm >= 40) {
          // In a stepped/orthogonal mode, lock the first usable heading at once.
          // Waiting for a long stroke made short walls inherit the raw diagonal.
          gesture.activeHeadingDeg = initialHeading
          clearPendingWallHeading(gesture)
        } else if (initialDistanceMm >= 8) {
          trackPendingWallHeading(gesture, initialHeading, movementMm, angleSnapDeg)
          if (isPendingWallHeadingStable(gesture, wallInitialHeadingConfirmMm)) {
            gesture.activeHeadingDeg = gesture.pendingHeadingDeg
            clearPendingWallHeading(gesture)
          }
        } else {
          clearPendingWallHeading(gesture)
        }
      } else if (angleDifference(movementHeading, gesture.activeHeadingDeg) >= turnThresholdDeg) {
        trackPendingWallHeading(gesture, movementHeading, movementMm, angleSnapDeg)
        const activeLengthMm = Math.hypot(gesture.candidatePointMm[0] - currentStart[0], gesture.candidatePointMm[1] - currentStart[1])
        if (activeLengthMm >= wallMinimumTurnMm && isPendingWallHeadingStable(gesture, wallTurnConfirmMm)) {
          const corner = wallPointAlongHeading(currentStart, rawWorld, gesture.activeHeadingDeg)
          if (Math.hypot(corner[0] - currentStart[0], corner[1] - currentStart[1]) >= wallMinimumTurnMm) {
            gesture.pathPointsMm.push(corner)
            gesture.activeHeadingDeg = angleSnapDeg > 0
              ? snapWallHeading(gesture.pendingHeadingDeg!, angleSnapDeg)
              : gesture.pendingHeadingDeg
          }
          clearPendingWallHeading(gesture)
        }
      } else {
        clearPendingWallHeading(gesture)
      }
    }
    gesture.lastSampleScreenPx = screenPoint
    gesture.lastSampleWorldMm = rawWorld
  }

  if (gesture.activeHeadingDeg === null) {
    gesture.candidatePointMm = rawWorld
  } else {
    const start = gesture.pathPointsMm.at(-1)!
    let candidate = wallPointAlongHeading(start, rawWorld, gesture.activeHeadingDeg)
    const snapDistance = Math.hypot(candidate[0] - snapPoint[0], candidate[1] - snapPoint[1])
    const headingRadians = gesture.activeHeadingDeg * Math.PI / 180
    const snapOffsetX = snapPoint[0] - start[0]
    const snapOffsetY = snapPoint[1] - start[1]
    const snapDeviationFromAxis = Math.abs(-Math.sin(headingRadians) * snapOffsetX + Math.cos(headingRadians) * snapOffsetY)
    // Keep the locked wall axis straight while still allowing real endpoint snaps.
    if (snapDistance <= 140 && snapDeviationFromAxis <= 90) candidate = snapPoint
    gesture.candidatePointMm = candidate
  }
  return [...gesture.pathPointsMm, gesture.candidatePointMm]
}

function simplifyPath(points: Point[], toleranceMm: number): Point[] {
  if (points.length <= 2) return points
  const start = points[0]!, end = points.at(-1)!
  const dx = end[0] - start[0], dy = end[1] - start[1], lengthSquared = dx * dx + dy * dy
  let farthest = -1, farthestDistance = 0
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index]!
    const ratio = lengthSquared > 1e-9 ? Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared)) : 0
    const distance = Math.hypot(point[0] - start[0] - ratio * dx, point[1] - start[1] - ratio * dy)
    if (distance > farthestDistance) { farthestDistance = distance; farthest = index }
  }
  if (farthestDistance <= toleranceMm || farthest < 0) return [start, end]
  return [...simplifyPath(points.slice(0, farthest + 1), toleranceMm).slice(0, -1), ...simplifyPath(points.slice(farthest), toleranceMm)]
}

function fitCircularArc(points: Point[]): ReturnType<typeof wallArcFromThreePoints> {
  if (points.length < 3) return undefined
  // Estimate the circle from the whole stroke rather than trusting one noisy
  // midpoint. A least-squares center makes a finger-drawn arc stable while the
  // final three-point construction still keeps the user's exact endpoints.
  const meanX = points.reduce((sum, point) => sum + point[0], 0) / points.length
  const meanY = points.reduce((sum, point) => sum + point[1], 0) / points.length
  let xx = 0, xy = 0, yy = 0, xz = 0, yz = 0
  for (const point of points) {
    const x = point[0] - meanX, y = point[1] - meanY
    const z = x * x + y * y
    xx += x * x; xy += x * y; yy += y * y
    xz += x * z / 2; yz += y * z / 2
  }
  const determinant = xx * yy - xy * xy
  if (Math.abs(determinant) < 1e-8) return undefined
  const center: Point = [
    meanX + (xz * yy - yz * xy) / determinant,
    meanY + (yz * xx - xz * xy) / determinant,
  ]
  const radii = points.map(point => Math.hypot(point[0] - center[0], point[1] - center[1])).sort((a, b) => a - b)
  const radius = radii[Math.floor(radii.length / 2)]!
  if (!Number.isFinite(radius) || radius < 1 || radius > 100_000) return undefined

  let pathLength = 0
  for (let index = 1; index < points.length; index += 1) pathLength += Math.hypot(
    points[index]![0] - points[index - 1]![0], points[index]![1] - points[index - 1]![1],
  )
  let remaining = pathLength / 2
  let through = points[Math.floor(points.length / 2)]!
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!, to = points[index]!
    const segmentLength = Math.hypot(to[0] - from[0], to[1] - from[1])
    if (remaining <= segmentLength) {
      const ratio = segmentLength > 0 ? remaining / segmentLength : 0
      through = [from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio]
      break
    }
    remaining -= segmentLength
  }
  const throughAngle = Math.atan2(through[1] - center[1], through[0] - center[0])
  const fitThrough: Point = [center[0] + Math.cos(throughAngle) * radius, center[1] + Math.sin(throughAngle) * radius]
  const arc = wallArcFromThreePoints(points[0]!, fitThrough, points.at(-1)!)
  if (!arc || arc.radius_mm > 100_000 || Math.abs(arc.sweep_angle_deg) < 8) return undefined

  // Ignore a few noisy samples from a hand stroke, while requiring most of the
  // path to stay close enough to one circle to become a clean analytic wall.
  const residuals = points.map(point => Math.abs(Math.hypot(point[0] - arc.center_mm[0], point[1] - arc.center_mm[1]) - arc.radius_mm)).sort((a, b) => a - b)
  const medianResidual = residuals[Math.floor(residuals.length / 2)]!
  const percentile90Residual = residuals[Math.min(residuals.length - 1, Math.floor(residuals.length * 0.9))]!
  const medianTolerance = Math.max(30, Math.min(90, arc.radius_mm * 0.02))
  const strokeTolerance = Math.max(80, Math.min(220, arc.radius_mm * 0.05))
  if (medianResidual > medianTolerance || percentile90Residual > strokeTolerance) return undefined
  return arc
}

/** Fits a noisy tablet stroke to one editable circular wall when it is arc-shaped. */
export function fitWallStrokeArc(points: Point[], allowThreePointFallback = false): WallPathSegmentMm | undefined {
  const clean = points.filter((point, index) => index === 0 || Math.hypot(point[0] - points[index - 1]![0], point[1] - points[index - 1]![1]) >= 20)
  let curve = fitCircularArc(clean)
  if (!curve && allowThreePointFallback && clean.length >= 3) {
    const totalLength = clean.slice(1).reduce((sum, point, index) => sum + Math.hypot(point[0] - clean[index]![0], point[1] - clean[index]![1]), 0)
    let remaining = totalLength / 2
    let through = clean[Math.floor(clean.length / 2)]!
    for (let index = 1; index < clean.length; index += 1) {
      const from = clean[index - 1]!, to = clean[index]!
      const length = Math.hypot(to[0] - from[0], to[1] - from[1])
      if (remaining <= length) {
        const ratio = length > 0 ? remaining / length : 0
        through = [from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio]
        break
      }
      remaining -= length
    }
    curve = wallArcFromThreePoints(clean[0]!, through, clean.at(-1)!)
    if (curve && (curve.radius_mm > 100_000 || Math.abs(curve.sweep_angle_deg) < 8)) curve = undefined
  }
  return curve ? { start_mm: clean[0]!, end_mm: clean.at(-1)!, curve_geometry: curve } : undefined
}

/** Converts a tablet stroke into editable straight walls or one analytic circular wall. */
export function buildWallPathSegments(points: Point[], mode: WallDrawMode, angleSnapDeg = 45): WallPathSegmentMm[] {
  const clean = points.filter((point, index) => index === 0 || Math.hypot(point[0] - points[index - 1]![0], point[1] - points[index - 1]![1]) >= 20)
  if (clean.length < 2) return []
  const lineSegments = (path: Point[], tolerance: number, angleStepDeg = angleSnapDeg): WallPathSegmentMm[] => {
    const simplified = snapPolylineToAngleStep(simplifyPath(path, tolerance), angleStepDeg)
    return simplified.slice(1).flatMap((end, index) => {
      const start = simplified[index]!
      return Math.hypot(end[0] - start[0], end[1] - start[1]) >= 100 ? [{ start_mm: start, end_mm: end }] : []
    })
  }
  if (mode === 'line-arc') {
    const arc = fitWallStrokeArc(clean, true)
    if (arc) return [arc]
    const [start, end] = [clean[0]!, clean.at(-1)!]
    return Math.hypot(end[0] - start[0], end[1] - start[1]) >= 100 ? [{ start_mm: start, end_mm: end }] : []
  }
  if (mode === 'continuous-lines-and-arcs') {
    const fitted: WallPathSegmentMm[] = []
    let cursor = 0
    while (cursor < clean.length - 1) {
      let arcStart = -1, arcEnd = -1, arcGeometry: ReturnType<typeof wallArcFromThreePoints>
      for (let start = cursor; start < clean.length - 2 && arcStart < 0; start += 1) {
        for (let end = clean.length - 1; end >= start + 2; end -= 1) {
          const candidate = fitCircularArc(clean.slice(start, end + 1))
          if (candidate) { arcStart = start; arcEnd = end; arcGeometry = candidate; break }
        }
      }
      if (arcStart < 0 || arcEnd <= cursor || !arcGeometry) {
        // This tool is for tracing a free curve: a failed circle fit must keep
        // the hand-drawn tangent changes instead of snapping them into a
        // staircase of 45°/90° chords.
        fitted.push(...lineSegments(clean.slice(cursor), 35, 0))
        break
      }
      if (arcStart > cursor) fitted.push(...lineSegments(clean.slice(cursor, arcStart + 1), 35, 0))
      fitted.push({ start_mm: clean[arcStart]!, end_mm: clean[arcEnd]!, curve_geometry: arcGeometry })
      cursor = arcEnd
    }
    if (fitted.length) return fitted
  }
  const arc = mode !== 'continuous-lines' ? fitWallStrokeArc(clean) : undefined
  if (arc) return [arc]
  const simplified = simplifyPath(clean, mode === 'continuous-lines' ? 50 : 35)
  return lineSegments(simplified, 35, mode === 'continuous-lines' ? angleSnapDeg : 0)
}
