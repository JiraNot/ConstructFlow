# Native Application Acceptance Evidence

Status: Accepted v1 foundation contract.

## Purpose

Define how ConstructFlow records real SketchUp/LayOut acceptance evidence without confusing pure-Ruby CI evidence with native-application verification.

The Construction Workflow v1 application proof is already green at the semantic/application boundary. Native acceptance is a separate gate because save/reopen, Undo/Redo, native copy identity, observers, interactive tools, SketchUp scene/tag persistence and LayOut/PDF behavior depend on the desktop applications.

## Principles

1. Native acceptance evidence is model-local and explicit.
2. A green unit test or fake native backend never marks a native checkpoint as passed.
3. Automated native checks may mark a checkpoint only when they can prove the required condition from an event/state observed in the real application.
4. Manual checkpoints require an explicit `passed` record plus notes/evidence from the operator.
5. Checkpoints with an objective runtime observer must use that runtime evidence rather than a manual pass through the generic command.
6. `skipped` is not equivalent to `passed` and does not complete the native gate.
7. Evidence is diagnostic/acceptance metadata only. It must never change Smart Object semantics, clear dirty flags, approve engineering status or bypass publication QA.

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

`VerifyNativeAcceptanceReopen` must not pass against the same in-memory model session that captured the baseline. The acceptance service uses a process/runtime token plus the active SketchUp model object identity as a session marker. Closing/reopening the model inside the same SketchUp process produces a new model object marker; restarting SketchUp produces a new runtime token.

After reopen the verification passes only when:

- project ID matches;
- saved model path matches;
- the Smart Object ID set is unchanged;
- every baseline scene still exists;
- every baseline ConstructFlow-managed tag still exists.

Extra user scenes/tags are allowed and do not fail acceptance.

A failed comparison records the missing/extra identity evidence and leaves the checkpoint failed.

## Objective runtime evidence

Some native checkpoints now have an event path that is stronger than a free-form operator record. `NativeAcceptanceAutoEvidence` subscribes to the normal runtime EventBus only after the extension has booted. It never interprets unit-test success, source inspection or a fake backend as acceptance.

### Native copy identity

The `native_copy_identity` checkpoint is automatically passed only when all of the following occur after an acceptance baseline exists on the active saved project:

- SketchUp's native Entities observer detects the copied entity;
- `NativeCopyIdentityRepair` actually assigns a new Smart Object ID;
- the repair publishes `NativeCopyIdentityRepaired`;
- the source ID and new ID are both live in the current Smart Object index;
- source and new IDs differ;
- inherited semantic relationships were detached from the raw native copy.

The stored evidence includes the runtime event ID/timestamp, project/model identity, application version when available and every source/new Smart Object ID pair.

The public generic checkpoint command must not manually mark `native_copy_identity` passed. Failure/skipped notes remain recordable when troubleshooting.

### New/Open observer

The `observer_new_open` checkpoint is automatically passed only from the real SketchUp AppObserver path after a baseline target has been armed. The acceptance service retains the saved target project/path in memory while the active model changes.

The required observed sequence is:

1. native `onNewModel` attaches a different model through the installed observer path;
2. native `onOpenModel` returns to the saved baseline project/path;
3. ConstructFlow has already rebuilt Runtime against that reopened model before the evidence event is published.

The stored evidence preserves both transition events, project/path identity, Smart Object count and application version when available.

An `open` event without a prior `new` event does not satisfy this checkpoint. The generic checkpoint command must not manually mark `observer_new_open` passed.

## Required checkpoints

The v1 native acceptance gate requires all of the following to be `passed`:

- `save_reopen_identity` — saved model reopens with the same semantic IDs and managed drawing state;
- `undo_redo_semantic_geometry` — native Undo/Redo restores semantic metadata and geometry together;
- `native_copy_identity` — native copy/duplicate behavior does not leave duplicate production Smart Object IDs; automatically recorded from runtime repair evidence;
- `observer_new_open` — New/Open model observer attachment rebuilds runtime state correctly; automatically recorded from the native observer sequence;
- `migration_fixture` — supported migration fixtures load against real model attributes;
- `interactive_tools` — representative Draw/Convert/drag-handle tools work in SketchUp;
- `scene_tag_persistence` — generated scenes, tags/styles and required view state survive save/reopen;
- `layout_pdf_export` — supported LayOut template/viewport creation, `.layout` save and PDF export work in the real application.

The checkpoint list is intentionally explicit so `STATUS.md` can distinguish application completeness from native proof.

## Public command boundary

The Core runtime exposes:

- `RunNativeAcceptancePreflight`
- `CaptureNativeAcceptanceBaseline`
- `VerifyNativeAcceptanceReopen`
- `RecordNativeAcceptanceCheckpoint`

These commands are acceptance/evidence operations. They do not mutate domain geometry or construction lifecycle.

Human/automation/AI callers may record a manual checkpoint only from actual evidence. An AI agent must not mark a native checkpoint passed solely because source code or unit tests suggest it should work. `native_copy_identity` and `observer_new_open` are reserved for the objective runtime evidence collector when status is `passed`.

## UI

ConstructFlow may expose a `Native Acceptance` submenu containing preflight, baseline capture, reopen verification and status display actions. Manual checkpoint evidence can be recorded through the public command boundary or a later dedicated inspector. Objective copy/New/Open checkpoints update the same model-local status automatically when their real native events are observed.

## Completion semantics

The native acceptance session is complete only when every required checkpoint status is `passed`.

`pending`, `failed` and `skipped` all keep the native gate incomplete.

Completing this acceptance session is evidence for release/gate decisions only. It does not authorize a stale construction package, override Structural engineering approval or bypass Construction Workflow QA/currentness/settlement.

## Acceptance criteria

- AC-NATIVE-001: an unsaved model cannot capture a save/reopen baseline.
- AC-NATIVE-002: save/reopen verification cannot pass against the same in-memory model session that captured the baseline; a reopened model object or restarted runtime is required.
- AC-NATIVE-003: after a real reopen, missing Smart Object IDs fail persistence verification.
- AC-NATIVE-004: after a real reopen, missing baseline ConstructFlow scenes/tags fail persistence verification while unrelated new user scenes/tags are allowed.
- AC-NATIVE-005: all required checkpoints must be explicitly passed before the native acceptance session reports complete.
- AC-NATIVE-006: native acceptance evidence never modifies domain semantics, lifecycle, engineering approval or derived-output dirty state.
- AC-NATIVE-007: pure-Ruby CI/fake-native tests cannot by themselves set manual native checkpoints to passed.
- AC-NATIVE-008: `native_copy_identity` passes automatically only from a live `NativeCopyIdentityRepaired` event whose source/new IDs both exist and differ on the armed acceptance project.
- AC-NATIVE-009: `observer_new_open` passes automatically only after the installed native observer reports New Model followed by Open Model back to the armed saved acceptance project.
- AC-NATIVE-010: the public generic checkpoint command rejects manual `passed` status for runtime-objective copy and New/Open observer checkpoints.
