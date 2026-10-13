import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { DisplayLengthUnit, ProjectDocument } from '@constructflow/project-model'
import { formatLengthMm, isColumnObject, isDoorObject, isFoundationObject, isGridObject, isWallObject, isWindowObject } from '@constructflow/project-model'
import { gridLineEndpoints } from './PlanCanvasGeometry.js'
import { findPlanCanvasEditHandle } from './PlanCanvasEditHandles.js'
import type { PlanCanvasDraggingObject } from './planCanvasInteractionTypes.js'

interface SelectionPointerDownOptions {
  event: React.PointerEvent<HTMLCanvasElement>
  screenPoint: [number, number]
  rawWorld: [number, number]
  displayUnit: DisplayLengthUnit
  planProject: ProjectDocument
  project: ProjectDocument
  selectedIds: string[]
  hoveredId: string | null
  findEditHandle: (screenPoint: [number, number]) => ReturnType<typeof findPlanCanvasEditHandle>
  findCandidates: (point: [number, number], preferWall?: boolean) => string[]
  findHitObject: (point: [number, number], preferWall?: boolean) => string | null
  setCandidates: (ids: string[]) => void
  setHoveredId: Dispatch<SetStateAction<string | null>>
  setDraggingObject: Dispatch<SetStateAction<PlanCanvasDraggingObject | null>>
  setManipulationPreview: Dispatch<SetStateAction<{ project: ProjectDocument; ids: string[]; valid: boolean } | null>>
  setResizeDimensionWidth: (value: string) => void
  setResizeDimensionHeight: (value: string) => void
  setResizeDimensionLength: (value: string) => void
  selectionStartRef: MutableRefObject<[number, number] | null>
  selectionAdditiveRef: MutableRefObject<boolean>
  lastPreviewValidationRef: MutableRefObject<{ at: number; valid: boolean }>
  onSelectionChange?: (ids: string[], primaryId: string | null) => void
  onSelectObject: (id: string | null) => void
}

export function handlePlanCanvasSelectionPointerDown({
  event,
  screenPoint,
  rawWorld,
  displayUnit,
  planProject,
  project,
  selectedIds,
  hoveredId,
  findEditHandle,
  findCandidates,
  findHitObject,
  setCandidates,
  setHoveredId,
  setDraggingObject,
  setManipulationPreview,
  setResizeDimensionWidth,
  setResizeDimensionHeight,
  setResizeDimensionLength,
  selectionStartRef,
  selectionAdditiveRef,
  lastPreviewValidationRef,
  onSelectionChange,
  onSelectObject,
}: SelectionPointerDownOptions) {
  const [screenX, screenY] = screenPoint
  const editHandle = findEditHandle(screenPoint)

  if (editHandle) {
    const editObject = planProject.objects[editHandle.id]
    const editData = editObject?.module_data as Record<string, unknown> | undefined
    const editSize = editData && editObject?.object_type === 'structure.column'
      ? editData.section_mm as [number, number]
      : editData && editObject?.object_type === 'structure.foundation' ? editData.size_mm as [number, number] : undefined
    setResizeDimensionWidth(editSize ? formatLengthMm(Number(editSize[0]), displayUnit) : editHandle.kind === 'opening-edge' ? formatLengthMm(Number(editHandle.openingWidthMm), displayUnit) : '')
    setResizeDimensionHeight(editSize ? formatLengthMm(Number(editSize[1]), displayUnit) : '')
    setResizeDimensionLength(editHandle.startPointMm && editHandle.endPointMm
      ? formatLengthMm(Math.hypot(editHandle.endPointMm[0] - editHandle.startPointMm[0], editHandle.endPointMm[1] - editHandle.startPointMm[1]), displayUnit)
      : editHandle.kind === 'stair-run' && editHandle.stairData
        ? formatLengthMm(Math.max(1, editHandle.stairData.num_risers - 1) * editHandle.stairData.tread_depth_mm, displayUnit)
        : '')
    if (editHandle.kind === 'stair-width' && editHandle.stairData) setResizeDimensionWidth(formatLengthMm(editHandle.stairData.width_mm, displayUnit))
    setDraggingObject({ id: editHandle.id, kind: editHandle.kind, endpointIndex: editHandle.endpointIndex,
      startPointMm: editHandle.startPointMm, endPointMm: editHandle.endPointMm,
      boundaryPointsMm: editHandle.boundaryPointsMm,
      edgeStartMm: editHandle.edgeStartMm,
      edgeNormalMm: editHandle.edgeNormalMm,
      roofSeamEdgeIndices: editHandle.roofSeamEdgeIndices,
      roofSeamGripMm: editHandle.roofSeamGripMm,
      pipeRouteData: editHandle.pipeRouteData, mouldingData: editHandle.mouldingData,
      cabinetData: editHandle.cabinetData,
      stairData: editHandle.stairData,
      centerMm: editHandle.centerMm, sectionMm: editHandle.sectionMm, rotationDeg: editHandle.rotationDeg,
      hostStartMm: editHandle.hostStartMm, hostEndMm: editHandle.hostEndMm,
      openingWidthMm: editHandle.openingWidthMm, openingCenterOffsetMm: editHandle.openingCenterOffsetMm,
      startWorldMm: rawWorld, startScreenPx: [screenX, screenY] })
    setManipulationPreview(null)
    lastPreviewValidationRef.current = { at: 0, valid: true }
    event.currentTarget.setPointerCapture(event.pointerId)
    return
  }

  const candidates = findCandidates(rawWorld, event.shiftKey)
  setCandidates(candidates)
  const hitId = event.shiftKey ? findHitObject(rawWorld, true) : candidates.includes(hoveredId ?? '') ? hoveredId : candidates[0] ?? null
  setHoveredId(hitId)
  if (hitId && event.shiftKey) {
    const next = selectedIds.includes(hitId) ? selectedIds.filter(id => id !== hitId) : [...selectedIds, hitId]
    onSelectionChange?.(next, next.at(-1) ?? null)
    onSelectObject(next.at(-1) ?? null)
  } else if (hitId) {
    const retainGroup = selectedIds.includes(hitId) && selectedIds.length > 1
    if (!retainGroup) {
      onSelectionChange?.([hitId], hitId)
      onSelectObject(hitId)
    }
  } else {
    selectionStartRef.current = screenPoint
    selectionAdditiveRef.current = event.shiftKey
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  if (!hitId || event.shiftKey) return
  const object = project.objects[hitId]
  const startScreenPx: [number, number] = [screenX, screenY]
  const retainGroup = selectedIds.includes(hitId) && selectedIds.length > 1
  const startDrag = (drag: PlanCanvasDraggingObject) => {
    setDraggingObject(drag)
    setManipulationPreview(null)
    lastPreviewValidationRef.current = { at: 0, valid: true }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  if (retainGroup) {
    startDrag({ id: hitId, kind: 'group-move', objectIds: [...selectedIds], startWorldMm: rawWorld, startScreenPx })
  } else if (isColumnObject(object)) {
    startDrag({ id: hitId, kind: 'column', startWorldMm: rawWorld, startScreenPx })
  } else if (isWallObject(object)) {
    startDrag({ id: hitId, kind: 'wall', startWorldMm: rawWorld, startScreenPx })
  } else if (isGridObject(object) && !object.module_data.system_id) {
    const [gridStartMm, gridEndMm] = gridLineEndpoints(object)
    startDrag({ id: hitId, kind: 'grid', startWorldMm: rawWorld, startScreenPx, gridStartMm, gridEndMm })
  } else if (isDoorObject(object) || isWindowObject(object)) {
    const host = project.objects[object.module_data.wall_id]
    if (host && isWallObject(host) && Number.isFinite(object.module_data.width_mm) && object.module_data.width_mm > 0) {
      startDrag({
        id: hitId,
        kind: 'opening-center',
        startWorldMm: rawWorld,
        startScreenPx,
        hostStartMm: [host.module_data.start_point_mm[0], host.module_data.start_point_mm[1]],
        hostEndMm: [host.module_data.end_point_mm[0], host.module_data.end_point_mm[1]],
        openingWidthMm: object.module_data.width_mm,
        openingCenterOffsetMm: object.module_data.offset_along_wall_mm,
      })
    }
  } else {
    startDrag({ id: hitId, kind: 'object-move', startWorldMm: rawWorld, startScreenPx })
  }
}
