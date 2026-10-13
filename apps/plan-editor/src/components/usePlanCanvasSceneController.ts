import { useMemo } from 'react'
import type { RefObject } from 'react'
import { stairFromRun } from '@constructflow/architecture-engine'
import type { ProjectDocument } from '@constructflow/project-model'
import type { ViewportState } from '../viewport/viewportTransform.js'
import type { PlanCanvasProps } from './PlanCanvas.types.js'
import type { usePlanCanvasPlacementSession } from './usePlanCanvasPlacementSession.js'
import type { usePlanCanvasPointerState } from './usePlanCanvasPointerState.js'
import type { usePlanCanvasPicking } from './usePlanCanvasPicking.js'
import type { usePlanCanvasPlacementController } from './usePlanCanvasPlacementController.js'
import { usePlanCanvasDrawing } from './usePlanCanvasDrawing.js'

interface UsePlanCanvasSceneControllerOptions {
  props: PlanCanvasProps
  planProject: ProjectDocument
  viewport: ViewportState
  containerRef: RefObject<HTMLDivElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  selectedIds: string[]
  editableSelectionIds: string[]
  placement: ReturnType<typeof usePlanCanvasPlacementSession>
  placementController: ReturnType<typeof usePlanCanvasPlacementController>
  pointer: ReturnType<typeof usePlanCanvasPointerState>
  picking: ReturnType<typeof usePlanCanvasPicking>
}

/** Prepares and draws the active plan scene from canonical model and interaction state. */
export function usePlanCanvasSceneController({
  props, planProject, viewport, containerRef, canvasRef, selectedIds,
  editableSelectionIds, placement, placementController, pointer, picking,
}: UsePlanCanvasSceneControllerOptions) {
  const {
    project, activeTool, activeColumnTypeMark, activeFoundationTypeMark,
    activeBeamTypeMark, activeWallTypeMark, activeDoorTypeMark, activeWindowTypeMark,
    labelMode, labelVisibility, planDiscipline = 'architecture', displayUnit,
    underlay, externalManipulationPreview = null, coordination = [],
    coordinationSeverities, coordinationFocusSelection = false,
  } = props
  const { activeSnap, activeWallSnap, beamStartNode, wallStartNode,
    stairStartPoint, calibrationP1, calibrationMousePoint, gridStartPoint,
    gridCopySourceId, tapeMeasure, pipeSystem, fixtureKind, slabBoundary } = placement

  const stairPreview = useMemo(() => {
    if (activeTool !== 'stair' || !stairStartPoint || !activeSnap) return null
    try { return stairFromRun(project, stairStartPoint, activeSnap.point_mm, placement.stairOptions) } catch { return null }
  }, [activeTool, stairStartPoint, activeSnap, placement.stairOptions, project])

  usePlanCanvasDrawing({
    containerRef, canvasRef, project, planProject, activeTool, activeSnap, activeWallSnap,
    activeColumnTypeMark, activeFoundationTypeMark, activeBeamTypeMark, activeWallTypeMark,
    activeDoorTypeMark, activeWindowTypeMark, beamStartNode, wallStartNode,
    doorHanding: props.preferences.doorHanding,
    stairPreview, stairStartPoint, resolveReferencePath: placementController.resolveReferencePath,
    calibrationP1, calibrationMousePoint, selectedIds, editableSelectionIds,
    hoveredId: picking.hoveredId, underlay, labelMode, labelVisibility, planDiscipline,
    viewport, displayUnit, manipulationPreview: pointer.manipulationPreview,
    externalManipulationPreview, coordination, coordinationSeverities, coordinationFocusSelection,
    gridStartPoint, gridCopySourceId, tapeMeasure, dimensionReferenceMode: props.preferences.dimensionReferenceMode,
    selectionBox: pointer.selectionBox, roomSeparatorStart: placement.roomSeparatorStart,
    pipeSystem, fixtureKind, slabBoundary,
  })
}
