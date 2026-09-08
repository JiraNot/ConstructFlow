# Module SDK Contract

Status: Accepted foundation contract.

## Purpose

The Module SDK is the only supported way for domain/platform modules to register capabilities with ConstructFlow Core. It prevents modules from reaching into runtime internals or hard-coding sibling dependencies.

## Module manifest

Every module declares:

```yaml
id: constructflow.roof
name: Roof & Envelope
version: 0.1.0
schema_version: 1
requires:
  - constructflow.core
optional_capabilities:
  - structure.member_factory
  - drainage.rainwater_network
provides:
  - roof.host
  - roof.edge_host
  - roof.quantity_provider
objects: []
commands: []
events: []
providers: []
validators: []
```

Manifest is validated before registration.

## Registration lifecycle

Recommended lifecycle:

1. `discover`
2. `validate_manifest`
3. `check_dependencies`
4. `register_objects`
5. `register_commands`
6. `register_events`
7. `register_capabilities/providers`
8. `register_validators`
9. `register_migrations`
10. `register_ui`
11. `activate`

Failure before activation must roll back partial registration.

## Capability registry

Modules publish named, versioned public capabilities rather than concrete private classes.

Examples:

- `wall.host_surface@1`
- `structure.member_factory@1`
- `drainage.rainwater_network@1`
- `surface.paving_layout@1`
- `drawing.provider@1`

Capability descriptor declares input/output contract and owner module.

## Object registration

A module registers each owned object type with:

- canonical type ID;
- schema version;
- serializer/migration handler;
- display metadata;
- property provider;
- optional geometry adapter;
- optional catalog family compatibility.

Core must not know every type in advance.

## Command registration

Each command registration includes:

- name/version;
- owner module;
- input schema;
- executor;
- validator;
- transaction policy;
- AI exposure/confirmation metadata;
- events produced.

Duplicate name+version registration is rejected unless an explicit override/dev policy exists.

## Event registration

Modules can declare emitted/consumed event contracts. Event names are namespaced or globally canonical under the Event Catalog.

## Provider registration

Provider families include:

- QuantityProvider
- DrawingProvider
- Validator
- PropertyPanelProvider
- HostCapability
- ConnectorCapability
- CatalogCompatibilityProvider
- Import/Export adapter where appropriate.

## UI contributions

A module can register:

- navigation section;
- command/tool entries;
- selection context actions;
- property panel sections;
- library categories;
- status/diagnostic views.

UI contributions must invoke commands/capabilities rather than private business logic in React/HtmlDialog code.

## Dependency rules

- required dependencies must be explicit;
- optional capability missing → feature degrades/hidden, module still loads where possible;
- circular required dependencies are rejected;
- platform reporting services should depend on provider contracts, not domains depending back on reporting.

## Module directory convention

```text
module-<name>/
├ manifest
├ domain/
├ objects/
├ commands/
├ geometry/
├ rules/
├ connectors/
├ quantity/
├ drawing/
├ validators/
├ migrations/
├ ui/
└ tests/
```

Exact build-language layout can vary, but responsibilities remain separated.

## Version compatibility

Module manifest declares compatible Core/contract versions. Loading unsupported module version produces a diagnostic and preserves project private data as unsupported/read-only where feasible.

## Hot reload / developer mode

Development runtime may support reloading UI or selected module registrations. Production behavior must never depend on hot reload.

## Test contract

Each module package must have contract tests proving:

- manifest validates;
- required dependencies declared;
- object schemas registered;
- commands registered without collision;
- namespaces respected;
- providers conform;
- migrations present for supported old schemas;
- module can be disabled without corrupting project data.

## Acceptance criteria

- AC-SDK-001: a sample module registers one object, command, event, quantity provider and validator without Core source edits.
- AC-SDK-002: invalid manifest leaves registry unchanged.
- AC-SDK-003: missing optional capability degrades feature without preventing module load.
- AC-SDK-004: circular required dependency is rejected with diagnostic.
- AC-SDK-005: module private data persists when module is unavailable and rehydrates when reinstalled.
- AC-SDK-006: UI contribution can be removed with module without leaving dead command references.