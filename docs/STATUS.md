# ConstructFlow Specification Status

Master Construction Roadmap & Pillar 5: Cost Engineering & Phased BOQ (2026-10-10): complete implementation and verification of Pillar 5 across Takeoff & Costing:
1. Thai Standard Material Waste Factors (Pillar 5.1): added `THAI_STANDARD_WASTE_FACTORS` and `getStandardWasteFactor` based on Comptroller General's Department (กรมบัญชีกลาง) and EIT (วสท.) standards (Tile 7%, Mortar/Plaster 5%, Ready-mix concrete 5%, Round rebar RB6/RB9 5%, Deformed rebar DB12 7%, DB16 9%, DB20/DB25 11%, Paint 10%, AAC/brick 5%, Formwork 15%). Populates optional `waste_percent` and `gross_quantity` on `TakeoffLine` in `calculateTakeoff` without breaking backward compatibility.
2. Formwork Reuse Engine (Pillar 5.2): added `calculateFormwork` implementing Comptroller General's depreciation reuse rules for building works <= 400 sqm (Footings 4 sides, Storey 1 material factor 0.80, Storey 2 material factor 0.70; Columns 4 sides; Beams 2 sides + soffit; Slabs edge vs bottom; Lintels & Stiffeners 2 sides; 100% labor factor).
3. Preliminaries & Temporary Works Engine (Pillar 5.3): added `calculatePreliminaries` computing 5 standard preliminary items (PRE-01 Demolition debris removal with 1.4 bulking factor and 6-wheel truckload count, PRE-02 Temporary adjustable steel shoring props, PRE-03 Exterior scaffolding with fall protection for walls >= 2.50m, PRE-04 Dust screen PE canvas 3.0m site perimeter protection, PRE-05 Temporary water, power & site administration lump sum).
4. Factor F & Phased BOQ Calculator (Pillar 5.4): added `calculateFactorF` with official government direct cost brackets (<= 500k: 1.3056, <= 1M: 1.3015, <= 2M: 1.2982, <= 5M: 1.2854, <= 10M: 1.2801, > 10M: 1.2750, VAT 7%); added `calculatePhasedBOQ` segregating items into 3 discrete cost centers (`demolition_site_prep` with 100% labor demolition rates, `new_construction`, `remodeling_joint_treatment`), calculating material cost, labor cost, direct total, preliminaries, Factor F, and Grand Total THB.
5. Plan Editor UI Integration: upgraded Quantities panel with live BOQ summary card (Grand Total THB, Direct Cost, Preliminaries, Factor F, and 3 Cost Center pills) and added 1-click Thai Government / EIT BOQ CSV Export button (`BOQ (฿)`).
6. 100% Monorepo Test Pass Rate: 9/9 tests in `takeoff-engine`, 43/43 in `sheet-engine`, 82/82 in `command-runtime`, 8/8 in `extension-engine`, 13/13 in `cad-adapter`, 3/3 in `bim-adapter`, and all three verifiers pass cleanly.

1. Sheet M-01 Water Supply & 3-Valve Bypass Scheme: added `[ DETAIL-PB ]` standard detail card rendering public water main, water meter, ground water tank (PE 1,000-2,000L with float valve and overflow), automatic booster pump (250W-300W), 3-valve bypass loop (V1 inlet, V2 outlet, V3 bypass), and brass swing check valve (CV) backflow preventer. Added `[ SPECS-PB ]` card with Thai TIS 17-2532 Class 13.5 PVC, PP-R 80 hot water, and 8.0 bar hydrostatic test criteria.
2. Sheet M-02 Drainage, Cleanout & Vent Stack Details: added `[ DETAIL-CO ]` Floor Cleanout (FCO) brass plug flush with tile, 45° Wye branch to main, slope >= 1:100; added `[ DETAIL-VT ]` Vent Stack (Ø1.5"-2" PVC) extending >= 0.30 m above roof with weatherproof vent cap, insect screen, and flashing seal to prevent trap siphonage and evacuate sewer gas; added `[ DETAIL-ST ]` Septic Tank (1,000L anaerobic filter) with inlet/outlet slopes and grease trap notes.
3. Sheet E-01 Lighting, Standard Symbols & Installation Heights: added `[ SYMBOLS-E1 ]` electrical symbol legend (LED downlight, T8 batten, 1-way S, 3-way S3, weatherproof SWP, duplex receptacle 2P+G, Consumer Unit, conduit lines); added `[ HEIGHT-E1 ]` standard mounting height table (+1.20 m switch, +0.30 m outlet, +1.10 m kitchen/bathroom, +1.80 m CU center, +1.50 m chime); added dashed polyline arcs in plan viewport connecting switches to controlled light fixtures.
4. Sheet E-02 Power SLD, Grounding & RCBO Protection: added `[ DETAIL-GR ]` Grounding System card rendering copper-bonded ground rod (Ø5/8" x 2.40 m) driven below grade, 30x30 concrete inspection pit with brass clamp, >= 10 mm2 THW green ground wire in uPVC conduit, and TN-C-S Main Bonding Jumper (N-G Bond at main panel); added `[ SPECS-RCBO ]` mandatory RCBO protection card (<= 30 mA / <= 0.04 s) for water heaters, bathroom/wet areas, outdoor receptacles, and booster pumps, with earth resistance <= 5 Ohm.
5. Zero Regression Monorepo Verification: 43/43 tests in `sheet-engine` pass 100%, 82/82 in `command-runtime`, 13/13 in `cad-adapter`, 3/3 in `bim-adapter`, and all three verifiers pass cleanly.

Master Construction Roadmap & Pillar 3: Architecture, Envelope & Wet Area Details (2026-10-10): complete implementation and verification of Pillar 3 across Domain 3:
1. Sheet A-08 Typical RC Lintel, Stiffener & Sill Details: added `[ DETAIL-LS ]` standard detail card rendering concrete lintel ($10\times 10$ cm, 2-RB9 + stirrup RB6@0.20) with bearing extensions $\ge 0.20$ m into masonry, RC jamb stiffeners (2-RB9), and outward-sloping concrete window sill, complete with วสท. standard engineering notes.
2. Sheet A-09 Typical Drop Slab & Shower Curb Section: added `[ DETAIL-B1 ]` cross section rendering exterior FFL, -50 mm drop slab in dry zone, 10x5 cm RC shower curb, -100 mm wet zone, floor slope 1:50 to floor drain with P-Trap, and multi-height waterproofing membrane upturns ($\ge 0.30$ m dry, $\ge 1.80$ m shower).
3. Sheet A-09 Sanitary Fixture Rough-in Specifications: added `[ DETAIL-B2 ]` table rendering Thai EIT standards for WC rough-in center (305 mm from wall), bidet spray (+0.60 m), washbasin (+0.80 m / drain +0.50 m), shower (+1.00 m / head +2.00 m), paper holder (+0.70 m), and anti-odor P-trap floor drain.
4. Sheet A-09 Roof Flashing & Sealant Joint Detail: added `[ DETAIL-RF ]` detail card for extension/renovation joints rendering existing wall chase groove (25 mm depth), 0.5 mm stainless/colorbond flashing cap, polyurethane (PU) sealant bead, and EPDM-gasket fasteners to metal roofing.
5. Bathroom Finish Takeoff: added automatic takeoff computation for full-height wall tiling (`bathroom.wall_tile`) and concrete shower curbs (`bathroom.shower_curb`) in `bathroomOutputs`, increasing total takeoff rows from 54 to 56 in `verify:phases`.
6. Full test suite passes 100%: 42/42 tests in `sheet-engine` (including new Pillar 3 regression assertions), 82/82 in `command-runtime`, 13/13 in `cad-adapter`, 3/3 in `bim-adapter`, and all three verifiers pass cleanly.

Master Construction Roadmap & Pillar 2: Structural Engineering & Detail Schedules (2026-10-10): complete implementation and verification of Pillar 2 across Domain 2:
1. Long-Span Beam Detailing & Automatic Side Skin Rebar: added automatic side-skin reinforcement (`side_skin` 2-DB12) when beam depth $\ge 500$ mm per วสท. / ACI 318 code, supporting 7.00 m span beams ($25\times 60$ cm).
2. Beam System & Continuity: added `BeamSystem` ('simple' | 'continuous' | 'cantilever') and `BeamContinuityType` with intermediate support (`middle_support_column_id`) tracking and connected relationships.
3. Cantilever Beams: automatic cantilever detection, assigning top tension reinforcement (Top Extra / Continuous DB20) and bottom assembly bars.
4. Eccentric Footing (ฐานรากตีนเป็ดชิดเขต) & Strap Beam: added `eccentric_footing` with `eccentric_offset_mm` and `strap_beam_id` connections to resist overturning moments at site boundaries.
5. Bar Bending Schedules (BBS) & 3-Section Detailing (S-05 & S-06): upgraded permit sheets S-05 (Columns & Footings) and S-06 (Beam Schedules) with L-Section profile, 3 stirrup zones, and 3 cross sections (Section 1-1 Head/Support 1, Section 2-2 Mid-span, Section 3-3 Tail/Middle Support/Cantilever End).
6. 100% test pass rate across `@constructflow/structure-engine`, `@constructflow/command-runtime` (82/82), `@constructflow/sheet-engine` (41/41), `@constructflow/cad-adapter` (13/13), and full standalone monorepo test suite.

Master Construction Roadmap & Pillar 1: Site Survey, Title Deed & Thai Building Code Compliance (2026-10-10): complete implementation and verification of Pillar 1 across Domain 1:
1. Master Engineering Roadmap (6 Pillars): recorded complete engineering roadmap in `docs/ROADMAP.md` and Artifact directory covering all 6 Pillars (Legal/Deed, Structure/Foundation, Architecture/Envelope, MEP Detailing, Takeoff/BOQ, and BIM Coordination).
2. Roof Eaves & Overhang Setbacks (กฎกระทรวงฉบับที่ 55 ข้อ 50): added `EavesSetbackEvaluationItem` and `TH-MR55-RULE-50-EAVES` checking building projections/overhangs $\ge 0.50$ m from property lines, neighbor consent handling (`TH-MR55-RULE-50-EAVES-CONSENT`), violation detection (`TH-MR55-RULE-50-EAVES-VIOLATION`), and rain gutter compliance warnings (`TH-MR55-RULE-50-GUTTER`).
3. Street Width vs Maximum Building Height (กฎกระทรวงฉบับที่ 55 ข้อ 44): implemented $H_{max} \le 2 \times D_{street}$ evaluation (`TH-MR55-RULE-44-HEIGHT`) checking height against twice the distance to the opposite side of public roads.
4. Waterway Setbacks (กฎกระทรวงฉบับที่ 55 ข้อ 42): added `WaterwaySetbackEvaluationItem` and `TH-MR55-RULE-42-WATERWAY` enforcing setbacks for small canals $< 10$ m ($\ge 3.00$ m), large canals $\ge 10$ m ($\ge 6.00$ m), and large waterbodies ($\ge 12.00$ m).
5. Land Fill, Drainage & BMA Ground Floor Elevation (พ.ร.บ. การขุดดินและถมดิน มาตรา 26 & ข้อบัญญัติ กทม.): implemented `evaluateSiteGradeAndDrainage` checking drainage for land fill $> 2,000$ sqm or $> 0$ m (`TH-SOIL-ACT-SEC26-DRAINAGE`), retaining walls for land fill $> 1.50$ m (`TH-SOIL-ACT-SEC26-RETAINING-WALL`), and ground floor FFL $\ge +0.50$ m relative to road crown (`BMA-BUILDING-CODE-FFL`).
6. All-in-One Project Legal Auditor: exported `evaluateProjectSiteAndLegalCompliance` for holistic model scanning across walls, roofs, rooms, and site topography.
7. Sheet A-01 & PropertiesPanel Integration: updated Sheet A-01 Thai Building Code table with eaves and road height rules, added setback cards in `PropertiesPanel` for Walls and Roofs with live feedback.
8. 16 tests in `@constructflow/clash-engine` pass 100%, 40 tests in `sheet-engine` pass 100%, and full monorepo suite passes without regressions.

1. Revit-Style BIM Elevation Selection Feedback: upgraded `apps/plan-editor/src/components/ElevationCanvas.tsx` to display Revit-style interactive visual feedback on selected objects across all four facade directions (North, South, East, West). Displays a `#0284c7` selection bounding box with translucent blue wash (`rgba(2, 132, 199, 0.09)`), 8 CAD/Revit grip handles (white squares with blue borders at corners and edge midpoints), and temporary elevation & dimension badges: Top elevation (`▲ +X.XXX m`), Base elevation (`▼ +Y.YYY m`), and Height (`H Z.ZZZ m`). Supported across Walls, Columns, Beams, Slabs, Doors, Windows, and Roofs.
2. Opening Vertical Head Constraint & Revert: resolved constraint toggling in `@constructflow/architecture-engine` (`UpdateWindowDimensions` and `UpdateDoorDimensions`). Switching an opening's head level back from a referenced level (e.g. `Roof Level`) to `กำหนดความสูงเอง (Fixed Height)` explicitly removes `head_level_id` and `head_offset_mm` from `module_data` and sets `vertical_constraint = 'fixed_height'`. In `PropertiesPanel`, the height field dynamically switches back to an editable `<LengthInput>` allowing immediate custom height modifications.
3. Structural Slab Vertical Controls (Revit-Style Datum & Offset): added `elevation_offset_mm` support into `decodeSlab` in `@constructflow/structure-engine`. In `PropertiesPanel`, selecting a structural slab exposes a Level reference dropdown (`ระดับอ้างอิงพื้นโครงสร้าง`), signed offset input (`ระยะเยื้องพื้นโครงสร้าง (Offset)`), thickness input (`ความหนาพื้นโครงสร้าง`), and live Top of Slab (`หลังพื้น`) and Bottom of Slab (`ท้องพื้น`) badges. Enables precise modeling of recessed wet areas, dropped slabs, and precast plank topping slabs.
4. Clean AutoCAD/Revit Opening Plan Symbols: verified 2D plan symbols for doors and windows with clean aluminum jamb profiles, glass leaf centerline, exterior sliding direction arrows positioned outside the frame, and correct jamb-to-swing alignment without overlapping artifacts.
5. All 80 unit tests in `@constructflow/command-runtime` pass, and `verify:kitchen`, `verify:file-io`, and `verify:phases` pass 100%.

Parametric Door & Window symbol system, Sheet A-08 schedule, and BIM-aware interaction (2026-10-10): complete 4-phase upgrade for opening linework, documentation, and canvas editing:
1. Data Model & Constraint Solver: added `ParametricPolygon` and `ParametricArc` to `@constructflow/project-model` (`parametricSymbol.ts`), evaluated through Kiwi.js linear simplex in `@constructflow/constraint-engine` (`parametricSolver.ts`). Evaluates filled closed polygons (`#ffffff`), panel width ratios, muntin grids, dashed swing lines, and sliding direction arrows with negative-zero coordinate normalization.
2. Unified Representation Linework: updated `@constructflow/representation-engine` (`getOpeningElevationLinework` and `getOpeningPlanLinework`) to provide renderer-neutral single-source-of-truth 2D vector geometry for all viewports, separating closed background polygons from open indicator lines. Exported `buildOpeningRepresentationShapeFromType` and `buildOpeningRepresentationShapeFromObject`.
3. Sheet A-08 Schedule Matrix Cards: upgraded `packages/sheet-engine/src/permit.ts` to render 1:50 Matrix Grid Cards (3 cards per row, up to 6 per A3 page with continuation sheets). Each card renders exact parametric elevation linework with solid `#ffffff` polygon fills, overall $W \times H$ dimensions, sill $+Z$ datum level, swing dashed lines / sliding arrows, and a 5-row specification table (Mark & Type, Dimensions $W \times H \times +Z$, Frame Specification, Glass/Panel Material, Unit Count).
4. BIM-Aware Snapping & Canvas Interaction: added `snapOpeningOffsetBimAware` and `snapOpeningWidthBimAware` to `@constructflow/snapping-engine` enforcing 100 mm minimum clearance to structural columns and host wall ends, wall midpoint snap, and 50 mm quantization. PlanCanvas features interactive center position drag handle (`opening-center`), edge width resize handles (`opening-edge`), and a 1-click door flip handing badge icon (`⇄`) directly on the canvas for instant 4-quadrant swing toggling. Integrated `OpeningElevationThumbnail` SVG component into `PropertiesPanel` and `TypeManagerModal`. Full standalone regression suite, verifiers, and production build pass cleanly.

AutoCAD CAD Block export for doors and windows (2026-10-09): `packages/cad-adapter` now exports hosted and unhosted doors and windows as genuine AutoCAD Block References (`INSERT`) rather than exploded loose vectors. Reusable Block definitions (`CF_DOOR_...` and `CF_WIN_...`) are parameterized by mark, width, wall thickness, and handing; they are registered in the `BLOCK_RECORD` symbol table and defined in the `BLOCKS` section. Each door block encapsulates the jamb linework, leaf polyline, 90-degree swing arc, and mark label; window blocks encapsulate jambs, double tracks, panel mullions, and mark labels. ModelSpace entities place single `INSERT` references at opening centerlines rotated to the host wall angle. In AutoCAD/GstarCAD, clicking any part of an opening selects the entire opening as an interactive Block Reference. Regression assertions in `dxf.test.mjs` verify `INSERT` and `BLOCK` records for doors and windows; all 13 CAD adapter tests and the full `npm run test:standalone` suite pass.

Parametric constraint solver foundation (2026-10-09): `@constructflow/constraint-engine` package is now introduced, wrapping `kiwi.js` (Cassowary linear simplex algorithm) in `ConstructFlowSolver`. `ConstraintData` is added to canonical `ProjectDocument` schema, supporting Lock, Offset, Parallel, Perpendicular, and Coincident constraints. The CQRS `CommandBus.execute` pipeline intercepts project mutations, maps edit intents, executes the solver, and commits solved coordinates atomically into the transaction delta with full Undo/Redo compatibility. Vite bundler aliases and standalone monorepo build orders are updated; full build passes.

Roof topology straight skeleton engine (2026-10-09): introduced `computeRoofSkeleton` and `RoofTopologyEdge` in `packages/roof-engine/src/topology/StraightSkeleton.ts`, generating 3D ridge, hip, valley, and eave topological graph structures from building footprints for Roof 2.0. The topology engine is exported through `packages/roof-engine`.

Comprehensive architectural floor finish patterns & topology test (2026-10-09): expanded floor finish patterns beyond tile grid and staggered plank to include `carpet` (cross-hatch), `terrazzo` (deterministic scattered chip points), `concrete_block` (staggered masonry course), and `glass_block` (modular grid). `resolveArchitecturalFloorPatternKind` supports bilingual regex matching (Thai/English). Shared clipped pattern generators `clippedCarpetSegments` and `clippedTerrazzoSegments` are added to `@constructflow/geometry-kernel` and wired into Plan Canvas (`planRenderer.ts`) and vector sheet permit compilation (`permit.ts`). Added `scripts/create_complex_topology_demo.mjs` generating `examples/complex-topology-stress-test.cfproj` with acute corners, concave boundaries, and voids for drawing acceptance. Standalone engine builds cleanly.

Opening Type/Instance editing (2026-10-09): door/window Inspectors now list catalog-backed parameters, distinguish inherited values from instance overrides, and provide a per-parameter reset to Type. The new `UpdateOpeningInstanceParameters` CommandBus command validates supported fields, dimensions, panel layouts/ratios, hosted-wall fit and vertical bounds; it preserves override behavior through Type edits and project roundtrip. Existing door/window level/dimension edits now also refresh instance override metadata, so sill changes made through the level controls do not display as inherited. Regression tests cover window/door overrides, Type cascade, reset (including a sill edit through the legacy dimension command), save/reopen, undo/redo and invalid/rejected edits. A live check on the isolated Kitchen Extension Proof app selected a hosted W1, changed frame depth from 65 to 70 mm, confirmed the inherited label changed to an instance override, reset it to 65 mm, and verified Undo/Redo. `npm run test:standalone` passes across package builds/tests and the kitchen, file-I/O and phase verifiers; `git diff --check` passes. The room/floor/ceiling model already has associative-boundary and invalid-geometry regression coverage noted below, but broader surface-association/complex topology review, dense visual PDF review, and native GstarCAD plotting of the latest acceptance batch remain open.

Plan editing and drawing acceptance update (2026-10-09): A-02/A-03 dimensions use stable source keys, preserve locked per-sheet offsets, and recalculate text from live geometry; the sheet editor exposes offset controls. Column rows remain dimensioned when grids are present, and hosted openings on angled walls receive dimensions. Catalog update fields come from the canonical family map, including opening frame parameters, with instance overrides preserved. Renovation BOQ has exactly three priced work centers (demolition/site prep, new construction, joint treatment); untouched Existing objects remain model context. The repeatable acceptance exporter generates A-02/A-03/A-05/A-06/A-07/A-10 A3 PDFs for the +0.000/+0.400/+3.300/+6.500 house demo at 1:100 and the kitchen extension at 1:50 for plans/elevations (A-07 at 1:100), plus DXFs at 1:100 and 1:50. PDFs were reviewed as A3 rasters. The kitchen RCP warning is expected because that fixture has no modeled ceiling; A-07 carries a geometric-intersection review note. The latest generated acceptance batch still needs its own native GstarCAD plot record; earlier native plot evidence below applies to earlier exports. The standalone Plan Editor still has no persistent general-purpose Align/Lock/Offset/Equal/Fixed-Distance/Parallel/Perpendicular/Centered constraint model, and renovation modify/relocate/replace relationships remain open; the separate SketchUp Ruby implementation does not close those standalone roadmap items.

Architectural timber-floor pattern coverage (2026-10-09): wood, timber, laminate and vinyl-plank finish materials now select staggered plank courses using shared clipped geometry. Plan Canvas and A-02/A-03 use the same geometry, including rotation, boundary clipping and floor-void clipping. Geometry, sheet-engine and CAD-adapter regressions pass; the CAD test compares every A-02 wood seam/end-joint vector to compiled sheet geometry, including PaperSpace Y conversion, ACI 9 and 0.1 mm lineweight. The full standalone build, package suites and kitchen/file-I-O/phase verifiers pass. This adds timber patterns alongside tile grids; other finish families and visual/native plot acceptance remain open.

Elevation navigation live check (2026-10-09): in the running Plan Editor, inspected north, south, east and west on the loaded two-level `ConstructFlow Vertical Slice 01 & 02` project. North/south show the corresponding door/window arrangement and level marks; east/west show the projected column/beam geometry from that model. Raised the north view from 100% to 125%, dragged from blank canvas to pan, switched directions and confirmed each direction keeps its own zoom, then used Fit to return north to 100%. This confirms the controls and view-state behavior on that fixture; it does not replace the house-demo roof/junction review or complete four-direction visual acceptance on a representative multi-storey house.

House-demo elevation live acceptance (2026-10-09): opened `examples/constructflow-house-demo.cfproj` in Plan Editor and inspected all four directions. North/south show the two-storey gable facade and its hosted windows/doors; east/west show the side roof profile and openings only on the modeled west face. Finish marks remain associated with the visible wall/opening regions, and the +0.000/+3.000/+6.000 datums remain in order; the roof eaves meet the upper facade at +6.000 without a visible rear roof edge crossing the near roof plane. Raised north zoom from 49% to 61%, dragged from blank canvas, then used Fit to recenter the complete house at 100%. No visual defect was found in this fixture. This closes the live four-direction roof/junction check for the house demo only; additional projects, complex roof junctions, denser annotations and print-scale acceptance remain open.

Native upper-storey RCP plot acceptance (2026-10-09): opened a fresh A-10 DXF fixture in GstarCAD 2026, selected its Level 2 layout, and plotted with DWG To PDF on ISO full-bleed A3 landscape at paper-space 1:1 (sheet scale 1:50). GstarCAD reported no plot errors or warnings; `pdfinfo` confirms one A3 page, and a 120 dpi raster confirms the Level 2 title, void, clipped ceiling grid and label clearance. The label sits below the opening and its white knockout does not cover the void. Broader native plotting across representative models, directions and scales remains open.

Native house-demo A-10 plot acceptance (2026-10-09): opened the generated house-demo DXF in GstarCAD 2026 and plotted its Ground Floor finishes/RCP layout to ISO full-bleed A3 landscape at paper-space 1:1 (compiled sheet scale 1:100). GstarCAD reported no plot errors or warnings; `pdfinfo` confirms one A3 page. The 120 dpi raster shows the full title block, plan and four-room RCP inside the printable sheet, with all four ceiling labels legible and the plan/RCP dimensions visible. The lower-left fixture marks remain tightly grouped and need more dense-annotation samples before acceptance; this is one native plot from the 22-layout house demo, not full PDF/DXF acceptance.

A-05/A-06 elevation note cleanup and native replot (2026-10-09): removed the unconditional “Projected vector edges; hidden-line / façade annotation review required” QA placeholder from both compiled elevation sheets and added a regression assertion against its return. Re-exported the 22-layout house-demo DXF and plotted A-05 and A-06 in GstarCAD 2026 at A3 landscape, paper-space 1:1 (sheet scale 1:100); both jobs completed without CAD errors or warnings. Each native PDF is one A3 page, and the 120 dpi rasters retain all four facade views, roof outlines, opening marks, +0.000/+3.000/+6.000 datums and dimensions without the internal note. This confirms the note removal in PDF and DXF output for the house demo; detailed roof-edge fragments and broader annotation/project acceptance remain open.

A-05/A-06 opaque facade boundary handling (2026-10-09): the house-demo east elevation exposed an upper column cap exactly on the top boundary of the opaque wall face. Facade coverage now treats points on a face boundary as covered, removing the duplicate middle-column tick while retaining corner cap portions that project beyond the wall ends. A real-model vector regression verifies this result; all 36 sheet-engine tests and 12 CAD adapter tests pass, including compiled-vector-to-DXF elevation parity. The latest 22-layout DXF was plotted through GstarCAD 2026; A-05 and A-06 each produced a one-page A3 PDF, and 120 dpi rasters confirm the roof/datums, hosted openings, and corrected wall join.

A-02 phase-hatch DXF color parity (2026-10-09): new-construction masonry hatch vectors use `#9aa6b4` in Canvas and compiled permit sheets, but DXF PaperSpace had mapped that unrecognized gray to ACI 7 black. The CAD color resolver now maps it to ACI 8 gray. A hosted-window fixture compares every A-02 hatch vector against the compiled PDF source after PaperSpace Y-up conversion and asserts matching geometry, hatch color and 0.15 mm lineweight; all 12 CAD adapter tests pass. A-02 from the latest 22-layout DXF plotted through GstarCAD 2026 to one A3 page; its 120 dpi raster confirms the gray hatch stops at the window opening. Dense plan annotations remain under review.

A-02/A-03 plan object-tag clearance (2026-10-09): plan tags now avoid projected geometry from unrelated walls, structure, stairs and openings, retaining leaders from displaced labels to their source objects; A-10 retains its stricter self-geometry clearance for LED runs. House-demo A-02/A-03 produce no tag-placement warnings, and all 36 sheet-engine and 12 CAD adapter tests pass. A fresh native A-02 A3 plot was raster-reviewed after the change; the stair area is improved, though dense annotations remain open for other models and scales.

Room/Floor/Ceiling catalog assemblies (2026-10-09): architectural floor and ceiling families are now available in the Type Catalog and Properties Inspector. Floor types edit finish layers, tile pattern spacing/origin/rotation and thickness; ceiling types edit board/material, thickness and grid spacing. Catalog parameters propagate to instances, while direct per-instance finish/grid edits are recorded as overrides and retained on the next shared-type update. Regression coverage verifies two assigned floors/ceilings, isolated overrides, propagated values and the updated volumetric floor takeoff; project validation now checks family ownership and dimensions for these catalog fields. `npm run test:standalone` passes all package builds/tests and the kitchen, file-I/O and phase verifiers. Visual inspection of the catalog editor and broader finish-pattern, multi-storey and PDF/DXF acceptance remain open.

Multi-storey floor-plan source selection (2026-10-09): A-02 and A-03 regressions now compile separate Ground and Level 2 floor assemblies, proving each sheet includes only its selected-level floor/ceiling sources and that the tighter upper tile pattern produces more compiled floor-grid vectors. The sheet-engine suite passes all 36 tests. Multi-storey RCP/PDF/DXF visual acceptance remains open.

Upper-storey RCP export parity (2026-10-09): a saved A-10 viewport selecting Level 2 labels the RCP sheet with that level name. A regression fixture includes separate ground/upper ceilings and an upper ceiling void, then compares each compiled grid segment with its DXF PaperSpace coordinates after Y-up conversion, plus phase color, dash and lineweight. The upper-level A3 PDF raster confirms the level title, opening and clipped grid; the sheet-engine and CAD tests pass. Native CAD plotting and further multi-storey samples remain open.

A-05/A-06 PDF-to-DXF vector parity (2026-10-09): the elevation CAD regression now compares every compiled path and fill triangle against the matching PaperSpace entity after top-down-to-Y-up conversion, including coordinates, closed state, phase color, dash pattern, and lineweight. The fixture includes existing, demolition and new-construction facades; all 10 CAD adapter tests pass. A fresh 22-sheet house-demo PDF was rasterized at 120 dpi and A-05/A-06 were reviewed for roof/facade alignment, visible levels and opening marks. Native CAD plotting and annotation acceptance on additional models remain open.

Elevation annotation collision packing (2026-10-09): Canvas wall-finish and door/window marks now test nearby positions against previously placed marks, stay inside the viewport, and draw a leader back to their projected source point when moved. A deterministic layout regression covers coincident marks, viewport edges and overlap separation. Live house-demo review on the north and south elevations confirmed the 100% and 125% views keep labels tied to the facade/openings; zoom, blank-space pan and fit controls were exercised in the browser. Plan Editor build and elevation-layout tests (12) pass; dense elevations, Canvas-versus-sheet annotation placement and other models remain open.

A-07 architectural surface sections (2026-10-09): section compilation now intersects modeled architectural floor and ceiling boundaries with each section plane, subtracts polygon voids, and emits phase-styled surface bands using the same cut coordinate as structural section geometry. Added a geometry-kernel interval resolver for concave polygons and regression coverage for both cut axes and openings; the house-demo A-07 regression verifies each modeled floor/ceiling appears in both panels with no invalid-level warnings. The complete standalone build, package test suite and kitchen/file-I/O/phase verifiers pass. A fresh A3 PDF raster confirms the floor and ceiling bands appear at their modeled levels; annotation density, other models/scales and native CAD plotting remain open.

RCP grid phase parity (2026-10-09): A-10 ceiling-grid colors and dash patterns now come from `resolveCeilingGridStyle` shared by the RCP Canvas and permit sheet compiler. New-construction grids print in slate gray instead of near-black dashed marks, existing grids use a lighter gray, and demolition grids retain the red demolition dash. The CAD adapter maps the existing-grid color to ACI 9 while new grids use ACI 8 and demolition uses ACI 1. Representation and sheet-engine tests plus the full standalone suite pass; a fresh 22-page house-demo PDF raster at 120 dpi confirms the 1:100 RCP grid is less dense and the ceiling labels remain legible. Representative native DXF plot comparison and other project/scale acceptance remain open.

A-10 PDF-to-DXF grid parity (2026-10-09): CAD regressions compare compiled permit vectors with generated A-10 PaperSpace entities for new, existing and demolition ceilings, verifying equal vector counts and matching ACI color, `DASHED2` linetype where applicable, and 0.12 mm lineweight. A second kitchen-extension model with a voided ceiling also compiles at 1:50, retains its 2.70 m RCP tag, clips its grid around the opening, and exports the same grid vector count to DXF. CAD adapter tests (10) pass; native CAD plotting and further project/scale comparisons remain open.

A-10 plan-tag geometry clearance (2026-10-09): object tags now avoid projected walls, openings, structure, stairs, and service symbols, including their own line geometry, before selecting a label position; the candidate search includes farther placements with leaders. The house-demo SW1 tag no longer crosses the lower wall and LED1 now clears its run line. The targeted A-10 regression checks electrical tags against compiled model linework and passes; broader print density and multi-project acceptance remain open.

S-06 BBS completeness gate (2026-10-09): permit compilation now checks each modeled beam for its own top, bottom, and stirrup bar sets; rebar on an unrelated host cannot satisfy the schedule. Missing beam BBS data produces an object-count warning and marks S-06 `missing_data`, which prevents an approved project from being treated as issue-ready. House-demo regressions cover zero BBS sets and a partial single-beam set; both remain blocked. Focused sheet tests pass.

A-10 RCP ceiling label print clarity (2026-10-09): ceiling outlines, voids and grids now compile before any ceiling tags, so later adjacent ceiling geometry cannot overdraw an earlier label. PDF output renders white label knockouts as native page rectangles; vector geometry tests verify all RCP grids precede the four house-demo tags and their non-overlapping boxes. A fresh 22-page A3 house-demo PDF was raster-inspected at 120 dpi; the 1:100 RCP labels now read cleanly over the 600 × 600 mm grid. Plan-side stair annotations and broader project/scale print review remain open.

Hosted-opening wall stretch reconciliation (2026-10-09): endpoint edits now resolve opening coordinates from the exact geometric wall span while retaining each opening's physical offset from the edited start point; stored wall length remains rounded to whole millimeters. Regression coverage verifies end extension keeps an opening in place, moving the start preserves its start-relative offset, diagonal/fractional spans introduce no drift, and shortening past a hosted opening rejects without changing the project. `npm run test:standalone` passes all package builds/tests and the kitchen, file-I/O, and phase verifiers.

Elevation roof hidden-line parity (2026-10-09): triangulated roof edges behind a nearer roof triangle are clipped by a shared orthographic visibility resolver used in Elevation Canvas and A-05/A-06 sheet compilation; DXF receives the same compiled vectors as PDF. The resolver splits partially visible edges at roof-plane occlusion boundaries and keeps an edge visible from the opposite facade. Representation-engine regression coverage verifies near/far viewing directions, and the real house-demo hip roof retains its visible silhouette and hip lines while clipping hidden edges in all four projections. A live four-direction review of the house demo confirms the roof silhouette and wall-top joins remain continuous; print-scale acceptance, corner/junction cases beyond this fixture, and additional models remain open. Representation and sheet builds/tests, the Plan Editor build, and elevation Canvas tests pass.

Elevation datum visibility after pan/zoom (2026-10-09): the Elevation Canvas now omits level labels whose projected datum falls outside the viewport, instead of clamping every off-screen level to a misleading canvas edge. Visible labels remain ordered and edge datums still receive packed labels with leaders. Added regression coverage for off-screen, non-finite and zero-height viewport cases; 11 elevation-layout tests and the Plan Editor TypeScript/Vite production build pass. Live review confirms level labels, facade marks and roof lines in all four house-demo directions, including direct slider adjustment to 200%; varied-project and print-scale acceptance remain open.

Shared plan phase palette (2026-10-09): the first standalone A-02 compiler now resolves wall fill/stroke from the same `resolvePlanPhaseStyle` used by Plan Canvas and the full permit-sheet compiler. Its previous new-wall fill (`#e2e8f0`) differed from the canonical `#e3e8ed`; regression coverage now checks actual existing/new/demolition SVG wall styles and retained hatch. The sheet-engine build and all 31 sheet tests pass; PDF/DXF and native-plot visual review remain part of the broader drawing acceptance.

Stale room area on plan sheets (2026-10-09): when a wall edit opens a room loop, A-02/A-03 now mark the room tag red as `วงผนังเปิด`, omit the last-known area from the tag, and add a room-specific sheet warning. Closed rooms keep their area labels. Regression coverage exercises ground and upper plans with distinct stale areas; all 32 sheet-engine tests pass. A fresh house-demo PDF with an intentionally unclosed Living / Dining loop was compiled and raster-inspected: the red status appears inside the room, the stale 12.35 m² value is absent, and the sheet warning identifies R01. Broader drawing acceptance remains open.

Room-linked takeoff currentness (2026-10-09): deleting an enclosure wall now has regression coverage proving the tracked Room and its associated Floor/Ceiling are marked `unclosed` in the same command transaction. Takeoff omits those linked floor/ceiling quantities and emits an object-specific review warning instead of reporting stale area as current. `npm run test:standalone` passes all package builds/tests and the kitchen, file-I/O and phase verifiers; broader room/surface and drawing acceptance remains open.

Elevation/PaperSpace axis parity (2026-10-09): native A-05/A-06 GstarCAD plots exposed that sheet vectors use top-down page coordinates while DXF PaperSpace uses positive-up Y. DXF export now converts compiled text and path coordinates to PaperSpace Y-up, preserving the PDF compiler's top-down coordinate contract. The two-storey house demo now plots with the roof above the facade, +3.00/+6.00 datums above ±0.000, and readable opening/facade marks; A-10 retains its ceiling voids, grid and north-up plan. Added regressions for increasing elevation order in compiled sheet coordinates and its PaperSpace conversion, plus opening labels near frames. Verified fresh A-05/A-06/A-10 plots through GstarCAD 2026 and directly compiled A-05 PDF. `npm run test:standalone` passes. Roof/structure joins, annotation density, additional project/scale samples, and full Canvas/PDF/DXF parity remain open.

Elevation Canvas roof projection (2026-10-09): orthographic views now include `roof.system` mesh vertices in fit bounds and draw unique mesh boundary/crease edges with phase-aware color/dashes. Coplanar triangulation seams are suppressed; roofs are selectable but do not start the unsupported elevation drag command. Added geometry tests for flat-plane seam removal and pitched-roof crease retention; the Plan Editor production build and full standalone suite pass. Live browser review of the house-demo roof against North, South, East and West facades found continuous silhouettes and wall-top joins; complex roof/wall intersections and print-scale review remain open.

Plan phase parity (2026-10-09): Plan Canvas walls, columns, beams, doors and windows use the shared phase palette (existing `#94a3b8`, demolition `#ef4444`, new `#0f172a`) on primary geometry, with phase-specific dashes/line weights. Demolition wall hatch lines use shared model-space geometry, skip hosted openings, and are emitted in A-02/A-03 vectors and DXF ModelSpace; removal-phase objects use `getDisplayPhase` for their CAD layer and hatch. RCP Canvas and A-10 now apply the same phase styling to rooms, floors and ceilings, including clipped demolition hatches that respect concave boundaries and ceiling voids; elevation visibility retains demolition walls and hosted openings so their red dashed symbols can render. Elevation view scale can now be adjusted directly from 20–800% with an accessible slider in addition to wheel zoom, pan and fit. DXF new/existing/demolition layers use ACI 7/8/1 for columns, beams, foundations, slabs, openings, architectural floors/ceilings and walls. Palette, hatch, occlusion and removal-phase integration tests pass. `npm run test:standalone` and all three vertical verifiers pass. GstarCAD opens all 22 house-demo layouts with vectors in their own PaperSpace blocks; all 22 layouts plot as one-page A3 PDFs. Sample raster review confirms Thai text and facade fills, while plan/RCP annotation density and opening-symbol legibility remain under review.

Room/floor/ceiling UI acceptance (2026-10-09): live Plan Editor checks confirmed wall endpoint edits reconcile a closed room from 3.41 to 3.58 m² and update its linked floor/ceiling boundaries; selecting the room and creating either surface retains the detected boundary. Dimension overlays previously intercepted nearby polygon clicks, producing duplicate points; their blank area now passes pointer input through while the fields remain interactive. A 300 × 300 mm ceiling opening drawn in Plan and viewed in RCP appears as a white dashed polygon with the ceiling grid stopped around it. Inspector actions create holes for structural slabs, architectural floors and ceilings, route to the matching update command, and report invalid geometry; successful commits clear stale errors. Floor finish layers and pattern controls were verified in the Inspector. A command/takeoff regression verifies a 500 × 500 mm opening subtracts 0.25 m² from both floor-finish and ceiling quantities. `npm run test:standalone` passes all package builds/tests and three vertical verifiers. Larger/concave opening cases and PDF/DXF/native plot parity remain open.

Multi-storey PDF/DXF output review (2026-10-09): rebuilt sheet and CAD packages from source and compiled `constructflow-house-demo.cfproj` into a 22-page A3 PDF plus 22 DXF PaperSpace layouts. A-02/A-03/A-05/A-06/A-10 resolve to 1:100 with no viewport-clipping warnings; raster inspection confirms the plans, four facades and RCP fit their viewports. PDF metadata uses the actual compiled sheet count. DXF emits the active page in `ENTITIES` and each inactive page inside its own PaperSpace block, with reciprocal `LAYOUT`/`BLOCK_RECORD` references. GstarCAD 2026 opened the DXF, reported populated PaperSpace blocks for all 22 layouts, and plotted all 22 as nonempty single-page A3 PDFs, including the L3 plan/framing sheets. Sample raster review of A-02/A-05/A-06/A-10/S-06 confirmed Thai text and facade fills; elevation datum labels now clear the baseline/hatch. A fresh house-demo PDF raster pass reconfirmed viewport fit and visible openings at 1:100, while A-02/A-03 stair annotation clusters and A-10 plan/RCP labels remain dense at print size; east/west facade tag spacing also needs closer review. The S-06 missing-reinforcement notice still needs drawing-quality review. More project/scale samples and facade-join review remain open.

Second-project permit output review (2026-10-09): compiled `kitchen-extension-proof.cfproj` into a 20-page A3 PDF and 20 DXF PaperSpace layouts. A-02 auto-fits to 1:25; A-05/A-06/A-10 fit at 1:50, and none reports viewport clipping. Raster review confirms the plan, both combined facade sheets and the RCP panel fit the page; the kitchen fixture has no modeled ceiling, so A-10 correctly carries a missing-ceiling warning. A new CAD regression verifies these scales, no-clipping state, and compiled-vector entity counts on all four layouts. CAD adapter tests pass (6). House and kitchen fixtures now cover distinct project scales, while native CAD plotting, other project/scale samples, and facade-join review remain open.

Canvas facade depth ordering (2026-10-09): elevation walls that remain partially exposed after occlusion filtering are now drawn far-to-near for north/south/east/west views, so foreground fills consistently cover rear walls regardless of project object insertion order. Hosted openings and tags remain above facade fills. A pure layout regression checks all four directions, overlap order and input immutability; an isolated browser fixture with deliberately overlapping existing/new wall pairs and hosted windows confirms in all four directions that the near wall/window remain visible while the farther wall appears only at its exposed ends. The Plan Editor viewport tests pass (8), its production build passes, and `npm run test:standalone` passes with all vertical verifiers. Joined-corner intersections beyond the overlapping-span cases and native CAD plotting remain open.

Opening host snap determinism (2026-10-09): `snapToWallHost` now returns no candidate when the opening width is invalid or exceeds a host wall's length, avoiding a preview that cannot commit. Equidistant parallel host walls use stable wall UUID ordering instead of project object enumeration order. Snapping-engine build and tests pass (12); the full `npm run test:standalone` suite and all vertical verifiers pass. Broader live placement checks for dense T-junctions and overlapping host candidates remain open.

Edit-handle snap stability (2026-10-09): Plan Canvas now excludes the object being edited from direct snap candidates while moving a wall/beam endpoint, column/foundation corner, grid/separator endpoint, or grid point; the live cursor snap marker uses the same exclusion during the drag. Its geometry remains available for cross-object intersection candidates, so joins to existing geometry remain snappable without a handle being attracted to its own last committed position. Regression coverage checks free movement away from other geometry, snapping to a different wall's centerline, and retaining a live wall intersection. Live Plan Editor acceptance on the house demo placed a temporary branch onto an existing wall face, moved its endpoint onto a nearby Grid 2 snap (the reported position matched the new 1.897 m span), and confirmed one Undo restored the original 1.881 m span; both temporary walls were then undone. The snapping-engine suite passes 13 tests, Plan Editor build passes, and the full `npm run test:standalone` suite passes with all three vertical verifiers. Dense multi-wall T-junctions and overlapping host cases remain open.

Intersection snap provenance (2026-10-09): the two source object UUIDs in a wall/beam intersection `target_id` are now canonicalized before the snap candidate is ranked. Reversing project object insertion order preserves the same point, kind and source identity; snapping-engine build and all 12 tests pass. Dense multi-intersection live placement remains open.

Architectural surface polygon validation (2026-10-09): floor, ceiling and room commands now validate simple outer boundaries and strictly contained, simple void polygons through a shared geometry-kernel validator. Non-finite/degenerate rings, self-intersections, boundary-touching/outside voids, and overlapping or nested voids are rejected atomically before they can create disagreement between Canvas, sheet vectors and takeoff. Wall-derived rooms pass the same simple-polygon check after finished-face offsets, so a collapsing or self-crossing offset is not stored as a valid room. Geometry-kernel tests (7) and room/floor/ceiling command tests (11) pass; dependent package builds pass. Catalog-driven finish assemblies, broader finish patterns, structural-slab constraint parity, multi-storey drawing review and full PDF/DXF acceptance remain open.

Concave room and surface association regression (2026-10-09): an L-shaped six-wall enclosure now has command-runtime coverage for the exact finished-face boundary and shoelace area (6.21 m²), and for floor/ceiling boundaries and room associations derived from that room. This supplements acute-corner, split-room and moved-partition cases; additional concave joins and end-to-end drawing acceptance remain open. The focused room/floor/ceiling command suite passes (11 tests).

Standalone verification after automatic room creation (2026-10-09): `npm run test:standalone` now completes successfully after updating the four-sided kitchen acceptance expectation to include its detected Room. All package builds/tests and the `verify:kitchen`, `verify:file-io`, and `verify:phases` gates pass. The Plan Editor build still reports large PDF/application chunks; this is a performance follow-up, not a build failure.

Elevation viewport control overlap (2026-10-09): browser review of all four elevation directions found that the top-right zoom controls occupied the same hit area as the view tabs; clicking “Zoom in” could switch to 3D instead. The controls now sit in the lower-right corner. Live review of the two-storey house demo on an isolated browser origin confirms North/South/East/West views, wall/opening tags, three level datums, and façade occlusion; zoom changes 100%→125%→Fit 100%, and pointer-drag pans the view. The user's existing 5183 browser project was not replaced. A-10 RCP grid regression compares every exported paper-space segment with `clippedGridSegments`, including a ceiling void. Pan math is extracted and covered by a 7-test viewport/layout suite. Plan Editor production build and all 29 sheet-engine tests pass. Multi-storey print-scale review, dense print-scale readability, varied façade-join coverage, and native CAD plot comparison remain open.

Room split reconciliation (2026-10-09): adding a wall that divides an existing enclosed room now creates the additional wall-derived Room in the same command transaction, preserves the existing Room UUID, avoids duplicate auto-generated marks/numbers, and keeps room-linked floors/ceilings associated with the correct face. Focused room/floor/ceiling tests pass (9); the complete command-runtime suite passes (66). The four-sided kitchen preset now expects and verifies its automatically detected Room; extension-engine tests pass (7), and `verify:kitchen`, `verify:file-io`, and `verify:phases` pass. Acute/concave enclosure behavior, room-label print-scale review, and full floor/ceiling update acceptance remain open.

House-demo elevation raster review (2026-10-09): regenerated and inspected PDF A-05/A-06 from `constructflow-house-demo.cfproj` at its saved 1:100 scale. The four facades show their hosted openings and level datums, and buried footings do not project through the ground hatch. This is useful sheet evidence, but the two-page demo does not cover varied facade joins/overlaps or prove Canvas-to-DXF plotting parity; those acceptance checks remain open.

Shared wall phase hatch geometry (2026-10-09): new-construction masonry now uses one model-space 45-degree segment generator with a wall-anchored pitch and hosted-opening cutouts in the Plan Canvas, Permit A-02/A-03 compiler, legacy A-02 compiler, and DXF ModelSpace exporter. This fixes the prior opposite hatch slopes between Canvas and sheet/DXF paths and removes the legacy SVG-pattern implementation. Focused geometry tests cover direction, pitch continuity, merged opening cutouts and invalid geometry; the standalone sheet assertion now checks editable vector hatch lines. `npm run test:standalone` passes (205 tests plus all three vertical verifiers). Live browser inspection confirms the four elevation views render, zoom controls work, and fit restores scale; print-scale and native CAD plotting acceptance remain open.

Wall level inference at junctions (2026-10-09): Plan Editor wall placement now asks the architecture command to inherit a connected wall's base offset, top-level reference and top offset when a new endpoint touches that wall, including a T-junction at its midpoint. When no existing wall is connected, automatic placement resolves to the next storey datum; explicitly supplied vertical constraints remain authoritative. The prior test had supplied the same references on both walls and did not prove inference; it now omits the new wall's top/offset values and verifies true inheritance plus next-level fallback. Architecture/command-runtime tests and Plan Editor build pass, and the full `npm run test:standalone` suite with `verify:kitchen`, `verify:file-io`, and `verify:phases` passes. Browser wall-draw interaction and more complex multi-wall junctions remain open.

Acute-angle room boundary check (2026-10-09): the wall-centerline room detector now has a command-runtime regression for a narrow 5.7° triangular corner; its finished-face boundary remains finite, stays inside the wall axes, and reports a positive reduced area. This confirms that representative acute miter works, while other narrow/concave joins, room tags at print scale, and broader enclosure acceptance remain open.

Elevation phase-fill parity (2026-10-09): wall elevation phase styling now comes from `resolveElevationWallPhaseStyle` in `representation-engine`, shared by Plan Editor Canvas and the A-05/A-06 sheet compiler. Existing walls use white poche, new walls use light-grey poche, and demolition walls use pale-red poche with a red dashed outline when their projected edge is visible; masonry hatch remains a plan-only representation. Sheet regression compiles all three phases and asserts their fills, representation tests assert the shared palette, and DXF continues to consume the same compiled sheet vectors. Representation, sheet and Plan Editor builds pass; the full `npm run test:standalone` suite and all three project verifiers pass. Native CAD plotting, edge visibility at facade joins, and multi-project print-scale review remain open.

Elevation navigation regression coverage (2026-10-09): wheel zoom now delegates to a tested viewport transform that keeps the world point under the cursor fixed on both axes, accounting for the inverted elevation Y axis; zoom buttons use the same helper centered on the canvas and retain their 20–800% limits. Tests verify cursor anchoring, center zoom, and clamping. Plan Editor TypeScript/Vite production build passes. Browser four-direction interaction, print-scale readability, and native CAD comparison remain open, so this is navigation correctness evidence rather than full elevation acceptance.

Architectural floor finish grid (2026-10-09): floor objects now persist editable tile spacing, world-space origin and rotation. A shared geometry-kernel function generates model-space grid segments clipped to the floor polygon and voids; Plan Canvas and A-02/A-03 render the same pattern for tile/porcelain/ceramic finishes, and DXF receives those sheet vectors. The Inspector exposes X/Y spacing, X/Y origin and angle. Invalid spacing/origin/rotation is rejected by the architecture command. Regression coverage checks rotated patterns, floor holes, command validation and A-02 vector output. `npm run test:standalone` passes, including the Plan Editor production build and all three project verifiers. Other finish-pattern families, native CAD plot inspection, and multi-storey/print-scale visual acceptance remain open.

Shared opening front elevations (2026-10-09): the Plan Editor elevation canvas and permit sheet compiler now draw hosted door/window frames, panel divisions and muntins from the same catalog-resolved `RepresentationShape` linework. This removes the Canvas-only diagonal X marks and uses the actual 50 mm frame face and panel width ratios instead of viewport-specific guesses. A representation-engine regression checks asymmetric 35/65 panels, the frame edge and absence of diagonal lines; the house-demo browser view was reloaded and visually confirmed without the old X. Representation-engine tests (19), sheet-engine tests (27), full Plan Editor build, all 64 command-runtime tests and the three standalone verifiers pass. DXF uses the same sheet vectors and existing adapter tests verify PDF/DXF facade parity; native CAD plotting remains open.

Room label interior placement (2026-10-09): Canvas plans, RCP and A-02/A-03 now use a shared polygon-interior-point resolver rather than vertex averages or polygon centroids that can fall outside concave rooms. The resolver tests concave L-shaped rooms and invalid rings; an A-03 regression also replaces a house-demo room with a concave boundary and verifies its name/area tag compiles without placement warnings. Plan sheet labels continue to avoid object labels/stairs and warn when no paper-space location is available. Browser review on the two-storey house demo confirmed all four elevation tabs render, a wall can be selected from an elevation with its semantic properties shown, and the plan displays wall hatch clipped around hosted openings. The full standalone suite passes, including the Plan Editor production build, all 27 sheet tests and all 64 command-runtime tests; all three project verifiers pass. Visual acceptance for project-specific concave room tags and plotting/opening DXF in native CAD remain open.

Architectural floor/ceiling level references and Inspector editing (2026-10-09): floor and ceiling commands persist an explicit level-relative elevation reference and signed offset, so changing a floor datum moves the surface and its RCP elevation tag together. Existing calls that supplied an absolute elevation are converted to a level offset when updated; older saved objects without the new reference keep their historical absolute position. The Inspector edits level/offset, thickness, ceiling material/grid and floor finish materials, thicknesses and m²/m³ takeoff units. Editing a finish parameter preserves room association; changing the actual boundary detaches it. Invalid layer thickness/material and invalid grid spacing are rejected. Tests cover changed datums, negative floor offsets, ceiling offsets, invalid level references, legacy fallback, room association after property edits, and RCP label movement. `npm run test:standalone` passes, including the Plan Editor production build, all sheet tests, and the room/floor/ceiling command suite. Catalog-driven assemblies, finish hatch/pattern editing, broader constraints, and multi-storey drawing acceptance remain open.

Plan room-tag parity (2026-10-09): A-02/A-03 now print each selected-level room number, name and model area as an interior tag, matching the semantic room data already shown on Plan Canvas and exported by DXF. Placement searches within the actual room polygon, avoids plan object labels and the stair footprint, and warns if no valid location remains. Regression coverage verifies all four rooms on each demo storey; the regenerated A-02/A-03 PDF pages were rasterized and visually inspected. The plan remains intentionally at 1:100 for the two-storey demo; dense stair/structure annotation and native CAD print review are still open.

Stair direction per storey (2026-10-09): A-02 now labels the stair UP and A-03 labels it DN, with the upper-level arrowhead reversed toward the lower storey and tread numbers reversed accordingly. The two-storey house-demo sheet regression asserts the distinct directions; stair representation paths remain shared between the plan outline, walkline and annotation. Focused sheet-engine test passes, and re-rendered A-02/A-03 pages confirm the distinct direction labels and arrows. Native CAD review and the crowded stair/structure region on A-02 remain open.

Elevation datum/tag separation (2026-10-09): A-05/A-06 wall finish and opening marks now avoid the projected horizontal storey datum bands; displaced marks get a short leader. A regression checks wall/opening labels against every visible +0.00/+3.00/+6.00 datum in both elevation panes. The test passes and regenerated A-05/A-06 pages were visually inspected; opening labels remain outside frames. Canvas-versus-sheet comparison and native CAD plot review remain open.

Elevation datum correctness follow-up (2026-10-09): shared vertical resolvers now reject explicitly referenced but missing base/top levels for walls, openings and slabs instead of silently substituting legacy Z/ground or fixed-height values. Legacy objects with no level reference keep their previous absolute-elevation/height fallback. Regression tests cover invalid references and legacy behavior; project-model build and tests (32) and sheet-engine build/tests (22) pass. This prevents corrupted/stale level references from appearing at a false elevation, but does not replace visual acceptance of multi-storey elevations or Canvas/PDF/DXF comparison.

Elevation opening mark collision fix (2026-10-09): PDF A-05/A-06 no longer print a second door/window mark at the mesh centroid inside the glazing. The sheet compiler reserves all projected opening bounds before placing wall-face labels and keeps each opening mark next to its frame with a short leader when displaced. A house-demo regression checks every projected window frame has a nearby mark and no W-tag is drawn inside the frame. Re-rendered A-05/A-06 at 1:100 and visually inspected both pages; focused sheet suite now passes 23 tests, the full standalone build/test and `verify:kitchen`, `verify:file-io`, `verify:phases` pass. Canvas elevation and native CAD comparisons are still needed to close the view/export gate.

Active-level plan/RCP consistency (2026-10-09): Plan Canvas now renders only objects admitted by the shared active-level visibility filter; this prevents rooms, architectural floors and ceilings from other storeys being appended back into the current plan. Canvas RCP grid rendering now clips against valid ceiling voids, matching the sheet compiler so openings such as skylights/service voids remain clear. Representation-engine tests (17/17) verify active-level floor/room/ceiling filtering, and the Plan Editor TypeScript/production build passes. Browser visual acceptance of an RCP ceiling with a void and comparison against A-10/DXF remain open.

Phase-aware wall plan poche (2026-10-09): masonry hatch now requires a masonry/lightweight-block assembly instead of being applied to every new-construction wall. Canvas, A-02/A-03 and DXF call the same project-model resolver, honoring instance overrides, wall data and catalog parameters; steel-stud/board and reinforced-concrete walls do not receive brick hatch. Existing walls retain white poche and demolition remains separately styled. Legacy walls without assembly metadata preserve their previous masonry default. Tests cover catalog/instance resolution, legacy behavior, steel-frame exclusion and opening-clipped sheet hatch. `npm run test:standalone` passes, including Plan Editor build, 23 sheet tests and DXF adapter tests; `verify:kitchen`, `verify:file-io`, and `verify:phases` pass. Fresh house-demo PDF pages A-02/A-05/A-06 were rasterized: the hatch appears in the plan and the elevations fit their viewports, but A-02 object labels still visibly collide; A-05/A-06 face-tag and facade-join acceptance plus native CAD plot/background review remain open.

A-02 wall and stair annotation follow-up (2026-10-09): plan sheet wall-face marks reserve space against structural/object labels, separate inside/outside tags with short leaders, and draw only one tag when both faces share a mark. Placement searches solid wall runs at a finer paper-space increment. Stair geometry and annotations now use the shared stair output paths for straight/L/U flights; ST1 and the stair-cut note are placed outside the generated footprint with leaders. The house demo now models a code-compliant U-shaped stair (900 mm clear width, 220 mm treads) inside its slab opening and room bay instead of the previous straight flight that protruded through a partition and outside the building. Regression checks verify A-02 wall/object labels do not collide and the demo stair/cut note are retained without placement warnings. Sheet-engine tests pass 24/24 and a fresh A-02 PDF raster confirms the stair fits its opening; the stair/beam boundary and other dense tags plus A-02 print scale still need broader plan acceptance.

Plan placement dimensions, units and measurement tools (2026-10-09): temporary X/Y dimensions and numeric entry are shown only while placing supported model objects, not while using Select or Erase. Tab switches the placement reference between center and edge; doors/windows default to measuring from the opening edge and ignore the host wall itself as a dimension target. A project-level `m`/`cm`/`mm` preference now drives supported length displays and inputs while model geometry remains canonical millimeters; it is saved in `.cfproj`, and older projects fall back to meters. Tape Measure (M) shows one temporary value in the selected unit. Underlay scale calibration (R) remains a separate point-to-point workflow available only while an imported reference image is visible. Grid Copy preserves the original line direction; Shift constrains the copy offset perpendicular to it. Backspace during numeric placement edits the dimension without invoking object deletion. These interactions do not replace model-derived geometry, associative dimensions, or the Smart Object source of truth. Project-model tests and Plan Editor production build passed. Physical mobile acceptance and persistent drawing dimensions remain separate work.

Wall finish marks (2026-10-09): W1/W2 now identify finish build-ups on opposite faces of one wall instance. The selectable wall presets are named by physical assembly (AAC 100 mm, AAC 150 mm); each wall stores its core and inside/outside finish layers plus their W1/W2 marks. Legacy project types and object marks are preserved when loaded.

Plan readability and picking correction (2026-10-08): core object badges are laid out in screen space to avoid overlapping, with selected/hovered dimensions expanded and leader lines for displaced labels. Wall/beam placement start markers retain the clicked reference point when center/left/right placement changes. Picking now exposes the candidate stack at the cursor: walls precede coincident beams, Tab/Shift+Tab cycle candidates, and a 44px touch control offers previous/next and an object list for tablets. Verified in the browser on a wall/beam/grid overlap, with a non-overlap check for 15 coincident label anchors and a successful Plan Editor build. UI-only changes preserve object UUIDs, mutation commands and renovation phases; physical iPad validation remains pending. Evidence: `docs/assets/opening-designs-2026-10-08/plan-label-pick-fix.png` and `wall-reference-fix.png`.

Plan label mode (2026-10-08): added a canvas-wide toggle for name only or name plus size; footing, column, beam, wall and opening labels respond together. Foundation marks now sit closer to the footing outline. Browser checked both modes against the sample project.

Plan annotation standard (2026-10-08): tightened the drawing convention to show names for footings, columns, walls and openings, with beam sizes optional via “ชื่อ + ขนาดคาน”. Beam, wall, door and window tags rotate with their host alignment and remain upright when viewed from the opposite direction. The label spacing pass stays in place. Browser verified the resulting sample plan; see `docs/assets/opening-designs-2026-10-08/plan-label-standard.png`.

Plan tag symbols (2026-10-08): object-name badges now support the project legend shapes requested for architectural tags: doors use circles, windows use pentagons, ceiling output tags use ellipses, and walls use triangles. These remain tags around type marks (D1/W1/W1), distinct from drawing callout symbols. Tags stay readable and rotate with the host wall where applicable.

Opening hardware correction (2026-10-08): catalog previews and 3D use edge-based hardware placement, inward-facing levers and bottom-rail placement for awning handles. Fixed panels omit hardware. Louver leaves no longer show the default raised-panel face or leaf muntin overlay in catalog previews; all-louver types show the louver description and hide incompatible face recipe controls. Representation tests cover varying leaf widths, paired handles and awning/fixed behavior. Model identities, command contracts and renovation phases are unchanged.

Opening design collection (2026-10-08): added 16 editable starting designs (8 doors, 8 windows) in Catalog → Doors/Windows → แบบสำเร็จรูป · เลือกสไตล์. Selection creates a draft; committing creates a fresh UUID through DefineStructuralType, including in older projects. 2D/3D share material colors; 3D adds stepped door mouldings, fine groove relief and glazing beads, and window handles follow moving sashes. These remain generic design representations, not vendor SKUs or production specifications. See the delivery addendum in [Opening Builder UX Plan](OPENING-BUILDER-UX-PLAN-2026-10-08.md).

Door face detail update (2026-10-08): added reusable face-component recipes for horizontal/vertical grooves, mixed groove zones, stepped panels, arch, capsule, ellipse and circular accents. The catalog editor shows 12 selectable face recipes and the 2D preview renders the selected recipe; 3D uses the same normalized component layout on both faces. Handles now include rose/base plate, neck, lever or knob, pull mounts and a separate lock cylinder detail. Component validation enforces UUID identity, normalized in-leaf bounds and groove limits. See `doorFace.ts`, `doorFaceDesigns.ts` and the image proof under `docs/assets/opening-designs-2026-10-08/`.

This file is the current high-level implementation dashboard. It is informational; authoritative requirements remain in the referenced specifications and accepted architecture contracts.

2D phase hatch consistency (2026-10-09): new-construction masonry hatch now uses the same 140 mm model-space pitch in Plan Canvas, A-02/A-03 sheet vectors and DXF. Sheet hatch segments are clipped to solid wall runs around hosted door/window openings; existing walls keep their white poche and do not inherit new-work hatch. Focused sheet tests verify hatch presence, opening interruption and absence on existing walls. `npm run test:standalone` passes (12 package suites, including 21 sheet tests), as do `verify:kitchen`, `verify:file-io`, and `verify:phases`; a rendered A-02 page confirms vector hatch output. Dense annotation/model overlap in the kitchen proof plan still needs production cleanup, and visual print-scale plus native CAD acceptance remain open.

Architectural plan viewport cleanup (2026-10-09): A-02/A-03 now choose the largest standard print scale that fits the selected level when no explicit viewport scale is set; saved/user scales still win. This makes compact 4×2.5 m additions legible at 1:25 rather than leaving them tiny at 1:100. Architectural plans omit below-grade foundations and dedicated bathroom detail meshes (retained on S-01/A-09) and wall-surface decorative objects; the kitchen A-02 proof is visibly cleaner. Sheet tests cover per-level source selection, scope separation, auto-scale and explicit-scale preservation. Full standalone build/test and all three vertical verifiers pass; corner wall/column tag spacing and broader multi-storey visual acceptance remain open.

Plan finish tags (2026-10-09): A-02/A-03 now resolve inside/outside finish marks from instance overrides, wall data or the wall catalog and draw each as a face-pointing triangular tag on the longest solid span, away from end columns and hosted openings. The assembly name (e.g. “AAC 100 mm”) no longer substitutes for the W1/W2 finish marks. DXF plan export now resolves the same catalog parameters and emits matching face-side triangular tags. Rendered A-02 visually confirms W1/W2 on opposite sides and no wall-type tag colliding with C1; sheet and DXF tests cover catalog fallback. Native CAD visual acceptance remains open.

2D elevation/RCP follow-up (2026-10-09): elevation and RCP vertical pan/zoom now account for their inverted screen Y axis; wall-face marks are placed in the longest facade span not covered by hosted openings; RCP sheet A-10 follows its selected/active level so ceilings from separate storeys do not overlap. A-05/A-06 now draw hosted door/window frames and panel/muntin lines directly from the opening type shape because hosted openings are semantic cutouts rather than mesh triangles. Orthographic elevation projection suppresses rear hosted openings behind solid nearer facades (and shows them through aligned openings) in Canvas and A-05/A-06; finished elevations omit footing geometry/tags, hide geometry covered by the projected wall face, exclude interior fixtures/cabinetry, mask geometry below grade and omit column/beam tags, while sections retain below-grade structure. New-construction walls render masonry hatch in Canvas, A-02 sheets, and DXF; existing walls render solid white poche in Canvas/PDF and a solid color-7 fill in DXF, while demolition styling remains distinct. The elevation Canvas has visible zoom-in/out and fit controls. A-05/A-06 start at 1:50 and automatically move to a smaller standard scale when required to fit; A-10 similarly fits its plan/RCP extents, and explicit per-sheet scale overrides remain authoritative. Regression tests cover opening frames/marks, front/rear visibility, footing suppression, facade-covered columns, multi-level RCP filtering, below-grade masking and scale overrides. Sheet-engine tests (18) pass. The two-storey demo PDF now fits A-05/A-06 and A-10 without viewport clipping; facade line/join and annotation review remains open.

Elevation datum labels (2026-10-09): Canvas level labels now stay inside the viewport and preserve their vertical order when floor levels are close; when a label must move to avoid overlap, a leader returns it to its actual datum line instead of silently implying another elevation. A standalone layout helper has two regression tests for close datums and a short viewport. Plan Editor TypeScript/production build, both layout tests, and all 19 sheet-engine tests pass. Visual acceptance on a populated multi-storey project remains open.

Elevation facade filtering and joined linework (2026-10-09): Canvas, hosted-opening visibility and A-05/A-06 share one facade-axis classifier. North/south elevations project walls whose long axis runs along X; east/west elevations use walls along Y; end-on walls/openings no longer add false facade geometry. A-05/A-06 omit end-on wall edges before emission and deduplicate coincident projected edges and identical front-face triangles while preserving phase styles. Regression coverage verifies all four directions, diagonal ties, end-on opening suppression, and unchanged linework when an identical wall is added. Representation-engine tests (17), sheet-engine tests (20), elevation-label layout tests (2), Plan Editor production build and `verify:phases` pass. The two-storey demo A-05/A-06 were exported and visually reviewed; remaining review includes wall finish-tag density, facade joins/openings and DXF comparison in a CAD application.

2D sheet cleanup (2026-10-09): removed the generic object-schedule table from geometric view sheets (plans, elevations, sections, roof plan, detail and RCP). Those views previously inherited schedule-overflow warnings and printed an unrelated table at the bottom of the view, including A-05/A-06. Dedicated schedule sheets continue to own those tables. Elevation panes now use cardinal direction labels instead of projection-axis codes. Wall finish marks now resolve from the actual visible side normal and walls viewed end-on no longer receive finish tags. Regression tests check that geometric views omit the generic table/overflow warning, A-05/A-06 show correct directions, and the same wall shows opposite inside/outside marks from opposite sides. Sheet-engine tests (19) and full standalone build/test plus `verify:kitchen`, `verify:file-io`, and `verify:phases` pass. A-05/A-06 PDF pages were freshly rasterized and visually inspected; facade line/join review and opening the exported DXF in a CAD application remain open.

Room refresh after wall edits (2026-10-09): wall create/move/resize/delete commands reconcile closed-loop boundaries into existing wall-derived Room instances in the same undoable CommandBus transaction. Room UUID and area update; associated floors/ceilings that follow the Room receive its boundary. Manual Room boundaries are excluded from wall detection. If a loop opens, the Room and dependent floor/ceiling objects are flagged `unclosed`; Plan/RCP display a red warning and sheet compilation warns before issue. Command-runtime tests cover resizing, stable IDs, open/closed state, propagation, manual detachment, and undo/redo. Complex overlapping-boundary identity matching and room schedule acceptance remain open.

Room boundary detection follow-up (2026-10-09): the level wall graph now splits edges at T-junctions and crossings, walks bounded planar faces (instead of arbitrary cycles that treated the whole building perimeter as an extra room), and drops bridge/dead-end partition stubs from resulting room boundaries. Non-orthogonal faces are supported; geometric centroids improve room identity matching when wall segmentation changes. Regression tests cover two adjacent rooms, unsplit perimeter edges, a dead-end partition, two angled rooms, and moving a shared partition while preserving both Room UUIDs and each dependent floor/ceiling boundary. Architecture-engine (9 tests) and command-runtime (62 tests) pass; room-boundary holes/overlapping-wall topology, larger multi-room identity matching, schedules/tags, and live BOQ acceptance remain open.

Architectural finish takeoff (2026-10-09): `architecture.floor` quantities use net boundary area after subtracting contained void rings, then report material finish layers separately. Layers default to m²; a layer may explicitly select m³ to calculate area × thickness. Ceiling quantities also subtract voids. Takeoff now omits invalid/self-intersecting boundaries, holes outside or touching the perimeter, and overlapping/nested voids instead of reporting misleading quantities. Tests cover an 11 m² net floor with tile and screed layers, an 11 m² ceiling, oversized/outside/overlapping voids, and a self-intersecting boundary. Full standalone build/test and `verify:kitchen`, `verify:file-io`, `verify:phases` pass after the validation change. Live BOQ UI acceptance, editable schedules and visual correspondence of modeled openings to floor/ceiling voids remain open.

Active delivery is standalone-first under ADR-0006 and `ROADMAP.md`. `.cfproj`, the shared command runtime and native 2D/3D/takeoff/sheet engines define the product baseline. Ruby/native entries below are adapter evidence; F0–F3 native closures are not prerequisites for standalone releases.

Standalone UX delivery (2026-10-08): unified visual catalog for seven families, contextual type picker, transactional draft editor with clone/assign, light inspector/workbench, grouped menus and level settings are implemented. Editor 3D preview, direct canvas placement for additional domains and full accessibility verification remain open. See [delivery evidence and remaining work](UX-CATALOG-MENUS-PLAN-2026-10-08.md#ผล-implementation--8-ตุลาคม-2026).

Opening catalog update (2026-10-08): type editor now supports opening dimensions with separate transom/main/bottom regions, per-zone muntin counts, opaque door leaf profiles, selectable handle profiles and finishes; 2D preview and 3D representation use these catalog values. Plan Editor and the affected model/schema/catalog/representation packages build successfully. Hardware previews are generic design profiles, not vendor SKUs or manufacturing/installation specifications. Door/window builder gaps (including operable transoms/sidelights, per-leaf material, product hardware data and production dimensions) remain tracked in [Opening Builder UX Plan](OPENING-BUILDER-UX-PLAN-2026-10-08.md) and [Material & Glass UX Plan](GLASS-MATERIALS-UX-PLAN-2026-10-08.md).

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
- R3 SketchUp Ruby constraint engine: Align/Lock/Offset/Equal/Fixed Distance/Parallel/Perpendicular/Centered/Host/Attach/Level projection and wall constraint editing are implemented on that adapter surface. The standalone TypeScript Plan Editor still needs equivalent persisted constraints and dependent-geometry propagation;
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

Status: **Plan Editor implementation slice complete for the listed phase and underlay workflows; broader production acceptance remains separate.**

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

### Standalone Engine Delivery & Categories 1–4 — implementation baseline (2026-10-07)

Status: **Implementation slices were reported complete for the listed scope; this is not production acceptance of the full Master Specification.** The 2026-10-08 code audit below records integration and correctness gaps found in these slices.

- **Category 1 (UI/UX & Interactive Modeling in Plan Editor)**:
  - **Interactive Stair Placement Tool (`T` shortcut)**: Interactive 2-click placement on Plan Canvas, calculating treads ($\ge 22$ cm) and risers ($\le 20$ cm) conforming to Thai Building Code (กฎกระทรวงฉบับที่ 55). Includes real-time placement ghost, walkline with UP arrow indicator, step count labels, and diagonal cut line for multi-level transitions.
  - **Column & Footing Rebar Detailing Templates**:
    - `ConfigureColumnReinforcement`: Main longitudinal bars (e.g., 4-DB16, 6-DB20), ties/stirrups (RB6, RB9) with dense spacing zones (@0.10m at column ends, @0.15–0.20m in middle zone).
    - `ConfigureFoundationReinforcement`: Bottom mat X/Y reinforcement grids (e.g., DB12@0.15m) and column starter dowels with Bar Bending Schedule (BBS) mass calculation.
  - **Roof Void & Opening Editing**: Void polygons can be authored in command schema/workbench; current roof mesh does not subtract those holes from returned triangles (see 2026-10-08 audit below).

- **Category 2 (Sheet Graphics & Vector Drafting Standards)**:
  - **Ground Baseline & 45° Earth Hatching**: Building elevations (A-05, A-06) and building sections (A-07) now render a bold 0.7mm `#0f172a` ground baseline with 45° double-tick earth hatching.
  - **Elevation Datums**: Level markers with triangular symbols, target elevation values (+0.000m, +3.000m, +6.000m), and horizontal reference leader lines.
  - **Stair 2D Drafting Standards**: Walkline arrow, numbered step indices, and diagonal break lines on A-02/A-03 floor plans.
  - **Reflected Ceiling Plan (RCP)**: Sheet A-10 now renders a 600×600 mm gypsum ceiling tile grid with continuous cornice/moulding perimeter linework.

- **Category 3 (MEP Engineering & Design Calculations)**:
  - **Gravity Drainage Auto-Slope Solver (`solveGravityInverts`)**: Automatically calculates 1:100 cascading Invert Levels (IL) from fixtures and yard drains to downstream manholes, guaranteeing continuous slope and preventing negative grades.
  - **Electrical Phase Balancing (`balanceCircuitsPhase`)**: Automatically balances sub-circuits across 3 phases (Phase A, B, C) while maintaining phase unbalance strictly under 15% (EIT/วสท. standard).
  - **EIT / วสท. Standard Breaker & Wire Sizing (`recommendEITBreakerAndWire`)**: Recommends circuit breaker ratings (AT/AF) and copper conductor cross-sections (THW / IEC01, $mm^2$) according to วสท. cable ampacity standards, directly integrated into Sheet E-02 panelboard schedule.

- **Category 4 (Downstream Adapters & Extensions Packaging)**:
  - **AutoCAD DXF Exporter (`packages/cad-adapter`)**: Exports AutoCAD R2018 DXF files containing 20 PaperSpace layout tabs (`A-01` to `E-02`) with AIA/วสท. phase layers and viewport scaling.
  - **OpenBIM IFC 4.3 & Revit Direct Bridge (`packages/bim-adapter`)**: Converts RFC-4122 UUIDs to 22-character buildingSMART IFC GUIDs, generates IFC 4.3 ADD2 STEP output (schema/application acceptance remains separate), and exports native Revit transfer JSON.
  - **Pure-Node SketchUp RBZ Packager (`npm run package:sketchup`)**: Bundles 486 extension files into `output/constructflow.rbz` (727 KB) cross-platform without native zip or bash dependencies.

- **Verification & Test Status (Baseline)**:
  - `node scripts/test_standalone.mjs`: Rebuilds all packages and passes 76 unit tests across 11 packages (7 project-model, 4 representation-engine, 3 architecture-engine, 1 drainage-engine, 2 electrical-engine, 5 clash-engine, 7 sheet-engine, 35 command-runtime, 7 extension-engine, 2 cad-adapter, 3 bim-adapter).
  - Three vertical acceptance verifiers pass: `npm run verify:kitchen`, `npm run verify:file-io`, and `npm run verify:phases` (generating 20-sheet A3 PDF, 41 Smart Objects, and 44 takeoff rows).

### Core Engine Feature Track Delivery — implementation slices (2026-10-08)

Status: **Core feature slices exist and pass the current fixture suite; production acceptance remains open.** Code review and `npm run test:standalone` do not imply Master Specification completion or legal/engineering approval.

- **[P0] F02 Canonical Schema Mapping Engine (`packages/project-model`)**:
  - Mapping helpers describe a target schema across `.cfproj`, Ruby Bridge, AutoCAD DXF, and IFC 4.3 / Revit; adapters still use independent mappings and need integration/round-trip acceptance.
  - Architecture spec: [`docs/architecture/CANONICAL-SCHEMA-MAPPING.md`](architecture/CANONICAL-SCHEMA-MAPPING.md).
  - Implemented `packages/project-model/src/canonicalMapping.ts` covering 22 canonical families, AIA/วสท. layer mapping, RFC-4122 to 22-char IFC GUID generator, and universal phase resolver.
  - Automated test coverage: 12 unit tests passing in `project-model`.

- **[P1] F03 Legal & Site Survey Compliance Engine (`packages/clash-engine`)**:
  - Implemented `packages/clash-engine/src/legalEngine.ts`:
    - Shoelace parcel calculation from boundary pegs (`calculateParcelFromPegs`); a closing-edge/closure-error defect remains.
    - Thai land measurement unit conversion (`convertSqMetersToThaiLand`, `formatThaiLandArea`) for Rai, Ngan, Sq.Wa, and Sq.m.
    - Thai Building Code (กฎกระทรวงฉบับที่ 55 พ.ศ. 2543 ข้อ 41, 42, 50) setback evaluation (`evaluateThaiBuildingCompliance`).
    - BMA zoning FAR/OSR/permeable-area checks (`evaluateBmaZoning`); unknown zoning and missing permeable-area inputs can false-pass. The legal engine is not integrated into permit issue readiness.
  - Documented in `docs/modules/SITE.md` (AC-SITE-005 to AC-SITE-007).
  - Automated test coverage: 9 unit tests passing in `clash-engine`.

- **[P1] F05 Parametric Stair & Railing Builder (`packages/architecture-engine`)**:
  - Railing geometry/provider helpers exist, but there is no create/update authoring command or UI workflow, project validation does not call railing validation, and post spacing follows path vertices rather than a maximum interval.
  - Enhanced Stair Builder (`packages/architecture-engine/src/stairs.ts`): L-Shape and U-Shape stairs with landing slabs, 3D meshes, and landing takeoff, integrated into `domain-providers`; engineering and interaction acceptance remains partial.
  - Automated test coverage: 5 unit tests passing in `architecture-engine`.

- **[P1] F09 Concave Roof Modeler & Automated Rainwater System (`packages/roof-engine`)**:
  - Ear-clipping triangulation supports concave (L/T-shaped) roof footprints. Roof voids are subtracted from area metrics but are not cut out of returned mesh triangles; multi-slope area remains approximate.
  - Rainwater catchment (`calculateRoofCatchment`) and eaves gutter/downpipe helpers (`solveEaveGuttersAndDownpipes`) exist; end-to-end domain and drawing acceptance remains open.
  - Automated test coverage: 3 unit tests passing in `roof-engine`.

- **[P1] F04 20-Sheet Drawing Engine Enhancement (`packages/sheet-engine`)**:
  - Adaptive schedule multi-column auto-balance on A3 landscape, repeated `(ต่อ)` headers, and overflow banners; an actual continuation sheet is not generated yet.
  - Hidden-line masking helpers exist, but midpoint visibility can hide/show an entire partially occluded edge; tests do not assert known hidden and visible edges.
  - Full vector PDF filled path compilation using `drawSvgPath`.
  - Automated test coverage: 10 unit tests passing in `sheet-engine`.

- **Full Verification Status**:
  - All 12 monorepo packages and `apps/plan-editor` compiled cleanly with zero errors.
  - Latest `npm run test:standalone` passes: 93 unit tests across 12 suites; all three vertical verifiers pass. Phase proof: 41 Smart Objects, 19 domain outputs, 46 quantity rows, 20 A3 PDF pages, and 17 missing-data warnings. These are fixture results, not production sign-off.
  - All 3 vertical domain verifiers pass: `verify:kitchen`, `verify:file-io`, and `verify:phases`.

### 2D drawing acceptance follow-up — 2026-10-09

- DXF PaperSpace now consumes the same `PermitDrawingSet` page-space primitives as PDF instead of placing a generic top-plan viewport on all 20 sheets. Each vector/text/fill is assigned to its matching layout (`410`), preserves phase colors, paper-space lineweights and demolition dash style, and is grouped on discipline view layers; ModelSpace still carries editable project geometry. The house demo exports 563 A-05 and 599 A-06 PaperSpace entities, and freshly rendered A-05/A-06 PDF pages were inspected. CAD adapter tests pass (4/4), and `npm run test:standalone` passes with all vertical verifiers. GstarCAD 2026 is installed, but native layout/plot/background acceptance has not yet been run; schedule pages are vector-editable but native `ACAD_TABLE` conversion remains a separate gap.
- Elevation Canvas now suppresses a facade wall only when a nearer wall fully covers its projected bounds; partially exposed stepped walls remain. Finish/opening tags render after facade fills, preventing overlapping walls from erasing semantic marks. Regression tests cover north/south visibility, stepped exposure, and rear-opening occlusion. Browser-checked the house proof in all four directions: north/south openings and face marks render, the south W2 duplicate is gone, and east/west show the side elevations. Zooming one direction leaves the other direction at its own scale; each view retains a fit control. `npm run test:standalone` passes, including 18 representation tests, 26 sheet tests, CAD adapter tests, and all three vertical verifiers. This closes the current facade-overlap defect; general Canvas/PDF/DXF parity, native CAD plot review, elevation selection/editing, and broader multi-project acceptance remain open.
- Elevation tags now use distinct semantic shapes: wall-face finish marks use the triangular wall symbol, window marks retain the six-sided symbol, and door marks remain circular. The live north elevation confirms the wall W1 and window W1 are distinguishable. Plan Editor TypeScript/Vite production build passes; full standalone tests were run immediately before this rendering-only change.
- Elevation Canvas datum labels and leaders are now drawn after facade, structural, and earth-hatch graphics. This keeps level names and elevations readable when their datum crosses a wall, beam, slab, or ground fill; datum lines remain behind model geometry. Each elevation direction and RCP now keeps its own zoom/pan state. Live browser acceptance confirmed pan by dragging empty canvas, North at 125% remains independent from East at 100%, and the fit control resets the current view. The kitchen proof preset had incorrectly assigned the host wall name (`AAC 100 mm`) to its window mark; it now assigns `W1`, covered by an extension-engine regression test and visually confirmed in the regenerated sample. Plan Editor build and the full standalone suite pass. Full four-direction drawing review, detailed selection/edit acceptance, and Canvas/PDF/DXF comparison remain open.
- Visual inspection of the generated A-02 phase proof confirms new-construction walls use clipped 45° masonry hatch, while existing walls use white poche. The CAD adapter emits editable hatch lines for new walls and a color-7 solid poche for existing walls; focused sheet and DXF tests cover these output contracts. These checks confirm the hatch request is implemented across Canvas, PDF and DXF for plan views; native CAD plotting acceptance is still open.
- Elevation Canvas and sheet wall-face labels now resolve the visible inside/outside mark using instance override → wall instance → catalog type → base mark, matching DXF precedence. Elevation wall fills now distinguish existing (white), new construction (light poche) and demolition (red dashed), while masonry hatch remains plan-only. Regression tests cover N/S/E/W face selection, explicit instance/catalog precedence and phase styling; the Plan Editor TypeScript/Vite build, focused tests and all 21 sheet-engine tests pass. A-05/A-06 were regenerated from the two-storey house demo and visually inspected; facade line/join behavior and native CAD comparison remain open.
- Regenerated A-05/A-06 from `examples/constructflow-house-demo.cfproj`, rasterized both pages and inspected the output after the sheet change. `npm run test:standalone` passes across the monorepo, including the Plan Editor production build; `verify:kitchen`, `verify:file-io`, `verify:phases`, and `git diff --check` pass. Browser checks confirmed elevation zoom, pan, independent view state and fit on the kitchen sample; the current direct 20–800% slider is build/test verified but still needs live interaction review. Elevation production acceptance remains open for selection/editing, façade line/join edge cases, label readability across varied projects, and native Canvas/PDF/DXF comparison. Fixture PDFs and automated contracts are not full acceptance evidence.
- A-10 RCP bug fix (2026-10-09): RCP uses XY coordinates, but the generic non-XY compiler branch was adding vertical floor datums and the ground baseline/hatch to that plan panel. RCP is now excluded from elevation/section datums. A regression test verifies floor-level labels are absent; all 21 sheet-engine tests pass. Regenerated and raster-inspected A-10 from the 8-room/8-floor/8-ceiling house demo; the ceiling grid and boundaries remain, and the stray datum/earth lines are gone.
- A-10 plan label placement (2026-10-09): plan object labels now anchor to wall/beam centerlines, polygon centroids, or object locations rather than the first mesh vertex. A label-box allocator moves colliding marks around their model anchors and draws a light leader when displaced. The house-demo regression test confirms the plan retains its object marks without overlapping annotation boxes. All 22 sheet-engine tests pass; A-10 was regenerated and raster-inspected. Dense marks still need print-size review and native CAD comparison.
- RCP void rendering (2026-10-09): A-10 now overlays a white cutout for each ceiling void before drawing its dashed opening edge; the RCP grid was already clipped around void polygons. This prevents shafts/openings from appearing poche-filled in the PDF/DXF sheet. Added a regression assertion for the knockout fill; sheet-engine build and all 26 sheet-engine tests pass. Rendered A-10 from the two-storey house demo with a temporary 600 × 600 mm void and visually confirmed a blank opening with the grid stopped around it. Complex void geometry and print-scale acceptance remain open.
- Room finish-face boundaries (2026-10-09): wall-derived room loops now offset inward by half each bounding wall's resolved finished thickness; room separators remain zero-thickness. Room area/perimeter and associative Floor/Ceiling boundaries therefore use the interior finished face rather than the wall axis, while manually edited Room boundaries stay untouched. Collinear wall joints are retained where thickness changes, producing a stepped interior finish boundary. Added 100 mm wall rectangle, mixed 100/200 mm wall, stepped same-axis thickness, shared-partition move, wall-loop resize, room identity, and dependent-boundary regression assertions. `npm run test:standalone` passes, including all 64 command-runtime tests and all three vertical verifiers. Acute-angle cases, room-boundary-tag review, and detailed print-scale acceptance remain open.
- House-demo elevation visual pass (2026-10-09): compiled A-05/A-06 directly from `examples/constructflow-house-demo.cfproj` and inspected the vector sheets at their saved 1:100 scale. The sheets contain 557/581 primitives and show North, East, South and West facades; the roof outlines do not cross covered facade areas in these views. The complete `npm run test:standalone` suite now passes, including the shared hidden-edge tests, 32 sheet tests, DXF compiled-vector parity, all 70 command-runtime tests, and the three vertical verifiers. This verifies the current sheet output and compiler parity; live Canvas interaction, rasterized PDF review of this exact build, and native CAD plotting remain open.
- Live RCP label correction (2026-10-09): room tags were drawn before ceiling fills, so ceilings covered most of each label. The Canvas now draws room tags above ceiling fills and grids with a light backing. On the two-storey house demo, all four Ground Floor room names and `20.00 m²` values are fully readable over the ceiling grid. `npm run build --prefix apps/plan-editor`, the complete `npm run test:standalone` suite (32 sheet tests, 70 command-runtime tests, and three vertical verifiers), and `git diff --check` pass. RCP acceptance for varied room sizes, voids, print-scale readability, and cross-view PDF/DXF parity remains open.
- A-02 print legibility pass (2026-10-09): architectural tile courses use the same pale line color in Plan Canvas and the compiled PDF/DXF vectors, and sit beneath wall/stair geometry; the stair break is one light dashed diagonal instead of a heavy double slash. Regression coverage verifies the tile courses stay beneath stair linework and the old heavy cut strokes are absent. Recompiled the 22-sheet house demo, rasterized A-02 at 120 dpi at its compiled 1:100 scale, and inspected the stair/finish area. `npm run test:standalone` passes, including 34 sheet tests, 73 command-runtime tests, CAD vector-parity tests, and all three vertical verifiers; the Plan Editor production build passes after the Canvas style update. Review of other project scales and native CAD plotting remains open.
- A-07 section annotation pass (2026-10-09): coincident object marks are deduplicated and visible section marks use collision-aware placement with leaders, preventing beam/column/foundation tags from stacking at section intersections. A house-demo regression checks both section panels for mark overlap and failed placements. Recompiled the 22-sheet PDF and inspected A-07 raster at 120 dpi and 1:100. `npm run test:standalone` passes, including 35 sheet tests, 73 command-runtime tests, compiled DXF vector parity, and all three vertical verifiers. Other models, annotation hierarchy review, and native CAD plotting remain open.
- House-demo vertical datums (2026-10-09): corrected `scripts/create_house_demo.mjs` and regenerated the saved project so existing ground is ±0.000, Floor 1 is +0.400, Floor 2 is +3.300, and the eaves/upper beam datum is +6.500. Ground-floor slab is +0.280 (120 mm below its finished floor), upper slab is +3.180, walls stop 200 mm below the next datum, columns start at grade, and the stair/cabinetry now start at +0.400. The level-resolution regression checks these values; all 39 sheet tests and the full `npm run test:standalone` suite pass. PDF/CAD replot review of the regenerated elevations remains open.
- Associative plan dimensions (2026-10-09): A-02/A-03 now derive grid-spacing and overall-envelope chains plus hosted door/window width × height strings from the current project model during sheet compilation; aligned column centers provide a fallback when a grid system is absent. The dimensions use the shared PDF/DXF vector primitives. The house-demo regressions verify 4.00 m / 5.00 m grid spans, 8.20 m × 10.20 m wall-envelope extents, and hosted W1 dimensions; a no-grid project verifies column-center fallback. All 39 sheet tests and the full `npm run test:standalone` suite pass. Explicit column-row chains when grids coexist, collision/crop review across varied plans, and persistent manual overrides remain open.

## How to update this file

Update status only when there is evidence in merged code/tests/specs. Distinguish **application-level/pure-Ruby evidence** from **real SketchUp/LayOut acceptance evidence** so a green CI run is never presented as proof of native application behavior.
