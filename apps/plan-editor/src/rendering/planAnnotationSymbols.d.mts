export const PLAN_GRID_BUBBLE_RADIUS_PX: 14

export type ElectricalFixtureScreenSymbol =
  | { shape: 'panel'; halfWidth: number; halfHeight: number; detail: 'none' }
  | { shape: 'circle'; radius: number; detail: 'switch' | 'outlet' | 'light' }

export function electricalFixtureScreenSymbol(kind: unknown): ElectricalFixtureScreenSymbol

export function drawElectricalFixtureScreenSymbol(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  kind: unknown,
): ElectricalFixtureScreenSymbol
