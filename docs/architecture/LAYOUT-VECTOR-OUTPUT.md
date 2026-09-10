# LayOut / Vector Output Foundation

Status: Accepted v1 foundation contract.

## Purpose

ConstructFlow must turn managed drawing scenes into deterministic sheet/export intent before any native SketchUp LayOut document is created. The sheet/export plan is renderer-neutral and preserves drawing semantics such as scene, preset, scale, viewport bounds, lineweight profile, revision and issue state.

## Ownership

The Drawing platform owns:

- sheets and sheet numbering;
- viewport placement and scale;
- title-block/template selection;
- lineweight profiles;
- revision and issue state;
- LayOut/PDF export orchestration.

Domain modules continue to own semantic representation content. They do not create LayOut pages directly.

## Sheet contract

A sheet contains at minimum:

```yaml
id: sheet.plumbing.construction
number: P-101
title: Plumbing Plan - Construction
paper_size: A3
orientation: landscape
page_size_mm: [420, 297]
template_key: constructflow.standard
revision: P01
issue_status: working
viewports: []
```

Foundation paper sizes are A4, A3, A2, A1 and A0. Page dimensions are canonical millimetres.

## Viewport contract

A viewport references an existing managed drawing Scene/View rather than duplicating model geometry:

```yaml
id: viewport.plumbing.construction
scene_name: ConstructFlow - Plumbing Plan - Construction
preset_id: plumbing.construction
scale: 1:50
bounds_mm: [15, 15, 390, 255]
render_mode: vector
lineweight_profile: construction
```

Supported foundation render intents are `vector`, `hybrid` and `raster`. Native adapter support may vary, but unsupported native behavior must not alter semantic sheet intent.

## Vector lineweight profile

Renderer-neutral plan styles expose semantic weights such as `light`, `normal`, `medium` and `strong`. The vector-output layer maps those keys to print widths in millimetres.

Foundation profile:

```yaml
light: 0.13
normal: 0.18
medium: 0.25
strong: 0.35
```

SketchUp model geometry must not fake lineweight by duplicating or offsetting edges. Print/vector weight belongs to the drawing export layer.

## Export plan

`LayoutExportPlanBuilder` produces a normalized intent envelope:

```yaml
format: constructflow.layout_export_plan.v1
source:
  preset_id: plumbing.construction
  scene_name: ConstructFlow - Plumbing Plan - Construction
  drawing_family: plumbing_drainage_plan
  phase_view: proposed
  lod: construction
  scale: 1:50
sheet: {}
vector_style: {}
native_layout_status: planned
export_targets: [layout, pdf]
```

The v1 builder does not claim to create a `.layout` document or PDF. Native document generation is a follow-up adapter that consumes this contract.

## Runtime entry point

The platform exposes export planning through:

```ruby
Runtime.layout_export_plans.build_for_preset('plumbing.construction')
```

This allows UI, automation and future AI commands to request the same deterministic sheet intent.

## Safety and determinism

- sheet intent must not mutate model geometry;
- viewport references a managed scene/preset;
- paper and viewport dimensions use millimetres;
- invalid paper/orientation/render mode/bounds fail explicitly;
- lineweight values must be positive;
- native LayOut availability must not be required to build or test export intent.

## Acceptance criteria

1. A Drawing View Preset can produce a normalized sheet/export plan.
2. Sheet paper size/orientation resolves deterministic page dimensions.
3. A viewport carries scene, preset, scale, render mode and bounds.
4. Vector lineweight keys resolve to positive print widths.
5. Revision and issue status are carried independently from model lifecycle phase.
6. The runtime can build export intent without requiring SketchUp LayOut APIs.
7. No duplicate model or domain semantic state is created by the export plan.
