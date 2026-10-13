import { useCallback } from 'react'
import { isDoorObject } from '@constructflow/project-model'
import type { ProjectDocument } from '@constructflow/project-model'
import type { PlanCanvasPreferences } from '../app/planCanvasPreferences.mjs'
import { updatePlanCanvasPreference } from '../app/planCanvasPreferences.mjs'
import { usePlanCanvasPlacementSession } from './usePlanCanvasPlacementSession.js'
import { usePlanCanvasPointerState } from './usePlanCanvasPointerState.js'
import type { PlanCanvasProps } from './PlanCanvas.js'
import { nextDoorHanding, usePlanCanvasGlobalShortcuts } from './usePlanCanvasGlobalShortcuts.js'
import { usePlanCanvasToolInteraction } from './usePlanCanvasToolInteraction.js'

interface UsePlanCanvasToolControllerOptions {
  project: ProjectDocument
  planProject: ProjectDocument
  preferences: PlanCanvasPreferences
  onPreferencesChange: PlanCanvasProps['onPreferencesChange']
  activeTool: PlanCanvasProps['activeTool']
  selectedId: string | null
  editableSelectionIds: string[]
  selectedIds: string[]
  placement: ReturnType<typeof usePlanCanvasPlacementSession>
  pointer: ReturnType<typeof usePlanCanvasPointerState>
  onActivateTool?: PlanCanvasProps['onActivateTool']
  onSelectionChange?: PlanCanvasProps['onSelectionChange']
  onSelectObject: PlanCanvasProps['onSelectObject']
  onFlipDoorHanding?: PlanCanvasProps['onFlipDoorHanding']
}

/** Owns tool-step feedback, cancellation, and tool-specific global keyboard actions. */
export function usePlanCanvasToolController({
  project, planProject, preferences, onPreferencesChange, activeTool, selectedId,
  editableSelectionIds, selectedIds, placement, pointer, onActivateTool,
  onSelectionChange, onSelectObject, onFlipDoorHanding,
}: UsePlanCanvasToolControllerOptions) {
  const updatePreference = <K extends keyof PlanCanvasPreferences>(
    key: K,
    value: PlanCanvasPreferences[K] | ((current: PlanCanvasPreferences[K]) => PlanCanvasPreferences[K]),
  ) => onPreferencesChange(current => updatePlanCanvasPreference(current, key, value))

  const selectionHint = editableSelectionIds.some(id => planProject.objects[id]?.object_type === 'interior.cabinet_run')
    ? 'เลือกบิลท์อิน · ลากด้ามสีม่วงเพื่อหมุน โดยคงตำแหน่งและขนาด · Esc ล้างการเลือก'
    : 'เลือก · คลิกเลือกหรือ ลากครอบวัตถุ · Tab สลับวัตถุซ้อน · Esc ล้างการเลือก'

  const interactionState = {
    draggingObject: pointer.draggingObject,
    objectContextMenu: pointer.objectContextMenu,
    stairStartPoint: placement.stairStartPoint,
    gridStartPoint: placement.gridStartPoint,
    gridCopySourceId: placement.gridCopySourceId,
    beamStartNode: placement.beamStartNode,
    wallStartNode: placement.wallStartNode,
    roomSeparatorStart: placement.roomSeparatorStart,
    slabBoundary: placement.slabBoundary,
    tapeMeasure: placement.tapeMeasure,
    calibrationP1: placement.calibrationP1,
    dimensionInputX: placement.dimensionInputX,
    dimensionInputY: placement.dimensionInputY,
    drawLengthMeters: placement.drawLengthMeters,
    drawAngleDegrees: placement.drawAngleDegrees,
    gridSystemError: placement.gridSystemError,
    pipeSystem: placement.pipeSystem,
    fixtureKind: placement.fixtureKind,
    activeSnap: placement.activeSnap,
    activeWallSnap: placement.activeWallSnap,
    lineConstraintLabel: ({ auto: 'อัตโนมัติ: ขนาน/ตั้งฉาก', none: 'อิสระ', parallel: 'ขนาน', perpendicular: 'ตั้งฉาก' } as const)[preferences.lineConstraintMode],
    placementReferenceLabel: ({ centerline: 'กึ่งกลาง', left_face: 'ชิดซ้าย', right_face: 'ชิดขวา' } as const)[preferences.placementReference],
    snapCount: preferences.snapModes.length,
  }

  const interactionStatus = usePlanCanvasToolInteraction({
    activeTool,
    selectionHint,
    interactionState,
    hasSelection: Boolean(selectedId || selectedIds.length),
    onActivateTool,
    onSelectionChange,
    onSelectObject,
    closeObjectContextMenu: () => pointer.setObjectContextMenu(null),
    clearPointerDrag: pointer.clearPointerDrag,
    resetPlacementDrafts: placement.resetPlacementDrafts,
  })

  const selectedDoorId = selectedId && project.objects[selectedId] && isDoorObject(project.objects[selectedId]) ? selectedId : null
  usePlanCanvasGlobalShortcuts({
    activeTool,
    selectedDoorId,
    draggingObject: Boolean(pointer.draggingObject),
    onFlipDoorHanding,
    cancelCurrentPlacement: interactionStatus.cancelCurrentPlacement,
    cycleDoorHanding: () => updatePreference('doorHanding', current => nextDoorHanding(current)),
    cyclePlacementReference: () => updatePreference('placementReference', current => {
      const cycle = { centerline: 'left_face', left_face: 'right_face', right_face: 'centerline' } as const
      return cycle[current]
    }),
  })

  return { ...interactionStatus, selectionHint }
}
