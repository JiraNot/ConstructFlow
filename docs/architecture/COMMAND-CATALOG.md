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

Rejected validation is not a runtime exception, but an orchestration layer must treat a rejected required domain command as an unsuccessful execution step and propagate dependency dirtiness accordingly.

## Cross-module rule

A command is owned by the module that owns the primary semantic mutation. It may use shared connectors/capabilities and publish events, but it must not directly mutate another module's private state.

Example: `RelocateManhole` is owned by Drainage. It may request route recalculation through public network contracts and emit events that make Structure QA and Drawing invalidation react.

Extension orchestration follows the same rule. `GenerateOrUpdateArchitectureFromExtension` is owned by Architecture even though the source intent comes from an Extension. `GenerateOrUpdateOpeningFromExtension` remains Opening-owned, and `GenerateOrUpdateDoorWindowFromExtension` remains Door/Window-owned. Extension passes effective intent but never takes geometry ownership from those modules.

## Core command families

### Native acceptance evidence

- `RunNativeAcceptancePreflight`
- `CaptureNativeAcceptanceBaseline`
- `VerifyNativeAcceptanceReopen`
- `VerifyNativeAcceptanceUndoRedo`
- `RecordNativeAcceptanceCheckpoint`

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

### Architecture / openings / infill

- `CreateWall`
- `ModifyWallPath`
- `MoveWall`
- `MoveWallSegment`
- `CopyWall`
- `StretchWallEndpoint`
- `ChangeWallType`
- `ChangeWallConstraints`
- `FlipWallOrientation`
- `CreateFloor`
- `ModifyFloorBoundary`
- `CreateRoom`
- `DetectRoomsFromWalls`
- `ModifyRoomBoundary`
- `EditRoomSchedule`
- `CreateCeiling`
- `ModifyCeilingBoundary`
- `GenerateOrUpdateArchitectureFromExtension`
- `CreateOpening`
- `ModifyOpening`
- `MarkUnresolvedOpeningHosts`
- `ResolveOpeningHost`
- `GenerateOrUpdateOpeningFromExtension`
- `AttachOpeningInfill`
- `CreateDoorWindow`
- `PlaceDoorWindowOnWall`
- `EditDoorWindowSchedule`
- `SwapDoorWindowType`
- `GenerateOrUpdateDoorWindowFromExtension`
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
- `ModifyStructuralGrid`
- `CreateBeam`
- `ModifyBeamPath`
- `EditBeamSchedule`
- `CreateColumn`
- `EditColumnSchedule`
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

`GenerateSchedule` and schedule editing use the shared `Core::ScheduleDefinition` / `Core::ScheduleEditor` contract. Rows retain Smart Object IDs; editable instance/type fields delegate to domain commands, while calculated fields remain read-only.

Door/window schedule instance edits delegate to `ModifyDoorWindowInstance`, which persists handing/schedule-mark changes and emits drawing, quantity and schedule invalidation for the same Smart Object.

## Required command semantics examples

### `GenerateOrUpdateArchitectureFromExtension`

Owner: `constructflow.architecture`.

Inputs include source Extension ID, normalized Extension construction intent, boundary, base level/offset, target height and Architecture config.

Behavior:

1. normalize an optional repeated closing boundary point;
2. create or update one Architecture Smart Wall for each closed boundary edge not safely replaced by an attachment-host edge, using stable `wall_edge_N` source slots;
3. preserve supported hosted-opening data during regeneration of surviving wall identities;
4. reconcile obsolete generated wall slots when topology shrinks or attachment suppresses a prior overlap wall;
5. mark wall quantity/drawing outputs dirty;
6. return created/updated/removed Smart Object IDs and explicit assumption warnings.

Default/generated wall construction data is not confirmation. New walls remain `assumed` unless both wall type and thickness are explicit in the effective construction intent.

### `GenerateOrUpdateOpeningFromExtension`

Owner: `constructflow.opening`.

This is an explicit host-modification boundary. Attachment-host presence alone is insufficient. Generation requires opt-in Opening intent, explicit confirmation to modify the existing host, explicit dimensions, and a safely resolved attachment host/edge.

The generated Opening uses stable source slot `attachment_opening`. Host changes require explicit rehost intent. Explicit disable detaches the hosted cut and reconciles the generated new-work Opening; omitted intent is non-destructive.

### `GenerateOrUpdateDoorWindowFromExtension`

Owner: `constructflow.door_window`.

This command is independently opt-in after the attachment Opening exists. It requires the current generated `attachment_opening` plus either a registered Door/Window type or enough explicit type intent to create a project-local type using the Opening dimensions.

The generated `door_window.instance` uses stable source slot `attachment_infill` and the normal Opening host relation. Type/config changes update the same Smart Object. A different Opening identity requires explicit `rehost: true`. Explicit `door_window.enabled: false` detaches/reconciles only the generated infill; omitted intent is non-destructive.

Validation must be side-effect free. Registering a project-local type is a command mutation and occurs only during successful command execution, not during validation/preview.

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

Generated-from-source commands such as `GenerateOrUpdateArchitectureFromExtension`, `GenerateOrUpdateOpeningFromExtension` and `GenerateOrUpdateDoorWindowFromExtension` must converge on stable source slots rather than appending duplicate generated objects on each rerun.

## AI exposure

Each command declares:

- `ai_allowed`: true/false;
- whether user confirmation is required;
- whether the command can destroy/replace construction history;
- whether engineering/site verification warnings must be surfaced.

High-impact destructive commands should require explicit confirmation from the user-facing orchestration layer. In particular, an AI caller must not infer permission to cut an existing attachment host merely from the existence of an Extension/attachment relation.

## Versioning

Breaking input/result behavior creates a new command version. Old persisted project state must never require replaying historical commands to remain readable; current semantic state is persisted independently.
