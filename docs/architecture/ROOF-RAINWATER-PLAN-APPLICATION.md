# Roof Rainwater Plan Application

Status: Accepted v1 foundation contract  
Owner: `constructflow.roof`

## Purpose

Define the explicit mutation boundary that turns a reviewed `PlanRoofRainwaterCatchment` result into Roof-owned gutter/outlet state without allowing a non-mutating planning result to change construction geometry implicitly.

Planning and application are intentionally separate:

`Roof → PlanRoofRainwaterCatchment → review → ApplyRoofRainwaterCatchmentPlan → ConnectDownpipe`

The application command does not choose rainfall intensity, runoff coefficient, outlet capacity, gutter profile or destination network on behalf of the user.

## Public command

`ApplyRoofRainwaterCatchmentPlan`

Required inputs:

- a compatible Roof Smart Object;
- the same explicit hydraulic inputs accepted by `PlanRoofRainwaterCatchment`;
- `confirm_apply: true`;
- a gutter `profile_id`, unless the selected verified capacity catalog evidence supplies a `gutter_profile_id` hint.

Optional inputs:

- `gutter_object_id` when multiple gutters make target selection ambiguous;
- `rehost_gutter: true` to deliberately move an explicitly selected gutter to the reviewed edge;
- `display_name` and source-state metadata.

The command recomputes the plan against the current `RoofDefinition`. It does not accept stale client-provided outlet coordinates as authoritative.

Application is rejected unless the recomputed plan status is `ready_for_review` and contains a resolved semantic Roof edge plus at least one outlet ratio.

## Gutter and outlet identity

One reviewed receiving edge corresponds to one Roof-owned gutter selected or created by the command.

A gutter can own multiple Core connectors of type:

`roof.gutter_outlet`

Each plan-managed outlet connector stores:

- `roof_object_id`;
- deterministic `outlet_index`;
- semantic `outlet_ratio` along the hosted edge;
- `rainwater_plan_managed: true`;
- gravity intent.

The existing singular `GutterDefinition.outlet_connector_id` and `outlet_ratio` remain the primary/backward-compatible outlet reference. Additional outlets live in the Core ConnectorRegistry, not in duplicated gutter geometry or duplicated Gutter Smart Objects.

Reapplying an equivalent plan preserves the gutter Smart Object and existing outlet connector identities by outlet index.

Increasing required outlet count adds connectors. Decreasing count may disable only surplus **unconnected** plan-managed outlets. A connected outlet is never retired automatically; application is rejected until its downstream connection is explicitly disconnected or reconfigured.

Disabled retired connectors remain model-local traceability records and are excluded from active hosted regeneration.

## Hosted regeneration

Roof boundary/slope/system regeneration must update every active gutter outlet connector from its persisted outlet ratio, not only the legacy primary connector.

For each moved connected outlet, Roof delegates Downpipe regeneration through the public `drainage.rainwater_downpipe` capability. Roof does not mutate Drainage geometry directly.

If a moved active outlet has a semantic Downpipe connection and the Drainage capability is unavailable, application/regeneration fails visibly instead of leaving stale topology.

## Downpipe connection

`ConnectDownpipe` accepts optional `outlet_connector_id`.

When omitted, the primary `GutterDefinition.outlet_connector_id` remains the compatibility default. When supplied, the connector must:

- belong to the selected gutter;
- be type `roof.gutter_outlet`;
- not be disabled.

This permits multiple semantic downpipes from one physical gutter without creating duplicate gutter objects.

## Profile and capacity evidence

Manual hydraulic capacity does not imply a gutter profile. Manual planning therefore requires explicit `profile_id` at application.

A verified Library `roof.rainwater_capacity` asset may provide `gutter_profile_id`; the application command may use that hint when no explicit profile is supplied.

The gutter entity stores application evidence under:

- dictionary: `constructflow.roof`;
- key: `rainwater_plan_application`.

Evidence includes:

- plan/application format;
- current Roof and Gutter IDs;
- semantic edge index;
- applied profile ID;
- active outlet ratios and connector IDs;
- exact capacity-source evidence;
- rainfall/runoff/peak-flow inputs/results;
- deterministic SHA-256 plan fingerprint.

This evidence is traceability only. It is not a code-compliance certificate and does not override later dirty state or semantic changes.

## Safety rules

- Planning never mutates hardware.
- Application requires explicit confirmation.
- Application recomputes against the current Roof semantic definition.
- No arbitrary edge is chosen when planning is unresolved.
- No hidden generic gutter profile is selected by the application command.
- Connected surplus outlets are not deleted/disabled automatically.
- Downpipe destinations are never invented by Roof.
- Outlet layout is not final hydraulic sizing or a legal/code compliance claim.
- One gutter with multiple outlet connectors is preferred over duplicate full-edge gutter geometry.

## Acceptance criteria

- AC-RWA-001: a reviewed two-outlet plan creates one gutter and two distinct `roof.gutter_outlet` connectors at the suggested ratios.
- AC-RWA-002: reapplying the same plan preserves gutter and outlet connector identities.
- AC-RWA-003: increasing outlet count adds only the missing connectors.
- AC-RWA-004: decreasing outlet count disables surplus unconnected plan-managed outlets while preserving active connector identities.
- AC-RWA-005: application rejects retirement of a connected surplus outlet.
- AC-RWA-006: Roof regeneration moves every active planned outlet using its semantic ratio and refreshes connected Downpipes through the Drainage capability.
- AC-RWA-007: `ConnectDownpipe` can target a non-primary outlet only when that connector belongs to the selected gutter and is active.
- AC-RWA-008: application requires `confirm_apply: true`.
- AC-RWA-009: manual-capacity application requires explicit gutter profile evidence; verified catalog profile hints may satisfy that requirement.
- AC-RWA-010: application evidence persists on the gutter with deterministic hydraulic/layout fingerprint and capacity-source traceability.

## Deferred

- automatic connection of planned outlets to destination networks;
- destructive retirement/removal of connected outlet/downpipe branches;
- full gutter cross-section hydraulic sizing;
- valley/multi-basin catchment splitting;
- elbows/fittings/fabrication LOD;
- code/jurisdiction rainfall datasets and formal compliance reporting.
