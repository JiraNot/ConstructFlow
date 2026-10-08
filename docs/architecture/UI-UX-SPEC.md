# UI / UX Specification

Status: Accepted foundation interaction contract; visual styling remains implementation-defined.

## Product UX goal

ConstructFlow must make standalone plan/3D modeling direct and fast. Users can explore design before defining every construction parameter; semantic editing, validation and output currentness remain coherent through the shared command runtime. Optional CAD/BIM adapters follow the same project contracts.

Primary mental model:

`Sketch → Snap → Generate → Connect → Drag → Auto Update`

Universal verbs:

- Draw
- Convert
- Attach
- Connect
- Generate
- Relocate / Replace

## Main workspace

ConstructFlow should present one integrated sidebar/panel shell with contextual tools instead of hundreds of persistent toolbar buttons.

Recommended primary navigation:

```text
Project
Existing
Architecture
Extension
Roof
Structure
Surface / Landscape
Interior
Electrical
Plumbing / Drainage
Library
Quantity / BOQ
Drawing
QA
```

A disabled/uninstalled module should not leave dead UI controls.

## Tool surfaces and shortcut codes

### Standalone applicability

The React standalone workbench uses its existing toolbar and canvas keyboard handlers. Show only shortcuts that those handlers implement. The unified catalog covers columns, foundations, beams, slabs, walls, doors and windows; tool-context picking and selected-instance assignment share the same catalog. Type edits remain drafts until a CommandBus transaction succeeds. Rename plus dimensions, and clone plus optional instance assignment, must each be undoable as one transaction. Menu groups are Project, Create, Drawings/Export, and Settings/Help; 2D/3D controls stay beside the canvas. Level settings identify project scope and store values in millimetres while displaying metres. See [current UX delivery](../UX-CATALOG-MENUS-PLAN-2026-10-08.md).

### Legacy native adapter contract

The Ruby registries, multi-letter codes and Extensions surfaces below apply to the native adapter. They do not require exposing unavailable standalone tools or adding native-adapter milestones to standalone development.

Tool labels, icons and codes are defined once in `Core::ToolCatalog` (tool and stage metadata) and `Core::ShortcutManager::SHORTCUTS` (codes and actions). Every surface — the native ConstructFlow toolbar with its per-stage flyouts, the Extensions menus and the panel ribbon — must render those definitions instead of restating them.

Rules:

- A shortcut badge shown in any surface must be a code registered in `SHORTCUTS`; do not display codes the user cannot type.
- One code maps to exactly one action. A code must not be reused for a different tool, and a shorter code must not shadow a longer code that shares its prefix, because an exact match wins while typing.
- The roof family is `RF` (roof system), `FRM` (roof framing), `MFR` (modify roof framing), `HGR` (hip/gable roof) and `AR` (Revit auto roof). Roof framing must never be presented as `RF`.
- Every roof family tool opens the properties dialog before it runs. `FRM`/`MFR` share the framing schema (pitch, truss/purlin spacing, overhang, type); `HGR`/`AR` expose their roof form, slope and overhang/fascia fields. Values reviewed in the dialog are passed to the tool, which must not prompt again with hidden defaults.
- Stage flyouts group tools by the workflow stages in `ToolCatalog::STAGES` (setup, structure, architecture, mep, interior, costing, drawing); a tool reachable from a flyout must also remain reachable without pixel-perfect toolbar hunting.
- ToolCatalog is the whole toolset, not a subset: whenever a tool exists as a panel ribbon button or drawer action it must also appear in `ToolCatalog::TOOLS` with a generated icon, Thai i18n strings and a registered shortcut, so the stage flyouts stay complete. Panel-only shortcuts are not allowed to remain panel-only.
- The drawing stage hosts annotation, measurement and layout tools (dimension, spot elevation, scenes, smart stretch, stretch-by-area, laser level, array-on-face) and carries label prefix `7.`.
- Panel shortcut badges must match the registered code for the same action; a badge for a renovated code (for example spot elevation) must be updated in `ui/panel.html`, not left on the old code.

## Global project header

Always-accessible project context should expose:

- project name/code;
- active working phase;
- active level/working plane;
- current units;
- model/quantity/drawing dirty state summary;
- module/runtime diagnostics when in developer mode.

## Working phase control

Working phase must be visible and difficult to overlook.

```text
Working Phase
[ Existing ] [ Demolition ] [ New ]
```

Newly created objects default to the active construction context according to command rules. Changing the view phase and changing the creation phase are separate actions.

## Phase views

Quick view controls:

- Existing
- Demolition
- Proposed
- Coordination / All

The view control filters semantic lifecycle; it must not rewrite object lifecycle.

## Level Manager

Provide a dedicated level manager, e.g.:

```text
+0.450 House FFL
+0.430 Extension FFL
+0.050 Parking FFL
±0.000 Landscape
-0.100 Existing Ground
-0.800 Pile Cut-off
```

Actions:

- create/rename level;
- set elevation;
- set active working plane;
- show/select dependent objects;
- warn before moving a level with dependents;
- display derived impact before committing large changes when feasible.

## Contextual Properties

Selection-driven properties should combine sections registered by modules.

Example selected roof:

```text
Core
  ID
  Phase
  Level
  Source confidence

Roof
  Type
  Slope
  Covering

Envelope
  Fascia / soffit

Drainage
  Gutter connection

Outputs
  Quantity state
  Drawing state
```

Core and domain sections remain visually distinct. Modules may read public capability state but may not write sibling private data from UI code.

## Direct manipulation

Important parametric geometry should expose in-model handles where practical:

- extension width/depth;
- roof boundary/slope/eave;
- wall path/endpoints;
- surface boundary/control points;
- paving origin/direction;
- cabinet module dividers;
- pipe route nodes;
- manhole relocation point;
- path width.

Drag must invoke domain commands or controlled interactive transactions, not bypass smart-object semantics.

## Concept mode vs Construction mode

### Concept mode

Fast, lightweight creation with only essential design intent.

Example extension:

- boundary;
- height;
- roof type;
- broad material/system choice.

### Construction mode

Enrich existing smart objects with detailed assemblies:

- structural system;
- framing;
- layers;
- flashing/gutter;
- rebar/connection metadata;
- detailed quantities and drawings.

Users should be able to delay construction detail until the design is stable.

## Create flows

### Example: extension

1. choose `Add Extension`;
2. select host wall/edge or draw custom boundary;
3. drag depth/shape;
4. select room/use preset or Custom;
5. generate concept floor/walls/roof intent;
6. direct-manipulate boundary;
7. later `Convert to Construction` to assign structure/assemblies.

### Example: smart opening

1. select wall;
2. choose opening shape/type;
3. place and size opening;
4. optionally attach door/window/vent/glass-block infill;
5. trims and detail options remain separate layered choices.

### Example: paving

1. draw/select arbitrary closed boundary;
2. set level/slope;
3. choose surface assembly;
4. add zero/multiple borders;
5. choose field pattern;
6. set direction and origin;
7. live-preview cuts;
8. adjust handles;
9. lock setting-out layout when ready;
10. generate takeoff/drawing.

### Example: manhole relocation

1. select existing manhole;
2. choose `Relocate`;
3. preview connected network/affected objects;
4. drag proposed new position;
5. preview reroute and invert/slope result;
6. show warnings/options;
7. confirm;
8. old object becomes demolition/abandoned scope, new object created and network updated.

## Connect Mode

One universal Connect mode should discover compatible public connectors.

Example interactions:

```text
Sink → Manhole
Gutter → Downpipe
Downpipe → Drainage node
Switch → Lights
Column → Foundation
```

The UI filters compatible targets and communicates why incompatible targets are unavailable.

## Convert Mode

Legacy/manual SketchUp geometry can be promoted into smart objects:

- group/component → catalog/generic smart object;
- face/path → wall/floor/surface/roof candidate;
- component → existing manhole/fixture;
- existing selected geometry retains original geometry when conversion succeeds.

Conversion preview should expose what metadata is known vs needs input.

## Library browser

Required behaviors:

- folders/subfolders;
- category/tags/search;
- thumbnail/preview;
- generic/company/manufacturer assets;
- favorites/recent;
- metadata and dimensions;
- Place;
- Swap Type;
- Replace Construction;
- compatible-alternative filtering;
- project-safe asset version handling.

Quick Swap should preserve placement/host/phase/ID when semantic swap rules allow it.

## Error and warning UX

Distinguish:

- blocking error — command cannot produce valid state;
- warning — command can proceed but requires attention;
- information — derived consequence;
- verify-on-site — uncertainty requiring field confirmation.

Warnings must explain the affected object and actionable choices. Example:

```text
Ground beam GB-03 conflicts with Existing Drain EX-P04.
Options: Reroute Drain | Change Beam | Review Only
```

## Dirty-state UX

When model changes invalidate outputs, show state rather than silently presenting stale information:

```text
Quantities: Outdated
Drawings: 3 views outdated
QA: 2 checks pending
```

Provide `Update All` orchestration, but preserve individual subsystem controls.

## Scenario / option UX

Major relocation/design decisions may be explored without immediately committing:

- create Option A/B/C;
- compare key conflicts/quantities/route lengths;
- accept one option;
- discard others.

Scenario implementation is advanced, but architecture must not make it impossible.

## Performance UX

Users must be able to switch LOD/proxy modes by context:

- Concept
- Design
- Construction
- Fabrication

High-detail trees, fittings, rebar and furniture must not be mandatory during normal modeling.

## Developer mode

For internal development:

- inspect smart-object envelope;
- inspect module owner/schema version;
- show connectors/hosts;
- show relationships;
- view recent commands/events;
- reload supported UI/module components;
- run selected validators/tests.

Developer tools must not alter production behavior silently.

## Accessibility and consistency

- all core commands should be reachable without pixel-perfect toolbar hunting;
- keyboard shortcuts may be offered but must not be the only access path;
- terminology should match authoritative docs (`Existing`, `Demolition`, `New Construction`, `Swap Type`, `Replace Construction`);
- dangerous destructive actions require clear confirmation/context;
- units and levels must be visible in dimensional editors.

## UX acceptance principle

If a user performs a normal design change and then must manually rebuild related geometry, reconnect networks, remeasure quantities and fix multiple drawings despite those relationships being known, the workflow is incomplete.
