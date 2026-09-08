# Core Platform

Status: Accepted foundation specification  
Module ID: `constructflow.core`

## Mission

Provide the smallest stable runtime and semantic infrastructure shared by every ConstructFlow module. Core owns no roof, cabinet, pipe, paving or other domain-specific construction behavior.

## Owns

- Project identity/settings
- Smart-object core envelope
- Stable object ID generation
- Units
- Phase/lifecycle registry
- Level/datum registry
- Grid registry foundation
- Module registry/loader
- Command bus
- Event bus
- Transaction/Undo integration contract
- Persistence envelope/index
- Selection/context registry
- Shared Host/Connector contract registry
- Capability/provider registries
- Runtime diagnostics

## Must not own

- wall/roof/structure generation;
- drainage formulas;
- cabinet logic;
- paving patterns;
- BOQ domain formulas;
- domain QA rules;
- AI-specific construction shortcuts.

## Project

Project state includes at minimum:

- project ID/name/code;
- unit settings;
- benchmark/datum references;
- phase definitions;
- levels;
- module/schema metadata;
- project library references/snapshots;
- revision linkage metadata where required.

## Units

Foundation canonical internal length unit: millimetres.

Domain/platform output normalizes to declared units. UI may display project-selected metric formats without changing canonical persisted values unexpectedly.

## Stable ID

Core generates `cf_<uuid>`-style stable IDs independent of SketchUp entity IDs.

Copy/duplicate behavior must prevent accidental duplicated stable IDs.

## Lifecycle

Core implements generic `created_phase` / `demolished_phase` semantics and phase-view resolution. Domain modules may add domain status but cannot redefine base lifecycle.

## Levels

Core LevelRegistry provides:

- stable level ID;
- name/type;
- elevation relative to datum;
- semantic roles (FFL/GL/SSL/etc. configurable);
- dependent object lookup/capability.

Domain modules decide how their objects react when a referenced level changes.

## Commands

Core registers/dispatches versioned commands and owns transaction orchestration infrastructure. Domain command behavior remains owner-module code.

Core commands include:

- `CreateProject`
- `SetWorkingPhase`
- `CreateLevel`
- `ModifyLevel`
- `DemolishObject` at generic lifecycle layer where domain override is not required
- smart-object repair/conversion infrastructure commands.

## Events

Core event bus provides publish/subscribe and correlation metadata. Domain-specific event names can be registered by modules.

## Module registry

Tracks:

- module ID/version;
- dependencies;
- capabilities;
- object types;
- commands;
- events;
- providers;
- validators;
- migration handlers;
- UI contributions.

Invalid module registration must be atomic.

## Persistence

Core persists shared envelope and preserves unknown module namespaces. It coordinates load/migration order but does not migrate private domain payload itself.

## Transactions / Undo

SketchUp model mutations must use operation boundaries. A command transaction groups semantic and geometry mutation so Undo/Redo acts coherently.

## Developer diagnostics

Expose inspectable:

- smart-object envelope;
- module registry;
- command/event log (bounded runtime history);
- relationships/connectors;
- schema/migration health;
- dirty states.

## Acceptance criteria

Foundation gate references AC-CORE/PHASE/LEVEL/CMD/EVT in `architecture/ACCEPTANCE-CRITERIA.md`.

Additional:

- AC-CORE-M01: missing optional module does not prevent unrelated smart objects/core project loading.
- AC-CORE-M02: unknown module namespace is preserved on save.
- AC-CORE-M03: module registration failure rolls back all partial registrations.
- AC-CORE-M04: Core contains no hard-coded switch over all future domain object types for ordinary operation.
- AC-CORE-M05: provider/capability registries allow a new module to participate without modifying Core source.