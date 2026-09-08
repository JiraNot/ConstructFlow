# Module Specification Template

Use this template for every production domain or platform module. Module specs are binding once marked Accepted.

---

# `<Module Name>` Module

Status: Draft | Proposed | Accepted | Implemented  
Module ID: `constructflow.<id>`  
Owner: `<team/person>`  
Spec version: `<n>`

## 1. Mission

What construction/design problem does this module own? What is explicitly outside its responsibility?

## 2. Dependencies

### Required

- `constructflow.core`
- `<other required public capability only if truly necessary>`

### Optional capabilities consumed

- `<capability>`

### Capabilities provided

- `<capability>`

Document why each dependency exists. Circular dependencies are prohibited.

## 3. Smart objects owned

For each object:

```text
Object type:
Object registry ID:
Schema version:
Geometry ownership:
Host requirements:
Connector types:
Phase behavior:
Level behavior:
LOD behavior:
Catalog support:
```

List domain parameters and persistence ownership. Do not repeat Core envelope fields.

## 4. Commands owned

For each command:

```text
Command:
Command ID:
Version:
Inputs:
Preconditions:
Validation:
Mutation:
Events:
Undo behavior:
AI allowed:
Confirmation required:
```

## 5. Events

### Emits

- event + conditions

### Consumes

- event + why

A consumed event should update only this module's own derived/domain state.

## 6. Hosts and connectors

Define capabilities/types and compatibility. Include logical vs physical representation rules.

## 7. Geometry strategy

- concept geometry;
- design geometry;
- construction geometry;
- fabrication geometry where applicable;
- direct manipulation handles;
- conversion of legacy SketchUp geometry;
- performance/proxy strategy.

## 8. Phase / demolition / relocation behavior

Document:

- Existing-to-remain;
- Demolish;
- Modify Existing;
- New;
- Relocate/Replace;
- impact on relationships and quantities.

## 9. Level / datum behavior

Which semantic levels are required/optional? Which dimensions follow levels vs geometry? How are offsets persisted?

## 10. Library/catalog behavior

- generic type families;
- parametric vs fixed assets;
- variants;
- swap compatibility;
- replace-construction behavior;
- manufacturer metadata;
- project-safe version policy.

## 11. Quantity provider

List every intended measure, unit, formula basis, waste behavior, preliminary vs calculated state and traceability requirements.

## 12. Drawing provider

List:

- plans;
- elevations;
- sections;
- details;
- schedules;
- tags/annotations;
- scale/LOD representation.

## 13. Validators / QA

List blocking validations, warnings and coordination checks. Distinguish modeling QA from licensed engineering approval.

## 14. User workflows

Reference `WORKFLOW-REGISTRY.md` IDs and describe module-specific steps. Use the universal interaction verbs where possible.

## 15. Acceptance criteria

Use IDs `AC-<MODULE>-###`. Include persistence, Undo/Redo, phase, quantity, drawing and QA criteria where applicable.

## 16. Tests

Map each acceptance criterion to:

- unit test;
- contract test;
- SketchUp integration test;
- golden project regression;
- manual UX acceptance if needed.

## 17. Migration / backwards compatibility

Document object schema migrations and behavior for older projects.

## 18. Non-goals / deferred features

Clearly mark what is intentionally not in the current module phase without deleting it from Master Blueprint scope.

## 19. Open decisions

List unresolved decisions. Important decisions that affect cross-module contracts become ADRs before implementation.

---

## Required rule

A coding agent must not implement a new production module from only a feature list. The module spec must define ownership, data, commands, integration, lifecycle, outputs and acceptance criteria first.