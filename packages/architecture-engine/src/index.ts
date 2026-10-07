import { SmartObject, WallModuleData, DoorModuleData, WindowModuleData, DoorHanding, resolveCatalogType, catalogInstanceOverrides, isWallObject, isDoorObject, isWindowObject } from '@constructflow/project-model'
import { CreateWallInput, MoveWallInput, MoveOpeningInput, UpdateWallMarkInput, UpdateWallDimensionsInput, CreateDoorInput, UpdateDoorMarkInput, UpdateDoorDimensionsInput, FlipDoorHandingInput, CreateWindowInput, UpdateWindowMarkInput, UpdateWindowDimensionsInput } from '@constructflow/command-schema'

import { CommandHandlerContext, CommandBusResult } from '@constructflow/command-schema'
import type { ProjectDocument } from '@constructflow/project-model'

function positiveCatalogNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function catalogString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

/** Project an XY point onto a wall centerline and clamp it so a hosted opening fits. */
export function projectPointToWallOffsetMm(
  point_mm: [number, number],
  start_point_mm: [number, number],
  end_point_mm: [number, number],
  opening_width_mm: number,
): number | undefined {
  if (![...point_mm, ...start_point_mm, ...end_point_mm, opening_width_mm].every(Number.isFinite) || opening_width_mm <= 0) return undefined
  const dx = end_point_mm[0] - start_point_mm[0]
  const dy = end_point_mm[1] - start_point_mm[1]
  const length = Math.hypot(dx, dy)
  if (!Number.isFinite(length) || length < opening_width_mm) return undefined
  const projected = ((point_mm[0] - start_point_mm[0]) * dx + (point_mm[1] - start_point_mm[1]) * dy) / length
  return Math.max(opening_width_mm / 2, Math.min(length - opening_width_mm / 2, projected))
}

/** Domain-owned lifecycle query; the transaction runtime performs generic deletion. */
export function getArchitectureDeletionDependents(project: ProjectDocument, objectId: string): string[] {
  if (project.objects[objectId]?.object_type !== 'architecture.wall') return []
  return Object.values(project.objects)
    .filter(obj => (isDoorObject(obj) || isWindowObject(obj)) && obj.module_data.wall_id === objectId)
    .map(obj => obj.id)
}

export function executeArchitectureCommand(context: CommandHandlerContext): CommandBusResult | undefined {
  const { project, updated, commandName, input, command_id, now, envelope } = context
  switch (commandName) {
    case 'MoveWall': {
      const move = input as unknown as MoveWallInput
      const target = updated.objects[move.object_id]
      if (!target || !isWallObject(target)) {
        return {
          result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: [`Wall UUID ${move.object_id} not found`] },
          updatedProject: project,
        }
      }
      if (!Array.isArray(move.delta_mm) || move.delta_mm.length !== 2 || !move.delta_mm.every(Number.isFinite) || (move.delta_mm[0] === 0 && move.delta_mm[1] === 0)) {
        return {
          result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: ['Wall move delta must contain finite, non-zero X/Y values in millimeters'] },
          updatedProject: project,
        }
      }
      const [dx, dy] = move.delta_mm
      const wallData = target.module_data
      const start: [number, number, number] = [wallData.start_point_mm[0] + dx, wallData.start_point_mm[1] + dy, wallData.start_point_mm[2] ?? 0]
      const end: [number, number, number] = [wallData.end_point_mm[0] + dx, wallData.end_point_mm[1] + dy, wallData.end_point_mm[2] ?? 0]
      updated.objects[target.id] = {
        ...target,
        module_data: { ...wallData, start_point_mm: start, end_point_mm: end },
        updated_at: now,
      }
      const affected = [target.id]
      for (const opening of Object.values(updated.objects)) {
        if ((!isDoorObject(opening) && !isWindowObject(opening)) || opening.module_data.wall_id !== target.id) continue
        const location = opening.module_data.location_mm
        updated.objects[opening.id] = {
          ...opening,
          module_data: { ...opening.module_data, location_mm: [location[0] + dx, location[1] + dy, location[2] ?? 0] },
          updated_at: now,
        }
        affected.push(opening.id)
      }
      return {
        result: { status: 'success', command_id, command_name: commandName, affected_object_ids: affected, updated_object_ids: affected },
        updatedProject: updated,
        emittedEnvelope: { ...envelope, input: { ...move, delta_mm: [dx, dy] } },
      }
    }

    case 'MoveOpening': {
      const move = input as unknown as MoveOpeningInput
      const target = updated.objects[move.object_id]
      if (!target || (!isDoorObject(target) && !isWindowObject(target))) {
        return {
          result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: [`Opening UUID ${move.object_id} not found`] },
          updatedProject: project,
        }
      }
      const wall = updated.objects[target.module_data.wall_id]
      if (!wall || !isWallObject(wall)) {
        return {
          result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: [`Host wall for opening ${move.object_id} not found`] },
          updatedProject: project,
        }
      }
      if (!Number.isFinite(move.offset_along_wall_mm)) {
        return {
          result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: ['Opening offset must be finite millimeters'] },
          updatedProject: project,
        }
      }
      const openingData = target.module_data
      const wallData = wall.module_data
      const width = positiveCatalogNumber(
        openingData.instance_overrides?.width_mm
          ?? openingData.width_mm
          ?? resolveCatalogType(project, target.object_type, openingData.type_id ?? openingData.mark)?.parameters.width_mm,
        0,
      )
      const dx = wallData.end_point_mm[0] - wallData.start_point_mm[0]
      const dy = wallData.end_point_mm[1] - wallData.start_point_mm[1]
      const wallLength = Math.hypot(dx, dy)
      if (!width || !Number.isFinite(wallLength) || wallLength <= 0 || move.offset_along_wall_mm - width / 2 < -1 || move.offset_along_wall_mm + width / 2 > wallLength + 1) {
        return {
          result: { status: 'rejected', command_id, command_name: commandName, affected_object_ids: [], errors: [`Opening ${move.object_id} does not fit within host wall ${wall.id}`] },
          updatedProject: project,
        }
      }
      const ratio = move.offset_along_wall_mm / wallLength
      const currentLocation = openingData.location_mm
      const location_mm: [number, number, number] = [
        wallData.start_point_mm[0] + dx * ratio,
        wallData.start_point_mm[1] + dy * ratio,
        currentLocation[2] ?? wallData.start_point_mm[2] ?? 0,
      ]
      updated.objects[target.id] = {
        ...target,
        updated_at: now,
        module_data: { ...openingData, offset_along_wall_mm: move.offset_along_wall_mm, location_mm },
      }
      return {
        result: { status: 'success', command_id, command_name: commandName, affected_object_ids: [target.id], updated_object_ids: [target.id] },
        updatedProject: updated,
        emittedEnvelope: { ...envelope, input: { ...move } },
      }
    }

    case 'CreateWall': {
      const wallInput = input as unknown as CreateWallInput
      const id = wallInput.id || crypto.randomUUID()
      const mark = wallInput.mark || 'W1'
      const level_id = wallInput.level_id || project.project.active_level_id
      const typeDef = resolveCatalogType(updated, 'architecture.wall', wallInput.type_id || mark)
      const thickness_mm = wallInput.thickness_mm || positiveCatalogNumber(typeDef?.parameters.thickness_mm, 100)
      const height_mm = wallInput.height_mm || positiveCatalogNumber(typeDef?.parameters.height_mm, 2800)
      const material = wallInput.material || catalogString(typeDef?.parameters.material, 'brick_masonry')
      const legacyInput = wallInput as CreateWallInput & { start_node_mm?: [number, number, number]; end_node_mm?: [number, number, number] }
      const rawStart = wallInput.start_point_mm || legacyInput.start_node_mm || [0, 0, 0]
      const rawEnd = wallInput.end_point_mm || legacyInput.end_node_mm || [0, 0, 0]
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
        created_phase: wallInput.phase || project.project.active_phase,
        removed_phase: null,
        level_refs: [
          {
            role: 'base_level',
            level_id,
          },
        ],
        host_refs: [],
        connector_refs: [],
        status: 'active',
        module_data: {
          mark,
          type_id: typeDef?.id,
          instance_overrides: catalogInstanceOverrides('architecture.wall', { thickness_mm, height_mm, material }, typeDef),
          start_point_mm,
          end_point_mm,
          thickness_mm,
          height_mm,
          length_mm,
          level_id,
          material,
          ...(wallInput.interface_treatments ? { interface_treatments: structuredClone(wallInput.interface_treatments) } : {}),
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
            level_id,
            path_mm: [start_point_mm, end_point_mm],
            thickness_mm: wallInput.thickness_mm || 100,
            height_mm: wallInput.height_mm || 2800,
            length_mm,
          },
        },
      }
    }

    case 'UpdateWallMark': {
      const wMarkInput = input as unknown as UpdateWallMarkInput
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
      const wDimInput = input as unknown as UpdateWallDimensionsInput
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
      const doorInput = input as unknown as CreateDoorInput
      const id = doorInput.id || crypto.randomUUID()
      const mark = doorInput.mark || 'D1'
      const typeDef = resolveCatalogType(updated, 'door_window.door', doorInput.type_id || mark)
      const width_mm = doorInput.width_mm || positiveCatalogNumber(typeDef?.parameters.width_mm, 800)
      const height_mm = doorInput.height_mm || positiveCatalogNumber(typeDef?.parameters.height_mm, 2000)
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
        created_phase: doorInput.phase || project.project.active_phase,
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
          type_id: typeDef?.id,
          instance_overrides: catalogInstanceOverrides('door_window.door', { width_mm: width_mm, height_mm: height_mm }, typeDef),
          wall_id: doorInput.wall_id,
          location_mm,
          offset_along_wall_mm: doorInput.offset_along_wall_mm,
          width_mm,
          height_mm,
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
      const dMarkInput = input as unknown as UpdateDoorMarkInput
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
      const dDimInput = input as unknown as UpdateDoorDimensionsInput
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
      const flipInput = input as unknown as FlipDoorHandingInput
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
      const winInput = input as unknown as CreateWindowInput
      const id = winInput.id || crypto.randomUUID()
      const mark = winInput.mark || 'W1'
      const typeDef = resolveCatalogType(updated, 'door_window.window', winInput.type_id || mark)
      const width_mm = winInput.width_mm || positiveCatalogNumber(typeDef?.parameters.width_mm, 1200)
      const height_mm = winInput.height_mm || positiveCatalogNumber(typeDef?.parameters.height_mm, 1200)
      const sill_height_mm = winInput.sill_height_mm ?? positiveCatalogNumber(typeDef?.parameters.sill_height_mm, 900)
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
        created_phase: winInput.phase || project.project.active_phase,
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
          type_id: typeDef?.id,
          instance_overrides: catalogInstanceOverrides('door_window.window', { width_mm: width_mm, height_mm: height_mm, sill_height_mm: sill_height_mm }, typeDef),
          wall_id: winInput.wall_id,
          location_mm,
          offset_along_wall_mm: winInput.offset_along_wall_mm,
          width_mm,
          height_mm,
          sill_height_mm,
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
      const wMarkInput = input as unknown as UpdateWindowMarkInput
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
      const wDimInput = input as unknown as UpdateWindowDimensionsInput
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


  }
}
