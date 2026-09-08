# ADR-0001 — Modular Monolith with Plugin-Style Domain Modules

Status: Accepted  
Date: 2026-09-08

## Context

ConstructFlow spans architecture, renovation, roofs, structure, landscape, interiors, MEP, quantity takeoff, drawings, QA and AI. A single tightly coupled SketchUp plugin would become difficult to change and test. Full microservices would add deployment/network complexity that is unnecessary for the SketchUp runtime and early product stage.

## Decision

ConstructFlow will use a **modular monolith with plugin-style domain packages**.

- one product/repository/runtime distribution initially;
- small Core Kernel;
- shared Contracts / Module SDK;
- domain behavior isolated in modules;
- platform services consume public providers;
- modules communicate through commands, events, capabilities, hosts and connectors;
- module manifests declare dependencies and provided capabilities;
- modules own their persisted namespaces and migrations.

## Consequences

Positive:

- simple installation/deployment compared with microservices;
- clear domain boundaries;
- modules can be developed/tested incrementally;
- future packaging/licensing of modules remains possible;
- one project model remains coherent;
- easier AI command discovery through one registry.

Costs:

- discipline is required to prevent direct cross-module calls;
- Core/Contracts must remain stable and small;
- module loading/versioning/migration infrastructure is required early.

## Rejected alternatives

### One monolithic plugin namespace

Rejected because changes in one domain would create high regression risk and make ownership/migrations unclear.

### Microservices for each domain

Rejected for foundation stage because most modeling mutations occur inside SketchUp and need local transactions/Undo; network boundaries would add complexity without proportional benefit.

## Rules derived from this ADR

1. Core cannot depend on a domain module.
2. Circular domain dependencies are prohibited.
3. Optional cross-domain behavior uses public contracts/events/capabilities.
4. BOQ/Drawing/QA services do not own domain formulas.
5. A feature with unclear ownership does not default to Core.
6. Future extraction into services is allowed behind stable contracts if justified by scale/collaboration needs.