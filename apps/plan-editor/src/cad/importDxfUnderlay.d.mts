export interface ImportedDxfUnderlay {
  dataUrl: string
  origin_mm: [number, number]
  scale_mm_per_px: number
  width_px: number
  height_px: number
  drawing_units: string
  imported_entities: number
  skipped_entities: number
}

export function importDxfUnderlay(source: string, options?: { maxImageDimension?: number }): ImportedDxfUnderlay

export function importDxfDrawing(source: string, options?: { unitScaleMm?: number }): { paths: import('@constructflow/project-model').FamilyPath[]; bounds: [number, number, number, number]; drawing_units: string; unit_scale_mm: number; imported_entities: number; skipped_entities: number }
