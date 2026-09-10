# Extension Dirty Propagation v1

Status: Implemented slice.

## Purpose

Extension execution failures must invalidate only the failed domain and transitive dependents in the orchestration graph. Later domains that are independent of the failure remain clean.

## Rules

- A domain whose command returns `failed` is a dirty root.
- Dirty state propagates through declared `dependencies` only.
- A `dependency_failed` skipped step is dirty only when reachable from a failed root.
- Independent successful steps remain clean even when they appear later in execution order.
- Dry-run execution never reports dirty domains.
- Output order follows the orchestration step order for deterministic diagnostics.

## Required branch behavior

- structure failure → structure, surface, roof, drainage, interior, electrical.
- surface failure → surface, drainage, interior, electrical; roof remains clean.
- roof failure → roof, drainage only.
- interior failure → interior, electrical only.

This replaces the previous suffix heuristic that treated every later step as dirty after the first failure.
