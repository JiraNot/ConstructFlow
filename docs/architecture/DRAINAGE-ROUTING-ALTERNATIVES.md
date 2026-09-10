# Drainage Routing Alternatives

Status: Accepted v1 foundation contract.

## Purpose

ConstructFlow may propose route alternatives for gravity drainage, but it must not silently route through known structural objects or invent a hidden vertical detour simply to produce a successful-looking result.

This contract extends the Drainage routing modes defined in `docs/modules/DRAINAGE.md`.

## Structural coordination boundary

Drainage consumes the public `structure.coordination` capability. It does not read Structure private repositories or infer structural meaning from arbitrary SketchUp geometry.

Known compatible structural Smart Objects expose coordination bounding boxes. Candidate drainage route segments are evaluated against those bounds before a route is recommended.

## Candidate set v1

The first alternative planner evaluates two deterministic Auto-route candidates:

- `x_first` — orthogonal route with the X leg first;
- `y_first` — orthogonal route with the Y leg first.

Each candidate carries:

- the semantic route plan;
- whether the candidate is clear of known structural bounds;
- every detected clash with segment index, Smart Object ID, object type and bounding box.

## Recommendation rule

If one or more candidates are clear, the first deterministic clear candidate may be recommended.

If all known candidates clash, the result is:

```text
status = manual_intervention_required
requires_manual = true
recommended_id = nil
```

ConstructFlow must not silently select a clashing route.

## Command

`PlanDrainageRouteAlternatives` is a non-mutating Drainage command. It returns its result through the `DrainageRouteAlternativesPlanned` event payload and may emit a user-facing warning when manual intervention is required.

The command does not create geometry, Smart Objects, connectors or connections.

## Limitations of v1

Bounding-box intersection is a conservative coordination test. It can produce false positives where an exact geometric route would clear the object. False positives are acceptable at this stage; false claims of a clear route are not.

The following remain explicit follow-up work:

- offset detours around obstacles;
- left/right clearance candidates with configurable clearance distance;
- vertical/change-level candidates;
- automatic cleanout or intermediate manhole insertion;
- exact solid/mesh clash tests;
- architecture/site obstacle classes;
- cost/risk ranking of alternatives.

## Safety rule

A future route optimizer may rank alternatives, but it must preserve known invert facts, configured gravity constraints and clash evidence. It may not alter those inputs merely to force a route into a passing state.

## Acceptance criteria

- AC-DRN-014: two deterministic orthogonal route candidates can be evaluated against Structure through the public coordination capability.
- AC-DRN-015: a clear alternative is recommended when another candidate clashes with a known structural Smart Object.
- AC-DRN-016: when every generated candidate clashes, no route is recommended and the result explicitly requires manual intervention.
