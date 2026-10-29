import type { ProjectDocument } from '@constructflow/project-model'
import type { SnapResult } from '@constructflow/snapping-engine'
import type { PlanDiscipline } from '@constructflow/representation-engine'
import type { CalibrationOverlay, PlanCanvasDisplaySettings, PlanCanvasRenderer, PlanLabelVisibility, PlacementGhost, UnderlayConfig } from '../rendering/planRendererTypes.js'
import type { ProjectPresenceSession } from '../projectPresence.js'
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
  collaborators: readonly ProjectPresenceSession[]
  editableSelectionIds: string[]
  hoveredId: string | null
  activeSnap: SnapResult | null
  ghost: PlacementGhost | null
  underlay?: UnderlayConfig | null
  calibrationOverlay: CalibrationOverlay | null
  labelMode: 'name' | 'name-size'
  labelVisibility: PlanLabelVisibility
  displaySettings: PlanCanvasDisplaySettings
  planDiscipline: PlanDiscipline
  manipulationPreview: ManipulationPreview | null
  externalManipulationPreview?: ManipulationPreview | null
  renderer: PlanCanvasRenderer
}

export function drawPlanCanvasBaseScene({
  ctx, width, height, project, planProject, viewport, selectedIds, collaborators, editableSelectionIds, hoveredId, activeSnap,
  ghost, underlay, calibrationOverlay, labelMode, labelVisibility, displaySettings, planDiscipline, manipulationPreview,
  externalManipulationPreview,
  renderer,
}: PlanCanvasBaseSceneOptions) {
  renderer.renderPlanView(ctx, width, height, planProject, viewport, selectedIds, hoveredId, activeSnap, ghost,
    underlay, calibrationOverlay, project, labelMode, labelVisibility, [], planDiscipline, displaySettings)

  const collaboratorColors = ['#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5']
  for (const collaborator of collaborators) {
    if (!collaborator.cursor_mm) continue
    let hash = 0
    for (const character of collaborator.user_id) hash = (hash * 31 + character.charCodeAt(0)) | 0
    const color = collaboratorColors[Math.abs(hash) % collaboratorColors.length]
    const [x, y] = worldToScreen(collaborator.cursor_mm, viewport)
    ctx.save()
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x - 12, y); ctx.lineTo(x + 12, y); ctx.moveTo(x, y - 12); ctx.lineTo(x, y + 12); ctx.stroke()
    const label = collaborator.user_id
    ctx.font = '12px system-ui, sans-serif'
    const labelWidth = ctx.measureText(label).width
    ctx.globalAlpha = 0.94
    ctx.fillRect(x + 11, y - 24, labelWidth + 12, 20)
    ctx.fillStyle = '#fff'
    ctx.fillText(label, x + 17, y - 10)
    ctx.restore()
  }

  ctx.canvas.dataset.electricalCircuitLogicalLinkCount = '0'

  const visibleManipulationPreview = manipulationPreview ?? externalManipulationPreview
  if (visibleManipulationPreview) {
    renderer.drawDirectManipulationGhost(ctx, planProject, visibleManipulationPreview.project, visibleManipulationPreview.ids,
      viewport, visibleManipulationPreview.valid, planDiscipline)
  }
}
