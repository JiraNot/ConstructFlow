import { catalogInstanceOverrides, resolveCatalogType, type TypeDefinition, type ProjectDocument } from '@constructflow/project-model'
import type { AssignInstanceTypeInput, CommandBusResult, CommandHandlerContext, DefineStructuralTypeInput, RenameCatalogTypeInput, UpdateStructuralTypeDimensionsInput } from '@constructflow/command-schema'

const PARAMETER_FIELDS = ['section_mm', 'size_mm', 'thickness_mm', 'height_mm', 'width_mm', 'sill_height_mm', 'material', 'foundation_type', 'topping_mm', 'slab_system', 'drop_mm', 'rebar_type', 'mass_per_m_kg', 'diameter_mm', 'cover_mm', 'grade', 'count', 'depth_mm', 'board_mm', 'back_mm', 'plinth_mm', 'front', 'carcass_material', 'front_material', 'back_material', 'countertop_material', 'countertop_mm', 'watts_per_m', 'driver_watts', 'derating_ratio'] as const

function reject(context: CommandHandlerContext, message: string): CommandBusResult {
  return {
    result: { status: 'rejected', command_id: context.command_id, command_name: context.commandName, affected_object_ids: [], errors: [message] },
    updatedProject: context.project,
  }
}

function updateInstances(context: CommandHandlerContext, type: TypeDefinition, updates: Record<string, unknown>, previousType:TypeDefinition): string[] {
  const { updated, now } = context
  const affected: string[] = []
  for (const [id, object] of Object.entries(updated.objects)) {
    if (object.object_type !== type.object_type) continue
    const data = object.module_data as Record<string, unknown>
    const matches = data.type_id === type.id || (!data.type_id && typeof data.mark === 'string' && data.mark.trim().toLowerCase() === type.name.trim().toLowerCase())
    if (!matches) continue
    const overrides = data.instance_overrides && typeof data.instance_overrides === 'object' && !Array.isArray(data.instance_overrides)
      ? data.instance_overrides as Record<string, unknown>
      : catalogInstanceOverrides(type.object_type, data, previousType)
    const nextData: Record<string, unknown> = { ...data, type_id: type.id, instance_overrides: overrides }
    for (const [field, value] of Object.entries(updates)) {
      if (value !== undefined && overrides[field] === undefined) nextData[field] = structuredClone(value)
    }
    if (JSON.stringify(nextData) !== JSON.stringify(data)) {
      updated.objects[id] = { ...object, schema_version:object.object_type==='structure.beam'&&(nextData.drop_mm!==undefined||nextData.rebar_type!==undefined)?2:object.schema_version,module_data: nextData, updated_at: now,revision_meta:{...object.revision_meta,dirty_quantity:true,dirty_drawing:true} }
      affected.push(id)
    }
  }
  return affected
}

export function executeCatalogCommand(context: CommandHandlerContext): CommandBusResult | undefined {
  const { project, updated, commandName, input, command_id, now, envelope } = context
  switch (commandName) {
    case 'DefineStructuralType': {
      const request = input as unknown as DefineStructuralTypeInput
      const name = request.name?.trim()
      if (!name) return reject(context, 'Catalog type name is required')
      if (updated.types.some(type => type.object_type === request.object_type && type.name.trim().toLowerCase() === name.toLowerCase())) {
        return reject(context, `Catalog type ${name} already exists in ${request.object_type}`)
      }
      const id = request.id ?? crypto.randomUUID()
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return reject(context, 'Catalog type ID must be an RFC-4122 UUID')
      if (updated.types.some(type => type.id.toLowerCase() === id.toLowerCase())) return reject(context, `Catalog type UUID ${id} already exists`)
      const type: TypeDefinition = { id: id.toLowerCase(), object_type: request.object_type, name, parameters: { ...structuredClone(request.parameters) } }
      updated.types.push(type)
      return {
        result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [] },
        updatedProject: updated,
        emittedEnvelope: { ...envelope, input: { ...request, id: type.id, name } },
      }
    }

    case 'UpdateStructuralTypeDimensions': {
      const request = input as unknown as UpdateStructuralTypeDimensionsInput
      const reference = (request.type_id_or_name || request.type_name || '').trim()
      const type = resolveCatalogType(updated, request.object_type ?? '', reference)
      // Backward-compatible callers that do not supply object_type may resolve an unambiguous mark/ID.
      const unambiguous = type ?? (request.object_type ? undefined : updated.types.filter(value =>
        value.id.toLowerCase() === reference.toLowerCase() || value.name.trim().toLowerCase() === reference.toLowerCase()).length === 1
        ? updated.types.find(value => value.id.toLowerCase() === reference.toLowerCase() || value.name.trim().toLowerCase() === reference.toLowerCase())
        : undefined)
      if (!reference || !unambiguous) return reject(context, `Catalog type ${reference || '(empty)'} was not found or is ambiguous`)
      const updates: Record<string, unknown> = {}
      for (const field of PARAMETER_FIELDS) {
        const value = (request as unknown as Record<string, unknown>)[field] ?? (request.parameters as Record<string, unknown> | undefined)?.[field]
        if (value !== undefined) updates[field] = structuredClone(value)
      }
      if (Object.keys(updates).length === 0) return reject(context, `No supported parameters provided for ${unambiguous.name}`)
      const previousType=structuredClone(unambiguous)
      Object.assign(unambiguous.parameters, updates)
      const affected = updateInstances(context, unambiguous, updates,previousType)
      return {
        result: { status: 'success', command_id, command_name: commandName, affected_object_ids: affected, updated_object_ids: affected },
        updatedProject: updated,
        emittedEnvelope: { ...envelope, input: {
          type_id_or_name: unambiguous.id, type_name: unambiguous.name, object_type: unambiguous.object_type,
          ...updates, parameters: updates,
        } },
      }
    }

    case 'AssignInstanceType': {
      const request = input as unknown as AssignInstanceTypeInput
      const object = updated.objects[request.object_id]
      if (!object) return reject(context, `Object ${request.object_id} not found`)
      const reference = request.type_id || request.type_name
      const type = resolveCatalogType(updated, object.object_type, reference)
      if (!type) return reject(context, `Catalog type ${reference || '(empty)'} was not found in ${object.object_type}`)
      const oldData = object.module_data as Record<string, unknown>
      const nextData: Record<string, unknown> = { ...oldData, mark: type.name, type_id: type.id, instance_overrides: {} }
      for (const field of PARAMETER_FIELDS) if (type.parameters[field] !== undefined) nextData[field] = structuredClone(type.parameters[field])
      updated.objects[object.id] = { ...object, module_data: nextData, updated_at: now }
      return {
        result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [object.id], updated_object_ids: [object.id] },
        updatedProject: updated,
        emittedEnvelope: { ...envelope, input: { object_id: object.id, type_id: type.id, type_name: type.name } },
      }
    }

    case 'RenameCatalogType': {
      const request = input as unknown as RenameCatalogTypeInput
      const type = updated.types.find(value => value.id === request.type_id)
      const name = request.name?.trim()
      if (!type) return reject(context, `Catalog type UUID ${request.type_id} not found`)
      if (!name) return reject(context, 'Catalog type name is required')
      if (updated.types.some(value => value.id !== type.id && value.object_type === type.object_type && value.name.trim().toLowerCase() === name.toLowerCase())) {
        return reject(context, `Catalog type ${name} already exists in ${type.object_type}`)
      }
      const previousName = type.name
      type.name = name
      const affected: string[] = []
      for (const [id, object] of Object.entries(updated.objects)) {
        if (object.object_type !== type.object_type) continue
        const data = object.module_data as Record<string, unknown>
        if (data.type_id === type.id || (!data.type_id && typeof data.mark === 'string' && data.mark.trim().toLowerCase() === previousName.trim().toLowerCase())) {
          updated.objects[id] = { ...object, module_data: { ...data, type_id: type.id, mark: name }, updated_at: now }
          affected.push(id)
        }
      }
      return {
        result: { status: 'success', command_id, command_name: commandName, affected_object_ids: affected, updated_object_ids: affected },
        updatedProject: updated,
        emittedEnvelope: { ...envelope, input: { type_id: type.id, name } },
      }
    }

    default: return undefined
  }
}
