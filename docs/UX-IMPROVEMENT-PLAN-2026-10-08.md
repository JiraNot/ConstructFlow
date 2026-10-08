# ConstructFlow — 2D/3D Authoring Improvement Plan

**Status:** First implementation pass completed; see implementation notes and remaining validation below.  
**Goal:** Make 2D placement precise and predictable, keep 3D faithful to the active 2D model, and make architectural openings visually understandable.

## Current audit

### Walkthrough steps

1. **Inspect the 2D plan and selected door.** The plan provides a clear door swing symbol and selected-object properties. The top-level controls show floor and phase, but the placement experience does not expose an origin/alignment choice or a snap-mode control.
2. **Switch to 3D.** The view eventually loads, but an opening is represented by a solid blue box laid over the wall. This obscures whether it is a hole, a door leaf, or a glazed panel; the view also does not communicate wall/window material transparency.
3. **Trace the implementation contracts.** `PlanCanvas` calls `getPlanVisibleObjects` for the active plan level, while `Model3DViewport` calls `buildProjectRepresentations3D(project)` over the whole project. The 3D representations therefore do not share the active-floor visibility filter. Walls already carry geometric cutouts, but door and window instances are represented as generic boxes. The snap engine currently considers grid intersections/lines, column centers, beam endpoints, and wall endpoints; it does not produce column corners/faces, beam edges, or wall-face/centerline/midpoint candidates.

### Findings by impact

| Priority | Finding | Evidence in code | User impact |
|---|---|---|---|
| P0 | 2D and 3D can show different floor contents. | `PlanCanvas.tsx` uses `getPlanVisibleObjects`; `Model3DViewport.tsx` passes the unfiltered project to the representation engine. | Extra or missing objects make the 3D model unreliable as a review view. |
| P0 | Door/window meshes hide the opening semantics. | `representation-engine/src/index.ts` creates wall cutouts, then also represents each opening as a `[width, 45, height]` box. `Model3DViewport.tsx` assigns the same opaque phase material to openings and walls. | A door reads as a slab or solid block; glass does not look transparent; the viewer cannot tell whether an opening cuts the wall. |
| P1 | Placement is centerline-first with limited geometric targets. | `snapEngine.ts` has a fixed ordered list of grid, column-center, beam-end, and wall-end snaps. Wall/beam payloads store endpoints but have no placement-reference alignment field. | Users cannot reliably place wall/beam faces or align to column corners and edges. |
| P1 | Snap choice is difficult to inspect and control. | `PlanCanvas.tsx` applies `snapPoint` directly; no candidate chooser or explicit snap-mode set is passed to the engine. | Nearby candidates can be surprising, and users cannot quickly switch between precise BIM snaps and free/grid placement. |
| P2 | Catalog marks do not yet describe distinct door/window constructions. | Example D1–D3 and W1–W3 entries mainly contain dimensions and, for windows, sill height. There is no family/leaf/glazing/frame schema used by the 3D renderer. | Changing type mark changes nominal size, but does not provide recognizable swing, sliding, louvered, fixed-glass, or frame behavior. |
| P2 | The drawing workflow needs stronger in-canvas guidance. | Wall/beam tools use two endpoint clicks; the ghost displays basic length/section data, with no reference-line mode or comprehensive snap feedback. | Users must infer the active anchor and how thickness is applied while drawing. |

The screenshots captured during this walkthrough show the same project and selected door before and after switching views. They support the visual findings above; code and automated geometry tests support the behavior findings. Keyboard-only operation, screen-reader behavior, and large-model performance were not evaluated in this walkthrough.

## Proposed implementation sequence

### Slice 0 — Enforce one model view across floors and openings (P0)

**Scope**

- Make the 2D and 3D views consume the same active-level and phase visibility policy, with spanning columns handled consistently.
- Preserve the host-wall cutout as the authoritative opening geometry. Do not place an opaque full-height box over that cutout.
- Represent a door as a frame/jamb plus a leaf at the correct opening plane, with handing and swing direction visible. Represent a window as frame, sill/head, and glazing with actual transparency; distinguish fixed, sliding, and awning behavior when the type supports it.
- Make selection highlighting and hit-testing identify the semantic opening object even where its geometry has several render meshes.
- Show a clear warning for invalid host, out-of-bounds opening, or missing type data rather than silently implying a valid opening.

**Acceptance checks**

- Switching active floor produces the same visible object IDs in 2D and 3D, accounting for explicitly spanning objects.
- A door and window each cut the host wall in the correct location and vertical range. The remaining wall, jambs, leaf/glass, and sill can be visually distinguished from outside and inside views.
- A transparent window shows scene geometry through the glazing while retaining a visible frame and selectable hit target.
- Unit tests cover level filtering, opening extents, missing hosts, invalid dimensions, sill heights, and type resolution. Browser verification checks at least one door and one window in orbit views.

### Slice 1 — Add BIM placement references and geometric snapping (P1)

**Scope**

- Introduce an explicit placement reference for linear elements: **centerline**, **inside face**, and **outside face**. Store the reference semantics with the object or command so redraw, edit, export, and 3D all use the same resolved geometry.
- Build snap candidates from actual object geometry: grid intersection/line, column center/corners/faces, beam endpoints/axis/edges, wall endpoints/corners/faces/centerline/midpoint, and intersections. Add nearest point, perpendicular, and parallel constraints as a later extension of this slice.
- Rank candidates by screen-space distance, enabled snap modes, and deterministic tie-break rules; avoid returning the first candidate merely because it appears first in an array.
- Add a visible snap marker and label naming both snap type and target. Expose snap toggles and a temporary override for free, grid, endpoint, midpoint, center, and face snaps.
- Keep opening placement host-aware, but display the chosen wall, offset, and minimum-end clearance in the preview.

**Acceptance checks**

- For a 100 mm wall, inside/centerline/outside reference modes produce centerline offsets of -50/0/+50 mm relative to the chosen face, with orientation handling tested in all four directions.
- A wall can snap to a column corner and a column face; a beam can snap to a wall/column face and endpoint; midpoint and intersection snaps are stable when candidates overlap.
- Screen-space snap tolerance stays usable across zoom levels. Snap indicators report the target and resulting coordinates.
- Unit tests cover candidate generation/ranking, ties, tolerance, direction reversal, and reference offset. Interaction checks cover toggles, temporary override, and wall/beam placement.

### Slice 2 — Build a useful architectural opening catalog (P2)

**Scope**

- Extend type parameters with explicit family and construction data: operation (hinged/sliding/fixed/awning/louver), leaf or panel count, frame depth/material, glazing material/transparency, sill/head configuration, and optional hardware/detail visibility.
- Seed a small, clearly named Thai residential catalog rather than treating D1–D3/W1–W3 as dimension-only variants. Keep size and construction type editable independently where that is meaningful.
- Use the same type definition to render the 2D symbol, 3D geometry, schedule entry, and quantity takeoff.
- In the type picker, show name, thumbnail/symbol, dimensions, operation, material, and a compact preview before placement.

**Acceptance checks**

- At least hinged single door, sliding door, fixed-glass window, sliding window, and awning/louver window have distinct 2D and 3D representations.
- Changing a type updates all instances that reference that type and refreshes drawing, geometry, schedule, and takeoff data in one model update.
- Legacy projects without the new fields load with a documented default and remain editable.

### Slice 3 — Improve the 2D drawing flow (P2)

**Scope**

- Make the active tool state, first point, reference line, snap mode, and next action visible on the canvas.
- Add live length/angle input and keyboard constraints while drawing walls and beams; support axis lock, numeric dimensions, cancel, and repeat-last-tool.
- Support wall chaining and finish/close behavior without losing the chosen type, phase, level, or reference mode.
- Keep the selected element's type, dimensions, alignment, level, and phase available in the inspector; use immediate preview to show the actual resolved centerline and faces.
- Ensure one finished placement gesture creates one undoable command transaction.

**Acceptance checks**

- A first-time user can place a wall using a selected face alignment, numeric length, and a column-corner snap without needing to infer hidden centerline behavior.
- Preview and committed geometry occupy the same coordinates; undo/redo restores the same geometry and type.
- The core wall, beam, door, and window flows work with mouse and keyboard, with clear empty and invalid-placement feedback.

## Delivery gates and dependencies

1. **P0 first:** view filtering and semantic opening geometry establish trustworthy output before polishing authoring controls.
2. **P1 next:** define reference-line semantics in the project/command contract before adding more snap candidates; otherwise snapping will attach to geometry whose placement meaning is ambiguous.
3. **P2 catalog/rendering:** introduce the type schema with migrations and defaults before expanding the UI picker.
4. **2D flow polish:** build on the tested snap/reference contracts, not UI-only offsets.
5. **Release gate:** compare 2D/3D object IDs and screenshots at two floors; test inside/outside placement, all supported opening families, undo/redo, save/reopen, and legacy project loading.

## Explicitly outside the first pass

- Do not attempt a full Revit-style constraint solver or automatic structural redesign in these slices.
- Do not change building-code compliance rules as part of the visual opening work.
- Do not add an unbounded catalog of door/window products before the type schema and renderer are stable.

## Source areas to update

- `apps/plan-editor/src/components/PlanCanvas.tsx`
- `apps/plan-editor/src/components/Model3DViewport.tsx`
- `apps/plan-editor/src/snapping/snapEngine.ts`
- `apps/plan-editor/src/rendering/planRenderer.ts`
- `apps/plan-editor/src/components/Toolbar.tsx` and `PropertiesPanel.tsx`
- `packages/representation-engine/src/index.ts` and tests
- `packages/project-model/src/types.ts`, migrations, and project validation
- `packages/command-schema/src/architectureCommands.ts` and `structureCommands.ts`

## Implementation notes — 2026-10-08

The first implementation pass delivers the core authoring and representation changes:

- 2D and 3D now use the active-floor visibility set. Browser verification on Ground Floor and First Floor showed matching visible content, including columns that span both floors.
- Hosted doors and windows use semantic 3D geometry: the host wall carries the cutout; hinged leaves show handing/swing; sliding panels, frames, louvers, and transparent glazing are rendered separately. Invalid or missing opening hosts are reported and omitted. Selection and dragging resolve compound meshes to the original object UUID.
- The type catalog now includes D4/D5 and W4/W5 with operation, panel count, frame/glazing parameters, and the 2D picker labels each type with its construction and size. A-08 now places all ten default opening elevations in a two-row layout.
- Wall and beam placement now supports centerline/left-face/right-face reference semantics saved on the model. Snap candidates include endpoints/corners, centers, faces, centerlines, intersections, and grid targets; users can toggle snap classes. The 2D authoring panel exposes type selection, placement reference, numeric segment length, axis lock, parallel/perpendicular constraints to nearby wall/beam lines, chaining, and Escape cancellation.
- Snap geometry now lives in `packages/snapping-engine`, with direct tests for rotated column corners, projected faces and beam edges/axes, endpoints/midpoints, deterministic ties, screen-space tolerance, grid/intersection targets, free placement, hosted-opening end clearance, and parallel/perpendicular projections.
- A-08 regression coverage verifies all catalog opening types are represented; representation, migration, command-runtime, snapping, and standalone acceptance checks cover the model changes.

The full constraint solver, catalog thumbnails, and broader keyboard/screen-reader and save/reopen interaction checks remain follow-up work. Live 2D opening preview now draws operation-specific symbols (hinged swing, sliding panels, louver blades, window panel divisions and glazing) and shows the selected type, panel count, width, and window sill height before placement. Automatic line inference now applies parallel/perpendicular alignment when the cursor approaches either projection within a 12 px screen-space tolerance; explicit modes and Shift axis lock remain available. The 3D visual check is based on the starter model and two levels; it does not replace a representative project review of every catalog operation and edge case.

### Wall layer assembly follow-up

- Wall catalog types now define masonry core thickness separately from inside and outside plaster thickness. W1 defaults to 100 mm masonry + 10 mm plaster on each side (120 mm overall); W2 defaults to 150 + 10 + 10 mm. Legacy wall types with no layer data retain their existing single-layer behavior.
- Type Manager can edit the core and both plaster thicknesses and displays the computed overall wall thickness. The 2D plan, properties panel, and 3D representation expose the layer breakdown; 3D cuts each layer around hosted doors/windows.
- Takeoff separates masonry area and volume from inside/outside plaster areas, subtracting hosted openings from each applicable quantity. Catalog edits cascade to wall instances, 3D layers, and takeoff in one command transaction.
- Automated coverage now checks catalog creation/cascade, distinct 3D wall layers, and separated BOQ quantities. Material selection for each plaster side and visual browser inspection of a representative layered project remain open polish items.

### Placement dimensions, tape measure, and underlay calibration — 2026-10-09

- Temporary placement dimensions and numeric distance entry are active only for object-placement tools. Select and Erase do not show a live measurement just because the pointer is over an object.
- `Tab` switches a placement dimension reference between the target object's center and edge; `Shift+Tab` switches the dimension axis. Openings start in edge mode and measure from existing geometry at the opening/jamb edge, excluding the host wall as a competing dimension reference. The opening width used for that edge calculation comes from the selected opening type.
- `Tape Measure (M)` is a separate, non-modeling action: click two snapped points to inspect their distance in millimeters/meters. Its line and result are temporary and do not create a persistent Smart Object or drawing dimension.
- `Calibrate Underlay (R)` remains a separate point-to-point scale workflow for a visible imported reference image. It does not run as a general model measurement command and is hidden/unavailable without that image context.
- This interaction split is consistent with Upgrade Track B's temporary dimensions/numeric input and the existing underlay calibration track. It is not a replacement for semantic placement references, parametric object dimensions, associative sheet dimensions, or model-derived plan/elevation/section output. Those remain governed by the existing contracts and delivery gates above.
- Verification: the Plan Editor production build passed and the browser UI showed the tape tool while calibration was unavailable without a visible underlay. Real touch-device acceptance and persistent associative dimensions are still open; this note does not claim either is complete.
