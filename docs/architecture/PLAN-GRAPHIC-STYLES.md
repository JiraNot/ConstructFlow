# Plan Graphic Style Contract

Status: Accepted v1 foundation contract.

## Purpose

ConstructFlow separates semantic drawing content from graphic presentation. Domain Representation Providers decide **what** a plan contains. The Drawing/SketchUp adapter decides **how** that semantic output is presented.

A graphic style must never become a second source of construction truth.

## Normalized lifecycle context

Normalized Representation Registry results expose source lifecycle context alongside provider output:

```yaml
source_lifecycle:
  created_phase: existing|new_construction|null
  removed_phase: demolition|null
  status: active|...
  source_state: confirmed|assumed|unknown|verify_on_site|...
```

This is copied from the Smart Object envelope so renderers can apply lifecycle graphics without asking a domain provider to duplicate lifecycle data.

Provider payload remains authoritative only for domain representation semantics; Core supplies the normalized source lifecycle envelope.

## Style resolution order

Plan graphic style resolves in deterministic layers:

1. default drawing style;
2. domain semantic `style_role` such as `construction_waste` or `drainage_node`;
3. Smart Object lifecycle overlay such as Existing, New Construction or Demolition;
4. item status overlay such as `verify`.

Later layers override conflicting keys from earlier layers.

Example:

```text
construction_rainwater
  -> dashed rainwater convention
  + New Construction
  -> strong new-work emphasis
```

A `verify` annotation may then override color/emphasis to warning while preserving other compatible style intent.

## Canonical style intent

Foundation style fields are renderer-neutral:

```yaml
style_id: phase_new
stroke_pattern: solid|dash|dash_dot
line_weight: light|normal|medium|strong
color_key: foreground|existing|new_work|demolition|verify|waste|soil|rainwater|drainage_node
emphasis: background|normal|foreground|warning
```

These are semantic graphic intents. SketchUp, LayOut, PDF, DWG/DXF or another adapter may map them differently according to platform capabilities and company standards.

Do not put renderer-specific RGB values, pixel widths or SketchUp-only line-style identifiers into domain modules.

## Drainage foundation mappings

Initial semantic roles include:

- `simple_waste`
- `simple_soil`
- `simple_rainwater`
- `construction_waste`
- `construction_soil`
- `construction_rainwater`
- `coordination_waste`
- `coordination_soil`
- `coordination_rainwater`
- `drainage_node`

Initial lifecycle overlays:

- Existing -> light/background intent;
- New Construction -> strong/foreground intent;
- Demolition -> dashed/demolition intent.

Initial status overlay:

- `verify` -> dash-dot/warning intent.

These defaults are configurable drawing conventions, not domain construction rules.

## SketchUp adapter behavior

The SketchUp plan renderer persists resolved graphic style intent on generated entities under its drawing metadata dictionary. This preserves traceability and allows later SketchUp/LayOut style adapters to map semantic intent to available native line/tag/material controls.

Generated entity style metadata must include at least:

- resolved style ID;
- stroke pattern intent;
- line weight intent;
- color key;
- emphasis;
- semantic role;
- source style role;
- status.

The renderer also stores source Smart Object lifecycle values with representation traceability metadata.

## Platform limitation rule

If SketchUp does not provide a reliable per-entity native control for a requested style property, the adapter must preserve the style intent as metadata rather than pretending the visual property was applied.

A later LayOut/PDF/DWG adapter can consume the same style intent and render it using richer drawing controls.

## Acceptance criteria

1. Domain providers can emit semantic `style_role` without renderer-specific values.
2. Core normalized representation output carries source lifecycle context.
3. The drawing style registry resolves domain role + lifecycle + status deterministically.
4. Demolition can override a domain line convention without changing domain data.
5. Verification status can override lifecycle presentation as a warning.
6. SketchUp-generated entities retain resolved style metadata and source lifecycle traceability.
7. Changing graphic standards does not require changing Smart Object construction definitions.
