# ConstructFlow Workflow Registry v0.1

This registry converts the product scope into real user flows. It should be expanded with acceptance criteria before each module reaches implementation.

## W01 — Start a renovation / extension project

1. Create project.
2. Set units, benchmark, levels and optional grids.
3. Choose working phase = Existing.
4. Import/trace/convert existing conditions.
5. Mark uncertain information as measured / assumed / unknown / verify on site.
6. Switch to design/new-construction work.

## W02 — Trace existing house quickly

1. Enter Existing mode.
2. Draw/trace wall paths with SketchUp-style direct dimensions.
3. Auto-create smart walls.
4. Place/convert existing columns, openings, roof and levels.
5. Keep low LOD unless more detail is needed.

## W03 — Convert old SketchUp geometry

1. Select existing group/component/face network.
2. Choose `Convert To`.
3. Select smart type such as Wall, Existing Roof, Column, Manhole or Surface.
4. Map minimal parameters.
5. Preserve original geometry as smart-object geometry reference where valid.

## W04 — Mark demolition

1. Select existing objects or regions.
2. Run `Demolish`.
3. Set removed phase = Demolition.
4. Update demolition view, quantities and affected drawings.

## W05 — Modify existing wall with new opening

1. Select existing wall.
2. Add opening profile.
3. Create demolition region only for removed wall material.
4. Insert new opening/door/window in New Construction phase.
5. Update existing/demolition/proposed views separately.

## W06 — Add a kitchen extension

1. Select existing building edge/wall.
2. Run `Add Extension → Kitchen`.
3. Drag footprint / enter dimensions and target FFL.
4. Generate concept floor/walls/roof zone.
5. Detect existing conflicts such as manholes, drains or columns.
6. Resolve conflicts.
7. Upgrade to construction mode when design is accepted.
8. Add structure, kitchen joinery, lighting, outlets, water, waste and drainage.

## W07 — Add a carport

1. Select attachment line or site area.
2. Define width/depth/height.
3. Choose concept roof type.
4. Generate columns and roof envelope placeholders.
5. Upgrade to construction mode.
6. Select steel/RC support system, roof material, fascia, gutter and drainage.
7. Coordinate with parking surface and existing utilities.

## W08 — Create polycarbonate / glass roof

1. Define roof boundary or support lines.
2. Select polycarbonate or glass system.
3. Define slope, panel direction and support spacing.
4. Generate panel/support layout.
5. Add wall/roof junction treatment, flashing and gutter.
6. Connect downpipes to drainage network.
7. Generate quantity and junction-detail references.

## W09 — Roof concealment / fascia

1. Select roof edge or support path.
2. Choose fascia assembly from library.
3. Set height/projection.
4. Generate primary/secondary frame and cladding representation according to LOD.
5. Add flashing/drip-edge/soffit interfaces.
6. Take off board, steel, finishing and edge materials.

## W10 — Move an existing manhole

1. New design conflicts with existing manhole.
2. Select manhole and run `Relocate Manhole`.
3. Choose/drag proposed new location.
4. Existing manhole becomes demolition/abandonment scope.
5. New manhole is created in New Construction.
6. Connected pipe network is rerouted.
7. Check pipe lengths, diameter, slope and invert levels.
8. Flag impossible/poor gravity routes and propose options.
9. Update demolition plan, plumbing/drainage plan and BOQ.

## W11 — Auto-route waste pipe

1. Place plumbing fixture with registered waste connector.
2. Run `Connect Waste`.
3. Select target manhole/drainage node.
4. Offer candidate routes: shortest / along wall / external / custom.
5. User accepts or edits route nodes.
6. Recalculate slope and invert levels.
7. Generate centerline representation; physical fittings are optional by LOD.

## W12 — Insert intermediate manhole

1. Select waste/drain pipe segment.
2. Run `Insert Manhole`.
3. Place point.
4. Split network edge.
5. Create manhole and two connected pipe segments.
6. Recalculate invert/slope constraints.

## W13 — Create roof drainage

1. Select roof.
2. Highlight low edges.
3. Add gutter.
4. Auto-suggest downpipe positions.
5. Connect downpipe to manhole, trench drain, surface drain or approved outfall.
6. Revalidate when roof catchment changes.

## W14 — Create tiled/paved freeform surface

1. Draw/select arbitrary closed boundary including curves.
2. Define level/slope/spot controls.
3. Select surface build-up.
4. Add one or more borders.
5. Select field pattern.
6. Set origin, direction and alignment.
7. Preview full/cut pieces.
8. Adjust pattern to respect minimum-cut rules.
9. Lock layout and generate takeoff/setting-out view.

## W15 — Create curved garden path

1. Draw centerline/path.
2. Run `Create Garden Path`.
3. Set width or variable width controls.
4. Select border and paving system.
5. Set pattern to follow path.
6. Generate surface, layout and quantities.

## W16 — Create parking surface with bays

1. Draw/select parking boundary.
2. Set levels and drainage target.
3. Choose pavement assembly.
4. Generate parking bays by count/width/length.
5. Add outer border and bay dividers.
6. Coordinate with columns, gates and trench drains.

## W17 — Create structural foundation system

1. Place/select structural columns.
2. Run `Generate Foundation`.
3. Select spread footing / pile cap / micropile strategy.
4. Generate pile groups where required.
5. Connect foundations with ground beams.
6. Check levels and clashes with existing drainage/utilities.
7. Generate structural quantities and plan representations.

## W18 — Create / edit door or window

1. Place opening in host wall or select existing opening.
2. Select door/window family.
3. Configure panels: swing, slide, fixed, folding, transom, side light.
4. Select frame/material/glass/panel style.
5. Auto-update host opening.
6. Add schedule and detail representation.

## W19 — Decorative wall / moulding

1. Select wall or façade region.
2. Choose moulding/panel/slat/cladding system.
3. Set margins, counts, module dimensions and profiles.
4. Pattern engine resolves openings.
5. Drag parameters or edit values.
6. Generate quantities and elevation/detail intent.

## W20 — Build wardrobe / cabinet

1. Select wall or start/end points.
2. Define height/depth/board system.
3. Auto-fit with fillers.
4. Divide into modules and compartments.
5. Assign function: open / door / drawer / hanging / shelves.
6. Select fronts: solid / glass / aluminum frame / decorative.
7. Assign hardware and materials.
8. Run clearance/collision checks.
9. Generate quantity, cut list and shop drawings.

## W21 — Kitchen joinery with MEP requirements

1. Define kitchen run/layout.
2. Place cabinet modules and appliances.
3. Place sink/hob/hood/refrigerator/dishwasher as required.
4. Auto-create requirement checklist for power/water/waste.
5. Connect MEP systems.
6. Generate plan/elevations, cabinet schedule, quantities and fabrication outputs.

## W22 — Swap catalog type

1. Select smart object.
2. Open compatible alternatives.
3. Choose new catalog type.
4. Preserve object identity, phase, host and level where compatible.
5. Rebuild geometry and invalidate dependent quantity/drawing output.

## W23 — Replace existing construction from catalog

1. Select existing construction object.
2. Choose `Replace Construction`.
3. Existing object is marked for demolition.
4. New catalog-backed object is inserted as New Construction.
5. Maintain replacement relation.
6. Update schedules, quantities and drawings.

## W24 — Generate existing / demolition / proposed drawings

1. Select drawing package/template.
2. Generate views from lifecycle rules.
3. Existing view represents pre-work state.
4. Demolition view highlights removed/modified scope.
5. Proposed view shows retained existing + new construction.
6. Apply dimensions/tags/domain representations.
7. Mark views stale when dependencies change.

## W25 — Run project coordination check

1. Run QA across enabled modules.
2. Collect validation issues.
3. Group by severity and discipline.
4. Navigate to issue.
5. Apply suggested resolution command where available.
6. Re-run only affected validators.

## W26 — Quantity / BOQ update

1. Model event invalidates affected quantity providers.
2. Domain providers recalculate normalized quantity records.
3. BOQ groups items by work category/phase.
4. Cost service applies rates/labor/waste rules if enabled.
5. Outputs identify stale vs current state.

## W27 — AI-assisted command flow

1. User describes intent in natural language.
2. AI resolves selected model context and searches registered commands/catalogs.
3. AI produces structured command proposal.
4. User approves when required.
5. Command executes through normal domain engine.
6. Normal events, QA, quantities and drawing invalidation follow.

## Registry principle

A feature is not considered production-ready until its main workflow has explicit start state, user actions, commands, state changes, failure paths, undo behavior, validation and downstream invalidation defined.
