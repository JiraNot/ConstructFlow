# Documentation and Architecture Governance

Status: Accepted foundation contract.

## Purpose

ConstructFlow is a modular platform with long-lived project files. Governance exists to prevent a fast prototype or one domain module from silently changing contracts that other modules depend on.

## Ownership

- **Core Kernel** owns identity, persistence envelope, units, phases, levels, transactions, registries and shared buses.
- **Domain modules** own their domain logic, geometry generation, formulas, validators and domain-specific parameters.
- **Platform services** consume normalized contracts; they must not duplicate domain formulas.
- **Documentation** under `docs/` owns the authoritative behavior description.

## Required review for contract changes

The following changes require an ADR or explicit architecture-document update in the same pull request:

- persisted smart-object envelope changes;
- new lifecycle or phase semantics;
- unit conventions or rounding semantics;
- cross-module connector types;
- command/event envelope changes;
- module dependency direction changes;
- library identity/version semantics;
- quantity normalization changes;
- drawing representation contracts;
- AI privilege/boundary changes.

## Dependency policy

1. Core cannot depend on a domain module.
2. Domain modules may depend on Core/Contracts/Module SDK.
3. Domain modules must not hard-call sibling domain modules for optional coordination behavior.
4. Cross-domain coordination uses events, connectors, capabilities or shared contracts.
5. Reporting/output services consume domain providers; domains do not require BOQ or Drawing services to function.
6. Circular module dependencies are prohibited.

## Data ownership

Every persisted field has one owner. A module may read another module's public contract but must not mutate another module's private namespace directly.

Recommended namespaces:

- `constructflow.core.*`
- `constructflow.<module>.*`
- `constructflow.library.*`

## Schema evolution

Persisted object or module schemas are versioned. Breaking changes require a migration path. Project files must not depend on an online catalog being available to remain readable.

Migration rules:

- migration must be deterministic;
- migration must be idempotent or guarded by schema version;
- failed migration must not silently discard object data;
- project backup/recovery must be possible before destructive migration;
- migration behavior must be covered by regression tests.

## Documentation PR checklist

A pull request that changes product behavior should answer:

- Which authoritative document changed?
- Which object/command/event IDs are affected?
- Does persisted data change?
- Does a migration exist?
- Does phase or level behavior change?
- Are quantity/drawing outputs affected?
- Are acceptance criteria and tests updated?

## Definition of Done

A feature is not complete only because geometry appears correct. For production-capable smart objects, Definition of Done includes applicable metadata, lifecycle, persistence, undo/redo, relationships, quantities, drawing invalidation, QA, tests and documentation.

## No hidden architecture

Important architecture decisions must not exist only in chat history, developer memory, source comments, or AI prompts. They must be promoted into `docs/` before they become binding behavior.