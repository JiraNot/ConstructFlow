# Architecture Module

Status: Proposed v1  
Module ID: `constructflow.architecture`

## Mission

Own the primary architectural host model used by renovation and extension workflows: walls, architectural floors, ceilings, rooms and layered architectural assemblies.

## Owns

- Wall
- WallType / WallAssembly
- ArchitecturalFloor
- FloorAssembly
- Ceiling
- CeilingAssembly
- Room
- RoomProgram

## Dependencies

Required:

- Core smart-object/lifecycle/level/unit contracts.

Optional capabilities consumed:

- Opening host integration;
- Surface finish integration;
- Structure coordination;
- Drawing/Quantity/QA providers.

Provides capabilities:

- `wall.host_surface`
- `floor.support_surface`
- `ceiling.host_surface`
- room boundary/program lookup.

## Wall semantics

Wall parameters can include:

- path/control points;
- thickness;
- base level + offset;
- top constraint or explicit height;
- wall type/assembly;
- interior/exterior orientation;
- existing-condition confidence;
- joins/end conditions.

Wall geometry is parametric where created by ConstructFlow. Converted legacy walls may use a less strict geometry ownership mode until normalized.

### Extension-generated walls

`GenerateOrUpdateArchitectureFromExtension` is the public Architecture-owned bridge used by Extension orchestration. It consumes the Extension boundary and creates one `architecture.wall` for each normalized closed-boundary edge.

Generated walls carry:

- `generated_from` → source `extension.zone`;
- role `extension_source`;
- stable v1 slot `wall_edge_N`;
- New Construction lifecycle;
- Architecture-owned `WallDefinition` and geometry.

A repeated last boundary point equal to the first is normalized away before edge generation. Re-running the same topology updates existing wall slots. If topology shrinks, obsolete generated wall slots are erased as source-intent reconciliation, not demolition.

Supported v1 construction-intent fields are `wall_thickness_mm`, `wall_height_mm`, `wall_type_id`, and `orientation`. When wall type or thickness is missing, the generated wall remains an `assumed` construction input and must not be presented as confirmed specification. Explicit type + thickness allows new generated walls to use `confirmed` source state.

When an existing generated wall is rebuilt, Architecture passes its registered hosted-opening data back into wall geometry generation so supported openings remain cut from the wall. Host/opening identity remains owned by the existing Architecture/Opening contracts.

## Layered assemblies

Example:

```text
Exterior paint
Plaster 15
AAC 75
Plaster 15
Interior paint
```

Layers support:

- material/category;
- thickness;
- side/orientation;
- quantity classification;
- finish/spec reference.

Detailed physical layer geometry may be LOD-dependent; quantities do not require every layer to be separate solids if formulas are deterministic.

## Floor / ceiling

ArchitecturalFloor owns architectural floor intent and finish/build-up where not delegated to Surface. Structural slab is owned by Structure.

Floor can reference:

- FFL;
- finish layers;
- screed/adhesive layers;
- relation to structural slab level.

Ceiling supports:

- level/offset;
- gypsum/smartboard/other assemblies;
- hosted light capability;
- drop/cove zones in later detail phases.

## Rooms

Room objects represent semantic spaces and requirements, not only labels.

Example RoomProgram fields:

- type: Kitchen / Multipurpose / Bedroom / etc.;
- finish requirements;
- lighting/outlet requirement presets;
- plumbing/drainage service requirements where applicable;
- area;
- ceiling requirement.

Room-driven MEP requirements are suggestions/checklists; Electrical/Plumbing/Drainage own their actual objects/networks.

## Commands

- `CreateWall`
- `ModifyWallPath`
- `ChangeWallType`
- `GenerateOrUpdateArchitectureFromExtension`
- `JoinWalls`
- `CreateArchitecturalFloor`
- `ApplyFloorAssembly`
- `CreateCeiling`
- `ApplyCeilingAssembly`
- `CreateRoom`
- `AssignRoomProgram`
- `ConvertSelectionToWall`

## Direct manipulation

Walls should expose endpoint/path/height handles where practical. Floors expose boundary/control points. Dragging must execute controlled command transactions.

## Phase behavior

Architecture supports:

- Existing to Remain;
- Existing Demolish;
- Existing Modify;
- New Construction.

Example new opening in an existing wall should not force demolition of the entire wall. Opening/Architecture collaboration records removed region/construction scope according to implemented demolition-detail policy.

Source reconciliation of an unissued Extension-generated New Construction wall is not demolition. Existing/as-built/issued construction that requires history must continue to use lifecycle semantics rather than source reconciliation erase.

## Level behavior

Wall examples:

```text
Base: FFL Ground +0
Top: Ceiling Ground -50
```

Floor:

```text
FFL +0.450
finish/build-up references structural slab below
```

Level changes must propagate or mark dependent geometry invalid/dirty.

## Catalog/library

Wall/floor/ceiling types are parametric assemblies and can be stored in Company/Project Library.

Swap Type:

- preserves smart-object ID, path/boundary, lifecycle;
- updates thickness/layers/quantities;
- triggers hosted opening/decorative coordination.

## Quantity provider

Possible output:

- wall gross/net area;
- wall volume;
- layer areas/volumes;
- plaster/paint areas;
- architectural floor finish area;
- ceiling area.

Openings must be deducted according to documented quantity rules and source traceability.

Current Extension-generated walls flow through the existing wall provider for gross area and wall volume. The Extension package aggregates those provider results; it does not calculate wall quantities itself.

## Drawing provider

- floor plans;
- wall linework by scale;
- sections/elevations;
- room tags;
- finish/assembly tags;
- level references.

Extension-generated walls use the same Architecture plan representation as manually created walls. No separate 2D Extension-wall model is permitted.

## Validators

- wall with zero/invalid thickness;
- unresolved base/top level;
- invalid self-intersecting path;
- orphaned hosted objects after regeneration;
- room boundary not closed;
- floor/ceiling invalid boundary;
- missing phase/assembly where required.

## Acceptance criteria

- AC-ARCH-001: Draw Smart Wall from two or more points and persist/reopen.
- AC-ARCH-002: Convert supported legacy SketchUp wall geometry to smart wall without losing selected geometry.
- AC-ARCH-003: Existing wall and New wall render correctly in phase views.
- AC-ARCH-004: changing wall type updates geometry/quantity and marks drawings dirty.
- AC-ARCH-005: hosted opening remains semantically attached during supported wall length/height edits.
- AC-ARCH-006: Undo/Redo restores wall geometry and metadata together.
- AC-ARCH-007: room area recalculates after supported boundary change.
- AC-ARCH-008: Extension generation produces one Architecture-owned wall per normalized boundary edge with stable `wall_edge_N` provenance.
- AC-ARCH-009: Extension wall regeneration updates matching wall identities and removes stale generated slots after topology shrink.
- AC-ARCH-010: supported hosted openings remain present during generated-wall rebuild.
- AC-ARCH-011: generated-wall quantity and plan output use the same Architecture Smart Objects and domain providers.

## Deferred

- full freeform conceptual massing replacement for SketchUp;
- advanced curtain-wall systems;
- full multi-story building BIM parity with Revit in initial releases.
