import { getArchitectureDeletionDependents } from '@constructflow/architecture-engine'
import { getStructureDeletionDependents, reconcileStructureDeletion } from '@constructflow/structure-engine'
import { DeleteObjectInput } from '@constructflow/command-schema'
import {
  analyzeDependencyImpact,
  buildDependencyGraph,
  normalizeCoordinationSettings,
  validateCoordinationSettings,
  validateDrawingSettings,
} from '@constructflow/project-model'
import type { UpdateCoordinationSettingsInput, UpdateSheetViewportInput } from '@constructflow/command-schema'

import {
  CommandHandlerContext,
  CommandBusResult,
  SetWorkingLevelInput,
  SetWorkingPhaseInput,
  CreateLevelInput,
  UpdateLevelInput,
  UpdateObjectPhaseInput,
} from '@constructflow/command-schema'

export function executeProjectCommand(context: CommandHandlerContext): CommandBusResult | undefined {
  const { project, updated, commandName, input, command_id, now, envelope } = context
  switch (commandName) {
    case 'CreateLevel': {
      const level = input as unknown as CreateLevelInput
      if (!level.id || !level.name.trim()) throw new Error('Level id and name are required')
      if (updated.levels.some(existing => existing.id === level.id)) throw new Error(`Level ${level.id} already exists`)
      if (![level.elevation_mm, level.storey_index].every(Number.isFinite) || level.storey_index < 1) throw new Error('Level elevation and storey index must be valid')
      if (level.height_mm !== undefined && (!Number.isFinite(level.height_mm) || level.height_mm <= 0)) throw new Error('Level height must be greater than zero')
      if (updated.levels.some(existing => Math.abs(existing.elevation_mm - level.elevation_mm) < 1)) throw new Error('Another level already uses this elevation')
      updated.levels.push({ ...level })
      updated.levels.sort((a, b) => a.elevation_mm - b.elevation_mm)
      return {
        result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] },
        updatedProject: updated,
        emittedEnvelope: envelope,
      }
    }
    case 'UpdateCoordinationSettings': {
      const { settings } = input as unknown as UpdateCoordinationSettingsInput
      validateCoordinationSettings(settings)
      const normalized = normalizeCoordinationSettings(settings)
      updated.coordination_settings = normalized
      // Re-running coordination after a settings change is the caller's decision; the command only
      // owns the persisted deviation so undo/redo restores the previous rule set atomically.
      return {
        result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] },
        updatedProject: updated,
        emittedEnvelope: envelope,
      }
    }
    case 'UpdateSheetViewport': {
      const {sheet_id,viewport}=input as unknown as UpdateSheetViewportInput
      updated.drawing_settings={...updated.drawing_settings,viewports:{...updated.drawing_settings?.viewports,[sheet_id]:viewport}}
      validateDrawingSettings(updated.drawing_settings)
      return {result:{status:'success',command_id,command_name:commandName,affected_object_ids:[]},updatedProject:updated,emittedEnvelope:envelope}
    }
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
      const dependentIds = Object.values(updated.objects).filter(object => {
        const data = object.module_data as Record<string, unknown>
        return object.level_refs.some(reference => reference.level_id === levelInput.id)
          || ['level_id', 'base_level_id', 'top_level_id', 'head_level_id'].some(key => data[key] === levelInput.id)
      }).map(object => object.id)
      return {
        result: { status: 'success', command_id, command_name: commandName, affected_object_ids: dependentIds, updated_object_ids: dependentIds },
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

      // The dependency graph is the shared source of truth for "who depends on this object".
      // Domain helpers still contribute their own derived geometry, and both sets are unioned so
      // no dependent is silently orphaned.
      const dependencyImpact = analyzeDependencyImpact(buildDependencyGraph(updated), [delInput.object_id], 'delete')
      const graphCascade = dependencyImpact.entries
        .filter(entry => entry.disposition === 'cascade_delete')
        .map(entry => entry.object_id)
      const archDependents = getArchitectureDeletionDependents(updated, delInput.object_id)
      const structDependents = getStructureDeletionDependents(updated, delInput.object_id)
      const decorativeDependents = Object.values(updated.objects)
        .filter(obj => (obj.object_type === 'decorative.moulding_run' || obj.object_type === 'decorative.wall_panel') &&
          ((obj.module_data as Record<string, unknown>).host_id === delInput.object_id || obj.host_refs.includes(delInput.object_id)))
        .map(obj => obj.id)

      const hostedIdsToDelete = [...new Set([...archDependents, ...structDependents, ...decorativeDependents, ...graphCascade])]

      delete updated.objects[delInput.object_id]
      for (const hid of hostedIdsToDelete) {
        delete updated.objects[hid]
      }

      const allDeletedIds = [delInput.object_id, ...hostedIdsToDelete]
      const structUpdated = reconcileStructureDeletion(updated, allDeletedIds, now)

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
      // Objects that survive the deletion but lost a host/support must be reported as needing a
      // new one; blocking dependents are surfaced so the caller can resolve them explicitly.
      const needsRehost = dependencyImpact.entries
        .filter(entry => entry.disposition === 'needs_rehost' && updated.objects[entry.object_id])
        .map(entry => entry.object_id)
      const updatedObjectIds = [...new Set([...treatmentHostsUpdated, ...structUpdated, ...needsRehost])]
      const affectedIds = [...allDeletedIds, ...updatedObjectIds]
      const warnings = [
        ...dependencyImpact.warnings,
        ...(needsRehost.length ? [`ต้องกำหนด host/ที่ยึดใหม่ ${needsRehost.length} ชิ้น: ${needsRehost.join(', ')}`] : []),
      ]

      return {
        result: {
          status: 'success',
          command_id,
          command_name: commandName,
          affected_object_ids: affectedIds,
          deleted_object_ids: allDeletedIds,
          updated_object_ids: updatedObjectIds,
          ...(warnings.length ? { warnings } : {}),
          dependency_impact: dependencyImpact,
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

      // Demolishing a host is not the same as deleting it: hosted objects survive but must be
      // re-hosted or re-routed, so the impact report is attached to the committed command.
      const nextRemovedPhase = updated.objects[object_id].removed_phase
      const dependencyImpact = nextRemovedPhase === 'demolition' && target.removed_phase !== 'demolition'
        ? analyzeDependencyImpact(buildDependencyGraph(updated), [object_id], 'demolish')
        : undefined
      const affectedDependents = dependencyImpact
        ? dependencyImpact.entries.filter(entry => entry.disposition !== 'informational').map(entry => entry.object_id)
        : []

      return {
        result: {
          status: 'success',
          command_id,
          command_name: commandName,
          affected_object_ids: [object_id, ...affectedDependents],
          updated_object_ids: [object_id],
          ...(dependencyImpact ? { dependency_impact: dependencyImpact } : {}),
        },
        updatedProject: updated,
        emittedEnvelope: { ...envelope, input: { ...input } },
      }
    }


  }
}
