# Phase 4/7 Integration — Surface + Interior

Status: implementation specification

## Objective

Connect the existing Surface/Paving and Interior/Joinery foundations through stable Smart Object, Command, Event, Quantity and Library contracts.

## Integration Rules

1. Surface owns surface geometry, paving pattern and border semantics.
2. Interior owns cabinet/joinery semantics and fabrication parts.
3. Library owns catalog identity and project snapshots; domain modules own how an asset is instantiated.
4. Quantity providers consume domain-owned semantic data; they do not scrape arbitrary SketchUp geometry.
5. Drawing and BOQ consumers subscribe to dirty events and never mutate domain objects directly.

## Required Events

- `SurfaceChanged`
- `PavingLayoutChanged`
- `JoineryChanged`
- `JoineryPartsChanged`
- `CatalogAssetSwapped`
- `ConstructionReplaced`
- `QuantityDirty`
- `DrawingDirty`

## Acceptance Workflow A — Paved Kitchen Extension

`Extension Zone -> Floor Surface -> Border -> Paving Pattern -> Kitchen Cabinet Run`

Changing the extension boundary must mark dependent surface layout and joinery coordination dirty without changing unrelated objects.

## Acceptance Workflow B — Catalog Swap

`Project Asset Snapshot -> Place -> Swap Type/Version -> Regenerate domain geometry -> Preserve Smart Object identity`

A catalog swap is not a demolition/new construction event unless explicitly requested as construction replacement.

## Acceptance Workflow C — Joinery Takeoff

`Cabinet -> Modules -> Parts -> Board/Glass/Edge/Hardware quantities -> BOQ`

Every output must retain source object IDs for traceability.

## Next Implementation Slice

Implement the Library tests and runtime wiring first, then expose catalog selection to Door/Window and Cabinet modules. Do not add UI-specific persistence or direct geometry mutation paths.
