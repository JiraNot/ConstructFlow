# Extension Construction Workflow

Status: Accepted v1 foundation contract

## Purpose

Define the end-to-end construction package workflow for an `extension.zone` without collapsing domain ownership boundaries or creating a second semantic model.

The workflow turns one Extension Smart Object into a coordinated, reviewable construction package by composing existing domain commands, quantity providers, drawing representations and LayOut issue-set services.

## Pipeline

The v1 pipeline is:

1. Resolve the source `extension.zone` and its persisted `ExtensionDefinition`.
2. Build the dependency-safe Extension orchestration plan.
3. Execute enabled domain bridges through public CommandBus commands.
4. Aggregate domain-owned quantities for the source Extension and objects generated from it.
5. Run the construction quality gate.
6. Build the construction drawing issue set from active domain families.
7. Refresh the required SketchUp plan scenes using Extension-scoped object IDs.
8. Build renderer-neutral sheet plans.
9. Optionally export a native LayOut document and PDF when the quality gate permits publication.

Dry-run stops after orchestration preview and must not generate domain geometry, quantities, drawing scenes, LayOut files or PDFs.

## Ownership invariants

- Extension owns orchestration only.
- Structure, Surface, Roof, Drainage, Interior and Electrical retain ownership of their Smart Objects and geometry.
- Domain generation occurs only through public commands such as `GenerateOrUpdate<Domain>FromExtension`.
- Quantity values are produced by the owning domain quantity provider; the workflow only aggregates them.
- Drawing semantics are produced by domain Representation Providers; the workflow only selects presets, scopes objects and composes sheets.
- LayOut/PDF export remains owned by the Drawing/LayOut platform.
- AI callers use the same public command boundary as human/automation callers.

## Source relationship and scope

Generated construction objects are associated with the Extension through:

- relationship kind: `generated_from`
- target: source Extension Smart Object ID
- role: `extension_source`
- stable domain-specific slot metadata where the domain bridge supports it.

Construction takeoff and domain drawing scopes must use this relationship rather than selecting all objects in the project.

Architecture context is the v1 exception: Architecture, Opening and Door/Window Smart Objects may be included as project background because an Extension commonly attaches to an existing building. This is contextual drawing background, not Extension-owned geometry. A future attachment-host graph may narrow this context further.

## Quantity package

`ConstructionTakeoff` aggregates quantity items for supported Extension-related Smart Objects while preserving each provider's:

- source object ID
- source module
- classification
- unit
- phase scope
- formula version
- confidence/source state.

Totals group by `(phase_scope, classification, unit)` and must retain the contributing source object IDs.

A missing definition is a coverage error. A provider failure is a review condition and must never be silently converted into a numeric zero.

## Construction quality gate

The quality gate combines execution state, source confidence, structural approval, Drainage completeness/network QA and quantity coverage.

Required principles:

- failed execution or dirty domains block publication;
- Strict QA treats `assumed`, `unknown` and `verify_on_site` construction inputs as blocking;
- Strict QA requires structural engineering status `engineer_approved` or `as_built` for generated structural members represented in the package;
- enabled Drainage with no resolved Extension drainage Smart Object is unresolved, not implicitly successful;
- Drainage routes continue to use explicit connectors and gravity/network QA;
- quantity definitions that are missing block publication;
- warnings remain visible in the package result.

`preliminary` structure is useful for coordination but is not engineer-approved construction information.

## Drawing package

The v1 construction set uses available `*.construction` view presets for active families:

- Architecture — `A-101`
- Structure — `S-101`
- Roof — `R-101`
- Plumbing/Drainage — `P-101`
- Surface/External Works — `L-101`
- Interior/Joinery — `I-101`
- Electrical — `E-101`.

Only active families are included. Domain plan scenes for Structure/Roof/Drainage/Surface/Interior/Electrical must be refreshed with the source Extension plus objects related through `generated_from`; they must not accidentally render generated objects belonging to another Extension.

Architecture context may include project Architecture/Opening/Door-Window objects as noted above.

The issue set carries revision, issue status, title-block metadata and template scope into the existing Drawing/LayOut pipeline.

## Publication states

The workflow result uses:

- `preview` — dry-run only;
- `blocked` — execution or QA does not permit publication;
- `ready` — package is built and publishable but export was not requested;
- `exported` — requested native export completed;
- `export_failed` — export was requested but no successful export result was returned.

The workflow must never report `exported` when the QA gate blocks publication.

## Public command

`RunExtensionConstructionWorkflow` is the public orchestration command for human, automation and later AI callers.

The command itself does not open one giant SketchUp transaction. Domain commands retain their own CommandBus transaction boundaries; scene refresh and native export retain their own platform-specific boundaries.

A `ConstructionWorkflowCompleted` event reports the resulting package state.

## Acceptance criteria

- AC-CWF-001: one Extension plan can dispatch every enabled v1 domain bridge without missing-command failure.
- AC-CWF-002: takeoff totals are traceable to Smart Object IDs and phase scope.
- AC-CWF-003: Strict QA blocks preliminary structural engineering status.
- AC-CWF-004: Strict QA blocks enabled-but-unresolved Drainage.
- AC-CWF-005: dry-run mutates no geometry/drawing/export outputs.
- AC-CWF-006: issue-set families follow generated Extension content plus explicit Architecture context.
- AC-CWF-007: refreshed domain scenes are scoped so another Extension's generated domain objects are excluded.
- AC-CWF-008: publication/export cannot proceed when the quality gate is not publishable.
- AC-CWF-009: the same semantic Smart Objects feed geometry, quantities, plan representations and LayOut output; no duplicate 2D semantic model is introduced.
