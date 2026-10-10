import { validateProjectV2, type ProjectDocument } from '@constructflow/project-model'
import type {
  CommandActorKind, CommandEnvelope, CommandRequest, CommandBusResult,
  CommandBatchResult, CommandHandlerContext,
} from '@constructflow/command-schema'
import { executeStructureCommand, reconcileStructuralLevelElevation } from '@constructflow/structure-engine'
import { executeArchitectureCommand, refreshWallDerivedRooms } from '@constructflow/architecture-engine'
import { executeCatalogCommand } from '@constructflow/catalog-engine'
import { executeProjectCommand } from './projectCommands.js'
import { executeStructureConstructionCommand, reconcileTypeReinforcement } from '@constructflow/structure-engine'
import { executeBathroomCommand } from '@constructflow/architecture-engine'
import { executeRoofCommand } from '@constructflow/roof-engine'
import { executeDecorativeCommand } from '@constructflow/decorative-engine'
import { executeDrainageCommand } from '@constructflow/drainage-engine'
import { executePlumbingCommand } from '@constructflow/plumbing-engine'
import { executeElectricalCommand } from '@constructflow/electrical-engine'
import { executeInteriorCommand } from '@constructflow/interior-engine'
import { validateConstructionProject } from '@constructflow/domain-providers'
import { executeDuplicateObjects } from './clipboardCommands.js'
import { ConstructFlowSolver } from '@constructflow/constraint-engine'

const handlers = [(context: CommandHandlerContext) => context.commandName === 'DuplicateObjects' ? executeDuplicateObjects(context) : null,
  executeProjectCommand, executeStructureCommand, executeArchitectureCommand, executeCatalogCommand,
  executeStructureConstructionCommand, executeBathroomCommand, executeRoofCommand, executeDecorativeCommand,
  executePlumbingCommand, executeDrainageCommand, executeElectricalCommand, executeInteriorCommand]
const phases = new Set(['existing', 'demolition', 'new_construction'])

/** Host-independent CQRS runtime. Domain handlers never receive the live document. */
export class CommandBus {
  static execute(
    project: ProjectDocument,
    commandName: string,
    input: Record<string, unknown>,
    actorKind: CommandActorKind = 'human',
  ): CommandBusResult {
    const command_id = crypto.randomUUID()
    const now = new Date().toISOString()
    const reject = (message: string, status: 'rejected' | 'failed' = 'rejected'): CommandBusResult => ({
      result: { status, command_id, command_name: commandName, affected_object_ids: [], errors: [message] },
      updatedProject: project,
    })

    try {
      // Validate lifecycle values at the public boundary, including calls from AI/sync.
      for (const key of ['phase', 'created_phase']) {
        const value = input[key]
        if (value !== undefined && (typeof value !== 'string' || !phases.has(value))) {
          return reject(`Invalid ${key}: ${String(value)}`)
        }
      }
      const removedPhase = input.removed_phase
      if (removedPhase !== undefined && removedPhase !== null && removedPhase !== 'demolition') {
        return reject(`Invalid removed_phase: ${String(removedPhase)}`)
      }
      const typeFamily: Record<string, string> = {
        CreateColumn: 'structure.column', CreateFoundation: 'structure.foundation', CreateBeam: 'structure.beam',
        CreateWall: 'architecture.wall', CreateDoor: 'door_window.door', CreateWindow: 'door_window.window',
      }
      if (typeof input.type_id === 'string' && input.type_id && typeFamily[commandName]) {
        const type = project.types.find(candidate => candidate.id === input.type_id && candidate.object_type === typeFamily[commandName])
        if (!type) return reject(`Catalog type UUID ${input.type_id} is missing or incompatible with ${typeFamily[commandName]}`)
      }
      if (commandName.startsWith('Create') && typeof input.id === 'string' && input.id && project.objects[input.id]) {
        return reject(`Object UUID ${input.id} already exists`)
      }
      const updated = structuredClone(project)
      const payload = structuredClone(input)
      const envelope: CommandEnvelope = {
        command_id, name: commandName, version: 1, project_id: project.project.id,
        timestamp: now, actor: { kind: actorKind }, input: payload,
      }
      const context: CommandHandlerContext = {
        project, updated, commandName, input: payload, command_id, now, envelope,
      }
      for (const handle of handlers) {
        const response = handle(context)
        if (!response) continue
        if (response.result.status !== 'success') return { ...response, updatedProject: project }
        const wallGeometryCommands = new Set(['CreateWall', 'MoveWall', 'UpdateWallEndpoints', 'UpdateWallDimensions', 'DeleteObject'])
        if (wallGeometryCommands.has(commandName)) {
          const candidateIds: string[] = commandName === 'CreateWall'
            ? response.result.affected_object_ids
            : typeof input.object_id === 'string' ? [input.object_id] : []
          const changedWalls = candidateIds.map(id => ({ before: project.objects[id], after: response.updatedProject.objects[id] }))
            .filter(pair => pair.before?.object_type === 'architecture.wall' || pair.after?.object_type === 'architecture.wall')
          const levels = new Set<string>()
          for (const { before, after } of changedWalls) for (const object of [before, after]) {
            const data = object?.module_data as Record<string, unknown> | undefined
            const levelId = typeof data?.level_id === 'string' ? data.level_id : object?.level_refs.find(reference => reference.role === 'base_level')?.level_id
            if (levelId) levels.add(levelId)
          }
          if (levels.size) {
            const roomRefresh = refreshWallDerivedRooms({ ...context, updated: response.updatedProject }, [...levels], true)
            response.result.affected_object_ids = [...new Set([...response.result.affected_object_ids, ...roomRefresh.affected])]
            response.result.updated_object_ids = [...new Set([...(response.result.updated_object_ids ?? []), ...roomRefresh.updatedObjects])]
            const resultWithCreated = response.result as typeof response.result & { created_object_ids?: string[] }
            resultWithCreated.created_object_ids = [...new Set([...(resultWithCreated.created_object_ids ?? []), ...roomRefresh.created])]
            if (response.emittedEnvelope) response.emittedEnvelope.input = {
              ...response.emittedEnvelope.input,
              created_room_ids: roomRefresh.created,
              refreshed_room_ids: roomRefresh.updated,
              rooms_requiring_review: roomRefresh.updated.filter(id => (response.updatedProject.objects[id].module_data as Record<string, unknown>).boundary_status === 'unclosed'),
            }
          }
        }

        // --- Constraint Engine Execution (R3) ---
        if (response.updatedProject.constraints && response.updatedProject.constraints.length > 0) {
            const solver = new ConstructFlowSolver();
            solver.applyProjectConstraints(response.updatedProject.constraints);

            // Suggest current properties as edit variables
            for (const c of response.updatedProject.constraints) {
                for (const entity of c.entities) {
                    const obj = response.updatedProject.objects[entity.id];
                    if (obj) {
                        const data = obj.module_data as Record<string, any>;
                        // Extremely simplified mapping for demonstration
                        if (entity.property === 'start_x' && Array.isArray(data.start_mm)) {
                            solver.addEditIntent(entity.id, entity.property, data.start_mm[0]);
                        } else if (entity.property === 'start_y' && Array.isArray(data.start_mm)) {
                            solver.addEditIntent(entity.id, entity.property, data.start_mm[1]);
                        }
                    }
                }
            }

            const results = solver.solve();

            // Apply solved variables back to the project state
            for (const [key, value] of results.entries()) {
                const [id, prop] = key.split('.');
                const obj = response.updatedProject.objects[id];
                if (obj && obj.module_data) {
                    if (prop === 'start_x' && Array.isArray((obj.module_data as Record<string, any>).start_mm)) (obj.module_data as Record<string, any>).start_mm[0] = value;
                    else if (prop === 'start_y' && Array.isArray((obj.module_data as Record<string, any>).start_mm)) (obj.module_data as Record<string, any>).start_mm[1] = value;
                    // Additional property mapping would go here

                    if (!response.result.affected_object_ids.includes(id)) {
                        response.result.affected_object_ids.push(id);
                    }
                }
            }
        }
        // ----------------------------------------

        if (commandName === 'UpdateLevel' && typeof input.id === 'string') {
          const reconciledIds = reconcileStructuralLevelElevation(project, response.updatedProject, input.id, now)
          response.result.affected_object_ids = [...new Set([...response.result.affected_object_ids, ...reconciledIds])]
          response.result.updated_object_ids = [...new Set([...(response.result.updated_object_ids ?? []), ...reconciledIds])]
        }
        // A successful transaction also updates project metadata without touching the input.
        const rebarIds=reconcileTypeReinforcement(context)
        response.result.affected_object_ids=[...new Set([...response.result.affected_object_ids,...rebarIds])]
        response.updatedProject.project.updated_at = now
        validateProjectV2(response.updatedProject)
        validateConstructionProject(response.updatedProject)
        return response
      }
      return reject(`Unknown command: ${commandName}`)
    } catch (error: unknown) {
      return reject(error instanceof Error ? error.message : String(error), 'failed')
    }
  }

  static executeBatch(
    project: ProjectDocument,
    commands: readonly CommandRequest[],
    actorKind: CommandActorKind = 'human',
  ): CommandBatchResult {
    const transaction_id = crypto.randomUUID()
    const results: CommandBatchResult['results'] = []
    const emittedEnvelopes: CommandEnvelope[] = []
    let current = project
    for (const [index, command] of commands.entries()) {
      const response = this.execute(current, command.name, command.input, actorKind)
      results.push(response.result)
      if (response.result.status !== 'success') {
        return {
          transaction_id, status: response.result.status, updatedProject: project,
          results, emittedEnvelopes: [], failed_command_index: index, errors: response.result.errors,
        }
      }
      current = response.updatedProject
      if (response.emittedEnvelope) emittedEnvelopes.push({ ...response.emittedEnvelope, transaction_id })
    }
    return { transaction_id, status: 'success', updatedProject: current, results, emittedEnvelopes }
  }
}

/** One history entry per committed batch; redo restores the same IDs, not new creations. */
export class ProjectCommandSession {
  private current: ProjectDocument
  private past: ProjectDocument[] = []
  private future: ProjectDocument[] = []

  constructor(project: ProjectDocument) { this.current = structuredClone(project) }
  get project(): ProjectDocument { return structuredClone(this.current) }
  get canUndo(): boolean { return this.past.length > 0 }
  get canRedo(): boolean { return this.future.length > 0 }

  /** Commit an already-executed model update as one editor history entry. */
  commit(project: ProjectDocument): void {
    this.past.push(this.current)
    this.current = structuredClone(project)
    this.future = []
  }

  /** Replace the history baseline after opening/creating a document. */
  reset(project: ProjectDocument): void {
    this.current = structuredClone(project)
    this.past = []
    this.future = []
  }

  execute(commands: readonly CommandRequest[], actorKind: CommandActorKind = 'human'): CommandBatchResult {
    const response = CommandBus.executeBatch(this.current, commands, actorKind)
    if (response.status === 'success' && commands.length > 0) {
      this.past.push(this.current)
      this.current = structuredClone(response.updatedProject)
      this.future = []
    }
    return { ...response, updatedProject: structuredClone(response.updatedProject) }
  }

  undo(): ProjectDocument {
    const previous = this.past.pop()
    if (previous) { this.future.push(this.current); this.current = previous }
    return this.project
  }

  redo(): ProjectDocument {
    const next = this.future.pop()
    if (next) { this.past.push(this.current); this.current = next }
    return this.project
  }
}
