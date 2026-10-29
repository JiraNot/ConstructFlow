import { validateOpeningPlanSymbolLines, type OpeningPlanSymbolLine } from './openingPlanSymbol.js'
import { validatePlanDimension, type PlanDimension } from './planDimension.js'
import type { Phase } from './types.js'

export type PlanFillPattern = 'diagonal' | 'crosshatch' | 'grid' | 'dots'
export type PlanFillBorderStyle = 'solid' | 'dashed' | 'dotted' | 'dot-dash'
export interface PlanFillStyle {
  fill_type: 'solid' | 'pattern'
  pattern: PlanFillPattern
  scale_mm: number
  rotation_deg: number
  color: string
  opacity: number
  border_color: string
  border_width_mm: number
  border_style: PlanFillBorderStyle
}
export interface PlanFill {
  id: string
  level_id: string
  created_phase: Phase
  boundary_mm: [number, number][]
  style: PlanFillStyle
}

export type PlanSketchMode = 'line' | 'polyline' | 'freehand' | 'rectangle'
export type PlanSketchLineStyle = 'solid' | 'dashed' | 'dotted'
export interface PlanSketch {
  id: string
  level_id: string
  created_phase: Phase
  points_mm: [number, number][]
  closed: boolean
  mode: PlanSketchMode
  color: string
  width_mm: number
  line_style: PlanSketchLineStyle
}

const PLAN_SKETCH_MODES: PlanSketchMode[] = ['line', 'polyline', 'freehand', 'rectangle']
const PLAN_SKETCH_LINE_STYLES: PlanSketchLineStyle[] = ['solid', 'dashed', 'dotted']
export function validatePlanSketch(value: unknown): asserts value is PlanSketch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid plan sketch')
  const sketch = value as PlanSketch
  if (typeof sketch.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sketch.id)) throw new Error('Plan sketch requires a persistent UUID')
  if (typeof sketch.level_id !== 'string' || !sketch.level_id.trim()) throw new Error('Plan sketch requires a level')
  if (!['existing', 'demolition', 'new_construction'].includes(sketch.created_phase)) throw new Error('Plan sketch requires a valid phase')
  if (!PLAN_SKETCH_MODES.includes(sketch.mode) || typeof sketch.closed !== 'boolean') throw new Error('Plan sketch mode or closure is invalid')
  if (!Array.isArray(sketch.points_mm) || sketch.points_mm.length < 2 || sketch.points_mm.length > 5000) throw new Error('Plan sketch must contain 2 to 5000 points')
  for (const point of sketch.points_mm) if (!Array.isArray(point) || point.length !== 2 || point.some(coordinate => typeof coordinate !== 'number' || !Number.isFinite(coordinate))) throw new Error('Plan sketch points must be finite XY coordinates')
  if (!/^#[0-9a-f]{6}$/i.test(sketch.color)) throw new Error('Plan sketch color must be a six digit hex color')
  if (!Number.isFinite(sketch.width_mm) || sketch.width_mm < 1 || sketch.width_mm > 100) throw new Error('Plan sketch width must be between 1 and 100 mm')
  if (!PLAN_SKETCH_LINE_STYLES.includes(sketch.line_style)) throw new Error('Plan sketch line style is invalid')
}

const PLAN_FILL_HEX_COLOR = /^#[0-9a-f]{6}$/i
const PLAN_FILL_PATTERNS: PlanFillPattern[] = ['diagonal', 'crosshatch', 'grid', 'dots']
const PLAN_FILL_BORDER_STYLES: PlanFillBorderStyle[] = ['solid', 'dashed', 'dotted', 'dot-dash']

export function validatePlanFillStyle(value: unknown): asserts value is PlanFillStyle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid plan fill style')
  const style = value as PlanFillStyle
  if (!['solid', 'pattern'].includes(style.fill_type) || !PLAN_FILL_PATTERNS.includes(style.pattern)) throw new Error('Invalid plan fill type or pattern')
  if (!Number.isFinite(style.scale_mm) || style.scale_mm < 20 || style.scale_mm > 10000) throw new Error('Plan fill pattern scale must be between 20 and 10000 mm')
  if (!Number.isFinite(style.rotation_deg) || style.rotation_deg < -360 || style.rotation_deg > 360) throw new Error('Plan fill rotation must be between -360 and 360 degrees')
  if (!PLAN_FILL_HEX_COLOR.test(style.color) || !PLAN_FILL_HEX_COLOR.test(style.border_color)) throw new Error('Plan fill colors must be six digit hex colors')
  if (!Number.isFinite(style.opacity) || style.opacity < 0 || style.opacity > 1) throw new Error('Plan fill opacity must be between 0 and 1')
  if (!Number.isFinite(style.border_width_mm) || style.border_width_mm < 0 || style.border_width_mm > 100) throw new Error('Plan fill border width must be between 0 and 100 mm')
  if (!PLAN_FILL_BORDER_STYLES.includes(style.border_style)) throw new Error('Invalid plan fill border style')
}

export function validatePlanFill(value: unknown): asserts value is PlanFill {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid plan fill')
  const fill = value as PlanFill
  if (typeof fill.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(fill.id)) throw new Error('Plan fill requires a persistent UUID')
  if (typeof fill.level_id !== 'string' || !fill.level_id.trim()) throw new Error('Plan fill requires a level')
  if (!['existing', 'demolition', 'new_construction'].includes(fill.created_phase)) throw new Error('Plan fill requires a valid phase')
  if (!Array.isArray(fill.boundary_mm) || fill.boundary_mm.length < 3 || fill.boundary_mm.length > 1000) throw new Error('Plan fill boundary must contain 3 to 1000 points')
  for (const point of fill.boundary_mm) if (!Array.isArray(point) || point.length !== 2 || point.some(coordinate => typeof coordinate !== 'number' || !Number.isFinite(coordinate))) throw new Error('Plan fill boundary points must be finite XY coordinates')
  validatePlanFillStyle(fill.style)
}

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
  /** User-positioned A3 paper frame [x, y, width, height] in millimeters. */
  paper_frame_mm?: [number, number, number, number]
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
  /** User-positioned A3 paper frame [x, y, width, height] in millimeters. */
  paper_frame_mm?: [number, number, number, number];
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
  plan_dimensions?: PlanDimension[];
  /** User-authored color and hatch regions in model space. */
  plan_fills?: PlanFill[];
  /** User-authored non-semantic plan linework, saved in model-space millimeters. */
  plan_sketches?: PlanSketch[];
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
  if (settings.plan_dimensions !== undefined) {
    if (!Array.isArray(settings.plan_dimensions) || settings.plan_dimensions.length > 10000) throw new Error('Invalid plan dimensions')
    const ids = new Set<string>()
    for (const dimension of settings.plan_dimensions) {
      validatePlanDimension(dimension)
      if (ids.has(dimension.id)) throw new Error('Duplicate plan dimension UUID')
      ids.add(dimension.id)
    }
  }
  if (settings.plan_fills !== undefined) {
    if (!Array.isArray(settings.plan_fills) || settings.plan_fills.length > 10000) throw new Error('Invalid plan fills')
    const ids = new Set<string>()
    for (const fill of settings.plan_fills) {
      validatePlanFill(fill)
      if (ids.has(fill.id)) throw new Error('Duplicate plan fill UUID')
      ids.add(fill.id)
    }
  }
  if (settings.plan_sketches !== undefined) {
    if (!Array.isArray(settings.plan_sketches) || settings.plan_sketches.length > 10000) throw new Error('Invalid plan sketches')
    const ids = new Set<string>()
    for (const sketch of settings.plan_sketches) {
      validatePlanSketch(sketch)
      if (ids.has(sketch.id)) throw new Error('Duplicate plan sketch UUID')
      ids.add(sketch.id)
    }
  }
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
      ["paper_frame_mm", 4],
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
    if (v.paper_frame_mm && !isValidA3PaperFrame(v.paper_frame_mm))
      throw new Error("Invalid sheet paper frame");
    if (v.section_cut_mm !== undefined && !Number.isFinite(v.section_cut_mm))
      throw new Error("Invalid section cut");
    if (v.view_layout !== undefined && (!Array.isArray(v.view_layout) || v.view_layout.length < 1 || v.view_layout.length > 8 || v.view_layout.some(kind => !['plan', 'rcp', 'north', 'south', 'east', 'west', 'section_x', 'section_y', 'isometric'].includes(kind))))
      throw new Error('Invalid sheet view layout');
    if (v.subviews !== undefined) {
      if (!Array.isArray(v.subviews) || v.subviews.length > 7)
        throw new Error('Sheet subviews must contain 0 to 7 viewport settings')
      for (const subview of v.subviews) {
        if (!subview || ![20, 25, 50, 100, 200, 500].includes(subview.scale_denominator))
          throw new Error('Invalid sheet subview scale')
        for (const [key, count] of [['center_mm', 2], ['crop_bounds_mm', 4], ['paper_frame_mm', 4]] as const) {
          const values = subview[key]
          if (values !== undefined && (!Array.isArray(values) || values.length !== count || values.some(value => typeof value !== 'number' || !Number.isFinite(value))))
            throw new Error(`Invalid sheet subview ${key}`)
        }
        const crop = subview.crop_bounds_mm
        if (crop && (crop[2] <= crop[0] || crop[3] <= crop[1])) throw new Error('Invalid sheet subview crop')
        if (subview.paper_frame_mm && !isValidA3PaperFrame(subview.paper_frame_mm)) throw new Error('Invalid sheet subview paper frame')
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

function isValidA3PaperFrame(frame: readonly number[]): boolean {
  const [x, y, width, height] = frame
  return frame.length === 4 && frame.every(Number.isFinite)
    && x >= 0 && y >= 0 && width >= 40 && height >= 30
    && x + width <= 420 && y + height <= 297
}
