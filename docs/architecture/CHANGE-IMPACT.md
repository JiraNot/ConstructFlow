# Change Impact and Propagation Contract

Status: Accepted foundation contract.

## Principle

A ConstructFlow edit is not only a geometry move. Smart-object changes propagate to known dependents through semantic relationships, events and dirty-state invalidation.

## Impact classes

- Geometry impact
- Lifecycle/phase impact
- Level/datum impact
- Host/connector impact
- Quantity impact
- Drawing/schedule impact
- QA/coordination impact
- Catalog/specification impact
- Fabrication impact

## Change pipeline

```text
Command validates
→ owner-domain state/geometry mutation
→ owner-domain derived state updated
→ events published
→ subscribers invalidate/recalculate own state
→ UI reports dirty/errors/warnings
```

## Propagation rule

The source module must not implement every downstream reaction. It publishes sufficient events/relationships for subscribers to own their consequences.

## Examples

### Extension width change

Possible impact:

- Architecture wall/floor boundary;
- Roof boundary/framing intent;
- Structure layout check;
- fascia/gutter length;
- Interior fit;
- Surface interface;
- quantities;
- drawings;
- QA.

### Move manhole

Possible impact:

- drainage topology/route/inverts;
- old/new lifecycle;
- structure clash checks;
- surface slope/drain relation;
- demolition/new quantities;
- drainage/site drawings.

### Change FFL

Possible impact:

- hosted walls/doors;
- slab/finish build-up;
- steps/ramps;
- thresholds;
- drains/pipe inverts;
- cabinet base/ceiling fit;
- drawings/levels.

## Dirty states

Subsystems should mark stale outputs before expensive recalculation when appropriate:

- dirty_geometry
- dirty_quantity
- dirty_drawing
- validation_pending
- fabrication_dirty

Users must be able to see when outputs are stale.

## Update All

A top-level `Update All` orchestration can run pending recalculations in dependency-safe order, but it does not replace independent provider ownership.

## Preview impact

High-impact commands should preview consequences when practical, especially:

- level moves;
- demolition/replacement;
- manhole relocation;
- catalog swap requiring host resize;
- extension boundary changes with many dependents.

## Failure behavior

If one dependent recalculation fails:

- preserve valid source-domain commit unless command transaction explicitly required atomic cross-domain validation;
- mark dependent subsystem error/dirty;
- surface actionable issue;
- do not silently use stale result as current.

## Acceptance principle

If a known relationship exists but the user must manually discover and repair every downstream consequence after ordinary edits, propagation for that workflow is incomplete.