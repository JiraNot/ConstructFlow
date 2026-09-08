# Electrical Module

Status: Proposed v1  
Module ID: `constructflow.electrical`

## Mission

Own residential/light-commercial electrical design semantics required for PLAN66-style renovation and extension workflows: lighting, switches, outlets, dedicated appliance points, logical controls/circuits and documentation.

## Owns

- Luminaire
- LightingGroup
- Switch
- Outlet
- DedicatedOutlet
- DataPoint
- TVPoint
- ElectricalCircuit
- ElectricalControlRelation
- ElectricalPanelReference (later detail)

## Dependencies

Required:

- Core.

Optional capabilities:

- Architecture ceiling/wall hosts;
- Interior appliance/LED/TV requirements;
- Landscape light hosts;
- Library/catalog;
- Drawing/Quantity/QA.

## Fixture families

Lighting:

- downlight;
- spotlight;
- pendant;
- wall light;
- strip LED;
- outdoor light;
- garden light;
- step light.

Power/data:

- general outlet;
- double outlet;
- weatherproof outlet;
- refrigerator;
- microwave/oven;
- hood;
- washing machine;
- pump;
- water heater;
- TV/data points.

## Logical vs physical model

Foundation scope prioritizes logical relationships:

`Switch → controls → L01-L06`

and

`Outlet → assigned circuit`

Physical conduit/cable geometry is optional advanced LOD and not required for electrical plans.

## Commands

- `PlaceElectricalFixture`
- `ArrayLighting`
- `PlaceSwitch`
- `ConnectSwitchControl`
- `PlaceOutlet`
- `AssignElectricalCircuit`
- `CreateLightingGroup`
- `SwapElectricalFixtureType`

## Hosts

- downlight → ceiling.host_surface;
- wall light/switch/outlet → wall.host_surface;
- garden light → landscape/surface placement capability;
- strip LED → Interior/Decorative compatible host path.

## Parameters

Luminaire can include:

- type/catalog;
- wattage;
- CCT;
- mounting type;
- circuit;
- control group;
- phase;
- symbol/LOD.

Outlet:

- outlet type;
- mounting height/level;
- circuit;
- weatherproof/dedicated flags;
- appliance association.

## Room-driven requirements

Architecture RoomProgram or Interior assemblies can expose requirements such as:

```text
Kitchen
- refrigerator outlet
- hood outlet
- counter outlets
- lighting
```

Electrical may show checklist/propose placement; it owns actual Electrical objects.

## Phase behavior

Existing fixture/outlet may remain/demolish/replace. Replacement should create demolition/new history when representing construction work.

## Library/catalog

Assets should support:

- 2D plan symbol;
- lightweight 3D fixture;
- high-detail presentation model optional;
- wattage/CCT/product/SKU;
- host type;
- quantity/cost metadata.

## Quantity

- fixture counts by type;
- switch/outlet counts;
- circuit/device schedules;
- conduit/cable quantities only when explicit routing capability exists.

## Drawing

- lighting plan;
- power/outlet plan;
- control relation lines/symbols;
- device legend;
- electrical fixture schedule;
- optional circuit/load schedule in advanced phase.

## QA

- required fixture unhosted;
- switch controls no loads;
- light/control relationship invalid;
- required room/appliance outlet missing;
- outlet conflicts with cabinet/opening where geometry known;
- downlight conflicts with beam/ceiling obstruction through QA coordination;
- device missing circuit when project rules require it.

## Acceptance criteria

- AC-ELEC-001: place hosted downlight and persist host/level relationship.
- AC-ELEC-002: array selected light layout without creating duplicate semantic IDs.
- AC-ELEC-003: one switch can control multiple lights through logical relation without wire geometry.
- AC-ELEC-004: electrical plan/schedule update after fixture type/count change.
- AC-ELEC-005: Interior requirement can be checked without Interior directly creating Electrical private objects.
- AC-ELEC-006: existing outlet replacement preserves demolition/new lifecycle.