# ADR-0006 — Standalone-first BIM engine

Status: Accepted direction, based on the repository AGENTS.md and the user's standalone blueprint.
Date: 2026-10-07

## Context

MASTER-BLUEPRINT.md v1 and the existing release roadmap centered the product on SketchUp.
The current blueprint requires a self-contained engine with optional downstream CAD/BIM
adapters. The Plan Editor already has a canonical TypeScript project model but used to
execute semantic domain commands and generate extension assemblies inside the React app.

## Decision

The canonical project document and standalone domain engines are the source of truth.
Human UI, AI and sync actors use the same command contracts and runtime. SketchUp, LayOut,
AutoCAD and IFC/Revit remain optional adapters; their native acceptance gates remain
requirements for claims about those adapters, rather than prerequisites for standalone
semantic commands.

The initial TypeScript packages are:

- `project-model`: existing canonical document, serialization and domain payload types.
- `command-schema`: command inputs, handler context, batch result and envelope contracts.
- `command-runtime`: isolated transactions, generic batch orchestration and history.
- `structure-engine`: structural command handlers migrated from Plan Editor.
- `architecture-engine`: wall and hosted door/window command handlers.
- `catalog-engine`: type definition, assignment and type propagation.
- `extension-engine`: preset planning through public domain commands.

Domain handlers stay out of React and generic transaction infrastructure. A handler receives
an isolated draft. A batch publishes envelopes only after all commands succeed. One batch
is one history entry; redo restores the same semantic IDs and relationships.

This decision changes execution ownership, not the persisted `.cfproj` v1 schema. Existing
type marks, level IDs, instance overrides and legacy Ruby command names remain compatible.
New command and transaction identities are UUIDs. Mandatory `created_phase` values remain
`existing`, `demolition`, `new_construction`.

## Consequences and evidence limits

Documentation alignment (2026-10-07): the user explicitly removed the previous host-led delivery plan. `ROADMAP.md` now defines R0 Standalone Project Reliability and maps the S0–S5 engine milestones; the production-roadmap entrypoint points to this sole release sequence. Persistence and core acceptance use `.cfproj`; native SketchUp/LayOut gates apply only to optional adapters. This alignment does not certify new runtime capabilities. Implementation limitations below record the initial decision snapshot; current evidence is in `../STATUS.md` and the standalone review.

The semantic runtime now operates in Node without React or SketchUp. This is an incremental
foundation, not a completed 3D geometry engine, legal validator, takeoff system or permit
compiler. `ProjectCommandSession` provides tested history to engine consumers; editor-wide
Undo/Redo UI and adapter replay are separate follow-up work.

The catalog still binds most instances by mark and object family. Durable UUID `type_id`
binding needs a future documented migration. Roofs, slabs, steel profile quantities, rebar,
clash detection and standalone output providers are separate domain work.

Full-document cloning deliberately protects rollback and caller isolation in this first
slice. Production performance requires measured copy-on-write transactions and bounded
history before large-model claims. Domain provider registration and adapter parity are
subsequent milestones; the runtime currently assembles the implemented handlers explicitly.

See `../STANDALONE-ENGINE-REVIEW-2026-10.md` for priorities and acceptance evidence.
