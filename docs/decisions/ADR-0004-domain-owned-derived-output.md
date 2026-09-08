# ADR-0004 — Domain Modules Own Semantics; Platform Services Aggregate Derived Outputs

Status: Accepted  
Date: 2026-09-08

## Context

ConstructFlow needs BOQ, costing, drawings, schedules and QA across many construction domains. If one central service reimplements every domain formula and representation, it becomes a second monolith and inevitably diverges from modeling behavior.

## Decision

Domain modules own construction semantics and register public providers:

- Quantity Provider
- Drawing Provider
- Validator
- Connector/Host Capability

Platform services aggregate, compose, format, issue and export these provider outputs.

Examples:

- Structure owns concrete/rebar/steel formulas; Quantity aggregates them.
- Surface owns paving piece/border calculations; Drawing places setting-out views.
- Interior owns cabinet parts/hardware; Drawing creates shop sheets and Quantity aggregates cut-list data.

## Consequences

Positive:

- one formula source per domain;
- module changes remain localized;
- output services stay generic;
- test ownership is clear;
- new modules can participate without editing a giant BOQ/QA switch statement.

Costs:

- provider contracts must be stable and normalized;
- domain modules must implement output providers in addition to geometry;
- cross-domain schedules require aggregation logic over normalized data.

## Rule

When a domain provider exists, platform services must not bypass it by scraping arbitrary raw SketchUp geometry to recreate semantic quantities or construction rules.