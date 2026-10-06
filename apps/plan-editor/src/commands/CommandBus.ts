// ConstructFlow Plan Editor CommandBus & Semantic Mutation Boundary

import {
  ProjectDocument,
  SmartObject,
  TypeDefinition,
  ColumnModuleData,
  FoundationModuleData,
  GridModuleData,
  isColumnObject,
  isFoundationObject,
  isGridObject,
} from '@constructflow/project-model'
import {
  CommandEnvelope,
  CommandExecutionResult,
  CreateColumnInput,
  MoveColumnInput,
  UpdateColumnMarkInput,
  CreateFoundationInput,
  CreateGridInput,
  DeleteObjectInput,
  DefineStructuralTypeInput,
  UpdateStructuralTypeDimensionsInput,
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

          delete updated.objects[delInput.object_id]
          updated.relationships = updated.relationships.filter(
            (r) => r.source_id !== delInput.object_id && r.target_id !== delInput.object_id
          )

          return {
            result: {
              status: 'success',
              command_id,
              command_name: commandName,
              affected_object_ids: [delInput.object_id],
              deleted_object_ids: [delInput.object_id],
            },
            updatedProject: updated,
            emittedEnvelope: envelope,
          }
        }

        case 'DefineStructuralType': {
          const dtInput = input as DefineStructuralTypeInput
          const typeId = dtInput.id || `type-${dtInput.object_type === 'structure.column' ? 'col' : 'fnd'}-${dtInput.name.toLowerCase()}`

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
          const typeDef = updated.types.find(
            (t) => (t.id === dimInput.type_id_or_name || t.name.toLowerCase() === dimInput.type_id_or_name.toLowerCase()) &&
                   (!dimInput.object_type || t.object_type === dimInput.object_type)
          )

          if (!typeDef) {
            return {
              result: {
                status: 'rejected',
                command_id,
                command_name: commandName,
                affected_object_ids: [],
                errors: [`Type ${dimInput.type_id_or_name} not found in project catalog`],
              },
              updatedProject: project,
            }
          }

          // Update type parameters
          if (dimInput.section_mm) {
            typeDef.parameters.section_mm = dimInput.section_mm
          }
          if (dimInput.size_mm) {
            typeDef.parameters.size_mm = dimInput.size_mm
          }

          // Cascading update to all matching instances!
          const affected: string[] = []
          for (const [id, obj] of Object.entries(updated.objects)) {
            if (obj.object_type === 'structure.column' && isColumnObject(obj)) {
              if (obj.module_data.mark.toLowerCase() === typeDef.name.toLowerCase()) {
                if (dimInput.section_mm) {
                  updated.objects[id] = {
                    ...obj,
                    updated_at: now,
                    module_data: {
                      ...obj.module_data,
                      section_mm: dimInput.section_mm,
                    },
                  }
                  affected.push(id)
                }
              }
            } else if (obj.object_type === 'structure.foundation' && isFoundationObject(obj)) {
              if (obj.module_data.mark.toLowerCase() === typeDef.name.toLowerCase()) {
                if (dimInput.size_mm) {
                  updated.objects[id] = {
                    ...obj,
                    updated_at: now,
                    module_data: {
                      ...obj.module_data,
                      size_mm: dimInput.size_mm,
                    },
                  }
                  affected.push(id)
                }
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
