# Drainage Clearance Offset Detours

Status: Accepted v1 foundation contract.

## Purpose

When a deterministic Auto route intersects a known structural coordination bound, ConstructFlow may propose horizontal clearance detours instead of stopping at only `x_first` / `y_first`. The planner remains proposal-only and must never hide clash evidence or silently mutate known invert facts.

## Command

`PlanDrainageClearanceDetours` is non-mutating. It consumes semantic connector positions, known endpoint invert facts, configured minimum slope and a positive `clearance_mm` value.

## Candidate generation

The first implementation takes the first known structural clash and generates four deterministic horizontal detour families around its coordination bounding box:

- below;
- above;
- left;
- right.

Each route passes intent anchors outside the obstacle bound by the requested clearance and is then evaluated through the same public `structure.coordination` clash boundary used by other Drainage route alternatives.

Clear candidates are ranked by horizontal length and deterministic ID. The shortest clear candidate is recommended.

## Safety behavior

- A clear baseline is returned unchanged.
- Known endpoint inverts are preserved.
- Unknown endpoint invert remains subject to the established routing Verify On Site rules.
- If every generated offset candidate still clashes, the planner returns `manual_intervention_required` and does not select a route.
- Bounding-box clearance is conservative coordination, not exact structural geometry proof.

## Deferred

- chaining detours around multiple independent obstacles;
- exact solid/mesh clearance;
- vertical/change-level routing;
- code-aware minimum clearances by pipe/system;
- cost/risk scoring beyond route length;
- automatic commit of the recommended candidate.

## Acceptance criteria

- AC-DRN-026: a structural clash can generate deterministic above/below/left/right clearance candidates from semantic obstacle bounds.
- AC-DRN-027: only a candidate that passes coordination evaluation may be recommended.
- AC-DRN-028: a clear baseline is not needlessly rerouted.
- AC-DRN-029: if all offset candidates clash, no route is selected and manual intervention is explicit.
