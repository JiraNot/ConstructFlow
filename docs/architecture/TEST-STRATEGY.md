# Test Strategy

Status: Accepted foundation contract.

## Goal

ConstructFlow manipulates long-lived design and construction data inside SketchUp. Tests must protect semantic data, geometry behavior, module boundaries, migrations and outputs — not only UI rendering.

## Test pyramid

### 1. Pure domain unit tests

Fast tests without SketchUp where possible:

- phase lifecycle derivation;
- level dependency math;
- connector compatibility;
- route/slope calculations;
- quantity formulas;
- paving layout math;
- cabinet split/clearance rules;
- catalog compatibility;
- schema migration transforms;
- command validation.

Domain logic should be isolated from SketchUp API enough to maximize these tests.

### 2. Contract tests

Verify every module against shared contracts:

- manifest validity;
- command registration;
- event version compatibility;
- quantity provider output schema;
- drawing provider output schema;
- validator registration;
- connector types;
- data namespace ownership.

### 3. SketchUp integration tests

Run inside or against a supported SketchUp test harness where feasible:

- extension loads without errors;
- operations create intended Group/Component/Face/Edge structures;
- smart-object metadata attaches to correct entities;
- save/close/reopen persistence;
- Undo/Redo restores geometry and metadata together;
- copy/paste does not duplicate stable IDs incorrectly;
- deletion/orphan behavior;
- HtmlDialog bridge contracts.

### 4. Golden project regression tests

Maintain small `.skp` fixtures representing real workflows. Each fixture has expected semantic object counts, relationships, phases, levels and key quantities.

Initial fixtures should include:

1. existing room + new opening;
2. kitchen extension over/near existing drain;
3. relocated manhole and rerouted pipe;
4. carport with steel roof/fascia/gutter;
5. curved paving with border;
6. three-bay parking surface;
7. simple piled foundation + ground beams;
8. wardrobe with swing/glass fronts and drawers.

Where binary fixture management becomes difficult, also keep machine-readable expected-state snapshots.

### 5. Drawing/output regression

Verify semantic output before visual pixel comparison:

- required views exist;
- correct phase filter;
- expected tags/schedule rows;
- expected source-object references;
- drawing dirty/clean transitions;
- exported file generation succeeds.

Visual/screenshot regression can supplement, not replace, semantic checks.

## Core invariants

Tests must permanently protect these invariants:

1. Smart-object stable ID survives save/reopen.
2. Existing/Demolition/New lifecycle is independent from tags/layers.
3. Revision never rewrites lifecycle semantics.
4. Domain modules do not mutate sibling private namespaces.
5. AI and UI use the same command path.
6. A rejected command leaves no partial semantic/geometry mutation.
7. Undo restores semantic data and geometry together.
8. Project remains readable if external catalog is unavailable.
9. Quantity lines are traceable to source objects/formula versions.
10. Dirty drawings cannot be silently treated as current.

## Migration tests

For every persisted schema migration:

- fixture at old schema version;
- run migration;
- verify new schema;
- verify geometry references retained;
- verify IDs retained unless migration explicitly changes identity;
- run migration again or confirm guard prevents duplicate mutation;
- validate no private data loss;
- save/reopen migrated project.

## Command tests

Every command should cover:

- valid execution;
- invalid input rejection;
- phase constraints;
- host/connector incompatibility;
- Undo/Redo;
- event emission;
- dirty-state effects;
- idempotency/retry where relevant;
- AI permission policy.

Example `RelocateManhole` scenarios:

- relocation with valid slope;
- insufficient slope;
- unknown existing invert;
- route blocked by structure;
- multiple upstream connections;
- cancel/rollback;
- Undo after commit.

## Geometry robustness tests

Parametric geometry generators must include edge cases:

- zero/near-zero dimensions rejected;
- reversed path direction;
- concave boundaries;
- curved boundaries;
- nested holes/islands;
- small residual paving cuts;
- roof intersections/junctions;
- cabinet fit near columns/openings;
- unit conversion round trips.

## Performance tests

Track representative metrics:

- extension boot time;
- smart-object load/index time by object count;
- event/dirty propagation time;
- paving generation time by piece count;
- cabinet part-generation time;
- save/reopen time;
- memory growth for LOD-heavy objects.

Performance budgets can be tightened after initial measurements, but regressions should be visible in CI/dev diagnostics.

## Test isolation

A module's pure tests should not require unrelated domain modules. Cross-domain behavior belongs in integration/coordination tests using public contracts.

## Manual acceptance tests

SketchUp interaction requires some manual validation. Maintain concise scripts for:

- tool inference/snap feel;
- direct manipulation handles;
- sidebar/property behavior;
- phase visibility;
- library drag/place/swap;
- LayOut/document export.

Manual steps should correspond to automated acceptance IDs where possible.

## CI baseline

As the repository gains runnable packages, CI should at minimum execute:

- schema validation;
- Ruby lint/tests;
- TypeScript lint/typecheck/tests;
- pure domain tests;
- documentation link/spec checks;
- module manifest contract tests.

SketchUp-dependent tests may initially run on a dedicated/local runner if licensing/runtime constraints make hosted CI unsuitable.

## Definition of tested

A feature is not considered implemented until its Acceptance Criteria have passing evidence at the appropriate test layers. A screenshot of correct geometry alone is not sufficient evidence for a smart production object.