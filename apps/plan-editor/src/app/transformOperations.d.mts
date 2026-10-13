export type AlignmentMode = 'left' | 'center-x' | 'right' | 'top' | 'middle-y' | 'bottom'
export const ALIGNMENT_MODES: readonly AlignmentMode[]
export function computeAlignmentDelta(
  anchorBounds: [number, number, number, number] | null,
  objectBounds: [number, number, number, number] | null,
  mode: AlignmentMode,
): [number, number] | null
export function computeOffsetDelta(
  startPointMm: [number, number],
  endPointMm: [number, number],
  distanceMm: number,
  side?: 'left' | 'right',
): [number, number] | null
export function reflectPlanPoint(
  pointMm: [number, number],
  axis: 'vertical' | 'horizontal',
  coordinateMm: number,
): [number, number] | null
export function splitLineAtRatio(
  startPointMm: [number, number],
  endPointMm: [number, number],
  ratio: number,
): { start: [number, number]; split: [number, number]; end: [number, number] } | null
export function trimLineAtIntersection(
  targetStartMm: [number, number],
  targetEndMm: [number, number],
  cutterStartMm: [number, number],
  cutterEndMm: [number, number],
  removeEnd?: 'start' | 'end',
): { start: [number, number]; end: [number, number]; intersection: [number, number] } | null
export function joinLineSegments(
  firstStartMm: [number, number],
  firstEndMm: [number, number],
  secondStartMm: [number, number],
  secondEndMm: [number, number],
  toleranceMm?: number,
): { start: [number, number]; end: [number, number] } | null
