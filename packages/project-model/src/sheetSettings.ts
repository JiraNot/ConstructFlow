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
/** Independent framing for a secondary view already composed on the same sheet. */
export interface SavedSheetSubviewport {
  scale_denominator: number
  center_mm?: [number, number]
  crop_bounds_mm?: [number, number, number, number]
}
export type SheetViewKind = 'plan' | 'rcp' | 'north' | 'south' | 'east' | 'west' | 'section_x' | 'section_y' | 'isometric'
export interface SavedSheetViewport {
  scale_denominator: number;
  /** Ordered view composition for interactive sheet layouts. Omitted means the sheet's standard view set. */
  view_layout?: SheetViewKind[];
  /** Selects the story shown by a level plan sheet. */
  level_id?: string;
  center_mm?: [number, number];
  crop_bounds_mm?: [number, number, number, number];
  section_cut_mm?: number;
  /** Per-subview framing for multi-view sheets (for example elevations and RCP). */
  subviews?: SavedSheetSubviewport[]
  /** 2D drafting overrides keyed by persistent opening object UUID. */
  opening_overrides?: Record<string, OpeningViewOverride>;
  /** Locked auto-dimension placements keyed by stable source-object references. */
  dimension_overrides?: Record<string, DimensionViewOverride>;
}
/** Reusable viewport arrangement. Per-opening and per-dimension drafting overrides stay sheet-specific. */
export interface SheetLayoutTemplate {
  id: string;
  name: string;
  viewports: Record<string, SavedSheetViewport>;
}
export interface DrawingSettings {
  viewports: Record<string, SavedSheetViewport>;
  layout_templates?: SheetLayoutTemplate[];
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
    if (v.view_layout !== undefined && (!Array.isArray(v.view_layout) || v.view_layout.length < 1 || v.view_layout.length > 4 || v.view_layout.some(kind => !['plan', 'rcp', 'north', 'south', 'east', 'west', 'section_x', 'section_y', 'isometric'].includes(kind))))
      throw new Error('Invalid sheet view layout');
    if (v.subviews !== undefined) {
      if (!Array.isArray(v.subviews) || v.subviews.length > 3)
        throw new Error('Sheet subviews must contain 0 to 3 viewport settings')
      for (const subview of v.subviews) {
        if (!subview || ![20, 25, 50, 100, 200, 500].includes(subview.scale_denominator))
          throw new Error('Invalid sheet subview scale')
        for (const [key, count] of [['center_mm', 2], ['crop_bounds_mm', 4]] as const) {
          const values = subview[key]
          if (values !== undefined && (!Array.isArray(values) || values.length !== count || values.some(value => typeof value !== 'number' || !Number.isFinite(value))))
            throw new Error(`Invalid sheet subview ${key}`)
        }
        const crop = subview.crop_bounds_mm
        if (crop && (crop[2] <= crop[0] || crop[3] <= crop[1])) throw new Error('Invalid sheet subview crop')
      }
    }
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
  if (settings.layout_templates !== undefined) {
    if (!Array.isArray(settings.layout_templates)) throw new Error("Invalid sheet layout templates");
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const template of settings.layout_templates) {
      if (!template || typeof template !== "object" || typeof template.id !== "string" || !template.id.trim() || template.id.length > 100)
        throw new Error("Sheet layout template requires a valid ID");
      if (typeof template.name !== "string" || !template.name.trim() || template.name.trim().length > 80)
        throw new Error("Sheet layout template name must contain 1 to 80 characters");
      const normalizedName = template.name.trim().toLowerCase();
      if (ids.has(template.id) || names.has(normalizedName)) throw new Error("Sheet layout template IDs and names must be unique");
      ids.add(template.id);
      names.add(normalizedName);
      if (!template.viewports || typeof template.viewports !== "object" || Array.isArray(template.viewports) || !Object.keys(template.viewports).length)
        throw new Error("Sheet layout template must contain at least one viewport");
      validateDrawingSettings({ viewports: template.viewports });
    }
  }
}
