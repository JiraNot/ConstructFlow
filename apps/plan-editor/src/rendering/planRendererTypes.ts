import type { DoorHanding, StairModuleData } from '@constructflow/project-model'

export interface UnderlayConfig {
  image: HTMLImageElement | null
  drawing_id?: string
  display_name?: string
  view_id?: string
  level_id?: string
  storage_key?: string
  source_file?: string
  source_kind?: 'image' | 'dxf' | 'dwg'
  source_layout?: string
  source_region?: [number, number, number, number]
  scale_source?: 'declared_units' | 'assumed_units' | 'calibrated'
  origin_mm: [number, number]
  scale_mm_per_px: number
  opacity: number
  visible: boolean
  rotation_deg?: number
  additional_layers?: UnderlayConfig[]
}

export interface CalibrationOverlay {
  point1_mm: [number, number] | null
  point2_mm: [number, number] | null
  mouse_mm?: [number, number] | null
}

export interface PlanLabelVisibility {
  structure: boolean
  beams?: boolean
  walls: boolean
  openings: boolean
  grids: boolean
}

export const DEFAULT_PLAN_LABEL_VISIBILITY: PlanLabelVisibility = {
  structure: true,
  beams: true,
  walls: true,
  openings: true,
  grids: true,
}

export interface PlacementGhost {
  type: string
  location_mm: [number, number]
  target_location_mm?: [number, number]
  reference_start_mm?: [number, number]
  size_mm?: [number, number] | [number, number, number]
  mark?: string
  handing?: DoorHanding
  operation?: string
  panel_count?: number
  sill_height_mm?: number
  glazing_material?: string
  wall_id?: string
  offset_along_wall_mm?: number
  stair?: StairModuleData
  wall_junction_preview?: {
    point_mm: [number, number]
    target_count: number
    target_marks: string[]
    segments_mm: Array<[[number, number], [number, number]]>
  }
}

export type PlanCanvasRenderer = Pick<typeof import('./planRenderer.js'), 'renderPlanView' | 'drawDirectManipulationGhost'>

export function loadPlanCanvasRenderer(): Promise<PlanCanvasRenderer> {
  return import('./planRenderer.js').then(({ renderPlanView, drawDirectManipulationGhost }) => ({ renderPlanView, drawDirectManipulationGhost }))
}
