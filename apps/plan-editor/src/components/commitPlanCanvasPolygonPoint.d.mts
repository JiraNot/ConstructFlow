type PointMm = [number, number]
type RoofPlacementOptions = {
  shape: 'hip' | 'gable' | 'flat'
  slope_deg: number
  thickness_mm: number
  elevation_offset_mm: number
  material: string
}

interface PlanCanvasPolygonPointOptions {
  activeTool: string
  clickCount: number
  pointMm: PointMm
  zoom: number
  boundary: PointMm[]
  selectedId: string | null
  selectedObjectType?: string
  roofOptions: RoofPlacementOptions
  onCommitSlab: (boundary: PointMm[]) => void
  onCommitArchitecturalFloor?: (boundary: PointMm[]) => void
  onCommitCeiling?: (boundary: PointMm[]) => void
  onCommitRoof?: (boundary: PointMm[], options: RoofPlacementOptions) => void
  onCommitSurfaceVoid: (hostId: string, boundary: PointMm[]) => void
  onBoundaryChange: (boundary: PointMm[]) => void
  onDrawLengthChange: (value: string) => void
  onDrawAngleChange: (value: string) => void
  clearDimensionOverrides: () => void
}

export function commitPlanCanvasPolygonPoint(options: PlanCanvasPolygonPointOptions): 'committed' | 'point-added' | 'ignored'
