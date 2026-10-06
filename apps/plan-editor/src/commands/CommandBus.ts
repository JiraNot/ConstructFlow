// ConstructFlow Plan Editor CommandBus & Semantic Mutation Boundary

import {
  ProjectDocument,
  SmartObject,
  TypeDefinition,
  ColumnModuleData,
  FoundationModuleData,
  GridModuleData,
  BeamModuleData,
  WallModuleData,
  DoorModuleData,
  WindowModuleData,
  DoorHanding,
  isColumnObject,
  isFoundationObject,
  isGridObject,
  isBeamObject,
  isWallObject,
  isDoorObject,
  isWindowObject,
} from '@constructflow/project-model'
import {
  CommandEnvelope,
  CommandExecutionResult,
  CreateColumnInput,
  MoveColumnInput,
  UpdateColumnMarkInput,
  CreateFoundationInput,
  CreateGridInput,
  CreateBeamInput,
  UpdateBeamMarkInput,
  UpdateBeamDimensionsInput,
  CreateWallInput,
  UpdateWallMarkInput,
  UpdateWallDimensionsInput,
  CreateDoorInput,
  UpdateDoorMarkInput,
  UpdateDoorDimensionsInput,
  FlipDoorHandingInput,
  CreateWindowInput,
  UpdateWindowMarkInput,
  UpdateWindowDimensionsInput,
  DeleteObjectInput,
  DefineStructuralTypeInput,
  UpdateStructuralTypeDimensionsInput,
  UpdateColumnDimensionsInput,
  UpdateFoundationDimensionsInput,
  AssignInstanceTypeInput,
} from '@constructflow/command-schema'

export interface CommandBusResult {
  result: CommandExecutionResult
  updatedProject: ProjectDocument
  emittedEnvelope?: CommandEnvelope
}

export class CommandBus {
  private static commandCounter = 1000

  static execute(
    project: ProjectDocument,
    commandName: string,
    input: Record<string, any>,
    actorKind: 'human' | 'ai' | 'sync' = 'human'
  ): CommandBusResult {
    const command_id = `CMD-${++this.commandCounter}`
    const now = new Date().toISOString()
    const updated: ProjectDocument = {
      ...project,
      types: (project.types || []).map((t) => ({ ...t, parameters: { ...t.parameters } })),
      objects: { ...project.objects },
      relationships: [...project.relationships],
    }

    const envelope: CommandEnvelope = {
      command_id,
      name: commandName,
      version: 1,
      project_id: project.project.id,
      timestamp: now,
      actor: { kind: actorKind },
      input,
    }

    try {
      switch (commandName) {
        case 'CreateGrid': {
          const gridInput = input as CreateGridInput
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
          const colInput = input as CreateColumnInput
          const id = colInput.id || crypto.randomUUID()

          // Default structural column type mark is C1
          const mark = colInput.mark || 'C1'

          // Resolve section dimensions from project types catalog if not passed
          const typeDef = updated.types.find(
            (t) => t.object_type === 'structure.column' && t.name.toLowerCase() === mark.toLowerCase()
          )
          const section_mm: [number, number] = colInput.section_mm || typeDef?.parameters?.section_mm || [200, 200]

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
              location_mm,
              section_mm,
              rotation_deg: colInput.rotation_deg || 0,
              base_level_id: colInput.base_level_id || project.project.active_level_id,
              top_level_id: colInput.top_level_id,
              base_offset_mm: colInput.base_offset_mm || 0,
              top_offset_mm: colInput.top_offset_mm || 0,
              material: colInput.material || typeDef?.parameters?.material || 'reinforced_concrete',
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
          const moveInput = input as MoveColumnInput
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
          const markInput = input as UpdateColumnMarkInput
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
          const markInput = input as { object_id: string; mark: string }
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
          const tagInput = input as { object_id: string; tag: string }
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
          const fInput = input as CreateFoundationInput
          const column = fInput.supported_column_id ? updated.objects[fInput.supported_column_id] : null
          const isHosted = !!(column && isColumnObject(column))

          const id = fInput.id || crypto.randomUUID()
          const mark = fInput.mark || 'F1'

          // Resolve size from project types catalog if not passed
          const typeDef = updated.types.find(
            (t) => t.object_type === 'structure.foundation' && t.name.toLowerCase() === mark.toLowerCase()
          )
          const size_mm: [number, number, number] = fInput.size_mm || typeDef?.parameters?.size_mm || [800, 800, 300]
          const foundation_type = fInput.foundation_type || typeDef?.parameters?.foundation_type || 'spread_footing'

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
              foundation_type,
              center_mm,
              size_mm,
              top_elevation_mm: fInput.top_elevation_mm || center_mm[2],
              supported_column_id: isHosted ? column.id : '',
              material: fInput.material || typeDef?.parameters?.material || 'reinforced_concrete',
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
          const beamInput = input as CreateBeamInput
          const id = beamInput.id || crypto.randomUUID()
          const mark = beamInput.mark || 'B1'

          const typeDef = updated.types.find(
            (t) => t.object_type === 'structure.beam' && t.name.toLowerCase() === mark.toLowerCase()
          )
          const section_mm: [number, number] = beamInput.section_mm || typeDef?.parameters?.section_mm || [200, 400]

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
              start_point_mm,
              end_point_mm,
              section_mm,
              span_mm,
              level_id,
              start_column_id: beamInput.start_column_id,
              end_column_id: beamInput.end_column_id,
              material: beamInput.material || typeDef?.parameters?.material || 'reinforced_concrete',
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
          const bMarkInput = input as UpdateBeamMarkInput
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
          const bDimInput = input as UpdateBeamDimensionsInput
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

        case 'CreateWall': {
          const wallInput = input as CreateWallInput
          const id = wallInput.id || crypto.randomUUID()
          const mark = wallInput.mark || 'W1'
          const rawStart = wallInput.start_point_mm || (wallInput as any).start_node_mm || [0, 0, 0]
          const rawEnd = wallInput.end_point_mm || (wallInput as any).end_node_mm || [0, 0, 0]
          const start_point_mm: [number, number, number] = [
            rawStart[0],
            rawStart[1],
            rawStart[2] ?? 0,
          ]
          const end_point_mm: [number, number, number] = [
            rawEnd[0],
            rawEnd[1],
            rawEnd[2] ?? 0,
          ]
          const dx = end_point_mm[0] - start_point_mm[0]
          const dy = end_point_mm[1] - start_point_mm[1]
          const length_mm = Math.round(Math.sqrt(dx * dx + dy * dy))

          const wallObj: SmartObject<WallModuleData> = {
            id,
            object_type: 'architecture.wall',
            owner_module: 'constructflow.architecture',
            schema_version: 1,
            created_phase: wallInput.phase || 'new_construction',
            removed_phase: null,
            level_refs: [
              {
                role: 'base_level',
                level_id: wallInput.level_id,
              },
            ],
            host_refs: [],
            connector_refs: [],
            status: 'active',
            module_data: {
              mark,
              start_point_mm,
              end_point_mm,
              thickness_mm: wallInput.thickness_mm || 100,
              height_mm: wallInput.height_mm || 2800,
              length_mm,
              level_id: wallInput.level_id,
              material: wallInput.material || 'brick_masonry',
            },
            created_at: now,
            updated_at: now,
          }

          updated.objects[id] = wallObj

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
                ...wallInput,
                id,
                mark,
                path_mm: [start_point_mm, end_point_mm],
                thickness_mm: wallInput.thickness_mm || 100,
                height_mm: wallInput.height_mm || 2800,
                length_mm,
              },
            },
          }
        }

        case 'UpdateWallMark': {
          const wMarkInput = input as UpdateWallMarkInput
          const target = updated.objects[wMarkInput.object_id]
          if (!target || !isWallObject(target)) {
            return {
              result: {
                status: 'rejected',
                command_id,
                command_name: commandName,
                affected_object_ids: [],
                errors: [`Wall UUID ${wMarkInput.object_id} not found`],
              },
              updatedProject: project,
            }
          }

          updated.objects[wMarkInput.object_id] = {
            ...target,
            updated_at: now,
            module_data: {
              ...target.module_data,
              mark: wMarkInput.mark,
            },
          }

          return {
            result: {
              status: 'success',
              command_id,
              command_name: commandName,
              affected_object_ids: [wMarkInput.object_id],
              updated_object_ids: [wMarkInput.object_id],
            },
            updatedProject: updated,
            emittedEnvelope: envelope,
          }
        }

        case 'UpdateWallDimensions': {
          const wDimInput = input as UpdateWallDimensionsInput
          const target = updated.objects[wDimInput.object_id]
          if (!target || !isWallObject(target)) {
            return {
              result: {
                status: 'rejected',
                command_id,
                command_name: commandName,
                affected_object_ids: [],
                errors: [`Wall UUID ${wDimInput.object_id} not found`],
              },
              updatedProject: project,
            }
          }

          updated.objects[wDimInput.object_id] = {
            ...target,
            updated_at: now,
            module_data: {
              ...target.module_data,
              thickness_mm: wDimInput.thickness_mm,
              height_mm: wDimInput.height_mm ?? target.module_data.height_mm,
            },
          }

          return {
            result: {
              status: 'success',
              command_id,
              command_name: commandName,
              affected_object_ids: [wDimInput.object_id],
              updated_object_ids: [wDimInput.object_id],
            },
            updatedProject: updated,
            emittedEnvelope: envelope,
          }
        }

        case 'CreateDoor': {
          const doorInput = input as CreateDoorInput
          const id = doorInput.id || crypto.randomUUID()
          const mark = doorInput.mark || 'D1'
          const hostWall = updated.objects[doorInput.wall_id]
          if (!hostWall || !isWallObject(hostWall)) {
            return {
              result: {
                status: 'rejected',
                command_id,
                command_name: commandName,
                affected_object_ids: [],
                errors: [`Host Wall UUID ${doorInput.wall_id} not found`],
              },
              updatedProject: project,
            }
          }

          const location_mm: [number, number, number] = [
            doorInput.location_mm[0],
            doorInput.location_mm[1],
            doorInput.location_mm[2] ?? 0,
          ]

          const doorObj: SmartObject<DoorModuleData> = {
            id,
            object_type: 'door_window.door',
            owner_module: 'constructflow.door_window',
            schema_version: 1,
            created_phase: doorInput.phase || 'new_construction',
            removed_phase: null,
            level_refs: [
              {
                role: 'base_level',
                level_id: doorInput.level_id || hostWall.module_data.level_id,
              },
            ],
            host_refs: [doorInput.wall_id],
            connector_refs: [],
            status: 'active',
            module_data: {
              mark,
              wall_id: doorInput.wall_id,
              location_mm,
              offset_along_wall_mm: doorInput.offset_along_wall_mm,
              width_mm: doorInput.width_mm || 800,
              height_mm: doorInput.height_mm || 2000,
              handing: doorInput.handing || 'left_in',
              level_id: doorInput.level_id || hostWall.module_data.level_id,
            },
            created_at: now,
            updated_at: now,
          }

          updated.objects[id] = doorObj
          updated.relationships.push({
            kind: 'hosted_on',
            source_id: id,
            target_id: doorInput.wall_id,
            role: 'door_wall_host',
          })
          updated.relationships.push({
            kind: 'hosts',
            source_id: doorInput.wall_id,
            target_id: id,
            role: 'wall_door_opening',
          })

          return {
            result: {
              status: 'success',
              command_id,
              command_name: commandName,
              affected_object_ids: [id, doorInput.wall_id],
              created_object_ids: [id],
            },
            updatedProject: updated,
            emittedEnvelope: {
              ...envelope,
              input: {
                ...doorInput,
                id,
                mark,
                host_object_id: doorInput.wall_id,
                point_mm: location_mm,
                width_mm: doorInput.width_mm || 800,
                height_mm: doorInput.height_mm || 2000,
                sill_mm: 0,
              },
            },
          }
        }

        case 'UpdateDoorMark': {
          const dMarkInput = input as UpdateDoorMarkInput
          const target = updated.objects[dMarkInput.object_id]
          if (!target || !isDoorObject(target)) {
            return {
              result: {
                status: 'rejected',
                command_id,
                command_name: commandName,
                affected_object_ids: [],
                errors: [`Door UUID ${dMarkInput.object_id} not found`],
              },
              updatedProject: project,
            }
          }

          updated.objects[dMarkInput.object_id] = {
            ...target,
            updated_at: now,
            module_data: {
              ...target.module_data,
              mark: dMarkInput.mark,
            },
          }

          return {
            result: {
              status: 'success',
              command_id,
              command_name: commandName,
              affected_object_ids: [dMarkInput.object_id],
              updated_object_ids: [dMarkInput.object_id],
            },
            updatedProject: updated,
            emittedEnvelope: envelope,
          }
        }

        case 'UpdateDoorDimensions': {
          const dDimInput = input as UpdateDoorDimensionsInput
          const target = updated.objects[dDimInput.object_id]
          if (!target || !isDoorObject(target)) {
            return {
              result: {
                status: 'rejected',
                command_id,
                command_name: commandName,
                affected_object_ids: [],
                errors: [`Door UUID ${dDimInput.object_id} not found`],
              },
              updatedProject: project,
            }
          }

          updated.objects[dDimInput.object_id] = {
            ...target,
            updated_at: now,
            module_data: {
              ...target.module_data,
              width_mm: dDimInput.width_mm,
              height_mm: dDimInput.height_mm ?? target.module_data.height_mm,
            },
          }

          return {
            result: {
              status: 'success',
              command_id,
              command_name: commandName,
              affected_object_ids: [dDimInput.object_id],
              updated_object_ids: [dDimInput.object_id],
            },
            updatedProject: updated,
            emittedEnvelope: envelope,
          }
        }

        case 'FlipDoorHanding': {
          const flipInput = input as FlipDoorHandingInput
          const target = updated.objects[flipInput.object_id]
          if (!target || !isDoorObject(target)) {
            return {
              result: {
                status: 'rejected',
                command_id,
                command_name: commandName,
                affected_object_ids: [],
                errors: [`Door UUID ${flipInput.object_id} not found`],
              },
              updatedProject: project,
            }
          }

          const currentHanding = target.module_data.handing
          const cycle: Record<DoorHanding, DoorHanding> = {
            left_in: 'left_out',
            left_out: 'right_out',
            right_out: 'right_in',
            right_in: 'left_in',
          }
          const newHanding = flipInput.handing || cycle[currentHanding] || 'left_in'

          updated.objects[flipInput.object_id] = {
            ...target,
            updated_at: now,
            module_data: {
              ...target.module_data,
              handing: newHanding,
            },
          }

          return {
            result: {
              status: 'success',
              command_id,
              command_name: commandName,
              affected_object_ids: [flipInput.object_id],
              updated_object_ids: [flipInput.object_id],
            },
            updatedProject: updated,
            emittedEnvelope: envelope,
          }
        }

        case 'CreateWindow': {
          const winInput = input as CreateWindowInput
          const id = winInput.id || crypto.randomUUID()
          const mark = winInput.mark || 'W1'
          const hostWall = updated.objects[winInput.wall_id]
          if (!hostWall || !isWallObject(hostWall)) {
            return {
              result: {
                status: 'rejected',
                command_id,
                command_name: commandName,
                affected_object_ids: [],
                errors: [`Host Wall UUID ${winInput.wall_id} not found`],
              },
              updatedProject: project,
            }
          }

          const location_mm: [number, number, number] = [
            winInput.location_mm[0],
            winInput.location_mm[1],
            winInput.location_mm[2] ?? 0,
          ]

          const winObj: SmartObject<WindowModuleData> = {
            id,
            object_type: 'door_window.window',
            owner_module: 'constructflow.door_window',
            schema_version: 1,
            created_phase: winInput.phase || 'new_construction',
            removed_phase: null,
            level_refs: [
              {
                role: 'base_level',
                level_id: winInput.level_id || hostWall.module_data.level_id,
              },
            ],
            host_refs: [winInput.wall_id],
            connector_refs: [],
            status: 'active',
            module_data: {
              mark,
              wall_id: winInput.wall_id,
              location_mm,
              offset_along_wall_mm: winInput.offset_along_wall_mm,
              width_mm: winInput.width_mm || 1200,
              height_mm: winInput.height_mm || 1200,
              sill_height_mm: winInput.sill_height_mm || 900,
              level_id: winInput.level_id || hostWall.module_data.level_id,
            },
            created_at: now,
            updated_at: now,
          }

          updated.objects[id] = winObj
          updated.relationships.push({
            kind: 'hosted_on',
            source_id: id,
            target_id: winInput.wall_id,
            role: 'window_wall_host',
          })
          updated.relationships.push({
            kind: 'hosts',
            source_id: winInput.wall_id,
            target_id: id,
            role: 'wall_window_opening',
          })

          return {
            result: {
              status: 'success',
              command_id,
              command_name: commandName,
              affected_object_ids: [id, winInput.wall_id],
              created_object_ids: [id],
            },
            updatedProject: updated,
            emittedEnvelope: {
              ...envelope,
              input: {
                ...winInput,
                id,
                mark,
                host_object_id: winInput.wall_id,
                point_mm: location_mm,
                width_mm: winInput.width_mm || 1200,
                height_mm: winInput.height_mm || 1200,
                sill_mm: winInput.sill_height_mm || 900,
              },
            },
          }
        }

        case 'UpdateWindowMark': {
          const wMarkInput = input as UpdateWindowMarkInput
          const target = updated.objects[wMarkInput.object_id]
          if (!target || !isWindowObject(target)) {
            return {
              result: {
                status: 'rejected',
                command_id,
                command_name: commandName,
                affected_object_ids: [],
                errors: [`Window UUID ${wMarkInput.object_id} not found`],
              },
              updatedProject: project,
            }
          }

          updated.objects[wMarkInput.object_id] = {
            ...target,
            updated_at: now,
            module_data: {
              ...target.module_data,
              mark: wMarkInput.mark,
            },
          }

          return {
            result: {
              status: 'success',
              command_id,
              command_name: commandName,
              affected_object_ids: [wMarkInput.object_id],
              updated_object_ids: [wMarkInput.object_id],
            },
            updatedProject: updated,
            emittedEnvelope: envelope,
          }
        }

        case 'UpdateWindowDimensions': {
          const wDimInput = input as UpdateWindowDimensionsInput
          const target = updated.objects[wDimInput.object_id]
          if (!target || !isWindowObject(target)) {
            return {
              result: {
                status: 'rejected',
                command_id,
                command_name: commandName,
                affected_object_ids: [],
                errors: [`Window UUID ${wDimInput.object_id} not found`],
              },
              updatedProject: project,
            }
          }

          updated.objects[wDimInput.object_id] = {
            ...target,
            updated_at: now,
            module_data: {
              ...target.module_data,
              width_mm: wDimInput.width_mm,
              height_mm: wDimInput.height_mm ?? target.module_data.height_mm,
              sill_height_mm: wDimInput.sill_height_mm ?? target.module_data.sill_height_mm,
            },
          }

          return {
            result: {
              status: 'success',
              command_id,
              command_name: commandName,
              affected_object_ids: [wDimInput.object_id],
              updated_object_ids: [wDimInput.object_id],
            },
            updatedProject: updated,
            emittedEnvelope: envelope,
          }
        }

        case 'DeleteObject': {
          const delInput = input as DeleteObjectInput
          const target = updated.objects[delInput.object_id]
          if (!target) {
            return {
              result: {
                status: 'rejected',
                command_id,
                command_name: commandName,
                affected_object_ids: [],
                errors: [`Object UUID ${delInput.object_id} not found`],
              },
              updatedProject: project,
            }
          }

          // If deleting a wall, also cascade delete hosted openings (doors/windows)
          const hostedIdsToDelete: string[] = []
          if (target.object_type === 'architecture.wall') {
            for (const [id, obj] of Object.entries(updated.objects)) {
              if (
                (isDoorObject(obj) && obj.module_data.wall_id === delInput.object_id) ||
                (isWindowObject(obj) && obj.module_data.wall_id === delInput.object_id)
              ) {
                hostedIdsToDelete.push(id)
              }
            }
          }

          delete updated.objects[delInput.object_id]
          for (const hid of hostedIdsToDelete) {
            delete updated.objects[hid]
          }

          const allDeletedIds = [delInput.object_id, ...hostedIdsToDelete]
          updated.relationships = updated.relationships.filter(
            (r) => !allDeletedIds.includes(r.source_id) && !allDeletedIds.includes(r.target_id)
          )

          return {
            result: {
              status: 'success',
              command_id,
              command_name: commandName,
              affected_object_ids: allDeletedIds,
              deleted_object_ids: allDeletedIds,
            },
            updatedProject: updated,
            emittedEnvelope: envelope,
          }
        }

        case 'DefineStructuralType': {
          const dtInput = input as DefineStructuralTypeInput
          const typePrefix =
            dtInput.object_type === 'structure.column'
              ? 'col'
              : dtInput.object_type === 'structure.beam'
              ? 'beam'
              : dtInput.object_type === 'structure.foundation'
              ? 'fnd'
              : dtInput.object_type === 'architecture.wall'
              ? 'wall'
              : dtInput.object_type === 'door_window.door'
              ? 'door'
              : 'window'
          const typeId = dtInput.id || `type-${typePrefix}-${dtInput.name.toLowerCase()}`

          const existingIdx = updated.types.findIndex(
            (t) => t.object_type === dtInput.object_type && t.name.toLowerCase() === dtInput.name.toLowerCase()
          )

          const newType: TypeDefinition = {
            id: typeId,
            object_type: dtInput.object_type,
            name: dtInput.name,
            parameters: { ...dtInput.parameters },
          }

          if (existingIdx >= 0) {
            updated.types[existingIdx] = newType
          } else {
            updated.types.push(newType)
          }

          return {
            result: {
              status: 'success',
              command_id,
              command_name: commandName,
              affected_object_ids: [],
            },
            updatedProject: updated,
            emittedEnvelope: envelope,
          }
        }

        case 'UpdateStructuralTypeDimensions': {
          const dimInput = input as UpdateStructuralTypeDimensionsInput
          const targetTypeName = (
            dimInput.type_id_or_name ||
            dimInput.type_name ||
            ''
          ).trim()

          const section_mm = dimInput.section_mm || dimInput.parameters?.section_mm
          const size_mm = dimInput.size_mm || dimInput.parameters?.size_mm
          const thickness_mm = dimInput.thickness_mm || dimInput.parameters?.thickness_mm
          const height_mm = dimInput.height_mm || dimInput.parameters?.height_mm
          const width_mm = dimInput.width_mm || dimInput.parameters?.width_mm
          const sill_height_mm = dimInput.sill_height_mm || dimInput.parameters?.sill_height_mm

          const targetObjectType =
            dimInput.object_type ||
            (dimInput.parameters as any)?.object_type ||
            (thickness_mm
              ? 'architecture.wall'
              : sill_height_mm
              ? 'door_window.window'
              : size_mm
              ? 'structure.foundation'
              : targetTypeName.toUpperCase().startsWith('D')
              ? 'door_window.door'
              : targetTypeName.toUpperCase().startsWith('B') || targetTypeName.toUpperCase().startsWith('RB')
              ? 'structure.beam'
              : targetTypeName.toUpperCase().startsWith('W') && !section_mm
              ? 'architecture.wall'
              : 'structure.column')

          if (!targetTypeName) {
            return {
              result: {
                status: 'rejected',
                command_id,
                command_name: commandName,
                affected_object_ids: [],
                errors: ['Missing type name or mark for UpdateStructuralTypeDimensions'],
              },
              updatedProject: project,
            }
          }

          let typeDef = updated.types.find(
            (t) => (t.id.toLowerCase() === targetTypeName.toLowerCase() ||
                    t.name.toLowerCase() === targetTypeName.toLowerCase()) &&
                   (!targetObjectType || t.object_type === targetObjectType)
          )

          if (!typeDef) {
            const prefix =
              targetObjectType === 'structure.foundation'
                ? 'fnd'
                : targetObjectType === 'structure.beam'
                ? 'beam'
                : targetObjectType === 'architecture.wall'
                ? 'wall'
                : targetObjectType === 'door_window.door'
                ? 'door'
                : targetObjectType === 'door_window.window'
                ? 'window'
                : 'col'
            typeDef = {
              id: `type-${prefix}-${targetTypeName.toLowerCase()}`,
              object_type: targetObjectType,
              name: targetTypeName,
              parameters: {},
            }
            updated.types.push(typeDef)
          }

          // Update type parameters
          if (section_mm) {
            typeDef.parameters.section_mm = section_mm
          }
          if (size_mm) {
            typeDef.parameters.size_mm = size_mm
          }
          if (thickness_mm !== undefined) {
            typeDef.parameters.thickness_mm = thickness_mm
          }
          if (height_mm !== undefined) {
            typeDef.parameters.height_mm = height_mm
          }
          if (width_mm !== undefined) {
            typeDef.parameters.width_mm = width_mm
          }
          if (sill_height_mm !== undefined) {
            typeDef.parameters.sill_height_mm = sill_height_mm
          }

          // Cascading update to all matching instances!
          const affected: string[] = []
          for (const [id, obj] of Object.entries(updated.objects)) {
            if (obj.object_type === 'structure.column' && isColumnObject(obj)) {
              if (obj.module_data.mark.toLowerCase() === typeDef.name.toLowerCase()) {
                if (section_mm) {
                  updated.objects[id] = {
                    ...obj,
                    updated_at: now,
                    module_data: {
                      ...obj.module_data,
                      section_mm,
                    },
                  }
                  affected.push(id)
                }
              }
            } else if (obj.object_type === 'structure.beam' && isBeamObject(obj)) {
              if (obj.module_data.mark.toLowerCase() === typeDef.name.toLowerCase()) {
                if (section_mm) {
                  updated.objects[id] = {
                    ...obj,
                    updated_at: now,
                    module_data: {
                      ...obj.module_data,
                      section_mm,
                    },
                  }
                  affected.push(id)
                }
              }
            } else if (obj.object_type === 'structure.foundation' && isFoundationObject(obj)) {
              if (obj.module_data.mark.toLowerCase() === typeDef.name.toLowerCase()) {
                if (size_mm) {
                  updated.objects[id] = {
                    ...obj,
                    updated_at: now,
                    module_data: {
                      ...obj.module_data,
                      size_mm,
                    },
                  }
                  affected.push(id)
                }
              }
            } else if (obj.object_type === 'architecture.wall' && isWallObject(obj)) {
              if (obj.module_data.mark.toLowerCase() === typeDef.name.toLowerCase()) {
                const newThickness = thickness_mm !== undefined ? thickness_mm : obj.module_data.thickness_mm
                const newHeight = height_mm !== undefined ? height_mm : obj.module_data.height_mm
                updated.objects[id] = {
                  ...obj,
                  updated_at: now,
                  module_data: {
                    ...obj.module_data,
                    thickness_mm: newThickness,
                    height_mm: newHeight,
                  },
                }
                affected.push(id)
              }
            } else if (obj.object_type === 'door_window.door' && isDoorObject(obj)) {
              if (obj.module_data.mark.toLowerCase() === typeDef.name.toLowerCase()) {
                const newWidth = width_mm !== undefined ? width_mm : obj.module_data.width_mm
                const newHeight = height_mm !== undefined ? height_mm : obj.module_data.height_mm
                updated.objects[id] = {
                  ...obj,
                  updated_at: now,
                  module_data: {
                    ...obj.module_data,
                    width_mm: newWidth,
                    height_mm: newHeight,
                  },
                }
                affected.push(id)
              }
            } else if (obj.object_type === 'door_window.window' && isWindowObject(obj)) {
              if (obj.module_data.mark.toLowerCase() === typeDef.name.toLowerCase()) {
                const newWidth = width_mm !== undefined ? width_mm : obj.module_data.width_mm
                const newHeight = height_mm !== undefined ? height_mm : obj.module_data.height_mm
                const newSill = sill_height_mm !== undefined ? sill_height_mm : obj.module_data.sill_height_mm
                updated.objects[id] = {
                  ...obj,
                  updated_at: now,
                  module_data: {
                    ...obj.module_data,
                    width_mm: newWidth,
                    height_mm: newHeight,
                    sill_height_mm: newSill,
                  },
                }
                affected.push(id)
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
            emittedEnvelope: {
              ...envelope,
              input: {
                type_id_or_name: targetTypeName,
                type_name: targetTypeName,
                object_type: typeDef.object_type,
                section_mm,
                size_mm,
                thickness_mm,
                height_mm,
                width_mm,
                sill_height_mm,
              },
            },
          }
        }

        case 'UpdateColumnDimensions': {
          const colDimInput = input as UpdateColumnDimensionsInput
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
          const fndDimInput = input as UpdateFoundationDimensionsInput
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

        case 'AssignInstanceType': {
          const assignInput = input as AssignInstanceTypeInput
          const target = updated.objects[assignInput.object_id]
          if (!target) {
            return {
              result: {
                status: 'rejected',
                command_id,
                command_name: commandName,
                affected_object_ids: [],
                errors: [`Object ${assignInput.object_id} not found`],
              },
              updatedProject: project,
            }
          }

          const typeDef = updated.types.find(
            (t) => t.object_type === target.object_type && t.name.toLowerCase() === assignInput.type_name.toLowerCase()
          )

          if (isColumnObject(target)) {
            const section_mm: [number, number] = typeDef?.parameters?.section_mm || target.module_data.section_mm
            updated.objects[target.id] = {
              ...target,
              updated_at: now,
              module_data: {
                ...target.module_data,
                mark: assignInput.type_name,
                section_mm,
              },
            }
          } else if (isBeamObject(target)) {
            const section_mm: [number, number] = typeDef?.parameters?.section_mm || target.module_data.section_mm
            updated.objects[target.id] = {
              ...target,
              updated_at: now,
              module_data: {
                ...target.module_data,
                mark: assignInput.type_name,
                section_mm,
              },
            }
          } else if (isFoundationObject(target)) {
            const size_mm: [number, number, number] = typeDef?.parameters?.size_mm || target.module_data.size_mm
            updated.objects[target.id] = {
              ...target,
              updated_at: now,
              module_data: {
                ...target.module_data,
                mark: assignInput.type_name,
                size_mm,
              },
            }
          } else if (isWallObject(target)) {
            const thickness_mm: number = typeDef?.parameters?.thickness_mm ?? target.module_data.thickness_mm
            const height_mm: number = typeDef?.parameters?.height_mm ?? target.module_data.height_mm
            updated.objects[target.id] = {
              ...target,
              updated_at: now,
              module_data: {
                ...target.module_data,
                mark: assignInput.type_name,
                thickness_mm,
                height_mm,
              },
            }
          } else if (isDoorObject(target)) {
            const width_mm: number = typeDef?.parameters?.width_mm ?? target.module_data.width_mm
            const height_mm: number = typeDef?.parameters?.height_mm ?? target.module_data.height_mm
            updated.objects[target.id] = {
              ...target,
              updated_at: now,
              module_data: {
                ...target.module_data,
                mark: assignInput.type_name,
                width_mm,
                height_mm,
              },
            }
          } else if (isWindowObject(target)) {
            const width_mm: number = typeDef?.parameters?.width_mm ?? target.module_data.width_mm
            const height_mm: number = typeDef?.parameters?.height_mm ?? target.module_data.height_mm
            const sill_height_mm: number = typeDef?.parameters?.sill_height_mm ?? target.module_data.sill_height_mm
            updated.objects[target.id] = {
              ...target,
              updated_at: now,
              module_data: {
                ...target.module_data,
                mark: assignInput.type_name,
                width_mm,
                height_mm,
                sill_height_mm,
              },
            }
          }

          return {
            result: {
              status: 'success',
              command_id,
              command_name: commandName,
              affected_object_ids: [target.id],
              updated_object_ids: [target.id],
            },
            updatedProject: updated,
            emittedEnvelope: envelope,
          }
        }

        default:
          return {
            result: {
              status: 'rejected',
              command_id,
              command_name: commandName,
              affected_object_ids: [],
              errors: [`Unknown command: ${commandName}`],
            },
            updatedProject: project,
          }
      }
    } catch (err: any) {
      return {
        result: {
          status: 'failed',
          command_id,
          command_name: commandName,
          affected_object_ids: [],
          errors: [err.message || String(err)],
        },
        updatedProject: project,
      }
    }
  }
}
