import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { ComponentProps } from 'react'
import { updatePlanCanvasPreference } from '../app/planCanvasPreferences.mjs'
import { availableFamilies } from '@constructflow/family-engine'
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
  onCommitPlacement: () => void
  onFinishPolygon: () => void
}

/** Builds the view-models for all canvas hints, dimensions, and drawing controls. */
export function usePlanCanvasSurfaceOverlays({
  props, planProject, editableSelectionIds, status, picking, placement, placementDimensions,
  manipulation, pointer, keyboard, displayUnit, dimensionReferenceMode, containerSize,
  canvasRef, authoringControlsOpen, setAuthoringControlsOpen, toggleDimensionReferenceMode, onCommitPlacement, onFinishPolygon,
}: UsePlanCanvasSurfaceOverlaysOptions): OverlayModels {
  const setPreference = <K extends keyof PlanCanvasPreferences>(
    key: K,
    value: PlanCanvasPreferences[K] | ((current: PlanCanvasPreferences[K]) => PlanCanvasPreferences[K]),
  ) => props.onPreferencesChange(current => updatePlanCanvasPreference(current, key, value))

  const hints: OverlayModels['hints'] = {
    activeTool: props.activeTool,
    activeFamilyName: props.activeFamilyId ? availableFamilies(props.project).find(family => family.id === props.activeFamilyId)?.name : undefined,
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
    wallChainActive: Boolean(placement.wallStartNode),
    wallDrawMode: pointer.wallDrawMode,
    onWallDrawModeChange: pointer.setWallDrawMode,
    lineDrawingMode: props.preferences.lineDrawingMode,
    onLineDrawingModeChange: value => setPreference('lineDrawingMode', value),
    wallAngleSnapDeg: props.preferences.wallAngleSnapDeg,
    onWallAngleSnapChange: value => setPreference('wallAngleSnapDeg', value),
    sketchMode: pointer.sketchMode,
    onSketchModeChange: pointer.setSketchMode,
    sketchPointCount: pointer.sketchPoints.length,
    onFinishSketch: () => {
      if (pointer.sketchPoints.length < 2) return
      const result = props.onCommitManipulation([{ name: 'SavePlanSketch', input: { sketch: {
        id: crypto.randomUUID(), level_id: planProject.project.active_level_id, created_phase: planProject.project.active_phase,
        points_mm: pointer.sketchPoints, mode: pointer.sketchMode, closed: false, color: '#334155', width_mm: 2, line_style: 'solid',
      } } }])
      if (result.status === 'success') pointer.setSketchPoints([])
      else props.onManipulationRejected?.(result.errors ?? ['บันทึกเส้นร่างไม่สำเร็จ'])
    },
    measureMode: placement.measureMode,
    measurePointCount: placement.measurePoints.length,
    measureComplete: placement.measureComplete,
    measureError: placement.measureError,
    onMeasureModeChange: placement.setMeasureMode,
    fillStyle: placement.fillStyle,
    onFillStyleChange: placement.setFillStyle,
    onFinishMeasure: () => {
      if (placement.measureMode === 'fill-boundary') {
        if (placement.measurePoints.length < 3) return
        const result = props.onCommitManipulation([{ name: 'SavePlanFill', input: { fill: {
          id: crypto.randomUUID(), level_id: planProject.project.active_level_id,
          created_phase: planProject.project.active_phase, boundary_mm: placement.measurePoints,
          style: placement.fillStyle,
        } } }])
        if (result.status === 'success') placement.setMeasureComplete(true)
        else placement.setMeasureError(result.errors?.[0] ?? 'บันทึก Fill ไม่สำเร็จ')
      } else placement.setMeasureComplete(true)
    },
    onFinishWall: () => {
      props.onActivateTool?.('select')
      canvasRef.current?.focus({ preventScroll: true })
    },
    canFinishPolygon: (['slab', 'slabVoid', 'archFloor', 'ceiling', 'roof'].includes(props.activeTool)
      || (props.activeTool === 'bundle' && props.supplierBundlePlacement?.bundle.visual_type === 'area'))
      && placement.slabBoundary.length >= 3,
    onFinishPolygon,
  }

  const touchControls = typeof window !== 'undefined' && window.matchMedia('(any-pointer: coarse)').matches
  const showManipulationOverlay = props.preferences.realtimeDimensions || touchControls
  const dragDimensions = showManipulationOverlay && manipulation.dimensions && manipulation.activePoint && manipulation.activeDrag ? {
    mode: manipulation.mode,
    displayUnit,
    values: manipulation.values,
    showDimensions: props.preferences.realtimeDimensions,
    onChange: (field: 'x' | 'y' | 'width' | 'height' | 'length' | 'offset', value: string) =>
      field === 'x' || field === 'y'
        ? manipulation.updateMoveDimension(field, value)
        : manipulation.updateResizeDimension(field, value),
    onCommit: manipulation.commitDragDimensions,
    onCancel: manipulation.cancelDragDimensions,
    readout: manipulation.readout,
    style: manipulation.style ?? {},
  } : null

  const dimensionState = placementDimensions
  const placementOverlay: OverlayModels['placement'] = {
    position: props.preferences.realtimeDimensions && dimensionState.supportsPlacementDimensions ? dimensionState.dimensionOverlayPosition : null,
    containerSize,
    displayUnit,
    showX: props.preferences.realtimeDimensions && dimensionState.showXDimension,
    showY: props.preferences.realtimeDimensions && dimensionState.showYDimension,
    hasLineGeometryInput: props.preferences.realtimeDimensions && dimensionState.hasLineGeometryInput,
    allowManualAngle: !(
      (props.activeTool === 'wall' || props.activeTool === 'beam')
      && (props.preferences.lineDrawingMode === 'orthogonal'
        || props.preferences.lineConstraintMode === 'parallel'
        || props.preferences.lineConstraintMode === 'perpendicular')
    ),
    isHostedOpeningPlacement: dimensionState.isHostedOpeningPlacement,
    dimensionReferenceMode,
    dimensionReferences: dimensionState.dimensionReferences,
    dimensionAnchorX: placement.dimensionAnchorX,
    dimensionAnchorY: placement.dimensionAnchorY,
    xDimensionDisplay: dimensionState.xDimensionDisplay,
    yDimensionDisplay: dimensionState.yDimensionDisplay,
    dimensionInputX: placement.dimensionInputX,
    dimensionInputY: placement.dimensionInputY,
    drawLengthMeters: placement.drawLengthMeters,
    drawAngleDegrees: placement.drawAngleDegrees,
    dimensionInputXRef: placement.dimensionInputXRef,
    dimensionInputYRef: placement.dimensionInputYRef,
    drawLengthInputRef: placement.drawLengthInputRef,
    setDimensionKeyboardAxis: placement.setDimensionKeyboardAxis,
    setDimensionAnchorX: placement.setDimensionAnchorX,
    setDimensionAnchorY: placement.setDimensionAnchorY,
    setDimensionInputX: placement.setDimensionInputX,
    setDimensionInputY: placement.setDimensionInputY,
    setDrawLengthMeters: placement.setDrawLengthMeters,
    setDrawAngleDegrees: placement.setDrawAngleDegrees,
    onDimensionKeyDown: keyboard.handleDimensionInputKeyDown,
    onPlacementKeyDown: keyboard.handlePlacementInputKeyDown,
    onCommitPlacement,
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
    lineDrawingMode: props.preferences.lineDrawingMode,
    wallAngleSnapDeg: props.preferences.wallAngleSnapDeg,
    fillStyle: placement.fillStyle,
    open: authoringControlsOpen,
    pipeSystem: placement.pipeSystem,
    fixtureKind: placement.fixtureKind,
    furnitureKind: placement.furnitureKind,
    activeFamilyName: props.activeFamilyId ? availableFamilies(props.project).find(family=>family.id===props.activeFamilyId)?.name : undefined,
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
    onWallAngleSnapChange: value => setPreference('wallAngleSnapDeg', value),
    onFillStyleChange: placement.setFillStyle,
    onSnapModeToggle: mode => setPreference('snapModes', current => current.includes(mode) ? current.filter(value => value !== mode) : [...current, mode]),
    onPlacementKeyDown: keyboard.handlePlacementInputKeyDown,
    onChangeActiveTypeMark: props.onChangeActiveTypeMark,
    onOpenTypeManager: props.onOpenTypeManager,
  }

  return { portalToContextDock: props.contextualDockEnabled !== false, hints, manipulation: dragDimensions, placement: placementOverlay, controls }
}
