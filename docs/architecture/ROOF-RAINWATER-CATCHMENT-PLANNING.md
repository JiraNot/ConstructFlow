# Roof Rainwater Catchment Planning

Status: Accepted v1 foundation contract  
Owner: `constructflow.roof`

## Purpose

Provide a deterministic, non-mutating preliminary rainwater planning calculation before gutters/downpipes are generated or connected.

The planner answers three questions from explicit project inputs:

1. what horizontal roof catchment area contributes rainfall;
2. what preliminary peak runoff flow follows from the supplied design rainfall and runoff coefficient;
3. how many outlets are required for the supplied per-outlet capacity, and where they may be evenly distributed on a resolved low-eave edge.

It does **not** choose local design rainfall, legal/code values, gutter profile capacity, downpipe diameter, manufacturer capacity or a final drainage design.

## Command

`PlanRoofRainwaterCatchment`

The command is non-mutating (`transaction: false`). It emits `RoofRainwaterCatchmentPlanned` with the complete planning evidence.

Required project inputs:

- `roof_object_id` or compatible Roof entity;
- `design_rainfall_mm_per_hr`;
- `runoff_coefficient` greater than 0 and at most 1;
- exactly one outlet-capacity source:
  - `outlet_capacity_lps` as explicit user/manual planning input; or
  - `capacity_asset_id` plus optional `capacity_asset_version` referencing a verified `roof.rainwater_capacity` Library asset.

Optional:

- `edge_index` when the intended receiving eave/edge is already known.

Supplying both capacity modes is rejected. Missing hydraulic/design inputs are rejected rather than silently replaced with defaults.

The Library-backed mode is governed by `ROOF-RAINWATER-CAPACITY-CATALOG.md`. A catalog asset must contain verified hydraulic evidence and a basis reference; catalog existence alone does not make a capacity acceptable.

## Calculation

Catchment area uses the horizontal plan projection of the semantic `RoofDefinition`:

`catchment_area_m2 = plan_area_mm2 / 1,000,000`

Preliminary peak runoff uses the explicit Rational-method unit conversion:

`peak_flow_lps = rainfall_mm_per_hr * catchment_area_m2 * runoff_coefficient / 3600`

because 1 mm over 1 m² equals 1 litre.

Required outlet count is:

`ceil(peak_flow_lps / outlet_capacity_lps)`

with a minimum of one outlet for a valid positive-area roof.

The formula version and capacity-source evidence are carried in the returned plan. The result is not a claim of code compliance.

## Capacity-source evidence

Manual capacity produces:

```yaml
capacity_source:
  kind: manual_input
  verification_status: user_supplied
  outlet_capacity_lps: ...
```

A verified Library profile produces versioned evidence including asset ID/version, capacity, basis ref and optional manufacturer/product/diameter/gutter profile hints.

A plan resolved against a specific catalog version remains traceable to that version even if a newer version later exists.

## Edge resolution

When `edge_index` is explicit, the planner uses it after validating the semantic Roof boundary index.

Without an explicit edge:

- a unique semantic edge whose two sloped endpoints are at the minimum Roof elevation may be suggested as the low eave;
- if zero or multiple low edges are resolved, the plan returns `needs_edge_selection` and no outlet ratios;
- flat roofs therefore normally require an explicit reviewed edge/drain strategy instead of an arbitrary automatic choice.

For a resolved edge, multiple outlets are suggested at equal interior ratios:

- 1 outlet → `0.5`;
- 2 outlets → `1/3`, `2/3`;
- N outlets → `i/(N+1)`.

These are layout suggestions only. Creating/moving gutters, connectors or downpipes remains an explicit later command.

## Safety and ownership

- Roof owns catchment geometry and this planning calculation.
- Library owns versioned catalog asset storage/search.
- Roof consumes catalog capacity only through the public `library.catalog` capability.
- Drainage continues to own downpipe geometry/topology.
- Core ConnectorRegistry continues to own connector/connection identity.
- The planner never writes Roof/Gutter/Drainage definitions.
- The planner never creates connectors or downpipes.
- The planner never infers a destination network.
- The planner never chooses a design rainfall intensity or unregistered outlet hydraulic capacity.
- A non-low explicit edge is accepted as deliberate intent but is returned with a review warning.

## Relationship to generation

The safe workflow is:

`Roof Smart Object → explicit rainfall/runoff/capacity evidence → PlanRoofRainwaterCatchment → human/company/code review → AddGutter / outlet placement → ConnectDownpipe → Roof rainwater regeneration`

Future automation may consume the plan through the same public command surface, but automatic construction-object mutation requires a separate explicit command/confirmation contract.

## Acceptance criteria

- AC-RWC-001: a 24 m² roof at 150 mm/h and coefficient 1.0 reports 1.0 L/s preliminary peak runoff.
- AC-RWC-002: outlet count is derived only from an explicitly supplied manual capacity or verified versioned Library capacity profile.
- AC-RWC-003: a lean-to roof with one unique low eave can suggest that edge deterministically.
- AC-RWC-004: ambiguous/flat low edges require explicit selection rather than arbitrary choice.
- AC-RWC-005: suggested outlet ratios are deterministic and evenly distributed inside the selected edge.
- AC-RWC-006: missing/non-positive rainfall or capacity and invalid runoff coefficients are rejected.
- AC-RWC-007: the planning command mutates no Smart Object, connector, geometry or topology state.
- AC-RWC-008: the result visibly warns that local rainfall, code and manufacturer capacity require verification before construction issue.
- AC-RWC-009: when a capacity catalog asset is used, its exact asset ID/version and hydraulic basis evidence are returned in the plan.
- AC-RWC-010: conflicting manual and catalog capacity inputs are rejected rather than resolved by hidden precedence.

## Deferred

- code/jurisdiction rainfall datasets;
- full hydraulic gutter/downpipe profile sizing;
- multiple catchment sub-basins/valleys;
- automatic creation/repositioning of gutters/outlets;
- fitting/elbow fabrication LOD;
- underground continuation sizing.
