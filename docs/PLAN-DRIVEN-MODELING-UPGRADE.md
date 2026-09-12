# ConstructFlow — Plan-Driven Modeling Upgrade Plan

## 1. Purpose

This document defines the upgrade path that moves ConstructFlow from a smart-geometry / domain-automation SketchUp extension toward a **plan-driven, BIM-like construction design environment** optimized for residential renovation, extension and small-building production.

The benchmark is not to copy Revit feature-for-feature. The benchmark is to match the parts of Revit's basic modeling workflow that make everyday architectural work fast and coherent—especially drawing and editing in plan while 3D, schedules, quantities and documents remain synchronized—while preserving the ConstructFlow advantages in renovation, extension, drainage, paving, joinery, BOQ and construction automation.

## 2. Product direction

ConstructFlow should feel like this:

`Create Project → Create Level → Draw in Plan → Place Hosted Objects → Inspect/Edit in 3D → Coordinate Systems → Generate Views/Schedules/BOQ → Publish`

The critical change is that **Plan Editing and 3D Editing operate on the same Smart Object model**.

```text
                Plan Editor
                    ↕
             Smart Object Model
                    ↕
                 3D Editor
                    ↓
             Documentation
            ↙       ↓       ↘
          BOQ    Schedule     QA
```

There must not be a separate 2D model that is later synchronized to a separate 3D model.

A Smart Object remains the source of truth. Plan, 3D, elevation, section, schedule and quantity are representations or editors of the same object state.

## 3. Core product principles

### 3.1 Plan-driven modeling is a first-class editing mode

Plan views are not only drawing output. They are production editors.

The R1 foundation treats the active level and plan interaction rules as shared editing context across architectural draw/edit, hosted opening/door-window, structural, and surface/paving plan tools. This keeps cursor projection, snap selection, and committed geometry on one semantic editing plane; implementation evidence is tracked separately in `docs/STATUS.md` so this Master Plan remains the target contract rather than a transient changelog.

The native ConstructFlow menu also exposes `Edit Project`, `Create Level`, `Edit Level`, and `Show Levels`, so the Plan Editor workflow can establish project metadata, inspect/revise persisted datums, and draw on a storey rather than relying on an API-only setup path. Project edits use the core command/transaction boundary and emit `ProjectChanged`; existing level-dependent Smart Objects then follow the same `LevelChanged` reconciliation path.

Users should be able to create and modify at least the following directly from plan:

- walls
- doors
- windows
- openings
- floors
- ceilings
- rooms
- structural grids
- columns
- beams
- fixtures/devices where appropriate
- surface/paving boundaries
- cabinet runs

### 3.2 One object, many representations

A Smart Wall may have:

- plan representation
- 3D geometry
- elevation representation
- section representation
- quantity provider
- schedule row(s)
- annotation anchors
- validation state

All representations derive from the same semantic object.

### 3.3 2D and 3D are equal editors

The preferred model is:

```text
Plan Editing  ↔  Smart Object Model  ↔  3D Editing
                         ↕
                  Schedule Editing
                         ↓
                   Documentation
```

A wall stretched in plan must update 3D. A hosted window moved in 3D must update plan. A type parameter changed from a schedule must update all dependent representations.

### 3.4 Domain automation must create normal editable Smart Objects

Extension, roof, paving, drainage and joinery generators must not create opaque one-off geometry.

Generated outputs must resolve to normal domain-owned Smart Objects that can be edited with the same tools as manually created objects.

### 3.5 Native SketchUp reliability comes before breadth

Pure-Ruby/application proofs are not sufficient to claim production readiness. Save/reopen, Undo/Redo, copy identity, observers, interactive tools, scenes/styles/sections and LayOut/PDF paths must be verified in supported native SketchUp/LayOut versions.

### 3.6 Match Revit-baseline primitives, not Revit enterprise breadth

ConstructFlow should aim to reach strong baseline behavior for everyday residential work:

- plan-driven creation
- hosted elements
- joins
- levels
- phases
- type/instance parameters
- constraints/dependencies
- rooms
- schedules
- sections/elevations
- associative annotations

It does not need to prioritize enterprise worksharing, large-building analytical systems, advanced HVAC, or full Revit-equivalent BIM breadth.

## 4. Upgrade Track A — Native Reliability Gate

Before aggressive expansion, close the gap between application-level proof and native SketchUp/LayOut behavior.

### Deliverables

- Smart Object persistence through `.skp` save/close/reopen
- stable ID recovery
- Undo/Redo for geometry + semantic metadata as one operation
- copy/duplicate identity rules in real SketchUp
- model observer behavior across New/Open
- migration fixtures against real model attributes
- representative interactive tool and handle verification
- scene/style/section state persistence
- LayOut template/viewport/PDF verification
- failure recovery and stale-state detection

### Exit gate

A representative small residential model survives save/reopen, copy, Undo/Redo and document regeneration without semantic identity or relationship corruption.

## 5. Upgrade Track B — Plan Interaction Engine

Create a reusable interaction foundation instead of implementing each tool independently.

### Responsibilities

- cursor inference
- endpoint / midpoint / intersection snapping
- axis inference
- perpendicular / parallel inference
- reference snapping
- object preview
- temporary dimensions
- numeric distance input
- chain drawing
- selection filters
- grips / handles
- drag/stretch
- move/copy
- placement preview
- host highlighting
- valid/invalid placement feedback
- level-aware editing plane

### Initial tools

- Wall Tool
- Door Tool
- Window Tool
- Opening Tool
- Floor Boundary Tool
- Room Tool
- Column Tool

### Exit gate

A user can lay out a simple residential floor plan without relying on raw SketchUp Line / Rectangle / Push-Pull for the primary architectural model.

## 6. Upgrade Track C — Smart Wall 2.0

The existing Smart Wall foundation becomes a production architectural primitive.

### Wall data model

- path
- wall type
- layered assembly
- material per layer
- core definition
- base level
- base offset
- top constraint
- top offset
- unconnected height
- location line
- orientation
- phase lifecycle
- room-bounding state
- joins
- hosted objects
- profile override where supported

### Location lines

- wall centerline
- core centerline
- finish face exterior
- finish face interior
- core face exterior
- core face interior

### Join engine

Support deterministic joins for:

- L junction
- T junction
- X junction
- acute/obtuse corners
- butt join
- miter join
- disallow join

### Editing behavior

- drag endpoint
- drag segment
- numeric length edit
- flip orientation
- swap type
- modify base/top constraints
- preserve/reconcile hosted openings when legal

### Exit gate

A user can draw and reshape a multi-room wall layout in plan while 3D joins and hosted relationships regenerate predictably.

## 7. Upgrade Track D — Hosted Door / Window / Opening 2.0

Hosted placement should become one of the defining ConstructFlow interactions.

### Placement flow

`Choose Type → Hover Host Wall → Preview → Click → Place`

### Required semantics

- host wall ID
- offset along host
- sill/head/vertical placement
- width/height
- hand/facing/flip state
- opening cut relationship
- type vs instance parameters
- phase lifecycle

### Required propagation

- moving the hosted object updates plan + 3D + schedules
- resizing updates opening cut
- host stretch preserves legal hosted placement
- host deletion/replacement produces explicit resolution workflow
- type swap regenerates geometry and representation

### Exit gate

Doors and windows can be placed and edited from plan with no manual geometry cutting.

## 8. Upgrade Track E — Floor, Ceiling and Room Core

These are baseline architectural primitives and should be completed before further breadth expansion.

### Smart Floor

- closed boundary
- holes/openings
- level + offset
- thickness / layered build-up
- material assignment
- slope/spot controls where supported
- room/space relationship
- quantity

### Smart Ceiling

- boundary
- level/height/offset
- recess / bulkhead support path
- material
- light/device hosting contract
- reflected ceiling representation

### Room Engine

- enclosure detection from room-bounding elements
- room separation boundaries
- name / number
- area / perimeter
- finish metadata
- occupancy/use metadata
- phase awareness
- room tags
- room schedules

### Exit gate

A complete simple residential level can be represented by walls, hosted openings, rooms, floors and ceilings without manual SketchUp-only geometry.

## 9. Upgrade Track F — Parametric Object Engine

Avoid long-term hard-coded parametric logic per object family.

### Generic capability model

```text
Parametric Object
├─ Type Parameters
├─ Instance Parameters
├─ Formula Parameters
├─ Constraints / References
├─ Nested Objects
├─ Visibility Rules
├─ 2D Representation
├─ 3D Representation
├─ Hosts
└─ Connectors
```

### Initial consumers

- doors
- windows
- cabinet modules
- pergolas
- fences/gates
- glass/breeze block systems
- roof accessories
- structural members
- fixtures/furniture

### Type / instance behavior

Changing a Type parameter updates every instance of that type. Instance parameters affect only selected objects.

### Formula behavior

The engine should support deterministic parameter formulas with validation and cycle protection.

### Exit gate

At least one door/window family and one joinery object can be flexed by dimensions/formulas without family-specific geometry code owning every variation.

## 10. Upgrade Track G — Constraint & Dependency Engine

Start with the constraints that matter to residential modeling rather than attempting a universal geometric solver immediately.

### Initial constraints

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

### Dependency graph examples

```text
Roof changed
  ↓
Attached wall top
  ↓
Fascia
  ↓
Gutter
  ↓
Downpipe
  ↓
Drainage
  ↓
Quantity / Drawing invalidation
```

Use the existing command/event/dirty-state architecture as the propagation backbone.

### Exit gate

Representative architectural and roof dependencies update deterministically without manual rebuild commands.

## 11. Upgrade Track H — Roof 2.0

Expand the roof module from the current limited forms into a production roof primitive.

### Roof forms

- flat
- lean-to
- gable
- hip
- half-hip where justified
- multi-slope
- custom footprint

### Roof topology

- ridge
- hip
- valley
- eave
- rake
- high edge
- low edge

### Integration

`Roof → Fascia → Soffit → Flashing → Gutter → Downpipe → Drainage`

### Exit gate

A typical residential extension roof can be created from plan, edited by footprint/slope, and propagate rainwater components without manual geometry repair.

## 12. Upgrade Track I — Structure 2.0

Complete everyday structural primitives before advanced structural automation.

### Priority objects

- structural grid
- column
- beam
- ground beam
- slab
- footing
- pile
- pile cap
- steel member

### Plan interactions

Structural members should snap to:

- grids
- column centers/faces
- wall axes/faces
- beam endpoints
- level references

### Relationships

- column supported_by footing/pile cap
- footing supported_by pile group
- beam supported_by columns/walls
- roof frame hosted/related to supporting structure

### Exit gate

A small extension foundation and frame can be laid out primarily in plan and remain coordinated with architecture and drainage.

## 13. Upgrade Track J — Schedule as Model Editor

Schedules should become bidirectional model views rather than output-only reports.

### Initial schedules

- smart wall
- door
- window
- room
- finish
- lighting/device
- plumbing fixture
- structural member
- quantity/BOQ

### Editing semantics

- editable instance fields update selected objects
- editable type fields update all instances of that type
- read-only calculated fields remain protected
- validation failures block or warn before commit

### Exit gate

Changing a legal model parameter from a schedule updates plan and 3D representations consistently.

## 14. Upgrade Track K — Documentation 2.0

Documentation must be model-driven and associative.

### Views

- plan
- reflected ceiling plan
- elevation
- section
- detail/callout
- schedules
- sheets

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

### Behavior

Annotations reference Smart Objects or stable semantic anchors rather than exploded text/lines wherever possible.

### Exit gate

A model change updates representative dimensions, tags, schedules and sheet views without manual redrafting.

## 15. Upgrade Track L — Renovation / Existing / Demolition Superpower

This remains a major product differentiator and should go beyond generic phase visibility.

### Construction-intent workflows

Example: creating a new door in an existing wall may produce/reconcile:

1. existing wall lifecycle state
2. demolition opening/cut scope
3. new door/opening
4. lintel or structural review requirement
5. finish repair scope
6. demolition quantity
7. new-work quantity
8. updated drawings/schedules

### Required behaviors

- existing-to-remain
- existing-to-modify
- demolition
- new work
- relocate/replace
- replacement relationships
- phase-aware quantity
- phase-aware drawings/schedules

### Exit gate

A representative renovation change can be tracked from existing model through demolition, proposed work, quantity and issued drawings without duplicate manual bookkeeping.

## 16. Upgrade Track M — Extension Generator 2.0

Extension generators must compose normal editable Smart Objects.

Example package:

```text
Kitchen Extension
├─ Walls
├─ Floor
├─ Openings
├─ Columns
├─ Beams
├─ Roof
├─ Gutter
├─ Downpipes
├─ Drainage
└─ Electrical
```

After generation, the user edits the same walls, roof, structure and services using ordinary ConstructFlow tools.

Package intent remains available for reconciliation and regeneration, but does not create a separate editing universe.

## 17. Upgrade Track N — MEP Residential Core

Build on the existing drainage strength and introduce a reusable system/network foundation.

### Shared MEP concepts

- system
- connector
- network
- route
- fitting
- size
- source
- destination
- flow/load metadata

### Plumbing priorities

- cold water
- hot water
- waste
- soil
- vent
- fixture connections
- valves/tanks/pumps as needed

### Electrical priorities

- panel
- circuit
- load
- switching/control links
- general/dedicated outlets
- lighting
- schedule support

The scope remains residential/small-building first; advanced HVAC is not a near-term priority.

## 18. Upgrade Track O — Surface / Paving / Landscape

Preserve this as a ConstructFlow differentiator while migrating interactions onto the common Plan Interaction Engine.

Priority capabilities remain:

- irregular/freeform boundaries
- curves
- holes/islands
- multiple borders
- herringbone/radial/custom layout
- parking bays
- slopes
- drain relationships
- tree/planter cutouts
- joints
- actual cut-piece-aware quantities where feasible

## 19. Upgrade Track P — Interior / Joinery

Move joinery progressively onto the Parametric Object Engine.

### Workflow target

`Select/Reference Wall → Draw Cabinet Run in Plan → Generate 3D → Edit Modules → Generate Elevation/Section → Cut List/Hardware/BOQ`

Preserve the existing hierarchy:

`Cabinet Run → Module → Compartment → Front → Hardware → Board Part`

## 20. Upgrade Track Q — Quantity / Cost / BOQ 2.0

Every reported quantity should be traceable back to Smart Object IDs.

### Requirements

- quantity-to-object traceability
- phase grouping
- demolition/new-work separation
- material/labor/waste/rate layers
- click/select/highlight source objects from BOQ where UI permits
- stale/current tracking
- schedules and BOQ sharing the same semantic source

## 21. Upgrade Track R — QA / Coordination

Expand from domain validation into project-level residential coordination.

Priority rules include:

- beam vs drainage
- column/footing vs existing services
- door vs furniture
- window vs cabinet
- downpipe vs opening
- roof vs existing building
- electrical outlet vs wet fixture zones
- surface fall vs drains
- stale documentation/quantity after model change

The goal is practical construction coordination, not a Navisworks-equivalent clash platform.

## 22. Upgrade Track S — AI Copilot

AI remains above deterministic commands rather than bypassing them.

The stronger the manual modeling foundation becomes, the stronger AI becomes because AI can invoke the same production commands:

- CreateWall
- PlaceHostedWindow
- CreateFloor
- CreateRoom
- AlignObject
- AttachWallToRoof
- CreateStructuralMember
- RouteDrain
- GenerateExtension
- CreateSection
- CreateSchedule
- RefreshBOQ

AI proposals must remain reviewable and auditable.

## 23. Vertical release sequence

Do not implement every upgrade track strictly end-to-end before the next one. Deliver vertical releases with usable project value.

| Release | Primary outcome |
|---|---|
| **R0 — Native Reliability** | Real SketchUp/LayOut persistence, undo, copy and publication confidence |
| **R1 — Plan Editor + Wall 2.0** | Draw/stretch/join walls in plan; 3D follows |
| **R2 — Hosted Architecture** | Door/window/opening + floor + room baseline |
| **R3 — Parametric + Constraints** | Type/instance/formula + core dependency behavior |
| **R4 — Roof + Structure Primitives** | Residential roof and extension frame editable from plan |
| **R5 — Model-Driven Documentation** | Section/elevation/tag/dimension/schedule/sheet workflow |
| **R6 — Renovation + Extension Workflow** | Existing/demolition/new work and generated extension packages reconcile cleanly |
| **R7 — Residential MEP Coordination** | Drainage-led plumbing/electrical system foundation |
| **R8 — Surface + Landscape + Joinery** | Domain differentiators on the common editing engine |
| **R9 — BOQ + Cost + QA + Publication** | Traceable commercial/document production package |
| **R10 — AI Copilot** | Natural-language orchestration over stable commands and model semantics |

## 24. Immediate priority order

The next development focus should be:

1. **R0 Native Reliability**
2. **R1 Plan Editor + Wall 2.0**
3. **R2 Hosted Architecture**
4. **R3 Parametric Object + Constraint/Dependency foundation**
5. **R5 documentation primitives in parallel where required by the Plan Editor**

Avoid expanding the Object Registry into many additional object families until Draw / Select / Move / Stretch / Host / Join / Align / Type / Instance / Schedule workflows are strong for the core architectural objects.

A smaller number of deeply editable objects is more valuable than a large registry of shallow generators.

## 25. North-star acceptance scenario

ConstructFlow should pass the following representative workflow primarily through ConstructFlow tools rather than raw SketchUp geometry commands:

```text
Create Project
→ Create Level
→ Draw Walls in Plan
→ Place Doors/Windows
→ Detect/Create Rooms
→ Create Floors/Ceilings
→ Add Columns/Beams
→ Create Roof
→ Add Fixtures
→ Route Drainage
→ Generate Sections/Elevations
→ Generate Schedules
→ Generate BOQ
→ Publish Sheets
```

Then modify a major wall dimension by `+500 mm`.

The system should deterministically reconcile or flag:

- wall geometry
- wall joins
- hosted openings
- room boundaries/areas
- floors/ceilings where dependent
- roof/structural dependencies where configured
- drainage conflicts
- dimensions/tags
- schedules
- quantities/BOQ
- drawing currentness

Passing this scenario smoothly is a stronger product milestone than claiming broad Revit feature parity.

Evidence boundary: application tests and native-tool contracts may prove the deterministic Smart Object chain, command validation, dependency invalidation, plan refresh requests and package integrity. They do not substitute for the native gate: the same scenario must still be exercised in a supported SketchUp/LayOut environment to prove interactive picking, visible 3D updates, real save/close/reopen persistence, native Undo/Redo, scenes/styles/sections and sheet/PDF output.

## 26. Explicit non-goals for this upgrade

- full Revit feature parity
- enterprise worksharing before single-model production is reliable
- advanced HVAC before residential architecture/MEP workflows are strong
- licensed structural engineering approval
- uncontrolled AI geometry authoring
- separate 2D and 3D project models
- opaque generator-specific editing modes that bypass normal Smart Objects

## 27. Success definition

The upgrade is successful when ConstructFlow can be described accurately as:

> A plan-driven, BIM-like residential construction design environment on SketchUp where users create and edit one semantic model through plan, 3D and schedules, while renovation, extension, drainage, paving, joinery, BOQ and documentation automation remain coordinated around the same Smart Object graph.
