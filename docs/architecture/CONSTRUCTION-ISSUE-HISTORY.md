# Construction Issue History

Status: Accepted v1 foundation contract

## Purpose

Preserve model-local evidence for successful construction package exports across revisions instead of overwriting the only trace of a previously published issue.

`ConstructionOutputSettlement` stores the latest derived-output state. Construction Issue History is different: it is an append-only publication ledger for successful native issue-set exports.

The ledger is evidence, not a semantic construction model and not a substitute for external document-control systems.

## Storage

The v1 history is stored on the source `extension.zone` entity under:

- dictionary: `constructflow.extension`
- key: `construction_issue_history`
- schema version: `1`

Logical shape:

```yaml
format: constructflow.extension_construction_issue_history.v1
schema_version: 1
extension_id: <smart-object-id>
entries:
  - issue_id: issue-...
    revision: P01
    issue_status: for_construction
    scope_fingerprint: ...
    takeoff_fingerprint: ...
    drawing_fingerprint: ...
    settlement_status: settled
    currentness_status: current
    layout_path: /path/package.layout
    pdf_path: /path/package.pdf
    native_backend: RubyLayoutBackend
    template:
      source: registry
      key: company.a3
      version: 2.0.0
      sha256: ...
      asset_verified: true
    recorded_at: 2026-09-10T00:00:00Z
```

Legacy models with no history read as an empty schema-v1 history.

## Recording boundary

A history entry may be appended only after the end-to-end workflow reports a successful native export and the same workflow evidence confirms:

- output settlement is publishable;
- package currentness is publishable;
- a native `.layout` path exists.

Blocked, stale, partially settled or export-failed packages must not create issue-history entries.

The workflow may export working/draft packages. Those exports are still recorded as publication evidence using the caller-provided `issue_status`; the history store does not reinterpret document-control status or upgrade it to `For Construction`.

## Stable issue identity and idempotency

`issue_id` is deterministic for the exported evidence bundle. The v1 digest includes:

- Extension ID;
- revision;
- issue status;
- current scope fingerprint;
- takeoff fingerprint;
- drawing fingerprint;
- LayOut/PDF paths;
- native backend;
- resolved template identity/version/hash/verification state.

Re-running an identical export does not append a duplicate history row. The existing matching entry is returned.

A new revision, changed semantic scope, changed derived-output fingerprint, changed output destination or changed template evidence creates a distinct entry.

`recorded_at` is evidence of the first recorded occurrence of that deterministic issue entry and is preserved on idempotent repeats.

## Relation to latest output state

`construction_output_state` and `construction_issue_history` have different responsibilities:

- `construction_output_state` — latest run evidence, including blocked or non-exported package state;
- `construction_issue_history` — successful exported package evidence across time.

A later model mutation may invalidate current outputs while older issue-history records remain valid historical evidence of what was exported at that revision.

Historical evidence must never clear current dirty flags, satisfy current QA, or authorize a later export.

## Revision semantics

Revision remains independent from construction lifecycle. The history store persists the revision and issue status exactly as supplied through the Drawing/Construction workflow.

Suggested issue statuses continue to come from the project revision contract, for example Draft, For Review, For Approval, For Construction, Site Revision and As-Built.

The store does not enforce a company-specific revision naming sequence in v1. A future document-control policy may validate revision transitions separately.

## Template traceability

When the native issue-set export resolves a registered/pinned company template, the history entry preserves available trace fields:

- resolution source;
- template key;
- version;
- SHA-256;
- asset verification flag.

This allows a later audit to distinguish packages produced with different title-block/template assets even when model scope is otherwise unchanged.

## Safety rules

- No history entry is created without a successful native export result.
- No history entry is created from partial output settlement.
- No history entry is created from stale package currentness.
- History persistence never changes Smart Object lifecycle, parameters, relationships or dirty flags.
- Old history never overrides current semantic/derived-output state.
- Repeated identical evidence is idempotent.
- Missing history is valid for older project files.

## Acceptance criteria

- AC-CIH-001: a successful exported package appends one model-local issue-history entry with revision/status and current output fingerprints.
- AC-CIH-002: identical export evidence is idempotent and does not append a duplicate entry.
- AC-CIH-003: a changed revision, scope/output fingerprint, destination or template evidence creates a distinct issue entry.
- AC-CIH-004: partial settlement or stale currentness cannot be recorded as an exported issue.
- AC-CIH-005: history survives rebuilding the store from the same persisted Extension entity.
- AC-CIH-006: template version/hash verification evidence is retained when supplied by native issue-set export.
- AC-CIH-007: historical entries never authorize publication or clear current dirty state.
