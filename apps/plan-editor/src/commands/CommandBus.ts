// ConstructFlow Plan Editor CommandBus & Semantic Mutation Boundary

import {
  ProjectDocument,
  SmartObject,
  ColumnModuleData,
  FoundationModuleData,
  GridModuleData,
  isColumnObject,
  isFoundationObject,
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

          // Generate sequential mark if not provided (e.g. C01, C02...)
          const count = Object.values(updated.objects).filter(
            (o) => o.object_type === 'structure.column'
          ).length
          const mark = colInput.mark || `C${String(count + 1).padStart(2, '0')}`

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
              section_mm: colInput.section_mm || [200, 200],
              rotation_deg: colInput.rotation_deg || 0,
              base_level_id: colInput.base_level_id || project.project.active_level_id,
              top_level_id: colInput.top_level_id,
              base_offset_mm: colInput.base_offset_mm || 0,
              top_offset_mm: colInput.top_offset_mm || 0,
              material: colInput.material || 'reinforced_concrete',
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
            emittedEnvelope: { ...envelope, input: { ...colInput, id, mark, location_mm } },
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

        case 'CreateFoundation': {
          const fInput = input as CreateFoundationInput
          const column = updated.objects[fInput.supported_column_id]
          if (!column || !isColumnObject(column)) {
            return {
              result: {
                status: 'rejected',
                command_id,
                command_name: commandName,
                affected_object_ids: [],
                errors: [`Host column UUID ${fInput.supported_column_id} not found`],
              },
              updatedProject: project,
            }
          }

          const id = fInput.id || crypto.randomUUID()
          const count = Object.values(updated.objects).filter(
            (o) => o.object_type === 'structure.foundation'
          ).length
          const mark = fInput.mark || `F${String(count + 1).padStart(2, '0')}`

          const center_mm: [number, number, number] = fInput.center_mm || [
            column.module_data.location_mm[0],
            column.module_data.location_mm[1],
            column.module_data.location_mm[2] || 0,
          ]

          const smartObject: SmartObject<FoundationModuleData> = {
            id,
            object_type: 'structure.foundation',
            owner_module: 'constructflow.structure',
            schema_version: 1,
            created_phase: fInput.phase || column.created_phase,
            removed_phase: null,
            level_refs: column.level_refs,
            host_refs: [column.id],
            connector_refs: [],
            status: 'active',
            module_data: {
              mark,
              foundation_type: fInput.foundation_type || 'spread_footing',
              center_mm,
              size_mm: fInput.size_mm || [800, 800, 300],
              top_elevation_mm: fInput.top_elevation_mm || center_mm[2],
              supported_column_id: column.id,
              material: fInput.material || 'reinforced_concrete',
              engineering_status: fInput.engineering_status || 'preliminary',
            },
            created_at: now,
            updated_at: now,
          }

          updated.objects[id] = smartObject
          updated.relationships.push({
            kind: 'supports',
            source_id: id,
            target_id: column.id,
            role: 'foundation_support',
          })

          return {
            result: {
              status: 'success',
              command_id,
              command_name: commandName,
              affected_object_ids: [id, column.id],
              created_object_ids: [id],
              updated_object_ids: [column.id],
            },
            updatedProject: updated,
            emittedEnvelope: {
              ...envelope,
              input: { ...fInput, id, mark, center_mm, size_mm: smartObject.module_data.size_mm },
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
