import type { ProjectDocument } from "@constructflow/project-model";
import type {
  CommandBusResult,
  CommandHandlerContext,
} from "@constructflow/command-schema";
import type { DomainProvider } from "./index.js";

export interface ModuleManifest {
  /** Stable reverse-DNS-style module ID, for example `vendor.tools`. */
  id: string;
  version: string;
  schema_version: number;
  provides?: readonly string[];
  requires?: readonly string[];
  object_types?: readonly string[];
}

export interface ModuleValidationIssue {
  code: string;
  message: string;
  severity: "error" | "warning";
  object_id?: string;
}

export type ModuleCommandHandler = (
  context: CommandHandlerContext,
) => CommandBusResult | undefined;
export type ModuleValidator = (
  project: ProjectDocument,
) => readonly ModuleValidationIssue[];

export interface ModuleMigrationContext {
  project_id: string;
  object_id: string;
  object_type: string;
  from_schema_version: number;
  to_schema_version: number;
}

/** Deterministic, object-local schema migration. The host preserves object identity and relationships. */
export interface ModuleSchemaMigration {
  from_version: number;
  to_version: number;
  migrate: (
    data: Readonly<Record<string, unknown>>,
    context: Readonly<ModuleMigrationContext>,
  ) => Record<string, unknown>;
}

export interface ModuleCommandDescriptor {
  name: string;
  version: number;
  owner_module: string;
  ai_allowed: boolean;
  confirmation: "none" | "required";
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
  preconditions_summary?: string;
}

/** Declarative action surfaced by the host; execution still goes through its command session. */
export interface ModuleUIActionContribution {
  id: string;
  label: string;
  command: string;
  description?: string;
}

/** Host-renderable command group that does not depend on React or another UI framework. */
export interface ModuleUIContribution {
  id: string;
  title: string;
  description?: string;
  actions: readonly ModuleUIActionContribution[];
}

export interface ModuleContribution {
  /** Keys must be namespaced below `${manifest.id}.`. */
  commands: Readonly<Record<string, ModuleCommandHandler>>;
  commandDescriptors?: readonly ModuleCommandDescriptor[];
  providers?: Readonly<Record<string, DomainProvider>>;
  validators?: Readonly<Record<string, ModuleValidator>>;
  migrations?: readonly ModuleSchemaMigration[];
  ui?: readonly ModuleUIContribution[];
}

export interface ModuleHostApi {
  readonly apiVersion: "1";
  readonly moduleId: string;
}

export interface ConstructFlowModule {
  readonly manifest: ModuleManifest;
  activate(api: ModuleHostApi): ModuleContribution;
  deactivate?(): void;
}

interface RegisteredModule {
  module: ConstructFlowModule;
  contribution: ModuleContribution;
}

type JsonSchema = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validateSchemaValue(value: unknown, schema: JsonSchema, path: string): string[] {
  const errors: string[] = [];
  const type = schema.type;
  const enumValues = schema.enum;
  if (enumValues !== undefined) {
    if (!Array.isArray(enumValues) || !enumValues.some(candidate => Object.is(candidate, value)))
      return [`${path} must match one of the declared enum values`];
  }

  if (type === "string") {
    if (typeof value !== "string") return [`${path} must be a string`];
    if (typeof schema.minLength === "number" && value.length < schema.minLength) errors.push(`${path} is shorter than minLength`);
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) errors.push(`${path} is longer than maxLength`);
  } else if (type === "number" || type === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value)) return [`${path} must be a finite number`];
    if (type === "integer" && !Number.isInteger(value)) errors.push(`${path} must be an integer`);
    if (typeof schema.minimum === "number" && value < schema.minimum) errors.push(`${path} must be at least ${schema.minimum}`);
    if (typeof schema.maximum === "number" && value > schema.maximum) errors.push(`${path} must be at most ${schema.maximum}`);
    if (typeof schema.exclusiveMinimum === "number" && value <= schema.exclusiveMinimum) errors.push(`${path} must be greater than ${schema.exclusiveMinimum}`);
    if (typeof schema.exclusiveMaximum === "number" && value >= schema.exclusiveMaximum) errors.push(`${path} must be less than ${schema.exclusiveMaximum}`);
  } else if (type === "boolean") {
    if (typeof value !== "boolean") return [`${path} must be a boolean`];
  } else if (type === "array") {
    if (!Array.isArray(value)) return [`${path} must be an array`];
    if (typeof schema.minItems === "number" && value.length < schema.minItems) errors.push(`${path} has too few items`);
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) errors.push(`${path} has too many items`);
    if (isRecord(schema.items)) value.forEach((entry, index) => errors.push(...validateSchemaValue(entry, schema.items as JsonSchema, `${path}[${index}]`)));
  } else if (type === "object") {
    if (!isRecord(value)) return [`${path} must be an object`];
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required) ? schema.required.filter((name): name is string => typeof name === "string") : [];
    for (const name of required) if (!Object.prototype.hasOwnProperty.call(value, name)) errors.push(`${path}.${name} is required`);
    for (const [name, entry] of Object.entries(value)) {
      const propertySchema = properties[name];
      if (propertySchema === undefined) {
        if (schema.additionalProperties === false) errors.push(`${path}.${name} is not allowed`);
      } else if (isRecord(propertySchema)) {
        errors.push(...validateSchemaValue(entry, propertySchema, `${path}.${name}`));
      }
    }
  } else if (type === "null") {
    if (value !== null) return [`${path} must be null`];
  } else if (type !== undefined) {
    return [`${path} uses unsupported schema type ${String(type)}`];
  } else if (enumValues === undefined) {
    return [`${path} has no supported schema type`];
  }
  return errors;
}

function validateCommandInput(descriptor: ModuleCommandDescriptor, input: Record<string, unknown>): string[] {
  const schema = descriptor.input_schema as unknown as JsonSchema;
  return validateSchemaValue(input, schema, "input");
}

/** Runtime registry shared by hosts that load trusted ConstructFlow modules. */
export class ModuleRegistry {
  private readonly modules = new Map<string, RegisteredModule>();
  private revision = 0;
  private readonly listeners = new Set<() => void>();
  private readonly hostCapabilities: ReadonlySet<string>;

  constructor(hostCapabilities: readonly string[] = ["constructflow.core"]) {
    this.hostCapabilities = new Set(hostCapabilities);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getRevision(): number {
    return this.revision;
  }

  private publishChange() {
    this.revision += 1;
    for (const listener of this.listeners) listener();
  }

  register(module: ConstructFlowModule): () => void {
    const manifest = module.manifest;
    if (!manifest || !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/.test(manifest.id))
      throw new Error("Module id must be a stable namespaced identifier");
    if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.version))
      throw new Error(`Invalid module version for ${manifest.id}`);
    if (!Number.isInteger(manifest.schema_version) || manifest.schema_version < 1)
      throw new Error(`Invalid schema_version for ${manifest.id}`);
    if (this.modules.has(manifest.id))
      throw new Error(`Module ${manifest.id} is already registered`);

    const capabilities = new Set(
      [
        ...this.hostCapabilities,
        ...[...this.modules.values()].flatMap(({ module: active }) => active.manifest.provides ?? []),
      ],
    );
    for (const required of manifest.requires ?? [])
      if (!capabilities.has(required))
        throw new Error(`Module ${manifest.id} requires unavailable capability ${required}`);
    const ownedObjectTypes = new Set(
      [...this.modules.values()].flatMap(({ module: active }) => active.manifest.object_types ?? []),
    );
    for (const objectType of manifest.object_types ?? []) {
      if (!objectType.startsWith(`${manifest.id}.`))
        throw new Error(`Object type ${objectType} must be namespaced under ${manifest.id}.`);
      if (ownedObjectTypes.has(objectType))
        throw new Error(`Object type ${objectType} is already registered`);
    }

    const api: ModuleHostApi = Object.freeze({ apiVersion: "1", moduleId: manifest.id });
    let contribution: ModuleContribution;
    try {
      contribution = module.activate(api);
      if (!contribution || typeof contribution !== "object" || !contribution.commands)
        throw new Error(`Module ${manifest.id} must contribute a commands registry`);
      for (const [name, handler] of Object.entries(contribution.commands)) {
        if (!name.startsWith(`${manifest.id}.`) || name.length === manifest.id.length + 1)
          throw new Error(`Command ${name} must be namespaced under ${manifest.id}.`);
        if (typeof handler !== "function")
          throw new Error(`Command ${name} must have a handler`);
        if (this.findCommand(name)) throw new Error(`Command ${name} is already registered`);
      }
      for (const [name, provider] of Object.entries(contribution.providers ?? {}))
        if (!name.startsWith(`${manifest.id}.`) || typeof provider !== "function")
          throw new Error(`Provider ${name} must be namespaced under ${manifest.id}.`);
      for (const [name, validator] of Object.entries(contribution.validators ?? {}))
        if (!name.startsWith(`${manifest.id}.`) || typeof validator !== "function")
          throw new Error(`Validator ${name} must be namespaced under ${manifest.id}.`);
      const migrationSources = new Set<number>();
      for (const migration of contribution.migrations ?? []) {
        if (!Number.isInteger(migration.from_version) || migration.from_version < 1
          || migration.to_version !== migration.from_version + 1
          || migration.to_version > manifest.schema_version
          || typeof migration.migrate !== "function")
          throw new Error(`Module ${manifest.id} has an invalid schema migration`);
        if (migrationSources.has(migration.from_version))
          throw new Error(`Module ${manifest.id} has duplicate migration from schema ${migration.from_version}`);
        migrationSources.add(migration.from_version);
      }
      const descriptorNames = new Set<string>();
      for (const descriptor of contribution.commandDescriptors ?? []) {
        if (!descriptor.name.startsWith(`${manifest.id}.`) || !contribution.commands[descriptor.name])
          throw new Error(`Command descriptor ${descriptor.name} must reference a command owned by ${manifest.id}.`);
        if (descriptorNames.has(descriptor.name))
          throw new Error(`Duplicate command descriptor ${descriptor.name}`);
        descriptorNames.add(descriptor.name);
        if (!Number.isInteger(descriptor.version) || descriptor.version < 1)
          throw new Error(`Command descriptor ${descriptor.name} has an invalid version`);
        if (descriptor.owner_module !== manifest.id)
          throw new Error(`Command descriptor ${descriptor.name} has the wrong owner_module`);
        if (typeof descriptor.ai_allowed !== "boolean" || !["none", "required"].includes(descriptor.confirmation))
          throw new Error(`Command descriptor ${descriptor.name} has invalid AI/confirmation policy`);
        if (!descriptor.input_schema || descriptor.input_schema.type !== "object" || !descriptor.input_schema.properties || typeof descriptor.input_schema.properties !== "object")
          throw new Error(`Command descriptor ${descriptor.name} requires an object input schema`);
      }
      const uiIds = new Set<string>()
      for (const ui of contribution.ui ?? []) {
        if (!ui.id.startsWith(`${manifest.id}.`) || ui.id.length === manifest.id.length + 1)
          throw new Error(`UI contribution ${ui.id} must be namespaced under ${manifest.id}.`)
        if (uiIds.has(ui.id)) throw new Error(`Duplicate UI contribution ${ui.id}`)
        uiIds.add(ui.id)
        if (typeof ui.title !== 'string' || !ui.title.trim() || !Array.isArray(ui.actions))
          throw new Error(`UI contribution ${ui.id} requires a title and action list`)
        const actionIds = new Set<string>()
        for (const action of ui.actions) {
          if (!action.id.startsWith(`${manifest.id}.`) || action.id.length === manifest.id.length + 1)
            throw new Error(`UI action ${action.id} must be namespaced under ${manifest.id}.`)
          if (actionIds.has(action.id)) throw new Error(`Duplicate UI action ${action.id}`)
          actionIds.add(action.id)
          if (typeof action.label !== 'string' || !action.label.trim())
            throw new Error(`UI action ${action.id} requires a label`)
          if (!contribution.commands[action.command] || !descriptorNames.has(action.command))
            throw new Error(`UI action ${action.id} must reference a command with a descriptor owned by ${manifest.id}.`)
        }
      }
    } catch (error) {
      module.deactivate?.();
      throw error;
    }

    this.modules.set(manifest.id, { module, contribution });
    this.publishChange();
    let active = true;
    return () => {
      if (!active) return;
      this.unregister(manifest.id);
      active = false;
    };
  }

  unregister(moduleId: string): boolean {
    const entry = this.modules.get(moduleId);
    if (!entry) return false;
    const capabilities = new Set(entry.module.manifest.provides ?? []);
    for (const [dependentId, dependent] of this.modules) {
      if (dependentId === moduleId) continue;
      for (const required of dependent.module.manifest.requires ?? []) {
        const hasAlternative = [...this.modules.entries()].some(([providerId, provider]) =>
          providerId !== moduleId && (provider.module.manifest.provides ?? []).includes(required),
        );
        if (capabilities.has(required) && !hasAlternative)
          throw new Error(`Cannot unregister ${moduleId}; ${dependentId} requires ${required}`);
      }
    }
    entry.module.deactivate?.();
    const removed = this.modules.delete(moduleId);
    if (removed) this.publishChange();
    return removed;
  }

  execute(context: CommandHandlerContext): CommandBusResult | undefined {
    for (const { contribution } of this.modules.values()) {
      const handler = contribution.commands[context.commandName];
      if (!handler) continue;
      const descriptor = contribution.commandDescriptors?.find(candidate => candidate.name === context.commandName);
      if (context.envelope.actor.kind === "ai" && (!descriptor || !descriptor.ai_allowed)) return {
        result: {
          status: "rejected",
          command_id: context.command_id,
          command_name: context.commandName,
          affected_object_ids: [],
          errors: [`AI is not authorized to execute extension command ${context.commandName}`],
        },
        updatedProject: context.project,
      };
      if (descriptor) {
        const errors = validateCommandInput(descriptor, context.input);
        if (errors.length) return {
          result: {
            status: "rejected",
            command_id: context.command_id,
            command_name: context.commandName,
            affected_object_ids: [],
            errors,
          },
          updatedProject: context.project,
        };
      }
      const response = handler({
        ...context,
        project: structuredClone(context.project),
        input: structuredClone(context.input),
      });
      if (!response) return undefined;
      if (response.result.command_id !== context.command_id || response.result.command_name !== context.commandName)
        throw new Error(`Module command ${context.commandName} returned a mismatched result identity`);
      if (response.result.status === "success") {
        const emitted = response.emittedEnvelope;
        if (response.updatedProject.project.id !== context.project.project.id)
          throw new Error(`Module command ${context.commandName} changed the project identity`);
        if (!emitted || emitted.command_id !== context.command_id || emitted.name !== context.commandName || emitted.actor.kind !== context.envelope.actor.kind)
          throw new Error(`Module command ${context.commandName} must emit its attributed command envelope`);
      }
      return response;
    }
    return undefined;
  }

  validate(project: ProjectDocument): ModuleValidationIssue[] {
    return [...this.modules.values()].flatMap(({ contribution }) =>
      Object.values(contribution.validators ?? {}).flatMap((validator) => validator(project)),
    );
  }

  /** Upgrade extension-owned object data before the host validates and opens a project. */
  migrateProject(project: ProjectDocument): ProjectDocument {
    let migrated: ProjectDocument | undefined;
    for (const [moduleId, { module, contribution }] of this.modules) {
      const targetVersion = module.manifest.schema_version;
      const migrations = new Map((contribution.migrations ?? []).map(migration => [migration.from_version, migration]));
      const sourceObjects = migrated?.objects ?? project.objects;
      for (const object of Object.values(sourceObjects)) {
        if (object.owner_module !== moduleId) continue;
        if (!Number.isInteger(object.schema_version) || object.schema_version < 1)
          throw new Error(`Object ${object.id} has an invalid schema version for ${moduleId}`);
        if (object.schema_version > targetVersion)
          throw new Error(`Object ${object.id} uses newer ${moduleId} schema ${object.schema_version}; host supports ${targetVersion}`);
        if (object.schema_version === targetVersion) continue;

        let version = object.schema_version;
        let data = structuredClone(object.module_data) as Record<string, unknown>;
        while (version < targetVersion) {
          const migration = migrations.get(version);
          if (!migration)
            throw new Error(`Module ${moduleId} is missing migration ${version} → ${version + 1} for object ${object.id}`);
          const next = migration.migrate(structuredClone(data), Object.freeze({
            project_id: project.project.id,
            object_id: object.id,
            object_type: object.object_type,
            from_schema_version: version,
            to_schema_version: migration.to_version,
          }));
          if (!next || typeof next !== "object" || Array.isArray(next))
            throw new Error(`Module ${moduleId} migration ${version} → ${migration.to_version} returned invalid object data`);
          data = structuredClone(next);
          version = migration.to_version;
        }

        migrated ??= structuredClone(project);
        migrated.objects[object.id] = { ...object, schema_version: version, module_data: data };
      }
    }
    return migrated ?? project;
  }

  providers(): ReadonlyArray<{ id: string; provide: DomainProvider }> {
    return [...this.modules.entries()].flatMap(([id, { contribution }]) =>
      Object.entries(contribution.providers ?? {}).map(([providerId, provide]) => ({
        id: providerId || id,
        provide,
      })),
    );
  }

  commandDescriptors(): ReadonlyArray<ModuleCommandDescriptor> {
    return [...this.modules.values()].flatMap(({ contribution }) =>
      structuredClone([...(contribution.commandDescriptors ?? [])]),
    );
  }

  aiCommandDescriptors(): ReadonlyArray<ModuleCommandDescriptor> {
    return this.commandDescriptors().filter((descriptor) => descriptor.ai_allowed);
  }

  uiContributions(): ReadonlyArray<ModuleUIContribution> {
    return structuredClone([...this.modules.values()].flatMap(({ contribution }) => [...(contribution.ui ?? [])]));
  }

  list(): ReadonlyArray<ModuleManifest> {
    return [...this.modules.values()].map(({ module }) => structuredClone(module.manifest));
  }

  private findCommand(name: string): ModuleCommandHandler | undefined {
    for (const { contribution } of this.modules.values()) {
      const handler = contribution.commands[name];
      if (handler) return handler;
    }
    return undefined;
  }
}
