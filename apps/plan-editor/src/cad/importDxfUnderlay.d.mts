export interface ImportedDxfUnderlay {
  dataUrl: string
  origin_mm: [number, number]
  scale_mm_per_px: number
  width_px: number
  height_px: number
  drawing_units: string
  imported_entities: number
  skipped_entities: number
  layers?: string[]
}

export interface ImportedDxfDrawingCandidate {
  id: string
  name: string
  kind: 'model_space' | 'paper_space'
  svg: string
  entityCount: number
  unsupportedEntities: number
  layers?: string[]
  prepared: ImportedDxfUnderlay
}

export function importDxfUnderlay(source: string, options?: { maxImageDimension?: number; space?: 'model_space' | 'paper_space'; layoutName?: string }): ImportedDxfUnderlay
export function importDxfDrawingCandidates(source: string, options?: { maxImageDimension?: number }): ImportedDxfDrawingCandidate[]

export function importDxfDrawing(source: string, options?: { unitScaleMm?: number }): { paths: import('@constructflow/project-model').FamilyPath[]; bounds: [number, number, number, number]; drawing_units: string; unit_scale_mm: number; imported_entities: number; skipped_entities: number }
