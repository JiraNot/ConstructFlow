# Company LayOut Template Registry

Status: Accepted v1 foundation contract.

## Purpose

ConstructFlow must resolve company LayOut templates deterministically without requiring users or agents to pass an absolute `.layout` path for every export.

The registry is a Drawing-platform concern. Domain modules never choose files or template versions.

## Template identity

Every registered template has:

- stable `key`, for example `company.a3`;
- immutable `version`;
- `.layout` asset path;
- paper size and orientation;
- supported drawing families or `*`;
- supported use cases, for example `construction`, `permit`, `shop_drawing`;
- placeholder token mapping;
- revision placeholder prefix;
- template population strategy;
- optional descriptive metadata.

A template version is treated as immutable. Publishing a changed company template creates a new version rather than silently changing the meaning of an existing version.

## Resolution

Resolution inputs are:

1. paper size;
2. orientation;
3. drawing family;
4. use case;
5. optional preferred template key;
6. optional preferred version.

If a preferred key/version is provided, it must still be compatible with the requested sheet. Incompatible preferred templates fail clearly.

Without a preferred version, the registry chooses the newest compatible version deterministically.

## Native export integration

`NativeLayoutExportService` resolves the template before building the normalized export plan.

The selected definition supplies:

- native `template_path`;
- semantic `template_key`;
- placeholder tokens;
- revision placeholder prefix;
- placeholder strategy.

An explicitly supplied `template_path` always wins and is reported as an explicit-path resolution.

If no templates are registered, export retains the previous behavior and may create a blank/native document with generic title-block fallback.

## Version traceability

Native export results must report template resolution including source, key, version and path. This allows QA, issued drawing sets and later project snapshots to identify the exact company template used.

## Boundaries

The registry does not:

- edit template files;
- infer company branding;
- download arbitrary assets;
- select domain semantics;
- mutate existing issued drawing files in place.

Future project snapshots may pin a key/version pair so historic drawing sets remain reproducible.

## Acceptance criteria

- AC-DWG-TPL-REG-001: templates register by stable key and immutable version.
- AC-DWG-TPL-REG-002: newest compatible version resolves deterministically when version is not pinned.
- AC-DWG-TPL-REG-003: paper/orientation/family/use-case incompatibility is rejected.
- AC-DWG-TPL-REG-004: wildcard family templates can serve multiple drawing families.
- AC-DWG-TPL-REG-005: native export consumes registry path and placeholder settings without domain coupling.
- AC-DWG-TPL-REG-006: explicit template paths preserve backward compatibility and take precedence.
