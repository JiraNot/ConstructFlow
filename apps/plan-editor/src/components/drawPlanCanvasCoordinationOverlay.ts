import type { ClashSeverity, CoordinationFinding } from '@constructflow/clash-engine'
import type { ProjectDocument } from '@constructflow/project-model'
import { drawCoordinationPrimitives, planCoordinationOverlay } from '../rendering/coordinationOverlay.js'
import { worldToScreen, type ViewportState } from '../viewport/viewportTransform.js'

export function drawPlanCanvasCoordinationOverlay(
  ctx: CanvasRenderingContext2D,
  findings: readonly CoordinationFinding[],
  project: ProjectDocument,
  viewport: ViewportState,
  editableSelectionIds: readonly string[],
  severities?: readonly ClashSeverity[],
  focusSelection = false,
) {
  const focusIds = focusSelection && editableSelectionIds.length ? editableSelectionIds : undefined
  drawCoordinationPrimitives(ctx, planCoordinationOverlay(findings, {
    project: point => worldToScreen([point[0], point[1]], viewport),
    ...(severities ? { severities } : {}),
    ...(focusIds ? { objectIds: focusIds } : {}),
  }), 0.55 + 0.45 * Math.abs(Math.sin(Date.now() / 320)))
}
