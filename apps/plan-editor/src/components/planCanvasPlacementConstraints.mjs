import { formatLengthMm, parseLengthMm } from '@constructflow/project-model'
import { constrainPointToReference, inferLinearConstraint } from '@constructflow/snapping-engine'

export function applyPlanCanvasPlacementDimensions(point, refs, rawPoint, options) {
  const result = [...point]
  for (const axis of ['x', 'y']) {
    const valueText = axis === 'x' ? options.dimensionInputX : options.dimensionInputY
    const anchor = axis === 'x'
      ? options.dimensionAnchorX ?? refs.refX
      : options.dimensionAnchorY ?? refs.refY
    const value = parseLengthMm(valueText, options.displayUnit)
    if (!valueText.trim() || anchor === undefined || anchor === null || value === null || value < 0) continue
    const coordinate = axis === 'x' ? rawPoint[0] : rawPoint[1]
    const sign = coordinate < anchor ? -1 : 1
    if (axis === 'x') result[0] = Math.round(anchor + sign * value)
    else result[1] = Math.round(anchor + sign * value)
  }
  return result
}

export function constrainPlanCanvasGridCopyToParallelOffset(point, source, gridLineEndpoints) {
  const [start, end] = gridLineEndpoints(source)
  const dx = end[0] - start[0], dy = end[1] - start[1]
  const length = Math.hypot(dx, dy)
  if (length < 1) return point
  const nx = -dy / length, ny = dx / length
  const offset = (point[0] - start[0]) * nx + (point[1] - start[1]) * ny
  return [Math.round(start[0] + nx * offset), Math.round(start[1] + ny * offset)]
}

export function resolvePlanCanvasReferencePath(start, end, widthMm, placementReference) {
  if (placementReference === 'centerline') return [start, end]
  const dx = end[0] - start[0], dy = end[1] - start[1]
  const length = Math.hypot(dx, dy)
  if (length < 1) return [start, end]
  const side = placementReference === 'left_face' ? -1 : 1
  const offsetX = (-dy / length) * widthMm / 2 * side
  const offsetY = (dx / length) * widthMm / 2 * side
  return [[start[0] + offsetX, start[1] + offsetY], [end[0] + offsetX, end[1] + offsetY]]
}

export function constrainPlanCanvasLineSnap(snap, pointerPoint, start, lockAxis, reference, options) {
  let constrainedSnap = snap
  const inferredMode = !lockAxis && options.lineConstraintMode === 'auto' && reference
    ? inferLinearConstraint(pointerPoint, start, reference, 12 / Math.max(options.viewportZoom, 0.0001))
    : null
  const appliedMode = options.lineConstraintMode === 'auto'
    ? inferredMode
    : options.lineConstraintMode === 'none' ? null : options.lineConstraintMode
  if (!lockAxis && appliedMode && reference) {
    constrainedSnap = constrainPointToReference(snap.point_mm, start, reference, appliedMode)
  }
  let dx = constrainedSnap.point_mm[0] - start[0], dy = constrainedSnap.point_mm[1] - start[1]
  if (lockAxis) {
    if (Math.abs(dx) >= Math.abs(dy)) dy = 0
    else dx = 0
  }
  const targetLengthMm = parseLengthMm(options.drawLength, options.displayUnit) ?? Number.NaN
  const targetAngle = Number(options.drawAngle)
  if (options.drawAngle.trim() && Number.isFinite(targetAngle)) {
    const cursorLength = Math.hypot(dx, dy)
    const length = Number.isFinite(targetLengthMm) && targetLengthMm > 0 ? targetLengthMm : cursorLength
    if (length > 0) {
      const radians = targetAngle * Math.PI / 180
      dx = Math.cos(radians) * length
      dy = -Math.sin(radians) * length
    }
  } else if (Number.isFinite(targetLengthMm) && targetLengthMm > 0) {
    const length = Math.hypot(dx, dy)
    if (length > 0) {
      dx = dx / length * targetLengthMm
      dy = dy / length * targetLengthMm
    }
  }
  const point_mm = [Math.round(start[0] + dx), Math.round(start[1] + dy)]
  const changed = Math.hypot(point_mm[0] - snap.point_mm[0], point_mm[1] - snap.point_mm[1]) >= 1
  const constraintApplied = !lockAxis && !!appliedMode && !!reference
  return {
    ...snap,
    point_mm,
    kind: constraintApplied ? constrainedSnap.kind : snap.kind,
    target_id: constraintApplied ? reference?.target_id : changed ? undefined : snap.target_id,
    description: `${constraintApplied ? constrainedSnap.description : snap.description}${!lockAxis && options.lineConstraintMode !== 'none' && !reference ? ' · ไม่พบแนวอ้างอิงใกล้จุดเริ่ม' : ''}${options.lineConstraintMode === 'auto' && reference && !inferredMode && !lockAxis ? ' · Auto: เล็งใกล้แนวขนาน/ตั้งฉากเพื่อจัดแนว' : ''}${lockAxis ? ' · Ortho' : ''}${Number.isFinite(targetLengthMm) && targetLengthMm > 0 ? ` · ${formatLengthMm(targetLengthMm, options.displayUnit)} ${options.displayUnit}` : ''}`,
  }
}
