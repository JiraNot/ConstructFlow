# SketchUp Ruby API Guardrails

Status: SSOT engineering standard
Source: `euphraetes/sketchup-ai-skill` and SketchUp Ruby API documentation.

## Purpose

ConstructFlow uses SketchUp as its geometry host, but domain modules must remain independent of SketchUp mutation details. These rules define the safe boundary between ConstructFlow commands and the SketchUp API.

## 1. Mutation Boundary

- All model mutations MUST execute through ConstructFlow commands.
- A command that mutates the model MUST execute inside the central `TransactionManager`.
- Modules MUST NOT open independent undo operations for the same user action.
- A failed mutation MUST abort the transaction and surface a diagnostic.
- Domain code SHOULD produce semantic intent first and mutate SketchUp entities only in the geometry adapter owned by that module.

## 2. Entity Safety

- Never retain a SketchUp entity reference across an operation without re-validating it.
- Check deletion/validity before reading or mutating an entity obtained from observers, selections, or cached state.
- Prefer stable ConstructFlow Smart Object IDs and persistent attributes over raw SketchUp entity references for domain identity.
- Entity collections MUST be treated as mutable and potentially invalidated after model changes.

## 3. Geometry Safety

- Reject zero-length vectors, degenerate faces, invalid loops, and zero/negative dimensions before creating geometry.
- Use ConstructFlow's unit system and tolerance policy instead of ad-hoc numeric comparisons.
- Geometry adapters MUST validate input and return diagnostics rather than silently creating partial geometry.
- Regeneration MUST remove or replace only geometry owned by the target Smart Object.

## 4. Ownership

- Every generated entity MUST be attributable to a ConstructFlow Smart Object and owner module.
- A module MUST NOT directly rewrite geometry owned by another module.
- Cross-module changes travel through Commands, Events, Capabilities, Connectors, or explicit orchestration plans.
- External/catalog assets MUST preserve catalog identity separately from placed-instance identity.

## 5. Observers

Observers detect changes; they do not perform broad regeneration directly.

Required flow:

```text
SketchUp Observer
  -> validate entity/model state
  -> publish domain event
  -> mark affected Smart Objects dirty
  -> create regeneration plan
  -> execute command transaction
```

Observer callbacks MUST remain small and resilient to deleted entities and partial model state.

## 6. UI / HtmlDialog

- UI code MUST NOT mutate the model directly.
- UI actions dispatch ConstructFlow commands.
- Long-running generation SHOULD provide progress and diagnostics through the application event layer.
- Dialog state is presentation state, not domain state.

## 7. Performance

- Avoid repeated global model scans during generation.
- Prefer Smart Object indexes, owner IDs, and targeted entity collections.
- Batch geometry changes inside one transaction where they represent one user action.
- Regeneration plans MUST be dependency-aware and avoid unrelated modules.

## 8. Error Handling

Every geometry operation should have a predictable failure path:

```text
Validate
  -> Begin Transaction
  -> Mutate
  -> Validate Result
  -> Commit
```

On failure:

```text
Abort
  -> Preserve prior valid state
  -> DiagnosticLog
  -> Event / UI notification
```

Do not rescue an exception and continue with an unknown partial model state.

## 9. Testing

Tests MUST cover semantic/domain logic without requiring SketchUp where possible. SketchUp-dependent adapters MUST have focused integration tests for:

- transaction boundaries
- entity validity/deletion
- geometry validation
- observer event conversion
- Smart Object ownership
- regeneration idempotency

A change is not complete until its tests and CI status are verified.

## 10. ConstructFlow Precedence

This document does not replace ConstructFlow architecture. When an external SketchUp recommendation conflicts with ConstructFlow SSOT, the ConstructFlow architecture wins and the deviation MUST be documented.

The external skill is a reference for SketchUp API safety, not a dependency of the runtime.
