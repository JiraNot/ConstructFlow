# Plumbing Module

Status: Proposed v1  
Module ID: `constructflow.plumbing`

## Mission

Own pressurized water-supply semantics and plumbing service requirements for fixtures/appliances. Gravity waste/rainwater topology belongs to Drainage.

## Owns

- WaterPoint
- WaterPipeRoute
- WaterPipeSegment
- Valve
- Pump
- TankConnection
- PlumbingServiceRelation

Plumbing fixtures can be Library assets exposing service connectors rather than owned exclusively by Plumbing.

## Dependencies

Required:

- Core;
- Connector standard.

Optional:

- Architecture hosts;
- Interior fixture/appliance requirements;
- Site utility/meter references;
- Library;
- Drawing/Quantity/QA.

## Connector types

- `plumbing.cold_water`
- `plumbing.hot_water`
- `plumbing.supply`
- `plumbing.valve_port`

Typical fixture requirements:

- Sink → cold/hot optional;
- Basin → cold/hot;
- Shower → cold/hot;
- Toilet cistern → cold;
- Washing machine → cold;
- Dishwasher → cold/hot depending catalog;
- Water heater → supply + electrical requirement handled by Electrical.

## Logical vs physical

Foundation can use route centerlines and sizes. Full pipe/fitting solids are optional detailed LOD.

## Commands

- `ConnectWaterSupply`
- `CreateWaterRoute`
- `EditWaterRoute`
- `PlaceValve`
- `PlacePump`
- `ConnectTank`
- `SwapPipeType`

## Routing

Route supports:

- start/end connectors;
- control nodes;
- diameter/type;
- route strategy;
- level/offset;
- physical fittings optional.

Unlike gravity Drainage, water route does not require continuous falling slope but may have pressure/system constraints in later phases.

## Existing conditions

Existing supply location can be Confirmed/Assumed/Unknown. Unknown hidden routing is not fabricated. New work may connect to a known existing water point or remain Verify On Site.

## Phase behavior

Existing pipe/valve can remain/demolish. Rerouting existing construction creates explicit demolition/new segments where construction history matters.

## Library/catalog

- pipe types/materials;
- valves;
- pumps;
- tanks;
- fixtures with water connectors;
- manufacturer products.

## Quantity

- pipe length by type/diameter;
- valves/pumps/tank connections count;
- fittings only when explicit/rule-generated;
- fixture service counts.

## Drawing

- water supply plan;
- route sizes/IDs;
- valve/pump/tank symbols;
- fixture/service schedule;
- riser/schematic in later phase.

## QA

- required water connector unconnected;
- incompatible pipe/fixture connector;
- route without valid source;
- pipe conflict through coordination;
- existing source marked Unknown but treated as Confirmed;
- missing valve/service rule where project preset requires it.

## Acceptance criteria

- AC-PLB-001: connect a sink cold-water connector to an existing/new water source using semantic route.
- AC-PLB-002: route control nodes can be edited and quantity updates.
- AC-PLB-003: unknown existing route/source remains explicitly uncertain.
- AC-PLB-004: pipe route persists without requiring physical fittings geometry.
- AC-PLB-005: Interior sink/appliance service requirement is satisfied through public connector relationship.
- AC-PLB-006: rerouted existing supply can represent demolition/new segments.