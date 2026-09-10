# LayOut Title Block and Revision Foundation

Status: Accepted v1 foundation contract.

## Purpose

Generated construction sheets must carry deterministic project, drawing, issue and revision metadata. The Drawing platform owns title-block placement and revision-table composition; domain modules do not draw title blocks or own sheet numbering.

## Export-plan contract

`constructflow.layout_export_plan.v1` sheet data may include:

```yaml
title_block:
  template_key: constructflow.standard
  bounds_mm: [230, 259, 180, 28]
  fields:
    project_name: Example Project
    project_number: CF-001
    drawing_title: Plumbing Plan - Construction
    sheet_number: P-101
    scale: 1:50
    revision: P01
    issue_status: working
    drawn_by: NN
    checked_by: PA
    drawing_family: plumbing_drainage_plan
revisions:
  - code: P01
    description: First issue
    date: 2026-09-10
    status: working
    author: NN
```

All geometry placement values are paper-space millimetres. Conversion to LayOut native units occurs only at the native adapter boundary.

## Title-block ownership

The title block is sheet metadata presentation. It may display project identity, drawing title, sheet number, scale, revision, issue status, author/checker and discipline/drawing family. It must not become a Smart Object and must not duplicate domain construction data.

A company template may replace the default presentation, but the semantic field keys remain stable.

## Revision semantics

The sheet's `revision` is the current revision identifier. The `revisions` array is revision history. Revision entries preserve:

- code;
- description;
- date;
- issue status;
- author.

Revision history is append-oriented. Regenerating a sheet must not silently invent historical dates, descriptions or authors. When no explicit history is supplied, the planner may create one current-row placeholder using the current revision and issue status with other fields blank.

## Native LayOut adapter

The native adapter consumes normalized title-block and revision data after viewports have been created. The adapter may create LayOut rectangles/text or populate equivalent template entities, but it must not alter Smart Objects or domain representations.

Native output metadata reports whether a title block was created and how many revision rows were rendered.

## Safety and future work

V1 provides a deterministic basic title block and revision table. Company branding, logos, editable template placeholders, typography, title-block zoning, approval signatures and issue registers are follow-up presentation features.

The renderer must remain template-driven so project/company title blocks can replace the default without changing domain modules.

## Acceptance criteria

1. Export plans include stable title-block field keys.
2. Title-block bounds are valid paper-space millimetres.
3. Revision history is structured and deterministic.
4. Native LayOut generation creates title-block/revision entities through the adapter boundary.
5. Native document metadata records title-block/revision output status.
6. No domain module owns title-block geometry, revision table geometry, or sheet numbering.
