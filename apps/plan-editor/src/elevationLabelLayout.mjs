import { resolveElevationWallPhaseStyle } from '@constructflow/representation-engine'

/**
 * Pack level-label centers in screen order while keeping them inside the canvas.
 * Datum lines keep their source elevations; callers can draw leaders whenever
 * a packed label center differs from its datum screen coordinate.
 *
 * @param {number[]} datumYs
 * @param {number} viewportHeight
 * @param {{ gap?: number, halfHeight?: number, baselineOffset?: number }} [options]
 * @returns {number[]}
 */
export function packElevationLevelLabelCenters(datumYs, viewportHeight, options = {}) {
  if (!datumYs.length) return []
  const gap = options.gap ?? 19
  const halfHeight = options.halfHeight ?? 8.5
  const baselineOffset = options.baselineOffset ?? 4
  const minY = halfHeight + 2
  const maxY = Math.max(minY, viewportHeight - halfHeight - 2)
  const availableGap = datumYs.length > 1 ? (maxY - minY) / (datumYs.length - 1) : gap
  const effectiveGap = Math.min(gap, availableGap)
  const labelYs = datumYs.map(y => Math.max(minY, Math.min(maxY, y - baselineOffset)))

  for (let index = 1; index < labelYs.length; index++)
    labelYs[index] = Math.max(labelYs[index], labelYs[index - 1] + effectiveGap)

  if (labelYs.at(-1) > maxY) {
    labelYs[labelYs.length - 1] = maxY
    for (let index = labelYs.length - 2; index >= 0; index--)
      labelYs[index] = Math.min(labelYs[index], labelYs[index + 1] - effectiveGap)
  }
  return labelYs
}

/**
 * Resolve the finish mark shown on the visible side of an elevation wall.
 * Instance overrides and wall instance data take precedence over its catalog
 * type, matching the sheet and DXF annotation rules.
 *
 * @param {{ types?: Array<{id: string, object_type?: string, name?: string, parameters?: Record<string, unknown>}> }} project
 * @param {{ object_type?: string, module_data?: Record<string, unknown> }} wall
 * @param {'north'|'south'|'east'|'west'} direction
 * @returns {string}
 */
export function resolveElevationWallFaceMark(project, wall, direction) {
  const data = wall.module_data ?? {}
  const type = (project.types ?? []).find(candidate => candidate.id === data.type_id)
    ?? (project.types ?? []).find(candidate => candidate.object_type === wall.object_type
      && candidate.name?.toLowerCase() === String(data.mark ?? '').toLowerCase())
  const overrides = data.instance_overrides ?? {}
  const insideSide = data.interior_side === 'right' ? 'right' : 'left'
  const cameraSide = direction === 'east' ? 'right'
    : direction === 'west' ? 'left'
      : direction === 'north' ? 'right' : 'left'
  const face = cameraSide === insideSide ? 'inside' : 'outside'
  const mark = overrides[`${face}_finish_mark`]
    ?? data[`${face}_finish_mark`]
    ?? type?.parameters?.[`${face}_finish_mark`]
    ?? data.mark
  return String(mark ?? '')
}

/**
 * Return the phase-aware wall face styling used by the elevation canvas.
 * Masonry hatch belongs to plan views; elevations distinguish lifecycle by
 * fill and outline so existing façades remain visually quiet.
 *
 * @param {'existing'|'demolition'|'new_construction'} phase
 * @param {boolean} selected
 */
export function getElevationWallStyle(phase, selected = false) {
  if (selected) return { fill: 'rgba(56,189,248,.4)', stroke: '#087cf0', lineWidth: 2, dash: [] }
  const style = resolveElevationWallPhaseStyle(phase)
  return { ...style, lineWidth: 1.1 }
}

/**
 * Update elevation viewport zoom while keeping the model point under a screen
 * coordinate fixed. Elevations invert vertical world direction, so panY uses
 * the opposite sign from screen Y.
 */
export function zoomElevationViewAtPoint(view, requestedZoom, screenX, screenY, width, height) {
  const currentZoom = Number(view?.zoom)
  if (!(currentZoom > 0) || ![requestedZoom, screenX, screenY, width, height].every(Number.isFinite) || width < 0 || height < 0)
    return view
  const zoom = Math.max(.2, Math.min(8, requestedZoom))
  const ratio = zoom / currentZoom
  return {
    zoom,
    panX: screenX - width / 2 - (screenX - width / 2 - view.panX) * ratio,
    panY: view.panY * ratio + (ratio - 1) * (screenY - height / 2),
  }
}

/** Zoom an elevation view around the canvas center. */
export function zoomElevationViewFromCenter(view, requestedZoom) {
  const currentZoom = Number(view?.zoom)
  if (!(currentZoom > 0) || !Number.isFinite(requestedZoom)) return view
  const zoom = Math.max(.2, Math.min(8, requestedZoom))
  const ratio = zoom / currentZoom
  return { zoom, panX: view.panX * ratio, panY: view.panY * ratio }
}

/** Move an elevation viewport by a screen-space pointer delta. */
export function panElevationView(view, screenDeltaX, screenDeltaY) {
  if (![view?.zoom, view?.panX, view?.panY, screenDeltaX, screenDeltaY].every(Number.isFinite)) return view
  return { zoom: view.zoom, panX: view.panX + screenDeltaX, panY: view.panY - screenDeltaY }
}
