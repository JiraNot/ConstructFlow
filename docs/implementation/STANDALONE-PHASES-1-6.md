# Standalone Phases 1–6 Delivery Contract

Date: 2026-10-07 · Status snapshot updated: 2026-10-11

Status: Native implementation slices and acceptance evidence exist for the supported inputs below. Current standalone verification on 2026-10-11: all 25 configured build targets passed; the configured `test:standalone` run passed 364 Node tests plus 11 Python MCP tests; `verify:kitchen`, `verify:file-io`, `verify:phases`, and `verify:coordination` passed. Older test totals and PDF/browser observations below are dated delivery evidence, not current-run results. Permit issue readiness remains blocked by missing project/design inputs and because `issue_ready` is not gated by legal-engine results.

The Master scope remains AGENTS.md. This contract specifies native domain slices and their supported geometry/rule inputs. Unsupported inputs must reject or report insufficient data; they must never produce a passing or production-complete claim.

## S0–S5 closeout snapshot

S0–S5 are cross-cutting delivery tracks in `../STANDALONE-ENGINE-REVIEW-2026-10.md`,
not six claims that the full Master Blueprint has shipped. A track is closed only when its
supported contract, automated acceptance and required native/visual gates are evidenced;
package existence or a green unit suite alone does not close it.

| Track | Current disposition | Evidence in this working tree | Remaining closure gate |
|---|---|---|---|
| S0 Schema / Catalog / History | Core implementation delivered; acceptance open | v1→v2 migration, UUID/type cascade, transactional history, persisted slab/roof validation, and editor Save writes back to the active Open/Save As file handle; browser acceptance passed disk-backed mocked-handle Open → Save → Open, real OPFS `FileSystemFileHandle` Open → Save/close → Open (21/21 UUIDs), and local-file-input Open → Save As download → reopen (18/18 source UUIDs) | Native OS/browser picker selection and direct browser-handle overwrite/reopen of a user-selected file; file-handle permission/restore behavior across restart; broader domain migration fixtures and large-project history/performance limits |
| S1 Takeoff / BOQ | Supported takeoff delivered; coverage open | phased providers, rate/waste/formwork/preliminaries/Factor F functions; takeoff-engine is included in the standalone runner; flashing and vertical-joint regressions, with optional explicit partial-treatment length | Provider/rate coverage and source/version validation; verify estimate behavior against approved project inputs/rates |
| S2 Native 3D / Extension | Supported viewport and preset slices; not closed | renderer-neutral representations, editable/atomic presets, synchronized plan/3D moves, and 3D coordination markers for impact volumes, extents and measurement lines with five direct geometry/lifecycle tests; carport and kitchen presets create editable SOG and preliminary roof surfaces; kitchen proof checks floor GF and roof L2 datums; extension-engine passes 10 tests | Full-family direct editing and assembly completeness; representative project parity, visual shape/cutout and coordination-overlay acceptance, and performance acceptance |
| S3 Spatial QA / MEP / Rules | Foundational analysis delivered; not closed | packed R-tree candidate queries, exact geometry-aware findings for supported interactions, versioned rule provenance, and passing `verify:coordination` (47 checks) | Broader openings/MEP clearance coverage, domain rule coverage and explicit missing-input behavior |
| S4 Sheets / Publication | Draft compiler delivered; publication gate open | deterministic A3 set, vector/PDF output, source/missing-data reporting, viewport persistence and phase proof | Native/visual review across representative projects/scales, schedule continuations and legal-engine publication gating; `issue_ready` alone is not legal approval |
| S5 Adapters / MCP | Standalone model operations, caller-held history and interchange exports integrated; adapter acceptance remains open | MCP mutation, filtered query, takeoff, coordination, unified site/legal compliance, DXF, IFC 4.3, Revit transfer and undo/redo call standalone TypeScript packages; mutation uses actor `ai`, up to 100 commands and atomic rollback; history snapshots are UUID-bound and capped at 100 per direction; DXF ModelSpace XDATA carries object UUID and lifecycle phases; IFC STEP strings escape apostrophes and control characters in user-provided names/marks; Revit transfer maps canonical hosted door/window types, host UUIDs and wall-relative offsets; IFC/Revit transfer retain created, removed and displayed phases; 9 MCP runtime Node tests and 11 MCP server Python tests run in the standalone runner | Callers must persist and return the latest project/history state; SketchUp bridge still requires native roundtrip acceptance; interchange exporters still need broader parity/metadata acceptance and are not diff-based roundtrip sync |

The standalone test runner prints its current aggregated Node test count after every suite
and integration verifier succeeds; counts in older dated snapshots are historical evidence.

**Overall:** S0–S5 are not fully closed against Master scope. The matrix is the current
closeout record; any item marked open needs the listed evidence before its status changes.

## Ownership and execution

Canonical objects remain in .cfproj v2. New object families use owner-domain schema v1. Existing beam enrichment uses schema v2 when drop/reinforcement metadata is written; old schema-v1 beams remain readable. The envelope does not change and no destructive project migration is required. All create/edit commands run through the existing isolated CommandBus; one generated package is one batch history entry. IDs, host links, created/removed phases and catalog UUIDs persist through roundtrip and Undo/Redo.

Generic geometry lives in geometry-kernel; decoding/command/provider contracts live in module-sdk. Structure, Roof, Decorative, Drainage, Plumbing, Electrical and Interior own their algorithms. Drawing/quantity/representation aggregators consume provider outputs, without reproducing formulas in React.

## Feature contracts and acceptance

| Track | Objects / commands | Data and output contracts | Acceptance |
|---|---|---|---|
| Phase 1 | Define/UpdateStructuralTypeDimensions, AssignInstanceType, RenameCatalogType | UUID family-scoped type parameters; boundary/placement stays instance-owned; instance overrides win; validation rejects invalid cascades atomically | AC-P16-001: change slab thickness and beam reinforcement/type without changing UUIDs; invalid updates rollback; outputs change and reopen identically |
| Phase 2 | Create/UpdateSlab, Assign/ModifyRebarSet, SetBeamDrop | SOG/suspended/precast slab metadata, finite simple boundary, thickness/topping/material; reinforcement grade/diameter/count, explicit shape legs/radius/hooks/lap/cover/spacing zones; BBS length/mass/count by source; no inferred engineering approval | AC-P16-002: BBS fixtures check dimensions/cover/bends/spacing/lap and kg; invalid host/section/rule rejection; type cascade and host changes rederive |
| Phase 3 | Generate/UpdateRoof, Create/UpdateMouldingRun, Set/UpdatePanelLayout | convex per-edge slope roof lower-envelope solver (flat/lean-to/gable/hip); concave/holes require later solver and reject explicitly; planar horizontal/vertical/tilted profile sweep with miter limit and corner QA; wall panel opening avoidance | AC-P16-003: analytical roof facet areas/elevations, rotated footprints, degenerate input rejection; horizontal and vertical sweep corners/closed loops and host-linked panel regeneration |
| Phase 4 | Create/EditPipeRoute, Place/UpdateManhole, Create/UpdateSepticTank, Create/UpdatePumpBypass, Create/UpdateBathroom, Place/UpdateElectricalFixture, Create/UpdateCircuit | gravity topology with compatible source/destination IDs, explicit or unknown inverts; vent is a distinct non-gravity system; septic PE calculation requires supplied sizing rule evidence; valve bypass topology explicit; bathroom floor/drop/waterproof/rough-in intent; electrical load/SLD requires user design inputs | AC-P16-004: unknown invert never passes; connected route edit propagates IL/length; manual endpoint conflicts reject; bypass valve/port graph and septic rule inputs verified; bathroom outputs trace owners |
| Phase 5 | Create/UpdateCabinetRun, Create/UpdateLEDRun | carcass/module/front/shelf/hardware materials; derived cut-list parts, edge band and hardware; driver sizing uses supplied W/m, voltage and derating with no hidden electrical defaults | AC-P16-005: module edit changes cut list/BOQ, compatible material overrides persist, invalid dimensions and driver undersizing reject |
| Phase 6 | UpdateSheetViewport, compile drawing set, export vector/PDF | scale/center/crop stored in drawing_settings, Undo/Redo and reopen; per-sheet source UUIDs, phase/level/scale/revision metadata, actual geometry/schedules and missing-data reporting; working sets can include incomplete sheets; `issue_ready` is currently derived from metadata/sheet completeness and is not gated by legal-engine results, so it is not a legal approval signal | AC-P16-006: deterministic 20-sheet index, viewport persistence, missing sources and crop warnings; BBS/MEP/roof output derives from commands; PDF has A3 pages and embedded Thai font |

Every track additionally checks create/edit/rejected edit rollback, atomic undo/redo, save/reopen, phase/level filters, changed quantity/drawing output and unavailable data. Domain validators execute on imported known-family payloads and before command commit. No provider may silently replace invalid inputs with a guessed quantity.

## Remaining Master coverage

This document does not remove stair/railing, arbitrary concave roof, detailed hydraulic simulation, engineering design approval, full site/legal data or adapter requirements. Completion must be reported feature by feature against Master, never inferred from the existence of a package or 20 page names.

The phases below are delivered implementation slices, not a statement that all six Master
domains are complete. The current boundaries include: partial site/legal rule coverage and
input-dependent findings; no engineering design approval; geometry/solver limits for unsupported
polygons and families; selected rather than universal takeoff/rate coverage; conservative spatial
overlap candidates rather than complete hard/soft clash analysis; and a 20-sheet draft compiler
that reports missing sources but does not establish legal or permit readiness. For the active
cross-cutting S0–S5 gates, see `../STANDALONE-ENGINE-REVIEW-2026-10.md`.

## Delivered native functions

| Phase | Implemented behavior | Main source |
|---|---|---|
| 1 | Beam/slab/column/footing catalog create/edit, UUID references, per-instance overrides, atomic cascade, phase-aware 2D, and interactive stair placement (shortcut `T`) | packages/catalog-engine/src/index.ts; packages/architecture-engine/src/stairs.ts; apps/plan-editor/src/components/PlanCanvas.tsx |
| 2 | Top/bottom/stirrup configuration, column & footing reinforcement templates (`ConfigureColumnReinforcement`, `ConfigureFoundationReinforcement`), normalized span zones, centerline BBS/kg, drop offsets | packages/structure-engine/src/construction.ts; packages/command-schema/src/constructionCommands.ts |
| 3 | Flat/shed/gable/hip convex footprint solver, roof void/hole editing, continuous profile miter sweeps, wall panels excluding hosted openings, stair walkline/cutlines on A-02/A-03, ground baseline with 45° earth hatching, A-10 RCP (600×600), and parametric door/window elevation & plan constraint generation (Kiwi.js linear simplex), unified representation linework, PlanCanvas center/resize handles with 100mm BIM-aware clearance snapping, and 1-click flip handing badge icon (`⇄`) | packages/roof-engine/src/index.ts; packages/decorative-engine/src/index.ts; packages/constraint-engine/src/index.ts; packages/representation-engine/src/index.ts; packages/snapping-engine/src/index.ts; packages/sheet-engine/src/permit.ts; apps/plan-editor/src/components/PlanCanvas.tsx |
| 4 | Manhole-linked gravity IL propagation, auto-slope solver (`solveGravityInverts`), cycle/conflict rejection, pump/bypass valve topology, bathroom tile/slope/waterproof surfaces and sections; supplied PE and electrical load inputs, 3-phase balancing (`balanceCircuitsPhase`), and วสท. breaker/wire sizing (`recommendEITBreakerAndWire`) | packages/drainage-engine/src/index.ts; packages/plumbing-engine/src/index.ts; packages/architecture-engine/src/bathroom.ts; packages/electrical-engine/src/index.ts |
| 5 | Carcass/module/shelf/drawer/front parts, material/thickness quantities, stable part cut-list UUIDs and CSV, LED length/load/derated driver sizing | packages/interior-engine/src/index.ts; packages/electrical-engine/src/index.ts |
| 6 | 20-sheet vector index, plans/elevations/geometric sections, opening/structural/BBS schedules, Sheet A-08 1:50 Matrix Grid Cards with parametric elevation linework and 5-row specification tables, bathroom details, pump schematic, power SLD with EIT sizing, X/Y/column-span dimensions, datums/title blocks, saved viewports, Thai vector PDF | packages/sheet-engine/src/permit.ts; packages/sheet-engine/src/pdf.ts |
| 7 | Downstream adapters: 20 PaperSpace layout AutoCAD DXF (`cad-adapter`), OpenBIM IFC 4.3 & Revit direct transfer (`bim-adapter`), and pure-Node SketchUp `.rbz` packager (`npm run package:sketchup`) | packages/cad-adapter/src/index.ts; packages/bim-adapter/src/index.ts; scripts/package_sketchup_rbz.mjs |

React only orchestrates typed commands and presents provider outputs. Canonical types are in packages/project-model/src/types.ts and sheetSettings.ts; payload contracts are in packages/command-schema/src/constructionCommands.ts and projectCommands.ts. Domain formulas remain in their owner packages. Both project import and CommandBus commit validate supported domain payloads. Failed commands publish no partial model or envelopes.

## Verification evidence

- Dated delivery evidence (recorded for this snapshot): `npm run test:standalone` reported a production build plus 246 passing tests across 17 package suites (project-model, geometry-kernel, snapping-engine, constraint-engine, representation-engine, architecture-engine, roof-engine, drainage-engine, plumbing-engine, electrical-engine, interior-engine, clash-engine, sheet-engine, command-runtime, extension-engine, cad-adapter, bim-adapter); kitchen, file IO and Phase 1–6 integration verifiers passed. This document update did not rerun them.
- `npm run package:sketchup`: packages 486 extension files into `output/constructflow.rbz` (727.3 KB) cross-platform without native zip dependencies.
- `npm run verify:phases`: current fixture includes 44 Smart Objects, 21 domain outputs, 60 takeoff rows, and 20 A3 PDF pages. Missing-input warnings remain visible; A-01 lacks deed/legal/signatory data. Generated output is ignored by Git.
- PDF inspection: all 20 pages rendered with Poppler, A3 landscape 1190.55 × 841.89 pt, embedded Type0 Sarabun/ToUnicode, Thai mark placement applied through fontkit GPOS. Plans, bathroom section, BBS diagrams, ground baseline with 45° earth hatching, elevation datums, stair 2D linework, RCP grid, and SLD visually inspected.
- Production browser acceptance at localhost: batch model creation, derived BOQ, changing A-09 scale 1:25 → 1:50 and Undo restoring 1:25, native PDF export, and 3D rendering. The local browser sample adds the proof domains to the editor's demonstration project; the reproducible CLI fixture is the separate kitchen project.
- PDF libraries load only on export; the initial app bundle is about 555 kB uncompressed. Vite reports size warnings for app, Three.js and PDF chunks; the build succeeds. Large-project performance has not been benchmarked.
- Lockfile acceptance: all package installs/builds pass with npm ci. The app npm ci and production build pass in .tmp/app-lockfile-check using the same manifests and sibling packages. In-place npm ci encountered Windows locks from pre-existing development servers; npm install restored the working app dependencies, and the full regression run then passed.

## Supported bounds and remaining acceptance

Roofs and bathroom drain fans support simple convex boundaries; concave polygons and holes reject. Moulding paths support planar horizontal, vertical and tilted runs; non-planar compound paths reject. Roof thickness is metadata, with the covering surface shown in 3D. Rebar sets support at most 2,000 bars; displayed straight bars/rounded stirrups follow host sections, while hook/lap fabrication lengths are represented in BBS. Column and footing reinforcement templates support standard Thai rebar types (DB12, DB16, DB20, RB6, RB9). Cabinet modules use repeated shelf/drawer layouts, automatic toe kick and named carcass/front/back/countertop materials; arbitrary per-part fabrication overrides and machine nesting remain future work. Wet wall membrane starts from boundary edge zero and continues for the explicit wet_wall_length_mm; selecting arbitrary wet walls is not implemented.

The 20-sheet package is a draft compiler. Elevations use midpoint-based occlusion masking (partial-edge visibility remains inaccurate), sections are geometric cuts, ceiling annotations/material hatching and full footing/column reinforcement detailing need further project/domain work. Missing sources are reported as missing_data; applicability is never automatically approved. Schedule overflow is reported with a continuation banner; a separate continuation layout is not generated yet. `issue_ready` currently does not consult legal-engine output, so treat it only as a metadata/sheet-completeness flag. Browser-native file-picker reopen and a real-project print-scale review remain acceptance tasks; local file IO and canonical roundtrip are tested.

Next milestone: real-project acceptance and completed design/site inputs for the draft set.

The complete changed-file inventory is recorded in PHASES-1-6-FILES.json beside this document.

