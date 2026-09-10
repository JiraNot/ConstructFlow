# Drawing View Presets

Status: Accepted v1 foundation contract.

## Purpose

A Drawing View Preset is a named, deterministic request for Smart Object representations. It does not duplicate the model. It configures how the same Smart Objects are represented in a drawing scene.

## Contract

A preset defines at least:

```yaml
id: plumbing.construction
name: Plumbing Plan - Construction
drawing_family: plumbing_drainage_plan
scale: 1:50
phase_view: proposed
lod: construction
tag_name: CF-DRAWING-CONSTRUCTION
scene_name: ConstructFlow - Plumbing Plan - Construction
context:
  style_preset: plumbing.construction
```

The preset is passed through the Representation Registry to domain-owned providers. Renderers must not invent domain meaning.

## Standard plan profiles

Plan families use three foundation profiles unless a domain contract explicitly requires another profile:

- `simple`: 1:100, coordination phase view, simple LOD;
- `construction`: 1:50, proposed phase view, construction LOD;
- `coordination`: 1:50, coordination phase view, coordination LOD.

Registered foundation plan families are:

- `plumbing.*` → `plumbing_drainage_plan`;
- `architecture.*` → `architecture_plan`;
- `structure.*` → `structure_plan`;
- `roof.*` → `roof_plan`;
- `surface.*` → `surface_paving_plan`;
- `interior.*` → `interior_joinery_plan`;
- `electrical.*` → `electrical_plan`.

Architecture additionally registers `architecture.demolition`: 1:50, demolition phase view, construction LOD. It exists for explicit renovation/attachment work that modifies Existing construction and must not be inferred merely because an Extension touches an Existing building.

The original plumbing managed tags remain `CF-DRAWING-SIMPLE`, `CF-DRAWING-CONSTRUCTION`, and `CF-DRAWING-COORDINATION` for compatibility. Other families use fully qualified managed tags such as `CF-DRAWING-ARCHITECTURE-CONSTRUCTION`; the demolition preset uses `CF-DRAWING-ARCHITECTURE-DEMOLITION` so parallel scene families cannot collide.

## Phase filtering

Scene generation filters Smart Objects by lifecycle before requesting a representation.

- existing: existing objects not removed in demolition;
- demolition: Existing objects plus explicitly modeled semantic actions that declare they modify Existing construction;
- proposed: existing-to-remain plus new construction;
- coordination/all: all relevant lifecycle states.

A semantic object that persists into Proposed work may still represent a partial demolition action in a demolition view. Example: a new `opening.rectangular` remains a New Construction Smart Object because the resulting void persists, while its explicit `modifies_existing_host` relationship allows its demolition-cut representation to appear in the demolition plan. This does not change the Smart Object lifecycle.

Renderer-neutral primitives/annotations may declare `lifecycle_role` when a particular representation action has a different drawing-phase meaning from the source object envelope. Registered lifecycle roles use the same accepted lifecycle style keys (`existing`, `new_construction`, `demolition`). This override is drawing intent only; it must never rewrite Smart Object phase metadata.

Phase is independent from discipline/category and revision.

## Drawing family filtering

A scene may request a drawing family. A normalized representation whose metadata declares a different drawing family is not rendered into that scene. This prevents a generic Plan Scene service from mixing unrelated plan outputs simply because they all implement `plan`.

## Idempotency and traceability

Refreshing a preset updates its managed SketchUp output group instead of creating a second drawing identity. The group stores preset ID, scale, phase view, LOD, drawing family and source Smart Object IDs.

Preset registration itself is idempotent. Installing the standard registrations more than once must not duplicate or redefine an existing preset identity.

## Extension rule

New domain presets register through the preset registry. Do not hardcode semantic styling into the SketchUp renderer. Scale/LOD-dependent simplification belongs to the domain Representation Provider or a documented drawing-style contract.
