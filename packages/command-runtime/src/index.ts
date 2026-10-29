import { executeFamilyCommand, reconcileFamilyDimensions } from '@constructflow/family-engine'
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
import { ModuleRegistry, type ConstructFlowModule } from '@constructflow/module-sdk'
import { buildProjectHistoryDeltaInput, matchesProjectHistoryTarget } from './projectHistoryDelta.js'
export { buildProjectHistoryDeltaInput, matchesProjectHistoryTarget }

const handlers = [(context: CommandHandlerContext) => context.commandName === 'DuplicateObjects' ? executeDuplicateObjects(context) : null,
  executeFamilyCommand, executeProjectCommand, executeStructureCommand, executeArchitectureCommand, executeCatalogCommand,
  executeStructureConstructionCommand, executeBathroomCommand, executeRoofCommand, executeDecorativeCommand,
  executePlumbingCommand, executeDrainageCommand, executeElectricalCommand, executeInteriorCommand]
const phases = new Set(['existing', 'demolition', 'new_construction'])
const extensionModules = new ModuleRegistry()

/** Host-independent CQRS runtime. Domain handlers never receive the live document. */
export class CommandBus {
  /** Register a namespaced third-party module; its commands share validation and transaction behavior. */
  static registerModule(module: ConstructFlowModule): () => void {
    return extensionModules.register(module)
  }

  /** Apply registered extension schema migrations before validating/opening a saved project. */
  static migrateProject(project: ProjectDocument): ProjectDocument {
    const migrated = extensionModules.migrateProject(project)
    validateProjectV2(migrated)
    return migrated
  }

  static getRegisteredModules() {
    return extensionModules.list()
  }

  static subscribeToModules(listener: () => void) {
    return extensionModules.subscribe(listener)
  }

  static getModuleRegistryRevision() {
    return extensionModules.getRevision()
  }

  static getModuleProviders() {
    return extensionModules.providers()
  }

  static getModuleCommandDescriptors() {
    return extensionModules.commandDescriptors()
  }

  static getAICommandDescriptors() {
    return extensionModules.aiCommandDescriptors()
  }

  /** Declarative extension actions that the editor can render without loading plugin UI code. */
  static getModuleUIContributions() {
    return extensionModules.uiContributions()
  }

  static execute(
    project: ProjectDocument,
    commandName: string,
    input: Record<string, unknown>,
    actorKind: CommandActorKind = 'human',
    sourceEnvelope?: CommandEnvelope,
  ): CommandBusResult {
    const command_id = sourceEnvelope?.command_id ?? crypto.randomUUID()
    const now = sourceEnvelope?.timestamp ?? new Date().toISOString()
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
        command_id, name: commandName, version: sourceEnvelope?.version ?? 1, project_id: project.project.id,
        timestamp: now, actor: { ...(sourceEnvelope?.actor ?? {}), kind: actorKind }, input: payload,
        ...(sourceEnvelope?.transaction_id ? { transaction_id: sourceEnvelope.transaction_id } : {}),
      }
      const context: CommandHandlerContext = {
        project, updated, commandName, input: payload, command_id, now, envelope,
      }
      for (const handle of [...handlers, (ctx: CommandHandlerContext) => extensionModules.execute(ctx)]) {
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
        reconcileFamilyDimensions(project, response.updatedProject)
        validateProjectV2(response.updatedProject)
        validateConstructionProject(response.updatedProject)
        const moduleErrors = extensionModules.validate(response.updatedProject)
          .filter(issue => issue.severity === 'error')
        if (moduleErrors.length) return reject(moduleErrors.map(issue => `${issue.code}: ${issue.message}`).join('\n'))
        const committed = response.emittedEnvelope ?? envelope
        return {
          ...response,
          committedEnvelope: {
            ...committed,
            actor: sourceEnvelope?.actor ?? committed.actor,
            input: structuredClone(committed.input),
            ...(sourceEnvelope?.transaction_id ? { transaction_id: sourceEnvelope.transaction_id } : {}),
          },
        }
      }
      return reject(`Unknown command: ${commandName}`)
    } catch (error: unknown) {
      return reject(error instanceof Error ? error.message : String(error), 'failed')
    }
  }

  /** Execute a sandboxed module command through the same project and module validation contracts. */
  static async executeAsync(
    project: ProjectDocument,
    commandName: string,
    input: Record<string, unknown>,
    actorKind: CommandActorKind = 'human',
    sourceEnvelope?: CommandEnvelope,
  ): Promise<CommandBusResult> {
    if (!extensionModules.hasCommand(commandName)) return this.execute(project, commandName, input, actorKind, sourceEnvelope)
    const command_id = sourceEnvelope?.command_id ?? crypto.randomUUID()
    const now = sourceEnvelope?.timestamp ?? new Date().toISOString()
    const reject = (message: string, status: 'rejected' | 'failed' = 'rejected'): CommandBusResult => ({
      result: { status, command_id, command_name: commandName, affected_object_ids: [], errors: [message] },
      updatedProject: project,
    })
    try {
      for (const key of ['phase', 'created_phase']) {
        const value = input[key]
        if (value !== undefined && (typeof value !== 'string' || !phases.has(value))) return reject(`Invalid ${key}: ${String(value)}`)
      }
      const removedPhase = input.removed_phase
      if (removedPhase !== undefined && removedPhase !== null && removedPhase !== 'demolition') return reject(`Invalid removed_phase: ${String(removedPhase)}`)
      if (commandName.startsWith('Create') && typeof input.id === 'string' && input.id && project.objects[input.id]) return reject(`Object UUID ${input.id} already exists`)
      const payload = structuredClone(input)
      const envelope: CommandEnvelope = {
        command_id, name: commandName, version: sourceEnvelope?.version ?? 1, project_id: project.project.id,
        timestamp: now, actor: { ...(sourceEnvelope?.actor ?? {}), kind: actorKind }, input: payload,
        ...(sourceEnvelope?.transaction_id ? { transaction_id: sourceEnvelope.transaction_id } : {}),
      }
      const context: CommandHandlerContext = { project, updated: structuredClone(project), commandName, input: payload, command_id, now, envelope }
      const response = await extensionModules.executeAsync(context)
      if (!response) return reject(`Unknown command: ${commandName}`)
      if (response.result.status !== 'success') return { ...response, updatedProject: project }
      response.updatedProject.project.updated_at = now
      reconcileFamilyDimensions(project, response.updatedProject)
      validateProjectV2(response.updatedProject)
      validateConstructionProject(response.updatedProject)
      const moduleErrors = extensionModules.validate(response.updatedProject).filter(issue => issue.severity === 'error')
      if (moduleErrors.length) return reject(moduleErrors.map(issue => `${issue.code}: ${issue.message}`).join('\n'))
      const committed = response.emittedEnvelope ?? envelope
      response.committedEnvelope = {
        ...committed,
        actor: sourceEnvelope?.actor ?? committed.actor,
        input: structuredClone(committed.input),
        ...(sourceEnvelope?.transaction_id ? { transaction_id: sourceEnvelope.transaction_id } : {}),
      }
      return response
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
    const committedEnvelopes: CommandEnvelope[] = []
    let current = project
    for (const [index, command] of commands.entries()) {
      const response = this.execute(current, command.name, command.input, actorKind)
      results.push(response.result)
      if (response.result.status !== 'success') {
        return {
          transaction_id, status: response.result.status, updatedProject: project,
          results, emittedEnvelopes: [], committedEnvelopes: [], failed_command_index: index, errors: response.result.errors,
        }
      }
      current = response.updatedProject
      if (response.emittedEnvelope) emittedEnvelopes.push({ ...response.emittedEnvelope, transaction_id })
      if (response.committedEnvelope) committedEnvelopes.push({ ...response.committedEnvelope, transaction_id })
    }
    return { transaction_id, status: 'success', updatedProject: current, results, emittedEnvelopes, committedEnvelopes }
  }

  /** Replay a server-ordered command transaction through the same validators and domain handlers. */
  static executeEnvelopeBatch(project: ProjectDocument, envelopes: readonly CommandEnvelope[], actorKind: CommandActorKind = 'sync'): CommandBatchResult {
    const transaction_id = envelopes[0]?.transaction_id ?? crypto.randomUUID()
    if (!envelopes.length || envelopes.length > 500 || envelopes.some(envelope => envelope.project_id !== project.project.id
      || envelope.transaction_id && envelope.transaction_id !== transaction_id)) {
      return { transaction_id, status: 'rejected', updatedProject: project, results: [], emittedEnvelopes: [], committedEnvelopes: [], errors: ['Remote command transaction has invalid project or transaction identity'] }
    }
    const results: CommandBatchResult['results'] = []
    const emittedEnvelopes: CommandEnvelope[] = []
    const committedEnvelopes: CommandEnvelope[] = []
    let current = project
    for (const [index, envelope] of envelopes.entries()) {
      const response = this.execute(current, envelope.name, envelope.input, actorKind, envelope)
      results.push(response.result)
      if (response.result.status !== 'success') return {
        transaction_id, status: response.result.status, updatedProject: project, results,
        emittedEnvelopes: [], committedEnvelopes: [], failed_command_index: index, errors: response.result.errors,
      }
      current = response.updatedProject
      if (response.emittedEnvelope) emittedEnvelopes.push({ ...response.emittedEnvelope, transaction_id })
      if (response.committedEnvelope) committedEnvelopes.push({ ...response.committedEnvelope, transaction_id })
    }
    return { transaction_id, status: 'success', updatedProject: current, results, emittedEnvelopes, committedEnvelopes }
  }

  /** Asynchronous counterpart for remote batches that include sandboxed extension commands. */
  static async executeEnvelopeBatchAsync(project: ProjectDocument, envelopes: readonly CommandEnvelope[], actorKind: CommandActorKind = 'sync'): Promise<CommandBatchResult> {
    const transaction_id = envelopes[0]?.transaction_id ?? crypto.randomUUID()
    if (!envelopes.length || envelopes.length > 500 || envelopes.some(envelope => envelope.project_id !== project.project.id
      || envelope.transaction_id && envelope.transaction_id !== transaction_id)) {
      return { transaction_id, status: 'rejected', updatedProject: project, results: [], emittedEnvelopes: [], committedEnvelopes: [], errors: ['Remote command transaction has invalid project or transaction identity'] }
    }
    const results: CommandBatchResult['results'] = []
    const emittedEnvelopes: CommandEnvelope[] = []
    const committedEnvelopes: CommandEnvelope[] = []
    let current = project
    for (const [index, envelope] of envelopes.entries()) {
      const response = await this.executeAsync(current, envelope.name, envelope.input, actorKind, envelope)
      results.push(response.result)
      if (response.result.status !== 'success') return {
        transaction_id, status: response.result.status, updatedProject: project, results,
        emittedEnvelopes: [], committedEnvelopes: [], failed_command_index: index, errors: response.result.errors,
      }
      current = response.updatedProject
      if (response.emittedEnvelope) emittedEnvelopes.push({ ...response.emittedEnvelope, transaction_id })
      if (response.committedEnvelope) committedEnvelopes.push({ ...response.committedEnvelope, transaction_id })
    }
    return { transaction_id, status: 'success', updatedProject: current, results, emittedEnvelopes, committedEnvelopes }
  }

  static async executeBatchAsync(
    project: ProjectDocument,
    commands: readonly CommandRequest[],
    actorKind: CommandActorKind = 'human',
  ): Promise<CommandBatchResult> {
    const transaction_id = crypto.randomUUID()
    const results: CommandBatchResult['results'] = []
    const emittedEnvelopes: CommandEnvelope[] = []
    const committedEnvelopes: CommandEnvelope[] = []
    let current = project
    for (const [index, command] of commands.entries()) {
      const response = await this.executeAsync(current, command.name, command.input, actorKind)
      results.push(response.result)
      if (response.result.status !== 'success') return {
        transaction_id, status: response.result.status, updatedProject: project,
        results, emittedEnvelopes: [], committedEnvelopes: [], failed_command_index: index, errors: response.result.errors,
      }
      current = response.updatedProject
      if (response.emittedEnvelope) emittedEnvelopes.push({ ...response.emittedEnvelope, transaction_id })
      if (response.committedEnvelope) committedEnvelopes.push({ ...response.committedEnvelope, transaction_id })
    }
    return { transaction_id, status: 'success', updatedProject: current, results, emittedEnvelopes, committedEnvelopes }
  }
}

/** One history entry per committed batch; redo restores the same IDs, not new creations. */
export interface ProjectCommandHistorySnapshot {
  past: ProjectDocument[]
  future: ProjectDocument[]
}

export interface ProjectHistoryTravelResult {
  project: ProjectDocument
  /** Present when the travel could be represented as a validated, replayable CommandBus delta. */
  commandResult?: CommandBatchResult
}

export class ProjectCommandSession {
  private current: ProjectDocument
  private past: ProjectDocument[] = []
  private future: ProjectDocument[] = []
  private revision = 0
  private asyncTail: Promise<void> = Promise.resolve()

  constructor(project: ProjectDocument, history?: ProjectCommandHistorySnapshot) {
    this.current = structuredClone(project)
    this.past = structuredClone(history?.past ?? [])
    this.future = structuredClone(history?.future ?? [])
    for (const snapshot of [...this.past, ...this.future]) {
      if (snapshot.project.id !== project.project.id) throw new Error('History snapshot belongs to a different project')
    }
  }
  get project(): ProjectDocument { return structuredClone(this.current) }
  get snapshotRevision(): number { return this.revision }
  get canUndo(): boolean { return this.past.length > 0 }
  get canRedo(): boolean { return this.future.length > 0 }
  get historySnapshot(): ProjectCommandHistorySnapshot {
    return { past: structuredClone(this.past), future: structuredClone(this.future) }
  }

  /** Commit an already-executed model update as one editor history entry. */
  commit(project: ProjectDocument): void {
    this.past.push(this.current)
    this.current = structuredClone(project)
    this.future = []
    this.revision += 1
  }

  /** Replace the history baseline after opening/creating a document. */
  reset(project: ProjectDocument): void {
    this.current = structuredClone(project)
    this.past = []
    this.future = []
    this.revision += 1
  }

  execute(commands: readonly CommandRequest[], actorKind: CommandActorKind = 'human'): CommandBatchResult {
    const response = CommandBus.executeBatch(this.current, commands, actorKind)
    if (response.status === 'success' && commands.length > 0) {
      this.past.push(this.current)
      this.current = structuredClone(response.updatedProject)
      this.future = []
      this.revision += 1
    }
    return { ...response, updatedProject: structuredClone(response.updatedProject) }
  }

  /** Apply a server ordered transaction as one undo entry, using the same command validators. */
  executeEnvelopes(envelopes: readonly CommandEnvelope[], actorKind: CommandActorKind = 'sync'): CommandBatchResult {
    const response = CommandBus.executeEnvelopeBatch(this.current, envelopes, actorKind)
    if (response.status === 'success' && envelopes.length > 0) {
      this.past.push(this.current)
      this.current = structuredClone(response.updatedProject)
      this.future = []
      this.revision += 1
    }
    return { ...response, updatedProject: structuredClone(response.updatedProject) }
  }

  executeEnvelopesAsync(envelopes: readonly CommandEnvelope[], actorKind: CommandActorKind = 'sync', expectedRevision?: number): Promise<CommandBatchResult> {
    const run = this.asyncTail.then(async () => {
      if (expectedRevision !== undefined && this.revision !== expectedRevision) return {
        transaction_id: envelopes[0]?.transaction_id ?? crypto.randomUUID(),
        status: 'rejected' as const,
        updatedProject: structuredClone(this.current),
        results: [], emittedEnvelopes: [], committedEnvelopes: [],
        errors: ['Project changed after remote command preview; retry sync against the new local state.'],
      }
      const revisionAtStart = this.revision
      const baseline = structuredClone(this.current)
      const response = await CommandBus.executeEnvelopeBatchAsync(baseline, envelopes, actorKind)
      if (this.revision !== revisionAtStart) return {
        ...response,
        status: 'rejected' as const,
        updatedProject: structuredClone(this.current),
        emittedEnvelopes: [],
        committedEnvelopes: [],
        errors: ['Project changed while the remote command transaction was being validated; retry sync.'],
      }
      if (response.status === 'success' && envelopes.length > 0) {
        this.past.push(this.current)
        this.current = structuredClone(response.updatedProject)
        this.future = []
        this.revision += 1
      }
      return { ...response, updatedProject: structuredClone(response.updatedProject) }
    })
    this.asyncTail = run.then(() => undefined, () => undefined)
    return run
  }

  executeAsync(commands: readonly CommandRequest[], actorKind: CommandActorKind = 'human'): Promise<CommandBatchResult> {
    const run = this.asyncTail.then(async () => {
      const revisionAtStart = this.revision
      const baseline = structuredClone(this.current)
      const response = await CommandBus.executeBatchAsync(baseline, commands, actorKind)
      if (this.revision !== revisionAtStart) return {
        ...response,
        status: 'rejected' as const,
        updatedProject: structuredClone(this.current),
        emittedEnvelopes: [],
        committedEnvelopes: [],
        errors: ['Project changed while the extension command was running; review and retry it.'],
      }
      if (response.status === 'success' && commands.length > 0) {
        this.past.push(this.current)
        this.current = structuredClone(response.updatedProject)
        this.future = []
        this.revision += 1
      }
      return { ...response, updatedProject: structuredClone(response.updatedProject) }
    })
    this.asyncTail = run.then(() => undefined, () => undefined)
    return run
  }

  undo(): ProjectDocument {
    const previous = this.past.pop()
    if (previous) { this.future.push(this.current); this.current = previous; this.revision += 1 }
    return this.project
  }

  undoWithHistoryDelta(): ProjectHistoryTravelResult | null {
    const previous = this.past.pop()
    if (!previous) return null
    const from = this.current
    this.future.push(this.current)
    return this.travelWithHistoryDelta(from, previous)
  }

  redo(): ProjectDocument {
    const next = this.future.pop()
    if (next) { this.past.push(this.current); this.current = next; this.revision += 1 }
    return this.project
  }

  redoWithHistoryDelta(): ProjectHistoryTravelResult | null {
    const next = this.future.pop()
    if (!next) return null
    const from = this.current
    this.past.push(this.current)
    return this.travelWithHistoryDelta(from, next)
  }

  private travelWithHistoryDelta(from: ProjectDocument, target: ProjectDocument): ProjectHistoryTravelResult {
    try {
      const input = buildProjectHistoryDeltaInput(from, target)
      const commandResult = CommandBus.executeBatch(from, [{ name: 'ApplyProjectHistoryDelta', input: input as unknown as Record<string, unknown> }], 'human')
      if (commandResult.status === 'success' && matchesProjectHistoryTarget(commandResult.updatedProject, target)) {
        this.current = structuredClone(commandResult.updatedProject)
        this.revision += 1
        return { project: this.project, commandResult }
      }
    } catch {
      // Large or unsupported history changes still travel locally; the editor keeps live sync paused.
    }
    this.current = structuredClone(target)
    this.revision += 1
    return { project: this.project }
  }
}
