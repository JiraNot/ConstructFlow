// ConstructFlow CommandBus — Mutation Boundary and Event Dispatcher

import { Project, SmartObject, SyncDeltaEvent, Phase } from '../types/model'

export interface CommandResult {
  status: 'success' | 'rejected' | 'failed'
  command_id: string
  command_name: string
  error?: string
  events: SyncDeltaEvent[]
  updated_project: Project
}

let commandCounter = 1000

export class CommandBus {
  static execute(
    project: Project,
    command_name: string,
    params: Record<string, any>
  ): CommandResult {
    const command_id = `CMD-${++commandCounter}`
    const now = new Date().toISOString()
    const updated = {
      ...project,
      objects: { ...project.objects },
    }
    const events: SyncDeltaEvent[] = []

    try {
      switch (command_name) {
        case 'CreateGridLine': {
          const { tag, orientation, position_mm, extent_mm } = params
          const id = `GRID-${tag}`
          const smartObject: SmartObject = {
            id,
            object_type: 'structure.grid',
            owner_module: 'constructflow.structure',
            schema_version: 1,
            created_phase: project.active_phase,
            removed_phase: null,
            level_refs: [{ role: 'host_level', level_id: project.active_level_id }],
            host_refs: [],
            connector_refs: [],
            status: 'active',
            module_data: {
              tag,
              orientation,
              position_mm,
              extent_mm: extent_mm || [-10000, 15000],
            },
            created_at: now,
            updated_at: now,
          }
          updated.objects[id] = smartObject
          events.push({
            op: 'CREATE',
            id,
            object_type: 'structure.grid',
            timestamp: now,
            payload: { tag, orientation, position_mm },
          })
          break
        }

        case 'CreateColumn': {
          const { location_mm, section_mm, rotation_deg, material } = params
          const count = Object.values(updated.objects).filter(
            (o) => o.object_type === 'structure.column'
          ).length
          const id = `COL-${String(count + 1).padStart(3, '0')}`
          const smartObject: SmartObject = {
            id,
            object_type: 'structure.column',
            owner_module: 'constructflow.structure',
            schema_version: 1,
            created_phase: project.active_phase,
            removed_phase: null,
            level_refs: [{ role: 'base_level', level_id: project.active_level_id }],
            host_refs: [],
            connector_refs: [],
            status: 'active',
            module_data: {
              location_mm,
              section_mm: section_mm || [200, 200],
              rotation_deg: rotation_deg || 0,
              material: material || 'Concrete C25/30',
            },
            created_at: now,
            updated_at: now,
          }
          updated.objects[id] = smartObject
          events.push({
            op: 'CREATE',
            id,
            object_type: 'structure.column',
            timestamp: now,
            payload: {
              location_mm,
              section_mm: smartObject.module_data.section_mm,
              level_id: project.active_level_id,
              phase: project.active_phase,
            },
          })
          break
        }

        case 'MoveColumn': {
          const { id, new_location_mm } = params
          const target = updated.objects[id]
          if (!target || target.object_type !== 'structure.column') {
            return {
              status: 'rejected',
              command_id,
              command_name,
              error: `Column ${id} not found`,
              events: [],
              updated_project: project,
            }
          }
          const prevLocation = target.module_data.location_mm
          updated.objects[id] = {
            ...target,
            updated_at: now,
            module_data: {
              ...target.module_data,
              location_mm: new_location_mm,
            },
          }
          events.push({
            op: 'UPDATE',
            id,
            object_type: 'structure.column',
            timestamp: now,
            payload: {
              location_mm: new_location_mm,
              delta_mm: [
                new_location_mm[0] - prevLocation[0],
                new_location_mm[1] - prevLocation[1],
              ],
            },
          })
          break
        }

        case 'CreateWall': {
          const { start_mm, end_mm, thickness_mm, height_mm, material } = params
          const count = Object.values(updated.objects).filter(
            (o) => o.object_type === 'architecture.wall'
          ).length
          const id = `WALL-${String(count + 1).padStart(3, '0')}`
          const smartObject: SmartObject = {
            id,
            object_type: 'architecture.wall',
            owner_module: 'constructflow.architecture',
            schema_version: 1,
            created_phase: project.active_phase,
            removed_phase: null,
            level_refs: [{ role: 'base_level', level_id: project.active_level_id }],
            host_refs: [],
            connector_refs: [],
            status: 'active',
            module_data: {
              start_mm,
              end_mm,
              thickness_mm: thickness_mm || 150,
              height_mm: height_mm || 2800,
              material: material || 'Brick 100mm + Render',
            },
            created_at: now,
            updated_at: now,
          }
          updated.objects[id] = smartObject
          events.push({
            op: 'CREATE',
            id,
            object_type: 'architecture.wall',
            timestamp: now,
            payload: {
              start_mm,
              end_mm,
              thickness_mm: smartObject.module_data.thickness_mm,
              level_id: project.active_level_id,
              phase: project.active_phase,
            },
          })
          break
        }

        case 'ChangePhase': {
          const { id, new_phase } = params
          const target = updated.objects[id]
          if (!target) {
            return {
              status: 'rejected',
              command_id,
              command_name,
              error: `Object ${id} not found`,
              events: [],
              updated_project: project,
            }
          }
          const isDemolished = new_phase === 'demolition'
          updated.objects[id] = {
            ...target,
            updated_at: now,
            created_phase: isDemolished ? target.created_phase : (new_phase as Phase),
            removed_phase: isDemolished ? 'demolition' : null,
          }
          events.push({
            op: isDemolished ? 'DEMOLISH' : 'UPDATE',
            id,
            object_type: target.object_type,
            timestamp: now,
            payload: { phase: new_phase },
          })
          break
        }

        case 'DeleteObject': {
          const { id } = params
          const target = updated.objects[id]
          if (target) {
            delete updated.objects[id]
            events.push({
              op: 'DELETE',
              id,
              object_type: target.object_type,
              timestamp: now,
              payload: {},
            })
          }
          break
        }

        default:
          return {
            status: 'rejected',
            command_id,
            command_name,
            error: `Unknown command: ${command_name}`,
            events: [],
            updated_project: project,
          }
      }

      return {
        status: 'success',
        command_id,
        command_name,
        events,
        updated_project: updated,
      }
    } catch (e: any) {
      return {
        status: 'failed',
        command_id,
        command_name,
        error: e?.message || String(e),
        events: [],
        updated_project: project,
      }
    }
  }
}
