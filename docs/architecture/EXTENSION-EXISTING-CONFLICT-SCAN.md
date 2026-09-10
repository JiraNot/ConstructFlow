# Extension Existing Construction Conflict Scan

Status: Accepted v1 foundation contract.

## Purpose

W06 requires ConstructFlow to detect existing construction that conflicts with a proposed Extension footprint before the package is treated as construction-ready.

This contract defines a semantic, non-destructive conflict scan. Detection does not itself demolish, relocate, reroute or redesign any object.

## Scope

The v1 scanner checks Existing-to-Remain Smart Objects whose semantic construction footprint intersects the current `extension.zone` footprint:

- `structure.column`;
- `structure.foundation`;
- `drainage.manhole`;
- `drainage.pipe_route`.

Later releases may add walls, utility services, site objects and other disciplines through explicit domain-owned coordination capabilities.

## Source-of-truth rule

Conflict detection consumes persisted Smart Object definitions from the owning domain. It must not rediscover construction meaning from anonymous SketchUp edges/faces.

Examples:

- Structure columns/foundations expose semantic bounding boxes from their definitions;
- Drainage manholes use semantic location and size;
- Drainage pipe routes use semantic route nodes.

A supported Existing Smart Object with a missing/unreadable semantic definition is a visible verification conflict, not a silently skipped object.

## Lifecycle rule

This scanner asks one specific question: **what existing construction is still present in the Proposed state and overlaps the Extension footprint?**

Therefore:

- `created_phase = existing` and no `removed_phase` is checked;
- Existing objects already marked for Demolition are not reported as unresolved Proposed conflicts;
- New Construction objects are outside the scope of this Existing-condition scan and remain subject to normal domain coordination/QA;
- objects generated from the selected Extension are excluded.

No lifecycle state is changed by scanning.

## Geometry tests

The v1 footprint scan operates in plan because W06 first needs a deterministic site/footprint conflict gate.

- column/foundation/manhole extents are tested against the Extension polygon;
- drainage route segments are tested for point containment or segment crossing;
- polygon boundaries count as overlap;
- result ordering is deterministic.

A plan overlap is a coordination conflict candidate. It is not a complete 3D clash result and must not claim vertical clearance where that has not been checked.

## Result contract

`ExistingConflictScan` returns:

- `status`: `clear` or `conflict`;
- `conflict_count`;
- deterministic `conflicts` records.

Each record includes:

- `rule_id`;
- `state = unresolved`;
- owning domain;
- Smart Object ID/type;
- conflict kind;
- human-readable message;
- semantic evidence used by the scan.

The evidence is traceability information, not permission to mutate the target object.

## Construction QA integration

The Construction Workflow runs the Existing conflict scan after domain regeneration and before the Construction Quality Gate evaluates publication readiness.

- non-strict workflow: unresolved Existing conflicts are warnings;
- Strict Construction QA: unresolved Existing conflicts are errors and block publication/export.

The workflow result exposes the conflict scan separately from the aggregated Quality Gate so UI/AI callers can navigate or propose a resolution without parsing generic warning text.

## Resolution boundary

Conflict resolution must use the owning domain's explicit public commands. Examples:

- existing manhole conflict → `RelocateManhole` or an explicitly accepted reroute scenario;
- Existing object genuinely removed by the work → lifecycle/demolition command;
- structural conflict → engineer/designer revises the Structure or Extension intent;
- existing pipe conflict → Drainage reroute/relocation command.

The scanner must never infer demolition or silently move existing work just because an overlap was detected.

After resolution, the scanner is run again. Only the current semantic model determines whether the conflict remains.

## End-to-end propagation

A conflict-resolution mutation invalidates the relevant domain outputs through the normal event/dirty contracts. A later Construction Workflow rebuilds:

`current model → Existing conflict scan → takeoff → QA → drawing scope → settlement → currentness → issue/export gate`.

Historical issue evidence never suppresses a newly detected conflict.

## Acceptance criteria

- AC-ECF-001: an Existing-to-Remain Structure column inside the Extension footprint is reported.
- AC-ECF-002: an Existing-to-Remain Structure foundation whose extent intersects the footprint is reported.
- AC-ECF-003: an Existing-to-Remain manhole intersecting the footprint is reported.
- AC-ECF-004: an Existing-to-Remain Drainage route crossing the footprint is reported.
- AC-ECF-005: Existing objects already removed in Demolition are excluded from Proposed conflict results.
- AC-ECF-006: New Construction and selected-Extension-generated objects are excluded from this Existing-condition scan.
- AC-ECF-007: missing semantic definitions are surfaced as verification conflicts rather than skipped.
- AC-ECF-008: non-strict QA reports unresolved conflicts as warnings; Strict QA blocks publication.
- AC-ECF-009: scanning performs no model mutation and does not invent a resolution.
- AC-ECF-010: the Construction Workflow returns conflict-scan evidence for the same current model used by QA and publication gating.
