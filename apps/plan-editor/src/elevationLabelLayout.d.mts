export function packElevationLevelLabelCenters(
  datumYs: number[],
  viewportHeight: number,
  options?: { gap?: number; halfHeight?: number; baselineOffset?: number },
): number[]

export function getVisibleElevationLevelRows<T>(
  levels: T[],
  toScreenY: (level: T) => number,
  viewportHeight: number,
): Array<{ level: T; y: number }>

export function resolveElevationWallFaceMark(
  project: { types?: Array<{ id: string; object_type?: string; name?: string; parameters?: Record<string, unknown> }> },
  wall: { object_type?: string; module_data?: object },
  direction: 'north' | 'south' | 'east' | 'west',
): string

export function getElevationWallStyle(
  phase: 'existing' | 'demolition' | 'new_construction',
  selected?: boolean,
): { fill: string; stroke: string; lineWidth: number; dash: number[] }

export function sortElevationObjectsForDrawing<T extends { object_type?: string; module_data?: any }>(
  items: T[],
  direction: 'north' | 'south' | 'east' | 'west',
): T[]

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
export function layoutElevationTags<T extends { x: number; y: number; width: number; height: number }>(
  tags: T[],
  viewportWidth: number,
  viewportHeight: number,
): Array<T & { anchorX: number; anchorY: number; displaced: boolean; collision: boolean }>
export function getElevationMeshEdges(
  triangles: Array<Array<[number, number, number]>>,
): Array<[[number, number, number], [number, number, number]]>
