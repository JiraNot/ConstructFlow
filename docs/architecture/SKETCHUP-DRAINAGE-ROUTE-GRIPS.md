# SketchUp Drainage Route Grips

Status: Accepted v1 interaction adapter contract.

## Purpose

ConstructFlow exposes semantic Drainage route control nodes as lightweight SketchUp interaction grips. The tool is an adapter over `MoveDrainageRouteNode`; it does not directly mutate route edges or bypass the Command boundary.

## Interaction

1. select exactly one `drainage.pipe_route` Smart Object;
2. activate **Drainage Route Editing → Edit Selected Route Grips**;
3. internal route nodes are drawn as temporary grip points;
4. press/drag an internal grip to a SketchUp InputPoint location;
5. mouse release executes `MoveDrainageRouteNode`;
6. geometry, validation, Quantity and Drawing dirty state update through the existing semantic command.

## Endpoint rule

Start and end nodes are connector-owned and are deliberately not exposed as draggable grips. Endpoint changes belong to connector/reconnect/reroute workflows.

## Regrade

The v1 UI invokes route-node edits with `regrade=true`. If both endpoint inverts are known, the semantic route service interpolates internal Z values between those facts. Unknown invert remains Verify On Site.

## Adapter boundary

- picking uses screen-space proximity to internal semantic route nodes;
- placement uses `Sketchup::InputPoint`;
- the preview grip is transient view drawing;
- committed mutation occurs only through `Runtime.commands.execute`;
- Undo/transaction ownership therefore stays in CommandBus/TransactionManager.

## Acceptance criteria

- AC-DRN-035: an internal semantic route node can be selected through a screen-space grip without exposing connector-owned endpoints.
- AC-DRN-036: releasing a dragged grip executes `MoveDrainageRouteNode` rather than editing SketchUp edges directly.
- AC-DRN-037: the interactive adapter preserves the same Smart Object identity and downstream Quantity/Drawing invalidation behavior as command-based edits.
