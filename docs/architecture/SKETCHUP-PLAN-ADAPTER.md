# SketchUp Plan Rendering Adapter

Status: Accepted foundation contract.

## Purpose

ConstructFlow drawing providers return semantic, renderer-neutral representations. The SketchUp plan adapter converts those representations into lightweight SketchUp line/text entities and managed scenes without moving drawing semantics into Core or into the renderer.

The adapter is therefore downstream of the Smart Object Representation System:

```text
Smart Object
  -> Domain Representation Provider
  -> RepresentationRegistry
  -> SketchUp Plan Adapter
  -> managed line/text output + SketchUp Scene
```

## Ownership boundary

Domain modules own:

- which primitives exist;
- semantic roles such as `pipe_centerline`, `flow_direction`, `manhole_outline`;
- annotation text/data such as diameter, slope, invert, object tags;
- scale/LOD decisions;
- phase-aware representation intent.

The SketchUp adapter owns only:

- canonical mm -> SketchUp unit conversion;
- renderer mechanics for supported primitives;
- deterministic annotation display offsets;
- managed output group lifecycle;
- SketchUp Tag assignment;
- SketchUp Scene creation/update;
- top/parallel camera setup when API support is available.

The adapter must never infer pipe diameter, wall type, structural meaning, phase, slope, or other domain semantics from raw SketchUp geometry.

## Initial primitive support

v1 supports:

- `polyline` / `closed_polyline` -> SketchUp edges;
- `flow_arrow` -> route line plus deterministic arrow head;
- `symbol` -> lightweight text symbol;
- annotation `text` -> SketchUp text entity.

Unsupported primitives are ignored by the renderer until an explicit adapter contract is added. Domain providers remain free to expose richer renderer-neutral primitives without forcing every renderer to implement them immediately.

## Units

Representation coordinates use ConstructFlow canonical millimetres. SketchUp Ruby numeric coordinates are converted using:

`1 inch = 25.4 mm`

Domain providers must not pre-convert coordinates for SketchUp.

## Managed output group

Each generated plan scene owns one managed output group identified by namespaced metadata:

```text
constructflow.plan_scene
  managed = true
  scene_name = <name>
  scale = <drawing scale>
  phase_view = <existing|demolition|proposed|coordination>
  lod = <representation LOD>
  source_object_ids = <stable IDs>
```

Refresh is idempotent:

1. locate the managed group for the scene;
2. clear only adapter-owned child entities;
3. re-request current semantic representations;
4. rebuild line/text output;
5. update scene metadata and page.

A refresh must not duplicate managed output groups for the same scene.

## Source traceability

Rendered child entities receive namespaced source metadata where possible:

```text
constructflow.representation
  source_object_id
  representation_kind
  owner_module
```

This metadata is renderer traceability only. It does not become a second Smart Object identity.

## Transaction safety

A scene refresh is a user-visible model mutation and must run inside one ConstructFlow/SketchUp transaction so Undo/Redo remains coherent. Failed rendering aborts the operation.

## Scene behavior

The initial plumbing scene is named:

`ConstructFlow - Plumbing Plan`

Default output Tag:

`CF-DRAWING-PLUMBING`

The adapter should create/update a SketchUp Scene/Page and, when supported by the installed SketchUp API, record a top parallel camera. Scene composition and LayOut sheet composition remain separate concerns.

## Runtime entry point

The SketchUp runtime exposes:

```ruby
JiraNot::ConstructFlow::Runtime.plan_scenes.refresh
```

A user-facing menu action may call the same service. Human UI and future AI commands must converge on the same deterministic service instead of maintaining separate rendering paths.

## Non-goals for v1

- full graphic style manager;
- dimensions and leaders;
- automatic collision-free label placement;
- section/elevation renderer;
- LayOut page composition;
- DWG/DXF renderer;
- direct editing of generated linework as the source of truth.

## Acceptance baseline

- a registered Smart Object plan provider can be rendered to SketchUp-compatible line/text entities;
- mm coordinates are converted deterministically;
- rendered entities retain source Smart Object metadata;
- repeated refresh replaces adapter-owned output rather than duplicating it;
- refresh executes in a transaction;
- one managed Scene/Page can be created/updated without changing domain Smart Object identity.
