# Domain Modules v1 — Responsibility and Contract Map

Status: Proposed module specification baseline.  
This document converts Master Blueprint scope into module ownership. It does not replace detailed per-module specs; it prevents gaps and overlap while those specs are created.

## 1. Site & Survey

Module ID: `constructflow.site`

Owns:

- site boundary, road edge, setback references, north, benchmark;
- existing/proposed ground references;
- survey points and spot levels;
- site utilities reference points;
- measured/confirmed/assumed/unknown/verify-on-site states;
- site-plan semantic data.

Primary objects:

- SiteBoundary
- SurveyPoint
- Benchmark
- ExistingGroundRegion
- ProposedGroundRegion
- RoadEdge
- SetbackReference
- UtilityReference

Commands:

- CreateSiteBoundary
- PlaceBenchmark
- ImportSurveyReference
- SetSurveyConfidence
- CreateGroundRegion

Outputs:

- site plans;
- spot levels;
- cut/fill inputs for later advanced earthwork.

Does not own architectural walls or drainage network topology.

## 2. Architecture

Module ID: `constructflow.architecture`

Owns:

- walls;
- floors and ceilings at architectural assembly level;
- rooms/space boundaries and room programs;
- architectural host surfaces;
- layered wall/floor/ceiling assemblies excluding domain-specific paving/foundation calculations.

Primary objects:

- Wall
- ArchitecturalFloor
- Ceiling
- Room
- WallAssembly
- FloorAssembly

Commands:

- CreateWall
- ModifyWallPath
- ChangeWallType
- CreateRoom
- ApplyFloorAssembly
- ApplyCeilingAssembly

Provides host capabilities for openings, cabinets, fixtures and decorative systems.

Quantities:

- wall area/volume by assembly;
- finish/plaster/paint areas where assembly layers define them;
- floor/ceiling area.

Drawings:

- plans, elevations, sections, room tags.

## 3. Opening & Void

Module ID: `constructflow.opening`

Owns openings independent of infill.

Primary objects:

- RectangularOpening
- ArchOpening
- RoundOpening
- OvalOpening
- CustomOpening
- Niche
- Recess
- ServiceOpening

Rules:

- hosted by compatible wall/slab/roof host capability;
- shape may be parametric or profile-driven;
- an opening can exist with no door/window/infill;
- Modify Existing must preserve demolition semantics for removed host material.

Commands:

- CreateOpening
- ModifyOpening
- ConvertProfileToOpening
- AddNiche

Outputs:

- opening schedule if required;
- opening head/jamb/sill references through attached detail systems.

## 4. Door & Window

Module ID: `constructflow.door_window`

Owns infill assemblies and type/instance behavior.

Families:

- swing single/double;
- sliding 2/3/4+ panel;
- fixed;
- casement/awning;
- folding;
- mixed fixed/sliding/opening;
- transom and sidelight;
- solid/panel/glazed configurations;
- panel/ลูกฟัก systems.

Primary objects:

- DoorWindowInstance
- DoorWindowType
- Frame
- Panel
- GlazingPanel
- Track

Commands:

- CreateDoorWindow
- AttachDoorWindowToOpening
- SwapDoorWindowType
- ReplaceExistingDoorWindow
- ChangePanelConfiguration

Catalog behavior:

- generic parametric types first;
- manufacturer variants optional;
- exact-fit vs resize-required compatibility.

Outputs:

- door/window schedule;
- plan/elevation symbols;
- opening details.

## 5. Decorative Wall & Façade

Module ID: `constructflow.decorative`

Owns:

- mouldings;
- cornice/belt course/building band;
- wainscot/panel systems;
- wall grooves/shadow gaps;
- slats/screens;
- pilasters/column wraps;
- decorative trims around openings;
- cladding layout at façade/decorative layer.

Primary objects:

- MouldingRun
- CorniceRun
- PanelLayout
- SlatLayout
- CladdingLayer
- DecorativeScreen
- Pilaster
- ColumnWrap

Commands:

- ApplyDecorativeWallSystem
- CreateMouldingRun
- SetPanelLayout
- ApplySlatPattern
- ApplyOpeningTrim

Rules:

- pattern must respond to host resize;
- configurable behavior around openings: continue, restart, center;
- profile-driven extrusion uses approved profile library.

Quantities:

- moulding/cornice length;
- cladding/slat area/length/pieces.

## 6. Extension

Module ID: `constructflow.extension`

Owns high-level extension intent and generators, not every generated domain object.

Presets:

- kitchen extension;
- carport;
- multipurpose room;
- laundry/utility;
- terrace/patio;
- pergola;
- glass room;
- side/rear extension;
- custom.

Primary object:

- ExtensionZone / ExtensionIntent

Commands:

- CreateExtensionZone
- ModifyExtensionBoundary
- ConvertExtensionToConstruction
- ApplyExtensionPreset

Generated relationships may create Architecture, Roof, Structure, MEP requirement objects through registered public commands/capabilities.

Concept mode must remain lightweight.

## 7. Roof & Envelope

Module ID: `constructflow.roof`

Owns:

- roof surface/system intent;
- metal/tile/polycarbonate/glass roof systems;
- rafters/purlins/truss/bracing metadata where roof-generated, while structural-member ownership can delegate to Structure through public capability;
- fascia / roof concealment;
- smartboard/fiber-cement envelope layers;
- soffit;
- flashing/counter-flashing/drip/coping;
- gutters and roof edge drainage interfaces.

Primary objects:

- RoofSystem
- RoofPlane
- RoofCovering
- RoofFramingLayout
- FasciaSystem
- SoffitSystem
- FlashingRun
- Gutter

Commands:

- GenerateRoof
- ModifyRoofBoundary
- ChangeRoofSystem
- GenerateRoofFrame
- AddFasciaSystem
- AddSoffitSystem
- AddFlashing
- AddGutter

Critical details:

- new roof to existing wall;
- new roof to existing roof;
- polycarbonate/glass joints;
- wall flashing and waterproofing interfaces.

Outputs:

- roof plan;
- framing layout;
- junction/fascia/flashing details;
- covering/framing/gutter quantities.

## 8. Structure

Module ID: `constructflow.structure`

Owns structural modeling semantics. ConstructFlow does not claim licensed engineering approval.

Primary objects:

- Pile
- PileGroup
- PileCap
- Footing
- GroundBeam
- Column
- Beam
- Slab
- SteelMember
- SteelConnection
- RebarSet

Commands:

- CreateColumn
- GenerateFoundation
- CreatePileGroup
- ConnectGroundBeam
- CreateBeam
- CreateSlab
- CreateSteelMember
- ApplySteelConnection
- AssignRebarSet
- GeneratePhysicalRebar

Level roles:

- PCL, TOF/BOF, TOB/BOB, SSL/TOS and project-defined structural levels.

LOD:

- metadata/lightweight reinforcement first;
- full rebar generation on demand.

Outputs:

- pile/foundation/column/beam/slab/roof-framing drawings;
- BBS;
- concrete/formwork/rebar/steel quantities.

QA:

- unsupported/floating metadata;
- clashes with known drains/manholes;
- missing required support relationships;
- warnings explicitly not engineering approval.

## 9. Surface & Paving

Module ID: `constructflow.surface`

Owns arbitrary-boundary external/internal finish layout and construction surface assemblies where paving behavior is required.

Primary objects:

- SurfaceBoundary
- SurfaceAssembly
- PavingZone
- PavingBorder
- PatternCoordinateSystem
- SurfaceControlPoint
- ControlJoint
- ParkingLayout
- PathSurface

Boundary requirements:

- polygon;
- arcs/circles/ellipses;
- freeform/curve;
- holes/islands;
- existing SketchUp face;
- path-based variable width.

Patterns:

- grid;
- running bond;
- herringbone;
- basket weave;
- chevron;
- diagonal;
- modular;
- European fan/custom;
- radial/concentric;
- follow path/curve.

Commands:

- CreateSurfaceBoundary
- SetSurfaceLevels
- ApplySurfaceAssembly
- AddPavingBorder
- SetPavingPattern
- SetPavingOrigin
- SetPavingDirection
- CreatePathBasedPaving
- CreateParkingLayout
- AddControlJoint

Outputs:

- paving setting-out plan;
- spot levels;
- actual/full/cut piece takeoff when layout locked;
- border/material quantities.

## 10. Landscape

Module ID: `constructflow.landscape`

Owns:

- planting areas;
- trees/shrubs/groundcover;
- planters;
- landscape furnishings/assemblies;
- garden paths at landscape semantic level using Surface capability;
- fountains/water-feature placement intent;
- landscape lighting/drainage requirement relationships.

Primary objects:

- PlantingBed
- PlantInstance
- TreePit
- Planter
- LandscapeAssembly

Catalog strategy prioritizes proxy/detail variants.

## 11. Interior & Joinery

Module ID: `constructflow.interior`

Owns parametric interior/furniture systems from design through optional fabrication.

Hierarchy:

`Cabinet Body → Module → Compartment → Front → Internal Fitting → Hardware → Finish`

Primary objects:

- CabinetRun
- Cabinet
- CabinetModule
- Compartment
- Front
- Drawer
- Shelf
- InternalFitting
- HardwareAssignment
- Countertop
- JoineryPart

Families:

- kitchen;
- wardrobe;
- TV/display wall;
- vanity;
- desk/table/counter/island;
- built-in bench;
- open shelving.

Fronts:

- swing;
- sliding;
- folding;
- lift/flap;
- solid;
- glass;
- aluminum-frame glass;
- shaker/panel/decorative.

Commands:

- CreateCabinetRun
- SplitCabinetModule
- SplitCompartment
- AssignCabinetFront
- AddDrawerSet
- AssignInternalFitting
- AssignHardware
- CreateCountertop
- FitJoineryToHost
- GenerateJoineryParts

Fabrication outputs:

- part dimensions;
- material/thickness;
- grain direction;
- edge band;
- hardware schedule;
- cut list;
- exploded view;
- board optimization later;
- future DXF/CNC adapter.

## 12. Electrical

Module ID: `constructflow.electrical`

Owns logical electrical design relationships and optional physical-routing detail.

Primary objects:

- Luminaire
- Switch
- Outlet
- DedicatedOutlet
- ElectricalCircuit
- ElectricalControlRelation
- DataPoint
- TVPoint

Commands:

- PlaceElectricalFixture
- ArrayLighting
- ConnectSwitchControl
- PlaceOutlet
- AssignElectricalCircuit

Rules:

- logical control/network first;
- conduit/cable geometry optional;
- room-program requirement checks.

Outputs:

- lighting plan;
- power plan;
- schedules/legends.

## 13. Plumbing

Module ID: `constructflow.plumbing`

Owns pressurized water-system semantics and plumbing fixture service requirements that are not drainage topology.

Primary objects:

- WaterPoint
- WaterPipeRoute
- Valve
- Pump
- TankConnection
- FixtureServiceRequirement

Commands:

- ConnectWaterSupply
- CreateWaterRoute
- PlaceValve

Connectors:

- cold water;
- hot water;
- supply.

Plumbing fixtures themselves may be catalog assets with capabilities consumed by Plumbing and Drainage.

## 14. Drainage

Module ID: `constructflow.drainage`

Owns gravity drainage/rainwater topology.

Primary objects:

- DrainagePipeRoute
- PipeSegment
- Manhole
- FloorDrain
- TrenchDrain
- Cleanout
- GreaseTrap
- DrainageJunction

Commands:

- ConnectWaste
- CreatePipeRoute
- EditPipeRoute
- PlaceManhole
- RelocateManhole
- InsertIntermediateManhole
- ConnectRoofDrainage

Required data:

- diameter;
- route nodes;
- start/end invert where known;
- slope;
- source confidence;
- network connections.

Critical rule:

Unknown existing invert is representable; the module cannot invent slope certainty.

Outputs:

- drainage plans;
- route/pipe/manhole schedules;
- pipe/manhole quantities.

QA:

- disconnected network;
- insufficient/unknown slope;
- structure clash;
- rainwater discharge without approved destination.

## 15. Platform: Library

Module/service ID: `constructflow.library`

Owns:

- folder/category/search metadata;
- fixed assets;
- parametric assets;
- assemblies;
- details;
- manufacturer/product/SKU metadata;
- type/variant compatibility;
- asset versioning;
- company vs project library.

Key distinction:

- `Swap Type` preserves construction identity where valid;
- `Replace Construction` invokes lifecycle replacement.

Project model must remain readable without remote/source library.

## 16. Platform: Quantity / Costing

IDs:

- `constructflow.quantity`
- `constructflow.costing`

Quantity aggregates provider outputs. Costing applies rate libraries, labor and waste policy. Neither owns domain geometry formulas.

## 17. Platform: Drawing

Module/service ID: `constructflow.drawing`

Owns:

- drawing/view registry;
- phase filters;
- sheets/pages;
- annotation standards;
- numbering;
- schedules;
- LayOut adapter;
- export orchestration;
- dirty-state tracking.

Consumes domain drawing providers.

## 18. Platform: QA / Coordination

Module/service ID: `constructflow.qa`

Owns validator registry, execution, issue grouping/severity and coordination presentation. Domain modules own their validator logic.

## 19. Platform: Revision / Issue

Module/service ID: `constructflow.revision`

Owns:

- revision identity;
- issue status;
- model/drawing change metadata;
- revision clouds/markers where implemented;
- issued-set tracking.

It never redefines construction phase.

## 20. Platform: AI Orchestration

Module/service ID: `constructflow.ai`

Owns intent interpretation, library search assistance, option proposal and command orchestration.

Hard boundary:

- no uncontrolled direct production geometry mutation;
- no private module-data mutation;
- no bypass of command validation;
- destructive commands follow confirmation policy;
- engineering/site uncertainty must be surfaced.

## Cross-module examples

### Kitchen extension

```text
Extension intent
  → Architecture walls/floor/room
  → Roof system
  → Structure foundation/frame
  → Interior kitchen
  → Electrical requirements
  → Plumbing water
  → Drainage waste
  → Quantity/Drawing/QA consume providers
```

### Existing manhole under proposed room

```text
Architecture/Extension creates proposed footprint
  → QA detects overlap with existing Drainage Manhole
  → user invokes RelocateManhole
  → Drainage preserves demolition/new lifecycle and reroutes
  → Structure/Surface QA react through events
  → Quantity and Drawing become dirty
```

### Curved garden paving

```text
Landscape defines intent/location
  → Surface owns arbitrary boundary + path/radial pattern + border
  → Drainage connectors handle drains
  → Quantity counts layout/cuts
  → Drawing generates setting-out plan
```

## Baseline rule

If a future feature does not clearly fit an owner above, do not place it in Core by default. Propose a capability/module ownership decision first.