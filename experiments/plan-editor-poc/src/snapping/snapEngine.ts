// Snapping Engine — Precision CAD Snapping in Millimeters

import { Project, SmartObject } from '../types/model'
import { ViewportState, screenToWorld } from '../viewport/viewportTransform'

export interface SnapResult {
  point_mm: [number, number]
  kind: 'grid_intersection' | 'grid_line' | 'endpoint' | 'center' | 'free'
  target_id?: string
  description: string
}

export function snapPoint(
  rawWorldPoint_mm: [number, number],
  project: Project,
  viewport: ViewportState,
  snapDistanceScreenPx: number = 14
): SnapResult {
  const tolerance_mm = snapDistanceScreenPx / viewport.zoom
  const tolSq = tolerance_mm * tolerance_mm

  const verticalGrids: { id: string; tag: string; pos_mm: number }[] = []
  const horizontalGrids: { id: string; tag: string; pos_mm: number }[] = []

  // Collect active grids
  for (const obj of Object.values(project.objects)) {
    if (obj.object_type === 'structure.grid') {
      const { tag, orientation, position_mm } = obj.module_data
      if (orientation === 'vertical') {
        verticalGrids.push({ id: obj.id, tag, pos_mm: position_mm })
      } else {
        horizontalGrids.push({ id: obj.id, tag, pos_mm: position_mm })
      }
    }
  }

  // 1. Priority: Grid Intersections (e.g. Grid A & 1)
  for (const vg of verticalGrids) {
    for (const hg of horizontalGrids) {
      const ix = vg.pos_mm
      const iy = hg.pos_mm
      const dx = rawWorldPoint_mm[0] - ix
      const dy = rawWorldPoint_mm[1] - iy
      if (dx * dx + dy * dy <= tolSq) {
        return {
          point_mm: [ix, iy],
          kind: 'grid_intersection',
          target_id: `${vg.tag}-${hg.tag}`,
          description: `Grid ${vg.tag} / ${hg.tag}`,
        }
      }
    }
  }

  // 2. Priority: Column Centers
  for (const obj of Object.values(project.objects)) {
    if (obj.object_type === 'structure.column') {
      const [cx, cy] = obj.module_data.location_mm
      const dx = rawWorldPoint_mm[0] - cx
      const dy = rawWorldPoint_mm[1] - cy
      if (dx * dx + dy * dy <= tolSq) {
        return {
          point_mm: [cx, cy],
          kind: 'center',
          target_id: obj.id,
          description: `Column ${obj.id}`,
        }
      }
    }
  }

  // 3. Priority: Wall Endpoints
  for (const obj of Object.values(project.objects)) {
    if (obj.object_type === 'architecture.wall') {
      const { start_mm, end_mm } = obj.module_data
      for (const pt of [start_mm, end_mm]) {
        const dx = rawWorldPoint_mm[0] - pt[0]
        const dy = rawWorldPoint_mm[1] - pt[1]
        if (dx * dx + dy * dy <= tolSq) {
          return {
            point_mm: [pt[0], pt[1]],
            kind: 'endpoint',
            target_id: obj.id,
            description: `Wall End ${obj.id}`,
          }
        }
      }
    }
  }

  // 4. Priority: Single Grid Lines
  for (const vg of verticalGrids) {
    const dx = Math.abs(rawWorldPoint_mm[0] - vg.pos_mm)
    if (dx <= tolerance_mm) {
      return {
        point_mm: [vg.pos_mm, rawWorldPoint_mm[1]],
        kind: 'grid_line',
        target_id: vg.id,
        description: `Grid ${vg.tag}`,
      }
    }
  }
  for (const hg of horizontalGrids) {
    const dy = Math.abs(rawWorldPoint_mm[1] - hg.pos_mm)
    if (dy <= tolerance_mm) {
      return {
        point_mm: [rawWorldPoint_mm[0], hg.pos_mm],
        kind: 'grid_line',
        target_id: hg.id,
        description: `Grid ${hg.tag}`,
      }
    }
  }

  // Default: Snap to 100mm precision grid
  const round100X = Math.round(rawWorldPoint_mm[0] / 100) * 100
  const round100Y = Math.round(rawWorldPoint_mm[1] / 100) * 100
  return {
    point_mm: [round100X, round100Y],
    kind: 'free',
    description: '100mm Grid',
  }
}
