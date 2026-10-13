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

export interface ModuleContribution {
  /** Keys must be namespaced below `${manifest.id}.`. */
  commands: Readonly<Record<string, ModuleCommandHandler>>;
  commandDescriptors?: readonly ModuleCommandDescriptor[];
  providers?: Readonly<Record<string, DomainProvider>>;
  validators?: Readonly<Record<string, ModuleValidator>>;
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

/** Runtime registry shared by hosts that load trusted ConstructFlow modules. */
export class ModuleRegistry {
  private readonly modules = new Map<string, RegisteredModule>();

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
      [...this.modules.values()].flatMap(({ module: active }) => active.manifest.provides ?? []),
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
    } catch (error) {
      module.deactivate?.();
      throw error;
    }

    this.modules.set(manifest.id, { module, contribution });
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
    return this.modules.delete(moduleId);
  }

  execute(context: CommandHandlerContext): CommandBusResult | undefined {
    for (const { contribution } of this.modules.values()) {
      const handler = contribution.commands[context.commandName];
      if (!handler) continue;
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
