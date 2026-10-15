# ConstructFlow Module SDK

The Module SDK defines the integration surface between ConstructFlow Core and domain modules.

## Runtime extension API

Trusted in-process extensions can register a manifest and contribute namespaced commands,
domain providers, project validators and owned object-type IDs. The host supplies the same
isolated `CommandHandlerContext` used by built-in domains; commands therefore participate in
project validation, atomic batches, emitted command envelopes, actor attribution and editor
undo/redo. Extensions must not mutate `context.project`; they should make changes only on the
draft in `context.updated` and return it as `updatedProject`.

```ts
import type { ConstructFlowModule } from "@constructflow/module-sdk";
import { CommandBus } from "@constructflow/command-runtime";

const module: ConstructFlowModule = {
  manifest: {
    id: "acme.annotations",
    version: "1.0.0",
    schema_version: 1,
    provides: ["annotation-provider"],
    object_types: ["acme.annotations.callout"],
  },
  activate({ apiVersion, moduleId }) {
    if (apiVersion !== "1") throw new Error("Unsupported ConstructFlow SDK API");
    return {
      commands: {
        "acme.annotations.set_project_note": context => {
          context.updated.project.description = String(context.input.description ?? "");
          return {
            result: {
              status: "success",
              command_id: context.command_id,
              command_name: context.commandName,
              affected_object_ids: [],
            },
            updatedProject: context.updated,
            emittedEnvelope: context.envelope,
          };
        },
      },
      commandDescriptors: [{
        name: "acme.annotations.set_project_note",
        version: 1,
        owner_module: moduleId,
        ai_allowed: true,
        confirmation: "none",
        input_schema: {
          type: "object",
          properties: { description: { type: "string" } },
          required: ["description"],
        },
        preconditions_summary: "An editable project is open",
      }],
      ui: [{
        id: "acme.annotations.project_actions",
        title: "Annotation tools",
        actions: [{
          id: "acme.annotations.set_note_action",
          label: "Set project note",
          command: "acme.annotations.set_project_note",
          description: "Update the permit note on this project.",
        }],
      }],
    };
  },
};

const unregister = CommandBus.registerModule(module);
const result = commandSession.execute([
  { name: "acme.annotations.set_project_note", input: { description: "Permit note" } },
]);
// Hosts expose only declared AI-eligible commands through CommandBus.getAICommandDescriptors().
// Call unregister() when the host unloads the extension.
```

The Plan Editor can load a self-contained ES module bundle with the `.cfe.mjs`
extension. It reads the file as text first, enforces a 2 MB limit and no runtime
imports, then shows the source and SHA-256 digest. The user must explicitly trust
and install each bundle before the host imports and registers it. Modules stay
active for the current browser session and can be unloaded from the Extensions
panel. See [`examples/sample-package.cfe.mjs`](./examples/sample-package.cfe.mjs)
for a bundle that can be imported directly.

The Plan Editor executes uploaded bundles in a dedicated Web Worker and returns
only serializable command contributions to the host. The worker has no DOM and
replaces browser networking, nested-worker and persistent-storage APIs with
throwing stubs. Initialization and each callback have a 10-second termination
deadline; package source is capped at 2 MB, RPC input at 32 MB and output at
64 MB. The editor requires COOP/COEP isolation and serves a restrictive CSP.
Sandboxed packages currently support command handlers and declarative UI only;
providers, validators and schema migrations are rejected because those host
contracts are synchronous. Browser Workers have no enforceable per-package memory
quota, and this is not an OS-process boundary or a security audit. The host also
does not provide signature verification, a remote package registry or persistent
auto-load. Users must explicitly trust each bundle. Direct SDK registration by
trusted host code remains in-process. Registration checks namespaces, capability
dependencies and object-type ownership. Declarative UI contributions reference a
module-owned command and its input descriptor. The Plan Editor renders supported
string, number, integer, boolean and enum fields, requires a second explicit
confirmation when the descriptor requests it, and dispatches through the shared
project command session so normal validation and Undo/Redo apply. The contribution
schema is framework-neutral; modules do not inject React components into the
host UI.

### Object schema migrations

Modules may contribute deterministic, one-version-at-a-time migrations for their
owned objects. The host runs `CommandBus.migrateProject(project)` after decoding a
project and before domain validation or opening it. The SDK clones the input data,
passes stable project/object identity and source/target versions to each migration,
updates only `module_data` and `schema_version`, then validates the migrated
project. UUIDs, ownership, level/host references and relationships are preserved.

```ts
migrations: [{
  from_version: 1,
  to_version: 2,
  migrate(data) {
    const { legacy_note, ...rest } = data;
    return { ...rest, note: legacy_note };
  },
}]
```

Migration functions should be pure and deterministic. The host rejects missing
steps, invalid output, or objects newer than the registered module schema; the
original project document is not modified on success or failure.

## Module responsibilities

A module owns its domain semantics, schema, commands, geometry generation, quantity formulas, drawing representations, validators, migrations and UI contributions.

A module must not mutate another module's internal data directly.

## Required package structure

```text
module-name/
├─ manifest.yml
├─ domain/
├─ objects/
├─ commands/
├─ geometry/
├─ rules/
├─ connectors/
├─ quantity/
├─ drawing/
├─ validators/
├─ migrations/
├─ ui/
└─ tests/
```

Not every module needs every directory on day one, but the ownership model stays consistent.

## Registration lifecycle

1. Core discovers module manifest.
2. Dependency/capability checks run.
3. Module schema migrations run if required.
4. Object types register.
5. Commands register.
6. Event subscriptions register.
7. Providers and validators register.
8. UI contributions register.
9. Module becomes active.

## Capability examples

Modules should prefer capability dependencies over concrete package dependencies where practical.

```text
capability:host.wall
capability:host.ceiling
capability:structural-support
capability:waste-network
capability:rainwater-network
capability:quantity-provider
capability:drawing-provider
```

## Module IDs

Use stable lowercase IDs:

```text
constructflow.architecture
constructflow.roof
constructflow.structure
constructflow.surface
constructflow.interior
constructflow.drainage
```

Never encode module version into the ID.

## Schema evolution

Every module declares a `schema_version`. Migrations must be deterministic and ordered.

Example:

```text
migrations/
001_initial
002_add_fascia_assembly
003_add_roof_edge_connectors
```

A project should be able to open with older module data and migrate forward without rebuilding geometry manually.

## Commands

Mutating operations are commands. Examples:

```text
constructflow.architecture.create_wall
constructflow.opening.create_opening
constructflow.roof.generate_roof
constructflow.structure.generate_foundation
constructflow.surface.add_border
constructflow.drainage.relocate_manhole
constructflow.interior.split_module
```

Commands should validate inputs before beginning geometry mutation and should execute within a transaction.

## Events

Modules publish immutable domain events only after a successful transaction.

A module should not assume subscribers exist.

## Provider pattern

Cross-cutting services consume providers.

Examples:

- Quantity service asks enabled modules for normalized quantity records.
- Drawing service asks enabled modules for view/annotation representations.
- QA service executes validators registered by modules.

This allows Roof, Interior or Drainage to work without BOQ or Drawing modules installed.

## Human and AI parity

Every production mutation reachable from AI must also be a registered domain command. AI receives no special write path.
