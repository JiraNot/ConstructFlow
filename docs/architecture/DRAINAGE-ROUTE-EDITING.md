# Drainage Route Editing

Status: Accepted v1 foundation contract.

## Purpose

Committed drainage routes remain semantic Smart Objects. Users may adjust intermediate control nodes after generation without replacing the route identity or editing loose SketchUp edges.

## Commands

- `MoveDrainageRouteNode`
- `InsertDrainageRouteNode`
- `RemoveDrainageRouteNode`

All commands operate on `drainage.pipe_route` Smart Object IDs and rebuild geometry from the updated `PipeRouteDefinition`.

## Endpoint rule

Route endpoints are connector-owned. Interactive node editing must not move or remove endpoint nodes. Changing an endpoint is a reconnect/reroute operation through connector/topology commands.

## Manual override rule

Any explicit control-node edit changes `route_strategy` to `manual`. This records that the committed route now contains user-authored routing intent.

## Regrade behavior

When `regrade=true` and both endpoint inverts are known, internal node Z values are interpolated by travelled horizontal length between the fixed endpoint inverts. When either invert is unknown, node Z is preserved and validation remains Verify On Site.

No known endpoint invert may be silently modified to make a route pass.

## Propagation

Successful edits must:

- persist the updated route definition;
- rebuild route geometry;
- preserve Smart Object and connector identity;
- emit `RouteChanged` and `GeometryChanged`;
- mark Quantity and Drawing dirty;
- emit current validation state.

## Acceptance criteria

- AC-DRN-017: moving an internal route control node updates the same Smart Object and marks Quantity/Drawing dirty.
- AC-DRN-018: endpoint nodes cannot be moved or removed through control-node editing commands.
- AC-DRN-019: optional regrade interpolates only internal node elevations between known endpoint inverts and never changes endpoint facts.
- AC-DRN-020: inserting/removing internal control nodes preserves connector and route Smart Object identity.
