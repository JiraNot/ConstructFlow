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
 * Project levels to screen coordinates, discard off-screen/non-finite datums,
 * then order the visible rows from top to bottom for label packing.
 * @template T
 * @param {T[]} levels
 * @param {(level: T) => number} toScreenY
 * @param {number} viewportHeight
 * @returns {Array<{level: T, y: number}>}
 */
export function getVisibleElevationLevelRows(levels, toScreenY, viewportHeight) {
  if (!Array.isArray(levels) || typeof toScreenY !== 'function' || !Number.isFinite(viewportHeight) || viewportHeight <= 0) return []
  return levels
    .map(level => ({ level, y: toScreenY(level) }))
    .filter(row => Number.isFinite(row.y) && row.y >= 0 && row.y <= viewportHeight)
    .sort((a, b) => a.y - b.y)
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
 * Draw structure first, facade walls from far to near, then hosted openings and
 * annotations. Stable depth ordering keeps partial facade overlaps independent
 * of the objects' insertion order in the project file.
 * @param {Array<{object_type?: string, module_data?: Record<string, unknown>}>} items
 * @param {'north'|'south'|'east'|'west'} direction
 */
export function sortElevationObjectsForDrawing(items, direction) {
  const priority = (type) => type === 'structure.column' || type === 'structure.beam' || type === 'structure.slab' ? 0
    : type === 'architecture.wall' ? 1
      : type === 'door_window.door' || type === 'door_window.window' ? 2 : 3
  const depthAxis = direction === 'east' || direction === 'west' ? 0 : 1
  const cameraSign = direction === 'north' || direction === 'east' ? 1 : -1
  const depth = (object) => {
    const data = object.module_data ?? {}
    const start = data.start_point_mm, end = data.end_point_mm
    return Array.isArray(start) && Array.isArray(end)
      && Number.isFinite(start[depthAxis]) && Number.isFinite(end[depthAxis])
      ? (start[depthAxis] + end[depthAxis]) / 2
      : undefined
  }
  return [...items].sort((a, b) => {
    const layerOrder = priority(a.object_type) - priority(b.object_type)
    if (layerOrder) return layerOrder
    if (priority(a.object_type) !== 1) return 0
    const aDepth = depth(a), bDepth = depth(b)
    if (aDepth === undefined || bDepth === undefined) return 0
    return cameraSign * (aDepth - bDepth)
  })
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

/**
 * Place facade/opening marks without label-to-label overlap and keep them in
 * the visible canvas. A displaced mark retains its source anchor for a leader.
 * @template T
 * @param {Array<T & {x: number, y: number, width: number, height: number}>} tags
 * @param {number} viewportWidth
 * @param {number} viewportHeight
 * @returns {Array<T & {anchorX: number, anchorY: number, displaced: boolean, collision: boolean}>}
 */
export function layoutElevationTags(tags, viewportWidth, viewportHeight) {
  const placed = []
  const ordered = tags.map((tag, index) => ({ tag, index }))
    .sort((a, b) => a.tag.y - b.tag.y || a.tag.x - b.tag.x || a.index - b.index)
  for (const { tag, index } of ordered) {
    const anchorX = tag.x, anchorY = tag.y
    const offsets = [[0, 0]]
    for (let distance = 20; distance <= 120; distance += 20) {
      offsets.push([0, -distance], [0, distance])
      const horizontal = tag.width / 2 + 7
      offsets.push([-horizontal, -distance / 2], [horizontal, -distance / 2], [-horizontal, distance / 2], [horizontal, distance / 2])
    }
    const candidate = offsets.map(([dx, dy]) => ({ x: anchorX + dx, y: anchorY + dy }))
      .find(({ x, y }) => {
        const left = x - tag.width / 2, right = x + tag.width / 2
        const top = y - tag.height / 2, bottom = y + tag.height / 2
        if (left < 2 || right > viewportWidth - 2 || top < 2 || bottom > viewportHeight - 2) return false
        return placed.every(other =>
          left >= other.x + other.width / 2 + 2 || right <= other.x - other.width / 2 - 2 ||
          top >= other.y + other.height / 2 + 2 || bottom <= other.y - other.height / 2 - 2,
        )
      })
    if (candidate) placed.push({ ...tag, ...candidate, anchorX, anchorY, displaced: candidate.x !== anchorX || candidate.y !== anchorY, collision: false, layoutIndex: index })
    else placed.push({ ...tag, anchorX, anchorY, displaced: false, collision: true, layoutIndex: index })
  }
  return placed.sort((a, b) => a.layoutIndex - b.layoutIndex).map(({ layoutIndex, ...tag }) => tag)
}

/**
 * Return the boundary and crease edges of a triangulated model surface. Shared
 * coplanar edges are tessellation seams, so omit them from architectural views.
 * @param {Array<Array<[number, number, number]>>} triangles
 * @returns {Array<[[number, number, number], [number, number, number]]>}
 */
export function getElevationMeshEdges(triangles) {
  const edges = new Map()
  for (const triangle of triangles) {
    if (!Array.isArray(triangle) || triangle.length !== 3 || triangle.some(point => !point?.every(Number.isFinite))) continue
    const [a, b, c] = triangle
    const ab = b.map((value, index) => value - a[index])
    const ac = c.map((value, index) => value - a[index])
    const normal = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ]
    const length = Math.hypot(...normal)
    if (length < 1e-8) continue
    const unitNormal = normal.map(value => value / length)
    for (const [start, end] of [[a, b], [b, c], [c, a]]) {
      const pointKey = point => point.map(value => Math.round(value * 10) / 10).join(',')
      const keys = [pointKey(start), pointKey(end)].sort()
      const key = keys.join('|')
      const edge = edges.get(key) ?? { start: keys[0] === pointKey(start) ? start : end, end: keys[0] === pointKey(start) ? end : start, normals: [] }
      edge.normals.push(unitNormal)
      edges.set(key, edge)
    }
  }
  return [...edges.values()]
    .filter(edge => edge.normals.length === 1 || edge.normals.slice(1).some(normal =>
      Math.abs(normal.reduce((sum, value, index) => sum + value * edge.normals[0][index], 0)) < 0.9999,
    ))
    .map(edge => [edge.start, edge.end])
}
