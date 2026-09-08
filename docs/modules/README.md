# ConstructFlow Module Specifications

Detailed module specs are Proposed until implementation evidence satisfies their acceptance criteria. Cross-module architecture contracts in `../architecture/` remain authoritative when there is a conflict.

## Core / domain modules

- `CORE.md`
- `SITE.md`
- `ARCHITECTURE.md`
- `OPENING.md`
- `DOOR-WINDOW.md`
- `DECORATIVE.md`
- `EXTENSION.md`
- `ROOF.md`
- `STRUCTURE.md`
- `SURFACE.md`
- `LANDSCAPE.md`
- `INTERIOR.md`
- `ELECTRICAL.md`
- `PLUMBING.md`
- `DRAINAGE.md`

## Platform services

- `LIBRARY.md`
- `QUANTITY-COSTING.md`
- `DRAWING.md`
- `QA-REVISION.md`

## Supporting documents

- `DOMAIN-MODULES-v1.md` — complete responsibility/ownership map.
- `MODULE-SPEC-TEMPLATE.md` — required structure for future module specifications.

## Rule for adding a module

A new module spec must define ownership, dependencies, smart objects, commands, events, hosts/connectors, phase/level behavior, LOD, catalog behavior, quantities, drawings, validators, acceptance criteria and tests before production implementation begins.