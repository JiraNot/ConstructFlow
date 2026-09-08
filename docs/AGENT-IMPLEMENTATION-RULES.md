# Coding Agent Implementation Rules

Status: Accepted process contract.

This file is the mandatory operating brief for Codex, Claude, Devin or any other coding agent working on ConstructFlow.

## Before changing code

Read in this order:

1. `docs/README.md`
2. `docs/MASTER-BLUEPRINT.md`
3. relevant module spec under `docs/modules/`
4. relevant architecture contracts under `docs/architecture/`
5. `docs/decisions/`
6. relevant acceptance criteria/tests.

If implementation intent conflicts with docs, do not silently follow the prompt. Surface the conflict and update/propose the authoritative specification in the same change.

## Hard architecture rules

1. Do not add domain behavior to Core unless the behavior is genuinely cross-domain infrastructure.
2. Do not mutate another module's private namespace.
3. Do not directly call a sibling module's private implementation for optional behavior.
4. Use registered commands for semantic mutations.
5. Emit/consume events for decoupled propagation.
6. Use public capabilities/hosts/connectors for cross-domain integration.
7. Domain modules own their quantity formulas, drawing representations and validators.
8. One semantic model represents Existing/Demolition/New; do not create separate phase-model logic.
9. Revision is not phase.
10. AI uses the same command surface as human UI.
11. Do not make full physical geometry a prerequisite when semantic/LOD representation is sufficient.
12. Persist stable ConstructFlow IDs; never use SketchUp entity ID as sole identity.

## Feature implementation checklist

Before coding, identify:

- owner module;
- object type(s);
- command(s);
- event(s);
- phase behavior;
- level behavior;
- host/connector relations;
- persistence/schema version;
- quantity impact;
- drawing impact;
- QA rules;
- library/catalog behavior;
- LOD/performance strategy;
- acceptance criteria.

If any required item is undefined, update the spec instead of inventing an undocumented local convention.

## SketchUp mutation rule

All production geometry mutation must be tied to a semantic command/transaction. A failed command must roll back both geometry and metadata.

Interactive tools may preview temporary geometry, but commit only through the domain command path.

## UI rule

React/HtmlDialog code is presentation/orchestration only. Business formulas, phase rules, quantity formulas and geometry semantics belong in domain/Core layers.

## Data migration rule

When changing persisted data:

- increment relevant schema version;
- add deterministic migration;
- add old-version fixture/regression test;
- preserve unknown sibling namespaces;
- document breaking behavior/ADR if cross-module.

## Testing rule

Implementation PR must map tests to acceptance criteria. Geometry screenshots alone are insufficient.

At minimum for smart-object changes consider:

- create;
- edit;
- invalid edit rollback;
- Undo/Redo;
- save/reopen;
- phase behavior;
- level behavior;
- copy/duplicate identity;
- quantity dirty/update;
- drawing dirty/update;
- missing dependency/module behavior.

## AI-generated code rule

Generated code is not exempt from module boundaries, tests or migration requirements. Agents must not optimize for passing a narrow demo by bypassing architecture contracts.

## Scope rule

`ROADMAP.md` determines sequence, not deletion. A deferred feature remains part of Master Blueprint unless an accepted spec/ADR removes it.

## Completion report

When handing off implementation, report:

- files changed;
- spec/acceptance IDs implemented;
- tests run/results;
- migrations added;
- known limitations/deferred items;
- any architecture decision still open.

This makes repository state understandable without relying on prior chat context.