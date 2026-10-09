import { resolveCatalogType, type ProjectDocument, type Phase } from '@constructflow/project-model'
import { constructionOutputs } from '@constructflow/domain-providers'

export type TakeoffCostCenter = 'demolition_site_prep' | 'new_construction' | 'remodeling_joint_treatment'
type ClassificationCostCenter = TakeoffCostCenter | 'existing_to_remain'
export type QuantityUnit = 'item' | 'm' | 'm2' | 'm3' | 'kg'

export interface TakeoffLine {
  id: string
  phase: Phase
  cost_center: TakeoffCostCenter
  object_type: string
  type_id?: string
  mark: string
  material?: string
  unit: QuantityUnit
  quantity: number
  source_object_ids: string[]
  formula: string
}

export interface TakeoffReport {
  project_id: string
  schema_version: 1
  lines: TakeoffLine[]
  totals_by_cost_center: Record<TakeoffCostCenter, Record<QuantityUnit, number>>
  warnings: string[]
}

interface TakeoffClassification {
  phase: Phase
  cost_center: ClassificationCostCenter
  object_type?: string
  mark?: string
}

type Data = Record<string, unknown>
const mmToM = (value: number): number => value / 1000
const mm2ToM2 = (value: number): number => value / 1_000_000
const mm3ToM3 = (value: number): number => value / 1_000_000_000
const finitePositive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0
const finiteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

function finiteTuple(value: unknown, length: number): number[] | undefined {
  if (!Array.isArray(value) || value.length !== length) return undefined
  const entries: unknown[] = value
  return entries.every(finiteNumber) ? entries as number[] : undefined
}

function positiveTuple(value: unknown, length: number): number[] | undefined {
  const entries = finiteTuple(value, length)
  return entries?.every(value => value > 0) ? entries : undefined
}

type Point2 = [number, number]

function polygonRing(value: unknown): Point2[] | undefined {
  if (!Array.isArray(value) || value.length < 3) return undefined
  const points = value.map(point => finiteTuple(point, 2))
  if (points.some(point => !point)) return undefined
  const ring = points as Point2[]
  if (ring.length > 3 && Math.hypot(ring[0][0] - ring.at(-1)![0], ring[0][1] - ring.at(-1)![1]) <= 1e-8) ring.pop()
  if (ring.length < 3 || ring.some((point, index) => {
    const next = ring[(index + 1) % ring.length]
    return Math.hypot(point[0] - next[0], point[1] - next[1]) <= 1e-8
  })) return undefined
  return ring
}

function signedAreaMm2(ring: Point2[]): number {
  return ring.reduce((sum, point, index) => {
    const next = ring[(index + 1) % ring.length]
    return sum + point[0] * next[1] - next[0] * point[1]
  }, 0) / 2
}

function polygonAreaMm2(value: unknown): number | undefined {
  const ring = polygonRing(value)
  if (!ring || !isSimpleRing(ring)) return undefined
  const area = Math.abs(signedAreaMm2(ring))
  return Number.isFinite(area) ? area : undefined
}

function orient(a: Point2, b: Point2, c: Point2): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
}

function pointOnSegment(point: Point2, a: Point2, b: Point2, epsilon = 1e-7): boolean {
  if (Math.abs(orient(a, b, point)) > epsilon * Math.max(1, Math.hypot(b[0] - a[0], b[1] - a[1]))) return false
  return point[0] >= Math.min(a[0], b[0]) - epsilon && point[0] <= Math.max(a[0], b[0]) + epsilon
    && point[1] >= Math.min(a[1], b[1]) - epsilon && point[1] <= Math.max(a[1], b[1]) + epsilon
}

function segmentsIntersect(a: Point2, b: Point2, c: Point2, d: Point2): boolean {
  const abC = orient(a, b, c), abD = orient(a, b, d), cdA = orient(c, d, a), cdB = orient(c, d, b)
  const sign = (value: number) => Math.abs(value) <= 1e-7 ? 0 : Math.sign(value)
  if (sign(abC) * sign(abD) < 0 && sign(cdA) * sign(cdB) < 0) return true
  return (sign(abC) === 0 && pointOnSegment(c, a, b)) || (sign(abD) === 0 && pointOnSegment(d, a, b))
    || (sign(cdA) === 0 && pointOnSegment(a, c, d)) || (sign(cdB) === 0 && pointOnSegment(b, c, d))
}

function isSimpleRing(ring: Point2[]): boolean {
  if (ring.length < 3 || Math.abs(signedAreaMm2(ring)) <= 1e-8) return false
  for (let i = 0; i < ring.length; i++) {
    const iNext = (i + 1) % ring.length
    for (let j = i + 1; j < ring.length; j++) {
      const jNext = (j + 1) % ring.length
      if (i === j || iNext === j || jNext === i) continue
      if (segmentsIntersect(ring[i], ring[iNext], ring[j], ring[jNext])) return false
    }
  }
  return true
}

function strictlyInsideRing(point: Point2, ring: Point2[]): boolean {
  for (let i = 0; i < ring.length; i++) if (pointOnSegment(point, ring[i], ring[(i + 1) % ring.length])) return false
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}

function ringsIntersect(a: Point2[], b: Point2[]): boolean {
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++)
    if (segmentsIntersect(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true
  return false
}

function netBoundaryAreaMm2(data: Data, objectId: string, warnings: string[]): number | undefined {
  const boundary = polygonRing(data.boundary_mm)
  const grossArea = boundary && isSimpleRing(boundary) ? Math.abs(signedAreaMm2(boundary)) : undefined
  if (!boundary || !grossArea || grossArea <= 0) {
    warnings.push(`${objectId}: architectural boundary is missing, self-intersecting, or invalid; quantity was omitted`)
    return undefined
  }
  let voidArea = 0
  const voids = data.voids_mm ?? []
  if (!Array.isArray(voids)) {
    warnings.push(`${objectId}: boundary voids are invalid; quantity was omitted`)
    return undefined
  }
  const rings: Point2[][] = []
  for (const rawVoid of voids) {
    const ring = polygonRing(rawVoid)
    const area = ring && isSimpleRing(ring) ? Math.abs(signedAreaMm2(ring)) : undefined
    if (!ring || !area || area <= 0) {
      warnings.push(`${objectId}: a boundary void is self-intersecting or invalid; quantity was omitted`)
      return undefined
    }
    voidArea += area
    if (voidArea > grossArea + 1e-6) {
      warnings.push(`${objectId}: boundary void area exceeds the gross area; quantity was omitted`)
      return undefined
    }
    if (ring.some(point => !strictlyInsideRing(point, boundary)) || ringsIntersect(ring, boundary)) {
      warnings.push(`${objectId}: a boundary void is not fully contained within its boundary; quantity was omitted`)
      return undefined
    }
    if (rings.some(existing => ringsIntersect(ring, existing) || strictlyInsideRing(ring[0], existing) || strictlyInsideRing(existing[0], ring))) {
      warnings.push(`${objectId}: boundary voids overlap or contain one another; quantity was omitted`)
      return undefined
    }
    rings.push(ring)
  }
  return grossArea - voidArea
}

function valueFor(project: ProjectDocument, objectType: string, data: Data, field: string): unknown {
  const rawOverrides = data.instance_overrides
  const overrides = rawOverrides && typeof rawOverrides === 'object' && !Array.isArray(rawOverrides)
    ? rawOverrides as Record<string, unknown>
    : undefined
  const override = overrides?.[field]
  if (override !== undefined) return override
  if (data[field] !== undefined) return data[field]
  const reference = typeof data.type_id === 'string' ? data.type_id : typeof data.mark === 'string' ? data.mark : undefined
  return resolveCatalogType(project, objectType, reference)?.parameters[field]
}

function phaseAndCostCenter(created: Phase, removed: 'demolition' | null): { phase: Phase; cost_center: ClassificationCostCenter } {
  if (created === 'demolition') return { phase: 'demolition', cost_center: 'demolition_site_prep' }
  if (removed === 'demolition') return { phase: 'demolition', cost_center: 'demolition_site_prep' }
  if (created === 'new_construction') return { phase: 'new_construction', cost_center: 'new_construction' }
  return { phase: 'existing', cost_center: 'existing_to_remain' }
}

function lineKey(line: Omit<TakeoffLine, 'id' | 'quantity' | 'source_object_ids'>): string {
  return [line.phase, line.cost_center, line.object_type, line.type_id ?? line.mark, line.unit, line.material ?? '', line.formula].join('|')
}

/** Deterministic quantity-only takeoff for the supported standalone vertical slice. */
export function calculateTakeoff(project: ProjectDocument): TakeoffReport {
  const lines = new Map<string, TakeoffLine>()
  const warnings: string[] = []
  const add = (
    object: ProjectDocument['objects'][string], unit: QuantityUnit, quantity: number, formula: string,
    material?: string, classification?: TakeoffClassification,
  ) => {
    if (!Number.isFinite(quantity) || quantity < 0) {
      warnings.push(`${object.id}: quantity is invalid and was omitted`)
      return
    }
    const data = object.module_data as Data
    const defaults = phaseAndCostCenter(object.created_phase, object.removed_phase)
    const costCenter = classification?.cost_center ?? defaults.cost_center
    // Existing-to-remain objects are model context, not priced work. They only
    // enter the takeoff when classified as demolition or joint-treatment work.
    if (costCenter === 'existing_to_remain') return
    const typeId = typeof data.type_id === 'string' ? data.type_id : undefined
    const dimensions = {
      phase: classification?.phase ?? defaults.phase,
      cost_center: costCenter,
      object_type: classification?.object_type ?? object.object_type,
      type_id: typeId,
      mark: classification?.mark ?? (typeof data.mark === 'string' && data.mark.trim() ? data.mark : object.object_type),
      material: material ?? (typeof data.material === 'string' ? data.material : undefined), unit, formula,
    }
    const key = lineKey(dimensions)
    const line = lines.get(key) ?? {
      id: key,
      ...dimensions,
      quantity: 0,
      source_object_ids: [],
    }
    line.quantity += quantity
    line.source_object_ids.push(object.id)
    lines.set(key, line)
  }

  const objects = Object.values(project.objects)
  for (const object of objects) {
    const data = object.module_data as Data
    switch (object.object_type) {
      case 'structure.column': {
        const section = positiveTuple(valueFor(project, object.object_type, data, 'section_mm'), 2)
        const width = section?.[0]
        const depth = section?.[1]
        const baseLevelId = typeof data.base_level_id === 'string' ? data.base_level_id : undefined
        const topLevelId = typeof data.top_level_id === 'string' ? data.top_level_id : undefined
        const base = finiteNumber(data.base_elevation_mm) ? data.base_elevation_mm : project.levels.find(level => level.id === baseLevelId)?.elevation_mm ?? 0
        const top = finiteNumber(data.top_elevation_mm) ? data.top_elevation_mm : project.levels.find(level => level.id === topLevelId)?.elevation_mm ?? base + 3000
        const height = top - base
        if (finitePositive(width) && finitePositive(depth) && finitePositive(height)) {
          add(object, 'm3', mm3ToM3(width * depth * height), `${width}×${depth}×${height} mm`, typeof data.material === 'string' ? data.material : undefined)
        } else warnings.push(`${object.id}: column section or height is missing/invalid`)
        break
      }
      case 'structure.foundation': {
        const size = positiveTuple(valueFor(project, object.object_type, data, 'size_mm'), 3)
        const width = size?.[0]
        const length = size?.[1]
        const thickness = size?.[2]
        if (finitePositive(width) && finitePositive(length) && finitePositive(thickness)) {
          add(object, 'm3', mm3ToM3(width * length * thickness), `${width}×${length}×${thickness} mm`, typeof data.material === 'string' ? data.material : undefined)
        } else warnings.push(`${object.id}: foundation size is missing/invalid`)
        if (valueFor(project, object.object_type, data, 'foundation_type') === 'pile_cap') {
          const rawOffsets = valueFor(project, object.object_type, data, 'pile_offsets_mm')
          const offsets = Array.isArray(rawOffsets) ? rawOffsets.map(offset => finiteTuple(offset, 2)).filter((offset): offset is number[] => !!offset) : []
          const rawPileType = valueFor(project, object.object_type, data, 'pile_type')
          const pileType = typeof rawPileType === 'string' ? rawPileType : undefined
          const pileLength = valueFor(project, object.object_type, data, 'pile_length_mm')
          if (offsets.length >= 2 && pileType) {
            add(object, 'item', offsets.length, `${offsets.length} × ${pileType} pile heads; length not specified`, pileType)
            if (!finitePositive(pileLength)) warnings.push(`${object.id}: ${pileType} pile length is not assigned; takeoff reports count only.`)
          } else warnings.push(`${object.id}: pile-cap layout or pile type is missing; pile quantities are omitted.`)
        }
        break
      }
      case 'structure.beam': {
        const section = positiveTuple(valueFor(project, object.object_type, data, 'section_mm'), 2)
        const width = section?.[0]
        const depth = section?.[1]
        const length = finitePositive(data.span_mm) ? data.span_mm : finitePositive(data.length_mm) ? data.length_mm : 0
        if (finitePositive(width) && finitePositive(depth) && finitePositive(length)) {
          add(object, 'm3', mm3ToM3(width * depth * length), `${width}×${depth} mm × ${length} mm`, typeof data.material === 'string' ? data.material : undefined)
        } else warnings.push(`${object.id}: beam section or length is missing/invalid`)
        break
      }
      case 'architecture.wall': {
        const thickness = valueFor(project, object.object_type, data, 'thickness_mm')
        const masonryThickness = valueFor(project, object.object_type, data, 'masonry_thickness_mm')
        const insidePlasterThickness = valueFor(project, object.object_type, data, 'plaster_inside_thickness_mm')
        const outsidePlasterThickness = valueFor(project, object.object_type, data, 'plaster_outside_thickness_mm')
        const height = valueFor(project, object.object_type, data, 'height_mm')
        const start = finiteTuple(data.start_point_mm, 3)
        const end = finiteTuple(data.end_point_mm, 3)
        const computedLength = start && end ? Math.hypot(end[0] - start[0], end[1] - start[1]) : 0
        const length = finitePositive(data.length_mm) ? data.length_mm : computedLength
        if (!finitePositive(thickness) || !finitePositive(height) || !finitePositive(length)) {
          warnings.push(`${object.id}: wall thickness, height or length is missing/invalid`)
          break
        }
        let netArea = mm2ToM2(length * height)
        let openingArea = 0
        for (const opening of objects) {
          if (opening.object_type !== 'door_window.door' && opening.object_type !== 'door_window.window') continue
          const openingData = opening.module_data as Data
          if (openingData.wall_id !== object.id) continue
          const width = valueFor(project, opening.object_type, openingData, 'width_mm')
          const openingHeight = valueFor(project, opening.object_type, openingData, 'height_mm')
          if (finitePositive(width) && finitePositive(openingHeight)) openingArea += mm2ToM2(width * openingHeight)
          else warnings.push(`${opening.id}: opening dimensions are missing/invalid`)
        }
        if (openingArea > netArea) warnings.push(`${object.id}: hosted opening area exceeds gross wall area`)
        netArea = Math.max(0, netArea - openingArea)
        const material = typeof data.material === 'string' ? data.material : undefined
        const coreThickness = finitePositive(masonryThickness) ? masonryThickness : thickness
        add(object, 'm2', netArea, `net masonry area: ${length}×${height} − hosted openings`, material)
        add(object, 'm3', mm3ToM3(netArea * coreThickness * 1_000_000), `net masonry area × ${coreThickness} mm`, material)
        if (finitePositive(insidePlasterThickness)) {
          const insideMaterial = valueFor(project, object.object_type, data, 'plaster_inside_material')
          add(object, 'm2', netArea, `inside plaster face (${insidePlasterThickness} mm)`, typeof insideMaterial === 'string' ? insideMaterial : 'cement_plaster')
        }
        if (finitePositive(outsidePlasterThickness)) {
          const outsideMaterial = valueFor(project, object.object_type, data, 'plaster_outside_material')
          add(object, 'm2', netArea, `outside plaster face (${outsidePlasterThickness} mm)`, typeof outsideMaterial === 'string' ? outsideMaterial : 'cement_plaster')
        }
        if (Array.isArray(data.interface_treatments)) {
          for (const rawTreatment of data.interface_treatments) {
            if (!rawTreatment || typeof rawTreatment !== 'object' || Array.isArray(rawTreatment)) {
              warnings.push(`${object.id}: interface treatment is malformed and was omitted`)
              continue
            }
            const treatment = rawTreatment as Record<string, unknown>
            const kind = treatment.kind
            const targetIds = Array.isArray(treatment.target_object_ids) ? treatment.target_object_ids : []
            if (!['chemical_dowel_epoxy', 'expansion_joint_sealant', 'roof_flashing'].includes(String(kind)) || targetIds.length === 0 || targetIds.some(targetId => typeof targetId !== 'string')) {
              warnings.push(`${object.id}: interface treatment kind or target walls are invalid and quantity was omitted`)
              continue
            }
            if (object.removed_phase === 'demolition') continue
            const targetWalls = targetIds.map(targetId => project.objects[targetId as string])
            if (targetWalls.some(target => !target || target.object_type !== 'architecture.wall' || target.created_phase !== 'new_construction' || target.removed_phase === 'demolition')) {
              warnings.push(`${object.id}: interface treatment ${String(kind)} has a demolished or missing target wall; quantity was omitted`)
              continue
            }
            const lengths = targetWalls.map(target => {
              const targetData = target!.module_data as Data
              return valueFor(project, 'architecture.wall', targetData, 'height_mm')
            })
            if (!lengths.every(finitePositive)) {
              warnings.push(`${object.id}: interface treatment ${String(kind)} target wall height is missing/invalid`)
              continue
            }
            const treatmentLengthMm = lengths.reduce<number>((sum, value) => sum + value, 0)
            add(object, 'm', mmToM(treatmentLengthMm), `${lengths.map(length => String(length)).join(' + ')} mm interface height from target wall UUIDs`,
              typeof treatment.material === 'string' && treatment.material.trim() ? treatment.material : 'joint_sealant',
              { phase: 'new_construction', cost_center: 'remodeling_joint_treatment', object_type: 'architecture.joint_treatment', mark: String(kind) })
          }
        }
        break
      }
      case 'architecture.floor':
      case 'architecture.ceiling': {
        if (data.follows_room_boundary === true && data.room_boundary_status === 'unclosed') {
          warnings.push(`${object.id}: room boundary is unclosed; ${object.object_type === 'architecture.floor' ? 'floor' : 'ceiling'} quantity was omitted pending review`)
          break
        }
        const netAreaMm2 = netBoundaryAreaMm2(data, object.id, warnings)
        if (netAreaMm2 === undefined) break
        const netArea = mm2ToM2(netAreaMm2)
        const isFloor = object.object_type === 'architecture.floor'
        if (isFloor && Array.isArray(data.finish_layers) && data.finish_layers.length) {
          for (const [index, rawLayer] of data.finish_layers.entries()) {
            if (!rawLayer || typeof rawLayer !== 'object' || Array.isArray(rawLayer)) {
              warnings.push(`${object.id}: floor finish layer ${index + 1} is invalid and was omitted`)
              continue
            }
            const layer = rawLayer as Data
            const material = typeof layer.material === 'string' && layer.material.trim() ? layer.material : undefined
            if (!material) {
              warnings.push(`${object.id}: floor finish layer ${index + 1} has no material`)
              continue
            }
            const mark = typeof layer.mark === 'string' && layer.mark.trim() ? layer.mark : `${String(data.mark ?? 'AF')} · ${material}`
            const classification = { phase: phaseAndCostCenter(object.created_phase, object.removed_phase).phase, cost_center: phaseAndCostCenter(object.created_phase, object.removed_phase).cost_center, object_type: 'architecture.floor.finish', mark }
            const thickness = layer.thickness_mm
            if (layer.quantity_unit !== undefined && layer.quantity_unit !== 'm2' && layer.quantity_unit !== 'm3') {
              warnings.push(`${object.id}: floor finish layer ${mark} quantity unit must be m2 or m3`)
              continue
            }
            const unit = layer.quantity_unit === 'm3' ? 'm3' : 'm2'
            if (unit === 'm3') {
              if (!finitePositive(thickness)) {
                warnings.push(`${object.id}: volumetric floor finish layer ${mark} thickness is missing/invalid`)
                continue
              }
              add(object, 'm3', mm3ToM3(netAreaMm2 * thickness), `${netArea.toFixed(6)} m² × ${thickness} mm floor layer`, material, classification)
            } else add(object, 'm2', netArea, `net architectural floor finish area: ${mm2ToM2(polygonAreaMm2(data.boundary_mm)!)} m² − ${Array.isArray(data.voids_mm) ? data.voids_mm.length : 0} void(s)`, material, classification)
          }
        } else {
          const material = typeof data.material === 'string' ? data.material : undefined
          const family = isFloor ? 'architectural floor' : 'ceiling'
          const classification = { phase: phaseAndCostCenter(object.created_phase, object.removed_phase).phase, cost_center: phaseAndCostCenter(object.created_phase, object.removed_phase).cost_center, object_type: isFloor ? 'architecture.floor' : 'architecture.ceiling' }
          add(object, 'm2', netArea, `net ${family} area: gross boundary − ${Array.isArray(data.voids_mm) ? data.voids_mm.length : 0} void(s)`, material, classification)
        }
        break
      }
      case 'door_window.door':
      case 'door_window.window':
        add(object, 'item', 1, 'one scheduled hosted opening')
        break
      default:
        break
    }
  }

  for(const out of constructionOutputs(project)) {
    for(const q of out.quantities) add(project.objects[out.object_id],q.unit==='pcs'?'item':q.unit,q.quantity,q.formula,q.material,
      {...phaseAndCostCenter(out.phase,out.removed_phase),object_type:q.classification,mark:out.mark})
    warnings.push(...out.warnings.map(w=>`${out.object_id}: ${w}`))
  }
  const totals: TakeoffReport['totals_by_cost_center'] = {
    demolition_site_prep: { item: 0, m: 0, m2: 0, m3: 0, kg:0 },
    new_construction: { item: 0, m: 0, m2: 0, m3: 0, kg:0 },
    remodeling_joint_treatment: { item: 0, m: 0, m2: 0, m3: 0, kg:0 },
  }
  const sorted = [...lines.values()].sort((a, b) => a.phase.localeCompare(b.phase) || a.object_type.localeCompare(b.object_type) || a.mark.localeCompare(b.mark))
  for (const line of sorted) totals[line.cost_center][line.unit] += line.quantity
  return { project_id: project.project.id, schema_version: 1, lines: sorted, totals_by_cost_center: totals, warnings }
}
