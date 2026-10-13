export function resolveDragDimensionTarget(
  startPointMm: [number, number],
  xValue: string,
  yValue: string,
  displayUnit: 'mm' | 'cm' | 'm',
): { delta_mm: [number, number]; point_mm: [number, number] } | null
export function resolveRectangleResizeTarget(
  centerMm: [number, number], sizeMm: [number, number], rotationDeg: number, cornerIndex: number,
  widthValue: string, heightValue: string, displayUnit: 'mm' | 'cm' | 'm',
): { point_mm: [number, number]; width_mm: number; height_mm: number } | null
export function resolveLineEndpointLengthTarget(
  startPointMm: [number, number], endPointMm: [number, number], endpointIndex: 0 | 1,
  lengthValue: string, displayUnit: 'mm' | 'cm' | 'm',
): { point_mm: [number, number]; length_mm: number } | null
export function resolveOpeningEdgeWidthTarget(
  hostStartMm: [number, number], hostEndMm: [number, number], centerOffsetMm: number, currentWidthMm: number,
  endpointIndex: 0 | 1, widthValue: string, displayUnit: 'mm' | 'cm' | 'm',
): { point_mm: [number, number]; width_mm: number } | null
