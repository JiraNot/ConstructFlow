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

## Phase behavior

Supports partial demolition/modification of existing eaves/roof edges while existing roof remains. New roof/junction/flashing objects are New Construction.

## Library/catalog

- roof covering assemblies;
- poly/glass profile systems;
- fascia assemblies;
- flashing profiles;
- gutter profiles;
- manufacturer panels/products.

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

`roof.system` exposes an on-demand semantic `plan` representation through the shared Representation Registry. Roof owns the semantic boundary, slope direction, covering system and generation traceability; Drawing owns scenes/sheets and native output.

Profiles:

- Simple: roof boundary and roof-form tag;
- Construction: adds slope direction arrow, slope percentage and covering system;
- Coordination: additionally exposes `generated_from_id` where available.

The representation comes from the same Roof Smart Object. It does not create a second 2D roof model. Gutter plan geometry remains a later slice because the gutter definition references a hosted roof edge and must resolve that host through an explicit public relationship/capability rather than infer geometry from raw entities.

## QA

- invalid/zero slope;
- covering below configured minimum slope warning;
- unsupported/disconnected roof plane;
- missing flashing at configured existing-wall junction;
- gutter without outlet;
- rainwater outlet without destination;
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
- AC-ROOF-009: RoofSystem exposes a scale/LOD-aware plan representation with boundary, slope intent and generation traceability without duplicating semantic model data.