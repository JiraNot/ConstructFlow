import type { CommandRequest } from '@constructflow/command-schema'
import {
  isBeamObject,
  isColumnObject,
  isDoorObject,
  isGridObject,
  isWallObject,
  isWindowObject,
  resolveArchitectureSurfaceElevation,
  resolveColumnVerticalExtent,
  resolveSlabElevation,
  type Phase,
  type ProjectDocument,
  type ProjectSourceReference,
  type RemovalPhase,
  type StairModuleData,
} from '@constructflow/project-model'
import type { PropertiesPanelProps } from '../components/PropertiesPanel.types.js'
import type { useProjectSession } from './useProjectSession.js'

type ProjectSession = ReturnType<typeof useProjectSession>
type PanelActions = Pick<PropertiesPanelProps,
  | 'onAssignType'
  | 'onAssignTypeMany'
  | 'onUpdatePhase'
  | 'onUpdateSourceReferences'
  | 'onUpdateRemovalPhase'
  | 'onUpdateLevelMany'
  | 'onUpdateColumnMark'
  | 'onUpdateColumnVerticalReference'
  | 'onUpdateBeamVerticalReference'
  | 'onUpdateArchitectureSurface'
  | 'onUpdateSlab'
  | 'onUpdateRoof'
  | 'onUpdateRainwaterDesign'
  | 'onUpdatePipeRoute'
  | 'onUpdateElectricalFixture'
  | 'onAssignElectricalFixtureToCircuit'
  | 'onApplyElectricalPhaseBalance'
  | 'onUpdateCabinet'
  | 'onUpdateInteriorFurniture'
  | 'onUpdateMoulding'
  | 'onUpdateStair'
  | 'onUpdateFoundationMark'
  | 'onUpdateGridTag'
  | 'onModifyGrid'
  | 'onUpdateGridSystem'
  | 'onUpdateWallFace'
  | 'onDefineWallFinish'
  | 'onUpdateWallFinish'
  | 'onUpdateOpeningVertical'
  | 'onRehostOpening'
  | 'onUpdateOpeningInstanceParameters'
>

interface UsePropertiesPanelActionsOptions {
  project: ProjectDocument
  dispatchCommandBatch: ProjectSession['dispatchCommandBatch']
  setFileFeedback: (message: string) => void
  setSelectedId: (id: string | null) => void
  setSelectedIds: (ids: string[]) => void
}

/** Keeps property-edit command construction beside the panel contract, outside App's workbench orchestration. */
export function createPropertiesPanelActions({ project, dispatchCommandBatch, setFileFeedback, setSelectedId, setSelectedIds }: UsePropertiesPanelActionsOptions): PanelActions {
  const applyCommand = (commandName: string, input: Record<string, unknown>) => {
    const result = dispatchCommandBatch([{ name: commandName, input }])
    if (result.status !== 'success' && result.errors?.length) {
      setFileFeedback(result.errors.join(' · '))
    }
    return result
  }

  const updateDomainObject = (objectId: string, commandName: string, changes: object) => {
    const object = project.objects[objectId]
    if (!object) return
    applyCommand(commandName, { ...(object.module_data as Record<string, unknown>), ...changes, id: objectId })
  }

  const onAssignType: PropertiesPanelProps['onAssignType'] = (objectId, typeName) => {
    const object = project.objects[objectId]
    if (!object) return
    const type = project.types.find(candidate => candidate.object_type === object.object_type
      && (candidate.id.toLowerCase() === typeName.toLowerCase() || candidate.name.toLowerCase() === typeName.toLowerCase()))
    if (!type) return
    applyCommand('AssignInstanceType', { object_id: objectId, type_id: type.id, type_name: type.name })
  }
  const onAssignTypeMany: NonNullable<PropertiesPanelProps['onAssignTypeMany']> = (objectIds, typeId) => {
    const objects = [...new Set(objectIds)].map(id => project.objects[id]).filter(Boolean)
    if (objects.length < 2 || objects.some(object => object.object_type !== objects[0]!.object_type)) return
    const type = project.types.find(candidate => candidate.id === typeId && candidate.object_type === objects[0]!.object_type)
    if (!type) return
    const result = dispatchCommandBatch(objects.map(object => ({
      name: 'AssignInstanceType',
      input: { object_id: object.id, type_id: type.id, type_name: type.name },
    })))
    if (result.status !== 'success') {
      setFileFeedback(result.errors?.[0] ?? 'เปลี่ยน Type ให้หลายวัตถุไม่สำเร็จ')
      return
    }
    setSelectedIds(objects.map(object => object.id))
    setSelectedId(objects.at(-1)!.id)
    setFileFeedback(`เปลี่ยน ${objects.length} ชิ้นเป็น ${type.name} แล้ว`)
  }
  const onUpdatePhase: NonNullable<PropertiesPanelProps['onUpdatePhase']> = (objectId, newPhase: Phase) => {
    applyCommand('UpdateObjectPhase', { object_id: objectId, created_phase: newPhase })
  }
  const onUpdateRemovalPhase: NonNullable<PropertiesPanelProps['onUpdateRemovalPhase']> = (objectId, removedPhase: RemovalPhase | null) => {
    applyCommand('UpdateObjectPhase', { object_id: objectId, removed_phase: removedPhase })
  }
  const onUpdateSourceReferences: NonNullable<PropertiesPanelProps['onUpdateSourceReferences']> = (objectId, sourceRefs: ProjectSourceReference[]) => {
    applyCommand('UpdateObjectSourceReferences', { object_ids: [objectId], source_refs: sourceRefs })
  }

  const onUpdateRoof: NonNullable<PropertiesPanelProps['onUpdateRoof']> = (objectId, changes) => {
    const object = project.objects[objectId]
    if (!object || object.object_type !== 'roof.system') return
    applyCommand('UpdateRoof', { ...object.module_data, ...changes, id: objectId })
  }
  const onUpdateRainwaterDesign: NonNullable<PropertiesPanelProps['onUpdateRainwaterDesign']> = settings => {
    const result = dispatchCommandBatch([{ name: 'UpdateRainwaterDesign', input: { settings } }])
    if (result.status !== 'success') setFileFeedback(result.errors?.[0] ?? 'บันทึกข้อมูลออกแบบน้ำฝนไม่สำเร็จ')
    else setFileFeedback('บันทึกข้อมูลออกแบบน้ำฝนของโครงการแล้ว · ใช้คำนวณหลังคาทุกผืน')
  }
  const onUpdateLevelMany: NonNullable<PropertiesPanelProps['onUpdateLevelMany']> = (objectIds, levelId) => {
    const targetLevel = project.levels.find(level => level.id === levelId)
    if (!targetLevel) return
    const commands: CommandRequest[] = []
    for (const objectId of [...new Set(objectIds)]) {
      const object = project.objects[objectId]
      if (!object) continue
      const data = object.module_data as Record<string, unknown>
      if (isBeamObject(object)) {
        commands.push({ name: 'UpdateBeamVerticalReference', input: { object_id: objectId, level_id: levelId, base_offset_mm: Number(data.base_offset_mm ?? 0) } })
      } else if (isColumnObject(object)) {
        const oldBaseLevel = project.levels.find(level => level.id === data.base_level_id)
        const oldTopLevel = project.levels.find(level => level.id === data.top_level_id)
        if (oldBaseLevel && resolveColumnVerticalExtent(project, object)) {
          const oldFallbackTop = oldTopLevel ?? project.levels.filter(level => level.elevation_mm > oldBaseLevel.elevation_mm).sort((a, b) => a.elevation_mm - b.elevation_mm)[0]
          const storeyDelta = oldFallbackTop ? oldFallbackTop.storey_index - oldBaseLevel.storey_index : 1
          const newTopLevel = project.levels.find(level => level.storey_index === targetLevel.storey_index + storeyDelta)
          commands.push({ name: 'UpdateColumnVerticalReference', input: {
            object_id: objectId,
            base_level_id: levelId,
            ...(newTopLevel ? { top_level_id: newTopLevel.id } : { top_level_id: null }),
            base_offset_mm: Number(data.base_offset_mm ?? 0),
            top_offset_mm: Number(data.top_offset_mm ?? 0),
          } })
        }
      } else if (object.object_type === 'structure.slab' || object.object_type === 'architecture.floor' || object.object_type === 'architecture.ceiling') {
        const oldLevel = project.levels.find(level => level.id === data.level_id)
        const worldElevation = object.object_type === 'structure.slab' ? resolveSlabElevation(project, object) : resolveArchitectureSurfaceElevation(project, object)
        if (worldElevation !== undefined && oldLevel) {
          const command = object.object_type === 'structure.slab' ? 'UpdateSlab' : object.object_type === 'architecture.floor' ? 'UpdateArchitecturalFloor' : 'UpdateCeiling'
          const elevationOffset = Number(data.elevation_offset_mm ?? (worldElevation - oldLevel.elevation_mm))
          commands.push({ name: command, input: { ...data, id: objectId, level_id: levelId, elevation_offset_mm: elevationOffset, elevation_mm: targetLevel.elevation_mm + elevationOffset, ...(object.object_type !== 'structure.slab' ? { elevation_reference: 'level' } : {}) } })
        }
      }
    }
    if (!commands.length) return
    const result = dispatchCommandBatch(commands)
    if (result.status !== 'success') setFileFeedback(result.errors?.[0] ?? 'เปลี่ยนระดับให้วัตถุที่เลือกไม่สำเร็จ')
    else setFileFeedback(`ย้าย ${commands.length} ชิ้นไปยัง ${targetLevel.name} แล้ว`)
  }
  const onUpdateArchitectureSurface: NonNullable<PropertiesPanelProps['onUpdateArchitectureSurface']> = (objectId, changes) => {
    const object = project.objects[objectId]
    if (!object || (object.object_type !== 'architecture.floor' && object.object_type !== 'architecture.ceiling')) return
    const data = object.module_data as Record<string, unknown>
    const oldLevelId = typeof data.level_id === 'string' ? data.level_id : project.project.active_level_id
    const levelId = changes.level_id ?? oldLevelId
    const level = project.levels.find(item => item.id === levelId)
    if (!level) { setFileFeedback(`ไม่พบระดับชั้น ${levelId}`); return }
    const oldLevel = project.levels.find(item => item.id === oldLevelId)
    const worldElevation = resolveArchitectureSurfaceElevation(project, object) ?? Number(data.elevation_mm ?? 0)
    const currentOffset = worldElevation - Number(oldLevel?.elevation_mm ?? 0)
    const offset = changes.elevation_offset_mm ?? currentOffset
    const command = object.object_type === 'architecture.floor' ? 'UpdateArchitecturalFloor' : 'UpdateCeiling'
    applyCommand(command, { ...data, ...changes, id: objectId, level_id: levelId, elevation_reference: 'level', elevation_offset_mm: offset, elevation_mm: level.elevation_mm + offset })
  }
  const onUpdateSlab: NonNullable<PropertiesPanelProps['onUpdateSlab']> = (objectId, changes) => {
    const object = project.objects[objectId]
    if (!object || object.object_type !== 'structure.slab') return
    const data = object.module_data as Record<string, unknown>
    const oldLevelId = typeof data.level_id === 'string' ? data.level_id : project.project.active_level_id
    const levelId = changes.level_id ?? oldLevelId
    const level = project.levels.find(item => item.id === levelId)
    if (!level) { setFileFeedback(`ไม่พบระดับชั้น ${levelId}`); return }
    const oldLevel = project.levels.find(item => item.id === oldLevelId)
    const currentResolved = Number(data.elevation_mm ?? (oldLevel ? oldLevel.elevation_mm + Number(data.elevation_offset_mm ?? 0) : 0))
    const currentOffset = Number(data.elevation_offset_mm ?? (oldLevel ? currentResolved - oldLevel.elevation_mm : 0))
    const offset = changes.elevation_offset_mm !== undefined ? changes.elevation_offset_mm : currentOffset
    applyCommand('UpdateSlab', { ...data, ...changes, id: objectId, level_id: levelId, elevation_offset_mm: offset, elevation_mm: level.elevation_mm + offset })
  }
  const onUpdateStair: NonNullable<PropertiesPanelProps['onUpdateStair']> = (objectId, changes: Partial<StairModuleData>) => {
    applyCommand('UpdateStair', { ...changes, id: objectId })
  }
  const onUpdateColumnMark: PropertiesPanelProps['onUpdateColumnMark'] = (objectId, newMark) => {
    applyCommand('UpdateColumnMark', { object_id: objectId, mark: newMark })
  }
  const onUpdateColumnVerticalReference: PropertiesPanelProps['onUpdateColumnVerticalReference'] = (objectId, changes) => {
    const result = applyCommand('UpdateColumnVerticalReference', { object_id: objectId, ...changes })
    if (result.status !== 'success' && result.errors?.length) window.alert(result.errors.join('\n'))
  }
  const onUpdateBeamVerticalReference: PropertiesPanelProps['onUpdateBeamVerticalReference'] = (objectId, changes) => {
    const result = applyCommand('UpdateBeamVerticalReference', { object_id: objectId, ...changes })
    if (result.status !== 'success' && result.errors?.length) window.alert(result.errors.join('\n'))
  }
  const onUpdateFoundationMark: PropertiesPanelProps['onUpdateFoundationMark'] = (objectId, newMark) => {
    applyCommand('UpdateFoundationMark', { object_id: objectId, mark: newMark })
  }
  const onUpdateGridTag: PropertiesPanelProps['onUpdateGridTag'] = (objectId, newTag) => {
    applyCommand('UpdateGridTag', { object_id: objectId, tag: newTag })
  }
  const onModifyGrid: PropertiesPanelProps['onModifyGrid'] = (objectId, changes) => {
    const result = applyCommand('ModifyGrid', { object_id: objectId, ...changes })
    if (result.status !== 'success' && result.errors?.length) window.alert(result.errors.join('\n'))
  }
  const onUpdateGridSystem: PropertiesPanelProps['onUpdateGridSystem'] = (systemId, changes) => {
    const members = Object.values(project.objects).filter(isGridObject)
      .filter(object => object.module_data.system_id === systemId)
      .sort((a, b) => (a.module_data.system_index ?? 0) - (b.module_data.system_index ?? 0))
    const member = members[0]
    if (!member) return
    const positions_mm = changes.positions_mm ?? members.map(object => object.module_data.position_mm)
    const gridIds = Array.from({ length: positions_mm.length }, (_, index) => members[index]?.id ?? crypto.randomUUID())
    applyCommand('UpdateGridSystem', { system_id: systemId, grid_ids: gridIds, positions_mm, first_tag: changes.first_tag ?? member.module_data.system_first_tag ?? member.module_data.tag })
  }
  const onUpdateWallFace: PropertiesPanelProps['onUpdateWallFace'] = (objectId, changes) => {
    const wall = project.objects[objectId]
    if (!isWallObject(wall)) return
    applyCommand('UpdateWallDimensions', { object_id: objectId, thickness_mm: wall.module_data.thickness_mm, ...changes })
  }
  const onDefineWallFinish: NonNullable<PropertiesPanelProps['onDefineWallFinish']> = (name, parameters) => {
    const result = dispatchCommandBatch([{ name: 'DefineStructuralType', input: { id: crypto.randomUUID(), name, object_type: 'architecture.wall_finish', parameters } }])
    if (result.status !== 'success') setFileFeedback(result.errors?.join(' · ') ?? 'เพิ่มชนิดผิวไม่สำเร็จ')
  }
  const onUpdateWallFinish: NonNullable<PropertiesPanelProps['onUpdateWallFinish']> = (typeId, name, parameters) => {
    const finish = project.types.find(type => type.id === typeId && type.object_type === 'architecture.wall_finish')
    if (!finish) return
    const commands: CommandRequest[] = []
    if (name.trim() && name.trim() !== finish.name) commands.push({ name: 'RenameCatalogType', input: { type_id: typeId, name: name.trim() } })
    commands.push({ name: 'UpdateStructuralTypeDimensions', input: { type_id_or_name: typeId, object_type: 'architecture.wall_finish', parameters } })
    const result = dispatchCommandBatch(commands)
    if (result.status !== 'success') setFileFeedback(result.errors?.join(' · ') ?? 'แก้ชนิดผิวไม่สำเร็จ')
  }
  const onUpdateOpeningVertical: PropertiesPanelProps['onUpdateOpeningVertical'] = (objectId, changes) => {
    const opening = project.objects[objectId]
    if (!opening || (!isDoorObject(opening) && !isWindowObject(opening))) return
    const data = opening.module_data
    const isFixed = changes.vertical_constraint === 'fixed_height' || changes.head_level_id === '' || changes.head_level_id === null
    applyCommand(isDoorObject(opening) ? 'UpdateDoorDimensions' : 'UpdateWindowDimensions', {
      object_id: objectId,
      width_mm: data.width_mm,
      height_mm: changes.height_mm ?? data.height_mm,
      ...(isWindowObject(opening) ? { sill_height_mm: changes.sill_height_mm ?? data.sill_height_mm } : {}),
      ...changes,
      ...(isFixed ? { head_level_id: '', vertical_constraint: 'fixed_height' } : {}),
    })
  }
  const onUpdateOpeningInstanceParameters: NonNullable<PropertiesPanelProps['onUpdateOpeningInstanceParameters']> = (objectId, parameters) => {
    applyCommand('UpdateOpeningInstanceParameters', { object_id: objectId, parameters })
  }
  const onRehostOpening: NonNullable<PropertiesPanelProps['onRehostOpening']> = (objectId, wallId, offsetAlongWallMm) => {
    applyCommand('RehostOpening', { object_id: objectId, wall_id: wallId, offset_along_wall_mm: offsetAlongWallMm })
  }

  return {
    onAssignType,
    onAssignTypeMany,
    onUpdatePhase,
    onUpdateSourceReferences,
    onUpdateRemovalPhase,
    onUpdateLevelMany,
    onUpdateColumnMark,
    onUpdateColumnVerticalReference,
    onUpdateBeamVerticalReference,
    onUpdateArchitectureSurface,
    onUpdateSlab,
    onUpdateRoof,
    onUpdateRainwaterDesign,
    onUpdatePipeRoute: (objectId, changes) => updateDomainObject(objectId, 'EditPipeRoute', changes),
    onUpdateElectricalFixture: (objectId, changes) => updateDomainObject(objectId, 'UpdateElectricalFixture', changes),
    onAssignElectricalFixtureToCircuit: (fixtureId, circuitId) => {
      const result = dispatchCommandBatch([{ name: 'AssignFixtureToCircuit', input: { fixture_id: fixtureId, circuit_id: circuitId } }])
      if (result.status !== 'success') setFileFeedback(result.errors?.[0] ?? 'กำหนดวงจรให้กับอุปกรณ์ไฟฟ้าไม่สำเร็จ')
    },
    onApplyElectricalPhaseBalance: assignments => {
      const commands = Object.entries(assignments).flatMap(([circuitId, phase_assignment]) => {
        const circuit = project.objects[circuitId]
        if (!circuit || circuit.object_type !== 'electrical.circuit' || circuit.removed_phase !== null) return []
        return [{ name: 'UpdateCircuit', input: { ...(circuit.module_data as Record<string, unknown>), id: circuitId, phase_assignment } }]
      })
      if (!commands.length) return
      const result = dispatchCommandBatch(commands)
      if (result.status !== 'success') setFileFeedback(result.errors?.[0] ?? 'กำหนดเฟสวงจรไฟฟ้าไม่สำเร็จ')
      else setFileFeedback(`กำหนดเฟสให้ ${commands.length} วงจรแล้ว`)
    },
    onUpdateCabinet: (objectId, changes) => updateDomainObject(objectId, 'UpdateCabinetRun', changes),
    onUpdateInteriorFurniture: (objectId, changes) => updateDomainObject(objectId, 'UpdateInteriorFurniture', changes),
    onUpdateMoulding: (objectId, changes) => updateDomainObject(objectId, 'UpdateMouldingRun', changes),
    onUpdateStair,
    onUpdateFoundationMark,
    onUpdateGridTag,
    onModifyGrid,
    onUpdateGridSystem,
    onUpdateWallFace,
    onDefineWallFinish,
    onUpdateWallFinish,
    onUpdateOpeningVertical,
    onRehostOpening,
    onUpdateOpeningInstanceParameters,
  }
}
