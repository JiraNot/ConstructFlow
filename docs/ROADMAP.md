# ConstructFlow Development Roadmap

This roadmap preserves the full product scope while sequencing implementation to stabilize the platform before domain breadth.

## Phase 0 — Architecture Foundation

Goal: make future modules safe to add, replace and evolve.

Deliverables:

- repository and monorepo conventions
- SketchUp extension shell
- shared naming and namespaces
- module registry
- module manifest schema
- smart-object identity contract
- namespaced attribute persistence
- command bus
- event bus
- phase lifecycle
- level/datum registry
- schema versioning/migrations
- transaction/undo integration strategy
- test harness strategy
- docs/ADR process

Exit criteria:

- extension loads
- one sample module registers
- one sample smart object can persist/reload
- phase and level metadata survive reopen
- command emits event
- module can be disabled without breaking Core

## Phase 1 — Existing Model + Architecture Core

Goal: make ConstructFlow useful for quickly producing a structured existing-condition model.

Deliverables:

- Smart Wall
- Floor/Ceiling base objects
- Existing mode
- Convert SketchUp geometry to smart objects
- Opening/Void core
- Door/Window basic families
- simple rooms
- phase views: Existing / Demolition / Proposed / Coordination
- level manager UI
- basic property inspector

Exit criteria:

- trace a small existing house
- mark selected wall/opening elements for demolition
- insert new wall/opening/window
- regenerate phase-specific visibility reliably

## Phase 2 — Extension + Roof + Envelope

Goal: accelerate common house-extension production.

Deliverables:

- Extension Zone
- Carport generator
- Kitchen/multipurpose-room extension shell
- Lean-to/gable/basic roof generator
- metal/polycarbonate/glass roof systems
- rafter/purlin placement rules
- fascia / roof concealment
- soffit
- flashing/junction references
- gutter/downpipe connectors

Exit criteria:

- model a typical carport/side extension from existing-house attachment line
- modify main dimensions with dependent roof/fascia/gutter updates

## Phase 3 — Structure + Levels

Goal: connect architectural design to constructible structural layout data.

Deliverables:

- structural grid
- piles/pile groups
- footings/pile caps
- ground beams
- RC columns/beams/slabs
- structural steel profiles
- primary connection metadata
- rebar metadata LOD
- structural quantity providers
- basic structure QA

Exit criteria:

- build a small extension foundation/frame system
- detect basic clashes with existing drainage
- output foundation/beam layout intent

## Phase 4 — Surface, Paving & Landscape

Goal: cover real PLAN66-like external work without rectangle-only assumptions.

Deliverables:

- arbitrary/freeform surface boundaries
- holes/islands
- floor build-up assemblies
- spot levels and slopes
- parametric borders
- tile/paving layouts
- grid/running bond/herringbone/fan/custom pattern framework
- curved-cut and follow-path modes
- radial/concentric modes
- parking bays
- garden paths
- control joints
- tree/planter cutouts
- quantity providers

Exit criteria:

- create a curved landscape paving area with multiple borders and real pattern layout
- create a 3-bay parking surface with slope/drain relationships

## Phase 5 — Plumbing + Drainage

Goal: make service relocation and extension coordination practical.

Deliverables:

- water/waste connector contract implementations
- fixture connectors
- centerline pipe networks
- manholes
- floor/trench drains
- route editing
- auto-route candidates
- invert/slope calculations
- relocate-manhole workflow
- intermediate manhole workflow
- roof rainwater connection
- coordination checks with structure/surfaces

Exit criteria:

- relocate existing manhole due to extension conflict
- reroute connected waste network and validate slope

## Phase 6 — Electrical

Goal: cover typical residential extension electrical documentation.

Deliverables:

- lighting symbols/models
- switches/control links
- outlets and dedicated points
- room-driven requirements
- logical circuits
- lighting/power plan representations
- schedule provider
- basic load metadata

## Phase 7 — Interior & Joinery Design

Goal: make built-in design fast and parametric.

Deliverables:

- cabinet carcass/module/compartment engine
- shelves/dividers
- swing/sliding/lift fronts
- solid/glass/aluminum-frame fronts
- drawers
- fillers/toe kicks
- countertops
- wardrobes/kitchen/TV/vanity presets
- hardware catalog integration
- collision/clearance checks
- MEP requirement links

Exit criteria:

- create a wall-fitted wardrobe and kitchen run without manual board modeling

## Phase 8 — Furniture Fabrication

Goal: turn joinery models into production information.

Deliverables:

- individual board parts
- grain direction
- edge banding
- cut list
- hardware schedule
- exploded view
- cabinet elevations/sections
- board sheet estimation
- nesting optimization later within this phase
- future DXF/CNC interface specification

## Phase 9 — Library & Catalog Platform

Library foundations should exist earlier, but this phase completes product-grade management.

Deliverables:

- company/project libraries
- folders/tags/search
- thumbnails/previews
- manufacturer catalogs
- variants
- generic→manufacturer replacement
- compatibility engine
- swap vs replace-construction workflows
- LOD/proxy management
- version-aware project snapshots

## Phase 10 — Quantity, BOQ & Costing

Goal: aggregate all domain takeoff into usable commercial outputs.

Deliverables:

- normalized quantity pipeline
- demolition vs new-work grouping
- rate library
- material/labor/waste rules
- BOQ views
- CSV/XLSX export contract
- stale/current state tracking

## Phase 11 — Drawing, Detail & LayOut Automation

Goal: produce construction-document packages from the same source model.

Deliverables:

- drawing intent registry
- phase-specific plans
- elevations/sections/details
- structural plans
- paving setting-out plans
- electrical/plumbing/drainage plans
- door/window schedules
- joinery shop drawings
- annotation standards
- sheet/title/revision data
- LayOut integration
- PDF export orchestration

## Phase 12 — QA, Revision & Site Workflow

Deliverables:

- validator registry
- cross-domain issue viewer
- revision/change tracking
- drawing/quantity stale detection
- document issue status
- assumed/unknown/verify-on-site workflow
- as-built workflow

## Phase 13 — AI Copilot

Goal: layer natural-language planning and automation on top of stable commands.

Deliverables:

- command discovery
- model-context resolver
- catalog search
- structured command proposals
- option/scenario generation
- approval gates
- QA-aware AI suggestions

AI must not receive a geometry bypass path.

## Phase policy

The master scope is not discarded when implementation is phased. Each phase should deliver vertical workflows with real project value while maintaining compatibility with the final modular architecture.
