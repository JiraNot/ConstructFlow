# LayOut Template Placeholders

Status: Accepted v1 foundation contract.

## Purpose

ConstructFlow must be able to populate an existing company LayOut template without redrawing the company's title block, typography, logo, border, or other presentation assets.

This contract adds deterministic placeholder mapping on top of the renderer-neutral sheet/export plan and the native LayOut adapter.

## Ownership

The Drawing platform owns sheet metadata and placeholder substitution.

Company templates own presentation: geometry, logo, typeface, colors, borders, signatures, spacing, and visual composition.

Domain modules must not know about LayOut placeholder tokens.

## Placeholder rule

A template placeholder is a `Layout::FormattedText` entity whose complete plain-text value exactly matches a configured token.

Default title-block tokens are:

```text
{{CF:PROJECT_NAME}}
{{CF:PROJECT_NUMBER}}
{{CF:DRAWING_TITLE}}
{{CF:SHEET_NUMBER}}
{{CF:SCALE}}
{{CF:REVISION}}
{{CF:ISSUE_STATUS}}
{{CF:DRAWN_BY}}
{{CF:CHECKED_BY}}
{{CF:DRAWING_FAMILY}}
```

Revision-history tokens use one-based row indexes:

```text
{{CF:REV:1:CODE}}
{{CF:REV:1:DATE}}
{{CF:REV:1:STATUS}}
{{CF:REV:1:DESCRIPTION}}
{{CF:REV:1:AUTHOR}}
```

Additional rows increment the index.

## Exact-match safety

ConstructFlow must not replace arbitrary text fragments inside a company template. Only a text entity whose complete plain text equals the configured token may be changed.

This prevents accidental mutation of company addresses, notes, legal text, or ordinary labels containing similar text.

Locked text entities are not modified.

## Empty metadata

ConstructFlow must not invent missing project, author, date, checker, description, or other metadata.

When the mapped field is empty, the default behavior is to leave the placeholder unchanged and report it as `skipped_empty_fields`.

A future explicit blanking policy may be added, but it must be opt-in.

## Template strategies

Three strategies are supported:

- `prefer_template` — fill matching template placeholders; if no title-block placeholder is matched, fall back to the generic ConstructFlow title block. Revision history falls back to the generic revision table only when no revision placeholders were matched.
- `generic_only` — ignore template placeholders and use generated title-block/revision entities.
- `template_only` — only populate existing placeholders; never create generic title-block/revision fallback entities.

`prefer_template` is the default.

## Custom company tokens

The export plan may override default tokens for a company template. Example:

```text
project_name -> <PROJECT>
sheet_number -> <SHEET_NO>
```

The mapping is carried in the sheet's `title_block.placeholder_map`, not hard-coded into domain modules or the native adapter.

## Native LayOut boundary

The native adapter may discover text entities from:

- `Document#shared_entities` for shared template layers;
- the current Page's non-shared entities;
- nested groups when an entity collection is exposed.

The adapter uses `Layout::FormattedText#plain_text` / `plain_text=` semantics through a small backend boundary. Template traversal remains best-effort and capability checked.

## Traceability

Native export results report:

- whether template placeholders were used;
- matched field keys;
- unmatched field keys;
- empty fields intentionally skipped;
- match count.

The native document stores whether placeholders were used and the match count when document attributes are supported.

## Non-goals for v1

This slice does not yet define:

- logo replacement;
- image placeholders;
- signature image injection;
- rich-text partial substitution;
- automatic resizing of template fields;
- revision-table row cloning;
- multi-page issue registers;
- company-template asset storage/versioning.

Those must build on this placeholder contract rather than bypass it.

## Acceptance criteria

1. Existing template text matching a configured token exactly is populated from normalized sheet metadata.
2. Unrelated text is never changed.
3. Partial token occurrences are never changed.
4. Empty metadata is not invented and leaves the placeholder untouched.
5. Locked entities are not changed.
6. Indexed revision placeholders can be populated from structured revision history.
7. Custom placeholder tokens can be carried by the export plan.
8. `prefer_template`, `generic_only`, and `template_only` behavior is deterministic.
9. Template matching is testable without a live LayOut process through an injectable backend.
