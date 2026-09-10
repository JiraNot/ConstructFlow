# Drainage Module

Status: Proposed v1  
Module ID: `constructflow.drainage`

## Mission

Own gravity waste, soil and rainwater drainage topology, including routes, pipe segments, manholes, floor drains, trench drains, cleanouts and relocation/rerouting workflows for renovation and extension projects.

## Owns

- DrainageNetwork
- DrainagePipeRoute
- PipeSegment
- DrainageJunction
- Manhole
- FloorDrain
- TrenchDrain
- Cleanout
- GreaseTrap
- RainwaterOutletConnection

## Dependencies

Required:

- Core;
- Level/Datum;
- Connector standard.

Optional capabilities:

- Site utility destinations;
- Roof rainwater connector;
- Architecture/Interior fixture requirements;
- Surface drains/slopes;
- Structure geometry for coordination;
- Drawing/Quantity/QA.

## Connector types

- `drainage.waste`
- `drainage.soil`
- `drainage.rainwater`
- `drainage.floor_drain`
- `drainage.manhole_in`
- `drainage.manhole_out`
- `drainage.trench_out`

## Network semantics

Topology is persisted independently from physical pipe solids.

Example:

`Sink → P01 → Junction J01 → P02 → MH02 → P03 → Main Drain`

A user can query what flows to a manhole without generating detailed elbows/tees.

## Pipe route data

- system/type;
- diameter;
- start connector;
- end connector;
- route control nodes;
- start/end invert when known;
- slope derived/explicit;
- material/catalog;
- source confidence;
- phase;
- optional physical fitting layout.

## Manhole data

- size/type;
- cover level;
- invert in/out per connected branch where known;
- depth derived where possible;
- location;
- phase;
- confidence/source;
- connector list.

## Commands

- `ConnectWaste`
- `CreatePipeRoute`
- `EditPipeRoute`
- `PlaceManhole`
- `RelocateManhole`
- `InsertIntermediateManhole`
- `PlaceFloorDrain`
- `PlaceTrenchDrain`
- `ConnectRoofDrainage`
- `ReconnectDrainageNetwork`
- `SwapPipeType`

## Auto route

Routing can propose options:

- shortest;
- along wall;
- external;
- manual/control-point route.

Auto route is a proposal. User can drag route nodes before/after commit subject to validation.

## Gravity validation

When sufficient data exists, calculate/check:

- length;
- invert difference;
- slope;
- direction;
- minimum configured slope warnings;
- impossible target elevation.

Unknown existing invert must remain Unknown/Verify On Site. The system cannot invent a passing slope.

## Relocate Manhole workflow

Relocation of Existing manhole is construction replacement, not a geometry move.

Required behavior:

1. inspect connected network;
2. preview new position;
3. calculate/propose route changes;
4. validate slope/invert where data exists;
5. mark old manhole demolished/abandoned;
6. mark affected old pipe segments demolition if necessary;
7. create new manhole with new stable ID;
8. create/reuse/reconnect new segments explicitly;
9. link `replaces/replaced_by`;
10. emit topology/relocation events;
11. mark quantities/drawings/coordination dirty.

## Intermediate manhole

`InsertIntermediateManhole` splits an existing route semantically, preserves network continuity and recalculates segment invert/slope data.

## Roof drainage

Roof gutter/downpipe connectors can terminate into:

- approved manhole;
- rainwater drain;
- trench/surface drain destination;
- other project-approved rainwater destination.

Sanitary/rainwater compatibility is governed by connector/system rules.

## Surface integration

Surface may declare `drain_to` relation to FloorDrain/TrenchDrain. Moving a drain emits events so Surface recalculates/invalidates slopes.

## LOD

Default:

- centerline/network representation;
- symbols/nodes;
- diameter/invert text.

Detailed LOD optionally creates pipe solids/fittings.

## Phase behavior

Existing network can contain Remain/Demolish/Unknown segments. New routes are New Construction. Reroute operations preserve construction scope.

## Quantity

- pipe length by system/diameter/material;
- manhole/drain counts;
- fittings where explicit/rule-derived;
- grease trap/cleanout counts;
- demolition vs new scope;
- excavation/backfill only when separate defined rule/capability is enabled.

## Drawing

- drainage plan;
- route IDs/diameters;
- flow arrows;
- manhole IDs;
- cover/invert levels;
- floor/trench drain symbols;
- rainwater drainage plan;
- schedule/schematic later.

### Smart Object plan representation

Drainage owns its plan representation through the Core Smart Object Representation System. Drawing/LayOut orchestration consumes this semantic output and must not infer pipe meaning from raw SketchUp edges or solids.

`drainage.pipe_route / plan` provides, at minimum:

- route centerline polyline from semantic route nodes;
- flow direction arrow;
- pipe system and diameter annotation;
- slope annotation when invert data is known;
- explicit `S=? / verify` annotation when invert data is insufficient;
- start/end invert labels when known;
- representation metadata containing view/scale/phase/LOD context and route strategy.

`drainage.manhole / plan` provides, at minimum:

- manhole outline from semantic location and size;
- `MH` plan symbol;
- semantic object tag;
- cover level, inlet invert, outlet invert and depth annotations when known.

Plan representation is `on_demand`. It is derived from the same Smart Object definition used by model geometry; it is not a second independently editable drainage object.

Future drawing styles may change line weights, abbreviations, tag numbering and placement without changing the semantic representation contract.

## QA

- unconnected required waste outlet;
- dead-end network without destination;
- reverse/insufficient slope;
- unknown slope requiring site verification;
- incompatible rainwater/sanitary connector;
- route intersects footing/ground beam/known structural obstruction;
- manhole located under proposed inaccessible built-in/room condition;
- downpipe without approved destination;
- orphaned route after relocation.

## Acceptance criteria

- AC-DRN-001: create semantic pipe route between compatible connectors and persist topology.
- AC-DRN-002: move route node and recalculate length/slope/quantity without requiring physical pipe solids.
- AC-DRN-003: Relocate Existing Manhole produces old demolition + new object + replacement relationship.
- AC-DRN-004: relocation reconnects or explicitly flags every affected branch; no silent lost connection.
- AC-DRN-005: insufficient slope blocks/warns according to configured rule with actionable alternatives.
- AC-DRN-006: unknown invert remains Verify On Site and is not reported as passing slope.
- AC-DRN-007: Insert Intermediate Manhole splits network while preserving topology.
- AC-DRN-008: moving drainage node dirties Surface/Quantity/Drawing through events rather than private mutations.
- AC-DRN-009: structure clash can be reported using public coordination contracts.
- AC-DRN-010: one pipe/manhole Smart Object can produce a semantic plan representation with symbols/annotations without duplicating construction identity; unknown invert is visibly marked for verification.

## Deferred

- full hydraulic simulation;
- municipal drainage-code automation;
- civil-scale stormwater network analysis.