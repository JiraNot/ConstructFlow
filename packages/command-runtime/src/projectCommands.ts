import { getArchitectureDeletionDependents } from '@constructflow/architecture-engine'
import { DeleteObjectInput } from '@constructflow/command-schema'

import {
  CommandHandlerContext,
  CommandBusResult,
  SetWorkingLevelInput,
  SetWorkingPhaseInput,
  UpdateLevelInput,
  UpdateObjectPhaseInput,
} from '@constructflow/command-schema'

export function executeProjectCommand(context: CommandHandlerContext): CommandBusResult | undefined {
  const { project, updated, commandName, input, command_id, now, envelope } = context
  switch (commandName) {
    case 'SetWorkingLevel': {
      const { level_id } = input as unknown as SetWorkingLevelInput
      if (!updated.levels.some(level => level.id === level_id)) {
        return {
          result: {
            status: 'rejected',
            command_id,
            command_name: commandName,
            affected_object_ids: [],
            errors: [`Level ${level_id} not found`],
          },
          updatedProject: project,
        }
      }
      updated.project.active_level_id = level_id
      return {
        result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] },
        updatedProject: updated,
        emittedEnvelope: envelope,
      }
    }

    case 'UpdateLevel': {
      const levelInput = input as unknown as UpdateLevelInput
      const index = updated.levels.findIndex(level => level.id === levelInput.id)
      if (index < 0) {
        return {
          result: {
            status: 'rejected',
            command_id,
            command_name: commandName,
            affected_object_ids: [],
            errors: [`Level ${levelInput.id} not found`],
          },
          updatedProject: project,
        }
      }
      if (levelInput.name !== undefined && !levelInput.name.trim()) {
        throw new Error('Level name must not be empty')
      }
      for (const [field, value] of Object.entries({ elevation_mm: levelInput.elevation_mm, height_mm: levelInput.height_mm })) {
        if (value !== undefined && (!Number.isFinite(value) || (field === 'height_mm' && value <= 0))) {
          throw new Error(`Invalid level ${field}: ${String(value)}`)
        }
      }
      updated.levels[index] = { ...updated.levels[index], ...levelInput }
      return {
        result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] },
        updatedProject: updated,
        emittedEnvelope: envelope,
      }
    }

    case 'SetWorkingPhase': {
      const { phase } = input as unknown as SetWorkingPhaseInput
      updated.project.active_phase = phase
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

    case 'DeleteObject': {
      const delInput = input as unknown as DeleteObjectInput
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

      const hostedIdsToDelete = getArchitectureDeletionDependents(updated, delInput.object_id)

      delete updated.objects[delInput.object_id]
      for (const hid of hostedIdsToDelete) {
        delete updated.objects[hid]
      }

      const allDeletedIds = [delInput.object_id, ...hostedIdsToDelete]
      const treatmentHostsUpdated: string[] = []
      for (const [objectId, object] of Object.entries(updated.objects)) {
        if (object.object_type !== 'architecture.wall') continue
        const data = object.module_data as Record<string, unknown>
        if (!Array.isArray(data.interface_treatments)) continue
        const treatments = data.interface_treatments as Array<Record<string, unknown>>
        let changed = false
        const remaining = treatments.flatMap(treatment => {
          if (!Array.isArray(treatment.target_object_ids)) return [treatment]
          const targets = treatment.target_object_ids.filter(targetId => typeof targetId === 'string' && !allDeletedIds.includes(targetId))
          if (targets.length === treatment.target_object_ids.length) return [treatment]
          changed = true
          return targets.length ? [{ ...treatment, target_object_ids: targets }] : []
        })
        if (changed) {
          updated.objects[objectId] = { ...object, module_data: { ...data, interface_treatments: remaining }, updated_at: now }
          treatmentHostsUpdated.push(objectId)
        }
      }
      updated.relationships = updated.relationships.filter(
        (r) => !allDeletedIds.includes(r.source_id) && !allDeletedIds.includes(r.target_id)
      )
      const affectedIds = [...allDeletedIds, ...treatmentHostsUpdated]

      return {
        result: {
          status: 'success',
          command_id,
          command_name: commandName,
          affected_object_ids: affectedIds,
          deleted_object_ids: allDeletedIds,
          updated_object_ids: treatmentHostsUpdated,
        },
        updatedProject: updated,
        emittedEnvelope: envelope,
      }
    }

    case 'UpdateObjectPhase': {
      const { object_id, created_phase, removed_phase } = input as unknown as UpdateObjectPhaseInput
      const target = updated.objects[object_id]
      if (!target) {
        return {
          result: {
            status: 'rejected',
            command_id,
            command_name: commandName,
            affected_object_ids: [],
            errors: [`Object UUID ${object_id} not found`],
          },
          updatedProject: project,
        }
      }

      updated.objects[object_id] = {
        ...target,
        created_phase: created_phase || target.created_phase,
        removed_phase: removed_phase !== undefined ? removed_phase : target.removed_phase,
        updated_at: now,
      }

      return {
        result: {
          status: 'success',
          command_id,
          command_name: commandName,
          affected_object_ids: [object_id],
          updated_object_ids: [object_id],
        },
        updatedProject: updated,
        emittedEnvelope: { ...envelope, input: { ...input } },
      }
    }


  }
}
