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
    coordinationSeverities, coordinationFocusSelection = false, collaborators = [],
  } = props
  const { activeSnap, activeWallSnap, beamStartNode, wallStartNode,
    stairStartPoint, calibrationP1, calibrationMousePoint, gridStartPoint,
    gridCopySourceId, tapeMeasure, measureMode, measurePoints, measureComplete, pipeSystem, fixtureKind, furnitureKind, slabBoundary, bundleStartPoint } = placement

  const stairPreview = useMemo(() => {
    if (activeTool !== 'stair' || !stairStartPoint || !activeSnap) return null
    try { return stairFromRun(project, stairStartPoint, activeSnap.point_mm, placement.stairOptions) } catch { return null }
  }, [activeTool, stairStartPoint, activeSnap, placement.stairOptions, project])

  usePlanCanvasDrawing({
    containerRef, canvasRef, project, planProject, activeTool, activeSnap, activeWallSnap,
    activeColumnTypeMark, activeFoundationTypeMark, activeBeamTypeMark, activeWallTypeMark,
    activeDoorTypeMark, activeWindowTypeMark, beamStartNode, wallStartNode,
    supplierBundleVisualType: props.supplierBundlePlacement?.bundle.visual_type ?? 'shape', bundleStartPoint,
    doorHanding: props.preferences.doorHanding,
    stairPreview, stairStartPoint, resolveReferencePath: placementController.resolveReferencePath,
    calibrationP1, calibrationMousePoint, selectedIds, editableSelectionIds, collaborators,
    hoveredId: picking.hoveredId, underlay, labelMode, labelVisibility,
    displaySettings: {
      backgroundVisible: props.preferences.backgroundVisible,
      rulersEnabled: props.preferences.rulersEnabled,
      gridEnabled: props.preferences.gridEnabled,
      gridSpacingMm: props.preferences.gridSpacingMm,
      majorGridEvery: props.preferences.majorGridEvery,
      lengthPrecision: props.preferences.lengthPrecision,
    },
    planDiscipline,
    viewport, displayUnit, manipulationPreview: pointer.manipulationPreview,
    showRealtimeDimensions: props.preferences.realtimeDimensions,
    lengthPrecision: props.preferences.lengthPrecision,
    anglePrecision: props.preferences.anglePrecision,
    externalManipulationPreview, coordination, coordinationSeverities, coordinationFocusSelection,
    gridStartPoint, gridCopySourceId, tapeMeasure, measureMode, measurePoints, measureComplete, dimensionReferenceMode: props.preferences.dimensionReferenceMode,
    wallTouchPreview: pointer.wallTouchPreview,
    wallDrawMode: pointer.wallDrawMode,
    sketchMode: pointer.sketchMode, sketchPoints: pointer.sketchPoints,
    lineDrawingMode: props.preferences.lineDrawingMode,
    wallAngleSnapDeg: props.preferences.wallAngleSnapDeg,
    selectionBox: pointer.selectionBox, roomSeparatorStart: placement.roomSeparatorStart,
    pipeSystem, fixtureKind, furnitureKind, slabBoundary, activeFamilyId: props.activeFamilyId, activeFamilyTypeId: props.activeFamilyTypeId,
  })
}
