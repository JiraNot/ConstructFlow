# Smart Object Schema

Status: Accepted foundation contract.

## Purpose

A ConstructFlow smart object is a stable semantic construction object that may own or reference SketchUp geometry. Geometry alone is never the source of truth for production behavior.

## Canonical envelope

Every persisted smart object must expose the following logical envelope even if storage is distributed across namespaced SketchUp attributes or project-side indexes.

```yaml
id: cf_<uuid>
type: <domain.object_type>
module: constructflow.<owner_module>
schema_version: <integer>
display_name: <string>
phase:
  created: <phase_id>
  demolished: <phase_id|null>
level_refs: []
status: active
parameters: {}
relationships: []
geometry_refs: []
catalog_ref: null
source_state: confirmed
revision_meta: {}
created_at: <timestamp|null>
updated_at: <timestamp|null>
```

## Required fields

### `id`

- globally unique inside and across project sessions;
- stable for the life of the semantic object;
- must not be derived only from SketchUp `entityID`, which can change across sessions;
- copied geometry must receive either a new smart-object ID or an explicit instance relationship according to command semantics.

### `type`

Canonical domain type owned by one module, for example:

- `architecture.wall`
- `opening.void`
- `roof.roof_system`
- `structure.column`
- `drainage.manhole`
- `interior.cabinet`
- `surface.paving_zone`

### `module`

The only module allowed to own and mutate the object's private domain schema.

### `schema_version`

Integer version for that object type. It is independent from application version and catalog asset version.

## Phase lifecycle

Use lifecycle fields rather than a single visual status:

```yaml
phase:
  created: existing
  demolished: demolition
```

Derived views decide whether the object is visible as existing, demolished or absent in proposed work.

Typical states:

- Existing to remain: `created=existing`, `demolished=null`
- Existing demolished: `created=existing`, `demolished=demolition`
- New: `created=new_construction`, `demolished=null`

Relocation/replacement creates a new smart object and explicit replacement relationship; it does not rewrite the history of the old object.

## Existing-condition confidence

`source_state` supports:

- `measured`
- `confirmed`
- `assumed`
- `unknown`
- `verify_on_site`

Unknown information must remain representable. Domain commands must not fabricate engineering or site certainty merely to satisfy a schema.

## Level references

Objects may reference multiple semantic levels with offsets. Example:

```yaml
level_refs:
  - role: base
    level_id: FFL_GROUND
    offset_mm: 0
  - role: top
    level_id: CEILING_GROUND
    offset_mm: -50
```

Raw Z coordinates may be cached as geometry state but do not replace semantic level references when the object depends on a project level.

## Parameters

`parameters` contains owner-module domain data only. Publicly consumed values should be exposed through typed accessors/contracts rather than external modules reading arbitrary keys.

All dimensional persisted values use the canonical internal unit defined by the Core unit contract. Current foundation convention: **millimetres for length**, **square millimetres/canonical derived units internally where practical**, with normalized output conversions for quantities.

## Relationships

Relationship records are explicit and typed:

```yaml
relationships:
  - id: rel_<uuid>
    kind: host
    target_id: cf_wall_001
    role: primary_host
```

Canonical relationship families:

- `host`
- `supports`
- `supported_by`
- `connects_to`
- `feeds`
- `drains_to`
- `controls`
- `generated_from`
- `replaces`
- `replaced_by`
- `depends_on`
- `contains`
- `member_of`

Relationships are semantic; they must not be inferred only from physical intersection.

## Geometry references

A smart object may own one or many SketchUp entities. `geometry_refs` must be recoverable through namespaced metadata or a project index. Geometry references are implementation details; loss of one child entity should be detectable by QA rather than silently converting the smart object into raw geometry.

## Catalog reference

```yaml
catalog_ref:
  asset_id: window.generic.sliding_2p
  asset_version: 3
  variant_id: 1800x1200_black
```

A project must retain enough local metadata/geometry to remain usable if the source catalog changes or becomes unavailable.

`Swap Type` preserves semantic construction identity where allowed. `Replace Construction` creates demolition/new lifecycle history.

## Revision metadata

Revision is not phase. Revision metadata records model/drawing issue history without changing lifecycle meaning.

## Object state flags

Recommended runtime states:

- `clean`
- `dirty_geometry`
- `dirty_quantity`
- `dirty_drawing`
- `invalid`
- `orphaned`
- `migration_required`

These are runtime/derived states and should not be confused with construction status.

## Deletion behavior

Production deletion should be explicit:

- deleting a new, unissued object may remove it;
- removing existing construction should normally use `DemolishObject`, not raw deletion;
- commands must resolve or flag incoming relationships;
- destructive deletion of objects with dependencies requires confirmation or deterministic cascading rules.

## Copy behavior

Copy/paste or duplicate must pass through a smart-object duplication policy:

- new semantic ID for new construction instance;
- preserve type/catalog reference;
- re-evaluate host/connector relationships;
- preserve or reset phase according to active working phase and command intent;
- never duplicate hidden stable IDs accidentally.

## Persistence namespace

Core envelope keys belong to `constructflow.core`. Domain payloads belong to owner namespaces. No domain module writes private fields into another domain namespace.

## Migration

Every object type with persisted domain data must declare migrations between supported schema versions. Migration cannot rely on geometry-only heuristics if stable metadata is available.

## Validation baseline

Every loaded smart object is validated for:

- stable ID;
- registered type and owner module;
- supported schema version;
- valid phase references;
- valid level references where required;
- resolvable required relationships;
- geometry ownership/reference integrity;
- catalog reference compatibility where applicable.

## Foundation acceptance

The first production proof must demonstrate that a smart object can be created, saved in `.skp`, SketchUp closed, model reopened, and the same object ID/type/phase/level/domain payload recovered without manual reconstruction.