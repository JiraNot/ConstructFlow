# Wall soffit constraints and continuous plaster

Select a wall and enable **ตัดขอบบนตามท้องบันไดอัตโนมัติ**. The stored `fit_to_stair` boolean is an instance constraint; the original height and vertical datum remain editable. Disabling the constraint restores that height. No derived mesh is saved into the project.

`architecture-engine/wallProfile.ts` projects the actual stair solid (without guards) across the complete wall thickness. Its lower envelope includes straight, L and U flights, mirrored/rotated stairs and landings. Only intersecting spans are shortened. The profile clips at the wall base and original top; unioned hosted apertures are subtracted once. The same cells drive the interactive wall mesh, elevation surfaces, A3 vectors and phased masonry/plaster takeoff.

Finish edits preserve masonry thickness: 75 mm core + 15 mm + 15 mm = **105 mm** overall. Explicit overall dimension edits still resize the core. Held placement faces and hosted openings move with the updated wall thickness through CommandBus.

Architectural elevations join equal material/phase surfaces on the same finished plane. Projecting columns retain return edges; bare surfaces and different phases keep their boundaries. Plan outlines wrap the column finish, while the concrete core and masonry remain visible. Column plaster is controlled by its type catalog; beams expose `plaster_thickness_mm` in the type catalog (zero represents an exposed beam). Legacy RC members without a finish value use 15 mm; steel receives no implicit plaster.

Run `node scripts/create_wall_stair_finish_demo.mjs`, then open `examples/wall-stair-finish-proof.cfproj`. It contains a wall below a straight stair, a projecting column and a separate flush wall/column/beam assembly. Inspect the north elevation and plan. The opposite face of the flush example has a physical step and must retain its edge.

Validation: `npm run build:standalone`, the geometry/architecture/project/representation/command/takeoff/sheet/CAD test suites, and the browser plan/elevation/3D controls. IFC/Revit serializers retain their existing extrusion behavior; this constraint is currently derived in the standalone representation and sheet pipelines.
