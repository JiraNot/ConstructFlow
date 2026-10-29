# Interaction Model — Make Construction Modeling Fast

ConstructFlow must feel faster than native manual modeling. The user should describe or manipulate construction intent, not rebuild raw geometry every time.

## Six universal interaction verbs

### 1. Draw
Draw a path, boundary or control points and create a smart object.

Examples:

- draw wall path
- draw extension boundary
- draw paving boundary
- draw garden-path centerline
- draw pipe route nodes

### 2. Convert
Convert existing SketchUp geometry into a smart object.

Examples:

- group → existing roof
- face network → wall/floor/surface
- component → manhole or catalog asset

This is essential for legacy project files.

### 3. Attach
Attach a hosted object to a host.

Examples:

- window → wall
- downlight → ceiling
- gutter → roof edge
- cabinet → wall/floor

### 4. Connect
Create a functional/network relationship between objects.

Examples:

- sink → waste pipe
- pipe → manhole
- gutter → downpipe
- downpipe → drainage node
- switch → lights
- column → foundation

### 5. Generate
Create a dependent construction system from high-level intent.

Examples:

- roof → rafters/purlins
- columns → foundations
- surface → paving layout
- wall run → cabinet system
- extension zone → concept envelope

### 6. Relocate / Replace
Change existing construction while preserving lifecycle history and dependencies.

Examples:

- relocate manhole
- replace existing window
- reroute drain
- replace roof system

## Core UX sequence

`Sketch → Snap → Generate → Connect → Drag → Auto Update`

The majority of tools should fit this mental model.

## Tablet-first workbench contract

ArcSite is a useful interaction reference for ConstructFlow because it keeps the drawing task direct and the canvas in view. Apply the following patterns across the workbench while retaining ConstructFlow's model, command, Thai-unit, and renovation-phase semantics. These are product principles, not claims that every workflow is already implemented.

- Keep the plan visible while choosing tools, object types, and drawing styles. Use a persistent right-side tool rail in landscape and a reachable bottom dock in portrait; make the active tool unmistakable.
- Put one short, action-specific instruction beside the canvas. It names the next gesture, current snap/reference, and how to finish or cancel; it never covers the point being drawn.
- Prefer direct manipulation on touch. A drag should create or edit the geometry under the user's finger, with live snap and dimension feedback. Keep tap, mouse, keyboard, and numeric entry available for precise work.
- On tablet, the wall tool exposes Continuous Lines, Continuous Lines & Arcs, Line/Arc, and room Rectangle/L/U modes. A touch/pen drag is one continuous polyline gesture: keep the pointer down while turning, snap straight runs to the saved 0° (free), 15°, 30°, 45°, or 90° construction increment, preview each corner, and commit the full path as one undoable batch using the final release position. Tapping endpoints still supports deliberate point-by-point placement. Curved runs stay analytic in the canonical project model so hosted openings, takeoff, snapping, and exports can use the same geometry. Endpoint or exact-length edits preserve that curve and its opening offsets; reject an edit if a hosted opening would no longer fit. Pointer cancellation or a second-finger gesture cancels only the in-progress stroke and restores any earlier chain start.
- Chain path tools from the last committed endpoint. Each completed segment is immediately usable and independently undoable; keep the selected type, level, phase, and placement reference until the user finishes the chain.
- Make completion visible on touch. Provide explicit finish and cancel actions instead of relying on Escape or a physical keyboard.
- Open catalogs, takeoff, and project detail in a contextual side panel or sheet that preserves the current view and selection. A chosen library item should return directly to placement in that same view.
- Keep downstream information attached to the model: takeoff rows link to their source objects, proposals consume current quantities, collaboration comments and markups point to model locations, and integrations show sync/export state next to the affected project or deliverable.
- Keep touch targets at least 44 px and adapt the workbench by orientation and input method rather than scaling the desktop layout uniformly.

### Cross-domain application

| Workflow | Tablet interaction pattern |
| --- | --- |
| Tool selection | Persistent family rail, clear active state, relevant type/style controls near the active tool |
| Draw and edit | Drag-first placement, continuous endpoint chaining, live snap/dimensions, visible finish/cancel |
| Measure and annotate | Tap/drag two points, show length and reference immediately, keep units editable in place |
| Library | Searchable visual catalog in an overlay panel, preview before placement, preserve canvas context |
| Takeoff and proposals | Model-linked quantities and costs, filter by phase/trade, open source geometry from a row |
| Collaboration | Share, review, comments, and markups tied to a project view or model object |
| Integrations | Clear connection/sync state and contextual export actions with recoverable errors |

## Direct manipulation

After creation, important parametric objects must expose model handles where practical.

Examples:

- extension width/depth
- roof height/slope
- cabinet divisions
- path widths
- paving origin/direction
- manhole position
- pipe route nodes

A user should not be forced to edit every parameter through forms.

## Concept vs Construction mode

Early design should remain light.

### Concept mode

Stores intent and essential dimensions with simplified geometry.

Example carport:

```text
width
projection
height
roof type
```

### Construction mode

Adds selected assemblies and construction details:

```text
columns
beams
roof framing
roof panels
fascia
flashing
gutter
foundation
```

This avoids slowing design with premature detailing.

## Logical vs physical representation

Systems may have a lightweight logical representation and optional physical geometry.

Examples:

### Drainage
Design LOD: centerline + diameter + invert data.
Construction LOD: fittings, elbows, tees and actual pipe solids.

### Electrical
Design LOD: switch/light logical links and plan symbols.
Detailed LOD: conduit/cable geometry if explicitly required.

### Rebar
Design/quantity LOD: reinforcement set metadata.
Detailed LOD: representative or full 3D bars on demand.

## Smart snapping

ConstructFlow may provide semantic snaps in addition to SketchUp snaps:

- wall center / wall face
- column center
- beam center
- roof edge
- gutter edge
- pipe node
- manhole center
- room center
- grid
- level plane

## Context-first UI

The system should not present hundreds of unrelated buttons at once.

Primary navigation can be workflow-oriented:

```text
Existing
Architecture
Extension
Roof
Structure
Surface/Landscape
Interior
Electrical
Plumbing/Drainage
Library
Drawing
QA
```

Selection context can then show compatible actions.

Example selected manhole:

```text
Relocate
Connect Pipe
Insert Manhole
Inspect Network
Demolish
Generate Detail
```

## Dependencies and propagation

Dragging a smart object may trigger dependent recalculation rather than only moving geometry.

Example relocating a manhole can trigger:

- drainage network reroute
- invert/slope validation
- structure clash check
- surface/drain coordination
- quantity invalidation
- drawing invalidation

## Uncertain existing conditions

Existing-condition modeling must allow incomplete knowledge:

```text
Measured
Confirmed
Assumed
Unknown
Verify On Site
```

The product must never force invented certainty merely to complete a smart object.

## Scenario support

Relocation/design decisions may be explored as options before being committed.

Example:

```text
Option A: keep existing manhole
Option B: relocate 1.5 m
Option C: relocate outside extension footprint
```

Each option may later compare conflicts, pipe length, demolition scope and quantities.

## UX success criterion

If a normal SketchUp user must manually recreate related geometry after every major design change, the ConstructFlow workflow is incomplete. Relationships and generators should remove repetitive rework while preserving direct modeling freedom.
