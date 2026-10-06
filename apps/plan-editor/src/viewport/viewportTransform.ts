// Viewport Coordinate Transformation
// Canonical Units: Millimeters (World) <-> Screen Pixels

export interface ViewportState {
  panX: number
  panY: number
  zoom: number // Screen pixels per millimeter (e.g. 0.08 = 1000mm -> 80px)
}

export function worldToScreen(
  worldPoint_mm: [number, number] | [number, number, number],
  viewport: ViewportState
): [number, number] {
  const sx = worldPoint_mm[0] * viewport.zoom + viewport.panX
  const sy = worldPoint_mm[1] * viewport.zoom + viewport.panY
  return [sx, sy]
}

export function screenToWorld(
  screenPoint_px: [number, number],
  viewport: ViewportState
): [number, number] {
  const wx = (screenPoint_px[0] - viewport.panX) / viewport.zoom
  const wy = (screenPoint_px[1] - viewport.panY) / viewport.zoom
  return [wx, wy]
}

export function zoomAtScreenPoint(
  currentViewport: ViewportState,
  screenPoint: [number, number],
  deltaZoom: number
): ViewportState {
  const minZoom = 0.005 // 1000mm -> 5px
  const maxZoom = 2.0   // 1000mm -> 2000px
  const nextZoom = Math.max(minZoom, Math.min(maxZoom, currentViewport.zoom * deltaZoom))
  const factor = nextZoom / currentViewport.zoom

  const nextPanX = screenPoint[0] - (screenPoint[0] - currentViewport.panX) * factor
  const nextPanY = screenPoint[1] - (screenPoint[1] - currentViewport.panY) * factor

  return {
    panX: nextPanX,
    panY: nextPanY,
    zoom: nextZoom,
  }
}
