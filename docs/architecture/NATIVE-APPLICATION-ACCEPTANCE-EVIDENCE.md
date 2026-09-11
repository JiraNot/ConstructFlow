# Native Application Acceptance Evidence

Status: Accepted v1 foundation contract.

## Purpose

Define how ConstructFlow records real SketchUp/LayOut acceptance evidence without confusing pure-Ruby CI evidence with native-application verification.

The Construction Workflow v1 application proof is already green at the semantic/application boundary. Native acceptance is a separate gate because save/reopen, Undo/Redo, native copy identity, observers, interactive tools, SketchUp scene/tag persistence and LayOut/PDF behavior depend on the desktop applications.

## Principles

1. Native acceptance evidence is model-local and explicit.
2. A green unit test or fake native backend never marks a native checkpoint as passed.
3. Automated native checks may mark a checkpoint only when they can prove the required condition in the real application.
4. Manual checkpoints require an explicit `passed` record plus notes/evidence from the operator.
5. `skipped` is not equivalent to `passed` and does not complete the native gate.
6. Evidence is diagnostic/acceptance metadata only. It must never change Smart Object semantics, clear dirty flags, approve engineering status or bypass publication QA.

## Storage

Native acceptance evidence is stored on the SketchUp model under:

- dictionary: `constructflow.native_acceptance`
- key: `session_v1`
- schema version: `1`

The record contains:

- capture timestamp;
- optional source Extension ID;
- baseline fingerprint;
- baseline project/model snapshot;
- per-checkpoint status, notes, timestamp and evidence.

The baseline snapshot contains only identity/presentation evidence required by the acceptance workflow:

- project ID;
- saved model path;
- Smart Object IDs;
- SketchUp scene names;
- ConstructFlow-managed `CF-*` tag names.

It is not a second semantic model and does not duplicate domain definitions.

## Save/Reopen proof

`CaptureNativeAcceptanceBaseline` requires a saved `.skp` path. It records the current project ID, Smart Object ID set, scene names and managed tags plus a deterministic SHA-256 fingerprint.

`VerifyNativeAcceptanceReopen` must not pass in the same ConstructFlow runtime session that captured the baseline. The operator must close/reopen the saved model or restart SketchUp so a different runtime session token is observed.

After reopen the verification passes only when:

- project ID matches;
- saved model path matches;
- the Smart Object ID set is unchanged;
- every baseline scene still exists;
- every baseline ConstructFlow-managed tag still exists.

Extra user scenes/tags are allowed and do not fail acceptance.

A failed comparison records the missing/extra identity evidence and leaves the checkpoint failed.

## Required checkpoints

The v1 native acceptance gate requires all of the following to be `passed`:

- `save_reopen_identity` — saved model reopens with the same semantic IDs and managed drawing state;
- `undo_redo_semantic_geometry` — native Undo/Redo restores semantic metadata and geometry together;
- `native_copy_identity` — native copy/duplicate behavior does not leave duplicate production Smart Object IDs;
- `observer_new_open` — New/Open model observer attachment rebuilds runtime state correctly;
- `migration_fixture` — supported migration fixtures load against real model attributes;
- `interactive_tools` — representative Draw/Convert/drag-handle tools work in SketchUp;
- `scene_tag_persistence` — generated scenes, tags/styles and required view state survive save/reopen;
- `layout_pdf_export` — supported LayOut template/viewport creation, `.layout` save and PDF export work in the real application.

The checkpoint list is intentionally explicit so `STATUS.md` can distinguish application completeness from native proof.

## Public command boundary

The Core runtime exposes:

- `CaptureNativeAcceptanceBaseline`
- `VerifyNativeAcceptanceReopen`
- `RecordNativeAcceptanceCheckpoint`

These commands are acceptance/evidence operations. They do not mutate domain geometry or construction lifecycle.

Human/automation/AI callers may record a checkpoint only from actual evidence. An AI agent must not mark a native checkpoint passed solely because source code or unit tests suggest it should work.

## UI

ConstructFlow may expose a `Native Acceptance` submenu containing baseline capture, reopen verification and status display actions. Manual checkpoint evidence can be recorded through the public command boundary or a later dedicated inspector.

## Completion semantics

The native acceptance session is complete only when every required checkpoint status is `passed`.

`pending`, `failed` and `skipped` all keep the native gate incomplete.

Completing this acceptance session is evidence for release/gate decisions only. It does not authorize a stale construction package, override Structural engineering approval or bypass Construction Workflow QA/currentness/settlement.

## Acceptance criteria

- AC-NATIVE-001: an unsaved model cannot capture a save/reopen baseline.
- AC-NATIVE-002: save/reopen verification cannot pass in the same runtime session that captured the baseline.
- AC-NATIVE-003: after a real reopen, missing Smart Object IDs fail persistence verification.
- AC-NATIVE-004: after a real reopen, missing baseline ConstructFlow scenes/tags fail persistence verification while unrelated new user scenes/tags are allowed.
- AC-NATIVE-005: all required checkpoints must be explicitly passed before the native acceptance session reports complete.
- AC-NATIVE-006: native acceptance evidence never modifies domain semantics, lifecycle, engineering approval or derived-output dirty state.
- AC-NATIVE-007: pure-Ruby CI/fake-native tests cannot by themselves set manual native checkpoints to passed.
