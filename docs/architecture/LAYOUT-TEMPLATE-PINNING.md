# LayOut Template Pinning and Asset Verification

Status: Accepted v1 foundation contract.

## Purpose

Issued and reproducible drawing workflows need more than a template key. A project or drawing-set scope must be able to pin the exact template version and optionally the exact asset hash.

## Pin contract

A template pin contains:

- `scope_id` — project, package or drawing-set identity;
- `use_case` — construction, permit, shop drawing or another registered use case;
- `template_key`;
- exact `version`;
- optional SHA-256 hash.

Pins are explicit data. They are not inferred from filenames or latest-version state.

## Resolution precedence

1. explicit native `template_path` supplied by the caller;
2. explicit key/version supplied by the caller;
3. scope/use-case template pin;
4. compatible registry resolution;
5. no template / generic fallback when registry is empty.

An explicit path preserves the legacy/manual workflow and is not silently replaced by a pin.

## Asset verification

When registry or pin resolution selects an asset, native export verifies that:

- the `.layout` asset exists;
- a SHA-256 digest can be computed;
- when the pin includes an expected digest, the actual digest matches it.

A hash mismatch or missing pinned asset is a hard failure. ConstructFlow must not silently substitute another template version because that would make issued drawing output non-reproducible.

Verification can be disabled only by an explicit caller option for controlled development/testing workflows.

## Runtime ownership

The Drawing platform owns:

- `Runtime.layout_templates`;
- `Runtime.layout_template_pins`;
- `Runtime.layout_template_asset_verifier`.

Domain modules do not access these services.

## Traceability

Native export results expose whether selection came from registry, pin, explicit path or no template, together with key/version/path and verified SHA-256 when available.

## Acceptance criteria

- AC-DWG-TPL-PIN-001: a scope/use-case can pin an exact key/version.
- AC-DWG-TPL-PIN-002: invalid SHA-256 pin values are rejected.
- AC-DWG-TPL-PIN-003: missing registry-selected template assets fail before native export.
- AC-DWG-TPL-PIN-004: pinned hashes are compared with actual asset hashes.
- AC-DWG-TPL-PIN-005: hash mismatch never falls back to another version.
- AC-DWG-TPL-PIN-006: explicit template paths remain highest-precedence backward-compatible input.
