# ConstructFlow Module SDK

The Module SDK defines the integration surface between ConstructFlow Core and domain modules.

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
