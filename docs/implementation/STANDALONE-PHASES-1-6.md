# Standalone Phases 1–6 Delivery Contract

Date: 2026-10-07
Status: Native roadmap functions implemented and integration-tested within the supported inputs below. Permit issue readiness remains blocked by project/design information.

The Master scope remains AGENTS.md. This contract specifies native domain slices and their supported geometry/rule inputs. Unsupported inputs must reject or report insufficient data; they must never produce a passing or production-complete claim.

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
| Phase 6 | UpdateSheetViewport, compile drawing set, export vector/PDF | scale/center/crop stored in drawing_settings, Undo/Redo and reopen; per-sheet source UUIDs, phase/level/scale/revision metadata, actual geometry/schedules and missing-data reporting; working sets can include incomplete sheets; issue_ready is always false | AC-P16-006: deterministic 20-sheet index, viewport persistence, missing sources and crop warnings; BBS/MEP/roof output derives from commands; PDF has A3 pages and embedded Thai font |

Every track additionally checks create/edit/rejected edit rollback, atomic undo/redo, save/reopen, phase/level filters, changed quantity/drawing output and unavailable data. Domain validators execute on imported known-family payloads and before command commit. No provider may silently replace invalid inputs with a guessed quantity.

## Remaining Master coverage

This document does not remove stair/railing, arbitrary concave roof, detailed hydraulic simulation, engineering design approval, full site/legal data or adapter requirements. Completion must be reported feature by feature against Master, never inferred from the existence of a package or 20 page names.

## Delivered native functions

| Phase | Implemented behavior | Main source |
|---|---|---|
| 1 | Beam/slab catalog create/edit, UUID references, per-instance overrides, atomic cascade and phase-aware 2D | packages/catalog-engine/src/index.ts; apps/plan-editor/src/components/ConstructionWorkbench.tsx |
| 2 | Top/bottom/stirrup configuration, catalog-owned editable bar sets, normalized span zones, centerline BBS/kg, drop offsets | packages/structure-engine/src/construction.ts |
| 3 | Flat/shed/gable/hip convex footprint solver, continuous profile miter sweeps, wall panels excluding hosted openings | packages/roof-engine/src/index.ts; packages/decorative-engine/src/index.ts |
| 4 | Manhole-linked gravity IL propagation, unknown IL reporting, cycle/conflict rejection, pump/bypass valve topology, bathroom tile/slope/waterproof surfaces and sections; supplied PE and electrical load inputs | packages/drainage-engine/src/index.ts; packages/plumbing-engine/src/index.ts; packages/architecture-engine/src/bathroom.ts; packages/electrical-engine/src/index.ts |
| 5 | Carcass/module/shelf/drawer/front parts, material/thickness quantities, stable part cut-list UUIDs and CSV, LED length/load/derated driver sizing | packages/interior-engine/src/index.ts; packages/electrical-engine/src/index.ts |
| 6 | 20-sheet vector index, plans/elevations/geometric sections, opening/structural/BBS schedules, bathroom details, pump schematic, power SLD, X/Y/column-span dimensions, datums/title blocks, saved viewports, Thai vector PDF | packages/sheet-engine/src/permit.ts; packages/sheet-engine/src/pdf.ts |

React only orchestrates typed commands and presents provider outputs. Canonical types are in packages/project-model/src/types.ts and sheetSettings.ts; payload contracts are in packages/command-schema/src/constructionCommands.ts and projectCommands.ts. Domain formulas remain in their owner packages. Both project import and CommandBus commit validate supported domain payloads. Failed commands publish no partial model or envelopes.

## Verification evidence

- `npm run test:standalone`: production build plus 65 passing tests across seven suites; kitchen, file IO and Phase 1–6 integration verifiers pass. Tests live in packages/command-runtime/test/construction.test.mjs, construction-geometry.test.mjs, packages/extension-engine/test/phase-proof.test.mjs and packages/sheet-engine/test/permit.test.mjs, in addition to existing regression suites.
- `npm run verify:phases`: 41 Smart Objects, 19 domain outputs, 44 quantity rows, 20 A3 PDF pages. Creates output/pdf/phase-1-6-proof.pdf, .cfproj, .html and -report.json. Six review/missing-input warnings remain visible; A-01 lacks deed/legal/signatory data. Generated output is ignored by Git.
- PDF inspection: all 20 pages rendered with Poppler, A3 landscape 1190.55 × 841.89 pt, embedded Type0 Sarabun/ToUnicode, Thai mark placement applied through fontkit GPOS. Plans, bathroom section, BBS diagrams and SLD visually inspected.
- Production browser acceptance at localhost: batch model creation, derived BOQ, changing A-09 scale 1:25 → 1:50 and Undo restoring 1:25, native PDF export, and 3D rendering. The local browser sample adds the proof domains to the editor's demonstration project; the reproducible CLI fixture is the separate kitchen project.
- PDF libraries load only on export; the initial app bundle is about 555 kB uncompressed. Vite reports size warnings for app, Three.js and PDF chunks; the build succeeds. Large-project performance has not been benchmarked.
- Lockfile acceptance: all 20 package installs/builds pass with npm ci. The app npm ci and production build pass in .tmp/app-lockfile-check using the same manifests and sibling packages. In-place npm ci encountered Windows locks from pre-existing development servers; npm install restored the working app dependencies, and the full regression run then passed.

## Supported bounds and remaining acceptance

Roofs and bathroom drain fans support simple convex boundaries; concave polygons and holes reject. Moulding paths support planar horizontal, vertical and tilted runs; non-planar compound paths reject. Roof thickness is metadata, with the covering surface shown in 3D. Rebar sets support at most 2,000 bars; displayed straight bars/rounded stirrups follow host sections, while hook/lap fabrication lengths are represented in BBS. Cabinet modules use repeated shelf/drawer layouts, automatic toe kick and named carcass/front/back/countertop materials; arbitrary per-part fabrication overrides and machine nesting remain future work. Wet wall membrane starts from boundary edge zero and continues for the explicit wet_wall_length_mm; selecting arbitrary wet walls is not implemented.

The 20-sheet package is a draft compiler. Elevations project edges without a full hidden-line solver, sections are geometric cuts, ceiling annotations/material hatching and full footing/column reinforcement detailing need further project/domain work. Missing sources are reported as missing_data; applicability is never automatically approved. Schedule overflow blocks issue and requires a continuation layout. Browser-native file-picker reopen and a real-project print-scale review remain acceptance tasks; local file IO and canonical roundtrip are tested.

Next milestone: real-project acceptance and completed design/site inputs for the draft set, then Phase 7 downstream adapters. The standalone engines do not depend on those adapters.

The complete changed-file inventory is recorded in PHASES-1-6-FILES.json beside this document.

