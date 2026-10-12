# Drawing UX Capability Matrix — 2026-10-13

This matrix maps the main model families to their current canvas workflow, edit path, and the next acceptance target. Drawing tools create persistent Smart Objects through the same `CommandBus` used by Workbench commands; generated objects retain UUID identity and use the active renovation phase defaults.

## Family coverage

| Family | Canvas workflow | Post-placement editing | Remaining gap / acceptance target |
| --- | --- | --- | --- |
| Walls | Two-point draw with face/centerline reference, BIM snaps, live dimensions, and connected wall joins | Endpoint grips, move, wall-face and vertical properties | Add multi-segment chained wall mode and a dedicated junction/cleanup preview; verify plaster faces stay continuous in plan and elevation |
| Doors and windows | Hosted placement on a wall with width-aware jamb clearance, snap-to-host, and temporary dimensions | Single-sided width grips, host offset, swing, instance parameters, sill/head levels | Add multi-select alignment and explicit host-change workflow; acceptance includes no false wall-clash warning for hosted openings |
| Structural columns and foundations | Point placement with grid/host snaps | Column and footing corner grips, level and mark properties | Add shape-specific grips and a temporary dimension edit during resize |
| Beams | Two-point draw with center/face reference, line constraints, column snap | Endpoint grips, host columns, vertical datum and drop properties | Add continuous-beam chain drawing and break/merge editing |
| Structural slabs | Polygon draw with live edge dimensions and void drawing | Boundary vertex grips, level, thickness, slope and finish pattern | Add slab edge offset and slope arrows in plan; confirm openings survive type changes |
| Architectural floors and ceilings | Polygon draw or room-derived creation | Boundary vertex grips, level, offset, thickness and finish settings | Add linked-room boundary refresh preview and direct ceiling-grid editing |
| Stairs | Directional run placement with rise, width, flight and landing controls | Parametric stair properties | Add grip-based run/width editing and a clear landing/flight preview before commit |
| Roofs | **New:** polygon footprint draw in a dedicated roof plan with architectural context; choose hip, gable (four-point footprint) or flat; set slope, datum offset, thickness and material before placement | Boundary vertex grips; editable reference elevation, thickness, material, and per-edge slope intent | Add ridge/valley controls, eaves overhang geometry, roof openings and a site-boundary setback test. The initial settings default to a hip roof with 25° slopes on every edge |
| Plumbing and drainage routes | **New:** two-point route drawing; choose waste, soil, rainwater, vent, cold-water, or hot-water system before drawing | Edit diameter, material, endpoint elevations and gravity minimum slope | Add route-node grips, connected node placement, multi-segment bends, and system-specific elevation presets. Gravity routes currently default to 1:100 |
| Electrical fixtures | **New:** point placement for lights, switches, outlets, and panels | Edit device kind, watts, installation elevation, and grounding | Add circuit assignment, cable/conduit routing, switch-to-load linking, and circuit validation directly from plan |
| Built-ins | **New:** two-point front baseline sets cabinet width and rotation | Edit width, height, depth, rotation and front style | Add chained cabinet modules, worktop geometry/finish preview, host alignment, and family types |
| Decorative mouldings | **New:** two-point run at the active level's upper datum | Edit installation elevation and material | Add connected polyline/closed-loop drawing, profile catalog selection, mitre preview, and wall-host alignment |
| Grids and room boundaries | Single/grid-system placement, snapping and room detection | Grid endpoints/tags and room-boundary edits | Add stronger room-boundary diagnostics and batch room naming/numbering |

## Implemented interaction contract

- Polygon tools share the slab drafting path: click points, use live dimensions and angle constraints, close at the start, double-click, or press Enter. Escape cancels the pending shape.
- Two-point tools share the line drafting path: click a start and end, constrain the second point with Shift, type a length/angle, and press Enter. Escape cancels without creating an object.
- Point tools place at the active snap and accept Enter from the dynamic dimension input.
- Roof and domain edits use `UpdateRoof`, `EditPipeRoute`, `UpdateElectricalFixture`, `UpdateCabinetRun`, and `UpdateMouldingRun`; they are undoable and retain object UUIDs.
- Roof drawing switches to a dedicated roof plan with architectural context. Roofs stay hidden from floor and framing plans; the roof plan supports selection, vertex editing and the roof inspector.

## Cross-view acceptance

1. Draw and edit a roof; confirm it is visible/selectable in the roof plan, stays hidden from floor/framing plans, has per-edge slopes in the inspector, renders in 3D/elevation, and contributes roof covering/gutter/downpipe quantities.
2. Draw a gravity route and a cold-water route; confirm the gravity route has a valid fall, both routes are selectable, endpoint elevations edit successfully, and each appears in coordination/takeoff outputs.
3. Place each electrical fixture kind; update elevation and watts; verify the same UUID survives save/load and that a switch can only control valid light objects.
4. Draw a cabinet and moulding run; edit their instance dimensions/materials; confirm geometry, cut list or quantity output changes with the same UUID.
5. Repeat roof, route, fixture, cabinet and moulding create/edit/delete through undo/redo and project save/load; inspect plan, framing, elevation and 3D for view-specific visibility and stale geometry.

## Next implementation priorities

1. Extend direct-manipulation grips from walls/openings/floors to pipe endpoints, moulding endpoints, cabinet placement orientation, roof ridge lines and slab edges.
2. Add route-aware MEP connection editing and direct electrical circuit assignment, then verify clash checks against walls, beams and ceiling zones.
3. Add family/type catalogs for roofs, MEP fixtures/routes, cabinetry and moulding profiles, including type-cascade behavior.
4. Complete cross-view selection feedback, vertical datum badges and focused automated acceptance tests across plan, framing, elevation, 3D, takeoff and saved-project round trips.
