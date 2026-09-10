# LayOut Template Registry and Asset Versioning

Status: Accepted v1 foundation contract.

## Purpose

ConstructFlow must select company LayOut templates by stable semantic identity rather than requiring callers to pass filesystem paths manually for every export.

The registry is owned by the Drawing platform. Domain modules do not know native template paths.

## Template asset identity

Every registered template asset has:

- `key` — stable semantic key, for example `company.a3`, `company.a1`, `company.permit.a3`;
- `version` — immutable version identifier;
- `path` — native `.layout` asset path;
- `paper_size`;
- `orientation`;
- optional supported `drawing_families`;
- optional supported `issue_kinds`;
- optional placeholder map;
- optional metadata.

Canonical identity is `key@version`.

A `(key, version)` pair is immutable and may not be registered twice.

## Version selection

When no version is requested, the registry resolves the latest registered version for that key. Projects or issue sets that require reproducible output may pin an explicit template version.

The registry must expose the resolved identity in export results so generated deliverables can be traced to the template asset that produced them.

## Compatibility validation

Before native export, a template is validated against:

- paper size;
- orientation;
- drawing family when the asset declares supported families;
- issue kind when the asset declares supported issue kinds.

An incompatible registered asset is an error. ConstructFlow must not silently stretch an A3 template into A1 or reuse a discipline-specific template for an incompatible family.

## Native export resolution

`NativeLayoutExportService` resolves templates in this order:

1. explicit `template_path` supplied by the caller;
2. registered `template_key` plus optional `template_version`;
3. no native template, allowing the generic sheet/title-block fallback path where supported.

An explicit path is an intentional override and does not claim a registry identity.

## Placeholder integration

A registered asset may carry a `LayoutTemplatePlaceholderMap`. When present, its tokens, strategy and revision prefix become defaults for the normalized export plan unless the caller explicitly overrides them.

This keeps company template conventions out of domain modules while preserving the normalized title-block contract.

## Runtime contract

The SketchUp runtime exposes:

```ruby
Runtime.layout_templates
```

Callers may register immutable `LayoutTemplateAsset` values and native export may resolve them automatically.

Example:

```ruby
Runtime.layout_templates.register(
  Core::LayoutTemplateAsset.new(
    key: 'company.a3',
    version: '2026.09',
    path: '/templates/company-a3.layout',
    paper_size: 'A3',
    orientation: 'landscape',
    drawing_families: ['plumbing_drainage_plan'],
    issue_kinds: ['construction']
  )
)
```

Then:

```ruby
Runtime.native_layout_export.export_preset(
  'plumbing.construction',
  template_key: 'company.a3',
  layout_path: '/out/P-101.layout'
)
```

## Non-goals v1

This foundation does not yet provide:

- downloading or synchronizing template binaries;
- mutable in-place template version replacement;
- semantic-version ordering beyond registration order for default/latest selection;
- project snapshot persistence of the template binary;
- logo/image asset replacement;
- template marketplace/distribution.

These are future Library/Drawing integration concerns.

## Acceptance criteria

- duplicate `(key, version)` registration is rejected;
- latest registered version is deterministic per key;
- explicit version lookup is supported;
- compatibility mismatches fail before native export;
- explicit native template paths override registry resolution;
- export results include resolved template identity/version when registry-backed;
- optional asset placeholder maps flow into export-plan defaults;
- domain modules remain unaware of filesystem template paths.
