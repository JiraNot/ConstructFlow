# Command Catalog and Execution Contract

Status: Accepted foundation contract for command semantics; detailed domain commands are Proposed until module implementation.

## Principle

All meaningful model mutations must be expressed as deterministic domain commands. Human UI, automation and AI use the same command surface.

A command describes intent. The owning domain module validates intent, mutates semantic state and geometry inside one transaction, then emits events.

AI must never bypass this layer for production smart objects.

## Command envelope

```yaml
command_id: cmd_<uuid>
name: RelocateManhole
version: 1
actor:
  kind: human|ai|automation
  id: optional
project_id: optional
selection: []
input: {}
options: {}
```

Every command must define:

- owner module;
- version;
- input schema;
- preconditions;
- validation errors;
- transaction boundary;
- mutation behavior;
- emitted events;
- undo behavior;
- affected outputs/dirty flags;
- permission/AI exposure policy.

## Command result

```yaml
status: success|rejected|failed
created_object_ids: []
updated_object_ids: []
removed_object_ids: []
warnings: []
errors: []
events: []
```

Rejected validation is not a runtime failure.

## Cross-module rule

A command is owned by the module that owns the primary semantic mutation. It may use shared connectors/capabilities and publish events, but it must not directly mutate another module's private state.

Example: `RelocateManhole` is owned by Drainage. It may request route recalculation through public network contracts and emit events that make Structure QA and Drawing invalidation react.

Extension orchestration follows the same rule. `GenerateOrUpdateArchitectureFromExtension` is owned by Architecture even though the source intent comes from an Extension. The command creates/updates Architecture Smart Walls through Architecture definitions, geometry, validation and persistence; Extension never creates raw wall geometry on Architecture's behalf.

## Core command families

### Project / lifecycle

- `CreateProject`
- `SetWorkingPhase`
- `CreateLevel`
- `ModifyLevel`
- `CreateGrid`
- `DemolishObject`
- `RestoreDemolitionState`
- `RelocateExistingObject`
- `ReplaceConstructionObject`
- `ChangeObjectPhase`

### Conversion and smart-object management

- `ConvertSelectionToSmartObject`
- `DetachSmartObjectGeometry`
- `RepairSmartObjectReferences`
- `DuplicateSmartObject`

### Architecture / openings

- `CreateWall`
- `ModifyWallPath`
- `ChangeWallType`
- `GenerateOrUpdateArchitectureFromExtension`
- `CreateOpening`
- `ModifyOpening`
- `AttachOpeningInfill`
- `CreateDoorWindow`
- `SwapDoorWindowType`
- `ApplyDecorativeWallSystem`
- `CreateMouldingRun`

### Extension / roof

- `CreateExtensionZone`
- `ConvertExtensionToConstruction`
- `GenerateRoof`
- `ModifyRoofBoundary`
- `ChangeRoofSystem`
- `GenerateRoofFrame`
- `AddFasciaSystem`
- `AddSoffitSystem`
- `AddFlashing`
- `AddGutter`
- `ConnectDownpipe`

### Structure

- `CreateStructuralGrid`
- `CreateColumn`
- `GenerateFoundation`
- `CreatePileGroup`
- `ConnectGroundBeam`
- `CreateBeam`
- `CreateSlab`
- `AssignRebarSet`
- `GeneratePhysicalRebar`
- `CreateSteelMember`
- `ApplySteelConnection`

### Surface / landscape

- `CreateSurfaceBoundary`
- `SetSurfaceLevels`
- `ApplySurfaceAssembly`
- `AddPavingBorder`
- `SetPavingPattern`
- `SetPavingOrigin`
- `SetPavingDirection`
- `CreatePathBasedPaving`
- `CreateParkingLayout`
- `AddSurfaceDrain`
- `CreateTreePit`

### Interior / fabrication

- `CreateCabinetRun`
- `SplitCabinetModule`
- `SplitCompartment`
- `AssignCabinetFront`
- `AddDrawerSet`
- `AssignInternalFitting`
- `AssignHardware`
- `CreateCountertop`
- `FitJoineryToHost`
- `GenerateJoineryParts`
- `GenerateShopDrawing`

### Electrical

- `PlaceElectricalFixture`
- `ArrayLighting`
- `ConnectSwitchControl`
- `AssignElectricalCircuit`
- `PlaceOutlet`

### Plumbing / drainage

- `PlacePlumbingFixture`
- `ConnectWaterSupply`
- `ConnectWaste`
- `CreatePipeRoute`
- `EditPipeRoute`
- `PlaceManhole`
- `RelocateManhole`
- `InsertIntermediateManhole`
- `ConnectRoofDrainage`

### Library / catalog

- `PlaceCatalogAsset`
- `SwapCatalogAsset`
- `ReplaceCatalogConstruction`
- `UpdateCatalogAssetVersion`
- `SaveAssemblyPreset`

### Output / QA

- `RecalculateQuantities`
- `GenerateDrawingView`
- `GenerateDrawingSet`
- `GenerateSchedule`
- `RunValidation`
- `AcceptScenarioOption`

## Required command semantics examples

### `GenerateOrUpdateArchitectureFromExtension`

Owner: `constructflow.architecture`.

Inputs include source Extension ID, normalized Extension construction intent, boundary, base level/offset, target height and Architecture config.

Behavior:

1. normalize an optional repeated closing boundary point;
2. create or update one Architecture Smart Wall for each closed boundary edge using stable `wall_edge_N` source slots;
3. preserve supported hosted-opening data during regeneration of surviving wall identities;
4. reconcile obsolete generated wall slots when topology shrinks;
5. mark wall quantity/drawing outputs dirty;
6. return created/updated/removed Smart Object IDs and explicit assumption warnings.

Default/generated wall construction data is not confirmation. New walls remain `assumed` unless both wall type and thickness are explicit in the effective construction intent.

### `DemolishObject`

Preconditions:

- target exists;
- target was created in a phase earlier than or equal to demolition phase;
- target is not already demolished.

Behavior:

- set lifecycle demolition phase;
- preserve geometry/history as required for demolition view;
- mark dependent quantities/drawings dirty;
- do not create a replacement.

### `ReplaceConstructionObject`

Behavior:

1. mark existing target demolished;
2. create new object under active new-construction phase;
3. link `replaces`/`replaced_by`;
4. preserve compatible placement/host information where requested;
5. reconnect through public contracts only when safe;
6. invalidate outputs.

This differs from `SwapCatalogAsset`, which changes type/variant without creating demolition history.

### `RelocateManhole`

Inputs should include target manhole, proposed location and reroute strategy.

Behavior:

- existing manhole is preserved as demolition/abandon history;
- new manhole receives new stable ID;
- relevant pipe segments are retained, demolished or regenerated according to route result;
- network topology, slope and invert levels are validated;
- affected Surface, Structure QA, Quantity and Drawing consumers receive events.

### `AddPavingBorder`

Inputs include surface/zone, border width, material/assembly, pattern, side/offset rule and corner treatment. It must operate against arbitrary closed boundaries, including curves, not rectangular assumptions.

### `SplitCabinetModule`

Inputs include cabinet/module, split axis and either explicit dimensions or equal/ratio distribution. It preserves overall cabinet envelope and regenerates affected fronts/internals according to rules rather than raw geometry cuts.

## Transaction and Undo

Every mutation command that changes SketchUp model state must execute within a SketchUp-compatible transaction/operation. A rejected command must not leave partial geometry or partial metadata.

Undo should restore semantic metadata and geometry together.

## Idempotency

Commands are not universally idempotent, but automation commands that can be retried must define an idempotency strategy where necessary. Duplicate `command_id` must never silently create duplicate production objects if the caller retries after an uncertain response.

Generated-from-source commands such as `GenerateOrUpdateArchitectureFromExtension` must converge on stable source slots rather than appending duplicate generated objects on each rerun.

## AI exposure

Each command declares:

- `ai_allowed`: true/false;
- whether user confirmation is required;
- whether the command can destroy/replace construction history;
- whether engineering/site verification warnings must be surfaced.

High-impact destructive commands should require explicit confirmation from the user-facing orchestration layer.

## Versioning

Breaking input/result behavior creates a new command version. Old persisted project state must never require replaying historical commands to remain readable; current semantic state is persisted independently.
