/** Catalog stores cell counts for compatibility with existing .cfproj files.
 * Editors display internal bar counts: one bar divides a region into two cells.
 * Each leaf gets its own grid; fixed lights are independent regions.
 */
export type OpeningGridZone = "leaf" | "transom" | "bottom_light";
export interface MuntinGrid {
  rows: number;
  columns: number;
}
export function resolveOpeningMuntinGrid(
  parameters: Record<string, unknown>,
  zone: OpeningGridZone = "leaf",
): MuntinGrid {
  const prefix = zone === "leaf" ? "" : `${zone}_`;
  const cells = (value: unknown) =>
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 8
      ? value
      : 1;
  return {
    rows: cells(parameters[`${prefix}muntin_rows`]),
    columns: cells(parameters[`${prefix}muntin_columns`]),
  };
}
/** Normalized positions inside one clear pane, excluding frame and sash rails. */
export function muntinGridPositions(grid: MuntinGrid): {
  vertical: number[];
  horizontal: number[];
} {
  const positions = (cells: number) =>
    Array.from({ length: Math.max(0, cells - 1) }, (_, i) => (i + 1) / cells);
  return {
    vertical: positions(grid.columns),
    horizontal: positions(grid.rows),
  };
}
