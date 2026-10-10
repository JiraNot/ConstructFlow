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
  waste_percent?: number
  gross_quantity?: number
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
      case 'door_window.window': {
        add(object, 'item', 1, 'one scheduled hosted opening')

        const costInfo = phaseAndCostCenter(object.created_phase, object.removed_phase)
        if (costInfo.cost_center === 'new_construction') {
          const widthMm = Number(valueFor(project, object.object_type, data, 'width_mm') ?? data.width_mm)
          const heightMm = Number(valueFor(project, object.object_type, data, 'height_mm') ?? data.height_mm)
          const isWindow = object.object_type === 'door_window.window'
          const sillHeightMm = isWindow ? Number(valueFor(project, object.object_type, data, 'sill_height_mm') ?? data.sill_height_mm ?? 0) : 0
          const hostId = typeof data.wall_id === 'string' ? data.wall_id : undefined
          const hostWall = hostId ? project.objects[hostId] : undefined
          const hostData = hostWall ? (hostWall.module_data as Data) : undefined
          const wallThicknessMm = Number((hostData ? valueFor(project, 'architecture.wall', hostData, 'thickness_mm') : undefined) ?? hostData?.thickness_mm) || 100

          if (finitePositive(widthMm) && finitePositive(heightMm)) {
            const W = mmToM(widthMm)
            const H = mmToM(heightMm)
            const Tw = mmToM(wallThicknessMm)
            const stiffenerLengthM = 2 * H
            const lintelLengthM = W + 0.40 // 0.20m bearing each side
            const sillLengthM = (isWindow && sillHeightMm > 0) ? (W + 0.40) : 0
            const totalLengthM = Number((stiffenerLengthM + lintelLengthM + sillLengthM).toFixed(4))

            if (totalLengthM > 0) {
              const depthM = 0.10 // standard 100mm depth
              const concreteVolM3 = Number((totalLengthM * Tw * depthM).toFixed(4))
              const formworkAreaM2 = Number((totalLengthM * 2 * depthM).toFixed(4))
              const mainRebarKg = Number((totalLengthM * 2 * 0.499).toFixed(4)) // 2-RB9 @ 0.499 kg/m
              const stirrupTies = Math.ceil(totalLengthM / 0.20) // RB6 @ 0.20m
              const tieLengthM = 2 * (Tw + depthM)
              const stirrupKg = Number((stirrupTies * tieLengthM * 0.222).toFixed(4)) // RB6 @ 0.222 kg/m

              const stiffenerClass: TakeoffClassification = {
                phase: costInfo.phase,
                cost_center: costInfo.cost_center,
                object_type: 'architecture.masonry_stiffener',
                mark: 'เสาเอ็น-ทับหลัง คสล.',
              }

              // 1) คอนกรีต คสล. เสาเอ็น-ทับหลัง
              add(object, 'm3', concreteVolM3,
                'คอนกรีต คสล. เสาเอ็น-ทับหลัง (240 ksc)',
                'concrete_240_ksc', stiffenerClass)

              // 2) ไม้แบบหล่อเสาเอ็น-ทับหลัง
              add(object, 'm2', formworkAreaM2,
                'ไม้แบบหล่อเสาเอ็น-ทับหลัง (2 ด้าน)',
                'plywood_formwork', stiffenerClass)

              // 3) เหล็กเสริมแกน 2-RB9
              add(object, 'kg', mainRebarKg,
                'เหล็กเสริมแกน 2-RB9 เสาเอ็น-ทับหลัง',
                'rebar_rb9', stiffenerClass)

              // 4) เหล็กปลอก RB6 @ 0.20 ม.
              add(object, 'kg', stirrupKg,
                'เหล็กปลอก RB6 @ 0.20 ม. เสาเอ็น-ทับหลัง',
                'rebar_rb6', stiffenerClass)
            }
          }
        }
        break
      }
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
  for (const line of sorted) {
    totals[line.cost_center][line.unit] += line.quantity
    if (line.unit !== 'item') {
      const waste = getStandardWasteFactor(line.material || line.mark || line.object_type)
      if (waste > 0) {
        line.waste_percent = waste
        line.gross_quantity = Number((line.quantity * (1 + waste / 100)).toFixed(4))
      }
    }
  }
  return { project_id: project.project.id, schema_version: 1, lines: sorted, totals_by_cost_center: totals, warnings }
}

/**
 * Thai Standard Material Waste Factors (ตัวคูณเผื่อเศษวัสดุตามเกณฑ์กรมบัญชีกลางและ วสท.)
 */
export const THAI_STANDARD_WASTE_FACTORS: Record<string, number> = {
  tile_ceramic: 7,
  tile_porcelain: 7,
  tile_granite: 5,
  tile: 7,
  concrete_240_ksc: 5,
  concrete_lean: 5,
  concrete: 5,
  mortar: 5,
  cement_plaster: 5,
  plaster: 5,
  rebar_rb6: 5,
  rebar_rb9: 5,
  rebar_db12: 7,
  rebar_db16: 9,
  rebar_db20: 11,
  rebar_db25: 11,
  rebar: 7,
  wire_mesh: 5,
  brick: 5,
  aac_block: 5,
  paint: 10,
  primer: 10,
  gypsum: 5,
  gypsum_board: 5,
  roof_tile: 5,
  metal_sheet: 5,
  formwork: 15,
  plywood_formwork: 15,
}

export function getStandardWasteFactor(identifier: string): number {
  if (!identifier) return 0
  const key = identifier.toLowerCase().trim()
  if (key.includes('db20') || key.includes('db25')) return 11
  if (key.includes('db16')) return 9
  if (key.includes('db12')) return 7
  if (key.includes('rb6') || key.includes('rb9')) return 5
  if (key.includes('rebar') || key.includes('เหล็กเสริม') || key.includes('เหล็กปลอก')) return 7
  if (key.includes('wire_mesh') || key.includes('ไวร์เมช')) return 5
  if (key.includes('granite') || key.includes('แกรนิต') || key.includes('marble') || key.includes('หินอ่อน')) return 5
  if (key.includes('tile') || key.includes('กระเบื้อง')) return 7
  if (key.includes('paint') || key.includes('สีทา') || key.includes('สีรองพื้น')) return 10
  if (key.includes('mortar') || key.includes('plaster') || key.includes('ปูน')) return 5
  if (key.includes('concrete') || key.includes('คอนกรีต')) return 5
  if (key.includes('brick') || key.includes('aac') || key.includes('อิฐ')) return 5
  if (key.includes('gypsum') || key.includes('ฝ้า')) return 5
  if (key.includes('roof') || key.includes('metal_sheet') || key.includes('หลังคา')) return 5
  if (key.includes('formwork') || key.includes('ไม้แบบ')) return 15
  return 0
}

// =============================================================================
// Formwork Reuse Engine (การคิดลดค่าวัสดุไม้แบบตามจำนวนชั้นและการนำกลับมาใช้ซ้ำ กรมบัญชีกลาง)
// =============================================================================

export interface FormworkElement {
  object_id: string
  object_type: string
  mark: string
  category: 'foundation' | 'column' | 'beam' | 'slab' | 'lintel_stiffener'
  storey: number
  contact_area_m2: number
  material_factor: number
  formwork_material_area_m2: number
  formwork_labor_area_m2: number
}

export interface FormworkCategorySummary {
  contact_area_m2: number
  material_area_m2: number
  labor_area_m2: number
}

export interface FormworkReport {
  elements: FormworkElement[]
  total_contact_area_m2: number
  total_material_area_m2: number
  total_labor_area_m2: number
  by_category: {
    foundation: FormworkCategorySummary
    column: FormworkCategorySummary
    beam: FormworkCategorySummary
    slab: FormworkCategorySummary
    lintel_stiffener: FormworkCategorySummary
  }
}

export function calculateFormwork(project: ProjectDocument): FormworkReport {
  const elements: FormworkElement[] = []
  const summaryByCategory: FormworkReport['by_category'] = {
    foundation: { contact_area_m2: 0, material_area_m2: 0, labor_area_m2: 0 },
    column: { contact_area_m2: 0, material_area_m2: 0, labor_area_m2: 0 },
    beam: { contact_area_m2: 0, material_area_m2: 0, labor_area_m2: 0 },
    slab: { contact_area_m2: 0, material_area_m2: 0, labor_area_m2: 0 },
    lintel_stiffener: { contact_area_m2: 0, material_area_m2: 0, labor_area_m2: 0 },
  }

  const addElement = (
    object: ProjectDocument['objects'][string],
    category: FormworkElement['category'],
    mark: string,
    contactAreaM2: number,
    storey = 1,
  ) => {
    if (!Number.isFinite(contactAreaM2) || contactAreaM2 <= 0) return
    // Comptroller General's Dept reuse factors:
    // Storey 1 (Ground / Substructure): 0.80 material factor (20% loss/depreciation)
    // Storey 2: 0.70 material factor (30% loss/depreciation)
    // Storey 3+: 0.60 material factor
    // Labor factor is always 1.00 (100% full labor each time)
    const materialFactor = storey >= 3 ? 0.60 : storey === 2 ? 0.70 : 0.80
    const matArea = Number((contactAreaM2 * materialFactor).toFixed(4))
    const labArea = Number((contactAreaM2 * 1.0).toFixed(4))

    const el: FormworkElement = {
      object_id: object.id,
      object_type: object.object_type,
      mark,
      category,
      storey,
      contact_area_m2: Number(contactAreaM2.toFixed(4)),
      material_factor: materialFactor,
      formwork_material_area_m2: matArea,
      formwork_labor_area_m2: labArea,
    }
    elements.push(el)

    summaryByCategory[category].contact_area_m2 += el.contact_area_m2
    summaryByCategory[category].material_area_m2 += el.formwork_material_area_m2
    summaryByCategory[category].labor_area_m2 += el.formwork_labor_area_m2
  }

  for (const object of Object.values(project.objects)) {
    if (object.created_phase === 'existing' || object.removed_phase === 'demolition') continue
    const data = object.module_data as Data

    if (object.object_type === 'structure.foundation') {
      const size = positiveTuple(valueFor(project, object.object_type, data, 'size_mm'), 3)
      if (size) {
        const [w, l, t] = size
        // 4 vertical sides = 2 * (w + l) * t
        const area = (2 * (w + l) * t) / 1_000_000
        const mark = String(data.mark ?? 'F1')
        addElement(object, 'foundation', mark, area, 1)
      }
    } else if (object.object_type === 'structure.column') {
      const section = positiveTuple(valueFor(project, object.object_type, data, 'section_mm'), 2)
      if (section) {
        const [w, d] = section
        const baseLevelId = typeof data.base_level_id === 'string' ? data.base_level_id : undefined
        const topLevelId = typeof data.top_level_id === 'string' ? data.top_level_id : undefined
        const base = finiteNumber(data.base_elevation_mm) ? data.base_elevation_mm : project.levels.find(level => level.id === baseLevelId)?.elevation_mm ?? 0
        const top = finiteNumber(data.top_elevation_mm) ? data.top_elevation_mm : project.levels.find(level => level.id === topLevelId)?.elevation_mm ?? base + 3000
        const height = top - base
        if (height > 0) {
          // 4 vertical sides = 2 * (w + d) * height
          const area = (2 * (w + d) * height) / 1_000_000
          const storey = base >= 2500 || top > 4000 ? 2 : 1
          const mark = String(data.mark ?? 'C1')
          addElement(object, 'column', mark, area, storey)
        }
      }
    } else if (object.object_type === 'structure.beam') {
      const section = positiveTuple(valueFor(project, object.object_type, data, 'section_mm'), 2)
      const length = finitePositive(data.span_mm) ? data.span_mm : finitePositive(data.length_mm) ? data.length_mm : 0
      if (section && length > 0) {
        const [w, d] = section
        // 2 sides + bottom soffit = (2 * d + w) * length
        const area = ((2 * d + w) * length) / 1_000_000
        const mark = String(data.mark ?? 'B1')
        const levelId = typeof data.level_id === 'string' ? data.level_id : undefined
        const levelElev = project.levels.find(lvl => lvl.id === levelId)?.elevation_mm ?? 0
        const startZ = finiteTuple(data.start_point_mm, 3)?.[2] ?? levelElev
        const storey = startZ >= 2500 || mark.toUpperCase().startsWith('RB') ? 2 : 1
        addElement(object, 'beam', mark, area, storey)
      }
    } else if (object.object_type === 'structure.slab') {
      const slabType = String(data.slab_type ?? 'sog').toLowerCase()
      const thickness = finitePositive(data.thickness_mm) ? Number(data.thickness_mm) : 120
      const boundary = polygonRing(data.boundary_mm)
      const netAreaMm2 = boundary && isSimpleRing(boundary) ? Math.abs(signedAreaMm2(boundary)) : 0
      if (netAreaMm2 > 0) {
        let perimeterMm = 0
        if (boundary) {
          for (let i = 0; i < boundary.length; i++) {
            const next = boundary[(i + 1) % boundary.length]
            perimeterMm += Math.hypot(boundary[i][0] - next[0], boundary[i][1] - next[1])
          }
        }
        const edgeAreaM2 = (perimeterMm * thickness) / 1_000_000
        const bottomAreaM2 = slabType === 'sog' ? 0 : netAreaMm2 / 1_000_000
        const totalAreaM2 = bottomAreaM2 + edgeAreaM2
        const mark = String(data.mark ?? 'S1')
        const storey = finiteNumber(data.elevation_offset_mm) && Number(data.elevation_offset_mm) >= 2500 ? 2 : 1
        addElement(object, 'slab', mark, totalAreaM2, storey)
      }
    } else if (object.object_type === 'door_window.door' || object.object_type === 'door_window.window') {
      const widthMm = Number(valueFor(project, object.object_type, data, 'width_mm') ?? data.width_mm)
      const heightMm = Number(valueFor(project, object.object_type, data, 'height_mm') ?? data.height_mm)
      if (finitePositive(widthMm) && finitePositive(heightMm)) {
        const isWindow = object.object_type === 'door_window.window'
        const sillHeightMm = isWindow ? Number(valueFor(project, object.object_type, data, 'sill_height_mm') ?? data.sill_height_mm ?? 0) : 0
        const stiffenerLengthM = 2 * mmToM(heightMm)
        const lintelLengthM = mmToM(widthMm) + 0.40
        const sillLengthM = (isWindow && sillHeightMm > 0) ? (mmToM(widthMm) + 0.40) : 0
        const totalLengthM = stiffenerLengthM + lintelLengthM + sillLengthM
        const depthM = 0.10
        const formworkAreaM2 = totalLengthM * 2 * depthM
        addElement(object, 'lintel_stiffener', 'เสาเอ็น-ทับหลัง', formworkAreaM2, 1)
      }
    }
  }

  for (const key of Object.keys(summaryByCategory) as (keyof FormworkReport['by_category'])[]) {
    summaryByCategory[key].contact_area_m2 = Number(summaryByCategory[key].contact_area_m2.toFixed(4))
    summaryByCategory[key].material_area_m2 = Number(summaryByCategory[key].material_area_m2.toFixed(4))
    summaryByCategory[key].labor_area_m2 = Number(summaryByCategory[key].labor_area_m2.toFixed(4))
  }

  const totalContact = elements.reduce((sum, el) => sum + el.contact_area_m2, 0)
  const totalMat = elements.reduce((sum, el) => sum + el.formwork_material_area_m2, 0)
  const totalLab = elements.reduce((sum, el) => sum + el.formwork_labor_area_m2, 0)

  return {
    elements,
    total_contact_area_m2: Number(totalContact.toFixed(4)),
    total_material_area_m2: Number(totalMat.toFixed(4)),
    total_labor_area_m2: Number(totalLab.toFixed(4)),
    by_category: summaryByCategory,
  }
}

// =============================================================================
// Preliminaries & Temporary Works Engine (หมวดงานเตรียมการและงานชั่วคราว)
// =============================================================================

export interface PreliminaryItem {
  id: string
  code: string
  description: string
  category: 'demolition_handling' | 'shoring' | 'scaffolding' | 'site_protection' | 'utilities'
  unit: 'item' | 'm' | 'm2' | 'm3' | 'job'
  quantity: number
  rate_thb: number
  amount_thb: number
  notes: string
}

export interface PreliminariesReport {
  items: PreliminaryItem[]
  total_amount_thb: number
  total_debris_volume_m3: number
  bulked_debris_volume_m3: number
  truckloads_count: number
  scaffolding_area_m2: number
  dust_canvas_area_m2: number
  shoring_props_count: number
}

export function calculatePreliminaries(project: ProjectDocument): PreliminariesReport {
  const items: PreliminaryItem[] = []
  let totalDebrisM3 = 0
  let scaffoldingAreaM2 = 0
  let dustCanvasAreaM2 = 0
  let shoringPropsCount = 0

  // 1. Demolition handling
  for (const object of Object.values(project.objects)) {
    const isDemolished = object.created_phase === 'demolition' || object.removed_phase === 'demolition'
    if (!isDemolished) continue
    const data = object.module_data as Data

    if (object.object_type === 'architecture.wall') {
      const thickness = Number(valueFor(project, object.object_type, data, 'thickness_mm') ?? 100)
      const height = Number(valueFor(project, object.object_type, data, 'height_mm') ?? 2800)
      const length = Number(data.length_mm ?? 3000)
      const vol = (length * height * thickness) / 1_000_000_000
      totalDebrisM3 += vol
      shoringPropsCount += 2
    } else if (object.object_type === 'structure.column' || object.object_type === 'structure.beam' || object.object_type === 'structure.slab') {
      totalDebrisM3 += 0.5
      shoringPropsCount += 2
    }
  }

  // 2. New construction scaffolding & shoring
  for (const object of Object.values(project.objects)) {
    if (object.created_phase !== 'new_construction' || object.removed_phase === 'demolition') continue
    const data = object.module_data as Data

    if (object.object_type === 'architecture.wall') {
      const height = Number(valueFor(project, object.object_type, data, 'height_mm') ?? 2800)
      const length = Number(data.length_mm ?? 3000)
      if (height >= 2500) {
        const wallScaffArea = (length / 1000) * ((height / 1000) + 1.0)
        scaffoldingAreaM2 += wallScaffArea
      }
      dustCanvasAreaM2 += (length / 1000) * 3.0
    } else if (object.object_type === 'structure.beam') {
      const span = Number(data.span_mm ?? data.length_mm ?? 3000)
      shoringPropsCount += Math.max(1, Math.ceil(span / 1200))
    }
  }

  const bulkedDebrisM3 = Number((totalDebrisM3 * 1.4).toFixed(3))
  const truckloads = Math.ceil(bulkedDebrisM3 / 5.0)

  if (totalDebrisM3 > 0) {
    items.push({
      id: 'pre-debris-removal',
      code: 'PRE-01',
      description: 'งานขนย้ายเศษซากและขยะรื้อถอนไปทิ้งภายนอกโครงการ (รถบรรทุก 6 ล้อ)',
      category: 'demolition_handling',
      unit: 'm3',
      quantity: bulkedDebrisM3,
      rate_thb: 450,
      amount_thb: Math.round(bulkedDebrisM3 * 450),
      notes: `คิดจากปริมาตรเศษวัสดุรื้อถอน ${totalDebrisM3.toFixed(3)} m³ × ตัวคูณขยายตัว 1.4 = ${bulkedDebrisM3} m³ (ประมาณ ${truckloads} เที่ยว)`,
    })
  }

  if (shoringPropsCount > 0) {
    items.push({
      id: 'pre-shoring-props',
      code: 'PRE-02',
      description: 'งานเสาค้ำยันเหล็กปรับระดับชั่วคราว (Adjustable Steel Props)',
      category: 'shoring',
      unit: 'item',
      quantity: shoringPropsCount,
      rate_thb: 150,
      amount_thb: shoringPropsCount * 150,
      notes: `ค้ำยันท้องคาน/พื้นหล่อในที่ และค้ำยันโครงสร้างเดิมระหว่างทำงาน (${shoringPropsCount} จุด)`,
    })
  }

  if (scaffoldingAreaM2 > 0) {
    const area = Number(scaffoldingAreaM2.toFixed(2))
    items.push({
      id: 'pre-scaffolding',
      code: 'PRE-03',
      description: 'งานติดตั้งนั่งร้านเหล็กและอุปกรณ์ความปลอดภัยสำหรับงานที่สูง',
      category: 'scaffolding',
      unit: 'm2',
      quantity: area,
      rate_thb: 80,
      amount_thb: Math.round(area * 80),
      notes: `นั่งร้านสำหรับผนังสูงเกิน 2.50 ม. พร้อมราวกั้นตก (${area} m²)`,
    })
  }

  if (dustCanvasAreaM2 > 0) {
    const area = Number(dustCanvasAreaM2.toFixed(2))
    items.push({
      id: 'pre-dust-canvas',
      code: 'PRE-04',
      description: 'งานติดตั้งผ้าใบกันฝุ่นและตาข่ายป้องกันเศษวัสดุรอบพื้นที่ก่อสร้าง',
      category: 'site_protection',
      unit: 'm2',
      quantity: area,
      rate_thb: 45,
      amount_thb: Math.round(area * 45),
      notes: `ผ้าใบ PE กันฝุ่นสูง 3.00 ม. ป้องกันผลกระทบต่ออาคารข้างเคียง (${area} m²)`,
    })
  }

  items.push({
    id: 'pre-site-utilities',
    code: 'PRE-05',
    description: 'งานระบบน้ำ-ไฟฟ้าชั่วคราวและการอำนวยความสะดวกหน้างาน',
    category: 'utilities',
    unit: 'job',
    quantity: 1,
    rate_thb: 5000,
    amount_thb: 5000,
    notes: 'ค่าน้ำประปา ไฟฟ้าชั่วคราว ตู้เมนเบรกเกอร์ และการจัดการความปลอดภัยไซต์ก่อสร้าง',
  })

  const totalAmount = items.reduce((sum, item) => sum + item.amount_thb, 0)

  return {
    items,
    total_amount_thb: totalAmount,
    total_debris_volume_m3: Number(totalDebrisM3.toFixed(3)),
    bulked_debris_volume_m3: bulkedDebrisM3,
    truckloads_count: truckloads,
    scaffolding_area_m2: Number(scaffoldingAreaM2.toFixed(2)),
    dust_canvas_area_m2: Number(dustCanvasAreaM2.toFixed(2)),
    shoring_props_count: shoringPropsCount,
  }
}

// =============================================================================
// Factor F Engine (ตาราง Factor F งานอาคาร กรมบัญชีกลาง & VAT 7%)
// =============================================================================

export interface FactorFResult {
  direct_cost_thb: number
  factor_f: number
  overhead_profit_interest_rate: number
  vat_rate: number
  total_with_factor_f_thb: number
}

export function calculateFactorF(directCostThb: number): FactorFResult {
  const dc = Math.max(0, directCostThb)
  let factorF = 1.3056
  if (dc > 10_000_000) factorF = 1.2750
  else if (dc > 5_000_000) factorF = 1.2801
  else if (dc > 2_000_000) factorF = 1.2854
  else if (dc > 1_000_000) factorF = 1.2982
  else if (dc > 500_000) factorF = 1.3015

  const vatRate = 0.07
  const overheadProfitInterestRate = Number(((factorF / (1 + vatRate)) - 1).toFixed(4))
  const total = Number((dc * factorF).toFixed(2))

  return {
    direct_cost_thb: dc,
    factor_f: factorF,
    overhead_profit_interest_rate: overheadProfitInterestRate,
    vat_rate: vatRate,
    total_with_factor_f_thb: total,
  }
}

// =============================================================================
// Phased BOQ Calculator (การคำนวณและสรุปตาราง BOQ แยก 3 Discrete Cost Centers)
// =============================================================================

export interface UnitRate {
  material_rate: number
  labor_rate: number
  unit: QuantityUnit
}

export const DEFAULT_THAI_UNIT_RATES: Record<string, UnitRate> = {
  concrete_240_ksc: { material_rate: 2350, labor_rate: 450, unit: 'm3' },
  concrete_lean: { material_rate: 1950, labor_rate: 350, unit: 'm3' },
  concrete: { material_rate: 2350, labor_rate: 450, unit: 'm3' },
  plywood_formwork: { material_rate: 280, labor_rate: 150, unit: 'm2' },
  formwork: { material_rate: 280, labor_rate: 150, unit: 'm2' },
  rebar_rb6: { material_rate: 28, labor_rate: 4.5, unit: 'kg' },
  rebar_rb9: { material_rate: 28, labor_rate: 4.5, unit: 'kg' },
  rebar_db12: { material_rate: 29, labor_rate: 4.5, unit: 'kg' },
  rebar_db16: { material_rate: 29.5, labor_rate: 4.5, unit: 'kg' },
  rebar_db20: { material_rate: 30, labor_rate: 4.5, unit: 'kg' },
  rebar: { material_rate: 29, labor_rate: 4.5, unit: 'kg' },
  wire_mesh: { material_rate: 45, labor_rate: 15, unit: 'm2' },
  micro_pile_i18: { material_rate: 950, labor_rate: 350, unit: 'item' },
  pile: { material_rate: 950, labor_rate: 350, unit: 'item' },
  aac_block: { material_rate: 260, labor_rate: 120, unit: 'm2' },
  brick: { material_rate: 240, labor_rate: 130, unit: 'm2' },
  cement_plaster: { material_rate: 85, labor_rate: 110, unit: 'm2' },
  tile_ceramic: { material_rate: 380, labor_rate: 200, unit: 'm2' },
  tile_granite: { material_rate: 650, labor_rate: 250, unit: 'm2' },
  tile: { material_rate: 420, labor_rate: 220, unit: 'm2' },
  paint: { material_rate: 55, labor_rate: 45, unit: 'm2' },
  door: { material_rate: 3500, labor_rate: 600, unit: 'item' },
  window: { material_rate: 2800, labor_rate: 400, unit: 'item' },
  chemical_dowel_epoxy: { material_rate: 120, labor_rate: 80, unit: 'm' },
  expansion_joint_sealant: { material_rate: 90, labor_rate: 60, unit: 'm' },
  roof_flashing: { material_rate: 250, labor_rate: 100, unit: 'm' },
  joint_sealant: { material_rate: 90, labor_rate: 60, unit: 'm' },
}

export interface BOQLineItem {
  id: string
  phase: Phase
  cost_center: TakeoffCostCenter
  object_type: string
  mark: string
  material?: string
  unit: QuantityUnit
  net_quantity: number
  waste_percent: number
  gross_quantity: number
  unit_material_cost_thb: number
  unit_labor_cost_thb: number
  total_material_cost_thb: number
  total_labor_cost_thb: number
  total_direct_cost_thb: number
  formula: string
}

export interface PhasedCostCenterSummary {
  cost_center: TakeoffCostCenter
  cost_center_label_th: string
  items: BOQLineItem[]
  total_material_thb: number
  total_labor_thb: number
  total_direct_cost_thb: number
}

export interface PhasedBOQReport {
  project_id: string
  schema_version: 1
  cost_centers: Record<TakeoffCostCenter, PhasedCostCenterSummary>
  formwork: FormworkReport
  preliminaries: PreliminariesReport
  total_direct_material_thb: number
  total_direct_labor_thb: number
  total_direct_cost_thb: number
  preliminaries_cost_thb: number
  total_direct_with_preliminaries_thb: number
  factor_f: FactorFResult
  grand_total_thb: number
  warnings: string[]
}

export function calculatePhasedBOQ(
  project: ProjectDocument,
  customRates?: Partial<Record<string, UnitRate>>,
): PhasedBOQReport {
  const takeoff = calculateTakeoff(project)
  const formwork = calculateFormwork(project)
  const preliminaries = calculatePreliminaries(project)

  const rates: Record<string, UnitRate> = {
    ...DEFAULT_THAI_UNIT_RATES,
    ...(customRates as Record<string, UnitRate> | undefined),
  }

  const resolveRate = (line: TakeoffLine): { material: number; labor: number } => {
    // 1. Demolition cost center is pure labor (no new material purchase)
    if (line.cost_center === 'demolition_site_prep') {
      if (line.unit === 'm3') return { material: 0, labor: 650 }
      if (line.unit === 'm2') return { material: 0, labor: 120 }
      if (line.unit === 'm') return { material: 0, labor: 50 }
      return { material: 0, labor: 300 }
    }

    // 2. Check exact material rate
    const matKey = line.material?.toLowerCase()
    if (matKey && rates[matKey]) return { material: rates[matKey].material_rate, labor: rates[matKey].labor_rate }

    // 3. Remodeling joint treatment cost center
    if (line.cost_center === 'remodeling_joint_treatment') {
      const markKey = line.mark.toLowerCase()
      if (markKey.includes('chemical_dowel') || markKey.includes('dowel')) return { material: 120, labor: 80 }
      if (markKey.includes('flashing')) return { material: 250, labor: 100 }
      if (markKey.includes('expansion') || markKey.includes('sealant')) return { material: 90, labor: 60 }
      return { material: 90, labor: 60 }
    }

    const idKey = (line.material || line.mark || line.object_type).toLowerCase()
    if (idKey.includes('db20') || idKey.includes('db25')) return { material: 30, labor: 4.5 }
    if (idKey.includes('db16')) return { material: 29.5, labor: 4.5 }
    if (idKey.includes('db12')) return { material: 29, labor: 4.5 }
    if (idKey.includes('rb6') || idKey.includes('rb9')) return { material: 28, labor: 4.5 }
    if (idKey.includes('rebar') || idKey.includes('เหล็ก')) return { material: 29, labor: 4.5 }
    if (idKey.includes('wire_mesh') || idKey.includes('ไวร์เมช')) return { material: 45, labor: 15 }
    if (idKey.includes('formwork') || idKey.includes('ไม้แบบ')) return { material: 280, labor: 150 }
    if (idKey.includes('granite') || idKey.includes('แกรนิต')) return { material: 650, labor: 250 }
    if (idKey.includes('tile') || idKey.includes('กระเบื้อง')) return { material: 420, labor: 220 }
    if (idKey.includes('plaster') || idKey.includes('ปูนฉาบ')) return { material: 85, labor: 110 }
    if (idKey.includes('concrete') || idKey.includes('คอนกรีต')) return { material: 2350, labor: 450 }
    if (idKey.includes('pile') || idKey.includes('เสาเข็ม')) return { material: 950, labor: 350 }
    if (idKey.includes('door') || idKey.includes('ประตู')) return { material: 3500, labor: 600 }
    if (idKey.includes('window') || idKey.includes('หน้าต่าง')) return { material: 2800, labor: 400 }
    if (idKey.includes('paint') || idKey.includes('สี')) return { material: 55, labor: 45 }
    if (idKey.includes('brick') || idKey.includes('อิฐมอญ')) return { material: 240, labor: 130 }
    if (idKey.includes('aac') || idKey.includes('มวลเบา')) return { material: 260, labor: 120 }
    if (idKey.includes('gypsum') || idKey.includes('ฝ้า')) return { material: 220, labor: 110 }
    if (idKey.includes('roof') || idKey.includes('หลังคา')) return { material: 350, labor: 150 }

    if (line.unit === 'm3') return { material: 2000, labor: 400 }
    if (line.unit === 'm2') return { material: 200, labor: 100 }
    if (line.unit === 'm') return { material: 100, labor: 50 }
    if (line.unit === 'kg') return { material: 28, labor: 4.5 }
    return { material: 500, labor: 150 }
  }

  const costCenterLabels: Record<TakeoffCostCenter, string> = {
    demolition_site_prep: 'งานรื้อถอนและเตรียมพื้นที่ (Demolition & Site Prep)',
    new_construction: 'งานโครงสร้าง สถาปัตย์ และระบบสร้างใหม่ (New Construction)',
    remodeling_joint_treatment: 'งานเชื่อมต่อรอยต่อเดิม-ใหม่ (Remodeling & Joint Treatment)',
  }

  const costCenters: Record<TakeoffCostCenter, PhasedCostCenterSummary> = {
    demolition_site_prep: {
      cost_center: 'demolition_site_prep',
      cost_center_label_th: costCenterLabels.demolition_site_prep,
      items: [],
      total_material_thb: 0,
      total_labor_thb: 0,
      total_direct_cost_thb: 0,
    },
    new_construction: {
      cost_center: 'new_construction',
      cost_center_label_th: costCenterLabels.new_construction,
      items: [],
      total_material_thb: 0,
      total_labor_thb: 0,
      total_direct_cost_thb: 0,
    },
    remodeling_joint_treatment: {
      cost_center: 'remodeling_joint_treatment',
      cost_center_label_th: costCenterLabels.remodeling_joint_treatment,
      items: [],
      total_material_thb: 0,
      total_labor_thb: 0,
      total_direct_cost_thb: 0,
    },
  }

  for (const line of takeoff.lines) {
    const rate = resolveRate(line)
    const wastePercent = line.waste_percent ?? (line.unit === 'item' ? 0 : getStandardWasteFactor(line.material || line.mark || line.object_type))
    const grossQty = line.gross_quantity ?? Number((line.quantity * (1 + wastePercent / 100)).toFixed(4))
    const totalMat = Number((grossQty * rate.material).toFixed(2))
    const totalLab = Number((line.quantity * rate.labor).toFixed(2))
    const totalDirect = Number((totalMat + totalLab).toFixed(2))

    const boqItem: BOQLineItem = {
      id: line.id,
      phase: line.phase,
      cost_center: line.cost_center,
      object_type: line.object_type,
      mark: line.mark,
      material: line.material,
      unit: line.unit,
      net_quantity: line.quantity,
      waste_percent: wastePercent,
      gross_quantity: grossQty,
      unit_material_cost_thb: rate.material,
      unit_labor_cost_thb: rate.labor,
      total_material_cost_thb: totalMat,
      total_labor_cost_thb: totalLab,
      total_direct_cost_thb: totalDirect,
      formula: line.formula,
    }

    const cc = costCenters[line.cost_center]
    if (cc) {
      cc.items.push(boqItem)
      cc.total_material_thb = Number((cc.total_material_thb + totalMat).toFixed(2))
      cc.total_labor_thb = Number((cc.total_labor_thb + totalLab).toFixed(2))
      cc.total_direct_cost_thb = Number((cc.total_direct_cost_thb + totalDirect).toFixed(2))
    }
  }

  const directMaterial = Object.values(costCenters).reduce((sum, cc) => sum + cc.total_material_thb, 0)
  const directLabor = Object.values(costCenters).reduce((sum, cc) => sum + cc.total_labor_thb, 0)
  const directCost = Number((directMaterial + directLabor).toFixed(2))
  const prelimCost = preliminaries.total_amount_thb
  const totalDirectWithPrelim = Number((directCost + prelimCost).toFixed(2))

  const factorFResult = calculateFactorF(totalDirectWithPrelim)
  const grandTotal = factorFResult.total_with_factor_f_thb

  return {
    project_id: project.project.id,
    schema_version: 1,
    cost_centers: costCenters,
    formwork,
    preliminaries,
    total_direct_material_thb: Number(directMaterial.toFixed(2)),
    total_direct_labor_thb: Number(directLabor.toFixed(2)),
    total_direct_cost_thb: directCost,
    preliminaries_cost_thb: prelimCost,
    total_direct_with_preliminaries_thb: totalDirectWithPrelim,
    factor_f: factorFResult,
    grand_total_thb: grandTotal,
    warnings: takeoff.warnings,
  }
}

