# Smart Object Representation System

Status: Accepted foundation contract.

## Purpose

ConstructFlow uses one semantic Smart Object as the source of truth and allows that object to expose multiple view-specific representations without duplicating construction identity.

The governing rule is:

> One Smart Object, many representations.

SketchUp remains a 3D modeling environment. Plan, elevation, section, detail, annotation and schedule outputs are representations of the same semantic object, not separate independent copies of the construction object.

## Core model

A Smart Object may expose zero or more representation kinds:

```text
Smart Object
├── model_3d
├── plan
├── elevation
├── section
├── detail
├── annotation
└── schedule
```

Not every object must implement every kind. A tree may expose `model_3d` and `plan`; a drainage manhole may expose `model_3d`, `plan`, `section` and `annotation`; a cabinet may expose all of `model_3d`, `plan`, `elevation`, `section`, `detail`, `annotation` and `schedule`.

## Source of truth

The domain-owned Smart Object definition, relationships, phase, levels and parameters remain authoritative.

Representations are derived outputs. They must never become a second construction model that users have to keep synchronized manually.

Changing the Smart Object invalidates or regenerates affected representations:

```text
Smart Object changed
  -> domain geometry may rebuild
  -> representation outputs become dirty
  -> affected view representations regenerate
  -> drawing outputs become clean only after successful regeneration
```

## Ownership

The owner domain owns the meaning and geometry of its representations.

Examples:

```text
constructflow.structure
  -> column 3D geometry
  -> structural plan symbol
  -> section cut representation
  -> column tag data

constructflow.roof
  -> roof 3D surface
  -> roof plan linework
  -> slope arrows
  -> section profile

constructflow.drainage
  -> pipe/manhole 3D geometry
  -> plan centerlines and symbols
  -> section/profile representation
  -> diameter, slope, flow and invert annotations
```

The Drawing module consumes these representations and composes views/sheets. It must not re-infer domain meaning from raw SketchUp geometry.

This extends the accepted DrawingProvider contract in `CORE-CONTRACTS.md` and `DRAWING-STANDARD.md`.

## Representation kinds

Foundation kinds are:

- `model_3d` — model-space geometry used for 3D editing/coordination.
- `plan` — top/plan-specific linework or symbols.
- `elevation` — elevation/front/side representation.
- `section` — section/profile representation.
- `detail` — enlarged construction/fabrication representation.
- `annotation` — semantic tags, labels, arrows, levels and callouts.
- `schedule` — structured rows/records intended for schedules, legends or tables.

Additional kinds require an architecture contract update before implementation.

## Persistent versus on-demand representations

A representation declares one policy:

### `persistent`

Stored or maintained in the SketchUp model because it is needed continuously or interactively.

Typical examples:

- primary `model_3d` geometry;
- lightweight persistent plan symbol where required for editing;
- connector markers that must remain interactable.

### `on_demand`

Generated only when a view/drawing requests it.

Typical examples:

- section-specific linework;
- fabrication detail geometry;
- high-detail annotations;
- schedules.

The default for non-model representations should be `on_demand` unless persistent geometry has a clear interaction or performance justification.

## Request contract

The Core representation service requests a representation using context rather than hardcoded SketchUp scene logic:

```yaml
kind: plan
view: plumbing_plan
scale: 1:50
phase_view: proposed
lod: construction
context: {}
```

`view` is a semantic view intent, not a SketchUp scene name requirement.

`scale` may influence simplification/detail.

`phase_view` uses the accepted lifecycle view semantics: existing, demolition, proposed or coordination.

`lod` allows domain providers to choose concept/construction/fabrication detail without forcing all geometry to maximum detail.

## Result contract

A provider returns normalized representation output:

```yaml
object_id: cf_...
object_type: drainage.pipe
kind: plan
owner_module: constructflow.drainage
policy: on_demand
geometry_refs: []
primitives: []
annotations: []
metadata: {}
```

`geometry_refs` points to persistent or generated SketchUp entities where applicable.

`primitives` is renderer-neutral semantic/graphic data such as lines, arcs, polygons, symbols or schedule records.

`annotations` contains semantic annotation intents rather than disconnected text whenever possible.

`metadata` may include source revisions, representation version, style hints and domain-specific output metadata, but must not contain a second authoritative copy of the domain object.

## SketchUp representation strategy

SketchUp-specific implementations may use:

- Groups/Components;
- Tags;
- Scenes;
- Section Planes;
- Parallel Projection;
- hidden/visible representation groups;
- generated temporary groups for view creation.

These are adapter choices, not the architecture contract itself.

A typical persistent object may be organized as:

```text
Pipe-001
├── MODEL_3D
├── SYMBOL_PLAN
└── CONNECTORS
```

A section representation may be generated on demand instead of being stored permanently.

## View behavior

A semantic drawing view asks the registered providers for the representations it needs.

Example Plumbing Plan:

```text
Drawing View: plumbing_plan
  -> drainage.pipe / plan
  -> drainage.manhole / plan
  -> drainage.floor_drain / plan
  -> drainage.* / annotation
  -> architecture.* / plan as background/context
```

Example Coordination 3D:

```text
Coordination View
  -> */model_3d
  -> optional connector/QA overlays
```

Visibility must therefore be driven by view intent and representation kind, not by users manually maintaining duplicate model copies.

## Semantic annotation

Annotation providers should reference Smart Object identity and live parameters.

Examples:

- pipe diameter from the pipe definition;
- slope from pipe route data;
- invert level from endpoint/invert calculations;
- `MH-01` from manhole identity/tag data;
- `C1` from structural type/tag data;
- window tag from Door/Window type data.

Changing the referenced data must invalidate/update the annotation; users should not have to edit disconnected labels manually.

## Performance rule

Do not persist every possible 2D/section/detail representation for every Smart Object.

Use:

- persistent low-cost geometry needed for interaction;
- on-demand generated representations for drawings and details;
- scale/LOD-aware simplification;
- cached outputs only when profiling proves a benefit;
- explicit invalidation when source objects change.

This prevents SketchUp models from becoming unnecessarily heavy.

## Core registry contract

Core owns a neutral `RepresentationRegistry` that maps:

```text
(object_type, representation_kind)
  -> owner_module
  -> provider
  -> policy
```

Only one provider may own the same `(object_type, kind)` pair.

The registry validates foundation kinds and policies and normalizes provider output. It does not contain domain geometry logic.

## Drawing integration

The Drawing platform should consume the Core registry rather than calling domain implementation classes directly.

Recommended flow:

```text
Drawing View Request
  -> phase/scale/LOD context
  -> RepresentationRegistry
  -> domain providers
  -> normalized representation outputs
  -> SketchUp Scene / LayOut adapter
  -> drawing view/sheet
```

The Drawing platform owns:

- view/sheet composition;
- drawing numbering;
- title blocks;
- graphic/annotation style systems;
- revision/issue state;
- export orchestration.

Domain modules own the semantic content they contribute to those views.

## Dirty-state behavior

When a source Smart Object changes, the object/domain must invalidate affected output kinds.

Foundation mapping:

- geometry/parameter change -> relevant representations dirty;
- phase change -> phase-filtered representations/views dirty;
- level change -> geometry and level annotations dirty;
- relationship/connector change -> network/host representations dirty;
- type/catalog swap -> geometry, annotation and schedule representations dirty as applicable.

The current `dirty_drawing` flag remains a valid coarse signal. Future representation-level dirty tracking may refine it without changing the source-of-truth rule.

## Acceptance criteria

Foundation implementation is acceptable when:

1. Core can register providers by object type and representation kind.
2. Duplicate ownership of the same `(object_type, kind)` is rejected.
3. Both `persistent` and `on_demand` policies are represented.
4. A provider receives semantic view context including kind, scale, phase view and LOD.
5. Core normalizes provider output without domain-specific geometry rules.
6. One Smart Object can expose multiple independent representation kinds while retaining one stable object ID.
7. Domain modules remain responsible for their own representation meaning.
8. Drawing consumers can discover available representations without scanning raw SketchUp geometry.

## Non-goals for foundation v1

This contract does not yet require:

- automatic SketchUp Scene generation;
- LayOut document generation;
- every existing module to ship all representation providers immediately;
- persistent caching of on-demand results;
- renderer-specific line styles;
- automatic annotation collision/placement solving.

Those are later vertical slices built on this contract.
