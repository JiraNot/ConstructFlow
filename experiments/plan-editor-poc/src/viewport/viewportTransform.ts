// Viewport Coordinate Transformation (World Millimeters <-> Screen Pixels)

export interface ViewportState {
  panX: number // Screen pixel offset
  panY: number // Screen pixel offset
  zoom: number // Screen pixels per world millimeter (e.g. 0.1 = 100mm -> 10px)
}

export function worldToScreen(
  worldPoint: [number, number],
  viewport: ViewportState
): [number, number] {
  return [
    worldPoint[0] * viewport.zoom + viewport.panX,
    worldPoint[1] * viewport.zoom + viewport.panY,
  ]
}

export function screenToWorld(
  screenPoint: [number, number],
  viewport: ViewportState
): [number, number] {
  return [
    (screenPoint[0] - viewport.panX) / viewport.zoom,
    (screenPoint[1] - viewport.panY) / viewport.zoom,
  ]
}

export function zoomAtScreenPoint(
  currentViewport: ViewportState,
  screenPoint: [number, number],
  factor: number
): ViewportState {
  const newZoom = Math.max(0.01, Math.min(2.0, currentViewport.zoom * factor))
  const worldX = (screenPoint[0] - currentViewport.panX) / currentViewport.zoom
  const worldY = (screenPoint[1] - currentViewport.panY) / currentViewport.zoom

  return {
    zoom: newZoom,
    panX: screenPoint[0] - worldX * newZoom,
    panY: screenPoint[1] - worldY * newZoom,
  }
}
