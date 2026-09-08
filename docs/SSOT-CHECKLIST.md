# Single Source of Truth Completeness Checklist

Use this checklist before declaring a new product area documented enough for implementation.

## Product scope

- [ ] Requirement exists in `MASTER-BLUEPRINT.md` or accepted scope amendment.
- [ ] Owner module/service is assigned.
- [ ] `TRACEABILITY.md` maps the scope.
- [ ] User workflow exists or is referenced in `WORKFLOW-REGISTRY.md`.

## Data and lifecycle

- [ ] Smart-object type/data ownership defined.
- [ ] Stable identity behavior defined.
- [ ] Existing/Demolition/New behavior defined.
- [ ] Modify/Relocate/Replace semantics defined where applicable.
- [ ] Level/datum behavior defined.
- [ ] Existing-condition uncertainty is representable.
- [ ] Schema version/migration behavior defined.

## Interaction

- [ ] Create/Draw/Convert flow defined.
- [ ] Direct manipulation behavior defined where useful.
- [ ] Host/connector relationships defined.
- [ ] Commands and validation defined.
- [ ] Events/change propagation defined.
- [ ] Concept/Construction/Fabrication LOD behavior defined.

## Outputs

- [ ] Quantity provider outputs defined.
- [ ] BOQ phase grouping defined.
- [ ] Drawing/detail/schedule outputs defined.
- [ ] Dirty/invalidation behavior defined.
- [ ] QA/coordination rules defined.
- [ ] Library/catalog behavior defined.

## Engineering quality

- [ ] Acceptance criteria IDs exist.
- [ ] Test strategy is mapped.
- [ ] Undo/Redo is covered.
- [ ] Save/reopen is covered.
- [ ] Performance strategy is defined.
- [ ] Breaking cross-module decisions have ADR.

## Coding-agent readiness

A module is considered implementation-ready only when a coding agent can determine from repository docs, without relying on chat history:

1. what it owns;
2. what it may depend on;
3. what objects/commands/events it exposes;
4. how objects persist and change phase/level;
5. how other modules connect to it;
6. what quantities/drawings/QA it provides;
7. what tests prove it is complete.

If any answer requires inventing a new architecture convention, the docs are not complete yet.