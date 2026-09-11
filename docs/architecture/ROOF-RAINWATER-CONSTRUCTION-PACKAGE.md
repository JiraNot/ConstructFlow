# Roof Rainwater Construction Package Integration

Status: Accepted v1 foundation contract  
Owners: `constructflow.roof`, `constructflow.drainage`, `constructflow.extension`

## Purpose

Close the package-level path from a reviewed/applied Roof rainwater plan to Extension BOQ, Roof/Plumbing drawings, QA and publication currentness without duplicating semantic data or allowing Extension to mutate Roof/Drainage state.

The package path is:

`Extension → generated Roof → reviewed catchment plan → applied Gutter/Outlets → explicit Downpipes → BOQ + R/P drawings → strict QA → current package → LayOut/PDF`

## Extension provenance

When `ApplyRoofRainwaterCatchmentPlan` creates a gutter whose host Roof is generated from an `extension.zone`, that gutter receives the same Extension `generated_from` provenance:

- kind: `generated_from`;
- role: `extension_source`;
- target: Extension Smart Object ID;
- semantic slot: `rainwater_gutter`.

This relation is package scope/provenance only. Roof retains ownership of the gutter, its definition, geometry and outlet connectors.

Drainage Downpipes created by `ConnectDownpipe` continue to receive Extension provenance from their generated host Roof through the existing Roof→Drainage command boundary.

## Quantity package

A related `roof.gutter` is an ordinary Roof quantity object. `ConstructionTakeoff` must call `RoofQuantityProvider#gutter_quantities` with the current Roof host and `roof.edge_host` geometry semantics.

Extension does not recompute gutter length. The quantity classification remains:

`roof.gutter.length`

Connected `drainage.downpipe` quantities continue to come from `DrainageQuantityProvider`.

## Drawing package

The R-series Roof plan must include the related gutter and every active semantic `roof.gutter_outlet` connector.

One full-edge gutter is rendered once. Each active outlet is rendered as a distinct outlet symbol derived from ConnectorRegistry state and its semantic `outlet_ratio`. Disabled/retired outlets are excluded.

The existing primary `GutterDefinition.outlet_connector_id` remains backward compatible, but drawing output must not hide additional plan-managed outlets.

The P-series Plumbing/Drainage plan continues to render Drainage-owned Downpipes. No second rainwater drawing model is introduced.

## Construction QA

An applied rainwater plan is explicit construction intent. Once application evidence exists on an Extension-scoped gutter, Strict Construction QA requires every active outlet in that evidence to resolve to an explicit semantic Downpipe connection.

For each expected outlet, QA verifies:

1. the connector exists;
2. it belongs to the expected gutter;
3. its type is `roof.gutter_outlet`;
4. it is active, not retired/disabled;
5. it has an active `drainage.rainwater` connection with `route_kind=downpipe`;
6. that connection references an existing `drainage.downpipe` Smart Object;
7. that Downpipe belongs to the current Extension package scope.

Strict mode treats an unconnected applied outlet as an error. Non-strict working/design QA may expose it as a warning.

Missing connector evidence, missing semantic Downpipe objects or foreign/out-of-scope Downpipes are errors because the package would otherwise claim current construction documentation with broken topology.

QA does not infer a destination, add a Downpipe or reconnect anything.

## Currentness and settlement

Because Gutter and Downpipe objects are part of Extension `generated_from` scope:

- their quantity coverage participates in output settlement;
- their Roof/Plumbing representation IDs participate in drawing settlement;
- changes to membership or semantic identities affect the package currentness fingerprint;
- stale pre-change takeoff/drawing evidence cannot authorize publication after Roof/rainwater changes.

## Safety rules

- Extension owns orchestration/package scope only.
- Roof owns Gutter geometry and outlet connectors.
- Drainage owns Downpipe geometry/topology.
- Core owns connector/connection identity.
- An applied plan does not imply a downstream connection until `ConnectDownpipe` succeeds.
- Multiple outlet connectors do not create duplicate full-edge gutter objects.
- QA observes semantic topology; it never repairs it silently.
- Rainfall/capacity evidence remains preliminary/verified according to its source and is not converted into a legal compliance certificate by package inclusion.

## Acceptance criteria

- AC-RWP-001: a gutter applied to an Extension-generated Roof receives Extension `generated_from` provenance without changing ownership.
- AC-RWP-002: the related gutter contributes `roof.gutter.length` to `ConstructionTakeoff` through the Roof quantity provider.
- AC-RWP-003: Roof construction representation renders every active plan-managed gutter outlet and excludes retired outlets.
- AC-RWP-004: the Roof construction drawing family scopes the related Gutter together with its generated Roof.
- AC-RWP-005: Strict Construction QA blocks publication when any applied outlet lacks an explicit semantic Downpipe connection.
- AC-RWP-006: QA blocks a connection whose referenced Downpipe Smart Object is missing.
- AC-RWP-007: QA blocks a connected Downpipe that is not part of the current Extension scope.
- AC-RWP-008: when all applied outlets resolve to current Extension-scoped Downpipes, rainwater package QA adds no blocking issue.
- AC-RWP-009: Gutter/Downpipe quantity and drawing IDs participate in existing settlement/currentness contracts rather than a rainwater-specific duplicate cache.
