import type { ElectricalFixtureModuleData, CircuitModuleData, ProjectDocument } from '@constructflow/project-model'
import { worldToScreen, type ViewportState } from '../viewport/viewportTransform.js'

export interface ElectricalCircuitLogicalLink {
  circuit_id: string
  circuit_mark: string
  panel_point_mm: [number, number]
  device_point_mm: [number, number]
}

/** Returns schematic membership links for a selected panel, limited to devices visible in this plan. */
export function resolveElectricalCircuitLogicalLinks(
  project: ProjectDocument,
  selectedIds: readonly string[],
  visibleObjectIds: ReadonlySet<string> = new Set(Object.keys(project.objects)),
): ElectricalCircuitLogicalLink[] {
  const selectedPanels = selectedIds.flatMap(id => {
    const object = project.objects[id]
    if (!object || object.object_type !== 'electrical.fixture' || object.removed_phase !== null) return []
    const data = object.module_data as unknown as ElectricalFixtureModuleData
    return data.kind === 'panel' && data.location_mm.every(Number.isFinite)
      ? [{ id, data, mark: data.mark || id }]
      : []
  })
  const links: ElectricalCircuitLogicalLink[] = []
  for (const panel of selectedPanels) {
    for (const circuit of Object.values(project.objects)) {
      if (circuit.object_type !== 'electrical.circuit' || circuit.removed_phase !== null) continue
      const circuitData = circuit.module_data as unknown as CircuitModuleData
      if (circuitData.panel_id !== panel.id) continue
      for (const deviceId of circuitData.device_ids) {
        if (!visibleObjectIds.has(deviceId)) continue
        const device = project.objects[deviceId]
        if (!device || device.object_type !== 'electrical.fixture' || device.removed_phase !== null) continue
        const deviceData = device.module_data as unknown as ElectricalFixtureModuleData
        if (deviceData.kind === 'panel' || !deviceData.location_mm.every(Number.isFinite)) continue
        links.push({
          circuit_id: circuit.id,
          circuit_mark: String((circuit.module_data as Record<string, unknown>).mark ?? circuit.id),
          panel_point_mm: [panel.data.location_mm[0], panel.data.location_mm[1]],
          device_point_mm: [deviceData.location_mm[0], deviceData.location_mm[1]],
        })
      }
    }
  }
  return links
}

/** Draws relationship hints only; these direct links are not surveyed cable/conduit geometry. */
export function drawElectricalCircuitLogicalLinks(
  ctx: CanvasRenderingContext2D,
  links: readonly ElectricalCircuitLogicalLink[],
  viewport: ViewportState,
) {
  if (!links.length) return
  ctx.save()
  ctx.strokeStyle = '#7c3aed'
  ctx.fillStyle = '#7c3aed'
  ctx.lineWidth = 1.5
  ctx.globalAlpha = 0.78
  ctx.setLineDash([7, 5])
  for (const link of links) {
    const [panelX, panelY] = worldToScreen(link.panel_point_mm, viewport)
    const [deviceX, deviceY] = worldToScreen(link.device_point_mm, viewport)
    ctx.beginPath()
    ctx.moveTo(panelX, panelY)
    ctx.lineTo(deviceX, deviceY)
    ctx.stroke()
    ctx.setLineDash([])
    for (const [x, y] of [[panelX, panelY], [deviceX, deviceY]]) {
      ctx.beginPath()
      ctx.arc(x, y, 3.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.setLineDash([7, 5])
  }
  ctx.restore()
}
