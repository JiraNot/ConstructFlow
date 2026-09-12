# ConstructFlow Development Roadmap

This roadmap preserves the full ConstructFlow product scope while resequencing development around a new product priority:

> **Plan-driven modeling first: draw and edit the semantic model in plan, see 3D update immediately, and keep schedules, quantities and documents attached to the same Smart Objects.**

The detailed rationale and upgrade tracks are defined in [`PLAN-DRIVEN-MODELING-UPGRADE.md`](./PLAN-DRIVEN-MODELING-UPGRADE.md).

## Roadmap policy

ConstructFlow is not attempting full Revit parity. Revit is used only as a baseline for the modeling behaviors that make everyday architectural work fast and coherent: plan-driven creation, hosted elements, joins, levels, type/instance parameters, constraints, schedules and associative documents.

ConstructFlow should remain optimized for residential renovation, extension and small-building production, with differentiated workflows in drainage, paving, joinery, BOQ and construction automation.

The roadmap now favors **depth of editing behavior over breadth of object inventory**. A smaller number of objects that can be drawn, stretched, hosted, joined, parameterized and documented reliably is more valuable than a large registry of shallow generators.

---

## R0 — Native Reliability Gate

**Goal:** prove the existing semantic/application architecture inside real SketchUp and LayOut before expanding modeling breadth.

Deliverables:

- `.skp` save / close / reopen with stable Smart Object identity
- geometry + semantic metadata in a single reliable Undo/Redo operation
- copy/duplicate identity behavior
- New/Open model observer behavior
- migration fixtures against real model attributes
- representative interactive tools and handles in SketchUp
- native scenes/styles/section state persistence
- LayOut template/viewport/PDF verification
- stale/current and recovery behavior after failed/partial operations

Exit criteria:

- a representative small residential model survives save/reopen, copy, Undo/Redo and document regeneration without semantic corruption

---

## R1 — Plan Editor + Smart Wall 2.0

**Goal:** make plan editing a first-class production modeling environment.

Deliverables:

### Plan Interaction Engine

- level-aware plan editing plane
- endpoint / midpoint / intersection snapping
- axis inference
- perpendicular / parallel inference
- host/reference snapping
- previews
- temporary dimensions
- numeric input
- chain drawing
- selection filters
- grips / handles
- move / copy / stretch
- placement validity feedback

### Smart Wall 2.0

- wall path editing
- wall types
- layered wall assemblies
- materials per layer
- core definition
- base level / base offset
- top constraint / top offset
- unconnected height
- location lines: center/core/finish faces
- wall orientation
- room-bounding state
- L/T/X/corner join engine
- butt/miter/disallow-join behavior
- stretch and numeric length editing from plan

Exit criteria:

- a user can lay out and reshape a multi-room wall plan without relying on raw SketchUp Line / Rectangle / Push-Pull for primary walls
- 3D geometry and joins follow plan edits deterministically

---

## R2 — Hosted Architecture Core

**Goal:** complete the minimum architectural primitives needed for a simple residential level.

Deliverables:

### Door / Window / Opening 2.0

- host-wall placement preview
- host relationship
- offset along host
- width / height / sill / head
- hand/facing/flip state
- automatic opening cut
- type vs instance parameters
- host stretch reconciliation
- host deletion/replacement resolution

### Floors

- boundary + holes
- level / offset
- thickness / layered build-up
- materials
- slopes where applicable
- quantity representation

### Ceilings

- boundary
- level / height / offset
- materials
- reflected-ceiling representation
- hosting contract for ceiling devices

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
- roof openings
- wall attachment relationships
- fascia / soffit / flashing integration
- gutter / downpipe integration

### Structure 2.0

Deliverables:

- structural grid
- piles / pile groups
- footings / pile caps
- ground beams
- RC columns
- RC beams
- RC slabs
- structural steel members
- basic connection metadata
- rebar metadata / optional higher-LOD representation
- plan snapping to grids, columns, wall axes/faces and beam endpoints

Exit criteria:

- a typical house extension foundation, frame and roof can be laid out and adjusted primarily from plan
- roof/rainwater and structure/drainage relationships remain coordinated

---

## R5 — Model-Driven Documentation

**Goal:** move documentation from late-stage output to an associative view of the same Smart Object model.

Deliverables:

### Views

- plan
- reflected ceiling plan
- elevation
- section
- detail / callout
- schedule
- sheet

### Associative annotations

- dimensions
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

- route editing
- auto-route alternatives
- editable route nodes
- manhole relocation
- intermediate manholes
- slope / invert
- rainwater integration
- coordination with structure/surfaces

### Plumbing

- cold water
- hot water
- waste
- soil
- vent
- fixtures
- valves / tanks / pumps where required

### Electrical

- lighting/device placement
- switches/control links
- general/dedicated outlets
- panel
- circuit
- basic load metadata
- schedules

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
- LayOut integration
- PDF export orchestration
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

1. **R0 — Native Reliability**
2. **R1 — Plan Editor + Smart Wall 2.0**
3. **R2 — Hosted Architecture Core**
4. **R3 — Parametric Object + Constraint/Dependency Foundation**
5. pull forward only the R5 documentation primitives required to make plan editing production-usable

Do not prioritize additional object-family breadth until these interactions are strong:

`Draw → Select → Move → Stretch → Host → Join → Align → Type → Instance → Schedule → Document`

---

## North-star acceptance scenario

ConstructFlow should eventually complete the following representative workflow primarily through ConstructFlow tools rather than raw SketchUp geometry commands:

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
