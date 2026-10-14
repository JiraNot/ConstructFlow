import { getArchitectureDeletionDependents } from '@constructflow/architecture-engine'
import { getStructureDeletionDependents, reconcileStructureDeletion } from '@constructflow/structure-engine'
import { DeleteObjectInput } from '@constructflow/command-schema'
import {
  analyzeDependencyImpact,
  buildDependencyGraph,
  normalizeCoordinationSettings,
  validateCoordinationSettings,
  validateDrawingSettings,
  validateRainwaterDesignSettings,
  validateSiteSurvey,
  resolveStairVerticalExtent,
} from '@constructflow/project-model'
import type { DeleteSheetLayoutTemplateInput, DeleteViewTemplateInput, SaveSheetLayoutTemplateInput, SaveViewTemplateInput, SetViewVisibilityInput, UpdateCoordinationSettingsInput, UpdateObjectSourceReferencesInput, UpdateRainwaterDesignInput, UpdateSheetViewportInput, UpdateSiteSurveyInput } from '@constructflow/command-schema'

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
    case 'UpdateRainwaterDesign': {
      const { settings } = input as unknown as UpdateRainwaterDesignInput
      validateRainwaterDesignSettings(settings)
      updated.rainwater_design = structuredClone(settings)
      return {
        result: { status: 'success', command_id, command_name: commandName, affected_object_ids: Object.values(updated.objects).filter(object => object.object_type === 'roof.system').map(object => object.id) },
        updatedProject: updated,
        emittedEnvelope: envelope,
      }
    }
    case 'UpdateSiteSurvey': {
      const { survey } = input as unknown as UpdateSiteSurveyInput
      validateSiteSurvey(survey)
      updated.site_survey = structuredClone(survey)
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] }, updatedProject: updated, emittedEnvelope: envelope }
    }
    case 'UpdateObjectSourceReferences': {
      const { object_ids, source_refs } = input as unknown as UpdateObjectSourceReferencesInput
      if (!Array.isArray(object_ids) || object_ids.length === 0 || object_ids.some(id => typeof id !== 'string' || !updated.objects[id]) || new Set(object_ids).size !== object_ids.length) {
        throw new Error('Source references require a non-empty list of unique existing objects')
      }
      if (!Array.isArray(source_refs) || source_refs.length > 100) throw new Error('An object may reference at most 100 project sources')
      const validPointIds = new Set(updated.site_survey?.points.map(point => point.id) ?? [])
      const validBoundaryIds = new Set(updated.site_survey?.boundaries.map(boundary => boundary.id) ?? [])
      const validUnderlayIds = new Set(Object.keys(updated.underlays ?? {}))
      const keys = new Set<string>()
      for (const source of source_refs) {
        if (!source || typeof source.source_id !== 'string' || !source.source_id.trim() || !['site_survey_point', 'site_survey_boundary', 'underlay'].includes(source.kind)) {
          throw new Error('Project source reference is malformed')
        }
        const key = `${source.kind}:${source.source_id}`
        if (keys.has(key)) throw new Error('Project source references must be unique')
        keys.add(key)
        const exists = source.kind === 'site_survey_point' ? validPointIds.has(source.source_id)
          : source.kind === 'site_survey_boundary' ? validBoundaryIds.has(source.source_id)
            : validUnderlayIds.has(source.source_id)
        if (!exists) throw new Error(`Project source ${key} does not exist`)
      }
      for (const id of object_ids) {
        const object = updated.objects[id]!
        if (source_refs.length) object.source_refs = structuredClone(source_refs)
        else delete object.source_refs
      }
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [...object_ids] }, updatedProject: updated, emittedEnvelope: envelope }
    }
    case 'UpdateSheetViewport': {
      const {sheet_id,viewport}=input as unknown as UpdateSheetViewportInput
      updated.drawing_settings={...updated.drawing_settings,viewports:{...updated.drawing_settings?.viewports,[sheet_id]:viewport}}
      validateDrawingSettings(updated.drawing_settings)
      return {result:{status:'success',command_id,command_name:commandName,affected_object_ids:[]},updatedProject:updated,emittedEnvelope:envelope}
    }
    case 'SaveSheetLayoutTemplate': {
      const { template } = input as unknown as SaveSheetLayoutTemplateInput
      if (!template || typeof template !== 'object' || !template.id?.trim() || template.id.length > 100) throw new Error('Sheet layout template requires a valid ID')
      if (!template.name?.trim() || template.name.trim().length > 80) throw new Error('Sheet layout template name must contain 1 to 80 characters')
      const settings = updated.drawing_settings ?? { viewports: {} }
      const current = settings.layout_templates ?? []
      if (current.some(existing => existing.id !== template.id && existing.name.trim().toLowerCase() === template.name.trim().toLowerCase())) throw new Error('Sheet layout template names must be unique')
      const viewports = Object.fromEntries(Object.entries(template.viewports ?? {}).map(([sheetId, viewport]) => [sheetId, {
        scale_denominator: viewport.scale_denominator,
        ...(viewport.view_layout !== undefined ? { view_layout: [...viewport.view_layout] } : {}),
        ...(viewport.paper_frame_mm !== undefined ? { paper_frame_mm: [...viewport.paper_frame_mm] as [number, number, number, number] } : {}),
        ...(viewport.subviews !== undefined ? { subviews: structuredClone(viewport.subviews) } : {}),
        ...(viewport.level_id !== undefined ? { level_id: viewport.level_id } : {}),
        ...(viewport.center_mm !== undefined ? { center_mm: [...viewport.center_mm] as [number, number] } : {}),
        ...(viewport.crop_bounds_mm !== undefined ? { crop_bounds_mm: [...viewport.crop_bounds_mm] as [number, number, number, number] } : {}),
        ...(viewport.section_cut_mm !== undefined ? { section_cut_mm: viewport.section_cut_mm } : {}),
      }]))
      const next = [...current.filter(existing => existing.id !== template.id), { id: template.id, name: template.name.trim(), viewports }]
      updated.drawing_settings = { ...settings, layout_templates: next }
      validateDrawingSettings(updated.drawing_settings)
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] }, updatedProject: updated, emittedEnvelope: envelope }
    }
    case 'DeleteSheetLayoutTemplate': {
      const { template_id } = input as unknown as DeleteSheetLayoutTemplateInput
      const settings = updated.drawing_settings
      const current = settings?.layout_templates ?? []
      if (!current.some(template => template.id === template_id)) throw new Error(`Sheet layout template ${template_id} was not found`)
      const layout_templates = current.filter(template => template.id !== template_id)
      if (settings) updated.drawing_settings = { ...settings, ...(layout_templates.length ? { layout_templates } : { layout_templates: undefined }) }
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] }, updatedProject: updated, emittedEnvelope: envelope }
    }
    case 'SaveViewTemplate': {
      const { template } = input as unknown as SaveViewTemplateInput
      if (!template || typeof template !== 'object' || !template.id?.trim() || template.id.length > 100) throw new Error('View template requires a valid ID')
      if (!template.name?.trim() || template.name.trim().length > 80) throw new Error('View template name must contain 1 to 80 characters')
      const views = new Set(['plan', 'framing', 'roofplan', 'north', 'south', 'east', 'west', 'rcp', 'model3d'])
      if (!views.has(template.view_id) || !updated.levels.some(level => level.id === template.level_id)) throw new Error('View template requires a supported view and existing level')
      if (!Array.isArray(template.hidden_object_ids) || template.hidden_object_ids.some(id => typeof id !== 'string' || !updated.objects[id])) throw new Error('View template can only reference existing object UUIDs')
      if (new Set(template.hidden_object_ids).size !== template.hidden_object_ids.length) throw new Error('View template object UUIDs must be unique')
      const current = updated.view_settings?.view_templates ?? []
      if (current.some(existing => existing.id !== template.id && existing.name.trim().toLowerCase() === template.name.trim().toLowerCase())) throw new Error('View template names must be unique')
      const next = current.filter(existing => existing.id !== template.id)
      next.push(structuredClone({ ...template, name: template.name.trim(), hidden_object_ids: [...template.hidden_object_ids] }))
      updated.view_settings = { hidden_object_ids_by_scope: updated.view_settings?.hidden_object_ids_by_scope ?? {}, view_templates: next }
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] }, updatedProject: updated, emittedEnvelope: envelope }
    }
    case 'DeleteViewTemplate': {
      const { template_id } = input as unknown as DeleteViewTemplateInput
      const current = updated.view_settings?.view_templates ?? []
      if (!current.some(template => template.id === template_id)) throw new Error(`View template ${template_id} was not found`)
      const view_templates = current.filter(template => template.id !== template_id)
      const visibility = updated.view_settings?.hidden_object_ids_by_scope ?? {}
      updated.view_settings = Object.keys(visibility).length || view_templates.length
        ? { hidden_object_ids_by_scope: visibility, ...(view_templates.length ? { view_templates } : {}) }
        : undefined
      return { result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] }, updatedProject: updated, emittedEnvelope: envelope }
    }
    case 'SetViewVisibility': {
      const { scope_id, hidden_object_ids } = input as unknown as SetViewVisibilityInput
      const [viewId, levelId, extra] = scope_id.split(':')
      const views = new Set(['plan', 'framing', 'roofplan', 'north', 'south', 'east', 'west', 'rcp', 'model3d'])
      if (!scope_id || extra !== undefined || !views.has(viewId) || !updated.levels.some(level => level.id === levelId)) {
        throw new Error('View visibility requires a supported view and existing level scope')
      }
      if (!Array.isArray(hidden_object_ids) || hidden_object_ids.some(id => typeof id !== 'string' || !updated.objects[id])) {
        throw new Error('View visibility can only reference existing object UUIDs')
      }
      if (new Set(hidden_object_ids).size !== hidden_object_ids.length) throw new Error('View visibility object UUIDs must be unique')
      const scopes = updated.view_settings?.hidden_object_ids_by_scope ?? {}
      const visibility = { ...scopes }
      if (hidden_object_ids.length) visibility[scope_id] = [...hidden_object_ids]
      else delete visibility[scope_id]
      const viewTemplates = updated.view_settings?.view_templates
      updated.view_settings = Object.keys(visibility).length || viewTemplates?.length
        ? { hidden_object_ids_by_scope: visibility, ...(viewTemplates?.length ? { view_templates: viewTemplates } : {}) }
        : undefined
      return {
        result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] },
        updatedProject: updated,
        emittedEnvelope: envelope,
      }
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
      for (const id of dependentIds) {
        const object = updated.objects[id]
        if (object.object_type !== 'architecture.stair') continue
        const d = object.module_data as Record<string, unknown>
        const vertical = resolveStairVerticalExtent(updated, object)
        if (!vertical) throw new Error('Updated level would place a stair top below its base')
        const point = d.start_point_mm as [number, number, number]
        updated.objects[id] = { ...object, updated_at: now, module_data: { ...d,
          start_point_mm: [point[0], point[1], vertical.base_elevation_mm], total_rise_mm: vertical.height_mm,
          riser_height_mm: vertical.height_mm / Number(d.num_risers) } }
      }
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
      if (updated.view_settings) {
        const visibility = Object.fromEntries(Object.entries(updated.view_settings.hidden_object_ids_by_scope)
          .flatMap(([scopeId, ids]) => {
            const remaining = ids.filter(id => !allDeletedIds.includes(id))
            return remaining.length ? [[scopeId, remaining]] : []
          }))
        const templates = updated.view_settings.view_templates?.map(template => ({
          ...template,
          hidden_object_ids: template.hidden_object_ids.filter(id => !allDeletedIds.includes(id)),
        }))
        updated.view_settings = Object.keys(visibility).length || templates?.length
          ? { hidden_object_ids_by_scope: visibility, ...(templates?.length ? { view_templates: templates } : {}) }
          : undefined
      }
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
