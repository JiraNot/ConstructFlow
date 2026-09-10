# ConstructFlow Documentation — Single Source of Truth

This directory is the authoritative product and engineering specification for ConstructFlow by JiraNot.

## Authority

When implementation, comments, issues, AI-agent instructions, prototypes, or conversations conflict with the documents under `docs/`, the documents under `docs/` win unless an approved Architecture Decision Record (ADR) explicitly changes them.

No production module should introduce behavior that contradicts an approved specification without updating the documentation in the same pull request.

## Reading order

1. `MASTER-BLUEPRINT.md` — product mission, complete domain scope and non-goals.
2. `ROADMAP.md` — implementation sequence; it does not reduce the master scope.
3. `OBJECT-REGISTRY.md` — canonical ownership of smart-object families.
4. `WORKFLOW-REGISTRY.md` — canonical real-world workflows the platform must support.
5. `architecture/MODULAR-ARCHITECTURE.md` — module boundaries and dependency rules.
6. `architecture/CORE-CONTRACTS.md` — shared contracts.
7. `architecture/SMART-OBJECT-SCHEMA.md` — canonical object envelope and lifecycle.
8. `architecture/SMART-OBJECT-REPRESENTATION-SYSTEM.md` — one Smart Object with domain-owned 3D/plan/elevation/section/detail/annotation/schedule representations.
9. `architecture/SKETCHUP-PLAN-ADAPTER.md` — renderer boundary from semantic plan representations to managed SketchUp line/text scenes.
10. `architecture/DRAWING-VIEW-PRESETS.md` — deterministic scale/phase/LOD/drawing-family requests for generated scenes.
11. `architecture/PLAN-GRAPHIC-STYLES.md` — lifecycle/status-aware renderer-neutral graphic style intents and adapter behavior.
12. `architecture/SKETCHUP-NATIVE-GRAPHIC-STYLE-ADAPTER.md` — native SketchUp Tag/color/dash mapping for renderer-neutral style intent.
13. `architecture/SKETCHUP-SCENE-PRESENTATION.md` — managed per-scene ConstructFlow visibility without mutating unrelated user tags.
14. `architecture/LAYOUT-VECTOR-OUTPUT.md` — renderer-neutral sheet, viewport, vector lineweight and LayOut/PDF export intent.
15. `architecture/NATIVE-LAYOUT-ADAPTER.md` — official LayOut Ruby API boundary for native pages, viewports, `.layout` save and optional PDF export.
16. `architecture/LAYOUT-TITLEBLOCK-REVISION.md` — semantic title-block fields, revision history and native sheet decoration boundary.
17. `architecture/LAYOUT-TEMPLATE-PLACEHOLDERS.md` — safe mapping of normalized sheet metadata into company LayOut templates.
18. `architecture/LAYOUT-TEMPLATE-REGISTRY.md` — company template asset selection, compatibility and immutable version resolution.
19. `architecture/LAYOUT-TEMPLATE-PINNING.md` — project/drawing-set template pins and SHA-256 asset verification.
20. `architecture/DRAWING-ISSUE-SETS.md` — renderer-neutral coordinated multi-sheet issue-set contract.
21. `architecture/NATIVE-LAYOUT-ISSUE-SETS.md` — native multi-page `.layout`/PDF issue-set adapter and page rules.
22. `architecture/PHASE-LEVEL-REVISION.md` — existing/demolition/new, level and revision semantics.
23. `architecture/INTERACTION-MODEL.md` and `architecture/UI-UX-SPEC.md` — modeling interaction and UI behavior.
24. `architecture/COMMAND-CATALOG.md`, `EVENT-CATALOG.md`, `CONNECTOR-STANDARD.md` — cross-module integration contracts.
25. `architecture/EXTENSION-DOMAIN-BRIDGES.md` — public idempotent domain command boundary that makes Extension orchestration executable across Structure/Surface/Roof/Drainage/Interior/Electrical.
26. `architecture/EXTENSION-CONSTRUCTION-WORKFLOW.md` — end-to-end Extension construction package orchestration across domain generation, QA, quantity, scoped drawings and LayOut/PDF publication.
27. `architecture/EXTENSION-CONSTRUCTION-INTENT.md` — durable model-local per-domain construction-generation intent and precedence between defaults, persisted choices and one-run overrides.
28. `architecture/DRAINAGE-ROUTING-ALTERNATIVES.md` — structure-aware route candidate safety and explicit manual fallback.
29. `architecture/DRAINAGE-ROUTE-EDITING.md` — semantic internal-node editing, connector-owned endpoints and regrade rules.
30. `architecture/DRAINAGE-INTERMEDIATE-MANHOLE.md` — route splitting, lifecycle and connector continuity for inserted manholes.
31. `architecture/DRAINAGE-OFFSET-DETOURS.md` — deterministic clearance detours around known structural coordination bounds.
32. `architecture/DRAINAGE-QA-TAKEOFF.md` — project network QA and phase-aware Drainage quantity aggregation.
33. `architecture/SKETCHUP-DRAINAGE-ROUTE-GRIPS.md` — SketchUp drag-to-modify adapter over semantic route commands.
34. `architecture/QUANTITY-CONTRACT.md`, `DRAWING-STANDARD.md`, `TEST-STRATEGY.md`, `ACCEPTANCE-CRITERIA.md` — output and quality contracts.
35. `modules/MODULE-SPEC-TEMPLATE.md` and module specs — module-level implementation requirements.
36. `decisions/` — architecture decisions that explain or amend the baseline.

## Specification status vocabulary

- **Draft** — idea is documented but not binding for implementation.
- **Proposed** — reviewed enough for implementation planning, but may still change.
- **Accepted** — binding architecture/product contract.
- **Implemented** — accepted contract has a verified implementation.
- **Deprecated** — retained for migration/history but must not be used for new work.

Unless a document says otherwise, the architecture foundation documents in this repository are **Accepted v1 foundation contracts** and detailed module behaviors remain **Proposed** until their acceptance criteria are implemented.

## Change-control rule

Every change that affects a public module contract, persisted model data, lifecycle semantics, units, connector behavior, command input/output, events, quantity outputs, drawing outputs, or AI command access must include at least one of:

- an update to the relevant authoritative document;
- a new ADR under `docs/decisions/`;
- a schema migration note where persisted data changes.

## Source hierarchy

If two documents appear to conflict, use this precedence:

1. Accepted ADR with the highest sequence number that explicitly addresses the conflict.
2. `MASTER-BLUEPRINT.md` for product scope and non-goals.
3. Architecture contract documents for data and integration semantics.
4. Module specifications for domain behavior.
5. `WORKFLOW-REGISTRY.md` for expected user outcomes.
6. `ROADMAP.md` for sequencing only.

Roadmap phase order never deletes a requirement from the master blueprint.

## Implementation traceability

Every production command, smart-object type, quantity provider, drawing provider and validator should be traceable to a spec ID. Recommended identifiers:

- Object: `OBJ-<DOMAIN>-###`
- Command: `CMD-<DOMAIN>-###`
- Event: `EVT-<DOMAIN>-###`
- Workflow: existing IDs in `WORKFLOW-REGISTRY.md`
- Acceptance criterion: `AC-<DOMAIN>-###`

## AI-agent rule

Coding agents must read this file first. They must not invent a new cross-module contract when an existing contract can express the requirement. If a necessary contract is missing, the agent should add or propose the specification before coupling modules directly.

## Definition of documentation-complete for a feature

A feature is ready for implementation only when its spec defines, where applicable:

- owner module;
- smart objects and persisted fields;
- commands and validation;
- emitted/consumed events;
- hosts and connectors;
- phase/level behavior;
- concept vs construction LOD behavior;
- quantities;
- drawings/details;
- QA rules;
- library/catalog behavior;
- acceptance criteria and tests.

This directory is therefore not background documentation. It is the product contract that implementation must satisfy.
