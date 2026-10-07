# ConstructFlow — SketchUp Adapter Architecture Audit

Scope: Ruby/SketchUp implementation evidence. The standalone product architecture and active delivery plan are defined by ADR-0006, `../ROADMAP.md` and `../STANDALONE-ENGINE-REVIEW-2026-10.md`. Counts and native storage descriptions below apply to the adapter implementation inspected, not the canonical standalone runtime.

## 1. Executive Summary

ConstructFlow is a **standalone BIM and design-to-construction platform**. Its optional SketchUp adapter has Ruby implementations covering architecture, structure, roofs, interiors, electrical, drainage, surface, BOQ and construction documentation. This audit records that adapter's architecture and does not make SketchUp a product dependency.

This audit establishes the baseline architectural state of the repository as of October 2026, documenting strengths to preserve, structural coupling points, boot/runtime lifecycle characteristics, and SketchUp API leakages identified during inspection.

## 2. Baseline Status & Test Evidence

- **Test Suite**: 800 runs, 7,761 assertions, 0 failures, 0 errors, 0 skips.
- **Syntax Validation**: All Ruby files across Core and Modules pass syntax checks (`SYNTAX: ALL OK`).
- **Domain Modules Active (12)**:
  1. `constructflow.architecture` (Walls, Floors, Rooms, Ceilings, Stairs, Framing, Curtains, Auto-roof)
  2. `constructflow.opening` (Hosted wall voids, infill boundaries)
  3. `constructflow.door_window` (Parametric doors/windows, type catalog, instance definitions)
  4. `constructflow.structure` (Grids, Columns, Beams, Foundations, Rebar sets)
  5. `constructflow.roof` (Roof boundary, slope, hip/gable, gutters, rainwater catchment)
  6. `constructflow.surface` (Paving layouts, borders, slopes, joints, tree pits, parking)
  7. `constructflow.interior` (Cabinet runs, countertops, wardrobes, false ceilings, paneling, joinery parts, sheet nesting, cut lists)
  8. `constructflow.library` (Catalog assets, LOD management, placed assets, compatibility)
  9. `constructflow.drainage` (Manholes, pipe routes, slope/inverts, detour planner, rainwater downpipes)
  10. `constructflow.electrical` (Devices, circuits, panelboards, cables, conduits, voltage drop)
  11. `constructflow.costing` (Rate libraries, BOQ export, cost estimate lines, snapshots)
  12. `constructflow.extension` (Renovation/extension zones, presets, construction workflow runner)

## 3. Key Architectural Strengths to Preserve

1. **Semantic CommandBus**:
   - Every domain mutation flows through `CommandBus#execute(name, input, ...)`.
   - Supports validation guards prior to transaction opening.
   - Enforces transaction atomicity with automatic rollback on error.
   - Normalizes actor context (`human`, `ai`, `automation`).
   - Normalizes results (`status: 'success' | 'rejected' | 'failed'`).
   - Emits structured domain events upon transaction commit.

2. **Immutable EventBus**:
   - Publishes frozen event records with trace IDs (`event_id`, `caused_by_command_id`, `timestamp`).
   - Captures subscriber failures without aborting outer transactions.
   - Maintains audit history bounded to configurable ring buffers.

3. **Smart Object System**:
   - Persists semantic domain state directly on SketchUp entities using Attribute Dictionaries (`constructflow.core`, `constructflow.library`).
   - Preserves stable IDs (`cf_obj_*`) across file save/reopen.
   - First-class lifecycle states: `Phase::EXISTING`, `Phase::DEMOLITION`, `Phase::NEW_CONSTRUCTION`.
   - Explicit level referencing (`level_refs`).
   - Source state tracking (`measured`, `confirmed`, `assumed`, `unknown`, `verify_on_site`).

4. **Multi-Representation Engine**:
   - Single Smart Object source of truth driving:
     - 3D Geometry
     - 2D Plan Graphic Representation
     - Section & Elevation views
     - Schedules (Door/Window, Room, Beam, Column)
     - BOQ & Quantity Takeoff records

5. **AI/MCP Tool Parity**:
   - External LLMs and MCP agents execute commands through the exact same `CommandBus` API as human SketchUp interactive tools.
   - No privileged write paths or geometry bypasses exist for AI.

## 4. Coupling Points and Leaks Identified

### 4.1 Split Boot & Distributed Registration
- **Pre-Cleanup State**:
  - `main.rb` required ~150 files and immediately booted `Runtime.boot!` at the bottom of the file.
  - Inside `Runtime.boot!`, 13 module installers were invoked manually.
  - Subsequently, `bootstrap.rb` required ~50 additional files and invoked over 30 `.install` methods outside of `Runtime.boot!`.
  - When tests loaded files independently, integrations were often missing or required ad-hoc re-registration.
- **Resolution**:
  - Streamlined `bootstrap.rb` into a clean entrypoint.
  - Introduced `Core::BuiltinModules` and two-phase module definition loading in `Core::ModuleLoader`.
  - Primary module installers register capabilities and commands; secondary cross-domain integrations register representation providers, presets, and route hooks in a single deterministic pass.

### 4.2 Direct SketchUp API Usage in Core (Persistence & Transactions)
- **Pre-Cleanup State**:
  - `Core::AttributeStore` directly invoked `entity.get_attribute`, `entity.set_attribute`, `entity.delete_attribute`.
  - `Core::TransactionManager` directly invoked `model.start_operation`, `model.commit_operation`, `model.abort_operation`.
  - Core domain models could not easily be tested without mocking SketchUp entity primitives.
- **Resolution**:
  - Introduced `Core::Host::EntityAttributeAdapter` and `Core::Host::ModelTransactionAdapter`.
  - Unified host interface through `Core::Host::SketchUpHost`.
  - `AttributeStore` and `TransactionManager` now delegate to host adapters while preserving 100% backward compatibility for all existing callers.

### 4.3 Ad-Hoc Dependency Invalidation Traversal
- **Pre-Cleanup State**:
  - `SmartObjectManager#dependent_ids` traversed reverse relationships using an inline queue, mixed within object entity persistence logic.
- **Resolution**:
  - Extracted `Core::DependencyGraph` with cycle-safe transitive traversal, invalidation token management (`geometry`, `quantity`, `drawing`, `schedule`, `validation`), and diagnostic event logging.
  - Delegated `SmartObjectManager#dependent_ids` to `DependencyGraph#transitive_dependents`.

## 5. Architectural Quality Criteria

| Criterion | Current Implementation |
|---|---|
| Where does project state live? | Persisted in `Core::ProjectStore` on active model attribute dictionary. |
| Where does wall state live? | Canonical state in `Core::SmartObject` + `Architecture::WallDefinition` attributes; geometry is generated. |
| Who is allowed to change state? | Only registered command handlers via `Core::CommandBus`. Direct UI/Tool writes prohibited. |
| How does geometry regenerate? | Domain geometry engines (`WallGeometry`, etc.) construct SketchUp groups from definition state. |
| How do events propagate? | `Core::EventBus#publish` broadcasts immutable events to registered subscribers upon transaction commit. |
| How are dependencies tracked? | Explicit relationship records (`kind: 'host'`, `target_id: ...`) indexed by `Core::DependencyGraph`. |
| How is Undo handled? | Native SketchUp operations managed by `Core::TransactionManager` and `Host::ModelTransactionAdapter`. |
