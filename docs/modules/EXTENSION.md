# Extension Module

Status: Proposed v1  
Module ID: `constructflow.extension`

## Mission

Own high-level renovation/extension intent and generators that coordinate other domain modules without becoming the owner of all generated construction objects.

## Presets

- Kitchen extension
- Carport
- Multipurpose room
- Laundry / utility
- Terrace / patio
- Pergola
- Glass room
- Side extension
- Rear extension
- Custom extension

## Primary object

`ExtensionZone` / `ExtensionIntent`

Core parameters:

- boundary / attachment edge;
- width/depth or arbitrary boundary;
- base/FFL reference;
- target height;
- use/program;
- roof intent;
- phase;
- concept/construction mode;
- host relationship to existing building where applicable.

## Dependencies

Required:

- Core;
- project levels/phases.

Optional capabilities:

- Architecture shell generation;
- Roof generation;
- Structure foundation/frame generation;
- Interior room presets;
- Electrical/Plumbing/Drainage requirement suggestions;
- QA/Quantity/Drawing.

Extension must orchestrate through public commands/capabilities, not private domain mutation.

## Commands

- `CreateExtensionZone`
- `ModifyExtensionBoundary`
- `ApplyExtensionPreset`
- `AttachExtensionToExisting`
- `ConvertExtensionToConstruction`
- `RegenerateExtensionDependents`

## Concept mode

Creates lightweight intent:

- boundary;
- approximate floor/wall/roof envelope;
- height/levels;
- program.

No need to choose every structural profile, flashing or service point before design is stable.

## Construction mode

User selects/accepts assemblies and the module orchestrates registered commands to create/enrich:

- Architecture walls/floor/room;
- Roof system;
- Structure;
- fascia/gutter requirements;
- room-driven MEP requirement checklists.

Generated objects remain owned by their respective modules and linked `generated_from` ExtensionIntent.

## Existing-condition coordination

Before committing construction conversion, check proposed footprint/boundary against known existing objects:

- manholes/drains;
- structural elements;
- windows/doors;
- roof/eaves;
- site/fence constraints.

Conflicts produce choices, not automatic destructive edits.

## Direct manipulation

Extension boundary and main dimensions should be draggable. Supported changes trigger regeneration/invalidation of dependents.

## Phase behavior

ExtensionIntent is normally New Construction, while referenced existing host remains Existing. If construction requires removal/modification of existing components, explicit demolition/modify commands are invoked.

## Quantity

Extension itself does not duplicate domain quantities. It may provide summary area/perimeter and aggregate linked provider outputs for UX/reporting.

## Drawing

- extension boundary/zone reference;
- high-level plan/elevation in concept mode;
- final drawings come from generated domain objects.

## QA

- invalid/non-closed boundary;
- incompatible level/host;
- existing manhole/utility inside footprint;
- extension boundary overlaps prohibited site area;
- generated dependency out of sync;
- construction conversion missing required assembly choices.

## Acceptance criteria

### Standalone preset foundation (2026-10-07)

`@constructflow/extension-engine` now compiles `ExtensionPresetInput` from `command-schema`
into public domain commands, and commits through the shared runtime's atomic batch API.
This is a partial standalone port, not completion of the broader ExtensionIntent contract.
AC-STAND-006 covers the following:

- All generated elements use UUIDs and `created_phase: new_construction`.
- Foundations reference columns with `supported_column_id`; hosted openings have placement
  coordinates and explicit wall references.
- Carport framing and terrace beams use steel metadata; kitchen walls use AAC metadata.
- Meter input is converted to canonical millimeters; terrace beam elevation follows input.
- Invalid dimensions/opening fit reject before committing; any command failure rolls back
  the full batch and emits no downstream envelopes.
- The runtime history API can undo/redo an entire planned preset as one step.

Presets currently generate framing/footings and kitchen walls/openings. Slabs, roofs,
micropiles, flashing, WPC boards, stairs and generated-from provenance remain outstanding.
AC-EXT-005/006 below are not claimed complete: provenance and data-driven templates are
separate milestones. No project schema migration is introduced by this port.

- AC-EXT-001: create Custom extension from arbitrary closed boundary attached to existing building.
- AC-EXT-002: resize boundary and mark/regenerate dependent architecture/roof without manual recreation.
- AC-EXT-003: concept object can be converted to construction while retaining identity/history.
- AC-EXT-004: detected existing manhole conflict offers resolution workflow instead of silent deletion/move.
- AC-EXT-005: generated objects retain own domain ownership and `generated_from` relationship.
- AC-EXT-006: carport/kitchen presets are data-driven templates, not hard-coded separate architecture paths.
