# Interior Plan Representations v1

Status: Implemented slice aligned with `docs/modules/INTERIOR.md` Drawing requirements.

## Scope

`interior.cabinet_run` provides an on-demand semantic `plan` representation through the shared Representation Registry.

The provider reads `CabinetRunDefinition` and derives:

- rotated cabinet footprint;
- front line;
- semantic module dividers;
- cabinet size/mode annotations;
- coordination height/material/host annotations.

## Profiles

- Simple: cabinet footprint, front line and tag.
- Construction: module dividers, size and mode.
- Coordination: adds height, carcass material and host-object traceability.

The plan representation derives from the same parametric definition used to build 3D geometry. It does not create or persist a parallel 2D cabinet model.
