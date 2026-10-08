import { SmartObject, ColumnModuleData, FoundationModuleData, GridModuleData, BeamModuleData, resolveCatalogType, catalogInstanceOverrides, isColumnObject, isFoundationObject, isGridObject, isBeamObject, type ProjectDocument } from '@constructflow/project-model'
import { CreateColumnInput, MoveColumnInput, UpdateColumnMarkInput, CreateFoundationInput, CreateGridInput, CreateBeamInput, UpdateBeamMarkInput, UpdateBeamDimensionsInput, UpdateColumnDimensionsInput, UpdateFoundationDimensionsInput } from '@constructflow/command-schema'

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

      const location_mm: [number, number, number] = colInput.location_mm.length === 2
        ? [colInput.location_mm[0], colInput.location_mm[1], 0]
        : (colInput.location_mm as [number, number, number])

      const smartObject: SmartObject<ColumnModuleData> = {
        id,
        object_type: 'structure.column',
        owner_module: 'constructflow.structure',
        schema_version: 1,
        created_phase: colInput.phase || project.project.active_phase,
        removed_phase: null,
        level_refs: [{ role: 'base_level', level_id: colInput.base_level_id || project.project.active_level_id }],
        host_refs: [],
        connector_refs: [],
        status: 'active',
        module_data: {
          mark,
          type_id: typeDef?.id,
          instance_overrides: catalogInstanceOverrides('structure.column', { section_mm, material }, typeDef),
          location_mm,
          section_mm,
          rotation_deg: colInput.rotation_deg || 0,
          base_level_id: colInput.base_level_id || project.project.active_level_id,
          top_level_id: colInput.top_level_id,
          base_offset_mm: colInput.base_offset_mm || 0,
          top_offset_mm: colInput.top_offset_mm || 0,
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

      const start_point_mm: [number, number, number] = beamInput.start_point_mm.length === 2
        ? [beamInput.start_point_mm[0], beamInput.start_point_mm[1], 0]
        : (beamInput.start_point_mm as [number, number, number])

      const end_point_mm: [number, number, number] = beamInput.end_point_mm.length === 2
        ? [beamInput.end_point_mm[0], beamInput.end_point_mm[1], 0]
        : (beamInput.end_point_mm as [number, number, number])

      const span_mm = Math.round(Math.hypot(
        end_point_mm[0] - start_point_mm[0],
        end_point_mm[1] - start_point_mm[1]
      ))

      const level_id = beamInput.level_id || project.project.active_level_id

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
