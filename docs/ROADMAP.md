# ConstructFlow Development Roadmap

This is the active product roadmap under [ADR-0006](decisions/ADR-0006-standalone-first-engine.md). ConstructFlow owns the canonical `.cfproj` document, native computation, 2D/3D workbench, takeoff and sheet compilation. External CAD/BIM tools are optional downstream adapters.

> **Plan-driven modeling first: draw and edit the semantic model in plan, see 3D update immediately, and keep schedules, quantities and documents attached to the same Smart Objects.**

The detailed rationale and upgrade tracks are defined in [`PLAN-DRIVEN-MODELING-UPGRADE.md`](./PLAN-DRIVEN-MODELING-UPGRADE.md).

Standalone engine delivery uses S0–S5 from [`STANDALONE-ENGINE-REVIEW-2026-10.md`](STANDALONE-ENGINE-REVIEW-2026-10.md): S0 schema/history supports R0/R3; S1 takeoff supports R9; S2 native 3D/assemblies supports R1/R2/R4/R6; S3 spatial/MEP/rule inputs supports R7/QA; S4 sheets supports R5/R9; S5 adapters/MCP supports interoperability/R10. These are cross-cutting engine milestones, not a second competing product roadmap.

## Roadmap policy

ConstructFlow is not attempting full Revit parity. Revit is used only as a baseline for the modeling behaviors that make everyday architectural work fast and coherent: plan-driven creation, hosted elements, joins, levels, type/instance parameters, constraints, schedules and associative documents.

ConstructFlow should remain optimized for residential renovation, extension and small-building production, with differentiated workflows in drainage, paving, joinery, BOQ and construction automation.

The roadmap now favors **depth of editing behavior over breadth of object inventory**. A smaller number of objects that can be drawn, stretched, hosted, joined, parameterized and documented reliably is more valuable than a large registry of shallow generators.

---

## R0 — Standalone Project Reliability Gate

**Goal:** prove canonical project persistence, command transactions and derived output consistency in ConstructFlow without external CAD/BIM software.

Deliverables:

- `.cfproj` Open / edit / Save / close / reopen with stable Smart Object UUIDs
- canonical schema/catalog validation and deterministic legacy migrations
- semantic commands and atomic batch Undo/Redo with rejection/exception rollback
- copy/duplicate identity and host/dependency relationship behavior
- shared 2D/3D selection, level context and command-driven editing
- takeoff and initial sheet consistency after edits and reopen
- explicit stale/current state and recovery after failed file/output operations
- acceptance evidence for actual supported browser file workflows

Exit criteria:

- a representative local residential project survives file roundtrip, editing and Undo/Redo with the same UUIDs, relationships, phased quantities and supported drawings

SketchUp/LayOut integration has separate adapter acceptance gates. Those gates do not block standalone engine releases and are required only when claiming the corresponding adapter capability.

---

## R1 — Plan Editor + Smart Wall 2.0 (Vertical Slice 01 & 02 Completed)

**Goal:** make plan editing a first-class production modeling environment.

### Implemented slices and optional adapter evidence
- [x] **Slice 01 (Structure):** Grids (A-C, 1-3), Columns (C1/C2) with intersection snapping, hosted Foundations (F1/F2), and Beams (B1/B2/RB1) with live span calculation and Type Catalog.
- [x] **Slice 02 (Architecture):** Smart Walls (W1-W3) with thickness/material options, hosted Doors (D1-D3) with 4-quadrant swing flipping, and Windows (W1-W3) with dynamic real-time 2D wall cutouts.
- **Standalone 3D:** Renderer-neutral descriptors and the WebGL viewport consume the same `.cfproj` Smart Objects; editing breadth and evidence are tracked in `STATUS.md`.
- **Optional SketchUp Sync Bridge:** `.cfproj` import and Ruby sync are adapter capabilities, separate from standalone 3D and R1 completion.

### Upcoming R1 Feature Tracks:
- **Phasing Awareness for Renovation:** Continue domain-wide lifecycle coverage for Existing (บ้านเดิม), Demolition (ส่วนรื้อถอน), and New Construction (ส่วนสร้างใหม่); existing standalone evidence is tracked in `STATUS.md`.
- [ ] **AI Vision & Underlay Calibration:**
  - Import floor plan image (PNG/JPG) or 2D DWG as underlay.
  - Point-to-Point Scale Calibration tool (click two points, specify distance e.g. 4.00m to scale the plan accurately).
  - Floor-to-floor elevation setup (e.g. GF to L2 height prompt).
- [ ] **Auto-Dimensioning Engine:** Associative exterior grid-to-grid, column-to-column and opening dimension strings for standalone vector sheets, with optional adapter export.

---

## R2 — Hosted Architecture Core (In Progress)

**Goal:** complete the minimum architectural primitives needed for a simple residential level.

Deliverables:

### Door / Window / Opening 2.0
- [x] host-wall placement preview and snapping
- [x] host relationship and offset along host calculation
- [x] width / height / sill / head dimensions
- [x] hand/facing/flip state (4 quadrants)
- [x] dynamic 2D wall cutouts without breaking topology
- [x] 3D hole punching and infill creation via SketchUp CommandBus
- [ ] type vs instance parameters flex in UI
- [ ] host stretch reconciliation

### Floors & Ceilings
- boundary + holes
- level / offset
- thickness / layered build-up
- materials and hatch representations
- slopes where applicable
- quantity representation

### Rooms

- enclosure detection
- room separation boundaries
- name / number
- area / perimeter
- finishes / usage metadata
- phase awareness
- room tags and room schedules foundation

Exit criteria:

- a complete simple residential level can be created with walls, hosted openings, floors, ceilings and rooms primarily through ConstructFlow tools

---

## R3 — Parametric Object + Constraint / Dependency Foundation

**Goal:** stop long-term growth from depending on family-specific hard-coded geometry behavior.

Deliverables:

### Parametric Object Engine

- type parameters
- instance parameters
- formula parameters
- formula validation and cycle protection
- references
- nested objects
- visibility rules
- 2D + 3D representation hooks
- hosts
- connectors

Initial consumers:

- doors
- windows
- cabinet modules
- selected roof/accessory objects
- structural members

### Constraint / Dependency Engine

Initial constraints:

- Align
- Lock
- Offset
- Equal
- Fixed Distance
- Parallel
- Perpendicular
- Centered
- Host
- Attach
- Level Constraint

Use the existing command/event/dirty-state architecture for deterministic propagation.

Exit criteria:

- at least one door/window family and one joinery object flex through type/instance/formula behavior
- representative host/attach/alignment dependencies update without manual rebuild commands

---

## R4 — Roof 2.0 + Structure Primitives

**Goal:** make the common residential shell and extension frame editable from plan instead of generator-only geometry.

### Roof 2.0

Deliverables:

- flat
- lean-to
- gable
- hip
- multi-slope
- custom footprint
- ridge / hip / valley / eave / rake topology
- slope by footprint/edge intent
- [x] roof openings & void polygon editing
- wall attachment relationships
- fascia / soffit / flashing integration
- gutter / downpipe integration

### Structure 2.0

Deliverables:

- [x] structural grid
- [x] piles / pile groups (I-18 preliminary head offsets)
- [x] footings / pile caps (spread & hosted)
- [x] ground beams & beam drop
- [x] RC columns & column reinforcement templates (`ConfigureColumnReinforcement`)
- [x] RC beams & beam bending schedules (BBS)
- [x] RC slabs (SOG, suspended, precast plank with topping)
- [x] structural steel members (H-beam, C-channel)
- [x] footing reinforcement templates (`ConfigureFoundationReinforcement`)
- [x] basic connection metadata
- [x] rebar metadata & BBS tonnage calculation
- [x] plan snapping to grids, columns, wall axes/faces and beam endpoints

Exit criteria:

- a typical house extension foundation, frame and roof can be laid out and adjusted primarily from plan
- roof/rainwater and structure/drainage relationships remain coordinated

---

## R5 — Model-Driven Documentation

**Goal:** move documentation from late-stage output to an associative view of the same Smart Object model.

Deliverables:

### Views

- [x] plan (A-02 ground, A-03 upper with stair walklines & cutlines)
- [x] reflected ceiling plan (A-10 with 600×600 gypsum grid & cornice outlines)
- [x] elevation (A-05, A-06 with 0.7mm ground baseline & 45° earth hatching, elevation datums)
- [x] section (A-07 building sections with earth line & datums)
- [x] detail / callout (A-09 bathroom plan & section callouts)
- [x] schedule (A-08 doors/windows, S-05/S-06 structural/BBS, E-02 panelboard)
- [x] sheet (20-Sheet A3 vector set with embedded Sarabun Thai font)

### Associative annotations

- [x] dimensions (overall, wall envelope, column-span)
- [x] elevation datums & levels (triangles, targets, leaders)
- [x] ground baseline & 45° earth hatching
- [x] stair walklines & diagonal break lines
- object tags
- room tags
- level tags
- door/window tags
- section markers
- elevation markers
- material callouts
- revision/change markers

### Schedule as Model Editor

Initial editable schedules:

- Smart Wall
- door
- window
- room
- finish
- lighting/device
- plumbing fixture
- structural member
- quantity/BOQ

Rules:

- editable instance fields change selected instances
- editable type fields update every instance of a type
- calculated fields remain read-only
- validation runs before committing schedule edits

Exit criteria:

- a legal schedule edit updates plan and 3D
- representative dimensions, tags and schedules update after model changes without manual redrafting

---

## R6 — Renovation + Extension Workflow 2.0

**Goal:** turn existing/demolition/new work into a differentiated construction workflow rather than only a visibility mode.

Deliverables:

### Renovation intent

- Existing to Remain
- Existing to Modify
- Demolition
- New Work
- Relocate / Replace
- replacement relationships
- phase-aware quantity
- phase-aware views/schedules

Representative workflow:

`Existing Wall → Demolition Opening → New Door → Structural/finish review requirements → Demolition Quantity → New Work Quantity → Updated Documents`

### Extension Generator 2.0

Generators compose normal editable Smart Objects rather than opaque geometry.

Typical package:

- Walls
- Floor
- Openings
- Columns
- Beams
- Roof
- Gutter / Downpipes
- Drainage
- Electrical

Package intent remains available for reconciliation, but generated objects use the same Plan/3D editors as manually created objects.

Exit criteria:

- a generated residential extension can be resized and edited with ordinary Smart Object tools while package relationships, quantities and documents reconcile correctly

---

## R7 — Residential MEP Coordination

**Goal:** build from the existing drainage strength into a shared residential MEP system foundation.

Shared concepts:

- system
- connector
- network
- route
- fitting
- size
- source / destination
- flow/load metadata

### Drainage

Preserve and deepen:

- [x] route editing & node topology
- auto-route alternatives
- [x] editable route nodes & manhole relocation
- [x] intermediate manholes & sizing (30x40, 40x50, 60x80)
- [x] slope / invert calculations (`solveGravityInverts` 1:100 auto-cascading slope)
- rainwater integration
- coordination with structure/surfaces

### Plumbing

- [x] cold water & pump 3-valve bypass topology
- hot water
- [x] waste & soil pipe slopes (1:50, 1:100)
- [x] vent & P-trap drain logic
- [x] fixtures & rough-in coordinates (water closet 305mm offset)
- [x] valves / tanks / booster pumps & septic PE sizing validation

### Electrical

- [x] lighting/device placement & mounting heights
- switches/control links
- [x] general/dedicated outlets with grounding
- [x] panelboard / consumer unit (MDB/CU)
- [x] circuit load calculation & วสท. breaker/wire sizing (`recommendEITBreakerAndWire`)
- [x] 3-phase balancing (`balanceCircuitsPhase` with unbalance < 15%)
- [x] schedules & Single Line Diagram (Sheet E-02)

Exit criteria:

- a representative house extension has coordinated drainage, plumbing and electrical semantics with plan documentation and QA

---

## R8 — Surface / Landscape / Joinery on the Common Editing Engine

**Goal:** preserve ConstructFlow differentiators while eliminating domain-specific editing islands.

### Surface / Paving

- arbitrary/freeform boundaries
- holes/islands
- floor build-ups
- spot levels/slopes
- multiple borders
- grid/running-bond/herringbone/radial/custom pattern framework
- curved cuts / follow-path behavior
- parking bays
- garden paths
- control/expansion joints
- tree/planter cutouts
- drain relationships
- cut-piece-aware quantities where feasible

### Landscape

- lawns / planting beds
- trees / shrubs / planters
- benches / fountains / pergolas/screens
- garden lighting/water/drainage relationships

### Interior / Joinery

- cabinet run plan tool
- module / compartment hierarchy
- swing/sliding/lift fronts
- drawers / shelves / fillers / toe kicks
- countertops / cutouts
- wall/ceiling fit relationships
- hardware catalog integration
- elevation/section generation
- cut-list/hardware/BOQ links

Exit criteria:

- these domains use the common plan interaction, parameter and documentation foundations rather than isolated tool behavior

---

## R9 — Quantity / Cost / QA / Publication

**Goal:** make the coordinated model commercially and document-production complete.

### Quantity / BOQ / Cost

- normalized quantity pipeline
- Smart Object traceability for every reported quantity
- demolition vs new-work grouping
- material/labor/waste/rate layers
- company/project rate libraries
- BOQ views
- CSV/XLSX export contract
- stale/current state

### QA / Coordination

Priority checks:

- footing/beam vs drainage
- column vs existing utilities
- pipe slope / disconnected network
- roof drainage without approved destination
- door/furniture conflicts
- window/cabinet conflicts
- downpipe/opening conflicts
- electrical points vs wet zones
- surface fall vs drainage
- stale quantity/documentation after model change

### Publication

- issue sets
- sheet/title/revision data
- standalone vector sheet/PDF export orchestration
- optional LayOut integration with independent adapter acceptance
- publication gate
- issue history

Exit criteria:

- every published drawing and BOQ can prove currentness against the model state and trace reported quantities back to Smart Objects

---

## R10 — AI Copilot

**Goal:** layer natural-language orchestration on top of stable human-editable commands and semantics.

Deliverables:

- command discovery
- model-context resolver
- catalog search
- structured command proposals
- scenario/options generation
- approval gates
- QA-aware suggestions

AI should invoke the same production commands used by human UI, for example:

- `CreateWall`
- `PlaceHostedWindow`
- `CreateFloor`
- `CreateRoom`
- `AlignObject`
- `AttachWallToRoof`
- `CreateStructuralMember`
- `RouteDrain`
- `GenerateExtension`
- `CreateSection`
- `CreateSchedule`
- `RefreshBOQ`

AI must never receive a raw-geometry bypass path for production Smart Objects.

---

## Immediate development priority

The next focus is:

1. **R0 — Standalone Project Reliability**
2. **R1 — Plan Editor + Smart Wall 2.0**
3. **R2 — Hosted Architecture Core**
4. **R3 — Parametric Object + Constraint/Dependency Foundation**
5. pull forward only the R5 documentation primitives required to make plan editing production-usable

Do not prioritize additional object-family breadth until these interactions are strong:

`Draw → Select → Move → Stretch → Host → Join → Align → Type → Instance → Schedule → Document`

---

## North-star acceptance scenario

ConstructFlow should eventually complete the following representative workflow through its standalone workbench and shared command runtime:

`Create Project → Create Level → Draw Walls in Plan → Place Doors/Windows → Detect/Create Rooms → Create Floors/Ceilings → Add Columns/Beams → Create Roof → Add Fixtures → Route Drainage → Generate Sections/Elevations → Generate Schedules → Generate BOQ → Publish Sheets`

Then change a major wall dimension by `+500 mm`.

The system should update, reconcile or explicitly flag:

- wall geometry
- wall joins
- hosted openings
- room boundaries/areas
- dependent floors/ceilings
- configured roof/structural dependencies
- drainage conflicts
- dimensions/tags
- schedules
- quantities/BOQ
- drawing currentness

Passing this scenario smoothly is a stronger milestone than broad feature-count parity with Revit.

---

## Scope continuity

No previously accepted major product domain is removed by this resequencing. Existing/ongoing work remains part of ConstructFlow:

- Site & existing conditions
- Architecture
- Opening / Door / Window
- Decorative wall & façade
- Extension
- Roof & envelope
- Structure
- Surface / paving
- Landscape
- Plumbing / drainage
- Electrical
- Interior / joinery
- Library / catalog
- Quantity / BOQ / costing
- Drawing / LayOut
- QA / revision / site workflow
- AI orchestration

The change is **implementation order and UX foundation**, not scope reduction.
