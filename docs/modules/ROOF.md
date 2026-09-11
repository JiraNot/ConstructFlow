# Roof & Envelope Module

Status: Proposed v1  
Module ID: `constructflow.roof`

## Mission

Own roof-system intent, roof coverings and associated envelope elements used heavily in renovation/extension work: metal sheet, tile, polycarbonate, glass, fascia/roof concealment, soffit, flashing, gutters and roof-to-existing junctions.

## Owns

- RoofSystem
- RoofPlane
- RoofCovering
- RoofFramingLayout metadata
- FasciaSystem
- SoffitSystem
- FlashingRun
- CounterFlashing
- DripEdge
- Coping
- Gutter
- RoofJunction

Physical structural members may be owned by Structure when generated through a public structural-member capability.

## Roof forms

- Lean-to
- Gable
- Hip
- Flat / low-slope
- Custom plane/boundary combinations
- Canopy / pergola-cover variants

## Covering systems

- Metal sheet
- Tile
- Polycarbonate
- Laminated/tempered glass roof systems
- Generic custom panel system

Each assembly can define panel dimensions, joint rules, minimum slope, support spacing guidance metadata, flashing/gutter requirements and catalog references.

## Parameters

RoofSystem:

- boundary;
- base/reference level;
- high/low/eave/ridge controls;
- slope or controlling elevations;
- eave/overhang;
- covering assembly;
- concept/construction LOD.

FasciaSystem:

- path/boundary;
- height/projection;
- main/sub-frame assembly;
- board/cladding material/thickness;
- stud spacing;
- top flashing/drip/soffit options.

## Commands

- `GenerateRoof`
- `ModifyRoofBoundary`
- `SetRoofSlope`
- `ChangeRoofSystem`
- `GenerateRoofFrame`
- `AddFasciaSystem`
- `AddSoffitSystem`
- `AddFlashing`
- `CreateRoofJunction`
- `AddGutter`
- `PlanRoofRainwaterCatchment`
- `ConnectDownpipe`

## Roof framing

Roof can calculate framing layout intent:

- main beam references;
- rafters;
- purlins;
- truss/bracing layout.

Where these become structural production members, creation occurs through Structure public commands/capabilities so Structure owns member data/quantities.

## Polycarbonate / glass roofs

Must model construction intent beyond a transparent face:

- panel module/width;
- support/profile system;
- joint/profile/seal metadata;
- slope;
- wall/roof flashing;
- gutter edge;
- optional panel cut/layout.

## Existing-roof junctions

Critical junction types:

- new roof to existing wall;
- new roof under/against existing eave;
- new roof to existing roof plane;
- valley/apron/step/counter flashing;
- polycarbonate/glass to wall;
- roof-to-fascia/roof-concealment.

Junction objects/details must explicitly reference both sides when applicable and retain Existing/New lifecycle context.

## Fascia / roof concealment

A fascia/roof-concealment assembly can include:

```text
finish
smartboard/fiber-cement board
subframe/stud
main steel support reference
flashing/coping
bottom drip/soffit
```

Board layout and frame spacing may be detailed later by LOD.

## Gutter / rainwater

Gutter attaches to compatible roof edge and exposes rainwater outlet connector. Downpipe/network destination belongs to Roof + Drainage connector collaboration.

Before mutating rainwater hardware, `PlanRoofRainwaterCatchment` may calculate a preliminary projected catchment flow and required outlet count from explicit design rainfall, runoff coefficient and per-outlet capacity. For a unique low eave it may suggest evenly spaced outlet ratios; ambiguous/flat conditions require explicit reviewed edge selection. The planner never chooses code rainfall/capacity data and never creates or moves gutters/downpipes.

Hosted gutters keep their semantic edge/outlet ratio through supported roof regeneration. Connected Downpipes are regenerated through the public Drainage rainwater capability while preserving Smart Object and network connection identities.

## Phase behavior

Supports partial demolition/modification of existing eaves/roof edges while existing roof remains. New roof/junction/flashing objects are New Construction.

## Library/catalog

- roof covering assemblies;
- poly/glass profile systems;
- fascia assemblies;
- flashing profiles;
- gutter profiles;
- manufacturer panels/products.

Future catalog metadata may include verified gutter/outlet/downpipe hydraulic capacities. Planning must not invent a capacity when no verified project/catalog value exists.

## Quantity

Roof provider can produce:

- net/gross roof covering area;
- panel counts/cut lengths where layout defined;
- fascia/soffit area;
- flashing/coping/gutter length;
- downpipe length where owned/linked;
- frame-layout intent quantities only where Roof owns those elements.

## Drawing

- roof plan;
- slope/elevation arrows;
- roof-framing layout references;
- fascia elevations/sections;
- soffit detail;
- roof junction/flashing details;
- gutter/downpipe plan/elevation references.

### Plan representation foundation

`roof.system` and `roof.gutter` expose on-demand semantic `plan` representations through the shared Representation Registry. The provider reads `RoofDefinition` and `GutterDefinition`, not raw SketchUp faces/edges.

Profiles are scale/LOD aware:

- **Simple** — roof boundary/form and gutter path/outlet;
- **Construction** — adds roof slope, covering system and gutter profile;
- **Coordination** — adds low elevation, generated-from traceability, roof host and rainwater outlet connector references.

The slope direction is a renderer-neutral arrow derived from semantic slope direction. Gutter geometry follows the referenced semantic roof edge and outlet ratio so plan output remains tied to the same Smart Objects.

## QA

- invalid/zero slope;
- covering below configured minimum slope warning;
- unsupported/disconnected roof plane;
- missing flashing at configured existing-wall junction;
- gutter without outlet;
- rainwater outlet without destination;
- rainwater plan missing verified rainfall/capacity inputs before final construction sizing;
- fascia/frame geometry conflict;
- panel/support spacing outside assembly rule metadata;
- missing host edge after roof regeneration.

## Acceptance criteria

- AC-ROOF-001: generate lean-to roof from arbitrary supported boundary and control height/slope.
- AC-ROOF-002: resize roof boundary and regenerate covering/frame-layout metadata without recreating roof identity.
- AC-ROOF-003: Poly roof carries panel/joint/support/flashing metadata, not only transparent geometry.
- AC-ROOF-004: fascia assembly follows roof edge and updates quantity after edge length change.
- AC-ROOF-005: gutter exposes rainwater connector and can connect to Drainage without hard module call.
- AC-ROOF-006: existing-wall junction can generate/suggest compatible flashing detail.
- AC-ROOF-007: changing roof system marks related quantities/drawings/QA dirty.
- AC-ROOF-008: partial existing eave demolition can coexist with remaining existing roof lifecycle.
- AC-ROOF-009: RoofSystem and Gutter expose deterministic on-demand plan representations from semantic definitions with Simple/Construction/Coordination profiles, including slope direction and rainwater outlet traceability.
- AC-ROOF-010: preliminary rainwater planning uses semantic roof plan area plus explicit rainfall/runoff/outlet-capacity inputs and does not mutate the model.
- AC-ROOF-011: ambiguous low-eave conditions require explicit edge selection rather than an arbitrary automatic outlet edge.
