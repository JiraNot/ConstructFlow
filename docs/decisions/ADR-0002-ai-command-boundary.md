# ADR-0002 — AI Uses Registered Commands, Never Private Production Geometry Mutation

Status: Accepted  
Date: 2026-09-08

## Context

ConstructFlow will eventually use AI to interpret design intent, search catalogs, propose options and automate multi-step workflows. Allowing AI to directly edit SketchUp production geometry or private module data would create non-deterministic behavior, broken lifecycle history, untraceable quantities and bypassed validation.

## Decision

AI is an orchestration client of the same command registry used by human UI and automation.

Canonical flow:

`Intent → AI interpretation → registered command → domain validation → transaction → events`

AI may not bypass command validation or mutate private module namespaces.

## Consequences

Positive:

- human and AI actions share one business-rule path;
- deterministic tests can cover AI-triggered mutations;
- Undo/Redo and phase semantics remain consistent;
- destructive operations can enforce confirmation;
- provider/model choice remains replaceable.

Costs:

- command contracts must be explicit and versioned;
- complex AI actions require orchestration of multiple commands rather than arbitrary geometry scripting;
- some freeform modeling suggestions may remain advisory until a domain command exists.

## Allowed AI behaviors

- interpret natural language;
- ask for missing information;
- search library/catalog;
- propose options;
- invoke AI-allowed commands;
- summarize warnings, quantities and drawing impact;
- compare scenarios.

## Prohibited AI behaviors

- direct mutation of stable object IDs;
- private namespace writes;
- fabrication of unknown site values;
- silent structural engineering approval;
- bypassing phase/connector/host rules;
- marking stale outputs current without regeneration.

## Provider independence

Domain modules must not depend on a specific AI provider. OpenAI, Gemini, Claude or future providers connect through the AI orchestration layer and current command schemas.