# Core Contracts

This document defines the minimum stable contracts all ConstructFlow modules share. Domain implementation details must stay outside Core.

## SmartObject contract

Required common fields:

```text
id                 stable UUID/string
object_type        namespaced logical type
owner_module       module that owns domain behavior
schema_version     domain schema version
created_phase      lifecycle creation phase
removed_phase      optional lifecycle removal phase
level_refs         zero or more semantic level references
host_refs          zero or more host relationships
connectors         typed connection endpoints
catalog_ref        optional library/catalog reference
geometry_ref       SketchUp entity reference(s)
revision_meta      object change/audit metadata
status             active / warning / invalid / archived
```

Domain parameters are stored only in the owning module namespace.

## Module contract

A module registers with Core through a manifest and runtime registration interface.

A module may provide:

- object types
- commands
- event publishers/subscribers
- host adapters
- connector types
- quantity providers
- drawing providers
- validators
- migrations
- UI contributions
- catalog asset handlers

## Command contract

Commands are the only supported high-level mutation entry point for production smart objects.

```text
CommandRequest
  id
  command_type
  target_refs[]
  payload
  actor
  transaction_id
  expected_revision?

CommandResult
  ok
  changed_object_refs[]
  emitted_events[]
  warnings[]
  errors[]
```

Commands must be deterministic given the same model state and payload.

Examples:

- `constructflow.core.demolish_object`
- `constructflow.core.change_level`
- `constructflow.drainage.relocate_manhole`
- `constructflow.surface.add_border`
- `constructflow.interior.split_module`
- `constructflow.library.swap_asset`

## Event contract

Events are immutable notifications emitted after successful transactions.

```text
DomainEvent
  event_id
  event_type
  source_module
  object_refs[]
  transaction_id
  timestamp
  payload
```

Core event families:

- ObjectCreated
- ObjectModified
- ObjectDeleted
- GeometryChanged
- PhaseChanged
- LevelChanged
- ConnectionChanged
- CatalogReferenceChanged
- QuantityInvalidated
- DrawingInvalidated
- ValidationInvalidated

## Host contract

Host relationships express placement/attachment semantics without hard-coding module ownership.

Examples:

- window → wall
- door → wall/opening
- downlight → ceiling
- gutter → roof edge
- cabinet → wall/floor
- fascia → roof/steel support

A host provider exposes compatible attachment surfaces and placement frames. A hosted object stores the host reference plus placement parameters rather than relying only on world coordinates.

## Connector contract

Connectors represent network/functional connection points.

Minimum connector fields:

```text
id
kind
system
position/frame
size_or_capacity?
direction
allowed_connections[]
metadata
```

Representative kinds:

- waste
- soil
- cold_water
- hot_water
- rainwater
- electrical_power
- lighting_control
- structural_support

Connector geometry may be symbolic at low LOD.

## QuantityProvider contract

Domain modules calculate their own quantities and expose normalized records.

```text
QuantityItem
  source_object_ref
  category
  item_code?
  description
  unit
  quantity
  material_ref?
  catalog_ref?
  waste_basis?
  metadata
```

The Quantity/BOQ platform aggregates records; it does not duplicate domain formulas.

## DrawingProvider contract

Domain modules provide drawing representations and drawing intents.

Examples:

- architecture → plan/elevation/opening tags
- structure → foundation/beam/rebar representations
- surface → paving layout and setting-out lines
- interior → cabinet elevation/section/cut-list representation
- drainage → pipe/manhole plan and invert annotations

The Drawing platform owns sheet organization, numbering, scales, title blocks, revision status and final export orchestration.

## Validator contract

Each validator returns structured issues:

```text
ValidationIssue
  rule_id
  severity
  object_refs[]
  message
  suggested_actions[]
  data
```

Severity levels:

- info
- warning
- error
- blocking

## Persistence contract

Core persistence stores:

1. stable object identity and shared metadata in namespaced SketchUp attributes;
2. module data under module-owned namespaces;
3. optional project-sidecar/cloud records for data that should not bloat the SKP file;
4. schema versions required for migrations.

No module may assume external catalog availability is required to open an existing project. Geometry and essential object data must remain project-safe.

## Transaction rule

A user action or AI command that changes the production model executes inside one ConstructFlow transaction aligned with SketchUp undo/redo where possible. Events are emitted only after a successful transaction commit.
