import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { ComponentProps } from 'react'
import { updatePlanCanvasPreference } from '../app/planCanvasPreferences.mjs'
import type { PlanCanvasPreferences } from '../app/planCanvasPreferences.mjs'
import type { PlanCanvasProps } from './PlanCanvas.types.js'
import { PlanCanvasInteractionOverlays } from './PlanCanvasInteractionOverlays.js'
import { hasPlanCanvasSelectionGrip } from '../planCanvasSelectionHint.mjs'
import type { usePlanCanvasToolInteraction } from './usePlanCanvasToolInteraction.js'
import type { usePlanCanvasPicking } from './usePlanCanvasPicking.js'
import type { usePlanCanvasPlacementSession } from './usePlanCanvasPlacementSession.js'
import type { usePlanCanvasPlacementDimensions } from './usePlanCanvasPlacementDimensions.js'
import type { usePlanCanvasManipulationInteractions } from './usePlanCanvasManipulationInteractions.js'
import type { usePlanCanvasPointerState } from './usePlanCanvasPointerState.js'
import type { usePlanCanvasPlacementKeyboard } from './usePlanCanvasPlacementKeyboard.js'

type OverlayModels = ComponentProps<typeof PlanCanvasInteractionOverlays>

interface UsePlanCanvasSurfaceOverlaysOptions {
  props: PlanCanvasProps
  planProject: PlanCanvasProps['project']
  editableSelectionIds: string[]
  status: ReturnType<typeof usePlanCanvasToolInteraction>
  picking: ReturnType<typeof usePlanCanvasPicking>
  placement: ReturnType<typeof usePlanCanvasPlacementSession>
  placementDimensions: ReturnType<typeof usePlanCanvasPlacementDimensions>
  manipulation: ReturnType<typeof usePlanCanvasManipulationInteractions>
  pointer: ReturnType<typeof usePlanCanvasPointerState>
  keyboard: ReturnType<typeof usePlanCanvasPlacementKeyboard>
  displayUnit: PlanCanvasProps['displayUnit']
  dimensionReferenceMode: PlanCanvasPreferences['dimensionReferenceMode']
  containerSize: { width: number; height: number }
  canvasRef: RefObject<HTMLCanvasElement | null>
  authoringControlsOpen: boolean
  setAuthoringControlsOpen: Dispatch<SetStateAction<boolean>>
  toggleDimensionReferenceMode: () => void
  onFinishPolygon: () => void
}

/** Builds the view-models for all canvas hints, dimensions, and drawing controls. */
export function usePlanCanvasSurfaceOverlays({
  props, planProject, editableSelectionIds, status, picking, placement, placementDimensions,
  manipulation, pointer, keyboard, displayUnit, dimensionReferenceMode, containerSize,
  canvasRef, authoringControlsOpen, setAuthoringControlsOpen, toggleDimensionReferenceMode, onFinishPolygon,
}: UsePlanCanvasSurfaceOverlaysOptions): OverlayModels {
  const setPreference = <K extends keyof PlanCanvasPreferences>(
    key: K,
    value: PlanCanvasPreferences[K] | ((current: PlanCanvasPreferences[K]) => PlanCanvasPreferences[K]),
  ) => props.onPreferencesChange(current => updatePlanCanvasPreference(current, key, value))

  const hints: OverlayModels['hints'] = {
    activeTool: props.activeTool,
    showSelectionHandleHint: hasPlanCanvasSelectionGrip(planProject, editableSelectionIds),
    placementStatus: status.placementStatus,
    placementHint: status.placementHint,
    escapeLabel: status.escapeLabel,
    pickCandidates: picking.pickCandidates,
    hoveredId: picking.hoveredId,
    project: planProject,
    onCyclePick: picking.cyclePick,
    onHoverChange: picking.chooseCandidate,
    onSelectionChange: props.onSelectionChange,
    onSelectObject: props.onSelectObject,
    onCancel: () => {
      status.cancelCurrentPlacement()
      canvasRef.current?.focus({ preventScroll: true })
    },
    canFinishPolygon: ['slab', 'slabVoid', 'archFloor', 'ceiling', 'roof'].includes(props.activeTool) && placement.slabBoundary.length >= 3,
    onFinishPolygon,
  }

  const dragDimensions = manipulation.dimensions && pointer.dragPreviewPoint && pointer.draggingObject ? {
    mode: manipulation.mode,
    displayUnit,
    values: manipulation.values,
    onChange: (field: 'x' | 'y' | 'width' | 'height' | 'length' | 'offset', value: string) =>
      field === 'x' || field === 'y'
        ? manipulation.updateMoveDimension(field, value)
        : manipulation.updateResizeDimension(field, value),
    onCommit: manipulation.commitDragDimensions,
    onCancel: () => {
      status.cancelCurrentPlacement()
      canvasRef.current?.focus({ preventScroll: true })
    },
    readout: manipulation.readout,
    style: manipulation.style ?? {},
  } : null

  const dimensionState = placementDimensions
  const placementOverlay: OverlayModels['placement'] = {
    position: dimensionState.supportsPlacementDimensions ? dimensionState.dimensionOverlayPosition : null,
    containerSize,
    displayUnit,
    showX: dimensionState.showXDimension,
    showY: dimensionState.showYDimension,
    hasLineGeometryInput: dimensionState.hasLineGeometryInput,
    isHostedOpeningPlacement: dimensionState.isHostedOpeningPlacement,
    dimensionReferenceMode,
    dimensionReferences: dimensionState.dimensionReferences,
    dimensionAnchorX: placement.dimensionAnchorX,
    dimensionAnchorY: placement.dimensionAnchorY,
    xDimensionDisplay: dimensionState.xDimensionDisplay,
    yDimensionDisplay: dimensionState.yDimensionDisplay,
    drawLengthMeters: placement.drawLengthMeters,
    drawAngleDegrees: placement.drawAngleDegrees,
    dimensionInputXRef: placement.dimensionInputXRef,
    dimensionInputYRef: placement.dimensionInputYRef,
    setDimensionKeyboardAxis: placement.setDimensionKeyboardAxis,
    setDimensionAnchorX: placement.setDimensionAnchorX,
    setDimensionAnchorY: placement.setDimensionAnchorY,
    setDimensionInputX: placement.setDimensionInputX,
    setDimensionInputY: placement.setDimensionInputY,
    setDrawLengthMeters: placement.setDrawLengthMeters,
    setDrawAngleDegrees: placement.setDrawAngleDegrees,
    onDimensionKeyDown: keyboard.handleDimensionInputKeyDown,
    onPlacementKeyDown: keyboard.handlePlacementInputKeyDown,
    onToggleDimensionReference: toggleDimensionReferenceMode,
  }

  const roof = {
    shape: placement.roofShape,
    slopeDeg: placement.roofSlopeDeg,
    thicknessMm: placement.roofThicknessMm,
    elevationOffsetMm: placement.roofElevationOffsetMm,
    material: placement.roofMaterial,
  }
  const controls: OverlayModels['controls'] = {
    project: props.project,
    activeTool: props.activeTool,
    displayUnit,
    preferences: props.preferences,
    open: authoringControlsOpen,
    pipeSystem: placement.pipeSystem,
    fixtureKind: placement.fixtureKind,
    furnitureKind: placement.furnitureKind,
    activeFamilyName: props.project.families?.find(family=>family.id===props.activeFamilyId)?.name,
    roof,
    stairOptions: placement.stairOptions,
    stairError: placement.stairError,
    gridSequenceStyle: placement.gridSequenceStyle,
    gridStartPoint: placement.gridStartPoint,
    gridSystem: {
      xIntervals: placement.gridXIntervals,
      yIntervals: placement.gridYIntervals,
      xFirstTag: placement.gridXFirstTag,
      yFirstTag: placement.gridYFirstTag,
      error: placement.gridSystemError,
    },
    lineReferenceDescription: (props.activeTool === 'beam' ? placement.beamStartNode?.reference : placement.wallStartNode?.reference)?.description,
    activeTypeMarks: {
      column: props.activeColumnTypeMark,
      foundation: props.activeFoundationTypeMark,
      beam: props.activeBeamTypeMark,
      wall: props.activeWallTypeMark,
      door: props.activeDoorTypeMark,
      window: props.activeWindowTypeMark,
      slab: props.activeSlabTypeMark,
      roof: props.activeRoofTypeMark,
    },
    onOpenChange: setAuthoringControlsOpen,
    onPipeSystemChange: placement.setPipeSystem,
    onFixtureKindChange: placement.setFixtureKind,
    onFurnitureKindChange: placement.setFurnitureKind,
    onRoofChange: updater => {
      const next = updater(roof)
      placement.setRoofShape(next.shape)
      placement.setRoofSlopeDeg(next.slopeDeg)
      placement.setRoofThicknessMm(next.thicknessMm)
      placement.setRoofElevationOffsetMm(next.elevationOffsetMm)
      placement.setRoofMaterial(next.material)
    },
    onStairOptionsChange: placement.setStairOptions,
    onGridSequenceStyleChange: placement.setGridSequenceStyle,
    onGridIntervalsChange: (axis, value) => {
      if (axis === 'x') placement.setGridXIntervals(value)
      else placement.setGridYIntervals(value)
      placement.setGridSystemError('')
    },
    onGridFirstTagChange: (axis, value) => axis === 'x' ? placement.setGridXFirstTag(value) : placement.setGridYFirstTag(value),
    onPlacementReferenceChange: value => setPreference('placementReference', value),
    onLineConstraintModeChange: value => setPreference('lineConstraintMode', value),
    onSnapModeToggle: mode => setPreference('snapModes', current => current.includes(mode) ? current.filter(value => value !== mode) : [...current, mode]),
    onPlacementKeyDown: keyboard.handlePlacementInputKeyDown,
    onChangeActiveTypeMark: props.onChangeActiveTypeMark,
    onOpenTypeManager: props.onOpenTypeManager,
  }

  return { hints, manipulation: dragDimensions, placement: placementOverlay, controls }
}
