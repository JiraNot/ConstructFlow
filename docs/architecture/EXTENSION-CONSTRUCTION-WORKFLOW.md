# Extension Construction Workflow

Status: Accepted v1 foundation contract

## Purpose

Define the end-to-end construction package workflow for an `extension.zone` without collapsing domain ownership boundaries or creating a second semantic model.

The workflow turns one Extension Smart Object into a coordinated, reviewable construction package by composing existing domain commands, quantity providers, drawing representations and LayOut issue-set services.

## Pipeline

The v1 pipeline is:

1. Resolve the source `extension.zone` and its persisted `ExtensionDefinition`.
2. Resolve model-local Extension Construction Intent and merge any explicit per-run domain overrides.
3. Build the dependency-safe Extension orchestration plan from Generator defaults plus the effective domain overrides.
4. Execute enabled domain bridges through public CommandBus commands.
5. Aggregate domain-owned quantities for the source Extension and objects generated from it.
6. Run the construction quality gate.
7. Build the construction drawing issue set from active domain families.
8. Refresh the required SketchUp plan scenes using Extension-scoped object IDs.
9. Audit package currentness against the current Smart Object graph.
10. Build renderer-neutral sheet plans.
11. Optionally export a native LayOut document and PDF only when both construction QA and package currentness permit publication.

Dry-run stops after orchestration preview and must not generate domain geometry, quantities, drawing scenes, LayOut files or PDFs.

## Ownership invariants

- Extension owns orchestration and its own persisted construction-generation intent only.
- Structure, Surface, Roof, Drainage, Interior and Electrical retain ownership of their Smart Objects and geometry.
- Domain generation occurs only through public commands such as `GenerateOrUpdate<Domain>FromExtension`.
- Quantity values are produced by the owning domain quantity provider; the workflow only aggregates them.
- Drawing semantics are produced by domain Representation Providers; the workflow only selects presets, scopes objects and composes sheets.
- LayOut/PDF export remains owned by the Drawing/LayOut platform.
- AI callers use the same public command boundary as human/automation callers.

## Construction intent resolution

Durable project choices are stored separately from the base `ExtensionDefinition` under the Extension Construction Intent contract. This is especially important for explicit Drainage connector endpoints, which must survive later boundary/roof changes rather than being remembered only by a one-off workflow invocation.

Effective domain configuration resolves with the following precedence:

`Generator defaults < persisted Extension Construction Intent < per-run workflow overrides`

The workflow result includes a `construction_intent` trace containing persisted domain overrides, ephemeral run overrides and the resulting effective domain overrides. This trace explains generation inputs without duplicating domain Smart Object definitions.

Per-run overrides do not mutate persisted intent. Persistence changes only through the explicit Extension construction-intent command boundary.

Missing construction-intent storage is valid for legacy projects and behaves as an empty persisted override set.

## Source relationship and scope

Generated construction objects are associated with the Extension through:

- relationship kind: `generated_from`
- target: source Extension Smart Object ID
- role: `extension_source`
- stable domain-specific slot metadata where the domain bridge supports it.

Construction takeoff and domain drawing scopes must use this relationship rather than selecting all objects in the project.

Architecture context is the v1 exception: Architecture, Opening and Door/Window Smart Objects may be included as project background because an Extension commonly attaches to an existing building. This is contextual drawing background, not Extension-owned geometry. A future attachment-host graph may narrow this context further.

## Structural construction baseline

The default Structure Extension intent includes `foundation: auto`. The executable Structure bridge therefore produces a preliminary vertical support pair for each Extension corner:

`Extension corner → generated Column → generated Foundation`

Both objects remain Structure-owned Smart Objects. Foundations use reciprocal `supports` / `supported_by` relationships with their generated columns and `generated_from` provenance to the source Extension. Boundary topology changes reconcile both member and foundation slots so stale structural geometry cannot remain in model, takeoff or drawings.

These generated members are preliminary construction coordination objects. Automatic geometry and quantities do not constitute engineering approval; Strict Construction QA continues to require `engineer_approved` or `as_built` status before publication.

## Quantity package

`ConstructionTakeoff` aggregates quantity items for supported Extension-related Smart Objects while preserving each provider's:

- source object ID
- source module
- classification
- unit
- phase scope
- formula version
- confidence/source state.

Structure coverage includes generated columns, foundations and semantic rebar sets when those objects are related to the source Extension. Foundation concrete and formwork quantities come directly from `StructureQuantityProvider`; the Extension workflow does not calculate foundation quantities itself.

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

Persisting an intent never upgrades confidence or engineering status. A persisted preliminary assumption remains preliminary and subject to the same QA gate.

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

The Structure plan uses the same Structure Smart Objects and may show generated column/foundation representations according to the requested construction LOD. It must not rediscover foundations from raw SketchUp geometry.

Architecture context may include project Architecture/Opening/Door-Window objects as noted above.

The issue set carries revision, issue status, title-block metadata and template scope into the existing Drawing/LayOut pipeline.

## Package currentness audit

A successful domain execution is not sufficient evidence that an issue package is current. Regeneration can remove or replace derived Smart Objects, so quantity and drawing outputs must be checked against the Smart Object graph that exists **after** reconciliation.

`ConstructionCurrentnessAudit` provides this proof. It records a deterministic SHA-256 scope fingerprint and verifies:

- ConstructionTakeoff coverage contains the current source Extension plus all current `generated_from` objects and no foreign/stale IDs;
- each refreshed drawing preset was requested with the exact current family scope from `ConstructionIssueSetFactory`;
- rendered drawing IDs still exist in the Smart Object index;
- rendered generated-domain IDs belong to the selected Extension family scope rather than another Extension;
- publication requiring native export has a current drawing refresh in the same workflow run.

The audit result is `current` or `stale` and has its own `publishable` flag. Native LayOut/PDF export requires both `ConstructionQualityGate.publishable` and `ConstructionCurrentnessAudit.publishable`.

The scope fingerprint is traceability evidence, not a replacement for object IDs or revision metadata. A source or generated-object membership change must cause the package to be re-audited; old takeoff/drawing references must never be accepted merely because the previous workflow succeeded.

## Change propagation proof

The required non-dry propagation proof is:

`Extension source/intent change → effective construction intent → domain regeneration/reconciliation → current Smart Object graph → current takeoff → current drawing scope → currentness audit → issue/export gate`

For structural topology shrink, obsolete generated foundations and columns are removed before package assembly. Their IDs must be absent from the rebuilt takeoff coverage/items and from the refreshed Structure drawing scope. Reusing pre-change takeoff or drawing references after the source change must make the currentness audit fail.

For persisted Drainage configuration, a later source geometry change must continue to supply the same explicitly selected connector IDs unless an explicit reconnect/disable command changes that intent.

## Publication states

The workflow result uses:

- `preview` — dry-run only;
- `blocked` — execution, construction QA or package currentness does not permit publication;
- `ready` — package is built and publishable but export was not requested;
- `exported` — requested native export completed;
- `export_failed` — export was requested but no successful export result was returned.

The workflow must never report `exported` when either the QA gate or currentness audit blocks publication.

## Public command

`RunExtensionConstructionWorkflow` is the public orchestration command for human, automation and later AI callers.

The command itself does not open one giant SketchUp transaction. Domain commands retain their own CommandBus transaction boundaries; scene refresh and native export retain their own platform-specific boundaries.

A `ConstructionWorkflowCompleted` event reports the resulting package state, including currentness and construction-intent traceability evidence.

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
- AC-CWF-010: default Structure orchestration produces generated foundations with columns, and their concrete/formwork quantities and Structure plan representations flow through the same package pipeline.
- AC-CWF-011: structural topology reconciliation removes obsolete generated foundations before the current takeoff/drawing package is assembled.
- AC-CWF-012: a non-dry Extension topology change removes stale generated IDs from the current Smart Object graph, rebuilt takeoff and rebuilt drawing scope.
- AC-CWF-013: pre-change takeoff/drawing references fail the package currentness audit after source reconciliation.
- AC-CWF-014: native issue/export publication requires both construction QA and package currentness to be publishable; export cannot bypass a missing current drawing refresh.
- AC-CWF-015: persisted Extension Construction Intent is merged into every workflow plan before domain orchestration, with per-run overrides taking precedence only for that invocation.
- AC-CWF-016: a workflow rerun with no Drainage override reuses persisted explicit connector endpoints rather than reverting to missing endpoint intent.
