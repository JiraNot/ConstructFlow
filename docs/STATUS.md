# ConstructFlow Specification Status

This file is the current high-level implementation dashboard. It is informational; authoritative requirements remain in the referenced specifications and accepted architecture contracts.

Active delivery is standalone-first under ADR-0006 and `ROADMAP.md`. `.cfproj`, the shared command runtime and native 2D/3D/takeoff/sheet engines define the product baseline. Ruby/native entries below are adapter evidence; F0–F3 native closures are not prerequisites for standalone releases.

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

### Standalone semantic foundation — 2026-10-07

- Added root `npm run build:standalone` and `npm run dev:standalone` entrypoints. They compile the
  domain packages in dependency order before Plan Editor; `--install` runs each package's locked
  `npm ci` on first setup, and subsequent builds refresh Plan Editor's local `file:` package copies
  before bundling. The dev launcher binds Vite to localhost. The full root build command completed
  successfully without running test suites. The dev entrypoint also started a live app
  at `http://127.0.0.1:5175/` (5174 was already occupied); HTTP returned 200 and the browser loaded
  Kitchen Proof with 4 columns/foundations/beams, 4 walls, one door and one window, plus separated
  Existing-to-remain and New Construction takeoff lines.
- `command-runtime`, `structure-engine`, `architecture-engine`, `catalog-engine` and
  `extension-engine` execute independently of React/SketchUp (ADR-0006).
- Atomic batches discard all draft changes and downstream envelopes after any rejection/failure.
- `.cfproj` v2 now uses stable catalog UUIDs, instance overrides, deterministic v1 migration,
  and schema validation at import/command commit boundaries.
- Added a legacy Kitchen Proof `.cfproj` v1 fixture with 18 Smart Objects and 17 catalog types.
  Its generator migrates the fixture twice and verifies deterministic v2 serialization, stable
  Smart Object UUIDs, generated UUID v5 catalog identities, and recovery of the 150 mm Existing
  wall as an instance override. `node scripts/generate_legacy_migration_fixture.mjs` passed.
- v1 migration now canonicalizes UUID-form `type_id` references to lowercase before catalog
  matching, so valid uppercase UUIDs still resolve to the canonical catalog identity.
- Project/catalog metadata, relationship meta, Smart Object metadata, and CQRS envelope/handler
  inputs now use explicit `unknown`-based contracts instead of `any`; catalog parameters expose
  typed fields for current structural and opening families, with unknown extension fields.
- Plan Editor now exposes local `.cfproj` open/save, Undo/Redo buttons, Ctrl/Cmd+Z and
  Ctrl/Cmd+Y. History snapshots restore the same UUIDs; Undo/Redo clears queued incremental
  sync envelopes, so a full sync is required afterward. Adapter Undo/Redo replay is not wired.
- Browsers without the File System Access open picker now use an accessible label directly
  associated with the local file input; it supports keyboard activation and keeps the input out
  of the accessibility tab order. The native picker route remains available where supported.
- The editor now warns before replacing any project with unsaved content and registers the
  browser's standard leave-page warning while the current serialized model differs from its
  saved snapshot. File System Access API saves clear the dirty state; download fallback keeps
  it dirty because the browser does not confirm that the user retained the downloaded file.
  Replacement confirmation compares against the last loaded/saved or newly generated starter
  baseline, so a pristine in-memory starter is still labeled unsaved-to-disk but can be replaced
  without a false data-loss prompt.
- Added an explicit Download Copy control next to Save. It always exports the current canonical
  `.cfproj` snapshot through the browser download path, while Save can continue using the local
  file handle and overwrite the opened project.
- Local file reading/writing now runs through a small editor adapter. `npm run verify:file-io`
  verifies malformed-document rejection before replacement, canonical serialization, a real
  temporary-disk roundtrip with persistent object UUID checks, complete write-before-close
  ordering, identical takeoff and A-02/S-01/A-08 outputs after reopen, and abort after write or
  close failure using a fake browser file handle.
  A dev-only `file-workflow-test.html` harness now supplies an in-memory File System Access API
  handle to the real Plan Editor UI. App-level Open → phase edit (dirty state) → Save → Open was
  exercised through the visible controls: the reopened project retained `active_phase: existing`,
  all 18 Smart Objects and their UUIDs, the 5.600 m joint-treatment BOQ line, and generated A-02,
  S-01 and A-08 views. This verifies editor-to-adapter wiring without invoking an OS picker;
  native picker interaction and a real browser-owned file handle remain a separate UI gate.
  The harness also supports an opt-in disk-backed mode (`CONSTRUCTFLOW_FILE_ACCEPTANCE=1`,
  `?disk=1`) whose Vite dev middleware writes only a randomly named project under the OS temp
  directory. Browser UI acceptance opened, phase-edited, saved and reopened that file; disk
  verification found 31,752 bytes, 18 persistent UUIDs and `active_phase: existing`. The reopened
  file compiled 13 takeoff rows and A-02/S-01/A-08. This proves the UI-to-file-handle-to-disk path
  with a test handle, while native picker selection and a user-chosen real file overwrite remain
  unverified.
  A separate browser acceptance run opened the real `examples/kitchen-extension-proof.cfproj`
  through the HTML file-input fallback and confirmed its 18 Smart Objects, phase-separated BOQ and
  pile-length warnings in the UI. A later Save-fallback run on that local file produced
  `E:\New folder\CF-KITCHEN-PROOF-001 (7).cfproj` (31,752 bytes); `verify:kitchen-file` accepted
  its 18 objects, 13 takeoff rows, 5.60 m joint and A-02/S-01/A-08. The browser then reopened that
  exact downloaded copy through the HTML file-input route and showed the Existing phase and phased
  BOQ. This closes the local download-save/reopen acceptance path; native picker and browser-owned
  file-handle overwrite remain unverified.
- Live localhost UI acceptance in the in-app browser created Kitchen Proof (4 columns, 4 pile
  caps, 4 beams, 4 walls, a door and a window), switched 2D ↔ 3D, selected the Existing host wall
  in 3D, and changed its removal phase to Demolition. The visible BOQ moved the wall's 7.00 m²
  and 1.05 m³ from `existing_to_remain` to `demolition_site_prep`. Changing that wall from W1 to
  W2 in the 2D properties panel updated the schedule/BOQ; two Undo actions restored the original
  wall type and phase. Dragging a selected wall through the 3D transform gizmo emitted one
  `MoveWall` mutation while retaining the same selected object UUID; Undo restored the clean
  model and emptied the pending mutation queue. The viewport now suppresses the pointer-up
  raycast after a completed transform, preventing the same drag from selecting an unrelated wall.
- A fresh browser session on the current build created Kitchen Proof and loaded the lazy 3D view;
  both views retained the same 4 columns, foundations, beams, 4 walls, openings and phased BOQ.
  Download Copy displayed its requested-file status. Although the browser-control surface returned
  no download event, the resulting 31,389-byte `.cfproj` was found in Windows' configured Downloads
  folder and parsed through `readProjectFile` as canonical JSON with 18 objects, the expected
  object-family counts, and 16 pile heads. `compileInitialDrawingSet` then generated A-02, S-01,
  and A-08 from that downloaded file and verified the 4.00 × 2.50 m envelope, four foundations,
  and ALL LEVELS schedule. A later Save-fallback artifact was opened from disk through the HTML
  file-input route and showed the same 18-object model, Existing phase, joint line and phased BOQ.
  Native picker selection and overwrite of a user-selected browser-owned file remain unverified.
- Latest browser smoke includes the modeled Existing-to-New expansion joint. The BOQ displays
  `รอยต่อเดิม–ใหม่` at 5.600 m; Download Copy produced
  `E:\New folder\CF-KITCHEN-PROOF-001 (4).cfproj` (31,760 bytes). `verify:kitchen-file` reopened
  that exact disk file and confirmed 18 objects, the 5.60 m joint line, and A-02/S-01/A-08.
  Re-running `verify:kitchen-file` after Smart Object UUID enforcement still passes with 18
  objects, 13 takeoff lines, the 5.60 m joint line, and A-02/S-01/A-08. Native picker open/reopen
  and actual Save-handle overwrite are still separate unverified steps.
- Kitchen Proof assembly now lives in `extension-engine` and dispatches the Existing host wall
  plus the 4.00 × 2.50 m extension as one atomic command batch; the UI button uses this same
  factory. A generated example `.cfproj` was written and read back through the project serializer
  with identical canonical JSON. The editor Open/edit/Save/Open UI roundtrip has since passed with
  a mocked File System Access handle; native picker selection and real-handle overwrite remain
  separate unverified gates.
- Kitchen F1 now has a preliminary I-18 pile-cap representation: four 2×2 pile-head offsets per
  cap, four caps in the proof fixture, 16 counted pile heads total. S-01 draws plan-only symbols
  and marks length TBD; takeoff reports counts only and warns for each foundation. Pile length,
  capacity, soil design and engineering approval are intentionally unspecified; 3D still shows
  pile caps only. Focused runtime acceptance passed serialization roundtrip, takeoff count and
  S-01 content checks.
- Preset generation now links foundations using `supported_column_id`, provides hosted opening
  coordinates, assigns steel/AAC materials and honors terrace beam elevation input.
- Catalog cascades are restricted by object family, preventing overlapping W1 marks from
  updating both walls and windows.
- Project validation now checks finite coordinates/elevations, positive type and instance
  dimensions, wall endpoint/length consistency, known foundation kinds, beam/column links,
  foundation/column links and hosted-opening wall bounds/height/level consistency on import
  and command commit. Smart Object map keys must be RFC-4122 UUIDs; case-variant duplicate IDs
  are rejected. Known catalog/override fields are also rejected when assigned to an
  incompatible family (for example, `size_mm` on a beam or `sill_height_mm` on a wall).
- Latest verification on Windows: `node scripts/test_standalone.mjs` rebuilt all standalone
  packages and Plan Editor, then passed 7 project-model, 4 representation-engine, 2 architecture-engine,
  5 clash-engine, 3 sheet-engine, 19 command-runtime and 6 extension-engine tests (46 total).
  `npm run verify:kitchen` and `npm run verify:file-io` also pass; the latter includes a real
  temporary-disk roundtrip and persistent UUID comparison. These checks do not cover the native
  browser file picker, full migration/UI acceptance, or broader domain-specific takeoff coverage.

### Standalone A3 drawing issue set — 2026-10-07

- Added `packages/sheet-engine` to compile the current semantic project into vector A3
  landscape sheets A-02 (phased ground plan, 1:100), S-01 (foundation/column plan, 1:100),
  and A-08 (opening schedule and schematic type elevations, 1:50).
- A-02 uses the Master Specification phase colors and line conventions, includes meter-based
  overall dimensions, draws only the lowest-elevation (ground) level, and reports when the
  fixed-scale viewport may clip model extents. S-01 is likewise limited to ground-level grids,
  columns and hosted foundations.
- A-02 fits all visible level objects in the viewport but dimensions the architectural wall
  envelope, excluding foundation extents. Kitchen Proof now reports 4.00 × 2.50 m rather
  than 4.80 × 3.30 m from the foundations' overhang.
- A-08 reads catalog definitions and instance overrides, displays dimensions in meters, and
  reports missing catalog families or truncated schedules. S-01 flags pile caps without a
  modeled pile layout instead of implying pile-detail completeness.
- A-02 opening cutouts and door/window symbols now resolve width from the same precedence
  (instance override → instance value → type catalog) used by A-08, so catalog changes and
  instance overrides cannot make plan symbols disagree with the schedule.
- Sheet frame scope now follows rendered content: A-02/S-01 identify their displayed level and
  A-08 identifies all levels, instead of always printing the project's active level.
- Added a reproducible drawing artifact generator from `examples/kitchen-extension-proof.cfproj`.
- Added three `sheet-engine` regressions for deterministic A3 output/scales, shared kitchen
  envelope/opening/foundation content and warnings, and the all-level opening schedule.
- The Type Catalog UI now renames a selected type through `RenameCatalogType`; a browser smoke
  renamed the kitchen window type, confirmed the schedule/BOQ mark and pending mutation changed,
  then used Undo to restore W1 and clear the queue. Successful renames also update the matching
  active placement-tool type, avoiding creation commands that still reference the old mark.
  Runtime acceptance verifies family-scoped cascading, persistent UUIDs, invalid-name rollback,
  serialization/reload and Undo/Redo.
  It writes A-02, S-01 and A-08 as A3 landscape SVGs plus a manifest. Focused compiler acceptance
  verifies the three IDs, page dimensions, 1:100 / 1:100 / 1:50 scales, A-02 4.00 × 2.50 m
  wall dimensions and phased openings, four foundations/four columns, four preliminary I-18 pile
  groups, visible LENGTH TBD labels, A-08 ALL LEVELS and catalog dimensions. S-01 reports one
  grouped warning for unspecified pile length. Re-generation produced identical SHA-256 hashes. XML parsing
  then found an unescaped ampersand in the A-08 in-sheet heading; the compiler now escapes it, and
  all three generated SVGs parse as XML and retain their A3 dimensions and content assertions.
- The BOQ panel can open a browser print view for these three sheets; print-to-PDF is provided
  by the browser. Thai text shaping/font embedding, verified print scale, official titleblock
  compliance, complete 20-sheet coverage and PDF roundtrip validation remain open.
- Verification: `npm run build:standalone` and XML/content validation for all generated SVGs passed.
  Vite still reports the existing lazy Three.js vendor chunk at 602.91 kB raw / 152.18 kB gzip.

### Standalone spatial bounds foundation — 2026-10-07

- Added `packages/clash-engine` with conservative 3D AABBs for columns, foundations, beams and
  walls and a packed R-tree broad phase that returns candidate intersections from the project
  document. Bounds resolve current catalog values and instance overrides and retain lifecycle,
  level and host metadata. The R-tree rejects non-finite or inverted query/entry bounds.
- Added a conservative interaction classifier: explicit host-linked overlaps are
  `intentional_connection`, near-zero penetration is `boundary_contact`, and other AABB overlaps
  remain `overlap_candidate`. None of these is a final hard/soft clash verdict. Slanted-wall AABB
  overreach, opening subtraction, MEP clearances and code/rule evidence still need exact or
  domain-specific logic.
- Verification: `npm ci --ignore-scripts --no-audit --no-fund` and `npm run build` in
  `packages/clash-engine` passed. Five focused S3 tests now verify multi-level R-tree search
  against brute-force AABB intersections, deterministic unique candidate pairs, and retention of
  phase/host metadata plus catalog instance overrides. Candidate pairs remain broad-phase results.
- Standalone build order now compiles `takeoff-engine` and `sheet-engine` before Plan Editor,
  so the app's local package imports do not depend on ignored/stale `dist` output in a clean CI checkout.
- The working-phase selector now dispatches the existing `SetWorkingPhase` CQRS command,
  records the change in editor history, and emits its command envelope instead of mutating the
  project document directly in a React event handler.
- Initial takeoff is connected to the editor: concrete volumes for columns/beams/foundations,
  net wall area/volume after hosted openings, opening counts and CSV output. The kitchen fixture
  now carries UUID-linked expansion-joint treatment metadata on its Existing host wall; takeoff
  derives 5.60 m from the two New wall heights, updates when either wall height changes, and drops
  the quantity when the host is demolished. The BOQ visibly distinguishes demolition, new work,
  existing-to-remain reference quantities and remodeling joints. Flashing, chemical dowels, unit
  rates, labor and waste factors remain outside this first slice.
- Focused catalog-to-takeoff acceptance passed on Kitchen Proof: changing B1 depth from 400 to
  500 mm through `UpdateStructuralTypeDimensions` affected all four beam instances and changed
  new-construction beam volume from 1.040 m³ to 1.300 m³. Serialize/deserialize preserved 1.300 m³.
- Takeoff now reads Smart Object payloads as `unknown`, validates numeric section/size tuples,
  resolves catalog references safely and skips invalid geometry with explicit warnings instead
  of relying on unchecked `any` casts.
- Takeoff now sends every object with a non-null `removed_phase` to the demolition/site-prep
  cost center, preserving the phase in which it was removed; demolition-created objects use
  the same center. This prevents removed existing work from being reported as existing-to-remain.
- Kitchen acceptance now checks takeoff before and after demolition: the Existing host wall's
  7.00 m² / 1.05 m³ moves from `existing_to_remain` to `demolition_site_prep`, while new work
  remains in its own center. One Undo/Redo restores the corresponding phase and quantities.
- Takeoff line aggregation now includes the computed formula in its grouping key. Kitchen Proof
  beams with equal B1 type/material but different spans therefore report separately: 0.640 m³
  for two 4,000 mm spans and 0.400 m³ for two 2,500 mm spans, rather than showing one span
  formula beside a combined 1.040 m³ quantity. Browser smoke on the live standalone app showed
  these separate values and the phase-separated wall/opening quantities from the same model.
- Three.js/WebGL is now available as a lazy-loaded 3D view over the same model. It renders
  phase-colored structure/architecture/openings, cuts hosted door/window holes from walls,
  allows selection and property editing, and moves columns, walls, supported foundations, and
  hosted openings with a transform gizmo. Opening drags project onto the host wall centerline and
  dispatch `MoveOpening`, preserving host and object UUIDs while recalculating the wall-relative
  offset. Foundation drags route through the linked column's `MoveColumn` command so supported
  beams and foundations remain in the same transaction.
- Added `packages/representation-engine` as a renderer-neutral 3D description provider. It resolves
  geometry dimensions, catalog and instance overrides, effective phase, wall cutouts and supported
  interactions outside React; `Model3DViewport` now only converts those descriptors to Three.js
  meshes and routes gestures to commands. Three tests cover deterministic output, phase/identity,
  catalog-resolved hosted cutouts and malformed-opening diagnostics.
- Plan Canvas now directly moves selected columns, walls and hosted doors/windows. Wall drags use
  `MoveWall` so hosted openings follow in the same transaction; opening drags project onto the
  host centerline and clamp to a valid span before `MoveOpening`. The architecture engine owns and
  tests the point-to-wall projection used by the UI.
- Plan Editor now sends 2D `MoveColumn` coordinates without an explicit zero Z, preserving the
  column's existing vertical datum while the command continues to move linked foundations/beams.
  Runtime regression coverage verifies datum retention on a non-zero Z input.
- Plan rendering, hit testing and snapping now share active-level visibility from
  `representation-engine`: walls/openings and beams resolve to their assigned levels, foundations
  to their base level, and spanning columns appear on each level between their base and top. This
  prevents an upper-level beam from obscuring a ground-floor wall in the 2D editor.
- Browser smoke on the Kitchen Proof model confirmed Ground Floor shows its walls/openings without
  the L2 beams, while First Floor shows the beams and spanning columns. A 2D drag moved the host
  wall with its door still 2.00 m from the wall start; the mutation stream contained one `MoveWall`,
  and Undo restored the model and cleared pending events.
- A Kitchen Proof starter creates an Existing host wall plus the 4.00 × 2.50 m kitchen preset
  with new structure, walls, door and window. The starter is assembled from the shared command
  runtime and can be saved as `.cfproj`.
- The kitchen preset now places columns/foundations/walls/openings at the active level datum,
  links columns to the next higher project level, and places perimeter beams at that level's
  elevation. Focused runtime checks passed for the standard GF/L2 model and custom +0.250 m /
  +3.650 m levels; the existing fixture retained all 18 object UUIDs while adding explicit
  column/beam level references.
- `UpdateLevel` now propagates a changed top-level elevation into dependent structural columns
  and hosted beam endpoints in the same command transaction, reports those UUIDs as updated, and
  remains covered by one-batch Undo. Focused runtime acceptance changed L2 from +3.000 m to
  +3.400 m, reconciled 4 columns and 4 beams, and restored all geometry with one Undo.
- Kitchen Proof F1 now represents four preliminary I-18 pile-head positions on each of four caps.
  Takeoff counts 16 heads and warns per foundation that length is missing; S-01 marks symbols as
  plan-only and labels lengths TBD. Pile lengths, geotechnical design/capacity and engineering
  approval remain open. The 3D viewport intentionally renders only the pile caps without a length.
- Kitchen/carport preset beams now keep start/end column UUID links; moving a column updates
  associated beam endpoints and supported foundations in the same command transaction.
- `MoveWall` translates a wall and its hosted opening locations in one domain command, keeping
  UUIDs, wall-relative opening offsets and host relationships intact during 3D gizmo edits.
- `MoveOpening` moves doors/windows along the host wall, recalculates their center coordinates,
  rejects offsets that exceed host boundaries, and retains host links/UUIDs. Command-runtime tests
  verify door and window movement, atomic rollback, Undo and Redo.
- The 3D gizmo restores its preview mesh when a transform is a sub-millimeter no-op or the
  corresponding command rejects, so a failed edit cannot leave viewport geometry out of sync with
  the semantic project.
- Structural movement acceptance now proves `MoveColumn` updates linked foundations and beam
  endpoints/spans with stable UUIDs, supports Undo/Redo, and rejects a zero-span collapse without
  partial changes. This also validates the transaction reused when dragging a supported footing.
- Command-runtime integration tests now move both the door-host and window-host walls in the
  Kitchen Proof fixture, check the same opening UUIDs/host links/offsets and translated geometry,
  then Undo/Redo the whole batch. A rejected second move also proves that the first move and all
  envelopes roll back.
- Latest verification after Smart Object UUID import validation: `node
  scripts/test_standalone.mjs` passes 7 project-model, 5 clash-engine, 3 sheet-engine,
  18 command-runtime and 6 extension-engine tests (39 total) and builds the full standalone app.
  Kitchen, local-disk file IO and drawing generation acceptances
  pass separately; manual interaction smoke is recorded below.
- Manual browser smoke on the 4.00 × 2.50 m Kitchen Proof: selected a wall in 3D, dragged its
  gizmo, and confirmed its property panel still reports one hosted D1 at 2.00 m from the wall
  start; Undo returned the pending mutation queue to zero. Changing the working phase emitted
  `SetWorkingPhase`; Undo restored New Construction and cleared the queue.
- Latest live-editor verification selected a 3D wall, set `REMOVAL PHASE` to Demolition, and
  observed its quantity move immediately into `demolition_site_prep`; clearing the removal phase
  restored Existing/New cost centers. The editor was reset to a clean Kitchen Proof afterward.
- Follow-up browser smoke loaded Kitchen Proof and confirmed 4 columns, foundations, beams,
  4 walls, one door and one window; Existing-to-remain and New Construction quantities appeared
  as separate cost centers. Selecting Existing emitted `SetWorkingPhase`; Undo restored New
  Construction and reduced the pending queue to zero. The 3D view control also mounted.
- Fresh isolated-tab smoke created Kitchen Proof from the toolbar, switched 2D → 3D → 2D,
  and confirmed the same 4 columns/foundations/beams, 4 walls, one door and one window with
  Existing-to-remain and New Construction quantities still present after the view changes.
  This confirms the live render path; it does not verify file save/reload or the A3 print path.
- Open now uses the File System Access picker where supported and retains that file handle for
  in-place Save; browsers without the API use the existing file-input and download fallbacks.
  Opening a valid file or starting a replacement Kitchen Proof now warns before discarding edits
  when the current model is both changed and has undoable history.
  The download fallback attaches its hidden anchor to the document before clicking. In the
  current browser test context, `showSaveFilePicker` is unavailable and no download event was
  observable; save/reopen roundtrip therefore remains unverified. Edge's downloads page was
  blocked by browser URL policy and was not inspected through another path.
- The editor now compares the serialized current model with the last file opened or written via
  a file handle and displays an accessible unsaved/saved status. The download fallback reports
  that a download was requested but does not clear the unsaved state because disk completion
  cannot be confirmed by that path.
- Active-level selection now dispatches `SetWorkingLevel` through the runtime and appears in the
  mutation stream. The floor-to-floor control updates GF height and L2 elevation with two
  `UpdateLevel` commands in one history batch, so one Undo restores both levels. The runtime and
  Plan Editor production builds passed; browser smoke confirmed level selection and Undo, and a
  focused runtime invocation confirmed the paired level update and one-step Undo. Browser-driven
  editing of the numeric spinbutton did not take effect in the current Edge control surface.
- Browser acceptance opened the actual saved copy through the HTML file-input fallback, changed
  phase to Existing, saved a new `.cfproj` download to disk, and reopened that exact file in the UI.
  Save and Download Copy events remain unobservable through the browser-control event API, but the
  written file was found on disk and passed `verify:kitchen-file`. In the reopened saved model,
  editing a 3D beam's phase updated its BOQ row and Undo restored the clean state; dragging a 2D
  column moved its hosted foundation and beam endpoints, updated takeoff lengths, and Undo restored
  the saved coordinates and cleared the mutation queue. Native picker selection and overwrite of a
  user-chosen browser-owned file remain unverified; Edge file upload automation also requires an
  extension permission that was not enabled.
- With the expanded validation active, the browser-loaded starter model and the 4.00 × 2.50 m
  Kitchen Proof both initialized successfully; the kitchen still reports four columns, four
  foundations, four beams, three new walls plus the existing host wall, one door and one window.
- The Three.js vendor chunk is 602.91 kB uncompressed (152.18 kB gzip); it loads on demand.
- S0 is in progress; supported foundation/column/beam/wall/opening records now receive
  geometry and host-reference validation, and the v1 migration contract no longer exposes
  `any`. Project-model tests now cover deterministic v1 migration, stable object UUIDs, UUID v5
  catalog IDs, the Existing-wall instance override, UUID case normalization and ambiguous-mark
  rejection, and UUID enforcement for imported Smart Object IDs. Catalog type rename now has UI
  and runtime acceptance; remaining S0 gates include broader domain validation and native picker/
  real file-handle save/reopen acceptance.
- Full geometry/clash/takeoff/sheet engines and native adapter acceptance remain open.
  See [the standalone review](STANDALONE-ENGINE-REVIEW-2026-10.md).

ConstructFlow has achieved major end-to-end milestones with the **2D Plan Editor Web/Desktop Application** and the **SketchUp 3D Synchronization Bridge**, alongside the core SketchUp extension architecture:

### 2D Plan Editor & SketchUp 3D Sync (Vertical Slices 01 & 02)
- **Monorepo Architecture:** TypeScript packages `@constructflow/project-model` and `@constructflow/command-schema` shared with `apps/plan-editor` (React + Canvas + Tailwind) and mirrored by `apps/sketchup-extension`.
- **Slice 01 (Structural Foundation):**
  - Interactive 2D Canvas with Pan, Zoom, Wheel navigation and dynamic grid lines (A-C, 1-3) with snapping.
  - Column placement (`CreateColumn`, C1/C2) with grid intersection snapping and dedicated Type Catalog management.
  - Hosted Foundation placement (`CreateFoundation`, F1/F2) anchored directly to columns.
  - Beam placement (`CreateBeam`, B1/B2/RB1) with 2-click linear drawing connecting columns and live span calculation.
- **Slice 02 (Architecture & Openings):**
  - Smart Wall drawing (`CreateWall`, W1-W3) with customizable thickness (100, 150, 200 mm), height, and materials (brick, lightweight block, RC).
  - Hosted Openings (`CreateDoor`, `CreateWindow`): snaps to walls, calculates offset along wall segment.
  - Dynamic 2D Wall Cutouts: walls automatically render geometric opening cutouts in real-time on canvas without breaking centerline topology.
  - Door Handing & Swing Flipping: 4-quadrant swing directions (`left_in`, `left_out`, `right_in`, `right_out`) with click-to-flip interaction.
  - Window frame and dual-line glazing rendering with sill height parameters.
- **SketchUp 3D Synchronization Bridge (`Core::PlanEditorSync`):**
  - Full project sync via `.cfproj` file import (`Extensions > ConstructFlow > 🔄 นำเข้าผังจาก Plan Editor...`) or 1-click Ruby script copy from `SyncBridgePanel.tsx`.
  - Level registration: automatically detects and registers missing project levels (e.g. `GF` 0 mm, `L2` 3000 mm) before generating structural members.
  - 3D Geometry Generation: generates 3D columns, footings, beams, and walls in SketchUp matching exact plan dimensions and Smart Object UUIDs.
  - 3D Wall Hole Punching: cleanly decouples opening cutout UUIDs from door/window infill UUIDs, invoking `CreateOpening` and `CreateDoorWindow` without ID collisions.
  - Development Symlink: Directory junction configured between SketchUp Plugins AppData and repository, enabling live hot-reloads.

### Construction Workflow v1 & Pure-Ruby CI Foundations
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
- R4 standalone foundation placement: Structure registers `CreateFoundation` for cursor-based footing placement in addition to column-supported `GenerateFoundation`, persists a semantic `structure.foundation`, and emits geometry/quantity/drawing/validation events;
- Meter-only SketchUp dimensions: model unit preferences, VCB entries, property dialogs, schedules, panel fields and preview annotations display lengths in meters (area/volume in m²/m³); UI conversions preserve canonical millimetre domain/persistence values, and residential plan footprints are capped at 20 m where applicable;
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

## Ruby Adapter Milestone Evidence (F0–F3)

These gates describe the existing Ruby/SketchUp integration. Standalone delivery gates are R0 and S0–S5 in the active roadmap and standalone engine review.

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

### Slice 02 Upgrade — Renovation Phasing, Underlay Image & Scale Calibration

Status: **Production Implementation Complete in Plan Editor (`apps/plan-editor`)**.

- **Renovation Phasing**:
  - Full phase visual separation on 2D Plan: `existing` (Slate neutral/muted), `demolition` (Red tint, dashed lines `[6, 4]`), and `new_construction` (vibrant primary BIM colors).
  - Live object phase switching dropdown in `PropertiesPanel` via `UpdateObjectPhase` command.
  - Existing objects can carry `removed_phase: 'demolition'`; a shared effective display phase now keeps 2D, 3D, sheet graphics, opening schedules, and takeoff aligned. Focused runtime evidence confirms the A-02 wall renders red/dashed, the removal phase survives `.cfproj` serialization, and its quantity is assigned to `demolition_site_prep`.
  - Constrained `removed_phase` to `demolition` in Smart Object and command types, project import validation, and CommandBus input validation. Focused runtime checks reject `existing` and `new_construction` without mutation, while demolition survives roundtrip and remains in the demolition takeoff center.
  - Plan Editor creation commands (`CreateWall`, `CreateDoor`, `CreateWindow`, `CreateColumn`, `CreateBeam`, `CreateFoundation`) automatically inherit active project phase.
- **Underlay Image Import & Point-to-Point Calibration**:
  - Direct import of PNG/JPG/WebP floor plan drawings onto 2D canvas with adjustable opacity (10%-100%) and visibility toggle.
  - Interactive Point-to-Point Calibration tool (`Calibrate (R)`) with real-time rubber-band measuring line, midpoint distance readout, and `UnderlayCalibrationModal` for 1:1 scale calibration in millimeters or meters.
  - Configurable floor-to-floor storey height in Plan Editor header (Floor 1 to Floor 2 elevation in mm).
- **Legacy Plugins Strategy**:
  - 100% zero-conflict coexistence in SketchUp Plugins folder (isolated `JiraNot::ConstructFlow` namespace).
  - Ability to convert legacy geometry via `ConvertSelectionToSmartObject` into ConstructFlow BIM Smart Objects assigned to `existing` or `demolition` phases.

## How to update this file

Update status only when there is evidence in merged code/tests/specs. Distinguish **application-level/pure-Ruby evidence** from **real SketchUp/LayOut acceptance evidence** so a green CI run is never presented as proof of native application behavior.
