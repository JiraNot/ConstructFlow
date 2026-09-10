# Extension Execution v1

Status: implementation contract

## Purpose

Execute an Extension Orchestrator plan without allowing the Extension module to own or mutate another domain's geometry.

## Invariants

- The Orchestrator decides dependency-safe step order.
- The ExecutionRunner dispatches public domain commands only.
- Geometry remains owned by the target domain (`constructflow.structure`, `constructflow.surface`, etc.).
- Each domain command is responsible for idempotent create-or-update behavior.
- SketchUp mutations remain inside the CommandBus transaction boundary.
- A failed dependency blocks only downstream steps that depend on it.
- Independent steps may continue.
- Failed and dependency-blocked domains must not be treated as current.
- Dry-run performs no command dispatch and returns a preview plan.

## Step result

Each executed step returns:

- `domain`
- `geometry_owner`
- `status`: `pending`, `success`, `failed`, or `skipped`
- `command_id`
- `created_object_ids`
- `updated_object_ids`
- `removed_object_ids`
- `warnings`
- `errors`

`skipped` with `dependency_failed` means the domain is intentionally not regenerated because at least one required upstream domain failed.

## Aggregate result

The runner returns:

- `extension_id`
- `status`: `preview`, `success`, `partial`, or `failed`
- `dry_run`
- ordered `steps`
- `dirty_domains`

`dirty_domains` identifies the failed/unsafe suffix of the current run and is intended for later EventBus / drawing / quantity invalidation integration.

## Command resolution

The v1 default convention is:

`GenerateOrUpdate<Domain>FromExtension`

The runner accepts an injected command resolver so domain command naming can evolve without coupling orchestration to concrete implementations.

## Transaction policy

The runner itself does not open SketchUp operations. It delegates each public command to `Core::CommandBus`, which owns the transaction boundary through `Core::TransactionManager`.

This preserves undo safety and keeps execution policy separate from SketchUp geometry implementation.

## Next integration

1. Register real domain extension commands/capabilities incrementally.
2. Add idempotency keys / source extension relationships to created smart objects.
3. Publish execution and dirty-state events.
4. Mark quantity and drawing outputs stale when affected domains fail or regenerate.
5. Add resume/retry from failed nodes.
