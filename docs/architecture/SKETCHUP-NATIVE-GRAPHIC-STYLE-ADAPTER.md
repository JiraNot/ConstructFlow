# SketchUp Native Graphic Style Adapter

Status: Accepted v1 foundation contract.

## Purpose

Translate renderer-neutral ConstructFlow plan graphic style intent into native SketchUp display capabilities without moving domain drawing semantics into SketchUp-specific code.

The upstream style contract remains `PLAN-GRAPHIC-STYLES.md`.

## Boundary

Input:

```yaml
style_id: phase_demolition
stroke_pattern: dash
line_weight: medium
color_key: demolition
emphasis: foreground
```

Output may use native SketchUp constructs such as:

- Tags/Layers;
- Tag line styles/dashes when supported by the running SketchUp version;
- Tag colors when supported;
- generated entity metadata for traceability.

The adapter must not change Smart Object identity, phase, parameters or domain meaning.

## Tag strategy

Native style tags are generated deterministically from resolved style intent using the prefix:

```text
CF-STYLE-...
```

Examples:

```text
CF-STYLE-RAINWATER-DASH-NORMAL
CF-STYLE-DEMOLITION-DASH-FOREGROUND
CF-STYLE-VERIFY-DASHDOT-WARNING
```

These style tags are subordinate to the managed drawing scene/group. They exist to carry native visual properties, not to become the source of truth for discipline or phase.

## Native line style mapping

`stroke_pattern` is mapped by capability and name matching:

- `solid` -> native default/no dash override;
- `dash` -> first available native dash-like line style;
- `dash_dot` -> first available dash-dot/center-like line style;
- `dot` -> first available dotted line style.

If the SketchUp version does not expose line-style APIs, rendering must still succeed. Renderer-neutral style metadata remains authoritative for later LayOut/export adapters.

## Color mapping

`color_key` maps to a conservative adapter-owned RGB palette. Tag color is set when supported.

The adapter must not force global Color by Tag/Layer rendering on the model because that is a project/view preference. A scene/export adapter may explicitly enable such a display mode later if its SSOT contract requires it.

Initial keys include:

- foreground;
- waste;
- soil;
- rainwater;
- drainage_node;
- existing;
- new_work;
- demolition;
- verify.

## Line weight limitation

SketchUp does not provide a reliable per-generated-edge construction drawing lineweight contract equivalent to LayOut/vector output.

Therefore `line_weight` remains persisted as renderer-neutral/native adapter metadata. A future LayOut/vector export adapter owns physical print lineweight mapping.

Do not simulate lineweight by duplicating or offsetting geometry.

## Failure behavior

Native styling is best-effort and capability-based.

A missing or incompatible native display API must not prevent semantic plan generation. The adapter may skip that native property while preserving:

- generated geometry;
- semantic graphic-style metadata;
- Smart Object traceability.

## Traceability

Generated entities retain both renderer-neutral and native mapping metadata.

Native adapter metadata includes, where applicable:

```text
native_applied
tag_name
line_style
color_rgb
requested_line_weight
requested_pattern
```

## Acceptance criteria

1. A styled plan primitive can be assigned a deterministic `CF-STYLE-*` tag.
2. A dash intent maps to a native line style when the API/candidate exists.
3. A known color key maps to a tag color when supported.
4. Native adapter failure does not block plan generation.
5. Native styling does not mutate Smart Object lifecycle or domain definitions.
6. Renderer-neutral line weight remains available for LayOut/export even when SketchUp cannot express it natively.
