import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { getPlanViewProject, getPlanVisibleObjects } from '@constructflow/representation-engine'
import { usePlanCanvasViewport } from './usePlanCanvasViewport.js'
import { usePlanCanvasDragDimensions } from './usePlanCanvasDragDimensions.js'
import { usePlanCanvasPlacementSession } from './usePlanCanvasPlacementSession.js'
import { usePlanCanvasPicking } from './usePlanCanvasPicking.js'
import { usePlanCanvasPointerState } from './usePlanCanvasPointerState.js'
import { usePlanCanvasToolController } from './usePlanCanvasToolController.js'
import { usePlanCanvasPlacementController } from './usePlanCanvasPlacementController.js'
import { usePlanCanvasPointerController } from './usePlanCanvasPointerController.js'
import { usePlanCanvasSceneController } from './usePlanCanvasSceneController.js'
import { usePlanCanvasSnapping } from './usePlanCanvasSnapping.js'
import { PlanCanvasSurface } from './PlanCanvasSurface.js'
import { usePlanCanvasSurfaceController } from './usePlanCanvasSurfaceController.js'
import type { PlanCanvasProps } from './PlanCanvas.types.js'
import { usePlanCanvasSurveySelection } from './usePlanCanvasSurveySelection.js'

/** Owns the PlanCanvas interaction graph and returns the surface presentation model. */
export function usePlanCanvasController(props: PlanCanvasProps) {
  const {
    project,
    preferences,
    onPreferencesChange,
    planDiscipline = 'architecture',
    displayUnit,
    activeTool,
    toolActivation = 0,
    selectedId,
    selectedIds = selectedId ? [selectedId] : [],
    onSelectObject,
    onSelectionChange,
    onActivateTool,
    onFlipDoorHanding,
    navigationViewport,
    onNavigationViewportChange,
  } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragDimensionInput = usePlanCanvasDragDimensions(displayUnit)
  const includeCeilings = activeTool === 'ceiling' || (activeTool === 'slabVoid' && project.objects[selectedId ?? '']?.object_type === 'architecture.ceiling')
  const planVisibleObjects = useMemo(() => getPlanVisibleObjects(project, planDiscipline, { includeCeilings }), [project, planDiscipline, includeCeilings])
  const planProject = useMemo(() => getPlanViewProject(project, planVisibleObjects), [project, planVisibleObjects])
  const surveyReferencePoints = useMemo<[number, number][]>(
    () => project.site_survey?.points.map(point => [point.x_mm, point.y_mm]) ?? [],
    [project.site_survey?.points],
  )

  const viewportController = usePlanCanvasViewport(
    containerRef, planVisibleObjects, surveyReferencePoints, navigationViewport, onNavigationViewportChange,
  )
  const { viewport, setViewport } = viewportController
  const placement = usePlanCanvasPlacementSession({ project, displayUnit, activeTool, activation: toolActivation })
  const [authoringControlsOpen, setAuthoringControlsOpen] = useState(false)
  const surveySelection = usePlanCanvasSurveySelection({ project, activeTool, viewport, onSelectObject, onSelectionChange })
  const { snapModes } = preferences
  const { snapPlanPoint, snapPlanWallHost } = usePlanCanvasSnapping({ planProject, viewport, snapModes })

  const picking = usePlanCanvasPicking({
    project, planProject, viewport, activeTool, selectedId, onSelectObject, onSelectionChange,
  })
  const pointerState = usePlanCanvasPointerState({
    manualDragPointRef: dragDimensionInput.manualPointRef,
    setResizeDimensionWidth: dragDimensionInput.setWidth,
    setResizeDimensionHeight: dragDimensionInput.setHeight,
    setResizeDimensionLength: dragDimensionInput.setLength,
  })

  const editableSelectionIds = selectedIds.length ? selectedIds : selectedId ? [selectedId] : []
  const interactionStatus = usePlanCanvasToolController({
    project,
    planProject,
    preferences,
    onPreferencesChange,
    activeTool,
    selectedId,
    editableSelectionIds,
    selectedIds,
    placement,
    pointer: pointerState,
    onActivateTool,
    onSelectionChange,
    onSelectObject,
    onFlipDoorHanding,
  })
  const placementController = usePlanCanvasPlacementController({
    props, planProject, viewport, canvasRef, placement, cancelCurrentPlacement: interactionStatus.cancelCurrentPlacement,
  })

  const pointerController = usePlanCanvasPointerController({
    props,
    planProject,
    viewport,
    setViewport,
    containerRef,
    canvasRef,
    selectedId,
    selectedIds,
    editableSelectionIds,
    pointerState,
    picking,
    dragDimensions: dragDimensionInput,
    placement,
    placementController,
    snapPlanPoint,
    snapPlanWallHost,
  })

  usePlanCanvasSceneController({
    props, planProject, viewport, containerRef, canvasRef, selectedIds,
    editableSelectionIds, placement, placementController, pointer: pointerState, picking,
  })

  const surface = usePlanCanvasSurfaceController({
    props, planProject, containerRef, canvasRef, editableSelectionIds,
    placement, pointer: pointerState, picking, status: interactionStatus,
    viewport: viewportController, placementController, pointerController,
    authoringControlsOpen, setAuthoringControlsOpen,
  })
  return {
    ...surface,
    selectedSurveyPoint: surveySelection.selectedSurveyPoint,
    onDismissSurveyPoint: surveySelection.dismissSurveyPoint,
    canvasEvents: {
      ...surface.canvasEvents,
      onPointerDown: (event: ReactPointerEvent<HTMLCanvasElement>) => surveySelection.onPointerDown(event, surface.canvasEvents.onPointerDown),
    },
  }
}

export type PlanCanvasSurfaceModel = Parameters<typeof PlanCanvasSurface>[0]
