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
- R0 transaction boundary hardening: semantic command handlers, synchronous event side-effects and nested delegated commands now share one native SketchUp operation, with abort/commit regression coverage;
- R0 native preflight hardening: acceptance readiness now requires a saved model plus native `undo`/`redo` API availability before the persistence gate can be exercised;
- R0 acceptance command safety: preflight, reopen and Undo/Redo verification commands no longer open a native modeling operation, so native Undo/Redo probes cannot target their own wrapper transaction;
- R0 transaction nesting safety: nested handler/reconciliation failures no longer abort an outer native operation from the wrong transaction frame, allowing the owning command to decide whether to continue or abort;
- R0 Undo/Redo evidence probe: native acceptance can now detect semantic-state mutations after baseline capture, execute native Undo and Redo, compare full Smart Object/domain attribute snapshots, and record the result as a native-only checkpoint;
- Smart Wall / Opening / Door-Window architecture foundations and plan representations;
- R1/R2 Plan Interaction Engine slice: architecture plan preset entry, plan snapping/inference, wall/floor/room/ceiling draw and wall edit preview, direct Smart Wall move/stretch commands, plan-resolved hosted opening and Door/Window placement, automatic architecture-plan refresh and hosted-opening reconciliation;
- R3 Parametric/Constraint foundation: shared deterministic type/instance/formula evaluation with cycle protection, Door/Window and Joinery consumers, and dependency-safe Align/Lock/Offset/Equal/Fixed Distance/Parallel/Perpendicular/Centered/Host/Attach/Level projection; `Equal` now enforces a reference-point or explicit distance instead of being a no-op;
- R3 constraint validation hardening: Align/Offset/Equal/Fixed Distance/Parallel/Perpendicular/Centered/Host/Attach/Lock/Level preconditions are rejected before geometry projection when required references, points or distances are missing;
- R3 Smart Wall constraint consumer: persisted wall constraints now round-trip with the wall definition and project path points before level resolution and 3D rebuild, so the shared Constraint Engine affects an actual production object;
- R3 wall constraint editing: `ChangeWallConstraints` now replaces a wall dependency set through the command bus, validates it before mutation, rebuilds geometry and invalidates hosted/downstream representations as one semantic operation;
- R3 Door/Window parametric instance state: instance parameters now persist with the semantic object and flow through shared formula evaluation into Door/Window 2D/3D geometry and quantity calculations;
- R3 Joinery parametric state: Cabinet Run parameters now persist and drive shared formula-derived usable width/height/opening dimensions used by cabinet geometry, joinery parts and quantity calculations;
- R5 Schedule Editor foundation: traceable schedule rows with editable instance/type fields, protected calculated fields, typed value normalization and updater propagation boundary;
- R6 wall documentation representations: Architecture now exposes shared wall `elevation` and `section` providers derived from the same Smart Wall definition, with scale-aware metadata and annotations;
- R5/R6 associative documentation anchors: wall elevation/section annotations now carry `source_object_id` plus deterministic `anchor_key`, preserving semantic association through documentation refresh;
- R5 Door/Window schedule integration: schedule rows now delegate legal instance/type edits through `EditDoorWindowSchedule` to existing domain commands, while calculated dimensions/area remain read-only;
- R3 Door/Window type propagation: `MakeUniqueType` now rebuilds the selected infill and updates its opening attachment before emitting geometry/quantity/drawing/schedule invalidation, keeping type-instance state aligned;
- R5 Room schedule integration: `Room Schedule` exposes editable name/number/program/usage fields through `EditRoomSchedule`, protects calculated area/perimeter fields, and invalidates plan/quantity/drawing outputs;
- R5 Structural member schedule integration: `Structural Beam Schedule` exposes editable material/engineering status through `EditBeamSchedule`, protects calculated length/volume/section fields, and invalidates geometry, quantity and drawing outputs;
- R5 Column schedule integration: `Structural Column Schedule` exposes editable material/engineering status through `EditColumnSchedule`, protects calculated height/volume/section fields, and rebuilds/invalidate dependents through the same command boundary;
- R2 Room enclosure detection: deterministic room-bounding wall graph cycle detection for plan-generated room boundaries;
- Cross-object propagation: Smart Object Manager now walks reverse relationship dependencies transitively so host edits invalidate hosted/generated representations and downstream quantities/drawings together;
- Native-runtime propagation boundary: Architecture `GeometryChanged` now reconciles hosted Opening geometry and cascades an event for Door/Window infill rebuilds;
- R2 host resolution workflow: missing/incompatible Opening hosts can be scanned and marked `unresolved_host` with durable resolution metadata, then explicitly rebound through `ResolveOpeningHost` with geometry and relationship rebuild;
- R1 wall copy: Plan Wall Edit now has a copy mode and `CopyWall` creates a new Smart Wall identity with explicit hosted-opening warning;
- R1 placement feedback: shared Plan Interaction Engine now reports `valid`, `invalid` and `no_host` states; Opening Tool previews host placement validity before commit;
- R1 host interaction feedback: Door/Window and Opening plan tools now transiently highlight the semantic host wall in green/red during placement, without creating preview geometry or mutating the model;
- R0/R1 native preview bounds: Wall draw/edit and hosted placement tools now implement SketchUp `Tool#getExtents`, so transient previews remain inside the native redraw bounds;
- R0 native tool coverage: all current ConstructFlow tools that implement transient `draw` overlays now expose `Tool#getExtents`, including architecture, hosted opening, structure, drainage, surface, roof and joinery tools;
- R0 native tool contract guard: the test suite now fails if a future tool adds a transient `draw(view)` overlay without also defining `getExtents`;
- R0 preview-bounds correctness: boundary-tool extents now retain hover coordinates as a point (rather than flattening x/y/z scalars), preventing native redraw errors while a boundary is being drawn;
- R2 hosted placement alignment: Opening Tool reuses one interaction/snap state for preview and commit, using the host wall physical centerline as its placement reference;
- R2 hosted opening editing: Architecture Plan now has an Opening Edit Tool that resolves the semantic opening/host, snaps along the host wall, previews the moved span and commits through `ModifyOpening` with the existing host validation and rebuild path;
- R2 direct hosted infill placement: Plan Door/Window now previews and places directly on a Smart Wall through `PlaceDoorWindowOnWall`, composing `CreateOpening` and `CreateDoorWindow` inside the shared command/transaction boundary while retaining selected-Opening placement;
- R2 hosted propagation reliability: Wall → Opening → Door/Window `GeometryChanged` reconciliation now uses TransactionManager-aware subscribers, so dependent geometry rebuilds remain undo-safe and nested chains share the active native operation;
- R2 hosted event scoping: Door/Window reconciliation now consumes only Opening-originated geometry events, preventing self-triggered duplicate rebuilds;
- R1/R2 geometry event scoping: Architecture room reconciliation now consumes only Architecture-originated wall geometry events, preventing Opening events that mention a host wall from triggering duplicate room reconciliation;
- R1 command-to-plan synchronization: Plan Scene runtime now subscribes to every `GeometryChanged` event, so command/schedule/AI edits refresh the architecture plan representation after the semantic transaction;
- R1 wall location lines: Wall geometry, hosted-opening coordinates and plan representation now resolve center/core/finish-face location lines through one physical centerline calculation;
- R1 wall level constraints: Create Wall and subsequent path/type/transform edits resolve `top_constraint: level` into deterministic base elevation and height from base/top elevations and offsets before geometry creation;
- R3 level dependency propagation: `LevelChanged` now rebuilds affected constrained walls, refreshes level metadata, invalidates hosted dependents and publishes follow-on `GeometryChanged` events;
- R2/R3 architectural level propagation: level edits also rebase Floor, Room and Ceiling boundaries (including holes and offsets), refresh level metadata and publish downstream geometry invalidation;
- R1 location-line editing: Plan wall endpoint grips convert physical centerline picks back to stored location-line coordinates before StretchWallEndpoint;
- R1 level metadata synchronization: path/type edits update wall `level_refs` together with constrained geometry, so plan, 3D and level-aware selection use the same semantic state;
- R1/R4 shared plan references: Floor/Room/Ceiling/Column tools and the Plan Interaction Engine now collect architecture, structure and roof footprint references through one traceable Smart Object collector;
- R7/R8 common reference coverage: the same collector now includes Surface boundaries and Drainage pipe routes for cross-domain plan placement and coordination;
- R4 roof plan editing: Roof Footprint Tool now creates `roof.system` semantic objects from Plan boundaries with shared snapping, footprint closure, slope and covering inputs;
- R4 roof forms: RoofDefinition/Geometry now support deterministic `gable` and `hip` facets in addition to flat/lean-to, avoiding non-planar single-face generation;
- R4 roof surface quantity: gable/hip roof area now sums 3D facet areas instead of applying the lean-to approximation, keeping roof quantity/BOQ values aligned with generated geometry;
- R4 roof boundary editing: shared Plan Boundary Edit Tool now supports Roof repository/field adapters, enabling vertex stretch through `ModifyRoofBoundary`;
- R4 structure plan interaction: Column Tool now snaps/ previews against shared architectural and structural plan references before CreateColumn;
- R4 structural face snapping: Column plan references now expose center and four face snap points through the shared collector/interaction engine;
- R4 wall face references: Plan Interaction now receives wall axis plus physical face paths from the same Smart Wall location-line calculation, enabling structural placement against wall faces without raw SketchUp geometry picks;
- R4 level-aware structural snapping: Grid/Beam/Column plan tools request references scoped to their base level, preventing cross-storey snaps while retaining unlevelled shared references;
- R4 structural grid foundation: `structure.grid` is a persisted, plan-editable Smart Object with level-aware geometry, plan representation/source identity, and shared snap references consumed by Column and other plan tools;
- R4 structural beam foundation: `structure.beam` is a persisted, plan-drawable and plan-editable member with section/material metadata, level-aware rebuild, plan representation, quantity/drawing invalidation and shared snap references;
- R4 structural beam level propagation: Base Level changes rebase Beam path/elevation and rebuild the member through the shared Structure geometry adapter, with regression coverage alongside Column/Foundation propagation;
- R4 beam support relationships: Beam endpoint proximity resolves deterministic `supported_by` links to Columns or Walls, maintains inverse `supports` links and resynchronizes them on Beam path edits;
- R4 beam coordination capability: structural coordination now accepts Beam objects and exposes conservative 3D bounding boxes for clash/host/rebar consumers;
- R4 roof-to-rainwater invalidation: hosted gutter and connected downpipe geometry reconciliation now emits explicit `GeometryChanged` events for downstream plan/document refresh after roof edits;
- R4 roof-to-structure coordination: Roof generation and footprint/slope edits now reconcile symmetric `supported_by`/`supports` relationships to nearby Architecture Walls and Structure Beams/Columns, clearing stale supports when the footprint moves;
- R4 Beam quantity/BOQ integration: structural Beam volume and side-formwork quantities now flow through the existing traceable Structure provider and Construction Takeoff with material and phase metadata;
- R8 joinery interaction alignment: Cabinet Run placement now uses shared plan snapping and traceable architecture/structure/roof references instead of raw cursor coordinates;
- R8 surface/paving interaction alignment: Plan Surface Boundary Tool now draws arbitrary boundaries with shared snapping, closure and level-aware placement before `CreateSurfaceBoundary`;
- R8 surface dependency propagation: Surface boundary edits now rebuild hosted paving borders, reset pattern layouts to preview/clear stale solved pieces, and invalidate parking layouts transitively through Smart Object relationships;
- R9 BOQ currentness: ConstructionTakeoff now records per-object dirty flags/current state and stale IDs; ConstructionCurrentnessAudit blocks publication when the live extension scope still has `dirty_quantity` or `dirty_dependents`;
- R7 drainage interaction alignment: Manhole placement/relocation and internal route-node editing now use shared plan snapping and architectural/structural/roof references;
- R7 shared MEP semantic contract: ConnectorRegistry now validates every network edge with the common source/destination/system contract and preserves optional flow/load metadata, giving Drainage and future Electrical networks one topology boundary;
- R2 ceiling holes: Create/Modify Ceiling command paths now preserve and validate hole loops through geometry and quantity representations;
- Architecture manifest parity: ceiling quantity capability is now declared in module provider metadata as well as registered at runtime;
- R2 boundary editing: shared Plan Boundary Edit Tool now selects and drags Floor/Room/Ceiling outer vertices through their Modify commands;
- R1 selection filters: Plan tools now share type/level-aware selection filtering instead of independent object-type checks;
- R1 wall reference parity: Wall draw/edit now consume the same traceable PlanReferenceCollector as Floor/Structure/Roof/Surface/Drainage tools, so Draw and Align share cross-domain snap references;
- R1 snap traceability: PlanInteractionEngine now carries `source_object_id`/`source_type` from shared plan references into snap results, preserving the selected alignment/host evidence for downstream commands;
- R1 wall endpoint snapping: multi-path wall references now classify their vertices as true endpoint candidates, preserving endpoint priority over midpoint/reference candidates;
- R1 intersection traceability: intersection snaps now carry both contributing source object IDs/types, preserving junction evidence when a wall meets a grid, column, roof or other plan reference;
- R1 snap determinism: equal-distance snap candidates now use stable source identity and coordinates as tie-breakers, so Draw/Align results do not depend on reference enumeration order;
- R1 reference projection snap: Plan Interaction Engine now snaps to the nearest point along reference segments when no higher-priority intersection/endpoint/midpoint candidate is within tolerance, preserving traceable source identity;
- R0/R1 invalid-pick hygiene: Wall Draw now clears stale hover/preview state immediately when a click has no valid native InputPoint, even before the next mouse-move callback;
- R1 active-level entry point: Open Architecture Plan Editor now asks for an optional base level and passes it into Wall Tool, keeping plan snapping/drawing on the selected storey instead of silently mixing levels;
- R1 active-plane elevation: Wall Draw projects cursor and snap input onto the selected level elevation before preview and commit, preventing visible preview-to-model Z jumps;
- R1 wall-draw preselection: Wall Draw now shows the snapped start target and `Click to start Smart Wall` before the first click, making the initial Draw interaction discoverable;
- R1 wall constraint-toggle reliability: Wall Draw and Wall Edit ignore repeated Shift key events, so orthogonal/free mode changes exactly once per key press in both plan workflows;
- R1 shared active-plane elevation: Floor, Room and Ceiling Draw now project cursor/snap input onto the selected level elevation too, keeping the core architectural plan tools on one editing plane;
- R1 edit-plane snapping: Wall Edit and Floor/Room/Ceiling Boundary Edit now project cursor input onto the active level before snapping, preserving endpoint/intersection alignment on elevated storeys;
- R1 shared plan-level context: Wall, Floor, Room and Ceiling Draw/Edit tools now use `Core::PlanLevelContext` for one normalized active-level projection rule, with pure-Ruby coverage for elevated, missing and unlevelled contexts;
- R1 hosted active-level filtering: Opening and Door/Window plan placement now accept an optional base level and reject incompatible Smart Wall hosts before preview or placement;
- R1 hosted-level relationship filtering: Door/Window placement now resolves an existing Opening's host wall before level matching, so openings without their own level metadata cannot bypass storey isolation;
- R1 hosted level provenance: Door/Window placement carries the selected `level_id` into the semantic command payload, preserving active-plan context for traceability and downstream validation;
- R1 opening level provenance: Opening Plan Tool now carries its selected `level_id` into `CreateOpening`, activating the command-level storey guard for the direct opening workflow too;
- R1 hosted command level validation: `PlaceDoorWindowOnWall` now validates the requested level against the resolved host wall at the command boundary, protecting non-UI/API callers from cross-storey placement;
- R1 infill command level validation: `CreateDoorWindow` now resolves its Opening's host wall and validates the requested level before creating a Door/Window instance;
- R1 infill level-validation behavior: regression tests cover both mismatched and matching Opening-host levels before Door/Window creation;
- R1 opening command level validation: `CreateOpening` applies the same requested-level check before building a hosted opening, including nested/composite callers;
- R1 opening-host replacement level validation: `ResolveOpeningHost` applies the same level check to replacement walls, preventing dependency repair from creating a cross-storey hosted relationship;
- R1 hosted level-validation safety: host level lookup now fails closed with a diagnostic when semantic definition data cannot be read, rather than silently bypassing the storey guard;
- R1 hosted level-validation safety coverage: regression tests verify the fail-closed diagnostic path when a host definition cannot be read;
- R1 opening level-validation behavior: regression tests exercise both rejection and successful validation paths for `CreateOpening`, alongside the Door/Window composite command;
- R1 hosted level-validation behavior: regression tests exercise both rejection of a mismatched host level and successful continuation into opening validation;
- R1 hosted preview/commit parity: Door/Window placement now commits the same snapped wall point shown in preview, and existing Opening targets highlight their resolved host wall with native extents support;
- R0/R1 hosted input safety: Door/Window placement now requires a valid native `InputPoint` before resolving a target or committing hosted geometry;
- R1 opening-edit active-level filtering: Opening Edit now resolves each opening's host wall and filters selection by the optional active level, keeping hosted edits on the same storey as placement;
- R1 opening-edit command provenance: Opening Edit carries its active `level_id` into `ModifyOpening`, whose command validation rechecks the existing host wall before mutation;
- R1 opening-edit preselection: Opening Edit now previews the hovered hosted opening in cyan with an explicit edit label before selection, resolving its host definition for native overlay extents;
- R1 wall-edit active-level filtering: Plan Wall Edit and Copy now accept the same optional active level as Plan Wall Draw, filtering selectable Smart Walls while preserving automatic level inference when no level is supplied;
- R1 wall-edit preselection: Plan Wall Edit and Copy now draw a cyan hover wall with an explicit action label before selection, making the Select → Move/Stretch interaction discoverable and keeping the transient overlay inside native tool extents;
- R1 boundary-edit active-level filtering: Floor, Room and Ceiling boundary editing now accepts the same optional active level and filters selectable plan objects before vertex manipulation;
- R1 boundary-edit preselection: Floor, Room and Ceiling boundary tools now show a cyan hover boundary with an explicit edit label before selection, matching Wall Edit discoverability and native redraw extents;
- R1 reference diagnostics: malformed semantic plan references are now reported through the runtime diagnostic log with source object/type context while valid references continue to be collected;
- R1/R2 dependency provenance: derived room/opening geometry events now preserve the originating command ID through reconciliation, keeping Draw/Stretch/Level-change traces auditable across dependent rebuilds;
- R1 legacy level compatibility: shared plan reference filtering now accepts both structured and legacy string level references, preserving level-aware snapping during model migration;
- R1 cross-domain level scope: Wall Edit, Floor/Room/Ceiling boundary tools, Surface/Paving boundaries and Joinery cabinet placement now pass their active/base level through the shared PlanReferenceCollector, preventing cross-level snap contamination;
- R1 semantic level isolation: shared plan references now fall back to a definition's semantic `level_id`/`base_level_id` when legacy objects lack `level_refs`, preventing known cross-storey geometry from entering the active plan snap graph;
- R1 Smart Wall segment editing: Plan Wall Edit now distinguishes endpoint, segment and whole-wall gestures; `MoveWallSegment` translates only the selected polyline segment with the same hosted-opening validation and 3D rebuild path;
- R1 wall orientation editing: `FlipWallOrientation` reverses the semantic wall side/orientation while preserving its path, level constraints, hosted-opening validation and dependent geometry invalidation;
- R1 numeric wall editing: Plan Wall Edit now accepts typed distances while stretching an endpoint, using the same cursor direction and unit parser as initial wall drawing;
- R1 polyline stretch correctness: typed-distance endpoint edits now choose the adjacent vertex as the anchor for middle polyline vertices, keeping numeric length behavior local to the selected grip;
- R1 wall edit grips: Plan Wall Edit now renders endpoint grips and a selected segment midpoint grip in the transient tool overlay, making endpoint/segment/whole-wall gestures discoverable before commit;
- R1 temporary dimensions: Plan Wall Edit now displays wall, segment, anchor-to-grip and typed-length dimensions during the active edit gesture;
- R0/R1 native numeric input: Wall Tool and Plan Wall Edit now explicitly enable SketchUp's VCB before consuming `onUserText`, with a native tool contract test preventing regressions;
- R1 transient-state hygiene: plan, structure, drainage, surface, roof and joinery tools now clear stale hover/preview points when SketchUp reports an invalid input pick;
- R0/R1 warning hygiene: the extension and test Ruby sources pass Ruby warning-mode syntax checks with no unused-local warnings; the full pure-Ruby suite passes with 483 tests, 2,355 assertions, 0 failures and 0 errors;
- R1 chain-draw recovery: Wall Tool advances its chained start point only after `CreateWall` succeeds, preserving the last valid interaction state when level resolution or command validation fails;
- R0 model observer timing: New/Open model callbacks now defer attachment through SketchUp's zero-delay UI timer when available, allowing the model to finish initialization before Smart Object scanning and native observer binding;
- R0/R1 tool lifecycle hygiene: Wall Draw and Wall Edit clear transient preview, selection and numeric-input state on native `deactivate`, preventing stale interaction state when SketchUp switches tools without `onCancel`;
- R1 hosted-tool lifecycle hygiene: Door/Window placement and Opening draw/edit tools now clear host highlights, previews and selected hosted state on native `deactivate`;
- R1 native tool lifecycle contract: the pure-Ruby contract suite now guards Wall, Opening and Door/Window plan tools against adding transient state without a `deactivate(view)` cleanup boundary;
- Roadmap evidence contract: documentation tests now verify the complete R0→R10 release ordering and the full North-star wall-change workflow, not only selected milestone labels;
- Scope continuity evidence contract: documentation tests now verify that the Master Plan explicitly retains the existing Extension, Drainage, Paving, Landscape, Joinery, BOQ, QA and AI scope while resequencing delivery;
- R0 packaging smoke: the current working tree packages into a valid RBZ with the expected `constructflow.rb` / `constructflow/` root layout and `constructflow/bootstrap.rb`; archive integrity passes with 267 Ruby/source files and 324 archive entries (verified using the available 7-Zip ZIP backend);
- R1 architecture boundary lifecycle: Floor, Room, Ceiling and Boundary Edit tools now clear in-progress points, hover previews and selected boundary state on native `deactivate`;
- Shared plan-tool lifecycle: Surface/Paving, Roof, Drainage manhole/route-node and Joinery cabinet tools now clear transient points, previews and selected nodes on native `deactivate`, extending the common interaction foundation beyond Architecture;
- Shared plan-tool lifecycle coverage: Structure Column, Beam and Grid tools now clear hover/segment state on native `deactivate`, and the contract suite guards the full current cross-domain tool set;
- Shared plan-tool lifecycle invariant: every current tool with a transient `draw(view)` overlay is now required by an automatic contract test to provide `deactivate(view)` cleanup;
- R2 room-wall dependency: rooms created by wall enclosure detection retain source wall provenance; subsequent wall `GeometryChanged` events reconcile their boundaries/areas while leaving manually drawn rooms untouched;
- R7 generated wall parity: Extension wall regeneration now reconciles wall joins and transitive hosted dependents; when a generated host wall is removed, dependent Openings are marked `unresolved_host` with durable resolution metadata instead of silently retaining a dead host ID;
- R2 room enclosure failure handling: when a tracked wall-generated room can no longer be detected as closed, the Room Smart Object is marked `stale`, records a durable enclosure reason, and raises `dirty_qa`/quantity/drawing flags instead of silently retaining a misleading result;
- R2 level-aware room detection: wall enclosure graphs are filtered by the requested/room base level, preventing rooms from being inferred across storeys;
- R1 wall join reconciliation: every wall create/path/transform/type mutation now derives a deterministic, symmetric L/T/X join graph from physical centerlines, preserves butt/miter/disallow intent, and removes stale joins when walls move apart;
- R1 shared active-plane coverage: Surface/Paving boundaries and Structural Grid/Beam/Column plan tools now use `PlanLevelContext` for the same level-elevation projection as architectural plan tools, including structural base offsets, keeping elevated-storey previews and committed points on one interaction plane;
- R1 hosted active-plane parity: Opening and Door/Window placement/edit tools now project cursor snaps through the same active-level context before host location, so hosted previews and committed offsets remain aligned with the selected storey;
- R1 planar snap correctness: `PlanInteractionEngine` now measures plan snap tolerance in XY by default while preserving the candidate's authoritative Z, so walls/hosts with large level or base offsets remain selectable and alignable from plan; an explicit non-planar mode remains available for 3D distance checks;
- R1 wall type interaction: Plan Wall Edit now exposes a native `T` gesture after selection to change thickness/type ID through `ChangeWallType`, then reloads the same Smart Wall definition and refreshes plan/3D representations;
- R1 wall edit key reliability: Plan Wall Edit now ignores repeated native `F` key events during orientation flip, preventing a held key from toggling the same wall multiple times;
- R1 inferred-level edit safety: Wall and architectural Boundary Edit rebind `PlanLevelContext` after selecting an object when no level was entered, preserving elevated-object Z during endpoint/boundary edits and restoring the initial context on cleanup;
- R1 Smart Wall schedule: Architecture now exposes a traceable Wall Schedule with editable type/thickness fields and calculated dimensions/volume; edits delegate through `ChangeWallType`, preserving the same geometry/quantity/drawing/plan invalidation boundary;
- R1 relative wall dimensions: Plan Wall Edit now interprets signed endpoint input such as `+500 mm`/`-500 mm` as a delta from the current segment length, while unsigned input remains an absolute target length;
- R5 schedule scope alignment: Smart Wall is now listed alongside Door/Window, Room and structural schedules in the Master Plan/Roadmap, matching the implemented type/thickness schedule editor;
- R1 level workflow entry point: the native ConstructFlow menu now exposes `Create Level` and routes its persisted datum through the existing `CreateLevel` command before Plan Editor work begins;
- R1 level edit entry point: the native ConstructFlow menu now exposes `Edit Level` through `ModifyLevel`, activating the existing LevelChanged dependency reconciliation path for plan-created objects;
- R1 level inspection entry point: the native ConstructFlow menu now exposes `Show Levels`, backed by ordered persisted registry IDs and datum elevations, so active Plan Editor context can be selected from inspectable project state;
- R1 project workflow entry point: the native ConstructFlow menu now exposes `Edit Project`, preserving stable project identity while persisting project name/code before level and Plan Editor work;
- Evidence boundary alignment: Master Plan now explicitly separates application/native-contract proof from the remaining real SketchUp/LayOut gate, avoiding a pure-Ruby green suite being mistaken for native interaction or persistence proof;
- Entrypoint alignment: `docs/IMPLEMENTATION-ENTRYPOINT.md` now points developers to the active R0→R1 Plan Editor flow and the same North-star interaction sequence as the Master Plan/Roadmap;
- R0 project transaction safety: `Edit Project` now routes through `UpdateProjectMetadata` and emits `ProjectChanged`, keeping project metadata edits inside the core command/transaction boundary;
- R1 joined wall geometry: Smart Wall polylines without openings now rebuild as one continuous mitered prism, while opening-bearing segments retain cut-cell generation;
- R4 Structure level dependencies: constrained Columns and their supported generated Foundations now rebuild and propagate elevation changes from `LevelChanged` while preserving Smart Object traceability;
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

Implemented application-level evidence includes Smart Wall semantics, Existing/New lifecycle representation, hosted Openings, Door/Window infill foundations, Extension attachment host resolution/wall suppression, quantity providers, plan representations, drawing invalidation, Extension-generated Architecture walls and the initial R1 plan draw/direct-manipulation slice. The remaining gate decision must be based on the required real SketchUp interaction/persistence evidence, including the specific Draw/Convert/direct-manipulation acceptance paths.

R4 Structure evidence now includes level-driven Structural Column propagation: when a referenced Base/Top Level changes, the column elevations, stored location, generated geometry, level references and dependent dirty flags are reconciled, followed by a `GeometryChanged` event. Generated Foundations supported by those Columns now follow the new base elevation and rebuild their geometry while preserving their top offset. Pure-Ruby regression coverage is present; native SketchUp interaction and save/reopen proof remains pending.

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
