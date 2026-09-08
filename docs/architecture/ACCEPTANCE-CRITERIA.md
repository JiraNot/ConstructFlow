# Acceptance Criteria Registry — Foundation v1

Status: Accepted foundation contract.

This file defines cross-platform acceptance criteria. Module-specific criteria belong in each module spec and reference these IDs where applicable.

## Core / runtime

### AC-CORE-001 — Extension boot

Given a supported SketchUp installation, installing/loading the extension must register ConstructFlow once without duplicate menu entries or uncaught exceptions.

### AC-CORE-002 — Stable object identity

A created smart object must retain the same ConstructFlow stable ID after save, SketchUp restart and reopen.

### AC-CORE-003 — Namespaced persistence

Core and domain metadata must be stored in their owned namespaces; one module must not overwrite another module's private persisted keys.

### AC-CORE-004 — Transaction integrity

A failed/rejected mutation command must leave neither partial geometry nor partial smart-object metadata.

### AC-CORE-005 — Undo/Redo

Undo and Redo must restore/reapply semantic metadata and associated geometry as one user-visible operation for supported commands.

### AC-CORE-006 — Module isolation

A domain module can be disabled/unavailable without preventing unrelated modules and Core from loading, except for declared required dependencies.

### AC-CORE-007 — Module manifest validation

Invalid module manifests are rejected with actionable diagnostics and do not partially register capabilities.

## Lifecycle / phase

### AC-PHASE-001 — Existing to remain

An object created in Existing with no demolition phase appears in Existing, Demolition context as remain, and Proposed according to phase-view rules.

### AC-PHASE-002 — Demolition history

Demolishing an existing object does not raw-delete semantic history; demolition and proposed views derive correctly from lifecycle fields.

### AC-PHASE-003 — New work

New-construction objects are excluded from Existing view and appear in Proposed view.

### AC-PHASE-004 — Replace construction

Replacing existing construction creates distinct old/new smart-object IDs, old demolition lifecycle, new construction lifecycle and replacement relationships.

### AC-PHASE-005 — Revision separation

Changing drawing/model revision must not change object created/demolished phase semantics.

## Levels

### AC-LEVEL-001 — Semantic level reference

A level-referenced object persists the semantic level ID and offset rather than only raw Z position.

### AC-LEVEL-002 — Level propagation

Changing a level through an approved command updates or invalidates dependent objects according to owner-module rules and never silently leaves them treated as current.

### AC-LEVEL-003 — Unknown existing level

Existing-condition objects may represent unknown/verify-on-site levels without forced invented values.

## Commands / events

### AC-CMD-001 — Common command path

Equivalent UI and AI operations invoke the same registered domain command, not separate mutation implementations.

### AC-CMD-002 — Validation before mutation

Commands with invalid dimensions/hosts/connectors are rejected before committing invalid production state.

### AC-EVT-001 — Event propagation

A successful source-domain mutation publishes documented events that allow dependent services to mark their own state dirty without source-domain hard calls.

### AC-EVT-002 — Subscriber failure isolation

A derived subscriber failure is surfaced and its subsystem marked error/dirty without silently corrupting already valid owner-domain state.

## Library / catalog

### AC-LIB-001 — Project-safe assets

A placed catalog asset remains usable/readable from the project even if the source library is unavailable.

### AC-LIB-002 — Swap Type

A valid `Swap Type` preserves semantic object identity, lifecycle and compatible placement/host relationships while changing the catalog/type variant.

### AC-LIB-003 — Replace Construction

`Replace Construction` uses lifecycle replacement semantics and must not be implemented as a simple type swap.

### AC-LIB-004 — Version safety

A newer library asset version does not silently rewrite an existing project instance without an explicit update policy/action.

## Connectors / networks

### AC-CONN-001 — Compatibility

Connect mode only commits a connection when registered connector capabilities are compatible.

### AC-CONN-002 — Semantic topology

Network connections remain queryable without requiring full physical pipe/wire geometry.

### AC-CONN-003 — Manhole relocation

Relocating an existing manhole creates demolition/new history, reconnects or flags affected network segments, validates slope/invert when known, and dirties quantities/drawings.

### AC-CONN-004 — Unknown invert

Unknown existing invert levels produce a `verify-on-site`/uncertain validation state rather than fabricated drainage slopes.

## Quantities

### AC-QTY-001 — Domain-owned formula

A quantity line is produced by its owner-domain provider or an explicitly documented fallback, not an unrelated platform heuristic.

### AC-QTY-002 — Traceability

Every BOQ quantity line can identify its source smart object(s), provider and formula version.

### AC-QTY-003 — Phase scope

Demolition and new-work quantities are separable by lifecycle scope.

### AC-QTY-004 — Dirty state

A geometry/parameter/catalog change affecting quantities marks those results stale until recalculation completes.

## Drawings

### AC-DWG-001 — Phase-derived view

Existing, Demolition and Proposed drawings are generated from one semantic project model using lifecycle filters.

### AC-DWG-002 — Dirty state

A relevant model change marks affected drawing views/schedules dirty; the UI/export process must not silently present them as current.

### AC-DWG-003 — Semantic tags

Object tags/schedule rows reference smart objects/types and survive reasonable geometry regeneration without manual retagging.

### AC-DWG-004 — Export integrity

An issued/exported drawing set records current project/revision metadata and refuses or clearly warns on dirty required views.

## UX

### AC-UX-001 — Context-first tools

Selecting an object exposes relevant actions/properties without requiring the user to navigate unrelated module tools.

### AC-UX-002 — Direct manipulation

At least the primary MVP parametric objects support direct model manipulation for their main dimensions without forcing all changes through text forms.

### AC-UX-003 — Concept vs construction

A supported object can remain lightweight in concept/design LOD and be enriched later without recreating it from scratch.

### AC-UX-004 — Legacy conversion

Supported existing SketchUp geometry can be converted into a smart object while preserving the chosen geometry and receiving semantic metadata.

## QA

### AC-QA-001 — Registered validators

Modules can register validators without modifying QA core.

### AC-QA-002 — Cross-domain clash reporting

Coordination checks identify source objects, rule and actionable context instead of returning only anonymous intersecting faces.

### AC-QA-003 — No false engineering approval

Structural generation/check results are presented as modeling/constructability assistance and do not claim licensed engineering approval.

## Documentation

### AC-DOC-001 — Spec traceability

New production commands/objects/events introduced by a feature are documented with owner module and contract before or in the implementation PR.

### AC-DOC-002 — ADR for breaking architecture

Breaking cross-module or persisted-data architecture changes include an ADR or explicit accepted architecture-spec amendment.

## Foundation milestone gate

Foundation v1 is considered ready for the first production Architecture module when AC-CORE-001 through AC-CORE-007, AC-PHASE-001 through AC-PHASE-005, AC-LEVEL-001 through AC-LEVEL-003, AC-CMD-001/002, AC-EVT-001 and AC-DOC-001/002 have passing evidence.