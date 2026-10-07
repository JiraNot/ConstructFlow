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
viewport, a kitchen-extension proof model starter, and a first vector A3 issue set (A-02,
S-01 and A-08) with browser print-to-PDF. Thai font shaping, verified print-scale output,
full 20-sheet coverage, full geometry editing and domain-wide quantity/rate coverage remain
future milestones. See the [October 2026 analysis and
development plan](docs/STANDALONE-ENGINE-REVIEW-2026-10.md).

## Run the standalone web app

With Node.js and npm installed, run this once from the repository root to install the local
package dependencies, build the domain engines, build Plan Editor, and start its development
server at `http://127.0.0.1:5173` (Vite chooses the next free port if needed):

```bash
npm run dev:standalone -- --install
```

After dependencies are installed, use `npm run dev:standalone` for later starts. To produce a
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
npm run verify:kitchen-file -- "D:/path/to/CF-KITCHEN-PROOF-001.cfproj"
```

These checks cover the preset → lifecycle phase → takeoff → A-02/S-01/A-08 pipeline and the
local file adapter contract. The file check round-trips canonical `.cfproj` JSON through a real
temporary disk file and checks UUID preservation, as well as write/close ordering and failure
abort behavior. `verify:kitchen-file` validates an actual saved Kitchen Proof file through the
same takeoff and drawing engines. Browser-native picker reopen still needs browser-level acceptance.

Run the standalone regression suite and Plan Editor production build:

```bash
node scripts/test_standalone.mjs --install
```

The implementation has achieved major milestones across the **Plan-Driven Modeling Engine** and **SketchUp 3D Synchronization Bridge**:

1. **2D Plan Editor (Interactive Web/Desktop Canvas):**
   * **Slice 01 (Structure):** Grids, Structural Columns (C1/C2) with intersection snapping, hosted Footings/Piles (F1/F2), and Beams (B1/B2/RB1) with live span calculation and Type Catalog management.
   * **Slice 02 (Architecture):** Smart Walls with multiple thicknesses and materials, hosted Doors (D1-D3) with 4-quadrant swing flipping, and Windows (W1-W3) with dynamic real-time 2D wall cutouts.
2. **SketchUp 3D Synchronization Bridge:**
   * One-click `.cfproj` project import and full Ruby script synchronization (`Core::PlanEditorSync`).
   * SketchUp CommandBus automatically creates 3D columns, footings, beams, walls, and parametric door/window infills with real cutouts into walls while preserving exact Smart Object UUIDs.
   * Extension Directory Junction configured for instant hot-reload during development.
3. **Upcoming Sequence:**
   * **Phasing & Renovation:** Existing (บ้านเดิม), Demolition (ส่วนรื้อถอน), New Construction (ส่วนสร้างใหม่).
   * **AI Vision & Underlay:** Image/DWG underlay with Point-to-Point Scale Calibration.
   * **Standalone Sheet Auto-Dimensioning:** Associative vector dimensions, hatches and annotations for native sheets, with optional LayOut export.

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
