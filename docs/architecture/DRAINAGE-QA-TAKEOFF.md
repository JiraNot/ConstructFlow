# Drainage QA and Project Takeoff

Status: Accepted v1 foundation contract.

## Purpose

Drainage changes must be inspectable as construction data, not only visible geometry. This contract defines project-level QA and phase-aware quantity aggregation from the same semantic Drainage Smart Objects used by routing and drawings.

## Network audit

`AuditDrainageNetwork` is non-mutating and evaluates all `constructflow.drainage` Smart Objects.

For pipe routes it reports:

- DrainageValidator slope/invert/definition issues;
- missing topology connections referenced by a route;
- route definition vs ConnectorRegistry connection mismatch;
- connector endpoint mismatch;
- known structural clashes through the public `structure.coordination` boundary.

For manholes it reports semantic definition/validation issues.

Unknown invert remains a warning/Verify On Site condition. It must not be converted into a passing result.

Audit status is `clear`, `warning`, or `error` according to the collected issues. Every issue carries Smart Object ID/type and rule ID; clash issues also carry evidence.

## Project takeoff

`BuildDrainageTakeoff` aggregates existing domain-owned quantity records rather than recalculating pipe/manhole meaning in a generic BOQ layer.

Items come from `DrainageQuantityProvider` and are grouped by:

- phase scope;
- classification;
- unit.

Each total retains source Smart Object IDs. Existing objects marked Demolition therefore remain separate from New Construction quantities.

## Change propagation

Routing, route-node editing, relocation and intermediate-manhole insertion already mark affected Smart Objects `dirty_quantity` and `dirty_drawing`. Project audit/takeoff consume the resulting semantic state and do not mutate those objects.

## Acceptance criteria

- AC-DRN-030: project QA reports missing/mismatched route topology and preserves source Smart Object traceability.
- AC-DRN-031: unknown invert remains a QA warning rather than a fabricated compliant slope.
- AC-DRN-032: known structural route clashes are reported using public coordination evidence.
- AC-DRN-033: project takeoff aggregates domain quantity records by phase/classification/unit and preserves contributing Smart Object IDs.
- AC-DRN-034: Demolition and New Construction quantities are never silently combined into one phase total.
