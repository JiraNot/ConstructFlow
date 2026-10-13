import type { ProjectDocument } from '@constructflow/project-model'
import type { ClashSeverity, CoordinationFinding } from '@constructflow/clash-engine'
import type { SnapResult } from '@constructflow/snapping-engine'
import type { PlanDiscipline } from '@constructflow/representation-engine'
import { drawDirectManipulationGhost, renderPlanView, type CalibrationOverlay, type PlanLabelVisibility, type PlacementGhost, type UnderlayConfig } from '../rendering/planRenderer.js'
import { drawCoordinationPrimitives, planCoordinationOverlay } from '../rendering/coordinationOverlay.js'
import { worldToScreen, type ViewportState } from '../viewport/viewportTransform.js'

interface ManipulationPreview {
  project: ProjectDocument
  ids: string[]
  valid: boolean
}

interface PlanCanvasBaseSceneOptions {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  project: ProjectDocument
  planProject: ProjectDocument
  viewport: ViewportState
  selectedIds: string[]
  editableSelectionIds: string[]
  hoveredId: string | null
  activeSnap: SnapResult | null
  ghost: PlacementGhost | null
  underlay?: UnderlayConfig | null
  calibrationOverlay: CalibrationOverlay | null
  labelMode: 'name' | 'name-size'
  labelVisibility: PlanLabelVisibility
  planDiscipline: PlanDiscipline
  manipulationPreview: ManipulationPreview | null
  externalManipulationPreview?: ManipulationPreview | null
  coordination: readonly CoordinationFinding[]
  coordinationSeverities?: readonly ClashSeverity[]
  coordinationFocusSelection?: boolean
}

export function drawPlanCanvasBaseScene({
  ctx, width, height, project, planProject, viewport, selectedIds, editableSelectionIds, hoveredId, activeSnap,
  ghost, underlay, calibrationOverlay, labelMode, labelVisibility, planDiscipline, manipulationPreview,
  externalManipulationPreview, coordination, coordinationSeverities, coordinationFocusSelection,
}: PlanCanvasBaseSceneOptions) {
  renderPlanView(ctx, width, height, planProject, viewport, selectedIds, hoveredId, activeSnap, ghost,
    underlay, calibrationOverlay, project, labelMode, labelVisibility, [], planDiscipline)

  const visibleManipulationPreview = manipulationPreview ?? externalManipulationPreview
  if (visibleManipulationPreview) {
    drawDirectManipulationGhost(ctx, planProject, visibleManipulationPreview.project, visibleManipulationPreview.ids,
      viewport, visibleManipulationPreview.valid, planDiscipline)
  }

  if (coordination.length) {
    const focusIds = coordinationFocusSelection && editableSelectionIds.length ? editableSelectionIds : undefined
    drawCoordinationPrimitives(ctx, planCoordinationOverlay(coordination, {
      project: point => worldToScreen([point[0], point[1]], viewport),
      ...(coordinationSeverities ? { severities: coordinationSeverities } : {}),
      ...(focusIds ? { objectIds: focusIds } : {}),
    }), 0.55 + 0.45 * Math.abs(Math.sin(Date.now() / 320)))
  }
}
