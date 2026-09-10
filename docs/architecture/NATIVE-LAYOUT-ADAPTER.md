# Native LayOut Adapter

Status: Accepted v1 foundation contract.

## Purpose

The Native LayOut Adapter consumes `constructflow.layout_export_plan.v1` and translates that renderer-neutral export intent into the official LayOut Ruby API. Domain modules never call `Layout::*` directly.

## Boundary

The adapter owns only renderer-specific work:

- create a `Layout::Document` from an optional template;
- set paper dimensions;
- resolve the target LayOut page and layer;
- create `Layout::SketchUpModel` viewports from a saved `.skp` file;
- select the named SketchUp Scene;
- apply vector / hybrid / raster render mode;
- apply orthographic viewport scale;
- add the viewport to the document;
- save `.layout`;
- optionally export `.pdf`.

The renderer-neutral export plan remains the source of sheet, viewport, scale, revision and issue intent.

## Source-model rule

Native LayOut viewports reference a saved SketchUp model file. The runtime export service must reject export when the active SketchUp model has no saved `.skp` path, unless an explicit `.skp` path is supplied.

## Units

ConstructFlow drawing contracts store paper and viewport dimensions in millimetres. The LayOut Ruby API uses inches for page dimensions and `Geom::Bounds2d` paper coordinates. Unit conversion occurs only inside the native adapter.

```text
millimetres / 25.4 -> LayOut inches
```

## Viewport scale

Ratio strings are converted deterministically:

```text
1:50  -> 0.02
1:100 -> 0.01
```

The adapter must not invent a scale when the export plan is missing or invalid.

## Scene binding

A viewport selects its SketchUp Scene by exact name from `Layout::SketchUpModel#scenes`. Missing scenes are explicit export errors rather than silently using Last Saved SketchUp View.

## Render modes

Normalized render intent maps to native LayOut constants:

- `vector` -> `Layout::SketchUpModel::VECTOR_RENDER`
- `hybrid` -> `Layout::SketchUpModel::HYBRID_RENDER`
- `raster` -> `Layout::SketchUpModel::RASTER_RENDER`

## Traceability

When supported by the LayOut version, the document stores ConstructFlow export metadata including sheet ID/number/title, revision, issue status, preset ID, scene name and viewport count.

## Failure behavior

The adapter must fail explicitly when:

- the LayOut Ruby API is unavailable;
- the normalized plan format is unsupported;
- a required file path or extension is invalid;
- the requested SketchUp Scene is absent;
- native LayOut rejects the viewport, render mode, scale, save or export.

It must not silently downgrade vector intent or switch scenes.

## Non-goals v1

- title-block field population;
- multi-page sheet-set orchestration;
- automatic revision tables;
- viewport crop masks;
- dimension/text style remapping;
- per-entity vector lineweight rewriting inside LayOut;
- batch publishing and issue-package manifests.

Those follow on top of this adapter once the first native page + viewport path is verified in a real SketchUp/LayOut installation.

## Acceptance criteria

1. A normalized export plan can create one native LayOut document with one viewport through an injectable backend.
2. Paper and viewport millimetres are converted to inches only at the native boundary.
3. A `1:50` viewport applies a numeric scale of `0.02`.
4. The exact named SketchUp Scene and render mode are requested.
5. `.layout` save and optional `.pdf` export are separate explicit operations.
6. ConstructFlow export metadata remains traceable on the native document when attributes are supported.
7. Pure-Ruby tests do not require LayOut to be installed.
