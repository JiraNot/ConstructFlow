# Smart Object Native Copy Identity

Status: Accepted v1 foundation contract.

## Purpose

Define safe behavior when a user duplicates ConstructFlow-owned SketchUp entities with native SketchUp copy operations rather than an explicit ConstructFlow domain command.

SketchUp may duplicate an entity's attribute dictionaries verbatim. Without a repair boundary, the original and copied entity can temporarily carry the same Smart Object ID and copied graph relationships, which can corrupt package scoping, quantity traceability and connector/host ownership.

## Principle

A production Smart Object ID is unique within one project model.

Native SketchUp copy is treated as a **detached semantic duplicate**, not as proof that graph ownership relationships should be duplicated.

Domain-aware duplication remains the responsibility of explicit commands such as the planned `DuplicateSmartObject` or domain-specific copy/array workflows.

## Detection

ConstructFlow installs native `EntitiesObserver` adapters on the active model and observed group entity collections.

When SketchUp adds an entity, the observer defers mutation out of the observer callback. The deferred repair checks whether the new entity (or a nested Smart Object within a newly copied group) carries an object ID already indexed to another live entity.

If no duplicate identity exists, no repair operation is opened.

## Repair behavior

When a duplicate identity is detected:

1. assign a new Smart Object ID using `SmartObjectManager#ensure_unique_identity!`;
2. detach copied semantic relationships rather than inheriting ownership/topology blindly;
3. add a trace relationship:
   - kind: `copied_from`
   - target: original Smart Object ID
   - role: `native_copy_source`
   - metadata: `{ detached: true }`;
4. mark `dirty_dependents`, `dirty_quantity` and `dirty_drawing`;
5. publish `NativeCopyIdentityRepaired` with source/new object evidence.

The original Smart Object is not modified.

## Why relationships are detached

A raw native copy must not silently duplicate relationships such as:

- `generated_from` Extension provenance;
- host/attachment ownership;
- `supports` / `supported_by` structural topology;
- network `connects_to` relationships;
- replacement history.

Keeping those relations could make a copied object appear to belong to an Extension package, structural system or MEP network that never explicitly accepted it.

The detached copy keeps its own persisted definition/geometry/lifecycle data. It must be reattached/reconnected through public domain commands when graph participation is intended.

## Observer safety

SketchUp observer callbacks are notification boundaries, not mutation transactions.

The native adapter therefore:

- defers repair with `UI.start_timer(0, false)`;
- verifies the entity is still valid/not deleted;
- opens a transparent ConstructFlow transaction only when duplicate identity is actually present;
- never polls the model;
- keeps observer instances strongly referenced;
- attaches to newly created group entity collections so later nested copies are also observed.

New/Open model events reattach observers after the main Runtime model attachment has rebuilt Smart Object indexes.

## Undo

The repair transaction is transparent so the identity repair is intended to travel with the user's native copy operation rather than create an unrelated semantic action. Real SketchUp Undo/Redo behavior remains a native acceptance checkpoint and must be verified in supported SketchUp versions.

## Native acceptance boundary

Pure-Ruby tests prove duplicate detection/repair semantics but do not mark the `native_copy_identity` checkpoint as passed.

That checkpoint requires hands-on native verification that:

- native copy creates a distinct Smart Object ID;
- the original ID remains unchanged;
- copied graph ownership is detached;
- Undo removes/restores copy geometry and repaired metadata coherently;
- save/reopen preserves the repaired identity.

## Acceptance criteria

- AC-COPY-001: a copied Smart Object carrying an indexed production ID is assigned a new unique ID.
- AC-COPY-002: the original Smart Object ID and relationships are unchanged by copy repair.
- AC-COPY-003: copied semantic graph relationships are detached and replaced by one `copied_from` trace relation.
- AC-COPY-004: repaired copies mark dependent quantity/drawing state dirty.
- AC-COPY-005: non-duplicate entities do not open a repair mutation.
- AC-COPY-006: nested Smart Objects inside newly copied Group entities are eligible for the same repair.
- AC-COPY-007: observer-triggered model mutation is deferred outside the observer callback.
- AC-COPY-008: native acceptance remains incomplete until the behavior is exercised in real SketchUp.
