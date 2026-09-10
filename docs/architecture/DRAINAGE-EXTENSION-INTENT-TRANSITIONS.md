# Drainage Extension Intent Transitions

Status: Accepted v1 foundation contract

## Purpose

Define the destructive and connectivity-changing transitions for the generated Drainage route owned by `GenerateOrUpdateDrainageFromExtension`.

This contract exists because omission, disable and reconnect are different user intents. ConstructFlow must never infer route deletion or endpoint replacement from missing data.

## Source and scope

The transition applies only to the Drainage Smart Object that is:

- type `drainage.pipe_route`;
- owned by `constructflow.drainage`;
- related to one `extension.zone` through `generated_from`;
- identified by the stable Extension slot `primary_route`.

It does not authorize deletion or reconnect of unrelated/manual Drainage routes.

## Intent states

### 1. Omitted or unresolved endpoints

If `enabled` is not explicitly `false` and either `start_connector_id` or `end_connector_id` is missing:

- no new route is invented;
- an existing generated `primary_route` is preserved unchanged;
- the bridge returns a visible review warning;
- omission is never interpreted as delete or reconnect.

This supports legacy projects and partial construction intent safely.

### 2. Explicit disable

The destructive disable signal is exactly:

```yaml
domains:
  drainage:
    enabled: false
```

When no generated `primary_route` exists, the operation is an idempotent no-op.

When a generated route exists, the Drainage bridge must:

1. resolve the route's semantic connection;
2. disconnect the ConnectorRegistry connection when present;
3. erase the generated new-work Smart Object through `SmartObjectManager#erase!`;
4. return its ID in `removed_object_ids`;
5. emit topology, geometry, quantity and drawing invalidation events.

This is source-intent reconciliation of generated new work, **not demolition**. Existing/as-built/issued lifecycle history requires separate construction lifecycle commands.

### 3. Same endpoint regeneration

When persisted or run intent supplies the same start/end connector IDs as the current generated route, normal regeneration may update route geometry, slope/invert inputs, diameter, material, routing mode and other supported parameters while preserving the route Smart Object identity.

### 4. Endpoint change

Supplying different endpoint IDs without an explicit reconnect signal is rejected.

The v1 explicit reconnect signal is:

```yaml
domains:
  drainage:
    start_connector_id: <new-start>
    end_connector_id: <new-end>
    reconnect: true
```

`reconnect: true` is permission for a connectivity transition only when endpoint identity actually differs. If the endpoints already match, normal regeneration semantics apply.

An explicit reconnect must:

1. validate the new connector IDs before mutation;
2. plan and validate the replacement semantic route;
3. preserve the generated Drainage Smart Object ID;
4. preserve the existing connection ID where a recoverable connection exists;
5. rebuild the ConnectorRegistry connection for the new endpoints/system;
6. replace `connects_to` endpoint relationships so they reference the current endpoint owners;
7. regenerate route geometry and persist the updated `PipeRouteDefinition`;
8. invalidate quantity/drawing output and emit Drainage topology/change events.

If the existing generated route has no recoverable semantic connection, reconnect is rejected and the network must be repaired rather than silently fabricating a second connection.

## Persistence

`enabled`, connector IDs and `reconnect` are ordinary fields inside Extension Construction Intent's `drainage` domain config. Per-run overrides still follow the normal precedence rule and do not silently mutate persisted intent.

Keeping `reconnect: true` in persisted intent does not cause repeated destructive work: after a successful reconnect, later runs with the same endpoints use ordinary same-endpoint regeneration.

## Safety invariants

- Missing endpoint fields never delete a route.
- Different endpoint fields never reconnect a route unless reconnect permission is explicit.
- `enabled: false` affects only the generated route for the selected Extension.
- Disable disconnects semantic network state before erasing generated geometry.
- Reconnect preserves route identity instead of creating a duplicate generated route.
- Connection metadata continues to identify the same route Smart Object.
- Domain mutation remains inside the Drainage-owned command boundary.
- Quantity and drawing currentness must be recalculated after disable/reconnect.

## Acceptance criteria

- AC-DET-001: omitted endpoints preserve an existing generated `primary_route` and return a review state rather than deleting it.
- AC-DET-002: `enabled: false` disconnects and removes only the selected Extension's generated route and reports the removed ID.
- AC-DET-003: explicit disable is idempotent when no generated route exists.
- AC-DET-004: changing endpoint identity without `reconnect: true` is rejected before ConnectorRegistry mutation.
- AC-DET-005: explicit reconnect preserves the route Smart Object ID and semantic connection ID while replacing endpoint identity.
- AC-DET-006: explicit reconnect updates `connects_to` relationships to current endpoint owners and dirties quantity/drawing output.
- AC-DET-007: missing/unrecoverable semantic connection blocks reconnect instead of fabricating a duplicate network connection.
