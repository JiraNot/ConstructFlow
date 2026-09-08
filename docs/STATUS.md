# ConstructFlow Specification Status

This file is the current high-level status dashboard. It is informational; authoritative requirements remain in the referenced specs.

## Documentation foundation

| Area | Status | Authoritative source |
|---|---|---|
| Product scope | Accepted v1 | `MASTER-BLUEPRINT.md` |
| Modular architecture | Accepted v1 | `architecture/MODULAR-ARCHITECTURE.md` |
| Core contracts | Accepted v1 | `architecture/CORE-CONTRACTS.md` |
| Smart object schema | Accepted v1 | `architecture/SMART-OBJECT-SCHEMA.md` |
| Phase / Level / Revision | Accepted v1 | `architecture/PHASE-LEVEL-REVISION.md` |
| Interaction model | Accepted v1 | `architecture/INTERACTION-MODEL.md` |
| UI/UX contract | Accepted v1 | `architecture/UI-UX-SPEC.md` |
| Commands | Accepted foundation / domain Proposed | `architecture/COMMAND-CATALOG.md` |
| Events | Accepted foundation | `architecture/EVENT-CATALOG.md` |
| Hosts / Connectors | Accepted foundation | `architecture/CONNECTOR-STANDARD.md` |
| Persistence / Migration | Accepted foundation | `architecture/PERSISTENCE-MIGRATION.md` |
| Library / Catalog | Accepted foundation | `architecture/LIBRARY-CATALOG.md` |
| Quantity / BOQ / Cost | Accepted foundation | `architecture/QUANTITY-CONTRACT.md` |
| Drawing / Detail | Accepted foundation | `architecture/DRAWING-STANDARD.md` |
| LOD / Performance | Accepted foundation | `architecture/LOD-PERFORMANCE.md` |
| Import / Export | Accepted foundation | `architecture/IMPORT-EXPORT.md` |
| AI orchestration | Accepted foundation | `architecture/AI-ORCHESTRATION.md` |
| Test strategy | Accepted foundation | `architecture/TEST-STRATEGY.md` |
| Acceptance criteria | Accepted foundation | `architecture/ACCEPTANCE-CRITERIA.md` |
| Object registry | Proposed/expanding | `OBJECT-REGISTRY.md` |
| Workflow registry | Proposed/expanding | `WORKFLOW-REGISTRY.md` |
| Domain ownership map | Proposed v1 | `modules/DOMAIN-MODULES-v1.md` |
| Module spec template | Accepted process | `modules/MODULE-SPEC-TEMPLATE.md` |
| Roadmap | Proposed sequencing | `ROADMAP.md` |

## Implementation status

ConstructFlow is at **Foundation implementation** stage.

Implemented in the F1 Core branch:

- stable ConstructFlow/project ID generation;
- model-local ProjectStore and working-phase persistence;
- semantic LevelRegistry persistence in canonical millimetres, including unknown/verify-on-site levels;
- canonical SmartObject envelope and SmartObjectManager scan/recovery index;
- lifecycle, level-reference, relationship and dirty-state persistence;
- deterministic migration registry scaffolding;
- SketchUp transaction manager;
- versioned CommandBus with validation-before-mutation and common human/AI actor envelope;
- versioned EventBus with subscriber-failure isolation and bounded diagnostics;
- manifest/capability validation and dependency-aware ModuleLoader rollback;
- model open/new observer and Foundation Inspector runtime entry;
- pure-Ruby foundation unit tests and GitHub Actions workflow.

Pure-Ruby test evidence before PR: **14 tests / 45 assertions / 0 failures / 0 errors**. This evidence validates Core contracts without the SketchUp runtime.

The following still require real SketchUp integration evidence before Gate F1 can be marked complete:

- `.skp` save, application close/reopen and same-ID recovery in SketchUp;
- real SketchUp Undo/Redo of semantic metadata + geometry in one operation;
- copy/duplicate identity behavior through SketchUp native copy workflows;
- model observer behavior across real New/Open operations;
- migration fixture exercised against real model attributes.

The presence of a requirement in documentation does **not** mean that feature is implemented.

## Milestone gates

### Gate F0 — Architecture baseline

Status: **Complete**.

Evidence:

- docs Single Source of Truth established;
- core contracts accepted;
- smart-object/persistence/lifecycle contracts accepted;
- command/event/connector architecture accepted;
- module ownership map established.

### Gate F1 — Core persistence proof

Status: **In progress**.

Implemented and unit-tested foundation exists. Real SketchUp integration evidence remains required for save/reopen, Undo/Redo and native-copy identity behavior.

### Gate F2 — First Architecture proof

Status: **Not started**.

Required evidence:

- Draw/Convert Smart Wall;
- Existing vs New;
- direct dimension modification;
- opening host relationship;
- persistence;
- quantity provider stub;
- drawing invalidation stub;
- QA validation stub.

### Gate F3 — Cross-module proof

Status: **Not started**.

Suggested proof workflow:

`Existing Drain/Manhole + New Extension + Relocate Manhole`

Must prove:

- lifecycle replacement;
- connector/network topology;
- level/invert validation;
- event propagation;
- quantity/drawing dirty states;
- no hard sibling-module mutation.

## How to update this file

Update status only when there is evidence in merged code/tests/specs. Do not mark a feature implemented merely because it appears in a design conversation or issue.
