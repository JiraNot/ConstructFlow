# Extension Orchestration and Regeneration

Status: implementation specification

## Purpose

Turn an Extension Zone into a dependency-aware execution plan. The orchestrator coordinates domain intent generation but never owns another module's private geometry.

## Execution Pipeline

`ExtensionDefinition -> Generator -> CoordinationPlan -> Orchestrator -> Domain Commands -> Events -> Dirty/QA/Output`

## Domain Order

`structure -> surface -> roof -> drainage -> interior -> electrical`

Dependencies must be satisfied before a dependent domain is executed.

## Regeneration

A boundary change invalidates every domain derived from the extension envelope. A roof change invalidates roof and downstream drainage. A surface change invalidates surface, drainage and interior coordination. A structural change invalidates structure and dependent roof/electrical/interior coordination.

## Invariants

- Domain geometry ownership is preserved.
- Disabled domains are omitted from the execution plan.
- Dependency cycles are rejected.
- Regeneration targets are explicit and deterministic.
- Downstream consumers may remain dirty when they are not safely recalculated.
- Update All is orchestration only; domain rules remain in domain modules.

## Acceptance

A 6m x 4m kitchen extension must produce an ordered plan that includes structure, surface, roof, drainage, interior and electrical. Changing the boundary must produce a deterministic invalidation set without regenerating unrelated project objects.
