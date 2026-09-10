# Architecture + Opening Plan Representations v1

Status: Implemented slice aligned with Architecture and Opening drawing requirements.

## Architecture wall

`architecture.wall` exposes an on-demand `plan` representation from `WallDefinition`.

- Simple: semantic wall centerline and tag.
- Construction: adds wall-face offsets, wall type and thickness.
- Coordination: adds wall height, geometry mode and hosted-opening count.

## Opening

`opening.rectangular` exposes an on-demand `plan` representation from `OpeningDefinition` plus the referenced semantic wall definition.

- Simple: opening span and symbol.
- Construction: adds width and height.
- Coordination: adds host wall, sill and current infill traceability.

The opening position is calculated from semantic wall path segment + start offset + width. No raw SketchUp edge discovery is used and no parallel 2D model is persisted.
