# ConstructFlow Specification Status

This file is the current high-level implementation dashboard. It is informational; authoritative requirements remain in the referenced specifications and accepted architecture contracts.

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
| Commands | Accepted foundation / domain expanding | `architecture/COMMAND-CATALOG.md` |
| Events | Accepted foundation | `architecture/EVENT-CATALOG.md` |
| Hosts / Connectors | Accepted foundation | `architecture/CONNECTOR-STANDARD.md` |
| Persistence / Migration | Accepted foundation | `architecture/PERSISTENCE-MIGRATION.md` |
| Library / Catalog | Accepted foundation | `architecture/LIBRARY-CATALOG.md` |
| Quantity / BOQ / Cost | Accepted foundation | `architecture/QUANTITY-CONTRACT.md` |
| Drawing / Detail | Accepted foundation | `architecture/DRAWING-STANDARD.md` |
| Representation system | Accepted v1 | `architecture/SMART-OBJECT-REPRESENTATION-SYSTEM.md` |
| Drawing view presets | Accepted v1 | `architecture/DRAWING-VIEW-PRESETS.md` |
| SketchUp plan adapter | Accepted v1 | `architecture/SKETCHUP-PLAN-ADAPTER.md` |
| LayOut output | Accepted v1 foundation | `architecture/LAYOUT-VECTOR-OUTPUT.md` and related LayOut contracts |
| Extension construction workflow | Accepted v1 | `architecture/EXTENSION-CONSTRUCTION-WORKFLOW.md` |
| Extension domain bridges | Accepted v1 | `architecture/EXTENSION-DOMAIN-BRIDGES.md` |
| Roof rainwater package | Accepted v1 | `architecture/ROOF-RAINWATER-CONSTRUCTION-PACKAGE.md` |
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

ConstructFlow has moved beyond the original Core-only foundation. The repository now contains an **application-level Construction Workflow v1 vertical slice** that composes semantic domain objects, quantity providers, QA, drawing views, output settlement, currentness, LayOut/PDF publication boundaries and issue-history evidence through the same Smart Object graph.

Implemented and covered by pure-Ruby CI include:

- Core project, level, Smart Object, lifecycle, relationship, connector, command/event and transaction foundations;
- Smart Wall / Opening / Door-Window architecture foundations and plan representations;
- Extension orchestration with persisted construction intent and deterministic domain command ownership;
- Structure columns/foundations and structure quantity/drawing providers;
- Surface/Paving foundation and semantic plan output;
- Roof systems, gutters, reviewed rainwater catchment planning, explicit plan application and semantic downpipes;
- Drainage graph/routing foundations, editable route nodes, gravity/invert validation, manhole split/relocation, clash-aware alternatives and QA;
- Electrical device/circuit foundations and plan output;
- Interior/Joinery cabinet-run foundation and quantity/drawing output;
- Library/Catalog foundations;
- One-Smart-Object-to-many-representations drawing architecture;
- phase/LOD-aware drawing presets and native SketchUp style/scene presentation adapters;
- LayOut export-plan, native adapter, title-block/revision, template-placeholder and issue-set foundations;
- ConstructionTakeoff, ConstructionQualityGate, ConstructionOutputSettlement, ConstructionCurrentnessAudit and append-only ConstructionIssueHistory;
- Extension existing-host attachment workflow with demolition/proposed Architecture sheets;
- package-level rainwater QA that requires reviewed outlets to resolve to in-scope semantic Drainage downpipes before strict publication;
- Construction Workflow v1 proof that exercises a representative multi-domain package through drawing refresh, settlement, currentness and publication evidence.

### Construction Workflow v1 application-level proof

The current proof composes one Extension package across:

`Existing host + Extension Architecture + Structure + Roof/Rainwater + Drainage + Surface + Interior + Electrical → Takeoff → Strict QA → A/S/R/P/L/I/E views → Output Settlement → Currentness → LayOut/PDF export boundary → Output State → Issue History`

The proof intentionally verifies that a generated object belonging to another Extension does not leak into the selected package scope.

This is **application-level contract evidence**, executed by the pure-Ruby test harness with fake SketchUp/LayOut boundaries. It proves orchestration, semantic ownership, scope, QA, quantity and publication contracts; it does not claim that every native SketchUp/LayOut integration path has been manually exercised in the desktop applications.

## Native application verification still required

The following remain required before native-application gates can be marked complete:

- `.skp` save, application close/reopen and same-ID recovery in real SketchUp;
- real SketchUp Undo/Redo of semantic metadata + geometry in one operation;
- native SketchUp copy/duplicate identity behavior;
- model observer behavior across real New/Open operations;
- migration fixtures exercised against real model attributes;
- hands-on verification of representative interactive tools/handles in SketchUp;
- hands-on verification that generated SketchUp scenes, native tags/styles and section/view state survive save/reopen as intended;
- hands-on LayOut document/template/viewport/PDF export verification against supported SketchUp/LayOut versions.

The presence of a requirement in documentation does **not** by itself mean native integration has been verified.

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

Status: **In progress — application foundation implemented; native proof pending**.

The Core persistence/command/event implementation and pure-Ruby evidence exist. Real SketchUp save/reopen, Undo/Redo, native-copy identity and observer verification remain required before this gate is formally complete.

### Gate F2 — First Architecture proof

Status: **Application implementation advanced — formal native proof pending**.

Implemented application-level evidence now includes Smart Wall semantics, Existing/New lifecycle representation, hosted Openings, Door/Window infill foundations, quantity providers, plan representations, drawing invalidation and Extension-generated Architecture walls. The remaining gate decision must be based on the required real SketchUp interaction/persistence evidence, including the specific Draw/Convert/direct-manipulation acceptance paths.

### Gate F3 — Cross-module proof

Status: **Application-level proof achieved — formal native proof pending**.

Pure-Ruby/application evidence now covers cross-module Extension orchestration, Structure/Surface/Roof/Drainage/Interior/Electrical command ownership, drainage topology/routing/lifecycle rules, cross-domain QA, quantity/drawing invalidation, package scoping and publication gates. Real SketchUp execution evidence is still required before calling the native gate complete.

### Construction Workflow v1 — Coordinated extension package

Status: **Application-level complete; native acceptance pending**.

Required application contract is now represented by merged code/specs and CI evidence:

- effective persisted construction intent;
- dependency-safe domain command execution;
- generated-object reconciliation rather than append-only duplication;
- Architecture Existing/Demolition/Proposed package context;
- Structure engineering-status gate;
- explicit Drainage/Rainwater topology and QA;
- phase-aware takeoff with Smart Object traceability;
- drawing issue-set scope isolation by Extension;
- output settlement and stale/current audit;
- publication gate before LayOut/PDF export;
- model-local output evidence and append-only issue history.

The native acceptance step is separate and must exercise this representative workflow inside supported SketchUp/LayOut versions rather than replacing that evidence with unit-test claims.

## How to update this file

Update status only when there is evidence in merged code/tests/specs. Distinguish **application-level/pure-Ruby evidence** from **real SketchUp/LayOut acceptance evidence** so a green CI run is never presented as proof of native application behavior.
