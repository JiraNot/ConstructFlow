import type { RefObject } from 'react'
import type { ProjectDocument } from '@constructflow/project-model'
import type { SnapResult } from '@constructflow/snapping-engine'
import type { ViewportState } from '../viewport/viewportTransform.js'
import { worldToScreen } from '../viewport/viewportTransform.js'
import type { PlanCanvasProps } from './PlanCanvas.types.js'
import type { ToolType } from './Toolbar.js'

type PlacementCommitCallbacks = Pick<PlanCanvasProps,
  | 'onCommitSlab'
  | 'onCommitArchitecturalFloor'
  | 'onCommitCeiling'
  | 'onCommitRoof'
  | 'onCommitSurfaceVoid'
  | 'onCommitSupplierBundle'
>

interface CreatePlanCanvasPlacementCommitHandlersOptions extends PlacementCommitCallbacks {
  supplierBundlePlacement: PlanCanvasProps['supplierBundlePlacement']
  canvasRef: RefObject<HTMLCanvasElement | null>
  activeSnap: SnapResult | null
  activeTool: ToolType
  supportsPlacementDimensions: boolean
  viewport: ViewportState
  selectedId: string | null
  project: ProjectDocument
  slabBoundary: [number, number][]
  setSlabBoundary: (boundary: [number, number][]) => void
  roofShape: 'hip' | 'gable' | 'flat'
  roofSlopeDeg: number
  roofThicknessMm: number
  roofElevationOffsetMm: number
  roofMaterial: string
  clearDimensionOverrides: () => void
}

const polygonTools = new Set<ToolType>(['slab', 'slabVoid', 'archFloor', 'ceiling', 'roof'])

export function createPlanCanvasPlacementCommitHandlers(options: CreatePlanCanvasPlacementCommitHandlersOptions) {
  const {
    canvasRef, activeSnap, activeTool, supportsPlacementDimensions, viewport,
    selectedId, project, slabBoundary, setSlabBoundary, roofShape, roofSlopeDeg, roofThicknessMm,
    roofElevationOffsetMm, roofMaterial, clearDimensionOverrides,
    supplierBundlePlacement, onCommitSupplierBundle,
    onCommitSlab, onCommitArchitecturalFloor, onCommitCeiling, onCommitRoof, onCommitSurfaceVoid,
  } = options

  const isAreaBundle = activeTool === 'bundle' && supplierBundlePlacement?.bundle.visual_type === 'area'

  const commitPlacementAtCursor = () => {
    const canvas = canvasRef.current
    if (!canvas || !activeSnap || (!supportsPlacementDimensions && !['measure', 'fill', 'dimension', 'calibrate'].includes(activeTool))) return
    const rect = canvas.getBoundingClientRect()
    const [x, y] = worldToScreen(activeSnap.point_mm, viewport)
    canvas.focus({ preventScroll: true })
    canvas.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      buttons: 1,
      detail: 1,
      clientX: rect.left + x,
      clientY: rect.top + y,
    }))
  }

  const finishPolygonPlacement = () => {
    if (slabBoundary.length < 3) return false
    if (isAreaBundle && onCommitSupplierBundle) onCommitSupplierBundle({ boundary_mm: slabBoundary })
    else if (activeTool === 'slab') onCommitSlab(slabBoundary)
    else if (activeTool === 'archFloor') onCommitArchitecturalFloor?.(slabBoundary)
    else if (activeTool === 'ceiling') onCommitCeiling?.(slabBoundary)
    else if (activeTool === 'roof') onCommitRoof?.(slabBoundary, {
      shape: roofShape,
      slope_deg: roofSlopeDeg,
      thickness_mm: roofThicknessMm,
      elevation_offset_mm: roofElevationOffsetMm,
      material: roofMaterial,
    })
    else if (activeTool === 'slabVoid' && selectedId && ['structure.slab', 'architecture.floor', 'architecture.ceiling', 'roof.system'].includes(project.objects[selectedId]?.object_type ?? '')) onCommitSurfaceVoid(selectedId, slabBoundary)
    else return false
    setSlabBoundary([])
    clearDimensionOverrides()
    return true
  }

  const handleCanvasDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!polygonTools.has(activeTool) && !isAreaBundle) return
    event.preventDefault()
    finishPolygonPlacement()
  }

  const commitActivePlacement = (fromInput = false) => {
    if ((polygonTools.has(activeTool) || isAreaBundle) && !fromInput && finishPolygonPlacement()) return
    commitPlacementAtCursor()
  }

  return { commitActivePlacement, finishPolygonPlacement, handleCanvasDoubleClick }
}
