import type { ProjectDocument, SmartObject } from '@constructflow/project-model'
import type { SpatialInteraction, SpatialObjectBounds } from './index.js'
import type { Vec3 } from './spatial.js'
import type { ClashSeverity } from './coordinationRules.js'

export interface ClashVerdict {
  interaction: SpatialInteraction
  severity: ClashSeverity
  description: string
}

type Vec2 = [number, number]

/** Separating Axis Theorem (SAT) for 2D convex polygons */
function polygonsIntersect(polyA: Vec2[], polyB: Vec2[]): boolean {
  const polygons = [polyA, polyB]
  for (let i = 0; i < polygons.length; i++) {
    const polygon = polygons[i]
    for (let j = 0; j < polygon.length; j++) {
      const p1 = polygon[j]
      const p2 = polygon[(j + 1) % polygon.length]
      // Perpendicular vector to the edge (normal)
      const normal: Vec2 = [p2[1] - p1[1], p1[0] - p2[0]]

      let minA = Infinity, maxA = -Infinity
      for (const p of polyA) {
        const projected = normal[0] * p[0] + normal[1] * p[1]
        if (projected < minA) minA = projected
        if (projected > maxA) maxA = projected
      }

      let minB = Infinity, maxB = -Infinity
      for (const p of polyB) {
        const projected = normal[0] * p[0] + normal[1] * p[1]
        if (projected < minB) minB = projected
        if (projected > maxB) maxB = projected
      }

      // If we find a gap, the polygons do not intersect
      if (maxA < minB || maxB < minA) {
        return false
      }
    }
  }
  return true
}

function getAABBPolygon2D(bounds: SpatialObjectBounds): Vec2[] {
  const min = bounds.bounds.min
  const max = bounds.bounds.max
  return [
    [min[0], min[1]],
    [max[0], min[1]],
    [max[0], max[1]],
    [min[0], max[1]]
  ]
}

function getDoorSwingPolygon(project: ProjectDocument, doorObj: SmartObject): Vec2[] | undefined {
  const doorData = doorObj.module_data as any
  const wallObj = project.objects[doorData.wall_id]
  if (!wallObj || wallObj.object_type !== 'architecture.wall') return undefined
  const wallData = wallObj.module_data as any
  const start = wallData.start_point_mm
  const end = wallData.end_point_mm
  if (!start || !end) return undefined

  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const length = Math.hypot(dx, dy)
  if (length === 0) return undefined
  
  const ux = dx / length
  const uy = dy / length

  const doorCenter = doorData.location_mm
  const width = doorData.width_mm ?? 900
  const leafWidth = width - 100 // Deduct frame width approximation
  if (leafWidth <= 0) return undefined

  const handing = typeof doorData.handing === 'string' ? doorData.handing : 'left_in'
  const isLeft = handing.startsWith('left')
  const isIn = !handing.endsWith('out')

  // Hinge position
  const hingeOffset = isLeft ? -width / 2 + 50 : width / 2 - 50
  const hingeX = doorCenter[0] + ux * hingeOffset
  const hingeY = doorCenter[1] + uy * hingeOffset

  const polygon: Vec2[] = [[hingeX, hingeY]]
  const segments = 8
  
  const wallAngle = Math.atan2(uy, ux)
  const closedAngle = wallAngle + (isLeft ? 0 : Math.PI)
  const swingAngleDelta = (isLeft === isIn ? 1 : -1) * (Math.PI / 2)

  for (let i = 0; i <= segments; i++) {
    const angle = closedAngle + swingAngleDelta * (i / segments)
    polygon.push([
      hingeX + Math.cos(angle) * leafWidth,
      hingeY + Math.sin(angle) * leafWidth
    ])
  }
  
  return polygon
}

export function detectHardClashes(project: ProjectDocument, interactions: SpatialInteraction[]): ClashVerdict[] {
  const verdicts: ClashVerdict[] = []

  for (const interaction of interactions) {
    // Skip if they are intentionally connected (e.g., door hosted in wall)
    if (interaction.kind === 'intentional_connection') continue

    const objA = project.objects[interaction.first.object_id]
    const objB = project.objects[interaction.second.object_id]
    if (!objA || !objB) continue

    // RULE 1: Door Swing vs Plumbing/Electrical Fixture
    const isDoorA = objA.object_type === 'door_window.door'
    const isDoorB = objB.object_type === 'door_window.door'
    const isFixtureA = objA.object_type.endsWith('.fixture') || objA.object_type.includes('cabinet')
    const isFixtureB = objB.object_type.endsWith('.fixture') || objB.object_type.includes('cabinet')

    if ((isDoorA && isFixtureB) || (isDoorB && isFixtureA)) {
      const doorObj = isDoorA ? objA : objB
      const fixtureObj = isDoorA ? objB : objA
      const fixtureBounds = isDoorA ? interaction.second : interaction.first

      const swingPoly = getDoorSwingPolygon(project, doorObj)
      const fixturePoly = getAABBPolygon2D(fixtureBounds)

      if (swingPoly && fixturePoly && polygonsIntersect(swingPoly, fixturePoly)) {
        verdicts.push({
          interaction,
          severity: 'clearance',
          description: `วงสวิงบานประตู ${(doorObj.module_data as any).mark ?? doorObj.id} เปิดชนหรือกีดขวางสุขภัณฑ์/เฟอร์นิเจอร์ ${(fixtureObj.module_data as any).mark ?? fixtureObj.id}`
        })
      }
    }
    
    // RULE 2: MEP Duct vs Structural Beam (Hard Clash)
    const isMepA = objA.object_type.startsWith('hvac.') || objA.object_type.startsWith('plumbing.pipe') || objA.object_type.startsWith('electrical.tray')
    const isMepB = objB.object_type.startsWith('hvac.') || objB.object_type.startsWith('plumbing.pipe') || objB.object_type.startsWith('electrical.tray')
    const isStructureA = objA.object_type === 'structure.beam' || objA.object_type === 'structure.column'
    const isStructureB = objB.object_type === 'structure.beam' || objB.object_type === 'structure.column'

    if ((isMepA && isStructureB) || (isMepB && isStructureA)) {
      if (interaction.kind === 'overlap_candidate' && interaction.overlap_mm.every(d => d > 1.0)) {
        const mepObj = isMepA ? objA : objB
        const structObj = isMepA ? objB : objA
        verdicts.push({
          interaction,
          severity: 'hard',
          description: `ท่อระบบ (${(mepObj.module_data as any)?.mark ?? 'Mep'}) ชนทะลุโครงสร้าง (${(structObj.module_data as any)?.mark ?? structObj.object_type})`
        })
      }
    }
  }

  return verdicts
}
