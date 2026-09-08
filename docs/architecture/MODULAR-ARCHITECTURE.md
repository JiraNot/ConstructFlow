# Modular Architecture Specification

## Decision

ConstructFlow uses a **modular monolith with plugin-style domain modules** for its first major architecture. It is intentionally not designed as a single giant SketchUp plugin and is not split into microservices prematurely.

The deployable SketchUp extension may be distributed as one product, while internal packages remain independently owned, versioned, tested, migrated and replaceable.

## Layer model

```text
ConstructFlow
├─ Core Kernel
├─ Shared Contracts / Module SDK
├─ Domain Modules
└─ Platform Services
```

### Core Kernel

The kernel owns only platform-level behavior:

- project identity
- object identity
- unit system
- phase lifecycle
- datum / level references
- transaction boundaries
- command dispatch
- event publication
- module registry
- persistence adapters
- shared selection/context integration

The kernel must not contain roof framing formulas, drainage routing, cabinet construction rules or other domain logic.

### Shared Contracts / Module SDK

The SDK defines how modules participate in the platform:

- module manifest
- smart-object type registration
- command registration
- event subscription
- host contracts
- connector contracts
- quantity provider
- drawing provider
- validator provider
- property panel contributions
- context actions
- migrations

### Domain Modules

Initial domain ownership:

- `constructflow.site`
- `constructflow.architecture`
- `constructflow.opening`
- `constructflow.door_window`
- `constructflow.decorative`
- `constructflow.extension`
- `constructflow.roof`
- `constructflow.structure`
- `constructflow.surface`
- `constructflow.landscape`
- `constructflow.interior`
- `constructflow.electrical`
- `constructflow.plumbing`
- `constructflow.drainage`

### Platform Services

Cross-domain consumers and aggregators:

- `constructflow.library`
- `constructflow.quantity`
- `constructflow.costing`
- `constructflow.drawing`
- `constructflow.qa`
- `constructflow.revision`
- `constructflow.import_export`
- `constructflow.ai`

## Dependency rules

1. Domain modules may depend on Core and Contracts.
2. Domain modules should avoid hard dependencies on other domain modules.
3. Optional cross-domain behavior is expressed through capabilities, connectors, commands and events.
4. Reporting/platform modules consume domain providers; domain modules do not require reporting modules.
5. Circular dependencies are prohibited.
6. AI is a client of the command system and never receives privileged geometry mutation access.

### Correct example

```text
Roof module
  publishes RoofGeometryChanged

Drainage module
  subscribes and revalidates gutter/downpipe connections

Quantity service
  subscribes and invalidates roof quantities

Drawing service
  subscribes and marks affected sheets outdated
```

### Incorrect example

```text
RoofModule.update()
  calls DrainageModule.rebuildPipes()
  calls QuantityModule.recalculateRoof()
  calls DrawingModule.regenerateSheets()
```

The incorrect pattern creates hard coupling and makes modules difficult to replace or test.

## Data ownership

Each module owns its domain-specific schema under its namespace. Shared fields are owned by Core.

Example:

```text
constructflow.core.object_id
constructflow.core.created_phase
constructflow.core.demolished_phase
constructflow.core.level_ref

constructflow.roof.slope
constructflow.roof.system_type

constructflow.catalog.asset_id
```

Modules must not write arbitrary keys into another module's namespace.

## Module manifest

Every module declares:

- stable module ID
- semantic version
- schema version
- required capabilities
- optional capabilities
- object types provided
- commands provided
- events emitted/consumed
- quantity providers
- drawing providers
- validators
- migrations
- UI contributions

Example:

```yaml
id: constructflow.roof
name: Roof & Envelope
version: 0.1.0
schema_version: 1
requires:
  - constructflow.core
optional:
  - capability:structural-support
  - capability:drainage-network
provides:
  object_types:
    - roof
    - roof_edge
    - fascia
    - gutter
```

## UI modularity

The sidebar and property inspector are registry-driven rather than hardcoded around every domain.

Modules may contribute:

- navigation entries
- tool commands
- property sections
- context-menu actions
- library asset renderers
- validation result renderers

Selecting an object can therefore compose a property panel from multiple capability providers while Core still owns identity, phase and level metadata.

## Module evolution

A large module may later be split without redesigning the kernel. Example:

```text
constructflow.surface
→ surface.core
→ surface.tile
→ surface.paving
→ surface.stamped
→ surface.deck
```

Likewise:

```text
constructflow.interior
→ interior.core
→ interior.cabinet
→ interior.kitchen
→ interior.fabrication
```

## Repository strategy

The initial repository is a monorepo so domain contracts can evolve atomically while architecture is young. Module boundaries are enforced through package structure and tests rather than separate repositories.

Suggested layout:

```text
apps/
  sketchup-extension/
  buildflow-ui/

packages/
  core/
  contracts/
  module-sdk/

modules/
  architecture/
  roof/
  structure/
  surface/
  interior/
  drainage/
  ...

platform/
  library/
  quantity/
  drawing/
  qa/
  ai/
```

## Architectural invariant

A production object is never considered complete merely because geometry exists. The stable platform representation is:

`Identity + Lifecycle + Parameters + Relationships + Geometry Reference + Providers`

This invariant is the foundation that allows model changes to propagate into quantity, QA and documentation without rebuilding information manually.
