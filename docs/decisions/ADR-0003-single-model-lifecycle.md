# ADR-0003 — One Semantic Project Model for Existing, Demolition and New Construction

Status: Accepted  
Date: 2026-09-08

## Context

Renovation and extension work repeatedly needs to compare existing conditions, demolition scope and proposed construction. Maintaining separate `.skp` files or duplicated object sets for each phase causes divergence, broken quantities and manual drawing coordination.

## Decision

ConstructFlow uses **one semantic project model** with object lifecycle fields:

- `created_phase`
- `demolished_phase`

Phase views derive Existing, Demolition, Proposed and Coordination states from lifecycle semantics.

Revision and drawing issue status are separate dimensions.

## Consequences

Positive:

- one source of truth for model, quantities and drawings;
- relocation/replacement history remains explicit;
- existing-to-remain objects naturally carry into proposed state;
- demolition BOQ and new-work BOQ can be separated;
- drawing views do not require duplicated models.

Costs:

- phase-aware visibility and drawing filters must be implemented centrally;
- raw SketchUp tags alone are insufficient;
- commands must distinguish `Swap Type`, `Demolish`, `Modify Existing`, `Relocate` and `Replace Construction`.

## Replacement behavior

Relocating/replacing existing construction normally creates:

1. old object retained with demolition/abandon lifecycle;
2. new object with new stable ID in New Construction;
3. explicit replacement relationship;
4. affected network/host/dependencies updated or flagged.

A simple geometry move is not sufficient for construction relocation history.

## Rejected alternatives

### Separate Existing / Demolition / Proposed files

Rejected because it duplicates semantic data and creates coordination drift.

### One `status` field only

Rejected because it cannot robustly express when an object entered and left the project lifecycle or derive multiple phase views.