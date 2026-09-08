# Phase, Level and Revision Model

These are separate axes and must never be collapsed into one tag system.

## 1. Construction lifecycle

ConstructFlow uses object lifecycle rather than maintaining separate SKP files for existing, demolition and proposed work.

Base phases:

```text
01 Existing
02 Demolition
03 New Construction
```

Preferred common fields:

```text
created_phase
removed_phase
```

Derived states include:

- Existing to remain
- Existing to demolish
- Existing to modify
- New
- Replaced
- Relocated

### Example: existing wall remains

```text
created_phase: existing
removed_phase: null
```

### Example: existing wall demolished

```text
created_phase: existing
removed_phase: demolition
```

### Example: new wall

```text
created_phase: new_construction
removed_phase: null
```

## 2. Phase views

The same model generates different views:

### Existing view

Shows original site/building state before demolition.

### Demolition view

Shows retained existing work plus highlighted demolition scope. New work is normally hidden.

### Proposed view

Shows retained existing work plus new construction. Demolished work is hidden.

### Coordination view

Can show existing, demolition and new simultaneously with visual overrides for clash/coordination work.

## 3. Modify existing

Partial modifications must not require marking an entire host object demolished.

Examples:

- cut a new door opening in an existing wall
- remove only part of an existing eave
- modify a drain connection
- cut a new penetration through an existing slab

A modification command may create a demolition region/sub-object while retaining the parent object identity.

## 4. Relocate / replace

Relocation of existing construction is modeled as lifecycle change, not raw movement.

Example: relocate an existing manhole.

```text
EX-MH-01
created: existing
removed: demolition

N-MH-01
created: new_construction
removed: null
replaces: EX-MH-01
```

Affected network segments are rerouted and revalidated.

`Swap Type` is different from `Replace Construction`:

- Swap Type: same construction object, different catalog/type selection.
- Replace Construction: old construction is removed and a new lifecycle object is created.

## 5. Project datum

Every project has a benchmark/datum. Raw SketchUp Z values are implementation coordinates; semantic levels are project data.

Representative level types:

- BM — Benchmark
- GL — Ground Level
- FFL — Finished Floor Level
- SSL/TOS — Structural Slab / Top of Slab
- TOB — Top of Beam
- BOB — Bottom of Beam
- TOF — Top of Footing
- BOF — Bottom of Footing
- PCL — Pile Cut-off Level
- IL — Invert Level
- CL — Cover Level

Example project levels:

```text
House FFL       +0.450
Extension FFL   +0.430
Parking          +0.050
Landscape        ±0.000
Existing ground -0.100
Pile cut-off     -0.800
```

## 6. Level references

Objects reference semantic levels plus offsets.

Example door:

```text
base_level: house_ffl
base_offset: 0
```

Example ground beam:

```text
top_level: extension_ssl
top_offset: 0
height: 400
```

Example drainage pipe:

```text
start_invert_ref: explicit
start_il: -0.320
end_il: -0.450
```

Changing a referenced level invalidates dependent geometry/quantities/drawings and triggers validators.

## 7. Surface levels

External surfaces can define:

- level plane
- start/end slope
- control/spot points
- target drain

A parking slab, garden path or tiled terrace may therefore be non-horizontal and use drainage-aware geometry.

## 8. Floor build-up

Finish level and structural level are distinct.

Example:

```text
FFL +0.450
Tile        10 mm
Adhesive     5 mm
Screed      35 mm
SSL +0.400
RC slab    120 mm
```

Assemblies may define whether thickness changes preserve FFL, SSL or another reference.

## 9. Revision is not phase

Revision tracks document/model change history; construction phase describes lifecycle.

Example:

```text
phase: new_construction
revision: 03
```

Suggested revision statuses:

- Draft
- For Review
- For Approval
- For Construction
- Site Revision
- As-Built

## 10. Required foundation behavior

- phase is stored independently from SketchUp tag/layer organization
- level references are stable IDs, not display-name strings only
- revision metadata never changes lifecycle automatically
- derived views can be regenerated from one project model
- downstream quantity and drawing outputs know when lifecycle/level changes make them stale
