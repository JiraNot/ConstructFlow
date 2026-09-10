# Extension Demolition Plan

Status: Accepted v1 foundation contract.

## Purpose

Define how the Extension Construction Workflow documents a deliberate partial modification to Existing architecture without incorrectly demolishing or replacing the entire host wall.

The first supported case is an explicit Extension attachment Opening through an Existing Architecture Smart Wall.

## Semantic rule

A modified Existing wall remains an Existing Smart Object unless the whole wall is explicitly demolished or replaced. A new hosted Opening may persist into Proposed construction while still representing demolition work at the cut location.

Therefore:

- the host `architecture.wall` remains Existing;
- the generated `opening.rectangular` remains New Construction because the resulting void persists;
- the Opening carries an explicit `host` relationship with role `modifies_existing_host`;
- the demolition representation marks the cut as demolition drawing intent without rewriting source lifecycle metadata;
- demolition quantity is provided by the Opening quantity provider and is scoped to Demolition when the host is Existing.

This implements the product rule: modified wall opening = wall retained; only the affected region/void changes.

## Drawing preset

The Drawing platform registers:

`architecture.demolition`

with:

- drawing family: `architecture_plan`;
- scale: `1:50`;
- phase view: `demolition`;
- LOD: `construction`;
- managed tag: `CF-DRAWING-ARCHITECTURE-DEMOLITION`.

The standard proposed Architecture sheet remains `architecture.construction`.

## Phase visibility

A demolition scene includes:

1. Existing Smart Objects in the selected Architecture context; and
2. semantic objects that explicitly declare `modifies_existing_host`.

Ordinary New Construction objects remain hidden from the demolition scene.

Attachment presence alone is not sufficient. The explicit host-modification relationship is created only by the accepted opt-in Extension Attachment Opening workflow.

## Representation lifecycle role

A renderer-neutral primitive or annotation may carry:

```yaml
lifecycle_role: demolition
```

when the drawing action represents a partial demolition even though the source Smart Object has another lifecycle.

`PlanGraphicStyleRegistry` resolves this representation-item lifecycle role before falling back to the source Smart Object lifecycle, allowing the demolition cut to use the accepted demolition graphic style.

This field is drawing intent only. It must not:

- mutate `created_phase` or `removed_phase`;
- create a duplicate demolition Smart Object;
- be used to bypass lifecycle/quantity semantics.

## Construction issue-set behavior

For an Extension with a generated attachment Opening that modifies an Existing host, the construction issue set includes:

- `A-100` — `architecture.demolition`;
- `A-101` — `architecture.construction`.

`A-100` is conditional. It is not generated merely because the Extension has an attachment host or because the project contains Existing walls.

If there is no explicit Existing-host modification in the selected Extension scope, Architecture continues to issue only the normal proposed/construction sheet.

Both sheets use the same semantic Architecture/Opening objects and the normal scene refresh/currentness/settlement pipeline. No separate demolition model is created.

## Scope isolation

The demolition sheet follows the selected Extension's Architecture context rules:

- ordinary project Architecture/Opening/DoorWindow context may remain visible;
- generated Architecture/Opening/DoorWindow objects belonging to another Extension must not leak into the selected issue set;
- the conditional A-100 trigger is evaluated only from the selected Extension's generated objects.

## Publication safety

Native LayOut/PDF publication must settle and currentness-check the demolition scene exactly like every other requested issue-set scene. A missing, stale or mismatched `architecture.demolition` refresh blocks publication when drawings are required.

## Acceptance criteria

- AC-CWF-023: an explicit Extension Opening through an Existing host adds `A-100 architecture.demolition` before `A-101 architecture.construction`.
- AC-CWF-024: attachment-host presence without an explicit Existing-host modification does not create a demolition sheet.
- AC-DRAW-012: `architecture.demolition` is a deterministic 1:50 demolition-phase construction-LOD preset with its own managed drawing tag.
- AC-DRAW-013: an explicit `modifies_existing_host` semantic object is admitted to demolition view while unrelated New Construction remains hidden.
- AC-DRAW-014: a representation-item `lifecycle_role: demolition` receives demolition graphic intent without mutating the source Smart Object lifecycle.
- AC-OPEN-017: an Extension attachment Opening on an Existing host emits demolition-plan primitives/annotations with demolition lifecycle drawing intent and remains visible in Proposed output as the same Smart Object.
