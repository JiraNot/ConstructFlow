export function packElevationLevelLabelCenters(
  datumYs: number[],
  viewportHeight: number,
  options?: { gap?: number; halfHeight?: number; baselineOffset?: number },
): number[]

export function resolveElevationWallFaceMark(
  project: { types?: Array<{ id: string; object_type?: string; name?: string; parameters?: Record<string, unknown> }> },
  wall: { object_type?: string; module_data?: object },
  direction: 'north' | 'south' | 'east' | 'west',
): string

export function getElevationWallStyle(
  phase: 'existing' | 'demolition' | 'new_construction',
  selected?: boolean,
): { fill: string; stroke: string; lineWidth: number; dash: number[] }

export interface ElevationViewState { zoom: number; panX: number; panY: number }
export function zoomElevationViewAtPoint(
  view: ElevationViewState,
  requestedZoom: number,
  screenX: number,
  screenY: number,
  width: number,
  height: number,
): ElevationViewState
export function zoomElevationViewFromCenter(view: ElevationViewState, requestedZoom: number): ElevationViewState
export function panElevationView(view: ElevationViewState, screenDeltaX: number, screenDeltaY: number): ElevationViewState
