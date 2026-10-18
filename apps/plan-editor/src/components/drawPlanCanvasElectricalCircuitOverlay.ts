import type { ProjectDocument } from '@constructflow/project-model'
import type { ViewportState } from '../viewport/viewportTransform.js'
import { drawElectricalCircuitLogicalLinks, resolveElectricalCircuitLogicalLinks } from '../rendering/electricalCircuitLogicalLinks.js'

export function drawPlanCanvasElectricalCircuitOverlay(
  ctx: CanvasRenderingContext2D,
  project: ProjectDocument,
  selectedIds: readonly string[],
  visibleObjectIds: ReadonlySet<string>,
  viewport: ViewportState,
) {
  const links = resolveElectricalCircuitLogicalLinks(project, selectedIds, visibleObjectIds)
  drawElectricalCircuitLogicalLinks(ctx, links, viewport)
  ctx.canvas.dataset.electricalCircuitLogicalLinkCount = String(links.length)
}
