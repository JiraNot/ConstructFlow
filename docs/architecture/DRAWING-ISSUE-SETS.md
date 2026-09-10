# Drawing Issue Sets

Status: Accepted v1 foundation contract.

## Purpose

A construction issue is a coordinated set of sheets, not a collection of unrelated one-off exports. ConstructFlow therefore needs a renderer-neutral issue-set contract above individual LayOut export plans.

## Issue-set contract

A `DrawingIssueSet` contains:

- stable issue-set id and name;
- revision code;
- issue status;
- optional template scope id;
- template use case;
- ordered sheet requests.

Each sheet request references an existing Drawing View Preset plus sheet-specific export options such as sheet number, title, paper size or orientation.

## Build behavior

`DrawingIssueSetBuilder` converts each sheet request into the existing normalized `constructflow.layout_export_plan.v1` contract.

The issue-set revision and issue status override per-sheet values so an issued set cannot accidentally contain mixed current revision/status metadata.

The builder does not create native LayOut pages. It prepares deterministic multi-sheet intent for a native issue-set exporter.

## Template relationship

`template_scope_id` is carried at issue-set level so native export can resolve project/drawing-set template pins consistently across all sheets. Sheet-specific paper size and drawing family still participate in compatibility resolution.

## Non-goals

This foundation does not yet:

- create a multi-page `.layout` document;
- generate a cover/index sheet;
- assign automatic sheet numbering across disciplines;
- publish files or transmit issued sets;
- infer approval/signature metadata.

## Acceptance criteria

- AC-DWG-ISSUE-001: issue sets require at least one sheet.
- AC-DWG-ISSUE-002: sheets are ordered and reference Drawing View Presets.
- AC-DWG-ISSUE-003: set revision/status propagate to every normalized sheet plan.
- AC-DWG-ISSUE-004: sheet-specific numbering/options remain intact.
- AC-DWG-ISSUE-005: template scope/use-case metadata are carried without domain coupling.
