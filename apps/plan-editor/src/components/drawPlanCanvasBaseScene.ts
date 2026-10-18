import type { ProjectDocument } from '@constructflow/project-model'
import type { SnapResult } from '@constructflow/snapping-engine'
import type { PlanDiscipline } from '@constructflow/representation-engine'
import type { CalibrationOverlay, PlanCanvasRenderer, PlanLabelVisibility, PlacementGhost, UnderlayConfig } from '../rendering/planRendererTypes.js'
import type { ViewportState } from '../viewport/viewportTransform.js'

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
  renderer: PlanCanvasRenderer
}

export function drawPlanCanvasBaseScene({
  ctx, width, height, project, planProject, viewport, selectedIds, editableSelectionIds, hoveredId, activeSnap,
  ghost, underlay, calibrationOverlay, labelMode, labelVisibility, planDiscipline, manipulationPreview,
  externalManipulationPreview,
  renderer,
}: PlanCanvasBaseSceneOptions) {
  renderer.renderPlanView(ctx, width, height, planProject, viewport, selectedIds, hoveredId, activeSnap, ghost,
    underlay, calibrationOverlay, project, labelMode, labelVisibility, [], planDiscipline)

  ctx.canvas.dataset.electricalCircuitLogicalLinkCount = '0'

  const visibleManipulationPreview = manipulationPreview ?? externalManipulationPreview
  if (visibleManipulationPreview) {
    renderer.drawDirectManipulationGhost(ctx, planProject, visibleManipulationPreview.project, visibleManipulationPreview.ids,
      viewport, visibleManipulationPreview.valid, planDiscipline)
  }
}
