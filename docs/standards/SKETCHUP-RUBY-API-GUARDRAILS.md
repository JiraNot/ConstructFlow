# SketchUp Ruby API Guardrails

Status: project engineering standard

## Purpose

ConstructFlow is a SketchUp Ruby extension. This document adapts the external `euphraetes/sketchup-ai-skill` guidance into ConstructFlow-specific engineering rules.

Source:
- https://github.com/euphraetes/sketchup-ai-skill
- Main skill: `sketchup_api_skill.md`

The source is used as an engineering reference, not copied into this repository. ConstructFlow's own `docs/` remains the Single Source of Truth for project architecture and implementation decisions.

## Mandatory Rules

### 1. Model mutations must be transactional

Every user-visible model mutation must run inside one SketchUp operation and must abort on failure.

```ruby
model.start_operation('ConstructFlow Action', true)
begin
  # model mutation
  model.commit_operation
rescue StandardError
  model.abort_operation
  raise
end
```

Do not nest operations.

### 2. Observers must not directly mutate the model

Observers are event detection mechanisms. They must not perform unsafe model mutations from callbacks.

Required pattern:

`observer callback -> validate entity -> defer if mutation is required -> command/transaction`

Always re-check entity validity after deferral. Observer lifecycle must be explicitly cleaned up.

### 3. Geometry must be validated

Never trust selections, points, vectors, faces, or imported geometry.

Guard against:
- zero-length vectors
- collinear or degenerate points
- invalid faces
- deleted entities
- invalid host geometry
- floating-point equality assumptions

Use the project geometry tolerance consistently.

### 4. Geometry ownership stays inside domain modules

A coordinator may produce intent and execution plans, but it must not create another module's geometry.

Example:

`Extension Orchestrator -> Roof intent -> Roof module -> Roof geometry`

Not:

`Extension Orchestrator -> SketchUp geometry for Roof`

### 5. Smart Objects are the semantic source

Quantity, drawing, QA, and coordination systems should consume ConstructFlow semantic objects and their references rather than scraping arbitrary SketchUp geometry.

### 6. Cache deliberately

Expensive derived data may be cached, but every cache must have:
- stable identity keys
- an explicit invalidation path
- invalidation tied to the appropriate ConstructFlow event

### 7. Do not use temporary files for model calculations

Use SketchUp API geometry, bounding boxes, transformations, attributes, and semantic data instead of exporting temporary files merely to calculate quantities.

### 8. Modern UI only

Use `UI::HtmlDialog` for ConstructFlow web-based UI. Do not introduce deprecated `UI::WebDialog` patterns.

### 9. Namespace everything

All extension code belongs under `JiraNot::ConstructFlow` or a child namespace. Do not add global helper methods/classes.

### 10. Tests must include SketchUp failure modes

Every geometry-facing feature should consider:

- empty model
- single entity
- many entities
- degenerate geometry
- deleted entities
- undo/redo
- pre-selection
- no selection
- repeated regeneration
- stale references

Pure domain logic may use normal Ruby unit tests; SketchUp API behavior should also be covered by in-application tests where required.

## ConstructFlow-Specific Review Gate

Before merging SketchUp-facing code, reviewers should verify:

- [ ] model changes are inside a transaction
- [ ] observers do not mutate the model directly
- [ ] deleted entities are guarded
- [ ] geometry inputs are validated
- [ ] domain ownership is preserved
- [ ] Smart Object identity is preserved through regeneration
- [ ] dirty propagation is explicit
- [ ] no temporary-file calculation path exists
- [ ] UI uses HtmlDialog where applicable
- [ ] tests cover failure and regeneration paths

## Important Compatibility Note

The external skill recommends a conventional SketchUp loader/main split and cautions against `require_relative` in plugin loaders. ConstructFlow currently has a runtime-oriented `main.rb` and must not be refactored mechanically just to match the external layout.

Any loader/runtime refactor must be specified in ConstructFlow SSOT first and validated against the existing module loader, boot sequence, CI, and Extension Warehouse packaging requirements.

## Relationship to SSOT

`docs/` remains authoritative for ConstructFlow architecture.

This document records the SketchUp API safety constraints that implementation work must respect. When a conflict exists:

1. SketchUp API/runtime correctness wins over convenience.
2. ConstructFlow architecture SSOT defines ownership and module boundaries.
3. External guidance is treated as a reference and must be validated against the current SketchUp API and ConstructFlow runtime.
