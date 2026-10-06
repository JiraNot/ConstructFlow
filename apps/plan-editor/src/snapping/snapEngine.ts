import { ProjectDocument, isColumnObject, isGridObject, isBeamObject, isWallObject } from '@constructflow/project-model'
import { ViewportState } from '../viewport/viewportTransform.js'

export interface SnapResult {
  point_mm: [number, number]
  kind: 'grid_intersection' | 'grid_line' | 'column_center' | 'beam_node' | 'wall_endpoint' | 'free'
  target_id?: string
  description: string
}

export function snapPoint(
  rawWorldPoint_mm: [number, number],
  project: ProjectDocument,
  viewport: ViewportState,
  snapDistanceScreenPx: number = 16
): SnapResult {
  const tolerance_mm = snapDistanceScreenPx / viewport.zoom
  const tolSq = tolerance_mm * tolerance_mm

  const verticalGrids: { id: string; tag: string; pos_mm: number }[] = []
  const horizontalGrids: { id: string; tag: string; pos_mm: number }[] = []

  // Collect structural grids
  for (const obj of Object.values(project.objects)) {
    if (isGridObject(obj)) {
      const { tag, orientation, position_mm } = obj.module_data
      if (orientation === 'vertical') {
        verticalGrids.push({ id: obj.id, tag, pos_mm: position_mm })
      } else {
        horizontalGrids.push({ id: obj.id, tag, pos_mm: position_mm })
      }
    }
  }

  // 1. Priority: Grid Intersections (e.g. A-1, B-2)
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
    if (isColumnObject(obj)) {
      const [cx, cy] = obj.module_data.location_mm
      const dx = rawWorldPoint_mm[0] - cx
      const dy = rawWorldPoint_mm[1] - cy
      if (dx * dx + dy * dy <= tolSq) {
        return {
          point_mm: [cx, cy],
          kind: 'column_center',
          target_id: obj.id,
          description: `Column ${obj.module_data.mark || obj.id.slice(0, 8)}`,
        }
      }
    }
  }

  // 3. Priority: Beam Endpoints (Nodes)
  for (const obj of Object.values(project.objects)) {
    if (isBeamObject(obj)) {
      const [sx, sy] = obj.module_data.start_point_mm
      const [ex, ey] = obj.module_data.end_point_mm
      const dsSq = (rawWorldPoint_mm[0] - sx) ** 2 + (rawWorldPoint_mm[1] - sy) ** 2
      if (dsSq <= tolSq) {
        return {
          point_mm: [sx, sy],
          kind: 'beam_node',
          target_id: obj.id,
          description: `Beam ${obj.module_data.mark} Node`,
        }
      }
      const deSq = (rawWorldPoint_mm[0] - ex) ** 2 + (rawWorldPoint_mm[1] - ey) ** 2
      if (deSq <= tolSq) {
        return {
          point_mm: [ex, ey],
          kind: 'beam_node',
          target_id: obj.id,
          description: `Beam ${obj.module_data.mark} Node`,
        }
      }
    }
  }

  // 4. Priority: Wall Endpoints
  for (const obj of Object.values(project.objects)) {
    if (isWallObject(obj)) {
      const [sx, sy] = obj.module_data.start_point_mm
      const [ex, ey] = obj.module_data.end_point_mm
      const dsSq = (rawWorldPoint_mm[0] - sx) ** 2 + (rawWorldPoint_mm[1] - sy) ** 2
      if (dsSq <= tolSq) {
        return {
          point_mm: [sx, sy],
          kind: 'wall_endpoint',
          target_id: obj.id,
          description: `Wall ${obj.module_data.mark} Endpoint`,
        }
      }
      const deSq = (rawWorldPoint_mm[0] - ex) ** 2 + (rawWorldPoint_mm[1] - ey) ** 2
      if (deSq <= tolSq) {
        return {
          point_mm: [ex, ey],
          kind: 'wall_endpoint',
          target_id: obj.id,
          description: `Wall ${obj.module_data.mark} Endpoint`,
        }
      }
    }
  }

  // 5. Priority: Single Grid Lines (Project perpendicular)
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

  return {
    point_mm: rawWorldPoint_mm,
    kind: 'free',
    description: 'Free',
  }
}

export interface WallHostSnapResult {
  snapped: boolean
  wall_id: string
  point_mm: [number, number]
  offset_along_wall_mm: number
  wall_start_mm: [number, number]
  wall_end_mm: [number, number]
  wall_thickness_mm: number
  wall_mark: string
  description: string
}

/**
 * Snaps a point along the nearest host wall for Door and Window placement.
 */
export function snapToWallHost(
  rawWorldPoint_mm: [number, number],
  project: ProjectDocument,
  viewport: ViewportState,
  openingWidth_mm: number = 800,
  snapDistanceScreenPx: number = 36
): WallHostSnapResult | null {
  const tolerance_mm = snapDistanceScreenPx / viewport.zoom
  let closest: WallHostSnapResult | null = null
  let minPerpDist = Infinity

  for (const obj of Object.values(project.objects)) {
    if (isWallObject(obj)) {
      const [sx, sy] = obj.module_data.start_point_mm
      const [ex, ey] = obj.module_data.end_point_mm
      const dx = ex - sx
      const dy = ey - sy
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len < 10) continue

      const ux = dx / len
      const uy = dy / len

      // Vector from start to point
      const px = rawWorldPoint_mm[0] - sx
      const py = rawWorldPoint_mm[1] - sy

      // Projection along wall direction
      const t = px * ux + py * uy
      const halfOpening = openingWidth_mm / 2

      // Must be roughly within the wall's longitudinal span
      if (t < -tolerance_mm || t > len + tolerance_mm) continue

      // Clamp t so opening stays within wall endpoints
      const minT = Math.min(halfOpening, len / 2)
      const maxT = Math.max(minT, len - halfOpening)
      const clampedT = Math.max(minT, Math.min(maxT, t))

      // Perpendicular projection point on the wall centerline
      const projX = sx + clampedT * ux
      const projY = sy + clampedT * uy
      const perpDist = Math.hypot(rawWorldPoint_mm[0] - projX, rawWorldPoint_mm[1] - projY)

      const wallTol = tolerance_mm + (obj.module_data.thickness_mm / 2)
      if (perpDist <= wallTol && perpDist < minPerpDist) {
        minPerpDist = perpDist
        closest = {
          snapped: true,
          wall_id: obj.id,
          point_mm: [Math.round(projX), Math.round(projY)],
          offset_along_wall_mm: Math.round(clampedT),
          wall_start_mm: [sx, sy],
          wall_end_mm: [ex, ey],
          wall_thickness_mm: obj.module_data.thickness_mm,
          wall_mark: obj.module_data.mark,
          description: `On Wall ${obj.module_data.mark} (${(clampedT / 1000).toFixed(2)}m)`,
        }
      }
    }
  }

  return closest
}
