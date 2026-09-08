# ConstructFlow — Master Product Blueprint v1.0

## 1. Mission

ConstructFlow is a modular design-to-construction platform centered on SketchUp. Its purpose is to let design teams move from an existing-condition model through demolition, new work, coordinated construction systems, quantity takeoff, detailed drawings, and fabrication-oriented outputs without rebuilding the same information repeatedly.

The product is optimized first for real renovation and extension workflows such as houses, carports, kitchens, multipurpose rooms, roofs, gardens, parking areas, built-ins, utility relocation, and construction documentation.

## 2. Product model

ConstructFlow treats SketchUp as the model editor and geometry environment, while ConstructFlow provides construction intelligence, object semantics, rules, relationships, takeoff, documentation, validation, and automation.

Primary flow:

`Existing → Design → Construction Systems → Coordination → Takeoff → Drawing → Revision`

Interaction flow:

`Sketch → Convert → Generate → Connect → Modify → Propagate → Check → Takeoff → Document`

## 3. Foundation concepts

### 3.1 Smart object

Every meaningful model element is represented as a smart object with a stable ID, owner module, type, phase lifecycle, level references, parameters, relationships, geometry references, catalog references, quantity providers, drawing representations, and validation rules.

### 3.2 Lifecycle / phase

Every object participates in construction lifecycle rather than relying only on SketchUp tags.

- Existing
- Demolition
- New Construction
- Existing to Remain
- Existing to Modify
- Relocated / Replaced

The preferred data model is `created_phase` + `demolished_phase`, with derived views for existing, demolition, proposed, and coordination states.

### 3.3 Levels and datum

Objects reference project levels rather than storing only raw Z coordinates. The level system must support architectural, structural, site and drainage references such as FFL, SSL/TOS, TOB/BOB, TOF/BOF, pile cut-off, GL and IL.

### 3.4 Relationships

Objects are connected through explicit relationships such as:

- Host relationships: window → wall, downlight → ceiling, gutter → roof edge
- Structural relationships: column → footing/pile cap, beam → columns
- MEP connectors: sink → waste pipe, pipe → manhole, gutter → downpipe
- Replacement relationships: existing object → new replacement object
- Dependency relationships: roof → gutter → downpipe → drainage

### 3.5 Commands and events

Human UI and AI invoke the same deterministic domain commands. Domain modules publish events instead of directly calling each other.

Examples:

- `CreateOpening`
- `DemolishObject`
- `RelocateManhole`
- `SwapCatalogAsset`
- `GenerateRoofFrame`
- `SplitCabinetModule`
- `AddPavingBorder`

Events include `ObjectCreated`, `GeometryChanged`, `PhaseChanged`, `ConnectionChanged`, `LibraryAssetSwapped`, `QuantityChanged`, and `DrawingOutdated`.

## 4. Modular platform architecture

ConstructFlow is a modular monolith with plugin-style domain packages. Initial modules are grouped as follows.

### Core platform

- Project
- Object identity
- Units
- Datum / levels / grids
- Phase lifecycle
- Transactions / undo integration
- Command bus
- Event bus
- Module registry
- Persistence
- Shared contracts
- Selection and host/connector interfaces

### Domain modules

- Site & Survey
- Architecture
- Opening & Void
- Door & Window
- Decorative Wall & Façade
- Extension
- Roof & Envelope
- Structure
- Surface & Paving
- Landscape
- Interior & Joinery
- Electrical
- Plumbing
- Drainage

### Platform services

- Model / Catalog / Assembly Library
- Quantity Takeoff
- BOQ & Costing
- Drawing & Detail
- QA / Coordination
- Revision / Issue
- Import / Export
- AI orchestration

## 5. Domain scope

### 5.1 Site & existing conditions

- Site boundaries, roads, setbacks, north, benchmarks
- Existing building footprint and levels
- Existing walls, columns, roofs, openings, fences
- Existing drains, manholes, water points, meters and utilities
- Existing / demolition / proposed site plans
- Measured / confirmed / assumed / unknown / verify-on-site states
- Existing ground and proposed ground
- Cut/fill support in advanced phases

### 5.2 Architecture

- Smart walls, floors and ceilings
- Layered wall and floor assemblies
- Rooms and room programs
- Openings and voids independent of doors/windows
- Arch, custom, round, oval and niche openings
- Glass block, breeze block and ventilation block infills
- Doors and windows: swing, sliding, fixed, folding, mixed configurations
- Panel / ลูกฟัก systems
- Frames, jambs, sills, thresholds and trims
- Door/window schedules and opening details

### 5.3 Decorative wall and façade

- Wall moulding
- Wainscot / panel systems
- Cornice / belt course / building band
- Window and door trim
- Pilasters and column wraps
- Grooves, shadow gaps, slats and screens
- Stone, tile, timber, WPC and fiber-cement cladding
- Parametric pattern distribution around openings
- Profile library and profile-driven extrusion

### 5.4 Extension workflows

Reusable extension generators for:

- Kitchen
- Carport
- Multipurpose room
- Laundry / utility
- Terrace / patio
- Pergola
- Glass room
- Side/rear extension
- Custom extension

Concept mode must remain lightweight; construction mode enriches the object with assemblies and detailed systems.

### 5.5 Roof & envelope

- Lean-to, gable, hip, flat and custom roofs
- Metal sheet, tile, polycarbonate and glass roofs
- Rafters, purlins, trusses and bracing
- Fascia / roof concealment
- Steel framing + smartboard/fiber-cement assemblies
- Soffits
- Flashing, counter-flashing, drip edge, coping
- Gutters and downpipes
- Roof-to-existing-wall and roof-to-existing-roof junction details
- Polycarbonate/glass joint systems
- Roof drainage integration

### 5.6 Structure

- Structural grids
- Piles, pile groups and pile cut-off levels
- Footings and pile caps
- Ground beams
- RC columns, beams and slabs
- Slab-on-ground and suspended slab assemblies
- Structural steel: box, rectangular tube, pipe, H/I/C/L profiles
- Base plates, anchor bolts, gussets and connections
- Rebar metadata and optional 3D generation by LOD
- Rebar schedules / BBS
- Concrete, reinforcement, steel and formwork quantities
- Constructability warnings must not be represented as engineering approval

### 5.7 Levels / floors / external works

- Project benchmark and reference levels
- House FFL, extension FFL, parking, landscape and road levels
- Spot levels and slope-controlled surfaces
- Floor build-up from finish to structural slab/subbase
- Steps, ramps and transitions
- Drainage-aware surface slopes

### 5.8 Surface & paving

The surface engine must support arbitrary closed boundaries rather than assuming rectangular floors.

Boundary types:

- Polygon
- Arc / circle / ellipse
- Freeform / spline / path-based
- Existing SketchUp face
- Holes / islands / tree pits / planters / drains

Layout capabilities:

- Tile, paver, stamped concrete, stone, deck and custom assemblies
- Multiple parametric borders
- Curved borders and follow-boundary borders
- Grid, running bond, herringbone, basket weave, chevron, diagonal, modular, fan and custom patterns
- Pattern direction by angle, selected line, wall or path
- Pattern origin and centered layout
- Minimum-cut rules
- Straight layout with curved cuts
- Follow-curve layout
- Radial and concentric layout
- Path-based paving and variable-width paths
- Multi-zone patterns and decorative inserts
- Parking bay layouts and dividers
- Control / expansion joints
- Cut-tile visualization and advanced piece schedules
- Quantity and waste calculation based on actual layout where feasible

### 5.9 Landscape

- Lawn, planting beds, trees, shrubs, planters
- Benches, fountains, pergolas and screens
- Garden paths, paving and external levels
- Garden lights, water points and drainage
- Low-poly proxies with high-detail presentation variants

### 5.10 Interior & joinery

Parametric joinery must support design and fabrication levels.

Core hierarchy:

`Cabinet Body → Module → Compartment → Front → Internal Fitting → Hardware → Finish`

Capabilities:

- Base, wall and tall cabinets
- Wardrobes
- Kitchens
- TV units and display walls
- Vanity units
- Desks, tables, counters and islands
- Built-in benches
- Open shelves
- Solid, glass, aluminum-frame and decorative fronts
- Swing, sliding, folding, lift-up and flap fronts
- Drawers and drawer systems
- Shelves, hanging rails and internal fittings
- Hardware catalog and rules
- Fillers and automatic fit to walls/ceilings
- Collision and clearance checks
- Countertops and cutouts
- Material/board thicknesses
- Grain direction
- Edge banding
- Cut lists
- Hardware schedules
- Exploded views
- Board optimization / nesting in later fabrication phases
- Shop drawings
- Future DXF/CNC pathways without coupling them into the core model

### 5.11 Electrical

- Downlights, spotlights, pendants, wall lights, strip LEDs, outdoor/garden lights
- Switches and control relationships
- General and dedicated outlets
- Appliance outlets
- TV/data points
- Logical circuits separated from optional physical conduit geometry
- Lighting and power plans
- Symbol and schedule support
- Room-driven requirement checklists

### 5.12 Plumbing & drainage

- Cold/hot water points
- Sinks, basins, toilets, showers and appliances
- Waste, soil, floor drains and cleanouts
- Grease traps
- Manholes / inspection chambers
- Rainwater drainage
- Pipe centerline design with optional physical fittings at detailed LOD
- Explicit network topology and connectors
- Auto-route suggestions with editable route nodes
- Pipe diameter, length, slope and invert levels
- Relocate manhole workflow
- Intermediate manhole insertion
- Existing utility rerouting
- Coordination with foundations, beams, surfaces and rooms

## 6. Relocation and demolition behavior

Relocation of existing construction must preserve history rather than merely move geometry.

Example: relocating an existing manhole creates:

1. Existing manhole marked demolished/abandoned in demolition phase.
2. Existing affected pipe segments marked for demolition as required.
3. New manhole created in new-construction phase.
4. Replacement relation from old to new object.
5. Drainage network reconnected/re-routed.
6. Slope and invert validation executed.
7. Quantity, demolition scope and drawings invalidated/recalculated.

The same pattern applies to doors/windows, drains and other replaced construction objects.

## 7. Model & catalog library

ConstructFlow includes a company/project library rather than acting only as a private 3D Warehouse.

Asset levels:

1. Fixed asset — furniture, sanitary fixture, luminaire, appliance.
2. Parametric asset — window, door, cabinet, railing, slat, moulding.
3. Assembly — roof system, fascia, wall build-up, kitchen, wardrobe, façade system.
4. Detail — construction/detail drawing associated with object/assembly types.

Library features:

- Folder and subfolder organization
- Search, tags, favorites and recent items
- Preview / thumbnail / metadata
- Company and project libraries
- Generic-to-manufacturer product replacement
- Manufacturer, product, SKU and data-sheet metadata
- Variant switching
- `Swap Type` vs `Replace Construction`
- Replace instance / selected / all instances of type
- Host compatibility
- Connector compatibility
- Versioning and project-safe updates
- LOD/proxy variants
- Catalog-driven BOQ and specification data

## 8. Quantity / BOQ / costing

Domain modules own their quantity formulas. The quantity service aggregates normalized quantity items.

Examples:

- Concrete m³
- Rebar kg
- Structural steel kg/m/pieces
- Formwork m²
- Wall and finishes m²
- Roof sheets/panels m² and pieces
- Flashing/gutter m
- Tile/paver full and cut pieces where layout data exists
- Cabinet panels, sheets, edge bands and hardware
- Pipe lengths, manholes and fixtures

Costing is layered on top of quantities using material rates, labor rates, waste factors and company price libraries.

## 9. Drawing and fabrication outputs

Drawing engine consumes domain-provided representations rather than reimplementing domain rules.

Initial drawing families:

- Existing plan
- Demolition plan
- Proposed plan
- Site plan
- Roof plan
- Elevations
- Sections
- Foundation / column / beam / roof-framing plans
- Electrical lighting/power plans
- Water and drainage plans
- Door/window schedules
- Feature wall and façade details
- Roof/fascia/flashing details
- Paving setting-out plans
- Kitchen and joinery elevations/sections
- Furniture shop drawings
- Cut lists and hardware schedules

LayOut/PDF automation belongs to the documentation platform layer.

## 10. QA / coordination

Module validators register checks into a shared QA runner.

Representative checks:

- Footing clashes with existing drain
- Ground beam crosses manhole or drain
- Pipe slope insufficient
- Unconnected pipe network
- Roof drainage without destination
- Door/drawer/cabinet collision
- Cabinet conflicts with window or switch
- Window conflicts with decorative moulding
- Downlight conflicts with beam
- Surface drainage or level inconsistency
- Tile/paver cut below configured minimum
- Unsupported structural member metadata
- Missing phase or level reference
- Outdated quantities/drawings after model changes

## 11. AI policy

AI interprets intent, searches libraries, proposes options and invokes registered commands. It does not bypass deterministic domain engines or directly manipulate raw SketchUp geometry for production objects.

Example intent:

> Extend a polycarbonate roof from this wall to these columns, add steel framing, fascia, gutter and connect the downpipe to the nearest approved drainage node.

AI produces structured command requests; modules execute them under the same rules used by manual UI actions.

## 12. Performance strategy

- LOD 100: concept / symbolic
- LOD 200: design
- LOD 300: construction
- LOD 400: fabrication
- Proxy/high-detail asset variants
- Rebar stored primarily as metadata until physical generation is requested
- Pipe networks use centerline representation until physical fittings are requested
- Trees and detailed furniture use proxies during production modeling

## 13. Non-goals for the foundation phase

- Replacing SketchUp as a general 3D modeler
- Building full Revit-equivalent BIM behavior in the first release
- Letting AI directly author uncontrolled production geometry
- Performing licensed structural engineering approval automatically
- Building all domain modules before core contracts are stable

## 14. Foundation success criteria

The architecture foundation is considered successful when:

1. A SketchUp extension shell loads ConstructFlow.
2. Modules can register/unregister capabilities.
3. Smart objects can persist stable IDs and namespaced data.
4. Phase and level metadata work independently.
5. Commands can execute through a common bus.
6. Events can invalidate dependent quantities/drawings without hard module coupling.
7. Library assets can be referenced without becoming fragile external dependencies.
8. Example domain modules can register quantity, drawing and validator providers.
9. Existing project files can remain valid across schema migrations.
10. Human and AI entry points both use the same command contracts.
