import { SmartObject, ColumnModuleData, FoundationModuleData, GridModuleData, BeamModuleData, resolveCatalogType, catalogInstanceOverrides, isColumnObject, isFoundationObject, isGridObject, isBeamObject, resolveColumnVerticalExtent, resolveBeamBaseElevation, type ProjectDocument } from '@constructflow/project-model'
import { CreateColumnInput, MoveColumnInput, UpdateColumnMarkInput, UpdateColumnVerticalReferenceInput, CreateFoundationInput, CreateGridInput, CreateGridSystemInput, UpdateGridSystemInput, ModifyGridInput, CreateBeamInput, UpdateBeamMarkInput, UpdateBeamDimensionsInput, UpdateBeamEndpointsInput, UpdateBeamVerticalReferenceInput, UpdateColumnDimensionsInput, UpdateFoundationDimensionsInput } from '@constructflow/command-schema'

import { CommandHandlerContext, CommandBusResult } from '@constructflow/command-schema'
export * from './construction.js'

function tuple2(value: unknown, fallback: [number, number]): [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every(item => typeof item === 'number' && Number.isFinite(item))
    ? [value[0], value[1]]
    : fallback
}

function tuple3(value: unknown, fallback: [number, number, number]): [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every(item => typeof item === 'number' && Number.isFinite(item))
    ? [value[0], value[1], value[2]]
    : fallback
}

function catalogString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function gridSystemTag(firstTag: string, index: number): string {
  if (/^\d+$/.test(firstTag)) return String(Number(firstTag) + index)
  if (/^[A-Za-z]+$/.test(firstTag)) {
    const base = firstTag.toUpperCase().split('').reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0) - 1
    let value = base + index
    let tag = ''
    do { tag = String.fromCharCode(65 + value % 26) + tag; value = Math.floor(value / 26) - 1 } while (value >= 0)
    return tag
  }
  return index === 0 ? firstTag : `${firstTag}${index + 1}`
}

/** Reconcile structural objects whose vertical placement is driven by a changed level. */
export function reconcileStructuralLevelElevation(previous: ProjectDocument, updated: ProjectDocument, levelId: string, now: string): string[] {
  const previousLevel = previous.levels.find(level => level.id === levelId)
  const updatedLevel = updated.levels.find(level => level.id === levelId)
  if (!previousLevel || !updatedLevel) return []
  const delta = updatedLevel.elevation_mm - previousLevel.elevation_mm
  if (delta === 0) return []
  const affected = new Set<string>()

  for (const object of Object.values(updated.objects)) {
    if (!isColumnObject(object)) continue
    const data = object.module_data
    if (data.top_level_id !== levelId) continue
    const topElevation = updatedLevel.elevation_mm + (data.top_offset_mm ?? 0)
    updated.objects[object.id] = {
      ...object,
      module_data: { ...data, top_elevation_mm: topElevation },
      updated_at: now,
    }
    affected.add(object.id)
  }

  for (const object of Object.values(updated.objects)) {
    if (!isBeamObject(object)) continue
    const data = object.module_data
    const start = [...data.start_point_mm] as [number, number, number]
    const end = [...data.end_point_mm] as [number, number, number]
    let changed = false
    if (data.level_id === levelId) {
      start[2] += delta
      end[2] += delta
      changed = true
    }
    for (const [columnId, point] of [[data.start_column_id, start], [data.end_column_id, end]] as const) {
      const column = columnId ? updated.objects[columnId] : undefined
      if (!column || !isColumnObject(column) || column.module_data.top_level_id !== levelId) continue
      point[2] = updatedLevel.elevation_mm + (column.module_data.top_offset_mm ?? 0)
      changed = true
    }
    if (!changed) continue
    const span_mm = Math.round(Math.hypot(end[0] - start[0], end[1] - start[1]))
    updated.objects[object.id] = {
      ...object,
      module_data: { ...data, start_point_mm: start, end_point_mm: end, span_mm },
      updated_at: now,
    }
    affected.add(object.id)
  }
  return [...affected]
}

export function executeStructureCommand(context: CommandHandlerContext): CommandBusResult | undefined {
  const { project, updated, commandName, input, command_id, now, envelope } = context
  switch (commandName) {
    case 'CreateGrid': {
      const gridInput = input as unknown as CreateGridInput
      const id = gridInput.id || crypto.randomUUID()
      const smartObject: SmartObject<GridModuleData> = {
        id,
        object_type: 'structure.grid',
        owner_module: 'constructflow.structure',
        schema_version: 1,
        created_phase: gridInput.phase || project.project.active_phase,
        removed_phase: null,
        level_refs: [{ role: 'host_level', level_id: project.project.active_level_id }],
        host_refs: [],
        connector_refs: [],
        status: 'active',
        module_data: {
          tag: gridInput.tag,
          orientation: gridInput.orientation,
          position_mm: gridInput.position_mm,
          extent_mm: gridInput.extent_mm || [-10000, 15000],
          ...(gridInput.start_point_mm && gridInput.end_point_mm ? { start_point_mm: gridInput.start_point_mm, end_point_mm: gridInput.end_point_mm } : {}),
          bubble_visible: gridInput.bubble_visible ?? true, auto_tag: gridInput.auto_tag ?? true, sequence_style: gridInput.sequence_style ?? 'auto',
        },
        created_at: now,
        updated_at: now,
      }
      updated.objects[id] = smartObject

      return {
        result: {
          status: 'success',
          command_id,
          command_name: commandName,
          affected_object_ids: [id],
          created_object_ids: [id],
        },
        updatedProject: updated,
        emittedEnvelope: { ...envelope, input: { ...gridInput, id } },
      }
    }

    case 'CreateGridSystem': {
      const system = input as unknown as CreateGridSystemInput
      const positions = system.positions_mm ?? (Number.isFinite(system.origin_mm) && Number.isFinite(system.spacing_mm) && system.spacing_mm > 0 && Number.isInteger(system.count)
        ? Array.from({ length: system.count }, (_, index) => system.origin_mm + index * system.spacing_mm) : [])
      if (!system.id || !['vertical', 'horizontal'].includes(system.orientation) || !system.first_tag?.trim() || positions.length < 1 || positions.length > 100 || positions.some((position, index) => !Number.isFinite(position) || (index > 0 && position <= positions[index - 1]))) {
        return { result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: ['Grid system requires a positive spacing, 1–100 lines, and a starting tag'] }, updatedProject: project }
      }
      const ids: string[] = []
      const spacing = positions.length > 1 ? (positions[1]! - positions[0]!) : (system.spacing_mm || 0)
      for (let index = 0; index < positions.length; index++) {
        const id = system.grid_ids?.[index] || crypto.randomUUID()
        ids.push(id)
        updated.objects[id] = {
          id, object_type: 'structure.grid', owner_module: 'constructflow.structure', schema_version: 1,
          created_phase: system.phase || project.project.active_phase, removed_phase: null,
          level_refs: [{ role: 'host_level', level_id: project.project.active_level_id }], host_refs: [], connector_refs: [], status: 'active',
          module_data: {
            tag: gridSystemTag(system.first_tag.trim(), index), orientation: system.orientation,
            position_mm: positions[index]!, extent_mm: system.extent_mm || [-10000, 15000],
            system_id: system.id, system_index: index, system_origin_mm: positions[0]!,
            system_spacing_mm: spacing, system_count: positions.length, system_first_tag: system.first_tag.trim(), system_positions_mm: positions,
          }, created_at: now, updated_at: now,
        }
      }
      return {
        result: { status: 'success', command_id, command_name: commandName, affected_object_ids: ids, created_object_ids: ids },
        updatedProject: updated,
        emittedEnvelope: { ...envelope, input: { ...system, id: system.id, grid_ids: ids } },
      }
    }

    case 'UpdateGridSystem': {
      const system = input as unknown as UpdateGridSystemInput
      const members = Object.values(updated.objects).filter(isGridObject).filter(object => object.module_data.system_id === system.system_id).sort((a, b) => (a.module_data.system_index ?? 0) - (b.module_data.system_index ?? 0))
      if (!members.length) return { result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: [`Grid system ${system.system_id} not found`] }, updatedProject: project }
      const first = members[0]!
      const firstTag = system.first_tag?.trim() || first.module_data.system_first_tag || first.module_data.tag
      const positions = system.positions_mm ?? (Number.isFinite(system.origin_mm) && Number.isFinite(system.spacing_mm) && Number(system.spacing_mm) > 0 && Number.isInteger(system.count)
        ? Array.from({ length: system.count! }, (_, index) => system.origin_mm! + index * system.spacing_mm!)
        : members.map(member => member.module_data.position_mm))
      if (!system.system_id || !firstTag || positions.length < 1 || positions.length > 100 || positions.some((position, index) => !Number.isFinite(position) || (index > 0 && position <= positions[index - 1]))) {
        return { result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: ['Grid system requires increasing positions and 1–100 lines'] }, updatedProject: project }
      }
      const ids: string[] = []
      const count = positions.length
      const spacing = count > 1 ? positions[1]! - positions[0]! : Number(system.spacing_mm ?? first.module_data.system_spacing_mm ?? 0)
      for (let index = 0; index < count; index++) {
        const existing = members[index]
        const id = system.grid_ids?.[index] ?? existing?.id ?? crypto.randomUUID()
        ids.push(id)
        const module_data: GridModuleData = {
          ...(existing?.module_data ?? first.module_data), tag: gridSystemTag(firstTag, index),
          position_mm: positions[index]!, system_id: system.system_id,
          system_index: index, system_origin_mm: positions[0]!, system_spacing_mm: spacing,
          system_count: count, system_first_tag: firstTag, system_positions_mm: positions,
        }
        updated.objects[id] = existing ? { ...existing, module_data, updated_at: now } : {
          ...first, id, module_data, created_at: now, updated_at: now,
        }
      }
      const removed = members.slice(count).map(member => member.id)
      for (const id of removed) delete updated.objects[id]
      const affected = [...ids, ...removed]
      return {
        result: { status: 'success', command_id, command_name: commandName, affected_object_ids: affected, updated_object_ids: ids, deleted_object_ids: removed },
        updatedProject: updated,
        emittedEnvelope: { ...envelope, input: { ...system, grid_ids: ids } },
      }
    }

    case 'CreateColumn': {
      const colInput = input as unknown as CreateColumnInput
      const id = colInput.id || crypto.randomUUID()

      // Default structural column type mark is C1
      const mark = colInput.mark || 'C1'

      // Resolve section dimensions from project types catalog if not passed
      const typeDef = updated.types.find(
        (t) => t.object_type === 'structure.column' && (colInput.type_id ? t.id === colInput.type_id : t.name.toLowerCase() === mark.toLowerCase())
      )
      const section_mm: [number, number] = colInput.section_mm || tuple2(typeDef?.parameters.section_mm, [200, 200])
      const material = colInput.material || catalogString(typeDef?.parameters.material, 'reinforced_concrete')
      const plaster_thickness_mm = Math.max(0, Number(typeDef?.parameters.plaster_thickness_mm ?? 0))

      const location_mm: [number, number, number] = colInput.location_mm.length === 2
        ? [colInput.location_mm[0], colInput.location_mm[1], 0]
        : (colInput.location_mm as [number, number, number])
      const baseLevelId = colInput.base_level_id || project.project.active_level_id
      if (!updated.levels.some(level => level.id === baseLevelId)) {
        return { result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: [`Column base level ${baseLevelId} does not exist`] }, updatedProject: project }
      }
      if (colInput.top_level_id && !updated.levels.some(level => level.id === colInput.top_level_id)) {
        return { result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: [`Column top level ${colInput.top_level_id} does not exist`] }, updatedProject: project }
      }
      if (!resolveColumnVerticalExtent(updated, {
        base_level_id: baseLevelId,
        top_level_id: colInput.top_level_id,
        base_offset_mm: colInput.base_offset_mm ?? 0,
        top_offset_mm: colInput.top_offset_mm ?? 0,
        base_elevation_mm: colInput.base_elevation_mm,
        top_elevation_mm: colInput.top_elevation_mm,
        location_mm,
      })) {
        return { result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: ['Column top level and offsets must result in a positive height above the base level'] }, updatedProject: project }
      }

      const smartObject: SmartObject<ColumnModuleData> = {
        id,
        object_type: 'structure.column',
        owner_module: 'constructflow.structure',
        schema_version: 1,
        created_phase: colInput.phase || project.project.active_phase,
        removed_phase: null,
        level_refs: [
          { role: 'base_level', level_id: baseLevelId },
          ...(colInput.top_level_id ? [{ role: 'top_level' as const, level_id: colInput.top_level_id }] : []),
        ],
        host_refs: [],
        connector_refs: [],
        status: 'active',
        module_data: {
          mark,
          type_id: typeDef?.id,
          instance_overrides: catalogInstanceOverrides('structure.column', { section_mm, material, plaster_thickness_mm }, typeDef),
          location_mm,
          section_mm,
          plaster_thickness_mm,
          rotation_deg: colInput.rotation_deg || 0,
          base_level_id: baseLevelId,
          ...(colInput.top_level_id ? { top_level_id: colInput.top_level_id } : {}),
          base_offset_mm: colInput.base_offset_mm ?? 0,
          top_offset_mm: colInput.top_offset_mm ?? 0,
          ...(colInput.base_elevation_mm !== undefined ? { base_elevation_mm: colInput.base_elevation_mm } : {}),
          ...(colInput.top_elevation_mm !== undefined ? { top_elevation_mm: colInput.top_elevation_mm } : {}),
          material,
          engineering_status: colInput.engineering_status || 'preliminary',
        },
        created_at: now,
        updated_at: now,
      }
      updated.objects[id] = smartObject

      return {
        result: {
          status: 'success',
          command_id,
          command_name: commandName,
          affected_object_ids: [id],
          created_object_ids: [id],
        },
        updatedProject: updated,
        emittedEnvelope: { ...envelope, input: { ...colInput, id, mark, location_mm, section_mm } },
      }
    }

    case 'MoveColumn': {
      const moveInput = input as unknown as MoveColumnInput
      const target = updated.objects[moveInput.object_id]
      if (!target || !isColumnObject(target)) {
        return {
          result: {
            status: 'rejected',
            command_id,
            command_name: commandName,
            affected_object_ids: [],
            errors: [`Column UUID ${moveInput.object_id} not found`],
          },
          updatedProject: project,
        }
      }

      const newLocation: [number, number, number] = moveInput.location_mm.length === 2
        ? [moveInput.location_mm[0], moveInput.location_mm[1], target.module_data.location_mm[2] || 0]
        : (moveInput.location_mm as [number, number, number])

      updated.objects[moveInput.object_id] = {
        ...target,
        updated_at: now,
        module_data: {
          ...target.module_data,
          location_mm: newLocation,
        },
      }

      const affected = [moveInput.object_id]

      // Keep hosted beam endpoints associative with the moved column.
      for (const beam of Object.values(updated.objects)) {
        if (!isBeamObject(beam)) continue
        const data = beam.module_data
        const start = [...data.start_point_mm] as [number, number, number]
        const end = [...data.end_point_mm] as [number, number, number]
        let changed = false
        if (data.start_column_id === moveInput.object_id) {
          start[0] = newLocation[0]; start[1] = newLocation[1]; changed = true
        }
        if (data.end_column_id === moveInput.object_id) {
          end[0] = newLocation[0]; end[1] = newLocation[1]; changed = true
        }
        if (changed) {
          updated.objects[beam.id] = {
            ...beam,
            module_data: { ...data, start_point_mm: start, end_point_mm: end, span_mm: Math.round(Math.hypot(end[0] - start[0], end[1] - start[1])) },
            updated_at: now,
          }
          affected.push(beam.id)
        }
      }

      // Automatically relocate any foundation hosted on this column
      for (const rel of updated.relationships) {
        if (rel.kind === 'supports' && rel.target_id === moveInput.object_id) {
          const fObj = updated.objects[rel.source_id]
          if (fObj && isFoundationObject(fObj)) {
            updated.objects[fObj.id] = {
              ...fObj,
              updated_at: now,
              module_data: {
                ...fObj.module_data,
                center_mm: newLocation,
              },
            }
            affected.push(fObj.id)
          }
        }
      }

      return {
        result: {
          status: 'success',
          command_id,
          command_name: commandName,
          affected_object_ids: affected,
          updated_object_ids: affected,
        },
        updatedProject: updated,
        emittedEnvelope: { ...envelope, input: { ...moveInput, location_mm: newLocation } },
      }
    }

    case 'UpdateColumnMark': {
      const markInput = input as unknown as UpdateColumnMarkInput
      const target = updated.objects[markInput.object_id]
      if (!target || !isColumnObject(target)) {
        return {
          result: {
            status: 'rejected',
            command_id,
            command_name: commandName,
            affected_object_ids: [],
            errors: [`Column UUID ${markInput.object_id} not found`],
          },
          updatedProject: project,
        }
      }

      updated.objects[markInput.object_id] = {
        ...target,
        updated_at: now,
        module_data: {
          ...target.module_data,
          mark: markInput.mark,
        },
      }

      return {
        result: {
          status: 'success',
          command_id,
          command_name: commandName,
          affected_object_ids: [markInput.object_id],
          updated_object_ids: [markInput.object_id],
        },
        updatedProject: updated,
        emittedEnvelope: envelope,
      }
    }

    case 'UpdateColumnVerticalReference': {
      const verticalInput = input as unknown as UpdateColumnVerticalReferenceInput
      const target = updated.objects[verticalInput.object_id]
      if (!target || !isColumnObject(target)) {
        return { result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: [`Column UUID ${verticalInput.object_id} not found`] }, updatedProject: project }
      }
      const current = target.module_data
      const baseLevelId = verticalInput.base_level_id ?? current.base_level_id
      const topLevelId = verticalInput.top_level_id === null ? undefined : verticalInput.top_level_id ?? current.top_level_id
      const baseOffset = verticalInput.base_offset_mm ?? current.base_offset_mm ?? 0
      const topOffset = verticalInput.top_offset_mm ?? current.top_offset_mm ?? 0
      if (!updated.levels.some(level => level.id === baseLevelId)) {
        return { result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: [`Column base level ${baseLevelId} does not exist`] }, updatedProject: project }
      }
      if (topLevelId && !updated.levels.some(level => level.id === topLevelId)) {
        return { result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: [`Column top level ${topLevelId} does not exist`] }, updatedProject: project }
      }
      const moduleData = { ...current, base_level_id: baseLevelId, ...(topLevelId ? { top_level_id: topLevelId } : {}), base_offset_mm: baseOffset, top_offset_mm: topOffset }
      if (!topLevelId) delete moduleData.top_level_id
      delete moduleData.base_elevation_mm
      delete moduleData.top_elevation_mm
      if (!resolveColumnVerticalExtent(updated, moduleData)) {
        return { result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: ['Column top level and offsets must result in a positive height above the base level'] }, updatedProject: project }
      }
      const levelRefs = [
        ...target.level_refs.filter(reference => reference.role !== 'base_level' && reference.role !== 'top_level'),
        { role: 'base_level' as const, level_id: baseLevelId },
        ...(topLevelId ? [{ role: 'top_level' as const, level_id: topLevelId }] : []),
      ]
      updated.objects[target.id] = { ...target, level_refs: levelRefs, module_data: moduleData, updated_at: now }
      return {
        result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [target.id], updated_object_ids: [target.id] },
        updatedProject: updated,
        emittedEnvelope: envelope,
      }
    }

    case 'UpdateFoundationMark': {
      const markInput = input as unknown as { object_id: string; mark: string }
      const target = updated.objects[markInput.object_id]
      if (!target || !isFoundationObject(target)) {
        return {
          result: {
            status: 'rejected',
            command_id,
            command_name: commandName,
            affected_object_ids: [],
            errors: [`Foundation UUID ${markInput.object_id} not found`],
          },
          updatedProject: project,
        }
      }

      updated.objects[markInput.object_id] = {
        ...target,
        updated_at: now,
        module_data: {
          ...target.module_data,
          mark: markInput.mark,
        },
      }

      return {
        result: {
          status: 'success',
          command_id,
          command_name: commandName,
          affected_object_ids: [markInput.object_id],
          updated_object_ids: [markInput.object_id],
        },
        updatedProject: updated,
        emittedEnvelope: envelope,
      }
    }

    case 'ModifyGrid': {
      const changes = input as unknown as ModifyGridInput
      const target = updated.objects[changes.object_id]
      if (!target || !isGridObject(target)) return { result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: [`Grid UUID ${changes.object_id} not found`] }, updatedProject: project }
      if (target.module_data.system_id) return { result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: ['Edit grid-system members through the Grid Line System properties'] }, updatedProject: project }
      const data = { ...target.module_data }
      if (changes.start_point_mm !== undefined || changes.end_point_mm !== undefined) {
        const start = changes.start_point_mm ?? data.start_point_mm
        const end = changes.end_point_mm ?? data.end_point_mm
        if (!start || !end || [...start, ...end].some(value => !Number.isFinite(value)) || Math.hypot(end[0] - start[0], end[1] - start[1]) < 1) return { result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: ['Grid endpoints must define a finite line at least 1 mm long'] }, updatedProject: project }
        const dx = end[0] - start[0], dy = end[1] - start[1]
        const orientation = Math.abs(dx) <= Math.abs(dy) ? 'vertical' : 'horizontal'
        Object.assign(data, { start_point_mm: start, end_point_mm: end, orientation,
          position_mm: orientation === 'vertical' ? (start[0] + end[0]) / 2 : (start[1] + end[1]) / 2,
          extent_mm: orientation === 'vertical' ? [Math.min(start[1], end[1]), Math.max(start[1], end[1])] : [Math.min(start[0], end[0]), Math.max(start[0], end[0])] })
      }
      if (changes.position_mm !== undefined) {
        if (!Number.isFinite(changes.position_mm)) return { result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: ['Grid position must be finite'] }, updatedProject: project }
        data.position_mm = changes.position_mm
        if (data.start_point_mm && data.end_point_mm) {
          const delta = changes.position_mm - (data.orientation === 'vertical' ? (data.start_point_mm[0] + data.end_point_mm[0]) / 2 : (data.start_point_mm[1] + data.end_point_mm[1]) / 2)
          data.start_point_mm = data.orientation === 'vertical' ? [data.start_point_mm[0] + delta, data.start_point_mm[1]] : [data.start_point_mm[0], data.start_point_mm[1] + delta]
          data.end_point_mm = data.orientation === 'vertical' ? [data.end_point_mm[0] + delta, data.end_point_mm[1]] : [data.end_point_mm[0], data.end_point_mm[1] + delta]
        }
      }
      if (changes.extent_mm) {
        if (changes.extent_mm.some(value => !Number.isFinite(value)) || changes.extent_mm[0] === changes.extent_mm[1]) return { result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: ['Grid extent must be finite and nonzero'] }, updatedProject: project }
        data.extent_mm = changes.extent_mm
        if (data.start_point_mm && data.end_point_mm) data.start_point_mm = data.orientation === 'vertical' ? [data.start_point_mm[0], changes.extent_mm[0]] : [changes.extent_mm[0], data.start_point_mm[1]], data.end_point_mm = data.orientation === 'vertical' ? [data.end_point_mm[0], changes.extent_mm[1]] : [changes.extent_mm[1], data.end_point_mm[1]]
      }
      if (changes.tag !== undefined) { if (!changes.tag.trim()) return { result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: ['Grid label cannot be empty'] }, updatedProject: project }; data.tag = changes.tag.trim(); data.auto_tag = false }
      if (changes.bubble_visible !== undefined) data.bubble_visible = changes.bubble_visible
      if (changes.auto_tag !== undefined) data.auto_tag = changes.auto_tag
      if (changes.sequence_style !== undefined) data.sequence_style = changes.sequence_style
      updated.objects[target.id] = { ...target, module_data: data, updated_at: now }
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [target.id], updated_object_ids: [target.id] }, updatedProject: updated, emittedEnvelope: envelope }
    }

    case 'UpdateGridTag': {
      const tagInput = input as unknown as { object_id: string; tag: string }
      const target = updated.objects[tagInput.object_id]
      if (!target || !isGridObject(target)) {
        return {
          result: {
            status: 'rejected',
            command_id,
            command_name: commandName,
            affected_object_ids: [],
            errors: [`Grid UUID ${tagInput.object_id} not found`],
          },
          updatedProject: project,
        }
      }

      updated.objects[tagInput.object_id] = {
        ...target,
        updated_at: now,
        module_data: {
          ...target.module_data,
          tag: tagInput.tag,
          auto_tag: false,
        },
      }

      return {
        result: {
          status: 'success',
          command_id,
          command_name: commandName,
          affected_object_ids: [tagInput.object_id],
          updated_object_ids: [tagInput.object_id],
        },
        updatedProject: updated,
        emittedEnvelope: envelope,
      }
    }

    case 'CreateFoundation': {
      const fInput = input as unknown as CreateFoundationInput
      const column = fInput.supported_column_id ? updated.objects[fInput.supported_column_id] : null
      if (fInput.supported_column_id && (!column || !isColumnObject(column))) {
        return {
          result: { status: 'rejected', command_id, command_name: commandName,
            affected_object_ids: [], errors: ['Supported column not found'] },
          updatedProject: project,
        }
      }
      const isHosted = !!(column && isColumnObject(column))

      const id = fInput.id || crypto.randomUUID()
      const mark = fInput.mark || 'F1'

      // Resolve size from project types catalog if not passed
      const typeDef = updated.types.find(
        (t) => t.object_type === 'structure.foundation' && (fInput.type_id ? t.id === fInput.type_id : t.name.toLowerCase() === mark.toLowerCase())
      )
      const size_mm: [number, number, number] = fInput.size_mm || tuple3(typeDef?.parameters.size_mm, [800, 800, 300])
      const catalogFoundationType = typeDef?.parameters.foundation_type
      const foundation_type = fInput.foundation_type || (catalogFoundationType === 'pile_cap' || catalogFoundationType === 'spread_footing' ? catalogFoundationType : 'spread_footing')
      const material = fInput.material || catalogString(typeDef?.parameters.material, 'reinforced_concrete')
      const pile_type = fInput.pile_type ?? typeDef?.parameters.pile_type
      const pile_offsets_mm = fInput.pile_offsets_mm ?? typeDef?.parameters.pile_offsets_mm
      const pile_length_mm = fInput.pile_length_mm ?? typeDef?.parameters.pile_length_mm

      const rawLoc: [number, number, number] | undefined = fInput.center_mm
        ? fInput.center_mm
        : fInput.location_mm
          ? (fInput.location_mm.length === 2
              ? [fInput.location_mm[0], fInput.location_mm[1], 0]
              : (fInput.location_mm as [number, number, number]))
          : undefined

      const center_mm: [number, number, number] = rawLoc || (isHosted ? [
        column.module_data.location_mm[0],
        column.module_data.location_mm[1],
        column.module_data.location_mm[2] || 0,
      ] : [0, 0, 0])

      const smartObject: SmartObject<FoundationModuleData> = {
        id,
        object_type: 'structure.foundation',
        owner_module: 'constructflow.structure',
        schema_version: 1,
        created_phase: fInput.phase || (isHosted ? column.created_phase : 'new_construction'),
        removed_phase: null,
        level_refs: isHosted ? column.level_refs : [],
        host_refs: isHosted ? [column.id] : [],
        connector_refs: [],
        status: 'active',
        module_data: {
          mark,
          type_id: typeDef?.id,
          instance_overrides: catalogInstanceOverrides('structure.foundation', { size_mm, foundation_type, pile_type, pile_offsets_mm, pile_length_mm, material }, typeDef),
          foundation_type,
          pile_type,
          pile_offsets_mm,
          pile_length_mm,
          center_mm,
          size_mm,
          top_elevation_mm: fInput.top_elevation_mm || center_mm[2],
          supported_column_id: isHosted ? column.id : '',
          material,
          engineering_status: fInput.engineering_status || 'preliminary',
        },
        created_at: now,
        updated_at: now,
      }

      updated.objects[id] = smartObject
      if (isHosted) {
        updated.relationships.push({
          kind: 'supports',
          source_id: id,
          target_id: column.id,
          role: 'foundation_support',
        })
        updated.relationships.push({
          kind: 'supported_by',
          source_id: column.id,
          target_id: id,
          role: 'foundation_support',
        })
      }

      return {
        result: {
          status: 'success',
          command_id,
          command_name: commandName,
          affected_object_ids: isHosted ? [id, column.id] : [id],
          created_object_ids: [id],
          updated_object_ids: isHosted ? [column.id] : [],
        },
        updatedProject: updated,
        emittedEnvelope: {
          ...envelope,
          input: {
            ...fInput,
            id,
            mark,
            center_mm,
            size_mm: smartObject.module_data.size_mm,
            supported_column_id: isHosted ? column.id : undefined,
          },
        },
      }
    }

    case 'CreateBeam': {
      const beamInput = input as unknown as CreateBeamInput
      const id = beamInput.id || crypto.randomUUID()
      const mark = beamInput.mark || 'B1'

      const typeDef = updated.types.find(
        (t) => t.object_type === 'structure.beam' && (beamInput.type_id ? t.id === beamInput.type_id : t.name.toLowerCase() === mark.toLowerCase())
      )
      const section_mm: [number, number] = beamInput.section_mm || tuple2(typeDef?.parameters.section_mm, [200, 400])
      const material = beamInput.material || catalogString(typeDef?.parameters.material, 'reinforced_concrete')

      const level_id = beamInput.level_id || project.project.active_level_id
      const levelElevation = updated.levels.find(level => level.id === level_id)?.elevation_mm
      if (levelElevation === undefined) return { result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: [`Beam level ${level_id} does not exist`] }, updatedProject: project }
      const base_offset_mm = beamInput.base_offset_mm ?? (beamInput.base_elevation_mm !== undefined ? beamInput.base_elevation_mm - levelElevation : 0)
      if (!Number.isFinite(base_offset_mm)) return { result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: ['Beam level offset must be finite'] }, updatedProject: project }
      const beamElevation = levelElevation + base_offset_mm
      const start_point_mm: [number, number, number] = [beamInput.start_point_mm[0], beamInput.start_point_mm[1], beamElevation]
      const end_point_mm: [number, number, number] = [beamInput.end_point_mm[0], beamInput.end_point_mm[1], beamElevation]

      const span_mm = Math.round(Math.hypot(
        end_point_mm[0] - start_point_mm[0],
        end_point_mm[1] - start_point_mm[1]
      ))

      const smartObject: SmartObject<BeamModuleData> = {
        id,
        object_type: 'structure.beam',
        owner_module: 'constructflow.structure',
        schema_version: 1,
        created_phase: beamInput.phase || project.project.active_phase,
        removed_phase: null,
        level_refs: [{ role: 'base_level', level_id }],
        host_refs: [beamInput.start_column_id, beamInput.end_column_id].filter(Boolean) as string[],
        connector_refs: [],
        status: 'active',
        module_data: {
          mark,
          placement_reference: beamInput.placement_reference || 'centerline',
          type_id: typeDef?.id,
          instance_overrides: catalogInstanceOverrides('structure.beam', { section_mm, material }, typeDef),
          start_point_mm,
          end_point_mm,
          section_mm,
          span_mm,
          level_id,
          base_offset_mm,
          start_column_id: beamInput.start_column_id,
          end_column_id: beamInput.end_column_id,
          material,
          engineering_status: beamInput.engineering_status || 'preliminary',
        },
        created_at: now,
        updated_at: now,
      }

      updated.objects[id] = smartObject

      if (beamInput.start_column_id) {
        updated.relationships.push({
          kind: 'connects_to',
          source_id: id,
          target_id: beamInput.start_column_id,
          role: 'beam_column_connection',
        })
      }
      if (beamInput.end_column_id) {
        updated.relationships.push({
          kind: 'connects_to',
          source_id: id,
          target_id: beamInput.end_column_id,
          role: 'beam_column_connection',
        })
      }

      return {
        result: {
          status: 'success',
          command_id,
          command_name: commandName,
          affected_object_ids: [id],
          created_object_ids: [id],
        },
        updatedProject: updated,
        emittedEnvelope: {
          ...envelope,
          input: {
            ...beamInput,
            id,
            mark,
            path_mm: [start_point_mm, end_point_mm],
            section_mm,
            span_mm,
          },
        },
      }
    }

    case 'UpdateBeamMark': {
      const bMarkInput = input as unknown as UpdateBeamMarkInput
      const target = updated.objects[bMarkInput.object_id]
      if (!target || !isBeamObject(target)) {
        return {
          result: {
            status: 'rejected',
            command_id,
            command_name: commandName,
            affected_object_ids: [],
            errors: [`Beam UUID ${bMarkInput.object_id} not found`],
          },
          updatedProject: project,
        }
      }

      updated.objects[bMarkInput.object_id] = {
        ...target,
        updated_at: now,
        module_data: {
          ...target.module_data,
          mark: bMarkInput.mark,
        },
      }

      return {
        result: {
          status: 'success',
          command_id,
          command_name: commandName,
          affected_object_ids: [bMarkInput.object_id],
          updated_object_ids: [bMarkInput.object_id],
        },
        updatedProject: updated,
        emittedEnvelope: envelope,
      }
    }

    case 'UpdateBeamDimensions': {
      const bDimInput = input as unknown as UpdateBeamDimensionsInput
      const target = updated.objects[bDimInput.object_id]
      if (!target || !isBeamObject(target)) {
        return {
          result: {
            status: 'rejected',
            command_id,
            command_name: commandName,
            affected_object_ids: [],
            errors: [`Beam UUID ${bDimInput.object_id} not found`],
          },
          updatedProject: project,
        }
      }

      updated.objects[bDimInput.object_id] = {
        ...target,
        updated_at: now,
        module_data: {
          ...target.module_data,
          section_mm: bDimInput.section_mm,
        },
      }

      return {
        result: {
          status: 'success',
          command_id,
          command_name: commandName,
          affected_object_ids: [bDimInput.object_id],
          updated_object_ids: [bDimInput.object_id],
        },
        updatedProject: updated,
        emittedEnvelope: envelope,
      }
    }

    case 'UpdateBeamEndpoints': {
      const update = input as unknown as UpdateBeamEndpointsInput
      const target = updated.objects[update.object_id]
      if (!target || !isBeamObject(target)) return { result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: [`Beam UUID ${update.object_id} not found`] }, updatedProject: project }
      const [sx, sy] = update.start_point_mm, [ex, ey] = update.end_point_mm
      const span_mm = Math.round(Math.hypot(ex - sx, ey - sy))
      if (![sx, sy, ex, ey].every(Number.isFinite) || span_mm < 1) return { result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: ['Beam endpoints must define a finite span of at least 1 mm'] }, updatedProject: project }
      const startColumnId = update.start_column_id === undefined ? target.module_data.start_column_id : update.start_column_id ?? undefined
      const endColumnId = update.end_column_id === undefined ? target.module_data.end_column_id : update.end_column_id ?? undefined
      for (const id of [startColumnId, endColumnId]) if (id && !isColumnObject(updated.objects[id])) return { result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: [`Beam endpoint column ${id} not found`] }, updatedProject: project }
      const start: [number, number, number] = [sx, sy, target.module_data.start_point_mm[2] ?? 0]
      const end: [number, number, number] = [ex, ey, target.module_data.end_point_mm[2] ?? 0]
      const hostRefs = [...new Set([startColumnId, endColumnId].filter((id): id is string => Boolean(id)))]
      updated.objects[target.id] = { ...target, host_refs: hostRefs, module_data: { ...target.module_data, start_point_mm: start, end_point_mm: end, path_mm: [start, end], span_mm,
        ...(startColumnId ? { start_column_id: startColumnId } : { start_column_id: undefined }),
        ...(endColumnId ? { end_column_id: endColumnId } : { end_column_id: undefined }),
      }, updated_at: now }
      updated.relationships = updated.relationships.filter(relationship => !(relationship.kind === 'connects_to' && relationship.source_id === target.id && relationship.role === 'beam_column_connection'))
      for (const columnId of hostRefs) updated.relationships.push({ kind: 'connects_to', source_id: target.id, target_id: columnId, role: 'beam_column_connection' })
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [target.id], updated_object_ids: [target.id] }, updatedProject: updated, emittedEnvelope: { ...envelope, input: { ...update, start_point_mm: [sx, sy], end_point_mm: [ex, ey], start_column_id: startColumnId ?? null, end_column_id: endColumnId ?? null } } }
    }

    case 'UpdateColumnDimensions': {
      const colDimInput = input as unknown as UpdateColumnDimensionsInput
      const target = updated.objects[colDimInput.object_id]
      if (!target || !isColumnObject(target)) {
        return {
          result: {
            status: 'rejected',
            command_id,
            command_name: commandName,
            affected_object_ids: [],
            errors: [`Column UUID ${colDimInput.object_id} not found`],
          },
          updatedProject: project,
        }
      }

      updated.objects[colDimInput.object_id] = {
        ...target,
        updated_at: now,
        module_data: {
          ...target.module_data,
          section_mm: colDimInput.section_mm,
        },
      }

      return {
        result: {
          status: 'success',
          command_id,
          command_name: commandName,
          affected_object_ids: [colDimInput.object_id],
          updated_object_ids: [colDimInput.object_id],
        },
        updatedProject: updated,
        emittedEnvelope: envelope,
      }
    }

    case 'UpdateBeamVerticalReference': {
      const verticalInput = input as unknown as UpdateBeamVerticalReferenceInput
      const target = updated.objects[verticalInput.object_id]
      if (!target || !isBeamObject(target)) return { result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: [`Beam UUID ${verticalInput.object_id} not found`] }, updatedProject: project }
      const levelId = verticalInput.level_id ?? target.module_data.level_id
      const level = updated.levels.find(item => item.id === levelId)
      const offset = verticalInput.base_offset_mm ?? target.module_data.base_offset_mm ?? 0
      if (!level) return { result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: [`Beam level ${levelId} does not exist`] }, updatedProject: project }
      if (!Number.isFinite(offset)) return { result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: ['Beam level offset must be finite'] }, updatedProject: project }
      const elevation = level.elevation_mm + offset
      const start = [...target.module_data.start_point_mm] as [number, number, number]
      const end = [...target.module_data.end_point_mm] as [number, number, number]
      start[2] = elevation; end[2] = elevation
      const levelRefs = [...target.level_refs.filter(reference => reference.role !== 'base_level'), { role: 'base_level' as const, level_id: levelId }]
      updated.objects[target.id] = { ...target, level_refs: levelRefs, module_data: { ...target.module_data, level_id: levelId, base_offset_mm: offset, start_point_mm: start, end_point_mm: end }, updated_at: now }
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [target.id], updated_object_ids: [target.id] }, updatedProject: updated, emittedEnvelope: envelope }
    }

    case 'UpdateFoundationDimensions': {
      const fndDimInput = input as unknown as UpdateFoundationDimensionsInput
      const target = updated.objects[fndDimInput.object_id]
      if (!target || !isFoundationObject(target)) {
        return {
          result: {
            status: 'rejected',
            command_id,
            command_name: commandName,
            affected_object_ids: [],
            errors: [`Foundation UUID ${fndDimInput.object_id} not found`],
          },
          updatedProject: project,
        }
      }

      updated.objects[fndDimInput.object_id] = {
        ...target,
        updated_at: now,
        module_data: {
          ...target.module_data,
          size_mm: fndDimInput.size_mm,
        },
      }

      return {
        result: {
          status: 'success',
          command_id,
          command_name: commandName,
          affected_object_ids: [fndDimInput.object_id],
          updated_object_ids: [fndDimInput.object_id],
        },
        updatedProject: updated,
        emittedEnvelope: envelope,
      }
    }
  }
}

/** Return child/hosted structure entities that must be deleted when this host is deleted */
export function getStructureDeletionDependents(project: ProjectDocument, objectId: string): string[] {
  const target = project.objects[objectId]
  if (!target) return []
  const dependentIds: string[] = []

  if (target.object_type === 'structure.column') {
    // 1. Hosted foundations
    for (const obj of Object.values(project.objects)) {
      if (obj.object_type === 'structure.foundation') {
        const data = obj.module_data as Record<string, unknown>
        if (data.supported_column_id === objectId || obj.host_refs.includes(objectId)) {
          dependentIds.push(obj.id)
        }
      }
    }
  }

  // 2. Rebar sets hosted on this object or any dependent foundations
  const hostsToCheck = new Set([objectId, ...dependentIds])
  for (const obj of Object.values(project.objects)) {
    if (obj.object_type === 'structure.rebar_set') {
      const data = obj.module_data as Record<string, unknown>
      if (hostsToCheck.has(String(data.host_id)) || obj.host_refs.some(h => hostsToCheck.has(h))) {
        dependentIds.push(obj.id)
      }
    }
  }

  return [...new Set(dependentIds)]
}

/** Reconcile connected structure entities (e.g., detach beam endpoints) when columns or other hosts are deleted */
export function reconcileStructureDeletion(updated: ProjectDocument, deletedIds: string[], now: string): string[] {
  const updatedIds: string[] = []
  const deletedSet = new Set(deletedIds)

  for (const [id, obj] of Object.entries(updated.objects)) {
    if (obj.object_type === 'structure.beam') {
      const data = obj.module_data as Record<string, unknown>
      let changed = false
      let startCol = data.start_column_id
      let endCol = data.end_column_id

      if (typeof startCol === 'string' && deletedSet.has(startCol)) {
        startCol = undefined
        changed = true
      }
      if (typeof endCol === 'string' && deletedSet.has(endCol)) {
        endCol = undefined
        changed = true
      }
      const newHostRefs = obj.host_refs.filter(h => !deletedSet.has(h))
      if (newHostRefs.length !== obj.host_refs.length) {
        changed = true
      }

      if (changed) {
        updated.objects[id] = {
          ...obj,
          host_refs: newHostRefs,
          module_data: {
            ...data,
            start_column_id: startCol,
            end_column_id: endCol,
          },
          updated_at: now,
        }
        updatedIds.push(id)
      }
    }
  }

  return updatedIds
}
