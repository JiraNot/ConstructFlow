# Native Application Acceptance Runbook

Status: Implementation runbook for real SketchUp/LayOut verification.

## Purpose

Run this checklist in supported desktop SketchUp/LayOut builds after the application-level Construction Workflow v1 proof is green. The objective is to collect real native evidence, not to repeat pure-Ruby CI.

## Preparation

Use a disposable acceptance project that contains at least:

- one Existing Architecture host wall;
- one Extension with generated Architecture/Structure/Roof/Surface content;
- one explicit attachment Opening/optional Door-Window infill;
- one reviewed Roof rainwater outlet connected to an in-scope Drainage downpipe;
- at least one Electrical and Interior object;
- current A/S/R/P/L/I/E construction scenes.

Save the model before starting.

Before recording any checkpoint, run `Extensions > ConstructFlow > Native Acceptance > Preflight Acceptance Project`.

The preflight is a **read-only readiness query**. It checks that an active saved model, ConstructFlow project identity, Smart Objects, scenes and managed `CF-*` tags are present. When an Extension ID is supplied through the public command, it also checks that the source is an `extension.zone` with generated related Smart Objects. Recommended multi-domain coverage is reported as an advisory warning so an intentionally narrower native test project is not falsely blocked.

The public preflight command is:

```ruby
JiraNot::ConstructFlow::Runtime.commands.execute(
  'RunNativeAcceptancePreflight',
  input: { extension_id: '<extension-smart-object-id>' }
)
```

A green preflight does **not** pass any native-acceptance checkpoint. It only confirms that the project is prepared enough to begin native verification.

## 1. Save / close / reopen identity

1. Open `Extensions > ConstructFlow > Native Acceptance > Capture Save/Reopen Baseline`.
2. Save the `.skp`.
3. Close/reopen the model, or restart SketchUp and reopen it.
4. Run `Verify Save/Reopen`.
5. The identity checkpoint passes only if project ID, Smart Object IDs, baseline scenes and managed `CF-*` tag names survive.

The same baseline/reopen operation also carries the richer scene/tag presentation snapshot used by checkpoint 7 below.

Do not accept a same-runtime `requires_reopen` result as evidence.

## 2. Undo / Redo semantic + geometry

Use a representative mutation such as moving a Drainage route grip, modifying a Smart Wall, or changing a generated construction parameter.

Verify manually:

- one Undo restores both geometry and semantic metadata;
- Redo restores both again;
- no duplicate Smart Object IDs appear;
- dependent dirty state remains coherent.

Record `undo_redo_semantic_geometry` only after observing this in SketchUp.

## 3. Native copy identity

After the acceptance baseline has been captured, copy/paste or Move+Copy a representative Smart Object in SketchUp.

ConstructFlow records this checkpoint automatically from the live native-copy observer path. A pass requires the native copy repair event to prove that:

- the copied object received a different Smart Object ID;
- both source and copied IDs are live in the current Smart Object index;
- inherited semantic relationships were detached from the raw copy.

Open `Show Native Acceptance Status` and verify `native_copy_identity` changed to `passed`. Do **not** manually record a pass for this checkpoint; the public generic checkpoint command rejects that shortcut.

## 4. New / Open observer

Keep SketchUp running after the acceptance baseline is captured.

1. Create a **New Model**.
2. Reopen the saved acceptance model with **Open**.
3. Open `Show Native Acceptance Status`.

ConstructFlow automatically records `observer_new_open` only after the installed native observer sees the exact sequence `New Model → Open Model back to the armed acceptance project`, with Runtime already attached to the reopened project. An Open event by itself does not pass the checkpoint, and the generic checkpoint command cannot manually mark it passed.

## 5. Migration fixture

Open each supported migration fixture in real SketchUp and verify persisted attributes migrate/read correctly. Record `migration_fixture` with fixture/version notes.

## 6. Interactive tools

Exercise representative native tools/handles:

- Smart Wall draw/modify;
- Opening placement;
- Structure placement where applicable;
- Drainage route-node drag editing.

Verify native input, inference, cancel/commit and Undo behavior. Record `interactive_tools`.

## 7. Scene / tag persistence

Before capturing the baseline, generate/refresh the representative issue-set scenes and leave both managed and unrelated user tags in the visibility/style state you expect to survive.

After the real save/reopen, running `Verify Save/Reopen` automatically evaluates `scene_tag_persistence` from the baseline/reopened native API snapshots. It compares:

- managed ConstructFlow scene names and stored camera state;
- parallel/perspective camera mode plus eye/target/up/view-height values when exposed by SketchUp;
- ConstructFlow scene-presentation metadata (`active_drawing_tag`, managed drawing/style tags);
- baseline tag visibility, color and line style when exposed by the API, including unrelated user tags that existed at capture time.

Extra scenes/tags created after capture are allowed. A changed baseline user-tag visibility or managed scene camera state fails this checkpoint even when the simpler identity/name checkpoint still passes.

Open `Show Native Acceptance Status` and confirm `scene_tag_persistence` is `passed`. If it fails, inspect `Runtime.native_acceptance.summary['checkpoints']['scene_tag_persistence']['evidence']['differences']`. Do **not** manually force this checkpoint to passed.

A baseline created by an older build that lacks presentation-state evidence leaves this checkpoint pending; capture a fresh baseline before rerunning the native test.

## 8. Real LayOut / PDF

Using a supported company/template asset, exercise the native LayOut path:

- create/open the LayOut document;
- create pages/viewports from the issue set;
- bind SketchUp scenes;
- verify viewport scale/render mode;
- populate title block/revision placeholders;
- save `.layout`;
- export PDF;
- inspect the resulting sheets visually.

Record `layout_pdf_export` with SketchUp/LayOut version, template version/hash and output paths.

## Recording manual checkpoints

For checkpoints without an objective runtime/snapshot collector, use:

```ruby
JiraNot::ConstructFlow::Runtime.commands.execute(
  'RecordNativeAcceptanceCheckpoint',
  input: {
    checkpoint_id: 'interactive_tools',
    status: 'passed',
    notes: 'Verified in SketchUp <version>',
    evidence: { operator: '<name>', application_version: '<version>' }
  }
)
```

Do not mark a checkpoint `passed` based only on source review or CI. `skipped` remains incomplete. `native_copy_identity`, `observer_new_open` and `scene_tag_persistence` are objective checkpoints and cannot be manually passed through this generic command.

## Exit criterion

`Runtime.native_acceptance.summary['complete']` is true only when every required checkpoint has explicit native evidence and status `passed`.
