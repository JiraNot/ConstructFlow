# Extension Attachment Host

Status: Accepted v1 foundation contract.

## Purpose

An Extension commonly shares one boundary with an existing building wall. The Architecture bridge must not generate a new full-height wall on top of that host merely because the Extension boundary is closed.

This contract defines how `extension.zone.attachment_host_id` is resolved to one Extension boundary edge and how generated Architecture walls converge around that attachment.

## Ownership

- Extension owns the semantic `attachment_host_id` reference as part of `ExtensionDefinition`.
- Architecture owns host-wall semantics, wall definitions and generated wall geometry.
- `GenerateOrUpdateArchitectureFromExtension` may read the referenced Architecture Smart Wall to resolve the shared edge, but it must not mutate the host wall.
- Opening/Door-Window behavior on the host remains owned by their existing host contracts.

## Safe edge resolution

The v1 resolver accepts only a Smart Object with:

- type `architecture.wall`;
- owner `constructflow.architecture`;
- a readable `WallDefinition`.

Resolution order is:

1. If Architecture construction intent provides `attachment_edge_index`, validate that index against the Extension boundary and verify that the selected edge geometrically overlaps the host wall.
2. Otherwise compare Extension boundary edges with host-wall path segments in plan and choose a unique collinear overlapping edge.
3. If no edge overlaps, fail the Architecture bridge.
4. If more than one edge is equally plausible, fail and require explicit `attachment_edge_index`.

The resolver may use a small modeling tolerance for collinearity, but must never select the nearest unrelated wall merely by distance.

## Generated-wall behavior

The resolved attachment edge is a **hosted/open side of generated Extension wall enclosure**. Architecture therefore does not create a `wall_edge_N` Smart Wall for that boundary edge.

All remaining Extension boundary edges continue to use stable `wall_edge_N` generated-from slots.

If a previous workflow generated a wall for an edge that later becomes the resolved attachment edge, that generated new-work wall is reconciled away. This is source-intent reconciliation, not demolition.

If the attachment is later removed, normal Architecture generation may create a wall for that edge again. The newly created object receives a new Smart Object identity because the prior derived object was intentionally reconciled out of the model.

## Host protection

Attachment resolution is read-only with respect to the host. It must not:

- rebuild the host wall;
- change host lifecycle;
- clear or rewrite host openings;
- change wall type or thickness;
- add demolition history;
- silently cut a passage through the host.

A future explicit opening/alteration workflow may modify an existing host through Architecture/Opening commands, but attachment resolution alone never implies demolition or a new opening.

## Quantity and drawing behavior

The host wall is not counted as Extension-generated wall quantity merely because an Extension attaches to it. Generated Architecture quantities include only current generated walls related by `generated_from`.

The Architecture construction sheet may still show the host as project context under the existing drawing-scope rules. Generated Architecture from another Extension remains excluded from the selected Extension's generated scope.

Suppressing or restoring a generated `wall_edge_N` changes the current Smart Object graph and therefore invalidates/rebuilds quantity, drawing, settlement and currentness evidence through the existing Construction Workflow pipeline.

## Persisted intent

`attachment_host_id` remains part of the persisted `ExtensionDefinition`.

Optional `architecture.attachment_edge_index` may be stored in Extension Construction Intent when geometry alone is ambiguous. Persisting the index does not bypass overlap validation; it only makes the user's edge choice explicit.

## Failure policy

An invalid/missing/non-Architecture host, an unreadable host wall definition, a non-overlapping explicit edge, no geometric match, or an ambiguous geometric match must fail Architecture generation visibly.

The system must not resolve these cases by generating a duplicate wall over the host or by silently dropping an arbitrary boundary wall.

## Acceptance criteria

- AC-ATT-001: a unique collinear host-wall overlap suppresses exactly one generated Extension wall edge.
- AC-ATT-002: the host Architecture Smart Wall is not mutated by attachment resolution.
- AC-ATT-003: adding an attachment reconciles a previously generated wall on the resolved edge.
- AC-ATT-004: removing the attachment restores normal wall generation for that edge.
- AC-ATT-005: ambiguous geometry requires explicit `architecture.attachment_edge_index`.
- AC-ATT-006: an explicit edge index is accepted only when that edge actually overlaps the referenced host wall.
- AC-ATT-007: missing, incompatible or non-overlapping hosts fail visibly rather than being guessed.
- AC-ATT-008: Extension wall takeoff excludes the suppressed edge while Architecture drawing context may still include the host wall.
