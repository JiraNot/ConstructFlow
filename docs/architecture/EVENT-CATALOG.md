# Event Catalog and Propagation Rules

Status: Accepted foundation contract.

## Purpose

Events decouple domain modules. The module that owns a mutation publishes facts about what happened; interested modules react without direct hard coupling.

Events are not commands. Commands request change; events report completed change.

## Event envelope

```yaml
event_id: evt_<uuid>
name: GeometryChanged
version: 1
source_module: constructflow.roof
project_id: optional
object_ids: []
caused_by_command_id: cmd_<uuid>|null
payload: {}
timestamp: <runtime timestamp>
```

## Guarantees

- publish only after the owning transaction reaches a valid state;
- subscribers must not assume delivery order across unrelated events unless documented;
- subscribers must be safe to re-evaluate derived state;
- event handling must not create hidden circular domain dependencies;
- an event must not be used to mutate another module's private fields directly.

## Core event families

### Object lifecycle

- `ObjectCreated`
- `ObjectUpdated`
- `ObjectDeleted`
- `ObjectDuplicated`
- `ObjectConverted`
- `ObjectOrphaned`
- `ObjectRepaired`

### Phase / revision / level

- `WorkingPhaseChanged`
- `ObjectPhaseChanged`
- `ObjectDemolished`
- `ConstructionObjectReplaced`
- `LevelCreated`
- `LevelChanged`
- `LevelDeleted`
- `RevisionIssued`

### Geometry / parameters

- `GeometryChanged`
- `ParametersChanged`
- `HostChanged`
- `RelationshipChanged`
- `ConnectionChanged`
- `RouteChanged`

### Library / catalog

- `CatalogAssetPlaced`
- `LibraryAssetSwapped`
- `CatalogAssetVersionChanged`
- `AssemblyTypeChanged`

### Derived/output state

- `QuantityDirty`
- `QuantityRecalculated`
- `DrawingDirty`
- `DrawingGenerated`
- `ValidationStateChanged`
- `ScheduleDirty`

### Domain-specific coordination

- `RoofBoundaryChanged`
- `RoofDrainageChanged`
- `StructuralMemberChanged`
- `SurfaceLevelsChanged`
- `PavingLayoutChanged`
- `DrainageNodeRelocated`
- `DrainageTopologyChanged`
- `CabinetLayoutChanged`
- `ElectricalControlChanged`

Domain-specific events should only be introduced when generic events cannot express the subscriber need without forcing domain inspection.

## Dirty propagation

The event system is a major mechanism for invalidation.

Example: roof geometry changes.

```text
Roof module
  emits GeometryChanged / RoofBoundaryChanged
      ↓
Structure: checks generated frame relationship
Drainage: checks gutter/downpipe geometry
Quantity: marks roof quantities dirty
Drawing: marks affected views dirty
QA: schedules relevant validators
```

Subscribers should prefer invalidating and recomputing their own derived state instead of asking the source module to perform subscriber-specific work.

## Manhole relocation example

A successful relocation can emit:

1. `ObjectDemolished` for old manhole.
2. `ObjectCreated` for new manhole.
3. `ConstructionObjectReplaced` linking old/new.
4. `DrainageNodeRelocated` with old/new node IDs.
5. `DrainageTopologyChanged` for affected network.
6. `QuantityDirty` and `DrawingDirty` may be emitted centrally or derived by registered consumers.

Structure QA can then check clashes without Drainage calling Structure directly.

## Event payload policy

Payload contains only data necessary to interpret the fact and identify affected objects. Do not duplicate complete object snapshots unless required for an external audit/export use case.

Consumers needing current state query public providers by object ID.

## Failure handling

A subscriber failure must not silently roll back a domain transaction that has already committed unless the event is explicitly part of a synchronous validation transaction. Default behavior:

- source command commits valid owner-domain state;
- subscriber failure is logged;
- affected derived subsystem is marked dirty/error;
- QA/runtime diagnostics expose the failure.

## Synchronous vs deferred subscribers

Foundation runtime may initially execute events synchronously for simplicity. Contracts must not assume this forever. Heavy consumers such as quantity aggregation, drawing regeneration or full-project QA may later run deferred.

## Event versioning

Breaking payload changes increment event version. Subscribers declare supported versions. Prefer additive payload evolution.

## Event loop protection

Modules must not create endless loops such as:

`GeometryChanged → update geometry → GeometryChanged → ...`

Derived updates should distinguish source mutations from deterministic recalculation and use transaction/correlation metadata where required.

## Auditability

Events may later feed project history/audit logs, but the event stream is not the only persisted source of truth. Current semantic object state remains persistently readable without replaying the complete event history.