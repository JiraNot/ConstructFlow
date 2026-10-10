# ConstructFlow

**by JiraNot**

ConstructFlow is a standalone modular BIM and design-to-construction platform for renovation, extension, architecture, structure, landscape, interiors, MEP, quantity takeoff, construction documentation, and fabrication-oriented outputs. SketchUp and other CAD/BIM tools are optional downstream adapters.

## Product direction

ConstructFlow is not intended to be a collection of disconnected SketchUp tools. The platform is designed around smart construction objects, explicit relationships, construction phases, levels, commands, events, catalogs, and modular domain packages.

Core workflow:

`Draw → Select → Move → Stretch → Host → Join → Align → Type → Instance → Schedule → Document`

Core lifecycle:

`Existing → Demolition → New Construction`

## Status

The standalone semantic foundation now separates command execution, domain handlers and
extension preset planning from React. The Plan Editor opens and saves local `.cfproj` files,
uses schema v2 with a v1 migration, exposes model Undo/Redo, and calculates an initial
quantity-only BOQ with CSV export. The Plan Editor includes a lazy-loaded Three.js/WebGL
viewport and a kitchen-extension proof model starter. The Phase 1–6 workbench now adds
beam/slab/column/footing catalogs and BBS detailing, stair placement (shortcut `T`), convex footprint
roofs with void editing, continuous mouldings, decorative panels, manhole/IL gravity auto-slope networks,
pump bypass, bathroom plan/section, joinery cut lists, LED sizing, and electrical phase balancing.
A native vector compiler produces the 20-sheet A3 draft set with embedded Sarabun Thai shaping,
ground baseline with 45° earth hatching, elevation datums, stair walklines, and Reflected Ceiling Plans (RCP).
Downstream adapters provide 20-layout PaperSpace AutoCAD DXF, OpenBIM IFC 4.3, and a zero-dependency
cross-platform SketchUp `.rbz` packager (`npm run package:sketchup`).
Missing source data, clipping and schedule overflow are reported; the set is not certified
for permit submission. See the [implementation and verification record](docs/implementation/STANDALONE-PHASES-1-6.md)
for supported inputs and remaining Master coverage. The [October 2026 analysis](docs/STANDALONE-ENGINE-REVIEW-2026-10.md)
records the earlier baseline.

## Run the standalone web app

With Node.js and npm installed, run this once from the repository root to install the local
package dependencies, build the domain engines, build Plan Editor, and start its development
server at `http://localhost:5183`. It listens on all network interfaces, and the fixed port makes
the home-LAN firewall rule repeatable. Vite also prints the `Network` URL to open from another
device on the same private Wi-Fi/LAN:

```bash
npm run dev:standalone -- --install
```

After dependencies are installed, use `npm run dev:standalone` for later starts, or run
`npm run dev` from `apps/plan-editor`. Run `scripts/enable_lan_dev_firewall.ps1` once as
Administrator on the host PC, while connected to the home Wi-Fi, so Windows allows TCP port 5183
from the local subnet on a Private profile. To produce a
production build without starting the server, use `npm run build:standalone`. These commands do
not run test suites.

The generated [Kitchen Extension Proof project](examples/kitchen-extension-proof.cfproj)
is a local `.cfproj` example with an Existing host wall and a 4.00 × 2.50 m New Construction
extension. After building `project-model` and `extension-engine`, regenerate it with
`node scripts/generate_kitchen_proof_fixture.mjs`; the editor's Kitchen Proof button uses the
same atomic project factory. The [legacy v1 migration fixture](examples/kitchen-extension-proof-v1.cfproj)
keeps a realistic catalog-by-mark project for schema-upgrade acceptance. Regenerate and verify it
with `node scripts/generate_legacy_migration_fixture.mjs` after building those same packages.
The compiler outputs a reproducible [A-02 / S-01 / A-08 drawing set](examples/kitchen-extension-drawings/manifest.json)
from the same `.cfproj`; regenerate the SVG pages with `node scripts/generate_kitchen_drawing_set.mjs`
after building `project-model` and `sheet-engine`.

After a standalone build, run the first-slice acceptance checks with:

```bash
npm run verify:kitchen
npm run verify:file-io
npm run verify:phases
npm run verify:kitchen-file -- "D:/path/to/CF-KITCHEN-PROOF-001.cfproj"
```

To package the SketchUp extension into an installable `.rbz` distribution bundle:

```bash
npm run package:sketchup
# Outputs: output/constructflow.rbz
```

`verify:phases` generates `output/pdf/phase-1-6-proof.pdf`, a matching `.cfproj`, SVG/HTML
and a source/quantity/warning report. In the app, open **Phase 1–6 · BIM & Sheets** to create
or edit objects, update catalogs, adjust saved viewports and download vector PDF/cut-list CSV.

These checks cover the preset → lifecycle phase → takeoff → A-02/S-01/A-08 pipeline and the
local file adapter contract. The file check round-trips canonical `.cfproj` JSON through a real
temporary disk file and checks UUID preservation, as well as write/close ordering and failure
abort behavior. `verify:kitchen-file` validates an actual saved Kitchen Proof file through the
same takeoff and drawing engines. Browser-native picker reopen still needs browser-level acceptance.

Run the standalone regression suite (80 unit tests across monorepo packages + 3 end-to-end verifiers) and Plan Editor production build:

```bash
node scripts/test_standalone.mjs --install
```

The implementation has achieved major milestones across the **Plan-Driven Modeling Engine**, **Permit Sheet Engine**, and **Downstream Adapters**:

1. **2D Plan Editor & Parametric Modeling:**
   * **Structure & Detailing:** Grids, Columns (C1/C2) with intersection snapping, hosted Footings/Piles (F1/F2), Beams (B1/B2/RB1) with live span calculation, Footing & Column rebar detailing templates (`ConfigureColumnReinforcement`, `ConfigureFoundationReinforcement`), Beam Bending Schedules (BBS), and Structural Slabs with Revit-style Level references and signed vertical offset controls (`elevation_offset_mm`).
   * **Architecture & Openings:** Smart Walls with thickness/material options, hosted Doors (D1-D3) with 4-quadrant swing flipping, Windows (W1-W3) with clean AutoCAD/Revit vector symbols and exterior slide indicators, flexible vertical head constraints (`head_level` vs `fixed_height`), and interactive Stair Tool (`T` shortcut) with live walkline arrows and diagonal cut lines.
   * **Revit-Style BIM Elevation Views:** 4-direction orthographic facades with selection bounding box, 8 CAD/Revit grip handles, and temporary elevation & height badges (`▲ Top`, `▼ Base`, `H Height`).
   * **Roofs & Ceilings:** Convex footprint roofs with slope definitions and void editing, plus Reflected Ceiling Plan (RCP 600×600) grid styling.
2. **MEP Engineering & Design Calculations:**
   * **Sanitary & Drainage:** Gravity auto-slope solver (`solveGravityInverts`) with 1:100 cascading Invert Levels (IL) to manholes, and septic tank PE capacity verification.
   * **Electrical:** 3-phase balancing (`balanceCircuitsPhase`) maintaining phase unbalance under 15%, and วสท. standard breaker/wire sizing (`recommendEITBreakerAndWire`) integrated into Sheet E-02.
3. **20-Sheet A3 Vector Permit Set & Graphics:**
   * Embedded Type0 Sarabun Thai font, ground baseline with 45° double-tick earth hatching, elevation datums, stair walklines, and saved viewport persistence.
4. **Downstream Adapters & Interoperability:**
   * **SketchUp Bridge & Packaging:** Bi-directional synchronization bridge and cross-platform `.rbz` extension builder (`npm run package:sketchup`).
   * **AutoCAD DWG/DXF:** Native R2018 DXF generator with 20 PaperSpace layouts and AIA/วสท. phase layering.
   * **OpenBIM & Revit:** IFC 4.3 ADD2 STEP serializer with RFC-4122 to 22-character GUID conversion, plus Revit direct transfer schema.

See the [Master Upgrade Plan](docs/PLAN-DRIVEN-MODELING-UPGRADE.md), [Roadmap](docs/ROADMAP.md) and [implementation status](docs/STATUS.md) for the authoritative sequence and evidence boundary.

## Initial domain scope

- Site, survey, datum, levels, grids
- Existing / demolition / new-construction phasing
- Architecture, openings, doors and windows, decorative walls and mouldings
- Extensions, roofs, polycarbonate/glass roofing, fascia, soffit, flashing, gutters
- RC, steel, piles, foundations, beams, slabs, rebar
- Surface and paving layouts, borders, curves, slopes, parking and landscape
- Interior, joinery, cabinetry, furniture takeoff and shop drawings
- Electrical, plumbing, drainage, manholes and pipe networks
- Model/catalog/assembly/detail libraries
- Quantity takeoff, BOQ, costing, QA, revisions and drawing output
- AI orchestration through the same command API used by human operators

## Architecture principles

1. Modular platform, not a monolithic plugin.
2. A small stable core; domain behavior lives in modules.
3. Modules communicate through contracts, commands and events.
4. Smart objects own domain data and relationships, not only geometry.
5. Phase, level and revision are separate dimensions.
6. Human UI and AI invoke the same domain commands.
7. Geometry is generated by deterministic domain engines; AI does not mutate SketchUp geometry directly.
8. One project model is the source of truth for model, quantity and documentation outputs.

Detailed architecture and implementation blueprints will be developed under `docs/`.
