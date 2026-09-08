# QA, Coordination & Revision Platform

Status: Proposed v1  
Module IDs: `constructflow.qa`, `constructflow.revision`

## Mission

QA aggregates registered domain validators and cross-domain coordination issues. Revision records model/drawing issue history without redefining construction lifecycle.

## QA owns

- ValidatorRegistry
- ValidationRun
- ValidationIssue
- CoordinationIssue
- Severity/Status metadata
- Suppression/waiver record where allowed

## Revision owns

- Revision
- IssueStatus
- RevisionEntry
- DrawingIssueRecord
- ChangeSet metadata
- AsBuilt/Superseded state

## Dependency rule

Domain modules register validators. QA runs/presents them. QA must not reimplement every domain rule.

Revision consumes model/drawing changes and issue events but does not mutate phase semantics.

## Validator contract

A validator declares:

```text
ID
owner module
scope/object types
severity default
inputs/capabilities
message template
action context
```

Result identifies smart objects, not only raw faces.

## Severity

Recommended:

- Error — invalid/blocking state;
- Warning — constructability/coordination concern;
- Info — review item;
- Verify On Site — unresolved existing condition.

Severity can be rule/project-configurable where appropriate.

## Baseline validation families

Core:

- missing stable ID/schema;
- missing phase/level;
- orphaned relationship;
- unsupported module/schema.

Architecture:

- invalid wall/room/opening host.

Structure:

- unsupported/floating member metadata;
- foundation/known utility clash.

Surface:

- invalid slope;
- minimum-cut violation;
- stale paving layout.

Interior:

- door/drawer collision;
- cabinet vs window/switch conflict;
- missing service requirement.

Electrical:

- unhosted fixture;
- switch with no controlled loads;
- required outlet missing.

Plumbing/Drainage:

- unconnected service;
- insufficient/unknown gravity slope;
- route clash;
- no drainage destination.

Drawing/Quantity:

- stale output;
- broken source reference.

## Cross-domain coordination

QA can query public bounding volumes/geometry/capabilities to detect issues such as:

- footing hits existing drain;
- ground beam crosses manhole/pipe;
- downlight conflicts with beam;
- cabinet covers switch/window;
- new extension covers existing manhole;
- paving level conflicts with threshold/drain.

Cross-domain check logic should have a clear owner or QA coordination plugin and must not mutate either domain.

## Issue workflow

ValidationIssue fields:

- issue ID;
- rule ID;
- affected smart-object IDs;
- severity;
- message;
- state: open/resolved/accepted/waived;
- created/updated revision;
- recommended actions;
- optional site-verification flag.

Fix actions invoke domain commands; QA does not directly repair private module data.

## Commands

QA:

- `RunValidation`
- `RunValidationForSelection`
- `ResolveValidationIssue`
- `AcceptValidationWarning`

Revision:

- `CreateRevision`
- `IssueDrawingSet`
- `MarkAsBuilt`
- `SupersedeIssue`
- `CreateRevisionSnapshot`

## Revision semantics

Revision records change/issuance over time:

```text
Rev 00 Preliminary
Rev 01 Client Revision
Rev 02 For Construction
Rev 03 Site Revision
```

This is separate from:

```text
Existing → Demolition → New Construction
```

Changing revision never changes created/demolished phase fields.

## Change tracking

Foundation can track changed smart-object IDs and dirty outputs between revision snapshots. Advanced phases may generate revision clouds/change comparisons.

## Drawing issue integration

Issued drawing set stores:

- revision;
- issue status;
- generated source state;
- timestamp;
- sheet list;
- output references.

A later model change marks current working drawings dirty but does not rewrite the historical issued set.

## Structural safety messaging

QA may report modeling/constructability concerns but must not label them as certified structural adequacy unless a future licensed engineering integration explicitly provides that capability.

## Acceptance criteria

- AC-QAR-001: domain validator registers/runs without changing QA core.
- AC-QAR-002: validation issue identifies rule + smart-object IDs + actionable context.
- AC-QAR-003: cross-domain clash reports both domain objects without mutating either.
- AC-QAR-004: Verify On Site state can remain unresolved without inventing data.
- AC-QAR-005: creating a Revision does not change construction phase lifecycle.
- AC-QAR-006: issued drawing snapshot remains historically reproducible after later model edits.
- AC-QAR-007: resolving an issue through a Fix action invokes registered domain command.
- AC-QAR-008: structural QA wording does not represent unverified modeling rules as licensed approval.