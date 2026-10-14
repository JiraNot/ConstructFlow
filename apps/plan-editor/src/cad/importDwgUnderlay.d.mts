export interface DwgSvgUnderlayOptions {
  insertionUnits?: number
  entityCount?: number
  unsupportedEntities?: number
  maxImageDimension?: number
}

export interface DwgSvgUnderlay {
  dataUrl: string
  origin_mm: [number, number]
  scale_mm_per_px: number
  width_px: number
  height_px: number
  drawing_units: string
  imported_entities: number
  skipped_entities: number
}

export function importDwgSvgUnderlay(svg: string, options?: DwgSvgUnderlayOptions): DwgSvgUnderlay
