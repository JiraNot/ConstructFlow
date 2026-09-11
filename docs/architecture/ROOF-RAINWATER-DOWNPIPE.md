# Roof Rainwater Downpipe Contract

Status: Accepted v1 foundation contract  
Owners: `constructflow.roof` + `constructflow.drainage`

## Purpose

Define the public cross-domain boundary for Workflow W13: a Roof gutter outlet is connected to an explicit approved rainwater destination without Roof mutating Drainage internals and without treating a vertical downpipe as a horizontal gravity pipe route.

## Ownership

- Roof owns `roof.system`, `roof.gutter`, semantic roof edges and the gutter outlet connector.
- Drainage owns `drainage.downpipe`, the rainwater topology connection, route geometry, quantity and drainage plan representation.
- Core `ConnectorRegistry` owns connector compatibility and persisted network connections.
- Drawing consumes domain representations and does not infer downpipe meaning from raw lines.

The Roof command `ConnectDownpipe` is an orchestration command. It resolves a gutter and delegates creation to the public `drainage.rainwater_downpipe` capability.

## Connector contract

A gutter exposes:

- type: `roof.gutter_outlet`
- role: `outlet`
- semantic position in canonical millimetres
- `gravity: true`

The initial supported destination is `drainage.manhole_in` under system `drainage.rainwater`. The compatibility table may add trench/surface/outfall connector types later without changing the Downpipe Smart Object contract.

A v1 gutter outlet may have at most one active downpipe connection. The destination must be explicit; ConstructFlow must not invent a discharge point.

## Downpipe Smart Object

`drainage.downpipe` stores a `DownpipeDefinition` containing:

- route control nodes in canonical millimetres;
- start gutter connector ID;
- end destination connector ID;
- diameter;
- material;
- route strategy;
- persisted network connection ID.

A downpipe can be entirely vertical. Therefore it deliberately does **not** use `PipeRouteDefinition` horizontal invert/slope validation. Its route must contain at least two non-degenerate points and compatible endpoints.

When explicit route nodes are omitted, the v1 capability creates a deterministic direct rainwater path from the gutter outlet: vertical drop to the destination elevation, followed by a plan leg to the destination when required. This is an editable semantic foundation, not hydraulic sizing or automatic site routing.

## Extension provenance

When the host roof was generated from an Extension Zone, `ConnectDownpipe` propagates that Extension as a `generated_from` relationship onto the created `drainage.downpipe`. This lets the Extension construction package include its rainwater quantity/output without making Extension own Drainage geometry.

## Quantity

Drainage reports:

- classification `drainage.rainwater.downpipe`;
- total routed length in metres;
- diameter/material/route strategy;
- vertical and horizontal length breakdowns;
- normal phase/source traceability.

## Plan representation

`drainage.downpipe / plan` is on-demand and uses the same Smart Object definition.

- Simple: `DP` symbol + diameter.
- Construction: adds material and any visible plan offset path.
- Coordination: adds route strategy and network connection identity.

A purely vertical downpipe remains symbolic in plan. No fake slope annotation is generated.

## QA

Network audit must verify:

- persisted Downpipe definition exists and is valid;
- active topology connection exists;
- definition connection ID matches network topology;
- topology endpoints match the definition;
- known structural route clashes are reported where coordination evidence is available.

Horizontal pipe minimum-slope rules do not apply to `drainage.downpipe`.

## Change propagation

Creation dirties the downpipe quantity/drawing outputs and the source gutter/roof drawing and quantity context.

Later Roof boundary/slope/system changes follow the accepted `ROOF-RAINWATER-REGENERATION.md` contract: Roof rebuilds the hosted gutter, moves the same semantic outlet connector and delegates any connected Downpipe endpoint/geometry regeneration through the Drainage capability. Gutter, connector, Downpipe and network connection identities remain stable unless an explicit rehost/reconnect workflow changes them.

## Acceptance criteria

- AC-RWDP-001: `ConnectDownpipe` connects one semantic gutter outlet to one explicit compatible rainwater destination through a public Drainage capability.
- AC-RWDP-002: a purely vertical downpipe is valid and does not run horizontal gravity-slope validation.
- AC-RWDP-003: downpipe topology persists a connection ID and exact connector endpoints.
- AC-RWDP-004: plan output uses a DP symbol and only shows a plan route when XY movement exists.
- AC-RWDP-005: quantity output reports total, vertical and horizontal lengths with phase/object traceability.
- AC-RWDP-006: Extension-generated roof rainwater can retain Extension provenance without Extension mutating Drainage internals.
- AC-RWDP-007: a gutter outlet with an active downpipe cannot silently receive a second connection.
- AC-RWDP-008: missing or incompatible destination is rejected; no discharge destination is guessed.
- AC-RWDP-009: host Roof changes propagate through the stable gutter outlet/downpipe identities according to `ROOF-RAINWATER-REGENERATION.md`.

## Deferred

- automatic catchment/hydraulic sizing;
- automatic downpipe count/spacing;
- trench/surface/site-outfall destination implementations;
- automatic underground rainwater route continuation;
- manufacturer downpipe fittings/elbows and fabrication LOD.
