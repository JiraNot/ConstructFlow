# Extension Orchestration v1

`ExtensionDefinition -> Generator -> CoordinationPlan -> Orchestrator -> Domain Commands`

The orchestrator computes dependency-safe execution order and explicit regeneration impact. It never mutates geometry owned by another domain module.

Boundary changes invalidate all enabled extension domains. Roof changes propagate to drainage. Surface changes propagate to drainage and interior coordination. Structure changes propagate to roof, interior and electrical coordination.

Disabled domains are omitted. Dependency cycles are rejected. Regeneration targets are deterministic.
