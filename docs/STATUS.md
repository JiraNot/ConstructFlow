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

ConstructFlow is still at **Foundation / architecture implementation** stage.

Current implementation includes the SketchUp extension shell and initial Core runtime scaffolding such as module registry, event bus, command bus, phase/level foundations and attribute persistence helpers.

The presence of a requirement in documentation does **not** mean that feature is implemented.

## Milestone gates

### Gate F0 — Architecture baseline

Required:

- docs Single Source of Truth established;
- core contracts accepted;
- smart-object/persistence/lifecycle contracts accepted;
- command/event/connector architecture accepted;
- module ownership map established.

Status: documentation prepared in this branch.

### Gate F1 — Core persistence proof

Required evidence:

- create smart object;
- stable ID;
- phase + level metadata;
- save `.skp`;
- close/reopen;
- recover same semantic object;
- Undo/Redo works;
- invalid command rolls back cleanly.

### Gate F2 — First Architecture proof

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