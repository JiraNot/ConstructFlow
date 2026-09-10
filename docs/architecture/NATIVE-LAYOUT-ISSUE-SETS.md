# Native LayOut Issue Sets

Status: Accepted v1 foundation contract.

## Purpose

ConstructFlow can build renderer-neutral Drawing Issue Sets. This contract defines the native LayOut boundary that turns one issue set into one multi-page `.layout` document and optional PDF.

## Native behavior

`NativeLayoutIssueSetAdapter`:

- creates one LayOut document;
- uses the first existing page for the first sheet;
- adds one LayOut page for each additional sheet through `Layout::Pages#add`;
- names pages from sheet number + title;
- creates SketchUp viewports from each sheet plan;
- applies the existing native title-block/revision/template-placeholder decorator per page;
- writes issue-set metadata on the document and sheet metadata on pages when attribute APIs are available;
- saves one `.layout` file and optionally exports one PDF.

## Page-size rule

LayOut page size is document-level in this v1 adapter path. A native issue-set document therefore requires all sheets to use the same page dimensions. Mixed A3/A1 sets must be split into separate native documents until a later packaging layer supports multi-document issue bundles.

## Template rule

One native issue-set document uses one resolved company template. The selected template must be compatible with every sheet's paper size, orientation, drawing family and issue-set use case. A pinned template that is incompatible with any sheet fails clearly.

Template placeholder metadata is applied to every sheet plan before native decoration so company-specific title-block tokens work consistently across pages.

## Scene and semantic ownership

The adapter does not infer drawing meaning. Each viewport still points to the exact SketchUp Scene produced from domain-owned semantic representations and Drawing View Presets.

## API boundary

The native backend uses the official LayOut Ruby API page collection (`document.pages.add`) and existing `document.add_entity` behavior. Pure-Ruby tests use an injectable backend and do not require LayOut in CI.

## Acceptance criteria

- AC-DWG-NATIVE-ISSUE-001: one issue set creates one native LayOut document.
- AC-DWG-NATIVE-ISSUE-002: one ordered sheet plan maps to one ordered native page.
- AC-DWG-NATIVE-ISSUE-003: viewport scene/render-mode/scale intent is preserved per page.
- AC-DWG-NATIVE-ISSUE-004: title-block/revision/template placeholder decoration runs per page.
- AC-DWG-NATIVE-ISSUE-005: mixed page sizes are rejected in one v1 native document.
- AC-DWG-NATIVE-ISSUE-006: one compatible resolved template is shared across the issue-set document.
- AC-DWG-NATIVE-ISSUE-007: `.layout` save and optional PDF export happen once after all pages are built.
