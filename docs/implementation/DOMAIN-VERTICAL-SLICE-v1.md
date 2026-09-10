# Domain Vertical Slice v1

## Purpose

Provide the first real execution boundary between Extension orchestration and domain-owned generators.

## Contract

`Extension::Orchestrator` produces ordered steps. `ExtensionExecutionEngine` executes those steps through injected handlers.

The engine does not create SketchUp geometry and does not know domain implementation details.

## Lifecycle

```text
ExtensionDefinition
  -> Generator
  -> Orchestrator
  -> ExecutionPlan
  -> ExtensionExecutionEngine
  -> Domain Handler
  -> Smart Object create/update
  -> Events / dirty propagation
```

## Idempotency Requirement

Handlers must resolve the existing Smart Object by stable source relationship before creating geometry. Re-running the same plan must update/regenerate the owned object rather than duplicate it.

## Result Contract

Each step returns:

- `status`
- `command_name`
- `created_object_ids`
- `updated_object_ids`
- `removed_object_ids`
- `warnings`
- `errors`

The complete execution returns `success`, `partial`, `failed`, or `preview`.

## Dependency Policy

A step whose dependencies did not succeed is skipped. Independent branches may continue. The engine reports all step results for UI, diagnostics, QA and future AI feedback.

## Geometry Ownership

The Extension module owns coordination only. Structure owns structural geometry, Roof owns roof geometry, Surface owns paving/surface geometry, Drainage owns pipes/manholes, and Interior owns joinery/furniture geometry.

## Next Slice

Implement the first production handler for Structure, then Roof, using stable Extension source IDs and Smart Object lifecycle updates.
