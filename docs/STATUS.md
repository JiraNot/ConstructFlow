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
| Drawing issue sets | Accepted v1 | `architecture/DRAWING-ISSUE-SETS.md` |
| SketchUp plan adapter | Accepted v1 | `architecture/SKETCHUP-PLAN-ADAPTER.md` |
| SketchUp scene presentation | Accepted v1 | `architecture/SKETCHUP-SCENE-PRESENTATION.md` |
| SketchUp graphic style adapter | Accepted v1 | `architecture/SKETCHUP-NATIVE-GRAPHIC-STYLE-ADAPTER.md` |
| LayOut output | Accepted v1 foundation | `architecture/LAYOUT-VECTOR-OUTPUT.md` and related LayOut contracts |
| Native LayOut adapter | Accepted v1 | `architecture/NATIVE-LAYOUT-ADAPTER.md` |
| Native LayOut issue sets | Accepted v1 | `architecture/NATIVE-LAYOUT-ISSUE-SETS.md` |
| LayOut template registry | Accepted v1 | `architecture/LAYOUT-TEMPLATE-REGISTRY.md` |
| LayOut template placeholders | Accepted v1 | `architecture/LAYOUT-TEMPLATE-PLACEHOLDERS.md` |
| LayOut template pinning | Accepted v1 | `architecture/LAYOUT-TEMPLATE-PINNING.md` |
| LayOut titleblock revision | Accepted v1 | `architecture/LAYOUT-TITLEBLOCK-REVISION.md` |
| Extension construction workflow | Accepted v1 | `architecture/EXTENSION-CONSTRUCTION-WORKFLOW.md` |
| Extension domain bridges | Accepted v1 | `architecture/EXTENSION-DOMAIN-BRIDGES.md` |
| Extension construction intent | Accepted v1 | `architecture/EXTENSION-CONSTRUCTION-INTENT.md` |
| Extension attachment host | Accepted v1 | `architecture/EXTENSION-ATTACHMENT-HOST.md` |
| Extension attachment opening | Accepted v1 | `architecture/EXTENSION-ATTACHMENT-OPENING.md` |
| Extension attachment infill | Accepted v1 | `architecture/EXTENSION-ATTACHMENT-INFILL.md` |
| Extension demolition plan | Accepted v1 | `architecture/EXTENSION-DEMOLITION-PLAN.md` |
| Construction output settlement | Accepted v1 | `architecture/CONSTRUCTION-OUTPUT-SETTLEMENT.md` |
| Construction issue history | Accepted v1 | `architecture/CONSTRUCTION-ISSUE-HISTORY.md` |
| Roof rainwater package | Accepted v1 | `architecture/ROOF-RAINWATER-CONSTRUCTION-PACKAGE.md` |
| Roof rainwater downpipes | Accepted v1 | `architecture/ROOF-RAINWATER-DOWNPIPE.md` |
| Roof rainwater regeneration | Accepted v1 | `architecture/ROOF-RAINWATER-REGENERATION.md` |
| Roof rainwater catchment planning | Accepted v1 | `architecture/ROOF-RAINWATER-CATCHMENT-PLANNING.md` |
| Roof rainwater capacity catalog | Accepted v1 | `architecture/ROOF-RAINWATER-CAPACITY-CATALOG.md` |
| Roof rainwater plan application | Accepted v1 | `architecture/ROOF-RAINWATER-PLAN-APPLICATION.md` |
| Drainage route editing | Accepted v1 | `architecture/DRAINAGE-ROUTE-EDITING.md` |
| Drainage routing alternatives | Accepted v1 | `architecture/DRAINAGE-ROUTING-ALTERNATIVES.md` |
| Drainage intermediate manhole | Accepted v1 | `architecture/DRAINAGE-INTERMEDIATE-MANHOLE.md` |
| Drainage offset detours | Accepted v1 | `architecture/DRAINAGE-OFFSET-DETOURS.md` |
| Drainage QA takeoff | Accepted v1 | `architecture/DRAINAGE-QA-TAKEOFF.md` |
| Drainage intent transitions | Accepted v1 | `architecture/DRAINAGE-EXTENSION-INTENT-TRANSITIONS.md` |
| SketchUp drainage route grips | Accepted v1 | `architecture/SKETCHUP-DRAINAGE-ROUTE-GRIPS.md` |
| Native acceptance evidence | Accepted v1 | `architecture/NATIVE-APPLICATION-ACCEPTANCE-EVIDENCE.md` |
| Native copy identity safety | Accepted v1 | `architecture/SMART-OBJECT-NATIVE-COPY-IDENTITY.md` |
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

ConstructFlow has moved beyond the original Core-only foundation. The repository now contains an **application-level Construction Workflow v1 vertical slice** that composes semantic domain objects, quantity providers, QA, drawing views, output settlement, currentness, LayOut/PDF publication boundaries and issue-history evidence through the same Smart Object graph. In addition, the **native acceptance infrastructure**, **automatic evidence recorder**, **preflight readiness service**, and **deterministic RBZ packaging pipeline** have been implemented and verified under pure-Ruby CI.

Implemented and covered by pure-Ruby CI include:

- Core project, level, Smart Object, lifecycle, relationship, connector, command/event and transaction foundations;
- Smart Wall / Opening / Door-Window architecture foundations and plan representations;
- Extension orchestration with persisted construction intent and deterministic domain command ownership;
- Extension existing-host attachment edge resolution, wall suppression, and intent reconciliation without duplicate wall generation;
- Hosted attachment opening and door-window infill workflows with conditional A-100 demolition and A-101 proposed sheet context;
- Structure columns/foundations and structure quantity/drawing providers;
- Surface, Paving & Landscape (Phase 4 complete): Herringbone, Basket Weave, and Chevron pattern solvers, SlopeDefinition with planar/multi-point/drain-to elevation interpolation, SurfaceAssemblyDefinition with build-up layers and BOQ emission, ControlJointDefinition, TreePitDefinition with planter cutouts and grilles, and PathSurfaceDefinition for path-based surfaces;
- Roof systems, gutters, reviewed rainwater catchment planning, explicit plan application, verified capacity catalog evidence, and semantic downpipes;
- Drainage & Plumbing (Phase 5 complete): graph/routing foundations, editable route nodes, gravity/stepped invert validation, manhole split/relocation, clash-aware alternatives, offset detours, fixture connectors/registry, A*-based auto-route candidate solver, and roof rainwater downpipe bridge;
- Electrical (Phase 6 complete): device/circuit foundations, cable definitions, conduit route solver & sizing engine, panelboard load balancing, and voltage drop calculation;
- Interior & Joinery (Phase 7 complete): cabinet run definition, countertop overhang/profiles, wardrobe, false ceiling, and wall paneling definitions;
- Furniture Fabrication (Phase 8 complete): sheet nesting bin packing engine, cut list exporter, and CNC machining operations generator;
- Library & Catalog Platform (Phase 9 complete): catalog asset definitions, compatibility engine, variant matrix, and LOD proxy manager;
- Quantity, BOQ & Costing (Phase 10 complete): normalized rate items, versioned rate libraries, cost estimate lines with waste factors, CostingEngine, estimate snapshots, and BOQ CSV exporter;
- Drawing, Detail & LayOut Automation (Phase 11 complete): DrawingIntentRegistry for automated package sheet specs, ElevationGenerator (N/S/E/W projections), SectionGenerator (cross-section cut profiles & hatches), DetailCalloutDefinition, DoorWindowScheduleGenerator, and JoineryShopDrawingGenerator;
- QA, Revision & Site Workflow (Phase 12 complete): cross-domain ValidatorRegistry, RevisionTracker with delta clouds, SiteVerificationDefinition with construction hold-points & audit trail, and StaleAuditService with dependency propagation;
- One-Smart-Object-to-many-representations drawing architecture;
- Phase/LOD-aware drawing presets and native SketchUp style/scene presentation adapters;
- LayOut export-plan, native adapter, title-block/revision, template-placeholder and issue-set foundations;
- ConstructionTakeoff, ConstructionQualityGate, ConstructionOutputSettlement, ConstructionCurrentnessAudit and append-only ConstructionIssueHistory;
- Package-level rainwater QA requiring reviewed outlets to resolve to in-scope semantic Drainage downpipes before strict publication;
- Construction Workflow v1 proof that exercises a representative multi-domain package through drawing refresh, settlement, currentness and publication evidence;
- Native acceptance evidence harness, model-local evidence store, and runtime event telemetry (`NativeAcceptanceService`, `NativeAcceptanceEvidenceStore`);
- Native SketchUp copy identity detachment and duplicate detection observers (`NativeCopyIdentityGuard`);
- Automatic native acceptance evidence capture for copy and model observer transitions;
- Objective scene presentation and native tag persistence verification across reopen sessions;
- Native acceptance project preflight service, command, and UI menu integration (`NativeAcceptancePreflight`);
- Deterministic SketchUp RBZ packager tool (`scripts/package-sketchup-extension.rb`) and automated GitHub Actions RBZ build workflow (`.github/workflows/build-rbz.yml`).

### Construction Workflow v1 application-level proof

The current proof composes one Extension package across:

`Existing host + Extension Architecture + Structure + Roof/Rainwater + Drainage + Surface + Interior + Electrical → Takeoff → Strict QA → A/S/R/P/L/I/E views → Output Settlement → Currentness → LayOut/PDF export boundary → Output State → Issue History`

The proof intentionally verifies that a generated object belonging to another Extension does not leak into the selected package scope.

This is **application-level contract evidence**, executed by the pure-Ruby test harness with fake SketchUp/LayOut boundaries. It proves orchestration, semantic ownership, scope, QA, quantity and publication contracts; it does not claim that every native SketchUp/LayOut integration path has been manually exercised in the desktop applications.

## Native application verification still required

The automated harness, RBZ packaging, preflight readiness check, and observer-based evidence recording infrastructure are now in place. The following live desktop actions remain to be executed inside supported SketchUp/LayOut environments according to `docs/implementation/NATIVE-APPLICATION-ACCEPTANCE-RUNBOOK.md`:

- Install the generated `.rbz` artifact into a live SketchUp installation;
- Run `Extensions > ConstructFlow > Native Acceptance > Preflight Acceptance Project` on the acceptance project;
- `.skp` save, application close/reopen and same-ID recovery in real SketchUp (Checkpoint 1);
- Real SketchUp Undo/Redo of semantic metadata + geometry in one operation (Checkpoint 2);
- Live native SketchUp copy/duplicate identity verification via automatic observer capture (Checkpoint 3);
- Live model observer behavior across real New/Open operations via automatic observer capture (Checkpoint 4);
- Migration fixtures exercised against real model attributes (Checkpoint 5);
- Hands-on verification of representative interactive tools/handles in SketchUp (Checkpoint 6);
- Hands-on verification that generated SketchUp scenes, native tags/styles and section/view state survive save/reopen as intended (Checkpoint 7);
- Hands-on LayOut document/template/viewport/PDF export verification against supported SketchUp/LayOut versions (Checkpoint 8).

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

Status: **Application foundation complete; native acceptance execution pending**.

The Core persistence/command/event implementation, copy identity detachment guard, preflight service, and native acceptance evidence recorder exist and pass pure-Ruby CI. Real SketchUp save/reopen, Undo/Redo, and live observer execution per `docs/implementation/NATIVE-APPLICATION-ACCEPTANCE-RUNBOOK.md` remain to record the final native evidence before this gate is formally closed.

### Gate F2 — First Architecture proof

Status: **Application implementation complete; native acceptance execution pending**.

Implemented application-level evidence includes Smart Wall semantics, Existing/New lifecycle representation, hosted Openings, Door/Window infill foundations, Extension attachment host resolution/wall suppression, quantity providers, plan representations, drawing invalidation and Extension-generated Architecture walls. Formal native proof in real SketchUp remains the final gate requirement.

### Gate F3 — Cross-module proof

Status: **Application-level proof achieved; native acceptance execution pending**.

Pure-Ruby/application evidence covers cross-module Extension orchestration, Structure/Surface/Roof/Drainage/Interior/Electrical command ownership, drainage topology/routing/lifecycle rules, cross-domain QA, quantity/drawing invalidation, package scoping, settlement, and publication gates. Real SketchUp execution evidence is still required before calling the native gate complete.

### Construction Workflow v1 — Coordinated extension package

Status: **Application-level complete; native acceptance pending**.

Required application contract is represented by merged code/specs, RBZ build pipeline, and CI evidence:

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
- model-local output evidence and append-only issue history;
- native acceptance preflight and automated observer-driven evidence recording.

The native acceptance step is separate and must exercise this representative workflow inside supported SketchUp/LayOut versions rather than replacing that evidence with unit-test claims.

## How to update this file

Update status only when there is evidence in merged code/tests/specs. Distinguish **application-level/pure-Ruby evidence** from **real SketchUp/LayOut acceptance evidence** so a green CI run is never presented as proof of native application behavior.
