import type { Dispatch, SetStateAction } from 'react'
import { formatLengthMm, getBeamIntermediateSupportColumnIds } from '@constructflow/project-model'
import type { BeamModuleData, DisplayLengthUnit, ProjectDocument } from '@constructflow/project-model'
import type { CommandBatchResult, CommandRequest } from '@constructflow/command-schema'
import { CommandBus } from '../commands/CommandBus.js'
import { buildDirectManipulationCommands } from '../directManipulation.mjs'
import { expandSelectionWithHostedOpenings } from './duplicateSelection.js'
import { getPlanObjectBounds } from '../components/PlanCanvasGeometry.js'
import { computeAlignmentDelta, computeOffsetDelta, joinLineSegments, reflectPlanPoint, splitLineAtRatio, trimLineAtIntersection, type AlignmentMode } from './transformOperations.mjs'

type TransformPreview = { project: ProjectDocument; ids: string[]; commands: CommandRequest[]; sourceIds: string[]; description: string }
type EditorView = 'plan' | 'framing' | 'roofplan' | 'north' | 'south' | 'east' | 'west' | 'rcp' | 'model3d'
type PlanPoint = [number, number]

const planDistance = (a: PlanPoint, b: PlanPoint) => Math.hypot(a[0] - b[0], a[1] - b[1])
const resolveOpeningWidthMm = (project: ProjectDocument, opening: ProjectDocument['objects'][string]) => {
  const data = opening.module_data as Record<string, unknown>
  const overrides = data.instance_overrides as Record<string, unknown> | undefined
  const typeId = typeof data.type_id === 'string' ? data.type_id : undefined
  const mark = typeof data.mark === 'string' ? data.mark : undefined
  const type = project.types?.find(candidate => candidate.object_type === opening.object_type
    && (candidate.id === typeId || (!typeId && candidate.name === mark)))
  return Number(overrides?.width_mm ?? data.width_mm ?? type?.parameters?.width_mm)
}
const projectOpeningOffset = (opening: ProjectDocument['objects'][string], start: PlanPoint, end: PlanPoint) => {
  const point = (opening.module_data as Record<string, unknown>).location_mm as PlanPoint | undefined
  if (!point || !point.every(Number.isFinite)) return null
  const dx = end[0] - start[0], dy = end[1] - start[1]
  const length = Math.hypot(dx, dy)
  if (length < 1) return null
  const offset = ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / length
  const projected: PlanPoint = [start[0] + dx * offset / length, start[1] + dy * offset / length]
  return { offset, offAxisMm: planDistance(point, projected) }
}
const beamEndpointColumn = (data: Record<string, unknown>, point: PlanPoint): string | null => {
  const start = data.start_point_mm as PlanPoint | undefined
  const end = data.end_point_mm as PlanPoint | undefined
  if (start && planDistance(start, point) <= 1) return typeof data.start_column_id === 'string' ? data.start_column_id : null
  if (end && planDistance(end, point) <= 1) return typeof data.end_column_id === 'string' ? data.end_column_id : null
  return null
}

interface CreatePlanTransformCommandHandlersOptions {
  project: ProjectDocument
  alignmentPreview: TransformPreview | null
  setAlignmentPreview: Dispatch<SetStateAction<TransformPreview | null>>
  selectedIds: string[]
  displayUnit: DisplayLengthUnit
  dispatchCommandBatch: (commands: CommandRequest[]) => CommandBatchResult
  setSelectedIds: Dispatch<SetStateAction<string[]>>
  setSelectedId: Dispatch<SetStateAction<string | null>>
  setRightPanelTab: Dispatch<SetStateAction<'properties' | 'quantities' | 'objects' | 'field_forms' | 'coordination' | 'ai' | 'extensions' | 'integrations'>>
  setFileFeedback: (message: string) => void
  setViewMode: Dispatch<SetStateAction<EditorView>>
}
export function createPlanTransformCommandHandlers({ project, selectedIds, displayUnit, dispatchCommandBatch, setSelectedIds, setSelectedId, setRightPanelTab, setFileFeedback, setViewMode, alignmentPreview, setAlignmentPreview }: CreatePlanTransformCommandHandlersOptions) {
  const handlePreviewArrayObjects = (objectIds: string[], copies: number, deltaXmm: number, deltaYmm: number) => {
    const sourceIds = [...new Set(objectIds)].filter(id => Boolean(project.objects[id]))
    const ids = expandSelectionWithHostedOpenings(project, sourceIds)
    if (!ids.length || !Number.isInteger(copies) || copies < 1 || copies > 100 || ids.length * copies > 500 || !Number.isFinite(deltaXmm) || !Number.isFinite(deltaYmm) || Math.hypot(deltaXmm, deltaYmm) < 1) {
      if (ids.length * copies > 500) setFileFeedback('อาร์เรย์ครั้งเดียวสร้างสำเนาได้ไม่เกิน 500 ชิ้น · ลดจำนวนหรือชุดวัตถุ')
      return
    }
    const commands: CommandRequest[] = []
    const createdIds: string[] = []
    for (let index = 1; index <= copies; index += 1) {
      const id_map = Object.fromEntries(ids.map(id => [id, crypto.randomUUID()]))
      createdIds.push(...Object.values(id_map))
      commands.push({ name: 'DuplicateObjects', input: { object_ids: ids, delta_x_mm: deltaXmm * index, delta_y_mm: deltaYmm * index, id_map } })
    }
    const validation = CommandBus.executeBatch(project, commands)
    if (validation.status !== 'success') {
      setFileFeedback(validation.errors?.[0] ?? 'ตรวจสอบ Preview อาร์เรย์ไม่ผ่าน')
      return
    }
    setAlignmentPreview({ project: validation.updatedProject, ids: createdIds, commands, sourceIds, description: 'Array' })
    setViewMode('plan')
    setFileFeedback('Preview อาร์เรย์ ' + createdIds.length + ' ชิ้นใน ' + copies + ' ชุดแล้ว · ตรวจแบบก่อนยืนยัน')
  }

  const handleMoveObjectsByDelta = (objectIds: string[], deltaXmm: number, deltaYmm: number) => {
    const ids = [...new Set(objectIds)].filter(id => Boolean(project.objects[id]))
    if (!ids.length || !Number.isFinite(deltaXmm) || !Number.isFinite(deltaYmm) || Math.hypot(deltaXmm, deltaYmm) < 1) return
    const commands = buildDirectManipulationCommands(project, { id: ids[0], kind: 'group-move', objectIds: ids, startWorldMm: [0, 0], startScreenPx: [0, 0] }, [deltaXmm, deltaYmm])
    if (!commands.length) { setFileFeedback('วัตถุที่เลือกไม่มีการย้ายแบบกลุ่มที่รองรับ'); return }
    const result = dispatchCommandBatch(commands)
    if (result.status !== 'success') {
      setFileFeedback(result.errors?.[0] ?? 'ย้ายวัตถุไม่สำเร็จ')
      return
    }
    setFileFeedback(`ย้าย ${ids.length} ชิ้น · ΔX ${formatLengthMm(deltaXmm, displayUnit)} · ΔY ${formatLengthMm(deltaYmm, displayUnit)} · Undo ครั้งเดียวเพื่อย้อนกลับ`)
  }

  const hasConflictingHostSelection = (ids: string[]) => {
    const idSet = new Set(ids)
    for (const id of ids) {
      const object = project.objects[id]
      if (!object) continue
      const data = object.module_data as Record<string, unknown>
      const openingHost = (object.object_type === 'door_window.door' || object.object_type === 'door_window.window') ? String(data.wall_id ?? '') : ''
      const foundationColumn = object.object_type === 'structure.foundation' ? String(data.supported_column_id ?? object.host_refs.find(hostId => project.objects[hostId]?.object_type === 'structure.column') ?? '') : ''
      const attachedColumn = object.object_type === 'structure.beam' ? [String(data.start_column_id ?? ''), String(data.end_column_id ?? '')].filter(Boolean) : []
      if ((openingHost && idSet.has(openingHost)) || (foundationColumn && idSet.has(foundationColumn)) || attachedColumn.some(columnId => idSet.has(columnId))) return true
    }
    return false
  }

  const handlePreviewAlignment = (objectIds: string[], mode: AlignmentMode) => {
    const ids = [...new Set(objectIds)].filter(id => Boolean(project.objects[id]))
    if (ids.length < 2) { setFileFeedback('เลือกวัตถุอย่างน้อยสองชิ้นเพื่อจัดแนว'); return }
    if (hasConflictingHostSelection(ids)) { setFileFeedback('จัดแนวตัววัตถุที่เชื่อมกันพร้อมกันไม่ได้ · เลือกผนัง/ช่องเปิด หรือเสา/ฐานราก/คานแยกชุดกัน'); return }
    const anchorId = ids[0]
    const anchorBounds = getPlanObjectBounds(project.objects[anchorId])
    if (!anchorBounds) { setFileFeedback('วัตถุอ้างอิงไม่มีขอบเขตแปลนสำหรับจัดแนว'); return }
    let working = project
    const commands: CommandRequest[] = []
    const affectedIds = new Set<string>()
    for (const id of ids.slice(1)) {
      const object = working.objects[id]
      const bounds = object ? getPlanObjectBounds(object) : null
      const delta = computeAlignmentDelta(anchorBounds, bounds, mode)
      if (!object || !delta) { setFileFeedback('มีวัตถุที่ไม่มีขอบเขตแปลน จึงจัดแนวทั้งชุดไม่ได้'); return }
      if (Math.hypot(delta[0], delta[1]) < 1) continue
      const candidate = buildDirectManipulationCommands(working, { id, kind: 'object-move', startWorldMm: [0, 0], startScreenPx: [0, 0] }, delta)
      if (!candidate.length) { setFileFeedback(`ไม่รองรับการจัดแนววัตถุ ${id.slice(0, 8)} · ไม่มีคำสั่งย้ายที่รักษาความสัมพันธ์ได้`); return }
      const result = CommandBus.executeBatch(working, candidate)
      if (result.status !== 'success') { setFileFeedback(result.errors?.[0] ?? 'ตรวจสอบการจัดแนวไม่ผ่าน'); return }
      working = result.updatedProject
      commands.push(...candidate)
      for (const resultItem of result.results) for (const affected of resultItem.affected_object_ids) affectedIds.add(affected)
    }
    if (!commands.length) { setFileFeedback('วัตถุที่เลือกจัดแนวตรงกันอยู่แล้ว'); return }
    const validation = CommandBus.executeBatch(project, commands)
    if (validation.status !== 'success') { setFileFeedback(validation.errors?.[0] ?? 'ตรวจสอบ preview การจัดแนวไม่ผ่าน'); return }
    setAlignmentPreview({ project: validation.updatedProject, ids: [...affectedIds], commands, sourceIds: ids, description: 'จัดแนว' })
    setViewMode('plan')
    setFileFeedback(`Preview จัดแนว ${ids.length} วัตถุแล้ว · ยืนยันหรือยกเลิกใน Project Browser`)
  }

  const getOffsetLineEndpoints = (object: ProjectDocument['objects'][string]): [[number, number], [number, number]] | null => {
    const data = object.module_data as Record<string, unknown>
    const start = data.start_point_mm as [number, number] | undefined
    const end = data.end_point_mm as [number, number] | undefined
    if (start && end) return [[start[0], start[1]], [end[0], end[1]]]
    if ((object.object_type === 'structure.grid' || object.object_type === 'reference.grid') && Array.isArray(data.extent_mm)) {
      const extent = data.extent_mm as [number, number]
      return data.orientation === 'vertical'
        ? [[Number(data.position_mm), extent[0]], [Number(data.position_mm), extent[1]]]
        : [[extent[0], Number(data.position_mm)], [extent[1], Number(data.position_mm)]]
    }
    return null
  }

  const handlePreviewOffset = (objectIds: string[], distanceMm: number, side: 'left' | 'right') => {
    const ids = [...new Set(objectIds)].filter(id => Boolean(project.objects[id]))
    if (!ids.length || !Number.isFinite(distanceMm) || Math.abs(distanceMm) < 1) { setFileFeedback('ระยะ Offset ต้องไม่เป็นศูนย์'); return }
    if (ids.some(id => ['door_window.door', 'door_window.window'].includes(project.objects[id]!.object_type))) {
      setFileFeedback('เลือกผนังเพื่อทำสำเนา Offset · ระบบจะคัดลอกประตูและหน้าต่างที่ติดกับผนังไปด้วย'); return
    }
    const commands: CommandRequest[] = []
    const createdIds: string[] = []
    const copied = new Set<string>()
    for (const id of ids) {
      if (copied.has(id)) continue
      const object = project.objects[id]
      const line = object ? getOffsetLineEndpoints(object) : null
      const delta = line ? computeOffsetDelta(line[0], line[1], distanceMm, side) : null
      if (!object || !line || !delta) { setFileFeedback('Offset รองรับเฉพาะผนัง คาน กริด และเส้นแบ่งห้องที่มีแนวเส้นชัดเจน'); return }
      const data = object.module_data as Record<string, unknown>
      if (object.object_type === 'architecture.wall' && data.curve_geometry) {
        setFileFeedback(`Offset ผนังโค้ง ${id.slice(0, 8)} ยังไม่รองรับ · ใช้ทำสำเนาแล้วขยับ หรือวาดเส้นโค้งใหม่`); return
      }
      if (object.object_type === 'structure.beam' && (object.host_refs.length || data.start_column_id || data.end_column_id)) {
        setFileFeedback(`Offset คาน ${id.slice(0, 8)} ไม่ได้ขณะเชื่อมกับเสา · แยกคานอิสระก่อน`); return
      }
      if ((object.object_type === 'structure.grid' || object.object_type === 'reference.grid') && data.system_id) {
        setFileFeedback(`Offset กริด ${id.slice(0, 8)} ไม่ได้ขณะเป็นสมาชิก Grid System`); return
      }
      const group = [id]
      if (object.object_type === 'architecture.wall') {
        for (const candidate of Object.values(project.objects)) {
          if ((candidate.object_type === 'door_window.door' || candidate.object_type === 'door_window.window')
            && String((candidate.module_data as Record<string, unknown>).wall_id ?? '') === id) group.push(candidate.id)
        }
      }
      for (const sourceId of group) copied.add(sourceId)
      if (createdIds.length + group.length > 500) { setFileFeedback('Offset ครั้งเดียวสร้างสำเนาได้ไม่เกิน 500 ชิ้น · ลดจำนวนวัตถุที่เลือก'); return }
      const idMap = Object.fromEntries(group.map(sourceId => [sourceId, crypto.randomUUID()]))
      createdIds.push(...Object.values(idMap))
      commands.push({ name: 'DuplicateObjects', input: {
        object_ids: group, delta_x_mm: delta[0], delta_y_mm: delta[1], id_map: idMap,
      } })
    }
    if (!commands.length) { setFileFeedback('ไม่มีวัตถุที่รองรับ Offset'); return }
    const validation = CommandBus.executeBatch(project, commands)
    if (validation.status !== 'success') { setFileFeedback(validation.errors?.[0] ?? 'ตรวจสอบ preview Offset ไม่ผ่าน'); return }
    setAlignmentPreview({ project: validation.updatedProject, ids: createdIds, commands, sourceIds: ids, description: 'Offset copy' })
    setViewMode('plan')
    setFileFeedback(`Preview สำเนา Offset ${createdIds.length} ชิ้น · ยืนยันหรือยกเลิกก่อนเพิ่มลงแบบ`)
  }

  const handlePreviewMirror = (objectIds: string[], axis: 'vertical' | 'horizontal') => {
    const ids = [...new Set(objectIds)].filter(id => Boolean(project.objects[id]))
    if (ids.length < 2) { setFileFeedback('เลือกวัตถุอ้างอิงและเส้นอย่างน้อยหนึ่งเส้นเพื่อ Mirror'); return }
    const anchor = project.objects[ids[0]]
    const bounds = anchor ? getPlanObjectBounds(anchor) : null
    if (!bounds) { setFileFeedback('วัตถุชิ้นแรกไม่มีขอบเขตแปลนสำหรับกำหนดแกน Mirror'); return }
    const axisCoordinate = axis === 'vertical' ? (bounds[0] + bounds[2]) / 2 : (bounds[1] + bounds[3]) / 2
    const commands: CommandRequest[] = []
    const affectedIds: string[] = []
    for (const id of ids.slice(1)) {
      const object = project.objects[id]
      if (!object) continue
      const data = object.module_data as Record<string, unknown>
      const start = data.start_point_mm as [number, number] | undefined
      const end = data.end_point_mm as [number, number] | undefined
      if (!start || !end) { setFileFeedback(`Mirror รองรับเฉพาะเส้นที่มีจุดเริ่ม/จบชัดเจน · ${id.slice(0, 8)}`); return }
      const reflectedStart = reflectPlanPoint(start, axis, axisCoordinate)
      const reflectedEnd = reflectPlanPoint(end, axis, axisCoordinate)
      if (!reflectedStart || !reflectedEnd) { setFileFeedback('คำนวณแนว Mirror ไม่สำเร็จ'); return }
      if (object.object_type === 'architecture.wall') {
        if (data.curve_geometry) { setFileFeedback(`Mirror ผนังโค้ง ${id.slice(0, 8)} ยังไม่รองรับ · วาดเส้นโค้งสะท้อนใหม่เพื่อคงรัศมีและทิศโค้ง`); return }
        const hasHostedOpenings = Object.values(project.objects).some(candidate => (candidate.object_type === 'door_window.door' || candidate.object_type === 'door_window.window') && String((candidate.module_data as Record<string, unknown>).wall_id ?? '') === id)
        if (hasHostedOpenings) { setFileFeedback(`Mirror ผนัง ${id.slice(0, 8)} ไม่ได้ขณะมีช่องเปิดเป็น host · แยก workflow สำหรับผนัง/ช่องเปิดก่อน`); return }
        // Reverse the endpoints after reflection to preserve the wall's left/right face semantics.
        commands.push({ name: 'UpdateWallEndpoints', input: { object_id: id, start_point_mm: reflectedEnd, end_point_mm: reflectedStart } })
      } else if (object.object_type === 'structure.beam') {
        if (data.start_column_id || data.end_column_id) { setFileFeedback(`Mirror คาน ${id.slice(0, 8)} ไม่ได้ขณะผูกกับเสา`); return }
        commands.push({ name: 'UpdateBeamEndpoints', input: { object_id: id, start_point_mm: reflectedStart, end_point_mm: reflectedEnd, start_column_id: null, end_column_id: null } })
      } else if (object.object_type === 'structure.grid' || object.object_type === 'reference.grid') {
        if (data.system_id) { setFileFeedback(`Mirror กริด ${id.slice(0, 8)} ไม่ได้ขณะเป็นสมาชิก Grid System`); return }
        commands.push({ name: 'ModifyGrid', input: { object_id: id, start_point_mm: reflectedStart, end_point_mm: reflectedEnd } })
      } else if (object.object_type === 'architecture.room_separator') {
        commands.push({ name: 'UpdateRoomSeparator', input: { ...data, id, start_point_mm: reflectedStart, end_point_mm: reflectedEnd } })
      } else {
        setFileFeedback(`Mirror ยังไม่รองรับวัตถุ ${object.object_type}`)
        return
      }
      affectedIds.push(id)
    }
    if (!commands.length) { setFileFeedback('ไม่มีวัตถุที่รองรับ Mirror'); return }
    const validation = CommandBus.executeBatch(project, commands)
    if (validation.status !== 'success') { setFileFeedback(validation.errors?.[0] ?? 'ตรวจสอบ preview Mirror ไม่ผ่าน'); return }
    setAlignmentPreview({ project: validation.updatedProject, ids: affectedIds, commands, sourceIds: ids, description: 'Mirror' })
    setViewMode('plan')
    setFileFeedback(`Preview Mirror ${affectedIds.length} เส้น · แกนผ่านชิ้นแรก · ยืนยันหรือยกเลิกใน Project Browser`)
  }

  const handlePreviewSplit = (objectId: string, ratio: number) => {
    const object = project.objects[objectId]
    if (!object) { setFileFeedback('ไม่พบวัตถุที่เลือกสำหรับ Split'); return }
    const data = object.module_data as Record<string, unknown>
    const start = data.start_point_mm as [number, number] | undefined
    const end = data.end_point_mm as [number, number] | undefined
    if (!['architecture.wall', 'structure.beam', 'architecture.room_separator'].includes(object.object_type)) {
      setFileFeedback('Split รองรับผนัง คาน และเส้นแบ่งห้องที่เลือกได้ครั้งละหนึ่งชิ้น'); return
    }
    let splitRatio = ratio
    const beamSupportPositions: { id: string; ratio: number }[] = []
    let splitSupportId: string | null = null
    if (object.object_type === 'structure.beam' && start && end) {
      const supportIds = getBeamIntermediateSupportColumnIds(data as Pick<BeamModuleData, 'middle_support_column_id' | 'intermediate_support_column_ids'>)
      const dx = end[0] - start[0], dy = end[1] - start[1], lengthSq = dx * dx + dy * dy
      const length = Math.sqrt(lengthSq)
      for (const supportId of supportIds) {
        const support = project.objects[supportId]
        const supportPoint = support?.object_type === 'structure.column'
          ? (support.module_data as Record<string, unknown>).location_mm as PlanPoint | undefined
          : undefined
        if (!supportPoint || lengthSq < 1) { setFileFeedback(`คานต่อเนื่องอ้างอิงเสารองรับ ${supportId} ที่ไม่พบหรือใช้ไม่ได้`); return }
        const projected = ((supportPoint[0] - start[0]) * dx + (supportPoint[1] - start[1]) * dy) / lengthSq
        const closest: PlanPoint = [start[0] + dx * projected, start[1] + dy * projected]
        if (projected <= 0 || projected >= 1 || planDistance(supportPoint, closest) > 5) {
          setFileFeedback(`เสารองรับ ${supportId.slice(0, 8)} อยู่นอกแนวคาน จึง Split อย่างปลอดภัยไม่ได้`); return
        }
        beamSupportPositions.push({ id: supportId, ratio: projected })
      }
      beamSupportPositions.sort((a, b) => a.ratio - b.ratio)
      if (beamSupportPositions.length) {
        const matches = beamSupportPositions.filter(support => Math.abs(support.ratio - ratio) * length <= 5)
        if (matches.length !== 1) { setFileFeedback('Split คานต่อเนื่องได้ที่เสารองรับเท่านั้น · ปรับเปอร์เซ็นต์ให้ตรงตำแหน่งเสา'); return }
        splitSupportId = matches[0].id
        splitRatio = matches[0].ratio
      }
    }
    const segments = start && end ? splitLineAtRatio(start, end, splitRatio) : null
    if (!segments) { setFileFeedback('ตำแหน่ง Split ต้องอยู่ภายในเส้น และแต่ละช่วงต้องยาวอย่างน้อย 1 มม.'); return }
    const newId = crypto.randomUUID()
    const commands: CommandRequest[] = [
      { name: 'DuplicateObjects', input: { object_ids: [objectId], delta_x_mm: 0, delta_y_mm: 0, id_map: { [objectId]: newId } } },
    ]
    if (object.object_type === 'architecture.wall') {
      const splitDistance = planDistance(segments.start, segments.split)
      const openings = Object.values(project.objects).filter(candidate =>
        candidate.status !== 'archived' && !candidate.removed_phase
        && (candidate.object_type === 'door_window.door' || candidate.object_type === 'door_window.window')
        && String((candidate.module_data as Record<string, unknown>).wall_id ?? '') === objectId)
      const transfers: { objectId: string; offsetMm: number }[] = []
      for (const opening of openings) {
        const offset = Number((opening.module_data as Record<string, unknown>).offset_along_wall_mm)
        const width = resolveOpeningWidthMm(project, opening)
        if (!Number.isFinite(offset) || !Number.isFinite(width) || width <= 0) {
          setFileFeedback(`Split ผนังนี้ไม่ได้ · อ่านตำแหน่งหรือความกว้างของช่องเปิด ${opening.id.slice(0, 8)} ไม่ได้`); return
        }
        if (offset + width / 2 <= splitDistance + 1) continue
        if (offset - width / 2 >= splitDistance - 1) {
          transfers.push({ objectId: opening.id, offsetMm: offset - splitDistance })
          continue
        }
        setFileFeedback(`Split ผ่านช่องเปิด ${opening.id.slice(0, 8)} · ปรับตำแหน่ง Split ให้อยู่ระหว่างช่องเปิด`); return
      }
      commands.push({ name: 'UpdateWallEndpoints', input: { object_id: newId, start_point_mm: segments.split, end_point_mm: segments.end } })
      for (const transfer of transfers) {
        commands.push({ name: 'RehostOpening', input: { object_id: transfer.objectId, wall_id: newId, offset_along_wall_mm: transfer.offsetMm } })
      }
      commands.push({ name: 'UpdateWallEndpoints', input: { object_id: objectId, start_point_mm: segments.start, end_point_mm: segments.split } })
    } else if (object.object_type === 'structure.beam') {
      const leftSupportIds = splitSupportId ? beamSupportPositions.filter(support => support.ratio < splitRatio).map(support => support.id) : []
      const rightSupportIds = splitSupportId ? beamSupportPositions.filter(support => support.ratio > splitRatio).map(support => support.id) : []
      const leftBeamSystem = leftSupportIds.length ? 'continuous' : 'simple'
      const rightBeamSystem = rightSupportIds.length ? 'continuous' : 'simple'
      commands.push(
        { name: 'UpdateBeamEndpoints', input: { object_id: objectId, start_point_mm: segments.start, end_point_mm: segments.split, start_column_id: data.start_column_id as string | null ?? null, end_column_id: splitSupportId ?? null,
          intermediate_support_column_ids: leftSupportIds, middle_support_column_id: leftSupportIds[0] ?? null,
          beam_system: leftBeamSystem, continuity_type: leftSupportIds.length ? 'interior_span' : 'simple_span' } },
        { name: 'UpdateBeamEndpoints', input: { object_id: newId, start_point_mm: segments.split, end_point_mm: segments.end, start_column_id: splitSupportId ?? null, end_column_id: data.end_column_id as string | null ?? null,
          intermediate_support_column_ids: rightSupportIds, middle_support_column_id: rightSupportIds[0] ?? null,
          beam_system: rightBeamSystem, continuity_type: rightSupportIds.length ? 'interior_span' : 'simple_span' } },
      )
    } else {
      commands.push(
        { name: 'UpdateRoomSeparator', input: { ...data, id: objectId, start_point_mm: segments.start, end_point_mm: segments.split } },
        { name: 'UpdateRoomSeparator', input: { ...data, id: newId, start_point_mm: segments.split, end_point_mm: segments.end } },
      )
    }
    const validation = CommandBus.executeBatch(project, commands)
    if (validation.status !== 'success') { setFileFeedback(validation.errors?.[0] ?? 'ตรวจสอบ preview Split ไม่ผ่าน'); return }
    setAlignmentPreview({ project: validation.updatedProject, ids: [objectId, newId], commands, sourceIds: [objectId], description: 'Split' })
    setViewMode('plan')
    setFileFeedback('Preview Split แล้ว · ช่วงเดิมคง UUID เดิม · ยืนยันหรือยกเลิกใน Project Browser')
  }

  const handlePreviewJoin = (objectIds: string[]) => {
    const ids = [...new Set(objectIds)]
    if (ids.length !== 2) { setFileFeedback('Join ต้องเลือกเส้นสองชิ้นพอดี'); return }
    const first = project.objects[ids[0]], second = project.objects[ids[1]]
    if (!first || !second) { setFileFeedback('ไม่พบเส้นที่เลือกสำหรับ Join'); return }
    const firstData = first.module_data as Record<string, unknown>
    const secondData = second.module_data as Record<string, unknown>
    const supported = ['architecture.wall', 'structure.beam', 'architecture.room_separator']
    if (first.object_type !== second.object_type || !supported.includes(first.object_type)) {
      setFileFeedback('Join ต้องใช้วัตถุชนิดเดียวกัน: ผนัง คาน หรือเส้นแบ่งห้อง'); return
    }
    if (firstData.type_id !== secondData.type_id || first.created_phase !== second.created_phase || JSON.stringify(first.level_refs ?? []) !== JSON.stringify(second.level_refs ?? [])) {
      setFileFeedback('Join ต้องใช้ชนิด เฟส และระดับเดียวกัน'); return
    }
    const normalize = (data: Record<string, unknown>) => {
      const copy = { ...data }
      for (const key of ['mark', 'start_point_mm', 'end_point_mm', 'length_mm', 'span_mm', 'path_mm', 'start_column_id', 'middle_support_column_id', 'intermediate_support_column_ids', 'end_column_id', 'beam_system', 'continuity_type']) delete copy[key]
      return copy
    }
    if (JSON.stringify(normalize(firstData)) !== JSON.stringify(normalize(secondData))) {
      setFileFeedback('ข้อมูลหน้าตัดหรือคุณสมบัติของเส้นไม่ตรงกัน จึง Join อย่างปลอดภัยไม่ได้'); return
    }
    const line = joinLineSegments(
      firstData.start_point_mm as [number, number], firstData.end_point_mm as [number, number],
      secondData.start_point_mm as [number, number], secondData.end_point_mm as [number, number],
    )
    if (!line) { setFileFeedback('Join ต้องเป็นเส้นตรงแนวเดียวกันที่ปลายแตะกัน'); return }
    const hostedOpenings = first.object_type === 'architecture.wall'
      ? Object.values(project.objects).filter(candidate =>
          (candidate.object_type === 'door_window.door' || candidate.object_type === 'door_window.window')
          && ids.includes(String((candidate.module_data as Record<string, unknown>).wall_id ?? '')))
      : []
    if (hostedOpenings.some(opening => opening.status === 'archived' || opening.removed_phase)) {
      setFileFeedback('Join ผนังนี้ไม่ได้ · มีช่องเปิดที่เก็บเป็นประวัติ ต้องจัดการ host ของรายการที่เก็บไว้ก่อน'); return
    }
    const projectedOpeningOffsets = new Map<string, number>()
    for (const opening of hostedOpenings) {
      const projection = projectOpeningOffset(opening, line.start, line.end)
      const width = resolveOpeningWidthMm(project, opening)
      if (!projection || projection.offAxisMm > 5 || !Number.isFinite(width) || width <= 0
        || projection.offset - width / 2 < -1 || projection.offset + width / 2 > planDistance(line.start, line.end) + 1) {
        setFileFeedback(`Join ผนังไม่ได้ · คำนวณตำแหน่งช่องเปิด ${opening.id.slice(0, 8)} บนแนวใหม่ไม่ผ่าน`); return
      }
      projectedOpeningOffsets.set(opening.id, projection.offset)
    }
    let joinedBeamSupports: { start: string | null; middle: string | null; intermediate: string[]; end: string | null } | null = null
    if (first.object_type === 'structure.beam') {
      const firstStart = firstData.start_point_mm as PlanPoint
      const firstEnd = firstData.end_point_mm as PlanPoint
      const secondStart = secondData.start_point_mm as PlanPoint
      const secondEnd = secondData.end_point_mm as PlanPoint
      const sharedPairs = [
        [firstStart, secondStart], [firstStart, secondEnd], [firstEnd, secondStart], [firstEnd, secondEnd],
      ].filter(([a, b]) => planDistance(a as PlanPoint, b as PlanPoint) <= 1) as [PlanPoint, PlanPoint][]
      if (sharedPairs.length !== 1) { setFileFeedback('Join คานต้องมีจุดต่อร่วมที่กำหนดได้แน่นอน'); return }
      const [firstJoint, secondJoint] = sharedPairs[0]
      const firstJointColumn = beamEndpointColumn(firstData, firstJoint)
      const secondJointColumn = beamEndpointColumn(secondData, secondJoint)
      if (firstJointColumn !== secondJointColumn) {
        setFileFeedback('Join คานที่รองรับด้วยเสาได้เมื่อทั้งสองช่วงอ้างอิงเสากลางต้นเดียวกัน'); return
      }
      const middle = firstJointColumn
      if (middle) {
        const support = project.objects[middle]
        const location = (support?.module_data as Record<string, unknown> | undefined)?.location_mm as PlanPoint | undefined
        if (!location || planDistance(location, firstJoint) > 5) {
          setFileFeedback('จุดต่อของคานต้องอยู่กึ่งกลางเสารองรับเดียวกันภายในระยะ 5 มม.'); return
        }
      }
      const outerColumnAt = (point: PlanPoint): string | null =>
        beamEndpointColumn(firstData, point) ?? beamEndpointColumn(secondData, point)
      const startColumn = outerColumnAt(line.start)
      const endColumn = outerColumnAt(line.end)
      const interiorIds = [...new Set([
        ...getBeamIntermediateSupportColumnIds(firstData as Pick<BeamModuleData, 'middle_support_column_id' | 'intermediate_support_column_ids'>),
        ...(middle ? [middle] : []),
        ...getBeamIntermediateSupportColumnIds(secondData as Pick<BeamModuleData, 'middle_support_column_id' | 'intermediate_support_column_ids'>),
      ])]
      const dx = line.end[0] - line.start[0], dy = line.end[1] - line.start[1]
      const lengthSq = dx * dx + dy * dy
      const projectedSupports: { id: string; ratio: number }[] = []
      for (const id of interiorIds) {
        const support = project.objects[id]
        const location = (support?.module_data as Record<string, unknown> | undefined)?.location_mm as PlanPoint | undefined
        if (support?.object_type !== 'structure.column' || !location || lengthSq < 1) {
          setFileFeedback(`Join คานอ้างอิงเสารองรับ ${id} ที่ไม่พบหรือใช้ไม่ได้`); return
        }
        const ratio = ((location[0] - line.start[0]) * dx + (location[1] - line.start[1]) * dy) / lengthSq
        const closest: PlanPoint = [line.start[0] + dx * ratio, line.start[1] + dy * ratio]
        if (!Number.isFinite(ratio) || ratio <= 0 || ratio >= 1 || planDistance(location, closest) > 5) {
          setFileFeedback(`เสารองรับ ${id.slice(0, 8)} อยู่นอกแนว Join`); return
        }
        projectedSupports.push({ id, ratio })
      }
      projectedSupports.sort((a, b) => a.ratio - b.ratio)
      if (projectedSupports.some((support, index) => index > 0 && support.id === projectedSupports[index - 1].id)) {
        setFileFeedback('Join คานพบเสารองรับซ้ำ'); return
      }
      for (const id of [startColumn, endColumn]) {
        if (id && project.objects[id]?.object_type !== 'structure.column') {
          setFileFeedback(`Join คานอ้างอิงเสารองรับ ${id} ที่ไม่พบ`); return
        }
      }
      const orderedIds = projectedSupports.map(support => support.id)
      joinedBeamSupports = { start: startColumn, middle: orderedIds[0] ?? null, intermediate: orderedIds, end: endColumn }
    }
    const commands: CommandRequest[] = first.object_type === 'architecture.wall'
      ? [
          { name: 'UpdateWallEndpoints', input: { object_id: first.id, start_point_mm: line.start, end_point_mm: line.end } },
          ...hostedOpenings.map(opening => {
            const offset = projectedOpeningOffsets.get(opening.id)!
            return (opening.module_data as Record<string, unknown>).wall_id === first.id
              ? { name: 'MoveOpening', input: { object_id: opening.id, offset_along_wall_mm: offset } }
              : { name: 'RehostOpening', input: { object_id: opening.id, wall_id: first.id, offset_along_wall_mm: offset } }
          }),
          { name: 'DeleteObject', input: { object_id: second.id } },
        ]
      : first.object_type === 'structure.beam'
        ? [
            { name: 'UpdateBeamEndpoints', input: { object_id: first.id, start_point_mm: line.start, end_point_mm: line.end,
              start_column_id: joinedBeamSupports?.start ?? null, middle_support_column_id: joinedBeamSupports?.middle ?? null, end_column_id: joinedBeamSupports?.end ?? null,
              intermediate_support_column_ids: joinedBeamSupports?.intermediate ?? [],
              beam_system: joinedBeamSupports?.intermediate.length ? 'continuous' : 'simple',
              continuity_type: joinedBeamSupports?.intermediate.length ? 'interior_span' : 'simple_span',
            } },
            { name: 'DeleteObject', input: { object_id: second.id } },
          ]
        : [
            { name: 'UpdateRoomSeparator', input: { ...firstData, id: first.id, start_point_mm: line.start, end_point_mm: line.end } },
            { name: 'DeleteObject', input: { object_id: second.id } },
          ]
    const validation = CommandBus.executeBatch(project, commands)
    if (validation.status !== 'success') { setFileFeedback(validation.errors?.[0] ?? 'ตรวจสอบ preview Join ไม่ผ่าน'); return }
    setAlignmentPreview({ project: validation.updatedProject, ids: [first.id], commands, sourceIds: ids, description: 'Join' })
    setViewMode('plan')
    setFileFeedback('Preview Join แล้ว · คง UUID ของเส้นที่เลือกชิ้นแรก · ยืนยันหรือยกเลิกใน Project Browser')
  }

  const handlePreviewTrim = (objectIds: string[], removeEnd: 'start' | 'end') => {
    const ids = [...new Set(objectIds)]
    if (ids.length !== 2) { setFileFeedback('Trim ต้องเลือกเส้นเป้าหมายและเส้นตัดอย่างละหนึ่งชิ้น'); return }
    const target = project.objects[ids[0]], cutter = project.objects[ids[1]]
    if (!target || !cutter || target.id === cutter.id) { setFileFeedback('ไม่พบเส้นเป้าหมายหรือเส้นตัด'); return }
    const supported = ['architecture.wall', 'structure.beam', 'architecture.room_separator']
    if (!supported.includes(target.object_type) || !supported.includes(cutter.object_type)) {
      setFileFeedback('Trim รองรับผนัง คาน และเส้นแบ่งห้องเท่านั้น'); return
    }
    if (JSON.stringify(target.level_refs ?? []) !== JSON.stringify(cutter.level_refs ?? [])) {
      setFileFeedback('Trim ต้องใช้เส้นที่อยู่ในระดับเดียวกัน'); return
    }
    const targetData = target.module_data as Record<string, unknown>
    const cutterData = cutter.module_data as Record<string, unknown>
    const targetStart = targetData.start_point_mm as [number, number] | undefined
    const targetFinish = targetData.end_point_mm as [number, number] | undefined
    const cutterStart = cutterData.start_point_mm as [number, number] | undefined
    const cutterFinish = cutterData.end_point_mm as [number, number] | undefined
    const trimmed = targetStart && targetFinish && cutterStart && cutterFinish
      ? trimLineAtIntersection(targetStart, targetFinish, cutterStart, cutterFinish, removeEnd)
      : null
    if (!trimmed) { setFileFeedback('Trim ต้องตัดกันภายในช่วงของเส้นทั้งสอง และตัดให้เหลือเส้นที่ยาวกว่า 1 มม.'); return }
    const hostedOpeningOffsets = new Map<string, number>()
    if (target.object_type === 'architecture.wall') {
      const hostedOpenings = Object.values(project.objects).filter(candidate =>
        (candidate.object_type === 'door_window.door' || candidate.object_type === 'door_window.window') &&
        String((candidate.module_data as Record<string, unknown>).wall_id ?? '') === target.id)
      for (const opening of hostedOpenings) {
        if (opening.status === 'archived' || opening.removed_phase) {
          setFileFeedback('Trim ผนังนี้ไม่ได้ · มีช่องเปิดที่เก็บเป็นประวัติ'); return
        }
        const projection = projectOpeningOffset(opening, trimmed.start, trimmed.end)
        const width = resolveOpeningWidthMm(project, opening)
        const length = planDistance(trimmed.start, trimmed.end)
        if (!projection || projection.offAxisMm > 5 || !Number.isFinite(width) || width <= 0
          || projection.offset - width / 2 < -1 || projection.offset + width / 2 > length + 1) {
          setFileFeedback(`Trim ผ่านช่องเปิด ${opening.id.slice(0, 8)} · ปรับแนวตัดให้อยู่พ้นช่องเปิด`); return
        }
        hostedOpeningOffsets.set(opening.id, projection.offset)
      }
    }
    if (target.object_type === 'structure.beam') {
      const support = removeEnd === 'start' ? targetData.start_column_id : targetData.end_column_id
      if (support) { setFileFeedback('Trim ปลายคานที่เชื่อมกับเสาไม่ได้ · จัดการจุดรองรับก่อน'); return }
    }
    const commands: CommandRequest[] = target.object_type === 'architecture.wall'
      ? [
          ...[...hostedOpeningOffsets].map(([openingId, offset]) => ({ name: 'MoveOpening', input: { object_id: openingId, offset_along_wall_mm: offset } })),
          { name: 'UpdateWallEndpoints', input: { object_id: target.id, start_point_mm: trimmed.start, end_point_mm: trimmed.end } },
        ]
      : target.object_type === 'structure.beam'
        ? [{ name: 'UpdateBeamEndpoints', input: { object_id: target.id, start_point_mm: trimmed.start, end_point_mm: trimmed.end, start_column_id: targetData.start_column_id as string | null ?? null, end_column_id: targetData.end_column_id as string | null ?? null } }]
        : [{ name: 'UpdateRoomSeparator', input: { ...targetData, id: target.id, start_point_mm: trimmed.start, end_point_mm: trimmed.end } }]
    const validation = CommandBus.executeBatch(project, commands)
    if (validation.status !== 'success') { setFileFeedback(validation.errors?.[0] ?? 'ตรวจสอบ preview Trim ไม่ผ่าน'); return }
    setAlignmentPreview({ project: validation.updatedProject, ids: [target.id], commands, sourceIds: ids, description: 'Trim' })
    setViewMode('plan')
    setFileFeedback(`Preview Trim แล้ว · ตัดด้าน ${removeEnd === 'start' ? 'จุดเริ่ม' : 'จุดจบ'} ที่จุดตัด · ยืนยันหรือยกเลิกใน Project Browser`)
  }

  const handleCommitAlignment = () => {
    if (!alignmentPreview) return
    const result = dispatchCommandBatch(alignmentPreview.commands)
    if (result.status !== 'success') {
      setFileFeedback(result.errors?.[0] ?? 'ยืนยันการจัดแนวไม่สำเร็จ')
      return
    }
    setAlignmentPreview(null)
    if (alignmentPreview.description === 'Array' || alignmentPreview.description === 'Offset copy') {
      setSelectedIds(alignmentPreview.ids)
      setSelectedId(alignmentPreview.ids[0] ?? null)
      setRightPanelTab('properties')
    }
    if (alignmentPreview.description === 'Join' || alignmentPreview.description === 'Trim') {
      setSelectedId(alignmentPreview.sourceIds[0] ?? null)
      setSelectedIds(alignmentPreview.sourceIds[0] ? [alignmentPreview.sourceIds[0]] : [])
    }
    setFileFeedback(`${alignmentPreview.description} วัตถุแล้ว · Undo ครั้งเดียวเพื่อย้อนกลับ`)
  }
  return {
    handlePreviewArrayObjects,
    handleMoveObjectsByDelta,
    handlePreviewAlignment,
    handlePreviewOffset,
    handlePreviewMirror,
    handlePreviewSplit,
    handlePreviewJoin,
    handlePreviewTrim,
    handleCommitAlignment,
  }
}
