import { validateOpeningPlanSymbolLines, type OpeningPlanSymbolLine } from './openingPlanSymbol.js'

/** Sheet-specific cleanup/redrafting for one model-hosted opening. */
export interface OpeningViewOverride {
  hide_generated_details?: boolean
  hide_generated_elevation?: boolean
  /** Plan view linework (wall-normal y coordinates). */
  lines?: OpeningPlanSymbolLine[]
  /** Front elevation linework (vertical y coordinates anchored to opening height). */
  elevation_lines?: OpeningPlanSymbolLine[]
}
/**
 * A saved placement for a model-derived automatic dimension. The dimension
 * value and geometry stay associative; only its paper-space position moves.
 */
export interface DimensionViewOverride {
  /** Paper-space displacement from the automatic placement, in millimeters. */
  offset_mm: [number, number]
  /** True once the user has explicitly positioned the dimension. */
  locked: true
}
export interface SavedSheetViewport {
  scale_denominator: number;
  /** Selects the story shown by a level plan sheet. */
  level_id?: string;
  center_mm?: [number, number];
  crop_bounds_mm?: [number, number, number, number];
  section_cut_mm?: number;
  /** 2D drafting overrides keyed by persistent opening object UUID. */
  opening_overrides?: Record<string, OpeningViewOverride>;
  /** Locked auto-dimension placements keyed by stable source-object references. */
  dimension_overrides?: Record<string, DimensionViewOverride>;
}
export interface DrawingSettings {
  viewports: Record<string, SavedSheetViewport>;
  revision?: string;
  author?: string;
}
export function validateDrawingSettings(
  value: unknown,
): asserts value is DrawingSettings {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid drawing settings");
  const settings = value as DrawingSettings;
  if (
    !settings.viewports ||
    typeof settings.viewports !== "object" ||
    Array.isArray(settings.viewports)
  )
    throw new Error("Invalid sheet viewports");
  for (const [id, v] of Object.entries(settings.viewports)) {
    if (!/^(A-(0[1-9]|10)|S-0[1-6]|[ME]-0[12]|A-02-L\d+|S-02-L\d+)$/.test(id))
      throw new Error("Invalid sheet ID");
    if (!v || ![20, 25, 50, 100, 200, 500].includes(v.scale_denominator))
      throw new Error("Invalid sheet scale");
    if (v.level_id !== undefined && (typeof v.level_id !== 'string' || !v.level_id.trim()))
      throw new Error('Invalid sheet level');
    for (const [key, count] of [
      ["center_mm", 2],
      ["crop_bounds_mm", 4],
    ] as const) {
      const a = v[key];
      if (
        a !== undefined &&
        (!Array.isArray(a) ||
          a.length !== count ||
          a.some((n) => typeof n !== "number" || !Number.isFinite(n)))
      )
        throw new Error("Invalid sheet " + key);
    }
    const c = v.crop_bounds_mm;
    if (c && (c[2] <= c[0] || c[3] <= c[1]))
      throw new Error("Invalid sheet crop");
    if (v.section_cut_mm !== undefined && !Number.isFinite(v.section_cut_mm))
      throw new Error("Invalid section cut");
    if (v.opening_overrides !== undefined) {
      if (!v.opening_overrides || typeof v.opening_overrides !== 'object' || Array.isArray(v.opening_overrides)) throw new Error('Invalid opening view overrides')
      for (const [objectId, override] of Object.entries(v.opening_overrides)) {
        if (!objectId || objectId.length > 100 || !override || typeof override !== 'object' || Array.isArray(override)) throw new Error('Invalid opening view override')
        if (override.hide_generated_details !== undefined && typeof override.hide_generated_details !== 'boolean') throw new Error('Invalid generated detail visibility')
        if (override.hide_generated_elevation !== undefined && typeof override.hide_generated_elevation !== 'boolean') throw new Error('Invalid generated elevation visibility')
        if (override.lines !== undefined) validateOpeningPlanSymbolLines(override.lines)
        if (override.elevation_lines !== undefined) validateOpeningPlanSymbolLines(override.elevation_lines)
        if (override.lines === undefined && override.elevation_lines === undefined) throw new Error('Opening view override must contain plan or elevation lines')
      }
    }
    if (v.dimension_overrides !== undefined) {
      if (!v.dimension_overrides || typeof v.dimension_overrides !== 'object' || Array.isArray(v.dimension_overrides)) throw new Error('Invalid dimension view overrides')
      for (const [dimensionId, override] of Object.entries(v.dimension_overrides)) {
        if (!dimensionId || dimensionId.length > 500 || !override || typeof override !== 'object' || Array.isArray(override)) throw new Error('Invalid dimension view override')
        if (override.locked !== true || !Array.isArray(override.offset_mm) || override.offset_mm.length !== 2 || override.offset_mm.some(value => typeof value !== 'number' || !Number.isFinite(value))) throw new Error('Invalid locked dimension placement')
      }
    }
  }
  for (const key of ["revision", "author"] as const)
    if (settings[key] !== undefined && typeof settings[key] !== "string")
      throw new Error("Invalid drawing " + key);
}
