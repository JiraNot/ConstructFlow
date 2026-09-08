# Implementation Entrypoint

This file tells a developer or coding agent where to begin after the documentation baseline is merged.

## First implementation target

Do **not** start by implementing every domain module.

The first proof should establish Core persistence and module contracts, then one small Architecture workflow.

## Milestone 1 — Core persistence proof

Implement/verify:

1. Module loader/manifest validation.
2. SmartObject manager using the accepted envelope.
3. Stable ID generation.
4. Phase lifecycle persistence.
5. Level references/persistence.
6. Transaction/Undo integration.
7. save/reopen recovery.
8. migration scaffolding.
9. developer inspector.

Acceptance gate: Foundation criteria in `architecture/ACCEPTANCE-CRITERIA.md`.

## Milestone 2 — Smart Wall proof

Implement one end-to-end production object:

`Draw → Smart Wall → Phase/Level → Modify → Quantity stub → Drawing dirty → QA → Save/Reopen`

Required specs:

- `modules/ARCHITECTURE.md`
- `architecture/SMART-OBJECT-SCHEMA.md`
- `architecture/COMMAND-CATALOG.md`
- `architecture/EVENT-CATALOG.md`
- `architecture/PERSISTENCE-MIGRATION.md`
- `architecture/UI-UX-SPEC.md`

## Milestone 3 — Opening host proof

Add hosted Smart Opening to prove:

- host capability;
- relationship persistence;
- Existing Modify behavior;
- wall regeneration compatibility.

## Milestone 4 — Cross-module proof

Implement a minimal Drainage network and run the real renovation case:

`Existing manhole → proposed extension conflict → Relocate Manhole → reroute → phase history → dirty Quantity/Drawing → QA`

This proves the platform architecture before investing heavily in Roof, Surface, Interior and Structure.

## Coding-agent instruction

Always begin from `docs/README.md` and `docs/AGENT-IMPLEMENTATION-RULES.md`. Roadmap controls sequencing but Master Blueprint retains full scope.