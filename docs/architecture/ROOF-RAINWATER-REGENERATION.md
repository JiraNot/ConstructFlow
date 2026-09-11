# Roof Rainwater Regeneration Contract

Status: Accepted v1 foundation contract  
Owners: `constructflow.roof` + `constructflow.drainage`

## Purpose

Keep a hosted gutter outlet and any connected semantic downpipe current when its host `roof.system` changes, without changing Smart Object/connector/topology identity and without allowing Roof to mutate Drainage private geometry.

This contract extends the Roof Rainwater Downpipe contract with deterministic change propagation.

## Ownership

- Roof owns roof geometry, hosted gutter geometry, gutter edge/index intent, outlet ratio and outlet connector position.
- Drainage owns `drainage.downpipe`, its route geometry, definition, quantity and topology connection.
- Core `ConnectorRegistry` owns the stable connector and connection identities.
- Roof may request Drainage regeneration only through the public `drainage.rainwater_downpipe` capability.

## Regeneration chain

A supported Roof mutation (`ModifyRoofBoundary`, `SetRoofSlope`, or `ChangeRoofSystem`) executes this convergence chain inside the existing Roof command transaction:

`Roof definition/geometry → hosted gutter geometry → stable outlet connector position → connected Downpipe route → quantity/drawing dirty outputs`

A failure anywhere in this chain fails the owning Roof command instead of leaving a partially updated hosted rainwater system.

## Stable identity

Regeneration must preserve:

- `roof.gutter` Smart Object ID;
- persisted `GutterDefinition.outlet_connector_id`;
- connected `drainage.downpipe` Smart Object ID;
- persisted Drainage network connection ID;
- explicit downstream destination connector ID.

Regeneration updates semantic definitions and geometry in place. It must not create a duplicate gutter, connector, downpipe or network connection merely because the Roof moved.

## Gutter host behavior

A gutter remains hosted by its persisted `roof_object_id` + `edge_index`. Its outlet remains at `outlet_ratio` along the **current** semantic roof edge.

When the Roof changes:

1. Roof rebuilds the gutter from the current host edge;
2. Roof recomputes the current outlet position from `edge_index` + `outlet_ratio`;
3. Core updates the existing outlet connector position in place;
4. if a semantic downpipe is connected, Roof requests Drainage regeneration through capability.

If the persisted edge index no longer exists after topology change, ConstructFlow must reject/rollback the mutation or require an explicit rehost workflow. It must not guess a replacement edge.

## Downpipe endpoint behavior

Drainage regenerates from the current connector positions.

For `route_strategy: direct`:

- regenerate the deterministic direct route from the current gutter outlet to the current destination;
- preserve the existing Downpipe Smart Object and connection identity.

For non-direct/custom route strategies:

- preserve existing interior route control nodes in world coordinates;
- replace only the semantic first/last route nodes with current connector positions;
- reject the update if the resulting semantic route is invalid.

This v1 behavior keeps manual routing intent while ensuring connector-owned endpoints cannot drift away from the actual network topology.

## Dirty propagation

A successful hosted regeneration marks affected gutter/downpipe quantity and drawing outputs dirty. The Roof itself remains dirty through the existing Roof update command.

Later Construction Workflow settlement/currentness must consume the regenerated Smart Object graph; old route coordinates are not current publication evidence.

## Safety

- no automatic gutter rehost;
- no automatic destination change;
- no replacement connection ID;
- no new hydraulic sizing assumption;
- no Roof-owned direct write to Drainage repository/geometry;
- no silent success when a connected downpipe capability is unavailable.

## Acceptance criteria

- AC-RWR-001: changing a Roof boundary/slope/system rebuilds hosted gutter geometry against the current semantic edge.
- AC-RWR-002: the existing gutter outlet connector ID is preserved while its position follows the current `outlet_ratio` on the host edge.
- AC-RWR-003: a connected direct Downpipe regenerates from the moved outlet while preserving Downpipe Smart Object ID and network connection ID.
- AC-RWR-004: a custom Downpipe keeps interior control nodes while semantic endpoints re-anchor to current connector positions.
- AC-RWR-005: a removed/invalid hosted edge fails visibly; ConstructFlow does not guess another edge.
- AC-RWR-006: regeneration crosses Roof→Drainage only through the public rainwater capability.
- AC-RWR-007: regenerated gutter/downpipe outputs are marked quantity/drawing dirty for later package settlement.
- AC-RWR-008: the propagation runs within the existing Roof command transaction so a downstream failure cannot intentionally commit a partial hosted rainwater update.

## Deferred

- explicit gutter rehost command/UI;
- automatic catchment sizing and downpipe count/diameter calculation;
- automatic outlet-position optimisation;
- fitting/elbow fabrication LOD;
- automatic underground rainwater continuation after the destination connector.
