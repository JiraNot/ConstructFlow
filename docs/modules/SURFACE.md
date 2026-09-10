# Surface & Paving Module

Status: Proposed v1  
Module ID: `constructflow.surface`

## Mission

Own construction surfaces and setting-out layouts for paving, tile, stamped concrete, stone, deck and related external/interior finish systems where arbitrary boundaries, borders, patterns, levels and drainage coordination matter.

## Owns

- SurfaceBoundary
- SurfaceAssembly
- SurfaceControlPoint
- SurfaceZone
- PavingZone
- PavingBorder
- PatternCoordinateSystem
- PavingPiece / lightweight piece record
- ControlJoint
- ParkingLayout
- PathSurface
- TreePitOpening at paving level

## Boundary requirements

Must not assume rectangular floors. Support:

- polygon;
- arc/circle/ellipse;
- freeform/curve/spline-compatible path;
- existing SketchUp closed face;
- concave boundaries;
- holes/islands;
- nested exclusions such as planters, columns, drains, tree pits;
- path-based variable-width boundaries.

Invalid/self-intersecting boundaries must be rejected or repaired explicitly.

## Surface assembly

Example tile surface:

```text
Tile 10
Adhesive 5
Screed 30
RC slab 120 (reference/owned by Structure if structural)
Subbase 150
Compacted ground
```

Surface owns finish/paving construction layers it is responsible for. Structural slab remains Structure-owned; references must avoid duplicate quantities.

## Level and slope model

Surface supports:

- base/reference level;
- spot/control elevations;
- planar slope;
- multi-control-point surfaces;
- drain-to target relation;
- ramp/step transitions where implemented.

When drain position/level changes, Surface recalculates or marks level solution invalid/dirty.

## Border engine

A surface may contain zero or multiple borders.

Border parameters:

- width;
- material/assembly;
- inside/outside/center offset;
- follow-boundary behavior;
- pattern;
- corner treatment: miter/butt/radial/custom;
- phase.

Borders must follow supported curved boundaries.

## Field patterns

Foundation scope includes:

- grid;
- running bond;
- herringbone;
- basket weave;
- chevron;
- diagonal;
- modular;
- European fan/custom module;
- radial;
- concentric;
- follow path / follow curve.

## Pattern coordinate system

Pattern is independent from boundary shape.

Persist:

- origin;
- primary direction/angle/reference;
- secondary axis where relevant;
- module dimensions;
- joint width;
- centering/alignment rule;
- minimum cut rule;
- phase/zone relation.

Origin options:

- selected point;
- selected line/wall;
- room/surface center;
- opening center;
- custom control line.

## Cut strategy

Supported modes include:

- straight layout cut to curved boundary;
- pattern flowing along a path;
- radial/concentric division;
- actual module count with cut records when locked.

Minimum-cut validation can propose shifting/centering/border changes.

## Path-based paving

Input:

- centerline/path;
- width or variable-width controls;
- border rules;
- field pattern;
- follow-path coordinate system.

Used for garden walks/curved driveways.

## Parking layout

Parameters:

- bay count;
- bay width/length;
- orientation;
- outer border;
- bay divider width/material;
- optional drain/joint positions.

Must support explicit 3-bay layout rather than approximate texture markings.

## Commands

- `CreateSurfaceBoundary`
- `ModifySurfaceBoundary`
- `SetSurfaceLevels`
- `SetDrainToTarget`
- `ApplySurfaceAssembly`
- `AddPavingBorder`
- `ModifyPavingBorder`
- `SetPavingPattern`
- `SetPavingOrigin`
- `SetPavingDirection`
- `CreatePathBasedPaving`
- `CreateParkingLayout`
- `AddControlJoint`
- `AddTreePit`
- `LockPavingLayout`
- `RegeneratePavingLayout`

## LOD/performance

Early design can display a lightweight pattern preview. Piece-level records/calculation may exist without each physical tile becoming a unique heavy group.

Locked setting-out/fabrication mode may generate selected detailed pieces/cuts.

## Phase behavior

Existing pavement can remain/demolish. New finish may overlay/rebuild existing substrate according to assembly/lifecycle definition. Demolition and new-work quantities must remain separable.

## Library/catalog

- tile/paver modules;
- stamped patterns/colors;
- stone/deck systems;
- border modules;
- approved surface assemblies.

Catalog product dimensions are fixed physical modules unless product specifically supports trimming/custom sizing.

## Quantity

Provider can output:

- net field area;
- border length/area/pieces;
- full/cut pieces when layout solved;
- reusable offcut statistics where optimizer exists;
- finish material;
- adhesive/grout/screed/subbase/concrete/mesh quantities according to owned assembly layers;
- waste as actual layout or configured factor with clear status.

## Drawing

- paving setting-out plan;
- pattern origin/control lines;
- border IDs;
- tile/paver type tags;
- spot levels/slope arrows;
- drain locations;
- control/expansion joints;
- cut-piece details/schedule in advanced mode.

### Plan representation foundation

`surface.boundary` and `surface.pattern` expose on-demand semantic `plan` representations through the shared Representation Registry. The provider reads persisted Surface definitions rather than rediscovering meaning from SketchUp geometry.

Profiles are scale/LOD aware:

- **Simple** — boundary/holes and pattern name/origin/direction;
- **Construction** — adds net area, module size, joint width and base-level intent;
- **Coordination** — adds elevation, drain target, layout state, host traceability and minimum-cut intent.

Pattern direction remains independent from the boundary. The representation uses the persisted pattern coordinate system and does not create a second 2D model.

## QA

- boundary invalid/self-intersecting;
- residual/minimum cut violation;
- pattern cannot resolve around hole;
- drain-to slope invalid;
- spot levels contradictory;
- overlapping border zones;
- fixed module stretched;
- control joint missing/outside configured rule where enabled;
- stale layout after boundary change.

## Acceptance criteria

- AC-SURF-001: arbitrary curved/concave boundary persists and regenerates.
- AC-SURF-002: multiple borders follow straight and supported curved boundaries.
- AC-SURF-003: pattern direction/origin changes without recreating Surface smart object.
- AC-SURF-004: radial/concentric/follow-path layout works independently from rectangular assumptions.
- AC-SURF-005: 3-bay parking generator preserves three explicit bays/dividers after surface resize when constraints allow.
- AC-SURF-006: moving Drain target marks/recalculates slope and reports impossible solution.
- AC-SURF-007: locked layout reports traceable full/cut piece quantities.
- AC-SURF-008: surface boundary edit marks paving quantities/drawings dirty.
- AC-SURF-009: SurfaceBoundary and Pattern expose deterministic on-demand plan representations with Simple/Construction/Coordination profiles and drain/layout traceability.
