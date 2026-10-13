import React, { useRef, useState, useMemo } from 'react'
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
export type { PlanCanvasProps } from './PlanCanvas.types.js'

export const PlanCanvas: React.FC<PlanCanvasProps> = props => {
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
  const planVisibleObjects = useMemo(() => getPlanVisibleObjects(project, planDiscipline), [project, planDiscipline])
  const planProject = useMemo(() => getPlanViewProject(project, planVisibleObjects), [project, planVisibleObjects])

  const { snapModes } = preferences

  // Viewport state: 0.08 zoom = 1000mm -> 80px on screen.
  const viewportController = usePlanCanvasViewport(
    containerRef, planVisibleObjects, navigationViewport, onNavigationViewportChange,
  )
  const { viewport, setViewport } = viewportController
  const placement = usePlanCanvasPlacementSession({ project, displayUnit, activeTool, activation: toolActivation })
  const [authoringControlsOpen, setAuthoringControlsOpen] = useState(true)
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

  const surfaceProps = usePlanCanvasSurfaceController({
    props, planProject, containerRef, canvasRef, editableSelectionIds,
    placement, pointer: pointerState, picking, status: interactionStatus,
    viewport: viewportController, placementController, pointerController,
    authoringControlsOpen, setAuthoringControlsOpen,
  })

  return <PlanCanvasSurface {...surfaceProps} />
}
