# Interior & Joinery Module

Status: Proposed v1  
Module ID: `constructflow.interior`

## Mission

Own parametric interior/joinery systems from design through optional fabrication-level outputs, including cabinetry, wardrobes, kitchens, TV units, vanities, desks, tables, counters, benches, fronts, drawers, shelves, hardware and cut lists.

## Semantic hierarchy

`Cabinet Body → Module → Compartment → Front → Internal Fitting → Hardware → Finish`

Fabrication mode additionally creates `JoineryPart` records.

## Owns

- CabinetRun
- Cabinet
- CabinetModule
- Compartment
- Front
- Drawer
- DrawerSet
- Shelf
- InternalFitting
- HardwareAssignment
- Countertop
- JoineryPart
- JoineryAssemblyType

## Families

- Base cabinet
- Wall cabinet
- Tall cabinet
- Wardrobe
- Kitchen
- TV/display unit
- Vanity
- Desk/study unit
- Table
- Bar/counter/island
- Console
- Built-in bench
- Open shelving

## Creation flow

Typical built-in:

1. select host wall or draw run;
2. define overall width/height/depth or Fit to Host;
3. create CabinetRun;
4. split into modules;
5. split module compartments;
6. assign fronts/functions;
7. assign materials/hardware;
8. construction/fabrication mode generates parts/outputs.

## Cabinet body parameters

- overall W/H/D;
- board thickness;
- back thickness;
- toe kick/plinth;
- left/right/top fillers;
- base/host relation;
- carcass material;
- front setback/overlay rules.

## Module splitting

Supported rules:

- equal division;
- explicit dimensions;
- ratio distribution;
- fixed standard modules + residual filler;
- min/max width constraints.

Users can drag dividers; engine preserves overall envelope and recalculates adjacent modules.

## Front types

Opening behavior:

- single swing;
- double swing;
- sliding/bypass;
- folding;
- lift-up;
- flap-up/down;
- open/no-front.

Construction/material:

- solid flat;
- shaker;
- raised/decorative panel;
- routed/grooved;
- glass;
- aluminium-frame glass;
- mirror;
- slatted/decorative.

## Drawers

DrawerSet supports:

- count;
- equal/explicit heights;
- face gaps;
- box depth;
- slide/hardware type;
- soft-close/push-open metadata.

## Internal fittings

Examples:

- shelf;
- hanging rail;
- shoe rack;
- pull-out basket;
- pantry pull-out;
- corner basket;
- bottle rack;
- trash bin;
- cutlery tray;
- trouser rack.

Most are catalog assets/parametric accessories attached to compartments.

## Hardware rules

Hardware is assigned semantically, not manually copied geometry by default.

Examples:

- hinge count by front height/weight rule;
- drawer slide pair per drawer;
- lift mechanism compatibility;
- handles/knobs/push-open.

Physical hardware geometry can be LOD/proxy-based.

## Auto Fit / filler

Fit to wall/ceiling can calculate:

- left/right filler;
- top filler;
- stop/wrap around column;
- cabinet around window/opening;
- configurable clearances.

No automatic fit may cover required existing MEP/door/window access without QA warning.

## Kitchen specialization

Kitchen is a preset/rule layer using the same Joinery core.

Supports:

- straight/L/U/galley/island layout;
- base/wall/tall cabinets;
- sink cabinet;
- hob/hood;
- refrigerator/appliance zones;
- countertop/backplash;
- service requirement connectors/checklists.

Countertop:

- thickness;
- overhang;
- material;
- backsplash;
- sink/hob/faucet cutouts.

## Tables / desks / benches

Table/desk generator can define:

- L/W/H;
- top thickness/material;
- leg/base type;
- cabinet/steel/wall-mounted base.

Built-in bench may follow straight/curved supported path and expose seat/back/cushion/base parameters.

## Fabrication mode

Generate semantic part records:

- part ID;
- material/thickness;
- finished/cut dimensions;
- grain direction;
- edge-band requirements by edge;
- quantity;
- machining metadata later.

Fabrication data is owner-domain semantic output; individual physical board solids are optional depending on LOD.

## Board optimization

Later capability uses standard sheet size (e.g. 1220×2440) and part/grain/kerf constraints to estimate sheet count, nesting and waste.

This is not required for basic design mode.

## Commands

- `CreateCabinetRun`
- `FitJoineryToHost`
- `SplitCabinetModule`
- `SplitCompartment`
- `AssignCabinetFront`
- `AddDrawerSet`
- `AssignInternalFitting`
- `AssignHardware`
- `CreateCountertop`
- `CreateTable`
- `CreateBuiltInBench`
- `GenerateJoineryParts`
- `GenerateShopDrawing`

## Hosts/connectors

Hosts:

- wall;
- floor;
- ceiling/top constraint;
- cabinet module/compartment.

MEP requirements exposed as capabilities/connectors:

- sink: cold/hot/waste;
- hood/appliance: electrical;
- TV unit: power/data/TV/LED;
- vanity: water/waste/power where required.

Interior does not create pipe/electrical network privately.

## Phase behavior

Existing built-in can remain/demolish. New unit is New Construction. Replacing existing kitchen uses demolition + new lifecycle.

## Library/catalog

Catalog families:

- cabinet module presets;
- fronts;
- glass/frame systems;
- hardware;
- internal fittings;
- countertops;
- sinks/appliances;
- materials/boards.

`Swap Front Type` can preserve carcass/module identity. `Replace Construction` is required when actual existing construction is removed/rebuilt.

## Quantity / fabrication provider

- board/part list;
- sheets estimate;
- front area/count;
- glass area/pieces;
- edge-band length;
- countertop area/length;
- hardware counts;
- accessories;
- optional board optimization/waste.

## Drawing

- plan;
- front elevations;
- sections;
- module dimensions;
- material/hardware tags;
- shop drawings;
- exploded view;
- cut list;
- hardware schedule.

## QA

- front swing collision with wall/cabinet;
- drawer pull-out collision;
- cabinet overlaps window/door/switch;
- refrigerator/appliance door clearance;
- invalid module residual;
- too-small filler;
- countertop cutout outside top;
- missing service requirement;
- unsupported board dimension/material;
- grain/part larger than available sheet warning.

## Acceptance criteria

- AC-INT-001: create cabinet run fitted between two host points and persist.
- AC-INT-002: split modules with equal/explicit sizes and drag divider without recreating cabinet.
- AC-INT-003: assign swing, drawer, open and glass-front compartments in one cabinet system.
- AC-INT-004: front/hardware swap updates BOQ without changing carcass identity.
- AC-INT-005: sink cabinet exposes Plumbing/Drainage requirements through public connectors/capabilities.
- AC-INT-006: collision with window/switch can be reported by QA.
- AC-INT-007: GenerateJoineryParts produces traceable part IDs, dimensions, grain and edge-band metadata.
- AC-INT-008: Shop Drawing references semantic modules/parts and becomes dirty after relevant cabinet edit.
- AC-INT-009: design mode functions without generating every fabrication board as heavy geometry.

## Deferred

- full CAM/CNC programming;
- hardware drilling patterns for every manufacturer;
- automatic factory-grade nesting until part semantics are stable.